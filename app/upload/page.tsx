'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { useAuth } from '@/hooks/useAuth'

const MAX_MB = 200
const ACCEPT = '.mp4,.mov,.mkv,.webm,.avi,.m4v,.mp3,.wav,.m4a,.ogg,video/*,audio/*'
const STEPS: Record<string, { label: string; pct: number }> = {
  downloading:  { label: 'uploading file…',                pct: 15 },
  transcribing: { label: 'transcribing audio (Whisper)…',  pct: 55 },
  analyzing:    { label: 'finding viral moments with AI…', pct: 85 },
  ready:        { label: 'done!',                          pct: 100 },
}

export default function UploadPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)          // upload byte progress 0..100
  const [step, setStep] = useState<string | null>(null)
  const [pct, setPct] = useState(0)                    // overall pipeline pct
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth?next=/upload')
  }, [authLoading, user, router])

  function pickFile(f: File | null) {
    setError(null)
    if (!f) { setFile(null); return }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File terlalu besar. Maksimum ${MAX_MB} MB.`)
      return
    }
    setFile(f)
  }

  async function handleSubmit() {
    if (!file) return
    setUploading(true); setError(null); setStep('starting…'); setPct(5); setProgress(0)

    const jobId = crypto.randomUUID()

    // Poll job progress in parallel with the long upload+process POST.
    let uploadError: string | null = null
    const polling = pollJob(jobId, () => uploadError)

    // Send via XHR so we can track upload progress (fetch doesn't expose it
    // yet in Chrome without the new Streams-based upload API).
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
    }

    const uploadPromise = new Promise<void>((resolve) => {
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          try { uploadError = JSON.parse(xhr.responseText).error || `Upload failed (${xhr.status})` }
          catch { uploadError = `Upload failed (${xhr.status})` }
          resolve()
        }
      }
      xhr.onerror = () => { uploadError = 'Network error during upload'; resolve() }
    })

    const form = new FormData()
    form.append('file', file)
    form.append('jobId', jobId)
    form.append('model', 'gpt-4o-mini')
    form.append('provider', 'sumopod')
    xhr.send(form)

    try {
      await Promise.race([polling, uploadPromise.then(() => polling)])
    } catch (err: any) {
      setError(err.message); setUploading(false); setStep(null); setPct(0)
    }
  }

  async function pollJob(jobId: string, getUploadError: () => string | null) {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.status === 404) {
        const failMsg = getUploadError()
        if (failMsg) throw new Error(failMsg)
        continue
      }
      const job = await res.json()
      if (!res.ok) throw new Error(job.error || 'job lost')
      const s = STEPS[job.status]
      if (s) { setStep(s.label); setPct(s.pct) }
      if (job.status === 'ready') { router.push(`/clips/${jobId}`); return }
      if (job.status === 'error') throw new Error(job.error || 'processing failed')
    }
    const failMsg = getUploadError()
    throw new Error(failMsg || 'timed out')
  }

  return (
    <DashboardShell
      title="Upload Video File"
      subtitle="MP4 / MOV / MKV / WebM / audio, maksimum 200 MB. Transkripsi otomatis untuk video tanpa caption."
    >
      {!uploading ? (
        <div className="max-w-2xl mx-auto">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragging(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
              dragging ? 'border-white bg-white/[0.03]' : 'border-white/[0.15] hover:border-white/40'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="text-5xl mb-4">📼</div>
            {file ? (
              <>
                <div className="text-white font-semibold text-lg mb-1">{file.name}</div>
                <div className="text-neutral-500 text-sm">
                  {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type || 'video/*'}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); pickFile(null) }}
                  className="mt-3 text-xs text-neutral-500 hover:text-white transition underline"
                >
                  ganti file
                </button>
              </>
            ) : (
              <>
                <div className="text-white font-semibold text-lg mb-1">Drop file di sini</div>
                <div className="text-neutral-500 text-sm">atau klik untuk pilih. Max {MAX_MB} MB.</div>
              </>
            )}
          </div>

          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="mt-4 bg-[#0d0d16] border border-white/[0.06] rounded-xl px-4 py-3 text-[11px] text-neutral-500 leading-relaxed">
            File yang Anda upload disimpan di penyimpanan pribadi dan hanya dapat diakses melalui link berbatas waktu milik akun Anda.
            Transkripsi dan analisis viral berjalan otomatis, cocok untuk video yang tidak punya caption di YouTube.
          </div>

          <button
            disabled={!file}
            onClick={handleSubmit}
            className="mt-6 w-full py-3.5 rounded-full bg-white text-black font-semibold hover:bg-neutral-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Analyze video →
          </button>
        </div>
      ) : (
        <div className="max-w-md mx-auto bg-[#0d0d16] border border-white/[0.06] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-white text-sm font-medium">{step}</div>
              {progress > 0 && progress < 100 && step?.includes('upload') && (
                <div className="text-[11px] text-neutral-500 font-mono">{progress}% uploaded</div>
              )}
            </div>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${Math.max(progress > 0 && pct < 20 ? progress * 0.15 : 0, pct)}%` }}
            />
          </div>
          <p className="text-neutral-500 text-xs text-center">
            biasanya butuh {file && file.size > 50 * 1024 * 1024 ? '1-3 menit' : '30-90 detik'}
          </p>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  )
}
