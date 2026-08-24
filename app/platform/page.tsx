'use client'
import { MarketingShell, MarketingPanel } from '@/components/marketing/MarketingShell'
import { IconTarget, IconCaptions, IconCrop, IconPlay, IconUpload, IconSend } from '@/components/marketing/Icons'

const FEATURES = [
  {
    Icon: IconTarget,
    title: 'AI viral moment detection',
    desc: 'Otomatis menemukan bagian paling menarik dari video panjang Anda. Setiap klip diberi skor viral dan alasan singkat.',
  },
  {
    Icon: IconCaptions,
    title: 'Word-level captions',
    desc: 'Subtitle akurat sinkron per-kata dengan 12 preset gaya viral siap pakai. Bisa diedit langsung sebelum export.',
  },
  {
    Icon: IconCrop,
    title: 'Multi rasio + auto reframe',
    desc: 'Export 9:16, 1:1, atau 16:9. Fitur auto face-tracking membuat crop mengikuti pembicara secara otomatis.',
  },
  {
    Icon: IconPlay,
    title: 'Live preview editor',
    desc: 'Timeline dengan chunk klikbel, aspect switcher, emoji overlay. Semua perubahan langsung terlihat sebelum export.',
  },
  {
    Icon: IconUpload,
    title: 'YouTube URL & upload file',
    desc: 'Paste link YouTube atau upload file MP4/MOV/MKV langsung. Video tanpa caption pun bisa diproses.',
  },
  {
    Icon: IconSend,
    title: 'Publish to YouTube Shorts',
    desc: 'Hubungkan akun YouTube Anda dan publish klip jadi Shorts hanya dengan satu klik dari editor.',
  },
]

export default function PlatformPage() {
  return (
    <MarketingShell>
      <MarketingPanel
        title="Platform"
        subtitle="Semua yang Anda butuhkan untuk ubah video panjang jadi klip viral, di satu tempat."
        wide
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/90 mb-3">
                <f.Icon size={18} />
              </div>
              <div className="text-white font-semibold text-sm mb-1">{f.title}</div>
              <div className="text-neutral-400 text-xs leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </MarketingPanel>
    </MarketingShell>
  )
}
