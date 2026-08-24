'use client'
import Link from 'next/link'
import { DashboardShell } from './DashboardShell'

// Reusable "planned but not built yet" page so the sidebar routes for
// upload/templates/schedule/settings resolve to something honest instead of
// a 404. Uses the same shell as the real pages, so nav stays consistent.
export function ComingSoon({
  title,
  description,
  eta,
}: {
  title: string
  description: string
  eta?: string
}) {
  return (
    <DashboardShell title={title}>
      <div className="max-w-xl mx-auto text-center py-20 space-y-4">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300 bg-amber-400/10 border border-amber-400/30 rounded-full px-3 py-1">
          Coming soon
        </div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-neutral-400 text-sm leading-relaxed">{description}</p>
        {eta && <div className="text-[11px] text-neutral-600">{eta}</div>}
        <Link
          href="/"
          className="inline-block bg-white text-black text-xs font-semibold rounded-full px-4 py-2 hover:bg-neutral-200 transition mt-4"
        >
          Back to New Clip
        </Link>
      </div>
    </DashboardShell>
  )
}
