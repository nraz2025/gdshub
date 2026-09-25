import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TopNav from '@/components/layout/TopNav'
import MainContent from '@/components/layout/MainContent'
import IdleLogout from '@/components/shared/IdleLogout'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // No session — send to login. All dashboard routes require authentication.
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as string) ?? 'user'
  const isAdmin = role === 'admin'

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('module, can_access, can_edit')
    .eq('role', role)

  const permMap: Record<string, { can_access: boolean; can_edit: boolean }> = {}
  for (const p of perms ?? []) {
    permMap[p.module] = { can_access: p.can_access, can_edit: p.can_edit }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e1117' }}>
      <TopNav user={user} isAdmin={isAdmin} role={role} permMap={permMap} />
      <IdleLogout />
      <MainContent>
        {children}
      </MainContent>
    </div>
  )
}
