import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { creditsFromRupiah, MIN_TOPUP, PRICING_TIERS } from '@/server/credits'

const SUMOPOD_PAY_API_KEY = process.env.SUMOPOD_PAY_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://clip.zieads.com'

// Service role client for bypassing RLS on topup_orders insert.
// Service role key is set on VPS .env.production; falls back to anon if missing.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// POST /api/credits/topup { amount: number (Rupiah), tierId?: string, paymentMethod?: string }
//
// Creates Sumopod payment order, returns paymentUrl for QRIS/e-wallet redirect.
// Credits are NOT granted here — only when Sumopod sends PAID webhook to /api/credits/webhook.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (!SUMOPOD_PAY_API_KEY) {
    return NextResponse.json({ error: 'Payment gateway belum dikonfigurasi. Set SUMOPOD_PAY_API_KEY di env.' }, { status: 501 })
  }

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  const tierId = body.tierId as string | undefined
  const paymentMethod = body.paymentMethod || 'QRIS'

  if (!Number.isFinite(amount) || amount < MIN_TOPUP) {
    return NextResponse.json({
      error: `Minimum top-up Rp ${MIN_TOPUP.toLocaleString('id-ID')}`,
    }, { status: 400 })
  }

  // Compute credits: use fixed tier if tierId matches, else free-form quote
  let credits: number, creditsBase: number, creditsBonus: number
  if (tierId) {
    const tier = PRICING_TIERS.find((t) => t.id === tierId)
    if (!tier || tier.priceRupiah !== amount) {
      return NextResponse.json({ error: 'Tier tidak valid atau harga tidak cocok' }, { status: 400 })
    }
    credits = tier.credits
    creditsBase = tier.credits
    creditsBonus = 0
  } else {
    const quote = creditsFromRupiah(amount)
    if (quote.total <= 0) return NextResponse.json({ error: 'Nominal terlalu kecil' }, { status: 400 })
    credits = quote.total
    creditsBase = quote.base
    creditsBonus = quote.bonus
  }

  const orderId = `ZC-${auth.user.id.slice(0, 8)}-${Date.now()}`
  const svc = serviceClient()

  const { error: insertErr } = await svc.from('topup_orders').insert({
    id:             orderId,
    user_id:        auth.user.id,
    rupiah:         amount,
    credits,
    credits_base:   creditsBase,
    credits_bonus:  creditsBonus,
    payment_method: paymentMethod,
    status:         'pending',
  })
  if (insertErr) {
    return NextResponse.json({ error: 'Gagal membuat order: ' + insertErr.message }, { status: 500 })
  }

  try {
    const res = await fetch('https://api-pay.sumopod.com/api/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': SUMOPOD_PAY_API_KEY,
      },
      body: JSON.stringify({
        order_id:                 orderId,
        amount:                   amount,
        currency:                 'IDR',
        expires_in_hours:         24,
        success_return_url:       `${APP_URL}/settings?topup=success&orderId=${orderId}`,
        cancel_return_url:        `${APP_URL}/settings?topup=cancel&orderId=${orderId}`,
        payment_method_type_code: paymentMethod,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Sumopod ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const paymentUrl = data.payment_url || data.redirect_url || data.url || data.data?.payment_url
    if (!paymentUrl) throw new Error(`Sumopod tidak mengembalikan payment URL. Response: ${JSON.stringify(data).slice(0, 200)}`)

    await svc.from('topup_orders').update({ payment_url: paymentUrl }).eq('id', orderId)

    return NextResponse.json({
      orderId,
      paymentUrl,
      amount,
      credits,
      base: creditsBase,
      bonus: creditsBonus,
    })
  } catch (err: any) {
    await svc.from('topup_orders').update({ status: 'failed' }).eq('id', orderId)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
