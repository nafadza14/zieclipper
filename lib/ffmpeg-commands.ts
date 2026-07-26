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

  const assForward = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')

  if (crop.style === 'fit') {
    let bgChain = ''
    if (crop.background === 'blur') {
      bgChain = `[0:v]scale=-2:1920,crop=1080:1920,boxblur=40:10[bg]`
    } else if (crop.background === 'color') {
      bgChain = `color=c=${crop.backgroundColor}:s=1080x1920[bg]`
    } else { // black
      bgChain = `color=c=black:s=1080x1920[bg]`
    }

    const filterComplex = [
      bgChain,
      `[0:v]scale=1080:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,ass='${assForward}'[out]`
    ].join(';')

    return [
      '-ss', String(startSec),
      '-to', String(endSec),
      '-i', sourcePath,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-map', '0:a?',
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

  // Build video filter chain for 'fill' mode (Fullscreen Crop)
  const filters: string[] = []

  // Dynamically calculate crop width (cw) for 9:16 aspect ratio relative to input height,
  // and crop X coordinate based on crop.x slider percentage.
  // Use even integer truncation for H.264 compatibility.
  const cropWExpr = 'trunc(ih*9/16/2)*2'
  const cropXExpr = `trunc((iw-${cropWExpr})*${crop.x}/2)*2`
  filters.push(`crop=${cropWExpr}:ih:${cropXExpr}:0`)

  // Scale to 1080x1920
  filters.push('scale=1080:1920:flags=lanczos')
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
