'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const FEATURES = ['word highlight', 'auto subtitles', 'ai viral analysis', '9:16 export', 'font presets', 'emoji overlays']

const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'downloading video…',             pct: 20 },
  transcribing: { label: 'fetching transcript…',           pct: 50 },
  analyzing:    { label: 'finding viral moments with ai…', pct: 80 },
  ready:        { label: 'done!',                          pct: 100 },
}

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
    setLoading(true); setError(null); setStep('starting…'); setPct(5)

    // The whole download -> transcript -> AI-analysis pipeline now runs
    // inside this one POST /api/download call (no separate worker that can
    // keep working after a response goes out -- see app/api/download/route.ts).
    // So the jobId is generated here, on the client, and polling starts
    // immediately in parallel with the POST -- that's what keeps the
    // progress bar moving instead of freezing on "starting…" for the whole
    // 30-90s the request is in flight.
    const jobId = crypto.randomUUID()
    let downloadError: string | null = null

    const downloadPromise = fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        url: url.trim(),
        model: 'gpt-4o-mini',
        provider: 'sumopod',
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        downloadError = data.error || 'failed to process video'
      }
    }).catch((err) => {
      downloadError = err.message || 'network error while starting the job'
    })

    try {
      await pollJob(jobId, () => downloadError)
    } catch (err: any) {
      setError(err.message); setLoading(false); setStep(null); setPct(0)
    } finally {
      // Make sure the request settles even if pollJob already returned/threw.
      downloadPromise.catch(() => {})
    }
  }

  async function pollJob(jobId: string, getDownloadError: () => string | null) {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.status === 404) {
        // The POST may not have inserted the row yet, or it failed before
        // it could -- if we already know it failed, surface that instead
        // of waiting out the full timeout on repeated 404s.
        const failMsg = getDownloadError()
        if (failMsg) throw new Error(failMsg)
        continue
      }
      const job = await res.json()
      if (!res.ok) throw new Error(job.error || 'job lost (server restarted?)')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'processing failed')
    }
    const failMsg = getDownloadError()
    throw new Error(failMsg || 'timed out')
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

        {/* Right button & Auth status */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-neutral-400 font-medium font-mono">{user.email}</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-neutral-900/80 border border-white/10 hover:border-white/30 text-white text-xs font-semibold rounded-full px-4 py-2.5 transition cursor-pointer"
              >
                sign out
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/auth')}
              className="bg-neutral-900/80 border border-white/10 hover:border-white/30 text-white text-xs font-semibold rounded-full px-4 py-2.5 transition cursor-pointer"
            >
              sign in
            </button>
          )}
          <button
            onClick={() => {
              if (user) {
                inputRef.current?.focus()
              } else {
                router.push('/auth')
              }
            }}
            className="bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-neutral-200 transition-colors cursor-pointer shadow-lg"
          >
            start clipping
          </button>
        </div>
      </nav>

      {/* Foreground content wrapper */}
      <div className="relative h-full w-full z-10 pointer-events-none">
        {/* Three giant staggered headline words */}
        <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] left-4 md:left-10 top-[12%] md:top-[14%] pointer-events-auto">
          clip
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] right-4 md:right-10 top-[24%] md:top-[30%] pointer-events-auto">
          your
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[12vw] md:text-[13vw] left-4 md:left-[18%] top-[84%] md:top-[68%] pointer-events-auto">
          video
        </h1>

        {/* Description paragraph */}
        <p className="absolute left-6 md:left-10 top-[35%] md:top-[48%] max-w-[180px] md:max-w-[240px] text-xs md:text-[15px] leading-snug text-white/90 pointer-events-auto">
          we slice your video with utmost care, empowering your reach everywhere
        </p>

        {/* Embedded Input Form directly on the landing page (centered) */}
        <div className="absolute left-1/2 top-[53%] md:top-1/2 -translate-x-1/2 md:-translate-y-1/2 max-w-[90%] sm:max-w-[400px] md:max-w-[640px] w-full px-4 pointer-events-auto space-y-4 z-30 text-center">

          {!loading ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="paste youtube url…"
                  className="w-full bg-white rounded-full px-8 py-4 md:py-5 text-black placeholder-neutral-400 focus:outline-none text-base md:text-lg transition-colors shadow-2xl"
                />
              </div>

              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-3.5 md:py-4 rounded-full bg-white text-black font-semibold text-base md:text-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg"
              >
                find viral moments →
              </button>

              {/* Feature pills under the button */}
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto pt-4 pointer-events-auto">
                {FEATURES.map((f) => (
                  <span
                    key={f}
                    className="px-3 py-1 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-white"
                  >
                    {f}
                  </span>
                ))}
              </div>

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
        <div className="absolute right-6 md:right-24 top-[12%] md:top-[14%] flex flex-col items-end pointer-events-auto">
          <div className="flex items-center gap-2 md:gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 rotate-[20deg]" />
            <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+65k</span>
          </div>
          <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1 text-right">videos clipped</span>
        </div>

        {/* Stat block - bottom-left */}
        <div className="absolute left-6 md:left-20 bottom-[14%] md:bottom-24 flex flex-col items-start pointer-events-auto">
          <div className="flex items-center gap-2 md:gap-3">
            <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+1.5b</span>
            <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
          </div>
          <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1">views generated</span>
        </div>

        {/* Stat block - bottom-right */}
        <div className="absolute right-6 md:right-20 bottom-[6%] md:bottom-20 flex flex-col items-end pointer-events-auto">
          <div className="flex items-center gap-2 md:gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 -rotate-[20deg]" />
            <span className="text-2xl md:text-5xl font-medium tracking-tight text-white">+300k</span>
          </div>
          <span className="text-[10px] md:text-sm text-white/70 mt-0.5 md:mt-1 text-right">downloads</span>
        </div>
      </div>

    </section>
  )
}
