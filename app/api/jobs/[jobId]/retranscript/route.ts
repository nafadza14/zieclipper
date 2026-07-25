import { NextRequest, NextResponse } from 'next/server'
import { getJob, updateJob } from '@/server/job-manager'
import { extractVideoId } from '@/lib/youtube'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const job = getJob(jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const { lang } = await req.json()
  if (!lang) return NextResponse.json({ error: 'lang required' }, { status: 400 })

  const sub = job.availableSubtitles?.find((s) => s.code === lang)
  const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002'

  try {
    const res = await fetch(`${pythonUrl}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: extractVideoId(job.url) ?? '',
        audio_path: job.videoPath,
        vtt_path: sub?.vttPath,
        preferred_lang: lang,
      }),
    })

    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch {}
      return NextResponse.json({ error: detail }, { status: 500 })
    }

    const { transcript } = await res.json()
    updateJob(jobId, { transcript, activeSubtitleLang: lang })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
