'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GDS_NAME = 'Travelport'
const ACCENT = '#58a6ff'
const ACCENT_SOFT = 'rgba(88,166,255,0.10)'

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
const BLANK_PCC = '__blank__'

// Queue numbers 0-25 are system queues for Travelport.
const SYSTEM_QUEUE_NUMBERS = new Set<string>(Array.from({ length: 26 }, (_, i) => String(i)))

const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  dangerSoft: 'rgba(248,81,73,0.10)', danger: '#f85149',
  successSoft: 'rgba(63,185,80,0.10)', success: '#3fb950',
}

export default function TravelportQueueManagementPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<QueueRow[]>([])
  const [gdsId, setGdsId] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedPccs, setSelectedPccs] = useState<Set<string>>(new Set())
  const [queueSearch, setQueueSearch] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<{pcc: string; queue_number: string} | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Queue Name is a free-standing label per queue number — it doesn't belong to any PCC/OID
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [labelEditing, setLabelEditing] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')
  const [labelSaving, setLabelSaving] = useState(false)

  // Duplicate an existing PCC's whole queue setup onto a brand-new PCC (onboarding)
  const [dupOpen, setDupOpen] = useState(false)
  const [dupSourcePcc, setDupSourcePcc] = useState('')
  const [dupNewPcc, setDupNewPcc] = useState('')
  const [dupNewLabel, setDupNewLabel] = useState('')
  const [dupSaving, setDupSaving] = useState(false)
  const [dupError, setDupError] = useState('')

  // Rename/relabel an existing PCC
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameOldPcc, setRenameOldPcc] = useState('')
  const [renameNewPcc, setRenameNewPcc] = useState('')
  const [renameNewLabel, setRenameNewLabel] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  const [renameError, setRenameError] = useState('')

  // Custom column (PCC) order, persisted so it sticks for everyone
  const [pccOrder, setPccOrder] = useState<Record<string, number>>({})

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
      const [{ data: q }, { data: l }, { data: o }] = await Promise.all([
        supabase.from('gds_queue').select('*').eq('gds_id', thisGdsId).order('pcc').order('queue_number').range(0, 19999),
        supabase.from('gds_queue_labels').select('queue_number, label').eq('gds_id', thisGdsId),
        supabase.from('gds_pcc_order').select('pcc, sort_order').eq('gds_id', thisGdsId),
      ])
      setRecords((q as unknown as QueueRow[]) ?? [])
      setSelectedPccs(prev => prev.size > 0 ? prev : new Set(Array.from(new Set((q ?? []).map((r: QueueRow) => r.pcc)))))
      const labelMap: Record<string, string> = {}
      ;(l ?? []).forEach((row: { queue_number: string; label: string | null }) => { labelMap[row.queue_number] = row.label ?? '' })
      setLabels(labelMap)
      const orderMap: Record<string, number> = {}
      ;(o ?? []).forEach((row: { pcc: string; sort_order: number }) => { orderMap[row.pcc] = row.sort_order })
      setPccOrder(orderMap)
    }
    setLoading(false)
  }

  const allPccs = Array.from(new Set(records.map(r => r.pcc))).sort((a, b) => {
    const oa = pccOrder[a], ob = pccOrder[b]
    if (oa !== undefined && ob !== undefined) return oa - ob
    if (oa !== undefined) return -1
    if (ob !== undefined) return 1
    return a.localeCompare(b)
  })
  const visiblePccs = allPccs.filter(p => selectedPccs.has(p))

  // Sort queue numbers naturally (numeric where possible, else alphabetic). Include
  // queue numbers that only exist as a standalone label so the row doesn't disappear.
  const allQueueNumbers = Array.from(new Set([...records.map(r => r.queue_number), ...Object.keys(labels)])).sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
  const visibleQueueNumbers = queueSearch.trim()
    ? allQueueNumbers.filter(q => {
        const term = queueSearch.trim().toLowerCase()
        if (q.toLowerCase().includes(term)) return true
        if ((labels[q] ?? '').toLowerCase().includes(term)) return true
        return records.some(r => r.queue_number === q && r.queue_name.toLowerCase().includes(term))
      })
    : allQueueNumbers

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

  function openLabelEdit(qnum: string) {
    setLabelEditing(qnum)
    setLabelDraft(labels[qnum] ?? '')
  }

  async function saveLabel(qnum: string) {
    if (!gdsId) return
    setLabelSaving(true)
    const value = labelDraft.trim()
    const { error: e } = await supabase.from('gds_queue_labels')
      .upsert({ gds_id: gdsId, queue_number: qnum, label: value || null }, { onConflict: 'gds_id,queue_number' })
    setLabelSaving(false)
    if (e) { setError(e.message); return }
    setLabels(prev => ({ ...prev, [qnum]: value }))
    setLabelEditing(null)
  }

  function openDuplicatePcc() {
    setDupSourcePcc(''); setDupNewPcc(''); setDupNewLabel(''); setDupError(''); setDupOpen(true)
  }

  async function handleDuplicatePcc() {
    if (!gdsId) return
    const newPcc = dupNewPcc.trim().toUpperCase()
    if (!newPcc) { setDupError('Enter the new PCC / OID.'); return }
    if (allPccs.includes(newPcc)) { setDupError('That PCC already exists.'); return }
    setDupSaving(true); setDupError('')
    let newRows: Record<string, unknown>[]
    if (dupSourcePcc === BLANK_PCC) {
      // Blank PCC — don't copy anything. Insert one empty row per existing queue
      // number so the new column shows up in the table, ready to fill in cell by cell.
      if (allQueueNumbers.length === 0) { setDupSaving(false); setDupError('No queue numbers exist yet to attach this PCC to.'); return }
      newRows = allQueueNumbers.map(qnum => ({
        gds_id: gdsId, pcc: newPcc, pcc_label: dupNewLabel.trim() || null,
        queue_number: qnum, queue_name: '', category: null, purpose: null, queue_type: null,
      }))
    } else {
      if (!dupSourcePcc) { setDupSaving(false); setDupError('Choose which PCC to copy from, or pick "Blank PCC".'); return }
      const sourceRows = records.filter(r => r.pcc === dupSourcePcc)
      if (sourceRows.length === 0) { setDupSaving(false); setDupError('That PCC has no queues to copy.'); return }
      newRows = sourceRows.map(r => ({
        gds_id: gdsId, pcc: newPcc, pcc_label: dupNewLabel.trim() || null,
        queue_number: r.queue_number, queue_name: r.queue_name,
        category: r.category, purpose: r.purpose, queue_type: r.queue_type,
      }))
    }
    const { error: e } = await supabase.from('gds_queue').insert(newRows)
    setDupSaving(false)
    if (e) { setDupError(e.message); return }
    setSelectedPccs(prev => new Set([...prev, newPcc]))
    setDupOpen(false)
    fetchAll()
  }

  function openRenamePcc(pcc: string) {
    setRenameOldPcc(pcc)
    setRenameNewPcc(pcc)
    setRenameNewLabel(records.find(r => r.pcc === pcc)?.pcc_label ?? '')
    setRenameError(''); setRenameOpen(true)
  }

  async function handleRenamePcc() {
    if (!gdsId) return
    const newPcc = renameNewPcc.trim().toUpperCase()
    if (!newPcc) { setRenameError('PCC code is required.'); return }
    if (newPcc !== renameOldPcc && allPccs.includes(newPcc)) { setRenameError('That PCC code already exists.'); return }
    setRenameSaving(true); setRenameError('')
    const { error: e } = await supabase.from('gds_queue')
      .update({ pcc: newPcc, pcc_label: renameNewLabel.trim() || null })
      .eq('gds_id', gdsId).eq('pcc', renameOldPcc)
    setRenameSaving(false)
    if (e) { setRenameError(e.message); return }
    setSelectedPccs(prev => {
      const next = new Set(prev)
      if (next.has(renameOldPcc)) { next.delete(renameOldPcc); next.add(newPcc) }
      return next
    })
    setRenameOpen(false)
    fetchAll()
  }

  // Swap this PCC with its neighbour in the overall column order and persist both
  async function movePcc(pcc: string, direction: 'left' | 'right') {
    if (!gdsId) return
    const idx = allPccs.indexOf(pcc)
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= allPccs.length) return
    // Always rebuild a clean, sequential 0..n-1 order from the CURRENT on-screen
    // column positions before swapping. Reusing old stored sort_order values here
    // caused a bug: a newly-added PCC (with no stored order yet) would fall back to
    // its array index, which can be smaller than another PCC's real stored value if
    // that value drifted non-sequential from earlier reorders — so the swap would
    // "save" successfully but never actually move anything on screen.
    const newOrders = allPccs.map((_, i) => i)
    const tmp = newOrders[idx]; newOrders[idx] = newOrders[swapIdx]; newOrders[swapIdx] = tmp
    const rows = allPccs.map((p, i) => ({ gds_id: gdsId, pcc: p, sort_order: newOrders[i] }))
    const { error: e } = await supabase.from('gds_pcc_order').upsert(rows, { onConflict: 'gds_id,pcc' })
    if (e) { setError(e.message); return }
    setPccOrder(prev => {
      const next = { ...prev }
      allPccs.forEach((p, i) => { next[p] = newOrders[i] })
      return next
    })
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
              <span style={{color:ACCENT}}>Travelport</span> Queue Management
            </h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Compare queue assignments across PCCs, side by side</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex', gap:'10px'}}>
              <button onClick={openDuplicatePcc}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:'transparent', border:`1.5px solid ${ACCENT}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:ACCENT, cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Add PCC
              </button>
              <button onClick={openAddQueue}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:ACCENT, border:`1px solid ${ACCENT}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Queue
              </button>
            </div>
          )}
        </div>

        {error && (
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 14px', marginBottom:'14px', background:'rgba(248,81,73,0.1)', border:`1px solid ${D.danger}`, borderRadius:'8px'}}>
            <span style={{fontSize:'13px', color:D.danger}}>{error}</span>
            <button onClick={() => setError('')} style={{background:'none', border:'none', color:D.danger, cursor:'pointer', fontSize:'14px'}}>✕</button>
          </div>
        )}

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

        {/* Queue number / name search */}
        <div style={{marginBottom:'18px', maxWidth:'280px'}}>
          <div style={{position:'relative'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" value={queueSearch} onChange={e => setQueueSearch(e.target.value)} placeholder="Search queue number or name..."
              style={{width:'100%', padding:'9px 14px 9px 36px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box'}} />
            {queueSearch && (
              <button onClick={() => setQueueSearch('')}
                style={{position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:D.fgDim, cursor:'pointer', fontSize:'14px'}}>✕</button>
            )}
          </div>
        </div>

        {/* Pivot table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
        ) : visiblePccs.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            {allPccs.length === 0 ? 'No Travelport queues configured yet.' : 'Select at least one PCC above to view its queues.'}
          </div>
        ) : visibleQueueNumbers.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            No queue number matches &quot;{queueSearch}&quot;.
          </div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'auto', maxHeight:'75vh'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:`${460 + visiblePccs.length * 200}px`}}>
              <thead>
                <tr>
                  <th style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:D.card, position:'sticky', top:0, left:0, zIndex:3}}>Queue #</th>
                  <th style={{padding:'12px 16px', fontSize:'13px', fontWeight:700, color:D.fg, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:D.card, position:'sticky', top:0, left:'90px', zIndex:3, whiteSpace:'nowrap'}}>Queue Name</th>
                  {visiblePccs.map(pcc => {
                    const label = records.find(r => r.pcc === pcc)?.pcc_label
                    return (
                      <th key={pcc} style={{padding:'12px 16px', fontSize:'13px', fontWeight:700, color:ACCENT, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:D.card, position:'sticky', top:0, zIndex:2, whiteSpace:'nowrap'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                          {isAdmin && (
                            <button onClick={() => movePcc(pcc, 'left')} disabled={allPccs.indexOf(pcc) === 0} title="Move column left"
                              style={{background:'none', border:'none', color: allPccs.indexOf(pcc) === 0 ? D.border : D.fgDim, cursor: allPccs.indexOf(pcc) === 0 ? 'default' : 'pointer', padding:0, display:'flex'}}
                              onMouseEnter={e => { if (allPccs.indexOf(pcc) !== 0) e.currentTarget.style.color = ACCENT }}
                              onMouseLeave={e => { e.currentTarget.style.color = allPccs.indexOf(pcc) === 0 ? D.border : D.fgDim }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                            </button>
                          )}
                          <span style={{fontFamily:'monospace'}}>{pcc}</span>
                          {isAdmin && (
                            <button onClick={() => movePcc(pcc, 'right')} disabled={allPccs.indexOf(pcc) === allPccs.length - 1} title="Move column right"
                              style={{background:'none', border:'none', color: allPccs.indexOf(pcc) === allPccs.length - 1 ? D.border : D.fgDim, cursor: allPccs.indexOf(pcc) === allPccs.length - 1 ? 'default' : 'pointer', padding:0, display:'flex'}}
                              onMouseEnter={e => { if (allPccs.indexOf(pcc) !== allPccs.length - 1) e.currentTarget.style.color = ACCENT }}
                              onMouseLeave={e => { e.currentTarget.style.color = allPccs.indexOf(pcc) === allPccs.length - 1 ? D.border : D.fgDim }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => openRenamePcc(pcc)} title="Rename / relabel this PCC"
                              style={{background:'none', border:'none', color:D.fgDim, cursor:'pointer', padding:0, display:'flex', marginLeft:'2px'}}
                              onMouseEnter={e => { e.currentTarget.style.color = ACCENT }}
                              onMouseLeave={e => { e.currentTarget.style.color = D.fgDim }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                            </button>
                          )}
                        </div>
                        {label && <div style={{fontSize:'11px', fontWeight:500, color:D.fgDim, textTransform:'none'}}>{label}</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleQueueNumbers.map((qnum, i) => (
                  <tr key={qnum} style={{borderBottom: i < visibleQueueNumbers.length - 1 ? `1px solid ${D.border}` : 'none'}}>
                    <td style={{padding:'10px 16px', fontFamily:'monospace', fontWeight:700, color:D.fg, fontSize:'14px', position:'sticky', left:0, background:D.card, verticalAlign:'top'}}>{qnum}</td>
                    <td style={{padding:'10px 16px', fontSize:'13px', color:D.fg, cursor:'default', verticalAlign:'top', position:'sticky', left:'90px', background:D.card}}>
                      {labelEditing === qnum ? (
                        <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                          <input autoFocus type="text" value={labelDraft} onChange={e => setLabelDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveLabel(qnum); if (e.key === 'Escape') setLabelEditing(null) }}
                            placeholder="e.g. General"
                            style={{padding:'4px 8px', fontSize:'13px', border:`1.5px solid ${ACCENT}`, borderRadius:'6px', background:D.bg, color:D.fg, outline:'none', width:'120px'}} />
                          <button onClick={() => saveLabel(qnum)} disabled={labelSaving}
                            style={{background:'none', border:'none', color:ACCENT, cursor:'pointer', fontSize:'13px', fontWeight:700, padding:0}}>✓</button>
                          <button onClick={() => setLabelEditing(null)}
                            style={{background:'none', border:'none', color:D.fgDim, cursor:'pointer', fontSize:'13px', padding:0}}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <span onClick={() => isAdmin && openLabelEdit(qnum)}
                            style={{color: labels[qnum] ? D.fg : D.fgDim, cursor: isAdmin ? 'pointer' : 'default', display:'block'}}
                            onMouseEnter={e => { if (isAdmin) e.currentTarget.style.color = ACCENT }}
                            onMouseLeave={e => { e.currentTarget.style.color = labels[qnum] ? D.fg : D.fgDim }}>
                            {labels[qnum] || '—'}
                          </span>
                          {SYSTEM_QUEUE_NUMBERS.has(qnum) && (
                            <span style={{display:'inline-block', marginTop:'3px', padding:'0px 5px', fontSize:'9px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.02em', color:D.fgMuted, background:'rgba(255,255,255,0.06)', border:`1px solid ${D.border}`, borderRadius:'4px'}}>
                              System Queue
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    {visiblePccs.map(pcc => {
                      const cell = cellFor(pcc, qnum)
                      return (
                        <td key={pcc} onClick={() => isAdmin && openCell(pcc, qnum)}
                          style={{padding:'10px 16px', fontSize:'13px', color: cell && cell.queue_name ? D.fg : D.fgDim, cursor: isAdmin ? 'pointer' : 'default', transition:'background 0.15s', verticalAlign:'top'}}
                          onMouseEnter={e => { if (isAdmin) e.currentTarget.style.background = ACCENT_SOFT }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                          {cell && cell.queue_name ? cell.queue_name : '—'}
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
                <input type="text" value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value }))} placeholder="e.g. 560J" style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
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

        {/* Duplicate PCC Modal */}
        {dupOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setDupOpen(false) }}>
          <div style={{width:'100%', maxWidth:'480px', background:D.card, border:`1px solid ${ACCENT}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${ACCENT_SOFT}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>Add PCC</h2>
              <button onClick={() => setDupOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>
            <p style={{fontSize:'12px', color:D.fgDim, marginBottom:'18px'}}>Copies every queue this PCC has (name, purpose, type) onto a new PCC — handy for onboarding.</p>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Copy From <span style={{color:D.danger}}>*</span></label>
              <select value={dupSourcePcc} onChange={e => setDupSourcePcc(e.target.value)} style={inpDark({cursor:'pointer', fontFamily:'monospace'})}>
                <option value="">Select an existing PCC...</option>
                <option value={BLANK_PCC}>— Blank PCC —</option>
                {allPccs.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>New PCC / OID <span style={{color:D.danger}}>*</span></label>
              <input type="text" value={dupNewPcc} onChange={e => setDupNewPcc(e.target.value)} placeholder="e.g. 9Q1K" style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
            </div>
            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Label (optional)</label>
              <input type="text" value={dupNewLabel} onChange={e => setDupNewLabel(e.target.value)} placeholder="e.g. New Corporate Office" style={inpDark()} />
            </div>

            {dupError && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{dupError}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button onClick={() => setDupOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
              <button onClick={handleDuplicatePcc} disabled={dupSaving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:ACCENT, border:`1px solid ${ACCENT}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:dupSaving?0.6:1}}>
                {dupSaving ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
          </div>
        )}

        {/* Rename PCC Modal */}
        {renameOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setRenameOpen(false) }}>
          <div style={{width:'100%', maxWidth:'440px', background:D.card, border:`1px solid ${ACCENT}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${ACCENT_SOFT}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>Rename PCC</h2>
              <button onClick={() => setRenameOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>
            <p style={{fontSize:'12px', color:D.fgDim, marginBottom:'18px'}}>Changes the PCC code and/or label on every queue entry currently under <span style={{fontFamily:'monospace', color:D.fg}}>{renameOldPcc}</span>.</p>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>PCC Code <span style={{color:D.danger}}>*</span></label>
              <input type="text" value={renameNewPcc} onChange={e => setRenameNewPcc(e.target.value)} style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
            </div>
            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Label</label>
              <input type="text" value={renameNewLabel} onChange={e => setRenameNewLabel(e.target.value)} placeholder="e.g. BCD Concur" style={inpDark()} />
            </div>

            {renameError && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{renameError}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button onClick={() => setRenameOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
              <button onClick={handleRenamePcc} disabled={renameSaving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:ACCENT, border:`1px solid ${ACCENT}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:renameSaving?0.6:1}}>
                {renameSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
