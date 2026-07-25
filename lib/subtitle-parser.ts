import type { WordTiming, SubtitleChunk, SubtitleStyle } from '@/store/types'

export function parseChunks(words: WordTiming[], style: SubtitleStyle): SubtitleChunk[] {
  if (!words.length) return []

  const chunks: SubtitleChunk[] = []
  let i = 0
  let chunkId = 0

  while (i < words.length) {
    let group: WordTiming[] = []

    if (style.splitMode === 'byWordCount') {
      group = words.slice(i, i + style.splitValue)
      i += style.splitValue
    } else if (style.splitMode === 'byCharCount') {
      let charCount = 0
      while (i < words.length) {
        const w = words[i]
        if (charCount + w.word.length > style.splitValue && group.length > 0) break
        group.push(w)
        charCount += w.word.length + 1
        i++
      }
    } else {
      // bySentence: split on punctuation
      while (i < words.length) {
        const w = words[i]
        group.push(w)
        i++
        if (/[.!?,;]$/.test(w.word)) break
      }
    }

    if (group.length === 0) break

    chunks.push({
      id: chunkId++,
      words: group,
      chunkStart: group[0].start,
      chunkEnd: group[group.length - 1].end,
      text: group.map((w) => w.word).join(' '),
    })
  }

  return chunks
}
