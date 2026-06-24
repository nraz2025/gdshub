'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuditFields } from '@/lib/audit'
import Modal from '@/components/shared/Modal'

interface ClientGroup {
  id: number; name: string
  created_at: string; client_count?: number
}

interface LinkedPCC {
  id: number; pcc: string; status: string
  gds?: { id: number; name: string } | null
}

const EMPTY = { name: '' }

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



const AVATAR_COLORS = ['#0d9488','#2563eb','#db2777','#16a34a','#9333ea','#d97706']
const GDS_COLORS: Record<string, string> = {
  Amadeus:    'bg-purple-50 text-purple-700 border-purple-200',
  Sabre:      'bg-sky-50 text-sky-700 border-sky-200',
  Travelport: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function ClientGroupPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<ClientGroup[]>([])
  const [pccList, setPccList] = useState<LinkedPCC[]>([])
  const [pccOpen, setPccOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<ClientGroup | null>(null)
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
    const { data } = await supabase.from('client_group').select('id, name, created_at').order('name')
    const { data: pccData } = await supabase.from('pcc_list').select('id, pcc, status, client_group_id, gds:gds_id(id, name)').not('client_group_id','is',null)
    const counts: Record<number,number> = {}
    for (const p of pccData ?? []) { if (p.client_group_id) counts[p.client_group_id] = (counts[p.client_group_id] ?? 0) + 1 }
    setRecords((data ?? []).map((g: ClientGroup) => ({ ...g, client_count: counts[g.id] ?? 0 })))
    setPccList((pccData as unknown as (LinkedPCC & { client_group_id: number | null })[]) ?? [])
    setLoading(false)
  }

  function openPCCs(row: ClientGroup) { setSelectedGroup(row); setPccOpen(true) }
  const linkedPCCs = (groupId: number) => (pccList as (LinkedPCC & { client_group_id: number | null })[]).filter(p => p.client_group_id === groupId)
  const selectedPCCs = selectedGroup ? linkedPCCs(selectedGroup.id) : []

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: ClientGroup) { setEditing(row); setForm({ name: row.name }); setError(''); setSaving(false); setModalOpen(true) }
  function openDelete(row: ClientGroup) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Group name is required.'); return }
    setSaving(true); setError('')
    const { data: existing } = await supabase.from('client_group').select('id').ilike('name', form.name.trim()).maybeSingle()
    if (existing && (!editing || existing.id !== editing.id)) { setError(`"${form.name.trim()}" already exists.`); setSaving(false); return }
    const audit = await getAuditFields()
    const payload = { name: form.name.trim(), ...audit }
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

  const filtered = records.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  const inp = { width:'100%', padding:'8px 12px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.text, outline:'none', boxSizing:'border-box' as const }
  const lbl = { display:'block', fontSize:'12px', fontWeight:600, color:T.textMid, marginBottom:'6px' } as const

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:'#f1f5f9', minHeight:'100vh'}}>
      {/* Header */}
      <div style={{padding:'20px 28px', marginBottom:'0'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <h1 style={{fontSize:'24px', fontWeight:700, color:'#1e293b', margin:0, letterSpacing:'-0.02em'}}>Client Groups</h1>
            <p style={{fontSize:'14px', color:'#64748b', marginTop:'4px'}}>Manage client group categories linked to PCC codes</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'8px', padding:'10px 20px', background:'linear-gradient(135deg, #1a5f3c 0%, #2d8a5e 100%)', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:500, color:'white', cursor:'pointer', boxShadow:'0 4px 14px 0 rgba(26, 95, 60, 0.3)', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
              onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px 0 rgba(26, 95, 60, 0.4)' }}
              onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px 0 rgba(26, 95, 60, 0.3)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Group
            </button>
          )}
        </div>
      </div>

      <div style={{padding:'0 28px 28px'}}>

        {/* Table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:'#94a3b8'}}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'60px', textAlign:'center', color:'#94a3b8'}}>
            No client groups yet. Click Add Group to create one.
          </div>
        ) : (
          <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 2px 0 rgb(0 0 0 / 0.05)'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
              {['Group Name','Linked PCCs','Actions'].map((h,i) => (
                <div key={h} style={{padding:'14px 16px', fontSize:'12px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:i===2?'right':'left', borderRight: i<2 ? '1px solid #e2e8f0' : 'none'}}>{h}</div>
              ))}
            </div>
            {filtered.map((row, i) => {
              const color = AVATAR_COLORS[row.name.charCodeAt(0) % AVATAR_COLORS.length]
              return (
                <div key={row.id} style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom: i<filtered.length-1 ? '1px solid #e2e8f0' : 'none', transition:'background 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:'10px', borderRight:'1px solid #f1f5f9'}}>
                    <div style={{width:'28px', height:'28px', borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <span style={{fontSize:'12px', fontWeight:600, color:'white'}}>{row.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span style={{fontSize:'14px', fontWeight:600, color:'#1e293b'}}>{row.name}</span>
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', borderRight:'1px solid #f1f5f9'}}>
                    {(row.client_count??0) > 0 ? (
                      <button onClick={() => openPCCs(row)}
                        style={{display:'inline-flex', alignItems:'center', padding:'6px 14px', borderRadius:'9999px', fontSize:'12px', fontWeight:600, cursor:'pointer',
                          background:'#f0fdf4', color:'#1a5f3c', border:'1px solid #bbf7d0', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e => { e.currentTarget.style.background='#dcfce7'; e.currentTarget.style.boxShadow='0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                        onMouseOut={e => { e.currentTarget.style.background='#f0fdf4'; e.currentTarget.style.boxShadow='none' }}>
                        {row.client_count} PCC{(row.client_count??0)!==1?'s':''}
                      </button>
                    ) : (
                      <span style={{display:'inline-flex', alignItems:'center', padding:'6px 14px', borderRadius:'9999px', fontSize:'12px', fontWeight:600, background:'#f1f5f9', color:'#94a3b8', border:'1px solid #e2e8f0'}}>
                        0 PCCs
                      </span>
                    )}
                  </div>
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'8px'}}>
                    {isAdmin && (<>
                      <button onClick={() => openEdit(row)}
                        style={{padding:'6px 14px', fontSize:'12px', fontWeight:500, color:'#64748b', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'8px', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.color='#1e293b'; e.currentTarget.style.boxShadow='0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                        onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.color='#64748b'; e.currentTarget.style.boxShadow='none' }}>
                        Edit
                      </button>
                      <button onClick={() => openDelete(row)}
                        style={{padding:'6px 14px', fontSize:'12px', fontWeight:500, color:'#ef4444', background:'#ffffff', border:'1px solid #fecaca', borderRadius:'8px', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.borderColor='#ef4444' }}
                        onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.borderColor='#fecaca' }}>
                        Delete
                      </button>
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
            <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px 14px'}}>
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

      {/* ── Linked PCCs Modal ── */}
      <Modal open={pccOpen} onClose={() => setPccOpen(false)} title={`PCCs - ${selectedGroup?.name}`} size="md">
        <div className="space-y-3">
          {selectedPCCs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No PCCs linked to this group.</p>
          ) : (
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'13px'}}>PCC Code</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'13px'}}>GDS</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'13px'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPCCs.map((pcc, i) => {
                    const gdsName = pcc.gds?.name ?? ''
                    return (
                      <tr key={pcc.id} className={i < selectedPCCs.length - 1 ? 'border-b border-slate-50' : ''}>
                        <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5" style={{fontSize:'13px', borderRadius:'6px', display:'inline-block', minWidth:'90px', textAlign:'center'}}>{pcc.pcc}</span></td>
                        <td className="px-4 py-2.5">{gdsName && <span className={`font-medium px-2.5 py-1 border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`} style={{fontSize:'12px', borderRadius:'6px', display:'inline-block', minWidth:'90px', textAlign:'center'}}>{gdsName}</span>}</td>
                        <td className="px-4 py-2.5"><span className="text-slate-500" style={{fontSize:'13px'}}>{pcc.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => setPccOpen(false)} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium">Close</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
