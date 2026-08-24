# dev-only/ — file lokal, tidak masuk GitHub

Folder ini **tidak pernah ke-push ke GitHub**. Cocok buat nyimpen apapun yang cuma butuh ada di laptop:

- `www.youtube.com_cookies.txt` — cookie YouTube untuk yt-dlp
- `_cookies_b64.txt` — versi base64 buat paste ke `.env.local` / VPS
- `.env.local.backup` — cadangan env file
- Video test buat coba upload/analysis
- Scratch notes, ideas, todo
- Credentials Google Cloud Console (JSON) sementara sebelum masuk env
- Screenshot debug, log dari error
- Sample transcripts, dump hasil LLM
- Apapun yang bersifat pribadi / rahasia / tidak buat production

## Cara pakai

Taruh file apapun di sini. `.gitignore` sudah handle — file baru langsung invisible ke `git status`. Cek dengan:

```bash
git status
# folder dev-only/ tidak akan muncul walaupun kamu tambahin file baru
```

Yang **tetap** ke-commit dari folder ini cuma dua file:
- `.gitkeep` — supaya folder path selalu ada di clone baru
- `README.md` — file ini, biar orang lain (atau kamu sendiri di masa depan) tahu fungsinya

## Jangan pindahin ke folder lain

Kalau kamu naruh cookies atau file rahasia di root project (bukan di sini), `.gitignore` mungkin masih cover lewat pattern lain (`.env*`, `*cookies*.txt`), tapi lebih aman **selalu** di dalam `dev-only/`. Satu tempat, satu aturan.

## Kalau file sudah terlanjur ke-commit sebelumnya

`.gitignore` cuma cegah commit BARU. Kalau file sudah pernah ter-commit sebelumnya, hapus dari git tapi tetap ada di disk:

```bash
git rm --cached path/ke/file
git commit -m "remove leaked file"
```

Kalau file itu punya credential (cookie, API key, password), **rotate credential-nya** karena tetap ada di git history walau sudah di-remove. History bisa di-rewrite pakai `git filter-repo` tapi lebih gampang bikin repo baru kalau memang belum banyak push.
