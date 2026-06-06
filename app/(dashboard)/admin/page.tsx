'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'

type UserRole = 'admin' | 'manager' | 'user'

interface UserProfile {
  id: string
  email: string
  role: UserRole | null
  first_name: string | null
  last_name: string | null
  auth_created_at: string
}

interface Permission {
  id: number
  role: string
  module: string
  can_access: boolean
  can_edit: boolean
}

const ROLE_CONFIG: Record<string, { label: string; badge: string; description: string; color: string }> = {
  admin:   { label: 'Admin',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   description: 'Full access to all modules',         color: 'text-amber-600'  },
  manager: { label: 'Manager', badge: 'bg-blue-50 text-blue-700 border-blue-200',     description: 'Customisable access per module',     color: 'text-blue-600'   },
  user:    { label: 'Viewer',  badge: 'bg-slate-100 text-slate-600 border-slate-200', description: 'Customisable access per module',     color: 'text-slate-500'  },
  none:    { label: 'No role', badge: 'bg-red-50 text-red-500 border-red-200',        description: 'No profile assigned',               color: 'text-red-500'    },
}

const ALL_MODULES = [
  { key: 'dashboard',         label: 'Dashboard'         },
  { key: 'gds_info',          label: 'GDS Info'          },
  { key: 'gds_functionality', label: 'GDS Functionality' },
  { key: 'organisation',      label: 'Organisation'      },
  { key: 'gds',               label: 'GDS'               },
  { key: 'sabre_users',       label: 'Sabre Users'       },
  { key: 'amadeus_users',     label: 'Amadeus Users'     },
  { key: 'travelport_users',  label: 'Travelport Users'  },
  { key: 'client',            label: 'Client'            },
  { key: 'users',             label: 'Users'             },
  { key: 'admin_panel',       label: 'Admin Panel'       },
]

export default function AdminPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [permLoading, setPermLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [activeTab, setActiveTab] = useState<'users' | 'permissions'>('users')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin') { window.location.href = '/dashboard'; return }
      fetchAll()
      fetchPermissions()
    }
    init()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data, error } = await supabase.from('user_profile_view').select('*').order('email')
    if (!error) setProfiles((data ?? []) as UserProfile[])
    setLoading(false)
  }

  async function fetchPermissions() {
    setPermLoading(true)
    const { data } = await supabase.from('role_permissions').select('*').order('role').order('module')
    setPermissions(data ?? [])
    setPermLoading(false)
  }

  async function updateRole(userId: string, newRole: UserRole) {
    setUpdating(userId)
    await supabase.from('profiles').upsert({ id: userId, role: newRole })
    setUpdating(null)
    fetchAll()
  }

  async function togglePermission(role: string, module: string, field: 'can_access' | 'can_edit', value: boolean) {
    const key = `${role}-${module}-${field}`
    setSaving(key)

    // If turning off access, also turn off edit
    const updates: Partial<Permission> = { [field]: value }
    if (field === 'can_access' && !value) updates.can_edit = false
    if (field === 'can_edit' && value) updates.can_access = true

    await supabase.from('role_permissions')
      .upsert({ role, module, ...updates }, { onConflict: 'role,module' })

    // Optimistic update
    setPermissions(prev => prev.map(p =>
      p.role === role && p.module === module ? { ...p, ...updates } : p
    ))
    setSaving(null)
  }

  function getPerm(role: string, module: string) {
    return permissions.find(p => p.role === role && p.module === module)
  }

  const roleCounts = profiles.reduce((acc, p) => {
    const key = p.role ?? 'none'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const filtered = profiles.filter(p => {
    const term = search.toLowerCase()
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''} ${p.email}`.toLowerCase()
    const matchSearch = name.includes(term)
    const matchRole = filterRole === 'all' || (filterRole === 'none' ? !p.role : p.role === filterRole)
    return matchSearch && matchRole
  })

  const ToggleCell = ({ role, module, field }: { role: string; module: string; field: 'can_access' | 'can_edit' }) => {
    const perm = getPerm(role, module)
    const val = field === 'can_access' ? (perm?.can_access ?? false) : (perm?.can_edit ?? false)
    const key = `${role}-${module}-${field}`
    const isSaving = saving === key
    // Admin is always full — not editable
    const isAdminLocked = role === 'admin'

    return (
      <button
        onClick={() => !isAdminLocked && togglePermission(role, module, field, !val)}
        disabled={isSaving || isAdminLocked}
        title={isAdminLocked ? 'Admin always has full access' : `Click to toggle ${field}`}
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors mx-auto
          ${isAdminLocked ? 'cursor-not-allowed' : 'cursor-pointer'}
          ${isSaving ? 'opacity-50' :
            val
              ? isAdminLocked
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
              : isAdminLocked
                ? 'bg-slate-100 text-slate-300'
                : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
          }`}
      >
        {isSaving ? '…' : val ? '✓' : '✕'}
      </button>
    )
  }

  return (
    <div>
      <PageHeader title="Admin Panel" description="Manage user roles and module access" />

      {/* Role summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['admin', 'manager', 'user', 'none'] as const).map(role => {
          const cfg = ROLE_CONFIG[role]
          return (
            <div key={role} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                <span className="text-2xl font-bold text-slate-700">{roleCounts[role] ?? 0}</span>
              </div>
              <p className="text-xs text-slate-400">{cfg.description}</p>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        {([['users', 'User Roles'], ['permissions', 'Access Matrix']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── USER ROLES TAB ── */}
      {activeTab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">User Roles</p>
              <p className="text-xs text-slate-400 mt-0.5">Assign roles to control what each user can access</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-56 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400">
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="user">Viewer</option>
                <option value="none">No role</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Loading users…</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">User</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Current Role</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 w-52">Assign Role</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Registered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400 text-sm">No users found.</td></tr>
                ) : filtered.map((p, i) => {
                  const cfg = ROLE_CONFIG[p.role ?? 'none']
                  return (
                    <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${i === filtered.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-5 py-3.5">
                        {(p.first_name || p.last_name)
                          ? <div><p className="font-medium text-slate-800">{p.first_name} {p.last_name}</p><p className="text-xs text-slate-400">{p.email}</p></div>
                          : <p className="text-slate-600">{p.email}</p>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <select value={p.role ?? ''} onChange={e => updateRole(p.id, e.target.value as UserRole)}
                            disabled={updating === p.id}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50">
                            <option value="" disabled>Select role…</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="user">Viewer</option>
                          </select>
                          {updating === p.id && <span className="text-xs text-slate-400">Saving…</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {new Date(p.auth_created_at).toLocaleDateString('en-MY')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ACCESS MATRIX TAB ── */}
      {activeTab === 'permissions' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">Access Matrix</p>
            <p className="text-xs text-slate-400 mt-0.5">Click any cell to toggle access. Admin is always full access and cannot be changed.</p>
          </div>
          {permLoading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Loading permissions…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-slate-500 w-44">Module</th>
                    {/* Admin */}
                    <th className="text-center px-3 py-3 font-medium text-amber-600" colSpan={2}>Admin</th>
                    {/* Manager */}
                    <th className="text-center px-3 py-3 font-medium text-blue-600" colSpan={2}>Manager</th>
                    {/* Viewer */}
                    <th className="text-center px-3 py-3 font-medium text-slate-500" colSpan={2}>Viewer</th>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <th></th>
                    {['admin','manager','user'].map(role => (
                      <React.Fragment key={role}>
                        <th className="text-center px-3 py-2 text-xs font-medium text-slate-400">Access</th>
                        <th className="text-center px-3 py-2 text-xs font-medium text-slate-400">Edit</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_MODULES.map((mod, i) => (
                    <tr key={mod.key} className={`${i < ALL_MODULES.length - 1 ? 'border-b border-slate-50' : ''} hover:bg-slate-50/40`}>
                      <td className="px-5 py-3 font-medium text-slate-700">{mod.label}</td>
                      {['admin','manager','user'].map(role => (
                        <React.Fragment key={role}>
                          <td className="px-3 py-3 text-center">
                            <ToggleCell role={role} module={mod.key} field="can_access" />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <ToggleCell role={role} module={mod.key} field="can_edit" />
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center font-bold text-xs">✓</span> Enabled</span>
            <span className="flex items-center gap-1.5"><span className="w-5 h-5 bg-slate-100 text-slate-300 rounded flex items-center justify-center font-bold text-xs">✕</span> Disabled</span>
            <span className="flex items-center gap-1.5 ml-4">Access = can view the module · Edit = can add/edit/delete records</span>
          </div>
        </div>
      )}
    </div>
  )
}
