'use client'
import { useRef, useEffect } from 'react'
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
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useVideoSync(videoRef, canvasRef, chunks, settings, clipStart)

  const src = `/api/video/${jobId}?start=${clipStart}&end=${clipEnd}`
  const { crop } = settings
  const cropStyle = crop.style || 'fill'
  const CROP_WIDTH_RATIO = (9 * 9) / (16 * 16) // ≈ 0.3164

  // Calculate object-position for cover mode
  const objectPosition = cropStyle === 'fill'
    ? `${(crop.x / (1 - CROP_WIDTH_RATIO)) * 100}% center`
    : 'center center'

  // Sync background video with main video if fit mode with blur is active
  useEffect(() => {
    const main = videoRef.current
    const bg = bgVideoRef.current
    if (!main || !bg) return

    const onPlay = () => bg.play().catch(() => {})
    const onPause = () => bg.pause()
    const onSeeking = () => {
      bg.currentTime = main.currentTime
    }
    const onRateChange = () => {
      bg.playbackRate = main.playbackRate
    }

    main.addEventListener('play', onPlay)
    main.addEventListener('pause', onPause)
    main.addEventListener('seeking', onSeeking)
    main.addEventListener('ratechange', onRateChange)

    // Sync initial state
    bg.currentTime = main.currentTime
    if (!main.paused) bg.play().catch(() => {})

    return () => {
      main.removeEventListener('play', onPlay)
      main.removeEventListener('pause', onPause)
      main.removeEventListener('seeking', onSeeking)
      main.removeEventListener('ratechange', onRateChange)
    }
  }, [cropStyle, crop.background])

  let containerBg = '#000000'
  if (cropStyle === 'fit') {
    if (crop.background === 'color') {
      containerBg = crop.backgroundColor || '#000000'
    } else if (crop.background === 'black') {
      containerBg = '#000000'
    }
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/[0.08]"
      style={{
        aspectRatio: '9/16',
        width: '100%',
        maxWidth: '340px',
        margin: '0 auto',
        backgroundColor: containerBg,
      }}
    >
      {/* Blurred Video Background */}
      {cropStyle === 'fit' && crop.background === 'blur' && (
        <video
          ref={bgVideoRef}
          src={src}
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60 pointer-events-none"
          muted
          loop
          playsInline
          preload="auto"
        />
      )}

      {/* Main Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full relative z-10 transition-all duration-150"
        style={{
          objectFit: cropStyle === 'fit' ? 'contain' : 'cover',
          objectPosition: objectPosition,
        }}
        controls
        loop
        playsInline
        preload="auto"
      />

      {/* Subtitles Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
        style={{ objectFit: 'cover' }}
      />
    </div>
  )
}
