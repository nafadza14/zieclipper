'use client'
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { useVideoSync } from '@/hooks/useVideoSync'
import type { SubtitleChunk, EditorSettings, FaceKeyframe } from '@/store/types'
import { getFormatCss, cropWidthRatio } from '@/lib/formats'
import { xAtTime } from '@/lib/tracking-interp'

interface Props {
  jobId: string
  clipStart: number
  clipEnd: number
  chunks: SubtitleChunk[]
  settings: EditorSettings
  // Optional face-tracking keyframes. When provided AND crop.autoTrack is
  // on AND we're in fill mode with a non-16:9 target, the preview's
  // object-position animates along the interpolated x per playhead time --
  // matching what ffmpeg's dynamic crop expression will do at export time.
  trackingKeyframes?: FaceKeyframe[] | null
}

// Imperative handle: the Timeline component (below the preview) needs to
// seek the <video> to a specific clip-local time when the user clicks a
// chunk. Rather than lifting a full playback controller into the parent
// store, expose a tiny ref API so the parent can just call
// playerRef.current?.seekToClipTime(t).
export interface VideoPlayerHandle {
  seekToClipTime: (secondsFromClipStart: number) => void
  play: () => void
  pause: () => void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { jobId, clipStart, clipEnd, chunks, settings, trackingKeyframes },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Playhead-driven x fraction for face tracking. Updated per rAF while
  // playback is running so the crop follows the speaker in real time.
  const [trackingX, setTrackingX] = useState<number | null>(null)

  useVideoSync(videoRef, canvasRef, chunks, settings, clipStart)

  const useTracking =
    settings.crop.autoTrack &&
    (settings.crop.style || 'fill') === 'fill' &&
    settings.videoFormat !== '16:9' &&
    Array.isArray(trackingKeyframes) &&
    trackingKeyframes.length > 0

  // rAF loop for real-time crop follow. Sampling once per animation frame
  // is smooth to the eye and cheap (interpolation is O(kfs) which is ~8).
  useEffect(() => {
    if (!useTracking) { setTrackingX(null); return }
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v && trackingKeyframes) {
        setTrackingX(xAtTime(trackingKeyframes, v.currentTime))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [useTracking, trackingKeyframes])

  useImperativeHandle(ref, () => ({
    seekToClipTime(secondsFromClipStart: number) {
      const v = videoRef.current
      if (!v) return
      // clamp to valid range so a stale click near the very end can't NaN out
      const clipDur = Math.max(0.1, clipEnd - clipStart)
      v.currentTime = Math.max(0, Math.min(clipDur - 0.05, secondsFromClipStart))
    },
    play() { videoRef.current?.play().catch(() => {}) },
    pause() { videoRef.current?.pause() },
  }), [clipStart, clipEnd])

  const src = `/api/video/${jobId}?start=${clipStart}&end=${clipEnd}`
  const { crop } = settings
  const cropStyle = crop.style || 'fill'
  const CROP_WIDTH_RATIO = cropWidthRatio(settings.videoFormat)

  // Calculate object-position for cover mode. When the target is 16:9 the whole
  // width is visible (ratio == 1), so there's no horizontal pan and we avoid a
  // divide-by-zero by centering. When face tracking is on, override the static
  // crop.x with the live-interpolated trackingX so the preview follows the
  // speaker exactly like the exported MP4 will.
  const effectiveX = useTracking && trackingX !== null ? trackingX : crop.x
  const objectPosition = cropStyle === 'fill' && CROP_WIDTH_RATIO < 1
    ? `${(effectiveX / (1 - CROP_WIDTH_RATIO)) * 100}% center`
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
        aspectRatio: getFormatCss(settings.videoFormat),
        width: '100%',
        maxWidth: settings.videoFormat === '16:9' ? '600px' : settings.videoFormat === '1:1' ? '440px' : '340px',
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
})
