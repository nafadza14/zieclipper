'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useContext } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ThemeContext } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'

// Local brand mark for the dashboard header. Same shape as
// components/marketing/Logo.tsx but inlined here to keep the sidebar's
// dependency graph flat (this file already carries all its own icons).
function BrandLogo({ isDark }: { isDark: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Image src="/logo.png" alt="zieclip" width={36} height={36} className="rounded-md" style={{ width: 36, height: 'auto' }} priority />
      <span className={`text-base font-semibold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>zieclip</span>
    </span>
  )
}

// Icons kept as inline SVG so we don't depend on a specific lucide-react
// version (the pinned 1.16.0 is old and doesn't export all names). All 20x20,
// stroke-based, so they inherit currentColor from the surrounding button.
const Icons = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" />
    </svg>
  ),
  library: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 4v6" />
    </svg>
  ),
  clip: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="M20 4L8.12 15.88" /><path d="M14 14l6 6" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M7 9l5-5 5 5" /><path d="M12 4v12" />
    </svg>
  ),
  template: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  post: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  signout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  ),
  sun: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
}

// Nav items shown in the sidebar. `soon: true` marks entries that are stubs
// today -- the button is still rendered (so the shell looks complete) but a
// "Coming soon" tag makes the state honest and the click routes to the
// stub page that also says so, instead of pretending to work.
type NavItem = { href: string; label: string; icon: keyof typeof Icons; soon?: boolean }

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Workspace',
    items: [
      { href: '/new', label: 'New Clip', icon: 'home' },
      { href: '/library', label: 'My Clips', icon: 'library' },
      { href: '/upload', label: 'Upload File', icon: 'upload' },
    ],
  },
  {
    section: 'Studio',
    items: [
      { href: '/templates', label: 'Templates', icon: 'template', soon: true },
      { href: '/schedule', label: 'Schedule Posts', icon: 'post', soon: true },
    ],
  },
  {
    section: 'Account',
    items: [
      { href: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const { user } = useAuth()
  const context = useContext(ThemeContext)
  const isDark = context?.theme !== 'light'
  const toggleTheme = context?.toggleTheme || (() => {})

  return (
    <aside className={`hidden md:flex md:flex-col fixed inset-y-0 left-0 w-60 z-30 ${
      isDark
        ? 'bg-[#08080d] border-r border-white/[0.06]'
        : 'bg-white border-r border-gray-200'
    }`}>
      {/* Brand */}
      <Link href="/" className={`flex items-center h-14 px-5 shrink-0 ${
        isDark
          ? 'border-b border-white/[0.06]'
          : 'border-b border-gray-200'
      }`}>
        <BrandLogo isDark={isDark} />
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className={`text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5 px-2 ${
              isDark ? 'text-neutral-500' : 'text-gray-500'
            }`}>
              {group.section}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                      isDark
                        ? active
                          ? 'bg-white/10 text-white'
                          : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                        : active
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <span className={isDark ? (active ? 'text-white' : 'text-neutral-500') : (active ? 'text-gray-900' : 'text-gray-500')}>{Icons[item.icon]}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.soon && (
                      <span className={`text-[9px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                        isDark
                          ? 'text-neutral-600 border-neutral-800'
                          : 'text-gray-600 border-gray-300'
                      }`}>
                        soon
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Credit balance widget — visible only when signed in */}
      {user && <CreditWidget isDark={isDark} />}

      {/* User footer */}
      <div className={`border-t p-3 shrink-0 ${
        isDark ? 'border-white/[0.06]' : 'border-gray-200'
      }`}>
        {user ? (
          <div className={`flex items-center gap-2.5 px-1.5 ${isDark ? '' : 'text-gray-900'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              isDark
                ? 'bg-white/10 border border-white/10 text-white'
                : 'bg-gray-200 border border-gray-300 text-gray-900'
            }`}>
              {(user.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs truncate font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{user.email}</div>
              <div className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>Signed in</div>
            </div>
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
              title="Sign out"
              className={`transition-colors p-1.5 rounded-md ${
                isDark
                  ? 'text-neutral-500 hover:text-white hover:bg-white/[0.04]'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {Icons.signout}
            </button>
          </div>
        ) : (
          <Link
            href="/auth"
            className={`block text-center text-xs transition py-2 rounded-md ${
              isDark
                ? 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}

// Balance widget refreshes on route change (each nav click re-fetches),
// so a generate that spent credits shows the new balance the next time
// the user clicks somewhere. No websocket needed.
function CreditWidget({ isDark }: { isDark: boolean }) {
  const pathname = usePathname()
  const [balance, setBalance] = useState<number | null>(null)
  useEffect(() => {
    fetch('/api/credits').then((r) => r.json()).then((d) => {
      if (typeof d?.balance === 'number') setBalance(d.balance)
    }).catch(() => {})
  }, [pathname])
  return (
    <Link
      href="/settings#credits"
      className={`mx-3 mb-2 flex items-center justify-between px-3 py-2 rounded-lg transition ${
        isDark
          ? 'bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20 hover:border-amber-500/40'
          : 'bg-gradient-to-r from-amber-50 to-transparent border border-amber-200 hover:border-amber-300'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-sm">🪙</span>
        <div>
          <div className={`text-xs font-semibold leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {balance === null ? '-' : balance.toLocaleString('id-ID')} kredit
          </div>
          <div className={`text-[9px] leading-tight ${isDark ? 'text-neutral-500' : 'text-gray-500'}`}>klik untuk top-up</div>
        </div>
      </div>
      <span className="text-[10px] text-amber-400 font-semibold">+</span>
    </Link>
  )
}
