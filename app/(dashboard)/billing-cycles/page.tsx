'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'

interface BillingCycle {
  id: number; value: string; label: string; sort_order: number; created_at: string
}

const EMPTY = { value: '', label: '', sort_order: 0 }

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
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:T.surface, minHeight:'100vh'}}>
      {/* Header */}
      <div style={{background:T.card, borderBottom:`1px solid ${T.border}`, padding:'20px 28px', marginBottom:'24px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <h1 style={{fontSize:'24px', fontWeight:800, color:T.text, margin:0, letterSpacing:'-0.025em'}}>Billing Cycles</h1>
            <p style={{fontSize:'13px', color:T.textMid, marginTop:'3px'}}>Manage dropdown values for GDS Functionality billing cycles</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{display:'flex', alignItems:'center', gap:'7px', padding:'8px 18px', background:T.primary, border:'none', borderRadius:T.radius, fontSize:'13px', fontWeight:700, color:'white', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Billing Cycle
            </button>
          )}
        </div>
      </div>

      <div style={{padding:'0 28px 28px'}}>
        {/* Stats */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'24px'}}>
          {[
            { label:'Total Cycles', value: records.length, sub:'configured' },
            { label:'First Cycle', value: records[0]?.label ?? '-', sub:'lowest order' },
            { label:'Last Cycle', value: records[records.length-1]?.label ?? '-', sub:'highest order', accent:true },
          ].map((s,i) => (
            <div key={i} style={{background: s.accent ? T.primary : 'white', border:`1px solid ${s.accent ? T.primary : T.border}`, borderRadius:T.radius, padding:'16px 18px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:'11px', fontWeight:700, color: s.accent ? 'rgba(255,255,255,0.75)' : T.textLight, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'6px'}}>{s.label}</div>
              <div style={{fontSize:'22px', fontWeight:800, color: s.accent ? 'white' : T.text, letterSpacing:'-0.02em'}}>{s.value}</div>
              <div style={{fontSize:'11px', color: s.accent ? 'rgba(255,255,255,0.65)' : T.textLight, marginTop:'4px'}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{display:'flex', alignItems:'center', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, marginBottom:'12px'}}>
          <span style={{fontSize:'13px', color:T.textLight}}>Showing {records.length} billing cycle{records.length!==1?'s':''}</span>
        </div>
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:T.textLight, fontSize:'14px'}}>Loading...</div>
        ) : (
          <div style={{background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            {records.length === 0 ? (
              <div style={{padding:'60px', textAlign:'center', color:T.textLight, fontSize:'14px'}}>No billing cycles yet.</div>
            ) : (
              <>
                <div style={{display:'grid', gridTemplateColumns:'60px 1fr 1fr 140px', background:'#F0FDF4', borderBottom:`2px solid #6EE7B7`}}>
                  {['Order','Label','Value (key)','Actions'].map((h,i) => (
                    <div key={h} style={{padding:'11px 16px', fontSize:'16px', fontWeight:800, color:T.primary, textTransform:'uppercase', letterSpacing:'0.07em', textAlign: i===3 ? 'right' : 'left', borderRight:'1px solid #d1fae5'}}>{h}</div>
                  ))}
                </div>
                {records.map((row, i) => (
                  <div key={row.id} style={{display:'grid', gridTemplateColumns:'60px 1fr 1fr 140px', borderBottom: i < records.length-1 ? `1px solid ${T.border}` : 'none', transition:'background 0.1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceAlt)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{padding:'13px 16px', borderRight:'1px solid #f1f5f9', display:'flex', alignItems:'center'}}>
                      {isAdmin && (
                        <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                          <button onClick={() => moveRow(row.id,'up')} disabled={i===0} style={{background:'none', border:'none', cursor:'pointer', padding:'1px', color: i===0 ? T.border : T.textLight, lineHeight:1}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                          </button>
                          <button onClick={() => moveRow(row.id,'down')} disabled={i===records.length-1} style={{background:'none', border:'none', cursor:'pointer', padding:'1px', color: i===records.length-1 ? T.border : T.textLight, lineHeight:1}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{padding:'13px 16px', borderRight:'1px solid #f1f5f9', display:'flex', alignItems:'center'}}>
                      <span style={{fontSize:'16px', fontWeight:600, color:T.text}}>{row.label}</span>
                    </div>
                    <div style={{padding:'13px 16px', borderRight:'1px solid #f1f5f9', display:'flex', alignItems:'center'}}>
                      <span style={{fontFamily:'monospace', fontSize:'16px', fontWeight:600, padding:'3px 8px', borderRadius:T.radius, background:T.surfaceAlt, color:T.textMid, border:`1px solid ${T.border}`}}>{row.value}</span>
                    </div>
                    <div style={{padding:'13px 16px', borderRight:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'6px'}}>
                      {isAdmin && (<>
                        <button onClick={() => openEdit(row)} style={{padding:'4px 12px', fontSize:'12px', fontWeight:600, color:T.textMid, background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, cursor:'pointer'}}>Edit</button>
                        <button onClick={() => openDelete(row)} style={{padding:'4px 12px', fontSize:'12px', fontWeight:600, color:T.danger, background:T.card, border:'1px solid #fecaca', borderRadius:T.radius, cursor:'pointer'}}>Delete</button>
                      </>)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
        <div style={{display:'flex', alignItems:'center', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, marginTop:'12px'}}>
          <span style={{fontSize:'13px', color:T.textLight}}>Showing {records.length} billing cycle{records.length!==1?'s':''}</span>
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
          <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px 14px', borderRight:'1px solid #f1f5f9'}}>
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
