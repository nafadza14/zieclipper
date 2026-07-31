import { callTool, type ToolDefinition } from './llm-client'

const TOOL: ToolDefinition = {
  name: 'generate_youtube_metadata',
  description: 'Generate optimized YouTube Shorts title, description, and tags',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Attention-grabbing YouTube Shorts title. Max 60 chars. No clickbait but compelling. No emojis unless natural.' },
      description: { type: 'string', description: 'YouTube description: 2-3 sentences summarizing the short. Include a call-to-action. End with relevant hashtags on new lines (5-8 hashtags like #Shorts #YouTube etc).' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'YouTube tags. Mix of broad (1-2 words) and specific (3-5 words). No # prefix. IMPORTANT: all tags joined with commas must be 500 characters or fewer total.',
        minItems: 10,
        maxItems: 30,
      },
    },
    required: ['title', 'description', 'tags'],
  },
}

const SYSTEM = `You are a YouTube Shorts growth expert. Generate metadata that maximizes discoverability and CTR.
Title rules: clear, specific, under 60 chars, front-load the key hook, no ALL CAPS.
Description rules: first sentence is the hook, mention value clearly, end with 5-8 relevant hashtags.
Tags rules: mix broad and niche, include the topic, related subtopics, and common search terms.`

export interface MetadataRequest {
  clip_title: string
  hook: string
  clip_type: string
  reasons: string[]
  transcript_excerpt: string
  model: string
  provider: string
  language: string
}

export interface MetadataResult {
  title: string
  description: string
  tags: string[]
}

export async function generateMetadata(req: MetadataRequest): Promise<MetadataResult> {
  const prompt = `Create YouTube Shorts metadata for this clip. Write ALL output (title, description, tags) in ${req.language}.

Title: ${req.clip_title}
Hook: ${req.hook}
Type: ${req.clip_type}
Why it's viral: ${req.reasons.join(', ')}

Transcript excerpt:
${req.transcript_excerpt}`

  const d = await callTool(req.provider, req.model, SYSTEM, prompt, TOOL, 'generate_youtube_metadata', 1024)

  const tags: string[] = d.tags ?? []
  const trimmed: string[] = []
  let total = 0
  for (const tag of tags) {
    const needed = tag.length + (trimmed.length ? 1 : 0)
    if (total + needed > 500) break
    trimmed.push(tag)
    total += needed
  }

  return { title: d.title, description: d.description, tags: trimmed }
}
