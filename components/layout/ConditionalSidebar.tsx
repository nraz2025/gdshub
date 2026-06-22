'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

interface ConditionalSidebarProps {
  isAdmin: boolean
  role?: string
  permMap?: Record<string, { can_access: boolean; can_edit: boolean }>
}

export default function ConditionalSidebar({ isAdmin, role, permMap }: ConditionalSidebarProps) {
  const pathname = usePathname()

  // Hide sidebar only on the Dashboard page — it reappears on every other route.
  if (pathname === '/dashboard') return null

  return <Sidebar isAdmin={isAdmin} role={role} permMap={permMap} />
}
