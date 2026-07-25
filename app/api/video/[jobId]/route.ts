import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getJob } from '@/server/job-manager'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildSegmentArgs } from '@/lib/ffmpeg-commands'

const TMP_DIR = path.join(process.cwd(), 'tmp', 'jobs')

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const { searchParams } = new URL(req.url)
  const start = parseFloat(searchParams.get('start') || '0')
  const end = parseFloat(searchParams.get('end') || '0')

  const job = getJob(jobId)
  if (!job?.videoPath) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  let filePath = job.videoPath

  // If start/end provided, serve trimmed segment (cached)
  if (end > start) {
    const segName = `segment_${Math.round(start * 10)}_${Math.round(end * 10)}.mp4`
    const segPath = path.join(TMP_DIR, jobId, segName)

    if (!fs.existsSync(segPath)) {
      await runFFmpeg(buildSegmentArgs(job.videoPath, start, end, segPath))
    }
    filePath = segPath
  }

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const chunkStart = parseInt(parts[0], 10)
    const chunkEnd = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = chunkEnd - chunkStart + 1

    const stream = fs.createReadStream(filePath, { start: chunkStart, end: chunkEnd })
    return new NextResponse(stream as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
      },
    })
  }

  const stream = fs.createReadStream(filePath)
  return new NextResponse(stream as any, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  })
}
