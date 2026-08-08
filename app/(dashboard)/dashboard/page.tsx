import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { nav } from '@/components/layout/nav-items'
import DashboardModuleGrid from '@/components/shared/DashboardModuleGrid'

const T = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#58a6ff', accentSoft: 'rgba(88,166,255,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  orange: '#f78166', orangeSoft: 'rgba(247,129,102,0.10)',
  cyan: '#39d2c0', cyanSoft: 'rgba(57,210,192,0.10)',
  pink: '#db61a2', pinkSoft: 'rgba(219,97,162,0.10)',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let role = 'user'
  let isAdmin = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    role = (profile?.role as string) ?? 'user'
    isAdmin = role === 'admin'
    if (role === 'user') redirect('/gds-info')
  }

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('module, can_access, can_edit')
    .eq('role', role)

  const permMap: Record<string, { can_access: boolean; can_edit: boolean }> = {}
  for (const p of perms ?? []) {
    permMap[p.module] = { can_access: p.can_access, can_edit: p.can_edit }
  }

  // Same visibility rule as the Sidebar — only show modules this role can access
  const visibleModules = nav.filter(item => {
    if (item.module === 'dashboard') return false // don't show a tile linking to itself
    if (Object.keys(permMap).length > 0) return permMap[item.module]?.can_access === true
    if (isAdmin) return true
    if (role === 'manager') return !['users', 'admin_panel'].includes(item.module)
    return item.module === 'gds_info'
  })

  const [users, sabre, amadeus, travelport, pcc, ota] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('sabre_user').select('id', { count: 'exact', head: true }),
    supabase.from('amadeus_user').select('id', { count: 'exact', head: true }),
    supabase.from('travelport_user').select('id', { count: 'exact', head: true }),
    supabase.from('pcc_list').select('id', { count: 'exact', head: true }),
    supabase.from('ota_client').select('id', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'Total Users', value: users.count ?? 0, color: T.accent, soft: T.accentSoft,
      icon: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> },
    { label: 'PCC Entries', value: pcc.count ?? 0, color: T.success, soft: T.successSoft,
      icon: <path d="M20 7h-9m9 5H5m14-10H3" /> },
    { label: 'OTA Clients', value: ota.count ?? 0, color: T.purple, soft: T.purpleSoft,
      icon: <path d="M2 7h20v14H2zM2 7l10-5 10 5" /> },
    { label: 'Sabre Users', value: sabre.count ?? 0, color: T.orange, soft: T.orangeSoft,
      icon: <><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></> },
    { label: 'Amadeus Users', value: amadeus.count ?? 0, color: T.cyan, soft: T.cyanSoft,
      icon: <><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></> },
    { label: 'Travelport Users', value: travelport.count ?? 0, color: T.pink, soft: T.pinkSoft,
      icon: <><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></> },
  ]

  const maxValue = Math.max(...stats.map(s => s.value), 1)

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:T.bg, minHeight:'100vh', color:T.fg, padding:'0'}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{marginBottom:'30px'}}>
          <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:T.fg, margin:0}}>Dashboard</h1>
          <p style={{fontSize:'13px', color:T.fgMuted, marginTop:'5px'}}>Overview of your GDS Management System</p>
        </div>

        {/* Stats Grid — real counts, proportional bars instead of fabricated trend %s */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'16px', marginBottom:'32px'}}>
          {stats.map(s => (
            <div key={s.label} style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:'10px', padding:'18px 20px', display:'flex', flexDirection:'column', gap:'12px'}}>
              <div style={{width:'38px', height:'38px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', background:s.soft, color:s.color}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
              </div>
              <div>
                <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'28px', fontWeight:700, lineHeight:1, color:T.fg}}>{s.value}</div>
                <div style={{fontSize:'12px', color:T.fgMuted, marginTop:'3px'}}>{s.label}</div>
              </div>
              <div style={{height:'4px', borderRadius:'2px', background:T.border, overflow:'hidden', marginTop:'4px'}}>
                <div style={{height:'100%', borderRadius:'2px', width:`${Math.round((s.value / maxValue) * 100)}%`, background:s.color}} />
              </div>
            </div>
          ))}
        </div>

        {/* Module Grid — interactive search + view toggle */}
        <DashboardModuleGrid modules={visibleModules} />

      </div>
    </div>
  )
}
