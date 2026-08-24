'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { useAuth } from '@/hooks/useAuth'
import { formatDuration } from '@/lib/youtube'

interface JobRow {
  id: string
  status: string
  url: string
  title?: string | null
  duration?: number | null
  clipCount: number
  error?: string | null
  createdAt: string
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  ready:        { label: 'Ready',        cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  error:        { label: 'Error',        cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  downloading:  { label: 'Downloading',  cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  transcribing: { label: 'Transcribing', cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  analyzing:    { label: 'Analyzing',    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function LibraryPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth?next=/library')
      return
    }
    if (user) {
      fetch('/api/jobs')
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error)
          setJobs(d.jobs ?? [])
        })
        .catch((e) => setError(e.message))
    }
  }, [user, authLoading, router])

  return (
    <DashboardShell
      title="My Clips"
      subtitle={jobs ? `${jobs.length} project${jobs.length === 1 ? '' : 's'}` : 'Loading…'}
      actions={
        <Link
          href="/"
          className="bg-white text-black text-xs font-semibold rounded-full px-4 py-2 hover:bg-neutral-200 transition"
        >
          + New Clip
        </Link>
      }
    >
      {error && (
        <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {!jobs && !error && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {jobs && jobs.length === 0 && (
        <div className="border border-dashed border-white/[0.08] rounded-2xl py-20 text-center">
          <div className="text-4xl mb-3">📼</div>
          <div className="text-white font-semibold mb-1">No clips yet</div>
          <div className="text-neutral-500 text-sm mb-5">Paste a YouTube URL to get started.</div>
          <Link
            href="/"
            className="inline-block bg-white text-black text-xs font-semibold rounded-full px-4 py-2 hover:bg-neutral-200 transition"
          >
            Create first clip
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map((j) => {
            const s = STATUS_STYLES[j.status] || { label: j.status, cls: 'text-neutral-400 bg-white/5 border-white/10' }
            const clickable = j.status === 'ready'
            const body = (
              <div className={`bg-[#0d0d16] border border-white/[0.07] rounded-2xl p-4 space-y-3 transition ${clickable ? 'hover:border-white/20 hover:shadow-lg hover:shadow-white/5 cursor-pointer' : 'opacity-70'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold line-clamp-2">
                      {j.title || 'Untitled video'}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono truncate mt-1">{j.url}</div>
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>
                    {j.duration ? formatDuration(j.duration) : '-'}
                    {' · '}
                    {j.clipCount} {j.clipCount === 1 ? 'clip' : 'clips'}
                  </span>
                  <span>{relTime(j.createdAt)}</span>
                </div>
                {j.status === 'error' && j.error && (
                  <div className="text-[11px] text-red-400/80 border border-red-500/20 bg-red-500/5 rounded-lg px-2 py-1.5 line-clamp-2">
                    {j.error}
                  </div>
                )}
              </div>
            )
            return clickable
              ? <Link key={j.id} href={`/clips/${j.id}`}>{body}</Link>
              : <div key={j.id}>{body}</div>
          })}
        </div>
      )}
    </DashboardShell>
  )
}
