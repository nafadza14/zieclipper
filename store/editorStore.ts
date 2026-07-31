'use client'
import { create } from 'zustand'
import type {
  WordTiming, SubtitleChunk, ClipSuggestion, EditorSettings,
  SubtitleStyle, FontSettings, EmojiSettings, CropSettings, TrimSettings, VideoFormat
} from './types'
import { SUBTITLE_PRESETS, DEFAULT_SETTINGS } from '@/components/editor/presets/SubtitlePresets'
import { parseChunks } from '@/lib/subtitle-parser'

interface EditorState {
  jobId: string | null
  clipIndex: number | null
  clip: ClipSuggestion | null
  transcript: WordTiming[]
  subtitleChunks: SubtitleChunk[]
  settings: EditorSettings

  setJob: (jobId: string, clipIndex: number, clip: ClipSuggestion, transcript: WordTiming[]) => void
  applyPreset: (presetName: string) => void
  updateSubtitleStyle: (partial: Partial<SubtitleStyle>) => void
  updateFont: (partial: Partial<FontSettings>) => void
  updateEmoji: (partial: Partial<EmojiSettings>) => void
  updateCrop: (partial: Partial<CropSettings>) => void
  updateTrim: (partial: Partial<TrimSettings>) => void
  updateFormat: (format: VideoFormat) => void
  updateSubtitleChunkText: (id: number, text: string) => void
  setSubtitleOffset: (ms: number) => void
  setEmojiOverride: (chunkIdx: number, emoji: string) => void
  recomputeChunks: () => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  jobId: null,
  clipIndex: null,
  clip: null,
  transcript: [],
  subtitleChunks: [],
  settings: DEFAULT_SETTINGS,

  setJob: (jobId, clipIndex, clip, transcript) => {
    const settings = { ...DEFAULT_SETTINGS, trim: { start: 0, end: clip.end_time - clip.start_time } }
    const subtitleChunks = parseChunks(transcript, settings.subtitleStyle)
    set({ jobId, clipIndex, clip, transcript, settings, subtitleChunks })
  },

  applyPreset: (presetName) => {
    const preset = SUBTITLE_PRESETS[presetName]
    if (!preset) return
    set((state) => {
      const settings = {
        ...state.settings,
        subtitleStyle: { ...preset.subtitleStyle },
        font: { ...preset.font },
        emoji: { ...preset.emoji },
      }
      return { settings, subtitleChunks: parseChunks(state.transcript, settings.subtitleStyle) }
    })
  },

  updateSubtitleStyle: (partial) => {
    set((state) => {
      const subtitleStyle = { ...state.settings.subtitleStyle, ...partial }
      const settings = { ...state.settings, subtitleStyle }
      const subtitleChunks = parseChunks(state.transcript, subtitleStyle)
      return { settings, subtitleChunks }
    })
  },

  updateFont: (partial) => {
    set((state) => ({
      settings: { ...state.settings, font: { ...state.settings.font, ...partial } },
    }))
  },

  updateEmoji: (partial) => {
    set((state) => ({
      settings: { ...state.settings, emoji: { ...state.settings.emoji, ...partial } },
    }))
  },

  updateCrop: (partial) => {
    set((state) => ({
      settings: { ...state.settings, crop: { ...state.settings.crop, ...partial } },
    }))
  },

  updateTrim: (partial) => {
    set((state) => ({
      settings: { ...state.settings, trim: { ...state.settings.trim, ...partial } },
    }))
  },

  updateFormat: (format) => {
    set((state) => ({ settings: { ...state.settings, videoFormat: format } }))
  },

  updateSubtitleChunkText: (id, text) => {
    set((state) => {
      const subtitleChunks = state.subtitleChunks.map((chunk) => {
        if (chunk.id !== id) return chunk

        // Split new text by whitespace
        const newWordsText = text.trim().split(/\s+/)
        const origWords = chunk.words

        let updatedWords = []
        if (newWordsText.length === origWords.length) {
          updatedWords = origWords.map((w, idx) => ({
            ...w,
            word: newWordsText[idx]
          }))
        } else {
          const chunkDur = chunk.chunkEnd - chunk.chunkStart
          const wordDur = chunkDur / Math.max(1, newWordsText.length)
          updatedWords = newWordsText.map((word, idx) => ({
            word,
            start: chunk.chunkStart + idx * wordDur,
            end: chunk.chunkStart + (idx + 1) * wordDur
          }))
        }

        return { ...chunk, text, words: updatedWords }
      })
      return { subtitleChunks }
    })
  },

  setSubtitleOffset: (ms) => {
    set((state) => ({
      settings: { ...state.settings, subtitleOffsetMs: ms },
    }))
  },

  setEmojiOverride: (chunkIdx, emoji) => {
    set((state) => ({
      settings: {
        ...state.settings,
        emoji: {
          ...state.settings.emoji,
          overrides: { ...state.settings.emoji.overrides, [chunkIdx]: emoji },
        },
      },
    }))
  },

  recomputeChunks: () => {
    const { transcript, settings } = get()
    set({ subtitleChunks: parseChunks(transcript, settings.subtitleStyle) })
  },
}))
