'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { SabreUser, User, OTAClient } from '@/types'
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

type SabreStatus = 'Active' | 'Inactive' | 'Suspended'
const STATUSES: SabreStatus[] = ['Active', 'Inactive', 'Suspended']
const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Inactive:  'bg-slate-100 text-slate-500 border-slate-200',
  Suspended: 'bg-amber-50 text-amber-700 border-amber-200',
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
  cta: '', pta: '', minicom: '', notes: '',
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
  const [pccList, setPccList] = useState<{pcc:string; ota_client?: {company_name?:string} | null}[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOTA, setFilterOTA] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<SabreUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingLicenseId, setDeletingLicenseId] = useState<string | null>(null)
  const [showLicenseHistory, setShowLicenseHistory] = useState(false)
  const [licenseHistory, setLicenseHistory] = useState<{id:number;pcc:string|null;cta:string|null;pta:string|null;minicom:string|null;resigned_full_name:string|null;resigned_email:string|null;deleted_by:string|null;deleted_at:string}[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
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
    const { data: sabreGds } = await supabase.from('gds').select('id').eq('name', 'Sabre').maybeSingle()
    const [{ data: sabreData }, { data: usersData }, { data: otaData }, { data: resignedData }, { data: pccData }] = await Promise.all([
      supabase.from('sabre_user')
        .select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)')
        .order('epr'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
      supabase.from('resigned_user').select('*').eq('source_gds', 'Sabre').order('date_resigned', { ascending: false }),
      sabreGds?.id
        ? supabase.from('pcc_list').select('pcc, ota_client:ota_client_id(company_name)').eq('gds_id', sabreGds.id).order('pcc')
        : Promise.resolve({ data: [] as {pcc:string; ota_client?: {company_name?:string} | null}[] }),
    ])
    setRecords(sabreData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setResignedUsers(resignedData ?? [])
    setPccList((pccData as unknown as {pcc:string; ota_client?: {company_name?:string} | null}[]) ?? [])
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
      notes: (row as SabreUser & { notes?: string }).notes ?? '',
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
      notes:         form.notes.trim() || null,
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
      // Re-evaluate this person's overall status across Sabre/Amadeus/Travelport
      await syncUserStatus(resolvedUserId)
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
      const ota = r.ota_client as OTAClient
      return {
        'No.':         i + 1,
        'EPR':         r.epr,
        'Initial':     r.initial ?? '',
        'Status':      r.status,
        'PCC':         r.pcc ?? '',
        'OTA Client':  ota?.company_name ?? '',
        'Linked User': u ? `${u.first_name} ${u.last_name}` : '',
        'Email Address': u?.email_address ?? '',
        'CTA':         r.cta ?? '',
        'PTA':         r.pta ?? '',
        'Minicom':     r.minicom ?? '',
        'Created':     new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 28 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }]
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
    const matchOTA = filterOTA === 'all' || (filterOTA === 'yes' ? r.ota === true : r.ota !== true)
    return matchSearch && matchStatus && matchOTA
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

  // PCC -> OTA Client name lookup, sourced from GDS Info (pcc_list)
  const pccOtaMap: Record<string, string> = {}
  pccList.forEach(p => {
    const name = (p.ota_client as {company_name?:string} | null)?.company_name
    if (p.pcc && name) pccOtaMap[p.pcc.toUpperCase()] = name
  })
  const getPccAssigned = (pcc?: string | null) => pcc ? pccOtaMap[pcc.toUpperCase()] : undefined

  // Build sets of CTA/PTA/Minicom values currently in use on active sabre_user records
  const activeCtaSet     = new Set(records.map(r => (r.cta ?? '').trim().toUpperCase()).filter(v => v !== ''))
  const activePtaSet     = new Set(records.map(r => (r.pta ?? '').trim().toUpperCase()).filter(v => v !== ''))
  const activeMinicomSet = new Set(records.map(r => (r.minicom ?? '').trim().toUpperCase()).filter(v => v !== ''))

  //  Delete an available-license row (logs it, then removes the resigned_user record entirely) 
  async function deleteLicense(id: string) {
    if (!confirm('Delete this available license record? This permanently removes it from the database and it will no longer be offered for reassignment. This action will be logged.')) return
    setDeletingLicenseId(id)
    const row = resignedUsers.find(r => r.id === id)
    const { data: { user } } = await supabase.auth.getUser()
    if (row) {
      const { error: logErr } = await supabase.from('license_deletion_log').insert({
        source_gds:          'Sabre',
        pcc:                 row.pcc ?? row.sabre_pcc ?? null,
        cta:                 row.cta ?? null,
        pta:                 row.pta ?? null,
        minicom:             row.minicom ?? null,
        resigned_user_id:    row.id,
        resigned_full_name:  row.full_name ?? null,
        resigned_email:      row.email ?? null,
        deleted_by:          user?.email ?? null,
      })
      if (logErr) { setError(`Could not log deletion history: ${logErr.message}`); setDeletingLicenseId(null); return }
    }
    const { error: e } = await supabase.from('resigned_user').delete().eq('id', id)
    if (e) { setError(e.message); setDeletingLicenseId(null); return }
    setResignedUsers(prev => prev.filter(r => r.id !== id))
    setDeletingLicenseId(null)
  }

  async function loadLicenseHistory() {
    setLoadingHistory(true); setError('')
    const { data, error: e } = await supabase.from('license_deletion_log').select('*').eq('source_gds', 'Sabre').order('deleted_at', { ascending: false })
    if (e) { setError(e.message); setLoadingHistory(false); return }
    setLicenseHistory(data ?? [])
    setLoadingHistory(false)
    setShowLicenseHistory(true)
  }

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
  const suspendedCount = records.filter(r=>r.status==='Suspended').length
  const otaCount = records.filter(r=>r.ota).length

  const inpDark = (extra?: object) => ({ padding:'9px 12px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lblDark = { fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Sabre Users</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Sabre platform user accounts and PCC configurations</p>
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
                Add Sabre User
              </button>
            </div>
          )}
        </div>

        {/* Stats — real counts */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'22px'}}>
          {[
            { label: 'Total Users', value: records.length, color: D.accent, soft: D.accentSoft, icon: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></> },
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
            <input type="text" placeholder="Search EPR, PCC, initial or name..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s'}}
              onFocus={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.accentSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'130px'}}>
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
            <div style={{display:'grid', gridTemplateColumns:'minmax(130px,1.3fr) minmax(100px,1fr) minmax(200px,2.5fr) minmax(85px,0.85fr) minmax(100px,1fr) minmax(100px,1fr) minmax(100px,1fr) minmax(80px,0.8fr) minmax(150px,1.5fr) minmax(110px,1.1fr) minmax(170px,170px)', minWidth:'1325px', background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
              {['PCC','EPR','Linked User','Initial','CTA','PTA','Minicom','OTA','Notes','Status','Actions'].map((h,i) => (
                <div key={h} style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', textAlign: i===10 ? 'right' : 'left'}}>{h}</div>
              ))}
            </div>
            {filtered.length===0 ? <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>No Sabre users found.</div> :
            filtered.map((row,i) => {
              const u = row.users as {first_name?:string;last_name?:string;email_address?:string}
              const pccAssigned = getPccAssigned(row.pcc)
              const status = row.status ?? 'Active'
              const statusStyle = status === 'Active' ? { soft: D.successSoft, color: D.success }
                : status === 'Suspended' ? { soft: D.dangerSoft, color: D.danger }
                : { soft: D.warningSoft, color: D.warning }
              const ini = (row as {initial?:string}).initial
              const dup = isDuplicateInitial(ini)
              const ota = (row as {ota?:boolean}).ota
              return (
                <div key={row.id} style={{display:'grid', gridTemplateColumns:'minmax(130px,1.3fr) minmax(100px,1fr) minmax(200px,2.5fr) minmax(85px,0.85fr) minmax(100px,1fr) minmax(100px,1fr) minmax(100px,1fr) minmax(80px,0.8fr) minmax(150px,1.5fr) minmax(110px,1.1fr) minmax(170px,170px)', minWidth:'1325px', borderBottom: i<filtered.length-1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                  onMouseEnter={e=>(e.currentTarget.style.background = D.accentSoft)} onMouseLeave={e=>(e.currentTarget.style.background = 'transparent')}>
                  <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center', gap:'2px'}}>
                    <span style={{fontFamily:'monospace', fontSize:'14px', fontWeight:600, color:D.fg, letterSpacing:'0.03em'}}>{row.pcc??'—'}</span>
                    {pccAssigned && <span style={{fontSize:'12px', color:D.fgDim}}>{pccAssigned}</span>}
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'14px', fontWeight:600, color:D.fg}}>{row.epr}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', justifyContent:'center'}}>{u ? <><div style={{fontSize:'14px', fontWeight:600, color:D.fg}}>{u.first_name} {u.last_name}</div><div style={{fontSize:'12px', color:D.fgDim}}>{u.email_address}</div></> : <span style={{fontSize:'13px', color:D.fgDim}}>—</span>}</div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    {ini ? (
                      <span style={{display:'inline-flex', alignItems:'center', justifyContent:'center', width:'30px', height:'30px', borderRadius:'8px', fontSize:'13px', fontWeight:700, textTransform:'uppercase',
                        color: dup ? D.danger : D.accent, background: dup ? D.dangerSoft : D.accentSoft}}>
                        {ini}
                      </span>
                    ) : <span style={{color:D.fgDim}}>—</span>}
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', color:D.fgMuted}}>{row.cta??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', color:D.fgMuted}}>{row.pta??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', color:D.fgMuted}}>{row.minicom??'—'}</span></div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'12px', fontWeight:600, padding:'4px 10px', borderRadius:'20px', background: ota ? D.cyanSoft : 'rgba(139,148,158,0.10)', color: ota ? D.cyan : D.fgMuted}}>{ota ? 'Yes' : 'No'}</span>
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{fontSize:'13px', color:D.fgMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={(row as {notes?: string}).notes ?? ''}>{(row as {notes?: string}).notes || <span style={{color:D.fgDim}}>—</span>}</span>
                  </div>
                  <div style={{padding:'12px 16px', display:'flex', alignItems:'center'}}>
                    <span style={{display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:600, padding:'5px 12px', borderRadius:'20px', background:statusStyle.soft, color:statusStyle.color}}>
                      <span style={{width:'6px', height:'6px', borderRadius:'50%', background:statusStyle.color, flexShrink:0}}/>
                      {status}
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

        {/* Available License */}
        {!loading && availableLicenses.length > 0 && (
          <div style={{marginTop:'22px'}}>
            {error && <div style={{background:D.dangerSoft, border:`1px solid ${D.danger}`, color:D.danger, padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'12px'}}>{error}</div>}
            <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px'}}>
              <span style={{width:'8px', height:'8px', borderRadius:'50%', background:D.success}} />
              <h3 style={{fontSize:'15px', fontWeight:700, color:D.success, margin:0}}>Available License</h3>
              <span style={{fontSize:'12px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:D.successSoft, color:D.success}}>{availableLicenses.length}</span>
              <button onClick={loadLicenseHistory} disabled={loadingHistory}
                style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:600, color:D.fgMuted, background:D.card, border:`1px solid ${D.border}`, borderRadius:'7px', padding:'6px 12px', cursor:'pointer'}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {loadingHistory ? 'Loading' : 'View Deletion History'}
              </button>
            </div>
            <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>
              <div style={{display:'grid', gridTemplateColumns:'0.8fr 0.8fr 0.8fr 0.8fr 0.6fr', background:D.successSoft, borderBottom:`2px solid ${D.success}`}}>
                {['PCC','CTA','PTA','Minicom',''].map(h => (
                  <div key={h||'actions'} style={{padding:'11px 14px', fontSize:'13px', fontWeight:700, color:D.success, textTransform:'uppercase', letterSpacing:'0.07em'}}>{h}</div>
                ))}
              </div>
              {availableLicenses.map((row, i) => (
                <div key={row.id} style={{display:'grid', gridTemplateColumns:'0.8fr 0.8fr 0.8fr 0.8fr 0.6fr', borderBottom: i<availableLicenses.length-1 ? `1px solid ${D.border}` : 'none'}}>
                  <div style={{padding:'12px 14px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', fontWeight:600, padding:'2px 8px', borderRadius:'6px', background:D.bg, border:`1px solid ${D.border}`, color:D.fgMuted}}>{row.pcc??'—'}</span></div>
                  <div style={{padding:'12px 14px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', fontWeight:700, color:D.success, background:D.successSoft, padding:'2px 7px', borderRadius:'6px'}}>{row.cta??'—'}</span></div>
                  <div style={{padding:'12px 14px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', fontWeight:700, color:D.success, background:D.successSoft, padding:'2px 7px', borderRadius:'6px'}}>{row.pta??'—'}</span></div>
                  <div style={{padding:'12px 14px', display:'flex', alignItems:'center'}}><span style={{fontFamily:'monospace', fontSize:'13px', fontWeight:700, color:D.success, background:D.successSoft, padding:'2px 7px', borderRadius:'6px'}}>{row.minicom??'—'}</span></div>
                  <div style={{padding:'12px 14px', display:'flex', alignItems:'center'}}>
                    <button onClick={() => deleteLicense(row.id)} disabled={deletingLicenseId === row.id}
                      style={{display:'flex', alignItems:'center', gap:'5px', padding:'5px 10px', fontSize:'12px', fontWeight:600, color:D.danger, background:D.dangerSoft, border:`1px solid ${D.danger}`, borderRadius:'6px', cursor:'pointer', opacity:deletingLicenseId===row.id?0.6:1}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      {deletingLicenseId === row.id ? 'Deleting' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p style={{fontSize:'13px', color:D.fgDim, marginTop:'8px', fontStyle:'italic'}}>
              These licenses were freed up from deleted users and can be reassigned to a new Sabre user. Rows disappear automatically once CTA, PTA, and Minicom have all been reused.
            </p>
          </div>
        )}
      {/*  Add / Edit Modal  */}
      {modalOpen && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
        <div style={{width:'100%', maxWidth:'640px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${D.accentSoft}`}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}>
            <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>{editing ? 'Edit Sabre User' : 'Add Sabre User'}</h2>
            <button onClick={() => setModalOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
          </div>

          {/* 1. Category selector — add only */}
          {!editing && (
            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Category <span style={{color:D.danger}}>*</span></label>
              <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px'}}>
                {EPR_CATEGORIES.map(cat => (
                  <button key={cat.value} type="button"
                    onClick={() => { setForm(f => ({ ...f, category: cat.value })); fetchNextEpr(cat.value) }}
                    style={{
                      padding: '8px 4px', fontSize: '15px', fontWeight: 700, textAlign: 'center',
                      border: `2px solid ${form.category === cat.value ? cat.color : D.borderLight}`,
                      borderRadius: '8px',
                      background: form.category === cat.value ? cat.color + '18' : D.bg,
                      color: form.category === cat.value ? cat.color : D.fgMuted,
                      cursor: 'pointer', transition: 'all 0.15s',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap' }}>{cat.label}</div>
                    <div style={{ fontSize: '13px', opacity: 0.75, marginTop: '2px', whiteSpace: 'nowrap' }}>{cat.min}–{cat.max}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 2. Or Create & Link a New User — add only */}
          {!editing && (
            <div style={{border:`1px dashed ${D.borderLight}`, borderRadius:'8px', padding:'14px', marginBottom:'14px', background:'rgba(0,0,0,0.15)'}}>
              <p style={{fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'6px'}}>Or create &amp; link a new user</p>
              <p style={{fontSize:'12px', color:D.fgDim, marginBottom:'10px'}}>If the user does not exist yet — fill in their details and they will be added to the Users table automatically. If the email already exists, the existing user will be linked instead.</p>
              <div style={{marginBottom:'10px'}}>
                <label style={lblDark}>Email Address</label>
                <input type="email" value={form.newEmail ?? ''} onChange={e => setForm(f => ({ ...f, newEmail: e.target.value }))} placeholder="user@company.com" style={inpDark()} />
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                <div>
                  <label style={lblDark}>First Name</label>
                  <input type="text" value={form.newFirstName ?? ''} onChange={e => setForm(f => ({ ...f, newFirstName: e.target.value }))} placeholder="First name" style={inpDark()} />
                </div>
                <div>
                  <label style={lblDark}>Last Name</label>
                  <input type="text" value={form.newLastName ?? ''} onChange={e => setForm(f => ({ ...f, newLastName: e.target.value }))} placeholder="Last name" style={inpDark()} />
                </div>
              </div>
            </div>
          )}

          {/* 3. EPR + Initial */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
            <div>
              <label style={lblDark}>EPR <span style={{color:D.danger}}>*</span></label>
              <input type="text" value={form.epr}
                onChange={e => setForm(f => ({ ...f, epr: e.target.value.toUpperCase() }))}
                placeholder={loadingEpr ? 'Loading...' : 'e.g. 1001'}
                style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}}
                readOnly={loadingEpr}
              />
              {!editing && nextEpr && (
                <p style={{fontSize:'12px', color:D.success, marginTop:'4px', fontWeight:600}}>✓ Next available: {nextEpr}</p>
              )}
              {!editing && form.category && !nextEpr && !loadingEpr && (
                <p style={{fontSize:'12px', color:D.danger, marginTop:'4px'}}>Range full — no EPR available in this tier</p>
              )}
            </div>
            <div>
              <label style={lblDark}>Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. AB" maxLength={5} style={{...inpDark(), fontFamily:'monospace', textTransform:'uppercase'}} />
            </div>
          </div>

          {/* 4. Status + PCC */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
            <div>
              <label style={lblDark}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SabreStatus }))} style={inpDark({cursor:'pointer'})}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lblDark}>PCC</label>
              <select value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value }))} style={{...inpDark({cursor:'pointer'}), fontFamily:'monospace', textTransform:'uppercase'}}>
                <option value="">- Select PCC -</option>
                {[...new Set(pccList.map(p => p.pcc))].sort().map(pcc => <option key={pcc} value={pcc}>{pcc}</option>)}
              </select>
            </div>
          </div>

          {/* 5. Linked User — edit only */}
          {editing && (
            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Linked User</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} style={inpDark({cursor:'pointer'})}>
                <option value="">- None -</option>
                {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} - {u.email_address}</option>)}
              </select>
            </div>
          )}

          {/* 6. CTA, PTA, Minicom */}
          <div style={{marginBottom:'14px'}}>
            <label style={lblDark}>CTA License</label>
            <input type="text" value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} placeholder="e.g. CTA-2024-001" style={{...inpDark(), fontFamily:'monospace'}} />
          </div>
          <div style={{marginBottom:'14px'}}>
            <label style={lblDark}>PTA License</label>
            <input type="text" value={form.pta} onChange={e => setForm(f => ({ ...f, pta: e.target.value }))} placeholder="e.g. PTA-88" style={{...inpDark(), fontFamily:'monospace'}} />
          </div>
          <div style={{marginBottom:'14px'}}>
            <label style={lblDark}>Minicom License</label>
            <input type="text" value={form.minicom} onChange={e => setForm(f => ({ ...f, minicom: e.target.value }))} placeholder="e.g. MC-456" style={{...inpDark(), fontFamily:'monospace'}} />
          </div>

          {/* 7. Notes */}
          <div style={{marginBottom:'14px'}}>
            <label style={lblDark}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any additional notes..." style={{...inpDark(), resize:'vertical' as const}} />
          </div>

          {/* 8. OTA toggle */}
          <div style={{marginBottom:'18px'}}>
            <label style={lblDark}>OTA</label>
            <div style={{display:'flex', gap:'20px'}}>
              {[true, false].map(v => (
                <label key={String(v)} style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer'}}>
                  <input type="radio" checked={form.ota === v} onChange={() => setForm(f => ({ ...f, ota: v }))} style={{accentColor:D.accent}} />
                  <span style={{fontSize:'14px', color:D.fg}}>{v ? 'Yes' : 'No'}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{error}</p>}
          <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
            <button onClick={() => setModalOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:saving?0.6:1}}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </div>
        </div>
      )}

      {/*  Delete Modal  */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Sabre User" size="sm">
        <div className="space-y-4" style={{color:"#1e293b"}}>
          <p className="text-sm text-slate-600">Delete Sabre user <strong className="font-mono">{editing?.epr}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/*  Import Modal  */}
      <Modal open={importOpen} onClose={closeImport} title="Import Sabre Users" size="lg">
        <div className="space-y-4" style={{color:"#1e293b"}}>
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

      {/*  Deletion History Modal  */}
      {showLicenseHistory && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}} onClick={() => setShowLicenseHistory(false)}>
          <div style={{background:T.card,borderRadius:'14px',width:'720px',maxWidth:'92vw',maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}} onClick={e => e.stopPropagation()}>
            <div style={{padding:'16px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h3 style={{fontSize:'16px',fontWeight:700,color:T.text,margin:0}}>Available License — Deletion History</h3>
              <button onClick={() => setShowLicenseHistory(false)} style={{background:'none',border:'none',cursor:'pointer',color:T.textLight,fontSize:'18px',lineHeight:1}}>✕</button>
            </div>
            <div style={{padding:'0',overflowY:'auto'}}>
              {licenseHistory.length === 0 ? (
                <div style={{padding:'40px',textAlign:'center',color:T.textLight,fontSize:'13px'}}>No deletions logged yet.</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <thead style={{position:'sticky',top:0,background:T.surfaceAlt,borderBottom:`1px solid ${T.border}`}}>
                    <tr>
                      {['PCC','CTA','PTA','Minicom','Resigned User','Deleted By','Deleted At'].map(h => (
                        <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:T.textMid,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {licenseHistory.map((h, i) => (
                      <tr key={h.id} style={{borderBottom: i < licenseHistory.length - 1 ? `1px solid ${T.border}` : 'none'}}>
                        <td style={{padding:'9px 12px',fontFamily:'monospace'}}>{h.pcc ?? '-'}</td>
                        <td style={{padding:'9px 12px',fontFamily:'monospace'}}>{h.cta ?? '-'}</td>
                        <td style={{padding:'9px 12px',fontFamily:'monospace'}}>{h.pta ?? '-'}</td>
                        <td style={{padding:'9px 12px',fontFamily:'monospace'}}>{h.minicom ?? '-'}</td>
                        <td style={{padding:'9px 12px',color:T.textMid}}>{h.resigned_full_name ?? h.resigned_email ?? '-'}</td>
                        <td style={{padding:'9px 12px',color:T.textMid}}>{h.deleted_by ?? '-'}</td>
                        <td style={{padding:'9px 12px',color:T.textMid,whiteSpace:'nowrap'}}>{new Date(h.deleted_at).toLocaleString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
