import { listAvailableLanguagesFromInfoJson } from './ytdlp-service'
import type { SubtitleOption } from '@/store/types'

// Replaces worker/src/python-client.ts's buildAvailableSubtitles, which
// called youtube_transcript_api (via the Python service) to get each
// language's human-readable name and manual-vs-auto flag. That library is
// deliberately not ported (see DEPLOY-VERCEL-SUPABASE.md) -- instead this
// derives the same info from yt-dlp's own info.json, which is already being
// downloaded as part of downloadSubtitlesAndMetadata.
function langName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.split('-')[0]) ?? code
  } catch {
    return code
  }
}

export function buildAvailableSubtitles(
  vttFiles: Record<string, string>,
  infoJsonPath?: string,
): SubtitleOption[] {
  let manual = new Set<string>()
  let automatic = new Set<string>()

  if (infoJsonPath) {
    try {
      const langs = listAvailableLanguagesFromInfoJson(infoJsonPath)
      manual = new Set(langs.manual)
      automatic = new Set(langs.automatic)
    } catch {
      // info.json missing/unparseable -- fall through with empty sets, every
      // downloaded track just gets treated as auto-generated below.
    }
  }

  const result: SubtitleOption[] = []
  for (const [code, vttPath] of Object.entries(vttFiles)) {
    result.push({
      code,
      name: langName(code),
      is_generated: manual.has(code) ? false : true,
      vttPath,
    })
  }

  // Same ordering as the original: generated tracks first, then
  // alphabetical by display name.
  result.sort((a, b) => {
    if (a.is_generated !== b.is_generated) return a.is_generated ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return result
}
