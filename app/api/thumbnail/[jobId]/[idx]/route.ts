import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment } from '@/server/ytdlp-service'
import { runFFmpeg, probeVideoDimensions } from '@/server/ffmpeg-processor'
import { uploadFile, createSignedUrl, fileExistsInStorage, mediaPath } from '@/server/storage'
import { detectFaceX } from '@/server/vision-client'

// Output size: 540x960 is small enough that thumbnails load fast on any
// connection, sharp enough to look crisp at card size (usually ~250-320
// px wide in the grid), and matches the 9:16 aspect of the actual Shorts
// export so the preview honestly reflects the final crop.
const THUMB_W = 540
const THUMB_H = 960

export const maxDuration = 120

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string; idx: string }> }) {
  const { jobId, idx } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data: job } = await auth.supabase
    .from('jobs')
    .select('id, url, clips, source_storage_path, provider, model')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!job?.clips) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const clipIndex = parseInt(idx, 10)
  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  // Bump the storage key when the thumbnail pipeline changes shape (aspect,
  // resolution, face-crop). Cached thumbnails from the old 16:9 pipeline
  // stay in R2 but aren't reused -- the new key `thumb_v2_...` forces a
  // regeneration exactly once per (job, clip).
  const storagePath = mediaPath(auth.user.id, jobId, `thumb_v2_${clipIndex}.jpg`)

  try {
    if (!(await fileExistsInStorage(storagePath))) {
      await generateFaceAwareThumbnail(
        jobId, clip, clipIndex,
        job.url, job.source_storage_path ?? undefined,
        (job.provider as string) || 'sumopod',
        (job.model as string) || 'gpt-4o-mini',
        storagePath,
      )
    }
    const signedUrl = await createSignedUrl(storagePath, 3600)
    // Cache the redirect itself on the browser for 30 min so a page revisit
    // in the same session doesn't even hit our server for thumbnails.
    // R2 signed URL TTL is 1h, comfortably longer than this browser cache.
    const res = NextResponse.redirect(signedUrl, 307)
    res.headers.set('Cache-Control', 'private, max-age=1800')
    return res
  } catch (err: any) {
    return NextResponse.json({ error: `Thumbnail error: ${err.message}` }, { status: 500 })
  }
}

// Face-aware thumbnail generator. Three stages:
//   1) Extract one high-quality frame from a short buffered slice.
//   2) Ask the vision model where the primary face is (x fraction 0..1).
//   3) Crop the frame to 9:16 centered on the face, scale to THUMB_W×THUMB_H,
//      encode as high-quality JPEG.
// Fallback path: any failure at stages 2 or 3 falls back to a centered crop
// so we still return a valid thumbnail rather than 500-ing the whole card.
async function generateFaceAwareThumbnail(
  jobId: string,
  clip: { start_time: number; end_time: number },
  clipIndex: number,
  url: string,
  sourceStoragePath: string | undefined,
  provider: string,
  model: string,
  storagePath: string,
) {
  // Pick a timestamp ~10% into the clip -- past any transition frame at
  // the very start, but still representative of the clip.
  const timestamp = clip.start_time + (clip.end_time - clip.start_time) * 0.1

  // 2s slice is enough for a stable single-frame extract; ensureVideoSegment
  // caches the file so subsequent thumbnails from the same clip window skip
  // the download entirely.
  const segmentPath = await ensureVideoSegment(jobId, url, timestamp, timestamp + 2, sourceStoragePath)

  const tmpDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs', jobId)
  fs.mkdirSync(tmpDir, { recursive: true })
  const framePath = path.join(tmpDir, `thumb_v2_${clipIndex}_raw.jpg`)
  const outPath = path.join(tmpDir, `thumb_v2_${clipIndex}.jpg`)

  // Stage 1: raw frame. Keep source resolution -- we'll crop from this.
  await runFFmpeg(['-ss', '0.5', '-i', segmentPath, '-vframes', '1', '-q:v', '2', '-y', framePath])

  // Stage 2: ask vision model where the face is. detectFaceX already handles
  // its own errors and returns 0.5 (center) on any failure, so no try/catch
  // needed here.
  const faceX = await detectFaceX(framePath, provider, model)

  // Stage 3: figure out crop math from actual frame dims (not assumed 1280x720),
  // then crop + scale + encode.
  const { width, height } = await probeVideoDimensions(framePath)
  const cropW = Math.min(width, Math.round((height * THUMB_W) / THUMB_H / 2) * 2)
  const maxX = Math.max(0, width - cropW)
  const cropX = Math.round(Math.max(0, Math.min(maxX, maxX * faceX)))

  await runFFmpeg([
    '-i', framePath,
    '-vf', `crop=${cropW}:${height}:${cropX}:0,scale=${THUMB_W}:${THUMB_H}:flags=lanczos`,
    '-q:v', '2',
    '-y',
    outPath,
  ])

  await uploadFile(storagePath, outPath, 'image/jpeg')

  // Cleanup best-effort — /tmp gets wiped anyway.
  try { fs.unlinkSync(framePath) } catch {}
}
