'use client'
import { useEffect, useRef } from 'react'
import type { SubtitleChunk, EditorSettings } from '@/store/types'
import { renderSubtitlesAtTime } from '@/lib/subtitle-renderer'

export function useVideoSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  chunks: SubtitleChunk[],
  settings: EditorSettings,
  clipStartTime: number
) {
  const rafRef = useRef<number | null>(null)
  const chunksRef = useRef(chunks)
  const settingsRef = useRef(settings)

  chunksRef.current = chunks
  settingsRef.current = settings

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = 1080
    canvas.height = 1920

    function render() {
      const v = videoRef.current
      const c = canvasRef.current
      if (!v || !c) return

      const { subtitleOffsetMs = 0 } = settingsRef.current
      const videoTime = v.currentTime + clipStartTime + subtitleOffsetMs / 1000
      renderSubtitlesAtTime(c, videoTime, chunksRef.current, settingsRef.current)
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [videoRef, canvasRef, clipStartTime])
}
