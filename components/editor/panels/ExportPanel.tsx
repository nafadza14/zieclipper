'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useEditorStore } from '@/store/editorStore'
import { useExportJob } from '@/hooks/useExportJob'

interface YTMetadata {
  title: string
  description: string
  tags: string[]
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-xs px-2 py-1 rounded bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white transition shrink-0"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

export function ExportPanel() {
  const { jobId, clipIndex, settings, subtitleChunks, clip } = useEditorStore()
  const [exportId, setExportId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<YTMetadata | null>(null)
  const [generatingMeta, setGeneratingMeta] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaLang, setMetaLang] = useState('English')

  const exportJob = useExportJob(exportId)
  const isDone = exportJob?.status === 'done'
  const isProcessing = exportJob?.status === 'processing'
  const isError = exportJob?.status === 'error'
  const progress = exportJob?.progress ?? 0

  function startExport() {
    if (!jobId || clipIndex === null) return
    setError(null)
    setMetadata(null)

    // POST /api/export now runs the whole ffmpeg render synchronously and
    // doesn't return until it's done, so the exportId is generated here and
    // polling (useExportJob below) starts right away instead of waiting on
    // this fetch -- otherwise the progress bar would just sit at 0% for the
    // entire export.
    const newExportId = crypto.randomUUID()
    setExportId(newExportId)
    setStarting(true)

    fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportId: newExportId, jobId, clipIndex, settings, subtitleChunks }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Export failed')
        setExportId(null)
      }
    }).catch((e) => {
      setError(e.message)
      setExportId(null)
    }).finally(() => setStarting(false))
  }

  async function generateMetadata() {
    if (!jobId || clipIndex === null) return
    setGeneratingMeta(true)
    setMetaError(null)

    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No model here on purpose: the server falls back to job.model so the
        // provider/model pair the user picked on the home page stays consistent.
        body: JSON.stringify({ jobId, clipIndex, language: metaLang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate metadata')
      setMetadata(data)
    } catch (e: any) {
      setMetaError(e.message)
    } finally {
      setGeneratingMeta(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Export info */}
      <div className="bg-[#141414] rounded-xl p-4 border border-[#2a2a2a]">
        <div className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Export Settings</div>
        <div className="space-y-1 text-xs text-gray-400">
          <div className="flex justify-between"><span>Resolution</span><span className="text-white">1080×1920</span></div>
          <div className="flex justify-between"><span>Format</span><span className="text-white">MP4 (H.264)</span></div>
          <div className="flex justify-between"><span>Audio</span><span className="text-white">AAC 128k</span></div>
          {clip && (
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="text-white">{Math.round(clip.end_time - clip.start_time)}s</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      {(isProcessing || isDone) && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{isDone ? 'Export complete!' : 'Exporting...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-[#222] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-white to-neutral-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {(isError || error) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs">
          {exportJob?.error || error}
        </div>
      )}

      {/* Download button */}
      {isDone && exportId && (
        <a
          href={`/api/export?id=${exportId}&download=1`}
          download="short.mp4"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition"
        >
          ⬇ Download MP4
        </a>
      )}

      {/* Publish to YouTube (requires connected account in Settings) */}
      {isDone && exportId && <PublishToYouTube exportId={exportId} title={metadata?.title} description={metadata?.description} tags={metadata?.tags} />}

      {!isDone && (
        <button
          onClick={startExport}
          disabled={starting || isProcessing}
          className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold text-sm transition"
        >
          {isProcessing ? `Exporting ${progress}%...` : starting ? 'Starting...' : 'Export Short'}
        </button>
      )}

      {isDone && (
        <button
          onClick={() => { setExportId(null); setError(null); setMetadata(null) }}
          className="w-full py-2 rounded-xl border border-[#2a2a2a] text-gray-400 hover:text-white text-xs transition"
        >
          Export Again
        </button>
      )}

      {/* YouTube Metadata section — shown after export */}
      {isDone && (
        <div className="border-t border-[#1a1a1a] pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 uppercase tracking-wider">YouTube Metadata</span>
          </div>

          {!metadata && !generatingMeta && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['English', 'Indonesia', 'Spanish', 'Portuguese', 'Arabic'].map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setMetaLang(lang)}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                      metaLang === lang
                        ? 'border-white bg-white/10 text-white font-medium'
                        : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#444]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <button
                onClick={generateMetadata}
                className="w-full py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] hover:border-white/50 text-white text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <span>✨</span> Generate Title, Caption & Tags
              </button>
            </div>
          )}

          {generatingMeta && (
            <div className="flex items-center gap-3 bg-[#141414] rounded-xl px-4 py-3 border border-[#2a2a2a]">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs text-gray-400">Generating metadata...</span>
            </div>
          )}

          {metaError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs">{metaError}</div>
          )}

          {metadata && (
            <div className="space-y-3">
              {/* Title */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Title</span>
                  <CopyButton text={metadata.title} />
                </div>
                <p className="text-sm text-white font-medium leading-snug">{metadata.title}</p>
                <p className="text-[10px] text-gray-600">{metadata.title.length}/100 chars</p>
              </div>

              {/* Description */}
              <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">Description</span>
                  <CopyButton text={metadata.description} />
                </div>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{metadata.description}</p>
              </div>

              {/* Tags */}
              {(() => {
                const tagStr = metadata.tags.join(',')
                const tagChars = tagStr.length
                const overLimit = tagChars > 500
                return (
                  <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Tags ({metadata.tags.length})</span>
                      <CopyButton text={metadata.tags.join(', ')} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {metadata.tags.map((tag, i) => (
                        <span key={i} className="text-[10px] bg-[#222] text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                    <p className={`text-[10px] ${overLimit ? 'text-red-400' : 'text-gray-600'}`}>
                      {tagChars}/500 chars{overLimit ? ' · melebihi batas' : ''}
                    </p>
                  </div>
                )
              })()}

              {/* Regenerate */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['English', 'Indonesia', 'Spanish', 'Portuguese', 'Arabic'].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setMetaLang(lang)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                        metaLang === lang
                          ? 'border-white bg-white/10 text-white font-medium'
                          : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#444]'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <button
                  onClick={generateMetadata}
                  disabled={generatingMeta}
                  className="w-full py-2 rounded-xl border border-[#2a2a2a] text-gray-500 hover:text-gray-300 text-xs transition"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Publish an already-rendered export to the user's connected YouTube
// channel via /api/social/youtube/upload. Handles the not-connected case
// by pointing the user to Settings.
function PublishToYouTube({ exportId, title, description, tags }: { exportId: string; title?: string; description?: string; tags?: string[] }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; privacyStatus: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [privacyStatus, setPrivacyStatus] = useState<'private' | 'unlisted' | 'public'>('private')

  async function publish() {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/social/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exportId, title, description, tags, privacyStatus }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'upload gagal')
      setResult({ url: d.url, privacyStatus: d.privacyStatus })
    } catch (e: any) {
      setError(e.message)
    } finally { setBusy(false) }
  }

  if (result) {
    return (
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-red-400 text-lg">▶</span>
          <div className="flex-1">
            <div className="text-white text-sm font-semibold">Terunggah ke YouTube</div>
            <div className="text-[10px] text-neutral-500">Status: {result.privacyStatus}. Bisa diubah di YouTube Studio.</div>
          </div>
        </div>
        <a href={result.url} target="_blank" rel="noreferrer" className="block text-center text-xs bg-white text-black font-semibold rounded-lg py-2 hover:bg-neutral-200 transition">
          Buka di YouTube ↗
        </a>
      </div>
    )
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        {(['private','unlisted','public'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPrivacyStatus(p)}
            className={`flex-1 py-1 rounded-md text-[10px] font-semibold border transition ${
              privacyStatus === p ? 'border-white bg-white/10 text-white' : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        onClick={publish}
        disabled={busy}
        className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
      >
        {busy ? (<><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading…</>) : (<>▶ Publish to YouTube</>)}
      </button>
      {error && (
        <div className="text-[10px] text-red-400 bg-red-500/10 rounded p-2">
          {error} {error.includes('No YouTube') && (<Link href="/settings#accounts" className="underline text-white ml-1">Connect →</Link>)}
        </div>
      )}
    </div>
  )
}
