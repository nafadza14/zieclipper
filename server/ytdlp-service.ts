import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { ensureBinaries } from './binaries'
import { runFFmpeg } from './ffmpeg-processor'

const TMP_ROOT = path.join(os.tmpdir(), 'zieclipper')
export const COOKIES_FILE = path.join(TMP_ROOT, 'yt-cookies.txt')
const TMP_DIR = path.join(os.tmpdir(), 'zieclipper', 'jobs')

export interface SubtitleResult {
  title: string
  duration: number
  vttFiles: Record<string, string>  // lang code → absolute file path
}

/**
 * Downloads subtitles and metadata info JSON from YouTube without downloading the video.
 */
export function downloadSubtitlesAndMetadata(
  url: string,
  outputDir: string,
): Promise<SubtitleResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const { ytdlp } = await ensureBinaries()

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
        ...(fs.existsSync(COOKIES_FILE) ? ['--cookies', COOKIES_FILE] : []),
        '--extractor-retries', '3',
        '--sleep-requests', '1',
        '--ignore-errors',
        '--no-playlist',
        '--output', path.join(outputDir, 'source.%(ext)s'),
      ]

      const proc = spawn(ytdlp, args, {
        stdio: 'ignore',
        windowsHide: true,
      })

      proc.on('close', (code) => {
        const files = fs.readdirSync(outputDir)
        
        // Parse info JSON
        let title = 'Untitled'
        let duration = 0
        const infoFile = files.find((f) => f.endsWith('.info.json'))
        if (infoFile) {
          try {
            const info = JSON.parse(fs.readFileSync(path.join(outputDir, infoFile), 'utf-8'))
            title = info.title || title
            duration = info.duration || 0
          } catch {}
        }

        // Collect VTT files
        const vttFiles: Record<string, string> = {}
        for (const f of files) {
          if (!f.endsWith('.vtt')) continue
          const langCode = f.replace(/^source\./, '').replace(/\.vtt$/, '')
          if (langCode) vttFiles[langCode] = path.join(outputDir, f)
        }

        resolve({ title, duration, vttFiles })
      })

      proc.on('error', (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)))
    } catch (err: any) {
      reject(err)
    }
  })
}

/**
 * Downloads a specific time-range of a video from YouTube using HTTP range requests.
 * Uses a single progressive MP4 format to skip the slow DASH separation and merge step.
 */
export function downloadVideoSection(
  url: string,
  start: number,
  end: number,
  outputDir: string,
  outputFilename: string,
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const { ytdlp, ffmpeg } = await ensureBinaries()

      fs.mkdirSync(outputDir, { recursive: true })
      const outputPath = path.join(outputDir, outputFilename)

      // Section format required by yt-dlp: *start-end
      const sectionArg = `*${start}-${end}`

      const args = [
        url,
        // Prefer format 22 (720p mp4 progressive) or format 18 (360p mp4 progressive).
        // This avoids YouTube DASH throttling and skips the slow ffmpeg merge/transcode step on download.
        '--format', 'best[height<=720][ext=mp4]/best',
        '--download-sections', sectionArg,
        ...(ffmpeg !== 'ffmpeg' ? ['--ffmpeg-location', path.dirname(ffmpeg)] : []),
        ...(fs.existsSync(COOKIES_FILE) ? ['--cookies', COOKIES_FILE] : []),
        '--extractor-retries', '3',
        '--sleep-requests', '1',
        '--ignore-errors',
        '--no-playlist',
        '--output', outputPath,
      ]

      const proc = spawn(ytdlp, args, {
        stdio: 'ignore',
        windowsHide: true,
      })

      proc.on('close', (code) => {
        if (code !== 0 && !fs.existsSync(outputPath)) {
          return reject(new Error(`yt-dlp section download exited ${code}`))
        }
        resolve(outputPath)
      })

      proc.on('error', (err) => reject(new Error(`yt-dlp section spawn error: ${err.message}`)))
    } catch (err: any) {
      reject(err)
    }
  })
}

/**
 * Ensures a specific segment of video is downloaded and trimmed locally.
 * Caches both the buffered raw section and the exact trimmed result.
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

  // Download a buffered segment first to allow user to adjust trim range without new download
  const BUFFER_SEC = 10
  const bufferedStart = Math.max(0, Math.floor(start - BUFFER_SEC))
  const bufferedEnd = Math.ceil(end + BUFFER_SEC)

  const bufferedName = `buffered_${bufferedStart}_${bufferedEnd}.mp4`
  const bufferedPath = path.join(outputDir, bufferedName)

  // Download section from YouTube if the buffered file doesn't exist
  if (!fs.existsSync(bufferedPath)) {
    await downloadVideoSection(url, bufferedStart, bufferedEnd, outputDir, bufferedName)
  }

  // Local transcode using ultra-fast presets to guarantee keyframe-perfect timing
  // and prevent browser video player from hanging on load (no I-frame issues).
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
