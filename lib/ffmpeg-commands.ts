import type { EditorSettings } from '@/store/types'

export interface ExportCommandOptions {
  sourcePath: string
  assPath: string
  outputPath: string
  settings: EditorSettings
  clipStart: number
  clipEnd: number
}

export function buildExportArgs(opts: ExportCommandOptions): string[] {
  const { sourcePath, assPath, outputPath, settings, clipStart, clipEnd } = opts
  const { crop, trim } = settings

  const startSec = clipStart + trim.start
  const endSec = clipStart + trim.end

  // Build video filter chain
  const filters: string[] = []

  // Crop a 9:16 vertical strip from the 16:9 source.
  // For 1920x1080: cropW = round_even(1080 * 9/16) = 608, cropH = 1080.
  // Scaling 608x1080 → 1080x1920 preserves the 9:16 ratio without distortion.
  const cropW = 608 // round_even(1080 * 9/16)
  const cropH = 1080
  const cropX = Math.min(Math.round(1920 * crop.x), 1920 - cropW)
  filters.push(`crop=${cropW}:${cropH}:${cropX}:0`)

  // Scale to 1080x1920
  filters.push('scale=1080:1920:flags=lanczos')

  // Subtitles - use forward slashes for ASS filter even on Windows
  const assForward = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  filters.push(`ass='${assForward}'`)

  return [
    '-ss', String(startSec),
    '-to', String(endSec),
    '-i', sourcePath,
    '-vf', filters.join(','),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ]
}

export function buildThumbnailArgs(sourcePath: string, timestamp: number, outputPath: string): string[] {
  return [
    '-ss', String(timestamp),
    '-i', sourcePath,
    '-vframes', '1',
    '-q:v', '3',
    '-y',
    outputPath,
  ]
}

export function buildSegmentArgs(sourcePath: string, start: number, end: number, outputPath: string): string[] {
  return [
    '-ss', String(start),
    '-to', String(end),
    '-i', sourcePath,
    '-c', 'copy',
    '-y',
    outputPath,
  ]
}

export function buildWaveformArgs(sourcePath: string, outputPath: string): string[] {
  return [
    '-i', sourcePath,
    '-filter_complex', 'showwavespic=s=800x80:colors=white',
    '-frames:v', '1',
    '-y',
    outputPath,
  ]
}
