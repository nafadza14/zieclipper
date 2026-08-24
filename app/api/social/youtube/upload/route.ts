import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { getFreshAccessToken, ytUploadVideo } from '@/server/youtube-oauth'
import { createSignedUrl } from '@/server/storage'

export const maxDuration = 300

// POST /api/social/youtube/upload { exportId, title?, description?, tags?, privacyStatus? }
// Uploads a rendered export MP4 to the user's connected YouTube channel.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { exportId, title, description, tags, privacyStatus } = body
  if (!exportId) return NextResponse.json({ error: 'exportId required' }, { status: 400 })

  // Find the export job + its storage path.
  const { data: exp } = await auth.supabase
    .from('export_jobs')
    .select('id, storage_path, job_id, status')
    .eq('id', exportId).eq('user_id', auth.user.id).maybeSingle()
  if (!exp?.storage_path) return NextResponse.json({ error: 'Export not found or not finished' }, { status: 404 })
  if (exp.status !== 'done') return NextResponse.json({ error: 'Export not finished' }, { status: 409 })

  // Find the user's connected YouTube account (first one).
  const { data: acct } = await auth.supabase
    .from('social_accounts')
    .select('id, access_token, refresh_token, token_expires_at, display_name')
    .eq('user_id', auth.user.id).eq('platform', 'youtube')
    .order('updated_at', { ascending: false })
    .limit(1).maybeSingle()
  if (!acct) return NextResponse.json({ error: 'Belum ada akun YouTube yang terhubung. Hubungkan dulu di Settings.' }, { status: 400 })

  try {
    const accessToken = await getFreshAccessToken(auth.supabase, acct as any)

    // Download rendered MP4 from R2 via signed URL, then upload to YouTube.
    const signed = await createSignedUrl(exp.storage_path, 300)
    const dl = await fetch(signed)
    if (!dl.ok) throw new Error(`R2 fetch failed (${dl.status})`)
    const buf = Buffer.from(await dl.arrayBuffer())

    const videoId = await ytUploadVideo(accessToken, buf, {
      title: title || 'Zieclipper short',
      description: description || '',
      tags: Array.isArray(tags) ? tags : [],
      privacyStatus: privacyStatus || 'private',   // start private -- user can flip visibility in YouTube Studio
    })

    // Log to scheduled_posts as `published` so it appears in history.
    await auth.supabase.from('scheduled_posts').insert({
      user_id: auth.user.id,
      social_account_id: acct.id,
      export_job_id: exportId,
      storage_path: exp.storage_path,
      title, description, tags,
      status: 'published',
      published_at: new Date().toISOString(),
      external_post_id: videoId,
    })

    return NextResponse.json({
      videoId,
      url: `https://youtube.com/shorts/${videoId}`,
      privacyStatus: privacyStatus || 'private',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
