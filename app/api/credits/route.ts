import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { getBalance } from '@/server/credits'

// GET /api/credits — returns { balance, transactions[] } for the sidebar
// widget and settings page.
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const balance = await getBalance(auth.supabase, auth.user.id)

  const { data: txs } = await auth.supabase
    .from('credit_transactions')
    .select('id, amount, kind, description, ref_job_id, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ balance, transactions: txs ?? [] })
}
