'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

interface QueueRow {
  id: number
  gds_id: number
  gds?: { name: string }
  pcc: string
  pcc_label: string | null
  queue_number: string
  queue_name: string
  sub_category: string | null
  category: string | null
  purpose: string | null
  queue_type: string | null
  status: string | null
  created_at: string
}

const EMPTY = { gds_id: '' as number | '', pcc: '', pcc_label: '', queue_number: '', queue_name: '', category: '', purpose: '', queue_type: '', status: 'Active' }
const QUEUE_TYPES = ['System', 'User', 'Functional', 'Client / Corporate']
const STATUSES = ['Active', 'Vacant', 'Inactive']

// Dark theme (matches TopNav's GDS group = teal)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#39d2c0', accentSoft: 'rgba(57,210,192,0.10)',
  orange: '#f78166', orangeSoft: 'rgba(247,129,102,0.10)',
  blue: '#58a6ff', blueSoft: 'rgba(88,166,255,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
}
const GDS_DARK: Record<string, { color: string; soft: string }> = {
  Amadeus: { color: D.purple, soft: D.purpleSoft },
  Sabre: { color: D.orange, soft: D.orangeSoft },
  Travelport: { color: D.blue, soft: D.blueSoft },
}
const TYPE_DARK: Record<string, { color: string; soft: string }> = {
  System: { color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' },
  User: { color: D.purple, soft: D.purpleSoft },
  Functional: { color: D.blue, soft: D.blueSoft },
  'Client / Corporate': { color: D.warning, soft: D.warningSoft },
}
const STATUS_DARK: Record<string, { color: string; soft: string }> = {
  Active: { color: D.success, soft: D.successSoft },
  Vacant: { color: D.warning, soft: D.warningSoft },
  Inactive: { color: D.fgDim, soft: 'rgba(139,148,158,0.10)' },
}

export default function QueueManagementPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<QueueRow[]>([])
  const [gdsList, setGdsList] = useState<{id: number; name: string}[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [panelOpen, setPanelOpen] = useState(false)
  const [editing, setEditing] = useState<QueueRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [filterGds, setFilterGds] = useState('all')
  const [filterPcc, setFilterPcc] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

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
    const [{ data: g }, { data: q }] = await Promise.all([
      supabase.from('gds').select('id, name').order('name'),
      supabase.from('gds_queue').select('*, gds:gds_id(name)').order('gds_id').order('pcc').order('queue_number'),
    ])
    setGdsList(g ?? [])
    setRecords((q as unknown as QueueRow[]) ?? [])
    setSelectedIds(new Set())
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setPanelOpen(true) }
  function openEdit(row: QueueRow) {
    setEditing(row)
    setForm({
      gds_id: row.gds_id, pcc: row.pcc, pcc_label: row.pcc_label ?? '', queue_number: row.queue_number,
      queue_name: row.queue_name, category: row.category ?? '', purpose: row.purpose ?? '',
      queue_type: row.queue_type ?? '', status: row.status ?? 'Active',
    })
    setError(''); setPanelOpen(true)
  }

  async function handleSave() {
    if (!form.gds_id) { setError('GDS is required.'); return }
    if (!form.pcc.trim()) { setError('PCC / OID is required.'); return }
    if (!form.queue_number.trim()) { setError('Queue number is required.'); return }
    if (!form.queue_name.trim()) { setError('Queue name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      gds_id: form.gds_id, pcc: form.pcc.trim().toUpperCase(), pcc_label: form.pcc_label.trim() || null,
      queue_number: form.queue_number.trim(), queue_name: form.queue_name.trim(),
      category: form.category.trim() || null, purpose: form.purpose.trim() || null,
      queue_type: form.queue_type || null, status: form.status || 'Active',
    }
    const { error: e } = editing
      ? await supabase.from('gds_queue').update(payload).eq('id', editing.id)
      : await supabase.from('gds_queue').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setPanelOpen(false); fetchAll()
  }

  async function handleDelete(row: QueueRow) {
    if (!confirm(`Delete queue ${row.queue_number} (${row.queue_name}) for PCC ${row.pcc}?`)) return
    await supabase.from('gds_queue').delete().eq('id', row.id)
    fetchAll()
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleSelectAll() {
    setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))
  }

  async function bulkMarkVacant() {
    if (selectedIds.size === 0) return
    await supabase.from('gds_queue').update({ status: 'Vacant' }).in('id', Array.from(selectedIds))
    setSuccess(`Marked ${selectedIds.size} queue(s) as Vacant.`)
    fetchAll()
  }
  async function bulkChangeType() {
    if (selectedIds.size === 0) return
    const newType = prompt(`Set type for ${selectedIds.size} selected queue(s):\n${QUEUE_TYPES.join(' / ')}`)
    if (!newType || !QUEUE_TYPES.includes(newType)) return
    await supabase.from('gds_queue').update({ queue_type: newType }).in('id', Array.from(selectedIds))
    setSuccess(`Updated type for ${selectedIds.size} queue(s).`)
    fetchAll()
  }
  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected queue(s)? This cannot be undone.`)) return
    await supabase.from('gds_queue').delete().in('id', Array.from(selectedIds))
    setSuccess(`Deleted ${selectedIds.size} queue(s).`)
    fetchAll()
  }

  function handleExport() {
    const data = filtered.map(r => ({
      GDS: r.gds?.name ?? '', 'PCC / OID': r.pcc, 'PCC Label': r.pcc_label ?? '', 'Queue Number': r.queue_number,
      'Queue Name': r.queue_name, 'Sub-Category': r.sub_category ?? '', Category: r.category ?? '',
      Purpose: r.purpose ?? '', Type: r.queue_type ?? '', Status: r.status ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Queue Management')
    XLSX.writeFile(wb, `GDSHub_Queue_Management_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      let created = 0, skipped = 0
      for (const row of raw) {
        const gdsName = String(row['GDS'] ?? '').trim()
        const gds = gdsList.find(g => g.name.toLowerCase() === gdsName.toLowerCase())
        const pcc = String(row['PCC / OID'] ?? '').trim()
        const qnum = String(row['Queue Number'] ?? '').trim()
        const qname = String(row['Queue Name'] ?? '').trim()
        if (!gds || !pcc || !qnum || !qname) { skipped++; continue }
        await supabase.from('gds_queue').insert({
          gds_id: gds.id, pcc: pcc.toUpperCase(), pcc_label: String(row['PCC Label'] ?? '').trim() || null,
          queue_number: qnum, queue_name: qname, category: String(row['Category'] ?? '').trim() || null,
          purpose: String(row['Purpose'] ?? '').trim() || null, queue_type: String(row['Type'] ?? '').trim() || null,
          status: String(row['Status'] ?? '').trim() || 'Active',
        })
        created++
      }
      setSuccess(`Imported ${created} queue(s)${skipped ? `, skipped ${skipped} incomplete row(s)` : ''}.`)
      fetchAll()
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const pccOptions = Array.from(new Set(
    records.filter(r => filterGds === 'all' || String(r.gds_id) === filterGds).map(r => r.pcc)
  )).sort()

  const filtered = records.filter(r => {
    const matchGds = filterGds === 'all' || String(r.gds_id) === filterGds
    const matchPcc = filterPcc === 'all' || r.pcc === filterPcc
    const matchType = filterType === 'all' || r.queue_type === filterType
    const term = search.toLowerCase()
    const matchSearch = !term || r.pcc.toLowerCase().includes(term) || r.queue_number.toLowerCase().includes(term) || r.queue_name.toLowerCase().includes(term) || (r.purpose ?? '').toLowerCase().includes(term)
    return matchGds && matchPcc && matchType && matchSearch
  })

  const activePccCount = new Set(records.map(r => r.pcc)).size
  const systemCount = records.filter(r => r.queue_type === 'System').length
  const vacantCount = records.filter(r => r.status === 'Vacant').length

  const inpDark = (extra?: object) => ({ padding:'9px 12px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lblDark = { fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Queue Management</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Unified view across Sabre, Amadeus and Travelport</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
              <button onClick={handleExport} disabled={filtered.length === 0}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer', opacity:filtered.length===0?0.4:1}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} style={{display:'none'}} />
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import
              </button>
              <button onClick={openAdd}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Queue
              </button>
            </div>
          )}
        </div>

        {/* Toasts */}
        {error && <div style={{background:D.dangerSoft, border:`1px solid ${D.danger}`, color:D.danger, padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'14px'}}>{error}</div>}
        {success && <div style={{background:D.successSoft, border:`1px solid ${D.success}`, color:D.success, padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'14px', display:'flex', justifyContent:'space-between'}}>{success} <button onClick={() => setSuccess('')} style={{background:'none', border:'none', color:D.success, cursor:'pointer'}}>✕</button></div>}

        {/* Stats — real, derived from actual data */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'22px'}}>
          {[
            { label: 'Total Queues', value: records.length, color: D.accent, soft: D.accentSoft, sub: `Across ${gdsList.length} GDSes` },
            { label: 'Distinct PCCs', value: activePccCount, color: D.blue, soft: D.blueSoft, sub: 'PCC / OID codes covered' },
            { label: 'System Queues', value: systemCount, color: D.warning, soft: D.warningSoft, sub: 'Pre-assigned by GDS' },
            { label: 'Vacant', value: vacantCount, color: D.purple, soft: D.purpleSoft, sub: 'Available for allocation' },
          ].map(s => (
            <div key={s.label} style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', padding:'14px 18px'}}>
              <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'22px', fontWeight:700, color:s.color}}>{s.value}</div>
              <div style={{fontSize:'12px', color:D.fg, fontWeight:600, marginTop:'3px'}}>{s.label}</div>
              <div style={{fontSize:'11px', color:D.fgDim, marginTop:'2px'}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px', flexWrap:'wrap'}}>
          <select value={filterGds} onChange={e => { setFilterGds(e.target.value); setFilterPcc('all') }}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'140px'}}>
            <option value="all">All GDS</option>
            {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filterPcc} onChange={e => setFilterPcc(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'140px'}}>
            <option value="all">All PCC / OID</option>
            {pccOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'140px'}}>
            <option value="all">All Types</option>
            {QUEUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{position:'relative', flex:'1 1 240px'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search queue number, name, or purpose..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box'}} />
          </div>
        </div>

        {/* Bulk operations bar */}
        {isAdmin && selectedIds.size > 0 && (
          <div style={{display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'10px', padding:'12px 16px', marginBottom:'14px'}}>
            <span style={{fontSize:'14px', fontWeight:600, color:D.fg}}>{selectedIds.size} selected</span>
            <div style={{display:'flex', gap:'8px', marginLeft:'auto', flexWrap:'wrap'}}>
              <button onClick={bulkMarkVacant} style={{padding:'7px 14px', fontSize:'13px', fontWeight:600, background:D.warningSoft, color:D.warning, border:`1px solid ${D.warning}`, borderRadius:'7px', cursor:'pointer'}}>Mark Vacant</button>
              <button onClick={bulkChangeType} style={{padding:'7px 14px', fontSize:'13px', fontWeight:600, background:D.blueSoft, color:D.blue, border:`1px solid ${D.blue}`, borderRadius:'7px', cursor:'pointer'}}>Change Type</button>
              <button onClick={bulkDelete} style={{padding:'7px 14px', fontSize:'13px', fontWeight:600, background:D.dangerSoft, color:D.danger, border:`1px solid ${D.danger}`, borderRadius:'7px', cursor:'pointer'}}>Delete Selected</button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            {search || filterGds !== 'all' || filterPcc !== 'all' || filterType !== 'all' ? 'No queues match your filters.' : 'No queues configured yet.'}
          </div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1150px'}}>
              <thead>
                <tr>
                  {isAdmin && (
                    <th style={{padding:'12px 16px', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', width:'40px'}}>
                      <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} style={{width:'16px', height:'16px', cursor:'pointer', accentColor:D.accent}} />
                    </th>
                  )}
                  {['GDS', 'PCC / OID', 'Queue #', 'Queue Name', 'Category', 'Purpose', 'Type', 'Status', 'Actions'].map((h, i) => (
                    <th key={h} style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign: i === 8 ? 'right' : 'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const gdsName = row.gds?.name ?? ''
                  const gdsStyle = GDS_DARK[gdsName] ?? { color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' }
                  const typeStyle = row.queue_type ? TYPE_DARK[row.queue_type] ?? { color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' } : null
                  const statusStyle = row.status ? STATUS_DARK[row.status] ?? { color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' } : null
                  return (
                    <tr key={row.id} style={{borderBottom: i < filtered.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s', background: selectedIds.has(row.id) ? D.accentSoft : 'transparent'}}
                      onMouseEnter={e => { if (!selectedIds.has(row.id)) e.currentTarget.style.background = 'rgba(57,210,192,0.05)' }}
                      onMouseLeave={e => { if (!selectedIds.has(row.id)) e.currentTarget.style.background = 'transparent' }}>
                      {isAdmin && (
                        <td style={{padding:'12px 16px'}}>
                          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} style={{width:'16px', height:'16px', cursor:'pointer', accentColor:D.accent}} />
                        </td>
                      )}
                      <td style={{padding:'12px 16px'}}>
                        <span style={{padding:'3px 10px', borderRadius:'6px', background:gdsStyle.soft, color:gdsStyle.color, fontSize:'12px', fontWeight:700}}>{gdsName}</span>
                      </td>
                      <td style={{padding:'12px 16px'}}>
                        <div style={{fontFamily:'monospace', fontWeight:600, color:D.fg, fontSize:'14px'}}>{row.pcc}</div>
                        {row.pcc_label && <div style={{fontSize:'12px', color:D.fgDim}}>{row.pcc_label}</div>}
                      </td>
                      <td style={{padding:'12px 16px', fontFamily:'monospace', fontWeight:700, color:D.accent, fontSize:'14px'}}>{row.queue_number}{row.sub_category && <span style={{marginLeft:'6px', fontSize:'11px', color:D.warning}}>{row.sub_category}</span>}</td>
                      <td style={{padding:'12px 16px', fontWeight:600, color:D.fg, fontSize:'14px'}}>{row.queue_name}</td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted}}>{row.category ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted, maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{row.purpose ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px'}}>
                        {typeStyle ? <span style={{fontSize:'12px', fontWeight:600, padding:'2px 9px', borderRadius:'20px', background:typeStyle.soft, color:typeStyle.color}}>{row.queue_type}</span> : <span style={{color:D.fgDim}}>—</span>}
                      </td>
                      <td style={{padding:'12px 16px'}}>
                        {statusStyle ? <span style={{fontSize:'12px', fontWeight:600, padding:'2px 9px', borderRadius:'20px', background:statusStyle.soft, color:statusStyle.color}}>{row.status}</span> : <span style={{color:D.fgDim}}>—</span>}
                      </td>
                      <td style={{padding:'12px 16px'}}>
                        {isAdmin && (
                          <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                            <button onClick={() => openEdit(row)}
                              style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                              onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                              Edit
                            </button>
                            <button onClick={() => handleDelete(row)}
                              style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                              onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
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
            <div style={{padding:'12px 16px', borderTop:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', fontSize:'13px', color:D.fgDim}}>
              {filtered.length} of {records.length} queue{records.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Add/Edit Modal — popup overlay */}
        {panelOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setPanelOpen(false) }}>
          <div style={{width:'100%', maxWidth:'720px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${D.accentSoft}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>{editing ? 'Edit Queue' : 'Add Queue'}</h2>
              <button onClick={() => setPanelOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>GDS</label>
                <select value={form.gds_id} onChange={e => setForm(f => ({...f, gds_id: e.target.value ? Number(e.target.value) : ''}))} style={inpDark({cursor:'pointer'})}>
                  <option value="">- Select -</option>
                  {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lblDark}>PCC / OID</label>
                <input type="text" value={form.pcc} onChange={e => setForm(f => ({...f, pcc: e.target.value}))} placeholder="e.g. XW7J" style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
              </div>
              <div>
                <label style={lblDark}>Queue Number</label>
                <input type="text" value={form.queue_number} onChange={e => setForm(f => ({...f, queue_number: e.target.value}))} placeholder="e.g. 0, 31, C1" style={{...inpDark(), fontFamily:'monospace'}} />
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>Queue Name</label>
                <input type="text" value={form.queue_name} onChange={e => setForm(f => ({...f, queue_name: e.target.value}))} placeholder="e.g. URGENT" style={inpDark()} />
              </div>
              <div>
                <label style={lblDark}>Category / PIC</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} placeholder="e.g. PIC 200" style={inpDark()} />
              </div>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>Type</label>
                <select value={form.queue_type} onChange={e => setForm(f => ({...f, queue_type: e.target.value}))} style={inpDark({cursor:'pointer'})}>
                  <option value="">Not specified</option>
                  {QUEUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={lblDark}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} style={inpDark({cursor:'pointer'})}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Purpose / Description</label>
              <textarea value={form.purpose} onChange={e => setForm(f => ({...f, purpose: e.target.value}))} rows={2} style={{...inpDark(), resize:'vertical' as const}} />
            </div>
            {error && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{error}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button onClick={() => setPanelOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:saving?0.6:1}}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
