import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import type { Job } from '@/store/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  // Reads Supabase directly -- no call to the worker needed for polling.
  // RLS on the jobs table means this can only ever return a row owned by
  // auth.user.id, so the .eq('user_id', ...) below is defense in depth, not
  // the only thing enforcing it.
  const { data, error } = await auth.supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const job: Job = {
    id: data.id,
    status: data.status,
    url: data.url,
    title: data.title ?? undefined,
    duration: data.duration ?? undefined,
    transcript: data.transcript ?? undefined,
    clips: data.clips ?? undefined,
    error: data.error ?? undefined,
    model: data.model,
    provider: data.provider,
    availableSubtitles: data.available_subtitles ?? undefined,
    activeSubtitleLang: data.active_subtitle_lang ?? undefined,
  }

  return NextResponse.json(job)
}
