import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import IdleLogout from '@/components/shared/IdleLogout'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as string) ?? 'user'
  const isAdmin = role === 'admin'

  // Fetch permissions from DB for this role
  const { data: perms } = await supabase
    .from('role_permissions')
    .select('module, can_access, can_edit')
    .eq('role', role)

  // Build a map: module -> { can_access, can_edit }
  const permMap: Record<string, { can_access: boolean; can_edit: boolean }> = {}
  for (const p of perms ?? []) {
    permMap[p.module] = { can_access: p.can_access, can_edit: p.can_edit }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar isAdmin={isAdmin} role={role} permMap={permMap} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={user} isAdmin={isAdmin} />
        <IdleLogout />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
