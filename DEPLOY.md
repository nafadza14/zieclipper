# Menjalankan & Men-deploy Zieclipper

Aplikasi ini butuh yt-dlp, ffmpeg, dan servis Python yang menyala terus —
karena itu **tidak bisa** di-deploy ke Vercel (serverless). Dua cara yang
didukung: preview lokal via Docker, dan deploy produksi ke Railway (atau host
sejenis: Render, Fly.io, VPS apa pun yang mendukung Docker).

## 1. Preview lokal di laptop (Docker)

Ini cara paling gampang untuk mencoba aplikasi tanpa install yt-dlp/ffmpeg
manual di Windows — semuanya sudah dibungkus di dalam container.

**Prasyarat:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) terpasang dan menyala.

1. Buka folder project di terminal (PowerShell), lalu salin file environment:
   ```
   copy .env.example .env.local
   ```
2. Buka `.env.local`, isi minimal `ANTHROPIC_API_KEY` (dapatkan di https://console.anthropic.com/settings/keys).
3. Jalankan:
   ```
   docker compose up --build
   ```
   Build pertama kali akan makan waktu beberapa menit (download base image,
   install ffmpeg/yt-dlp/dependencies). Build berikutnya jauh lebih cepat
   karena Docker meng-cache layer yang tidak berubah.
4. Buka http://localhost:3000 — paste URL YouTube dan coba.
5. Untuk berhenti: `Ctrl+C`, lalu `docker compose down` (data job/video yang
   sudah didownload tetap tersimpan di volume Docker, tidak hilang).

Kalau ingin coba ulang dari nol (rebuild total): `docker compose build --no-cache`.

## 2. Deploy produksi ke Railway

Vercel tidak akan dipakai untuk app ini — kalau project Vercel yang lama
masih terhubung ke repo `zieclipper`, boleh dibiarkan (tidak akan berfungsi,
tapi juga tidak mengganggu) atau di-disconnect dari Vercel dashboard.

1. Buka https://railway.app → **New Project** → **Deploy from GitHub repo** → pilih `nafadza14/zieclipper`.
2. Railway otomatis mendeteksi `Dockerfile` di root repo dan pakai itu untuk build — tidak perlu pengaturan build command manual.
3. Di tab **Variables**, tambahkan environment variable yang sama seperti di `.env.local`:
   - `ANTHROPIC_API_KEY` (wajib)
   - `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` (opsional, sesuai provider yang dipakai)
4. (Opsional tapi disarankan) Tab **Settings → Volumes** → tambah volume, mount path `/app/tmp`. Ini membuat video yang sudah didownload & hasil export tidak hilang setiap kali Railway redeploy/restart container.
5. Railway otomatis kasih domain publik (`*.up.railway.app`) setelah deploy pertama sukses — bisa dipakai langsung atau dihubungkan ke domain sendiri di tab **Settings → Networking**.
6. Setiap kali Anda push ke branch `main` di GitHub, Railway otomatis build & deploy ulang (sama seperti kebiasaan Vercel Anda sebelumnya).

### Catatan status job

Status job (progress download/analisis) disimpan di memori container, bukan
database. Kalau Railway restart container (redeploy, atau container crash),
job yang sedang berjalan akan hilang — video yang sudah selesai didownload
tetap aman di volume `/app/tmp` kalau Anda sudah pasang volume di langkah 4.
Ini keterbatasan yang sudah ada sejak awal aplikasi ini dibuat (lihat
`CLAUDE.md`), bukan sesuatu yang berubah karena pindah ke Railway.
