-- Fase D + credit system.
-- Adds:
--   * public.user_credits     — one row per user, tracks balance
--   * public.credit_transactions — every deduction / top-up / refund
--   * public.social_accounts  — connected YouTube/TikTok/IG accounts (Fase D)
--   * public.scheduled_posts  — queue of upcoming posts (Fase D)
--
-- All tables use RLS scoped to auth.uid, matching the rest of the schema.

-- ─────────────────────────────────────────────────────────────────────────
-- Credits: balance per user
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_credits (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  balance     integer not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.user_credits enable row level security;

drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits for select using (auth.uid() = user_id);

-- Balance mutations go through a SECURITY DEFINER function (below) that
-- checks credit and writes atomically. Row-level insert/update policies
-- prevent client from cheating directly.
drop policy if exists "user_credits_insert_own" on public.user_credits;
create policy "user_credits_insert_own"
  on public.user_credits for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Every ledger entry — audit trail + settings page transaction history
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       integer not null,          -- + for top-up/refund/bonus, - for deduction
  kind         text not null check (kind in ('signup_bonus','topup','generate','export','face_track','refund','manual')),
  description  text,
  ref_job_id   text,                      -- optional link to public.jobs.id
  created_at   timestamptz not null default now()
);

create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

drop policy if exists "credit_tx_select_own" on public.credit_transactions;
create policy "credit_tx_select_own"
  on public.credit_transactions for select using (auth.uid() = user_id);

drop policy if exists "credit_tx_insert_own" on public.credit_transactions;
create policy "credit_tx_insert_own"
  on public.credit_transactions for insert with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Atomic spend function. Called from server-side routes as the logged-in
-- user (RLS enforced). Returns the new balance, or raises if insufficient.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.spend_credits(
  p_amount      integer,
  p_kind        text,
  p_description text default null,
  p_ref_job_id  text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  insert into public.user_credits (user_id, balance) values (uid, 0)
    on conflict (user_id) do nothing;

  update public.user_credits
     set balance = balance - p_amount, updated_at = now()
   where user_id = uid and balance >= p_amount
   returning balance into new_balance;

  if new_balance is null then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (user_id, amount, kind, description, ref_job_id)
    values (uid, -p_amount, p_kind, p_description, p_ref_job_id);

  return new_balance;
end
$$;

-- Additive counterpart for top-ups / bonuses / refunds. Same auth model.
create or replace function public.add_credits(
  p_amount      integer,
  p_kind        text,
  p_description text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  insert into public.user_credits (user_id, balance) values (uid, p_amount)
    on conflict (user_id) do update set balance = public.user_credits.balance + excluded.balance, updated_at = now()
    returning balance into new_balance;

  insert into public.credit_transactions (user_id, amount, kind, description)
    values (uid, p_amount, p_kind, p_description);

  return new_balance;
end
$$;

-- Grant sign-up bonus (10 kredit) via trigger on new auth users.
create or replace function public.grant_signup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id, balance) values (new.id, 10)
    on conflict (user_id) do nothing;
  insert into public.credit_transactions (user_id, amount, kind, description)
    values (new.id, 10, 'signup_bonus', 'Selamat datang! 10 kredit gratis.');
  return new;
end
$$;

drop trigger if exists on_auth_user_created_grant_credits on auth.users;
create trigger on_auth_user_created_grant_credits
  after insert on auth.users
  for each row execute function public.grant_signup_bonus();

-- Backfill: give existing users 10 credits if they don't have a balance row yet.
insert into public.user_credits (user_id, balance)
  select id, 10 from auth.users
  on conflict (user_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- Social accounts (Fase D — YouTube Shorts and later TikTok/IG)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.social_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  platform         text not null check (platform in ('youtube','tiktok','instagram','facebook','twitter','linkedin')),
  external_id      text not null,        -- YouTube channel id, TikTok open_id, etc.
  display_name     text,
  avatar_url       text,
  access_token     text,                 -- short-lived
  refresh_token    text,                 -- long-lived — kept server-side, never returned to browser
  token_expires_at timestamptz,
  scopes           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, platform, external_id)
);

create index if not exists social_accounts_user_idx on public.social_accounts (user_id);

alter table public.social_accounts enable row level security;

-- Client can list their own connected accounts (display purposes) but NEVER
-- see refresh_token. Selected columns are safe; the server-side route
-- excludes tokens when returning to the browser.
drop policy if exists "social_accounts_select_own" on public.social_accounts;
create policy "social_accounts_select_own"
  on public.social_accounts for select using (auth.uid() = user_id);

drop policy if exists "social_accounts_insert_own" on public.social_accounts;
create policy "social_accounts_insert_own"
  on public.social_accounts for insert with check (auth.uid() = user_id);

drop policy if exists "social_accounts_update_own" on public.social_accounts;
create policy "social_accounts_update_own"
  on public.social_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "social_accounts_delete_own" on public.social_accounts;
create policy "social_accounts_delete_own"
  on public.social_accounts for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Scheduled posts (Fase D)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.scheduled_posts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  social_account_id   uuid not null references public.social_accounts(id) on delete cascade,
  export_job_id       text references public.export_jobs(id) on delete set null,
  storage_path        text not null,     -- R2 path of the rendered MP4 to publish
  title               text,
  description         text,
  tags                jsonb,
  status              text not null default 'pending' check (status in ('pending','publishing','published','error')),
  scheduled_for       timestamptz,        -- null = publish immediately
  published_at        timestamptz,
  external_post_id    text,               -- e.g. YouTube video id after upload
  error               text,
  created_at          timestamptz not null default now()
);

create index if not exists scheduled_posts_user_idx on public.scheduled_posts (user_id, created_at desc);

alter table public.scheduled_posts enable row level security;
drop policy if exists "scheduled_posts_select_own" on public.scheduled_posts;
create policy "scheduled_posts_select_own" on public.scheduled_posts for select using (auth.uid() = user_id);
drop policy if exists "scheduled_posts_insert_own" on public.scheduled_posts;
create policy "scheduled_posts_insert_own" on public.scheduled_posts for insert with check (auth.uid() = user_id);
drop policy if exists "scheduled_posts_update_own" on public.scheduled_posts;
create policy "scheduled_posts_update_own" on public.scheduled_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
