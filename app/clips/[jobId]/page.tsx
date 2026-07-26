'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ClipCard } from '@/components/clips/ClipCard'
import type { Job } from '@/store/types'
import { formatDuration } from '@/lib/youtube'
import { useAuth } from '@/hooks/useAuth'

export default function ClipsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLang, setSelectedLang] = useState<string>('')
  const [retranscribing, setRetranscribing] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/auth?next=${encodeURIComponent(`/clips/${jobId}`)}`)
      return
    }

    if (user) {
      fetch(`/api/jobs/${jobId}`)
        .then((r) => r.json())
        .then((j: Job) => {
          setJob(j)
          setSelectedLang(j.activeSubtitleLang ?? j.availableSubtitles?.[0]?.code ?? '')
          setLoading(false)
        })
        .catch((e) => { setError(e.message); setLoading(false) })
    }
  }, [jobId, user, authLoading, router])

  async function switchSubtitle(lang: string) {
    if (lang === selectedLang || retranscribing) return
    setRetranscribing(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/retranscript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to switch subtitle')
      }
      setSelectedLang(lang)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRetranscribing(false)
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (error || !job) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-500/8 border border-red-500/20 rounded-2xl px-6 py-4 text-red-400 text-sm">
          {error || 'Job not found'}
        </div>
      </div>
    )
  }

  const clips = [...(job.clips || [])].sort((a, b) => b.score - a.score)
  const autoSubs = (job.availableSubtitles ?? []).filter((s) => s.is_generated)
  const manualSubs = (job.availableSubtitles ?? []).filter((s) => !s.is_generated)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#07070b]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-[#7c7490] hover:text-white transition-colors text-sm font-medium"
          >
            <span className="text-xs">←</span> Back
          </button>
          <div className="h-4 w-px bg-white/[0.08]" />
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-sm font-semibold truncate">{job.title}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {job.duration ? (
              <span className="text-[#413d52] text-xs font-mono">{formatDuration(job.duration)}</span>
            ) : null}
            <span className="bg-white/10 border border-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded-lg">
              {clips.length} clips
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-2xl">
              🎬
            </div>
            <p className="text-[#7c7490]">No clips found. Try a different video.</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-1">Viral Moments</h2>
              <p className="text-[#7c7490] text-sm">
                AI found <span className="text-white font-medium">{clips.length} clips</span> sorted by viral potential
              </p>
            </div>

            {/* Subtitle picker */}
            {(autoSubs.length > 0 || manualSubs.length > 0) && (
              <div className="mb-8 bg-[#0d0d16]/60 border border-white/[0.06] rounded-2xl p-5 space-y-3 max-w-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white/70 text-sm font-semibold">Subtitles Language</span>
                  {retranscribing && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                <div className="relative">
                  <select
                    value={selectedLang}
                    onChange={(e) => switchSubtitle(e.target.value)}
                    disabled={retranscribing}
                    className="w-full bg-[#13131e] text-white border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white transition-colors cursor-pointer appearance-none font-semibold text-center"
                  >
                    {autoSubs.length > 0 && (
                      <optgroup label="Auto-generated" className="bg-[#13131e]">
                        {autoSubs.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {manualSubs.length > 0 && (
                      <optgroup label="Manual" className="bg-[#13131e]">
                        {manualSubs.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {clips.map((clip) => {
                const origIdx = (job.clips || []).indexOf(clip)
                return <ClipCard key={origIdx} clip={clip} index={origIdx} jobId={jobId} />
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
