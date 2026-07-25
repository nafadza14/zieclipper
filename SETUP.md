# Clipper — Setup Guide

## Prerequisites
- Node.js 18+
- Python 3.10+
- FFmpeg on PATH (`ffmpeg` command works)
- yt-dlp on PATH (`yt-dlp` command works)
- Anthropic API key

## 1. Configure environment

Edit `.env.local` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## 2. Start the app

```
npm run dev
```

This starts:
- Next.js on http://localhost:3000
- Python API on http://localhost:8000

## 3. Use the app

1. Open http://localhost:3000
2. Paste a YouTube URL
3. Select Claude model (Sonnet recommended)
4. Click "Find Viral Moments →"
5. Wait for download + AI analysis (~1-3 min)
6. Browse suggested clips, click "Edit This Clip"
7. Adjust subtitles, font, emoji, crop settings
8. Click Export → Download MP4

## Troubleshooting

**"yt-dlp not found"** — install: `pip install yt-dlp` or download binary
**"FFmpeg not found"** — set `FFMPEG_PATH=C:/path/to/ffmpeg.exe` in `.env.local`
**"No transcript"** — video may lack English captions; only YouTube auto-captions are supported currently
