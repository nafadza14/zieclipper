'use client'
import { useEditorStore } from '@/store/editorStore'
import { VIDEO_FORMATS } from '@/lib/formats'

// Small aspect ratio pill switcher shown ABOVE the preview so the user can
// flip 9:16 / 1:1 / 16:9 without opening the Reframe tab -- matches
// OpusClip's flow where the ratio toggle sits on the preview itself.
export function AspectSwitcher() {
  const { settings, updateFormat } = useEditorStore()
  return (
    <div className="flex items-center justify-center gap-1.5 mb-3">
      <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mr-1">Ratio</span>
      <div className="inline-flex bg-[#0d0d16] border border-white/[0.06] rounded-full p-0.5">
        {VIDEO_FORMATS.map((f) => (
          <button
            key={f.value}
            onClick={() => updateFormat(f.value)}
            title={f.hint}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
              settings.videoFormat === f.value
                ? 'bg-white text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  )
}
