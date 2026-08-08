import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StatCard from '@/components/shared/StatCard'
import PageHeader from '@/components/shared/PageHeader'
import { nav } from '@/components/layout/nav-items'
import ModuleGrid from '@/components/shared/ModuleGrid'

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
    {
      label: 'Total Users',
      value: users.count ?? 0,
      color: 'blue' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    },
    {
      label: 'PCC Entries',
      value: pcc.count ?? 0,
      color: 'green' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    },
    {
      label: 'OTA Clients',
      value: ota.count ?? 0,
      color: 'amber' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
    },
    {
      label: 'Sabre Users',
      value: sabre.count ?? 0,
      color: 'blue' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
    },
    {
      label: 'Amadeus Users',
      value: amadeus.count ?? 0,
      color: 'purple' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
    },
    {
      label: 'Travelport Users',
      value: travelport.count ?? 0,
      color: 'green' as const,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
    },
  ]

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your GDS Management System"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {stats.map(s => (
          <StatCard key={s.label} label={s.label} value={s.value} color={s.color} icon={s.icon} />
        ))}
      </div>

      <ModuleGrid modules={visibleModules} />
    </div>
  )
}