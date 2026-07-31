import type { SubtitleChunk, EditorSettings } from '@/store/types'
import { getFormatDimensions } from '@/lib/formats'
import { autoEmojiForText } from '@/lib/emoji-map'

const LINE_HEIGHT_RATIO = 1.25

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function computeTransitionAlpha(
  currentTime: number,
  chunk: SubtitleChunk,
  transition: string
): { alpha: number; offsetY: number; scale: number } {
  const FADE_MS = 0.15
  const elapsed = currentTime - chunk.chunkStart
  const remaining = chunk.chunkEnd - currentTime
  let alpha = 1
  let offsetY = 0
  let scale = 1

  if (transition === 'fade' || transition === 'karaoke' || transition === 'word-by-word') {
    if (elapsed < FADE_MS) alpha = elapsed / FADE_MS
    if (remaining < FADE_MS) alpha = remaining / FADE_MS
  } else if (transition === 'slide') {
    const SLIDE_DUR = 0.2
    if (elapsed < SLIDE_DUR) {
      const t = elapsed / SLIDE_DUR
      offsetY = (1 - t) * 30
      alpha = t
    }
  } else if (transition === 'pop') {
    const POP_DUR = 0.25
    if (elapsed < POP_DUR) {
      const t = elapsed / POP_DUR
      scale = 0.8 + 0.2 * easeOutBack(t)
      alpha = Math.min(1, t * 3)
    }
  }

  return { alpha, offsetY, scale }
}

interface WordLayout {
  word: string
  timing: { start: number; end: number }
  x: number
  y: number
  width: number
}

function layoutWords(
  ctx: CanvasRenderingContext2D,
  chunk: SubtitleChunk,
  settings: EditorSettings,
  baseY: number,
  canvasW: number
): WordLayout[][] {
  const { font } = settings
  const lineMaxWidth = canvasW - 80
  const fontSize = font.size
  const fontStr = `${font.italic ? 'italic ' : ''}${font.weight} ${fontSize}px "${font.family}"`
  ctx.font = fontStr

  const lines: WordLayout[][] = []
  let currentLine: WordLayout[] = []
  let lineWidth = 0
  const spaceWidth = ctx.measureText(' ').width

  for (const w of chunk.words) {
    const text = font.uppercase ? w.word.toUpperCase() : w.word
    const wordWidth = ctx.measureText(text).width
    const needed = lineWidth === 0 ? wordWidth : wordWidth + spaceWidth

    if (lineWidth + needed > lineMaxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = []
      lineWidth = 0
    }
    currentLine.push({ word: text, timing: { start: w.start, end: w.end }, x: 0, y: 0, width: wordWidth })
    lineWidth += lineWidth === 0 ? wordWidth : wordWidth + spaceWidth
  }
  if (currentLine.length) lines.push(currentLine)

  const lineH = fontSize * LINE_HEIGHT_RATIO
  const totalH = lines.length * lineH

  lines.forEach((line, li) => {
    let totalLineW = line.reduce((s, w, i) => s + w.width + (i > 0 ? spaceWidth : 0), 0)
    let x = (canvasW - totalLineW) / 2
    const y = baseY - totalH + (li + 1) * lineH
    line.forEach((w, wi) => {
      w.x = wi === 0 ? x : x
      w.y = y
      x += w.width + spaceWidth
    })
  })

  return lines
}

function getBaseY(settings: EditorSettings, canvasH: number): number {
  const { subtitleStyle } = settings
  const pos = subtitleStyle.position
  const offset = subtitleStyle.positionOffsetY
  const margin = Math.round(180 * canvasH / 1920)

  if (pos === 'top') return Math.round(300 * canvasH / 1920) + offset
  if (pos === 'center') return canvasH / 2 + offset
  return canvasH - margin + offset
}

export function renderSubtitlesAtTime(
  canvas: HTMLCanvasElement,
  currentTime: number,
  chunks: SubtitleChunk[],
  settings: EditorSettings
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width: CANVAS_W, height: CANVAS_H } = getFormatDimensions(settings.videoFormat)
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  const chunk = chunks.find((c) => currentTime >= c.chunkStart && currentTime <= c.chunkEnd + 0.05)
  if (!chunk) return

  const { alpha, offsetY, scale } = computeTransitionAlpha(currentTime, chunk, settings.subtitleStyle.transition)
  if (alpha <= 0) return

  ctx.save()
  ctx.globalAlpha = alpha

  const { font } = settings
  const fontSize = font.size
  const fontStr = `${font.italic ? 'italic ' : ''}${font.weight} ${fontSize}px "${font.family}"`
  ctx.font = fontStr

  const baseY = getBaseY(settings, CANVAS_H) + offsetY
  const lines = layoutWords(ctx, chunk, settings, baseY, CANVAS_W)

  if (scale !== 1) {
    ctx.translate(CANVAS_W / 2, baseY)
    ctx.scale(scale, scale)
    ctx.translate(-CANVAS_W / 2, -baseY)
  }

  // Draw background box if enabled
  if (settings.subtitleStyle.background.enabled) {
    const { color, padding, borderRadius } = settings.subtitleStyle.background
    const lineH = fontSize * LINE_HEIGHT_RATIO
    const spaceW = ctx.measureText(' ').width
    lines.forEach((line) => {
      const totalW = line.reduce((s, w, i) => s + w.width + (i > 0 ? spaceW : 0), 0)
      const x = (CANVAS_W - totalW) / 2 - padding
      const y = line[0].y - fontSize - padding
      const w = totalW + padding * 2
      const h = lineH + padding * 2

      ctx.fillStyle = color
      if (borderRadius > 0) {
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, borderRadius)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, w, h)
      }
    })
  }

  // Draw words
  lines.flat().forEach((wordLayout) => {
    const isActive =
      currentTime >= wordLayout.timing.start && currentTime <= wordLayout.timing.end

    const isKaraokePast =
      settings.subtitleStyle.transition === 'karaoke' && currentTime > wordLayout.timing.end

    // Word-by-word: only show words whose start time has passed
    if (settings.subtitleStyle.transition === 'word-by-word') {
      if (currentTime < wordLayout.timing.start) return
    }

    ctx.font = fontStr

    if (font.strokeWidth > 0) {
      ctx.strokeStyle = font.strokeColor
      ctx.lineWidth = font.strokeWidth * 2
      ctx.lineJoin = 'round'
      ctx.strokeText(wordLayout.word, wordLayout.x, wordLayout.y)
    }

    let fillColor = font.color
    if (isActive && (font.highlightEffect === 'color' || font.highlightEffect === 'both')) {
      fillColor = font.highlightColor
    }
    if (isKaraokePast) {
      ctx.globalAlpha = alpha * 0.4
    }

    if (isActive && (font.highlightEffect === 'scale' || font.highlightEffect === 'both')) {
      ctx.save()
      ctx.translate(wordLayout.x + wordLayout.width / 2, wordLayout.y)
      ctx.scale(1.1, 1.1)
      ctx.fillStyle = fillColor
      ctx.fillText(wordLayout.word, -wordLayout.width / 2, 0)
      ctx.restore()
    } else {
      ctx.fillStyle = fillColor
      ctx.fillText(wordLayout.word, wordLayout.x, wordLayout.y)
    }

    if (isKaraokePast) {
      ctx.globalAlpha = alpha
    }
  })

  // Emoji overlay (auto or per-chunk override). Browser canvas renders color
  // emoji natively, so this is faithful in the preview. NOTE: burning emoji
  // into the exported MP4 is handled separately (see ass-generator / export
  // notes) because the bundled ffmpeg's libass can't draw color emoji.
  const emoji = settings.emoji
  if (emoji.enabled) {
    const override = emoji.overrides?.[chunk.id]
    const emojiStr = override || (emoji.autoGenerate ? autoEmojiForText(chunk.text) : null)
    if (emojiStr) {
      const lineH = fontSize * LINE_HEIGHT_RATIO
      const totalTextH = lines.length * lineH
      const cx = CANVAS_W / 2
      let ey: number
      if (emoji.position === 'below') ey = baseY + emoji.size * 1.1
      else if (emoji.position === 'inline') ey = baseY
      else ey = baseY - totalTextH - emoji.size * 0.2 // 'above'

      const elapsed = currentTime - chunk.chunkStart
      let scale = 1, dy = 0, rot = 0
      if (emoji.animation === 'pop' && elapsed < 0.25) {
        scale = 0.8 + 0.2 * easeOutBack(elapsed / 0.25)
      } else if (emoji.animation === 'bounce') {
        dy = -Math.abs(Math.sin(elapsed * 6)) * emoji.size * 0.15
      } else if (emoji.animation === 'spin' && elapsed < 0.5) {
        rot = (1 - elapsed / 0.5) * Math.PI * 2
      }

      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = `${emoji.size}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
      ctx.translate(cx, ey + dy)
      if (scale !== 1) ctx.scale(scale, scale)
      if (rot !== 0) ctx.rotate(rot)
      ctx.fillText(emojiStr, 0, 0)
      ctx.restore()
    }
  }

  ctx.restore()
}
