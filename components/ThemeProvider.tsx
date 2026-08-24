'use client'
import { ReactNode } from 'react'
import { ThemeContext, useThemeInit } from '@/hooks/useTheme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, toggleTheme, mounted } = useThemeInit()

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme === 'light' ? 'light' : 'dark'}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
