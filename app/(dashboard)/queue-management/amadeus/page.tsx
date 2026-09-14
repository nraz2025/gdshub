'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GDS_NAME = 'Amadeus'
const ACCENT = '#a371f7'
const ACCENT_SOFT = 'rgba(163,113,247,0.10)'

interface QueueRow {
  id: number
  gds_id: number
  pcc: string
  pcc_label: string | null
  queue_number: string
  queue_name: string
  sub_category: string | null
  category: string | null
  purpose: string | null
  queue_type: string | null
  status: string | null
}

const EMPTY = { pcc: '', queue_number: '', queue_name: '', category: '', purpose: '', queue_type: '' }
const QUEUE_TYPES = ['System', 'User', 'Functional', 'Client / Corporate']

const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  dangerSoft: 'rgba(248,81,73,0.10)', danger: '#f85149',
  successSoft: 'rgba(63,185,80,0.10)', success: '#3fb950',
}

export default function AmadeusQueueManagementPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<QueueRow[]>([])
  const [gdsId, setGdsId] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedPccs, setSelectedPccs] = useState<Set<string>>(new Set())
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<{pcc: string; queue_number: string} | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPanelOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(p?.role === 'admin')
    }
    const { data: g } = await supabase.from('gds').select('id').eq('name', GDS_NAME).single()
    const thisGdsId = g?.id ?? null
    setGdsId(thisGdsId)
    if (thisGdsId) {
      const { data: q } = await supabase.from('gds_queue').select('*').eq('gds_id', thisGdsId).order('pcc').order('queue_number')
      setRecords((q as unknown as QueueRow[]) ?? [])
      setSelectedPccs(prev => prev.size > 0 ? prev : new Set(Array.from(new Set((q ?? []).map((r: QueueRow) => r.pcc)))))
    }
    setLoading(false)
  }

  const allPccs = Array.from(new Set(records.map(r => r.pcc))).sort()
  const visiblePccs = allPccs.filter(p => selectedPccs.has(p))

  // Sort queue numbers naturally (numeric where possible, else alphabetic)
  const allQueueNumbers = Array.from(new Set(records.map(r => r.queue_number))).sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })

  function cellFor(pcc: string, qnum: string) {
    return records.find(r => r.pcc === pcc && r.queue_number === qnum)
  }

  function openCell(pcc: string, qnum: string) {
    const existing = cellFor(pcc, qnum)
    setEditing({ pcc, queue_number: qnum })
    setForm(existing
      ? { pcc, queue_number: qnum, queue_name: existing.queue_name, category: existing.category ?? '', purpose: existing.purpose ?? '', queue_type: existing.queue_type ?? '' }
      : { pcc, queue_number: qnum, queue_name: '', category: '', purpose: '', queue_type: '' })
    setError(''); setPanelOpen(true)
  }

  function openAddQueue() {
    setEditing(null)
    setForm(EMPTY)
    setError(''); setPanelOpen(true)
  }

  async function handleSave() {
    if (!gdsId) return
    if (!form.pcc.trim()) { setError('PCC is required.'); return }
    if (!form.queue_number.trim()) { setError('Queue number is required.'); return }
    if (!form.queue_name.trim()) { setError('Queue name is required.'); return }
    setSaving(true); setError('')
    const existing = cellFor(form.pcc.trim().toUpperCase(), form.queue_number.trim())
    const payload = {
      gds_id: gdsId, pcc: form.pcc.trim().toUpperCase(), queue_number: form.queue_number.trim(),
      queue_name: form.queue_name.trim(), category: form.category.trim() || null,
      purpose: form.purpose.trim() || null, queue_type: form.queue_type || null,
    }
    const { error: e } = existing
      ? await supabase.from('gds_queue').update(payload).eq('id', existing.id)
      : await supabase.from('gds_queue').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setPanelOpen(false); fetchAll()
  }

  async function handleDeleteCell() {
    if (!editing) return
    const existing = cellFor(editing.pcc, editing.queue_number)
    if (!existing) return
    if (!confirm(`Delete queue ${editing.queue_number} for PCC ${editing.pcc}?`)) return
    await supabase.from('gds_queue').delete().eq('id', existing.id)
    setPanelOpen(false); fetchAll()
  }

  function togglePcc(pcc: string) {
    setSelectedPccs(prev => {
      const next = new Set(prev)
      next.has(pcc) ? next.delete(pcc) : next.add(pcc)
      return next
    })
  }

  const inpDark = (extra?: object) => ({ padding:'9px 12px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lblDark = { fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>
              <span style={{color:ACCENT}}>Amadeus</span> Queue Management
            </h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Compare queue assignments across PCCs, side by side</p>
          </div>
          {isAdmin && (
            <button onClick={openAddQueue}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:ACCENT, border:`1px solid ${ACCENT}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Queue
            </button>
          )}
        </div>

        {/* PCC selector */}
        <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'18px', flexWrap:'wrap'}}>
          <span style={{fontSize:'13px', fontWeight:600, color:D.fgMuted, marginRight:'4px'}}>Show PCCs:</span>
          {allPccs.map(pcc => {
            const active = selectedPccs.has(pcc)
            return (
              <button key={pcc} onClick={() => togglePcc(pcc)}
                style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, fontFamily:'monospace', borderRadius:'20px', cursor:'pointer',
                  background: active ? ACCENT_SOFT : D.card, color: active ? ACCENT : D.fgMuted, border: `1.5px solid ${active ? ACCENT : D.border}`}}>
                {pcc}
              </button>
            )
          })}
        </div>

        {/* Pivot table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
        ) : visiblePccs.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            {allPccs.length === 0 ? 'No Amadeus queues configured yet.' : 'Select at least one PCC above to view its queues.'}
          </div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:`${240 + visiblePccs.length * 200}px`}}>
              <thead>
                <tr>
                  <th style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', position:'sticky', left:0, zIndex:1}}>Queue #</th>
                  {visiblePccs.map(pcc => {
                    const label = records.find(r => r.pcc === pcc)?.pcc_label
                    return (
                      <th key={pcc} style={{padding:'12px 16px', fontSize:'13px', fontWeight:700, color:ACCENT, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', whiteSpace:'nowrap'}}>
                        <div style={{fontFamily:'monospace'}}>{pcc}</div>
                        {label && <div style={{fontSize:'11px', fontWeight:500, color:D.fgDim, textTransform:'none'}}>{label}</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {allQueueNumbers.map((qnum, i) => (
                  <tr key={qnum} style={{borderBottom: i < allQueueNumbers.length - 1 ? `1px solid ${D.border}` : 'none'}}>
                    <td style={{padding:'10px 16px', fontFamily:'monospace', fontWeight:700, color:D.fg, fontSize:'14px', position:'sticky', left:0, background:D.card}}>{qnum}</td>
                    {visiblePccs.map(pcc => {
                      const cell = cellFor(pcc, qnum)
                      return (
                        <td key={pcc} onClick={() => isAdmin && openCell(pcc, qnum)}
                          style={{padding:'10px 16px', fontSize:'13px', color: cell ? D.fg : D.fgDim, cursor: isAdmin ? 'pointer' : 'default', transition:'background 0.15s'}}
                          onMouseEnter={e => { if (isAdmin) e.currentTarget.style.background = ACCENT_SOFT }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                          {cell ? cell.queue_name : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {isAdmin && <div style={{padding:'10px 16px', borderTop:`1px solid ${D.border}`, fontSize:'12px', color:D.fgDim}}>Click any cell to add or edit that PCC&apos;s queue.</div>}
          </div>
        )}

        {/* Add/Edit Modal */}
        {panelOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setPanelOpen(false) }}>
          <div style={{width:'100%', maxWidth:'560px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${ACCENT}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${ACCENT_SOFT}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>{editing && cellFor(editing.pcc, editing.queue_number) ? 'Edit Queue' : 'Add Queue'}</h2>
              <button onClick={() => setPanelOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>PCC <span style={{color:D.danger}}>*</span></label>
                <input type="text" value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value }))} placeholder="e.g. XW7J" style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
              </div>
              <div>
                <label style={lblDark}>Queue Number <span style={{color:D.danger}}>*</span></label>
                <input type="text" value={form.queue_number} onChange={e => setForm(f => ({ ...f, queue_number: e.target.value }))} placeholder="e.g. 0" style={{...inpDark(), fontFamily:'monospace'}} />
              </div>
            </div>
            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Queue Name <span style={{color:D.danger}}>*</span></label>
              <input type="text" value={form.queue_name} onChange={e => setForm(f => ({ ...f, queue_name: e.target.value }))} placeholder="e.g. URGENT" style={inpDark()} />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>Type</label>
                <select value={form.queue_type} onChange={e => setForm(f => ({ ...f, queue_type: e.target.value }))} style={inpDark({cursor:'pointer'})}>
                  <option value="">Not specified</option>
                  {QUEUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lblDark}>Category</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. PIC 200" style={inpDark()} />
              </div>
            </div>
            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Purpose</label>
              <textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} rows={2} style={{...inpDark(), resize:'vertical' as const}} />
            </div>

            {error && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{error}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'space-between'}}>
              {editing && cellFor(editing.pcc, editing.queue_number) ? (
                <button onClick={handleDeleteCell} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:D.dangerSoft, border:`1px solid ${D.danger}`, borderRadius:'8px', color:D.danger, cursor:'pointer'}}>Delete</button>
              ) : <span />}
              <div style={{display:'flex', gap:'10px'}}>
                <button onClick={() => setPanelOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:ACCENT, border:`1px solid ${ACCENT}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:saving?0.6:1}}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
