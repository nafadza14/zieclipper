import type { EditorSettings } from '@/store/types'
import { getFormatDimensions } from '@/lib/formats'

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

  // Target output dimensions come from the chosen aspect ratio (9:16, 1:1,
  // 16:9) instead of the old hard-coded 1080x1920. The ass filter renders the
  // subtitles at these same dimensions (see lib/ass-generator.ts), so the two
  // always agree.
  const { width: TW, height: TH } = getFormatDimensions(settings.videoFormat)

  if (crop.style === 'fit') {
    // Fit/letterbox: whole landscape frame centered inside the target box,
    // empty space filled by the chosen background.
    let bgChain = ''
    if (crop.background === 'blur') {
      bgChain = `[0:v]scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},boxblur=40:10[bg]`
    } else if (crop.background === 'color') {
      bgChain = `color=c=${crop.backgroundColor}:s=${TW}x${TH}[bg]`
    } else { // black
      bgChain = `color=c=black:s=${TW}x${TH}[bg]`
    }

    const filterComplex = [
      bgChain,
      `[0:v]scale=${TW}:${TH}:force_original_aspect_ratio=decrease[fg]`,
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

  // Fill/crop: crop the source to the target aspect ratio (keeping full
  // height), pan horizontally via crop.x, then scale to the exact target
  // dimensions. cropW = ih * (TW/TH) stays <= iw for any target AR narrower
  // than or equal to the 16:9 source, which is always the case here.
  const filters: string[] = []
  const cropWExpr = `trunc(ih*${TW}/${TH}/2)*2`
  const cropXExpr = `trunc((iw-${cropWExpr})*${crop.x}/2)*2`
  filters.push(`crop=${cropWExpr}:ih:${cropXExpr}:0`)
  filters.push(`scale=${TW}:${TH}:flags=lanczos`)
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
