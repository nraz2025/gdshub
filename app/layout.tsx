import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GDSHub — GDS Management System',
  description: 'Internal GDS, PCC and user management platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
