'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { PCCList, GDS, Organisation, OTAClient, GDSFunctionality, GDSFeature } from '@/types'

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
}
const PCC_FUNCTIONALITY = ['Booking Only', 'Booking & Ticketing', 'Profile', 'Fareview', 'Cert PCC'] as const

const EMPTY: Partial<PCCList> = {
  gds_id: undefined, pcc: '', status: 'Active',
  org_id: null, ota_client_id: null, functionality_id: null, pcc_functionality: null, client_group_id: null, remarks: null,
}

interface ImportRow {
  gds_name: string; pcc: string; status: PCCStatus
  _row: number; _errors: string[]; _gds_id?: number
}

export default function GDSInfoPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [records, setRecords] = useState<PCCList[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [clientGroups, setClientGroups] = useState<{id:number;name:string}[]>([])
  const [filterGroup, setFilterGroup] = useState('')
  const [orgList, setOrgList] = useState<Organisation[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [funcList, setFuncList] = useState<GDSFunctionality[]>([])
  const [allFeatures, setAllFeatures] = useState<GDSFeature[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGDS, setFilterGDS] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOrg, setFilterOrg] = useState('')
  const [filterPCC, setFilterPCC] = useState('')
  const [filterOTA, setFilterOTA] = useState('')

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<PCCList>>(EMPTY)
  const [editing, setEditing] = useState<PCCList | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // PCC Assigned login popup
  const [loginPopupOpen, setLoginPopupOpen] = useState(false)
  const [loginPopupPCC, setLoginPopupPCC] = useState<PCCList | null>(null)
  const [loginPopupData, setLoginPopupData] = useState<{sabre: {id:number;epr:string;email:string|null;pcc:string|null;status:string}[];amadeus:{id:number;login:string;sign_on_id:string|null;oid:string|null}[];travelport:{id:number;sign_on_id:string|null;cid:string|null;pcc:string|null}[]}>({ sabre:[], amadeus:[], travelport:[] })
  const [loginPopupLoading, setLoginPopupLoading] = useState(false)

  // GDS Feature detail popup
  const [featurePopup, setFeaturePopup] = useState<PCCList | null>(null)
  const [featurePopupOpen, setFeaturePopupOpen] = useState(false)
  const [profileFeatureIds, setProfileFeatureIds] = useState<Set<number>>(new Set())
  const [featureToggling, setFeatureToggling] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number|"all">(25)
  const PAGE_SIZE = pageSize

  // Bulk edit
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkFeatureIds, setBulkFeatureIds] = useState<Set<number>>(new Set())
  const [bulkMode, setBulkMode] = useState<'add' | 'remove'>('add')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  // Import
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = profile?.role ?? 'user'
      setIsAdmin(role === 'admin' || role === 'manager')
    }
    const [{ data: pccData }, { data: gdsData }, { data: groupData }, { data: orgData }, { data: otaData }, { data: funcData }, { data: featData }] = await Promise.all([
      supabase.from('pcc_list').select(`
        *, gds:gds_id(id, name),
        organisation:org_id(id, organisation, iata),
        ota_client:ota_client_id(id, company_name),
        client_group:client_group_id(id, name),
        gds_functionality:functionality_id(id, name, gds_id),
        pcc_features(feature_id, gds_features:feature_id(id, key, label, cost, currency, billing_cycle))
      `).order('pcc'),
      supabase.from('gds').select('*').order('name'),
      supabase.from('client_group').select('id,name').order('name'),
      supabase.from('organisation').select('*').order('organisation'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
      supabase.from('gds_functionality').select('id, name, gds_id').order('name'),
      supabase.from('gds_features').select('*').order('label'),
    ])
    const sorted = (pccData ?? []).slice().sort((a, b) => {
      const orgA = (a.organisation as { organisation: string } | undefined)?.organisation ?? ''
      const orgB = (b.organisation as { organisation: string } | undefined)?.organisation ?? ''
      const gdsA = (a.gds as { name: string } | undefined)?.name ?? ''
      const gdsB = (b.gds as { name: string } | undefined)?.name ?? ''
      return orgA.localeCompare(orgB) || gdsA.localeCompare(gdsB) || a.pcc.localeCompare(b.pcc)
    })
    setRecords(sorted)
    setGdsList(gdsData ?? [])
    setClientGroups(groupData ?? [])
    setOrgList(orgData ?? [])
    setOtaClients(otaData ?? [])
    setFuncList(funcData ?? [])
    setAllFeatures(featData ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY, gds_id: gdsList[0]?.id })
    setError(''); setModalOpen(true)
  }

  function openEdit(row: PCCList) {
    setEditing(row)
    setForm({
      gds_id: row.gds_id, pcc: row.pcc, status: row.status ?? 'Active',
      org_id: row.org_id ?? null, ota_client_id: row.ota_client_id ?? null,
      functionality_id: row.functionality_id ?? null, pcc_functionality: row.pcc_functionality ?? null, client_group_id: (row as PCCList & {client_group_id?:number|null}).client_group_id ?? null, remarks: row.remarks ?? null,
      pcc_functionality: row.pcc_functionality ?? null,
    })
    setError(''); setModalOpen(true)
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
      functionality_id: form.functionality_id ?? null, pcc_functionality: form.pcc_functionality ?? null, client_group_id: (form as Partial<PCCList> & {client_group_id?:number|null}).client_group_id ?? null, remarks: form.remarks ?? null,
      pcc_functionality: (form as Partial<PCCList>).pcc_functionality ?? null,
    }
    const { error: err } = editing
      ? await supabase.from('pcc_list').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('pcc_list').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('pcc_list').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── PCC ASSIGNED LOGIN POPUP ──────────────────────────────────
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
        ? supabase.from('amadeus_user').select('id,login,sign_on_id,oid').eq('ota_client_id', pcc.ota_client_id).order('login')
        : Promise.resolve({ data: [] }),
      gdsName === 'Travelport' || !gdsName
        ? supabase.from('travelport_user').select('id,sign_on_id,cid,pcc').eq('ota_client_id', pcc.ota_client_id).order('sign_on_id')
        : Promise.resolve({ data: [] }),
    ])
    setLoginPopupData({ sabre: sabreData ?? [], amadeus: amData ?? [], travelport: tpData ?? [] })
    setLoginPopupLoading(false)
  }

  // ── GDS FEATURE POPUP ─────────────────────────────────────────
  function openFeaturePopup(row: PCCList) {
    setFeaturePopup(row)
    // Use pcc_features (direct PCC assignments) — independent of any profile
    const existing = new Set(((row as unknown as {pcc_features?: {feature_id: number}[]}).pcc_features ?? []).map(pf => pf.feature_id))
    setProfileFeatureIds(existing)
    setFeaturePopupOpen(true)
  }

  async function toggleProfileFeature(featureId: number) {
    if (!featurePopup || !isAdmin) return
    setFeatureToggling(true)
    const has = profileFeatureIds.has(featureId)
    if (has) {
      await supabase.from('pcc_features').delete()
        .eq('pcc_list_id', featurePopup.id).eq('feature_id', featureId)
      setProfileFeatureIds(prev => { const s = new Set(prev); s.delete(featureId); return s })
    } else {
      await supabase.from('pcc_features').insert({ pcc_list_id: featurePopup.id, feature_id: featureId })
      setProfileFeatureIds(prev => new Set([...prev, featureId]))
    }
    setFeatureToggling(false)
    fetchAll()
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const data = filtered.map((r, i) => {
      const gdsName = (r.gds as GDS)?.name ?? ''
      const org = r.organisation as Organisation
      const ota = r.ota_client as OTAClient
      const func = r.gds_functionality as GDSFunctionality
      return {
        'No.': i + 1,
        'Organisation': org?.organisation ?? '',
        'IATA': org?.iata ?? '',
        'GDS': gdsName,
        'PCC': r.pcc,
        'Status': r.status ?? '',
        'PCC Assigned': ota?.company_name ?? '',
        'GDS Feature': func?.name ?? '',
        'PCC Functionality': r.pcc_functionality ?? '',
        'PCC Functionality': (r as PCCList & {pcc_functionality?: string}).pcc_functionality ?? '',
        'Remarks': r.remarks ?? '',
        'Created': new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GDS Info')
    XLSX.writeFile(wb, `GDSHub_GDS_Info_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'GDS': 'Sabre',   'PCC': 'KULMY217Z', 'Status': 'Active'  },
      { 'GDS': 'Amadeus', 'PCC': 'KULMY255W', 'Status': 'Pending' },
    ])
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GDS Info')
    XLSX.writeFile(wb, 'GDSHub_GDS_Info_Template.xlsx')
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
      if (error) { failed++; failedRows.push(`${row.pcc} (${row.gds_name}) — ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null); setDetectedHeaders([]) }

  // ── FILTER ────────────────────────────────────────────────────
  const filtered = records.filter(r => {
    const pccGroup = r.client_group as {id:number;name:string} | null
    if (filterGroup && !pccGroup?.name?.toLowerCase().includes(filterGroup.toLowerCase())) return false
    const matchSearch = r.pcc.toLowerCase().includes(search.toLowerCase())
    const matchGDS    = filterGDS    === 'all' || String(r.gds_id)        === filterGDS
    const matchStatus = filterStatus === 'all' || (r.status ?? 'Active')  === filterStatus
    const matchOrg    = !filterOrg    || (r.organisation as {organisation:string}|null)?.organisation?.toLowerCase().includes(filterOrg.toLowerCase())
    const matchPCC    = !filterPCC    || r.pcc.toLowerCase().includes(filterPCC.toLowerCase())
    const matchOTA    = !filterOTA    || (r.ota_client as {company_name:string}|null)?.company_name?.toLowerCase().includes(filterOTA.toLowerCase())
    return matchSearch && matchGDS && matchStatus && matchOrg && matchPCC && matchOTA
  })

  const filteredFuncs = funcList.filter(f => !form.gds_id || f.gds_id === form.gds_id)

  // Pagination
  const effectiveSize = pageSize === "all" ? filtered.length : pageSize
  const totalPages = pageSize === "all" ? 1 : Math.ceil(filtered.length / effectiveSize)
  const paginated = pageSize === "all" ? filtered : filtered.slice((currentPage - 1) * effectiveSize, currentPage * effectiveSize)

  // Reset to page 1 when filters change
  const resetPage = () => setCurrentPage(1)

  // Bulk selection helpers
  const allFilteredIds = paginated.map(r => r.id)
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id))
  const someSelected = allFilteredIds.some(id => selectedIds.has(id)) && !allSelected

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(prev => { const s = new Set(prev); allFilteredIds.forEach(id => s.delete(id)); return s })
    } else {
      setSelectedIds(prev => new Set([...prev, ...allFilteredIds]))
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function openBulk() {
    setBulkFeatureIds(new Set())
    setBulkMode('add')
    setBulkResult(null)
    setBulkOpen(true)
  }

  async function handleBulkApply() {
    if (selectedIds.size === 0 || bulkFeatureIds.size === 0) return
    setBulkSaving(true); setBulkResult(null)
    let done = 0
    for (const pccId of selectedIds) {
      for (const featId of bulkFeatureIds) {
        if (bulkMode === 'add') {
          await supabase.from('pcc_features')
            .upsert({ pcc_list_id: pccId, feature_id: featId }, { onConflict: 'pcc_list_id,feature_id' })
        } else {
          await supabase.from('pcc_features')
            .delete().eq('pcc_list_id', pccId).eq('feature_id', featId)
        }
      }
      done++
    }
    setBulkSaving(false)
    setBulkResult(`${bulkMode === 'add' ? 'Added' : 'Removed'} ${bulkFeatureIds.size} feature${bulkFeatureIds.size !== 1 ? 's' : ''} across ${done} PCC${done !== 1 ? 's' : ''}.`)
    fetchAll()
  }

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  // Features for popup — only those matching the PCC's GDS
  const popupGdsId = featurePopup ? featurePopup.gds_id : null
  const availableFeatures = allFeatures.filter(f => f.gds_id === popupGdsId)

  const popupFunc = featurePopup?.gds_functionality as GDSFunctionality | undefined
  const popupGds = featurePopup?.gds as GDS | undefined
  const popupOrg = featurePopup?.organisation as Organisation | undefined
  const popupOta = featurePopup?.ota_client as OTAClient | undefined

  function fmtCost(cost: number, currency: string, cycle: string) {
    if (!cost) return null
    const amt = new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
    const suffixes: Record<string, string> = { monthly: '/mo', yearly: '/yr', per_user: '/user', per_transaction: '/txn', one_time: '' }
    return `${amt}${suffixes[cycle] ?? ''}`
  }

  // ── COLUMNS ───────────────────────────────────────────────────
  const columns = [
    // 0. Checkbox
    {
      key: '_select', label: '', width: '44px',
      width: '48px',
      render: (row: PCCList) => isAdmin ? (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
        />
      ) : null
    },
    // 1. Organisation
    {
      key: 'organisation', label: 'Organisation',
      render: (row: PCCList) => {
        const org = row.organisation as Organisation
        return org
          ? <div><p className="text-sm text-slate-700 font-medium">{org.organisation}</p>{org.iata && <p className="text-xs text-slate-400 font-mono">{org.iata}</p>}</div>
          : <span className="text-slate-300 text-xs">—</span>
      }
    },
    // 2. GDS
    {
      key: 'gds', label: 'GDS', width: '120px',
      render: (row: PCCList) => {
        const name = (row.gds as GDS)?.name ?? gdsList.find(g => g.id === row.gds_id)?.name ?? '—'
        return <span className={`font-medium rounded-full border text-center ${GDS_COLORS[name] ?? 'bg-slate-100 text-slate-600'}`} style={{display:'inline-block',width:'100px',fontSize:'12px',padding:'4px 0',textAlign:'center'}}>{name}</span>
      }
    },
    // 3. PCC
    {
      key: 'pcc', label: 'PCC', width: '120px',
      render: (row: PCCList) => <span className="font-mono font-semibold text-slate-800 bg-slate-100 rounded" style={{display:'inline-block',width:'100px',textAlign:'center',fontSize:'13px',padding:'4px 0',textTransform:"uppercase",letterSpacing:'0.04em'}}>{row.pcc}</span>
    },
    // 5. PCC Functionality
    {
      key: 'pcc_functionality', label: 'PCC Functionality', width: '140px',
      render: (row: PCCList) => {
        const val = row.pcc_functionality
        const colors: Record<string,string> = {
          'Booking Only':'#0891b2','Booking & Ticketing':'#7c3aed',
          'Profile':'#059669','Fareview':'#d97706','Cert PCC':'#dc2626'
        }
        return val
          ? <span style={{fontSize:'13px',fontWeight:500,color:colors[val]??'#334155',textTransform:'uppercase',letterSpacing:'0.03em'}}>{val}</span>
          : <span style={{color:'#cbd5e1'}}>—</span>
      }
    },
    // 4. PCC Assigned — badge + view logins link
    {
      key: 'ota_client_id', label: 'PCC Assigned', width: '220px',
      render: (row: PCCList) => {
        const ota = row.ota_client as OTAClient
        return ota ? (
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'13px',fontWeight:500,color:'#334155',whiteSpace:'nowrap',textTransform:'uppercase',letterSpacing:'0.02em'}}>{ota.company_name}</span>
            <button onClick={() => openLoginPopup(row)}
              style={{fontSize:'12px',color:'#3b82f6',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0,whiteSpace:'nowrap'}}>
              View IDs
            </button>
          </div>
        ) : <span style={{color:'#cbd5e1'}}>—</span>
      }
    },
    // 4b. Client Group
    {
      key: 'client_group', label: 'Client Group', width: '120px',
      render: (row: PCCList) => {
        const g = row.client_group as {id:number;name:string} | null
        return g
          ? <span style={{fontSize:'13px',fontWeight:500,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.03em'}}>{g.name}</span>
          : <span style={{color:'#cbd5e1'}}>—</span>
      }
    },
    // 6. GDS Feature — clickable badge that opens popup
    {
      key: 'functionality_id', label: 'GDS Feature', width: '120px',
      render: (row: PCCList) => {
        const func = row.gds_functionality as GDSFunctionality
        const directCount = ((row as unknown as {pcc_features?: {feature_id: number}[]}).pcc_features ?? []).length
        return (
          <button onClick={() => openFeaturePopup(row)}
            style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',cursor:'pointer',padding:0}}>
            <span style={{fontSize:'13px',color: directCount > 0 ? '#334155' : '#94a3b8',fontWeight: directCount > 0 ? 500 : 400,textTransform:'uppercase',letterSpacing:'0.02em'}}>
              {func ? func.name : 'No profile'}
            </span>
            <span style={{fontSize:'11px',fontWeight:600,color: directCount > 0 ? '#2563eb' : '#94a3b8',
              background: directCount > 0 ? '#dbeafe' : '#f1f5f9',
              borderRadius:'20px',padding:'1px 7px'}}>
              {directCount}
            </span>
          </button>
        )
      }
    },
    // 7. Status
    {
      key: 'status', label: 'Status', width: '100px',
      render: (row: PCCList) => {
        const s = row.status ?? 'Active'
        const dotColor: Record<string,string> = {
          Active:'#10b981', Vacant:'#94a3b8', Pending:'#f59e0b'
        }
        const txtColor: Record<string,string> = {
          Active:'#059669', Vacant:'#64748b', Pending:'#d97706'
        }
        return (
          <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'12px',fontWeight:600,color:txtColor[s]??'#334155',textTransform:'uppercase',letterSpacing:'0.05em'}}>
            <span style={{width:'7px',height:'7px',borderRadius:'50%',background:dotColor[s]??'#94a3b8',flexShrink:0,display:'inline-block'}}/>
            {s}
          </span>
        )
      }
    },
    // 8. Remarks
    {
      key: 'remarks', label: 'Remarks', width: '120px',
      render: (row: PCCList) => {
        if (!row.remarks) return <span className="text-slate-300 text-xs">—</span>
        const points = row.remarks.split('\n').map(l => l.trim()).filter(Boolean)
        return points.length > 1 ? (
          <ul className="list-disc list-inside space-y-0.5">
            {points.map((p, i) => <li key={i} className="text-sm text-slate-600">{p}</li>)}
          </ul>
        ) : (
          <span className="text-sm text-slate-600">{row.remarks}</span>
        )
      }
    },
  ]

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 style={{fontSize:"28px",fontWeight:700,color:"#0f172a",lineHeight:"1.2"}}>GDS Info</h1>
          <p style={{fontSize:"14px",color:"#64748b",marginTop:"4px"}}>Manage GDS, PCC, OTA clients and PCC functionality</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
          <button onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export xlsx
          </button>
          )}
          {isAdmin && selectedIds.size > 0 && (
            <button onClick={openBulk} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Bulk Edit ({selectedIds.size})
            </button>
          )}
          {isAdmin && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import xlsx
              </button>
              <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Add GDS Info
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:"10px",padding:"14px 16px",marginBottom:"16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr auto",alignItems:"flex-end",gap:"10px",width:"100%"}}>

          {/* Organisation */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>Organisation</label>
            <div style={{position:"relative"}}>
              <input type="text" list="org-list" value={filterOrg} onChange={e => { setFilterOrg(e.target.value); resetPage() }}
                placeholder="Search org..."
                style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}
                onFocus={e => (e.currentTarget.style.borderColor = "#0f172a")} onBlur={e => (e.currentTarget.style.borderColor = "#e2e8f0")} />
              <datalist id="org-list">{orgList.map(o => <option key={o.id} value={o.organisation} />)}</datalist>
            </div>
          </div>

          {/* PCC */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>PCC</label>
            <div style={{position:"relative"}}>
              <input type="text" list="pcc-list" value={filterPCC} onChange={e => { setFilterPCC(e.target.value); resetPage() }}
                placeholder="Code..."
                style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}
                onFocus={e => (e.currentTarget.style.borderColor = "#0f172a")} onBlur={e => (e.currentTarget.style.borderColor = "#e2e8f0")} />
              <datalist id="pcc-list">{[...new Set(records.map(r => r.pcc))].sort().map(pcc => <option key={pcc} value={pcc} />)}</datalist>
            </div>
          </div>

          {/* PCC Assigned */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>PCC Assigned</label>
            <div style={{position:"relative"}}>
              <input type="text" list="ota-list" value={filterOTA} onChange={e => { setFilterOTA(e.target.value); resetPage() }}
                placeholder="Assigned..."
                style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}
                onFocus={e => (e.currentTarget.style.borderColor = "#0f172a")} onBlur={e => (e.currentTarget.style.borderColor = "#e2e8f0")} />
              <datalist id="ota-list">{otaClients.map(o => <option key={o.id} value={o.company_name} />)}</datalist>
            </div>
          </div>

          {/* Client Group */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>Client Group</label>
            <div style={{position:"relative"}}>
              <input type="text" list="group-list" value={filterGroup} onChange={e => { setFilterGroup(e.target.value); resetPage() }}
                placeholder="Group..."
                style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}
                onFocus={e => (e.currentTarget.style.borderColor = "#0f172a")} onBlur={e => (e.currentTarget.style.borderColor = "#e2e8f0")} />
              <datalist id="group-list">{clientGroups.map(g => <option key={g.id} value={g.name} />)}</datalist>
            </div>
          </div>

          {/* GDS */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>GDS</label>
            <select value={filterGDS} onChange={e => { setFilterGDS(e.target.value); resetPage() }}
              style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}>
              <option value="all">All GDS</option>
              {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
            </select>
          </div>

          {/* Status */}
          <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
            <label style={{fontSize:"12px",fontWeight:600,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>Status</label>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); resetPage() }}
              style={{width:"100%",padding:"7px 12px",fontSize:"13px",border:"1px solid #e2e8f0",borderRadius:"7px",background:"white",color:"#334155",outline:"none",boxSizing:"border-box"}}>
              <option value="all">All Status</option>
              {PCC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Reset button only */}
          <div style={{display:"flex",alignItems:"flex-end",paddingBottom:"1px"}}>
            <button
              onClick={() => { setFilterOrg(''); setFilterPCC(''); setFilterOTA(''); setFilterGDS('all'); setFilterStatus('all'); setFilterGroup(''); resetPage() }}
              title="Reset filters"
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:"34px",height:"34px",background:"white",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:"7px",cursor:"pointer",flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>

        </div>
      </div>

      {/* Select all + records count bar */}
      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px',isolation:'isolate'}}>
        {isAdmin && !loading && filtered.length > 0 && (
          <label style={{display:'flex',alignItems:'center',gap:'6px',cursor:'pointer',fontSize:'13px',color:'#475569',fontWeight:500}}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected }}
              onChange={toggleSelectAll}
              style={{width:'15px',height:'15px',cursor:'pointer',accentColor:'#0f172a'}}
            />
            Select all
          </label>
        )}
        {isAdmin && selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())}
            style={{fontSize:'12px',color:'#94a3b8',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0}}>
            Clear ({selectedIds.size} selected)
          </button>
        )}
        {!loading && (
          <span style={{fontSize:'12px',color:'#94a3b8',fontWeight:500,marginLeft:'auto'}}>
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {totalPages > 1 ? ' · Page ' + currentPage + ' of ' + totalPages : ''}
          </span>
        )}
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable
          columns={columns}
          data={paginated as unknown as Record<string, unknown>[]}
          onEdit={isAdmin ? r => openEdit(r as unknown as PCCList) : undefined}
          onDelete={isAdmin ? r => openDelete(r as unknown as PCCList) : undefined}
          isAdmin={isAdmin}
          emptyMessage="No GDS Info records found."
        />
      )}

      {/* ── Pagination ── */}
      {!loading && filtered.length > 0 && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"16px",background:"white",border:"1px solid #e2e8f0",borderRadius:"10px",padding:"10px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",overflow:"hidden",position:"relative",zIndex:1}}>
          {/* Left: record count + page size */}
          <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
            <span style={{fontSize:"13px",fontWeight:600,color:"#334155"}}>
              {pageSize === "all"
                ? <><span style={{color:"#0f172a"}}>{filtered.length}</span> records total</>
                : <><span style={{color:"#0f172a"}}>{((currentPage-1)*effectiveSize)+1}–{Math.min(currentPage*effectiveSize, filtered.length)}</span> <span style={{color:"#94a3b8",fontWeight:400}}>of</span> <span style={{color:"#0f172a"}}>{filtered.length}</span> records</>
              }
            </span>
            <div style={{width:"1px",height:"18px",background:"#e2e8f0"}}/>
            <select value={String(pageSize)} onChange={e => { setPageSize(e.target.value === "all" ? "all" : Number(e.target.value)); setCurrentPage(1) }}
              style={{padding:"5px 10px",fontSize:"12px",fontWeight:600,border:"1px solid #6366f1",borderRadius:"7px",background:"#eef2ff",color:"#4338ca",outline:"none",cursor:"pointer"}}>
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
              <option value="all">All</option>
            </select>
          </div>

          {/* Right: page buttons */}
          <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || pageSize === "all"}
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:"32px",height:"32px",borderRadius:"8px",border:"1px solid #e2e8f0",background:"white",color:"#64748b",fontSize:"16px",cursor:"pointer",opacity:currentPage===1||pageSize==="all"?0.35:1,transition:"all 0.15s"}}>
              ‹
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
              const show = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2
              const ellipsisBefore = page === 2 && currentPage > 4
              const ellipsisAfter = page === totalPages - 1 && currentPage < totalPages - 3
              if (!show) return null
              if (ellipsisBefore) return <span key={`e-${page}`} style={{padding:"0 4px",color:"#94a3b8",fontSize:"13px"}}>…</span>
              if (ellipsisAfter) return <span key={`e-${page}`} style={{padding:"0 4px",color:"#94a3b8",fontSize:"13px"}}>…</span>
              return (
                <button key={page} onClick={() => setCurrentPage(page)}
                  style={{display:"flex",alignItems:"center",justifyContent:"center",minWidth:"32px",height:"32px",padding:"0 8px",borderRadius:"8px",border: currentPage===page ? "1px solid #3b82f6" : "1px solid #e2e8f0",background: currentPage===page ? "#3b82f6" : "white",color: currentPage===page ? "white" : "#475569",fontSize:"13px",fontWeight: currentPage===page ? 700 : 500,cursor:"pointer",transition:"all 0.15s",boxShadow: currentPage===page ? "0 2px 6px rgba(59,130,246,0.35)" : "none"}}>
                  {page}
                </button>
              )
            })}

            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || pageSize === "all"}
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:"32px",height:"32px",borderRadius:"8px",border:"1px solid #e2e8f0",background:"white",color:"#64748b",fontSize:"16px",cursor:"pointer",opacity:currentPage===totalPages||pageSize==="all"?0.35:1,transition:"all 0.15s"}}>
              ›
            </button>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit GDS Info' : 'Add GDS Info'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS <span className="text-red-500">*</span></label>
              <select value={form.gds_id ?? ''} onChange={e => setForm(f => ({ ...f, gds_id: Number(e.target.value), functionality_id: null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                <option value="">— Select GDS —</option>
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
            <select value={(form as Partial<PCCList>).pcc_functionality ?? ''} onChange={e => setForm(f => ({ ...f, pcc_functionality: e.target.value || null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {PCC_FUNCTIONALITY.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Group</label>
            <select value={(form as Partial<PCCList> & {client_group_id?:number|null}).client_group_id ?? ''} onChange={e => setForm(f => ({ ...f, client_group_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {clientGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Organisation</label>
            <select value={form.org_id ?? ''} onChange={e => setForm(f => ({ ...f, org_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {orgList.map(o => <option key={o.id} value={o.id}>{o.organisation}{o.iata ? ` (${o.iata})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id ?? ''} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Remarks</label>
            <textarea
              value={(form as Partial<PCCList>).remarks ?? ''}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value || null }))}
              placeholder="Additional notes or information…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add GDS Info'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete GDS Info" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete PCC <strong className="font-mono">{editing?.pcc}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── GDS Feature Detail Popup ── */}
      <Modal
        open={featurePopupOpen}
        onClose={() => { setFeaturePopupOpen(false); setFeaturePopup(null) }}
        title="GDS Feature Details"
        size="lg"
      >
        {featurePopup && (
          <div className="space-y-5">

            {/* PCC Details section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">PCC Details</p>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                <div>
                  <p className="text-xs text-slate-400">PCC Code</p>
                  <p className="font-mono font-bold text-slate-800 bg-slate-200 px-2 py-0.5 rounded text-sm inline-block mt-0.5">{featurePopup.pcc}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">GDS</p>
                  {popupGds && <span className={`text-xs font-medium px-2.5 py-1 rounded-full border mt-0.5 inline-block ${GDS_COLORS[popupGds.name] ?? 'bg-slate-100 text-slate-600'}`}>{popupGds.name}</span>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  {featurePopup.status && <span className={`text-xs font-medium px-2.5 py-1 rounded-full border mt-0.5 inline-block ${STATUS_COLORS[featurePopup.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{featurePopup.status}</span>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Organisation</p>
                  <p className="text-sm text-slate-700 font-medium mt-0.5">{popupOrg?.organisation ?? <span className="text-slate-300">—</span>}</p>
                  {popupOrg?.iata && <p className="text-xs text-slate-400 font-mono">{popupOrg.iata}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">OTA Client</p>
                  {popupOta
                    ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mt-0.5 inline-block">{popupOta.company_name}</span>
                    : <p className="text-sm text-slate-300 mt-0.5">—</p>}
                </div>

              </div>
            </div>

            {/* Features section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700">
                  Features
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {profileFeatureIds.size} of {availableFeatures.length} enabled
                  </span>
                </p>

              </div>

              {availableFeatures.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-4">
                  No features defined for {popupGds?.name ?? 'this GDS'} yet. Add them in GDS Functionality.
                </p>
              ) : isAdmin ? (
                // Admin/Manager: show all features with toggle buttons
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  {availableFeatures.map((f, i) => {
                    const enabled = profileFeatureIds.has(f.id)
                    const costStr = fmtCost(f.cost, f.currency, f.billing_cycle as string)
                    return (
                      <div key={f.id} className={`flex items-center justify-between px-4 py-3 ${i < availableFeatures.length - 1 ? 'border-b border-slate-100' : ''} ${enabled ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {enabled ? '✓' : '✕'}
                          </span>
                          <div>
                            <p className={`text-sm ${enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{f.label}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {costStr && <p className="text-xs text-slate-400">{costStr}</p>}
                              {f.billing_cycle && costStr && <span className="text-xs text-slate-300">·</span>}
                              {f.billing_cycle && <p className="text-xs text-slate-400">{f.billing_cycle}</p>}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleProfileFeature(f.id)}
                          disabled={featureToggling}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                        >
                          {enabled ? '− Remove' : '+ Add'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                // Viewer: show only enabled features as clean list
                (() => {
                  const enabledFeatures = availableFeatures.filter(f => profileFeatureIds.has(f.id))
                  return enabledFeatures.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-4">No features assigned to this PCC.</p>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      {enabledFeatures.map((f, i) => {
                        const costStr = fmtCost(f.cost, f.currency, f.billing_cycle as string)
                        return (
                          <div key={f.id} className={`flex items-center gap-3 px-4 py-3 ${i < enabledFeatures.length - 1 ? 'border-b border-slate-100' : ''}`}>
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex-shrink-0">✓</span>
                            <div>
                              <p className="text-sm text-slate-800 font-medium">{f.label}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {costStr && <p className="text-xs text-slate-400">{costStr}</p>}
                                {f.billing_cycle && <span className="text-xs text-slate-300">·</span>}
                                {f.billing_cycle && <p className="text-xs text-slate-400">{f.billing_cycle}</p>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => { setFeaturePopupOpen(false); setFeaturePopup(null) }} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── PCC Assigned Login Popup ── */}
      <Modal
        open={loginPopupOpen}
        onClose={() => { setLoginPopupOpen(false); setLoginPopupPCC(null) }}
        title={`GDS Logins — ${(loginPopupPCC?.ota_client as OTAClient)?.company_name ?? ''}`}
        size="lg"
      >
        {loginPopupLoading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading logins…</div>
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
                              <td className="px-4 py-2.5 text-slate-600 text-xs">{(r as {users?:{email_address:string}|null}).users?.email_address??'—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc??'—'}</td>
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
                          <tr>{['Login','Sign-On ID','OID'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.amadeus.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.amadeus.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.login}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.sign_on_id??'—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.oid??'—'}</td>
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
                          <tr>{['Sign-On ID','CID','PCC'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.travelport.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.travelport.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.sign_on_id??'—'}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.cid??'—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc??'—'}</td>
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

      {/* ── Bulk Edit Modal ── */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Bulk Edit GDS Features — ${selectedIds.size} PCC${selectedIds.size !== 1 ? 's' : ''} selected`} size="md">
        <div className="space-y-4">
          {bulkResult ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-700 font-medium">✅ {bulkResult}</p>
            </div>
          ) : (
            <>
              {/* Mode toggle */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Action</label>
                <div className="flex gap-2">
                  {(['add', 'remove'] as const).map(m => (
                    <button key={m} onClick={() => setBulkMode(m)}
                      className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors border ${
                        bulkMode === m
                          ? m === 'add' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-red-500 text-white border-red-500'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}>
                      {m === 'add' ? '+ Add features to all selected' : '− Remove features from all selected'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected PCCs summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-slate-500 mb-2">Applying to {selectedIds.size} PCC{selectedIds.size !== 1 ? 's' : ''}:</p>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {filtered.filter(r => selectedIds.has(r.id)).map(r => (
                    <span key={r.id} className="font-mono text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded">{r.pcc}</span>
                  ))}
                </div>
              </div>

              {/* Feature selection — grouped by GDS */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select features to {bulkMode} <span className="text-slate-400 font-normal">(click to toggle)</span>
                </label>
                {(() => {
                  // Get unique GDS IDs from selected PCCs
                  const selectedPCCs = filtered.filter(r => selectedIds.has(r.id))
                  const gdsIds = [...new Set(selectedPCCs.map(r => r.gds_id))]
                  const relevantFeatures = allFeatures.filter(f => gdsIds.includes(f.gds_id ?? 0))

                  if (relevantFeatures.length === 0) return (
                    <p className="text-sm text-slate-400 italic py-4 text-center">No features available for the selected PCCs' GDS platforms.</p>
                  )

                  const grouped = gdsList
                    .filter(g => gdsIds.includes(g.id))
                    .map(g => ({ gds: g, features: relevantFeatures.filter(f => f.gds_id === g.id) }))
                    .filter(g => g.features.length > 0)

                  return (
                    <div className="space-y-3 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-3">
                      {grouped.map(({ gds, features }) => (
                        <div key={gds.id}>
                          <p className={`text-xs font-semibold mb-1.5 px-2 py-1 rounded-full inline-block border ${GDS_COLORS[gds.name] ?? 'bg-slate-100 text-slate-600'}`}>{gds.name}</p>
                          <div className="flex flex-wrap gap-2">
                            {features.map(f => {
                              const selected = bulkFeatureIds.has(f.id)
                              return (
                                <button key={f.id}
                                  onClick={() => setBulkFeatureIds(prev => { const s = new Set(prev); s.has(f.id) ? s.delete(f.id) : s.add(f.id); return s })}
                                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                                    selected ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                  }`}>
                                  {f.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {bulkFeatureIds.size > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-xs text-indigo-700">
                  {bulkMode === 'add' ? 'Will add' : 'Will remove'} <strong>{bulkFeatureIds.size} feature{bulkFeatureIds.size !== 1 ? 's' : ''}</strong> on <strong>{selectedIds.size} PCC{selectedIds.size !== 1 ? 's' : ''}</strong> ({selectedIds.size * bulkFeatureIds.size} total operations)
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setBulkOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              {bulkResult ? 'Close' : 'Cancel'}
            </button>
            {!bulkResult && (
              <button onClick={handleBulkApply} disabled={bulkSaving || bulkFeatureIds.size === 0}
                className={`flex-1 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition-colors ${bulkMode === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {bulkSaving ? 'Applying…' : `${bulkMode === 'add' ? 'Add' : 'Remove'} to ${selectedIds.size} PCC${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import GDS Info" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-medium">✅ Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p>
                : <div className="space-y-1"><p className="font-medium">✅ {importResult.success} imported · ⚠️ {importResult.failed} skipped</p>
                    {importResult.failedRows.map((r, i) => <p key={i} className="text-xs opacity-70 font-mono">{r}</p>)}</div>}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">File: <span className="font-medium">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows — <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p>
                </div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
                <div>Required: <span className="font-mono font-medium text-slate-700">GDS</span>, <span className="font-mono font-medium text-slate-700">PCC</span> · Optional: <span className="font-mono font-medium text-slate-700">Status</span></div>
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
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium">✓ OK</span> : <span className="text-red-500">✗ {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing…' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
