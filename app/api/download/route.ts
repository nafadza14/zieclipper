import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import path from 'path'
import { downloadVideo } from '@/server/ytdlp-service'
import { createJob, updateJob } from '@/server/job-manager'
import { extractVideoId } from '@/lib/youtube'
import type { SubtitleOption } from '@/store/types'

const TMP_DIR = path.join(process.cwd(), 'tmp', 'jobs')

export async function POST(req: NextRequest) {
  const { url, model, provider } = await req.json()

  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

  const jobId = nanoid()
  const outputDir = path.join(TMP_DIR, jobId)

  createJob(jobId, url, model || 'claude-sonnet-4-6', provider || 'anthropic')

  downloadVideo(url, outputDir, (pct, status) => {
    updateJob(jobId, { status: status === 'done' ? 'transcribing' : 'downloading' })
  }).then(async ({ videoPath, title, duration, vttFiles }) => {
    updateJob(jobId, { videoPath, title, duration, status: 'transcribing' })

    // Build availableSubtitles: merge VTT files with YouTube API transcript list
    const availableSubtitles = await buildAvailableSubtitles(videoId, vttFiles)
    updateJob(jobId, { availableSubtitles })

    // Use first VTT as default for initial transcription
    const firstVtt = Object.values(vttFiles)[0]
    const firstLang = Object.keys(vttFiles)[0]

    return fetchTranscriptAndAnalyze(jobId, videoId, videoPath, model, provider || 'anthropic', firstVtt, firstLang, 'English')
  }).catch((err) => {
    updateJob(jobId, { status: 'error', error: err.message })
  })

  return NextResponse.json({ jobId })
}

async function buildAvailableSubtitles(
  videoId: string,
  vttFiles: Record<string, string>,
): Promise<SubtitleOption[]> {
  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'

  // Fetch YouTube transcript list for names + is_generated flags
  let ytLangs: Array<{ code: string; name: string; is_generated: boolean }> = []
  try {
    const res = await fetch(`${pythonUrl}/available-transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
    })
    if (res.ok) {
      const data = await res.json()
      ytLangs = data.languages ?? []
    }
  } catch {}

  // Build map from YouTube data for quick lookup
  const ytMap = new Map(ytLangs.map((l) => [l.code, l]))

  const result: SubtitleOption[] = []
  const seen = new Set<string>()

  // VTT files first (auto-generated, highest quality timing)
  for (const [code, vttPath] of Object.entries(vttFiles)) {
    const yt = ytMap.get(code)
    result.push({
      code,
      name: yt?.name ?? langName(code),
      is_generated: yt?.is_generated ?? true,
      vttPath,
    })
    seen.add(code)
  }

  // Add any YouTube entries not covered by VTTs (manual subs)
  for (const lang of ytLangs) {
    if (!seen.has(lang.code)) {
      result.push({ code: lang.code, name: lang.name, is_generated: lang.is_generated })
    }
  }

  // Sort: auto-generated first, then by name
  result.sort((a, b) => {
    if (a.is_generated !== b.is_generated) return a.is_generated ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return result
}

function langName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

async function fetchTranscriptAndAnalyze(
  jobId: string,
  videoId: string,
  videoPath: string,
  model: string,
  provider: string,
  vttPath?: string,
  preferredLang?: string,
  language?: string,
) {
  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'

  try {
    const tRes = await fetch(`${pythonUrl}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        audio_path: videoPath,
        vtt_path: vttPath,
        preferred_lang: preferredLang,
      }),
    })

    if (!tRes.ok) {
      let detail = tRes.statusText
      try { detail = (await tRes.json()).detail ?? detail } catch {}
      throw new Error(`Transcript service error: ${detail}`)
    }
    const { transcript } = await tRes.json()
    updateJob(jobId, { transcript, status: 'analyzing', activeSubtitleLang: preferredLang })

    const aRes = await fetch(`${pythonUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, model, provider, video_duration: 0, language: language ?? 'English' }),
    })

    if (!aRes.ok) throw new Error(`Analysis service error: ${aRes.statusText}`)
    const { clips } = await aRes.json()

    updateJob(jobId, { clips, status: 'ready' })
  } catch (err: any) {
    updateJob(jobId, { status: 'error', error: err.message })
  }
}
