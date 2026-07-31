import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment } from '@/server/ytdlp-service'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildThumbnailArgs } from '@/lib/ffmpeg-commands'
import { uploadFile, createSignedUrl, fileExistsInStorage, mediaPath } from '@/server/storage'

export const maxDuration = 120

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string; idx: string }> }) {
  const { jobId, idx } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data: job } = await auth.supabase
    .from('jobs')
    .select('id, url, clips')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!job?.clips) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const clipIndex = parseInt(idx, 10)
  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const storagePath = mediaPath(auth.user.id, jobId, `thumb_${clipIndex}.jpg`)

  try {
    if (!(await fileExistsInStorage(auth.supabase, storagePath))) {
      const timestamp = clip.start_time + (clip.end_time - clip.start_time) * 0.1
      // Small ~2s slice, not the full clip -- opening the results page
      // renders a thumbnail for every suggested clip (5-8 per job) up
      // front, so this must stay cheap regardless of which clips the user
      // actually opens afterwards.
      const segmentPath = await ensureVideoSegment(jobId, job.url, timestamp, timestamp + 2)
      const thumbLocalPath = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs', jobId, `thumb_${clipIndex}.jpg`)
      await runFFmpeg(buildThumbnailArgs(segmentPath, 0.5, thumbLocalPath))
      await uploadFile(auth.supabase, storagePath, thumbLocalPath, 'image/jpeg')
    }
    const signedUrl = await createSignedUrl(auth.supabase, storagePath, 3600)
    return NextResponse.redirect(signedUrl, 307)
  } catch (err: any) {
    return NextResponse.json({ error: `Thumbnail error: ${err.message}` }, { status: 500 })
  }
}
