'use client'
import { createBrowserClient } from '@supabase/ssr'

// Fallbacks keep `next build` from crashing when these aren't present at
// build time (NEXT_PUBLIC_* values are inlined at build; a Preview build or
// unset env would otherwise throw here and fail the whole build). At runtime
// in the browser the real inlined values are used; if they were genuinely
// missing at build, auth simply won't work and the console warns -- which is
// far easier to diagnose than a failed deployment.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing at build — auth will not work until these are set in the Vercel project env.')
}

// createBrowserClient (from @supabase/ssr) stores the session in cookies
// instead of localStorage. That's the whole reason for switching to it: API
// route handlers run on the server and can only see cookies, not
// localStorage, so without this no /api/* route could tell who (if anyone)
// was logged in -- which is why none of them checked auth before. See
// lib/supabase-server.ts and middleware.ts, which depend on the session
// actually living in a cookie.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
