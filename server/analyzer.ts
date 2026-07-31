import { callTool, type ToolDefinition } from './llm-client'
import type { WordTiming, ClipSuggestion } from '@/store/types'

const TOOL_DEFINITION: ToolDefinition = {
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
            end_time: { type: 'number', description: 'End time in seconds. The clip duration (end_time - start_time) MUST be between 30.0 and 60.0 seconds. Do not exceed 60.0 seconds under any circumstances.' },
            title: { type: 'string', description: 'Catchy short title for this clip' },
            hook: { type: 'string', description: 'The opening hook sentence that grabs attention' },
            score: { type: 'integer', minimum: 1, maximum: 10, description: 'Viral potential score' },
            reasons: { type: 'array', items: { type: 'string' }, description: '2-4 reasons why this moment is viral' },
            clip_type: { type: 'string', enum: ['educational', 'funny', 'emotional', 'controversial', 'story', 'other'] },
          },
          required: ['start_time', 'end_time', 'title', 'hook', 'score', 'reasons', 'clip_type'],
        },
        minItems: 3,
        maxItems: 10,
      },
    },
    required: ['clips'],
  },
}

const SYSTEM_PROMPT = `You are an expert viral content analyst specializing in YouTube Shorts.
Given a transcript with timestamps, identify the 5-8 best moments for YouTube Shorts.

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
): Promise<ClipSuggestion[]> {
  const transcriptText = formatTranscript(words)
  const system = SYSTEM_PROMPT +
    '\n\nIMPORTANT: Write all titles, hooks, and reasons in the SAME language as the transcript. ' +
    'For example, if the transcript is in Indonesian, you MUST write the titles, hooks, and reasons in Indonesian. ' +
    'Do NOT write in English unless the transcript itself is in English.'
  const userMsg = `Find the best viral moments in this transcript:\n\n${transcriptText}`

  const result = await callTool(provider, model, system, userMsg, TOOL_DEFINITION, 'suggest_viral_clips')
  return (result.clips ?? []) as ClipSuggestion[]
}
