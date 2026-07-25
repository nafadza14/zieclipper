import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clipper — YouTube Shorts Generator',
  description: 'Turn long YouTube videos into viral Shorts with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-black text-white antialiased">
        {children}
      </body>
    </html>
  )
}
