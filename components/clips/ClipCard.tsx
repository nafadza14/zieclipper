'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ClipSuggestion } from '@/store/types'
import { formatDuration } from '@/lib/youtube'

const TYPE_STYLES: Record<string, { dot: string; text: string }> = {
  educational:  { dot: 'bg-sky-400',    text: 'text-sky-400' },
  funny:        { dot: 'bg-amber-400',  text: 'text-amber-400' },
  emotional:    { dot: 'bg-pink-400',   text: 'text-pink-400' },
  controversial:{ dot: 'bg-orange-400', text: 'text-orange-400' },
  story:        { dot: 'bg-emerald-400',text: 'text-emerald-400' },
  other:        { dot: 'bg-zinc-400',   text: 'text-zinc-400' },
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 8 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : score >= 5 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-red-400 border-red-500/30 bg-red-500/10'
  return (
    <div className={`absolute top-2.5 right-2.5 h-7 px-2 rounded-lg border flex items-center gap-1 text-xs font-bold backdrop-blur-sm ${color}`}>
      <span className="text-[10px] opacity-70">★</span>{score}
    </div>
  )
}

interface Props { clip: ClipSuggestion; index: number; jobId: string; priority?: boolean }

export function ClipCard({ clip, index, jobId, priority = false }: Props) {
  const router = useRouter()
  const duration = clip.end_time - clip.start_time
  const typeStyle = TYPE_STYLES[clip.clip_type] || TYPE_STYLES.other
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <div
      className="group bg-[#0d0d16] border border-white/[0.07] rounded-2xl overflow-hidden hover:border-white/20 hover:shadow-lg hover:shadow-white/5 transition-all duration-200 cursor-pointer"
      onClick={() => router.push(`/editor/${jobId}/${index}`)}
    >
      {/* Thumbnail — 9:16 portrait, face-aware crop (server-side).
          `priority` cards start loading immediately; the rest lazy-load as
          they scroll into view. Skeleton pulse shows until first paint so
          the card doesn't look broken on a slow connection. */}
      <div className="relative bg-[#07070b] overflow-hidden" style={{ aspectRatio: '9 / 16' }}>
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.04] to-white/[0.02]" />
        )}
        <img
          src={`/api/thumbnail/${jobId}/${index}`}
          alt={clip.title}
          className={`w-full h-full object-cover group-hover:scale-[1.03] transition-all duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setImgLoaded(true)}
        />
        <ScorePill score={clip.score} />
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5 text-[11px] text-white/90 font-medium">
          {formatDuration(duration)}
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-200 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-white text-sm">
            ▶
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">{clip.title}</h3>
          <p className="text-[#7c7490] text-xs mt-1.5 line-clamp-2 leading-relaxed">{clip.hook}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`flex items-center gap-1 text-xs font-medium ${typeStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${typeStyle.dot}`} />
            {clip.clip_type}
          </span>
          {clip.reasons.slice(0, 1).map((r, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[#7c7490]">
              {r}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#413d52] font-mono">
            {formatDuration(clip.start_time)} – {formatDuration(clip.end_time)}
          </span>
          <span className="text-[11px] text-white/70 font-medium group-hover:text-white transition-colors">
            Edit →
          </span>
        </div>
      </div>
    </div>
  )
}
