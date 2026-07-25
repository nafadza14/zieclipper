import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getJob } from '@/server/job-manager'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildThumbnailArgs } from '@/lib/ffmpeg-commands'

const TMP_DIR = path.join(os.tmpdir(), 'zieclipper', 'jobs')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string; idx: string }> }) {
  const { jobId, idx } = await params
  const job = getJob(jobId)

  if (!job?.videoPath || !job.clips) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const clipIndex = parseInt(idx)
  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const thumbPath = path.join(TMP_DIR, jobId, `thumb_${clipIndex}.jpg`)

  if (!fs.existsSync(thumbPath)) {
    const timestamp = clip.start_time + (clip.end_time - clip.start_time) * 0.1
    await runFFmpeg(buildThumbnailArgs(job.videoPath, timestamp, thumbPath))
  }

  const data = fs.readFileSync(thumbPath)
  return new NextResponse(data, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  })
}
