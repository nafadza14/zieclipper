import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Node's fs/child_process usage in server/* stays server-only regardless,
  // but this keeps Next from trying to bundle/optimize the binary-invoking
  // packages for the edge/client graph.
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe'],
  experimental: {},
  // Vercel's Output File Tracing only follows require()/import statements
  // to decide what to include in a function's deployment bundle -- it has
  // no way to know bin/yt-dlp_linux is needed, since it's invoked via
  // child_process.spawn(), not required(). Without this, the binary
  // (fetched at build time by scripts/fetch-ytdlp.js) would silently be
  // left out of the deployed function and every yt-dlp call would 404/ENOENT
  // in production despite working in `next build` locally.
  outputFileTracingIncludes: {
    '/api/**/*': ['./bin/**'],
  },
}

export default nextConfig
