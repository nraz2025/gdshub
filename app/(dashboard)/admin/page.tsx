'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'

type UserRole = 'super_admin' | 'admin' | 'manager' | 'user'

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
  can_delete: boolean
}

// Main page dark theme (matches TopNav's System group = coral)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#f78166', accentSoft: 'rgba(247,129,102,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  blue: '#58a6ff', blueSoft: 'rgba(88,166,255,0.10)',
  gold: '#e3b341', goldSoft: 'rgba(227,179,65,0.10)',
}

const ROLE_CONFIG: Record<string, { label: string; color: string; soft: string; description: string }> = {
  super_admin: { label: 'Super Admin', color: D.gold,    soft: D.goldSoft,    description: 'Full, unrestricted access to everything' },
  admin:       { label: 'Admin',       color: D.danger,  soft: D.dangerSoft,  description: 'Customisable access per module' },
  manager:     { label: 'Manager',     color: D.accent,  soft: D.accentSoft, description: 'Customisable access per module' },
  user:        { label: 'Viewer',      color: D.warning, soft: D.warningSoft, description: 'Customisable access per module' },
  none:        { label: 'No role',     color: D.fgDim,   soft: 'rgba(139,148,158,0.10)', description: 'No profile assigned' },
}

const ROLE_ORDER: UserRole[] = ['super_admin', 'admin', 'manager', 'user']

const ALL_MODULES = [
  { key: 'organisation',      label: 'Organisation'      },
  { key: 'gds',               label: 'GDS'               },
  { key: 'gds_info',          label: 'GDS Access Record' },
  { key: 'queue_management',  label: 'Queue Management'  },
  { key: 'client',            label: 'PCC Group'         },
  { key: 'pricing',           label: 'Pricing'           },
  { key: 'users',             label: 'Users'             },
  { key: 'sabre_users',       label: 'Sabre Users'       },
  { key: 'amadeus_users',     label: 'Amadeus Users'     },
  { key: 'travelport_users',  label: 'Travelport Users'  },
  { key: 'resigned_users',    label: 'Offboarded Users'  },
  { key: 'reporting',         label: 'Report'            },
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
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin' && me?.role !== 'super_admin') { window.location.href = '/dashboard'; return }
      setCurrentUserId(user.id)
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

  function openDelete(p: UserProfile) { setDeleteTarget(p); setDeleteError('') }

  async function handleDeleteUser() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.rpc('delete_app_user', { target_id: deleteTarget.id })
    setDeleting(false)
    if (error) { setDeleteError(error.message); return }
    setDeleteTarget(null)
    fetchAll()
  }

  async function togglePermission(role: string, module: string, field: 'can_access' | 'can_edit' | 'can_delete', value: boolean) {
    const key = `${role}-${module}-${field}`
    setSaving(key)

    const updates: Partial<Permission> = { [field]: value }
    if (field === 'can_access' && !value) { updates.can_edit = false; updates.can_delete = false }
    if ((field === 'can_edit' || field === 'can_delete') && value) updates.can_access = true

    await supabase.from('role_permissions')
      .upsert({ role, module, ...updates }, { onConflict: 'role,module' })

    setPermissions(prev => prev.map(p =>
      p.role === role && p.module === module ? { ...p, ...updates } : p
    ))
    setSaving(null)
  }

  async function setAllPermissions(role: string, module: string, value: boolean) {
    const key = `${role}-${module}-all`
    setSaving(key)
    const updates = { can_access: value, can_edit: value, can_delete: value }

    await supabase.from('role_permissions')
      .upsert({ role, module, ...updates }, { onConflict: 'role,module' })

    setPermissions(prev => {
      const exists = prev.some(p => p.role === role && p.module === module)
      return exists
        ? prev.map(p => p.role === role && p.module === module ? { ...p, ...updates } : p)
        : [...prev, { id: -1, role, module, ...updates }]
    })
    setSaving(null)
  }

  function getPerm(role: string, module: string) {
    return permissions.find(p => p.role === role && p.module === module)
  }

  const filtered = profiles.filter(p => {
    const term = search.toLowerCase()
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''} ${p.email}`.toLowerCase()
    const matchSearch = name.includes(term)
    const matchRole = filterRole === 'all' || (filterRole === 'none' ? !p.role : p.role === filterRole)
    return matchSearch && matchRole
  })

  const ToggleCell = ({ role, module, field }: { role: string; module: string; field: 'can_access' | 'can_edit' | 'can_delete' }) => {
    const perm = getPerm(role, module)
    const isLocked = role === 'super_admin'
    const val = isLocked
      ? true
      : field === 'can_access' ? (perm?.can_access ?? false) : field === 'can_edit' ? (perm?.can_edit ?? false) : (perm?.can_delete ?? false)
    const key = `${role}-${module}-${field}`
    const isSaving = saving === key

    return (
      <button
        onClick={() => !isLocked && togglePermission(role, module, field, !val)}
        disabled={isSaving || isLocked}
        title={isLocked ? 'Super Admin always has full access' : `Click to toggle ${field}`}
        style={{
          width:'32px', height:'32px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'15px', fontWeight:700, margin:'0 auto', border:'none',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.5 : 1,
          background: val ? D.successSoft : 'rgba(139,148,158,0.10)',
          color: val ? D.success : D.fgDim,
        }}
      >
        {isSaving ? '…' : val ? '✓' : '✕'}
      </button>
    )
  }

  const AllCell = ({ role, module }: { role: string; module: string }) => {
    const perm = getPerm(role, module)
    const isLocked = role === 'super_admin'
    const allOn = isLocked ? true : (!!perm?.can_access && !!perm?.can_edit && !!perm?.can_delete)
    const key = `${role}-${module}-all`
    const isSaving = saving === key

    return (
      <button
        onClick={() => !isLocked && setAllPermissions(role, module, !allOn)}
        disabled={isSaving || isLocked}
        title={isLocked ? 'Super Admin always has full access' : allOn ? 'Click to revoke all permissions' : 'Click to grant View + Edit + Delete'}
        style={{
          width:'32px', height:'32px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'15px', fontWeight:700, margin:'0 auto', border:`1px solid ${allOn ? D.blue : 'transparent'}`,
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.5 : 1,
          background: allOn ? D.blueSoft : 'rgba(139,148,158,0.10)',
          color: allOn ? D.blue : D.fgDim,
        }}
      >
        {isSaving ? '…' : allOn ? '✓' : '—'}
      </button>
    )
  }

  const lbl = (color: string) => ({ fontSize:'15px', fontWeight:700, color, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' })
  const inpDark = (extra?: object) => ({ padding:'9px 14px', fontSize:'16px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box' as const, ...extra })

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg, padding:'32px 28px 40px'}}>

      {/* Header */}
      <div style={{marginBottom:'22px'}}>
        <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'30px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Admin Panel</h1>
        <p style={{fontSize:'15px', color:D.fgMuted, marginTop:'5px'}}>Manage user roles and module access</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'4px', marginBottom:'18px', background:D.card, border:`1px solid ${D.border}`, padding:'4px', borderRadius:'10px', width:'fit-content'}}>
        {([['users', 'User Roles'], ['permissions', 'Access Matrix']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              padding:'9px 20px', borderRadius:'8px', fontSize:'16px', fontWeight:600, border:'none', cursor:'pointer',
              background: activeTab === tab ? D.accent : 'transparent',
              color: activeTab === tab ? '#fff' : D.fgMuted,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* USER ROLES TAB */}
      {activeTab === 'users' && (
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>
          <div style={{padding:'16px 20px', borderBottom:`1px solid ${D.border}`, display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'12px'}}>
            <div>
              <p style={{fontSize:'15px', fontWeight:600, color:D.fg, margin:0}}>User Roles</p>
              <p style={{fontSize:'16px', color:D.fgDim, marginTop:'2px'}}>Assign roles to control what each user can access</p>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
              <input type="text" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
                style={inpDark({width:'224px'})} />
              <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={inpDark({cursor:'pointer'})}>
                <option value="all">All roles</option>
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="user">Viewer</option>
                <option value="none">No role</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div style={{textAlign:'center', padding:'48px', color:D.fgMuted, fontSize:'16px'}}>Loading users…</div>
          ) : (
            <table style={{width:'100%', fontSize:'16px', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                  <th style={{textAlign:'left', padding:'14px 20px', fontWeight:700, color:D.accent, fontSize:'16px', textTransform:'uppercase', letterSpacing:'0.05em'}}>User</th>
                  <th style={{textAlign:'left', padding:'14px 20px', fontWeight:700, color:D.warning, fontSize:'16px', textTransform:'uppercase', letterSpacing:'0.05em'}}>Current Role</th>
                  <th style={{textAlign:'left', padding:'14px 20px', fontWeight:700, color:D.blue, fontSize:'16px', textTransform:'uppercase', letterSpacing:'0.05em', width:'220px'}}>Assign Role</th>
                  <th style={{textAlign:'left', padding:'14px 20px', fontWeight:700, color:D.success, fontSize:'16px', textTransform:'uppercase', letterSpacing:'0.05em'}}>Registered</th>
                  <th style={{textAlign:'right', padding:'14px 20px', fontWeight:700, color:D.danger, fontSize:'16px', textTransform:'uppercase', letterSpacing:'0.05em'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} style={{padding:'48px 20px', textAlign:'center', color:D.fgDim, fontSize:'16px'}}>No users found.</td></tr>
                ) : filtered.map((p, i) => {
                  const cfg = ROLE_CONFIG[p.role ?? 'none']
                  return (
                    <tr key={p.id} style={{borderBottom: i < filtered.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                      onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{padding:'14px 20px'}}>
                        {(p.first_name || p.last_name)
                          ? <div><p style={{fontWeight:600, color:D.fg, margin:0, fontSize:'16px'}}>{p.first_name} {p.last_name}</p><p style={{fontSize:'16px', color:D.fgDim, margin:0}}>{p.email}</p></div>
                          : <p style={{color:D.fgMuted, margin:0}}>{p.email}</p>}
                      </td>
                      <td style={{padding:'14px 20px'}}>
                        <span style={{fontSize:'16px', fontWeight:600, padding:'4px 12px', borderRadius:'20px', background:cfg.soft, color:cfg.color}}>{cfg.label}</span>
                      </td>
                      <td style={{padding:'14px 20px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <select value={p.role ?? ''} onChange={e => updateRole(p.id, e.target.value as UserRole)}
                            disabled={updating === p.id}
                            style={inpDark({flex:1, cursor:'pointer', opacity: updating === p.id ? 0.5 : 1})}>
                            <option value="" disabled>Select role…</option>
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="user">Viewer</option>
                          </select>
                          {updating === p.id && <span style={{fontSize:'16px', color:D.fgDim}}>Saving…</span>}
                        </div>
                      </td>
                      <td style={{padding:'14px 20px', fontSize:'15px', color:D.fgDim}}>
                        {new Date(p.auth_created_at).toLocaleDateString('en-MY')}
                      </td>
                      <td style={{padding:'14px 20px', textAlign:'right'}}>
                        {p.id !== currentUserId && (
                          <button onClick={() => openDelete(p)}
                            style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                            onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                            onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ACCESS MATRIX TAB */}
      {activeTab === 'permissions' && (
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>
          <div style={{padding:'16px 20px', borderBottom:`1px solid ${D.border}`}}>
            <p style={{fontSize:'15px', fontWeight:600, color:D.fg, margin:0}}>Access Matrix</p>
            <p style={{fontSize:'16px', color:D.fgDim, marginTop:'2px'}}>Click any cell to toggle access. Super Admin is always full access and cannot be changed.</p>
          </div>
          {permLoading ? (
            <div style={{textAlign:'center', padding:'48px', color:D.fgMuted, fontSize:'16px'}}>Loading permissions…</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', fontSize:'16px', borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                    <th style={{textAlign:'left', padding:'12px 20px', fontWeight:600, color:D.fgDim, fontSize:'15px', textTransform:'uppercase', letterSpacing:'0.05em', width:'176px'}}>Module</th>
                    <th style={{textAlign:'center', padding:'12px', fontWeight:600, color:D.gold, fontSize:'15px'}} colSpan={4}>Super Admin</th>
                    <th style={{textAlign:'center', padding:'12px', fontWeight:600, color:D.danger, fontSize:'15px'}} colSpan={4}>Admin</th>
                    <th style={{textAlign:'center', padding:'12px', fontWeight:600, color:D.accent, fontSize:'15px'}} colSpan={4}>Manager</th>
                    <th style={{textAlign:'center', padding:'12px', fontWeight:600, color:D.warning, fontSize:'15px'}} colSpan={4}>Viewer</th>
                  </tr>
                  <tr style={{borderBottom:`1px solid ${D.border}`}}>
                    <th></th>
                    {ROLE_ORDER.map(role => (
                      <React.Fragment key={role}>
                        <th style={{textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, color:D.fgDim}}>View</th>
                        <th style={{textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, color:D.fgDim}}>Edit</th>
                        <th style={{textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, color:D.fgDim}}>Delete</th>
                        <th style={{textAlign:'center', padding:'8px', fontSize:'13px', fontWeight:600, color:D.fgDim}}>All</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_MODULES.map((mod, i) => (
                    <tr key={mod.key} style={{borderBottom: i < ALL_MODULES.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                      onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{padding:'12px 20px', fontWeight:600, color:D.fg}}>{mod.label}</td>
                      {ROLE_ORDER.map(role => (
                        <React.Fragment key={role}>
                          <td style={{padding:'12px', textAlign:'center'}}>
                            <ToggleCell role={role} module={mod.key} field="can_access" />
                          </td>
                          <td style={{padding:'12px', textAlign:'center'}}>
                            <ToggleCell role={role} module={mod.key} field="can_edit" />
                          </td>
                          <td style={{padding:'12px', textAlign:'center'}}>
                            <ToggleCell role={role} module={mod.key} field="can_delete" />
                          </td>
                          <td style={{padding:'12px', textAlign:'center'}}>
                            <AllCell role={role} module={mod.key} />
                          </td>
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{padding:'12px 20px', borderTop:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', display:'flex', flexWrap:'wrap', alignItems:'center', gap:'24px', fontSize:'16px', color:D.fgDim}}>
            <span style={{display:'flex', alignItems:'center', gap:'8px'}}><span style={{width:'22px', height:'22px', background:D.successSoft, color:D.success, borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'16px'}}>✓</span> Enabled</span>
            <span style={{display:'flex', alignItems:'center', gap:'8px'}}><span style={{width:'22px', height:'22px', background:'rgba(139,148,158,0.10)', color:D.fgDim, borderRadius:'6px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'16px'}}>✕</span> Disabled</span>
            <span>View = can see the module · Edit = can add/edit records · Delete = can remove records · All = quick toggle for all three</span>
          </div>
        </div>
      )}

      {/* ── Delete User Modal ── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete User" size="sm">
        <div className="space-y-4" style={{color:'#1e293b'}}>
          <p style={{fontSize:'14px', color:'#64748b'}}>
            Delete <strong style={{color:'#1e293b'}}>{deleteTarget?.email}</strong>? This removes their login and role permanently and cannot be undone.
          </p>
          {deleteError && <p style={{fontSize:'13px', color:'#ef4444'}}>{deleteError}</p>}
          <div style={{display:'flex', gap:'10px'}}>
            <button onClick={() => setDeleteTarget(null)}
              style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:500, border:'1px solid #e2e8f0', borderRadius:'12px', background:'#fff', color:'#64748b', cursor:'pointer'}}>
              Cancel
            </button>
            <button onClick={handleDeleteUser} disabled={deleting}
              style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:'12px', background:'#ef4444', color:'white', cursor:'pointer', opacity:deleting?0.6:1}}>
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
