import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment } from '@/server/ytdlp-service'
import { runFFmpeg } from '@/server/ffmpeg-processor'
import { buildExportArgs, type EmojiOverlay } from '@/lib/ffmpeg-commands'
import { generateAssFile } from '@/lib/ass-generator'
import { uploadFile, createSignedUrl, mediaPath } from '@/server/storage'
import { emojiForChunk } from '@/lib/emoji-map'
import { ensureEmojiPng } from '@/server/emoji-assets'
import { trackFace } from '@/server/face-tracking'
import { buildDynamicCropXExpression } from '@/lib/crop-expression'
import { getFormatDimensions } from '@/lib/formats'
import { probeVideoDimensions } from '@/server/ffmpeg-processor'
import { CREDIT_COST, spendCredits } from '@/server/credits'
import type { EditorSettings, SubtitleChunk, ExportJob } from '@/store/types'

export const maxDuration = 300

// Like /api/download: the client generates `exportId` itself and starts
// polling GET /api/export?id=... concurrently with this POST, so the
// progress bar still moves during the export even though this request
// doesn't return until ffmpeg is completely done.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { exportId, jobId, clipIndex, settings, subtitleChunks } = body as {
    exportId: string
    jobId: string
    clipIndex: number
    settings: EditorSettings
    subtitleChunks: SubtitleChunk[]
  }
  if (!exportId) return NextResponse.json({ error: 'exportId required' }, { status: 400 })
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const { data: job, error: jobErr } = await auth.supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job?.clips) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const { error: insertErr } = await auth.supabase.from('export_jobs').insert({
    id: exportId,
    job_id: jobId,
    user_id: auth.user.id,
    clip_index: clipIndex,
    status: 'processing',
    progress: 0,
  })
  if (insertErr) {
    return NextResponse.json({ error: `Failed to create export job: ${insertErr.message}` }, { status: 500 })
  }

  const startOffset = settings.crop.startOffset || 0
  const endOffset = settings.crop.endOffset || 0
  const actualStart = clip.start_time + startOffset
  const actualEnd = clip.end_time + endOffset

  const exportDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs', jobId, 'exports')
  fs.mkdirSync(exportDir, { recursive: true })
  const assPath = path.join(exportDir, `${exportId}.ass`)
  const outputPath = path.join(exportDir, `${exportId}.mp4`)

  try {
    const segmentPath = await ensureVideoSegment(jobId, job.url, actualStart, actualEnd, job.source_storage_path ?? undefined)

    const offsetSec = (settings.subtitleOffsetMs ?? 0) / 1000
    const clipDur = actualEnd - actualStart
    const adjustedChunks = (subtitleChunks || [])
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

    // Resolve emoji overlays for the render. Each chunk that has a resolved
    // emoji (per-chunk override or auto-generated from keywords) gets a
    // time-gated PNG overlay in the final ffmpeg graph. Downloads are
    // parallel + cached in /tmp -- failures fall through silently so a
    // temporary CDN glitch doesn't kill the whole export, we just skip that
    // one emoji.
    let emojiOverlays: EmojiOverlay[] = []
    if (settings.emoji.enabled) {
      const requests = adjustedChunks.map(async (c) => {
        const em = emojiForChunk(c, settings.emoji)
        if (!em) return null
        const pngPath = await ensureEmojiPng(em)
        if (!pngPath) return null
        const ov: EmojiOverlay = {
          pngPath,
          start: c.chunkStart,
          end: c.chunkEnd,
          size: settings.emoji.size,
          position: settings.emoji.position,
          subtitlePosition: settings.subtitleStyle.position,
          subtitleOffsetY: settings.subtitleStyle.positionOffsetY,
        }
        return ov
      })
      emojiOverlays = (await Promise.all(requests)).filter((x): x is EmojiOverlay => !!x)
    }

    // Auto face-tracking (opt-in): sample frames from the trimmed segment,
    // ask the vision LLM where the speaker's face is, build a dynamic crop
    // expression. Only meaningful in fill mode with an aspect ratio narrower
    // than the source (9:16 or 1:1) -- 16:9 keeps full width so there's
    // nothing to pan. Any failure falls through to the static crop.
    let cropXExpr: string | undefined
    const shouldTrack = settings.crop.autoTrack && settings.crop.style === 'fill' && settings.videoFormat !== '16:9'
    if (shouldTrack) {
      // Charge the face-tracking add-on kredit BEFORE the vision LLM
      // calls. If the user is broke, we quietly skip tracking and fall
      // through to the static crop (better UX than failing the export).
      let paid = false
      try {
        await spendCredits(auth.supabase, CREDIT_COST.faceTrackingPerExport, 'face_track', `Face tracking export ${exportId}`, jobId)
        paid = true
      } catch {}
      if (paid) {
        try {
          const { width: TW, height: TH } = getFormatDimensions(settings.videoFormat)
          const { width: sourceW, height: sourceH } = await probeVideoDimensions(segmentPath)
          const cropW = Math.round((sourceH * TW) / TH / 2) * 2
          const kfs = await trackFace(segmentPath, 0, clipDur, job.provider || 'sumopod', job.model || 'gpt-4o-mini')
          if (kfs.length) cropXExpr = buildDynamicCropXExpression(kfs, sourceW, cropW)
        } catch {}
      }
    }

    await runFFmpeg(
      buildExportArgs({ sourcePath: segmentPath, assPath, outputPath, settings, clipStart: 0, clipEnd: clipDur, emojiOverlays, cropXExpr }),
      (progress) => {
        auth.supabase.from('export_jobs').update({ progress }).eq('id', exportId).then(() => {}, () => {})
      },
      clipDur,
    )

    const storagePath = mediaPath(auth.user.id, jobId, 'exports', `${exportId}.mp4`)
    await uploadFile(storagePath, outputPath, 'video/mp4')

    await auth.supabase.from('export_jobs').update({
      status: 'done',
      progress: 100,
      storage_path: storagePath,
    }).eq('id', exportId)

    return NextResponse.json({ exportId })
  } catch (err: any) {
    await auth.supabase.from('export_jobs').update({ status: 'error', error: err.message }).eq('id', exportId).then(() => {}, () => {})
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const exportId = new URL(req.url).searchParams.get('id')
  if (!exportId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('export_jobs')
    .select('*')
    .eq('id', exportId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Export job not found' }, { status: 404 })

  const download = new URL(req.url).searchParams.get('download')
  if (download === '1' && data.status === 'done' && data.storage_path) {
    const signedUrl = await createSignedUrl(data.storage_path, 300)
    return NextResponse.redirect(signedUrl, 307)
  }

  const exportJob: ExportJob = {
    id: data.id,
    jobId: data.job_id,
    clipIndex: data.clip_index,
    status: data.status,
    progress: data.progress,
    error: data.error ?? undefined,
  }
  return NextResponse.json(exportJob)
}
