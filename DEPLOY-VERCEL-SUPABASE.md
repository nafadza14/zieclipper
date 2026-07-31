# Deploy: Vercel + Supabase only (no separate worker/VPS)

This is the pure-Vercel version of the deployment: everything -- yt-dlp,
ffmpeg, the LLM calls, subtitle parsing -- runs inside this one Next.js app's
API routes on Vercel. Supabase provides auth, job/state storage (Postgres),
and file storage (the `media` Storage bucket) for downloaded video segments,
thumbnails, and rendered exports. There is nothing else to deploy or pay for.

An earlier draft of this migration used a small always-on worker (Railway/Fly/
a VPS) specifically to get around Vercel's lack of a persistent process and
its 4.5 MB buffered-response cap. That approach works but costs more and adds
a second thing to operate. This version avoids both problems by (a) running
the whole pipeline synchronously inside one Vercel Function invocation per
request instead of relying on "keep working after the response is sent" (which
doesn't exist on Vercel -- an instance can freeze right after it responds),
and (b) storing every generated file in Supabase Storage and redirecting to a
short-lived signed URL instead of streaming bytes through a Function.

## Honest trade-offs of the pure-Vercel path

Read this before you deploy -- these are real, not hypothetical:

- **Function duration.** Vercel Hobby caps a Function at 300 seconds (hard
  limit, cannot be raised). Pro/Enterprise default to 800s and can go up to
  1800s ("extended maximum", currently in beta) via `vercel.json` or project
  settings. `/api/download` and `/api/export` both set
  `export const maxDuration = 300`, matching Hobby's ceiling. If you're
  regularly clipping longer videos and hitting timeouts, raise this in the
  route files and make sure your plan actually supports the higher value.
- **No `youtube_transcript_api` fallback.** The previous Python service could
  fall back to fetching transcripts from YouTube's internal timedtext API
  directly. That path required reverse-engineering an undocumented endpoint
  and isn't included here -- this app relies entirely on yt-dlp's downloaded
  VTT captions (manual or auto-generated). If a video genuinely has no
  captions of either kind, the job will fail with a clear error instead of
  silently trying a second method.
- **`/tmp` is not durable.** A Vercel Function instance may or may not be
  reused between requests, and its `/tmp` is wiped either way eventually.
  Anything that needs to survive across requests (job status, the transcript,
  clip suggestions, rendered video files) is written to Supabase -- either
  the `jobs`/`export_jobs` tables or the `media` Storage bucket -- specifically
  *because* `/tmp` can't be trusted to still be there on the next request.
- **YouTube may block datacenter IPs.** Vercel's outbound IPs are shared
  cloud infrastructure, so YouTube's "Sign in to confirm you're not a bot"
  block can hit more often than it would from a residential IP. Setting
  `YTDLP_COOKIES_PATH` to a committed cookies.txt file (exported from a
  real signed-in browser session) works around this but means committing a
  session cookie into your deployment -- treat that file as a secret with a
  real expiry, not something to leave in indefinitely.
- **Function bundle size.** The bundled `ffmpeg`/`ffprobe` binaries
  (~68 MB + ~79 MB) plus the fetched `yt-dlp_linux` binary (~39 MB) add up to
  roughly 185 MB per Function that imports them. Vercel's per-Function size
  limit is 250 MB uncompressed, so there's headroom, but don't add more heavy
  native dependencies to these routes without checking the built bundle size.

## 1. Supabase: run the schema migration

1. Open your Supabase project → **SQL Editor**.
2. Paste the contents of `supabase/migrations/0001_jobs_and_exports.sql` and run it.
3. Confirm in **Table Editor**: `jobs` and `export_jobs` exist with RLS
   enabled, and **Storage** shows a private `media` bucket.
4. You will **not** need the `service_role` key anywhere in this setup --
   every read and write happens through the logged-in user's own session
   (anon key + their JWT), which is what the RLS policies in that migration
   are for. Never put the service_role key in this Vercel project.

## 2. Configure Vercel environment variables

In the Vercel project's **Settings → Environment Variables**, set (see
`.env.example` for the full list with comments):

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project
  Settings → API → anon/public.
- At least one LLM provider key: `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`,
  `SUMOPOD_API_KEY`, and/or `GEMINI_API_KEY`, matching whichever
  model/provider your app is configured to call.
- Optionally `YTDLP_COOKIES_PATH` — see the trade-offs section above.

Remove any leftover `WORKER_URL` / `WORKER_SECRET` / `PYTHON_SERVICE_URL`
variables from a previous deploy attempt -- they're not used anymore.

## 3. Push and verify

Push to whatever branch your Vercel project auto-deploys from. During the
build, `postinstall` (`scripts/fetch-ytdlp.js`) downloads the standalone
`yt-dlp_linux` binary into `bin/` -- watch the build logs for a
`[fetch-ytdlp]` line to confirm it succeeded; the script is written to fail
softly (logs and exits 0) so a transient GitHub hiccup doesn't block the
whole deploy, but that also means a genuine failure only surfaces later, at
request time, as a clear error from `server/binaries.ts` telling you to check
the build log.

Once deployed:

1. Sign in (or sign up) on the site -- every API route requires it.
2. Paste a YouTube URL and submit. The progress bar should move through
   `downloading → transcribing → analyzing → ready` while the request is
   still in flight (see the comment in `app/page.tsx` for how that works
   without a background worker).
3. Open a clip in the editor -- the video preview should load (redirected to
   a signed Supabase Storage URL, generated on first request and cached
   there after).
4. Export -- progress should tick up and the download button should work.

If a step fails, the error should be specific (e.g. `yt-dlp failed (exit 1):
...`) rather than a generic timeout.

## What did NOT change

- The domain/Cloudflare setup, if you have one pointed at this Vercel project.
- The Sumopod API key situation (`server/llm-client.ts`, `app/api/chat`,
  `app/api/otak-ai` still have the hardcoded fallback key) -- deliberately
  left alone, it's a credential-rotation task unrelated to this deploy.
  Rotate it whenever you're ready.

## Local dev

```bash
cp .env.example .env.local   # fill in values
npm install                  # postinstall skips fetching yt-dlp locally (not on Vercel)
npm run dev
```

Local dev expects `yt-dlp` and `ffmpeg`/`ffprobe` on your `PATH` (`pip install
yt-dlp`, your OS package manager for ffmpeg) -- `server/binaries.ts` only uses
the bundled Linux binaries when `VERCEL` is set. Override any of them with
`YTDLP_PATH` / `FFMPEG_PATH` / `FFPROBE_PATH` if you'd rather point at
something specific.
