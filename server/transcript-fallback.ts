/**
 * Third-party YouTube transcript API fallback.
 *
 * When yt-dlp fails on VPS due to YouTube blocking (datacenter IP, no
 * cookies, no proxy configured), this module fetches the transcript and
 * metadata directly from a hosted YouTube API service.
 *
 * These services maintain their own residential proxy infrastructure so
 * we don't have to. Cost is $9-29/month for typical usage volume.
 *
 * Priority order (attempts each until one succeeds):
 *   1. Supadata.ai — $9/mo for 5k videos, dedicated YouTube API
 *   2. SearchAPI.io — $50/mo, general search + transcript
 *   3. YouTube-Transcript.io — free tier with rate limits
 *
 * Configure any of these in .env.production:
 *   SUPADATA_API_KEY=sk-...
 *   SEARCHAPI_KEY=...
 *
 * See docs/deploy-vps.md for provider signup + setup guide.
 */

import { extractVideoId } from './youtube'

export interface FallbackTranscript {
  title: string
  duration: number
  language: string
  words: Array<{ word: string; start: number; end: number }>
}

/**
 * Try each configured fallback provider in order. Returns null if none
 * are configured or all fail — caller should then throw the yt-dlp error.
 */
export async function fetchTranscriptFallback(url: string): Promise<FallbackTranscript | null> {
  const videoId = extractVideoId(url)
  if (!videoId) return null

  // ── Supadata.ai (recommended: cheapest + most reliable) ────────────
  const supadataKey = process.env.SUPADATA_API_KEY
  if (supadataKey) {
    try {
      const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=false`, {
        headers: { 'x-api-key': supadataKey },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.content && Array.isArray(data.content)) {
          // Supadata format: [{ text, offset (ms), duration (ms) }]
          const words = data.content.map((seg: any) => ({
            word: seg.text,
            start: (seg.offset || 0) / 1000,
            end: ((seg.offset || 0) + (seg.duration || 0)) / 1000,
          }))
          // Get metadata separately (Supadata provides it via metadata endpoint)
          const metaRes = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, {
            headers: { 'x-api-key': supadataKey },
          })
          const meta = metaRes.ok ? await metaRes.json() : {}
          return {
            title: meta.title || 'Untitled',
            duration: meta.duration || (words.length ? words[words.length - 1].end : 0),
            language: data.lang || 'en',
            words,
          }
        }
      }
    } catch (err) {
      console.warn('[transcript-fallback] Supadata failed:', err)
    }
  }

  // ── SearchAPI.io ───────────────────────────────────────────────────
  const searchApiKey = process.env.SEARCHAPI_KEY
  if (searchApiKey) {
    try {
      const res = await fetch(
        `https://www.searchapi.io/api/v1/search?engine=youtube_transcripts&video_id=${videoId}&api_key=${searchApiKey}`,
      )
      if (res.ok) {
        const data = await res.json()
        if (data.transcripts && Array.isArray(data.transcripts)) {
          const words = data.transcripts.map((seg: any) => ({
            word: seg.text,
            start: seg.start || 0,
            end: (seg.start || 0) + (seg.duration || 2),
          }))
          return {
            title: data.video?.title || 'Untitled',
            duration: data.video?.duration_seconds || (words.length ? words[words.length - 1].end : 0),
            language: 'en',
            words,
          }
        }
      }
    } catch (err) {
      console.warn('[transcript-fallback] SearchAPI failed:', err)
    }
  }

  return null
}

/**
 * Check if any fallback provider is configured. Called by the download
 * route to decide whether to attempt yt-dlp at all — if we have a
 * reliable fallback, we can skip yt-dlp on VPS to save the ~20s spent
 * hitting YouTube and failing.
 */
export function hasFallbackConfigured(): boolean {
  return !!(process.env.SUPADATA_API_KEY || process.env.SEARCHAPI_KEY)
}
