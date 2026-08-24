import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

// Favicon + apple touch icon come from app/icon.png and app/apple-icon.png
// via Next.js's file-based icon convention. Also declared explicitly with a
// `?v=2` cache buster because Chrome ignores <link rel="icon"> hints once
// it has cached a favicon and needs a URL change to refetch.
export const metadata: Metadata = {
  title: {
    default: 'zieclip · AI viral clip generator',
    template: '%s · zieclip',
  },
  description: 'Ubah video panjang jadi klip pendek siap posting. Auto captions, multi ratio, viral scoring.',
  icons: {
    icon: [
      { url: '/logo.png?v=2', type: 'image/png' },
      { url: '/icon.png?v=2', type: 'image/png' },
    ],
    shortcut: '/logo.png?v=2',
    apple: '/apple-icon.png?v=2',
  },
  openGraph: {
    title: 'zieclip',
    description: 'AI viral clip generator untuk kreator Indonesia.',
    images: ['/logo.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'zieclip',
    description: 'AI viral clip generator.',
    images: ['/logo.png'],
  },
}

// Dark theme color so mobile browser chrome (address bar on Chrome mobile,
// status bar tint on iOS PWA) matches the app.
export const viewport: Viewport = {
  themeColor: '#050508',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-black text-white antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
