'use client'
import { useRef, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editorStore'

const CROP_BACKGROUNDS = [
  { value: 'blur', label: 'Blur' },
  { value: 'black', label: 'Black' },
  { value: 'color', label: 'Color' },
] as const

export function CropPanel({ jobId }: { jobId: string }) {
  const { settings, updateCrop, clip } = useEditorStore()
  const { crop } = settings

  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartCropX, setDragStartCropX] = useState(0)

  // In a 16:9 preview container, a 9:16 portrait strip occupies (9/16)^2 of the width
  const CROP_WIDTH_RATIO = (9 * 9) / (16 * 16) // ≈ 0.3164

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true)
    setDragStartX(e.clientX)
    setDragStartCropX(crop.x)
    e.preventDefault()
  }, [crop.x])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (e.clientX - dragStartX) / rect.width
    const newX = Math.max(0, Math.min(1 - CROP_WIDTH_RATIO, dragStartCropX + dx))
    updateCrop({ x: newX })
  }, [dragging, dragStartX, dragStartCropX, updateCrop])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  const thumbUrl = clip ? `/api/thumbnail/${jobId}/0` : null
  const cropBoxLeft = `${crop.x * 100}%`
  const cropBoxWidth = `${CROP_WIDTH_RATIO * 100}%`

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Crop Region (drag to reposition)</label>
        <div
          ref={containerRef}
          className="relative aspect-video bg-[#0a0a0a] rounded-lg overflow-hidden cursor-ew-resize select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {thumbUrl && (
            <img src={thumbUrl} alt="frame" className="w-full h-full object-cover opacity-40" draggable={false} />
          )}
          {/* Crop overlay */}
          <div
            className="absolute inset-y-0 border-2 border-purple-500 bg-purple-500/10 cursor-grab active:cursor-grabbing"
            style={{ left: cropBoxLeft, width: cropBoxWidth }}
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded">9:16</div>
            </div>
          </div>
          {/* Darken outside crop */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.6) ${crop.x * 100}%, transparent ${crop.x * 100}%, transparent ${(crop.x + CROP_WIDTH_RATIO) * 100}%, rgba(0,0,0,0.6) ${(crop.x + CROP_WIDTH_RATIO) * 100}%, rgba(0,0,0,0.6) 100%)`
          }} />
        </div>
      </div>

      {/* Crop X fine-tune */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Horizontal Position</label>
        <input
          type="range"
          min={0}
          max={Math.round((1 - CROP_WIDTH_RATIO) * 1000)}
          value={Math.round(crop.x * 1000)}
          onChange={(e) => updateCrop({ x: parseInt(e.target.value) / 1000 })}
          className="w-full accent-purple-500"
        />
        <div className="text-xs text-gray-500 mt-1 text-center">{Math.round(crop.x * 100)}% from left</div>
      </div>

      {/* Background fill */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Background Fill</label>
        <div className="flex gap-2">
          {CROP_BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              onClick={() => updateCrop({ background: b.value })}
              className={`flex-1 py-2 text-xs rounded-lg border transition ${
                crop.background === b.value
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-[#2a2a2a] bg-[#141414] text-gray-400 hover:border-[#444]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {crop.background === 'color' && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={crop.backgroundColor}
              onChange={(e) => updateCrop({ backgroundColor: e.target.value })}
              className="w-8 h-7 rounded cursor-pointer"
            />
            <span className="text-xs text-gray-400">{crop.backgroundColor}</span>
          </div>
        )}
      </div>
    </div>
  )
}
