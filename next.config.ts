import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Node's fs/child_process usage in server/* stays server-only regardless,
  // but this keeps Next from trying to bundle/optimize the binary-invoking
  // packages for the edge/client graph.
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
  // Hide the bottom-left "N" dev toolbar so it doesn't clash with our own
  // sidebar / branding while developing.
  devIndicators: false,
  // Basic production optimizations (safe defaults)
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Next Image optimizer — modern formats first
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2592000,
  },
  experimental: {
    // Video uploads on /api/upload need a bigger body cap than the default.
    serverActions: { bodySizeLimit: '200mb' },
  },
  // Vercel's Output File Tracing needs to know bin/yt-dlp_linux is required
  outputFileTracingIncludes: {
    '/api/**/*': ['./bin/**'],
  },
}

export default nextConfig
