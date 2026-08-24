import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

// Lists the current user's jobs, newest first, for the My Clips library
// page. RLS on `jobs` scopes rows to auth.uid, and the extra .eq('user_id')
// is defense-in-depth. Limits to 100 -- more than enough for the sidebar
// gallery use case, cheaper than paginating.
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data, error } = await auth.supabase
    .from('jobs')
    .select('id, status, url, title, duration, clips, error, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const jobs = (data || []).map((j) => ({
    id: j.id,
    status: j.status,
    url: j.url,
    title: j.title,
    duration: j.duration,
    clipCount: Array.isArray(j.clips) ? j.clips.length : 0,
    error: j.error,
    createdAt: j.created_at,
  }))
  return NextResponse.json({ jobs })
}
