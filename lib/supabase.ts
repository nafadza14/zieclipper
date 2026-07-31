'use client'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// createBrowserClient (from @supabase/ssr) stores the session in cookies
// instead of localStorage. That's the whole reason for switching to it: API
// route handlers run on the server and can only see cookies, not
// localStorage, so without this no /api/* route could tell who (if anyone)
// was logged in -- which is why none of them checked auth before. See
// lib/supabase-server.ts and middleware.ts, which depend on the session
// actually living in a cookie.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
