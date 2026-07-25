import { spawn } from 'child_process'
import { ensureBinaries } from './binaries'

export function runFFmpeg(
  args: string[],
  onProgress?: (progress: number) => void,
  durationSeconds?: number
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const { ffmpeg } = await ensureBinaries()
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
    } catch (err: any) {
      reject(err)
    }
  })
}

export function probeVideoDuration(filePath: string): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const { ffprobe } = await ensureBinaries()
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
    } catch (err) {
      resolve(0)
    }
  })
}
