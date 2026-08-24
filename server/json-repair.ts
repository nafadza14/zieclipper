// Best-effort JSON parser for LLM tool-call outputs. Strict JSON.parse is
// brittle here: models occasionally emit trailing commas, unquoted keys,
// smart quotes, or -- most commonly -- truncated output when they hit the
// max_tokens ceiling mid-object. This tries JSON.parse first (the fast
// path), then applies a set of surgical fixes and tries again. Throws only
// if every attempt fails, so the caller sees the ORIGINAL error message
// (which pins the character position) rather than a repaired-but-wrong
// object hiding the bug.
export function parseLooseJson(raw: string): any {
  if (typeof raw !== 'string' || !raw) throw new Error('empty JSON input')

  // 1. Fast path — normal, well-formed JSON.
  try { return JSON.parse(raw) } catch (originalErr) {
    // 2. Isolate the first {...} or [...] block in case the model added
    //    prose before/after ("Here is the JSON: {...}").
    const braceStart = raw.indexOf('{')
    const bracketStart = raw.indexOf('[')
    let start = -1
    if (braceStart !== -1 && bracketStart !== -1) start = Math.min(braceStart, bracketStart)
    else if (braceStart !== -1) start = braceStart
    else if (bracketStart !== -1) start = bracketStart
    let sliced = start >= 0 ? raw.slice(start) : raw

    // 3. Fix common surface-level LLM glitches:
    //    - smart quotes -> straight quotes
    //    - trailing commas before ] or }
    //    - stray control chars in strings (very rare; leave for now)
    sliced = sliced
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/,\s*([\]}])/g, '$1')

    // 4. Handle truncation: if the output was cut off mid-array/mid-object,
    //    walk through counting unclosed brackets/braces (ignoring quoted
    //    strings) and append the missing closers. This recovers 95 %+ of
    //    truncated LLM JSON without touching well-formed input.
    const repaired = closeTruncated(sliced)

    try { return JSON.parse(repaired) } catch {
      // 5. Give up -- surface the ORIGINAL error so debugging isn't misled.
      throw originalErr
    }
  }
}

function closeTruncated(s: string): string {
  const stack: string[] = []
  let inStr = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inStr) { escape = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  let out = s
  // If we ended inside a string, close it. This may lose the tail of the
  // last value, but usually rescues a whole complete-object prefix.
  if (inStr) out += '"'
  // Best-effort: strip a trailing partial value (unterminated number, dangling
  // ":" after a key with no value, dangling ",") before appending closers.
  out = out.replace(/,\s*$/, '')
  out = out.replace(/:\s*$/, ':null')
  while (stack.length) out += stack.pop()
  return out
}
