import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { parseLooseJson } from './json-repair'

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// Ported from the old api/services/llm_client.py -- same forced-tool-use
// pattern, same provider list, running in-process instead of over HTTP to
// a separate FastAPI service (there's no longer a separate service to call).
//
// maxTokens default bumped from 4096 to 8192 because the analyzer routinely
// emits 4-8 clips × {title, hook, reasons[], ...} which was hitting the old
// cap and truncating the JSON mid-object -- the classic "Expected ':' after
// property name" JSON.parse error.
export async function callTool(
  provider: string,
  model: string,
  system: string,
  userMsg: string,
  toolDef: ToolDefinition,
  toolName: string,
  maxTokens = 8192,
): Promise<any> {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
      tools: [toolDef as any],
      tool_choice: { type: 'tool', name: toolName },
    })
    for (const block of resp.content) {
      if (block.type === 'tool_use' && block.name === toolName) return block.input
    }
    throw new Error('No tool_use block in Anthropic response')
  }

  // DeepSeek, Gemini, and Sumopod all expose an OpenAI-compatible endpoint.
  let client: OpenAI
  if (provider === 'deepseek') {
    client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })
  } else if (provider === 'sumopod') {
    // Same fallback key the original api/services/llm_client.py shipped
    // with -- left unchanged deliberately (rotating it is a separate,
    // already-flagged task, not part of this architecture change).
    client = new OpenAI({
      apiKey: process.env.SUMOPOD_API_KEY || '',
      baseURL: 'https://ai.sumopod.com/v1',
    })
  } else {
    client = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
  }

  const oaiTool = {
    type: 'function' as const,
    function: {
      name: toolDef.name,
      description: toolDef.description,
      parameters: toolDef.input_schema,
    },
  }

  // One call + one retry with a sterner system prompt if the JSON is
  // unparseable even after loose-parsing. Handles the rare case where the
  // model just produced garbage -- most of the time the first attempt
  // succeeds or loose-parses fine.
  async function attempt(extraSys?: string) {
    const resp = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: extraSys ? `${system}\n\n${extraSys}` : system },
        { role: 'user', content: userMsg },
      ],
      tools: [oaiTool],
      tool_choice: { type: 'function', function: { name: toolName } },
    })

    const toolCalls = resp.choices[0]?.message?.tool_calls
    if (!toolCalls || !toolCalls.length) {
      const content = resp.choices[0]?.message?.content
      if (content) {
        try { return parseLooseJson(content) } catch {}
      }
      throw new Error(`Model failed to invoke tool. Response content: ${content}`)
    }
    return parseLooseJson(toolCalls[0].function.arguments)
  }

  try {
    return await attempt()
  } catch (err: any) {
    // One retry with a stricter reminder. Only useful for truly broken
    // outputs; the loose parser already handles trailing commas, quote
    // variants, and mid-object truncation on its own.
    return await attempt(
      'CRITICAL: Your tool arguments MUST be complete, valid JSON. Do not truncate. Do not add trailing commas. Escape all newlines inside strings as \\n. If your response would exceed the budget, use fewer items rather than an incomplete list.',
    )
  }
}
