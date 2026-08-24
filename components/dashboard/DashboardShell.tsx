'use client'
import { Sidebar } from './Sidebar'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '@/hooks/useTheme'
import { useContext } from 'react'
import { ThemeContext } from '@/hooks/useTheme'

// Full-height SaaS layout: fixed left sidebar (240px on md+), main content
// scrolls independently in the remaining width. On mobile the sidebar is
// hidden (md:flex in Sidebar.tsx) so the page fills the width -- the mobile
// nav can be layered in later without changing consumers.
export function DashboardShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  // Safely get theme context, defaulting to dark if not available
  const context = useContext(ThemeContext)
  const isDark = context?.theme !== 'light'

  return (
    <div className={`min-h-screen ${
      isDark
        ? 'bg-[#050508] text-white'
        : 'bg-white text-gray-900'
    }`}>
      <Sidebar />
      <div className="md:pl-60">
        {(title || actions) && (
          <header className={`sticky top-0 z-20 backdrop-blur-xl border-b ${
            isDark
              ? 'bg-[#050508]/85 border-white/[0.06]'
              : 'bg-white/85 border-gray-200'
          }`}>
            <div className="px-6 h-14 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {title && <h1 className={`${isDark ? 'text-white' : 'text-gray-900'} text-sm font-semibold truncate`}>{title}</h1>}
                {subtitle && <div className={`text-[11px] ${isDark ? 'text-neutral-500' : 'text-gray-500'} truncate`}>{subtitle}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ThemeToggle />
                {actions}
              </div>
            </div>
          </header>
        )}
        <main className={`px-6 py-8 ${isDark ? '' : 'bg-gray-50'}`}>{children}</main>
      </div>
    </div>
  )
}
