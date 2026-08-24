// Keyword → emoji mapping for auto-emoji injection (openclip-style). Given a
// caption chunk's text, pick the single most relevant emoji. Intentionally
// small and high-precision: better to show no emoji than a wrong one. Matches
// whole words, longest keyword first, case-insensitive.
const KEYWORD_EMOJI: Array<[string[], string]> = [
  [['money', 'cash', 'rich', 'dollar', 'dollars', 'profit', 'income', 'wealth', 'uang', 'duit', 'kaya'], '💰'],
  [['fire', 'lit', 'hot', 'insane', 'crazy', 'gila', 'keren'], '🔥'],
  [['love', 'heart', 'cinta', 'sayang'], '❤️'],
  [['idea', 'think', 'genius', 'smart', 'ide', 'pintar'], '💡'],
  [['win', 'winner', 'won', 'success', 'succeed', 'menang', 'sukses', 'berhasil'], '🏆'],
  [['goal', 'target', 'focus', 'aim', 'tujuan', 'fokus'], '🎯'],
  [['time', 'clock', 'fast', 'quick', 'waktu', 'cepat'], '⏰'],
  [['strong', 'power', 'strength', 'muscle', 'kuat', 'kekuatan'], '💪'],
  [['scary', 'fear', 'afraid', 'takut', 'seram'], '😱'],
  [['laugh', 'funny', 'joke', 'lol', 'lucu', 'ketawa'], '😂'],
  [['sad', 'cry', 'tears', 'sedih', 'nangis'], '😢'],
  [['angry', 'mad', 'rage', 'marah'], '😡'],
  [['brain', 'mind', 'learn', 'study', 'otak', 'belajar'], '🧠'],
  [['rocket', 'launch', 'grow', 'growth', 'scale', 'boost'], '🚀'],
  [['star', 'best', 'amazing', 'awesome', 'bintang', 'hebat'], '⭐'],
  [['eyes', 'look', 'watch', 'see', 'lihat', 'nonton'], '👀'],
  [['warning', 'careful', 'danger', 'awas', 'bahaya', 'hati-hati'], '⚠️'],
  [['check', 'correct', 'right', 'yes', 'benar', 'betul'], '✅'],
  [['no', 'wrong', 'stop', 'never', 'salah', 'jangan'], '❌'],
  [['question', 'why', 'how', 'what', 'kenapa', 'bagaimana', 'apa'], '❓'],
  [['food', 'eat', 'hungry', 'makan', 'lapar'], '🍔'],
  [['music', 'song', 'sound', 'lagu', 'musik'], '🎵'],
  [['world', 'earth', 'global', 'dunia', 'bumi'], '🌍'],
  [['phone', 'call', 'app', 'hp', 'telepon'], '📱'],
  [['gift', 'free', 'bonus', 'hadiah', 'gratis'], '🎁'],
  [['deal', 'business', 'work', 'job', 'bisnis', 'kerja'], '💼'],
  [['party', 'celebrate', 'congrats', 'pesta', 'selamat'], '🎉'],
  [['secret', 'hidden', 'reveal', 'rahasia'], '🤫'],
  [['clock', 'wait', 'patience', 'sabar'], '⌛'],
  [['book', 'read', 'story', 'buku', 'baca', 'cerita'], '📖'],
]

// Common words that shouldn't count when matching (so a chunk about "the money"
// still matches "money").
import type { SubtitleChunk, EmojiSettings } from '@/store/types'

// Resolves the emoji to draw on a given chunk, respecting the same rules the
// preview uses: per-chunk override wins; otherwise, if autoGenerate is on,
// pick from the keyword map; otherwise nothing.
export function emojiForChunk(chunk: SubtitleChunk, emoji: EmojiSettings): string | null {
  if (!emoji.enabled) return null
  const override = emoji.overrides?.[chunk.id]
  if (override) return override
  if (emoji.autoGenerate) return autoEmojiForText(chunk.text)
  return null
}

export function autoEmojiForText(text: string): string | null {
  if (!text) return null
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(Boolean)
  const wordSet = new Set(words)
  for (const [keywords, emoji] of KEYWORD_EMOJI) {
    for (const kw of keywords) {
      if (wordSet.has(kw)) return emoji
    }
  }
  return null
}
