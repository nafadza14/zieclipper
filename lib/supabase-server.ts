import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// NOTE: do NOT throw at module top-level. `next build` imports every route
// module to collect page data, and a top-level throw here would fail the
// whole build the moment these env vars aren't present in the build
// environment (e.g. a Preview deploy, or env not scoped to build). Validate
// lazily inside the function instead, so a genuine misconfiguration surfaces
// as a clean 500 at request time rather than a broken build.

// Server-side Supabase client for use inside Route Handlers (app/api/**).
// Reads the session from the request's cookies (set by middleware.ts /
// lib/supabase.ts's browser client) and queries as THAT user -- so Row
// Level Security on the jobs/export_jobs tables applies exactly like it
// would for a query the browser made directly. This client never uses the
// service_role key; it has no more access than the logged-in user does.
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (set them in the Vercel project env for all environments)')
  }
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Route Handlers can write cookies; Server Components can't. This
          // is only ever a problem if this helper gets called from a
          // Server Component, in which case middleware.ts is already
          // responsible for keeping the session cookie fresh.
        }
      },
    },
  })
}

// Every /api/* route that touches a job or triggers worker.js work should
// call this first and bail with 401 if there's no user. Before this file
// existed, NONE of the API routes checked auth at all -- anyone who found
// the URL could call /api/download directly with curl and spend your
// Anthropic budget without ever signing in.
export async function requireUser(): Promise<{ user: User; supabase: SupabaseClient } | { error: true }> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: true }
  return { user, supabase }
}
