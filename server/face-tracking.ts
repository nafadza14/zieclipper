import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { runFFmpeg, probeVideoDuration } from './ffmpeg-processor'
import { detectFaceX } from './vision-client'

export interface FaceKeyframe {
  t: number      // seconds into the clip
  x: number      // fraction 0..1 (0 = far left of source, 1 = far right)
}

// Extracts N sample frames evenly spaced across the clip and asks a vision
// model where the primary speaker's face is in each. Returns a list of
// (t, x) keyframes suitable for building an ffmpeg dynamic crop expression.
// N=8 is a reasonable balance of cost/latency vs smoothness for typical
// 30-60s shorts (frame every ~5s). Costs one vision call per sample --
// ~$0.001-0.01 each on gpt-4o-mini class models, so ~$0.01-0.10 total.
export async function trackFace(
  sourceVideoPath: string,
  clipStart: number,
  clipEnd: number,
  provider: string,
  model: string,
  sampleCount = 8,
): Promise<FaceKeyframe[]> {
  const dur = Math.max(0.1, clipEnd - clipStart)
  const workDir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'face-track', crypto.randomUUID())
  fs.mkdirSync(workDir, { recursive: true })

  // Sample points: evenly spaced, avoiding the very first/last frame (which
  // are often black or transition frames).
  const N = Math.max(3, Math.min(20, sampleCount))
  const tsIn = Array.from({ length: N }, (_, i) => (dur * (i + 0.5)) / N) // clip-local seconds

  // Extract all sample frames in one ffmpeg call (much cheaper than N calls).
  // -vf select='...' picks the frames we want; downscale to 640x360 to keep
  // vision payloads small and cheap.
  const selectExpr = tsIn.map((t) => `eq(n,round((${t})*fr))`).join('+')
  // ffmpeg's select filter needs frame rate 'fr' at eval time -- simpler is
  // to use timestamp-based selection with 'between'. Even simpler: extract
  // one frame per exact timestamp via -ss inside a loop is expensive. Use
  // the fps trick: fps=<N/dur>, so N frames evenly spaced come out.
  const fps = N / dur
  const framePattern = path.join(workDir, 'f_%03d.png')
  const ffArgs = [
    '-ss', String(clipStart),
    '-to', String(clipEnd),
    '-i', sourceVideoPath,
    '-vf', `fps=${fps.toFixed(6)},scale=640:-2`,
    '-frames:v', String(N),
    '-y',
    framePattern,
  ]
  // Silence unused-var warning; kept for reference in comments.
  void selectExpr
  try {
    await runFFmpeg(ffArgs)
  } catch {
    // If sampling failed we can't track anything -- caller falls back to a
    // centered crop by treating an empty result as "no tracking".
    return []
  }

  const files = fs.readdirSync(workDir).filter((f) => f.endsWith('.png')).sort()
  if (!files.length) return []

  // Vision calls in parallel (bounded by the LLM provider's own rate limits,
  // not by anything here). Failures inside detectFaceX return 0.5, so bad
  // frames just contribute a "centered" keyframe rather than crashing.
  const xs = await Promise.all(files.map((f) => detectFaceX(path.join(workDir, f), provider, model)))

  const keyframes: FaceKeyframe[] = files.map((_, i) => ({
    t: tsIn[i] ?? (dur * (i + 0.5)) / files.length,
    x: xs[i],
  }))

  // Cleanup best-effort -- the whole workDir will get wiped with /tmp anyway.
  try { for (const f of files) fs.unlinkSync(path.join(workDir, f)) } catch {}
  try { fs.rmdirSync(workDir) } catch {}

  return smoothKeyframes(keyframes)
}

// Light exponential smoothing so a single bad detection doesn't yank the
// crop across the frame. alpha=0.5 -> new keyframe pulls halfway to the
// detected value each step, which visually reads as gentle follow-through.
function smoothKeyframes(kfs: FaceKeyframe[]): FaceKeyframe[] {
  if (kfs.length < 2) return kfs
  const alpha = 0.5
  let prev = kfs[0].x
  return kfs.map((k, i) => {
    if (i === 0) return k
    prev = prev + alpha * (k.x - prev)
    return { t: k.t, x: prev }
  })
}

// Convenience wrapper: probe duration and track the whole file.
export async function trackFaceWholeFile(
  sourceVideoPath: string,
  provider: string,
  model: string,
  sampleCount = 8,
): Promise<FaceKeyframe[]> {
  const dur = await probeVideoDuration(sourceVideoPath)
  if (!dur || dur < 0.1) return []
  return trackFace(sourceVideoPath, 0, dur, provider, model, sampleCount)
}
