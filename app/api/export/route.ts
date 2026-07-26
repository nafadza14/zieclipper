import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { getJob, createExportJob, updateExportJob } from '@/server/job-manager'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildExportArgs } from '@/lib/ffmpeg-commands'
import { generateAssFile } from '@/lib/ass-generator'
import type { EditorSettings, SubtitleChunk } from '@/store/types'
import { ensureVideoSegment } from '@/server/ytdlp-service'

const TMP_DIR = path.join(os.tmpdir(), 'zieclipper', 'jobs')

export async function GET(req: NextRequest) {
  const exportId = new URL(req.url).searchParams.get('id')
  if (!exportId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { getExportJob } = await import('@/server/job-manager')
  const exportJob = getExportJob(exportId)
  if (!exportJob) return NextResponse.json({ error: 'Export job not found' }, { status: 404 })

  if (exportJob.status === 'done' && exportJob.outputPath) {
    const download = new URL(req.url).searchParams.get('download')
    if (download === '1') {
      const data = fs.readFileSync(exportJob.outputPath)
      return new NextResponse(data, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': 'attachment; filename="short.mp4"',
          'Content-Length': String(data.length),
        },
      })
    }
  }

  return NextResponse.json(exportJob)
}

export async function POST(req: NextRequest) {
  const { jobId, clipIndex, settings, subtitleChunks } = await req.json() as {
    jobId: string
    clipIndex: number
    settings: EditorSettings
    subtitleChunks: SubtitleChunk[]
  }

  const job = getJob(jobId)
  if (!job || !job.clips) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const startOffset = settings.crop.startOffset || 0
  const endOffset = settings.crop.endOffset || 0
  const actualStart = clip.start_time + startOffset
  const actualEnd = clip.end_time + endOffset

  // Download/trim the source video segment first if not already done
  let segmentPath: string
  try {
    segmentPath = await ensureVideoSegment(jobId, job.url, actualStart, actualEnd)
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch source video segment: ${err.message}` }, { status: 500 })
  }

  const exportId = nanoid()
  const exportDir = path.join(TMP_DIR, jobId, 'exports')
  fs.mkdirSync(exportDir, { recursive: true })

  const assPath = path.join(exportDir, `${exportId}.ass`)
  const outputPath = path.join(exportDir, `${exportId}.mp4`)

  createExportJob(exportId, jobId, clipIndex)

  const offsetSec = (settings.subtitleOffsetMs ?? 0) / 1000
  const clipDur = actualEnd - actualStart
  const adjustedChunks = subtitleChunks
    .map((c) => ({
      ...c,
      chunkStart: Math.max(0, c.chunkStart - actualStart + offsetSec),
      chunkEnd: Math.min(clipDur, c.chunkEnd - actualStart + offsetSec),
      words: c.words.map((w) => ({
        ...w,
        start: Math.max(0, w.start - actualStart + offsetSec),
        end: Math.min(clipDur, Math.max(0, w.end - actualStart + offsetSec)),
      })),
    }))
    .filter((c) => c.chunkEnd > c.chunkStart)

  const assContent = generateAssFile(adjustedChunks, settings, clipDur)
  fs.writeFileSync(assPath, assContent, 'utf-8')

  const clipDuration = clipDur

  // Run export in background
  runFFmpeg(
    buildExportArgs({
      sourcePath: segmentPath,
      assPath,
      outputPath,
      settings,
      clipStart: 0,
      clipEnd: clipDur,
    }),
    (progress) => updateExportJob(exportId, { progress }),
    clipDuration
  ).then(() => {
    updateExportJob(exportId, { status: 'done', outputPath, progress: 100 })
  }).catch((err) => {
    updateExportJob(exportId, { status: 'error', error: err.message })
  })

  return NextResponse.json({ exportId })
}
