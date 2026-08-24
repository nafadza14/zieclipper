#!/usr/bin/env bash
# Deploy script for zieclip on the Sumopod VPS. Run this ON THE VPS
# (either manually via SSH, or from GitHub Actions -- see
# .github/workflows/deploy.yml). Assumes the initial setup steps in
# DEPLOY-VPS.md have been done (repo cloned, .env.production in place,
# PM2 installed, ecosystem.config.js registered).
#
# Usage (on the VPS):
#   cd /home/ubuntu/zieclip/current && bash scripts/deploy.sh
#
# What it does:
#   1. git pull       -- fetch the latest main
#   2. npm ci         -- clean, reproducible install from package-lock.json
#   3. next build     -- compile production bundle
#   4. pm2 reload     -- zero-downtime restart (starts a fresh worker before
#                        killing the old one, so requests don't 502)
set -euo pipefail

APP_DIR="/home/ubuntu/zieclip/current"

echo "→ Deploying zieclip from $APP_DIR"
cd "$APP_DIR"

echo "→ Pulling latest main"
git fetch origin main
git reset --hard origin/main

echo "→ Installing dependencies (npm ci)"
# `npm ci` refuses to modify package-lock.json -- catches drift between
# whatever was tested locally and what production actually gets.
npm ci --no-audit --no-fund

echo "→ Building production bundle"
npm run build

# Ensure yt-dlp is present (postinstall runs scripts/fetch-ytdlp.js, but
# this is a belt-and-suspenders check in case that step failed silently).
if [ ! -x "bin/yt-dlp_linux" ]; then
    echo "→ yt-dlp missing, fetching..."
    node scripts/fetch-ytdlp.js
fi

echo "→ Reloading PM2 (zero-downtime)"
# `reload` != `restart`: reload spins up a new process and drains the
# old one, so an in-flight export or upload isn't killed mid-request.
pm2 reload zieclip --update-env

echo "→ Deploy complete. Recent logs:"
pm2 logs zieclip --lines 10 --nostream
