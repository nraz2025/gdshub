'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuditFields } from '@/lib/audit'
import Modal from '@/components/shared/Modal'

interface ClientGroup {
  id: number; name: string; description: string | null
  created_at: string; modified_at: string | null; modified_by: string | null; client_count?: number
}

const EMPTY = { name: '', description: '' }

const T = {
  primary:    '#10B981',
  primaryDk:  '#059669',
  secondary:  '#3B82F6',
  surface:    '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  card:       '#FFFFFF',
  border:     '#E2E8F0',
  text:       '#1E293B',
  textMid:    '#64748B',
  textLight:  '#94A3B8',
  danger:     '#EF4444',
  warning:    '#F59E0B',
  radius:     '12px',
  radiusSm:   '8px',
}
const STATUS_STYLE: Record<string, {bg:string;color:string;border:string}> = {
  active:    {bg:'#ECFDF5', color:'#065F46', border:'#6EE7B7'},
  Active:    {bg:'#ECFDF5', color:'#065F46', border:'#6EE7B7'},
  inactive:  {bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
  Inactive:  {bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
  suspended: {bg:'#FFFBEB', color:'#92400E', border:'#FCD34D'},
  Suspended: {bg:'#FFFBEB', color:'#92400E', border:'#FCD34D'},
  resigned:  {bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5'},
  Resigned:  {bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5'},
  Vacant:    {bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
}



const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706','#0891b2']

export default function ClientGroupPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<ClientGroup[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<ClientGroup | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(p?.role === 'admin')
    }
    const { data } = await supabase.from('client_group').select('*').order('name')
    const { data: pccData } = await supabase.from('pcc_list').select('client_group_id').not('client_group_id','is',null)
    const counts: Record<number,number> = {}
    for (const p of pccData ?? []) { if (p.client_group_id) counts[p.client_group_id] = (counts[p.client_group_id] ?? 0) + 1 }
    setRecords((data ?? []).map((g: ClientGroup) => ({ ...g, client_count: counts[g.id] ?? 0 })))
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: ClientGroup) { setEditing(row); setForm({ name: row.name, description: row.description ?? '' }); setError(''); setSaving(false); setModalOpen(true) }
  function openDelete(row: ClientGroup) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Group name is required.'); return }
    setSaving(true); setError('')
    const { data: existing } = await supabase.from('client_group').select('id').ilike('name', form.name.trim()).maybeSingle()
    if (existing && (!editing || existing.id !== editing.id)) { setError(`"${form.name.trim()}" already exists.`); setSaving(false); return }
    const audit = await getAuditFields()
    const payload = { name: form.name.trim(), description: form.description.trim() || null, ...audit }
    const { error: e } = editing ? await supabase.from('client_group').update(payload).eq('id', editing.id) : await supabase.from('client_group').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('client_group').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  const filtered = records.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || (r.description ?? '').toLowerCase().includes(search.toLowerCase()))
  const totalClients = records.reduce((s, r) => s + (r.client_count ?? 0), 0)

  const inp = { width:'100%', padding:'8px 12px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.text, outline:'none', boxSizing:'border-box' as const }
  const lbl = { display:'block', fontSize:'12px', fontWeight:600, color:T.textMid, marginBottom:'6px' } as const

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:T.surface, minHeight:'100vh'}}>
      {/* Header */}
      <div style={{background:T.card, borderBottom:`1px solid ${T.border}`, padding:'20px 28px', marginBottom:'24px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <h1 style={{fontSize:'24px', fontWeight:800, color:T.text, margin:0, letterSpacing:'-0.025em'}}>Client Groups</h1>
            <p style={{fontSize:'13px', color:T.textMid, marginTop:'3px'}}>Manage client group categories linked to PCC codes</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{display:'flex', alignItems:'center', gap:'7px', padding:'10px 22px', background:T.primary, border:'none', borderRadius:T.radius, fontSize:'17px', fontWeight:700, color:'white', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Group
            </button>
          )}
        </div>
      </div>

      <div style={{padding:'0 28px 28px'}}>
        {/* Stats */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'24px'}}>
          {[
            { label:'Total Groups', value: records.length, sub:'configured', icon:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
            { label:'Total Linked PCCs', value: totalClients, sub:'across all groups', icon:'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
            { label:'Avg PCCs / Group', value: records.length ? (totalClients/records.length).toFixed(1) : '0', sub:'per group', icon:'M18 20V10M12 20V4M6 20v-6', accent:true },
          ].map((s,i) => (
            <div key={i} style={{background: s.accent ? T.primary : 'white', border:`1px solid ${s.accent ? T.primary : T.border}`, borderRadius:T.radius, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:'11px', fontWeight:700, color: s.accent ? 'rgba(255,255,255,0.75)' : T.textLight, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px'}}>{s.label}</div>
                  <div style={{fontSize:'28px', fontWeight:800, color: s.accent ? 'white' : T.text, letterSpacing:'-0.03em', lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:'11px', color: s.accent ? 'rgba(255,255,255,0.65)' : T.textLight, marginTop:'4px'}}>{s.sub}</div>
                </div>
                <div style={{width:'34px', height:'34px', borderRadius:T.radius, background: s.accent ? 'rgba(255,255,255,0.15)' : '#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.accent ? 'white' : T.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon}/>{i===0&&<><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>}</svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Search bar */}
        <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, padding:'12px 16px', borderRight:'1px solid #f1f5f9', marginBottom:'16px', display:'flex', alignItems:'center', gap:'10px'}}>
          <div style={{position:'relative', flex:1}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)}
              style={{...inp, paddingLeft:'32px'}} />
          </div>
          <span style={{fontSize:'17px', color:'#065F46', fontWeight:600, whiteSpace:'nowrap'}}>{filtered.length} group{filtered.length!==1?'s':''}</span>
          {search && <button onClick={() => setSearch('')} style={{padding:'6px 10px', background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:T.radius, fontSize:'12px', color:T.textMid, cursor:'pointer'}}>Clear</button>}
        </div>

        {/* Table */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, marginBottom:'12px'}}>
          <span style={{fontSize:'13px', color:T.textLight}}>Showing {filtered.length} group{filtered.length!==1?'s':''}</span>
        </div>
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:T.textLight}}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, padding:'60px', textAlign:'center', color:T.textLight}}>
            {search ? `No groups matching "${search}"` : 'No client groups yet. Click Add Group to create one.'}
          </div>
        ) : (
          <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <div style={{display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 140px', background:'#F0FDF4', borderBottom:`2px solid #6EE7B7`}}>
              {['Group Name','Description','Linked PCCs','Last Modified','Actions'].map((h,i) => (
                <div key={h} style={{padding:'11px 16px', fontSize:'16px', fontWeight:800, color:'#065F46', textTransform:'uppercase', letterSpacing:'0.07em', textAlign:i===4?'right':'left', borderRight:'1px solid #d1fae5'}}>{h}</div>
              ))}
            </div>
            {filtered.map((row, i) => {
              const color = AVATAR_COLORS[row.name.charCodeAt(0) % AVATAR_COLORS.length]
              return (
                <div key={row.id} style={{display:'grid', gridTemplateColumns:'2fr 2fr 1fr 1fr 140px', borderBottom: i<filtered.length-1 ? `1px solid ${T.border}` : 'none', transition:'background 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceAlt)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:'10px'}}>
                    <div style={{width:'32px', height:'32px', borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <span style={{fontSize:'12px', fontWeight:700, color:'white'}}>{row.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span style={{fontSize:'16px', fontWeight:600, color:T.text}}>{row.name}</span>
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'16px', color: row.description ? T.textMid : T.textLight, fontStyle: row.description ? 'normal' : 'italic'}}>
                      {row.description || 'No description'}
                    </span>
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'16px', fontWeight:600, padding:'4px 10px', borderRadius:'20px',
                      background: (row.client_count??0) > 0 ? '#eff6ff' : T.surfaceAlt,
                      color:      (row.client_count??0) > 0 ? T.primary : T.textLight,
                      border:     `1px solid ${(row.client_count??0) > 0 ? '#bfdbfe' : T.border}`}}>
                      {row.client_count ?? 0} PCC{(row.client_count??0)!==1?'s':''}
                    </span>
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                    {row.modified_at ? (
                      <>
                        <span style={{fontSize:'16px', color:T.textMid}}>{new Date(row.modified_at).toLocaleDateString('en-MY')}</span>
                        {row.modified_by && <span style={{fontSize:'13px', color:T.textLight, marginTop:'1px'}}>{row.modified_by}</span>}
                      </>
                    ) : <span style={{fontSize:'16px', color:T.textLight}}>-</span>}
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'6px'}}>
                    {isAdmin && (<>
                      <button onClick={() => openEdit(row)} style={{padding:'4px 12px', fontSize:'12px', fontWeight:600, color:T.textMid, background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, cursor:'pointer'}}>Edit</button>
                      <button onClick={() => openDelete(row)} style={{padding:'4px 12px', fontSize:'12px', fontWeight:600, color:T.danger, background:T.card, border:'1px solid #fecaca', borderRadius:T.radius, cursor:'pointer'}}>Delete</button>
                    </>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Client Group' : 'Add Client Group'} size="sm">
        <div className="space-y-4">
          <div><label style={lbl}>Group Name <span style={{color:T.danger}}>*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Accomy Group" autoFocus style={inp} /></div>
          <div><label style={lbl}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="Optional description..." rows={3}
              style={{...inp, resize:'none', fontFamily:'Inter, system-ui, sans-serif'}} /></div>
          {error && <p style={{fontSize:'13px', color:T.danger}}>{error}</p>}
          <div style={{display:'flex', gap:'10px', paddingTop:'4px'}}>
            <button onClick={() => setModalOpen(false)} style={{flex:1, padding:'9px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.primary, color:'white', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Group'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Client Group" size="sm">
        <div className="space-y-4">
          {(editing?.client_count ?? 0) > 0 ? (
            <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px 14px', borderRight:'1px solid #f1f5f9'}}>
              <p style={{fontSize:'13px', fontWeight:700, color:'#92400e', marginBottom:'4px'}}>Warning</p>
              <p style={{fontSize:'13px', color:'#b45309'}}>This group has <strong>{editing?.client_count}</strong> linked PCC{(editing?.client_count??0)!==1?'s':''}. Deleting it will remove the group assignment but not the PCCs.</p>
            </div>
          ) : (
            <p style={{fontSize:'14px', color:T.textMid}}>Delete <strong style={{color:T.text}}>{editing?.name}</strong>? This cannot be undone.</p>
          )}
          <div style={{display:'flex', gap:'10px'}}>
            <button onClick={() => setDeleteOpen(false)} style={{flex:1, padding:'9px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.danger, color:'white', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
