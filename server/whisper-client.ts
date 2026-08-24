import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { getBinaries } from './binaries'
import type { WordTiming } from '@/store/types'

// Groq's Whisper endpoint is OpenAI-compatible; the only differences from
// OpenAI's are the base URL and that Groq's whisper-large-v3 / v3-turbo run
// ~200x realtime for free (until rate limits). Uses raw fetch to keep this
// file dependency-light -- the OpenAI SDK's audio helper works too but
// adds a heavier request shape than necessary.
//
// Called only as a FALLBACK when yt-dlp returned no VTT for a video, i.e.
// the video has no captions of any kind. See app/api/download/route.ts.

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const OPENAI_BASE = 'https://api.openai.com/v1'

export interface WhisperResult {
  text: string
  words: WordTiming[]
  language?: string
}

// Extracts a mono 16 kHz MP3 @ 32 kbps from any input video file. Two
// constraints drive the format choice:
//   1. Groq's Whisper endpoint caps request bodies at 25 MB, and OpenAI's
//      caps at the same. A 16 kHz mono WAV is ~1.9 MB/min, so a 15-min
//      video already trips the limit. MP3 at 32 kbps is ~240 KB/min,
//      giving us headroom for ~100 min videos in one request.
//   2. Whisper's accuracy is essentially unchanged for speech below 32 kbps
//      — the model expects 16 kHz mono internally anyway.
// Caller should pass an .mp3 extension for outPath.
export async function extractAudioForWhisper(videoPath: string, outPath: string): Promise<string> {
  const { ffmpeg } = getBinaries()
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-y',
      '-i', videoPath,
      '-vn',              // drop video
      '-ac', '1',         // mono
      '-ar', '16000',     // 16 kHz
      '-c:a', 'libmp3lame',
      '-b:a', '32k',
      outPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg audio extract failed: ${err.slice(-500)}`)))
    proc.on('error', reject)
  })
  return outPath
}

// Downloads audio-only from a YouTube URL via yt-dlp -- cheaper than
// downloading the full video, and enough for transcription. Requires the
// same cookies/impersonation setup as the rest of yt-dlp uses; the caller
// (download route) will already have that working since it also fetched
// info.json for this video.
export async function downloadAudioOnly(
  url: string,
  outputDir: string,
  extraYtdlpArgs: string[],
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'audio.m4a')
  const { ytdlp } = getBinaries()

  const args = [
    url,
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '--no-playlist',
    ...extraYtdlpArgs,
    '--output', outputPath,
  ]

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ytdlp, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('close', (code) => code === 0 && fs.existsSync(outputPath)
      ? resolve()
      : reject(new Error(`yt-dlp audio download failed (exit ${code}): ${err.slice(-1500) || 'no output'}`)))
    proc.on('error', reject)
  })

  return outputPath
}

// Transcribe an audio file with Whisper via Groq or OpenAI, returning
// word-level timestamps matching our WordTiming shape (same format as
// parseVttWords produces from YouTube's VTT captions -- so the analyzer
// doesn't care where the transcript came from).
export async function transcribeAudio(
  audioPath: string,
  opts: { language?: string } = {},
): Promise<WhisperResult> {
  const groqKey = process.env.GROQ_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  const [base, key, model] = groqKey
    ? [GROQ_BASE, groqKey, 'whisper-large-v3-turbo']
    : openaiKey
      ? [OPENAI_BASE, openaiKey, 'whisper-1']
      : [null, null, null]

  if (!base || !key || !model) {
    throw new Error(
      'No Whisper provider configured. Set GROQ_API_KEY (recommended -- free tier at https://console.groq.com) or OPENAI_API_KEY in your .env.local.'
    )
  }

  const form = new FormData()
  const buf = fs.readFileSync(audioPath)
  // Node 20+ has global Blob/FormData that work with fetch multipart uploads.
  const ext = path.extname(audioPath).toLowerCase().replace('.', '') || 'mp3'
  const mime = ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : `audio/${ext}`
  form.append('file', new Blob([buf], { type: mime }), path.basename(audioPath))
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  if (opts.language) form.append('language', opts.language)

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Whisper transcription failed (${res.status}): ${detail.slice(0, 500)}`)
  }
  const data: any = await res.json()

  // verbose_json shape:
  //  { text, language, words: [{word, start, end}, ...], segments: [...] }
  const words: WordTiming[] = Array.isArray(data.words)
    ? data.words.map((w: any) => ({
        word: String(w.word ?? '').trim(),
        start: Number(w.start ?? 0),
        end: Number(w.end ?? w.start ?? 0),
      })).filter((w: WordTiming) => w.word.length > 0)
    : []

  return { text: String(data.text ?? ''), words, language: data.language }
}
