import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment } from '@/server/ytdlp-service'
import { trackFace } from '@/server/face-tracking'
import type { Job } from '@/store/types'

// Computes face-tracking keyframes for a specific clip and returns them so
// the editor's preview can animate the crop follow-along BEFORE the user
// commits to an export. Same math as the export-time tracking (both call
// server/face-tracking.trackFace), so what the user sees in preview is
// what they'll get in the rendered MP4.
//
// Cost: ~$0.01-0.10 in vision LLM calls per invocation. Cached on the
// client (editor store) so re-clicking Preview is free until a page reload.
export const maxDuration = 180

export async function POST(_req: NextRequest, { params }: { params: Promise<{ jobId: string; clipIndex: string }> }) {
  const { jobId, clipIndex: clipIndexStr } = await params
  const clipIndex = parseInt(clipIndexStr, 10)
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data, error } = await auth.supabase
    .from('jobs')
    .select('id, url, clips, model, provider, source_storage_path')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.clips) return NextResponse.json({ error: 'Job not ready' }, { status: 404 })

  const job = data as Pick<Job, 'id' | 'url' | 'clips' | 'model' | 'provider'> & { source_storage_path?: string | null }
  const clip = job.clips?.[clipIndex]
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  try {
    // We need the actual downloaded source in /tmp to sample frames. Reuse
    // the same segment-fetch path everything else uses -- this is idempotent
    // and cheap after the first call within the same instance.
    const segmentPath = await ensureVideoSegment(
      jobId, job.url, clip.start_time, clip.end_time,
      job.source_storage_path ?? undefined,
    )
    const clipDur = clip.end_time - clip.start_time
    const kfs = await trackFace(
      segmentPath, 0, clipDur,
      job.provider || 'sumopod',
      job.model || 'gpt-4o-mini',
    )
    if (!kfs.length) {
      return NextResponse.json({ keyframes: [], warning: 'Wajah tidak terdeteksi. Crop akan tetap di tengah.' })
    }
    return NextResponse.json({ keyframes: kfs, clipDuration: clipDur })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
