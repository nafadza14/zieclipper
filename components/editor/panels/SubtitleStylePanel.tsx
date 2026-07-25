'use client'
import { useEditorStore } from '@/store/editorStore'
import { SUBTITLE_PRESETS } from '@/components/editor/presets/SubtitlePresets'

const TRANSITIONS = ['fade', 'slide', 'pop', 'karaoke', 'word-by-word', 'none'] as const
const SPLIT_MODES = [
  { value: 'byWordCount', label: 'Word count' },
  { value: 'byCharCount', label: 'Char count' },
  { value: 'bySentence', label: 'Sentence' },
] as const
const POSITIONS = ['top', 'center', 'bottom'] as const

export function SubtitleStylePanel() {
  const { settings, applyPreset, updateSubtitleStyle, setSubtitleOffset } = useEditorStore()
  const { subtitleStyle, subtitleOffsetMs = 0 } = settings

  return (
    <div className="space-y-5">
      {/* Presets */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Style Preset</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.keys(SUBTITLE_PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => applyPreset(name)}
              className={`py-2 px-2 rounded-lg text-xs font-medium border transition ${
                subtitleStyle.preset === name
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Transition */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Transition</label>
        <select
          value={subtitleStyle.transition}
          onChange={(e) => updateSubtitleStyle({ transition: e.target.value as any })}
          className="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
        >
          {TRANSITIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Split mode */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Split By</label>
        <div className="flex gap-2">
          {SPLIT_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => updateSubtitleStyle({ splitMode: m.value })}
              className={`flex-1 py-2 text-xs rounded-lg border transition ${
                subtitleStyle.splitMode === m.value
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {subtitleStyle.splitMode !== 'bySentence' && (
          <div className="mt-2">
            <input
              type="range"
              min={1}
              max={subtitleStyle.splitMode === 'byWordCount' ? 10 : 80}
              value={subtitleStyle.splitValue}
              onChange={(e) => updateSubtitleStyle({ splitValue: parseInt(e.target.value) })}
              className="w-full accent-purple-500"
            />
            <div className="text-xs text-gray-500 mt-1 text-center">{subtitleStyle.splitValue} {subtitleStyle.splitMode === 'byWordCount' ? 'words' : 'chars'} per chunk</div>
          </div>
        )}
      </div>

      {/* Position */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Position</label>
        <div className="flex gap-2 mb-2">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => updateSubtitleStyle({ position: p })}
              className={`flex-1 py-2 text-xs rounded-lg border capitalize transition ${
                subtitleStyle.position === p
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={-300}
          max={300}
          value={subtitleStyle.positionOffsetY}
          onChange={(e) => updateSubtitleStyle({ positionOffsetY: parseInt(e.target.value) })}
          className="w-full accent-purple-500"
        />
        <div className="text-xs text-gray-500 mt-1 text-center">Y offset: {subtitleStyle.positionOffsetY}px</div>
      </div>

      {/* Background */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Background</label>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => updateSubtitleStyle({ background: { ...subtitleStyle.background, enabled: !subtitleStyle.background.enabled } })}
            className={`relative w-10 h-5 rounded-full transition ${subtitleStyle.background.enabled ? 'bg-purple-600' : 'bg-[#333]'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${subtitleStyle.background.enabled ? 'left-5' : 'left-0.5'}`} />
          </button>
          <span className="text-sm text-gray-300">Background box</span>
        </div>
        {subtitleStyle.background.enabled && (
          <div className="space-y-2 pl-2 border-l border-[#2a2a2a]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16">Color</span>
              <input
                type="color"
                value={subtitleStyle.background.color.slice(0, 7)}
                onChange={(e) => updateSubtitleStyle({ background: { ...subtitleStyle.background, color: e.target.value + 'bf' } })}
                className="w-8 h-7 rounded cursor-pointer"
              />
            </div>
            <div>
              <input
                type="range"
                min={0}
                max={30}
                value={subtitleStyle.background.padding}
                onChange={(e) => updateSubtitleStyle({ background: { ...subtitleStyle.background, padding: parseInt(e.target.value) } })}
                className="w-full accent-purple-500"
              />
              <div className="text-xs text-gray-500">Padding: {subtitleStyle.background.padding}px</div>
            </div>
          </div>
        )}
      </div>

      {/* Sync offset */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Subtitle Sync</label>
        <p className="text-[10px] text-gray-600 mb-2">Slide to manually sync subtitles with audio</p>
        <input
          type="range"
          min={-2000}
          max={2000}
          step={50}
          value={subtitleOffsetMs}
          onChange={(e) => setSubtitleOffset(parseInt(e.target.value))}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-gray-500">-2s</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-medium ${subtitleOffsetMs === 0 ? 'text-gray-500' : subtitleOffsetMs > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
              {subtitleOffsetMs > 0 ? '+' : ''}{subtitleOffsetMs}ms
            </span>
            {subtitleOffsetMs !== 0 && (
              <button
                onClick={() => setSubtitleOffset(0)}
                className="text-[10px] text-gray-500 hover:text-white transition px-1 py-0.5 rounded border border-[#333]"
              >
                reset
              </button>
            )}
          </div>
          <span className="text-[10px] text-gray-500">+2s</span>
        </div>
      </div>
    </div>
  )
}
