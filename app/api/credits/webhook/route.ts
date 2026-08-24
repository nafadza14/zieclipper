import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Webhook receiver for Sumopod payment gateway. When user pays via QRIS/e-wallet,
// Sumopod POSTs here with status=PAID/SETTLEMENT. We verify the order, add credits,
// and mark the order as paid (idempotent — safe if Sumopod sends the same event twice).
//
// Register this URL in Sumopod dashboard:
//   https://clip.zieads.com/api/credits/webhook

// Service role client — needed to update topup_orders (RLS blocks anon)
// and to call the spend_credits / add_credits Postgres functions.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — webhook cannot write to DB')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Sumopod payload shape (varies by version):
  //   { order_id, status, amount, transaction_id?, ... }
  //   OR nested: { data: { order_id, status, ... } }
  const payload = body.data || body
  const orderId = payload.order_id
  const status  = String(payload.status || '').toUpperCase()

  if (!orderId) {
    return NextResponse.json({ error: 'Missing order_id in payload' }, { status: 400 })
  }

  // Only credit on PAID / SETTLEMENT / SUCCESS
  const PAID_STATUSES = ['PAID', 'SETTLEMENT', 'SUCCESS', 'COMPLETED', 'CAPTURE']
  if (!PAID_STATUSES.includes(status)) {
    // Log non-payment status but return 200 so Sumopod doesn't keep retrying
    return NextResponse.json({ ok: true, ignored: `Status ${status} not a paid status` })
  }

  const svc = serviceClient()

  // Look up the order
  const { data: order, error: fetchErr } = await svc
    .from('topup_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchErr || !order) {
    return NextResponse.json({ error: `Order ${orderId} not found` }, { status: 404 })
  }

  // Idempotency check — if already paid, return success without double-crediting
  if (order.status === 'paid') {
    return NextResponse.json({ ok: true, alreadyPaid: true })
  }

  // Add credits via Postgres function (bypasses RLS with service key)
  const { error: addErr } = await svc.rpc('add_credits', {
    p_amount:      order.credits,
    p_kind:        'topup',
    p_description: `Top-up ${orderId} · Rp ${order.rupiah.toLocaleString('id-ID')} · ${order.credits} kredit`,
  })

  if (addErr) {
    return NextResponse.json({ error: `Failed to add credits: ${addErr.message}` }, { status: 500 })
  }

  // Mark order as paid
  await svc.from('topup_orders').update({
    status:  'paid',
    paid_at: new Date().toISOString(),
  }).eq('id', orderId)

  return NextResponse.json({ ok: true, credited: order.credits })
}

// GET for manual testing — call /api/credits/webhook?orderId=XXX to force-credit
// a specific order without waiting for Sumopod. Guarded by NODE_ENV so it only
// works in development. Remove or protect further before opening to real prod.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }
  const orderId = new URL(req.url).searchParams.get('orderId')
  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })

  // Simulate PAID webhook
  const fakeReq = new NextRequest(req.url, {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, status: 'PAID' }),
    headers: { 'Content-Type': 'application/json' },
  })
  return POST(fakeReq)
}
