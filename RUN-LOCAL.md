# Menjalankan Zieclipper LOKAL di PC (Windows)

Menjalankan lokal menghindari semua masalah Vercel (limit build, blokir IP
datacenter, limit 300 detik). PC Anda pakai IP rumahan, jadi YouTube jauh
lebih jarang memblokir.

## 1. Isi .env.local
Buka file `.env.local` di folder ini, isi DUA nilai Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`  = Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
Keduanya ada di: dashboard Supabase > Project Settings > API.
(LLM boleh dikosongkan dulu — default 'sumopod' punya key bawaan.)

## 2. Install yt-dlp (ffmpeg TIDAK perlu — sudah dari npm)
Di PowerShell:
    winget install yt-dlp.yt-dlp
Lalu TUTUP dan BUKA ULANG PowerShell agar PATH ter-update. Cek:
    yt-dlp --version
Kalau `winget` tidak ada, unduh yt-dlp.exe dari
https://github.com/yt-dlp/yt-dlp/releases/latest (file `yt-dlp.exe`),
taruh di folder ini, lalu set di .env.local:  YTDLP_PATH=./yt-dlp.exe

## 3. Install dependency & jalankan
Di PowerShell, di folder ini:
    npm install
    npm run dev
Buka browser: http://localhost:3000

## 4. Pakai
- Sign in (akun Supabase Anda).
- Paste URL YouTube > "find viral moments".
- Semua proses (yt-dlp, ffmpeg, AI) jalan di PC Anda.

## Catatan
- yt-dlp butuh runtime JS: sudah otomatis diarahkan ke Node yang menjalankan
  server (tidak perlu install Deno).
- File hasil (segmen video, thumbnail, export) tetap disimpan ke Supabase
  Storage (bucket 'media' dari migrasi) lalu diakses via signed URL — ini
  berfungsi normal dari lokal.
- Kalau yt-dlp kena blokir, aktifkan cookies: pastikan baris
  YTDLP_COOKIES_PATH di .env.local tidak diberi tanda #.
