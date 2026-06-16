'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { TravelportUser, User, OTAClient } from '@/types'
import { syncUserToTable } from '@/lib/syncUser'


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

const EMPTY = { sign_on_id: '', cid: '', gtid: '', pcc: '', user_id: '', ota: false, ota_client_id: '' as number | '', newEmail: '', newFirstName: '', newLastName: '', status: 'active',
}

interface ImportRow {
  sign_on_id: string; cid: string; gtid: string; pcc: string; ota: boolean
  _row: number; _errors: string[]
}

export default function TravelportUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<TravelportUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<TravelportUser | null>(null)
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
    const [{ data: tpData }, { data: usersData }, { data: otaData }] = await Promise.all([
      supabase.from('travelport_user').select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)').order('sign_on_id'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
    ])
    setRecords(tpData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: TravelportUser) {
    setEditing(row)
    setForm({ sign_on_id: row.sign_on_id ?? '', cid: row.cid ?? '', gtid: row.gtid ?? '', pcc: row.pcc ?? '', user_id: row.user_id ?? '', ota: row.ota, ota_client_id: row.ota_client_id ?? '', newEmail: '', newFirstName: '', newLastName: '', status: (row as {status?: string}).status ?? 'active' })
    setError(''); setSaving(false); setModalOpen(true)
  }
  function openDelete(row: TravelportUser) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.sign_on_id.trim() && !form.cid.trim()) { setError('Sign-On ID or CID is required.'); return }
    setSaving(true); setError('')
    // Check for duplicate Sign-On ID under same OTA Client
    if (form.sign_on_id.trim() && form.ota_client_id) {
      const { data: dupCheck } = await supabase.from('travelport_user')
        .select('id').ilike('sign_on_id', form.sign_on_id.trim())
        .eq('ota_client_id', form.ota_client_id)
        .maybeSingle()
      if (dupCheck && (!editing || dupCheck.id !== editing.id)) {
        setError(`Sign-On ID "${form.sign_on_id.trim().toUpperCase()}" already exists for this OTA Client.`)
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

    const payload = { sign_on_id: form.sign_on_id.trim().toUpperCase() || null, cid: form.cid.trim().toUpperCase() || null, gtid: form.gtid.trim().toUpperCase() || null, pcc: form.pcc.trim().toUpperCase() || null, user_id: resolvedUserId, ota: form.ota, ota_client_id: form.ota_client_id || null, status: (form as {status?: string}).status ?? 'active' }
    const { error: err } = editing
      ? await supabase.from('travelport_user').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('travelport_user').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }

    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    // Archive to resigned_user before deleting
    const u = (editing as TravelportUser & { users?: { id?: string; first_name?: string; last_name?: string; email_address?: string } }).users
    const ota = (editing as TravelportUser & { ota_client?: { company_name?: string } }).ota_client
    await supabase.from('resigned_user').insert({
      source_gds:            'Travelport',
      source_record_id:      editing.id,
      full_name:             u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : null,
      initial:               (editing as TravelportUser & { initial?: string }).initial ?? null,
      email:                 u?.email_address ?? null,
      travelport_sign_on_id: editing.sign_on_id ?? null,
      travelport_cid:        editing.cid ?? null,
      travelport_gtid:       editing.gtid ?? null,
      travelport_pcc:        editing.pcc ?? null,
      pcc:                   editing.pcc ?? null,
      ota_client:            ota?.company_name ?? null,
      date_created_in_gds:   new Date(editing.created_at).toISOString().slice(0, 10),
      date_resigned:         new Date().toISOString().slice(0, 10),
    })
    // Delete the GDS user record
    await supabase.from('travelport_user').delete().eq('id', editing.id)
    // Also delete from users table if linked
    if (u?.email_address) {
      await supabase.from('users').delete().eq('email_address', u.email_address)
    }
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => {
      const u = r.users as User
      return { 'No.': i + 1, 'Sign-On ID': r.sign_on_id ?? '', 'CID': r.cid ?? '', 'GTID': r.gtid ?? '', 'PCC': r.pcc ?? '', 'OTA': r.ota ? 'Yes' : 'No', 'Linked User': u ? `${u.first_name} ${u.last_name}` : '', 'Created': new Date(r.created_at).toLocaleDateString('en-MY') }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Travelport Users')
    XLSX.writeFile(wb, `GDSHub_Travelport_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'Sign-On ID': 'JS01', 'CID': 'CID123', 'GTID': 'GT456', 'PCC': 'K3MY', 'OTA': 'No' },
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Travelport Users')
    XLSX.writeFile(wb, 'GDSHub_Travelport_Users_Template.xlsx')
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
        const sign_on_id = getF(r, 'Sign-On ID', 'SignOnID', 'sign_on_id', 'signon').toUpperCase()
        const cid = getF(r, 'CID', 'cid').toUpperCase()
        const gtid = getF(r, 'GTID', 'gtid').toUpperCase()
        const pcc = getF(r, 'PCC', 'pcc').toUpperCase()
        const ota_raw = getF(r, 'OTA', 'ota').toLowerCase()
        const ota = ota_raw === 'yes' || ota_raw === 'true' || ota_raw === '1'
        const errors: string[] = []
        if (!sign_on_id && !cid) errors.push('Sign-On ID or CID is required')
        return { sign_on_id, cid, gtid, pcc, ota, _row: i + 2, _errors: errors }
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
      const { error } = await supabase.from('travelport_user').insert({ sign_on_id: row.sign_on_id || null, cid: row.cid || null, gtid: row.gtid || null, pcc: row.pcc || null, ota: row.ota })
      if (error) { failed++; failedRows.push(`${row.sign_on_id || row.cid} - ${error.message}`) } else { success++ }
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
    return (r.sign_on_id ?? '').toLowerCase().includes(term) || (r.cid ?? '').toLowerCase().includes(term) || (r.pcc ?? '').toLowerCase().includes(term) || name.includes(term) || (r.initial ?? '').toLowerCase().includes(term) && matchStatus
  })

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const activeCount = records.filter(r=>((r as {status?:string}).status??'active').toLowerCase()==='active').length
  const otaCount = records.filter(r=>r.ota).length

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:T.surface, minHeight:'100vh'}}>
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:'20px 28px',marginBottom:'24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'24px',fontWeight:800,color:T.text,margin:0,letterSpacing:'-0.025em'}}>Travelport Users</h1>
            <p style={{fontSize:'13px',color:T.textMid,marginTop:'3px'}}>Manage Travelport CID and GTID accounts</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <button onClick={handleExport} disabled={filtered.length===0} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer',opacity:filtered.length===0?0.4:1}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,fontSize:'13px',fontWeight:500,color:T.textMid,cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>
              <button onClick={openAdd} style={{display:'flex',alignItems:'center',gap:'7px',padding:'10px 22px',background:T.primary,border:'none',borderRadius:T.radius,fontSize:'17px',fontWeight:700,color:'white',cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Travelport User</button>
            </div>
          )}
        </div>
      </div>
      <div style={{padding:'0 28px 28px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px',marginBottom:'24px'}}>
          {[{label:'Total Users',value:records.length,sub:'registered',accent:false},{label:'Active',value:activeCount,sub:'currently active',accent:false},{label:'Inactive',value:records.length-activeCount,sub:'not active',accent:false},{label:'OTA Users',value:otaCount,sub:'OTA enabled',accent:true}].map((s,i)=>(
            <div key={i} style={{background:s.accent?'#10B981':'white',border:`1px solid ${s.accent?T.primary:T.border}`,borderRadius:T.radius,padding:'16px 18px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:s.accent?'rgba(255,255,255,0.75)':T.textLight,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'6px'}}>{s.label}</div>
              <div style={{fontSize:'26px',fontWeight:800,color:s.accent?'white':T.text,letterSpacing:'-0.03em',lineHeight:1}}>{s.value}</div>
              <div style={{fontSize:'11px',color:s.accent?'rgba(255,255,255,0.65)':T.textLight,marginTop:'4px'}}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,minWidth:'240px'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search Sign-On, CID, PCC, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%',padding:'8px 12px 8px 32px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.text,outline:'none',boxSizing:'border-box'}} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:'8px 12px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.text,outline:'none',cursor:'pointer',minWidth:'140px'}}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="resigned">Resigned</option>
          </select>
          <span style={{fontSize:'17px',color:'#065F46',fontWeight:600}}>{filtered.length} record{filtered.length!==1?'s':''}</span>
        </div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, marginBottom:'12px'}}>
          <span style={{fontSize:'13px', color:T.textLight}}>Showing {filtered.length} Travelport user{filtered.length!==1?'s':''}</span>
        </div>
        {loading ? <div style={{textAlign:'center',padding:'60px',color:T.textLight}}>Loading...</div> : (
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,overflow:'hidden',boxShadow:'0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.1)'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr 0.8fr 120px',background:'#F0FDF4',borderBottom:`2px solid #6EE7B7`}}>
              {['Sign-On','CID','GTID','PCC','Initial','Linked User','Status','Actions'].map((h,i)=>(
                <div key={h} style={{padding:'11px 14px',fontSize:'16px',fontWeight:800,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',textAlign:i===7?'right':'left',borderRight:'1px solid #d1fae5'}}>{h}</div>
              ))}
            </div>
            {filtered.length===0 ? <div style={{padding:'60px',textAlign:'center',color:T.textLight}}>No Travelport users found.</div> :
            filtered.map((row,i)=>{
              const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
              const sval = ((row as {status?:string}).status ?? 'active').toLowerCase()
              const ss = STATUS_STYLE[sval] ?? STATUS_STYLE.active
              return (
                <div key={row.id} style={{display:'grid',gridTemplateColumns:'1fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr 0.8fr 120px',borderBottom:i<filtered.length-1?`1px solid ${T.border}`:'none',transition:'background 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceAlt)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:700,color:T.text}}>{row.sign_on_id??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',color:T.textMid}}>{row.cid??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',color:T.textMid}}>{row.gtid??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:600,padding:'2px 6px',borderRadius:T.radius,background:T.surfaceAlt,border:`1px solid ${T.border}`,color:T.textMid}}>{row.pcc??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:700,color:'#7c3aed'}}>{(row as {initial?:string}).initial??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:'1px solid #f1f5f9'}}>{u?<><div style={{fontSize:'16px',fontWeight:500,color:T.text}}>{u.first_name} {u.last_name}</div><div style={{fontSize:'13px',color:T.textLight}}>{u.email_address}</div></>:<span style={{fontSize:'16px',color:T.textLight}}>-</span>}</div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontSize:'16px',fontWeight:600,padding:'3px 8px',borderRadius:'20px',background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,textTransform:'capitalize'}}>{sval}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'6px',borderRight:'none'}}>
                    {isAdmin&&(<><button onClick={()=>openEdit(row)} style={{padding:'4px 10px',fontSize:'12px',fontWeight:600,color:T.textMid,background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,cursor:'pointer'}}>Edit</button>
                    <button onClick={()=>openDelete(row)} style={{padding:'4px 10px',fontSize:'12px',fontWeight:600,color:T.danger,background:T.card,border:'1px solid #fecaca',borderRadius:T.radius,cursor:'pointer'}}>Delete</button></>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{display:'flex', alignItems:'center', padding:'10px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:T.radius, marginTop:'12px'}}>
          <span style={{fontSize:'13px', color:T.textLight}}>Showing {filtered.length} Travelport user{filtered.length!==1?'s':''}</span>
        </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Travelport User' : 'Add Travelport User'}>
        <div className="space-y-4">

          {/* 1. Create & Link a New User — top */}
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

          {/* 2. Sign-On ID + CID */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Sign-On ID</label>
              <input type="text" value={form.sign_on_id} onChange={e => setForm(f => ({ ...f, sign_on_id: e.target.value.toUpperCase() }))} placeholder="e.g. JS01" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">CID</label>
              <input type="text" value={form.cid} onChange={e => setForm(f => ({ ...f, cid: e.target.value.toUpperCase() }))} placeholder="e.g. CID123" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          </div>

          {/* 3. GTID + PCC */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">GTID</label>
              <input type="text" value={form.gtid} onChange={e => setForm(f => ({ ...f, gtid: e.target.value.toUpperCase() }))} placeholder="e.g. GT456" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">PCC</label>
              <input type="text" value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value.toUpperCase() }))} placeholder="e.g. K3MY" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          </div>

          {/* 4. OTA Client */}
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select></div>

          {/* 5. Status */}
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={(form as {status?: string}).status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
            </select></div>

          {/* 6. Linked User */}
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email_address})</option>)}
            </select></div>

          {/* 7. OTA toggle */}
          <div><label className="block text-sm font-medium text-slate-700 mb-2">OTA</label>
            <div className="flex gap-4">{[true, false].map(v => <label key={String(v)} className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={form.ota === v} onChange={() => setForm(f => ({ ...f, ota: v }))} className="accent-blue-500" /><span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span></label>)}</div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Travelport User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Travelport user <strong className="font-mono">{editing?.sign_on_id ?? editing?.cid}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={closeImport} title="Import Travelport Users" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0 ? <p className="font-medium"> Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p> : (
                <div className="space-y-1"><p className="font-medium"> {importResult.success} imported   {importResult.failed} skipped</p>
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
                Required: <span className="font-mono font-medium text-slate-700">Sign-On ID</span> or <span className="font-mono font-medium text-slate-700">CID</span>  Optional: <span className="font-mono font-medium text-slate-700">GTID</span>, <span className="font-mono font-medium text-slate-700">PCC</span>, <span className="font-mono font-medium text-slate-700">OTA</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Sign-On ID','CID','GTID','PCC','OTA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-bold">{row.sign_on_id || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.cid || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.gtid || '-'}</td>
                        <td className="px-3 py-2 font-mono">{row.pcc || '-'}</td>
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
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{importing ? 'Importing...' : ('Import ' + validRows.length + ' Record' + (validRows.length !== 1 ? 's' : ''))}</button>}
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}
