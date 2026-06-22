'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { nav } from './nav-items'

type UserRole = 'admin' | 'manager' | 'user'

interface SidebarProps {
  isAdmin: boolean
  role?: string
  permMap?: Record<string, { can_access: boolean; can_edit: boolean }>
}

export default function Sidebar({ isAdmin, role, permMap }: SidebarProps) {
  const pathname = usePathname()
  const userRole = role ?? (isAdmin ? 'admin' : 'user')

  const visibleNav = nav.filter(item => {
    if (permMap) return permMap[item.module]?.can_access === true
    if (userRole === 'admin') return true
    if (userRole === 'manager') return !['users', 'admin_panel'].includes(item.module)
    return item.module === 'gds_info'
  })

  return (
    <aside style={{
      width: '224px', flexShrink: 0, display: 'flex', flexDirection: 'column',
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0d3d26 0%, #1a5f3c 50%, #2d8a5e 100%)',
    }}>
      {/* Logo */}
      <div style={{padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          <div style={{width: '32px', height: '32px', background: '#10B981', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(16,185,129,0.4)'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </div>
          <span style={{fontWeight: 800, color: 'white', fontSize: '16px', letterSpacing: '-0.02em'}}>GDSHub</span>
        </div>
      </div>

      {/* Role badge */}
      <div style={{padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)'}}>
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
          background: userRole === 'admin' ? 'rgba(251,191,36,0.2)' : userRole === 'manager' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
          color: userRole === 'admin' ? '#FCD34D' : 'rgba(255,255,255,0.8)',
          letterSpacing: '0.04em', textTransform: 'uppercase' as const,
        }}>
          {userRole === 'admin' ? 'Admin' : userRole === 'manager' ? 'Manager' : 'Viewer'}
        </span>
      </div>

      {/* Nav */}
      <nav style={{flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px'}}>
        {visibleNav.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px',
              fontSize: '16px', fontWeight: active ? 600 : 400,
              textDecoration: 'none', transition: 'all 0.15s',
              background: active ? 'rgba(110,231,183,0.15)' : 'transparent',
              color: active ? '#6EE7B7' : 'rgba(255,255,255,0.75)',
              borderLeft: active ? '3px solid #6EE7B7' : '3px solid transparent',
            }}
            onMouseOver={e => { if (!active) { const el = e.currentTarget; el.style.background = 'rgba(110,231,183,0.08)'; el.style.color = 'rgba(255,255,255,0.95)' }}}
            onMouseOut={e => { if (!active) { const el = e.currentTarget; el.style.background = 'transparent'; el.style.color = 'rgba(255,255,255,0.75)' }}}>
              <span style={{flexShrink: 0, opacity: active ? 1 : 0.65}}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span style={{marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: '#6EE7B7', flexShrink: 0}} />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
        <p style={{fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.5'}}>
          {userRole === 'admin'   && 'Full access to all modules'}
          {userRole === 'manager' && 'View & edit assigned modules'}
          {userRole === 'user'    && 'View-only access'}
        </p>
      </div>
    </aside>
  )
}
