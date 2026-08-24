import { NextRequest, NextResponse } from 'next/server'
import { creditsFromRupiah } from '@/server/credits'

// Public: given ?amount=<rupiah>, returns the credit conversion preview
// (base + bonus + total + effective rate). Used by the settings top-up
// input to show live estimates as the user types. No auth needed since
// it's pure math with no side effects.
export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('amount')
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'amount required' }, { status: 400 })
  }
  return NextResponse.json(creditsFromRupiah(amount))
}
