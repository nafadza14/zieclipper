import type { SupabaseClient } from '@supabase/supabase-js'

// Credit consumption table for Zieclipper. Kept as pure data + pure
// functions here so any route can compute cost before spending, and so the
// docs page can render the exact same numbers straight from this file.
// See docs/credits page for the human-readable version.
//
// NEW PRICING MODEL (v2, Aug 2026):
// Matches Klipaja.id — fixed tier packages, one-time payment, credits
// never expire. Each credit = 1 video → 3 clips. This is 4x cheaper per
// credit than the old free-form model because we cut clips-per-video
// from 12 to 3 and switched default LLM to gpt-4o-mini (60x cheaper than
// Sonnet).

export type CreditKind = 'signup_bonus' | 'topup' | 'generate' | 'export' | 'face_track' | 'refund' | 'manual'

// Cost per generate call. Now flat 1 credit per video regardless of
// duration (like Klipaja) — user gets 3 clips per credit. Video length
// only matters for our COGS, not user-facing pricing.
export function creditsForGenerate(_durationSeconds: number): number {
  return 1
}

// Default clips per generate. Klipaja gives 3, we match. Users on higher
// tiers can request 6 clips per video (see clipCountRange in analyzer.ts).
export const DEFAULT_CLIPS_PER_VIDEO = 3
export const PRO_CLIPS_PER_VIDEO = 6

// Optional add-ons paid at export time. Export itself is FREE (rendering
// costs are marginal); we only charge for AI-heavy add-ons.
export const CREDIT_COST = {
  faceTrackingPerExport: 1,   // enabling auto face-track on an export (Pro only)
} as const

// ─── PRICING TIERS (matches Klipaja) ──────────────────────────────────
// Fixed tier packages. Users pick one, get credits immediately. Not a
// subscription — credits never expire as long as account is active.

export interface PricingTier {
  id: string
  name: string
  priceRupiah: number
  originalPriceRupiah?: number  // for showing discount
  credits: number
  discountPct?: number
  clipsGenerated: number         // = credits * DEFAULT_CLIPS_PER_VIDEO
  perClipRupiah: number          // for the "per-clip cost" display
  badge?: 'popular' | 'best-value' | 'founder'
  features: string[]
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'lite',
    name: 'Lite',
    priceRupiah: 19_000,
    credits: 10,
    clipsGenerated: 30,
    perClipRupiah: 633,
    features: [
      '10 kredit (30 klip)',
      'HD 1080p tanpa watermark',
      'Auto captions bahasa Indonesia',
      'Format 9:16 (Shorts / Reels / TikTok)',
      'Kredit tidak expire',
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    priceRupiah: 49_000,
    originalPriceRupiah: 57_000,
    credits: 30,
    discountPct: 14,
    clipsGenerated: 90,
    perClipRupiah: 544,
    badge: 'popular',
    features: [
      '30 kredit (90 klip)',
      'Semua fitur Lite',
      'Custom watermark',
      'Priority queue',
      'Auto refund jika render gagal',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    priceRupiah: 99_000,
    originalPriceRupiah: 141_000,
    credits: 75,
    discountPct: 30,
    clipsGenerated: 225,
    perClipRupiah: 440,
    badge: 'best-value',
    features: [
      '75 kredit (225 klip)',
      'Semua fitur Plus',
      '6 klip per video (opsi)',
      'Face tracking otomatis',
      'Export batch',
    ],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    priceRupiah: 199_000,
    originalPriceRupiah: 343_000,
    credits: 180,
    discountPct: 42,
    clipsGenerated: 540,
    perClipRupiah: 369,
    features: [
      '180 kredit (540 klip)',
      'Semua fitur Max',
      'Priority render (queue tercepat)',
      'Support prioritas',
      'Cocok untuk agency / power user',
    ],
  },
  {
    id: 'founder',
    name: 'Founder Lifetime',
    priceRupiah: 599_000,
    originalPriceRupiah: 3_749_000,
    credits: 100,
    discountPct: 84,
    clipsGenerated: 300,
    perClipRupiah: 200,
    badge: 'founder',
    features: [
      '100 kredit langsung',
      '+100 kredit gratis SETIAP BULAN selamanya',
      'Semua fitur premium (termasuk face tracking)',
      'Priority queue tercepat',
      'Lifetime updates & fitur baru duluan',
      'Badge "Founder" di community',
    ],
  },
]

// ─── LEGACY compat: free-form top-up (kept for backwards-compat) ─────
// Old routes may still reference these; we keep them working so a topup
// URL from before the migration doesn't break. New signups use the tier
// system above.
export const CREDIT_RATE = 1900          // Rp per 1 credit (matches Lite tier)
export const MIN_TOPUP = 19_000          // Rp — matches Lite tier price

// Bonus tiers derived from the fixed packages above. Legacy free-form
// top-up path still works and rewards larger amounts.
export const BONUS_TIERS: { minRupiah: number; bonusPct: number }[] = [
  { minRupiah: 19_000,  bonusPct: 0  },
  { minRupiah: 49_000,  bonusPct: 14 },
  { minRupiah: 99_000,  bonusPct: 30 },
  { minRupiah: 199_000, bonusPct: 42 },
  { minRupiah: 599_000, bonusPct: 84 },
]

export const SUGGESTED_AMOUNTS = [19_000, 49_000, 99_000, 199_000, 599_000]

export interface CreditQuote {
  rupiah: number
  base: number
  bonus: number
  total: number
  bonusPct: number
  rupiahPerCredit: number
  tierName?: string
}

export function creditsFromRupiah(rupiah: number): CreditQuote {
  const amount = Math.max(0, Math.floor(rupiah))

  // Prefer exact tier match — user paying Rp 49rb should get exactly 30
  // credits (Plus tier), not 25.7 credits from the base rate.
  const exactTier = PRICING_TIERS.find((t) => t.priceRupiah === amount)
  if (exactTier) {
    const base = Math.floor(amount / CREDIT_RATE)
    const total = exactTier.credits
    const bonus = Math.max(0, total - base)
    const bonusPct = base > 0 ? Math.round((bonus / base) * 100) : 0
    return {
      rupiah: amount,
      base,
      bonus,
      total,
      bonusPct,
      rupiahPerCredit: total > 0 ? amount / total : CREDIT_RATE,
      tierName: exactTier.name,
    }
  }

  // Fallback: free-form top-up with bonus tiers.
  const base = Math.floor(amount / CREDIT_RATE)
  let bonusPct = 0
  for (const tier of BONUS_TIERS) {
    if (amount >= tier.minRupiah) bonusPct = tier.bonusPct
  }
  const bonus = Math.floor((base * bonusPct) / 100)
  const total = base + bonus
  const rupiahPerCredit = total > 0 ? amount / total : CREDIT_RATE
  return { rupiah: amount, base, bonus, total, bonusPct, rupiahPerCredit }
}

// ─── Server-side spend/add helpers ───────────────────────────────────────
// Both call the SECURITY DEFINER Postgres functions defined in
// supabase/migrations/0003. spend throws with 'insufficient_credits' when
// the balance would go negative; callers should catch and 402 the client.

export async function spendCredits(
  supabase: SupabaseClient,
  amount: number,
  kind: CreditKind,
  description?: string,
  refJobId?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('spend_credits', {
    p_amount: amount,
    p_kind: kind,
    p_description: description ?? null,
    p_ref_job_id: refJobId ?? null,
  })
  if (error) {
    if (String(error.message || '').includes('insufficient_credits')) {
      throw Object.assign(new Error('insufficient_credits'), { code: 402 })
    }
    throw new Error(`Credit spend failed: ${error.message}`)
  }
  return data as number
}

export async function addCredits(
  supabase: SupabaseClient,
  amount: number,
  kind: CreditKind,
  description?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('add_credits', {
    p_amount: amount,
    p_kind: kind,
    p_description: description ?? null,
  })
  if (error) throw new Error(`Credit add failed: ${error.message}`)
  return data as number
}

export async function getBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from('user_credits').select('balance').eq('user_id', userId).maybeSingle()
  return (data as any)?.balance ?? 0
}
