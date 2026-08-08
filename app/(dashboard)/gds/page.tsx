'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import type { GDS } from '@/types'

const EMPTY: Partial<GDS> = { name: '' }

// Dark theme tokens matching the Organisation page
const T = {
  bg: '#0e1117', bgElevated: '#161b22', card: '#1c2129', cardHover: '#222830',
  border: '#2d333b', borderLight: '#373e47',
  text: '#e6edf3', textMid: '#8b949e', textDim: '#6e7681',
  accent: '#58a6ff', accentSoft: 'rgba(88,166,255,0.10)', accentHover: '#79c0ff',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  radius: '10px',
}

// Per-GDS accent colors (reused for avatar, type badge, and top stripe)
const GDS_STYLE: Record<string, { color: string; soft: string; gradient: string }> = {
  Amadeus:    { color: '#39d2c0', soft: 'rgba(57,210,192,0.10)',  gradient: 'linear-gradient(135deg,#39d2c0,#2bb5a5)' },
  Sabre:      { color: '#f78166', soft: 'rgba(247,129,102,0.10)', gradient: 'linear-gradient(135deg,#f78166,#da6b50)' },
  Travelport: { color: '#58a6ff', soft: 'rgba(88,166,255,0.10)',  gradient: 'linear-gradient(135deg,#58a6ff,#388bfd)' },
}
const DEFAULT_STYLE = { color: '#a371f7', soft: 'rgba(163,113,247,0.10)', gradient: 'linear-gradient(135deg,#a371f7,#8b5cf6)' }

export default function GDSPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<GDS>>(EMPTY)
  const [editing, setEditing] = useState<GDS | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sortCol, setSortCol] = useState<'name' | 'created' | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const { data } = await supabase.from('gds').select('*').order('name')
    setRecords(data ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  function openEdit(row: GDS) { setEditing(row); setForm({ name: row.name }); setError(''); setModalOpen(true) }
  function openDelete(row: GDS) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.name) { setError('GDS name is required.'); return }
    const duplicate = records.find(r => r.name === form.name && r.id !== editing?.id)
    if (duplicate) { setError(`${form.name} already exists.`); return }
    setSaving(true); setError('')
    const { error: e } = editing
      ? await supabase.from('gds').update({ name: form.name }).eq('id', editing.id)
      : await supabase.from('gds').insert({ name: form.name })
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    const { error: e } = await supabase.from('gds').delete().eq('id', editing.id)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortCol(col); setSortDir(1) }
  }
  const sorted = [...records].sort((a, b) => {
    if (!sortCol) return 0
    const av = sortCol === 'name' ? a.name.toLowerCase() : a.created_at
    const bv = sortCol === 'name' ? b.name.toLowerCase() : b.created_at
    if (av < bv) return -1 * sortDir
    if (av > bv) return 1 * sortDir
    return 0
  })

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:T.bg, minHeight:'100vh', color:T.text}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* ── Page Header ── */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'28px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'30px', fontWeight:700, letterSpacing:'-0.5px', color:T.text, margin:0}}>GDS</h1>
            <p style={{fontSize:'15px', color:T.textMid, marginTop:'5px'}}>Configure and manage Global Distribution Systems</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:T.accent, border:`1px solid ${T.accent}`, borderRadius:'8px', fontSize:'15px', fontWeight:600, color:'#fff', cursor:'pointer', transition:'all 0.2s'}}
              onMouseOver={e => { e.currentTarget.style.background=T.accentHover; e.currentTarget.style.borderColor=T.accentHover }}
              onMouseOut={e => { e.currentTarget.style.background=T.accent; e.currentTarget.style.borderColor=T.accent }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add GDS
            </button>
          )}
        </div>

        {/* ── Data Table ── */}
        {loading ? (
          <div style={{padding:'60px', textAlign:'center', color:T.textMid, fontSize:'15px'}}>Loading...</div>
        ) : sorted.length === 0 ? (
          <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, padding:'60px', textAlign:'center', color:T.textMid, fontSize:'15px'}}>
            No GDS platforms configured yet.
          </div>
        ) : (
          <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, overflow:'hidden'}}>
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  {[{key:'name' as const, label:'GDS Name'}, {key:null, label:'Type'}, {key:null, label:'Status'}, {key:'created' as const, label:'Created'}].map((col, i) => (
                    <th key={i} onClick={() => col.key && toggleSort(col.key)}
                      style={{padding:'14px 18px', fontSize:'15px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.7px', color: sortCol===col.key ? T.accent : T.textDim, textAlign:'left', borderBottom:`1px solid ${T.border}`, background:'rgba(0,0,0,0.15)', cursor: col.key ? 'pointer' : 'default', whiteSpace:'nowrap'}}>
                      {col.label} {col.key && <span style={{marginLeft:'5px', fontSize:'10px', opacity: sortCol===col.key ? 1 : 0.4}}>{sortCol===col.key ? (sortDir===1?'↑':'↓') : '↕'}</span>}
                    </th>
                  ))}
                  <th style={{padding:'14px 18px', fontSize:'15px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.7px', color:T.textDim, textAlign:'left', borderBottom:`1px solid ${T.border}`, background:'rgba(0,0,0,0.15)'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const style = GDS_STYLE[row.name] ?? DEFAULT_STYLE
                  return (
                    <tr key={row.id} style={{borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}` : 'none', transition:'background 0.15s'}}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(88,166,255,0.04)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{padding:'16px 18px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                          <div style={{width:'36px', height:'36px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:style.gradient, color:'#fff', fontSize:'14px', fontWeight:700, position:'relative'}}>
                            {row.name.charAt(0).toUpperCase()}
                            <span style={{position:'absolute', bottom:'-1px', right:'-1px', width:'10px', height:'10px', borderRadius:'50%', background:T.success, border:`2px solid ${T.card}`, boxShadow:`0 0 6px ${T.success}`}} />
                          </div>
                          <span style={{fontWeight:600, fontSize:'16px', color:T.text}}>{row.name}</span>
                        </div>
                      </td>
                      <td style={{padding:'16px 18px'}}>
                        <span style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'6px', fontSize:'14px', fontWeight:600, background:style.soft, color:style.color}}>{row.name}</span>
                      </td>
                      <td style={{padding:'16px 18px'}}>
                        <span style={{display:'inline-flex', alignItems:'center', gap:'7px', padding:'5px 12px', borderRadius:'20px', fontSize:'14px', fontWeight:600, background:T.successSoft, color:T.success}}>
                          <span style={{width:'7px', height:'7px', borderRadius:'50%', background:T.success, boxShadow:`0 0 6px ${T.success}`}} />
                          Active
                        </span>
                      </td>
                      <td style={{padding:'16px 18px'}}>
                        <span style={{display:'flex', alignItems:'center', gap:'7px', color:T.textMid, fontSize:'15px'}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          {new Date(row.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                        </span>
                      </td>
                      <td style={{padding:'16px 18px'}}>
                        {isAdmin && (
                          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                            <button onClick={() => openEdit(row)}
                              style={{padding:'6px 12px', fontSize:'14px', fontWeight:600, border:`1px solid ${T.border}`, borderRadius:'6px', background:'transparent', color:T.textMid, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'5px'}}
                              onMouseOver={e => { e.currentTarget.style.background=T.accentSoft; e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.color=T.accent }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textMid }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              Edit
                            </button>
                            <button onClick={() => openDelete(row)}
                              style={{padding:'6px 12px', fontSize:'14px', fontWeight:600, border:`1px solid ${T.border}`, borderRadius:'6px', background:'transparent', color:T.textMid, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:'5px'}}
                              onMouseOver={e => { e.currentTarget.style.background=T.dangerSoft; e.currentTarget.style.borderColor=T.danger; e.currentTarget.style.color=T.danger }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textMid }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{display:'flex', alignItems:'center', padding:'12px 18px', borderTop:`1px solid ${T.border}`, background:'rgba(0,0,0,0.1)', fontSize:'14px', color:T.textDim}}>
              Showing <strong style={{color:T.text, margin:'0 4px'}}>{sorted.length}</strong> of <strong style={{color:T.text, margin:'0 4px'}}>{sorted.length}</strong> GDS entries
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit GDS' : 'Add GDS'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-md font-medium text-slate-700 mb-1.5">GDS Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sabre, Amadeus, Travelport, Galileo..."
              className="w-full px-3 py-2 text-md border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white" />
            <p className="text-xs text-slate-400 mt-1.5">Enter the name of the GDS platform</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50">
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add GDS'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete GDS" size="md">
        <div className="space-y-4">
          <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px'}}>
            <p style={{fontSize:'16px', fontWeight:700, color:'#92400e', marginBottom:'4px'}}>Warning</p>
            <p style={{fontSize:'16px', color:'#b45309'}}>
              Deleting <strong>{editing?.name}</strong> will also remove all linked PCC records and assignments.
            </p>
          </div>
          <p className="text-sm text-slate-600">This action cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded font-semibold disabled:opacity-50">
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
