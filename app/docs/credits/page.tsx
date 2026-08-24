import Link from 'next/link'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { PRICING_TIERS, CREDIT_COST, DEFAULT_CLIPS_PER_VIDEO } from '@/server/credits'

// Docs page — how credits are consumed. Updated Aug 2026 to match the
// new Klipaja-style tier pricing (see server/credits.ts).

export default function CreditsDocsPage() {
  return (
    <DashboardShell title="Cara kredit dikonsumsi" subtitle="Panduan sistem kredit Zieclip">
      <div className="max-w-3xl mx-auto space-y-8 text-neutral-300 leading-relaxed text-sm">

        <section>
          <h2 className="text-white text-lg font-bold mb-2">Ringkasan</h2>
          <p>
            Zieclip pakai sistem <span className="text-white font-semibold">prepaid credit</span>. Bayar sekali,
            saldo bisa dipakai kapan pun. <span className="text-emerald-400 font-semibold">Kredit tidak expire</span>.
          </p>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mt-3 flex items-center gap-3">
            <span className="text-3xl">🪙</span>
            <div>
              <div className="text-white font-semibold">3 kredit gratis saat registrasi</div>
              <div className="text-xs text-neutral-500">Cukup untuk membuat 9 klip percobaan.</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-white text-lg font-bold mb-2">Konsumsi Kredit</h2>
          <p className="mb-3">
            Model sederhana: <span className="text-white font-semibold">1 kredit = 1 video → {DEFAULT_CLIPS_PER_VIDEO} klip</span>.
            Panjang video tidak mempengaruhi kredit yang dipotong.
          </p>

          <div className="bg-[#0d0d16] border border-white/[0.06] rounded-xl overflow-hidden">
            <Row col1="Aksi" col2="Kredit" header />
            <Row col1={`Generate video → ${DEFAULT_CLIPS_PER_VIDEO} klip vertikal`} col2="1 kredit" />
            <Row col1="Export 6 klip per video (opsional, tier Max/Ultra)" col2="1 kredit" />
            <Row col1="Export MP4 HD 1080p (semua tier)" col2="GRATIS" highlight />
            <Row col1={`Face tracking otomatis (tier Max/Ultra)`} col2={`+${CREDIT_COST.faceTrackingPerExport} kredit`} />
            <Row col1="Custom watermark" col2="GRATIS" highlight />
            <Row col1="Edit caption / preset / crop" col2="GRATIS" highlight />
            <Row col1="Ganti bahasa transkrip" col2="GRATIS" highlight />
          </div>
        </section>

        <section>
          <h2 className="text-white text-lg font-bold mb-2">Kapan Kredit Dipotong</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Kredit dipotong <span className="text-white">setelah kami tahu durasi video</span> (setelah download metadata YouTube atau upload selesai), bukan saat klik tombol.</li>
            <li>Kalau pipeline gagal setelah pemotongan, kredit <span className="text-emerald-400">otomatis di-refund</span> ke saldo.</li>
            <li>Kredit face tracking dipotong sebelum analisis dijalankan. Kalau saldo tidak cukup, export tetap berjalan dengan crop tetap.</li>
            <li>Video yang gagal di-generate (URL invalid, YouTube memblokir, error server) <span className="text-white">tidak</span> memotong kredit.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-white text-lg font-bold mb-2">Pilih Paket Kredit</h2>
          <p className="mb-3">
            Model harga sederhana — sekali bayar, kredit langsung masuk ke saldo Anda. Tidak ada langganan bulanan.
          </p>

          <div className="bg-[#0d0d16] border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 px-4 py-2 border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              <div>Paket</div>
              <div className="text-right">Harga</div>
              <div className="text-right">Kredit</div>
              <div className="text-right">Per klip</div>
            </div>
            {PRICING_TIERS.map((tier, i) => (
              <div key={i} className="grid grid-cols-4 px-4 py-2.5 items-center text-sm border-t border-white/[0.04] first:border-t-0">
                <div className="text-white font-semibold">{tier.name}</div>
                <div className="text-right text-white">Rp {tier.priceRupiah.toLocaleString('id-ID')}</div>
                <div className="text-right text-amber-400 font-mono text-xs">{tier.credits}</div>
                <div className="text-right text-neutral-400 font-mono text-xs">Rp {tier.perClipRupiah.toLocaleString('id-ID')}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-3">
            Semua paket sekali bayar dan tidak expire.
            <Link href="/pricing" className="text-white underline ml-1">Lihat rincian paket →</Link>
          </p>
        </section>

        <section>
          <h2 className="text-white text-lg font-bold mb-2">Contoh Perhitungan</h2>
          <div className="bg-[#0d0d16] border border-white/[0.06] rounded-xl p-4 space-y-3">
            <Example
              title="Kreator kasual: 5 video/bulan"
              lines={[
                '5 video × 1 kredit = 5 kredit',
                `Total klip yang dihasilkan: 5 × ${DEFAULT_CLIPS_PER_VIDEO} = 15 klip`,
                'Paket cocok: Lite (Rp 19.000, 10 kredit = 2 bulan)',
              ]}
            />
            <Example
              title="Kreator serius: 20 video/bulan"
              lines={[
                '20 video × 1 kredit = 20 kredit',
                `Total klip: 20 × ${DEFAULT_CLIPS_PER_VIDEO} = 60 klip`,
                'Paket cocok: Plus (Rp 49.000, 30 kredit) atau Max (Rp 99.000, 75 kredit)',
              ]}
            />
            <Example
              title="Agency: 100 video/bulan"
              lines={[
                '100 video × 1 kredit = 100 kredit',
                `Total klip: 100 × ${DEFAULT_CLIPS_PER_VIDEO} = 300 klip`,
                'Paket cocok: Ultra (Rp 199.000, 180 kredit ≈ 1.8 bulan)',
                'Atau: Founder Lifetime (Rp 599.000) untuk pemakaian jangka panjang',
              ]}
            />
          </div>
        </section>

        <section>
          <h2 className="text-white text-lg font-bold mb-2">FAQ</h2>
          <FAQ q="Apakah kredit expire?" a="Tidak. Kredit tetap di akun Anda selama akun aktif." />
          <FAQ q="Bisa refund top-up?" a="Kredit yang sudah masuk saldo tidak bisa di-refund ke Rupiah. Tapi kredit yang gagal terpakai (misal video corrupt, server error) otomatis kembali ke saldo." />
          <FAQ q="Kenapa harga flat per video?" a="Karena bottleneck kami di AI analysis, bukan durasi video. Video 60 menit dan 10 menit sama-sama butuh 1 pass LLM untuk cari klip viralnya." />
          <FAQ q="Bisa transfer kredit ke teman?" a="Belum. Fitur gift & referral kredit sedang di roadmap." />
          <FAQ q="Ada trial?" a="3 kredit gratis saat registrasi, cukup untuk 9 klip percobaan. Tidak ada trial berlangganan." />
          <FAQ q="Beda tier Lite vs Founder?" a="Lite = beli sekali, dapat 10 kredit selesai. Founder = beli sekali Rp 599rb, dapat 100 kredit langsung PLUS 100 kredit gratis setiap bulan SELAMANYA + fitur premium." />
        </section>

        <div className="text-center pt-4">
          <Link href="/pricing" className="inline-block bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-neutral-200 transition">
            🪙 Lihat Paket Kredit
          </Link>
        </div>
      </div>
    </DashboardShell>
  )
}

function Row({ col1, col2, header, highlight }: { col1: string; col2: string; header?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex items-center px-4 py-2.5 ${!header ? 'border-t border-white/[0.04]' : ''} ${header ? 'bg-white/[0.03]' : ''}`}>
      <div className={`flex-1 ${header ? 'text-[10px] uppercase tracking-wider text-neutral-400 font-semibold' : 'text-white text-sm'}`}>
        {col1}
      </div>
      <div className={`text-sm font-mono font-semibold shrink-0 ${
        header ? 'text-[10px] uppercase tracking-wider text-neutral-400' :
        highlight ? 'text-emerald-400' : 'text-white'
      }`}>
        {col2}
      </div>
    </div>
  )
}

function Example({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <div className="text-white text-sm font-semibold">{title}</div>
      <ul className="text-xs text-neutral-400 mt-1 space-y-0.5 pl-4 list-disc">
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  )
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="border-t border-white/[0.04] py-3">
      <div className="text-white font-semibold text-sm mb-1">{q}</div>
      <div className="text-neutral-400 text-xs">{a}</div>
    </div>
  )
}
