import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { requireUser } from '@/lib/supabase-server'
import { analyzeTranscript } from '@/server/analyzer'
import { extractAudioForWhisper, transcribeAudio } from '@/server/whisper-client'
import { probeVideoDuration } from '@/server/ffmpeg-processor'
import { uploadFile, mediaPath } from '@/server/storage'
import { UPLOAD_URL_PREFIX } from '@/server/ytdlp-service'
import { creditsForGenerate, spendCredits, addCredits } from '@/server/credits'

// Same as /api/download: whole pipeline runs synchronously inside one
// invocation; the client polls /api/jobs/:jobId concurrently for the
// progress bar. `jobId` is client-generated (crypto.randomUUID) so the
// client can start polling before this request returns.
export const maxDuration = 300

// Route Handlers on the App Router don't enforce a small body cap by
// default, but Node itself has to fit the whole file in memory when
// req.formData() runs. 200 MB is a sensible ceiling for 2 GB RAM VPS --
// larger uploads should be direct-to-R2 with a presigned URL (future).
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

const TMP_DIR = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs')

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  // Quick size check before we buffer 200 MB into memory needlessly.
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to read upload: ${err.message}` }, { status: 400 })
  }

  const file = formData.get('file')
  const jobId = String(formData.get('jobId') || '')
  const model = String(formData.get('model') || 'gpt-4o-mini')
  const provider = String(formData.get('provider') || 'sumopod')
  const language = String(formData.get('language') || '') || undefined

  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing or not a file' }, { status: 400 })
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  // Basic MIME/ext sanity check -- we accept common video/audio containers.
  const nameLower = file.name.toLowerCase()
  const validExt = /\.(mp4|mov|mkv|webm|avi|m4v|mp3|wav|m4a|ogg)$/i.test(nameLower)
  if (!validExt) return NextResponse.json({ error: 'Unsupported file type. Use MP4/MOV/MKV/WebM/MP3/WAV.' }, { status: 400 })

  const ext = path.extname(file.name) || '.mp4'
  const title = file.name.replace(/\.[^.]+$/, '').slice(0, 200)

  // Insert job row FIRST so the poller can see it even while upload/process
  // is in flight. url is a stable marker (upload://<jobId>) so subsequent
  // segment/thumbnail/export routes know to look at source_storage_path.
  const { error: insertErr } = await auth.supabase.from('jobs').insert({
    id: jobId,
    user_id: auth.user.id,
    url: `${UPLOAD_URL_PREFIX}${jobId}`,
    title,
    model,
    provider,
    status: 'downloading',    // reuse existing status enum -- means "receiving upload" here
  })
  if (insertErr) {
    return NextResponse.json({ error: `Failed to create job: ${insertErr.message}` }, { status: 500 })
  }

  const outputDir = path.join(TMP_DIR, jobId)
  fs.mkdirSync(outputDir, { recursive: true })
  const localSrc = path.join(outputDir, 'source' + ext)

  try {
    // 1. Write incoming file to /tmp.
    const arrayBuf = await file.arrayBuffer()
    if (arrayBuf.byteLength > MAX_UPLOAD_BYTES) throw new Error('file too large')
    fs.writeFileSync(localSrc, Buffer.from(arrayBuf))

    // 2. Upload to R2 so later routes (thumbnail/segment/export) can pull it
    //    back even after this instance's /tmp is wiped.
    const storagePath = mediaPath(auth.user.id, jobId, 'source' + ext)
    await uploadFile(storagePath, localSrc, file.type || 'video/mp4')
    await auth.supabase.from('jobs').update({ source_storage_path: storagePath }).eq('id', jobId)

    // 3. Probe duration + move to transcribing state. Credits are spent
    //    NOW (after we know duration) rather than at job creation so we
    //    charge the correct scaled amount. Refunded if anything below
    //    throws before status='ready'.
    const duration = await probeVideoDuration(localSrc)
    const creditCost = creditsForGenerate(duration)
    try {
      await spendCredits(auth.supabase, creditCost, 'generate', `Upload: ${title}`, jobId)
    } catch (err: any) {
      await auth.supabase.from('jobs').update({ status: 'error', error: 'Kredit tidak cukup. Silakan top-up.' }).eq('id', jobId).then(() => {}, () => {})
      return NextResponse.json({ error: 'insufficient_credits', needed: creditCost }, { status: 402 })
    }
    await auth.supabase.from('jobs').update({ duration, status: 'transcribing' }).eq('id', jobId)

    // 4. Extract audio (mono 16kHz mp3, well under Whisper's 25 MB cap for
    //    videos up to ~100 min) and transcribe.
    const mp3Path = path.join(outputDir, 'audio.mp3')
    await extractAudioForWhisper(localSrc, mp3Path)
    const whisper = await transcribeAudio(mp3Path, language ? { language } : {})
    if (!whisper.words.length) {
      throw new Error('Whisper returned no words -- audio may be silent or unintelligible.')
    }
    const detectedLang = whisper.language || language || 'en'
    const targetLang = (detectedLang.startsWith('id') || detectedLang.startsWith('ms')) ? 'Indonesian' : 'English'

    await auth.supabase.from('jobs').update({
      transcript: whisper.words,
      active_subtitle_lang: detectedLang,
      status: 'analyzing',
    }).eq('id', jobId)

    // 5. Analyze -> AI picks viral moments (count scales to video length).
    const clips = await analyzeTranscript(
      whisper.words,
      model,
      provider,
      targetLang,
      'auto',
      duration || undefined,
    )

    await auth.supabase.from('jobs').update({ clips, status: 'ready' }).eq('id', jobId)
    return NextResponse.json({ jobId, status: 'ready' })
  } catch (err: any) {
    await auth.supabase.from('jobs').update({ status: 'error', error: err.message }).eq('id', jobId).then(() => {}, () => {})
    // Refund credits if we already deducted them but the pipeline failed
    // downstream (transcribe/analyze). No-op if we failed before spend.
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
