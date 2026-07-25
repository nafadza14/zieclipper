import type { SubtitleChunk, EditorSettings, SubtitleStyle } from '@/store/types'

// Parse a CSS color (#RGB, #RRGGBB, #RRGGBBAA or rgba()/rgb()) into components.
// Defensive: invalid input falls back to opaque black instead of emitting a
// malformed ASS color (commas in the Style line would corrupt the whole style).
function parseCssColor(input: string): { r: string; g: string; b: string; alpha: number } {
  const fallback = { r: '00', g: '00', b: '00', alpha: 255 }
  if (!input) return fallback

  const rgbaMatch = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (rgbaMatch) {
    const toHex = (n: string) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0').toUpperCase()
    const a = rgbaMatch[4] !== undefined ? Math.round(parseFloat(rgbaMatch[4]) * 255) : 255
    return { r: toHex(rgbaMatch[1]), g: toHex(rgbaMatch[2]), b: toHex(rgbaMatch[3]), alpha: Math.max(0, Math.min(255, a)) }
  }

  let hex = input.trim()
  if (hex.startsWith('#')) hex = hex.slice(1)
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return fallback

  return {
    r: hex.slice(0, 2).toUpperCase(),
    g: hex.slice(2, 4).toUpperCase(),
    b: hex.slice(4, 6).toUpperCase(),
    alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
  }
}

function hexToAss(color: string): string {
  // CSS color → ASS &H00BBGGRR&
  const { r, g, b } = parseCssColor(color)
  return `&H00${b}${g}${r}&`
}

function hexAlphaToAss(color: string): string {
  // CSS color with alpha → ASS &HAABBGGRR& (ASS alpha is inverted: 0x00=opaque, 0xFF=transparent)
  const { r, g, b, alpha } = parseCssColor(color)
  const assAlpha = (255 - alpha).toString(16).padStart(2, '0').toUpperCase()
  return `&H${assAlpha}${b}${g}${r}&`
}

function secondsToAssTime(sRaw: number): string {
  // Clamp negatives (libass cannot parse negative timestamps) and round to
  // centiseconds FIRST so 59.999 can't render as the invalid "0:00:60.00".
  const totalCs = Math.max(0, Math.round(sRaw * 100))
  const h = Math.floor(totalCs / 360000)
  const m = Math.floor((totalCs % 360000) / 6000)
  const cs = totalCs % 6000
  const sec = (cs / 100).toFixed(2)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(5, '0')}`
}

function t(s: number) { return secondsToAssTime(s) }

// Y pixel where the text anchor sits (matches canvas getBaseY logic).
// Used by \move and \pos tags for slide transition.
function getRenderY(subtitleStyle: SubtitleStyle): number {
  const { position, positionOffsetY } = subtitleStyle
  if (position === 'top') return Math.max(40, 180 + positionOffsetY)
  if (position === 'center') return 960 + positionOffsetY
  return 1920 - Math.max(40, 180 - positionOffsetY)
}

// Returns the ASS inline override prefix for a segment within a chunk.
// segStart/segEnd are used to cap fade durations so short per-word events
// (100–400 ms) stay mostly visible rather than spending all their life fading.
function segmentPrefix(
  transition: string,
  isFirst: boolean,
  isLast: boolean,
  segStart: number,
  segEnd: number,
  renderY: number
): string {
  // Cap fade to 40 % of event duration so short events stay visible.
  const durMs = Math.max(50, Math.round((segEnd - segStart) * 1000))
  const maxFade = Math.floor(durMs * 0.4)

  switch (transition) {
    case 'fade':
    case 'word-by-word':
    case 'karaoke': {
      const fi = isFirst ? Math.min(150, maxFade) : 0
      const fo = isLast  ? Math.min(150, maxFade) : 0
      return (fi || fo) ? `{\\fad(${fi},${fo})}` : ''
    }
    case 'slide': {
      const moveDur = Math.min(200, durMs)
      const fadeDur = Math.min(150, maxFade)
      if (isFirst) return `{\\move(540,${renderY + 30},540,${renderY},0,${moveDur})\\fad(${fadeDur},0)}`
      return `{\\pos(540,${renderY})}`
    }
    case 'pop': {
      if (!isFirst) return ''
      // \t(t1,t2,tags) — no accel arg; 3-arg form is universally supported by libass.
      // Also add \fad so there is a visible animation even if \t is somehow skipped.
      const animDur = Math.min(250, durMs)
      const fadeDur = Math.min(100, maxFade)
      return `{\\fscx80\\fscy80\\t(0,${animDur},\\fscx100\\fscy100)\\fad(${fadeDur},0)}`
    }
    default:
      return ''
  }
}

export function generateAssFile(chunks: SubtitleChunk[], settings: EditorSettings, _clipDuration: number): string {
  const { font, subtitleStyle } = settings
  const transition = subtitleStyle.transition
  const bg = subtitleStyle.background

  let alignment = 2
  if (subtitleStyle.position === 'top') alignment = 8
  else if (subtitleStyle.position === 'center') alignment = 5

  const marginV = subtitleStyle.position === 'bottom'
    ? Math.max(40, 180 - subtitleStyle.positionOffsetY)
    : subtitleStyle.position === 'top'
    ? Math.max(40, 180 + subtitleStyle.positionOffsetY)
    : 0

  const primaryColor = hexToAss(font.color)
  const highlightColor = hexToAss(font.highlightColor)
  const outlineColor = hexToAss(font.strokeColor)
  const bold = font.weight === '700' || font.weight === '800' || font.weight === '900' ? -1 : 0
  const italic = font.italic ? -1 : 0
  const useHighlightColor = font.highlightEffect === 'color' || font.highlightEffect === 'both'
  const useHighlightScale = font.highlightEffect === 'scale' || font.highlightEffect === 'both'
  const usePerWordHighlight = useHighlightColor || useHighlightScale
  const renderY = getRenderY(subtitleStyle)

  const defaultStyle = `Style: Default,${font.family},${font.size},${primaryColor},${highlightColor},${outlineColor},&H00000000,${bold},${italic},0,0,100,100,0,0,1,${font.strokeWidth},0,${alignment},40,40,${marginV},1`

  // Background box style: BorderStyle=3 makes libass draw an opaque box behind text.
  // Outline acts as padding in this mode. PrimaryColour is fully transparent so only the box renders.
  // NOTE: with BorderStyle=3 libass fills the box with the OUTLINE colour (BackColour is
  // only used for the shadow), so the bg colour must go in the OutlineColour field.
  let bgStyle = ''
  if (bg.enabled) {
    const bgColor = hexAlphaToAss(bg.color)
    bgStyle = `\nStyle: StyleBg,${font.family},${font.size},&HFF000000&,&HFF000000&,${bgColor},&HFF000000&,${bold},${italic},0,0,100,100,0,0,3,${Math.max(1, bg.padding)},0,${alignment},40,40,${marginV},1`
  }

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${defaultStyle}${bgStyle}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const events: string[] = []

  for (const chunk of chunks) {
    const wordTexts = chunk.words.map(w => font.uppercase ? w.word.toUpperCase() : w.word)

    // Background box event: single event spanning the full chunk, layer 0.
    // Transparent text means only the box is visible; constant size matches canvas per-line box.
    if (bg.enabled) {
      const bgText = font.uppercase ? chunk.text.toUpperCase() : chunk.text
      const durMs = Math.max(50, Math.round((chunk.chunkEnd - chunk.chunkStart) * 1000))
      const fi = Math.min(150, Math.floor(durMs * 0.4))
      const fo = Math.min(150, Math.floor(durMs * 0.4))
      const bgPrefix = (fi || fo) ? `{\\fad(${fi},${fo})}` : ''
      events.push(`Dialogue: 0,${t(chunk.chunkStart)},${t(chunk.chunkEnd)},StyleBg,,0,0,0,,${bgPrefix}${bgText}`)
    }

    // Text events run on layer 1 when background is present so they render on top.
    const textLayer = bg.enabled ? 1 : 0

    // Build raw segments first (no transition prefix yet), then attach prefixes.
    type Seg = { start: number; end: number; text: string }
    const segs: Seg[] = []

    if (transition === 'karaoke') {
      // Match canvas karaoke: fade in/out for whole chunk, past words dimmed to 40% opacity,
      // active word highlighted, future words at full opacity.
      // ASS alpha: &H99& ≈ 60% transparent = 40% visible (matches canvas globalAlpha * 0.4)
      const DIM = '&H99&'
      const FULL = '&H00&'

      const buildKaraokeText = (activeIdx: number | null, pastCount: number): string => {
        return wordTexts.map((w, j) => {
          if (j < pastCount) {
            return `{\\alpha${DIM}}${w}{\\alpha${FULL}}`
          }
          if (j === activeIdx) {
            let openTags = ''
            let closeTags = ''
            if (useHighlightColor) { openTags += `\\c${highlightColor}`; closeTags += `\\c${primaryColor}` }
            if (useHighlightScale) { openTags += `\\fscx110\\fscy110`; closeTags += `\\fscx100\\fscy100` }
            return openTags ? `{${openTags}}${w}{${closeTags}}` : w
          }
          return w
        }).join(' ')
      }

      let prevEnd = chunk.chunkStart
      for (let i = 0; i < chunk.words.length; i++) {
        const wordStart = Math.max(chunk.chunkStart, chunk.words[i].start)
        const wordEnd = Math.min(chunk.chunkEnd, chunk.words[i].end)
        if (wordEnd <= wordStart) continue

        if (wordStart - prevEnd > 0.01) {
          segs.push({ start: prevEnd, end: wordStart, text: buildKaraokeText(null, i) })
        }
        segs.push({ start: wordStart, end: wordEnd, text: buildKaraokeText(i, i) })
        prevEnd = wordEnd
      }

      if (chunk.chunkEnd - prevEnd > 0.01) {
        segs.push({ start: prevEnd, end: chunk.chunkEnd, text: buildKaraokeText(null, chunk.words.length) })
      }

    } else if (transition === 'word-by-word') {
      let prevEnd = chunk.chunkStart
      for (let i = 0; i < chunk.words.length; i++) {
        const wordStart = Math.max(chunk.chunkStart, chunk.words[i].start)
        const wordEnd = Math.min(chunk.chunkEnd, chunk.words[i].end)
        if (wordEnd <= wordStart) continue

        // Gap between previous word's end and this word's start (skip before first word)
        if (i > 0 && wordStart - prevEnd > 0.01) {
          segs.push({ start: prevEnd, end: wordStart, text: wordTexts.slice(0, i).join(' ') })
        }

        // Active word window: accumulated words with current word highlighted
        const parts = wordTexts.slice(0, i + 1).map((w, j) => {
          if (j !== i) return w
          let openTags = ''
          let closeTags = ''
          if (useHighlightColor) { openTags += `\\c${highlightColor}`; closeTags += `\\c${primaryColor}` }
          if (useHighlightScale) { openTags += `\\fscx110\\fscy110`; closeTags += `\\fscx100\\fscy100` }
          return openTags ? `{${openTags}}${w}{${closeTags}}` : w
        })
        segs.push({ start: wordStart, end: wordEnd, text: parts.join(' ') })
        prevEnd = wordEnd
      }

      // Trailing gap from last word's end to chunkEnd
      if (chunk.chunkEnd - prevEnd > 0.01) {
        segs.push({ start: prevEnd, end: chunk.chunkEnd, text: wordTexts.join(' ') })
      }

    } else if (usePerWordHighlight && chunk.words.length > 0) {
      // One segment per word's active window; gaps filled with plain text
      let prevTime = chunk.chunkStart
      const plainText = wordTexts.join(' ')

      for (let i = 0; i < chunk.words.length; i++) {
        const wordStart = Math.max(chunk.chunkStart, chunk.words[i].start)
        const wordEnd = Math.min(chunk.chunkEnd, chunk.words[i].end)
        if (wordEnd <= wordStart) continue

        if (wordStart - prevTime > 0.01) {
          segs.push({ start: prevTime, end: wordStart, text: plainText })
        }

        const parts = wordTexts.map((w, j) => {
          if (j !== i) return w
          let openTags = ''
          let closeTags = ''
          if (useHighlightColor) { openTags += `\\c${highlightColor}`; closeTags += `\\c${primaryColor}` }
          if (useHighlightScale) { openTags += `\\fscx110\\fscy110`; closeTags += `\\fscx100\\fscy100` }
          return openTags ? `{${openTags}}${w}{${closeTags}}` : w
        })
        segs.push({ start: wordStart, end: wordEnd, text: parts.join(' ') })
        prevTime = wordEnd
      }

      if (chunk.chunkEnd - prevTime > 0.01) {
        segs.push({ start: prevTime, end: chunk.chunkEnd, text: plainText })
      }

    } else {
      const text = font.uppercase ? chunk.text.toUpperCase() : chunk.text
      segs.push({ start: chunk.chunkStart, end: chunk.chunkEnd, text })
    }

    // Attach transition prefixes based on each segment's position in the chunk
    for (let si = 0; si < segs.length; si++) {
      const { start, end, text } = segs[si]
      const prefix = segmentPrefix(transition, si === 0, si === segs.length - 1, start, end, renderY)
      events.push(`Dialogue: ${textLayer},${t(start)},${t(end)},Default,,0,0,0,,${prefix}${text}`)
    }
  }

  return [header, ...events].join('\n')
}
