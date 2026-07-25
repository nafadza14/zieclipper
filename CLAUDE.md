# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start both services together (recommended)
npm run dev

# Start individually
npm run dev:next          # Next.js on :3000
npm run dev:api           # FastAPI on :8002

# Type-check (no test suite exists)
npx tsc --noEmit

# Build for production
npm run build
```

Python dependencies must be installed before running the API:
```bash
pip install -r api/requirements.txt
```

Environment variables live in `.env.local` (copy from `.env.example`). Required:
- `ANTHROPIC_API_KEY` — for Claude provider
- `DEEPSEEK_API_KEY` — for DeepSeek provider (optional; only needed if user selects DeepSeek)
- `GEMINI_API_KEY` — for Gemini provider (optional; only needed if user selects Gemini)
- `PYTHON_SERVICE_URL=http://localhost:8002`
- `FFMPEG_PATH=ffmpeg` and `YTDLP_PATH=yt-dlp` (must be on PATH or absolute paths)

## Architecture

Two processes communicate over HTTP:

```
Browser
  └── Next.js App Router (:3000)
        ├── /api/download                    → yt-dlp download + kick off pipeline
        ├── /api/jobs/[id]                   → job status polling
        ├── /api/jobs/[id]/retranscript      → switch subtitle language post-analysis
        ├── /api/export                      → FFmpeg render (ASS subtitles burned in)
        ├── /api/video/[id]                  → stream source video for preview
        ├── /api/thumbnail/[id]/[idx]        → single-frame JPEG for clip cards
        ├── /api/subtitles                   → proxy to Python /available-transcripts
        └── /api/metadata                    → proxy to Python /metadata
              │
              ▼
        FastAPI Python service (:8002)
              ├── POST /transcript            → parse VTT or YouTube API
              ├── POST /available-transcripts → list all transcript languages
              ├── POST /analyze              → LLM tool_use → ClipSuggestion[]
              └── POST /metadata             → LLM tool_use → title/description/tags
```

**Page routing:**
- `/` — home, URL input form, provider+model selector, starts download job
- `/clips/[jobId]` — polls until ready, shows clip cards sorted by score, subtitle language picker
- `/editor/[jobId]/[clipIndex]` — video preview with canvas subtitles, 5-tab left panel, chunk list right panel

**Job lifecycle** (`downloading → transcribing → analyzing → ready | error`):
1. `POST /api/download` — spawns yt-dlp, stores `Job` in `server/job-manager.ts` global Map (survives hot-reload), returns `jobId` immediately
2. After download: calls Python `/transcript` (VTT → per-word timing, falls back to youtube-transcript-api)
3. Then calls Python `/analyze` (LLM returns 5–10 `ClipSuggestion` objects with titles/hooks always in English)
4. Client polls `GET /api/jobs/[jobId]` every 2 s until `status === 'ready'`

**File storage**: everything goes under `tmp/jobs/<jobId>/`. No database. Jobs are lost on server restart.

## Multi-provider LLM system

The home page offers three AI providers: **Claude** (Anthropic), **DeepSeek**, and **Gemini**. Each provider has a selection of models. The `provider` and `model` strings travel through:

```
page.tsx → POST /api/download { url, model, provider }
  → job-manager.ts stores job.provider + job.model
  → POST /analyze { transcript, model, provider, ... }
  → api/services/llm_client.py:call_tool() dispatches to SDK
```

`api/services/llm_client.py` is the single dispatch point:
- **`provider='anthropic'`** — uses `anthropic.Anthropic()` SDK; tool is in Anthropic format (`input_schema`, `tool_use` response block)
- **`provider='deepseek'`** — uses `openai.OpenAI(base_url='https://api.deepseek.com')` with `DEEPSEEK_API_KEY`
- **`provider='gemini'`** — uses `openai.OpenAI(base_url='https://generativelanguage.googleapis.com/v1beta/openai/')` with `GEMINI_API_KEY`

DeepSeek and Gemini both use OpenAI-compatible function calling: the Anthropic `input_schema` dict is reused as `function.parameters`, and the response is parsed from `tool_calls[0].function.arguments` (JSON string). The `metadata` route reads `job.provider` from the job store and forwards it to `/metadata`, so the provider is consistent throughout the clip's lifetime.

## Subtitle pipeline (the complex part)

Subtitles flow through two parallel renderers that must stay in sync:

**Preview (canvas):** `useVideoSync` hook runs a `requestAnimationFrame` loop → calls `renderSubtitlesAtTime` from `lib/subtitle-renderer.ts`. The hook adds `clipStartTime + subtitleOffsetMs/1000` to `video.currentTime` to get an absolute timestamp matching the word timings.

**Export (ASS):** `lib/ass-generator.ts` converts the same `SubtitleChunk[]` to an ASS file. `app/api/export/route.ts` first re-times chunks to be clip-relative (`chunkStart -= clip.start_time`), then applies `subtitleOffsetMs` offset, then passes the ASS file to FFmpeg via the `ass='path'` filter. On Windows the path must be forward-slash with escaped colons: `C\:/path/to/file.ass`.

**Chunk building:** `lib/subtitle-parser.ts` splits `WordTiming[]` into `SubtitleChunk[]` by word count, char count, or sentence. Rebuilds whenever style settings change.

**Timing source priority:** yt-dlp `--write-subs --write-auto-subs --sub-format vtt --sub-langs all` → `api/services/transcript.py:parse_vtt_words()` (real per-word `<c>` timestamps; plain-text blocks distributed proportionally) → fallback `youtube_transcript_api` (block-level, proportionally split).

**Subtitle language switching:** After analysis, the clips page shows a language picker built from `job.availableSubtitles` (merged from downloaded VTT files + YouTube API transcript list). Selecting a language calls `POST /api/jobs/[jobId]/retranscript` → re-fetches transcript via Python `/transcript` with the chosen VTT file → updates `job.transcript` and `job.activeSubtitleLang` in the job store.

## Editor state

`store/editorStore.ts` (Zustand) is the single source of truth during editing. It is populated by the editor page calling `setJob(jobId, clipIndex, clip, clipTranscript)` on mount — `clipTranscript` is the slice of `job.transcript` filtered to the clip's time range. The store then rebuilds `subtitleChunks` whenever settings change. Both `VideoPlayer` and `ExportPanel` read from this store.

## Key files to know

| File | Purpose |
|---|---|
| `store/types.ts` | All shared TypeScript types (includes `provider` on `Job`) |
| `store/editorStore.ts` | Zustand store — single source of truth for editor state |
| `lib/subtitle-renderer.ts` | Canvas 2D subtitle draw engine (preview) |
| `lib/ass-generator.ts` | ASS subtitle file builder (export); mirrors renderer logic |
| `lib/ffmpeg-commands.ts` | Builds FFmpeg arg arrays; crop assumes 1920×1080 source |
| `server/job-manager.ts` | In-memory job/export store with global persistence trick |
| `api/services/llm_client.py` | **Provider dispatcher** — Anthropic / DeepSeek / Gemini |
| `api/services/transcript.py` | VTT parser + YouTube API fallback + `list_available_transcripts` |
| `api/services/analyzer.py` | `suggest_viral_clips` tool_use call (via `llm_client`) |
| `api/services/metadata.py` | `generate_youtube_metadata` tool_use call (via `llm_client`) |

## FFmpeg crop math

Source assumed 1920×1080 (16:9). To get 9:16 output:
- `cropW = 608` (= round_even(1080 × 9/16)), `cropH = 1080`
- `cropX = min(round(1920 × crop.x), 1312)` — `crop.x` is a fraction of source width
- Scale 608×1080 → 1080×1920

`crop.x` default centres the strip: `(1 - 81/256) / 2 ≈ 0.342`. The UI `CROP_WIDTH_RATIO = 81/256 ≈ 0.316` represents the strip as a fraction of the 16:9 preview container width.

## ASS transition tags

`lib/ass-generator.ts` emits per-segment prefixes. Key constraints:
- `\fad(fi,fo)` durations are capped to `floor(segDurMs × 0.4)` — per-word events can be 100–400 ms; uncapped fades mean text never reaches full opacity
- `\t()` uses the 3-arg form `\t(t1,t2,tags)` (no accel) for maximum libass compatibility
- Slide uses `\move(540, y+30, 540, y, 0, dur)` on first segment; subsequent segments get `\pos(540, y)` to prevent drift. Slide has **no fade-out** (canvas only fades in)
- `renderY` is the text anchor pixel for the alignment type (bottom anchor for `an2`, center for `an5`, top for `an8`)
- `word-by-word` segments end at `word.end` (not `word[i+1].start`); gap segments between words show accumulated text in primary color — matches the canvas where highlight strictly follows word timing
