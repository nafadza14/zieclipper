import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp'
const TMP_ROOT = path.join(process.cwd(), 'tmp')
export const COOKIES_FILE = path.join(TMP_ROOT, 'yt-cookies.txt')

export interface DownloadResult {
  videoPath: string
  title: string
  duration: number
  vttFiles: Record<string, string>  // lang code → absolute file path
}

export function downloadVideo(
  url: string,
  outputDir: string,
  onProgress: (pct: number, status: string) => void,
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(TMP_ROOT, { recursive: true })

    const outputTemplate = path.join(outputDir, 'source.%(ext)s')

    const args = [
      url,
      '--format', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      '--merge-output-format', 'mp4',
      '--write-info-json',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'all',
      '--sub-format', 'vtt',
      // Use cookies file if the user has exported one (see README for instructions)
      ...(fs.existsSync(COOKIES_FILE) ? ['--cookies', COOKIES_FILE] : []),
      '--extractor-retries', '3',
      '--sleep-requests', '1',
      '--ignore-errors',
      '--no-playlist',
      '--output', outputTemplate,
      '--newline',
    ]

    const proc = spawn(YTDLP, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderrBuf = ''

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString()

      // Parse download progress: [download]  45.2% of 234.56MiB
      const pctMatch = text.match(/\[download\]\s+([\d.]+)%/)
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1])
        onProgress(Math.round(pct), 'downloading')
      }

      // Detect merge/post-processing
      if (text.includes('[Merger]') || text.includes('Merging')) {
        onProgress(98, 'merging')
      }
    })

    proc.stderr.on('data', (d: Buffer) => { stderrBuf += d.toString() })

    proc.on('close', async (code) => {
      // Check for video file before deciding whether a non-zero exit is fatal.
      // Subtitle 429 errors cause exit code 1 even when the video downloaded fine.
      const files = fs.readdirSync(outputDir)
      const videoFile = files.find((f) => f.startsWith('source.') && f.endsWith('.mp4'))

      if (code !== 0 && !videoFile) {
        return reject(new Error(`yt-dlp exited ${code}: ${stderrBuf.slice(-1000)}`))
      }
      if (!videoFile) {
        return reject(new Error('Video file not found after download'))
      }

      const videoPath = path.join(outputDir, videoFile)

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

      // Collect all downloaded VTT files, keyed by language code
      // yt-dlp names them: source.<langcode>.vtt  (e.g. source.id.vtt, source.en.vtt)
      const vttFiles: Record<string, string> = {}
      for (const f of files) {
        if (!f.endsWith('.vtt')) continue
        // Strip "source." prefix and ".vtt" suffix to get lang code
        const langCode = f.replace(/^source\./, '').replace(/\.vtt$/, '')
        if (langCode) vttFiles[langCode] = path.join(outputDir, f)
      }

      onProgress(100, 'done')
      resolve({ videoPath, title, duration, vttFiles })
    })

    proc.on('error', (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)))
  })
}
