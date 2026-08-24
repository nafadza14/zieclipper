import type { FaceKeyframe } from '@/store/types'

// Piecewise-linear interpolation of face-tracking keyframes on the client
// side. Kept in exact lock-step with what lib/crop-expression.ts emits for
// ffmpeg -- both are linear between adjacent keyframes, holding the first
// keyframe's x for t before it and the last keyframe's x for t after it.
// So what the preview shows == what ffmpeg will render into the MP4.
export function xAtTime(kfs: FaceKeyframe[], t: number): number {
  if (!kfs.length) return 0.5
  const sorted = [...kfs].sort((a, b) => a.t - b.t)
  if (t <= sorted[0].t) return sorted[0].x
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].x
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1]
    if (t >= a.t && t <= b.t) {
      const dt = b.t - a.t
      if (dt <= 0.001) return a.x
      const frac = (t - a.t) / dt
      return a.x + (b.x - a.x) * frac
    }
  }
  return 0.5
}
