'use client'

import { usePathname } from 'next/navigation'

export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'

  return (
    <main className="p-6" style={{ paddingTop: isDashboard ? '1.5rem' : 'calc(84px + 1.5rem)' }}>
      {children}
    </main>
  )
}