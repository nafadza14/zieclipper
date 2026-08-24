import { callTool, type ToolDefinition } from './llm-client'
import type { WordTiming, ClipSuggestion } from '@/store/types'

// UPDATED (Aug 2026): Match Klipaja.id cost model — 3 clips per video by
// default. This is a 4-8x reduction from the old 12-30 range, which cuts:
//   • LLM tokens spent (analyzer runs 4x faster + cheaper)
//   • Storage cost (fewer clips stored)
//   • Editor render load (fewer thumbnails to generate)
//
// Users on Max/Ultra tier can request 6 clips per video via the
// clip_count param on /api/download — see PRO_CLIPS_PER_VIDEO in
// credits.ts. This keeps our unit COGS in line with the Rp 200-633 per
// clip pricing tiers.
const DEFAULT_CLIPS = 3
const PRO_CLIPS = 6

// Scale target count by video duration. Kept tight around the defaults
// so the LLM doesn't overshoot — with clips this scarce, one bad hook
// hurts more than in the old 12-clip world.
function clipCountRange(durationSec: number, allowPro = false): { min: number; max: number } {
  const target = allowPro ? PRO_CLIPS : DEFAULT_CLIPS
  const mins = durationSec / 60
  // Very short videos (< 5 min) may not yield the full target; give the
  // LLM a small floor so it still returns something usable.
  if (mins < 5) return { min: Math.max(2, target - 1), max: target }
  // Everything else gets exactly the target — no scaling by duration
  // because we're now charging by video, not by clip.
  return { min: target, max: target + 1 }
}

// Kept for backwards-compat with callers that import MIN_CLIPS to display
// the "target count" in progress UI. Points at the new default.
const MIN_CLIPS = DEFAULT_CLIPS

function buildToolDefinition(minItems: number, maxItems: number): ToolDefinition {
  return {
    name: 'suggest_viral_clips',
    description: 'Suggest the best viral YouTube Shorts clips from a transcript',
    input_schema: {
      type: 'object',
      properties: {
        clips: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              start_time: { type: 'number', description: 'Start time in seconds at the beginning of the hook sentence.' },
              end_time:   { type: 'number', description: 'End time in seconds. Duration (end_time - start_time) MUST be between 30.0 and 60.0 seconds.' },
              title:      { type: 'string', description: 'Catchy short title for this clip' },
              hook:       { type: 'string', description: 'The opening hook sentence that grabs attention' },
              score:      { type: 'integer', minimum: 1, maximum: 10, description: 'Viral potential score' },
              reasons:    { type: 'array', items: { type: 'string' }, description: '2-4 reasons why this moment is viral' },
              clip_type:  { type: 'string', enum: ['educational', 'funny', 'emotional', 'controversial', 'story', 'other'] },
            },
            required: ['start_time', 'end_time', 'title', 'hook', 'score', 'reasons', 'clip_type'],
          },
          minItems, maxItems,
        },
      },
      required: ['clips'],
    },
  }
}

const SYSTEM_PROMPT_BASE = `You are an expert viral content analyst specializing in YouTube Shorts.
Given a transcript with timestamps, identify the best moments for YouTube Shorts.

CRITICAL HOOK RULES:
- The hook is the most important part of a Short. It MUST be the first 1-3 seconds of the clip (starting precisely at start_time).
- The hook must start at a clean, high-retention starting sentence. Do NOT start mid-phrase or mid-word.
- The hook MUST be highly engaging, shocking, mysterious, or a direct promise/question that forces the viewer to keep watching.
- Ensure the start_time matches exactly when the speaker starts saying the hook phrase.

CRITICAL DURATION RULES:
- Each clip duration (end_time - start_time) MUST be between 30 and 60 seconds long (maximum length of YouTube Shorts is 60s).
- NEVER suggest clips shorter than 30 seconds.
- Ensure the start_time and end_time range spans a duration of at least 30 seconds and at most 60 seconds.

Rules:
- Prioritize: strong hooks, emotional moments, surprising facts, humor, controversy, clear story arcs
- The clip must make sense on its own without prior context
- Score 8-10: likely to go viral. Score 5-7: good content. Score 1-4: average.
- Vary clip types for diversity`

function formatTranscript(words: WordTiming[]): string {
  const lines: string[] = []
  let chunk: string[] = []
  let chunkStart = 0

  words.forEach((w, i) => {
    if (chunk.length === 0) chunkStart = w.start
    chunk.push(w.word)

    if (chunk.length >= 10 || i === words.length - 1) {
      lines.push(`[${chunkStart.toFixed(1)}s - ${w.end.toFixed(1)}s] ${chunk.join(' ')}`)
      chunk = []
    }
  })

  return lines.join('\n')
}

export async function analyzeTranscript(
  words: WordTiming[],
  model: string,
  provider: string,
  language = 'English',
  targetDuration = 'auto',
  videoDurationSec?: number,
  allowProClips = false,
): Promise<ClipSuggestion[]> {
  const dur = videoDurationSec && videoDurationSec > 0
    ? videoDurationSec
    : (words.length ? words[words.length - 1].end : 300)

  const { min, max } = clipCountRange(dur, allowProClips)
  const tool = buildToolDefinition(min, max)

  const transcriptText = formatTranscript(words)
  const system = SYSTEM_PROMPT_BASE +
    `\n\nOUTPUT SIZE: Suggest between ${min} and ${max} clips. Aim for at least ${min}.` +
    '\n\nIMPORTANT: Write all titles, hooks, and reasons in the SAME language as the transcript. ' +
    'For example, if the transcript is in Indonesian, you MUST write the titles, hooks, and reasons in Indonesian. ' +
    'Do NOT write in English unless the transcript itself is in English.'
  const userMsg = `Find the best viral moments in this transcript:\n\n${transcriptText}`

  // Bigger token budget for larger clip lists (each clip ~150-250 tokens
  // in the tool output; 30 clips × 200 = 6k tokens, plus JSON overhead).
  const maxTokens = Math.max(8192, max * 400)

  const result = await callTool(provider, model, system, userMsg, tool, 'suggest_viral_clips', maxTokens)
  const clips = (result.clips ?? []) as ClipSuggestion[]

  // Post-process: sort by score DESC so downstream UIs get the best-first
  // ordering regardless of how the model returned them. Stable when scores
  // tie (uses start_time as tiebreaker for reproducibility).
  return [...clips].sort((a, b) => (b.score - a.score) || (a.start_time - b.start_time))
}

// Convenience re-export so callers can display the target count in the
// progress UI without importing MIN_CLIPS separately.
export { MIN_CLIPS }
