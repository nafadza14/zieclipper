import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

// Ported from the old api/services/llm_client.py -- same forced-tool-use
// pattern, same provider list, running in-process instead of over HTTP to
// a separate FastAPI service (there's no longer a separate service to call).
export async function callTool(
  provider: string,
  model: string,
  system: string,
  userMsg: string,
  toolDef: ToolDefinition,
  toolName: string,
  maxTokens = 4096,
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
      apiKey: process.env.SUMOPOD_API_KEY || 'sk-LH238LuYeE77a-8IVxxQdg',
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

  const resp = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    tools: [oaiTool],
    tool_choice: { type: 'function', function: { name: toolName } },
  })

  const toolCalls = resp.choices[0]?.message?.tool_calls
  if (!toolCalls || !toolCalls.length) {
    const content = resp.choices[0]?.message?.content
    if (content) {
      const m = content.match(/(\{[\s\S]*\})/)
      if (m) {
        try { return JSON.parse(m[1]) } catch {}
      }
    }
    throw new Error(`Model failed to invoke tool. Response content: ${content}`)
  }

  return JSON.parse(toolCalls[0].function.arguments)
}
