-- Zieclipper: durable job state + file storage in Supabase, replacing the
-- old in-memory job store (which lived in a plain JS Map and was wiped on
-- every Vercel cold start). Every read AND write in this architecture goes
-- through the logged-in user's own Supabase session (anon key + user JWT)
-- -- there is no separate worker with a service-role key -- so Row Level
-- Security on these tables and on the storage bucket is what keeps one
-- user from reading or overwriting another user's jobs/files.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on
-- the same project your NEXT_PUBLIC_SUPABASE_URL / anon key already point
-- to (the one lib/supabase.ts uses for auth).

-- ─────────────────────────────────────────────────────────────────────────
-- jobs: one row per "paste a YouTube URL" run
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id                    text primary key,               -- nanoid, same id used in URLs (/clips/[jobId])
  user_id               uuid not null references auth.users(id) on delete cascade,
  status                text not null default 'downloading'
                          check (status in ('downloading','transcribing','analyzing','ready','error')),
  url                   text not null,
  title                 text,
  duration              numeric,
  model                 text not null default 'claude-sonnet-4-6',
  provider              text not null default 'anthropic',
  transcript            jsonb,                           -- WordTiming[]
  clips                 jsonb,                           -- ClipSuggestion[]
  available_subtitles   jsonb,                           -- SubtitleOption[]
  active_subtitle_lang  text,
  error                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs (user_id, created_at desc);

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"
  on public.jobs for select
  using (auth.uid() = user_id);

-- Vercel writes these rows itself now (no separate worker/service-role
-- client), running as whichever user is logged in for that request -- so,
-- unlike the worker-based design, INSERT/UPDATE policies are required here.
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own"
  on public.jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- export_jobs: one row per "render this clip to MP4" run
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.export_jobs (
  id            text primary key,                        -- nanoid
  job_id        text not null references public.jobs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  clip_index    integer not null,
  status        text not null default 'processing'
                  check (status in ('processing','done','error')),
  progress      integer not null default 0,
  storage_path  text,                                     -- set once the rendered MP4 lands in Storage
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists export_jobs_user_id_idx on public.export_jobs (user_id, created_at desc);

alter table public.export_jobs enable row level security;

drop policy if exists "export_jobs_select_own" on public.export_jobs;
create policy "export_jobs_select_own"
  on public.export_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "export_jobs_insert_own" on public.export_jobs;
create policy "export_jobs_insert_own"
  on public.export_jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "export_jobs_update_own" on public.export_jobs;
create policy "export_jobs_update_own"
  on public.export_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at auto-touch, so "is this job stuck?" is easy to answer later
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_touch_updated_at on public.jobs;
create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function public.touch_updated_at();

drop trigger if exists export_jobs_touch_updated_at on public.export_jobs;
create trigger export_jobs_touch_updated_at
  before update on public.export_jobs
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Storage: video segments, thumbnails, and rendered exports.
-- Private bucket -- every object lives under a `<user_id>/...` path prefix,
-- and the RLS policies below only let a user read/write inside their own
-- prefix. The app hands out short-lived signed URLs (createSignedUrl) for
-- anything the browser needs directly (video preview, thumbnails,
-- download), so nothing here needs to be public.
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists "media_select_own" on storage.objects;
create policy "media_select_own"
  on storage.objects for select
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "media_insert_own" on storage.objects;
create policy "media_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "media_update_own" on storage.objects;
create policy "media_update_own"
  on storage.objects for update
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "media_delete_own" on storage.objects;
create policy "media_delete_own"
  on storage.objects for delete
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[1]);
