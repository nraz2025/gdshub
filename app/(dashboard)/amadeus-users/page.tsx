'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { AmadeusUser, User, OTAClient } from '@/types'
import { syncUserToTable, syncUserStatus } from '@/lib/syncUser'


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


const SS: Record<string,{bg:string;color:string;border:string}> = {
  active:  {bg:'#f0fdf4',color:'#166534',border:'#bbf7d0'},
  inactive:{bg:'#f1f5f9',color:'#64748b',border:'#e2e8f0'},
  suspended:{bg:'#fffbeb',color:'#92400e',border:'#fde68a'},
  resigned:{bg:'#fef2f2',color:'#dc2626',border:'#fecaca'},
}

type EprCategory = 'PST' | 'AET' | 'OTA' | 'JHT' | 'Vendor'
const EPR_CATEGORIES: { label: string; value: EprCategory; min: number; max: number; color: string }[] = [
  { label: 'PST',    value: 'PST',    min: 1000, max: 1999, color: '#3B82F6' },
  { label: 'AET',    value: 'AET',    min: 2000, max: 2999, color: '#8B5CF6' },
  { label: 'OTA',    value: 'OTA',    min: 3000, max: 3999, color: '#10B981' },
  { label: 'JHT',    value: 'JHT',    min: 4000, max: 4999, color: '#EC4899' },
  { label: 'Vendor', value: 'Vendor', min: 9950, max: 9999, color: '#F59E0B' },
]

const EMPTY = { login: '', sign_on_id: '', initial: '', duty_code: '', oid: '', user_id: '', ota: false, ota_client_id: '' as number | '', newEmail: '', newFirstName: '', newLastName: '', status: 'active', category: '' as EprCategory | '',
}

interface ImportRow {
  login: string; sign_on_id: string; initial: string; duty_code: string; oid: string; ota: boolean
  _row: number; _errors: string[]
}



export default function AmadeusUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<AmadeusUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [pccList, setPccList] = useState<{pcc:string; ota_client?: {company_name?:string} | null}[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOTA, setFilterOTA] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<AmadeusUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [nextEpr, setNextEpr] = useState<string | null>(null)
  const [loadingEpr, setLoadingEpr] = useState(false)
  const [nextSignOnNum, setNextSignOnNum] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const { data: amGds } = await supabase.from('gds').select('id').eq('name', 'Amadeus').maybeSingle()
    const [{ data: amData }, { data: usersData }, { data: otaData }, { data: pccData }] = await Promise.all([
      supabase.from('amadeus_user').select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)').order('login'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
      amGds?.id
        ? supabase.from('pcc_list').select('pcc, ota_client:ota_client_id(company_name)').eq('gds_id', amGds.id).order('pcc')
        : Promise.resolve({ data: [] as {pcc:string; ota_client?: {company_name?:string} | null}[] }),
    ])
    setRecords(amData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setPccList((pccData as unknown as {pcc:string; ota_client?: {company_name?:string} | null}[]) ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setNextEpr(null); setNextSignOnNum(null); setModalOpen(true) }

  async function fetchNextEpr(category: EprCategory, initial?: string) {
    const cat = EPR_CATEGORIES.find(c => c.value === category)
    if (!cat) return
    setLoadingEpr(true)

    // Fetch ALL logins — filter numerically client-side (login can be text like AJIMMY)
    const { data: loginData } = await supabase.from('amadeus_user').select('login')
    const loginNums = (loginData ?? [])
      .map(r => parseInt(r.login, 10))
      .filter(n => !isNaN(n) && n >= cat.min && n <= cat.max)
    const nextLogin = loginNums.length > 0 ? Math.max(...loginNums) + 1 : cat.min
    const suggestedLogin = nextLogin <= cat.max ? String(nextLogin) : null
    setNextEpr(suggestedLogin)

    // Fetch ALL sign_on_ids — extract LEADING digits only (e.g. "4014JI" → 4014), filter in tier range
    const { data: signOnData } = await supabase.from('amadeus_user')
      .select('sign_on_id')
      .not('sign_on_id', 'is', null)
    const signOnNums = (signOnData ?? [])
      .map(r => {
        const match = (r.sign_on_id ?? '').match(/^(\d+)/)
        return match ? parseInt(match[1], 10) : NaN
      })
      .filter(n => !isNaN(n) && n >= cat.min && n <= cat.max)
    const nextSignOn = signOnNums.length > 0 ? Math.max(...signOnNums) + 1 : cat.min
    const suggestedSignOnNum = nextSignOn <= cat.max ? nextSignOn : null
    setNextSignOnNum(suggestedSignOnNum)

    const ini = (initial ?? '').trim().toUpperCase()
    setForm(f => ({
      ...f,
      sign_on_id: suggestedSignOnNum && ini ? `${suggestedSignOnNum}${ini}` : f.sign_on_id,
    }))
    setLoadingEpr(false)
  }
  function openEdit(row: AmadeusUser) {
    setEditing(row)
    setForm({ login: row.login, sign_on_id: row.sign_on_id ?? '', initial: row.initial ?? '', duty_code: row.duty_code ?? '', oid: row.oid ?? '', user_id: row.user_id ?? '', ota: row.ota, ota_client_id: row.ota_client_id ?? '', newEmail: '', newFirstName: '', newLastName: '', status: (row as {status?: string}).status ?? 'active', category: (row as AmadeusUser & { category?: EprCategory }).category ?? '' })
    setError(''); setSaving(false); setNextEpr(null); setNextSignOnNum(null); setModalOpen(true)
  }
  function openDelete(row: AmadeusUser) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    setSaving(true); setError('')
    // Check for duplicate login under same OTA Client
    if (form.login?.trim()) {
      const loginUpper = (form.login as string).trim().toUpperCase()
      const { data: dupCheck } = await supabase.from('amadeus_user')
        .select('id').ilike('login', loginUpper)
        .eq('ota_client_id', (form as {ota_client_id?: number|null}).ota_client_id || 0)
        .maybeSingle()
      if (dupCheck && (!editing || dupCheck.id !== editing.id)) {
        setError("Login already exists for this OTA Client: " + loginUpper)
        setSaving(false); return
      }
    }
    const audit = await getAuditFields()

    // Resolve user_id - use selected user or auto-create from email
    let resolvedUserId = form.user_id || null
    if ((form as {newEmail?: string}).newEmail?.trim()) {
      const synced = await syncUserToTable({
        email:     (form as {newEmail: string}).newEmail,
        firstName: (form as {newFirstName?: string}).newFirstName ?? '',
        lastName:  (form as {newLastName?: string}).newLastName  ?? '',
      })
      if (synced) { resolvedUserId = synced }
    }

    const payload = { login: form.login.trim(), sign_on_id: form.sign_on_id.trim().toUpperCase() || null, initial: form.initial.trim().toUpperCase() || null, duty_code: form.duty_code.trim().toUpperCase() || null, oid: form.oid.trim().toUpperCase() || null, user_id: resolvedUserId, ota: form.ota, ota_client_id: form.ota_client_id || null, status: (form as {status?: string}).status ?? 'active', category: (form as {category?: string}).category || null }
    const { error: err } = editing
      ? await supabase.from('amadeus_user').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('amadeus_user').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }

    // Keep the linked users.ota_client flag in sync with this record's OTA toggle
    if (resolvedUserId) {
      await supabase.from('users').update({ ota_client: form.ota }).eq('id', resolvedUserId)
      // Re-evaluate this person's overall status across Sabre/Amadeus/Travelport
      await syncUserStatus(resolvedUserId)
    }

    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    const u = (editing as AmadeusUser & { users?: { id?: string; first_name?: string; last_name?: string; email_address?: string } }).users
    const ota = (editing as AmadeusUser & { ota_client?: { company_name?: string } }).ota_client
    await supabase.from('resigned_user').insert({
      source_gds: 'Amadeus', source_record_id: editing.id,
      full_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
      initial: editing.initial ?? null, email: u?.email_address ?? null,
      amadeus_login: editing.login ?? null, amadeus_sign_on_id: editing.sign_on_id ?? null,
      amadeus_duty_code: editing.duty_code ?? null, amadeus_oid: editing.oid ?? null,
      ota_client: ota?.company_name ?? null,
      date_created_in_gds: new Date(editing.created_at).toISOString().slice(0, 10),
      date_resigned: new Date().toISOString().slice(0, 10),
    })
    await supabase.from('amadeus_user').delete().eq('id', editing.id)

    // Re-evaluate this person's overall status across remaining Sabre/Amadeus/Travelport accounts
    if (u?.email_address) {
      const userRow = await supabase.from('users').select('id').eq('email_address', u.email_address).maybeSingle()
      const userId = userRow.data?.id
      if (userId) {
        await syncUserStatus(userId)
      }
    }
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => {
      const u = r.users as User
      return { 'No.': i + 1, 'Login': r.login, 'Sign-On ID': r.sign_on_id ?? '', 'Initial': r.initial ?? '', 'Duty Code': r.duty_code ?? '', 'OID': r.oid ?? '', 'OTA': r.ota ? 'Yes' : 'No', 'Linked User': u ? `${u.first_name} ${u.last_name}` : '', 'Created': new Date(r.created_at).toLocaleDateString('en-MY') }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 25 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Amadeus Users')
    XLSX.writeFile(wb, `GDSHub_Amadeus_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'Login': 'JOHNSMITH', 'Sign-On ID': 'JS', 'Initial': 'JS', 'Duty Code': 'TP', 'OID': 'KULMY255W', 'OTA': 'No' },
    ])
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Amadeus Users')
    XLSX.writeFile(wb, 'GDSHub_Amadeus_Users_Template.xlsx')
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportFileName(file.name); setImportResult(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const getF = (row: Record<string, string>, ...keys: string[]) => {
        const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, '')
        const match = Object.keys(row).find(k => keys.some(c => norm(k) === norm(c)))
        return match ? (row[match] ?? '').toString().trim() : ''
      }
      const parsed: ImportRow[] = raw.map((r, i) => {
        const login = getF(r, 'Login', 'login', 'username')
        const sign_on_id = getF(r, 'Sign-On ID', 'SignOnID', 'sign_on_id', 'signon').toUpperCase()
        const initial = getF(r, 'Initial', 'initial').toUpperCase()
        const duty_code = getF(r, 'Duty Code', 'DutyCode', 'duty_code').toUpperCase()
        const oid = getF(r, 'OID', 'oid', 'office id').toUpperCase()
        const ota_raw = getF(r, 'OTA', 'ota').toLowerCase()
        const ota = ota_raw === 'yes' || ota_raw === 'true' || ota_raw === '1'
        const errors: string[] = []
        if (!login) errors.push('Login is required')
        return { login, sign_on_id, initial, duty_code, oid, ota, _row: i + 2, _errors: errors }
      })
      setImportRows(parsed); setImportOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  async function handleImportConfirm() {
    const valid = importRows.filter(r => r._errors.length === 0)
    if (!valid.length) return
    setImporting(true)
    let success = 0; let failed = 0; const failedRows: string[] = []
    for (const row of valid) {
      const { error } = await supabase.from('amadeus_user').insert({ login: row.login, sign_on_id: row.sign_on_id || null, initial: row.initial || null, duty_code: row.duty_code || null, oid: row.oid || null, ota: row.ota })
      if (error) { failed++; failedRows.push(`${row.login} - ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  // OID -> OTA Client name lookup, sourced from GDS Info (pcc_list, Amadeus only)
  const pccOtaMap: Record<string, string> = {}
  pccList.forEach(p => {
    const name = (p.ota_client as {company_name?:string} | null)?.company_name
    if (p.pcc && name) pccOtaMap[p.pcc.toUpperCase()] = name
  })
  const getPccAssigned = (oid?: string | null) => oid ? pccOtaMap[oid.toUpperCase()] : undefined

  const activeCount    = records.filter(r => ((r as {status?:string}).status ?? 'active') === 'active').length
  const inactiveCount  = records.filter(r => (r as {status?:string}).status === 'inactive').length
  const suspendedCount = records.filter(r => (r as {status?:string}).status === 'suspended').length
  const otaCount       = records.filter(r => r.ota).length

  const filtered = records.filter(r => {
    const u = r.users as User
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    const matchStatus = filterStatus === 'all' || ((r as {status?: string}).status ?? 'active') === filterStatus
    const matchOTA = filterOTA === 'all' || (filterOTA === 'yes' ? r.ota === true : r.ota !== true)
    const matchSearch = r.login.toLowerCase().includes(term) || (r.oid ?? '').toLowerCase().includes(term) || name.includes(term) || (r.sign_on_id ?? '').toLowerCase().includes(term) || (r.initial ?? '').toLowerCase().includes(term)
    return matchSearch && matchStatus && matchOTA
  })

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'login', label: 'Login', render: (row: AmadeusUser) => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{row.login}</span> },
    { key: 'sign_on_id', label: 'Sign-On ID', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.sign_on_id ?? '-'}</span> },
    { key: 'initial', label: 'Initial', render: (row: AmadeusUser) => <span className="text-slate-600">{row.initial ?? '-'}</span> },
    { key: 'duty_code', label: 'Duty Code', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.duty_code ?? '-'}</span> },
    { key: 'oid', label: 'OID', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.oid ?? '-'}</span> },
    { key: 'ota', label: 'OTA', render: (row: AmadeusUser) => <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${row.ota ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{row.ota ? 'Yes' : 'No'}</span> },
    { key: 'ota_client_id', label: 'OTA Client', render: (row: AmadeusUser) => { const ota = row.ota_client as OTAClient; return ota ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">{ota.company_name}</span> : <span className="text-slate-300 text-xs">-</span> } },
    { key: 'status', label: 'Status', render: (row: AmadeusUser) => {
      const s = ((row as {status?: string}).status ?? 'active').toLowerCase()
      const map: Record<string, string> = { active:'bg-emerald-50 text-emerald-700 border-emerald-200', inactive:'bg-slate-100 text-slate-500 border-slate-200', suspended:'bg-amber-50 text-amber-700 border-amber-200', resigned:'bg-red-50 text-red-600 border-red-200' }
      return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${map[s] ?? map.active}`}>{s}</span>
    }},
    { key: 'user_id', label: 'Linked User', render: (row: AmadeusUser) => { const u = row.users as User; return u ? <div><p className="text-sm text-slate-700 font-medium">{u.first_name} {u.last_name}</p><p className="text-xs text-slate-400">{u.email_address}</p></div> : <span className="text-slate-300 text-xs">-</span> } },
    {
      key: 'modified_at', label: 'Last Modified',
      render: (row: AmadeusUser) => {
        const r = row as AmadeusUser & {modified_at?: string; modified_by?: string}
        if (!r.modified_at) return <span className="text-slate-300 text-xs">-</span>
        return (
          <div>
            <p className="text-xs text-slate-600">{new Date(r.modified_at).toLocaleDateString('en-MY')}</p>
            {r.modified_by && <p className="text-xs text-slate-400">{r.modified_by}</p>}
          </div>
        )
      }
    },
    { key: 'created_at', label: 'Created', render: (row: AmadeusUser) => new Date(row.created_at).toLocaleDateString('en-MY') },
  ]

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif',background:'#f1f5f9',minHeight:'100vh'}}>
      <div style={{padding:"20px 28px",marginBottom:"0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
          <div>
            <h1 style={{fontSize:"30px",fontWeight:700,color:'#1e293b',margin:0,letterSpacing:"-0.02em"}}>Amadeus Users</h1>
           
          </div>
          <div className="flex items-center" style={{gap:'12px'}}>
          {isAdmin && (
          <button onClick={handleExport} disabled={filtered.length === 0}
            style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'16px',fontWeight:500,color:'#1e293b',cursor:'pointer',opacity:filtered.length===0?0.4:1,transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
            onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
            onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
          )}
          {isAdmin && <><input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()}
            style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'16px',fontWeight:500,color:'#1e293b',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
            onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
            onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>
          <button onClick={openAdd}
            style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'linear-gradient(135deg, #1a5f3c 0%, #2d8a5e 100%)',border:'none',borderRadius:'8px',fontSize:'16px',fontWeight:500,color:'white',cursor:'pointer',boxShadow:'0 4px 14px 0 rgba(26, 95, 60, 0.3)',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
            onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px 0 rgba(26, 95, 60, 0.4)' }}
            onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px 0 rgba(26, 95, 60, 0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Amadeus User</button></>}
          </div>
        </div>
      </div>
      <div style={{padding:'0 28px 28px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'16px',marginBottom:'24px'}}>
          {[{label:'Total Users',value:records.length,sub:' '},{label:'Active',value:activeCount,sub:' '},{label:'Inactive',value:inactiveCount,sub:' '},{label:'Suspended',value:suspendedCount,sub:' '},{label:'OTA Users',value:otaCount,sub:' ',highlighted:true}].map((s,i)=>(
            <div key={i}
              style={{
                position:'relative', overflow:'hidden',
                background: s.highlighted ? 'linear-gradient(135deg, #2d8a5e 0%, #10b981 100%)' : '#ffffff',
                border: s.highlighted ? 'none' : '1px solid #e2e8f0',
                borderRadius:'12px', padding:'20px',
                boxShadow: s.highlighted ? '0 4px 14px 0 rgba(16, 185, 129, 0.3)' : 'none',
                transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              }}
              onMouseOver={e => { if (!s.highlighted) { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'; e.currentTarget.style.borderColor='transparent' } }}
              onMouseOut={e => { if (!s.highlighted) { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.borderColor='#e2e8f0' } }}>
              <div style={{fontSize:'15px',fontWeight:700,color: s.highlighted ? 'rgba(255,255,255,0.85)' : '#94a3b8',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'8px'}}>{s.label}</div>
              <div style={{fontSize:'28px',fontWeight:700,color: s.highlighted ? 'white' : '#1e293b',lineHeight:1,marginBottom:'4px'}}>{s.value}</div>
              <div style={{fontSize:'15px',color: s.highlighted ? 'rgba(255,255,255,0.85)' : '#94a3b8'}}>{s.sub}</div>
            </div>
          ))}
        </div>
      <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'20px',flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1,minWidth:'280px'}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:'16px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search login, OID, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
            style={{width:'100%',padding:'12px 16px 12px 44px',fontSize:'16px',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#ffffff',color:'#1e293b',outline:'none',boxSizing:'border-box',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
            onFocus={e => { e.currentTarget.style.borderColor='#2d8a5e'; e.currentTarget.style.boxShadow='0 0 0 3px rgba(45, 138, 94, 0.1)' }} onBlur={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.boxShadow='none' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{padding:'12px 40px 12px 16px',fontSize:'16px',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#ffffff',color:'#1e293b',outline:'none',cursor:'pointer',minWidth:'140px',appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 16px center'}}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={filterOTA} onChange={e => setFilterOTA(e.target.value)}
          style={{padding:'12px 40px 12px 16px',fontSize:'16px',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#ffffff',color:'#1e293b',outline:'none',cursor:'pointer',minWidth:'140px',appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 16px center'}}>
          <option value="all">All OTA</option>
          <option value="yes">OTA: Yes</option>
          <option value="no">OTA: No</option>
        </select>
      </div>
      {loading ? <div style={{textAlign:"center",padding:"60px",color:'#94a3b8'}}>Loading...</div> : (
        <div style={{background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'12px',overflowX:"auto",boxShadow:'0 1px 2px 0 rgb(0 0 0 / 0.05)'}}>
          <div style={{display:"grid",gridTemplateColumns:"minmax(140px,1.4fr) minmax(130px,1.3fr) minmax(120px,1.2fr) minmax(200px,2fr) minmax(95px,1fr) minmax(95px,1fr) minmax(95px,1fr) minmax(115px,1.15fr) minmax(150px,150px)",minWidth:'1140px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
            {['OID','Login','Sign-On','Linked User','Initial','Duty','OTA','Status','Actions'].map((h,i)=>(
              <div key={h} style={{padding:"14px 16px",fontSize:"16px",fontWeight:700,color:'#94a3b8',textTransform:"uppercase",letterSpacing:"0.05em",textAlign:i===8?"right":"left",borderRight: i<8 ? '1px solid #e2e8f0' : 'none'}}>{h}</div>
            ))}
          </div>
          {filtered.length===0 ? <div style={{padding:"60px",textAlign:"center",color:'#94a3b8'}}>No Amadeus users found.</div> :
          filtered.map((row,i)=>{
            const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
            const sval = ((row as {status?:string}).status ?? "active").toLowerCase()
            const s = SS[sval] ?? SS.active
            const pccAssigned = getPccAssigned(row.oid)
            return (
              <div key={row.id} style={{display:"grid",gridTemplateColumns:"minmax(140px,1.4fr) minmax(130px,1.3fr) minmax(120px,1.2fr) minmax(200px,2fr) minmax(95px,1fr) minmax(95px,1fr) minmax(95px,1fr) minmax(115px,1.15fr) minmax(150px,150px)",minWidth:'1140px',borderBottom:i<filtered.length-1?'1px solid #e2e8f0':"none",transition:'background 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                <div style={{padding:"14px 16px",display:'flex',flexDirection:'column',justifyContent:'center',gap:'2px',borderRight:'1px solid #f1f5f9'}}>
                  <span style={{fontFamily:"monospace",fontSize:"15px",color:'#64748b',textTransform:'uppercase',letterSpacing:'0.05em'}}>{row.oid??"-"}</span>
                  {pccAssigned && <span style={{fontSize:'15px',color:'#94a3b8'}}>{pccAssigned}</span>}
                </div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}><span style={{fontSize:"15px",fontWeight:600,color:'#1e293b',textTransform:'uppercase',letterSpacing:'0.03em'}}>{row.login}</span></div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:"monospace",fontSize:"15px",color:'#64748b',letterSpacing:'0.05em'}}>{row.sign_on_id??"-"}</span></div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}>{u ? <><div style={{fontSize:"15px",fontWeight:600,color:'#1e293b'}}>{u.first_name} {u.last_name}</div><div style={{fontSize:"15px",color:'#94a3b8'}}>{u.email_address}</div></> : <span style={{color:'#94a3b8'}}>-</span>}</div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}>{row.initial ? <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'28px',height:'28px',borderRadius:'8px',fontSize:'15px',fontWeight:600,textTransform:'uppercase',color:'#a855f7',background:'#f3e8ff',border:'1px solid #e9d5ff'}}>{row.initial}</span> : <span style={{color:'#cbd5e1'}}>-</span>}</div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:"monospace",fontSize:"15px",fontWeight:600,color:'#64748b'}}>{row.duty_code??"-"}</span></div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}>
                  <span style={{fontSize:'15px',fontWeight:600,padding:'4px 10px',borderRadius:'9999px',background:row.ota?'#f0fdf4':'#f1f5f9',color:row.ota?'#16a34a':'#94a3b8',border:`1px solid ${row.ota?'#bbf7d0':'#e2e8f0'}`}}>{row.ota?'Yes':'No'}</span>
                </div>
                <div style={{padding:"14px 16px",borderRight:'1px solid #f1f5f9'}}><span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:"15px",fontWeight:600,padding:"6px 14px",borderRadius:"9999px",background:sval==='active'?'#f0fdf4':s.bg,color:sval==='active'?'#16a34a':s.color,border:`1px solid ${sval==='active'?'#bbf7d0':s.border}`,textTransform:"capitalize"}}><span style={{width:'6px',height:'6px',borderRadius:'50%',background:sval==='active'?'#22c55e':s.color,flexShrink:0}}/>{sval}</span></div>
                <div style={{padding:"14px 16px",display:"flex",alignItems:'center',justifyContent:"flex-end",gap:"8px"}}>
                  {isAdmin&&(<>
                    <button onClick={()=>openEdit(row)}
                      style={{padding:'6px 14px',fontSize:'15px',fontWeight:500,color:'#64748b',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                      onMouseOver={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.color='#1e293b';e.currentTarget.style.boxShadow='0 1px 2px 0 rgb(0 0 0 / 0.05)'}}
                      onMouseOut={e=>{e.currentTarget.style.background='#ffffff';e.currentTarget.style.color='#64748b';e.currentTarget.style.boxShadow='none'}}>
                      Edit
                    </button>
                    <button onClick={()=>openDelete(row)}
                      style={{padding:'6px 14px',fontSize:'15px',fontWeight:500,color:'#ef4444',background:'#ffffff',border:'1px solid #fecaca',borderRadius:'8px',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                      onMouseOver={e=>{e.currentTarget.style.background='#fef2f2';e.currentTarget.style.borderColor='#ef4444'}}
                      onMouseOut={e=>{e.currentTarget.style.background='#ffffff';e.currentTarget.style.borderColor='#fecaca'}}>
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

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Amadeus User' : 'Add Amadeus User'}>
        <div className="space-y-4">

          {/* 1. Category selector — add only */}
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Category <span className="text-red-500">*</span></label>
              <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px'}}>
                {EPR_CATEGORIES.map(cat => (
                  <button key={cat.value} type="button"
                    onClick={() => { setForm(f => ({ ...f, category: cat.value })); fetchNextEpr(cat.value, form.initial) }}
                    style={{
                      padding: '8px 4px', fontSize: '12px', fontWeight: 700, textAlign: 'center',
                      border: `2px solid ${(form as {category?: string}).category === cat.value ? cat.color : '#E2E8F0'}`,
                      borderRadius: '8px',
                      background: (form as {category?: string}).category === cat.value ? cat.color + '18' : '#fff',
                      color: (form as {category?: string}).category === cat.value ? cat.color : '#64748B',
                      cursor: 'pointer', transition: 'all 0.15s',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>{cat.label}</div>
                    <div style={{ fontSize: '10px', opacity: 0.65, marginTop: '2px', whiteSpace: 'nowrap' }}>{cat.min}–{cat.max}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Or Create & Link a New User — add only, moved up */}
          {!editing && (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Or create &amp; link a new user</p>
              <p className="text-xs text-slate-400">If the user does not exist yet — fill in their details and they will be added to the Users table automatically. If the email already exists, the existing user will be linked instead.</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
                <input type="email" value={form.newEmail ?? ''} onChange={e => setForm(f => ({ ...f, newEmail: e.target.value }))} placeholder="user@company.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                  <input type="text" value={form.newFirstName ?? ''} onChange={e => setForm(f => ({ ...f, newFirstName: e.target.value }))} placeholder="First name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                  <input type="text" value={form.newLastName ?? ''} onChange={e => setForm(f => ({ ...f, newLastName: e.target.value }))} placeholder="Last name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                </div>
              </div>
            </div>
          )}

          {/* 3. Login + Sign-On ID */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Login <span className="text-red-500">*</span></label>
              <input type="text" value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                placeholder={loadingEpr ? 'Loading...' : 'e.g. 1001'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono"
                readOnly={loadingEpr}
              />
              {!editing && (form as {category?: string}).category && !nextEpr && !loadingEpr && (
                <p className="text-xs text-red-500 mt-1">Range full — no EPR available in this tier</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Sign-On ID</label>
              <input type="text" value={form.sign_on_id} onChange={e => setForm(f => ({ ...f, sign_on_id: e.target.value.toUpperCase() }))} placeholder="e.g. 4042GY" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
              {!editing && nextSignOnNum && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">
                  ✓ Next: {nextSignOnNum}{form.initial ? form.initial.trim().toUpperCase() : <span className="text-slate-400"> + initial</span>}
                </p>
              )}
            </div>
          </div>

          {/* 4. Initial + Duty Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial}
                onChange={e => {
                  const ini = e.target.value.toUpperCase()
                  setForm(f => ({
                    ...f,
                    initial: ini,
                    ...(!editing && nextSignOnNum ? { sign_on_id: `${nextSignOnNum}${ini}` } : {}),
                  }))
                }}
                placeholder="e.g. JS" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Duty Code</label>
              <input type="text" value={form.duty_code} onChange={e => setForm(f => ({ ...f, duty_code: e.target.value.toUpperCase() }))} placeholder="e.g. TP" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          {/* 5. OID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OID</label>
            <select value={form.oid} onChange={e => setForm(f => ({ ...f, oid: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white font-mono uppercase">
              <option value="">- Select OID -</option>
              {[...new Set(pccList.map(p => p.pcc))].sort().map(pcc => <option key={pcc} value={pcc}>{pcc}</option>)}
            </select>
          </div>

          {/* 6. Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={(form as {status?: string}).status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* 7. Linked User */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email_address})</option>)}
            </select>
          </div>

          {/* 8. OTA toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">OTA</label>
            <div className="flex gap-4">
              {[true, false].map(v => (
                <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.ota === v} onChange={() => setForm(f => ({ ...f, ota: v }))} className="accent-blue-500" />
                  <span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Amadeus User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Amadeus user <strong>{editing?.login}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={closeImport} title="Import Amadeus Users" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0 ? <p className="font-medium"> Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p> : (
                <div className="space-y-1"><p className="font-medium"> {importResult.success} imported .  {importResult.failed} skipped</p>
                  {importResult.failedRows.map((r, i) => <p key={i} className="text-xs opacity-70 font-mono">{r}</p>)}</div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-600">File: <span className="font-medium">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows - <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p></div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                Required: <span className="font-mono font-medium text-slate-700">Login</span> . Optional: <span className="font-mono font-medium text-slate-700">Sign-On ID</span>, <span className="font-mono font-medium text-slate-700">Initial</span>, <span className="font-mono font-medium text-slate-700">Duty Code</span>, <span className="font-mono font-medium text-slate-700">OID</span>, <span className="font-mono font-medium text-slate-700">OTA</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Login','Sign-On','Initial','Duty Code','OID','OTA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-bold">{row.login || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2 font-mono">{row.sign_on_id || '-'}</td>
                        <td className="px-3 py-2">{row.initial || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.duty_code || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.oid || '-'}</td>
                        <td className="px-3 py-2">{row.ota ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium"> OK</span> : <span className="text-red-500"> {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 0 && <p className="text-xs text-slate-400"> {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors will be skipped.</p>}
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{importing ? 'Importing...' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
