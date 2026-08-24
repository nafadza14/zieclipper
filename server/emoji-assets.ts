import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'

// Twemoji PNG assets (72x72, transparent background). Fetched on demand at
// export time, cached in /tmp for the lifetime of the process. The bundled
// ffmpeg is too old to render color emoji via libass, so we composite these
// PNGs on top of the video via an overlay filter instead -- works on any
// ffmpeg version, and every rendered emoji looks the same regardless of the
// user's OS font set.
const CACHE_DIR = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'zieclipper', 'emoji-cache')
const TWEMOJI_BASE = 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72'

// Convert an emoji string to its Twemoji filename (codepoints joined with
// '-', variation selector U+FE0F stripped -- matches Twemoji's convention).
export function twemojiFilename(emoji: string): string {
  const cps: string[] = []
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)!
    if (cp === 0xfe0f) continue // variation selector, dropped by Twemoji
    cps.push(cp.toString(16))
  }
  return cps.join('-') + '.png'
}

function download(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect (raw.githubusercontent.com serves 200 directly,
        // but be defensive in case that changes)
        download(res.headers.location, destPath).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`emoji download ${url} -> HTTP ${res.statusCode}`))
        res.resume()
        return
      }
      const file = fs.createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    })
    req.setTimeout(10000, () => req.destroy(new Error('emoji download timeout')))
    req.on('error', reject)
  })
}

// Returns an absolute local PNG path for the given emoji, downloading it if
// the cache doesn't have it yet. Returns null if the emoji isn't available
// in the Twemoji set -- caller should fall back to skipping the overlay
// rather than failing the whole export.
export async function ensureEmojiPng(emoji: string): Promise<string | null> {
  if (!emoji) return null
  const filename = twemojiFilename(emoji)
  const localPath = path.join(CACHE_DIR, filename)
  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return localPath

  fs.mkdirSync(CACHE_DIR, { recursive: true })
  try {
    await download(`${TWEMOJI_BASE}/${filename}`, localPath)
    return localPath
  } catch {
    // clean up empty file if download half-happened
    try { if (fs.existsSync(localPath) && fs.statSync(localPath).size === 0) fs.unlinkSync(localPath) } catch {}
    return null
  }
}
