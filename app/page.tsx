'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const FEATURES = ['word highlight', 'auto subtitles', 'ai viral analysis', '9:16 export', 'font presets', 'emoji overlays']

const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'downloading video…',             pct: 20 },
  transcribing: { label: 'fetching transcript…',           pct: 50 },
  analyzing:    { label: 'finding viral moments with ai…', pct: 80 },
  ready:        { label: 'done!',                          pct: 100 },
}

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError(null); setStep('starting…'); setPct(5)
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), model: 'gpt-4o-mini', provider: 'sumopod' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed to start')
      await pollJob(data.jobId)
    } catch (err: any) {
      setError(err.message); setLoading(false); setStep(null); setPct(0)
    }
  }

  async function pollJob(jobId: string) {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`/api/jobs/${jobId}`)
      const job = await res.json()
      if (!res.ok) throw new Error(job.error || 'job lost (server restarted?)')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'processing failed')
    }
    throw new Error('timed out')
  }

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black select-none">
      {/* Background video */}
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        autoPlay
        loop
        muted
        playsInline
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_063509_7d167302-4fd4-480b-8260-18ab572333d4.mp4"
      />

      {/* Bottom gradient overlay */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent to-black z-10" />

      {/* Navbar */}
      <nav className="absolute z-20 px-6 md:px-10 pt-6 top-0 left-0 right-0 flex items-center justify-between gap-4">
        {/* Left pill */}
        <div className="flex items-center gap-2 bg-neutral-900/90 backdrop-blur rounded-full pl-4 pr-6 py-3">
          <svg className="h-5 w-5" viewBox="0 0 256 256">
            <path
              d="M 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 128 L 64 128 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z M 128 64 L 128 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 Z M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 128 0 L 192 0 Z"
              fill="#ffffff"
            />
          </svg>
          <span className="text-white text-sm font-normal tracking-tight">zieclipper</span>
        </div>

        {/* Center pill (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-900/90 backdrop-blur rounded-full px-3 py-2">
          {['platform', 'solutions', 'company', 'support'].map((link) => (
            <a
              key={link}
              href={`#${link}`}
              className="text-neutral-300 hover:text-white transition-colors text-sm px-5 py-2 rounded-full"
            >
              {link}
            </a>
          ))}
        </div>

        {/* Right button - focuses the input on landing page */}
        <button
          onClick={() => inputRef.current?.focus()}
          className="bg-white text-black text-sm font-normal rounded-full px-6 py-3 hover:bg-neutral-200 transition-colors cursor-pointer"
        >
          start clipping
        </button>
      </nav>

      {/* Foreground content wrapper */}
      <div className="relative h-full w-full z-10 pointer-events-none">
        {/* Three giant staggered headline words */}
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] left-4 md:left-10 top-[18%] pointer-events-auto">
          clip
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] right-4 md:right-10 top-[38%] pointer-events-auto">
          your
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] left-[18%] md:left-[28%] top-[58%] pointer-events-auto">
          video
        </h1>

        {/* Description paragraph */}
        <p className="absolute left-6 md:left-10 top-[46%] max-w-[240px] text-[15px] leading-snug text-white/90 pointer-events-auto">
          we slice your video with utmost care, empowering your reach everywhere
        </p>

        {/* Embedded Input Form directly on the landing page */}
        <div className="absolute left-6 md:left-10 top-[55%] max-w-[320px] md:max-w-[360px] w-full pointer-events-auto space-y-3">
          {!loading ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="paste youtube url…"
                  className="w-full bg-neutral-900/80 backdrop-blur border border-white/10 rounded-full px-5 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 text-sm transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-3 rounded-full bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                find viral moments →
              </button>
              {error && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-2xl px-4 py-3 text-red-400 text-xs">
                  {error}
                </div>
              )}
            </form>
          ) : (
            <div className="bg-neutral-950/85 backdrop-blur border border-white/10 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-white text-sm font-medium">{step}</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-neutral-500 text-xs text-center">this usually takes 30–60 seconds</p>
            </div>
          )}
        </div>

        {/* Stat block - top-right */}
        <div className="absolute right-6 md:right-24 top-[14%] flex flex-col items-end pointer-events-auto">
          <div className="flex items-center gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 rotate-[20deg]" />
            <span className="text-4xl md:text-5xl font-medium tracking-tight text-white">+65k</span>
          </div>
          <span className="text-xs md:text-sm text-white/70 mt-1 text-right">videos clipped</span>
        </div>

        {/* Stat block - bottom-left */}
        <div className="absolute left-6 md:left-20 bottom-20 md:bottom-24 flex flex-col items-start pointer-events-auto">
          <div className="flex items-center gap-3">
            <span className="text-4xl md:text-5xl font-medium tracking-tight text-white">+1.5b</span>
            <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
          </div>
          <span className="text-xs md:text-sm text-white/70 mt-1">views generated</span>
        </div>

        {/* Stat block - bottom-right */}
        <div className="absolute right-6 md:right-20 bottom-16 md:bottom-20 flex flex-col items-end pointer-events-auto">
          <div className="flex items-center gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
            <span className="text-4xl md:text-5xl font-medium tracking-tight text-white">+300k</span>
          </div>
          <span className="text-xs md:text-sm text-white/70 mt-1 text-right">downloads</span>
        </div>
      </div>

      {/* Feature pills bottom layer */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-wrap gap-2 justify-center max-w-lg px-4 pointer-events-auto">
        {FEATURES.map((f) => (
          <span
            key={f}
            className="px-3 py-1 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-[#7c7490]"
          >
            {f}
          </span>
        ))}
      </div>
    </section>
  )
}
