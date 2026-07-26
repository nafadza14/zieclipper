'use client'
import { useEditorStore } from '@/store/editorStore'

const FONTS = ['Impact', 'Montserrat', 'Arial', 'Helvetica Neue', 'Bebas Neue', 'Oswald', 'Roboto', 'Georgia']
const WEIGHTS = [
  { value: '400', label: 'Regular' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra Bold' },
  { value: '900', label: 'Black' },
]
const HIGHLIGHT_EFFECTS = [
  { value: 'color', label: 'Color' },
  { value: 'scale', label: 'Scale' },
  { value: 'both', label: 'Both' },
]

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-7 rounded cursor-pointer bg-transparent" />
      <span className="text-xs text-gray-500 font-mono">{value}</span>
    </div>
  )
}

export function FontPanel() {
  const { settings, updateFont } = useEditorStore()
  const { font } = settings

  return (
    <div className="space-y-5">
      {/* Font family */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Font Family</label>
        <select
          value={font.family}
          onChange={(e) => updateFont({ family: e.target.value })}
          className="w-full bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
        >
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </div>

      {/* Size */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Size: {font.size}px</label>
        <input
          type="range"
          min={24}
          max={120}
          value={font.size}
          onChange={(e) => updateFont({ size: parseInt(e.target.value) })}
          className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Weight */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Weight</label>
        <div className="grid grid-cols-2 gap-2">
          {WEIGHTS.map((w) => (
            <button
              key={w.value}
              onClick={() => updateFont({ weight: w.value as any })}
              className={`py-2 text-xs rounded-lg border transition ${
                font.weight === w.value
                  ? 'border-white bg-white/10 text-white font-medium'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-3 block font-medium">Colors</label>
        <div className="space-y-3">
          <ColorRow label="Text" value={font.color} onChange={(v) => updateFont({ color: v })} />
          <ColorRow label="Stroke" value={font.strokeColor} onChange={(v) => updateFont({ strokeColor: v })} />
          <ColorRow label="Highlight" value={font.highlightColor} onChange={(v) => updateFont({ highlightColor: v })} />
        </div>
      </div>

      {/* Stroke width */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Stroke Width: {font.strokeWidth}px</label>
        <input
          type="range"
          min={0}
          max={20}
          value={font.strokeWidth}
          onChange={(e) => updateFont({ strokeWidth: parseInt(e.target.value) })}
          className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
        />
      </div>

      {/* Highlight effect */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block font-medium">Highlight Effect</label>
        <div className="flex gap-2">
          {HIGHLIGHT_EFFECTS.map((h) => (
            <button
              key={h.value}
              onClick={() => updateFont({ highlightEffect: h.value as any })}
              className={`flex-1 py-2 text-xs rounded-lg border transition ${
                font.highlightEffect === h.value
                  ? 'border-white bg-white/10 text-white font-medium'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex gap-4">
        {[
          { key: 'uppercase', label: 'UPPERCASE' },
          { key: 'italic', label: 'Italic' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => updateFont({ [key]: !font[key as keyof typeof font] } as any)}
            className={`flex-1 py-2 text-xs rounded-lg border transition ${
              font[key as keyof typeof font]
                ? 'border-white bg-white/10 text-white font-medium'
                : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
