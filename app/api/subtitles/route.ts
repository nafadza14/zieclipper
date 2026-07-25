import { NextRequest, NextResponse } from 'next/server'
import { extractVideoId } from '@/lib/youtube'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  const videoId = extractVideoId(url)
  if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'
  try {
    const res = await fetch(`${pythonUrl}/available-transcripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
    })
    if (!res.ok) return NextResponse.json({ languages: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ languages: [] })
  }
}
