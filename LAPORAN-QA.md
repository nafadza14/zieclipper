# Laporan QA — Aplikasi Zieklipp (clipper-app)

Tanggal: 25 Juli 2026
Metode: review seluruh kode (Next.js + FastAPI), typecheck TypeScript, build produksi, compile-check Python, pengujian runtime API transkrip, dan uji ekspor end-to-end dengan FFmpeg sungguhan (termasuk verifikasi visual frame hasil ekspor).

## Ringkasan

Ditemukan **9 bug** (3 kritis, 3 sedang, 3 minor). **Semuanya sudah diperbaiki** dan diverifikasi ulang: `tsc --noEmit` bersih, `next build` sukses, API Python jalan, dan pipeline ekspor menghasilkan MP4 1080×1920 dengan subtitle karaoke + kotak background yang benar.

## Bug yang ditemukan & diperbaiki

### Kritis

**1. Provider AI tidak diteruskan ke analisis — DeepSeek/Gemini selalu gagal**
File: `api/main.py`
Endpoint `/analyze` memanggil `analyze_transcript(req.transcript, req.model, req.language)` — argumen ketiga masuk ke parameter `language`, dan `provider` tidak pernah diteruskan (selalu default `anthropic`). Akibatnya jika user memilih DeepSeek/Gemini, model seperti `deepseek-chat` dikirim ke API Anthropic → error 404 → seluruh job gagal di tahap "analyzing".
Perbaikan: panggilan diubah memakai keyword argument (`language=req.language, provider=req.provider`).

**2. Transkrip duplikat dari VTT auto-generated YouTube**
File: `api/services/transcript.py`
VTT auto-generated YouTube memakai format "rolling window": ada cue yang hanya mengulang teks yang sudah ter-capture (tanpa tag `<c>`). Parser memperlakukan cue ini sebagai subtitle manual dan mendistribusikan kata-katanya → **setiap frasa muncul dua kali** di subtitle. Terbukti saat pengujian runtime.
Perbaikan: jika file mengandung tag `<c>` (penanda auto-generated), cue tanpa `<c>` dilewati.

**3. Warna background preset merusak file ASS ekspor**
File: `components/editor/presets/SubtitlePresets.ts`, `lib/ass-generator.ts`
Preset Karaoke & Subtitles memakai warna `rgba(0,0,0,0.7)`, tapi generator ASS mengharapkan hex `#RRGGBBAA`. Hasilnya baris style ASS berisi sampah (`&HFF0,a(gb&`) — koma di dalamnya bahkan menggeser semua kolom style → kotak background rusak total saat ekspor. Terbukti lewat pengujian langsung.
Perbaikan: preset diubah ke hex 8-digit (`#000000B3`), dan parser warna dibuat defensif (menerima `#RGB`, `#RRGGBB`, `#RRGGBBAA`, dan `rgba()`; fallback hitam bila tidak valid).

### Sedang

**4. Kotak background subtitle tidak pernah muncul di hasil ekspor**
File: `lib/ass-generator.ts`
Dengan `BorderStyle=3`, libass menggambar kotak memakai **OutlineColour**, bukan BackColour. Kode menaruh warna background di field BackColour dan OutlineColour dibuat transparan → kotak tak terlihat sama sekali. Terbukti lewat verifikasi visual frame ekspor.
Perbaikan: warna dipindah ke field OutlineColour (+ padding minimum 1). Sudah diverifikasi visual: kotak kini muncul.

**5. Timestamp negatif membuat subtitle pertama hilang saat ekspor**
File: `app/api/export/route.ts`, `lib/ass-generator.ts`
Kata yang mulai sedikit sebelum awal klip (ikut terfilter karena `word.end >= clip.start_time`) menghasilkan waktu ASS negatif (`-1:-1:-0.80`) yang tidak bisa diparse libass → event subtitle di-drop diam-diam.
Perbaikan: waktu chunk/kata di-clamp ke rentang `[0, durasi klip]` di route ekspor, dan `secondsToAssTime` kini membulatkan ke centisecond dulu (juga memperbaiki edge case `59.999 → "0:00:60.00"` yang invalid).

**6. Model Gemini di UI sudah dimatikan Google**
File: `app/page.tsx`
`gemini-2.0-flash` dimatikan Google per 1 Juni 2026 dan `gemini-1.5-pro` sudah pensiun lebih dulu — dua dari tiga pilihan Gemini akan error saat dipakai.
Perbaikan: daftar diganti ke `gemini-2.5-flash` (default) dan `gemini-2.5-pro` (keduanya masih hidup, dijadwalkan sampai Oktober 2026 — lihat catatan di bawah).

### Minor

**7. Model metadata di-hardcode `claude-sonnet-4-5`**
File: `components/editor/panels/ExportPanel.tsx`
Tombol "Generate Title, Caption & Tags" selalu mengirim model Claude hardcoded — menimpa model pilihan user, dan jika providernya DeepSeek/Gemini, model Claude dikirim ke API yang salah → error.
Perbaikan: field model dihapus dari request; server otomatis memakai `job.model` + `job.provider` yang konsisten. Teks "Generating with Claude..." juga diganti jadi netral.

**8. Polling job tidak berhenti jika job hilang (server restart)**
File: `app/page.tsx`
Jika server di-restart di tengah proses, `/api/jobs/[id]` balas 404 tapi polling tetap jalan sampai 10 menit tanpa pesan error.
Perbaikan: respons non-OK langsung melempar error yang jelas.

**9. Angka "0" nyasar di header halaman clips**
File: `app/clips/[jobId]/page.tsx`
`{job.duration && (...)}` me-render literal `0` bila durasi 0. Diubah ke ternary.
Bonus: input warna background di panel Subtitles sebelumnya selalu menampilkan hitam (value hardcoded); kini menampilkan warna aktif. Serta `pref_langs` di `transcript.py` yang bisa unbound di jalur fallback kini diinisialisasi lebih awal.

## Verifikasi setelah perbaikan

- `npx tsc --noEmit` — bersih, tanpa error.
- `npx next build` — sukses (semua 12 route ter-compile).
- `python3 -m compileall api` — bersih.
- Runtime FastAPI: `/health`, `/transcript` (VTT auto-gen → tanpa duplikat; VTT manual → tetap terparse benar).
- Ekspor end-to-end: video uji 1920×1080 → crop 608×1080 → scale 1080×1920 → burn subtitle ASS (preset Karaoke). FFmpeg exit 0, output 1080×1920 5 detik, frame diverifikasi visual: highlight karaoke ✓, kata lampau meredup ✓, kotak background ✓.

## Catatan (bukan bug, tapi perlu diketahui)

- **Fitur emoji belum diimplementasikan** — pengaturan emoji (posisi, animasi, override per-chunk) tersimpan tapi tidak digambar di preview canvas maupun di ekspor ASS. UI-nya ada, efeknya belum.
- **Background fill crop (blur/black/color) belum dipakai saat ekspor** — ekspor selalu memotong strip 9:16 penuh; pengaturan background fill di panel Crop tidak berpengaruh.
- **Crop mengasumsikan sumber 1920×1080** — jika YouTube hanya menyediakan 720p, filter `crop=608:1080` akan gagal. Sebaiknya nanti dibuat dinamis dari resolusi asli (via ffprobe).
- **Preview segmen memakai `-c copy`** — pemotongan jatuh ke keyframe terdekat, jadi preview bisa geser ±1–2 detik dari ekspor final (ekspor sendiri akurat karena re-encode). Slider "Subtitle Sync" sudah tersedia sebagai kompensasi manual.
- **Job hilang saat server restart** — by design (in-memory, tanpa database).
- **`gemini-2.5-*` dijadwalkan pensiun Oktober 2026** — siapkan migrasi ke generasi Gemini 3 sebelum tanggal itu.
- **`.env.local` wajib dibuat manual** (tidak ada `.env.example` di repo): minimal `ANTHROPIC_API_KEY`, plus `DEEPSEEK_API_KEY`/`GEMINI_API_KEY` bila dipakai, dan `PYTHON_SERVICE_URL=http://localhost:8002`.
- `deepseek-reasoner` dipakai dengan function calling — pastikan versi API DeepSeek Anda sudah mendukung tools pada model reasoner; jika tidak, pakai `deepseek-chat`.

## File yang diubah

1. `api/main.py`
2. `api/services/transcript.py`
3. `app/page.tsx`
4. `app/clips/[jobId]/page.tsx`
5. `app/api/export/route.ts`
6. `components/editor/presets/SubtitlePresets.ts`
7. `components/editor/panels/ExportPanel.tsx`
8. `components/editor/panels/SubtitleStylePanel.tsx`
9. `lib/ass-generator.ts`
