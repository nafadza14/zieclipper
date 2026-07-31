import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { requireUser } from '@/lib/supabase-server'
import { downloadSubtitleTrack } from '@/server/ytdlp-service'
import { parseVttWords } from '@/server/transcript-parser'

export const maxDuration = 120

// Re-downloads the requested subtitle track fresh instead of trusting the
// vttPath cached on the job row from the original /api/download run -- that
// path pointed into that earlier invocation's /tmp, which this request has
// no guarantee of still seeing (see server/ytdlp-service.ts's TMP_ROOT
// comment). A few extra seconds of yt-dlp beats a silent "file not found".
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { lang } = await req.json().catch(() => ({}))
  if (!lang) return NextResponse.json({ error: 'lang required' }, { status: 400 })

  const { data: job, error } = await auth.supabase
    .from('jobs')
    .select('id, url')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const outputDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'jobs', jobId, 'retranscript', crypto.randomUUID())

  try {
    const vttPath = await downloadSubtitleTrack(job.url, lang, outputDir)
    if (!vttPath) return NextResponse.json({ error: `Subtitle track '${lang}' is not available for this video` }, { status: 404 })

    const transcript = parseVttWords(vttPath)
    await auth.supabase.from('jobs').update({ transcript, active_subtitle_lang: lang }).eq('id', jobId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
