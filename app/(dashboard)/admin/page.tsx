import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/PageHeader'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')
  const { data: allProfiles } = await supabase.from('profiles').select('id, role, updated_at')

  return (
    <div>
      <PageHeader title="Admin Panel" description="Manage user roles and system access" />
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-500">User ID</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Role</th>
              <th className="text-left px-4 py-3 font-medium text-slate-500">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {(allProfiles ?? []).map((p, i) => (
              <tr key={p.id} className={i < (allProfiles?.length ?? 0) - 1 ? 'border-b border-slate-50' : ''}>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.id}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.role === 'admin' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}>{p.role}</span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(p.updated_at).toLocaleDateString('en-MY')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate-400">To promote a user to admin, run the UPDATE profiles SQL in Supabase SQL Editor.</p>
    </div>
  )
}
