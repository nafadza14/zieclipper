#!/usr/bin/env node
// Downloads the standalone yt-dlp_linux binary (PyInstaller build that
// bundles its own Python interpreter -- NOT the plain "yt-dlp" release
// asset, which is a zipapp that requires a system python3 on PATH, which
// Vercel's Node.js function runtime does not have).
//
// Runs as a `postinstall` step -- during `npm install`, both locally and
// on Vercel's build machine -- so the binary is already sitting in bin/
// by the time `next build` runs and next.config.ts's
// outputFileTracingIncludes bundles it into the function output. This is
// deliberately a build-time fetch, not the old server/binaries.ts pattern
// of downloading into /tmp on every cold start.
//
// Only fetched when actually deploying to Vercel (or when explicitly
// forced) -- local dev on macOS/Windows should just use a system-installed
// `yt-dlp` on PATH instead (see lib/binaries.ts), since this binary is
// Linux-only.
const fs = require('fs')
const path = require('path')
const https = require('https')

const DEST = path.join(__dirname, '..', 'bin', 'yt-dlp_linux')
const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'

const shouldFetch = process.env.VERCEL || process.env.FETCH_YTDLP === '1'
if (!shouldFetch) {
  console.log('[fetch-ytdlp] Not on Vercel and FETCH_YTDLP not set -- skipping. ' +
    'Local dev uses a system yt-dlp on PATH instead (see README).')
  process.exit(0)
}

if (fs.existsSync(DEST)) {
  console.log('[fetch-ytdlp] bin/yt-dlp_linux already present, skipping download.')
  process.exit(0)
}

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'))
        res.resume()
        return resolve(download(res.headers.location, dest, redirectsLeft - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`Unexpected status ${res.statusCode} fetching ${url}`))
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(undefined)))
      file.on('error', reject)
    }).on('error', reject)
  })
}

fs.mkdirSync(path.dirname(DEST), { recursive: true })
download(URL, DEST)
  .then(() => {
    fs.chmodSync(DEST, 0o755)
    const { size } = fs.statSync(DEST)
    console.log(`[fetch-ytdlp] downloaded bin/yt-dlp_linux (${(size / 1024 / 1024).toFixed(1)} MB)`)
  })
  .catch((err) => {
    console.error('[fetch-ytdlp] failed:', err.message)
    // Non-fatal at build time on purpose: fail the deploy loudly later (at
    // request time, via lib/binaries.ts's existsSync check) rather than
    // blocking `npm install`/local dev entirely if GitHub is briefly
    // unreachable during a Vercel build.
    process.exit(0)
  })
