import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clipper — YouTube Shorts Generator',
  description: 'Turn long YouTube videos into viral Shorts with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" style={{ colorScheme: 'dark' }}>
      <body className="min-h-full flex flex-col bg-[#07070b] text-[#ede9fe] antialiased">
        {children}
      </body>
    </html>
  )
}
