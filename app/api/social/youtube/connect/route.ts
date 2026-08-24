import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireUser } from '@/lib/supabase-server'
import { ytAuthUrl, ytConfigured } from '@/server/youtube-oauth'

// Kicks off the Google OAuth flow. Redirects the user to Google's consent
// screen with our client ID + a signed `state` cookie so the callback can
// verify the origin and pair the incoming tokens with THIS user.
export async function GET() {
  const auth = await requireUser()
  if ('error' in auth) return NextResponse.redirect(new URL('/auth?next=/settings#accounts', getBaseUrl()))
  if (!ytConfigured()) {
    return NextResponse.json({
      error: 'YouTube OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_ORIGIN in .env.local.',
    }, { status: 501 })
  }

  const state = crypto.randomBytes(32).toString('hex')
  const url = ytAuthUrl(state)
  const res = NextResponse.redirect(url)
  // Simple HttpOnly cookie for CSRF protection on callback.
  res.cookies.set('yt_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 600, path: '/',
  })
  return res
}

function getBaseUrl(): string {
  return process.env.OAUTH_REDIRECT_ORIGIN || 'http://localhost:3000'
}
