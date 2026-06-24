'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import type { GDS, GDSName } from '@/types'

const GDS_OPTIONS: GDSName[] = ['Sabre', 'Amadeus', 'Travelport']
const EMPTY: Partial<GDS> = { name: 'Sabre' }

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



const GDS_STYLE: Record<string, { dot: string }> = {
  Amadeus:    { dot: '#9333ea' },
  Sabre:      { dot: '#3b82f6' },
  Travelport: { dot: '#22c55e' },
}

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

  // GDS descriptions for the card view
  const GDS_DESC: Record<string, string> = {
    Sabre:      'Global Distribution System — airline, hotel and car rental booking platform',
    Amadeus:    'Travel technology platform for bookings, ticketing and travel management',
    Travelport: 'Travel commerce platform connecting travel providers and agencies',
  }

  return (
    <div style={{fontFamily:"Inter, system-ui, sans-serif", background:'#f1f5f9', minHeight:'100vh'}}>

      {/* ── Page Header ── */}
      <div style={{padding:'20px 28px', marginBottom:'0'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'24px', fontWeight:700, color:'#1e293b', margin:0, letterSpacing:'-0.02em'}}>GDS Platforms</h1>
            <p style={{fontSize:'14px', color:'#64748b', marginTop:'4px'}}>Manage GDS platforms (Sabre, Amadeus, Travelport)</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'8px', padding:'10px 20px', background:'linear-gradient(135deg, #1a5f3c 0%, #2d8a5e 100%)', border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:500, color:'white', cursor:'pointer', boxShadow:'0 4px 14px 0 rgba(26, 95, 60, 0.3)', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
              onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px 0 rgba(26, 95, 60, 0.4)' }}
              onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px 0 rgba(26, 95, 60, 0.3)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add GDS
            </button>
          )}
        </div>
      </div>

      <div style={{padding:'0 28px 28px'}}>

        {/* ── Table ── */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:'#94a3b8', fontSize:'14px'}}>Loading...</div>
        ) : records.length === 0 ? (
          <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'60px', textAlign:'center', color:'#94a3b8', fontSize:'14px'}}>
            No GDS platforms found. Click Add GDS to get started.
          </div>
        ) : (
          <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 2px 0 rgb(0 0 0 / 0.05)'}}>
            {/* Header — equal 3 columns with vertical dividers */}
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', background:'#f8fafc', borderBottom:'1px solid #e2e8f0'}}>
              {['GDS Name', 'Created', 'Actions'].map((h, i) => (
                <div key={h} style={{padding:'14px 16px', fontSize:'12px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', textAlign: i === 2 ? 'right' : 'left', borderRight: i < 2 ? '1px solid #e2e8f0' : 'none'}}>
                  {h}
                </div>
              ))}
            </div>
            {records.map((row, i) => {
              const style = GDS_STYLE[row.name] ?? GDS_STYLE.Sabre
              return (
                <div key={row.id}
                  style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom: i < records.length - 1 ? '1px solid #e2e8f0' : 'none', transition:'background 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  {/* GDS Name — dot + name only, no badge */}
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:'10px', borderRight:'1px solid #f1f5f9'}}>
                    <div style={{width:'8px', height:'8px', borderRadius:'50%', background:style.dot, flexShrink:0}} />
                    <span style={{fontSize:'14px', fontWeight:600, color:'#1e293b'}}>{row.name}</span>
                  </div>
                  {/* Created */}
                  <div style={{padding:'14px 16px', display:'flex', alignItems:'center', borderRight:'1px solid #f1f5f9'}}>
                    <span style={{fontSize:'14px', color:'#64748b'}}>{new Date(row.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                  {/* Actions */}
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
      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit GDS' : 'Add GDS'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS Name <span className="text-red-500">*</span></label>
            <select value={form.name ?? 'Sabre'} onChange={e => setForm(f => ({ ...f, name: e.target.value as GDSName }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white">
              {GDS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">GDS values are pre-defined (Sabre, Amadeus, Travelport)</p>
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
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete GDS" size="sm">
        <div className="space-y-4">
          <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:T.radius, padding:'12px'}}>
            <p style={{fontSize:'13px', fontWeight:700, color:'#92400e', marginBottom:'4px'}}>Warning</p>
            <p style={{fontSize:'13px', color:'#b45309'}}>
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
