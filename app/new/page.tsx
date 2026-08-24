'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { useAuth } from '@/hooks/useAuth'

const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'downloading video…',             pct: 20 },
  transcribing: { label: 'fetching transcript…',           pct: 50 },
  analyzing:    { label: 'finding viral moments with AI…', pct: 80 },
  ready:        { label: 'done!',                          pct: 100 },
}

// In-dashboard "new clip from YouTube URL" flow. Replaces the pattern
// where users had to bounce back to the landing page (/) every time they
// wanted to make a new clip. Same server call, wrapped in DashboardShell
// so the sidebar/nav stays visible during generation.
export default function NewClipPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [needTopup, setNeedTopup] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth?next=/new')
  }, [authLoading, user, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError(null); setNeedTopup(false); setStep('starting…'); setPct(5)

    const jobId = crypto.randomUUID()
    let downloadError: string | null = null

    const downloadPromise = fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, url: url.trim(), model: 'gpt-4o-mini', provider: 'sumopod' }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 402) { setNeedTopup(true); downloadError = 'Kredit tidak cukup. Silakan top-up di halaman Settings.' }
        else downloadError = data.error || 'gagal memproses'
      }
    }).catch((err) => { downloadError = err.message || 'network error' })

    try {
      await pollJob(jobId, () => downloadError)
    } catch (err: any) {
      setError(err.message); setLoading(false); setStep(null); setPct(0)
    } finally {
      downloadPromise.catch(() => {})
    }
  }

  async function pollJob(jobId: string, getDownloadError: () => string | null) {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.status === 404) {
        const fm = getDownloadError()
        if (fm) throw new Error(fm)
        continue
      }
      const job = await res.json()
      if (!res.ok) throw new Error(job.error || 'job lost')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'processing failed')
    }
    throw new Error(getDownloadError() || 'timed out')
  }

  return (
    <DashboardShell title="New Clip" subtitle="Paste URL YouTube untuk mulai. 1 kredit per video ≤10 menit.">
      <div className="max-w-2xl mx-auto">
        {!loading ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-[#0d0d16] border border-white/[0.08] rounded-2xl p-6 space-y-4">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-[#07070b] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors text-sm"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-3.5 rounded-xl bg-white text-black font-semibold hover:bg-neutral-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Find viral moments →
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link href="/upload" className="bg-[#0d0d16] border border-white/[0.06] rounded-xl p-4 hover:border-white/20 transition group">
                <div className="text-2xl mb-2">📼</div>
                <div className="text-white text-sm font-semibold">Upload video file</div>
                <div className="text-[11px] text-neutral-500 mt-1">MP4/MOV/MKV. Cocok untuk video yang tidak punya caption di YouTube.</div>
              </Link>
              <Link href="/library" className="bg-[#0d0d16] border border-white/[0.06] rounded-xl p-4 hover:border-white/20 transition group">
                <div className="text-2xl mb-2">📚</div>
                <div className="text-white text-sm font-semibold">My Clips</div>
                <div className="text-[11px] text-neutral-500 mt-1">Lihat semua klip yang pernah Anda buat.</div>
              </Link>
            </div>

            <div className="bg-[#0d0d16] border border-white/[0.06] rounded-xl p-4 text-[11px] text-neutral-500 leading-relaxed">
              💡 <span className="text-white">Konsumsi kredit</span>: video ≤10 min = 1 kredit · 10–30 min = 2 · 30–60 min = 3 · &gt;60 min = 5.
              Face tracking di export = +1 kredit. Export tanpa face tracking = gratis.
              <Link href="/docs/credits" className="text-white underline ml-1">Baca detail →</Link>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
                {needTopup && (
                  <Link href="/settings#credits" className="ml-2 text-white underline font-semibold">Top-up sekarang</Link>
                )}
              </div>
            )}
          </form>
        ) : (
          <div className="bg-[#0d0d16] border border-white/[0.06] rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-white text-sm font-medium">{step}</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-neutral-500 text-xs text-center">biasanya butuh 30–90 detik</p>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs">
                {error}
                {needTopup && (
                  <Link href="/settings#credits" className="ml-2 text-white underline font-semibold">Top-up →</Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
