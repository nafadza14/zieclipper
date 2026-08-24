import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

// Lists the user's connected social accounts for the settings page. Never
// returns tokens -- only safe display fields.
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data, error } = await auth.supabase
    .from('social_accounts')
    .select('id, platform, external_id, display_name, avatar_url, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data ?? [] })
}
