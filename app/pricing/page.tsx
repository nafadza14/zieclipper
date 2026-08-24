'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MarketingShell, MarketingPanel } from '@/components/marketing/MarketingShell'
import { useAuth } from '@/hooks/useAuth'
import { PRICING_TIERS, type PricingTier } from '@/server/credits'
import { IconBolt, IconShield, IconSparkles } from '@/components/marketing/Icons'

// PRICING PAGE — matches Klipaja.id model (Aug 2026):
// Fixed tier packages, one-time payment, credits never expire. This
// replaces the old free-form "Rp X per credit" model.
export default function PricingPage() {
  const router = useRouter()
  const { user } = useAuth()

  const handleBuy = (tier: PricingTier) => {
    if (!user) {
      router.push(`/auth?next=/settings%23credits&tier=${tier.id}`)
      return
    }
    router.push(`/settings#credits?tier=${tier.id}`)
  }

  return (
    <MarketingShell>
      <MarketingPanel
        title="Harga"
        subtitle="Sekali bayar, kredit tidak expire. Pilih paket yang cocok untuk kebutuhan Anda."
        wide
      >
        {/* Hero */}
        <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-xl p-4 text-center">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold">
            Model harga sederhana
          </div>
          <div className="text-white text-2xl md:text-3xl font-bold mt-1">
            1 kredit = 1 video → <span className="text-amber-400">3 klip</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            HD 1080p tanpa watermark · Vertikal 9:16 · Auto captions · Kredit tidak expire
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {PRICING_TIERS.filter((t) => t.id !== 'founder').map((tier) => (
            <TierCard key={tier.id} tier={tier} onBuy={() => handleBuy(tier)} />
          ))}
        </div>

        {/* Founder Lifetime — full-width special card */}
        <div className="mt-5">
          <FounderCard
            tier={PRICING_TIERS.find((t) => t.id === 'founder')!}
            onBuy={() => handleBuy(PRICING_TIERS.find((t) => t.id === 'founder')!)}
          />
        </div>

        {/* Value pills */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <ValueRow Icon={IconBolt} title="Sekali bayar" body="Bukan langganan bulanan. Beli sekali, kredit tetap di akun Anda selamanya." />
          <ValueRow Icon={IconSparkles} title="Tanpa watermark" body="Semua tier — bahkan tier Lite — export tanpa watermark, siap posting." />
          <ValueRow Icon={IconShield} title="Refund otomatis" body="Jika render gagal karena masalah kami, kredit otomatis kembali ke saldo." />
        </div>

        <div className="text-center mt-6">
          {!user && (
            <button
              onClick={() => router.push('/auth')}
              className="bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-neutral-200 transition"
            >
              Daftar gratis, dapat 3 kredit percobaan
            </button>
          )}
          <div className="mt-3">
            <Link href="/docs/credits" className="text-neutral-400 hover:text-white text-xs underline">
              Lihat detail konsumsi kredit →
            </Link>
          </div>
        </div>
      </MarketingPanel>
    </MarketingShell>
  )
}

function TierCard({ tier, onBuy }: { tier: PricingTier; onBuy: () => void }) {
  const isPopular = tier.badge === 'popular'
  const isBestValue = tier.badge === 'best-value'
  const highlight = isPopular || isBestValue

  return (
    <div className={`relative flex flex-col bg-white/[0.02] border rounded-xl p-4 transition ${
      highlight
        ? 'border-amber-500/40 shadow-lg shadow-amber-500/5'
        : 'border-white/[0.06] hover:border-white/[0.12]'
    }`}>
      {tier.badge && (
        <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full ${
          isPopular ? 'bg-amber-500 text-black' :
          isBestValue ? 'bg-emerald-500 text-black' :
          'bg-white text-black'
        }`}>
          {isPopular ? '⭐ Populer' : isBestValue ? '🔥 Best Value' : tier.badge}
        </div>
      )}

      <div className="text-white text-lg font-bold">{tier.name}</div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-white text-2xl font-bold">
          Rp {tier.priceRupiah.toLocaleString('id-ID')}
        </span>
        {tier.originalPriceRupiah && (
          <span className="text-neutral-500 text-xs line-through">
            Rp {tier.originalPriceRupiah.toLocaleString('id-ID')}
          </span>
        )}
      </div>

      {tier.discountPct && tier.discountPct > 0 && (
        <div className="text-emerald-400 text-[11px] font-semibold mt-0.5">
          Hemat {tier.discountPct}%
        </div>
      )}

      <div className="mt-3 pb-3 border-b border-white/[0.06]">
        <div className="text-neutral-400 text-xs">
          <span className="text-white font-semibold">{tier.credits} kredit</span>
          {' · '}
          {tier.clipsGenerated} klip
        </div>
        <div className="text-neutral-500 text-[10px] mt-0.5">
          ~Rp {tier.perClipRupiah.toLocaleString('id-ID')} per klip
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 flex-1">
        {tier.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-neutral-300">
            <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onBuy}
        className={`mt-4 py-2.5 rounded-lg text-sm font-semibold transition ${
          highlight
            ? 'bg-amber-500 text-black hover:bg-amber-400'
            : 'bg-white text-black hover:bg-neutral-200'
        }`}
      >
        Beli {tier.name}
      </button>
    </div>
  )
}

function FounderCard({ tier, onBuy }: { tier: PricingTier; onBuy: () => void }) {
  return (
    <div className="relative bg-gradient-to-br from-purple-500/10 via-amber-500/5 to-transparent border-2 border-purple-500/40 rounded-2xl p-5 md:p-6">
      <div className="absolute -top-3 left-6 text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full bg-purple-500 text-white">
        👑 Founder — Limited
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <div>
          <div className="text-white text-2xl font-bold">Founder Lifetime</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-white text-3xl md:text-4xl font-bold">
              Rp {tier.priceRupiah.toLocaleString('id-ID')}
            </span>
            {tier.originalPriceRupiah && (
              <span className="text-neutral-400 text-sm line-through">
                Rp {tier.originalPriceRupiah.toLocaleString('id-ID')}
              </span>
            )}
          </div>
          <div className="text-emerald-400 text-sm font-semibold mt-1">
            Hemat {tier.discountPct}% · Sekali bayar SELAMANYA
          </div>
          <div className="mt-3 text-neutral-300 text-sm">
            Dapat <span className="text-amber-400 font-semibold">100 kredit langsung</span> plus{' '}
            <span className="text-amber-400 font-semibold">+100 kredit setiap bulan selamanya</span>.
            Cocok untuk kreator serius yang mau invest jangka panjang.
          </div>
        </div>

        <div>
          <ul className="space-y-2">
            {tier.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-200">
                <span className="text-amber-400 shrink-0 mt-0.5">★</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={onBuy}
            className="w-full mt-4 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-purple-500 to-amber-500 text-white hover:opacity-90 transition"
          >
            Klaim Founder Lifetime
          </button>
        </div>
      </div>
    </div>
  )
}

function ValueRow({ Icon, title, body }: { Icon: React.ComponentType<{ size?: number; className?: string }>; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
      <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-white shrink-0">
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-semibold">{title}</div>
        <div className="text-neutral-400 text-[11px] leading-relaxed">{body}</div>
      </div>
    </div>
  )
}
