import { spawn } from 'child_process'
import { getBinaries } from './binaries'

// Ported from worker/src/ffmpeg-processor.ts, unchanged -- getBinaries()
// already resolves correctly for both Vercel (bundled binaries) and local
// dev (PATH), see server/binaries.ts.
export function runFFmpeg(
  args: string[],
  onProgress?: (progress: number) => void,
  durationSeconds?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { ffmpeg } = getBinaries()
    const proc = spawn(ffmpeg, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stderrBuf = ''

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      stderrBuf += text

      if (onProgress && durationSeconds) {
        const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (match) {
          const h = parseInt(match[1])
          const m = parseInt(match[2])
          const s = parseFloat(match[3])
          const elapsed = h * 3600 + m * 60 + s
          const pct = Math.min(99, Math.round((elapsed / durationSeconds) * 100))
          onProgress(pct)
        }
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        onProgress?.(100)
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}\n${stderrBuf.slice(-2000)}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`))
    })
  })
}

// Real video width/height from ffprobe. Used by the export-time face
// tracking to build a crop-x expression clamped to the actual source (the
// tracking builder needs to know source pixels to convert 0..1 fractions
// into pixel offsets). Falls back to 1280x720 on failure -- that's the
// nominal size of yt-dlp's `best[height<=720]` format we ask for.
export function probeVideoDimensions(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const { ffprobe } = getBinaries()
    const proc = spawn(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      filePath,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', () => {
      try {
        const json = JSON.parse(out)
        const s = json?.streams?.[0]
        const w = Number(s?.width), h = Number(s?.height)
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          resolve({ width: w, height: h })
          return
        }
      } catch {}
      resolve({ width: 1280, height: 720 })
    })
    proc.on('error', () => resolve({ width: 1280, height: 720 }))
  })
}

export function probeVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const { ffprobe } = getBinaries()
    const proc = spawn(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

    let out = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const json = JSON.parse(out)
          resolve(parseFloat(json.format.duration))
        } catch {
          resolve(0)
        }
      } else {
        resolve(0)
      }
    })
    proc.on('error', () => resolve(0))
  })
}
