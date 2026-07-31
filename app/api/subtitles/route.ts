import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { requireUser } from '@/lib/supabase-server'
import { extractVideoId } from '@/server/youtube'
import { fetchInfoJson, listAvailableLanguagesFromInfoJson } from '@/server/ytdlp-service'

export const maxDuration = 60

// Not currently called by the frontend (kept for parity/future use). Lists
// available subtitle languages via yt-dlp's own info.json instead of the
// dropped youtube_transcript_api path -- see server/subtitles.ts.
export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })
  if (!extractVideoId(url)) return NextResponse.json({ languages: [] })

  try {
    const outputDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'peek', crypto.randomUUID())
    const infoJsonPath = await fetchInfoJson(url, outputDir)
    const { manual, automatic } = listAvailableLanguagesFromInfoJson(infoJsonPath)

    const languages = [
      ...manual.map((code) => ({ code, name: code, is_generated: false })),
      ...automatic.filter((c) => !manual.includes(c)).map((code) => ({ code, name: code, is_generated: true })),
    ]
    return NextResponse.json({ languages })
  } catch {
    return NextResponse.json({ languages: [] })
  }
}
