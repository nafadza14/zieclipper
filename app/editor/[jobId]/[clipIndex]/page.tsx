'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useEditorStore } from '@/store/editorStore'
import { VideoPlayer } from '@/components/editor/VideoPlayer'
import { SubtitleStylePanel } from '@/components/editor/panels/SubtitleStylePanel'
import { FontPanel } from '@/components/editor/panels/FontPanel'
import { EmojiPanel } from '@/components/editor/panels/EmojiPanel'
import { CropPanel } from '@/components/editor/panels/CropPanel'
import { ExportPanel } from '@/components/editor/panels/ExportPanel'
import type { Job } from '@/store/types'

const TABS = [
  { id: 'subtitles', label: 'Subtitles', icon: '⏱' },
  { id: 'font',      label: 'Font',      icon: 'Aa' },
  { id: 'emoji',     label: 'Emoji',     icon: '✦' },
  { id: 'crop',      label: 'Positioning', icon: '⊡' },
  { id: 'export',    label: 'Export',    icon: '↓' },
]

export default function EditorPage({ params }: { params: Promise<{ jobId: string; clipIndex: string }> }) {
  const { jobId, clipIndex: clipIndexStr } = use(params)
  const clipIndex = parseInt(clipIndexStr)
  const router = useRouter()

  const [activeTab, setActiveTab] = useState('subtitles')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { setJob, clip, subtitleChunks, settings, updateSubtitleChunkText } = useEditorStore()

  useEffect(() => {
    fetch(`/api/jobs/${jobId}`)
      .then((r) => r.json())
      .then((job: Job) => {
        if (!job.clips || !job.transcript) throw new Error('Job not ready')
        const c = job.clips[clipIndex]
        if (!c) throw new Error('Clip not found')
        const clipTranscript = (job.transcript || []).filter(
          (w) => w.end >= c.start_time - 15 && w.start <= c.end_time + 15
        )
        setJob(jobId, clipIndex, c, clipTranscript)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [jobId, clipIndex, setJob])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !clip) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-500/8 border border-red-500/20 rounded-2xl px-6 py-4 text-red-400 text-sm">
          {error || 'Failed to load'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#07070b]">

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 h-12 bg-[#07070b] border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => router.push(`/clips/${jobId}`)}
          className="flex items-center gap-1.5 text-[#7c7490] hover:text-white transition-colors text-sm"
        >
          <span className="text-xs">←</span> Clips
        </button>
        <div className="h-3.5 w-px bg-white/[0.08]" />
        <h1 className="text-sm font-medium text-white truncate flex-1">{clip.title}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[#413d52] font-mono">
            {Math.round(clip.end_time + (settings.crop.endOffset || 0) - (clip.start_time + (settings.crop.startOffset || 0)))}s
          </span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
            clip.score >= 8 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : clip.score >= 5 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            ★ {clip.score}/10
          </span>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <aside className="w-[280px] bg-[#0d0d16] border-r border-white/[0.06] flex flex-col shrink-0">
          {/* Tab bar */}
          <div className="flex border-b border-white/[0.06] shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-[10px] font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-[#413d52] hover:text-[#7c7490]'
                }`}
              >
                <span className="text-sm leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-white rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'subtitles' && <SubtitleStylePanel />}
            {activeTab === 'font'      && <FontPanel />}
            {activeTab === 'emoji'     && <EmojiPanel />}
            {activeTab === 'crop'      && <CropPanel jobId={jobId} />}
            {activeTab === 'export'    && <ExportPanel />}
          </div>
        </aside>

        {/* Center: video */}
        <main className="flex-1 bg-[#07070b] flex items-center justify-center p-6 overflow-hidden">
          {/* Subtle ambient glow behind the phone */}
          <div className="relative">
            <div className="absolute inset-0 -m-12 bg-white/5 rounded-full blur-3xl pointer-events-none" />
            <VideoPlayer
              jobId={jobId}
              clipStart={clip.start_time + (settings.crop.startOffset || 0)}
              clipEnd={clip.end_time + (settings.crop.endOffset || 0)}
              chunks={subtitleChunks}
              settings={settings}
            />
          </div>
        </main>

        {/* Right panel: subtitle chunks */}
        <aside className="w-60 bg-[#0d0d16] border-l border-white/[0.06] flex flex-col shrink-0">
          <div className="px-4 h-12 flex items-center border-b border-white/[0.06] shrink-0">
            <span className="text-[11px] font-semibold text-[#7c7490] uppercase tracking-widest">
              Chunks
            </span>
            <span className="ml-auto text-[11px] text-[#413d52] bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">
              {subtitleChunks.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {subtitleChunks.map((chunk) => (
              <div
                key={chunk.id}
                className="bg-[#13131e] rounded-xl px-3 py-2.5 border border-white/[0.04] focus-within:border-white/20 transition-all duration-150"
              >
                <textarea
                  value={chunk.text}
                  onChange={(e) => updateSubtitleChunkText(chunk.id, e.target.value)}
                  className="w-full bg-transparent border-0 p-0 text-xs text-white/90 leading-relaxed focus:ring-0 focus:outline-none resize-none font-medium placeholder-white/30"
                  rows={2}
                  placeholder="Ketik subtitle di sini..."
                />
                <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-white/[0.03]">
                  <span className="text-[9px] text-[#413d52] font-mono tracking-wider uppercase font-semibold">
                    Chunk #{chunk.id}
                  </span>
                  <span className="text-[9px] text-[#413d52] font-mono">
                    {chunk.chunkStart.toFixed(1)}s – {chunk.chunkEnd.toFixed(1)}s
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
