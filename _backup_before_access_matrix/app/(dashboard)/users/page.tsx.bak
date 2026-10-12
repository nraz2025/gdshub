'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import { useAppContext } from '@/lib/context/AppContext'
import type { User } from '@/types'

const EMPTY: Partial<User> = { first_name: '', last_name: '', email_address: '', ota_client: false, status: 'Active' }

interface ImportRow {
  first_name: string; last_name: string; email_address: string
  ota_client: boolean; status: string; _row: number; _errors: string[]
}

// ── Design tokens ──────────────────────────────────────────
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
  resigned:  {bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5'},
  Resigned:  {bg:'#FEF2F2', color:'#991B1B', border:'#FCA5A5'},
  Vacant:    {bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
}



// Main page dark theme (matches TopNav's Users group = purple)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#a371f7', accentSoft: 'rgba(163,113,247,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  cyan: '#39d2c0', cyanSoft: 'rgba(57,210,192,0.10)',
}



// ── Avatar component ───────────────────────────────────────
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3b82f6, #2563eb)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #ec4899, #db2777)',
  'linear-gradient(135deg, #84cc16, #65a30d)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #f97316, #ea580c)',
]
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const bg = AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length]
  return (
    <div style={{width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
      <span style={{fontSize: size * 0.33, fontWeight:600, color:'white', letterSpacing:'0.02em'}}>{initials}</span>
    </div>
  )
}

export default function UsersPage() {
  const supabase = createClient()
  const { isAdmin, userEmail: currentUserEmail } = useAppContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Active')
  const [filterOta, setFilterOta] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<User>>(EMPTY)
  const [editing, setEditing] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('users').select('*').order('first_name')
    setUsers(data ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setFormError(''); setModalOpen(true) }
  function openEdit(row: User) { setEditing(row); setForm({ first_name: row.first_name, last_name: row.last_name, email_address: row.email_address, ota_client: row.ota_client, status: row.status }); setFormError(''); setModalOpen(true) }
  function openDelete(row: User) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.first_name?.trim()) { setFormError('First name is required.'); return }
    if (!form.last_name?.trim())  { setFormError('Last name is required.'); return }
    if (!form.email_address?.trim()) { setFormError('Email address is required.'); return }
    setSaving(true); setFormError('')
    const payload = { first_name: form.first_name.trim(), last_name: form.last_name.trim(), email_address: form.email_address.trim(), ota_client: form.ota_client ?? false, status: form.status ?? 'Active' }
    if (editing) {
      const { error } = await supabase.from('users').update({ ...payload, modified_by: currentUserEmail }).eq('id', editing.id)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const audit = await getAuditFields()
      const { error } = await supabase.from('users').insert({ ...payload, ...audit })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('users').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((u, i) => ({ 'No.': i + 1, 'First Name': u.first_name, 'Last Name': u.last_name, 'Email Address': u.email_address, 'OTA Client': u.ota_client ? 'Yes' : 'No', 'Status': u.status ?? 'Active', 'Created': new Date(u.created_at).toLocaleDateString('en-MY') }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users')
    XLSX.writeFile(wb, `GDSHub_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{ 'First Name': 'Ahmad', 'Last Name': 'Razali', 'Email Address': 'ahmad@company.com', 'OTA Client': 'Yes', 'Status': 'Active' }])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, 'GDSHub_Users_Template.xlsx')
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name); setImportResult(null)
    const reader = new FileReader()
    reader.onload = evt => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, '')
      function getF(row: Record<string, string>, ...keys: string[]) {
        const rkeys = Object.keys(row)
        for (const k of keys) { const m = rkeys.find(r => norm(r) === norm(k)); if (m) return (row[m] ?? '').toString().trim() }
        return ''
      }
      const parsed: ImportRow[] = raw.map((r, i) => {
        const first_name    = getF(r, 'First Name', 'FirstName', 'firstname', 'first_name', 'fname')
        const last_name     = getF(r, 'Last Name', 'LastName', 'lastname', 'last_name', 'lname', 'surname')
        const email_address = getF(r, 'Email Address', 'Email', 'EmailAddress', 'email_address', 'email').toLowerCase()
        const ota_raw       = getF(r, 'OTA Client', 'OTAClient', 'ota_client', 'OTA').toLowerCase()
        const ota_client    = ota_raw === 'yes' || ota_raw === 'true' || ota_raw === '1'
        const status_raw    = getF(r, 'Status', 'status').toLowerCase()
        const status        = status_raw === 'inactive' ? 'Inactive' : 'Active'
        const errors: string[] = []
        if (!first_name) errors.push('First Name required')
        if (!last_name)  errors.push('Last Name required')
        if (!email_address) errors.push('Email required')
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_address)) errors.push('Invalid email')
        return { first_name, last_name, email_address, ota_client, status, _row: i + 2, _errors: errors }
      })
      setDetectedHeaders(raw.length > 0 ? Object.keys(raw[0]) : [])
      setImportRows(parsed); setImportOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  async function handleImportConfirm() {
    const valid = importRows.filter(r => r._errors.length === 0)
    if (!valid.length) return
    setImporting(true)
    let success = 0, failed = 0; const failedRows: string[] = []
    for (const row of valid) {
      const { error } = await supabase.from('users').insert({ first_name: row.first_name, last_name: row.last_name, email_address: row.email_address, ota_client: row.ota_client, status: row.status })
      if (error) { failed++; failedRows.push(`${row.first_name} ${row.last_name} (${row.email_address})`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const filtered = users.filter(u => {
    const term = search.toLowerCase()
    const matchSearch = `${u.first_name} ${u.last_name}`.toLowerCase().includes(term)
      || u.email_address.toLowerCase().includes(term)
    const matchStatus = filterStatus === 'all' || (u.status ?? 'Active') === filterStatus
    const matchOta = filterOta === 'all' || (filterOta === 'yes' ? u.ota_client : !u.ota_client)
    return matchSearch && matchStatus && matchOta
  })

  const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize)
  const paginated  = pageSize === 0 ? filtered : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const activeCount    = users.filter(u => (u.status ?? 'Active') === 'Active').length
  const inactiveCount  = users.filter(u => u.status === 'Inactive').length
  const otaCount       = users.filter(u => u.ota_client).length

  // ── Label style ──
  const lbl = { display:'block', fontSize:'12px', fontWeight:600, color:T.textMid, marginBottom:'6px' } as const
  const inp = { width:'100%', padding:'8px 12px', fontSize:'13px', border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.text, outline:'none', boxSizing:'border-box' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Users</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>User accounts and access management</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
              <button onClick={handleExport} disabled={filtered.length === 0}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer', opacity:filtered.length===0?0.4:1}}
                onMouseOver={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export xlsx
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer'}}
                onMouseOver={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import xlsx
              </button>
              <button onClick={openAdd}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1.5px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add User
              </button>
            </div>
          )}
        </div>

        {/* Stats — real counts, all from the actual status/ota_client fields */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'22px'}}>
          {[
            { label: 'Total Users', value: users.length, color: D.accent, soft: D.accentSoft, icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></> },
            { label: 'Active', value: activeCount, color: D.success, soft: D.successSoft, icon: <polyline points="20 6 9 17 4 12"/> },
            { label: 'Inactive', value: inactiveCount, color: D.warning, soft: D.warningSoft, icon: <><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></> },
            { label: 'OTA Users', value: otaCount, color: D.cyan, soft: D.cyanSoft, icon: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></> },
          ].map((s, i) => (
            <div key={i} style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px'}}>
              <div style={{width:'36px', height:'36px', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:s.soft, color:s.color}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
              </div>
              <div>
                <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'20px', fontWeight:700, lineHeight:1.1, color:D.fg}}>{s.value}</div>
                <div style={{fontSize:'11px', color:D.fgMuted, marginTop:'2px'}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search & filter */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px', flexWrap:'wrap'}}>
          <div style={{position:'relative', flex:1, minWidth:'240px'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search by name or email..." value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s'}}
              onFocus={e => { e.target.style.borderColor=D.accent; e.target.style.boxShadow=`0 0 0 3px ${D.accentSoft}` }}
              onBlur={e => { e.target.style.borderColor=D.borderLight; e.target.style.boxShadow='none' }} />
          </div>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none'}}>
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          <select value={filterOta} onChange={e => { setFilterOta(e.target.value); setCurrentPage(1) }}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none'}}>
            <option value="all">All OTA</option>
            <option value="yes">OTA: Yes</option>
            <option value="no">OTA: No</option>
          </select>
          {(search || filterStatus !== 'Active' || filterOta !== 'all') && (
            <button onClick={() => { setSearch(''); setFilterStatus('Active'); setFilterOta('all'); setCurrentPage(1) }}
              style={{padding:'8px 14px', background:D.accentSoft, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'13px', color:D.accent, cursor:'pointer', fontWeight:600}}>
              Clear
            </button>
          )}
        </div>

        {/* Top record bar */}
        <div style={{display:'flex', alignItems:'center', marginBottom:'12px', flexWrap:'wrap', gap:'16px'}}>
          <div style={{fontSize:'14px', color:D.fgMuted}}>
            {pageSize === 0
              ? <>Showing <strong style={{color:D.fg}}>all {filtered.length}</strong> users</>
              : <>Showing <strong style={{color:D.fg}}>{Math.min((currentPage-1)*pageSize+1, filtered.length)}-{Math.min(currentPage*pageSize, filtered.length)}</strong> of <strong style={{color:D.fg}}>{filtered.length} users</strong></>}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
            <span style={{fontSize:'13px', color:D.fgMuted}}>Per page:</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
              style={{padding:'6px 12px', fontSize:'13px', border:`1px solid ${D.border}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none'}}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={0}>All</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflowX:'auto'}}>
          <div style={{display:'grid', gridTemplateColumns:'minmax(220px,2.5fr) minmax(120px,1fr) minmax(120px,1fr) minmax(150px,1fr) minmax(170px,170px)', minWidth:'770px', background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
            {['User', 'Status', 'OTA Client', 'Created', 'Actions'].map((h, i) => (
              <div key={h} style={{padding:'12px 18px', fontSize:'14px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', textAlign: i === 4 ? 'right' : 'left'}}>
                {h}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
          ) : paginated.length === 0 ? (
            <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
              {search ? `No users match "${search}"` : 'No users found. Click Add User to get started.'}
            </div>
          ) : (
            paginated.map((u, i) => {
              const fullName = `${u.first_name} ${u.last_name}`
              const status = u.status ?? 'Active'
              const statusStyle = status === 'Active' ? { soft: D.successSoft, color: D.success }
                : { soft: D.warningSoft, color: D.warning }
              return (
                <div key={u.id}
                  style={{display:'grid', gridTemplateColumns:'minmax(220px,2.5fr) minmax(120px,1fr) minmax(120px,1fr) minmax(150px,1fr) minmax(170px,170px)', minWidth:'770px', borderBottom: i < paginated.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                  onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                  <div style={{padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px'}}>
                    <Avatar name={fullName} />
                    <div>
                      <div style={{fontSize:'16px', fontWeight:600, color:D.fg}}>{fullName}</div>
                      <div style={{fontSize:'13px', color:D.fgDim, marginTop:'1px'}}>{u.email_address}</div>
                    </div>
                  </div>

                  <div style={{padding:'14px 18px', display:'flex', alignItems:'center'}}>
                    <span style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:600, padding:'5px 12px', borderRadius:'20px', background:statusStyle.soft, color:statusStyle.color}}>
                      <span style={{width:'6px', height:'6px', borderRadius:'50%', background:statusStyle.color, flexShrink:0}} />
                      {status}
                    </span>
                  </div>

                  <div style={{padding:'14px 18px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'13px', fontWeight:600, padding:'5px 12px', borderRadius:'20px',
                      background: u.ota_client ? D.cyanSoft : 'rgba(139,148,158,0.10)',
                      color: u.ota_client ? D.cyan : D.fgMuted}}>
                      {u.ota_client ? 'Yes' : 'No'}
                    </span>
                  </div>

                  <div style={{padding:'14px 18px', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                    <div style={{fontSize:'14px', color:D.fgMuted}}>{new Date(u.created_at).toLocaleDateString('en-GB')}</div>
                    {u.modified_at && (
                      <div style={{fontSize:'11px', color:D.fgDim, marginTop:'2px'}}>
                        Edited {new Date(u.modified_at).toLocaleDateString('en-GB')}
                      </div>
                    )}
                  </div>

                  <div style={{padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'8px'}}>
                    {isAdmin && (<>
                      <button onClick={() => openEdit(u)}
                        style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                        onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                        onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                        Edit
                      </button>
                      <button onClick={() => openDelete(u)}
                        style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                        onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                        onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                        Delete
                      </button>
                    </>)}
                  </div>
                </div>
              )
            })
          )}

          {pageSize !== 0 && totalPages > 1 && (
            <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', padding:'14px 18px', gap:'4px', borderTop:`1px solid ${D.border}`}}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage===1}
                style={{padding:'0 12px', height:'32px', fontSize:'13px', fontWeight:600, border:'1px solid transparent', borderRadius:'8px', background:'transparent', color:D.fgMuted, cursor:'pointer', opacity:currentPage===1?0.4:1}}>
                Previous
              </button>
              {Array.from({length: Math.min(totalPages, 9)}, (_,i) => i+1).map(p => (
                <button key={p} onClick={() => setCurrentPage(p)}
                  style={{minWidth:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, borderRadius:'8px',
                    border: p===currentPage ? `1px solid ${D.accent}` : '1px solid transparent',
                    background: p===currentPage ? D.accentSoft : 'transparent',
                    color: p===currentPage ? D.accent : D.fgMuted,
                    cursor:'pointer'}}>
                  {p}
                </button>
              ))}
              {totalPages > 9 && <span style={{padding:'0 6px', fontSize:'13px', color:D.fgDim}}>…{totalPages}</span>}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage===totalPages}
                style={{padding:'0 12px', height:'32px', fontSize:'13px', fontWeight:600, border:'1px solid transparent', borderRadius:'8px', background:'transparent', color:D.fgMuted, cursor:'pointer', opacity:currentPage===totalPages?0.4:1}}>
                Next
              </button>
            </div>
          )}
        </div>

      </div>
      {/* ── Add/Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <div className="space-y-4" style={{color:"#1e293b"}}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={lbl}>First Name <span style={{color:T.danger}}>*</span></label>
              <input type="text" value={form.first_name ?? ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="e.g. Ahmad" style={inp} />
            </div>
            <div>
              <label style={lbl}>Last Name <span style={{color:T.danger}}>*</span></label>
              <input type="text" value={form.last_name ?? ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="e.g. Razali" style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Email Address <span style={{color:T.danger}}>*</span></label>
            <input type="email" value={form.email_address ?? ''} onChange={e => setForm(f => ({ ...f, email_address: e.target.value }))} placeholder="user@company.com" style={inp} />
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
            <div>
              <label style={lbl}>OTA Client</label>
              <div style={{display:'flex', gap:'16px', marginTop:'4px'}}>
                {[{val:true,label:'Yes'},{val:false,label:'No'}].map(opt => (
                  <label key={String(opt.val)} style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px', color:T.textMid}}>
                    <input type="radio" name="ota_client" checked={form.ota_client === opt.val} onChange={() => setForm(f => ({ ...f, ota_client: opt.val }))} style={{accentColor:T.primary}} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <div style={{display:'flex', gap:'16px', marginTop:'4px'}}>
                {['Active','Inactive'].map(s => (
                  <label key={s} style={{display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px', color:T.textMid}}>
                    <input type="radio" name="status" checked={(form.status ?? 'Active') === s} onChange={() => setForm(f => ({ ...f, status: s }))} style={{accentColor:T.primary}} />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {formError && <p style={{fontSize:'13px', color:T.danger}}>{formError}</p>}
          <div style={{display:'flex', gap:'10px', paddingTop:'4px'}}>
            <button onClick={() => setModalOpen(false)} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:500, border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.primary, color:'white', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete User" size="sm">
        <div className="space-y-4" style={{color:"#1e293b"}}>
          <p style={{fontSize:'14px', color:T.textMid}}>Delete <strong style={{color:T.text}}>{editing?.first_name} {editing?.last_name}</strong>? This action cannot be undone.</p>
          <div style={{display:'flex', gap:'10px'}}>
            <button onClick={() => setDeleteOpen(false)} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:500, border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.danger, color:'white', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Users" size="lg">
        <div className="space-y-4" style={{color:"#1e293b"}}>
          {importResult ? (
            <div style={{borderRadius:T.radius, padding:'12px 16px', fontSize:'13px', background: importResult.failed===0 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${importResult.failed===0 ? '#bbf7d0' : '#fde68a'}`, color: importResult.failed===0 ? '#166534' : '#92400e'}}>
              {importResult.failed === 0
                ? <p style={{fontWeight:600}}>Successfully imported {importResult.success} user{importResult.success!==1?'s':''}.</p>
                : <div><p style={{fontWeight:600, marginBottom:'4px'}}>{importResult.success} imported, {importResult.failed} skipped</p>
                    {importResult.failedRows.map((r, i) => <p key={i} style={{fontSize:'12px', fontFamily:'monospace', opacity:0.75}}>{r}</p>)}</div>}
            </div>
          ) : (
            <>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div>
                  <p style={{fontSize:'13px', color:T.textMid}}>File: <strong style={{color:T.text}}>{importFileName}</strong></p>
                  <p style={{fontSize:'12px', color:T.textLight, marginTop:'2px'}}>{importRows.length} rows — <span style={{color:'#16a34a', fontWeight:600}}>{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span style={{color:T.danger, fontWeight:600}}>{invalidRows.length} errors</span></>}</p>
                </div>
                <button onClick={handleDownloadTemplate} style={{fontSize:'12px', color:T.primary, background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}>Download template</button>
              </div>
              <div style={{background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:T.radius, padding:'10px 14px', fontSize:'12px', color:T.textMid}}>
                Required: <code style={{color:T.text, fontWeight:600}}>First Name</code>, <code style={{color:T.text, fontWeight:600}}>Last Name</code>, <code style={{color:T.text, fontWeight:600}}>Email Address</code>
                {detectedHeaders.length > 0 && <span style={{marginLeft:'8px'}}>| Detected: {detectedHeaders.map((h,i) => <span key={i} style={{fontFamily:'monospace', fontWeight:600, marginRight:'4px'}}>{h}</span>)}</span>}
              </div>
              <div style={{maxHeight:'260px', overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:T.radius}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'12px'}}>
                  <thead style={{position:'sticky', top:0, background:T.surfaceAlt, borderBottom:`1px solid ${T.border}`}}>
                    <tr>{['Row','First Name','Last Name','Email','Validation'].map(h => <th key={h} style={{padding:'8px 12px', textAlign:'left', fontWeight:600, color:T.textMid}}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} style={{borderBottom:`1px solid ${T.border}`, background: row._errors.length > 0 ? '#fff5f5' : 'transparent'}}>
                        <td style={{padding:'8px 12px', color:T.textLight}}>{row._row}</td>
                        <td style={{padding:'8px 12px', fontWeight:500}}>{row.first_name || <em style={{color:'#ef4444'}}>empty</em>}</td>
                        <td style={{padding:'8px 12px', fontWeight:500}}>{row.last_name || <em style={{color:'#ef4444'}}>empty</em>}</td>
                        <td style={{padding:'8px 12px', color:T.textMid}}>{row.email_address || <em style={{color:'#ef4444'}}>empty</em>}</td>
                        <td style={{padding:'8px 12px'}}>{row._errors.length === 0 ? <span style={{color:'#16a34a', fontWeight:600}}>OK</span> : <span style={{color:T.danger}}>{row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 0 && <p style={{fontSize:'12px', color:T.textLight}}>Rows with errors will be skipped. Only {validRows.length} valid rows will be imported.</p>}
            </>
          )}
          <div style={{display:'flex', gap:'10px', paddingTop:'4px'}}>
            <button onClick={closeImport} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:500, border:`1px solid ${T.border}`, borderRadius:T.radius, background:T.card, color:T.textMid, cursor:'pointer'}}>{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1, padding:'9px', fontSize:'13px', fontWeight:700, border:'none', borderRadius:T.radius, background:T.primary, color:'white', cursor:'pointer', opacity:(importing||validRows.length===0)?0.5:1}}>
              {importing ? 'Importing...' : `Import ${validRows.length} User${validRows.length!==1?'s':''}`}
            </button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
