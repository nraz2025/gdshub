'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { SabreUser, User, OTAClient } from '@/types'
import { syncUserToTable } from '@/lib/syncUser'


const T = {
  primary:'#2563eb', surface:'#f8fafc', surfaceAlt:'#f1f5f9',
  border:'#e2e8f0', text:'#0f172a', textMid:'#475569', textLight:'#94a3b8',
  danger:'#dc2626', radius:'6px',
}
const STATUS_STYLE: Record<string, {bg:string;color:string;border:string}> = {
  Active:   {bg:'#f0fdf4',color:'#166534',border:'#bbf7d0'},
  Inactive: {bg:'#f1f5f9',color:'#64748b',border:'#e2e8f0'},
  Suspended:{bg:'#fffbeb',color:'#92400e',border:'#fde68a'},
  Resigned: {bg:'#fef2f2',color:'#dc2626',border:'#fecaca'},
  Vacant:   {bg:'#f1f5f9',color:'#64748b',border:'#e2e8f0'},
}


type SabreStatus = 'Active' | 'Inactive' | 'Suspended' | 'Resigned'
const STATUSES: SabreStatus[] = ['Active', 'Inactive', 'Suspended', 'Resigned']
const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Inactive:  'bg-slate-100 text-slate-500 border-slate-200',
  Suspended: 'bg-amber-50 text-amber-700 border-amber-200',
  Resigned:  'bg-red-50 text-red-600 border-red-200',
}

const EMPTY = {
  epr: '', initial: '', status: 'Active' as SabreStatus,
  pcc: '', user_id: '', ota_client_id: '' as number | '',
  cta: '', pta: '', minicom: '',
  newEmail: '', newFirstName: '', newLastName: '',
  newEmail: '', newFirstName: '', newLastName: '',
}

interface ImportRow {
  epr: string; initial: string; status: string; pcc: string
  cta: string; pta: string; minicom: string
  _row: number; _errors: string[]
}

export default function SabreUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<SabreUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<SabreUser | null>(null)
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
    const [{ data: sabreData }, { data: usersData }, { data: otaData }] = await Promise.all([
      supabase.from('sabre_user')
        .select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)')
        .order('epr'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
    ])
    setRecords(sabreData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }

  function openEdit(row: SabreUser) {
    setEditing(row)
    setForm({
      epr: row.epr,
      initial: row.initial ?? '',
      status: row.status,
      pcc: row.pcc ?? '',
      user_id: row.user_id ?? '',
      ota_client_id: row.ota_client_id ?? '',
      cta: row.cta ?? '',
      pta: row.pta ?? '',
      minicom: row.minicom ?? '',
      newEmail: '', newFirstName: '', newLastName: '',
    })
    setError(''); setSaving(false); setModalOpen(true)
  }

  function openDelete(row: SabreUser) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.epr.trim()) { setError('EPR is required.'); return }
    setSaving(true); setError('')
    // Check for duplicate EPR under same OTA Client
    const eprUpper = form.epr.trim().toUpperCase()
    const { data: dupCheck } = await supabase.from('sabre_user')
      .select('id').eq('epr', eprUpper)
      .eq('ota_client_id', form.ota_client_id || 0)
      .maybeSingle()
    if (dupCheck && (!editing || dupCheck.id !== editing.id)) {
      setError(`EPR "${eprUpper}" already exists for this OTA Client.`)
      setSaving(false); return
    }
    const audit = await getAuditFields()

    // Auto-sync: if admin entered a new email, ensure user exists in users table
    let resolvedUserId = form.user_id || null
    if (form.newEmail?.trim()) {
      const synced = await syncUserToTable({
        email:     form.newEmail,
        firstName: form.newFirstName ?? '',
        lastName:  form.newLastName  ?? '',
      })
      if (synced) {
        resolvedUserId = synced
      }
    }

    const payload = {
      epr:           form.epr.trim().toUpperCase(),
      initial:       form.initial.trim().toUpperCase() || null,
      status:        form.status,
      pcc:           form.pcc.trim().toUpperCase() || null,
      user_id:       resolvedUserId,
      ota_client_id: form.ota_client_id || null,
      cta:           form.cta.trim() || null,
      pta:           form.pta.trim() || null,
      minicom:       form.minicom.trim() || null,
    }
    const { error: err } = editing
      ? await supabase.from('sabre_user').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('sabre_user').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }

    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    // Archive to resigned_user before deleting
    const u = (editing as SabreUser & { users?: { id?: string; first_name?: string; last_name?: string; email_address?: string } }).users
    const ota = (editing as SabreUser & { ota_client?: { company_name?: string } }).ota_client
    await supabase.from('resigned_user').insert({
      source_gds:         'Sabre',
      source_record_id:   editing.id,
      full_name:          u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
      initial:            (editing as SabreUser & { initial?: string }).initial ?? null,
      email:              u?.email_address ?? null,
      sabre_epr:          editing.epr ?? null,
      sabre_pcc:          editing.pcc ?? null,
      pcc:                editing.pcc ?? null,
      ota_client:         ota?.company_name ?? null,
      date_created_in_gds: new Date(editing.created_at).toISOString().slice(0, 10),
      date_resigned:      new Date().toISOString().slice(0, 10),
    })
    // Delete the GDS user record
    await supabase.from('sabre_user').delete().eq('id', editing.id)
    // Also delete from users table if linked
    if (u?.email_address) {
      await supabase.from('users').delete().eq('email_address', u.email_address)
    }
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => {
      const u = r.users as User
      const ota = r.ota_client as OTAClient
      return {
        'No.':         i + 1,
        'EPR':         r.epr,
        'Initial':     r.initial ?? '',
        'Status':      r.status,
        'PCC':         r.pcc ?? '',
        'OTA Client':  ota?.company_name ?? '',
        'Linked User': u ? `${u.first_name} ${u.last_name}` : '',
        'CTA':         r.cta ?? '',
        'PTA':         r.pta ?? '',
        'Minicom':     r.minicom ?? '',
        'Created':     new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sabre Users')
    XLSX.writeFile(wb, `GDSHub_Sabre_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'EPR': 'AB1', 'Initial': 'AB', 'Status': 'Active', 'PCC': 'KULMY217Z', 'CTA': 'CTA-2024-001', 'PTA': '', 'Minicom': 'MC-456' },
      { 'EPR': 'CD2', 'Initial': 'CD', 'Status': 'Vacant', 'PCC': 'KULMY217Z', 'CTA': '',              'PTA': 'PTA-88',   'Minicom': '' },
    ])
    ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sabre Users')
    XLSX.writeFile(wb, 'GDSHub_Sabre_Users_Template.xlsx')
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
        const epr     = getF(r, 'EPR', 'epr').toUpperCase()
        const initial = getF(r, 'Initial', 'initial').toUpperCase()
        const status  = getF(r, 'Status', 'status')
        const pcc     = getF(r, 'PCC', 'pcc').toUpperCase()
        const cta     = getF(r, 'CTA', 'cta')
        const pta     = getF(r, 'PTA', 'pta')
        const minicom = getF(r, 'Minicom', 'minicom')
        const errors: string[] = []
        if (!epr) errors.push('EPR is required')
        if (status && !STATUSES.includes(status as SabreStatus)) errors.push('Status must be Active, Inactive, Suspended or Resigned')
        return { epr, initial, status: status || 'Active', pcc, cta, pta, minicom, _row: i + 2, _errors: errors }
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
      const { error } = await supabase.from('sabre_user').insert({
        epr: row.epr, initial: row.initial || null, status: row.status,
        pcc: row.pcc || null, cta: row.cta || null, pta: row.pta || null, minicom: row.minicom || null,
      })
      if (error) { failed++; failedRows.push(`${row.epr} - ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const filtered = records.filter(r => {
    const u = r.users as User
    const ota = r.ota_client as OTAClient
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    const matchSearch = r.epr.toLowerCase().includes(term)
      || (r.pcc ?? '').toLowerCase().includes(term)
      || name.includes(term)
      || (ota?.company_name ?? '').toLowerCase().includes(term)
      || (r.initial ?? '').toLowerCase().includes(term)
    const matchStatus = filterStatus === 'all' || r.status === filterStatus
    return matchSearch && matchStatus
  })

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'epr',     label: 'EPR',     render: (row: SabreUser) => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{row.epr}</span> },
    { key: 'initial', label: 'Initial', render: (row: SabreUser) => <span className="text-slate-600">{row.initial ?? '-'}</span> },
    { key: 'status',  label: 'Status',  render: (row: SabreUser) => <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[row.status]}`}>{row.status}</span> },
    { key: 'pcc',     label: 'PCC',     render: (row: SabreUser) => <span className="font-mono text-xs text-slate-600">{row.pcc ?? '-'}</span> },
    {
      key: 'ota_client_id', label: 'OTA Client',
      render: (row: SabreUser) => {
        const ota = row.ota_client as OTAClient
        return ota
          ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">{ota.company_name}</span>
          : <span className="text-slate-300 text-xs">-</span>
      }
    },
    {
      key: 'user_id', label: 'Linked User',
      render: (row: SabreUser) => {
        const u = row.users as User
        return u
          ? <div><p className="text-sm text-slate-700 font-medium">{u.first_name} {u.last_name}</p><p className="text-xs text-slate-400">{u.email_address}</p></div>
          : <span className="text-slate-300 text-xs">-</span>
      }
    },
    { key: 'cta',     label: 'CTA',     render: (row: SabreUser) => row.cta ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.cta}</span> : <span className="text-slate-300 text-xs">-</span> },
    { key: 'pta',     label: 'PTA',     render: (row: SabreUser) => row.pta ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.pta}</span> : <span className="text-slate-300 text-xs">-</span> },
    { key: 'minicom', label: 'Minicom', render: (row: SabreUser) => row.minicom ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.minicom}</span> : <span className="text-slate-300 text-xs">-</span> },
    {
      key: 'modified_at', label: 'Last Modified',
      render: (row: SabreUser) => {
        const r = row as SabreUser & {modified_at?: string; modified_by?: string}
        if (!r.modified_at) return <span className="text-slate-300 text-xs">-</span>
        return (
          <div>
            <p className="text-xs text-slate-600">{new Date(r.modified_at).toLocaleDateString('en-MY')}</p>
            {r.modified_by && <p className="text-xs text-slate-400">{r.modified_by}</p>}
          </div>
        )
      }
    },
    { key: 'created_at', label: 'Created', render: (row: SabreUser) => new Date(row.created_at).toLocaleDateString('en-MY') },
  ]

  const activeCount = records.filter(r=>r.status==='Active').length
  const otaCount = records.filter(r=>r.ota).length

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:T.surface, minHeight:'100vh'}}>
      <div style={{background:'white',borderBottom:`1px solid ${T.border}`,padding:'20px 28px',marginBottom:'24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'24px',fontWeight:800,color:T.text,margin:0,letterSpacing:'-0.025em'}}>Sabre Users</h1>
            <p style={{fontSize:'13px',color:T.textMid,marginTop:'3px'}}>Manage Sabre EPR accounts</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <button onClick={handleExport} disabled={filtered.length===0} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer',opacity:filtered.length===0?0.4:1}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>
              <button onClick={openAdd} style={{display:'flex',alignItems:'center',gap:'7px',padding:'8px 18px',background:T.primary,border:'none',borderRadius:T.radius,fontSize:'13px',fontWeight:700,color:'white',cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Sabre User</button>
            </div>
          )}
        </div>
      </div>
      <div style={{padding:'0 28px 28px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px',marginBottom:'24px'}}>
          {[{label:'Total Users',value:records.length,sub:'registered',accent:false},{label:'Active',value:activeCount,sub:'currently active',accent:false},{label:'Inactive',value:records.length-activeCount,sub:'not active',accent:false},{label:'OTA Users',value:otaCount,sub:'OTA enabled',accent:true}].map((s,i)=>(
            <div key={i} style={{background:s.accent?T.primary:'white',border:`1px solid ${s.accent?T.primary:T.border}`,borderRadius:T.radius,padding:'16px 18px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:s.accent?'rgba(255,255,255,0.75)':T.textLight,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'6px'}}>{s.label}</div>
              <div style={{fontSize:'26px',fontWeight:800,color:s.accent?'white':T.text,letterSpacing:'-0.03em',lineHeight:1}}>{s.value}</div>
              <div style={{fontSize:'11px',color:s.accent?'rgba(255,255,255,0.65)':T.textLight,marginTop:'4px'}}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,minWidth:'240px'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search EPR, PCC, OTA, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%',padding:'8px 12px 8px 32px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:'white',color:T.text,outline:'none',boxSizing:'border-box'}} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:'8px 12px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:'white',color:T.text,outline:'none',cursor:'pointer',minWidth:'140px'}}>
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{fontSize:'12px',color:T.textLight,fontWeight:500}}>{filtered.length} record{filtered.length!==1?'s':''}</span>
        </div>
        {loading ? <div style={{textAlign:'center',padding:'60px',color:T.textLight}}>Loading...</div> : (
          <div style={{background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 0.7fr 0.7fr 1fr 1fr 0.8fr 120px',background:T.surfaceAlt,borderBottom:`2px solid ${T.border}`}}>
              {['EPR','PCC','Initial','OTA Client','Linked User','Status','Actions'].map((h,i)=>(
                <div key={h} style={{padding:'11px 14px',fontSize:'16px',fontWeight:800,color:T.primary,textTransform:'uppercase',letterSpacing:'0.07em',textAlign:i===6?'right':'left'}}>{h}</div>
              ))}
            </div>
            {filtered.length===0 ? <div style={{padding:'60px',textAlign:'center',color:T.textLight}}>No Sabre users found.</div> :
            filtered.map((row,i)=>{
              const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
              const ota = row.ota_client as {company_name?:string}
              const ss = STATUS_STYLE[row.status] ?? STATUS_STYLE.Active
              return (
                <div key={row.id} style={{display:'grid',gridTemplateColumns:'1fr 0.7fr 0.7fr 1fr 1fr 0.8fr 120px',borderBottom:i<filtered.length-1?`1px solid ${T.border}`:'none',transition:'background 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceAlt)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:700,color:T.text}}>{row.epr}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:600,padding:'2px 6px',borderRadius:T.radius,background:T.surfaceAlt,border:`1px solid ${T.border}`,color:T.textMid}}>{row.pcc??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:700,color:'#7c3aed'}}>{(row as {initial?:string}).initial??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}>{ota?<span style={{fontSize:'16px',fontWeight:600,padding:'3px 8px',borderRadius:'20px',background:'#f0fdf4',color:'#166534',border:'1px solid #bbf7d0'}}>{ota.company_name}</span>:<span style={{fontSize:'16px',color:T.textLight}}>-</span>}</div>
                  <div style={{padding:'13px 14px',display:'flex',flexDirection:'column',justifyContent:'center'}}>{u?<><div style={{fontSize:'16px',fontWeight:500,color:T.text}}>{u.first_name} {u.last_name}</div><div style={{fontSize:'13px',color:T.textLight}}>{u.email_address}</div></>:<span style={{fontSize:'16px',color:T.textLight}}>-</span>}</div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}><span style={{fontSize:'16px',fontWeight:600,padding:'3px 8px',borderRadius:'20px',background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`}}>{row.status}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'6px'}}>
                    {isAdmin&&(<><button onClick={()=>openEdit(row)} style={{padding:'4px 10px',fontSize:'12px',fontWeight:600,color:T.textMid,background:'white',border:`1px solid ${T.border}`,borderRadius:T.radius,cursor:'pointer'}}>Edit</button>
                    <button onClick={()=>openDelete(row)} style={{padding:'4px 10px',fontSize:'12px',fontWeight:600,color:T.danger,background:'white',border:'1px solid #fecaca',borderRadius:T.radius,cursor:'pointer'}}>Delete</button></>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      {/*  Add / Edit Modal  */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sabre User' : 'Add Sabre User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">EPR <span className="text-red-500">*</span></label>
              <input type="text" value={form.epr} onChange={e => setForm(f => ({ ...f, epr: e.target.value.toUpperCase() }))} placeholder="e.g. AB1" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. AB" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SabreStatus }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC</label>
              <input type="text" value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value.toUpperCase() }))} placeholder="e.g. KULMY217Z" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          {/* OTA Client - from ota_client table */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </div>

          {/* Linked User - from users table */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} - {u.email_address}</option>)}
            </select>
          </div>

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
          )}

          {/* CTA, PTA, Minicom - freetext license */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">CTA License</label>
            <input type="text" value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} placeholder="e.g. CTA-2024-001" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PTA License</label>
            <input type="text" value={form.pta} onChange={e => setForm(f => ({ ...f, pta: e.target.value }))} placeholder="e.g. PTA-88" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Minicom License</label>
            <input type="text" value={form.minicom} onChange={e => setForm(f => ({ ...f, minicom: e.target.value }))} placeholder="e.g. MC-456" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/*  Delete Modal  */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Sabre User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Sabre user <strong className="font-mono">{editing?.epr}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/*  Import Modal  */}
      <Modal open={importOpen} onClose={closeImport} title="Import Sabre Users" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-medium"> Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p>
                : <div className="space-y-1"><p className="font-medium"> {importResult.success} imported   {importResult.failed} skipped</p>
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
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                Required: <span className="font-mono font-medium text-slate-700">EPR</span>  Optional: <span className="font-mono font-medium text-slate-700">Initial</span>, <span className="font-mono font-medium text-slate-700">Status</span> (Active/Vacant), <span className="font-mono font-medium text-slate-700">PCC</span>, <span className="font-mono font-medium text-slate-700">CTA</span>, <span className="font-mono font-medium text-slate-700">PTA</span>, <span className="font-mono font-medium text-slate-700">Minicom</span>
                <br/>Note: OTA Client and Linked User must be assigned manually after import.
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','EPR','Initial','Status','PCC','CTA','PTA','Minicom','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-bold">{row.epr || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2">{row.initial || '-'}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{row.status}</span></td>
                        <td className="px-3 py-2 font-mono">{row.pcc || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.cta || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.pta || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.minicom || '-'}</td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium"> OK</span> : <span className="text-red-500"> {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:"white",color:T.textMid,cursor:"pointer"}}>{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{importing ? 'Importing...' : ('Import ' + validRows.length + ' Record' + (validRows.length !== 1 ? 's' : ''))}</button>}
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}
