'use client'
import { useEditorStore } from '@/store/editorStore'

const EMOJI_POSITIONS = ['above', 'below', 'inline'] as const
const EMOJI_ANIMATIONS = ['none', 'bounce', 'pop', 'spin'] as const

export function EmojiPanel() {
  const { settings, updateEmoji, subtitleChunks, setEmojiOverride } = useEditorStore()
  const { emoji } = settings

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">Show emojis</span>
        <button
          onClick={() => updateEmoji({ enabled: !emoji.enabled })}
          className={`relative w-10 h-5 rounded-full transition ${emoji.enabled ? 'bg-white' : 'bg-[#333]'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${emoji.enabled ? 'left-5 bg-[#0d0d16]' : 'left-0.5 bg-white'}`} />
        </button>
      </div>

      {emoji.enabled && (
        <>
          {/* Auto-generate */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Auto-generate</span>
            <button
              onClick={() => updateEmoji({ autoGenerate: !emoji.autoGenerate })}
              className={`relative w-10 h-5 rounded-full transition ${emoji.autoGenerate ? 'bg-white' : 'bg-[#333]'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${emoji.autoGenerate ? 'left-5 bg-[#0d0d16]' : 'left-0.5 bg-white'}`} />
            </button>
          </div>

          {/* Position */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Position</label>
            <div className="flex gap-2">
              {EMOJI_POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => updateEmoji({ position: p })}
                  className={`flex-1 py-2 text-xs rounded-lg border capitalize transition ${
                    emoji.position === p
                      ? 'border-white bg-white/10 text-white font-medium'
                      : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Size: {emoji.size}px</label>
            <input
              type="range"
              min={24}
              max={120}
              value={emoji.size}
              onChange={(e) => updateEmoji({ size: parseInt(e.target.value) })}
              className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Animation */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Animation</label>
            <div className="grid grid-cols-2 gap-2">
              {EMOJI_ANIMATIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => updateEmoji({ animation: a })}
                  className={`py-2 text-xs rounded-lg border capitalize transition ${
                    emoji.animation === a
                      ? 'border-white bg-white/10 text-white font-medium'
                      : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Per-chunk overrides */}
          {subtitleChunks.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Per-chunk Emoji</label>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {subtitleChunks.slice(0, 20).map((chunk, idx) => (
                  <div key={chunk.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={2}
                      value={emoji.overrides[idx] || ''}
                      onChange={(e) => setEmojiOverride(idx, e.target.value)}
                      placeholder="✨"
                      className="w-10 bg-[#141414] border border-[#2a2a2a] rounded text-center text-sm py-1 focus:outline-none focus:border-white"
                    />
                    <span className="text-xs text-gray-500 truncate flex-1">{chunk.text.slice(0, 30)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
