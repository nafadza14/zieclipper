import path from 'path'
import fs from 'fs'

// On Vercel: yt-dlp is the standalone Linux binary fetched at build time by
// scripts/fetch-ytdlp.js into bin/, bundled into the function via
// next.config.ts's outputFileTracingIncludes. ffmpeg/ffprobe come from
// @ffmpeg-installer/@ffprobe-installer -- statically-linked binaries
// shipped as npm packages, which Next.js's build already traces and
// bundles automatically since they're required() here.
//
// Locally (not on Vercel): fall back to whatever's on PATH, same as the
// original setup -- `pip install yt-dlp` / your OS package manager for
// ffmpeg. The bundled Linux binary won't run on macOS/Windows anyway.
const isVercel = !!process.env.VERCEL
const BUNDLED_YTDLP = path.join(process.cwd(), 'bin', 'yt-dlp_linux')

export function getBinaries(): { ytdlp: string; ffmpeg: string; ffprobe: string } {
  let ffmpeg = process.env.FFMPEG_PATH || ''
  let ffprobe = process.env.FFPROBE_PATH || ''

  if (!ffmpeg) {
    // require() here (not a static import) so this still resolves correctly
    // whether or not FFMPEG_PATH is set, and so a missing package fails
    // with a clear error only when actually needed.
    ffmpeg = require('@ffmpeg-installer/ffmpeg').path
  }
  if (!ffprobe) {
    ffprobe = require('@ffprobe-installer/ffprobe').path
  }

  let ytdlp = process.env.YTDLP_PATH || ''
  if (!ytdlp) {
    if (isVercel) {
      if (!fs.existsSync(BUNDLED_YTDLP)) {
        throw new Error(
          'bin/yt-dlp_linux is missing from this deployment. It should have been ' +
          'downloaded by scripts/fetch-ytdlp.js during `npm install` -- check the ' +
          'Vercel build logs for a "[fetch-ytdlp]" line.'
        )
      }
      ytdlp = BUNDLED_YTDLP
    } else {
      ytdlp = 'yt-dlp'
    }
  }

  return { ytdlp, ffmpeg, ffprobe }
}
