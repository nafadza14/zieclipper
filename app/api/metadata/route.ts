import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { generateMetadata } from '@/server/metadata-service'
import type { WordTiming } from '@/store/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { jobId, clipIndex, model, language } = await req.json().catch(() => ({}))
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const { data: job, error } = await auth.supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!job?.clips || !job.transcript) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const clip = job.clips[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const clipWords = (job.transcript as WordTiming[])
    .filter((w) => w.end >= clip.start_time && w.start <= clip.end_time)
    .map((w) => w.word)
    .join(' ')
    .slice(0, 800)

  try {
    const result = await generateMetadata({
      clip_title: clip.title,
      hook: clip.hook,
      clip_type: clip.clip_type,
      reasons: clip.reasons,
      transcript_excerpt: clipWords,
      model: model || job.model || 'claude-sonnet-4-6',
      provider: job.provider || 'anthropic',
      language: language || 'English',
    })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
