'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { AmadeusUser, User, OTAClient } from '@/types'
import { syncUserToTable } from '@/lib/syncUser'


const T = {
  primary:'#2563eb', surface:'#f8fafc', surfaceAlt:'#f1f5f9',
  border:'#e2e8f0', text:'#0f172a', textMid:'#475569', textLight:'#94a3b8',
  danger:'#dc2626', radius:'6px',
}
const SS: Record<string,{bg:string;color:string;border:string}> = {
  active:  {bg:'#f0fdf4',color:'#166534',border:'#bbf7d0'},
  inactive:{bg:'#f1f5f9',color:'#64748b',border:'#e2e8f0'},
  suspended:{bg:'#fffbeb',color:'#92400e',border:'#fde68a'},
  resigned:{bg:'#fef2f2',color:'#dc2626',border:'#fecaca'},
}

const EMPTY = { login: '', sign_on_id: '', initial: '', duty_code: '', oid: '', user_id: '', ota: false, ota_client_id: '' as number | '', newEmail: '', newFirstName: '', newLastName: '', status: 'active',
}

interface ImportRow {
  login: string; sign_on_id: string; initial: string; duty_code: string; oid: string; ota: boolean
  _row: number; _errors: string[]
}


// Sign-On ID prefix lookup helper
function SignOnLookup({ prefix, records }: { prefix: string; records: AmadeusUser[] }) {
  if (!prefix) return (
    <p className="text-xs text-slate-400 mt-1">Type a number prefix to check existing IDs (e.g. 30, 40...)</p>
  )
  const matches = records
    .map(r => r.sign_on_id ?? '')
    .filter(Boolean)
    .filter(s => s.replace(/[^0-9]/g, '').startsWith(prefix))
    .sort((a, b) => parseInt(b.replace(/\D/g, ''), 10) - parseInt(a.replace(/\D/g, ''), 10))
  if (matches.length === 0) return (
    <p className="text-xs text-emerald-600 mt-1 font-medium">No existing IDs starting with {prefix}</p>
  )
  return (
    <div style={{marginTop:'6px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'7px',padding:'8px 10px'}}>
      <p style={{fontSize:'11px',fontWeight:600,color:'#475569',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.04em'}}>
        Existing IDs starting with {prefix} - last used first
      </p>
      <div style={{display:'flex',flexWrap:'wrap',gap:'4px',maxHeight:'80px',overflowY:'auto'}}>
        {matches.map((s, i) => (
          <span key={i} style={{fontFamily:'monospace',fontSize:'12px',fontWeight:600,padding:'2px 7px',borderRadius:'5px',
            background: i === 0 ? '#fef9c3' : '#f1f5f9',
            color: i === 0 ? '#854d0e' : '#475569',
            border: i === 0 ? '1px solid #fef08a' : '1px solid #e2e8f0',
          }}>{s}{i === 0 ? ' (last)' : ''}</span>
        ))}
      </div>
    </div>
  )
}

export default function AmadeusUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<AmadeusUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<AmadeusUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    const [{ data: amData }, { data: usersData }, { data: otaData }] = await Promise.all([
      supabase.from('amadeus_user').select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)').order('login'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
    ])
    setRecords(amData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: AmadeusUser) {
    setEditing(row)
    setForm({ login: row.login, sign_on_id: row.sign_on_id ?? '', initial: row.initial ?? '', duty_code: row.duty_code ?? '', oid: row.oid ?? '', user_id: row.user_id ?? '', ota: row.ota, ota_client_id: row.ota_client_id ?? '', newEmail: '', newFirstName: '', newLastName: '', status: (row as {status?: string}).status ?? 'active' })
    setError(''); setSaving(false); setModalOpen(true)
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

    const payload = { login: form.login.trim(), sign_on_id: form.sign_on_id.trim().toUpperCase() || null, initial: form.initial.trim().toUpperCase() || null, duty_code: form.duty_code.trim().toUpperCase() || null, oid: form.oid.trim().toUpperCase() || null, user_id: resolvedUserId, ota: form.ota, ota_client_id: form.ota_client_id || null, status: (form as {status?: string}).status ?? 'active' }
    const { error: err } = editing
      ? await supabase.from('amadeus_user').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('amadeus_user').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }

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

  const filtered = records.filter(r => {
    const u = r.users as User
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    const matchStatus = filterStatus === 'all' || ((r as {status?: string}).status ?? 'active') === filterStatus
    return (r.login.toLowerCase().includes(term) || (r.oid ?? '').toLowerCase().includes(term) || name.includes(term) || (r.sign_on_id ?? '').toLowerCase().includes(term) || (r.initial ?? '').toLowerCase().includes(term)) && matchStatus
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
    <div style={{fontFamily:'Inter,system-ui,sans-serif',background:T.surface,minHeight:'100vh'}}>
      <div style={{background:"white",borderBottom:`1px solid ${T.border}`,padding:"20px 28px",marginBottom:"24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
          <div>
            <h1 style={{fontSize:"24px",fontWeight:800,color:T.text,margin:0,letterSpacing:"-0.025em"}}>Amadeus Users</h1>
            <p style={{fontSize:"13px",color:T.textMid,marginTop:"3px"}}>Manage Amadeus login accounts</p>
          </div>
          <div className="flex items-center gap-2">
          {isAdmin && (
          <button onClick={handleExport} disabled={filtered.length === 0} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer',opacity:filtered.length===0?0.4:1}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
          )}
          {isAdmin && <><input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>
          <button onClick={openAdd} style={{display:'flex',alignItems:'center',gap:'7px',padding:'8px 18px',background:T.primary,border:'none',borderRadius:T.radius,fontSize:'13px',fontWeight:700,color:'white',cursor:'pointer'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Amadeus User</button></>}
          </div>
        </div>
      </div>
      <div style={{background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
        <div style={{position:'relative',flex:1}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search login, OID, initial or name..." value={search} onChange={e => setSearch(e.target.value)} style={{width:'100%',padding:'8px 12px 8px 32px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:'white',color:T.text,outline:'none',boxSizing:'border-box'}} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding:'8px 12px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:'white',color:T.text,outline:'none',cursor:'pointer',minWidth:'140px'}}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="resigned">Resigned</option>
        </select>
        <span style={{fontSize:'12px',color:T.textLight,fontWeight:500}}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {loading ? <div style={{textAlign:"center",padding:"60px",color:T.textLight}}>Loading...</div> : (
        <div style={{background:"white",border:`1px solid ${T.border}`,borderRadius:T.radius,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 0.7fr 0.7fr 1fr 1fr 1fr 120px",background:T.surfaceAlt,borderBottom:`2px solid ${T.border}`}}>
            {['Login','Sign-On','Initial','Duty','OTA Client','Status','Linked User','Actions'].map((h,i)=>(
              <div key={h} style={{padding:"10px 14px",fontSize:"16px",fontWeight:800,color:T.primary,textTransform:"uppercase",letterSpacing:"0.07em",textAlign:i===7?"right":"left"}}>{h}</div>
            ))}
          </div>
          {filtered.length===0 ? <div style={{padding:"60px",textAlign:"center",color:T.textLight}}>No Amadeus users found.</div> :
          filtered.map((row,i)=>{
            const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
            const ota = row.ota_client as {company_name?:string}
            const sval = ((row as {status?:string}).status ?? "active").toLowerCase()
            const s = SS[sval] ?? SS.active
            return (
              <div key={row.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr 0.7fr 0.7fr 1fr 1fr 1fr 120px",borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none"}}
                onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceAlt)} onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                <div style={{padding:"13px 14px"}}><span style={{fontFamily:"monospace",fontSize:"16px",fontWeight:700,color:T.text}}>{row.login}</span></div>
                <div style={{padding:"13px 14px"}}><span style={{fontFamily:"monospace",fontSize:"16px",color:T.textMid}}>{row.sign_on_id??"-"}</span></div>
                <div style={{padding:"13px 14px"}}><span style={{fontFamily:"monospace",fontSize:"16px",fontWeight:700,color:"#7c3aed"}}>{row.initial??"-"}</span></div>
                <div style={{padding:"13px 14px"}}><span style={{fontFamily:"monospace",fontSize:"16px",color:T.textMid}}>{row.duty_code??"-"}</span></div>
                <div style={{padding:"13px 14px"}}>{ota ? <span style={{fontSize:"16px",fontWeight:600,padding:"3px 8px",borderRadius:"20px",background:"#f0fdf4",color:"#166534",border:"1px solid #bbf7d0"}}>{ota.company_name}</span> : <span style={{color:T.textLight}}>-</span>}</div>
                <div style={{padding:"13px 14px"}}><span style={{fontSize:"16px",fontWeight:600,padding:"3px 8px",borderRadius:"20px",background:s.bg,color:s.color,border:`1px solid ${s.border}`,textTransform:"capitalize"}}>{sval}</span></div>
                <div style={{padding:"13px 14px"}}>{u ? <><div style={{fontSize:"16px",color:T.text}}>{u.first_name} {u.last_name}</div><div style={{fontSize:"13px",color:T.textLight}}>{u.email_address}</div></> : <span style={{color:T.textLight}}>-</span>}</div>
                <div style={{padding:"13px 14px",display:"flex",justifyContent:"flex-end",gap:"6px"}}>
                  {isAdmin&&(<><button onClick={()=>openEdit(row)} style={{padding:"4px 10px",fontSize:"12px",fontWeight:600,color:T.textMid,background:"white",border:`1px solid ${T.border}`,borderRadius:T.radius,cursor:"pointer"}}>Edit</button>
                  <button onClick={()=>openDelete(row)} style={{padding:"4px 10px",fontSize:"12px",fontWeight:600,color:T.danger,background:"white",border:"1px solid #fecaca",borderRadius:T.radius,cursor:"pointer"}}>Delete</button></>)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Amadeus User' : 'Add Amadeus User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Login <span className="text-red-500">*</span></label>
              <input type="text" value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} placeholder="e.g. JOHNSMITH" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Sign-On ID</label>
              <input type="text" value={form.sign_on_id} onChange={e => setForm(f => ({ ...f, sign_on_id: e.target.value.toUpperCase() }))} placeholder="e.g. 4042GY" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
              <SignOnLookup prefix={form.sign_on_id.replace(/[^0-9]/g, '').slice(0, 4)} records={records} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. JS" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Duty Code</label>
              <input type="text" value={form.duty_code} onChange={e => setForm(f => ({ ...f, duty_code: e.target.value.toUpperCase() }))} placeholder="e.g. TP" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">OID</label>
            <input type="text" value={form.oid} onChange={e => setForm(f => ({ ...f, oid: e.target.value.toUpperCase() }))} placeholder="e.g. KULMY255W" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={(form as {status?: string}).status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
            </select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email_address})</option>)}</select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">OTA
          {/* Create & link new user inline */}
          {!form.user_id && (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Or create & link a new user</p>
              <p className="text-xs text-slate-400">If the user does not exist yet - fill in their details and they will be added to the Users table automatically. If the email already exists, the existing user will be linked instead.</p>
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
          )}</label>
            <div className="flex gap-4">{[true, false].map(v => <label key={String(v)} className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={form.ota === v} onChange={() => setForm(f => ({ ...f, ota: v }))} className="accent-blue-500" /><span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span></label>)}</div></div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Amadeus User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Amadeus user <strong>{editing?.login}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>Cancel</button>
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
            <button onClick={closeImport} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{importing ? 'Importing...' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
