'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

interface Attachment {
  id: number
  file_name: string
  file_path: string
  file_size: number | null
}

interface WebServiceRow {
  id: number
  pcc: string
  company_name: string | null
  agent_id: string
  password: string
  notes: string | null
  source: string | null
  web_service_attachments?: Attachment[]
  created_at: string
}

interface ImportRow {
  pcc: string
  company_name: string
  agent_id: string
  password: string
  notes: string
  source: string
  valid: boolean
  error?: string
}

const EMPTY = { pcc: '', company_name: '', agent_id: '', password: '', notes: '', source: '' }

const GDS_NAME = 'Sabre'

// Dark theme (accent matches Sabre's color elsewhere in the app)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#f78166', accentSoft: 'rgba(247,129,102,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
}

// Generates a password in the "WS" + 6-digit format seen in your real existing data
function generateWsPassword() {
  const digits = Math.floor(100000 + Math.random() * 900000)
  return `WS${digits}`
}

// Attachment upload settings — shared bucket used by all 3 GDS Web Service pages
const ATTACH_BUCKET = 'web-service-attachments'
const ATTACH_ACCEPT = '.eml,.msg,.png,.jpg,.jpeg,.pdf,.xlsx,.csv,.doc,.docx'
const ATTACH_ALLOWED_EXT = ['eml', 'msg', 'png', 'jpg', 'jpeg', 'pdf', 'xlsx', 'csv', 'doc', 'docx']
const ATTACH_MAX_SIZE = 20 * 1024 * 1024

// Custom autocomplete — native <datalist> popups can't be styled, so this is a real component
function AutocompleteInput({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = value ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())) : options

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: `1.5px solid ${D.borderLight}`, borderRadius: '8px', background: D.bg, color: D.fg, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', textTransform: 'uppercase' }} />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto', background: D.card, border: `1.5px solid ${D.fg}`, borderRadius: '8px', boxShadow: '0 12px 28px rgba(0,0,0,0.4)', zIndex: 60, padding: '4px' }}>
          {filtered.slice(0, 50).map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false) }}
              style={{ padding: '8px 10px', fontSize: '14px', fontFamily: 'monospace', color: D.fg, cursor: 'pointer', borderRadius: '6px' }}
              onMouseOver={e => (e.currentTarget.style.background = D.accentSoft)}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WebServiceSabrePage() {
  const supabase = createClient()
  const [records, setRecords] = useState<WebServiceRow[]>([])
  const [pccOptions, setPccOptions] = useState<string[]>([])
  const [gdsId, setGdsId] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WebServiceRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())

  // Attachment (Add/Edit modal) — supports multiple files per record
  const attachInputRef = useRef<HTMLInputElement>(null)
  const [newAttachFiles, setNewAttachFiles] = useState<File[]>([])
  const [attachError, setAttachError] = useState('')
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [filterPcc, setFilterPcc] = useState('all')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setModalOpen(false) }
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
    const { data: gds } = await supabase.from('gds').select('id').eq('name', GDS_NAME).maybeSingle()
    const thisGdsId = gds?.id ?? null
    setGdsId(thisGdsId)
    const [{ data: ws }, { data: pcc }] = await Promise.all([
      thisGdsId
        ? supabase.from('web_service').select('*, web_service_attachments(id, file_name, file_path, file_size)').eq('gds_id', thisGdsId).order('pcc').order('company_name')
        : Promise.resolve({ data: [] as WebServiceRow[] }),
      thisGdsId
        ? supabase.from('pcc_list').select('pcc').eq('gds_id', thisGdsId)
        : Promise.resolve({ data: [] as { pcc: string }[] }),
    ])
    setRecords(ws ?? [])
    setPccOptions(Array.from(new Set((pcc ?? []).map(p => p.pcc))).sort())
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm({ ...EMPTY, password: generateWsPassword() }); setError(''); resetAttachmentState(); setModalOpen(true) }
  function openEdit(row: WebServiceRow) {
    setEditing(row)
    setForm({ pcc: row.pcc, company_name: row.company_name ?? '', agent_id: row.agent_id, password: row.password, notes: row.notes ?? '', source: row.source ?? '' })
    setError(''); resetAttachmentState(); setModalOpen(true)
  }

  function resetAttachmentState() { setNewAttachFiles([]); setAttachError(''); setRemoveAttachmentIds(new Set()) }

  function handlePickAttachments(files: FileList) {
    setAttachError('')
    const picked: File[] = []
    for (const f of Array.from(files)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ATTACH_ALLOWED_EXT.includes(ext)) { setAttachError('Only .eml, .msg, .png, .jpg, .pdf, .xlsx, .csv, .doc/.docx files are allowed.'); continue }
      if (f.size > ATTACH_MAX_SIZE) { setAttachError('Each file must be under 20MB.'); continue }
      picked.push(f)
    }
    if (picked.length) setNewAttachFiles(prev => [...prev, ...picked])
  }

  function removeNewAttachment(index: number) {
    setNewAttachFiles(prev => prev.filter((_, i) => i !== index))
  }

  function toggleRemoveExistingAttachment(id: number) {
    setRemoveAttachmentIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSave() {
    if (!form.pcc.trim()) { setError('PCC / OID is required.'); return }
    if (!form.agent_id.trim()) { setError('Agent ID / Web Service number is required.'); return }
    if (!form.password.trim()) { setError('Password is required.'); return }
    if (!gdsId) { setError(`Could not find the ${GDS_NAME} GDS record.`); return }
    setSaving(true); setError('')

    const payload = {
      gds_id: gdsId,
      pcc: form.pcc.trim().toUpperCase(), company_name: form.company_name.trim() || null,
      agent_id: form.agent_id.trim(), password: form.password.trim(),
      notes: form.notes.trim() || null, source: form.source.trim() || null,
    }
    let webServiceId = editing?.id ?? null
    if (editing) {
      const { error: e } = await supabase.from('web_service').update(payload).eq('id', editing.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { data: inserted, error: e } = await supabase.from('web_service').insert(payload).select('id').single()
      if (e) { setError(e.message); setSaving(false); return }
      webServiceId = inserted?.id ?? null
    }

    // Attachments: remove any the person marked for removal, then upload any newly-picked files.
    if (removeAttachmentIds.size > 0 && editing?.web_service_attachments) {
      const toRemove = editing.web_service_attachments.filter(a => removeAttachmentIds.has(a.id))
      if (toRemove.length) {
        await supabase.storage.from(ATTACH_BUCKET).remove(toRemove.map(a => a.file_path))
        await supabase.from('web_service_attachments').delete().in('id', toRemove.map(a => a.id))
      }
    }
    if (newAttachFiles.length > 0 && webServiceId) {
      const safePcc = form.pcc.trim().toUpperCase().replace(/[^a-zA-Z0-9-_]/g, '_')
      for (const f of newAttachFiles) {
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${GDS_NAME.toLowerCase()}/${safePcc}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage.from(ATTACH_BUCKET).upload(path, f)
        if (uploadErr) { setError(`Attachment upload failed: ${uploadErr.message}`); setSaving(false); fetchAll(); return }
        await supabase.from('web_service_attachments').insert({ web_service_id: webServiceId, file_name: f.name, file_path: path, file_size: f.size })
      }
    }

    setSaving(false); setModalOpen(false); resetAttachmentState(); fetchAll()
  }

  async function handleAttachmentDownload(att: Attachment) {
    const { data } = await supabase.storage.from(ATTACH_BUCKET).createSignedUrl(att.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(row: WebServiceRow) {
    if (!confirm(`Delete web service for PCC ${row.pcc} (Agent ID ${row.agent_id})? This cannot be undone.`)) return
    await supabase.from('web_service').delete().eq('id', row.id)
    const paths = (row.web_service_attachments ?? []).map(a => a.file_path)
    if (paths.length) await supabase.storage.from(ATTACH_BUCKET).remove(paths)
    fetchAll()
  }

  function toggleReveal(id: number) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleExport() {
    const data = filtered.map(r => ({
      'PCC / OID': r.pcc,
      'Company': r.company_name ?? '',
      'Agent ID / WS': r.agent_id,
      'Password': r.password,
      'Notes': r.notes ?? '',
      'Source': r.source ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${GDS_NAME} Web Service`)
    XLSX.writeFile(wb, `GDSHub_${GDS_NAME}_Web_Service_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'PCC / OID': 'B7Y8', 'Company': 'Forecepts New System', 'Agent ID / WS': '935028', 'Password': 'WS258022', 'Notes': '', 'Source': 'Automation Hub' },
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${GDS_NAME} Web Service`)
    XLSX.writeFile(wb, `GDSHub_${GDS_NAME}_Web_Service_Template.xlsx`)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name); setImportResult(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const parsed: ImportRow[] = raw.map(r => {
        const pcc = String(r['PCC / OID'] ?? r['pcc'] ?? '').trim().toUpperCase()
        const agent_id = String(r['Agent ID / WS'] ?? r['agent_id'] ?? '').trim()
        const password = String(r['Password'] ?? r['password'] ?? '').trim()
        const company_name = String(r['Company'] ?? r['company_name'] ?? '').trim()
        const notes = String(r['Notes'] ?? r['notes'] ?? '').trim()
        const source = String(r['Source'] ?? r['source'] ?? '').trim()
        let error: string | undefined
        if (!pcc) error = 'Missing PCC / OID'
        else if (!agent_id) error = 'Missing Agent ID / WS'
        else if (!password) error = 'Missing Password'
        return { pcc, company_name, agent_id, password, notes, source, valid: !error, error }
      })
      setImportRows(parsed); setImportOpen(true)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function handleImportConfirm() {
    if (!gdsId) { return }
    setImporting(true)
    const validRows = importRows.filter(r => r.valid)
    let success = 0, failed = 0
    for (const r of validRows) {
      const { error: e } = await supabase.from('web_service').insert({
        gds_id: gdsId, pcc: r.pcc, company_name: r.company_name || null,
        agent_id: r.agent_id, password: r.password, notes: r.notes || null, source: r.source || null,
      })
      if (e) failed++; else success++
    }
    setImporting(false); setImportResult({ success, failed })
    fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const filtered = records.filter(r => {
    const matchPcc = filterPcc === 'all' || r.pcc === filterPcc
    const term = search.toLowerCase()
    const matchSearch = !term || r.pcc.toLowerCase().includes(term) || r.agent_id.toLowerCase().includes(term) || (r.company_name ?? '').toLowerCase().includes(term)
    return matchPcc && matchSearch
  })

  const inpDark = (extra?: object) => ({ padding:'9px 12px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lblDark = { fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>{GDS_NAME} Web Service List</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Web service credentials by PCC / OID — {GDS_NAME}</p>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
            <button onClick={handleExport} disabled={filtered.length === 0}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 15px', background:'transparent', border:`1px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor: filtered.length === 0 ? 'default' : 'pointer', opacity: filtered.length === 0 ? 0.5 : 1}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} style={{display:'none'}} />
                <button onClick={() => fileInputRef.current?.click()}
                  style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 15px', background:'transparent', border:`1px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import
                </button>
                <button onClick={openAdd}
                  style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Web Service
                </button>
              </>
            )}
          </div>
        </div>


        {/* Filters */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px', flexWrap:'wrap'}}>
          <div style={{position:'relative', flex:'1 1 240px'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search PCC, Agent ID, or company..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box'}} />
          </div>
          <select value={filterPcc} onChange={e => setFilterPcc(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'140px'}}>
            <option value="all">All PCC / OID</option>
            {Array.from(new Set(records.map(r => r.pcc))).sort().map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            {search || filterPcc !== 'all' ? 'No web services match your filters.' : 'No web services configured yet.'}
          </div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'auto', maxHeight:'75vh'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:'900px'}}>
              <thead>
                <tr>
                  {['PCC / OID', 'Company', 'Agent ID / WS', 'Password', 'Notes', 'Attachment', 'Actions'].map((h, i, arr) => (
                    <th key={h} style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign: i === arr.length - 1 ? 'right' : 'left', borderBottom:`1px solid ${D.border}`, background:D.card, whiteSpace:'nowrap', position:'sticky', top:0, zIndex:2}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const revealed = revealedIds.has(row.id)
                  return (
                    <tr key={row.id} style={{borderBottom: i < filtered.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                      onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{padding:'12px 16px', fontFamily:'monospace', fontWeight:600, color:D.fg, fontSize:'14px'}}>{row.pcc}</td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted}}>{row.company_name ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px', fontFamily:'monospace', fontSize:'13px', color:D.fgMuted}}>{row.agent_id}</td>
                      <td style={{padding:'12px 16px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <span style={{fontFamily:'monospace', fontSize:'13px', color:D.accent, fontWeight:600}}>
                            {revealed ? row.password : '•'.repeat(Math.min(row.password.length, 10))}
                          </span>
                          <button onClick={() => toggleReveal(row.id)}
                            style={{background:'none', border:'none', color:D.fgDim, cursor:'pointer', padding:'2px', display:'flex'}}
                            title={revealed ? 'Hide' : 'Show'}>
                            {revealed ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted, whiteSpace:'pre-wrap', maxWidth:'220px'}}>{row.notes ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px'}}>
                        {row.web_service_attachments && row.web_service_attachments.length > 0 ? (
                          <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                            {row.web_service_attachments.map(att => (
                              <button key={att.id} onClick={() => handleAttachmentDownload(att)} title={att.file_name}
                                style={{display:'flex', alignItems:'center', gap:'6px', background:'none', border:'none', color:D.accent, cursor:'pointer', padding:0, fontSize:'13px', fontWeight:600, maxWidth:'160px'}}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{att.file_name}</span>
                              </button>
                            ))}
                          </div>
                        ) : <span style={{color:D.fgDim}}>—</span>}
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
              {filtered.length} of {records.length} web service{records.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div style={{width:'100%', maxWidth:'560px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${D.accentSoft}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>{editing ? 'Edit Web Service' : 'Add Web Service'}</h2>
              <button onClick={() => setModalOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>PCC / OID <span style={{color:D.danger}}>*</span></label>
              <AutocompleteInput value={form.pcc} onChange={v => setForm(f => ({ ...f, pcc: v }))} options={pccOptions} placeholder="e.g. B7Y8" />
              <p style={{fontSize:'11px', color:D.fgDim, marginTop:'4px'}}>Sourced from {GDS_NAME}'s GDS Access Record — type to search existing PCCs</p>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Company Name</label>
              <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. Forecepts New System" style={inpDark()} />
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>Agent ID / Web Service <span style={{color:D.danger}}>*</span></label>
                <input type="text" value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} placeholder="e.g. 935028" style={{...inpDark(), fontFamily:'monospace'}} />
              </div>
              <div>
                <label style={lblDark}>Source / System</label>
                <input type="text" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Automation Hub" style={inpDark()} />
              </div>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Password <span style={{color:D.danger}}>*</span></label>
              <div style={{display:'flex', gap:'8px'}}>
                <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="e.g. WS258022" style={{...inpDark(), fontFamily:'monospace'}} />
                <button type="button" onClick={() => setForm(f => ({ ...f, password: generateWsPassword() }))}
                  style={{display:'flex', alignItems:'center', gap:'6px', padding:'0 14px', background:D.accentSoft, border:`1px solid ${D.accent}`, borderRadius:'8px', color:D.accent, fontSize:'13px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap'}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  Generate
                </button>
              </div>
              <p style={{fontSize:'11px', color:D.fgDim, marginTop:'4px'}}>Generates in the WS + 6-digit format. Still editable if you need a different one.</p>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={{fontSize:'13px', fontWeight:600, color:D.accent, textTransform:'none' as const, letterSpacing:'normal', marginBottom:'6px', display:'block' as const}}>Attachments (.eml, .msg, .png, .jpg, .pdf, .xlsx, .csv)</label>
              <input ref={attachInputRef} type="file" accept={ATTACH_ACCEPT} multiple style={{display:'none'}}
                onChange={e => { if (e.target.files && e.target.files.length) handlePickAttachments(e.target.files); e.target.value = '' }} />
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <button type="button" onClick={() => attachInputRef.current?.click()}
                  style={{padding:'6px 14px', fontSize:'13px', fontWeight:500, fontFamily:'inherit', border:'1px solid #a8a8a8', borderRadius:'4px', background:'linear-gradient(to bottom, #f8f8f8, #e8e8e8)', color:'#1a1a1a', cursor:'pointer', boxShadow:'0 1px 1px rgba(0,0,0,0.1)'}}
                  onMouseOver={e => { e.currentTarget.style.background='linear-gradient(to bottom, #ffffff, #f0f0f0)' }}
                  onMouseOut={e => { e.currentTarget.style.background='linear-gradient(to bottom, #f8f8f8, #e8e8e8)' }}>
                  Choose Files
                </button>
                <span style={{fontSize:'13px', color:D.fgDim}}>
                  {newAttachFiles.length > 0 ? `${newAttachFiles.length} file${newAttachFiles.length > 1 ? 's' : ''} selected` : 'No file chosen'}
                </span>
              </div>

              {((editing?.web_service_attachments && editing.web_service_attachments.length > 0) || newAttachFiles.length > 0) && (
                <div style={{display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'10px'}}>
                  {editing?.web_service_attachments?.map(att => {
                    const marked = removeAttachmentIds.has(att.id)
                    return (
                      <span key={`existing-${att.id}`} title={att.file_name}
                        style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 6px 5px 10px', fontSize:'12px', border:`1px solid ${D.border}`, borderRadius:'999px', background:D.bg, color: marked ? D.fgDim : D.accent, textDecoration: marked ? 'line-through' : 'none', maxWidth:'220px'}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{att.file_name}</span>
                        <button type="button" onClick={() => toggleRemoveExistingAttachment(att.id)} title={marked ? 'Keep this attachment' : 'Remove this attachment'}
                          style={{background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, fontSize:'13px', lineHeight:1, flexShrink:0}}>
                          {marked ? '↺' : '✕'}
                        </button>
                      </span>
                    )
                  })}
                  {newAttachFiles.map((f, i) => (
                    <span key={`new-${i}`} title={f.name}
                      style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'5px 6px 5px 10px', fontSize:'12px', border:`1px solid ${D.border}`, borderRadius:'999px', background:D.bg, color:D.fg, maxWidth:'220px'}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.name}</span>
                      <button type="button" onClick={() => removeNewAttachment(i)} title="Remove this file"
                        style={{background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, fontSize:'13px', lineHeight:1, flexShrink:0}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {attachError && <p style={{fontSize:'11px', color:D.danger, marginTop:'6px'}}>{attachError}</p>}
              <p style={{fontSize:'11px', color:D.fgDim, marginTop:'6px'}}>Up to 20MB each. You can attach more than one file.</p>
            </div>

            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Type any notes here — as much as you need" rows={4}
                style={inpDark({ resize:'vertical' as const, fontFamily:'inherit', lineHeight:1.5 })} />
            </div>

            {error && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{error}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button onClick={() => setModalOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:saving?0.6:1}}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Web Service'}
              </button>
            </div>
          </div>
          </div>
        )}

        {/* Import Modal */}
        {importOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) closeImport() }}>
            <div style={{width:'100%', maxWidth:'720px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${D.accentSoft}`}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
                <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>Import {GDS_NAME} Web Service</h2>
                <button onClick={closeImport} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
              </div>
              <p style={{fontSize:'12px', color:D.fgDim, marginBottom:'16px'}}>
                {importFileName} — columns expected: PCC / OID, Company, Agent ID / WS, Password, Notes, Source.{' '}
                <button type="button" onClick={handleDownloadTemplate} style={{background:'none', border:'none', color:D.accent, fontSize:'12px', fontWeight:600, cursor:'pointer', padding:0, textDecoration:'underline'}}>Download template</button>
              </p>

              {importResult ? (
                <div style={{padding:'16px', background: importResult.failed > 0 ? D.dangerSoft : D.successSoft, border:`1px solid ${importResult.failed > 0 ? D.danger : D.success}`, borderRadius:'10px', marginBottom:'16px'}}>
                  <p style={{fontSize:'14px', fontWeight:600, color:D.fg, margin:0}}>Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p>
                  {importResult.failed > 0 && <p style={{fontSize:'13px', color:D.danger, marginTop:'6px'}}>{importResult.failed} record{importResult.failed !== 1 ? 's' : ''} failed to save.</p>}
                </div>
              ) : (
                <div style={{border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'auto', maxHeight:'340px', marginBottom:'16px'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                    <thead>
                      <tr>
                        {['PCC / OID', 'Company', 'Agent ID / WS', 'Password', 'Notes', 'Status'].map(h => (
                          <th key={h} style={{padding:'8px 12px', fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:D.fgDim, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:D.bg, position:'sticky', top:0}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} style={{borderBottom:`1px solid ${D.border}`, background: r.valid ? 'transparent' : D.dangerSoft}}>
                          <td style={{padding:'8px 12px', fontFamily:'monospace', color:D.fg}}>{r.pcc || '—'}</td>
                          <td style={{padding:'8px 12px', color:D.fgMuted}}>{r.company_name || '—'}</td>
                          <td style={{padding:'8px 12px', fontFamily:'monospace', color:D.fgMuted}}>{r.agent_id || '—'}</td>
                          <td style={{padding:'8px 12px', fontFamily:'monospace', color:D.fgMuted}}>{r.password || '—'}</td>
                          <td style={{padding:'8px 12px', color:D.fgMuted}}>{r.notes || '—'}</td>
                          <td style={{padding:'8px 12px'}}>
                            {r.valid ? <span style={{color:D.success, fontWeight:600}}>OK</span> : <span style={{color:D.danger, fontWeight:600}}>{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                <button onClick={closeImport} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>
                  {importResult ? 'Close' : 'Cancel'}
                </button>
                {!importResult && (
                  <button onClick={handleImportConfirm} disabled={importing || importRows.filter(r => r.valid).length === 0}
                    style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity: importing || importRows.filter(r => r.valid).length === 0 ? 0.6 : 1}}>
                    {importing ? 'Importing...' : `Import ${importRows.filter(r => r.valid).length} Record${importRows.filter(r => r.valid).length !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
