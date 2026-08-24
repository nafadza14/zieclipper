import type { SupabaseClient } from '@supabase/supabase-js'

// Google OAuth2 for YouTube publishing. Kept dependency-light (uses fetch)
// so we don't pull in googleapis SDK just to shuffle tokens around.
// Env vars required (see .env.example):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   OAUTH_REDIRECT_ORIGIN  (e.g. http://localhost:3000 in dev, https://clip.zieads.com in prod)

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',   // fetch channel name/avatar to display in settings
]

export function ytConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.OAUTH_REDIRECT_ORIGIN)
}

export function ytAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const redirect = `${process.env.OAUTH_REDIRECT_ORIGIN}/api/social/youtube/callback`
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirect)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')     // needed for refresh_token
  url.searchParams.set('prompt', 'consent')          // force refresh_token even on re-connect
  url.searchParams.set('state', state)
  return url.toString()
}

export async function ytExchangeCode(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}> {
  const redirect = `${process.env.OAUTH_REDIRECT_ORIGIN}/api/social/youtube/callback`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  return res.json()
}

// Refreshes an access token using the stored refresh_token. Called by
// upload path when the cached access_token is close to expiry.
export async function ytRefresh(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
  return res.json()
}

// Fetch the caller's YouTube channel id + display name (mine=true).
export async function ytChannelInfo(accessToken: string): Promise<{ id: string; title: string; thumb?: string }> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`YouTube channels.list failed: ${await res.text()}`)
  const data = await res.json()
  const item = data.items?.[0]
  if (!item) throw new Error('No YouTube channel found for this account.')
  return {
    id: item.id,
    title: item.snippet?.title ?? 'YouTube channel',
    thumb: item.snippet?.thumbnails?.default?.url,
  }
}

// Ensures we have a live access_token for a given social_accounts row.
// Uses the cached one if still valid, otherwise refreshes and persists.
export async function getFreshAccessToken(
  supabase: SupabaseClient,
  account: { id: string; access_token: string | null; refresh_token: string | null; token_expires_at: string | null },
): Promise<string> {
  const now = Date.now()
  const exp = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0
  if (account.access_token && exp - 60_000 > now) return account.access_token
  if (!account.refresh_token) throw new Error('Refresh token missing — reconnect this account.')

  const r = await ytRefresh(account.refresh_token)
  const newExp = new Date(Date.now() + r.expires_in * 1000).toISOString()
  await supabase.from('social_accounts').update({
    access_token: r.access_token,
    token_expires_at: newExp,
    updated_at: new Date().toISOString(),
  }).eq('id', account.id)
  return r.access_token
}

// Resumable upload of a video buffer to the user's YouTube channel.
// Returns the YouTube video id on success.
export async function ytUploadVideo(
  accessToken: string,
  videoBuffer: Buffer,
  meta: { title: string; description?: string; tags?: string[]; privacyStatus?: 'private' | 'unlisted' | 'public' },
): Promise<string> {
  // 1) start resumable session
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(videoBuffer.byteLength),
    },
    body: JSON.stringify({
      snippet: {
        title: meta.title.slice(0, 100),
        description: (meta.description ?? '').slice(0, 5000),
        tags: (meta.tags ?? []).slice(0, 500),
        categoryId: '22',
      },
      status: {
        privacyStatus: meta.privacyStatus ?? 'private',
        selfDeclaredMadeForKids: false,
      },
    }),
  })
  if (!initRes.ok) throw new Error(`YouTube upload init failed: ${await initRes.text()}`)
  const uploadUrl = initRes.headers.get('Location')
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL')

  // 2) PUT the whole file. For >100MB you'd chunk, but our exports are
  //    ~5-20MB so a single PUT is fine.
  // Buffer isn't directly BodyInit in modern TS libs. Copy into a
  // Uint8Array whose backing ArrayBuffer is guaranteed non-shared -- fetch
  // accepts that as body.
  const u8 = new Uint8Array(videoBuffer.byteLength)
  u8.set(videoBuffer)
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuffer.byteLength) },
    body: u8,
  })
  if (!upRes.ok) throw new Error(`YouTube upload failed: ${await upRes.text()}`)
  const data = await upRes.json()
  return data.id as string
}
