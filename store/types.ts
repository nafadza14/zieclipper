export interface WordTiming {
  word: string
  start: number
  end: number
  confidence?: number
}

export interface SubtitleChunk {
  id: number
  words: WordTiming[]
  chunkStart: number
  chunkEnd: number
  text: string
  emoji?: string
}

export interface ClipSuggestion {
  start_time: number
  end_time: number
  title: string
  hook: string
  score: number
  reasons: string[]
  clip_type: 'educational' | 'funny' | 'emotional' | 'controversial' | 'story' | 'other'
}

export interface SubtitleOption {
  code: string
  name: string
  is_generated: boolean
  vttPath?: string
}

export interface Job {
  id: string
  status: 'downloading' | 'transcribing' | 'analyzing' | 'ready' | 'error'
  url: string
  title?: string
  duration?: number
  thumbnailUrl?: string
  videoPath?: string
  transcript?: WordTiming[]
  clips?: ClipSuggestion[]
  error?: string
  model?: string
  provider?: string
  availableSubtitles?: SubtitleOption[]
  activeSubtitleLang?: string
}

export interface ExportJob {
  id: string
  jobId: string
  clipIndex: number
  status: 'processing' | 'done' | 'error'
  progress: number
  outputPath?: string
  error?: string
}

export type SubtitleTransition = 'fade' | 'slide' | 'pop' | 'karaoke' | 'word-by-word' | 'none'
export type SplitMode = 'byWordCount' | 'byCharCount' | 'bySentence'
export type SubtitlePosition = 'top' | 'center' | 'bottom'
export type HighlightEffect = 'color' | 'scale' | 'both'
export type EmojiPosition = 'above' | 'below' | 'inline'
export type EmojiAnimation = 'none' | 'bounce' | 'pop' | 'spin'
export type CropBackground = 'blur' | 'black' | 'color'

export interface SubtitleStyle {
  preset: string
  transition: SubtitleTransition
  splitMode: SplitMode
  splitValue: number
  position: SubtitlePosition
  positionOffsetY: number
  background: {
    enabled: boolean
    color: string
    padding: number
    borderRadius: number
  }
}

export interface FontSettings {
  family: string
  size: number
  weight: '400' | '700' | '800' | '900'
  color: string
  strokeColor: string
  strokeWidth: number
  highlightColor: string
  highlightEffect: HighlightEffect
  uppercase: boolean
  italic: boolean
}

export interface EmojiSettings {
  enabled: boolean
  position: EmojiPosition
  size: number
  animation: EmojiAnimation
  autoGenerate: boolean
  overrides: Record<number, string>
}

export interface CropSettings {
  x: number
  width: number
  background: CropBackground
  backgroundColor: string
  style: 'fill' | 'fit'
  startOffset: number
  endOffset: number
}

export interface TrimSettings {
  start: number
  end: number
}

export interface EditorSettings {
  subtitleStyle: SubtitleStyle
  font: FontSettings
  emoji: EmojiSettings
  crop: CropSettings
  trim: TrimSettings
  subtitleOffsetMs: number
}
