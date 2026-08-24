import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

// Disconnect (delete) a social_accounts row. RLS ensures a user can only
// delete their own accounts.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { error } = await auth.supabase.from('social_accounts').delete().eq('id', id).eq('user_id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
