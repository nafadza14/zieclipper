'use client'
import { useEffect, useRef, useState } from 'react'
import type { SubtitleChunk } from '@/store/types'

// Timeline strip below the preview, OpusClip-style. Shows every caption
// chunk as a clickable ribbon spanning its (start..end) proportion of the
// clip; click one → parent seeks video to that time. Playhead line updates
// via a passive `timeupdate` listener on the given video element (no
// polling), so the highlight follows playback in real time.
interface Props {
  chunks: SubtitleChunk[]
  clipStart: number
  clipEnd: number
  videoEl?: HTMLVideoElement | null    // for playhead sync (optional; falls back to no playhead)
  onSeek: (secondsFromClipStart: number) => void
}

export function Timeline({ chunks, clipStart, clipEnd, videoEl, onSeek }: Props) {
  const [playhead, setPlayhead] = useState(0)
  const rafRef = useRef<number | null>(null)
  const clipDur = Math.max(0.1, clipEnd - clipStart)

  useEffect(() => {
    if (!videoEl) return
    let mounted = true
    const tick = () => {
      if (!mounted || !videoEl) return
      setPlayhead(videoEl.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      mounted = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [videoEl])

  // Chunk timings in the store are in ABSOLUTE source time (clip.start_time
  // ... clip.end_time). Convert to clip-local seconds for positioning on the
  // 0..clipDur strip.
  return (
    <div className="w-full max-w-3xl mx-auto mt-3">
      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono uppercase tracking-wider mb-1 px-0.5">
        <span>Timeline</span>
        <span>
          {playhead.toFixed(1)}s / {clipDur.toFixed(1)}s
        </span>
      </div>
      <div
        className="relative h-12 rounded-lg bg-[#0d0d16] border border-white/[0.06] overflow-hidden cursor-crosshair"
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
          const frac = (e.clientX - rect.left) / rect.width
          onSeek(Math.max(0, Math.min(clipDur, frac * clipDur)))
        }}
      >
        {/* Chunk ribbons */}
        {chunks.map((c) => {
          const startLocal = Math.max(0, c.chunkStart - clipStart)
          const endLocal = Math.min(clipDur, c.chunkEnd - clipStart)
          if (endLocal <= startLocal) return null
          const left = (startLocal / clipDur) * 100
          const width = ((endLocal - startLocal) / clipDur) * 100
          const active = playhead >= startLocal - 0.05 && playhead <= endLocal + 0.05
          return (
            <button
              key={c.id}
              onClick={(ev) => {
                ev.stopPropagation()
                onSeek(startLocal)
              }}
              title={c.text}
              className={`absolute top-1.5 h-9 rounded-md border overflow-hidden text-left px-1.5 transition ${
                active
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/[0.04] border-white/[0.08] text-neutral-400 hover:bg-white/10 hover:text-white'
              }`}
              style={{ left: `${left}%`, width: `${width}%`, minWidth: 6 }}
            >
              <span className="text-[9px] leading-none block truncate">{c.text}</span>
            </button>
          )
        })}
        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-px bg-white pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.7)]"
          style={{ left: `${Math.min(100, (playhead / clipDur) * 100)}%` }}
        />
      </div>
    </div>
  )
}
