'use client'
import Link from 'next/link'
import { MarketingShell, MarketingPanel } from '@/components/marketing/MarketingShell'

// User-facing FAQ. Deliberately avoids exposing implementation details
// (model names, provider stack, roadmap) — those live in engineering docs
// and change over time. Answers focus on what the user actually wants to
// know before signing up or when troubleshooting.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'Bagaimana cara mulai membuat klip?',
    a: 'Daftar akun (dapat 10 kredit gratis), lalu paste link YouTube atau upload file video langsung. Klip akan siap dalam 30–90 detik untuk video pendek.',
  },
  {
    q: 'Video jenis apa yang bisa diproses?',
    a: 'Video YouTube publik atau file video Anda sendiri (MP4, MOV, MKV, WebM). Cocok untuk podcast, ceramah, wawancara, tutorial, streaming, dan konten berbicara lainnya.',
  },
  {
    q: 'Bahasa apa saja yang didukung?',
    a: 'Aplikasi mendeteksi bahasa video secara otomatis. Bahasa Indonesia, Inggris, Melayu, Spanyol, Portugis, Arab, Jepang, Mandarin, Korea, Prancis, Jerman, dan Hindi didukung penuh untuk subtitle dan analisis viral.',
  },
  {
    q: 'Apakah video saya aman?',
    a: 'File video Anda disimpan di penyimpanan pribadi yang terenkripsi dan hanya dapat diakses melalui link berbatas waktu milik akun Anda. Kami tidak membagikan konten Anda ke pihak ketiga mana pun.',
  },
  {
    q: 'Bisa dipakai untuk konten yang saya monetisasi?',
    a: 'Ya. Anda memiliki penuh hak atas hasil klip dan bebas monetisasi di YouTube, TikTok, Instagram, atau platform lain. Pastikan Anda punya hak atas video sumber-nya.',
  },
  {
    q: 'Berapa lama proses generate?',
    a: 'Video pendek (≤10 menit) biasanya 30–60 detik. Video panjang (30–60 menit) sekitar 1–3 menit. Face tracking pada export menambah ~10–20 detik.',
  },
  {
    q: 'Apakah kualitas export bagus?',
    a: 'Export MP4 1080p dengan kualitas siap upload ke semua platform tanpa perlu proses ulang.',
  },
  {
    q: 'Kredit tidak cukup, apakah generate dibatalkan?',
    a: 'Ya. Generate dihentikan dan Anda akan diminta top-up. Video yang gagal tidak memotong kredit. Kredit yang sudah terpotong tapi proses gagal karena masalah teknis kami akan otomatis dikembalikan.',
  },
  {
    q: 'Apakah kredit expire?',
    a: 'Tidak. Kredit tetap di akun Anda selama akun aktif. Beli hari ini, pakai kapan saja.',
  },
  {
    q: 'Bisa refund top-up?',
    a: 'Kredit yang sudah masuk saldo tidak bisa di-refund ke Rupiah, tapi bisa digunakan tanpa batas waktu. Kredit yang gagal terpakai (video corrupt, error server) otomatis kembali ke saldo Anda.',
  },
  {
    q: 'Bagaimana cara top-up?',
    a: 'Melalui halaman Settings di dashboard. Kami dukung QRIS, DANA, OVO, GoPay, dan transfer bank. Kredit langsung masuk setelah pembayaran terkonfirmasi.',
  },
  {
    q: 'Bisa auto-post ke sosmed?',
    a: 'Untuk saat ini, Anda dapat mempublikasikan klip langsung ke YouTube Shorts dari editor. Cukup hubungkan akun YouTube Anda di halaman Settings.',
  },
]

export default function SupportPage() {
  return (
    <MarketingShell>
      <MarketingPanel title="Support" subtitle="Pertanyaan yang sering ditanyakan.">
        <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {FAQS.map((f, i) => (
            <details key={i} className="py-3 group">
              <summary className="cursor-pointer flex items-center justify-between text-white font-semibold text-sm">
                <span>{f.q}</span>
                <span className="text-neutral-500 group-open:rotate-45 transition-transform text-lg leading-none">+</span>
              </summary>
              <p className="text-neutral-400 text-xs mt-2 leading-relaxed pl-1">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-neutral-400 text-xs">
            Butuh bantuan lain? <a href="mailto:support@zieclip.app" className="text-white underline">support@zieclip.app</a>
          </div>
          <Link href="/docs/credits" className="text-xs text-white underline">Detail konsumsi kredit</Link>
        </div>
      </MarketingPanel>
    </MarketingShell>
  )
}
