'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { SabreUser, User, OTAClient } from '@/types'
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

type SabreStatus = 'Active' | 'Inactive' | 'Suspended'
const STATUSES: SabreStatus[] = ['Active', 'Inactive', 'Suspended']
const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Inactive:  'bg-slate-100 text-slate-500 border-slate-200',
  Suspended: 'bg-amber-50 text-amber-700 border-amber-200',
  Resigned:  'bg-red-50 text-red-600 border-red-200',
}

type EprCategory = 'PST' | 'AET' | 'OTA' | 'JHT' | 'Vendor'
const EPR_CATEGORIES: { label: string; value: EprCategory; min: number; max: number; color: string }[] = [
  { label: 'PST',    value: 'PST',    min: 1000, max: 1999, color: '#3B82F6' },
  { label: 'AET',    value: 'AET',    min: 2000, max: 2999, color: '#8B5CF6' },
  { label: 'OTA',    value: 'OTA',    min: 3000, max: 3999, color: '#10B981' },
  { label: 'JHT',    value: 'JHT',    min: 4000, max: 4999, color: '#EC4899' },
  { label: 'Vendor', value: 'Vendor', min: 9950, max: 9999, color: '#F59E0B' },
]

const EMPTY = {
  epr: '', initial: '', status: 'Active' as SabreStatus,
  pcc: '', user_id: '', ota_client_id: '' as number | '',
  cta: '', pta: '', minicom: '',
  newEmail: '', newFirstName: '', newLastName: '',
  category: '' as EprCategory | '',
  ota: false,
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
  const [resignedUsers, setResignedUsers] = useState<{id:string;full_name:string|null;initial:string|null;email:string|null;sabre_epr:string|null;sabre_pcc:string|null;pcc:string|null;ota_client:string|null;cta:string|null;pta:string|null;minicom:string|null;date_created_in_gds:string|null;date_resigned:string|null}[]>([])
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
  const [nextEpr, setNextEpr] = useState<string | null>(null)
  const [loadingEpr, setLoadingEpr] = useState(false)
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
    const [{ data: sabreData }, { data: usersData }, { data: otaData }, { data: resignedData }] = await Promise.all([
      supabase.from('sabre_user')
        .select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)')
        .order('epr'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
      supabase.from('resigned_user').select('*').eq('source_gds', 'Sabre').order('date_resigned', { ascending: false }),
    ])
    setRecords(sabreData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setResignedUsers(resignedData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setNextEpr(null); setModalOpen(true) }

  async function fetchNextEpr(category: EprCategory) {
    const cat = EPR_CATEGORIES.find(c => c.value === category)
    if (!cat) return
    setLoadingEpr(true)
    // Fetch ALL eprs — filter numerically client-side (epr can be text like AB1)
    const { data } = await supabase.from('sabre_user').select('epr')
    const nums = (data ?? [])
      .map(r => parseInt(r.epr, 10))
      .filter(n => !isNaN(n) && n >= cat.min && n <= cat.max)
    const next = nums.length > 0 ? Math.max(...nums) + 1 : cat.min
    const suggested = next <= cat.max ? String(next) : null
    setNextEpr(suggested)
    // leave epr empty — user types manually; nextEpr shown as hint
    setLoadingEpr(false)
  }

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
      category: (row as SabreUser & { category?: EprCategory }).category ?? '',
      ota: (row as SabreUser & { ota?: boolean }).ota ?? false,
    })
    setError(''); setSaving(false); setNextEpr(null); setModalOpen(true)
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
      category:      form.category || null,
      ota:           form.ota,
    }
    const { error: err } = editing
      ? await supabase.from('sabre_user').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('sabre_user').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }

    // Keep the linked users.ota_client flag in sync with this record's OTA toggle
    if (resolvedUserId) {
      await supabase.from('users').update({ ota_client: form.ota }).eq('id', resolvedUserId)
    }

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
      cta:                editing.cta ?? null,
      pta:                editing.pta ?? null,
      minicom:            editing.minicom ?? null,
      date_created_in_gds: new Date(editing.created_at).toISOString().slice(0, 10),
      date_resigned:      new Date().toISOString().slice(0, 10),
    })
    // Delete the GDS user record
    await supabase.from('sabre_user').delete().eq('id', editing.id)

    // If this person has no OTHER active Sabre/Amadeus/Travelport account, mark them Inactive in Users
    if (u?.email_address) {
      const userRow = await supabase.from('users').select('id').eq('email_address', u.email_address).maybeSingle()
      const userId = userRow.data?.id
      if (userId) {
        const [{ count: sabreCount }, { count: amadeusCount }, { count: tpCount }] = await Promise.all([
          supabase.from('sabre_user').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('amadeus_user').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('travelport_user').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        ])
        const hasOtherActiveAccount = (sabreCount ?? 0) > 0 || (amadeusCount ?? 0) > 0 || (tpCount ?? 0) > 0
        if (!hasOtherActiveAccount) {
          await supabase.from('users').update({ status: 'Inactive' }).eq('id', userId)
        }
      }
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
      { 'EPR': 'CD2', 'Initial': 'CD', 'Status': 'Inactive', 'PCC': 'KULMY217Z', 'CTA': '',              'PTA': 'PTA-88',   'Minicom': '' },
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

  // Detect duplicate Initials across ALL records (not just filtered view)
  const initialCounts: Record<string, number> = {}
  records.forEach(r => {
    const ini = ((r as {initial?:string}).initial ?? '').trim().toUpperCase()
    if (ini) initialCounts[ini] = (initialCounts[ini] ?? 0) + 1
  })
  const isDuplicateInitial = (ini?: string | null) => {
    const v = (ini ?? '').trim().toUpperCase()
    return v !== '' && initialCounts[v] > 1
  }

  // Build sets of CTA/PTA/Minicom values currently in use on active sabre_user records
  const activeCtaSet     = new Set(records.map(r => (r.cta ?? '').trim().toUpperCase()).filter(v => v !== ''))
  const activePtaSet     = new Set(records.map(r => (r.pta ?? '').trim().toUpperCase()).filter(v => v !== ''))
  const activeMinicomSet = new Set(records.map(r => (r.minicom ?? '').trim().toUpperCase()).filter(v => v !== ''))

  // A resigned license row only qualifies if it has at least one non-empty license value.
  // It's hidden once every non-empty value (CTA/PTA/Minicom) has been reused elsewhere.
  const availableLicenses = resignedUsers.filter(row => {
    const cta = (row.cta ?? '').trim().toUpperCase()
    const pta = (row.pta ?? '').trim().toUpperCase()
    const minicom = (row.minicom ?? '').trim().toUpperCase()

    const hasAnyValue = cta !== '' || pta !== '' || minicom !== ''
    if (!hasAnyValue) return false // nothing to offer — don't show

    const ctaStillFree     = cta === ''     || !activeCtaSet.has(cta)
    const ptaStillFree     = pta === ''     || !activePtaSet.has(pta)
    const minicomStillFree = minicom === '' || !activeMinicomSet.has(minicom)

    // Show if at least one non-empty field is still free (not yet reassigned)
    return (cta !== '' && ctaStillFree) || (pta !== '' && ptaStillFree) || (minicom !== '' && minicomStillFree)
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
  const inactiveCount = records.filter(r=>r.status==='Inactive').length
  const otaCount = records.filter(r=>r.ota).length

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:'#f1f5f9', minHeight:'100vh'}}>
      <div style={{padding:'20px 28px',marginBottom:'0'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'24px',fontWeight:700,color:'#1e293b',margin:0,letterSpacing:'-0.02em'}}>Sabre Users</h1>
            <p style={{fontSize:'14px',color:'#64748b',marginTop:'4px'}}>Manage Sabre EPR accounts</p>
          </div>
          {isAdmin && (
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <button onClick={handleExport} disabled={filtered.length===0}
                style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'14px',fontWeight:500,color:'#1e293b',cursor:'pointer',opacity:filtered.length===0?0.4:1,transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'14px',fontWeight:500,color:'#1e293b',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                onMouseOut={e => { e.currentTarget.style.background='#ffffff'; e.currentTarget.style.boxShadow='none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import</button>
              <button onClick={openAdd}
                style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 20px',background:'linear-gradient(135deg, #1a5f3c 0%, #2d8a5e 100%)',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:500,color:'white',cursor:'pointer',boxShadow:'0 4px 14px 0 rgba(26, 95, 60, 0.3)',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 20px 0 rgba(26, 95, 60, 0.4)' }}
                onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px 0 rgba(26, 95, 60, 0.3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Sabre User</button>
            </div>
          )}
        </div>
      </div>
      <div style={{padding:'0 28px 28px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'24px'}}>
          {[{label:'Total Users',value:records.length,sub:'registered'},{label:'Active',value:activeCount,sub:'currently active'},{label:'Inactive',value:inactiveCount,sub:'not active'},{label:'OTA Users',value:otaCount,sub:'OTA enabled',highlighted:true}].map((s,i)=>(
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
              <div style={{fontSize:'11px',fontWeight:700,color: s.highlighted ? 'rgba(255,255,255,0.85)' : '#94a3b8',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'8px'}}>{s.label}</div>
              <div style={{fontSize:'28px',fontWeight:700,color: s.highlighted ? 'white' : '#1e293b',lineHeight:1,marginBottom:'4px'}}>{s.value}</div>
              <div style={{fontSize:'12px',color: s.highlighted ? 'rgba(255,255,255,0.85)' : '#94a3b8'}}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'16px',marginBottom:'16px',flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,minWidth:'280px'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:'16px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search EPR, PCC, OTA, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%',padding:'12px 16px 12px 44px',fontSize:'14px',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#ffffff',color:'#1e293b',outline:'none',boxSizing:'border-box',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
              onFocus={e => { e.currentTarget.style.borderColor='#2d8a5e'; e.currentTarget.style.boxShadow='0 0 0 3px rgba(45, 138, 94, 0.1)' }} onBlur={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.boxShadow='none' }} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:'12px 40px 12px 16px',fontSize:'14px',border:'1px solid #e2e8f0',borderRadius:'8px',background:'#ffffff',color:'#1e293b',outline:'none',cursor:'pointer',minWidth:'140px',appearance:'none',backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right 16px center'}}>
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{fontSize:'14px',color:'#64748b',fontWeight:500}}>{filtered.length} record{filtered.length!==1?'s':''}</span>
        </div>
        <div style={{display:'flex', alignItems:'center', marginBottom:'16px'}}>
          <span style={{fontSize:'14px', color:'#64748b'}}>Showing <strong style={{color:'#1e293b'}}>{filtered.length} Sabre user{filtered.length!==1?'s':''}</strong></span>
        </div>
        {loading ? <div style={{textAlign:'center',padding:'60px',color:'#94a3b8'}}>Loading...</div> : (
          <div style={{background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden',boxShadow:'0 1px 2px 0 rgb(0 0 0 / 0.05)'}}>
            <div style={{display:'grid',gridTemplateColumns:'0.7fr 0.7fr 1fr 0.6fr 0.8fr 0.8fr 0.8fr 1fr 0.8fr 120px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
              {['PCC','EPR','Linked User','Initial','CTA','PTA','Minicom','OTA Client','Status','Actions'].map((h,i)=>(
                <div key={h} style={{padding:'14px 16px',fontSize:'12px',fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.05em',textAlign:i===9?'right':'left',borderRight: i<9 ? '1px solid #e2e8f0' : 'none'}}>{h}</div>
              ))}
            </div>
            {filtered.length===0 ? <div style={{padding:'60px',textAlign:'center',color:T.textLight}}>No Sabre users found.</div> :
            filtered.map((row,i)=>{
              const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
              const ota = row.ota_client as {company_name?:string}
              const ss = STATUS_STYLE[row.status] ?? STATUS_STYLE.Active
              return (
                <div key={row.id} style={{display:'grid',gridTemplateColumns:'0.7fr 0.7fr 1fr 0.6fr 0.8fr 0.8fr 0.8fr 1fr 0.8fr 120px',borderBottom:i<filtered.length-1?'1px solid #e2e8f0':'none',transition:'background 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',fontWeight:600,padding:'6px 14px',borderRadius:'8px',background:'#f8fafc',border:'1px solid #e2e8f0',color:'#64748b',letterSpacing:'0.05em'}}>{row.pcc??'-'}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'14px',fontWeight:600,color:'#1e293b'}}>{row.epr}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',justifyContent:'center',borderRight:'1px solid #f1f5f9'}}>{u?<><div style={{fontSize:'14px',fontWeight:600,color:'#1e293b'}}>{u.first_name} {u.last_name}</div><div style={{fontSize:'12px',color:'#94a3b8'}}>{u.email_address}</div></>:<span style={{fontSize:'14px',color:'#94a3b8'}}>-</span>}</div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}>
                    {(() => {
                      const ini = (row as {initial?:string}).initial
                      const dup = isDuplicateInitial(ini)
                      return ini ? (
                        <span style={{
                          display:'inline-flex', alignItems:'center', justifyContent:'center', width:'32px', height:'32px', borderRadius:'8px',
                          fontSize:'13px', fontWeight:600, textTransform:'uppercase',
                          color: dup ? '#dc2626' : '#a855f7',
                          background: dup ? '#fef2f2' : '#f3e8ff',
                          border: `1px solid ${dup ? '#fecaca' : '#e9d5ff'}`,
                        }}>
                          {ini}
                        </span>
                      ) : <span style={{color:'#cbd5e1'}}>-</span>
                    })()}
                  </div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#64748b',letterSpacing:'0.05em'}}>{row.cta??'-'}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#64748b',letterSpacing:'0.05em'}}>{row.pta??'-'}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#64748b',letterSpacing:'0.05em'}}>{row.minicom??'-'}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}>{ota?<span style={{fontSize:'13px',fontWeight:500,color:'#1e293b'}}>{ota.company_name}</span>:<span style={{fontSize:'14px',color:'#cbd5e1'}}>-</span>}</div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',fontWeight:600,padding:'6px 14px',borderRadius:'9999px',background:row.status==='Active'?'#f0fdf4':ss.bg,color:row.status==='Active'?'#16a34a':ss.color,border:`1px solid ${row.status==='Active'?'#bbf7d0':ss.border}`}}><span style={{width:'6px',height:'6px',borderRadius:'50%',background:row.status==='Active'?'#22c55e':ss.color,flexShrink:0}}/>{row.status}</span></div>
                  <div style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:'8px'}}>
                    {isAdmin&&(<>
                      <button onClick={()=>openEdit(row)}
                        style={{padding:'6px 14px',fontSize:'12px',fontWeight:500,color:'#64748b',background:'#ffffff',border:'1px solid #e2e8f0',borderRadius:'8px',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
                        onMouseOver={e=>{e.currentTarget.style.background='#f8fafc';e.currentTarget.style.color='#1e293b';e.currentTarget.style.boxShadow='0 1px 2px 0 rgb(0 0 0 / 0.05)'}}
                        onMouseOut={e=>{e.currentTarget.style.background='#ffffff';e.currentTarget.style.color='#64748b';e.currentTarget.style.boxShadow='none'}}>
                        Edit
                      </button>
                      <button onClick={()=>openDelete(row)}
                        style={{padding:'6px 14px',fontSize:'12px',fontWeight:500,color:'#ef4444',background:'#ffffff',border:'1px solid #fecaca',borderRadius:'8px',cursor:'pointer',transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'}}
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

        {/* Available License — PCC, CTA, PTA, Minicom from resigned/deleted users, reusable */}
        {!loading && availableLicenses.length > 0 && (
          <div style={{marginTop:'24px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
              <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'#059669'}} />
              <h3 style={{fontSize:'15px',fontWeight:700,color:'#065F46',margin:0}}>Available License</h3>
              <span style={{fontSize:'12px',fontWeight:600,padding:'2px 8px',borderRadius:'20px',background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7'}}>{availableLicenses.length}</span>
            </div>
            <div style={{background:'#FFFFFF',border:`1px solid ${T.border}`,borderRadius:T.radius,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'0.8fr 0.8fr 0.8fr 0.8fr',background:'#ECFDF5',borderBottom:'2px solid #6EE7B7'}}>
                {['PCC','CTA','PTA','Minicom'].map(h=>(
                  <div key={h} style={{padding:'11px 14px',fontSize:'16px',fontWeight:800,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.07em',borderRight:'1px solid #d1fae5'}}>{h}</div>
                ))}
              </div>
              {availableLicenses.map((row, i) => (
                <div key={row.id} style={{display:'grid',gridTemplateColumns:'0.8fr 0.8fr 0.8fr 0.8fr',borderBottom:i<availableLicenses.length-1?`1px solid ${T.border}`:'none'}}>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'16px',fontWeight:600,padding:'2px 6px',borderRadius:T.radius,background:T.surfaceAlt,border:`1px solid ${T.border}`,color:T.textMid}}>{row.pcc??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',fontWeight:700,color:'#059669',background:'#ECFDF5',padding:'2px 7px',borderRadius:'6px',border:'1px solid #6EE7B7'}}>{row.cta??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center',borderRight:'1px solid #f1f5f9'}}><span style={{fontFamily:'monospace',fontSize:'13px',fontWeight:700,color:'#059669',background:'#ECFDF5',padding:'2px 7px',borderRadius:'6px',border:'1px solid #6EE7B7'}}>{row.pta??'-'}</span></div>
                  <div style={{padding:'13px 14px',display:'flex',alignItems:'center'}}><span style={{fontFamily:'monospace',fontSize:'13px',fontWeight:700,color:'#059669',background:'#ECFDF5',padding:'2px 7px',borderRadius:'6px',border:'1px solid #6EE7B7'}}>{row.minicom??'-'}</span></div>
                </div>
              ))}
            </div>
            <p style={{fontSize:'12px',color:T.textLight,marginTop:'8px',fontStyle:'italic'}}>
              💡 These licenses were freed up from deleted users and can be reassigned to a new Sabre user. Rows disappear automatically once CTA, PTA, and Minicom have all been reused.
            </p>
          </div>
        )}
      {/*  Add / Edit Modal  */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sabre User' : 'Add Sabre User'}>
        <div className="space-y-4">

          {/* 1. Category selector — add only */}
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Category <span className="text-red-500">*</span></label>
              <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px'}}>
                {EPR_CATEGORIES.map(cat => (
                  <button key={cat.value} type="button"
                    onClick={() => { setForm(f => ({ ...f, category: cat.value })); fetchNextEpr(cat.value) }}
                    style={{
                      padding: '8px 4px', fontSize: '12px', fontWeight: 700, textAlign: 'center',
                      border: `2px solid ${form.category === cat.value ? cat.color : '#E2E8F0'}`,
                      borderRadius: '8px',
                      background: form.category === cat.value ? cat.color + '18' : '#fff',
                      color: form.category === cat.value ? cat.color : '#64748B',
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

          {/* 3. EPR + Initial */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">EPR <span className="text-red-500">*</span></label>
              <input type="text" value={form.epr}
                onChange={e => setForm(f => ({ ...f, epr: e.target.value.toUpperCase() }))}
                placeholder={loadingEpr ? 'Loading...' : 'e.g. 1001'}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase"
                readOnly={loadingEpr}
              />
              {!editing && nextEpr && (
                <p className="text-xs text-emerald-600 mt-1 font-medium">✓ Next available: {nextEpr}</p>
              )}
              {!editing && form.category && !nextEpr && !loadingEpr && (
                <p className="text-xs text-red-500 mt-1">Range full — no EPR available in this tier</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. AB" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          {/* 4. Status + PCC */}
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

          {/* 5. OTA Client */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">- None -</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </div>

          {/* 5b. OTA toggle */}
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

          {/* 6. Linked User — edit only (add uses Create & Link above) */}
          {editing && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                <option value="">- None -</option>
                {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} - {u.email_address}</option>)}
              </select>
            </div>
          )}

          {/* 7. CTA, PTA, Minicom */}
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
            <button onClick={() => setModalOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/*  Delete Modal  */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Sabre User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Sabre user <strong className="font-mono">{editing?.epr}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
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
                Required: <span className="font-mono font-medium text-slate-700">EPR</span>  Optional: <span className="font-mono font-medium text-slate-700">Initial</span>, <span className="font-mono font-medium text-slate-700">Status</span> (Active/Inactive/Suspended), <span className="font-mono font-medium text-slate-700">PCC</span>, <span className="font-mono font-medium text-slate-700">CTA</span>, <span className="font-mono font-medium text-slate-700">PTA</span>, <span className="font-mono font-medium text-slate-700">Minicom</span>
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
            <button onClick={closeImport} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{importing ? 'Importing...' : ('Import ' + validRows.length + ' Record' + (validRows.length !== 1 ? 's' : ''))}</button>}
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}
