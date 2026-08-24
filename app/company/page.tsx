'use client'
import { MarketingShell, MarketingPanel } from '@/components/marketing/MarketingShell'

export default function CompanyPage() {
  return (
    <MarketingShell>
      <MarketingPanel title="Company" subtitle="Dibuat oleh kreator, untuk kreator Indonesia.">
        <div className="space-y-4 text-neutral-300 text-sm leading-relaxed">
          <p>
            <span className="text-white font-semibold">zieclip</span> lahir dari satu pengamatan sederhana: kreator
            Indonesia butuh tool clipping AI yang cepat, akurat, dan harganya masuk akal untuk pasar sini,
            bukan tools mahal yang dibuat untuk pasar Amerika lalu diterjemahkan.
          </p>
          <p>
            Kami memfokuskan tiga hal: <span className="text-white">bahasa Indonesia native</span> di seluruh
            antarmuka dan output, <span className="text-white">pembayaran Rupiah</span> dengan QRIS dan e-wallet
            lokal, dan preset caption yang beneran digunakan kreator lokal, bukan template asing yang tidak
            nyambung dengan gaya konten Indonesia.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="text-2xl font-bold text-white">Hemat</div>
              <div className="text-[11px] text-neutral-400 mt-1">Harga jauh lebih terjangkau dari kompetitor global.</div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="text-2xl font-bold text-white">Rupiah</div>
              <div className="text-[11px] text-neutral-400 mt-1">Top-up pakai QRIS, DANA, OVO, atau GoPay tanpa kartu.</div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="text-2xl font-bold text-white">Fleksibel</div>
              <div className="text-[11px] text-neutral-400 mt-1">Prepaid, tanpa langganan. Bayar sesuai pemakaian.</div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.06] text-xs text-neutral-500">
            Kontak: <a href="mailto:support@zieclip.app" className="text-white underline">support@zieclip.app</a>
          </div>
        </div>
      </MarketingPanel>
    </MarketingShell>
  )
}
