'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { SUGGESTED_AMOUNTS, MIN_TOPUP, creditsFromRupiah } from '@/server/credits'

interface Tx {
  id: string
  amount: number
  kind: string
  description: string | null
  ref_job_id: string | null
  created_at: string
}

interface SocialAccount {
  id: string
  platform: string
  display_name: string | null
  avatar_url: string | null
}

const KIND_LABEL: Record<string, string> = {
  signup_bonus: 'Bonus registrasi',
  topup:        'Top-up',
  generate:     'Generate video',
  export:       'Export',
  face_track:   'Face tracking',
  refund:       'Refund',
  manual:       'Manual',
}

function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [socials, setSocials] = useState<SocialAccount[]>([])
  const [topupBusy, setTopupBusy] = useState(false)
  const [topupError, setTopupError] = useState<string | null>(null)
  const [topupAmount, setTopupAmount] = useState<number>(14_000)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth?next=/settings')
  }, [authLoading, user, router])

  async function loadAll() {
    const c = await fetch('/api/credits').then((r) => r.json()).catch(() => null)
    if (c) { setBalance(c.balance ?? 0); setTxs(c.transactions ?? []) }
    const s = await fetch('/api/social').then((r) => r.json()).catch(() => null)
    if (s) setSocials(s.accounts ?? [])
  }

  useEffect(() => { if (user) loadAll() }, [user])

  async function topup() {
    setTopupBusy(true); setTopupError(null)
    const res = await fetch('/api/credits/topup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: topupAmount }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setTopupError(d.error || 'top-up gagal')
    else await loadAll()
    setTopupBusy(false)
  }

  async function disconnectSocial(id: string, platform: string) {
    if (!confirm(`Putuskan akun ${platform}?`)) return
    await fetch(`/api/social/${id}`, { method: 'DELETE' })
    await loadAll()
  }

  return (
    <DashboardShell title="Settings">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Profile */}
        <Section id="profile" title="Profile" subtitle="Info akun Supabase Anda.">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-lg font-semibold text-white">
              {(user?.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="text-white font-semibold">{user?.email ?? '-'}</div>
              <div className="text-[11px] text-neutral-500 font-mono">{user?.id?.slice(0, 12) ?? ''}…</div>
            </div>
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
              className="text-xs text-neutral-400 hover:text-white transition border border-white/10 rounded-lg px-3 py-2"
            >
              Sign out
            </button>
          </div>
        </Section>

        {/* Credits & billing */}
        <Section id="credits" title="Credits & Billing" subtitle="Saldo, top-up, riwayat transaksi.">
          <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold">Saldo saat ini</div>
            <div className="text-white text-4xl font-bold mt-1">
              {balance === null ? '-' : balance.toLocaleString('id-ID')}
              <span className="text-amber-400 text-sm ml-2 font-semibold">kredit</span>
            </div>
            <div className="text-[11px] text-neutral-400 mt-1">
              1 kredit ≈ 1 generate video ≤10 menit. <Link href="/docs/credits" className="underline text-white">Detail konsumsi →</Link>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-2">Top-up</div>
            <TopUpForm
              amount={topupAmount}
              setAmount={setTopupAmount}
              busy={topupBusy}
              onSubmit={topup}
              error={topupError}
            />
            <div className="mt-3 text-[10px] text-neutral-500">
              Pembayaran diproses melalui gateway yang aman. Kredit langsung masuk setelah pembayaran terkonfirmasi.
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-2">Riwayat transaksi</div>
            <div className="bg-[#0d0d16] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04]">
              {txs.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">Belum ada transaksi.</div>
              ) : txs.map((t) => (
                <div key={t.id} className="flex items-center px-4 py-2.5 gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    t.amount > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {t.amount > 0 ? '+' : '−'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">
                      {t.description || KIND_LABEL[t.kind] || t.kind}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {KIND_LABEL[t.kind] || t.kind} · {relTime(t.created_at)}
                    </div>
                  </div>
                  <div className={`text-sm font-semibold font-mono shrink-0 ${t.amount > 0 ? 'text-emerald-400' : 'text-neutral-300'}`}>
                    {t.amount > 0 ? '+' : ''}{t.amount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Connected social accounts */}
        <Section id="accounts" title="Connected Accounts" subtitle="Hubungkan akun sosmed untuk auto-post klip Anda.">
          <div className="space-y-3">
            <SocialRow
              platform="youtube"
              icon="▶"
              label="YouTube Shorts"
              connected={socials.filter((s) => s.platform === 'youtube')}
              onConnect={() => { window.location.href = '/api/social/youtube/connect' }}
              onDisconnect={(id) => disconnectSocial(id, 'YouTube')}
            />
            <SocialRow platform="tiktok" icon="♫" label="TikTok" connected={[]} disabled reason="Butuh approval TikTok Content Posting API (5-14 hari review)." />
            <SocialRow platform="instagram" icon="📷" label="Instagram Reels" connected={[]} disabled reason="Butuh Meta app review + Instagram Business account." />
          </div>
        </Section>

        {/* Preferences */}
        <Section id="preferences" title="Preferences" subtitle="Kustomisasi default untuk generate & export.">
          <div className="text-sm text-neutral-400">
            Opsi lebih lanjut segera tersedia. Untuk saat ini, semua klip diproses dengan preset optimal secara otomatis.
          </div>
        </Section>
      </div>
    </DashboardShell>
  )
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <div className="mb-3">
        <h2 className="text-white text-lg font-bold">{title}</h2>
        {subtitle && <div className="text-neutral-500 text-xs">{subtitle}</div>}
      </div>
      <div className="bg-[#0d0d16] border border-white/[0.06] rounded-2xl p-5">
        {children}
      </div>
    </section>
  )
}

function SocialRow({
  platform, icon, label, connected, onConnect, onDisconnect, disabled, reason,
}: {
  platform: string
  icon: string
  label: string
  connected: SocialAccount[]
  onConnect?: () => void
  onDisconnect?: (id: string) => void
  disabled?: boolean
  reason?: string
}) {
  void platform
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.06]">
      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/[0.06] flex items-center justify-center text-lg">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-semibold">{label}</div>
        {connected.length > 0 ? (
          <div className="text-[11px] text-emerald-400">{connected.map((a) => a.display_name || '-').join(', ')}</div>
        ) : disabled ? (
          <div className="text-[11px] text-neutral-500">{reason}</div>
        ) : (
          <div className="text-[11px] text-neutral-500">Belum terhubung</div>
        )}
      </div>
      {connected.length > 0 ? (
        <button
          onClick={() => onDisconnect?.(connected[0].id)}
          className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg px-3 py-2 transition"
        >
          Disconnect
        </button>
      ) : disabled ? (
        <span className="text-[9px] uppercase tracking-wider text-neutral-600 border border-neutral-800 rounded-full px-2 py-1">soon</span>
      ) : (
        <button
          onClick={onConnect}
          className="text-xs bg-white text-black font-semibold rounded-lg px-3 py-2 hover:bg-neutral-200 transition"
        >
          Connect
        </button>
      )}
    </div>
  )
}

// Free-form top-up form: user types any Rupiah amount (≥ Rp 14.000),
// live preview shows how many credits + bonus they'll get. Suggested
// amount chips just prefill the input, they don't lock the value.
function TopUpForm({ amount, setAmount, busy, onSubmit, error }: {
  amount: number
  setAmount: (n: number) => void
  busy: boolean
  onSubmit: () => void
  error: string | null
}) {
  const q = creditsFromRupiah(amount)
  const belowMin = amount < MIN_TOPUP
  return (
    <div className="bg-[#0d0d16] border border-white/[0.08] rounded-xl p-4 space-y-3">
      {/* Amount input */}
      <label className="block">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">Nominal top-up</div>
        <div className="flex items-center bg-black/40 border border-white/10 focus-within:border-white rounded-lg px-3 py-2.5 transition">
          <span className="text-neutral-400 text-sm mr-2">Rp</span>
          <input
            type="text"
            inputMode="numeric"
            value={amount ? amount.toLocaleString('id-ID') : ''}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '')
              setAmount(raw ? parseInt(raw, 10) : 0)
            }}
            placeholder={MIN_TOPUP.toLocaleString('id-ID')}
            className="flex-1 bg-transparent text-white text-lg font-semibold focus:outline-none placeholder-neutral-600"
          />
        </div>
      </label>

      {/* Suggested chips */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_AMOUNTS.map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className={`text-xs rounded-full px-3 py-1 border transition ${
              amount === v
                ? 'bg-white text-black border-white font-semibold'
                : 'bg-white/[0.04] text-neutral-300 border-white/[0.08] hover:border-white/25'
            }`}
          >
            Rp {v.toLocaleString('id-ID')}
          </button>
        ))}
      </div>

      {/* Live preview */}
      <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-lg p-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold">Anda akan dapat</div>
          {q.bonusPct > 0 && (
            <span className="text-[10px] text-emerald-400 font-semibold">+{q.bonusPct}% bonus</span>
          )}
        </div>
        <div className="text-white text-3xl font-bold mt-0.5 flex items-baseline gap-2">
          {q.total.toLocaleString('id-ID')}
          <span className="text-amber-400 text-sm font-semibold">kredit</span>
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5">
          {q.base.toLocaleString('id-ID')} base
          {q.bonus > 0 && ` + ${q.bonus.toLocaleString('id-ID')} bonus`}
          {q.total > 0 && ` · efektif Rp ${Math.round(q.rupiahPerCredit).toLocaleString('id-ID')} / kredit`}
        </div>
      </div>

      {belowMin && (
        <div className="text-[11px] text-amber-400/90">
          Minimum top-up Rp {MIN_TOPUP.toLocaleString('id-ID')}.
        </div>
      )}
      {error && (
        <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</div>
      )}

      <button
        onClick={onSubmit}
        disabled={busy || belowMin}
        className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {busy ? 'Memproses…' : `Top-up Rp ${amount.toLocaleString('id-ID')}`}
      </button>
    </div>
  )
}
