'use client'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Logo } from './Logo'

// Shared shell for public marketing pages (/, /platform, /pricing,
// /company, /support). All of them share the same fullscreen background
// video + gradient + top navbar so switching routes feels like flipping
// between panels rather than navigating. Each page fills the ONE viewport
// via `h-screen overflow-hidden` — no scroll, no other sections stacked
// below (per user request).

const NAV = [
  { href: '/platform', label: 'platform' },
  { href: '/pricing',  label: 'pricing' },
  { href: '/company',  label: 'company' },
  { href: '/support',  label: 'support' },
]

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const { user } = useAuth()

  return (
    <section className="relative h-screen w-full overflow-hidden bg-black select-none">
      {/* Shared background video — preload="none" defers download until
          the page is interactive. Poster color prevents FOUC while video
          initializes. Cuts initial paint by 2-3s on slow Indonesian
          connections. */}
      <video
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        autoPlay loop muted playsInline
        preload="none"
        style={{ background: '#0a0a0f' }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_063509_7d167302-4fd4-480b-8260-18ab572333d4.mp4"
      />
      {/* Bottom gradient — same as landing */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent to-black z-10" />

      {/* Top nav */}
      <nav className="absolute z-20 px-6 md:px-10 pt-6 top-0 left-0 right-0 flex items-center justify-between gap-4">
        {/* Logo → back to landing. Bigger mark (~1.75× original) per redesign. */}
        <Link href="/" className="flex items-center bg-neutral-900/90 backdrop-blur rounded-full pl-3 pr-6 py-2">
          <Logo size={44} />
        </Link>

        {/* Nav pills — active state uses white pill so user knows which page they're on */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-900/90 backdrop-blur rounded-full px-2 py-1.5">
          {NAV.map((n) => {
            const active = pathname === n.href
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`text-sm px-5 py-2 rounded-full transition-colors ${
                  active
                    ? 'bg-white text-black font-semibold'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden sm:inline text-xs text-neutral-400 font-medium font-mono">{user.email}</span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-neutral-900/80 border border-white/10 hover:border-white/30 text-white text-xs font-semibold rounded-full px-4 py-2.5 transition cursor-pointer"
              >
                sign out
              </button>
              <button
                onClick={() => router.push('/new')}
                className="bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-neutral-200 transition-colors cursor-pointer shadow-lg"
              >
                open dashboard
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push('/auth')}
                className="bg-neutral-900/80 border border-white/10 hover:border-white/30 text-white text-xs font-semibold rounded-full px-4 py-2.5 transition cursor-pointer"
              >
                sign in
              </button>
              <button
                onClick={() => router.push('/auth')}
                className="bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-neutral-200 transition-colors cursor-pointer shadow-lg"
              >
                start clipping
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Content — full viewport minus navbar; each page positions itself */}
      <div className="relative h-full w-full z-10 pointer-events-none">
        {children}
      </div>
    </section>
  )
}

// Helper container: centered semi-transparent card used by non-landing
// marketing pages (platform/pricing/company/support). Keeps the fullscreen
// video visible around a readable panel in the middle.
export function MarketingPanel({ title, subtitle, children, wide }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pt-24 pb-16 px-4 pointer-events-none overflow-y-auto">
      <div className={`pointer-events-auto bg-neutral-950/85 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 md:p-8 w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} my-auto shadow-2xl`}>
        <div className="mb-5">
          <h1 className="text-white text-2xl md:text-3xl font-bold">{title}</h1>
          {subtitle && <p className="text-neutral-400 text-sm mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
