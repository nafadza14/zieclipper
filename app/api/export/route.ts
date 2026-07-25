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
  if (!job?.videoPath || !job.clips) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const exportId = nanoid()
  const exportDir = path.join(TMP_DIR, jobId, 'exports')
  fs.mkdirSync(exportDir, { recursive: true })

  const assPath = path.join(exportDir, `${exportId}.ass`)
  const outputPath = path.join(exportDir, `${exportId}.mp4`)

  createExportJob(exportId, jobId, clipIndex)

  // Adjust chunk timings relative to clip, applying subtitle sync offset to match preview.
  // Clamp to [0, clipDur]: transcript words can start slightly before the clip
  // (they're included when word.end >= clip.start_time) and negative ASS
  // timestamps make libass silently drop the event.
  const offsetSec = (settings.subtitleOffsetMs ?? 0) / 1000
  const clipDur = clip.end_time - clip.start_time
  const adjustedChunks = subtitleChunks
    .map((c) => ({
      ...c,
      chunkStart: Math.max(0, c.chunkStart - clip.start_time + offsetSec),
      chunkEnd: Math.min(clipDur, c.chunkEnd - clip.start_time + offsetSec),
      words: c.words.map((w) => ({
        ...w,
        start: Math.max(0, w.start - clip.start_time + offsetSec),
        end: Math.min(clipDur, Math.max(0, w.end - clip.start_time + offsetSec)),
      })),
    }))
    .filter((c) => c.chunkEnd > c.chunkStart)

  const assContent = generateAssFile(adjustedChunks, settings, clipDur)
  fs.writeFileSync(assPath, assContent, 'utf-8')

  const clipDuration = clipDur

  // Run export in background
  runFFmpeg(
    buildExportArgs({
      sourcePath: job.videoPath,
      assPath,
      outputPath,
      settings,
      clipStart: clip.start_time,
      clipEnd: clip.end_time,
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
