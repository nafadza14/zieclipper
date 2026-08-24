import type { FaceKeyframe } from '@/server/face-tracking'

// Build an ffmpeg x-crop expression that piecewise-linearly interpolates
// between face keyframes, clamped to a valid range so the crop window never
// walks off the source. Output plugs into the crop filter's x parameter,
// e.g.  crop=cropW:ih:<expr>:0.
//
// keyframes: (t, xFraction 0..1) as produced by trackFace. t is seconds
//   into the CLIP (post-trim), matching what ffmpeg's `t` variable sees.
// sourceWidth / cropWidth: pixel dimensions of the source video and the
//   final crop window. cropWidth is expressed as a numeric ffmpeg expr like
//   'trunc(ih*TW/TH/2)*2' -- we don't need its actual value here, we just
//   pass the *pixel* value the caller pre-computed for clamping.
//
// The returned expression is a nested if() chain. It stays well under
// ffmpeg's expression length limit even for 20+ keyframes.
export function buildDynamicCropXExpression(
  keyframes: FaceKeyframe[],
  sourceWidth: number,
  cropWidth: number,
): string {
  if (!keyframes.length) {
    // Fallback: center. `iw` is the input width variable ffmpeg substitutes
    // at eval time, so this still works even if sourceWidth was wrong.
    return `(iw-${cropWidth})/2`
  }

  const maxX = Math.max(0, sourceWidth - cropWidth)
  // Convert fraction 0..1 to *source pixel* x for the LEFT edge of the crop
  // window: xPx = frac * (sourceWidth - cropWidth). This is what ffmpeg's
  // crop filter expects.
  const px = (frac: number) => Math.round(Math.max(0, Math.min(1, frac)) * maxX)

  if (keyframes.length === 1) return String(px(keyframes[0].x))

  // Build nested if()'s from earliest -> latest keyframe. For any t before
  // the first keyframe, use the first x; for any t after the last, use the
  // last x.
  const sorted = [...keyframes].sort((a, b) => a.t - b.t)

  // Helper: piecewise expression for t in [ta, tb] linearly interpolating xa->xb
  const seg = (ta: number, tb: number, xa: number, xb: number) => {
    const dt = tb - ta
    if (dt <= 0.001) return String(xa)
    // xa + (xb - xa) * (t - ta) / (tb - ta)
    return `(${xa}+(${xb - xa})*(t-${ta.toFixed(3)})/${dt.toFixed(3)})`
  }

  // Build from the tail out so nesting reads: if before-first, xa;
  // else if between k0..k1, seg; else if between k1..k2, seg; ... else last.
  // We construct as: outer covers t < t_1 (returns x_0 if lt(t,t_0), else
  // seg from t_0..t_1), then nest.
  const lastX = px(sorted[sorted.length - 1].x)
  let expr = String(lastX) // default: t >= final keyframe → hold last
  for (let i = sorted.length - 2; i >= 0; i--) {
    const ta = sorted[i].t
    const tb = sorted[i + 1].t
    const xa = px(sorted[i].x)
    const xb = px(sorted[i + 1].x)
    expr = `if(lt(t,${tb.toFixed(3)}),${seg(ta, tb, xa, xb)},${expr})`
  }
  // Handle t < first keyframe: hold first x
  const firstT = sorted[0].t
  const firstX = px(sorted[0].x)
  expr = `if(lt(t,${firstT.toFixed(3)}),${firstX},${expr})`

  return expr
}
