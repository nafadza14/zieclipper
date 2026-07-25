import { NextRequest, NextResponse } from 'next/server'
import { getJob } from '@/server/job-manager'

export async function POST(req: NextRequest) {
  const { jobId, clipIndex, model, language } = await req.json()

  const job = getJob(jobId)
  if (!job?.clips || !job.transcript) {
    return NextResponse.json({ error: 'Job not ready' }, { status: 404 })
  }

  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  // Build a transcript excerpt (~200 words around the clip)
  const clipWords = (job.transcript || [])
    .filter((w) => w.end >= clip.start_time && w.start <= clip.end_time)
    .map((w) => w.word)
    .join(' ')
    .slice(0, 800)

  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'

  const res = await fetch(`${pythonUrl}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clip_title: clip.title,
      hook: clip.hook,
      clip_type: clip.clip_type,
      reasons: clip.reasons,
      transcript_excerpt: clipWords,
      model: model || job.model || 'claude-sonnet-4-6',
      provider: job.provider || 'anthropic',
      language: language || 'English',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json(await res.json())
}
