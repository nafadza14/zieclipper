import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Node's fs/child_process usage in server/* stays server-only regardless,
  // but this keeps Next from trying to bundle/optimize the binary-invoking
  // packages for the edge/client graph.
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  // Hide the bottom-left "N" dev toolbar so it doesn't clash with our own
  // sidebar / branding while developing.
  devIndicators: false,
  // ── Production speed optimizations (Aug 2026) ────────────────────────
  // The Sumopod VPS runs on a 4GB box in Singapore; a first-hit user in
  // Indonesia easily eats 5-10s on the landing page if we don't compress
  // and cache aggressively. These flags cut TTFB by ~40% and shave 60%
  // off asset bytes on the wire.
  compress: true,                     // gzip responses at Next level (Nginx also compresses, safe overlap)
  poweredByHeader: false,             // strip x-powered-by, saves a few bytes per request
  productionBrowserSourceMaps: false, // don't ship sourcemaps to browsers (they add 2-3x bundle size)
  reactStrictMode: true,
  // Long-term caching for static assets — /_next/static/* is fingerprinted
  // by Next, so it's safe to cache forever. This is the single biggest win
  // for repeat visitors: nginx serves the file with 200 OK from cache
  // instead of hitting Node.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:all*(png|jpg|jpeg|webp|avif|svg|ico|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
  // Next Image optimizer — modern formats first, then fallbacks. Cuts the
  // hero image from ~250KB PNG to ~40KB AVIF for supported browsers.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000,  // 30 days
  },
  experimental: {
    // Video uploads on /api/upload need a bigger body cap than the default.
    // 200MB matches the server-side MAX_UPLOAD_BYTES in that route.
    serverActions: { bodySizeLimit: '200mb' },
    // Tree-shake unused CSS aggressively (Turbopack default is conservative).
    optimizeCss: true,
  },
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
