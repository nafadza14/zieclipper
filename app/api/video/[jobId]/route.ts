import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getJob } from '@/server/job-manager'
import { ensureVideoSegment } from '@/server/ytdlp-service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const { searchParams } = new URL(req.url)
  const start = parseFloat(searchParams.get('start') || '0')
  const end = parseFloat(searchParams.get('end') || '0')

  const job = getJob(jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (end <= start) {
    return NextResponse.json({ error: 'Invalid start/end parameters' }, { status: 400 })
  }

  let filePath: string
  try {
    filePath = await ensureVideoSegment(jobId, job.url, start, end)
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch segment: ${err.message}` }, { status: 500 })
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
