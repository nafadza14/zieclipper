'use client'
import { useState } from 'react'
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

  async function startExport() {
    if (!jobId || clipIndex === null) return
    setStarting(true)
    setError(null)
    setMetadata(null)

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, clipIndex, settings, subtitleChunks }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Export failed')
      setExportId(data.exportId)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStarting(false)
    }
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
              className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-500"
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

      {!isDone && (
        <button
          onClick={startExport}
          disabled={starting || isProcessing}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition"
        >
          {starting ? 'Starting...' : isProcessing ? `Exporting ${progress}%...` : 'Export Short'}
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
                        ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                        : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300 hover:border-[#444]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <button
                onClick={generateMetadata}
                className="w-full py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] hover:border-purple-500/50 text-white text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <span>✨</span> Generate Title, Caption & Tags
              </button>
            </div>
          )}

          {generatingMeta && (
            <div className="flex items-center gap-3 bg-[#141414] rounded-xl px-4 py-3 border border-[#2a2a2a]">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
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
                      {tagChars}/500 chars{overLimit ? ' — over limit' : ''}
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
                          ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
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
