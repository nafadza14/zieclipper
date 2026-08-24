-- Fase B: support uploaded video files (not just YouTube URLs).
-- Stores the R2 key of the raw uploaded source file so later routes
-- (thumbnail, video segment, export) can pull the source back without
-- calling yt-dlp. Nullable because jobs made from YouTube URLs never set it.

alter table public.jobs
  add column if not exists source_storage_path text;

-- Speeds up "does this user have any uploads" queries later.
create index if not exists jobs_source_storage_path_idx
  on public.jobs (user_id)
  where source_storage_path is not null;
