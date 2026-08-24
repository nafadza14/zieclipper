'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { MarketingShell } from '@/components/marketing/MarketingShell'

const FEATURES = ['word highlight', 'auto subtitles', 'ai viral analysis', '9:16 export', 'font presets', 'emoji overlays']

const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'downloading video…',             pct: 20 },
  transcribing: { label: 'fetching transcript…',           pct: 50 },
  analyzing:    { label: 'finding viral moments with ai…', pct: 80 },
  ready:        { label: 'done!',                          pct: 100 },
}

// Landing = single fullscreen hero. No scroll to sections; the navbar
// links (platform/pricing/company/support) route to separate pages that
// share this same background via MarketingShell.
export default function HomePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    if (!user) { router.push('/auth?next=/new'); return }
    setLoading(true); setError(null); setStep('starting…'); setPct(5)
    const jobId = crypto.randomUUID()
    let downloadError: string | null = null
    const downloadPromise = fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, url: url.trim(), model: 'gpt-4o-mini', provider: 'sumopod' }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        downloadError = data.error || 'failed to process video'
      }
    }).catch((err) => { downloadError = err.message })

    try {
      await pollJob(jobId, () => downloadError)
    } catch (err: any) {
      setError(err.message); setLoading(false); setStep(null); setPct(0)
    } finally {
      downloadPromise.catch(() => {})
    }
  }

  async function pollJob(jobId: string, getErr: () => string | null) {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.status === 404) { const fm = getErr(); if (fm) throw new Error(fm); continue }
      const job = await res.json()
      if (!res.ok) throw new Error(job.error || 'job lost')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'processing failed')
    }
    throw new Error(getErr() || 'timed out')
  }

  return (
    <MarketingShell>
      {/* Three giant staggered headline words */}
      <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] left-4 md:left-10 top-[12%] md:top-[14%] pointer-events-auto">clip</h1>
      <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] right-4 md:right-10 top-[24%] md:top-[30%] pointer-events-auto">your</h1>
      <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] left-4 md:left-[18%] top-[84%] md:top-[68%] pointer-events-auto">video</h1>

      <p className="absolute left-6 md:left-10 top-[35%] md:top-[48%] max-w-[180px] md:max-w-[240px] text-xs md:text-[15px] leading-snug text-white/90 pointer-events-auto">
        we slice your video with utmost care, empowering your reach everywhere
      </p>

      {/* Centered input / progress */}
      <div className="absolute left-1/2 top-[53%] md:top-1/2 -translate-x-1/2 md:-translate-y-1/2 max-w-[90%] sm:max-w-[400px] md:max-w-[640px] w-full px-4 pointer-events-auto space-y-4 z-30 text-center">
        {!loading ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="paste youtube url…"
              className="w-full bg-white rounded-full px-8 py-4 md:py-5 text-black placeholder-neutral-400 focus:outline-none text-base md:text-lg transition-colors shadow-2xl"
            />
            <button type="submit" disabled={!url.trim()} className="w-full py-3.5 md:py-4 rounded-full bg-white text-black font-semibold text-base md:text-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg">
              find viral moments →
            </button>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto pt-4">
              {FEATURES.map((f) => (
                <span key={f} className="px-3 py-1 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-white">{f}</span>
              ))}
            </div>
            {error && (
              <div className="bg-red-950/20 border border-red-900/30 rounded-2xl px-4 py-3 text-red-400 text-xs">{error}</div>
            )}
          </form>
        ) : (
          <div className="bg-neutral-950/85 backdrop-blur border border-white/10 rounded-3xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-white text-sm font-medium">{step}</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-neutral-500 text-xs text-center">this usually takes 30–60 seconds</p>
          </div>
        )}
      </div>

      {/* Stat blocks */}
      <div className="absolute right-6 md:right-24 top-[12%] md:top-[14%] flex flex-col items-end pointer-events-auto">
        <div className="flex items-center gap-2 md:gap-3 justify-end">
          <span className="hidden md:block h-px w-24 bg-white/40 rotate-[20deg]" />
          <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+65k</span>
        </div>
        <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1 text-right">videos clipped</span>
      </div>
      <div className="absolute left-6 md:left-20 bottom-[14%] md:bottom-24 flex flex-col items-start pointer-events-auto">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+1.5b</span>
          <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
        </div>
        <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1">views generated</span>
      </div>
      <div className="absolute right-6 md:right-20 bottom-[6%] md:bottom-20 flex flex-col items-end pointer-events-auto">
        <div className="flex items-center gap-2 md:gap-3 justify-end">
          <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
          <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+300k</span>
        </div>
        <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1 text-right">downloads</span>
      </div>
    </MarketingShell>
  )
}
