import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { ytExchangeCode, ytChannelInfo } from '@/server/youtube-oauth'

// Google redirects the user here after consent. We verify the state cookie,
// exchange the code for tokens, fetch their YouTube channel info, and
// upsert into social_accounts. Finally redirect back to /settings#accounts.
export async function GET(req: NextRequest) {
  const auth = await requireUser()
  const base = process.env.OAUTH_REDIRECT_ORIGIN || 'http://localhost:3000'
  const backHome = new URL('/settings#accounts', base)
  if ('error' in auth) return NextResponse.redirect(new URL('/auth?next=/settings#accounts', base))

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.cookies.get('yt_oauth_state')?.value

  if (!code || !state || !cookieState || state !== cookieState) {
    const err = new URL('/settings?social_error=state_mismatch#accounts', base)
    return NextResponse.redirect(err)
  }

  try {
    const tokens = await ytExchangeCode(code)
    const channel = await ytChannelInfo(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await auth.supabase.from('social_accounts').upsert({
      user_id: auth.user.id,
      platform: 'youtube',
      external_id: channel.id,
      display_name: channel.title,
      avatar_url: channel.thumb ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expires_at: expiresAt,
      scopes: tokens.scope,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform,external_id' })

    const res = NextResponse.redirect(backHome)
    res.cookies.delete('yt_oauth_state')
    return res
  } catch (err: any) {
    const errUrl = new URL(`/settings?social_error=${encodeURIComponent(err.message.slice(0, 200))}#accounts`, base)
    return NextResponse.redirect(errUrl)
  }
}
