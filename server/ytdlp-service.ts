import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { getBinaries } from './binaries'
import { runFFmpeg } from './ffmpeg-processor'

// Ported from worker/src/ytdlp-service.ts. os.tmpdir() resolves to /tmp on
// Vercel (writable, ~512MB-1GB depending on plan). Unlike the always-on
// worker, a Vercel function instance is not guaranteed to survive between
// separate invocations -- so the on-disk caching below (skip re-download if
// a file already exists) is a same-invocation/same-warm-instance bonus, not
// something callers should rely on across requests. Every code path here
// still works correctly even when the cache is empty every time.
const TMP_ROOT = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper')
const TMP_DIR = path.join(TMP_ROOT, 'jobs')

// Optional YouTube cookies (Netscape cookies.txt format). YouTube routinely
// blocks requests from datacenter IPs ("Sign in to confirm you're not a
// bot"); passing cookies from a real signed-in browser session works around
// it. Two ways to supply them on Vercel (there's no mounted-secret file):
//   - YTDLP_COOKIES_B64: the whole cookies.txt base64-encoded, set as a
//     Vercel env var. Materialized to /tmp at request time (preferred --
//     keeps the secret out of git).
//   - YTDLP_COOKIES_PATH: an explicit path to a cookies.txt that exists at
//     runtime (e.g. committed into the repo -- not recommended for a real
//     cookie).
const COOKIES_FILE = path.join(TMP_ROOT, 'yt-cookies.txt')

// Resolves a usable cookies.txt path, materializing it from YTDLP_COOKIES_B64
// if that's how it was supplied. Re-checks existence every call because /tmp
// can be wiped between invocations on a cold instance.
function resolveCookiesFile(): string | null {
  const explicit = process.env.YTDLP_COOKIES_PATH
  if (explicit && fs.existsSync(explicit)) return explicit

  const b64 = process.env.YTDLP_COOKIES_B64
  if (b64) {
    try {
      if (!fs.existsSync(COOKIES_FILE)) {
        fs.mkdirSync(TMP_ROOT, { recursive: true })
        fs.writeFileSync(COOKIES_FILE, Buffer.from(b64, 'base64').toString('utf-8'))
      }
      return COOKIES_FILE
    } catch {
      // fall through -- better to try without cookies than to hard-fail here
    }
  }

  if (fs.existsSync(COOKIES_FILE)) return COOKIES_FILE
  return null
}

// Args every yt-dlp call needs: a JavaScript runtime (YouTube extraction now
// requires one; Vercel has no Deno but does have Node, which yt-dlp supports
// as a runtime -- verified: it reports "JS runtimes: node-XX"), plus cookies
// when available.
function ytBaseArgs(): string[] {
  const args = ['--js-runtimes', `node:${process.execPath}`]
  const cookies = resolveCookiesFile()
  if (cookies) args.push('--cookies', cookies)
  return args
}

// Turns a raw yt-dlp failure into a message that tells whoever's debugging
// what to actually do -- the "not a bot" block is the single most common
// failure on datacenter IPs and its fix (cookies) isn't obvious from the
// raw output alone.
function ytdlpError(code: number | null, stderr: string): string {
  const raw = stderr.slice(-1500) || 'no output'
  const lower = stderr.toLowerCase()
  if (lower.includes('not a bot') || lower.includes('sign in to confirm')) {
    const hasCookies = !!resolveCookiesFile()
    return hasCookies
      ? `YouTube blocked this request even with cookies (exit ${code}). The cookies may be expired or from a different account/region — re-export a fresh cookies.txt while signed in to YouTube and update YTDLP_COOKIES_B64. Raw: ${raw}`
      : `YouTube is blocking this server's IP ("Sign in to confirm you're not a bot"). Set YTDLP_COOKIES_B64 in your Vercel env to a base64 cookies.txt exported while signed in to YouTube — see DEPLOY-VERCEL-SUPABASE.md. Raw: ${raw}`
  }
  return `yt-dlp failed (exit ${code}): ${raw}`
}

export interface SubtitleResult {
  title: string
  duration: number
  vttFiles: Record<string, string> // lang code → absolute file path
  infoJsonPath?: string
}

function runYtdlp(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { ytdlp } = getBinaries()
    // stdio must NOT be 'ignore': that throws away yt-dlp's stderr, which is
    // the only place the real failure reason (blocked, no such video, no
    // subs, ...) ever shows up. Capture it so callers can surface it instead
    // of silently treating every run as a success.
    const proc = spawn(ytdlp, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => resolve({ code, stderr }))
    proc.on('error', (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)))
  })
}

/**
 * Downloads subtitles and metadata info JSON from YouTube without downloading the video.
 */
export async function downloadSubtitlesAndMetadata(
  url: string,
  outputDir: string,
): Promise<SubtitleResult> {
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(TMP_ROOT, { recursive: true })

  const args = [
    url,
    '--skip-download',
    '--write-info-json',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', 'all',
    '--sub-format', 'vtt',
    ...ytBaseArgs(),
    '--extractor-retries', '3',
    '--sleep-requests', '1',
    '--no-playlist',
    '--output', path.join(outputDir, 'source.%(ext)s'),
  ]

  const { code, stderr } = await runYtdlp(args)

  const files = fs.readdirSync(outputDir)
  const infoFile = files.find((f) => f.endsWith('.info.json'))

  // A non-zero exit AND no info.json means yt-dlp genuinely failed to reach
  // the video (blocked, deleted, private, ...) -- surface that instead of
  // quietly returning an empty "Untitled" / 0-duration result, which used
  // to make every downstream failure look unrelated to the real cause.
  if (code !== 0 && !infoFile) {
    throw new Error(ytdlpError(code, stderr))
  }

  let title = 'Untitled'
  let duration = 0
  let infoJsonPath: string | undefined
  if (infoFile) {
    infoJsonPath = path.join(outputDir, infoFile)
    try {
      const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8'))
      title = info.title || title
      duration = info.duration || 0
    } catch {}
  }

  const vttFiles: Record<string, string> = {}
  for (const f of files) {
    if (!f.endsWith('.vtt')) continue
    const langCode = f.replace(/^source\./, '').replace(/\.vtt$/, '')
    if (langCode) vttFiles[langCode] = path.join(outputDir, f)
  }

  return { title, duration, vttFiles, infoJsonPath }
}

/**
 * Reads the subtitles/automatic_captions keys out of yt-dlp's own
 * --write-info-json output to list which languages are available, instead
 * of calling a separate youtube_transcript_api-style library (dropped --
 * see DEPLOY-VERCEL-SUPABASE.md for why).
 */
export function listAvailableLanguagesFromInfoJson(infoJsonPath: string): {
  manual: string[]
  automatic: string[]
} {
  const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf-8'))
  return {
    manual: Object.keys(info.subtitles || {}),
    automatic: Object.keys(info.automatic_captions || {}),
  }
}

/**
 * Fetches only yt-dlp's info.json (no subs, no video) -- used by the
 * available-languages route, which is a lightweight peek and doesn't need
 * anything else downloadSubtitlesAndMetadata also fetches.
 */
export async function fetchInfoJson(url: string, outputDir: string): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true })

  const args = [
    url,
    '--skip-download',
    '--write-info-json',
    ...ytBaseArgs(),
    '--extractor-retries', '3',
    '--no-playlist',
    '--output', path.join(outputDir, 'info.%(ext)s'),
  ]

  const { code, stderr } = await runYtdlp(args)
  const files = fs.readdirSync(outputDir)
  const infoFile = files.find((f) => f.endsWith('.info.json'))
  if (!infoFile) {
    throw new Error(`yt-dlp failed to fetch video info (exit ${code}): ${stderr.slice(-1000) || 'no output'}`)
  }
  return path.join(outputDir, infoFile)
}

/**
 * Re-fetches a single subtitle track by language code. Used by the
 * retranscript route instead of trusting the vttPath cached in a job's
 * available_subtitles (that path points into a previous invocation's /tmp,
 * which a later request has no guarantee of still seeing -- see the
 * TMP_ROOT comment above).
 */
export async function downloadSubtitleTrack(
  url: string,
  lang: string,
  outputDir: string,
): Promise<string | null> {
  fs.mkdirSync(outputDir, { recursive: true })

  const args = [
    url,
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', lang,
    '--sub-format', 'vtt',
    ...ytBaseArgs(),
    '--extractor-retries', '3',
    '--sleep-requests', '1',
    '--no-playlist',
    '--output', path.join(outputDir, 'retrans.%(ext)s'),
  ]

  await runYtdlp(args)

  const files = fs.readdirSync(outputDir)
  const vtt = files.find((f) => f.startsWith('retrans.') && f.endsWith('.vtt'))
  return vtt ? path.join(outputDir, vtt) : null
}

/**
 * Downloads a specific time-range of a video from YouTube using HTTP range requests.
 * Uses a single progressive MP4 format to skip the slow DASH separation and merge step.
 */
export async function downloadVideoSection(
  url: string,
  start: number,
  end: number,
  outputDir: string,
  outputFilename: string,
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, outputFilename)
  const sectionArg = `*${start}-${end}`

  const args = [
    url,
    '--format', 'best[height<=720][ext=mp4]/best',
    '--download-sections', sectionArg,
    ...ytBaseArgs(),
    '--extractor-retries', '3',
    '--sleep-requests', '1',
    '--no-playlist',
    '--output', outputPath,
  ]

  const { code, stderr } = await runYtdlp(args)

  if (code !== 0 && !fs.existsSync(outputPath)) {
    throw new Error(`yt-dlp section download failed (exit ${code}): ${stderr.slice(-1500) || 'no output'}`)
  }

  return outputPath
}

/**
 * Ensures a specific segment of video is downloaded and trimmed locally.
 * Caches both the buffered raw section and the exact trimmed result for
 * the lifetime of the current /tmp (see TMP_ROOT comment above).
 */
export async function ensureVideoSegment(
  jobId: string,
  url: string,
  start: number,
  end: number
): Promise<string> {
  const outputDir = path.join(TMP_DIR, jobId)
  const exactName = `segment_${Math.round(start * 10)}_${Math.round(end * 10)}.mp4`
  const exactPath = path.join(outputDir, exactName)

  if (fs.existsSync(exactPath)) {
    return exactPath
  }

  const BUFFER_SEC = 10
  const bufferedStart = Math.max(0, Math.floor(start - BUFFER_SEC))
  const bufferedEnd = Math.ceil(end + BUFFER_SEC)

  const bufferedName = `buffered_${bufferedStart}_${bufferedEnd}.mp4`
  const bufferedPath = path.join(outputDir, bufferedName)

  if (!fs.existsSync(bufferedPath)) {
    await downloadVideoSection(url, bufferedStart, bufferedEnd, outputDir, bufferedName)
  }

  const relativeStart = start - bufferedStart
  const duration = end - start

  const ffmpegArgs = [
    '-y',
    '-ss', String(relativeStart),
    '-i', bufferedPath,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-c:a', 'aac',
    exactPath
  ]
  await runFFmpeg(ffmpegArgs)

  return exactPath
}
