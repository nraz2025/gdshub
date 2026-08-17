'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { TravelportUser, User, OTAClient } from '@/types'
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
  const [pccList, setPccList] = useState<{pcc:string; ota_client?: {company_name?:string} | null}[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOTA, setFilterOTA] = useState('all')
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
    const { data: tpGds } = await supabase.from('gds').select('id').eq('name', 'Travelport').maybeSingle()
    const [{ data: tpData }, { data: usersData }, { data: otaData }, { data: pccData }] = await Promise.all([
      supabase.from('travelport_user').select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)').order('sign_on_id'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
      tpGds?.id
        ? supabase.from('pcc_list').select('pcc, ota_client:ota_client_id(company_name)').eq('gds_id', tpGds.id).order('pcc')
        : Promise.resolve({ data: [] as {pcc:string; ota_client?: {company_name?:string} | null}[] }),
    ])
    setRecords(tpData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setPccList((pccData as unknown as {pcc:string; ota_client?: {company_name?:string} | null}[]) ?? [])
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

  // PCC -> OTA Client name lookup, sourced from GDS Info (pcc_list, Travelport only)
  const pccOtaMap: Record<string, string> = {}
  pccList.forEach(p => {
    const name = (p.ota_client as {company_name?:string} | null)?.company_name
    if (p.pcc && name) pccOtaMap[p.pcc.toUpperCase()] = name
  })
  const getPccAssigned = (pcc?: string | null) => pcc ? pccOtaMap[pcc.toUpperCase()] : undefined

  const filtered = records.filter(r => {
    const u = r.users as User
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    const matchStatus = filterStatus === 'all' || ((r as {status?: string}).status ?? 'active').toLowerCase() === filterStatus.toLowerCase()
    const matchOTA = filterOTA === 'all' || (filterOTA === 'yes' ? r.ota === true : r.ota !== true)
    const matchSearch = (r.sign_on_id ?? '').toLowerCase().includes(term) || (r.cid ?? '').toLowerCase().includes(term) || (r.pcc ?? '').toLowerCase().includes(term) || name.includes(term) || (r.initial ?? '').toLowerCase().includes(term)
    return matchSearch && matchStatus && matchOTA
  })

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const activeCount = records.filter(r=>((r as {status?:string}).status??'active').toLowerCase()==='active').length
  const inactiveCount = records.filter(r=>((r as {status?:string}).status??'active').toLowerCase()==='inactive').length
  const suspendedCount = records.filter(r=>((r as {status?:string}).status??'active').toLowerCase()==='suspended').length
  const otaCount = records.filter(r=>r.ota).length

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Travelport Users</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Travelport 1G/1V platform user accounts and PCC configurations</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
              <button onClick={handleExport} disabled={filtered.length===0}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer', opacity:filtered.length===0?0.4:1}}
                onMouseOver={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer'}}
                onMouseOver={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import
              </button>
              <button onClick={openAdd}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1.5px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Travelport User
              </button>
            </div>
          )}
        </div>

        {/* Stats — real counts */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'22px'}}>
          {[
            { label: 'Total Users', value: records.length, color: D.accent, soft: D.accentSoft, icon: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></> },
            { label: 'Active', value: activeCount, color: D.success, soft: D.successSoft, icon: <polyline points="20 6 9 17 4 12"/> },
            { label: 'Inactive', value: inactiveCount, color: D.warning, soft: D.warningSoft, icon: <><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></> },
            { label: 'Suspended', value: suspendedCount, color: D.danger, soft: D.dangerSoft, icon: <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></> },
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

        {/* Filter */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px', flexWrap:'wrap'}}>
          <div style={{position:'relative', flex:1, minWidth:'240px'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search Sign-On, CID, PCC, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s'}}
              onFocus={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.accentSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'130px'}}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={filterOTA} onChange={e => setFilterOTA(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'130px'}}>
            <option value="all">All OTA</option>
            <option value="yes">OTA: Yes</option>
            <option value="no">OTA: No</option>
          </select>
        </div>

        {loading ? <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div> : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflowX:'auto'}}>
            <div style={{display:'grid', gridTemplateColumns:'minmax(130px,1.3fr) minmax(110px,1.1fr) minmax(200px,2fr) minmax(90px,0.9fr) minmax(90px,0.9fr) minmax(80px,0.8fr) minmax(110px,1.1fr) minmax(170px,170px)', minWidth:'980px', background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
              {['PCC','Sign-On','Linked User','CID','GTID','OTA','Status','Actions'].map((h,i) => (
                <div key={h} style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', textAlign: i===7 ? 'right' : 'left'}}>{h}</div>
              ))}
            </div>
            {filtered.length===0 ? <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>No Travelport users found.</div> :
            filtered.map((row,i) => {
              const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
              const sval = ((row as {status?:string}).status ?? 'active').toLowerCase()
              const statusStyle = sval === 'active' ? { soft: D.successSoft, color: D.success }
                : sval === 'suspended' ? { soft: D.dangerSoft, color: D.danger }
                : { soft: D.warningSoft, color: D.warning }
              const pccAssigned = getPccAssigned(row.pcc)
              return (
                <div key={row.id} style={{display:'grid', gridTemplateColumns:'minmax(130px,1.3fr) minmax(110px,1.1fr) minmax(200px,2fr) minmax(90px,0.9fr) minmax(90px,0.9fr) minmax(80px,0.8fr) minmax(110px,1.1fr) minmax(170px,170px)', minWidth:'980px', borderBottom: i<filtered.length-1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background = D.accentSoft)} onMouseLeave={e=>(e.currentTarget.style.background = 'transparent')}>
                  <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center', gap:'2px'}}>
                    <span style={{fontFamily:'monospace', fontSize:'14px', color:D.fgMuted, textTransform:'uppercase', letterSpacing:'0.03em'}}>{row.pcc??'—'}</span>
                    {pccAssigned && <span style={{fontSize:'12px', color:D.fgDim}}>{pccAssigned}</span>}
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'14px', color:D.fgMuted}}>{row.sign_on_id??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center'}}>{u ? <><div style={{fontSize:'14px', fontWeight:600, color:D.fg}}>{u.first_name} {u.last_name}</div><div style={{fontSize:'12px', color:D.fgDim}}>{u.email_address}</div></> : <span style={{fontSize:'13px', color:D.fgDim}}>—</span>}</div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'14px', color:D.fgMuted, textTransform:'uppercase', letterSpacing:'0.03em'}}>{row.cid??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'14px', color:D.fgMuted, textTransform:'uppercase', letterSpacing:'0.03em'}}>{row.gtid??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'12px', fontWeight:600, padding:'4px 10px', borderRadius:'20px', background: row.ota ? D.cyanSoft : 'rgba(139,148,158,0.10)', color: row.ota ? D.cyan : D.fgMuted}}>{row.ota ? 'Yes' : 'No'}</span>
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:600, padding:'5px 12px', borderRadius:'20px', background:statusStyle.soft, color:statusStyle.color, textTransform:'capitalize'}}>
                      <span style={{width:'6px', height:'6px', borderRadius:'50%', background:statusStyle.color, flexShrink:0}}/>
                      {sval}
                    </span>
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'8px'}}>
                    {isAdmin && (<>
                      <button onClick={()=>openEdit(row)}
                        style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                        onMouseOver={e=>{ e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                        onMouseOut={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                        Edit
                      </button>
                      <button onClick={()=>openDelete(row)}
                        style={{padding:'6px 14px', fontSize:'13px', fontWeight:600, color:D.fgMuted, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'6px', cursor:'pointer'}}
                        onMouseOver={e=>{ e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                        onMouseOut={e=>{ e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Travelport User' : 'Add Travelport User'}>
        <div className="space-y-4" style={{color:"#1e293b"}}>

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
              <select value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white font-mono uppercase">
                <option value="">- Select PCC -</option>
                {[...new Set(pccList.map(p => p.pcc))].sort().map(pcc => <option key={pcc} value={pcc}>{pcc}</option>)}
              </select></div>
          </div>

          {/* 4. Status */}
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={(form as {status?: string}).status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select></div>

          {/* 5. Linked User */}
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email_address})</option>)}
            </select></div>

          {/* 6. OTA toggle */}
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
        <div className="space-y-4" style={{color:"#1e293b"}}>
          <p className="text-sm text-slate-600">Delete Travelport user <strong className="font-mono">{editing?.sign_on_id ?? editing?.cid}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={closeImport} title="Import Travelport Users" size="lg">
        <div className="space-y-4" style={{color:"#1e293b"}}>
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
                    <tr>{['Row','Sign-On ID','CID','GTID','PCC','OTA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-black">{h}</th>)}</tr>
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
  )
}
