import type { EditorSettings } from '@/store/types'
import { getFormatDimensions } from '@/lib/formats'

export interface EmojiOverlay {
  pngPath: string          // absolute path to a 72x72 (or similar) PNG
  start: number            // seconds, relative to the OUTPUT clip (post-trim)
  end: number
  size: number             // draw size in output pixels
  position: 'above' | 'below' | 'inline'
  subtitlePosition: 'top' | 'center' | 'bottom'
  subtitleOffsetY: number
}

export interface ExportCommandOptions {
  sourcePath: string
  assPath: string
  outputPath: string
  settings: EditorSettings
  clipStart: number
  clipEnd: number
  emojiOverlays?: EmojiOverlay[]
  // Optional dynamic crop x expression (from server/face-tracking.ts +
  // lib/crop-expression.ts). When set, the fill-mode chain uses this
  // ffmpeg expression instead of the static crop.x pan. Ignored in fit
  // mode (no crop pan happens there).
  cropXExpr?: string
}

// Where to draw the emoji vertically, matching subtitle-renderer.ts's baseY
// logic scaled to output dims. cy is the CENTER of the emoji sprite.
function emojiCenterY(overlay: EmojiOverlay, height: number): number {
  const margin = Math.round(180 * height / 1920)
  let baseY: number
  if (overlay.subtitlePosition === 'top') baseY = Math.round(300 * height / 1920) + overlay.subtitleOffsetY
  else if (overlay.subtitlePosition === 'center') baseY = Math.round(height / 2) + overlay.subtitleOffsetY
  else baseY = height - margin + overlay.subtitleOffsetY

  if (overlay.position === 'below') return baseY + Math.round(overlay.size * 1.1)
  if (overlay.position === 'inline') return baseY
  // 'above'
  return Math.max(overlay.size, baseY - Math.round(overlay.size * 2.2))
}

export function buildExportArgs(opts: ExportCommandOptions): string[] {
  const { sourcePath, assPath, outputPath, settings, clipStart, clipEnd, emojiOverlays = [], cropXExpr } = opts
  const { crop, trim } = settings

  const startSec = clipStart + trim.start
  const endSec = clipStart + trim.end

  const assForward = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  const { width: TW, height: TH } = getFormatDimensions(settings.videoFormat)

  // Base video graph: whichever crop/fit style is chosen ends with a labelled
  // stream [vbase] that already has ASS subtitles burned in. Emoji overlays
  // are then stacked on top of that -- same for fill and fit, so we always
  // use filter_complex here (unlike the earlier -vf shortcut).
  const chains: string[] = []
  if (crop.style === 'fit') {
    if (crop.background === 'blur') {
      chains.push(`[0:v]scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},boxblur=40:10[bg]`)
    } else if (crop.background === 'color') {
      chains.push(`color=c=${crop.backgroundColor}:s=${TW}x${TH}:d=${endSec - startSec}[bg]`)
    } else {
      chains.push(`color=c=black:s=${TW}x${TH}:d=${endSec - startSec}[bg]`)
    }
    chains.push(`[0:v]scale=${TW}:${TH}:force_original_aspect_ratio=decrease[fg]`)
    chains.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2,ass='${assForward}'[vbase]`)
  } else {
    // fill: crop the source to target aspect ratio (keeping height), pan via
    // crop.x (or a dynamic expression when face tracking is on), scale to
    // exact output dims, then burn subtitles.
    const cropWExpr = `trunc(ih*${TW}/${TH}/2)*2`
    const staticXExpr = `trunc((iw-${cropWExpr})*${crop.x}/2)*2`
    const xExpr = cropXExpr ? `'${cropXExpr}'` : staticXExpr
    chains.push(`[0:v]crop=${cropWExpr}:ih:${xExpr}:0,scale=${TW}:${TH}:flags=lanczos,ass='${assForward}'[vbase]`)
  }

  // Emoji overlays: one movie source + one overlay per chunk-with-emoji.
  // Each overlay is time-gated by `enable='between(t,start,end)'` so it only
  // appears while its caption chunk is on screen. Wired sequentially:
  // [vbase] -> [v1] -> [v2] -> ... -> [vout].
  let inLabel = 'vbase'
  emojiOverlays.forEach((ov, i) => {
    const src = `emoji${i}`
    const scaled = `emoji${i}s`
    const outLabel = i === emojiOverlays.length - 1 ? 'vout' : `v${i + 1}`
    const pathForward = ov.pngPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    chains.push(`movie='${pathForward}'[${src}]`)
    chains.push(`[${src}]scale=${ov.size}:${ov.size}[${scaled}]`)
    const cy = emojiCenterY(ov, TH)
    // overlay X centers on the frame; y = cy - size/2. Time-gated via enable.
    chains.push(`[${inLabel}][${scaled}]overlay=x=(W-w)/2:y=${cy - Math.round(ov.size / 2)}:enable='between(t,${ov.start.toFixed(3)},${ov.end.toFixed(3)})'[${outLabel}]`)
    inLabel = outLabel
  })

  // If there were no emoji overlays, the final label is still 'vbase' -- map
  // that instead of the never-created 'vout'.
  const finalLabel = emojiOverlays.length ? 'vout' : 'vbase'

  return [
    '-ss', String(startSec),
    '-to', String(endSec),
    '-i', sourcePath,
    '-filter_complex', chains.join(';'),
    '-map', `[${finalLabel}]`,
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
