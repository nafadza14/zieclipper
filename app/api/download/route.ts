import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { requireUser } from '@/lib/supabase-server'
import { extractVideoId } from '@/server/youtube'
import { downloadSubtitlesAndMetadata } from '@/server/ytdlp-service'
import { fetchTranscriptFallback, hasFallbackConfigured } from '@/server/transcript-fallback'
import { buildAvailableSubtitles } from '@/server/subtitles'
import { parseVttWords } from '@/server/transcript-parser'
import { analyzeTranscript } from '@/server/analyzer'
import { downloadAudioOnly, extractAudioForWhisper, transcribeAudio } from '@/server/whisper-client'
import { creditsForGenerate, spendCredits, addCredits } from '@/server/credits'

// Hobby plan caps a Function at 300s; Pro/Enterprise can raise this up to
// 800s (or 1800s on the "extended maximum" beta) via vercel.json / project
// settings -- see DEPLOY-VERCEL-SUPABASE.md. Long videos WILL exceed 300s on
// Hobby; that's a real, disclosed limitation of the pure-Vercel path.
export const maxDuration = 300

const TMP_DIR = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs')

// Runs the entire download -> subtitles -> transcript -> AI-analysis
// pipeline synchronously in one invocation and only returns once it's
// done (or has failed). There is no "respond now, keep working after" on
// Vercel -- an instance can freeze right after a response goes out -- so
// unlike the old worker, this request stays open for the whole pipeline.
//
// The client is expected to generate `jobId` itself (crypto.randomUUID())
// and start polling GET /api/jobs/:jobId with that same id concurrently
// with this POST, so the UI still gets live progress from the Supabase row
// updates below even though this request doesn't return until the end.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { jobId, url, model, provider, target_duration, language } = body || {}

  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

  // Default to gpt-4o-mini via Sumopod — matches Klipaja's cost model.
  // ~60x cheaper than Claude Sonnet with negligible quality drop for the
  // "find 3 viral clips from transcript" task. Users can override via
  // request body (Pro tier UI exposes a "smarter model" toggle).
  const chosenModel = model || 'gpt-4o-mini'
  const chosenProvider = provider || 'sumopod'

  const { error: insertErr } = await auth.supabase.from('jobs').insert({
    id: jobId,
    user_id: auth.user.id,
    url,
    model: chosenModel,
    provider: chosenProvider,
    status: 'downloading',
  })
  if (insertErr) {
    return NextResponse.json({ error: `Failed to create job: ${insertErr.message}` }, { status: 500 })
  }

  const outputDir = path.join(TMP_DIR, jobId)

  try {
    await auth.supabase.from('jobs').update({ status: 'transcribing' }).eq('id', jobId)

    // Try yt-dlp first (works if VPS has proxy or local dev with cookies).
    // On VPS without proxy, yt-dlp fails with YouTube's "not a bot" block —
    // catch that and try the third-party transcript fallback if configured.
    let title = 'Untitled'
    let duration = 0
    let vttFiles: Record<string, string> = {}
    let infoJsonPath: string | undefined
    let fallbackWords: Awaited<ReturnType<typeof fetchTranscriptFallback>> = null

    try {
      const result = await downloadSubtitlesAndMetadata(url, outputDir)
      title = result.title
      duration = result.duration
      vttFiles = result.vttFiles
      infoJsonPath = result.infoJsonPath
    } catch (ytdlpErr: any) {
      // yt-dlp blocked. Try fallback if configured.
      if (hasFallbackConfigured()) {
        console.log('[download] yt-dlp blocked, trying transcript fallback API')
        fallbackWords = await fetchTranscriptFallback(url)
        if (!fallbackWords) throw ytdlpErr  // Fallback also failed
        title = fallbackWords.title
        duration = fallbackWords.duration
      } else {
        throw ytdlpErr
      }
    }

    // Charge credits now that we know the real duration -- refunded below if
    // the rest of the pipeline fails.
    const creditCost = creditsForGenerate(duration || 60)
    try {
      await spendCredits(auth.supabase, creditCost, 'generate', title || url.slice(0, 60), jobId)
    } catch {
      await auth.supabase.from('jobs').update({ status: 'error', error: 'Kredit tidak cukup. Silakan top-up.' }).eq('id', jobId).then(() => {}, () => {})
      return NextResponse.json({ error: 'insufficient_credits', needed: creditCost }, { status: 402 })
    }
    await auth.supabase.from('jobs').update({ title, duration }).eq('id', jobId)

    const availableSubtitles = buildAvailableSubtitles(vttFiles, infoJsonPath)
    await auth.supabase.from('jobs').update({ available_subtitles: availableSubtitles }).eq('id', jobId)

    let defaultLang = Object.keys(vttFiles)[0]
    let defaultVtt = Object.values(vttFiles)[0]
    const priorityLangs = ['id', 'en', 'ms']
    for (const pl of priorityLangs) {
      const matchKey = Object.keys(vttFiles).find(
        (k) => k.toLowerCase() === pl || k.toLowerCase().startsWith(pl + '-')
      )
      if (matchKey) {
        defaultLang = matchKey
        defaultVtt = vttFiles[matchKey]
        break
      }
    }

    let targetLang = 'English'
    if (defaultLang && (defaultLang.toLowerCase().startsWith('id') || defaultLang.toLowerCase().startsWith('ms'))) {
      targetLang = 'Indonesian'
    }

    // Three paths to a transcript, in priority order:
    //   1. Preferred: parse the VTT file yt-dlp already downloaded.
    //   2. Third-party fallback (Supadata / SearchAPI) — bypasses YouTube
    //      IP blocks by using their residential proxy infrastructure.
    //   3. Whisper — YouTube has no captions AT ALL; download audio + STT.
    let transcript
    if (defaultVtt) {
      transcript = parseVttWords(defaultVtt)
    } else if (fallbackWords) {
      // Fallback API succeeded earlier — use its transcript directly.
      transcript = fallbackWords.words
      defaultLang = fallbackWords.language
      if (defaultLang.startsWith('id') || defaultLang.startsWith('ms')) targetLang = 'Indonesian'
    } else {
      // Whisper fallback. Give the client immediate visibility via the
      // status field so the progress bar makes sense (this step can add
      // 10-60s on Groq for typical videos).
      await auth.supabase.from('jobs').update({ status: 'transcribing' }).eq('id', jobId)
      const audioPath = await downloadAudioOnly(url, outputDir, [])
      const mp3Path = path.join(outputDir, 'audio.mp3')
      await extractAudioForWhisper(audioPath, mp3Path)
      const whisper = await transcribeAudio(mp3Path)
      transcript = whisper.words
      if (!transcript.length) {
        throw new Error('No transcript could be built for this video: no captions and Whisper returned no words.')
      }
      // Reflect the detected language so retranscript etc. still work.
      defaultLang = whisper.language || defaultLang || 'en'
      if (defaultLang.startsWith('id') || defaultLang.startsWith('ms')) targetLang = 'Indonesian'
    }

    await auth.supabase.from('jobs').update({
      transcript,
      status: 'analyzing',
      active_subtitle_lang: defaultLang,
    }).eq('id', jobId)

    const clips = await analyzeTranscript(
      transcript,
      chosenModel,
      chosenProvider,
      language || targetLang,
      target_duration || 'auto',
      duration || undefined,   // scale clip count to source video length
    )

    await auth.supabase.from('jobs').update({ clips, status: 'ready' }).eq('id', jobId)

    return NextResponse.json({ jobId, status: 'ready' })
  } catch (err: any) {
    await auth.supabase.from('jobs').update({ status: 'error', error: err.message }).eq('id', jobId).then(() => {}, () => {})
    try {
      const { data: jobRow } = await auth.supabase.from('jobs').select('duration').eq('id', jobId).maybeSingle()
      if (jobRow?.duration) {
        const refundAmt = creditsForGenerate(jobRow.duration)
        await addCredits(auth.supabase, refundAmt, 'refund', `Refund gagal proses: ${err.message?.slice(0, 100)}`)
      }
    } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
