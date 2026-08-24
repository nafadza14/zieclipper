import fs from 'fs'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { parseLooseJson } from './json-repair'

// Ask a vision-capable LLM where the primary speaker's face is horizontally
// in one frame. Returns a fraction 0..1 (0 = far left, 1 = far right). On
// any error or ambiguity, returns 0.5 (center) so the caller can safely
// fall through to a centered crop instead of aborting the whole export.
//
// Kept provider-agnostic: uses the same 4 providers as server/llm-client.ts.
// Sumopod/DeepSeek/Gemini all expose an OpenAI-compatible endpoint that
// accepts the image_url message part; Anthropic uses its native SDK with a
// base64 image content block.
const SYSTEM = 'You are a video framing assistant. Given a single video frame, identify the primary speaker or main visual subject and report where their face/head is horizontally in the frame. Reply with ONLY a JSON object: {"x":<number between 0 and 1>} where 0.0 means far left, 0.5 center, 1.0 far right. If there is no clear face, respond with {"x":0.5}. No explanation.'

const USER = 'Where is the primary speaker\'s face horizontally in this frame? JSON only: {"x": 0..1}'

function extractX(raw: string): number {
  if (!raw) return 0.5
  // Try loose JSON first -- handles the "here is the JSON: {...}" case cleanly.
  try {
    const obj = parseLooseJson(raw)
    const v = typeof obj === 'object' && obj && typeof obj.x === 'number' ? obj.x : null
    if (v !== null && Number.isFinite(v)) return Math.max(0, Math.min(1, v))
  } catch {}
  // Regex fallback for even messier output.
  const m = raw.match(/"x"\s*:\s*(-?\d+(?:\.\d+)?)/)
  if (!m) {
    const n = parseFloat(raw.trim())
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n))
    return 0.5
  }
  const v = parseFloat(m[1])
  if (!Number.isFinite(v)) return 0.5
  return Math.max(0, Math.min(1, v))
}

export async function detectFaceX(
  pngPath: string,
  provider: string,
  model: string,
): Promise<number> {
  try {
    const buf = fs.readFileSync(pngPath)
    const b64 = buf.toString('base64')

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const resp = await client.messages.create({
        model,
        max_tokens: 40,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
            { type: 'text', text: USER },
          ],
        }],
        system: SYSTEM,
      })
      const block = resp.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined
      return extractX(block?.text || '')
    }

    // OpenAI-compatible path (sumopod, deepseek, gemini, openai)
    let client: OpenAI
    if (provider === 'deepseek') {
      client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })
    } else if (provider === 'sumopod') {
      client = new OpenAI({
        apiKey: process.env.SUMOPOD_API_KEY || 'sk-LH238LuYeE77a-8IVxxQdg',
        baseURL: 'https://ai.sumopod.com/v1',
      })
    } else if (provider === 'openai') {
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    } else {
      client = new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      })
    }

    const resp = await client.chat.completions.create({
      model,
      max_tokens: 40,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ] as any,
        },
      ],
    })
    return extractX(resp.choices[0]?.message?.content || '')
  } catch {
    // Any failure -> center (0.5). We prefer a boring correct crop to a
    // failed export.
    return 0.5
  }
}
