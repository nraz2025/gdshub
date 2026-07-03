import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ConditionalSidebar from '@/components/layout/ConditionalSidebar'
import TopBar from '@/components/layout/TopBar'
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

  // Logged in — full layout with sidebar
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
    <div className="flex h-screen overflow-hidden" style={{background:'#f1f5f9'}}>
      <ConditionalSidebar isAdmin={isAdmin} role={role} permMap={permMap} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar user={user} isAdmin={isAdmin} />
        <IdleLogout />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
