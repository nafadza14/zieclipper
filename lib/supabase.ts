import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rezpqaqzokacrgrnwsun.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Du6rBmH89uuzT9ybsqFnEg_D7RSP7P-'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
