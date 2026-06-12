'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type UserRole = 'admin' | 'manager' | 'user'

interface NavItem {
  label: string
  href: string
  module: string
  icon: React.ReactNode
}

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', module: 'dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { label: 'Users', href: '/users', module: 'users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { label: 'GDS', href: '/gds', module: 'gds', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { label: 'Organisation', href: '/organisation', module: 'organisation', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { label: 'GDS Info', href: '/pcc', module: 'gds_info', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { label: 'GDS Functionality', href: '/gds-functionality', module: 'gds_functionality', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> },
  { label: 'Billing Cycles', href: '/billing-cycles', module: 'billing_cycles', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
  { label: 'Sabre Users', href: '/sabre-users', module: 'sabre_users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> },
  { label: 'Amadeus Users', href: '/amadeus-users', module: 'amadeus_users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> },
  { label: 'Travelport Users', href: '/travelport-users', module: 'travelport_users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg> },
  { label: 'Client Group', href: '/client-group', module: 'client_group', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { label: 'Client', href: '/ota-clients', module: 'client', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
  { label: 'Reporting', href: '/reporting', module: 'reporting', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { label: 'Resigned Users', href: '/resigned-users', module: 'resigned_users', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg> },
  { label: 'Admin Panel', href: '/admin', module: 'admin_panel', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
]

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
      background: 'linear-gradient(180deg, #14532D 0%, #166534 50%, #15803D 100%)',
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
