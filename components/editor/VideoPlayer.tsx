'use client'
import { useRef } from 'react'
import { useVideoSync } from '@/hooks/useVideoSync'
import type { SubtitleChunk, EditorSettings } from '@/store/types'

interface Props {
  jobId: string
  clipStart: number
  clipEnd: number
  chunks: SubtitleChunk[]
  settings: EditorSettings
}

export function VideoPlayer({ jobId, clipStart, clipEnd, chunks, settings }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useVideoSync(videoRef, canvasRef, chunks, settings, clipStart)

  const src = `/api/video/${jobId}?start=${clipStart}&end=${clipEnd}`

  return (
    <div
      className="relative bg-black rounded-2xl overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/[0.08]"
      style={{ aspectRatio: '9/16', width: '100%', maxWidth: '340px', margin: '0 auto' }}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        controls
        loop
        playsInline
        preload="auto"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ objectFit: 'cover' }}
      />
    </div>
  )
}
