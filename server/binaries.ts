import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const BIN_DIR = path.join(os.tmpdir(), 'zieclipper-bin')

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
const FFMPEG_URL = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip'
const FFPROBE_URL = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-linux-64.zip'

async function downloadFile(url: string, destPath: string) {
  console.log(`Downloading ${url} to ${destPath}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buffer)
}

export async function ensureBinaries(): Promise<{ ytdlp: string; ffmpeg: string; ffprobe: string }> {
  // If we are NOT running on Vercel, check if the binaries are available in PATH
  const isVercel = !!process.env.VERCEL
  
  if (!isVercel) {
    // Return default system commands for local dev (rely on user's local PATH / env vars)
    return {
      ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
      ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
      ffprobe: process.env.FFPROBE_PATH || 'ffprobe'
    }
  }

  // On Vercel, we download them to /tmp/zieclipper-bin
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true })
  }

  const ytdlpPath = path.join(BIN_DIR, 'yt-dlp')
  const ffmpegPath = path.join(BIN_DIR, 'ffmpeg')
  const ffprobePath = path.join(BIN_DIR, 'ffprobe')

  // Download yt-dlp if it doesn't exist
  if (!fs.existsSync(ytdlpPath)) {
    await downloadFile(YTDLP_URL, ytdlpPath)
    fs.chmodSync(ytdlpPath, '755')
  }

  // Download and unzip ffmpeg if it doesn't exist
  if (!fs.existsSync(ffmpegPath)) {
    const zipPath = path.join(BIN_DIR, 'ffmpeg.zip')
    await downloadFile(FFMPEG_URL, zipPath)
    try {
      execSync(`unzip -o -d ${BIN_DIR} ${zipPath}`)
      fs.unlinkSync(zipPath)
      fs.chmodSync(ffmpegPath, '755')
    } catch (err: any) {
      console.error('Failed to unzip ffmpeg:', err)
      throw new Error(`Failed to unzip ffmpeg: ${err.message}`)
    }
  }

  // Download and unzip ffprobe if it doesn't exist
  if (!fs.existsSync(ffprobePath)) {
    const zipPath = path.join(BIN_DIR, 'ffprobe.zip')
    await downloadFile(FFPROBE_URL, zipPath)
    try {
      execSync(`unzip -o -d ${BIN_DIR} ${zipPath}`)
      fs.unlinkSync(zipPath)
      fs.chmodSync(ffprobePath, '755')
    } catch (err: any) {
      console.error('Failed to unzip ffprobe:', err)
      throw new Error(`Failed to unzip ffprobe: ${err.message}`)
    }
  }

  return {
    ytdlp: ytdlpPath,
    ffmpeg: ffmpegPath,
    ffprobe: ffprobePath
  }
}
