import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { ensureVideoSegment } from '@/server/ytdlp-service'
import { uploadFile, createSignedUrl, fileExistsInStorage, mediaPath } from '@/server/storage'

// Hobby's 300s cap and Vercel's 4.5MB *buffered* response cap both matter
// here: a 30-60s vertical clip is routinely bigger than 4.5MB, so instead
// of streaming bytes through this function (the worker's old job) this
// downloads/trims the segment into Supabase Storage once and redirects the
// browser to a short-lived signed URL for it -- which also supports Range
// requests natively, so video scrubbing still works.
export const maxDuration = 300

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const start = parseFloat(searchParams.get('start') || '0')
  const end = parseFloat(searchParams.get('end') || '0')
  if (end <= start) return NextResponse.json({ error: 'Invalid start/end parameters' }, { status: 400 })

  const { data: job } = await auth.supabase
    .from('jobs')
    .select('id, url, source_storage_path')
    .eq('id', jobId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // start/end come from a clip's fixed boundaries (plus the user's saved
  // trim offsets), not a continuously-changing scrub position, so caching
  // by the rounded start/end pair in Storage is stable per clip rather than
  // growing unbounded.
  const storagePath = mediaPath(auth.user.id, jobId, `segment_${Math.round(start * 10)}_${Math.round(end * 10)}.mp4`)

  try {
    if (!(await fileExistsInStorage(storagePath))) {
      const filePath = await ensureVideoSegment(jobId, job.url, start, end, job.source_storage_path ?? undefined)
      await uploadFile(storagePath, filePath, 'video/mp4')
    }
    const signedUrl = await createSignedUrl(storagePath, 600)
    return NextResponse.redirect(signedUrl, 307)
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to fetch segment: ${err.message}` }, { status: 500 })
  }
}
