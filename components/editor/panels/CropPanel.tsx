'use client'
import { useRef, useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editorStore'

const BACKGROUND_OPTIONS = [
  { value: 'blur', label: 'Blur Background' },
  { value: 'black', label: 'Black Background' },
  { value: 'color', label: 'Solid Color' },
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

  const cropStyle = crop.style || 'fill'

  return (
    <div className="space-y-6">
      {/* Template / Style Selection */}
      <div>
        <label className="text-xs text-neutral-400 uppercase tracking-wider mb-2 block font-medium">Template Frame Style</label>
        <div className="flex gap-2">
          <button
            onClick={() => updateCrop({ style: 'fill' })}
            className={`flex-1 py-3 text-xs rounded-xl border font-semibold transition ${
              cropStyle === 'fill'
                ? 'border-white bg-white text-black'
                : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700'
            }`}
          >
            Fullscreen (Crop/Fill)
          </button>
          <button
            onClick={() => updateCrop({ style: 'fit' })}
            className={`flex-1 py-3 text-xs rounded-xl border font-semibold transition ${
              cropStyle === 'fit'
                ? 'border-white bg-white text-black'
                : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700'
            }`}
          >
            Fit (Landscape)
          </button>
        </div>
      </div>

      {cropStyle === 'fill' ? (
        <>
          {/* Position Selection */}
          <div>
            <label className="text-xs text-neutral-400 uppercase tracking-wider mb-2 block font-medium">Positioning Area (Drag Box)</label>
            <div
              ref={containerRef}
              className="relative aspect-video bg-neutral-950 rounded-xl overflow-hidden cursor-ew-resize select-none border border-neutral-900"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {thumbUrl && (
                <img src={thumbUrl} alt="frame" className="w-full h-full object-cover opacity-40" draggable={false} />
              )}
              {/* Crop overlay */}
              <div
                className="absolute inset-y-0 border-2 border-white bg-white/5 cursor-grab active:cursor-grabbing"
                style={{ left: cropBoxLeft, width: cropBoxWidth }}
                onMouseDown={handleMouseDown}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/10 text-white text-xs px-2.5 py-1 rounded backdrop-blur-sm border border-white/20 font-medium">9:16</div>
                </div>
              </div>
              {/* Darken outside crop */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: `linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.7) ${crop.x * 100}%, transparent ${crop.x * 100}%, transparent ${(crop.x + CROP_WIDTH_RATIO) * 100}%, rgba(0,0,0,0.7) ${(crop.x + CROP_WIDTH_RATIO) * 100}%, rgba(0,0,0,0.7) 100%)`
              }} />
            </div>
          </div>

          {/* Fine tune slider */}
          <div>
            <label className="text-xs text-neutral-400 uppercase tracking-wider mb-2 block font-medium">Horizontal Fine-Tune</label>
            <input
              type="range"
              min={0}
              max={Math.round((1 - CROP_WIDTH_RATIO) * 1000)}
              value={Math.round(crop.x * 1000)}
              onChange={(e) => updateCrop({ x: parseInt(e.target.value) / 1000 })}
              className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-xs text-neutral-500 mt-1.5 text-center">{Math.round(crop.x * 100)}% from left</div>
          </div>
        </>
      ) : (
        <>
          {/* Fit options - Background styling */}
          <div>
            <label className="text-xs text-neutral-400 uppercase tracking-wider mb-2 block font-medium">Background Padding Style</label>
            <div className="flex flex-col gap-2">
              {BACKGROUND_OPTIONS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => updateCrop({ background: b.value })}
                  className={`w-full py-3 text-xs rounded-xl border text-center font-medium transition ${
                    crop.background === b.value
                      ? 'border-white bg-white/10 text-white'
                      : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            
            {crop.background === 'color' && (
              <div className="mt-3 flex items-center gap-3 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
                <input
                  type="color"
                  value={crop.backgroundColor || '#000000'}
                  onChange={(e) => updateCrop({ backgroundColor: e.target.value })}
                  className="w-10 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                />
                <div className="flex flex-col">
                  <span className="text-xs text-neutral-400 uppercase font-semibold">Background Color</span>
                  <span className="text-xs text-neutral-500 font-mono">{crop.backgroundColor || '#000000'}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-neutral-950/80 border border-neutral-900 p-4 rounded-xl text-neutral-500 text-xs leading-relaxed">
            💡 <strong>Fit Mode</strong>: Video landscape Anda diposisikan di tengah secara penuh tanpa ada bagian kiri/kanan yang terpotong. Ruang kosong di atas dan di bawah akan ditutupi sesuai gaya latar belakang yang Anda pilih.
          </div>
        </>
      )}

      {/* Clip Timing Adjustment (10s Buffer) */}
      <div className="border-t border-neutral-800/80 pt-5 mt-5">
        <label className="text-[11px] text-neutral-400 uppercase tracking-wider mb-2.5 block font-semibold">
          Fine-Tune Clip Timing (±10s Buffer)
        </label>
        
        <div className="space-y-4 bg-neutral-900/30 border border-neutral-900 p-4 rounded-xl">
          {/* Start Time Slider */}
          <div>
            <div className="flex justify-between text-xs text-neutral-400 mb-1.5 font-medium">
              <span>Start Time Offset</span>
              <span className="font-mono text-white">{(crop.startOffset || 0) >= 0 ? '+' : ''}{(crop.startOffset || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={crop.startOffset || 0}
              onChange={(e) => updateCrop({ startOffset: parseFloat(e.target.value) })}
              className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[9px] text-neutral-500 mt-1 flex justify-between font-medium">
              <span>-10s (Earlier)</span>
              <span>Original Start</span>
              <span>+10s (Later)</span>
            </div>
          </div>

          {/* End Time Slider */}
          <div>
            <div className="flex justify-between text-xs text-neutral-400 mb-1.5 font-medium">
              <span>End Time Offset</span>
              <span className="font-mono text-white">{(crop.endOffset || 0) >= 0 ? '+' : ''}{(crop.endOffset || 0).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={crop.endOffset || 0}
              onChange={(e) => updateCrop({ endOffset: parseFloat(e.target.value) })}
              className="w-full accent-white bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[9px] text-neutral-500 mt-1 flex justify-between font-medium">
              <span>-10s (Earlier)</span>
              <span>Original End</span>
              <span>+10s (Later)</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-950/40 border border-neutral-900/60 p-3 rounded-lg text-neutral-500 text-[11px] leading-relaxed mt-3">
          💡 Gunakan slider di atas jika Anda ingin memperluas atau memotong bagian awal/akhir video. Perubahan timing akan langsung disinkronkan ke pratinjau dan ekspor video secara otomatis.
        </div>
      </div>
    </div>
  )
}
