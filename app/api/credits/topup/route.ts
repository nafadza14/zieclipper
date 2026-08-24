import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { addCredits, creditsFromRupiah, MIN_TOPUP } from '@/server/credits'

// POST /api/credits/topup { amount: number (Rupiah) }
//
// Free-form top-up. User types any Rupiah amount >= MIN_TOPUP; server
// converts to credits at the flat rate + progressive bonus (see
// server/credits.ts creditsFromRupiah).
//
// This route currently grants credit INSTANTLY without payment. Before
// go-live it must be replaced by a Midtrans/Xendit webhook that verifies
// real payment before crediting. `NODE_ENV=production` blocks the raw
// endpoint as a belt-and-braces guard.
export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DUMMY_TOPUP) {
    return NextResponse.json({ error: 'Top-up gateway sedang disiapkan' }, { status: 501 })
  }

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < MIN_TOPUP) {
    return NextResponse.json({
      error: `Minimum top-up Rp ${MIN_TOPUP.toLocaleString('id-ID')}`,
    }, { status: 400 })
  }

  const quote = creditsFromRupiah(amount)
  if (quote.total <= 0) {
    return NextResponse.json({ error: 'Nominal terlalu kecil' }, { status: 400 })
  }

  try {
    const newBalance = await addCredits(
      auth.supabase,
      quote.total,
      'topup',
      `Top-up Rp ${quote.rupiah.toLocaleString('id-ID')} · ${quote.total} kredit` +
        (quote.bonus > 0 ? ` (termasuk ${quote.bonus} bonus)` : ''),
    )
    return NextResponse.json({
      balance: newBalance,
      added: quote.total,
      base: quote.base,
      bonus: quote.bonus,
      price: quote.rupiah,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
