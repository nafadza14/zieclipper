import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { requireUser } from '@/lib/supabase-server'
import { extractVideoId } from '@/server/youtube'
import { downloadSubtitlesAndMetadata } from '@/server/ytdlp-service'
import { buildAvailableSubtitles } from '@/server/subtitles'
import { parseVttWords } from '@/server/transcript-parser'
import { analyzeTranscript } from '@/server/analyzer'

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

  const chosenModel = model || 'claude-sonnet-4-6'
  const chosenProvider = provider || 'anthropic'

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

    const { title, duration, vttFiles, infoJsonPath } = await downloadSubtitlesAndMetadata(url, outputDir)
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

    if (!defaultVtt) {
      throw new Error('No subtitles or captions (manual or auto-generated) are available for this video, so no transcript can be built.')
    }

    let targetLang = 'English'
    if (defaultLang && (defaultLang.toLowerCase().startsWith('id') || defaultLang.toLowerCase().startsWith('ms'))) {
      targetLang = 'Indonesian'
    }

    const transcript = parseVttWords(defaultVtt)
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
    )

    await auth.supabase.from('jobs').update({ clips, status: 'ready' }).eq('id', jobId)

    return NextResponse.json({ jobId, status: 'ready' })
  } catch (err: any) {
    await auth.supabase.from('jobs').update({ status: 'error', error: err.message }).eq('id', jobId).then(() => {}, () => {})
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
