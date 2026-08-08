'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'

interface BillingCycle {
  id: number; value: string; label: string; sort_order: number; created_at: string
}

const EMPTY = { value: '', label: '', sort_order: 0 }

// Modal styling stays light (shared Modal component not touched this session)
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
// Main page dark theme (matches TopNav's System group = coral)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#f78166', accentSoft: 'rgba(247,129,102,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
}

export default function BillingCyclesPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<BillingCycle[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<BillingCycle | null>(null)
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
    const { data } = await supabase.from('billing_cycles').select('*').order('sort_order')
    setRecords(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    const next = records.length > 0 ? Math.max(...records.map(r => r.sort_order)) + 1 : 1
    setForm({ value: '', label: '', sort_order: next })
    setError(''); setSaving(false); setModalOpen(true)
  }
  function openEdit(row: BillingCycle) { setEditing(row); setForm({ value: row.value, label: row.label, sort_order: row.sort_order }); setError(''); setSaving(false); setModalOpen(true) }
  function openDelete(row: BillingCycle) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.value.trim()) { setError('Value is required.'); return }
    if (!form.label.trim()) { setError('Label is required.'); return }
    setSaving(true); setError('')
    const payload = { value: form.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''), label: form.label.trim(), sort_order: form.sort_order }
    const { error: e } = editing ? await supabase.from('billing_cycles').update(payload).eq('id', editing.id) : await supabase.from('billing_cycles').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('billing_cycles').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  async function moveRow(id: number, dir: 'up' | 'down') {
    const idx = records.findIndex(r => r.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= records.length) return
    const a = records[idx], b = records[swapIdx]
    await Promise.all([
      supabase.from('billing_cycles').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('billing_cycles').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    fetchAll()
  }

  const inp = { width:'100%', padding:'8px 12px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.text, outline:'none', boxSizing:'border-box' as const }
  const lbl = { display:'block', fontSize:'12px', fontWeight:600, color:T.textMid, marginBottom:'6px' } as const

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'28px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Billing Cycles</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Define how features and services are measured and billed</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Billing Cycle
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'15px'}}>Loading...</div>
        ) : records.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'15px'}}>No billing cycles yet.</div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>
            <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed'}}>
              <colgroup>
                <col style={{width:'40%'}} />
                <col style={{width:'30%'}} />
                <col style={{width:'30%'}} />
              </colgroup>
              <thead>
                <tr>
                  {['Unit of Measure', 'Billing Unit', 'Actions'].map((h, i) => (
                    <th key={h} style={{padding:'12px 20px', fontSize:'15px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign: i===2 ? 'right' : 'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr key={row.id} style={{borderBottom: i < records.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                    onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{padding:'14px 20px', fontSize:'16px', fontWeight:600, color:D.fg}}>{row.label}</td>
                    <td style={{padding:'14px 20px'}}>
                      <span style={{display:'inline-flex', alignItems:'center', fontFamily:'monospace', fontSize:'14px', fontWeight:600, padding:'5px 12px', borderRadius:'6px', background:D.accentSoft, color:D.accent, letterSpacing:'0.02em', whiteSpace:'nowrap'}}>{row.value}</span>
                    </td>
                    <td style={{padding:'14px 20px'}}>
                      <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'6px'}}>
                        {isAdmin && (<>
                          <button onClick={() => moveRow(row.id, 'up')} disabled={i === 0}
                            style={{width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor: i===0 ? 'default' : 'pointer', opacity: i===0 ? 0.35 : 1}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                          </button>
                          <button onClick={() => moveRow(row.id, 'down')} disabled={i === records.length - 1}
                            style={{width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor: i===records.length-1 ? 'default' : 'pointer', opacity: i===records.length-1 ? 0.35 : 1}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          <button onClick={() => openEdit(row)}
                            style={{padding:'7px 14px', fontSize:'14px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                            onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                            onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                            Edit
                          </button>
                          <button onClick={() => openDelete(row)}
                            style={{padding:'7px 14px', fontSize:'14px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                            onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                            onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                            Delete
                          </button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Billing Cycle' : 'Add Billing Cycle'} size="sm">
        <div className="space-y-4">
          <div><label style={lbl}>Label <span style={{color:T.danger}}>*</span></label>
            <input type="text" value={form.label} onChange={e => setForm(f=>({...f,label:e.target.value}))} placeholder="e.g. Per Month" style={inp} />
            <p style={{fontSize:'11px', color:T.textLight, marginTop:'4px'}}>This is what users see in the dropdown.</p></div>
          <div><label style={lbl}>Value (key) <span style={{color:T.danger}}>*</span></label>
            <input type="text" value={form.value} onChange={e => setForm(f=>({...f,value:e.target.value}))} placeholder="e.g. monthly" style={{...inp, fontFamily:'monospace'}} />
            <p style={{fontSize:'11px', color:T.textLight, marginTop:'4px'}}>Auto-generated from label. Used internally as the stored key.</p></div>
          <div><label style={lbl}>Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e => setForm(f=>({...f,sort_order:Number(e.target.value)}))} style={inp} /></div>
          {error && <p style={{fontSize:'13px', color:T.danger}}>{error}</p>}
          <div style={{display:'flex', gap:'10px', paddingTop:'4px'}}>
            <button onClick={() => setModalOpen(false)} style={{flex:1, padding:'9px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.primary, color:'white', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Billing Cycle" size="sm">
        <div className="space-y-4">
          <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px 14px'}}>
            <p style={{fontSize:'13px', fontWeight:700, color:'#92400e', marginBottom:'4px'}}>Warning</p>
            <p style={{fontSize:'13px', color:'#b45309'}}>Deleting <strong>{editing?.label}</strong> will affect any GDS features using this billing cycle.</p>
          </div>
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
