'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface NavLeaf { label: string; href: string; module: string; icon: React.ReactNode }
interface NavGroup { key: string; label: string; color: string; soft: string; glow: string; border: string; desc: string; items: NavLeaf[] }

const ICONS = {
  building: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  gds: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  billing: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  features: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  info: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  group: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  shield: <><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></>,
  offboard: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></>,
  report: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  admin: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  chevron: <polyline points="6 9 12 15 18 9" />,
}
function Ic({ path, w = 15, color }: { path: React.ReactNode; w?: number; color?: string }) {
  return <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
}

const GROUPS: NavGroup[] = [
  {
    key: 'organisation', label: 'Organisation', color: '#d29922', soft: 'rgba(210,153,34,0.10)', glow: 'rgba(210,153,34,0.06)', border: 'rgba(210,153,34,0.20)',
    desc: 'Manage travel organisations and configs',
    items: [{ label: 'Organisation', href: '/organisation', module: 'organisation', icon: <Ic path={ICONS.building} color="#d29922" /> }],
  },
  {
    key: 'gds', label: 'GDS', color: '#39d2c0', soft: 'rgba(57,210,192,0.10)', glow: 'rgba(57,210,192,0.06)', border: 'rgba(57,210,192,0.20)',
    desc: 'Global Distribution Systems & features',
    items: [
      { label: 'GDS List', href: '/gds', module: 'gds', icon: <Ic path={ICONS.gds} color="#58a6ff" /> },
      { label: 'GDS Features', href: '/gds-features', module: 'gds_functionality', icon: <Ic path={ICONS.features} color="#d29922" /> },
      { label: 'GDS Access Record', href: '/gds-access-record', module: 'gds_info', icon: <Ic path={ICONS.info} color="#39d2c0" /> },
    ],
  },
  {
    key: 'users', label: 'Users', color: '#a371f7', soft: 'rgba(163,113,247,0.10)', glow: 'rgba(163,113,247,0.06)', border: 'rgba(163,113,247,0.20)',
    desc: 'User accounts across platforms',
    items: [
      { label: 'Users List', href: '/users', module: 'users', icon: <Ic path={ICONS.users} color="#a371f7" /> },
      { label: 'Sabre', href: '/sabre-users', module: 'sabre_users', icon: <Ic path={ICONS.shield} color="#f78166" /> },
      { label: 'Amadeus', href: '/amadeus-users', module: 'amadeus_users', icon: <Ic path={ICONS.shield} color="#39d2c0" /> },
      { label: 'Travelport', href: '/travelport-users', module: 'travelport_users', icon: <Ic path={ICONS.shield} color="#58a6ff" /> },
      { label: 'Offboarded Users', href: '/resigned-users', module: 'resigned_users', icon: <Ic path={ICONS.offboard} color="#f85149" /> },
    ],
  },
  {
    key: 'system', label: 'System', color: '#f78166', soft: 'rgba(247,129,102,0.10)', glow: 'rgba(247,129,102,0.06)', border: 'rgba(247,129,102,0.20)',
    desc: 'Reports & administration',
    items: [
      { label: 'Billing Cycles', href: '/billing-cycles', module: 'billing_cycles', icon: <Ic path={ICONS.billing} color="#3fb950" /> },
      { label: 'PCC Group', href: '/pcc-group', module: 'client', icon: <Ic path={ICONS.group} color="#f78166" /> },
      { label: 'Report', href: '/report', module: 'reporting', icon: <Ic path={ICONS.report} color="#a371f7" /> },
      { label: 'Admin Panel', href: '/admin', module: 'admin_panel', icon: <Ic path={ICONS.admin} color="#db61a2" /> },
    ],
  },
]

const T = { bg: '#0e1117', bgElevated: '#161b22', card: '#1c2129', border: '#2d333b', borderLight: '#373e47', fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681' }

interface TopNavProps {
  user: User
  isAdmin: boolean
  role: string
  permMap: Record<string, { can_access: boolean; can_edit: boolean }>
}

export default function TopNav({ user, isAdmin, role, permMap }: TopNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  // Hide entirely on the Dashboard page — same rule the old sidebar followed
  const isDashboard = pathname === '/dashboard'

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function canAccess(module: string) {
    if (Object.keys(permMap).length > 0) return permMap[module]?.can_access === true
    if (isAdmin) return true
    if (role === 'manager') return !['users', 'admin_panel'].includes(module)
    return module === 'gds_info'
  }

  const visibleGroups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => canAccess(i.module)) }))
    .filter(g => g.items.length > 0)

  const activeGroup = visibleGroups.find(g => g.items.some(i => pathname === i.href || pathname?.startsWith(i.href + '/')))
  const activeColor = activeGroup?.color ?? '#58a6ff'
  const activeGlow = activeGroup?.glow ?? 'rgba(88,166,255,0.06)'

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (isDashboard) return null

  const initials = user.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <div ref={navRef} style={{ position: 'relative' }}>
      {/* Ambient glow tied to active group color */}
      <div style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
        background: `radial-gradient(ellipse 700px 500px at 15% 0%, ${activeGlow}, transparent)`, transition: 'background 0.4s ease' }} />

      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, width: '100%', zIndex: 100, background: T.bgElevated, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: activeColor, opacity: 0.35, transition: 'background 0.4s' }} />
        <div style={{ padding: '0 24px', display: 'flex', alignItems: 'center', height: '84px' }}>

          {/* Brand */}
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '11px', marginRight: '32px', flexShrink: 0, textDecoration: 'none' }}>
            <div style={{ width: '46px', height: '46px', borderRadius: '11px', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '19px', fontWeight: 700, color: '#fff', transition: 'background 0.4s' }}>G</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '23px', fontWeight: 700, color: T.fg, letterSpacing: '-0.3px' }}>
              GDS<span style={{ color: activeColor, transition: 'color 0.4s' }}>Hub</span>
            </div>
          </Link>

          {/* Nav links — desktop */}
          <div className="hidden lg:flex" style={{ alignItems: 'center', gap: '2px', flex: 1, minWidth: 0, padding: '6px 0' }}>
            {visibleGroups.map((g, gi) => {
              const isActiveGroup = activeGroup?.key === g.key
              const isSingle = g.items.length === 1
              return (
                <div key={g.key} style={{ display: 'flex', alignItems: 'center' }}>
                  {gi > 0 && <div style={{ width: '1px', height: '20px', background: T.border, margin: '0 6px', flexShrink: 0 }} />}
                  {isSingle ? (
                    <Link href={g.items[0].href}
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 18px', fontSize: '18px', fontWeight: 600,
                        color: isActiveGroup ? g.color : T.fg, borderRadius: '7px', textDecoration: 'none', whiteSpace: 'nowrap',
                        background: isActiveGroup ? g.soft : 'transparent', border: `1px solid ${isActiveGroup ? g.border : T.borderLight}` }}>
                      {g.items[0].icon} {g.label}
                    </Link>
                  ) : (
                    <div style={{ position: 'relative' }}
                      onMouseEnter={() => setOpenGroup(g.key)}
                      onMouseLeave={() => setOpenGroup(null)}>
                      <button type="button" onClick={() => setOpenGroup(o => o === g.key ? null : g.key)}
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 18px', fontSize: '18px', fontWeight: 600,
                          color: isActiveGroup ? g.color : T.fg, borderRadius: '7px', border: `1px solid ${isActiveGroup ? g.border : T.borderLight}`,
                          background: isActiveGroup ? g.soft : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {g.items[0].icon} {g.label}
                        <span style={{ transform: openGroup === g.key ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'flex' }}><Ic path={ICONS.chevron} w={15} /></span>
                      </button>
                      {openGroup === g.key && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, paddingTop: '6px', minWidth: '230px', zIndex: 50 }}>
                        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: '10px', boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: '6px' }}>
                          {g.items.map(item => {
                            const active = pathname === item.href
                            return (
                              <Link key={item.href} href={item.href} onClick={() => setOpenGroup(null)}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', fontSize: '14px', fontWeight: active ? 600 : 500, textTransform: 'uppercase', letterSpacing: '0.03em',
                                  color: active ? g.color : T.fg, background: active ? g.soft : 'transparent', border: `1.5px solid ${active ? g.border : 'transparent'}`, borderRadius: '7px', textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s', boxShadow: active ? `0 0 0 3px ${g.soft}` : 'none' }}
                                onMouseOver={e => { if (!active) { e.currentTarget.style.borderColor = g.border; e.currentTarget.style.background = g.soft; e.currentTarget.style.boxShadow = `0 0 0 3px ${g.soft}` } }}
                                onMouseOut={e => { if (!active) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none' } }}>
                                {item.icon} {item.label}
                              </Link>
                            )
                          })}
                        </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '14px', flexShrink: 0 }}>
            {isAdmin && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#d29922', background: 'rgba(210,153,34,0.10)', border: '1px solid rgba(210,153,34,0.30)', padding: '3px 9px', borderRadius: '20px' }}>Admin</span>
            )}
            <span className="hidden sm:block" style={{ fontSize: '13px', color: T.fgMuted }}>{user.email}</span>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#fff', transition: 'background 0.4s' }}>{initials}</div>
            <button onClick={handleSignOut}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: T.fgDim, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign out
            </button>
            <button className="hidden max-lg:flex" onClick={() => setMobileOpen(o => !o)}
              style={{ width: '36px', height: '36px', borderRadius: '8px', border: `1px solid ${T.border}`, background: 'transparent', color: T.fgMuted, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '260px', background: T.bgElevated, borderRight: `1px solid ${T.border}`, padding: '20px 16px', overflowY: 'auto' }}>
            {visibleGroups.map(g => (
              <div key={g.key} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: T.fgDim, opacity: 0.6, padding: '4px 8px' }}>{g.label}</div>
                {g.items.map(item => {
                  const active = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', fontSize: '13px', fontWeight: active ? 600 : 500,
                        color: active ? g.color : T.fgDim, background: active ? g.soft : 'transparent', border: `1.5px solid ${active ? g.border : 'transparent'}`, borderRadius: '8px', textDecoration: 'none', marginBottom: '2px' }}>
                      {item.icon} {item.label}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}