'use client'
import type { ClipSuggestion } from '@/store/types'

const TYPE_STYLES: Record<string, { dot: string; text: string }> = {
  educational:  { dot: 'bg-sky-400',    text: 'text-sky-400' },
  funny:        { dot: 'bg-amber-400',  text: 'text-amber-400' },
  emotional:    { dot: 'bg-pink-400',   text: 'text-pink-400' },
  controversial:{ dot: 'bg-orange-400', text: 'text-orange-400' },
  story:        { dot: 'bg-emerald-400',text: 'text-emerald-400' },
  other:        { dot: 'bg-zinc-400',   text: 'text-zinc-400' },
}

// Banner above the editor showing WHY the AI picked this moment: the hook
// line, the clip type, and the reasons. OpusClip surfaces this so the
// editor understands the intent before tweaking captions/framing -- makes
// the AI's suggestion feel like a collaboration, not a black box.
export function HookBanner({ clip }: { clip: ClipSuggestion }) {
  const type = TYPE_STYLES[clip.clip_type] || TYPE_STYLES.other
  return (
    <div className="bg-gradient-to-r from-white/[0.03] to-transparent border-b border-white/[0.06] px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-bold">Hook</span>
            <span className={`flex items-center gap-1 text-[10px] font-medium ${type.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${type.dot}`} />
              {clip.clip_type}
            </span>
          </div>
          <p className="text-white text-sm font-medium leading-snug line-clamp-2 italic">
            &ldquo;{clip.hook}&rdquo;
          </p>
          {clip.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {clip.reasons.slice(0, 4).map((r, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-neutral-400"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
