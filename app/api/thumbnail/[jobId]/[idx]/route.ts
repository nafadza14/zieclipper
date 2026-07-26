import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getJob } from '@/server/job-manager'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildThumbnailArgs } from '@/lib/ffmpeg-commands'
import { ensureVideoSegment } from '@/server/ytdlp-service'

const TMP_DIR = path.join(os.tmpdir(), 'zieclipper', 'jobs')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string; idx: string }> }) {
  const { jobId, idx } = await params
  const job = getJob(jobId)

  if (!job || !job.clips) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const clipIndex = parseInt(idx)
  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const thumbPath = path.join(TMP_DIR, jobId, `thumb_${clipIndex}.jpg`)

  if (!fs.existsSync(thumbPath)) {
    const timestamp = clip.start_time + (clip.end_time - clip.start_time) * 0.1
    try {
      if (job.videoPath && fs.existsSync(job.videoPath)) {
        await runFFmpeg(buildThumbnailArgs(job.videoPath, timestamp, thumbPath))
      } else if (job.url) {
        // Download a tiny 2s segment around the timestamp to extract the thumbnail frame
        const segmentPath = await ensureVideoSegment(jobId, job.url, timestamp, timestamp + 2)
        await runFFmpeg(buildThumbnailArgs(segmentPath, 0.5, thumbPath))
      } else {
        return NextResponse.json({ error: 'No video source' }, { status: 400 })
      }
    } catch (err: any) {
      console.error('Failed to generate thumbnail:', err)
      return NextResponse.json({ error: `Thumbnail error: ${err.message}` }, { status: 500 })
    }
  }

  if (!fs.existsSync(thumbPath)) {
    return NextResponse.json({ error: 'Thumbnail not generated' }, { status: 500 })
  }

  const data = fs.readFileSync(thumbPath)
  return new NextResponse(data, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  })
}
