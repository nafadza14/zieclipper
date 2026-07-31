import type { VideoFormat } from '@/store/types'

// Single source of truth for output dimensions per aspect ratio. Used by the
// export pipeline (ffmpeg-commands, ass-generator) AND the live preview
// (subtitle-renderer, useVideoSync, VideoPlayer) so what you see matches what
// you download. All source videos here are landscape 16:9 (YouTube <=720p),
// which the fill-mode crop math below assumes.
export const VIDEO_FORMATS: { value: VideoFormat; label: string; hint: string }[] = [
  { value: '9:16', label: '9:16', hint: 'Shorts / Reels / TikTok' },
  { value: '1:1', label: '1:1', hint: 'Feed square' },
  { value: '16:9', label: '16:9', hint: 'YouTube landscape' },
]

export function getFormatDimensions(format: VideoFormat): { width: number; height: number } {
  switch (format) {
    case '1:1':
      return { width: 1080, height: 1080 }
    case '16:9':
      return { width: 1920, height: 1080 }
    case '9:16':
    default:
      return { width: 1080, height: 1920 }
  }
}

export function getFormatAspectRatio(format: VideoFormat): number {
  const { width, height } = getFormatDimensions(format)
  return width / height
}

// CSS aspect-ratio string for preview containers, e.g. "9 / 16".
export function getFormatCss(format: VideoFormat): string {
  return format.replace(':', ' / ')
}

// In fill/crop mode, what fraction of a 16:9 source's WIDTH stays visible after
// cropping to the target aspect ratio. 9:16 keeps ~0.316, 1:1 ~0.5625, 16:9
// keeps the whole width (1.0, so there's no horizontal pan to do).
export function cropWidthRatio(format: VideoFormat): number {
  const sourceAR = 16 / 9
  return Math.min(1, getFormatAspectRatio(format) / sourceAR)
}
