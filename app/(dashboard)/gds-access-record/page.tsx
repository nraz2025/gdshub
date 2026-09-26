'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import { useAppContext } from '@/lib/context/AppContext'
import type { PCCList, GDS, Organisation, OTAClient, GDSFunctionality } from '@/types'

// Modal styling stays light (shared Modal component not touched this session)
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
// Main page dark theme (matches TopNav's GDS group = cyan/teal)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#39d2c0', accentSoft: 'rgba(57,210,192,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  orange: '#f78166', orangeSoft: 'rgba(247,129,102,0.10)',
  blue: '#58a6ff', blueSoft: 'rgba(88,166,255,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
}
const GDS_BADGE_DARK: Record<string, { color: string; soft: string }> = {
  Sabre:      { color: D.orange, soft: D.orangeSoft },
  Amadeus:    { color: D.purple, soft: D.purpleSoft },
  Travelport: { color: D.blue,   soft: D.blueSoft },
}
const PCC_FUNC_DARK: Record<string, string> = {
  'Booking Only':        D.blue,
  'Booking & Ticketing': D.purple,
  'Profile':             D.success,
  'Fareview':            D.warning,
  'Cert PCC':             D.danger,
  'SCVB':                D.accent,
}
const STATUS_DARK: Record<string, { dot: string; text: string }> = {
  Active:  { dot: D.success, text: D.success },
  Vacant:  { dot: D.fgDim,   text: D.fgMuted },
  Pending: { dot: D.warning, text: D.warning },
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




type PCCStatus = 'Active' | 'Pending' | 'Vacant'
const PCC_STATUSES: PCCStatus[] = ['Active', 'Pending', 'Vacant']

const GDS_COLORS: Record<string, string> = {
  Sabre:      'bg-blue-50 text-blue-600 border-blue-200',
  Amadeus:    'bg-purple-50 text-purple-600 border-purple-200',
  Travelport: 'bg-emerald-50 text-emerald-600 border-emerald-200',
}
const STATUS_COLORS: Record<string, string> = {
  Active:  'bg-blue-50 text-blue-600 border-blue-200',
  Pending: 'bg-amber-50 text-amber-600 border-amber-200',
  Vacant:  'bg-slate-100 text-slate-500 border-slate-200',
}

const PCC_FUNC_COLORS: Record<string, string> = {
  'Booking Only':        'bg-sky-50 text-sky-700 border-sky-200',
  'Booking & Ticketing': 'bg-violet-50 text-violet-700 border-violet-200',
  'Profile':             'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Fareview':            'bg-amber-50 text-amber-700 border-amber-200',
  'Cert PCC':            'bg-rose-50 text-rose-700 border-rose-200',
  'SCVB':                'bg-teal-50 text-teal-700 border-teal-200',
}

const EMPTY: Partial<PCCList> = {
  gds_id: undefined, pcc: '', status: 'Active',
  org_id: null, ota_client_id: null, functionality_id: null, pcc_functionality: null, remarks: null,
}

interface ImportRow {
  gds_name: string; pcc: string; status: PCCStatus
  _row: number; _errors: string[]; _gds_id?: number
}

export default function GDSAccessRecordPage() {
  const supabase = createClient()
  const { canManage: isAdmin } = useAppContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [records, setRecords] = useState<PCCList[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [orgList, setOrgList] = useState<Organisation[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [funcList, setFuncList] = useState<GDSFunctionality[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [totalCount, setTotalCount] = useState(0)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPccFunc, setFilterPccFunc] = useState('')

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<PCCList>>(EMPTY)
  const [editing, setEditing] = useState<PCCList | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // PCC Name login popup
  const [loginPopupOpen, setLoginPopupOpen] = useState(false)
  const [loginPopupPCC, setLoginPopupPCC] = useState<PCCList | null>(null)
  const [loginPopupData, setLoginPopupData] = useState<{sabre: {id:number;epr:string;email:string|null;pcc:string|null;status:string}[];amadeus:{id:number;login:string;sign_on_id:string|null;oid:string|null;status:string;users?:{email_address:string|null}|null}[];travelport:{id:number;sign_on_id:string|null;cid:string|null;pcc:string|null;status:string}[]}>({ sabre:[], amadeus:[], travelport:[] })
  const [loginPopupLoading, setLoginPopupLoading] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number|"all">(25)
  const PAGE_SIZE = pageSize

  // Import
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])

  // Reference lists (GDS, Organisation, OTA Clients, Functionality, Features…)
  // — small tables, fetched once on mount, never paginated or searched.
  useEffect(() => { fetchReferenceData() }, [])

  async function fetchReferenceData() {
    const [{ data: gdsData }, { data: orgData }, { data: otaData }, { data: funcData }, { data: pccFuncOptData }] = await Promise.all([
      supabase.from('gds').select('*').order('name'),
      supabase.from('organisation').select('*').order('organisation'),
      supabase.from('pcc_name').select('id, company_name').order('company_name'),
      supabase.from('gds_functionality').select('id, name, gds_id').order('name'),
      supabase.from('pcc_functionality_options').select('id, name').order('sort_order'),
    ])
    setGdsList(gdsData ?? [])
    setOrgList(orgData ?? [])
    setOtaClients(otaData ?? [])
    setFuncList(funcData ?? [])
    setPccFunctionalityOptions(pccFuncOptData ?? [])
  }

  // Debounce the search box — wait for typing to settle before hitting the
  // database, and only reset to page 1 once the settled term actually changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [search])

  // The actual paginated, server-filtered fetch — reruns whenever the page,
  // page size, settled search term, or either dropdown filter changes.
  useEffect(() => { fetchRecords() }, [currentPage, pageSize, debouncedSearch, filterStatus, filterPccFunc])

  const PCC_JOIN_SELECT = `
    *, gds:gds_id(id, name),
    organisation:org_id(id, organisation, iata),
    ota_client:ota_client_id(id, company_name),
    gds_functionality:functionality_id(id, name, gds_id)
  `

  // Looks up matching PCC ids + total count via the search_pcc_access_records()
  // RPC (see pcc_access_record_search.sql), then fetches the full joined row
  // data for just those ids, preserving the server's ordering.
  async function fetchMatchingRows(limit: number, offset: number): Promise<{ rows: PCCList[]; total: number }> {
    const { data: idRows, error: idErr } = await supabase.rpc('search_pcc_access_records', {
      p_search: debouncedSearch.trim(),
      p_status: filterStatus,
      p_pcc_func: filterPccFunc,
      p_limit: limit,
      p_offset: offset,
    })
    if (idErr) { console.error('search_pcc_access_records failed:', idErr.message); return { rows: [], total: 0 } }
    const ids = (idRows ?? []).map((r: { id: number }) => r.id)
    const total = idRows && idRows.length > 0 ? Number((idRows[0] as { total_count: number | string }).total_count) : 0
    if (ids.length === 0) return { rows: [], total }
    const { data: fullRows } = await supabase.from('pcc_list').select(PCC_JOIN_SELECT).in('id', ids)
    const byId = new Map((fullRows ?? []).map(r => [r.id, r as unknown as PCCList]))
    const ordered = ids.map((id: number) => byId.get(id)).filter(Boolean) as PCCList[]
    return { rows: ordered, total }
  }

  async function fetchRecords() {
    setLoading(true)
    const limit = pageSize === 'all' ? 100000 : pageSize
    const offset = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize
    const { rows, total } = await fetchMatchingRows(limit, offset)
    setRecords(rows)
    setTotalCount(total)
    setLoading(false)
  }

  //  CRUD 
  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY, gds_id: gdsList[0]?.id })
    setError(''); setRenamingOta(false); setAddingOta(false); setModalOpen(true)
  }

  function openEdit(row: PCCList) {
    setEditing(row)
    setForm({
      gds_id: row.gds_id, pcc: row.pcc, status: row.status ?? 'Active',
      org_id: row.org_id ?? null, ota_client_id: row.ota_client_id ?? null,
      functionality_id: row.functionality_id ?? null, pcc_functionality: row.pcc_functionality ?? null, remarks: row.remarks ?? null,
      pcc_functionality: row.pcc_functionality ?? null,
    })
    setError(''); setRenamingOta(false); setAddingOta(false); setModalOpen(true)
  }

  function openDelete(row: PCCList) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.gds_id) { setError('Please select a GDS.'); return }
    if (!form.pcc?.trim()) { setError('PCC code is required.'); return }
    const pccUpper = form.pcc.trim().toUpperCase()
    setSaving(true); setError('')
    const audit = await getAuditFields()
    const payload = {
      gds_id: form.gds_id, pcc: pccUpper, status: form.status ?? 'Active',
      org_id: form.org_id ?? null, ota_client_id: form.ota_client_id ?? null,
      functionality_id: form.functionality_id ?? null, pcc_functionality: form.pcc_functionality ?? null, remarks: form.remarks ?? null,
      pcc_functionality: (form as Partial<PCCList>).pcc_functionality ?? null,
    }
    const { error: err } = editing
      ? await supabase.from('pcc_list').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('pcc_list').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchRecords()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('pcc_list').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchRecords()
  }

  //  PCC ASSIGNED LOGIN POPUP 
  async function openLoginPopup(pcc: PCCList) {
    if (!pcc.ota_client_id) return
    setLoginPopupPCC(pcc)
    setLoginPopupOpen(true)
    setLoginPopupLoading(true)
    const gdsName = (pcc.gds as GDS)?.name ?? ''
    const [{ data: sabreData }, { data: amData }, { data: tpData }] = await Promise.all([
      gdsName === 'Sabre' || !gdsName
        ? supabase.from('sabre_user').select('id,epr,pcc,status,users:user_id(email_address)').eq('ota_client_id', pcc.ota_client_id).order('epr')
        : Promise.resolve({ data: [] }),
      gdsName === 'Amadeus' || !gdsName
        ? supabase.from('amadeus_user').select('id,login,sign_on_id,oid,status,users:user_id(email_address)').eq('ota_client_id', pcc.ota_client_id).order('login')
        : Promise.resolve({ data: [] }),
      gdsName === 'Travelport' || !gdsName
        ? supabase.from('travelport_user').select('id,sign_on_id,cid,pcc,status').eq('ota_client_id', pcc.ota_client_id).order('sign_on_id')
        : Promise.resolve({ data: [] }),
    ])
    setLoginPopupData({ sabre: sabreData ?? [], amadeus: amData ?? [], travelport: tpData ?? [] })
    setLoginPopupLoading(false)
  }

  //  EXPORT — exports every record matching the current search/filters,
  // not just the page currently on screen, so it needs its own fetch.
  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    setExporting(true)
    const { rows } = await fetchMatchingRows(100000, 0)
    setExporting(false)
    const data = rows.map((r, i) => {
      const gdsName   = (r.gds as GDS)?.name ?? ''
      const org       = r.organisation as Organisation
      const ota       = r.ota_client as OTAClient
      const func      = r.gds_functionality as GDSFunctionality
      return {
        'No.':                  i + 1,
        'GDS':                  gdsName,
        'PCC Code':             r.pcc,
        'Status':               r.status ?? '',
        'Organisation':         org?.organisation ?? '',
        'IATA':                 org?.iata ?? '',
        'OTA Client':           ota?.company_name ?? '',
        'GDS Functionality':    func?.name ?? '',
        'PCC Functionality':    (r as PCCList & {pcc_functionality?: string}).pcc_functionality ?? '',
        'Remarks':              r.remarks ? r.remarks.split('\n').map(l => chunkText(l.trim(), 50).join('\n')).join('\n') : '',
        'Modified By':          (r as PCCList & {modified_by?: string}).modified_by ?? '',
        'Modified Date':        (r as PCCList & {modified_at?: string}).modified_at
                                  ? new Date((r as PCCList & {modified_at?: string}).modified_at!).toLocaleDateString('en-MY')
                                  : '',
        'Created Date':         new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 5  },  // No.
      { wch: 14 },  // GDS
      { wch: 14 },  // PCC Code
      { wch: 12 },  // Status
      { wch: 30 },  // Organisation
      { wch: 12 },  // IATA
      { wch: 25 },  // OTA Client
      { wch: 25 },  // GDS Functionality
      { wch: 20 },  // PCC Functionality
      { wch: 30 },  // Remarks
      { wch: 25 },  // Modified By
      { wch: 14 },  // Modified Date
      { wch: 14 },  // Created Date
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GDS Access Record')
    XLSX.writeFile(wb, `GDSHub_GDS_Access_Record_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'GDS': 'Sabre',   'PCC': 'KULMY217Z', 'Status': 'Active'  },
      { 'GDS': 'Amadeus', 'PCC': 'KULMY255W', 'Status': 'Pending' },
    ])
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GDS Access Record')
    XLSX.writeFile(wb, 'GDSHub_GDS_Access_Record_Template.xlsx')
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
        const gds_name   = getF(r, 'GDS', 'gds', 'gds_name')
        const pcc        = getF(r, 'PCC', 'pcc', 'PCC Code', 'pcc_code').toUpperCase()
        const status_raw = getF(r, 'Status', 'status')
        const status: PCCStatus = (['Active','Pending','Vacant'].includes(status_raw) ? status_raw : 'Active') as PCCStatus
        const matched_gds = gdsList.find(g => g.name.toLowerCase() === gds_name.toLowerCase())
        const errors: string[] = []
        if (!gds_name) errors.push('GDS is required')
        else if (!matched_gds) errors.push(`GDS "${gds_name}" not found`)
        if (!pcc) errors.push('PCC is required')
        return { gds_name, pcc, status, _row: i + 2, _errors: errors, _gds_id: matched_gds?.id }
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
    let success = 0; let failed = 0; const failedRows: string[] = []
    for (const row of valid) {
      const { error } = await supabase.from('pcc_list').insert({ gds_id: row._gds_id, pcc: row.pcc, status: row.status })
      if (error) { failed++; failedRows.push(`${row.pcc} (${row.gds_name})  ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchRecords()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null); setDetectedHeaders([]) }

  // Search + status + PCC-functionality filtering now happens server-side
  // (search_pcc_access_records RPC, called from fetchRecords/fetchMatchingRows)
  // — `records` already IS the current, filtered page.
  const filteredFuncs = funcList.filter(f => !form.gds_id || f.gds_id === form.gds_id)

  // Pagination — driven by the server's totalCount, not an in-memory array.
  const effectiveSize = pageSize === "all" ? (totalCount || 1) : pageSize
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(totalCount / effectiveSize))
  const paginated = records

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const [pccFunctionalityOptions, setPccFunctionalityOptions] = useState<{id:number;name:string}[]>([])
  const [addingFunctionality, setAddingFunctionality] = useState(false)
  const [newFunctionalityName, setNewFunctionalityName] = useState('')
  const [savingFunctionality, setSavingFunctionality] = useState(false)
  const [renamingOta, setRenamingOta] = useState(false)
  const [otaRenameValue, setOtaRenameValue] = useState('')
  const [savingOtaRename, setSavingOtaRename] = useState(false)
  const [addingOta, setAddingOta] = useState(false)
  const [newOtaName, setNewOtaName] = useState('')
  const [savingNewOta, setSavingNewOta] = useState(false)

  async function addPccFunctionalityOption(name: string): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    setSavingFunctionality(true)
    const nextSort = pccFunctionalityOptions.length > 0 ? Math.max(...pccFunctionalityOptions.map((_, i) => i)) + 1 : 1
    const { data, error: e } = await supabase.from('pcc_functionality_options')
      .insert({ name: trimmed, sort_order: nextSort })
      .select('id, name').single()
    setSavingFunctionality(false)
    if (e) {
      // Unique violation just means it already exists — use the existing one instead of failing.
      const existing = pccFunctionalityOptions.find(o => o.name.toLowerCase() === trimmed.toLowerCase())
      if (existing) return existing.name
      alert(`Could not add functionality: ${e.message}`)
      return null
    }
    setPccFunctionalityOptions(prev => [...prev, data])
    return data.name
  }

  async function addOtaClient(name: string): Promise<number | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    setSavingNewOta(true)
    const { data, error: e } = await supabase.from('pcc_name')
      .insert({ company_name: trimmed })
      .select('id, company_name').single()
    setSavingNewOta(false)
    if (e) {
      // Unique violation just means it already exists — use the existing one instead of failing.
      const existing = otaClients.find(o => o.company_name.toLowerCase() === trimmed.toLowerCase())
      if (existing) return existing.id
      alert(`Could not add OTA client: ${e.message}`)
      return null
    }
    setOtaClients(prev => [...prev, data].sort((a, b) => a.company_name.localeCompare(b.company_name)))
    return data.id
  }

  async function handleRenameOta() {
    if (!form.ota_client_id) return
    const trimmed = otaRenameValue.trim()
    if (!trimmed) return
    setSavingOtaRename(true)
    const { error: e } = await supabase.from('pcc_name').update({ company_name: trimmed }).eq('id', form.ota_client_id)
    setSavingOtaRename(false)
    if (e) { alert(`Could not rename OTA client: ${e.message}`); return }
    setOtaClients(prev => prev.map(o => o.id === form.ota_client_id ? { ...o, company_name: trimmed } : o))
    setRenamingOta(false)
    fetchRecords()
  }

  // Split text into chunks of at most maxLen characters, breaking at word boundaries
  // where possible so a single continuous line never exceeds maxLen characters
  // regardless of how narrow the container it's rendered in actually is.
  function chunkText(text: string, maxLen: number): string[] {
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxLen) {
        if (current) lines.push(current)
        if (word.length > maxLen) {
          // A single word longer than maxLen — hard-break it.
          let w = word
          while (w.length > maxLen) { lines.push(w.slice(0, maxLen)); w = w.slice(maxLen) }
          current = w
        } else {
          current = word
        }
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
    return lines
  }

  //  COLUMNS
  const columns = [
    // 1. Organisation
    {
      key: 'organisation', label: 'Organisation', width: '220px',
      render: (row: PCCList) => {
        const org = row.organisation as Organisation
        return org
          ? <div><p style={{fontSize:'16px',fontWeight:600,color:D.fg,textTransform:'uppercase'}}>{org.organisation}</p>{org.iata && <p style={{fontSize:'12px',color:D.fgDim,fontFamily:'monospace'}}>{org.iata}</p>}</div>
          : <span style={{color:D.fgDim,fontSize:'12px'}}>—</span>
      }
    },
    // 2. GDS
    {
      key: 'gds', label: 'GDS', width: '120px',
      render: (row: PCCList) => {
        const name = (row.gds as GDS)?.name ?? gdsList.find(g => g.id === row.gds_id)?.name ?? ''
        const c = GDS_BADGE_DARK[name] ?? { color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' }
        return <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',padding:'6px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',background:c.soft,color:c.color}}>{name}</span>
      }
    },
    // 3. PCC
    {
      key: 'pcc', label: 'PCC', width: '120px',
      render: (row: PCCList) => <span style={{fontFamily:'monospace',fontWeight:600,color:D.fg,fontSize:'15px',letterSpacing:'0.05em'}}>{row.pcc}</span>
    },
    // 4. PCC Name  badge + view logins link
    {
      key: 'ota_client_id', label: 'PCC Name', width: '170px',
      render: (row: PCCList) => {
        const ota = row.ota_client as OTAClient
        return ota ? (
          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
            <span style={{fontSize:'15px',fontWeight:600,color:D.fg,wordBreak:'break-word'}}>{ota.company_name}</span>
            <button onClick={() => openLoginPopup(row)}
              style={{fontSize:'13px',color:D.accent,background:'none',border:'none',cursor:'pointer',textDecoration:'none',padding:0,whiteSpace:'nowrap',fontWeight:600,textAlign:'left'}}
              onMouseOver={e => e.currentTarget.style.textDecoration='underline'}
              onMouseOut={e => e.currentTarget.style.textDecoration='none'}>
              View IDs
            </button>
          </div>
        ) : <span style={{color:D.fgDim}}>—</span>
      }
    },
    // 5. Functionality
    {
      key: 'pcc_functionality', label: 'Functionality', width: '180px',
      render: (row: PCCList) => {
        const val = row.pcc_functionality
        return val
          ? <span style={{fontSize:'14px',fontWeight:600,color:PCC_FUNC_DARK[val]??D.fgMuted,textTransform:'uppercase',letterSpacing:'0.03em'}}>{val}</span>
          : <span style={{color:D.fgDim}}>—</span>
      }
    },
    // 7. Remarks
    {
      key: 'remarks', label: 'Remarks', width: '430px',
      render: (row: PCCList) => {
        if (!row.remarks) return <span style={{color:D.fgDim,fontSize:'12px'}}>—</span>
        const points = row.remarks.split('\n').map(l => l.trim()).filter(Boolean)
        return (
          <ul style={{listStyleType:'disc',listStylePosition:'outside',paddingLeft:'16px',display:'flex',flexDirection:'column',gap:'4px'}}>
            {points.map((p, i) => (
              <li key={i} style={{fontSize:'14px',color:D.fgMuted,lineHeight:1.5,wordBreak:'break-word',overflowWrap:'break-word'}}>{p}</li>
            ))}
          </ul>
        )
      }
    },
    // 8. Status
    {
      key: 'status', label: 'Status', width: '100px',
      render: (row: PCCList) => {
        const s = row.status ?? 'Active'
        const c = STATUS_DARK[s] ?? { dot: D.fgDim, text: D.fgMuted }
        return (
          <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'13px',fontWeight:600,color:c.text,textTransform:'uppercase',letterSpacing:'0.05em'}}>
            <span style={{width:'7px',height:'7px',borderRadius:'50%',background:c.dot,flexShrink:0,display:'inline-block',boxShadow: s==='Active' ? `0 0 6px ${c.dot}` : 'none'}}/>
            {s}
          </span>
        )
      }
    },
  ]

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Page Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>GDS Access Record</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>PCC assignments and configuration details across organisations</p>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap'}}>
            {isAdmin && (
              <button onClick={handleExport} disabled={totalCount === 0 || exporting}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer', opacity:(totalCount===0||exporting)?0.4:1}}
                onMouseOver={e => { e.currentTarget.style.background=D.borderLight; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.background=D.card; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {exporting ? 'Exporting…' : 'Export xlsx'}
              </button>
            )}
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()}
                  style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer'}}
                  onMouseOver={e => { e.currentTarget.style.background=D.borderLight; e.currentTarget.style.color=D.fg }}
                  onMouseOut={e => { e.currentTarget.style.background=D.card; e.currentTarget.style.color=D.fgMuted }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import xlsx
                </button>
                <button onClick={openAdd}
                  style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add GDS Access Record
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'16px', marginBottom:'18px'}}>
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', alignItems:'flex-end', gap:'12px', width:'100%'}}>

            {/* Unified search — Organisation, PCC, PCC Name, GDS */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Search</label>
              <div style={{position:'relative'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by organisation, PCC, PCC name, or GDS..."
                  style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s'}}
                  onFocus={e => { e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${D.accentSoft}` }}
                  onBlur={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = 'none' }} />
              </div>
            </div>

            {/* PCC Functionality */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>PCC Functionality</label>
              <select value={filterPccFunc} onChange={e => { setFilterPccFunc(e.target.value); setCurrentPage(1) }}
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', cursor:'pointer', transition:'border-color 0.15s, box-shadow 0.15s'}}
                onFocus={e => { e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${D.accentSoft}` }}
                onBlur={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = 'none' }}>
                <option value="">All</option>
                {pccFunctionalityOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            </div>

            {/* Status */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Status</label>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }}
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', cursor:'pointer', transition:'border-color 0.15s, box-shadow 0.15s'}}
                onFocus={e => { e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${D.accentSoft}` }}
                onBlur={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = 'none' }}>
                <option value="all">All Status</option>
                {PCC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Reset button */}
            <div style={{display:'flex', alignItems:'flex-end'}}>
              <button
                onClick={() => { setSearch(''); setDebouncedSearch(''); setFilterStatus('all'); setFilterPccFunc(''); setCurrentPage(1) }}
                title="Reset filters"
                style={{display:'flex', alignItems:'center', justifyContent:'center', width:'38px', height:'38px', background:D.bg, color:D.fgMuted, border:`1px solid ${D.border}`, borderRadius:'8px', cursor:'pointer', flexShrink:0}}
                onMouseOver={e => { e.currentTarget.style.color=D.accent; e.currentTarget.style.borderColor=D.accent }}
                onMouseOut={e => { e.currentTarget.style.color=D.fgMuted; e.currentTarget.style.borderColor=D.border }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            </div>

          </div>
        </div>

        {/* Records count bar (single row) */}
        {!loading && totalCount > 0 && (
          <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', marginBottom:'12px', flexWrap:'wrap', gap:'12px'}}>
            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
              <span style={{fontSize:'14px', color:D.fgMuted}}>
                {pageSize === 'all'
                  ? <><strong style={{color:D.fg}}>{totalCount}</strong> records total</>
                  : <><strong style={{color:D.fg}}>{totalCount === 0 ? 0 : ((currentPage-1)*effectiveSize)+1}-{Math.min(currentPage*effectiveSize, totalCount)}</strong> of <strong style={{color:D.fg}}>{totalCount}</strong> records</>
                }
              </span>
              <select value={String(pageSize)} onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setCurrentPage(1) }}
                style={{padding:'6px 12px', fontSize:'13px', border:`1px solid ${D.border}`, borderRadius:'8px', background:D.card, color:D.fgMuted, outline:'none', cursor:'pointer'}}>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'15px'}}>Loading</div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'auto', maxHeight:'75vh'}}>
              <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1300px', tableLayout:'fixed'}}>
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} style={{padding: ['pcc_functionality','remarks'].includes(col.key) ? '12px 16px 12px 28px' : '12px 16px', fontSize:'14px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:D.card, width: col.width, position:'sticky', top:0, zIndex:2}}>{col.label}</th>
                    ))}
                    {isAdmin && (
                      <th style={{padding:'12px 16px', fontSize:'14px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'right', borderBottom:`1px solid ${D.border}`, background:D.card, position:'sticky', top:0, zIndex:2}}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={columns.length + 1} style={{padding:'48px 16px', textAlign:'center', color:D.fgDim, fontSize:'15px'}}>No GDS Access Record records found.</td></tr>
                  ) : (
                    paginated.map((row, i) => (
                      <tr key={row.id} style={{borderBottom: i < paginated.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                        onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {columns.map(col => (
                          <td key={col.key} style={{padding: ['pcc_functionality','remarks'].includes(col.key) ? '12px 16px 12px 28px' : '12px 16px', verticalAlign:'middle'}}>{col.render(row as PCCList)}</td>
                        ))}
                        {isAdmin && (
                          <td style={{padding:'12px 16px', textAlign:'right'}}>
                            <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                              <button onClick={() => openEdit(row as PCCList)}
                                style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                                onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                                onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                                Edit
                              </button>
                              <button onClick={() => openDelete(row as PCCList)}
                                style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                                onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                                onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalCount > 0 && totalPages > 1 && pageSize !== 'all' && (
          <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', marginTop:'0', background:D.card, border:`1px solid ${D.border}`, borderTop:'none', borderRadius:'0 0 10px 10px', padding:'14px 18px', gap:'4px'}}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{display:'flex', alignItems:'center', justifyContent:'center', minWidth:'32px', height:'32px', padding:'0 12px', borderRadius:'6px', border:'1px solid transparent', background:'transparent', color:D.fgMuted, fontSize:'13px', fontWeight:600, cursor:'pointer', opacity:currentPage===1?0.4:1}}>
              ‹ Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              const show = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2
              const ellipsisBefore = page === 2 && currentPage > 4
              const ellipsisAfter = page === totalPages - 1 && currentPage < totalPages - 3
              if (!show) return null
              if (ellipsisBefore || ellipsisAfter) return <span key={`e-${page}`} style={{padding:'0 6px', color:D.fgDim, fontSize:'13px'}}>…</span>
              return (
                <button key={page} onClick={() => setCurrentPage(page)}
                  style={{minWidth:'32px', height:'32px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, borderRadius:'6px',
                    border: page===currentPage ? `1px solid ${D.accent}` : '1px solid transparent',
                    background: page===currentPage ? D.accentSoft : 'transparent',
                    color: page===currentPage ? D.accent : D.fgMuted,
                    cursor:'pointer'}}>
                  {page}
                </button>
              )
            })}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{display:'flex', alignItems:'center', justifyContent:'center', minWidth:'32px', height:'32px', padding:'0 12px', borderRadius:'6px', border:'1px solid transparent', background:'transparent', color:D.fgMuted, fontSize:'13px', fontWeight:600, cursor:'pointer', opacity:currentPage===totalPages?0.4:1}}>
              Next ›
            </button>
          </div>
        )}

      </div>

      {/*  Add / Edit Modal  */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit GDS Access Record' : 'Add GDS Access Record'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS <span className="text-red-500">*</span></label>
              <select value={form.gds_id ?? ''} onChange={e => setForm(f => ({ ...f, gds_id: Number(e.target.value), functionality_id: null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                <option value=""> Select GDS </option>
                {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC <span className="text-red-500">*</span></label>
              <input type="text" value={form.pcc ?? ''} onChange={e => setForm(f => ({ ...f, pcc: e.target.value.toUpperCase() }))} placeholder="e.g. KULMY217Z" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={form.status ?? 'Active'} onChange={e => setForm(f => ({ ...f, status: e.target.value as PCCStatus }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              {PCC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC Functionality</label>
            {!addingFunctionality ? (
              <select
                value={(form as Partial<PCCList>).pcc_functionality ?? ''}
                onChange={e => {
                  if (e.target.value === '__add_new__') { setNewFunctionalityName(''); setAddingFunctionality(true); return }
                  setForm(f => ({ ...f, pcc_functionality: e.target.value || null }))
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value=""> None </option>
                {pccFunctionalityOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                <option value="__add_new__">+ Add New Functionality…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" autoFocus value={newFunctionalityName}
                  onChange={e => setNewFunctionalityName(e.target.value)}
                  placeholder="e.g. Group Desk"
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const saved = await addPccFunctionalityOption(newFunctionalityName)
                      if (saved) { setForm(f => ({ ...f, pcc_functionality: saved })); setAddingFunctionality(false) }
                    }
                    if (e.key === 'Escape') setAddingFunctionality(false)
                  }}
                />
                <button
                  type="button" disabled={savingFunctionality || !newFunctionalityName.trim()}
                  onClick={async () => {
                    const saved = await addPccFunctionalityOption(newFunctionalityName)
                    if (saved) { setForm(f => ({ ...f, pcc_functionality: saved })); setAddingFunctionality(false) }
                  }}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingFunctionality ? 'Saving' : 'Add'}
                </button>
                <button
                  type="button" onClick={() => setAddingFunctionality(false)}
                  className="px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Organisation</label>
            <select value={form.org_id ?? ''} onChange={e => setForm(f => ({ ...f, org_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value=""> None </option>
              {orgList.map(o => <option key={o.id} value={o.id}>{o.organisation}{o.iata ? ` (${o.iata})` : ''}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">PCC Name</label>
              {!renamingOta && !addingOta && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setNewOtaName(''); setAddingOta(true) }}
                    className="text-xs font-medium text-blue-500 hover:underline"
                  >
                    + Add
                  </button>
                  {form.ota_client_id && (
                    <button
                      type="button"
                      onClick={() => {
                        const cur = otaClients.find(o => o.id === form.ota_client_id)
                        setOtaRenameValue(cur?.company_name ?? '')
                        setRenamingOta(true)
                      }}
                      className="text-xs font-medium text-blue-500 hover:underline"
                    >
                      Rename
                    </button>
                  )}
                </div>
              )}
            </div>
            {addingOta ? (
              <div className="flex gap-2">
                <input
                  type="text" autoFocus value={newOtaName}
                  onChange={e => setNewOtaName(e.target.value)}
                  placeholder="e.g. Via.com"
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      const id = await addOtaClient(newOtaName)
                      if (id) { setForm(f => ({ ...f, ota_client_id: id })); setAddingOta(false) }
                    }
                    if (e.key === 'Escape') setAddingOta(false)
                  }}
                />
                <button
                  type="button" disabled={savingNewOta || !newOtaName.trim()}
                  onClick={async () => {
                    const id = await addOtaClient(newOtaName)
                    if (id) { setForm(f => ({ ...f, ota_client_id: id })); setAddingOta(false) }
                  }}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingNewOta ? 'Saving' : 'Add'}
                </button>
                <button
                  type="button" onClick={() => setAddingOta(false)}
                  className="px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : !renamingOta ? (
              <select
                value={form.ota_client_id ?? ''}
                onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value=""> None </option>
                {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text" autoFocus value={otaRenameValue}
                  onChange={e => setOtaRenameValue(e.target.value)}
                  placeholder="OTA client name"
                  className="flex-1 px-3 py-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                  onKeyDown={async e => {
                    if (e.key === 'Enter') await handleRenameOta()
                    if (e.key === 'Escape') setRenamingOta(false)
                  }}
                />
                <button
                  type="button" disabled={savingOtaRename || !otaRenameValue.trim()}
                  onClick={handleRenameOta}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {savingOtaRename ? 'Saving' : 'Save'}
                </button>
                <button
                  type="button" onClick={() => setRenamingOta(false)}
                  className="px-3 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Remarks</label>
            <textarea
              value={(form as Partial<PCCList>).remarks ?? ''}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value || null }))}
              placeholder="Additional notes or information"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving' : editing ? 'Save Changes' : 'Add GDS Access Record'}</button>
          </div>
        </div>
      </Modal>

      {/*  Delete Modal  */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete GDS Access Record" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete PCC <strong className="font-mono">{editing?.pcc}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/*  PCC Name Login Popup  */}
      <Modal
        open={loginPopupOpen}
        onClose={() => { setLoginPopupOpen(false); setLoginPopupPCC(null) }}
        title={`GDS Logins  ${(loginPopupPCC?.ota_client as OTAClient)?.company_name ?? ''}`}
        size="lg"
      >
        {loginPopupLoading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading logins</div>
        ) : (
          <div className="space-y-4">
            {/* PCC context */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-slate-500">PCC:</span>
              <span className="font-mono font-bold text-slate-800 bg-slate-200 px-2 py-0.5 rounded text-xs">{loginPopupPCC?.pcc}</span>
              {loginPopupPCC && (() => { const g = loginPopupPCC.gds as GDS; return g ? <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[g.name] ?? 'bg-slate-100 text-slate-600'}`}>{g.name}</span> : null })()}
            </div>

            {loginPopupData.sabre.length === 0 && loginPopupData.amadeus.length === 0 && loginPopupData.travelport.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">No GDS logins assigned to this client yet.</p>
            ) : (
              <>
                {loginPopupData.sabre.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-2">Sabre ({loginPopupData.sabre.length})</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>{['EPR','Email','PCC','Status'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.sabre.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.sabre.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.epr}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs">{(r as {users?:{email_address:string}|null}).users?.email_address??''}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc??''}</td>
                              <td className="px-4 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${r.status==='Active'?'bg-blue-50 text-blue-600 border-blue-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{r.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {loginPopupData.amadeus.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-purple-700 mb-2">Amadeus ({loginPopupData.amadeus.length})</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>{['Login','Email','Sign-On ID','Status'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.amadeus.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.amadeus.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.login}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs">{r.users?.email_address??''}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.sign_on_id??''}</td>
                              <td className="px-4 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${r.status==='Active'?'bg-blue-50 text-blue-600 border-blue-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{r.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {loginPopupData.travelport.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-2">Travelport ({loginPopupData.travelport.length})</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>{['Sign-On ID','CID','PCC','Status'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.travelport.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.travelport.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.sign_on_id??''}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.cid??''}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc??''}</td>
                              <td className="px-4 py-2.5"><span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${r.status==='Active'?'bg-blue-50 text-blue-600 border-blue-200':'bg-slate-100 text-slate-500 border-slate-200'}`}>{r.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end">
              <button onClick={() => { setLoginPopupOpen(false); setLoginPopupPCC(null) }} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/*  Import Modal  */}
      <Modal open={importOpen} onClose={closeImport} title="Import GDS Access Record" size="lg">
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
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows  <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p>
                </div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
                <div>Required: <span className="font-mono font-medium text-slate-700">GDS</span>, <span className="font-mono font-medium text-slate-700">PCC</span>  Optional: <span className="font-mono font-medium text-slate-700">Status</span></div>
                {detectedHeaders.length > 0 && <div>Detected: {detectedHeaders.map((h, i) => <span key={i} className="font-mono font-medium text-slate-700 bg-slate-200 px-1 rounded mr-1">{h}</span>)}</div>}
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','GDS','PCC','Status','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2">{row.gds_name ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${GDS_COLORS[row.gds_name] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{row.gds_name}</span> : <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.pcc || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{row.status}</span></td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium"> OK</span> : <span className="text-red-500"> {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
