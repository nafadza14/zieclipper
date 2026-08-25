import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment, UPLOAD_URL_PREFIX } from '@/server/ytdlp-service'
import { runFFmpeg, probeVideoDimensions } from '@/server/ffmpeg-processor'
import { uploadFile, createSignedUrl, fileExistsInStorage, mediaPath } from '@/server/storage'
import { extractVideoId } from '@/server/youtube'

// Output size: 540x960 is small enough that thumbnails load fast on any
// connection, sharp enough to look crisp at card size (usually ~250-320
// px wide in the grid), and matches the 9:16 aspect of the actual Shorts
// export so the preview honestly reflects the final crop.
const THUMB_W = 540
const THUMB_H = 960

export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string; idx: string }> }) {
  const { jobId, idx } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data: job } = await auth.supabase
    .from('jobs')
    .select('id, url, clips, source_storage_path')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!job?.clips) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const clipIndex = parseInt(idx, 10)
  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  // ── FAST PATH: YouTube's own thumbnail (0ms, no ffmpeg, no vision LLM) ──
  // For YouTube URLs, redirect straight to YouTube's own hqdefault image.
  // This is INSTANT (no download, no processing) and looks great as a
  // preview card. The user can still generate the "true" 9:16 face-aware
  // thumbnail on-demand by opening the editor.
  if (!job.url.startsWith(UPLOAD_URL_PREFIX)) {
    const videoId = extractVideoId(job.url)
    if (videoId) {
      const ytThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      const res = NextResponse.redirect(ytThumb, 307)
      res.headers.set('Cache-Control', 'public, max-age=86400')
      return res
    }
  }

  // ── SLOW PATH: uploaded videos need real ffmpeg extraction ──
  // Cache aggressively — once generated, thumbnail persists in R2 forever.
  const storagePath = mediaPath(auth.user.id, jobId, `thumb_v3_${clipIndex}.jpg`)

  try {
    if (!(await fileExistsInStorage(storagePath))) {
      await generateFastThumbnail(
        jobId, clip, clipIndex,
        job.url, job.source_storage_path ?? undefined,
        storagePath,
      )
    }
    const signedUrl = await createSignedUrl(storagePath, 3600)
    const res = NextResponse.redirect(signedUrl, 307)
    res.headers.set('Cache-Control', 'private, max-age=1800')
    return res
  } catch (err: any) {
    return NextResponse.json({ error: `Thumbnail error: ${err.message}` }, { status: 500 })
  }
}

/**
 * Fast thumbnail generator — no vision LLM, no face detection.
 * Simple centered crop from a single ffmpeg frame extract.
 * Total time: ~2s for uploaded videos (vs 10-20s with the old face-aware pipeline).
 */
async function generateFastThumbnail(
  jobId: string,
  clip: { start_time: number; end_time: number },
  clipIndex: number,
  url: string,
  sourceStoragePath: string | undefined,
  storagePath: string,
) {
  // Pick a timestamp ~10% into the clip -- past any transition frame.
  const timestamp = clip.start_time + (clip.end_time - clip.start_time) * 0.1
  const segmentPath = await ensureVideoSegment(jobId, url, timestamp, timestamp + 2, sourceStoragePath)

  const tmpDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs', jobId)
  fs.mkdirSync(tmpDir, { recursive: true })
  const outPath = path.join(tmpDir, `thumb_v3_${clipIndex}.jpg`)

  // Single ffmpeg pass: extract frame + center-crop to 9:16 + scale + encode
  await runFFmpeg([
    '-ss', String(timestamp + 0.5),
    '-i', segmentPath,
    '-vframes', '1',
    '-vf', `crop='if(gt(iw*${THUMB_H}/${THUMB_W},ih),ih*${THUMB_W}/${THUMB_H},iw)':'if(gt(iw*${THUMB_H}/${THUMB_W},ih),ih,iw*${THUMB_H}/${THUMB_W})',scale=${THUMB_W}:${THUMB_H}:flags=lanczos`,
    '-q:v', '3',
    '-y',
    outPath,
  ])

  await uploadFile(storagePath, outPath, 'image/jpeg')
  try { fs.unlinkSync(outPath) } catch {}
}
