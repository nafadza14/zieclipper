# Deploy zieclip on Sumopod VPS

Dokumen ini menggantikan `DEPLOY-VERCEL-SUPABASE.md`. Setup sekarang: **dev di laptop, prod di VPS**.

**VPS:**
- Public IP: `43.134.237.166`
- Username: `ubuntu`
- OS: Ubuntu (22.04 LTS atau 24.04 LTS)
- Domain target: `clip.zieads.com`

---

## Arsitektur pemisahan dev vs prod

| | Dev (laptop) | Prod (VPS) |
|---|---|---|
| URL | `http://localhost:3000` | `https://clip.zieads.com` |
| Env file | `.env.local` | `.env.production` (di VPS, tidak di-commit) |
| Supabase | project yang sama (`rezpqaqzokacrgrnwsun`) | project yang sama |
| R2 bucket | `zieclip` prefix `dev/<userId>/...` | `zieclip` prefix `<userId>/...` |
| Google OAuth redirect | `http://localhost:3000/api/social/youtube/callback` | `https://clip.zieads.com/api/social/youtube/callback` |

**Kenapa Supabase & R2 dishare:** menghemat cost + free tier. Data user dev = data user real, tapi karena dev pakai email login sendiri (`winstonwiradiai@gmail.com`), RLS memisahkan otomatis. Kalau kamu mau isolasi total, bikin project Supabase kedua khusus dev nanti.

---

## Bagian 1 — Setup awal VPS (sekali seumur hidup)

SSH masuk dari laptop:
```bash
ssh ubuntu@43.134.237.166
```

### 1.1 Update sistem + tools dasar
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git curl ffmpeg python3-pip nginx ufw
# curl-cffi untuk yt-dlp impersonation (bypass YouTube bot check)
pip3 install --break-system-packages curl-cffi
```

### 1.2 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # harus v20.x
```

### 1.3 Install PM2 (process manager)
```bash
sudo npm install -g pm2
pm2 install pm2-logrotate     # auto-rotate logs biar disk nggak penuh
```

### 1.4 Firewall (allow SSH, HTTP, HTTPS)
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

---

## Bagian 2 — Clone repo + first deploy

### 2.1 Struktur folder
```bash
mkdir -p /home/ubuntu/zieclip/logs
cd /home/ubuntu/zieclip
git clone https://github.com/<username>/zieclip.git current
cd current
```

### 2.2 Buat `.env.production` (JANGAN commit ke git)
```bash
nano .env.production
```

Isi (ganti values dari `.env.local` di laptop, tapi ubah `OAUTH_REDIRECT_ORIGIN`):
```env
NEXT_PUBLIC_SUPABASE_URL=https://rezpqaqzokacrgrnwsun.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Du6rBmH89uuzT9ybsqFnEg_D7RSP7P-

SUMOPOD_API_KEY=<paste dari sumopod.com>
GROQ_API_KEY=<paste dari console.groq.com>
# ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY kalau kamu pakai

R2_ACCOUNT_ID=<paste dari dashboard Cloudflare>
R2_ACCESS_KEY_ID=<paste>
R2_SECRET_ACCESS_KEY=<paste>
R2_BUCKET_NAME=zieclip

# YouTube OAuth — REDIRECT ORIGIN wajib beda dari dev
GOOGLE_CLIENT_ID=<isi setelah setup Google Cloud Console — lihat DEPLOY-VPS.md §4>
GOOGLE_CLIENT_SECRET=<isi>
OAUTH_REDIRECT_ORIGIN=https://clip.zieads.com

# yt-dlp cookies (base64)
YTDLP_COOKIES_B64=<base64 dari www.youtube.com_cookies.txt>
```

Copy dari laptop: cara termudah lewat scp langsung:
```bash
# JALANKAN DI LAPTOP, bukan VPS:
scp .env.local ubuntu@43.134.237.166:/home/ubuntu/zieclip/current/.env.production
# lalu SSH lagi ke VPS dan edit OAUTH_REDIRECT_ORIGIN
```

Permission ketat:
```bash
chmod 600 .env.production
```

### 2.3 Install deps + build
```bash
npm ci                # bersih, dari package-lock.json
npm run build         # ~3-6 menit di VPS 4 GB
```

### 2.4 Start via PM2
```bash
pm2 start ecosystem.config.js
pm2 save              # simpan snapshot process list
pm2 startup           # ikuti instruksi outputnya (copy-paste satu perintah sudo)
```

Tes: `curl http://localhost:3000` — harus balik HTML.

---

## Bagian 3 — Nginx + HTTPS

### 3.1 Point DNS ke VPS
Di Cloudflare (atau registrar tempat kamu beli `zieads.com`):
- Type: `A`, Name: `clip`, Content: `43.134.237.166`, Proxy: **DNS only** (grey cloud, bukan orange — biar certbot bisa verify langsung ke server)

Tunggu 1-5 menit, cek: `dig clip.zieads.com` — harus balik IP VPS.

### 3.2 Install nginx site config
```bash
sudo cp /home/ubuntu/zieclip/current/deploy/nginx-zieclip.conf /etc/nginx/sites-available/zieclip
sudo ln -s /etc/nginx/sites-available/zieclip /etc/nginx/sites-enabled/zieclip
sudo rm -f /etc/nginx/sites-enabled/default   # matiin default nginx page
sudo nginx -t
```

Kalau `-t` gagal karena SSL cert belum ada, sementara **comment dulu** blok `listen 443 ssl` di config, kasih server plain HTTP dulu buat certbot.

### 3.3 Install certbot + issue cert
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d clip.zieads.com --email winstonwiradiai@gmail.com --agree-tos --no-eff-email
```

Certbot otomatis rewrite nginx config buat HTTPS + install cron renewal. Kalau kamu pakai config `nginx-zieclip.conf` dari repo, certbot cuma perlu ngisi cert paths.

Verifikasi: buka `https://clip.zieads.com` di browser.

### 3.4 Auto-renewal
Certbot install systemd timer sendiri. Cek: `sudo systemctl list-timers | grep certbot`.

---

## Bagian 4 — Google OAuth untuk prod

Google Cloud Console → project yang sudah kamu buat (untuk YouTube API):

**APIs & Services → Credentials → OAuth 2.0 Client IDs → edit client kamu:**

Tambahkan ke **Authorized redirect URIs**:
- `https://clip.zieads.com/api/social/youtube/callback` (YouTube upload)
- `https://rezpqaqzokacrgrnwsun.supabase.co/auth/v1/callback` (Supabase Google login)

Client ID + Secret **sama** untuk dev & prod (nggak perlu bikin dua).

Di **Supabase Dashboard → Authentication → URL Configuration**:
- Site URL: `https://clip.zieads.com`
- Additional Redirect URLs: `http://localhost:3000/**` (biar dev tetap jalan)

---

## Bagian 5 — GitHub setup

### 5.1 Push repo ke GitHub (kalau belum)
Di laptop:
```bash
cd C:\Users\USER\Downloads\clipper-app-master
git init                                        # kalau belum
git add .
git commit -m "Initial commit: zieclip full app"
gh repo create zieclip --private --source=. --remote=origin --push
# atau manual:
# git remote add origin git@github.com:<user>/zieclip.git
# git branch -M main
# git push -u origin main
```

Pastikan `.env.local`, `.env.production`, `www.youtube.com_cookies.txt`, dan `_cookies_b64.txt` **tidak** ke-push — `.gitignore` sudah cover semua ini (`.env*` + `*cookies*.txt`).

### 5.2 Setup SSH key khusus deploy (di laptop)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/zieclip-deploy -N ""
# Copy public key ke VPS:
ssh-copy-id -i ~/.ssh/zieclip-deploy.pub ubuntu@43.134.237.166
```

### 5.3 Simpan secrets di GitHub
Repo Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
|---|---|
| `VPS_HOST` | `43.134.237.166` |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | isi file `~/.ssh/zieclip-deploy` (private key, whole content termasuk `-----BEGIN OPENSSH PRIVATE KEY-----`) |

### 5.4 Test auto-deploy
Setiap push ke `main` sekarang triggers `.github/workflows/deploy.yml` → SSH ke VPS → `scripts/deploy.sh` (git pull + build + PM2 reload).

Push satu commit trivial buat test:
```bash
git commit --allow-empty -m "test deploy"
git push
```

Lihat progressnya di GitHub → Actions tab.

---

## Bagian 6 — Workflow harian

**Dev di laptop:**
```bash
npm run dev
# code, save, test di localhost:3000
```

**Deploy ke prod:**
```bash
git add . && git commit -m "your message" && git push
# GitHub Actions auto-deploy dalam ~2-5 menit
```

**Manual deploy dari SSH (kalau GitHub Actions down):**
```bash
ssh ubuntu@43.134.237.166
cd /home/ubuntu/zieclip/current
bash scripts/deploy.sh
```

**Cek status:**
```bash
pm2 status                    # apps running
pm2 logs zieclip              # live logs (Ctrl+C keluar)
pm2 logs zieclip --lines 100  # last 100 lines
pm2 monit                     # dashboard CPU/RAM realtime
```

**Restart tanpa deploy baru:**
```bash
pm2 restart zieclip
```

**Rollback ke commit sebelumnya:**
```bash
cd /home/ubuntu/zieclip/current
git log --oneline | head -5   # lihat commit history
git reset --hard <commit-sha>
npm ci && npm run build && pm2 reload zieclip
```

---

## Bagian 7 — Kalau ada masalah

**Build gagal karena OOM di VPS 2 GB RAM:**
```bash
# Bikin swap 2 GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**502 Bad Gateway di nginx:**
Node crash. `pm2 logs zieclip` lihat error, `pm2 restart zieclip`.

**Migrasi database (kalau ada file baru di `supabase/migrations/`):**
Jalanin lewat Supabase Dashboard → SQL Editor, paste isi file `.sql`. Belum ada auto-migration di setup ini.

**Cek disk usage:**
```bash
df -h
du -sh /home/ubuntu/zieclip/logs/
du -sh /tmp/zieclipper/
```

Kalau `/tmp/zieclipper/` besar (>5 GB), aman di-`rm -rf` — auto ke-rebuild per request.

**Log grow terus:**
```bash
pm2 flush zieclip     # kosongin logs
```

---

## Referensi cepat

| Perintah | Efek |
|---|---|
| `pm2 status` | list semua app |
| `pm2 restart zieclip` | restart (downtime kecil) |
| `pm2 reload zieclip` | reload (zero-downtime, disarankan) |
| `pm2 stop zieclip` | stop (nggak jalan sampai `start`) |
| `pm2 delete zieclip` | hapus dari PM2 (perlu `start` lagi dari ecosystem.config.js) |
| `sudo systemctl reload nginx` | reload config nginx tanpa downtime |
| `sudo nginx -t` | test config nginx sebelum reload |
| `sudo tail -f /var/log/nginx/error.log` | live nginx errors |
| `bash scripts/deploy.sh` | manual deploy |
