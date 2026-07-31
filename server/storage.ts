import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'

// All rendered/cached media (video segments, thumbnails, export MP4s) lives
// in this one private Supabase Storage bucket, path-prefixed by user id --
// see supabase/migrations/0001_jobs_and_exports.sql for the matching RLS
// policies on storage.objects. Replaces the worker's local-disk cache +
// hand-rolled HMAC-signed URLs (lib/worker-client.ts's signedWorkerUrl):
// Storage's own createSignedUrl() does the same job now that there's a
// direct, user-scoped client available in every route.
const BUCKET = 'media'

export function mediaPath(userId: string, ...parts: string[]): string {
  return [userId, ...parts].join('/')
}

export async function uploadFile(
  supabase: SupabaseClient,
  storagePath: string,
  localFilePath: string,
  contentType: string,
): Promise<void> {
  const data = fs.readFileSync(localFilePath)
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
}

export async function createSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  ttlSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds)
  if (error || !data) throw new Error(`Failed to sign URL: ${error?.message || 'unknown error'}`)
  return data.signedUrl
}

export async function fileExistsInStorage(supabase: SupabaseClient, storagePath: string): Promise<boolean> {
  const idx = storagePath.lastIndexOf('/')
  const dir = idx === -1 ? '' : storagePath.slice(0, idx)
  const name = idx === -1 ? storagePath : storagePath.slice(idx + 1)
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: name })
  if (error) return false
  return !!data?.some((f) => f.name === name)
}
