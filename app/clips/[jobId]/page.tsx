'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ClipCard } from '@/components/clips/ClipCard'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
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
      <DashboardShell title="Loading…">
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardShell>
    )
  }

  if (!user) return null

  if (error || !job) {
    return (
      <DashboardShell title="Clips">
        <div className="max-w-lg mx-auto mt-16 bg-red-500/8 border border-red-500/20 rounded-2xl px-6 py-5 text-red-400 text-sm">
          {error || 'Job not found'}
        </div>
      </DashboardShell>
    )
  }

  const clips = [...(job.clips || [])].sort((a, b) => b.score - a.score)
  const autoSubs = (job.availableSubtitles ?? []).filter((s) => s.is_generated)
  const manualSubs = (job.availableSubtitles ?? []).filter((s) => !s.is_generated)
  const avgScore = clips.length ? (clips.reduce((s, c) => s + c.score, 0) / clips.length).toFixed(1) : '-'
  const topScore = clips.length ? Math.max(...clips.map((c) => c.score)) : 0

  return (
    <DashboardShell
      title={job.title || 'Untitled video'}
      subtitle={
        <span className="font-mono">
          {job.duration ? formatDuration(job.duration) : '-'} · {clips.length} clips
        </span>
      }
      actions={
        <Link
          href="/library"
          className="text-neutral-400 hover:text-white text-xs font-medium transition"
        >
          ← Library
        </Link>
      }
    >
      {clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-2xl">🎬</div>
          <p className="text-[#7c7490]">No clips found. Try a different video.</p>
        </div>
      ) : (
        <>
          {/* Stat tiles — SaaS-style summary of the generation */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatTile label="Clips found" value={String(clips.length)} />
            <StatTile label="Top score" value={`${topScore}`} suffix="/10" />
            <StatTile label="Avg. score" value={avgScore} suffix="/10" />
            <StatTile label="Source" value={job.duration ? formatDuration(job.duration) : '-'} suffix="duration" />
          </div>

          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white mb-0.5">Viral Moments</h2>
              <p className="text-neutral-500 text-xs">Sorted by predicted viral potential. Click a clip to open the editor.</p>
            </div>

            {(autoSubs.length > 0 || manualSubs.length > 0) && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Subs</span>
                {retranscribing && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <select
                  value={selectedLang}
                  onChange={(e) => switchSubtitle(e.target.value)}
                  disabled={retranscribing}
                  className="bg-[#0d0d16] text-white border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-white transition cursor-pointer"
                >
                  {autoSubs.length > 0 && (
                    <optgroup label="Auto-generated" className="bg-[#0d0d16]">
                      {autoSubs.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </optgroup>
                  )}
                  {manualSubs.length > 0 && (
                    <optgroup label="Manual" className="bg-[#0d0d16]">
                      {manualSubs.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Portrait 9:16 cards fit more per row than the old 16:9 layout.
              First 6 cards get priority loading so above-the-fold paints
              immediately; the rest lazy-load as they enter the viewport. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {clips.map((clip, i) => {
              const origIdx = (job.clips || []).indexOf(clip)
              return <ClipCard key={origIdx} clip={clip} index={origIdx} jobId={jobId} priority={i < 6} />
            })}
          </div>
        </>
      )}
    </DashboardShell>
  )
}

function StatTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="bg-[#0d0d16] border border-white/[0.07] rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className="text-white text-xl font-bold mt-1 flex items-baseline gap-1">
        {value}
        {suffix && <span className="text-[10px] text-neutral-500 font-normal">{suffix}</span>}
      </div>
    </div>
  )
}
