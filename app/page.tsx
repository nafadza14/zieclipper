'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'gemini', label: 'Gemini' },
]

const MODELS_BY_PROVIDER: Record<string, { id: string; label: string; desc: string }[]> = {
  anthropic: [
    { id: 'claude-opus-4-7',           label: 'Opus',    desc: 'Best quality' },
    { id: 'claude-sonnet-4-6',         label: 'Sonnet',  desc: 'Balanced' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku',   desc: 'Fastest' },
  ],
  deepseek: [
    { id: 'deepseek-chat',     label: 'V3 Chat',     desc: 'Fast & smart' },
    { id: 'deepseek-reasoner', label: 'R1 Reasoner', desc: 'Deep thinking' },
  ],
  gemini: [
    // gemini-2.0-flash & gemini-1.5-pro were retired by Google (mid-2026) — using live models
    { id: 'gemini-2.5-flash', label: '2.5 Flash', desc: 'Fastest' },
    { id: 'gemini-2.5-pro',   label: '2.5 Pro',   desc: 'Best quality' },
  ],
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.5-flash',
}

const FEATURES = ['Word highlight', 'Auto subtitles', 'AI viral analysis', '9:16 export', 'Font presets', 'Emoji overlays']

const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'Downloading video…',             pct: 20 },
  transcribing: { label: 'Fetching transcript…',           pct: 50 },
  analyzing:    { label: 'Finding viral moments with AI…', pct: 80 },
  ready:        { label: 'Done!',                          pct: 100 },
}

export default function HomePage() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function handleProviderClick(pid: string) {
    setProvider(pid)
    setModel(DEFAULT_MODEL[pid])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError(null); setStep('Starting…'); setPct(5)
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), model, provider }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start')
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
      if (!res.ok) throw new Error(job.error || 'Job lost (server restarted?)')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'Processing failed')
    }
    throw new Error('Timed out')
  }

  const models = MODELS_BY_PROVIDER[provider]

  return (
    <main className="glow-bg relative flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden">
      {/* Hero */}
      <div className="relative z-10 w-full max-w-xl text-center mb-10">
        {/* Logo mark */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-2xl shadow-lg shadow-violet-500/30">
            ✂
          </div>
        </div>
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent mb-3">
          Clipper
        </h1>
        <p className="text-[#7c7490] text-lg">
          Turn any YouTube video into viral Shorts — powered by Claude, DeepSeek &amp; Gemini
        </p>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-xl">
        <div className="bg-[#0d0d16]/80 backdrop-blur-xl border border-white/[0.07] rounded-3xl p-6 shadow-2xl shadow-black/60">
          {!loading ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* URL input */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#413d52] select-none text-lg">
                  ▶
                </span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube URL…"
                  className="w-full bg-[#13131e] border border-white/[0.07] rounded-2xl pl-11 pr-5 py-4 text-white placeholder-[#413d52] focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/15 transition duration-200 text-base"
                />
              </div>

              {/* Provider selector */}
              <div className="flex gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderClick(p.id)}
                    className={`flex-1 py-2 px-3 rounded-xl border text-sm font-semibold transition duration-150 ${
                      provider === p.id
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300 shadow-sm shadow-violet-500/10'
                        : 'border-white/[0.07] bg-[#13131e] text-[#7c7490] hover:border-white/15 hover:text-white/70'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Model selector */}
              <div className="flex gap-2">
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={`flex-1 py-2.5 px-3 rounded-xl border text-sm font-medium transition duration-150 ${
                      model === m.id
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-300 shadow-sm shadow-violet-500/10'
                        : 'border-white/[0.07] bg-[#13131e] text-[#7c7490] hover:border-white/15 hover:text-white/70'
                    }`}
                  >
                    <div className="font-semibold">{m.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>

              {/* CTA */}
              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-base shadow-lg shadow-violet-500/20 hover:shadow-violet-500/35 transition duration-200"
              >
                Find Viral Moments →
              </button>

              {error && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </form>
          ) : (
            /* Loading state */
            <div className="py-4 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-white/80 text-sm font-medium">{step}</span>
              </div>
              <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-purple-500 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[#413d52] text-xs text-center">This usually takes 30–60 seconds</p>
            </div>
          )}
        </div>

        {/* Feature pills */}
        {!loading && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="px-3 py-1 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-[#7c7490]"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
