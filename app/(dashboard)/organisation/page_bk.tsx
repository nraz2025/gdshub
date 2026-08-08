'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import type { Organisation, PCCList, GDS } from '@/types'

const EMPTY = { organisation: '', iata: '' }

interface ImportRow {
  organisation: string; iata: string
  _row: number; _errors: string[]
}

interface OrgContract {
  id: number
  organisation_id: number
  year: number
  label: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

const GDS_COLORS: Record<string, string> = {
  Amadeus:    'bg-purple-50 text-purple-700 border-purple-200',
  Sabre:      'bg-sky-50 text-sky-700 border-sky-200',
  Travelport: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

// Design tokens
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



export default function OrganisationPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<Organisation[]>([])
  const [pccList, setPccList] = useState<PCCList[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pccOpen, setPccOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<Organisation | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  // Contracts tab state
  const [modalTab, setModalTab] = useState<'details' | 'contracts'>('details')
  const [contracts, setContracts] = useState<OrgContract[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear())
  const [uploadLabel, setUploadLabel] = useState('Main Contract')
  const [uploading, setUploading] = useState(false)
  const [contractError, setContractError] = useState('')
  const contractFileInputRef = useRef<HTMLInputElement>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const [{ data: orgData }, { data: pccData }] = await Promise.all([
      supabase.from('organisation').select('*').order('organisation'),
      supabase.from('pcc_list').select('id, pcc, org_id, status, gds:gds_id(id, name), organisation:org_id(id, organisation)').order('pcc'),
    ])
    setRecords(orgData ?? [])
    setPccList(pccData ?? [])
    setLoading(false)
  }

  const linkedPCCs = (orgId: number) => pccList.filter(p => {
    const rawId    = (p as {org_id?: number | null}).org_id
    const joinedId = (p as {organisation?: {id?: number} | null}).organisation?.id
    return rawId === orgId || joinedId === orgId
  })

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    return r.organisation.toLowerCase().includes(term) || (r.iata ?? '').toLowerCase().includes(term)
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalTab('details'); setContracts([]); setModalOpen(true) }
  function openEdit(row: Organisation) { setEditing(row); setForm({ organisation: row.organisation, iata: row.iata ?? '' }); setError(''); setSaving(false); setModalTab('details'); setModalOpen(true); fetchContracts(row.id) }
  function openDelete(row: Organisation) { setEditing(row); setDeleteOpen(true) }
  function openPCCs(row: Organisation) { setSelectedOrg(row); setPccOpen(true) }

  async function fetchContracts(orgId: number) {
    setContractsLoading(true)
    const { data } = await supabase.from('org_contracts').select('*').eq('organisation_id', orgId).order('year', { ascending: false }).order('created_at', { ascending: false })
    setContracts((data as OrgContract[]) ?? [])
    setContractsLoading(false)
  }

  async function handleContractUpload(file: File) {
    if (!editing) return
    setContractError('')
    const allowedExt = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowedExt.includes(ext)) { setContractError('Only PDF, Word (doc/docx) or images (jpg/png) are allowed.'); return }
    if (file.size > 20 * 1024 * 1024) { setContractError('File must be under 20MB.'); return }

    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${editing.id}/${uploadYear}/${Date.now()}_${safeName}`
    const { error: uploadErr } = await supabase.storage.from('org-contracts').upload(path, file)
    if (uploadErr) { setContractError(uploadErr.message); setUploading(false); return }

    const { error: insertErr } = await supabase.from('org_contracts').insert({
      organisation_id: editing.id,
      year: uploadYear,
      label: uploadLabel.trim() || 'Contract',
      file_name: file.name,
      file_path: path,
      file_size: file.size,
    })
    if (insertErr) { setContractError(insertErr.message); setUploading(false); return }

    setUploadLabel('Main Contract')
    setUploading(false)
    fetchContracts(editing.id)
  }

  async function handleContractDownload(c: OrgContract) {
    const { data } = await supabase.storage.from('org-contracts').createSignedUrl(c.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleContractDelete(c: OrgContract) {
    if (!editing) return
    await supabase.storage.from('org-contracts').remove([c.file_path])
    await supabase.from('org_contracts').delete().eq('id', c.id)
    fetchContracts(editing.id)
  }

  // Group contracts by year, newest year first
  const contractsByYear = contracts.reduce((acc, c) => {
    (acc[c.year] = acc[c.year] ?? []).push(c)
    return acc
  }, {} as Record<number, OrgContract[]>)
  const contractYears = Object.keys(contractsByYear).map(Number).sort((a, b) => b - a)

  async function handleSave() {
    setSaving(true); setError('')
    if (!form.organisation.trim()) { setError('Organisation name is required.'); setSaving(false); return }
    const payload = { organisation: form.organisation.trim(), iata: form.iata.trim() || null }
    const { error: e } = editing
      ? await supabase.from('organisation').update(payload).eq('id', editing.id)
      : await supabase.from('organisation').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('organisation').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => ({ 'No.': i + 1, 'Organisation': r.organisation, 'IATA': r.iata ?? '', 'Linked PCCs': linkedPCCs(r.id).length, 'Created': new Date(r.created_at).toLocaleDateString('en-MY') }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Organisations')
    XLSX.writeFile(wb, 'GDSHub_Organisations.xlsx')
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['Organisation', 'IATA'], ['PST Travel Services', '12345678']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'Organisation_Import_Template.xlsx')
  }

  function getF(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
      if (v !== undefined && v !== null) return String(v).trim()
    }
    return ''
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const rows: ImportRow[] = raw.map((r, i) => {
        const organisation = getF(r, 'Organisation', 'organisation', 'name')
        const iata = getF(r, 'IATA', 'iata', 'iata_code').toUpperCase()
        const errors: string[] = []
        if (!organisation) errors.push('Organisation name is required')
        if (iata && !/^\d{7,8}$/.test(iata)) errors.push('IATA must be 7-8 digits')
        return { organisation, iata, _row: i + 2, _errors: errors }
      })
      setImportRows(rows); setImportResult(null); setImportOpen(true)
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function handleImportConfirm() {
    setImporting(true)
    let success = 0, failed = 0
    const failedRows: string[] = []
    for (const row of importRows.filter(r => r._errors.length === 0)) {
      const { error } = await supabase.from('organisation').insert({ organisation: row.organisation, iata: row.iata || null })
      if (error) { failed++; failedRows.push(`${row.organisation} - ${error.message}`) } else { success++ }
    }
    setImportResult({ success, failed, failedRows }); setImporting(false); fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)
  const selectedPCCs = selectedOrg ? linkedPCCs(selectedOrg.id) : []


  return (
    <div style={{fontFamily:"'Hanken Grotesk', Inter, system-ui, sans-serif", background:T.surface, minHeight:'100vh', padding:'0'}}>

      {/* ── Page Header ── */}
      <div style={{background:T.card, borderBottom:`1px solid ${T.border}`, padding:'20px 28px', marginBottom:'24px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'30px', fontWeight:700, color:'#1e293b', margin:0, letterSpacing:'-0.02em'}}>Organisation</h1>
            
          </div>
          {isAdmin && (
            <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
              <button onClick={handleExport} disabled={filtered.length === 0}
                style={{display:'flex', alignItems:'center', gap:'8px', padding:'10px 20px', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'18px', fontWeight:500, color:'#1e293b', cursor:'pointer', opacity:filtered.length===0?0.4:1, transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export xlsx
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:'8px', padding:'10px 20px', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'18px', fontWeight:500, color:'#1e293b', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import xlsx
              </button>
              <button onClick={openAdd}
                style={{display:'flex', alignItems:'center', gap:'8px', padding:'10px 20px', background:'linear-gradient(135deg, #1a5f3c 0%, #2d8a5e 100%)', border:'none', borderRadius:'8px', fontSize:'18px', fontWeight:500, color:'white', cursor:'pointer', boxShadow:'0 4px 14px 0 rgba(26, 95, 60, 0.3)', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px 0 rgba(26, 95, 60, 0.4)' }}
                onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px 0 rgba(26, 95, 60, 0.3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Organisation
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{padding:'0 28px 28px'}}>


                {/* ── Organisation Card Grid ── */}
        {loading ? (
          <div style={{padding:'60px', textAlign:'center', color:'#94a3b8', fontSize:'14px'}}>Loading...</div>
        ) : paginated.length === 0 ? (
          <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'60px', textAlign:'center', color:'#94a3b8', fontSize:'14px'}}>
            {search ? `No organisations match "${search}"` : 'No organisations yet.'}
          </div>
        ) : (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(500px, 1fr))', gap:'24px'}}>
            {paginated.map((row) => {
              const pccCount = linkedPCCs(row.id).length
              const avatarPalette = [
                { bg: '#9333ea' }, // purple
                { bg: '#ec4899' }, // pink
                { bg: '#8b5cf6' }, // violet
                { bg: '#6366f1' }, // indigo
                { bg: '#f43f5e' }, // rose
              ]
              const avatarColor = avatarPalette[row.organisation.charCodeAt(0) % avatarPalette.length].bg
              return (
                <div key={row.id}
                  style={{position:'relative', overflow:'hidden', background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'16px', padding:'24px', boxShadow:'0 1px 2px 0 rgb(0 0 0 / 0.05)', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'; e.currentTarget.style.borderColor='transparent' }}
                  onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 1px 2px 0 rgb(0 0 0 / 0.05)'; e.currentTarget.style.borderColor='#e2e8f0' }}>
                  {/* Colored left-edge stripe */}
                  <div style={{position:'absolute', top:0, left:0, width:'4px', height:'100%', background:'#1a5f3c'}} />

                  {/* Header — avatar + name */}
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'14px'}}>
                      <div style={{width:'40px', height:'40px', borderRadius:'50%', background:avatarColor, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                        <span style={{fontSize:'14px', fontWeight:700, color:'white'}}>{row.organisation.charAt(0).toUpperCase()}</span>
                      </div>
                      <h3 style={{fontSize:'24px', fontWeight:700, color:'#1e293b', margin:0}}>{row.organisation}</h3>
                    </div>
                  </div>

                  {/* Meta rows */}
                  <div style={{display:'flex', flexDirection:'column', gap:'12px', marginBottom:'24px'}}>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      <span style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'16px', fontWeight:500}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.7.7c-.4.4-.3 1 .2 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 2.7 3.4c.3.5 1 .6 1.3.2l.7-.7c.4-.3.6-.8.5-1.3z"/></svg>
                        IATA
                      </span>
                      {row.iata
                        ? <span style={{fontSize:'16px', fontWeight:600, color:'#1e293b', background:'#f8fafc', padding:'6px 12px', borderRadius:'8px', border:'1px solid #e2e8f0', fontFamily:'monospace', letterSpacing:'0.05em'}}>{row.iata}</span>
                        : <span style={{color:'#cbd5e1', fontSize:'16px'}}>-</span>}
                    </div>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      <span style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'16px', fontWeight:500}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        Linked PCCs
                      </span>
                      {pccCount > 0
                        ? <button onClick={() => openPCCs(row)}
                            style={{display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'9999px', fontSize:'16px', fontWeight:600, color:'#166534', background:'#dcfce7', border:'1px solid #bbf7d0', cursor:'pointer', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                            onMouseOver={e => { e.currentTarget.style.background='#bbf7d0'; e.currentTarget.style.borderColor='#86efac' }}
                            onMouseOut={e => { e.currentTarget.style.background='#dcfce7'; e.currentTarget.style.borderColor='#bbf7d0' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            {pccCount} PCC{pccCount !== 1 ? 's' : ''}
                          </button>
                        : <span style={{fontSize:'13px', color:'#94a3b8'}}>None</span>}
                    </div>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      <span style={{display:'flex', alignItems:'center', gap:'8px', color:'#64748b', fontSize:'16px', fontWeight:500}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Created
                      </span>
                      <span style={{fontSize:'16px', color:'#64748b', fontWeight:500}}>{new Date(row.created_at).toLocaleDateString('en-GB')}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div style={{display:'flex', gap:'10px'}}>
                      <button onClick={() => openEdit(row)}
                        style={{flex:1, padding:'10px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'#ffffff', color:'#64748b', fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#94a3b8'; e.currentTarget.style.color='#1e293b' }}
                        onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.color='#64748b' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                      <button onClick={() => openDelete(row)}
                        style={{flex:1, padding:'10px', borderRadius:'8px', border:'1px solid #fecaca', background:'#ffffff', color:'#dc2626', fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e => { e.currentTarget.style.background='#fef2f2'; e.currentTarget.style.borderColor='#dc2626' }}
                        onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.borderColor='#fecaca' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'14px', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius}}>
            <span style={{fontSize:'17px', color:'#065F46', fontWeight:600}}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div style={{display:'flex', gap:'4px'}}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                style={{padding:'5px 12px', fontSize:'12px', fontWeight:600, border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer', opacity:currentPage===1?0.35:1}}>
                Previous
              </button>
              {Array.from({length: totalPages}, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setCurrentPage(p)}
                  style={{padding:'5px 10px', fontSize:'12px', fontWeight:700, border:`1px solid ${p===currentPage ? T.primary : T.border}`, borderRadius:T.radius, background: p===currentPage ? T.primary : 'white', color: p===currentPage ? 'white' : T.textMid, cursor:'pointer'}}>
                  {p}
                </button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{padding:'5px 12px', fontSize:'12px', fontWeight:600, border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer', opacity:currentPage===totalPages?0.35:1}}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Organisation' : 'Add Organisation'} size="md">
        <div className="space-y-4">
          {/* Tabs — Contracts tab only shown when editing an existing organisation */}
          {editing && (
            <div style={{display:'flex', gap:'4px', borderBottom:'1px solid #e2e8f0', marginBottom:'4px'}}>
              {(['details', 'contracts'] as const).map(tab => (
                <button key={tab} onClick={() => setModalTab(tab)}
                  style={{
                    padding:'8px 16px', fontSize:'13px', fontWeight:600, cursor:'pointer',
                    border:'none', background:'none',
                    color: modalTab === tab ? '#1a5f3c' : '#94a3b8',
                    borderBottom: modalTab === tab ? '2px solid #1a5f3c' : '2px solid transparent',
                    marginBottom:'-1px',
                  }}>
                  {tab === 'details' ? 'Details' : `Contracts${contracts.length ? ` (${contracts.length})` : ''}`}
                </button>
              ))}
            </div>
          )}

          {modalTab === 'details' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Organisation Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.organisation} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} placeholder="e.g. PST Travel Services Sdn Bhd" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">IATA Code</label>
                <input type="text" value={form.iata} onChange={e => setForm(f => ({ ...f, iata: e.target.value.toUpperCase() }))} placeholder="e.g. 12345678" maxLength={20} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
                <p className="text-xs text-slate-400 mt-1">Optional - 8-digit IATA accreditation number</p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Organisation'}</button>
              </div>
            </>
          )}

          {modalTab === 'contracts' && editing && (
            <div className="space-y-4">
              {/* Upload row */}
              <div style={{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px'}}>
                <p style={{fontSize:'12px', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'10px'}}>Upload New Contract</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Year</label>
                    <input type="number" value={uploadYear} onChange={e => setUploadYear(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                    <input type="text" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="e.g. Main Contract, Addendum 1"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                  </div>
                </div>
                <input ref={contractFileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleContractUpload(f); e.target.value = '' }} />
                <button onClick={() => contractFileInputRef.current?.click()} disabled={uploading}
                  style={{display:'flex', alignItems:'center', gap:'8px', padding:'8px 16px', background:'#1a5f3c', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:600, color:'white', cursor:'pointer', opacity: uploading ? 0.6 : 1}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {uploading ? 'Uploading...' : 'Choose File & Upload'}
                </button>
                <p className="text-xs text-slate-400 mt-2">PDF, Word (.doc/.docx) or images (.jpg/.png), max 20MB. You can add multiple files to the same year — e.g. a main contract plus an addendum.</p>
                {contractError && <p className="text-sm text-red-500 mt-2">{contractError}</p>}
              </div>

              {/* List grouped by year */}
              {contractsLoading ? (
                <p className="text-sm text-slate-400 text-center py-4">Loading contracts...</p>
              ) : contractYears.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No contracts uploaded yet.</p>
              ) : (
                <div className="space-y-3">
                  {contractYears.map(year => (
                    <div key={year} style={{border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden'}}>
                      <div style={{background:'#f0fdf4', padding:'8px 14px', borderBottom:'1px solid #bbf7d0'}}>
                        <span style={{fontSize:'13px', fontWeight:700, color:'#1a5f3c'}}>{year}</span>
                        <span style={{fontSize:'12px', color:'#64748b', marginLeft:'8px'}}>{contractsByYear[year].length} file{contractsByYear[year].length !== 1 ? 's' : ''}</span>
                      </div>
                      <div>
                        {contractsByYear[year].map((c, i) => (
                          <div key={c.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom: i < contractsByYear[year].length - 1 ? '1px solid #f1f5f9' : 'none'}}>
                            <div style={{display:'flex', alignItems:'center', gap:'10px', minWidth:0}}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:'13px', fontWeight:600, color:'#1e293b'}}>{c.label}</div>
                                <div style={{fontSize:'11px', color:'#94a3b8', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.file_name}</div>
                              </div>
                            </div>
                            <div style={{display:'flex', gap:'6px', flexShrink:0}}>
                              <button onClick={() => handleContractDownload(c)}
                                style={{padding:'4px 10px', fontSize:'12px', fontWeight:500, color:'#1a5f3c', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'6px', cursor:'pointer'}}>
                                View
                              </button>
                              {isAdmin && (
                                <button onClick={() => handleContractDelete(c)}
                                  style={{padding:'4px 10px', fontSize:'12px', fontWeight:500, color:'#ef4444', background:'#fff', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer'}}>
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Close</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Organisation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete <strong>{editing?.organisation}</strong>? PCC links will be unset but PCCs themselves will not be deleted.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Linked PCCs Modal ── */}
      <Modal open={pccOpen} onClose={() => setPccOpen(false)} title={`PCCs - ${selectedOrg?.organisation}`} size="md">
        <div className="space-y-3">
          {selectedPCCs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No PCCs linked to this organisation.</p>
          ) : (
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'17px'}}>PCC Code</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'17px'}}>GDS</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-500" style={{fontSize:'17px'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPCCs.map((pcc, i) => {
                    const gdsName = (pcc.gds as GDS)?.name ?? ''
                    return (
                      <tr key={pcc.id} className={i < selectedPCCs.length - 1 ? 'border-b border-slate-50' : ''}>
                        <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5" style={{fontSize:'17px', borderRadius:'6px', display:'inline-block', width:'110px', textAlign:'center'}}>{pcc.pcc}</span></td>
                        <td className="px-4 py-2.5">{gdsName && <span className={`font-medium px-2.5 py-1 border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`} style={{fontSize:'17px', borderRadius:'6px', display:'inline-block', width:'110px', textAlign:'center'}}>{gdsName}</span>}</td>
                        <td className="px-4 py-2.5"><span className="text-slate-500" style={{fontSize:'17px'}}>{pcc.status}</span></td>
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

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Organisations" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-semibold">Imported {importResult.success} organisation{importResult.success !== 1 ? 's' : ''} successfully.</p>
                : <div className="space-y-1"><p className="font-semibold">{importResult.success} imported, {importResult.failed} skipped</p>
                    {importResult.failedRows.map((r, i) => <p key={i} className="text-xs opacity-70 font-mono">{r}</p>)}</div>}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">File: <span className="font-medium">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows - <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p>
                </div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-4 py-3 text-xs text-slate-500">
                Required: <span className="font-mono font-medium text-slate-700">Organisation</span> | Optional: <span className="font-mono font-medium text-slate-700">IATA</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Organisation','IATA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-medium">{row.organisation || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2 font-mono">{row.iata || '-'}</td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-semibold">OK</span> : <span className="text-red-500">{row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold disabled:opacity-50">{importing ? 'Importing...' : `Import ${validRows.length} Organisation${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
