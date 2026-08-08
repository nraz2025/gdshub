'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { PCCList, GDS, Organisation, OTAClient, GDSFunctionality, GDSFeature } from '@/types'

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
  org_id: null, ota_client_id: null, functionality_id: null, pcc_functionality: null, client_group_id: null, remarks: null,
}

interface ImportRow {
  gds_name: string; pcc: string; status: PCCStatus
  _row: number; _errors: string[]; _gds_id?: number
}

// Custom autocomplete — replaces native <datalist> popups, which browsers render
// using OS-level UI that CSS cannot style at all, in any browser.
function AutocompleteInput({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = value ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())) : options

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input type="text" value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '9px 14px 9px 34px', fontSize: '14px', border: `1.5px solid ${open ? D.accent : D.borderLight}`, borderRadius: '8px', background: D.bg, color: D.fg, outline: 'none', boxSizing: 'border-box', boxShadow: open ? `0 0 0 3px ${D.accentSoft}` : 'none', transition: 'border-color 0.15s, box-shadow 0.15s' }} />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto', background: D.card, border: `1.5px solid ${D.accent}`, borderRadius: '8px', boxShadow: `0 12px 28px rgba(0,0,0,0.35), 0 0 0 3px ${D.accentSoft}`, zIndex: 60, padding: '4px' }}>
          {filtered.slice(0, 50).map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false) }}
              style={{ padding: '8px 10px', fontSize: '14px', color: D.fg, cursor: 'pointer', borderRadius: '6px' }}
              onMouseOver={e => (e.currentTarget.style.background = D.accentSoft)}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GDSAccessRecordPage() {
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
  const [filterPccFunc, setFilterPccFunc] = useState('')

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
  const [loginPopupData, setLoginPopupData] = useState<{sabre: {id:number;epr:string;email:string|null;pcc:string|null;status:string}[];amadeus:{id:number;login:string;sign_on_id:string|null;oid:string|null;status:string}[];travelport:{id:number;sign_on_id:string|null;cid:string|null;pcc:string|null;status:string}[]}>({ sabre:[], amadeus:[], travelport:[] })
  const [loginPopupLoading, setLoginPopupLoading] = useState(false)

  // GDS Feature detail popup
  const [featurePopup, setFeaturePopup] = useState<PCCList | null>(null)
  const [featurePopupOpen, setFeaturePopupOpen] = useState(false)
  const [profileFeatureIds, setProfileFeatureIds] = useState<Set<number>>(new Set())
  const [featureToggling, setFeatureToggling] = useState(false)
  const [tierModalFeature, setTierModalFeature] = useState<{label:string; tiers:{sort_order:number;tier:string;price:number;currency:string;unit:string;billing:string}[]} | null>(null)

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
    const [{ data: pccData }, { data: gdsData }, { data: groupData }, { data: orgData }, { data: otaData }, { data: funcData }, { data: featData }, { data: cycleData }, { data: pccFuncOptData }] = await Promise.all([
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
      supabase.from('gds_features').select('*, pricing_tiers').order('label'),
      supabase.from('billing_cycles').select('value, label').order('sort_order'),
      supabase.from('pcc_functionality_options').select('id, name').order('sort_order'),
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
    setBillingCycles(cycleData ?? [])
    setPccFunctionalityOptions(pccFuncOptData ?? [])
    setLoading(false)
  }

  //  CRUD 
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
        ? supabase.from('amadeus_user').select('id,login,sign_on_id,oid,status').eq('ota_client_id', pcc.ota_client_id).order('login')
        : Promise.resolve({ data: [] }),
      gdsName === 'Travelport' || !gdsName
        ? supabase.from('travelport_user').select('id,sign_on_id,cid,pcc,status').eq('ota_client_id', pcc.ota_client_id).order('sign_on_id')
        : Promise.resolve({ data: [] }),
    ])
    setLoginPopupData({ sabre: sabreData ?? [], amadeus: amData ?? [], travelport: tpData ?? [] })
    setLoginPopupLoading(false)
  }

  //  GDS FEATURE POPUP 
  function openFeaturePopup(row: PCCList) {
    setFeaturePopup(row)
    // Use pcc_features (direct PCC assignments)  independent of any profile
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

  //  EXPORT 
  function handleExport() {
    const data = filtered.map((r, i) => {
      const gdsName   = (r.gds as GDS)?.name ?? ''
      const org       = r.organisation as Organisation
      const ota       = r.ota_client as OTAClient
      const func      = r.gds_functionality as GDSFunctionality
      const cg        = (r as PCCList & {client_group?: {name?:string}}).client_group
      const pccFeats  = (r as PCCList & {pcc_features?: {gds_features?: {label?:string;cost?:number;currency?:string;billing_cycle?:string}}[]}).pcc_features ?? []
      const featNames = pccFeats.map(pf => pf.gds_features?.label ?? '').filter(Boolean).join(', ')
      const featCosts = pccFeats.map(pf => {
        const f = pf.gds_features
        if (!f) return ''
        return f.cost ? `${f.currency ?? ''} ${f.cost} ${cycleLabel(f.billing_cycle)}`.trim() : ''
      }).filter(Boolean).join(', ')
      return {
        'No.':                  i + 1,
        'GDS':                  gdsName,
        'PCC Code':             r.pcc,
        'Status':               r.status ?? '',
        'Organisation':         org?.organisation ?? '',
        'IATA':                 org?.iata ?? '',
        'OTA Client':           ota?.company_name ?? '',
        'Client Group':         cg?.name ?? '',
        'GDS Functionality':    func?.name ?? '',
        'PCC Functionality':    (r as PCCList & {pcc_functionality?: string}).pcc_functionality ?? '',
        'Enabled Features':     featNames,
        'Feature Costs':        featCosts,
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
      { wch: 20 },  // Client Group
      { wch: 25 },  // GDS Functionality
      { wch: 20 },  // PCC Functionality
      { wch: 40 },  // Enabled Features
      { wch: 40 },  // Feature Costs
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
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null); setDetectedHeaders([]) }

  //  FILTER 
  const filtered = records.filter(r => {
    const pccGroup = r.client_group as {id:number;name:string} | null
    if (filterGroup && !pccGroup?.name?.toLowerCase().includes(filterGroup.toLowerCase())) return false
    const matchSearch = r.pcc.toLowerCase().includes(search.toLowerCase())
    const matchGDS    = filterGDS    === 'all' || String(r.gds_id)        === filterGDS
    const matchStatus = filterStatus === 'all' || (r.status ?? 'Active')  === filterStatus
    const matchOrg    = !filterOrg    || (r.organisation as {organisation:string}|null)?.organisation?.toLowerCase().includes(filterOrg.toLowerCase())
    const matchPCC    = !filterPCC    || r.pcc.toLowerCase().includes(filterPCC.toLowerCase())
    const matchOTA    = !filterOTA    || (r.ota_client as {company_name:string}|null)?.company_name?.toLowerCase().includes(filterOTA.toLowerCase())
    const matchPccFunc = !filterPccFunc || r.pcc_functionality === filterPccFunc
    return matchSearch && matchGDS && matchStatus && matchOrg && matchPCC && matchOTA && matchPccFunc
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

  const [billingCycles, setBillingCycles] = useState<{value:string;label:string}[]>([])
  const [pccFunctionalityOptions, setPccFunctionalityOptions] = useState<{id:number;name:string}[]>([])
  const [addingFunctionality, setAddingFunctionality] = useState(false)
  const [newFunctionalityName, setNewFunctionalityName] = useState('')
  const [savingFunctionality, setSavingFunctionality] = useState(false)

  // Look up the proper unit-of-measure label from the billing_cycles table.
  // Falls back to a prettified version of the raw code for legacy values that were
  // never registered there (e.g. old free-typed codes like "transactionmonth").
  function cycleLabel(raw?: string): string {
    if (!raw) return ''
    const match = billingCycles.find(c => c.value === raw)
    if (match) return match.label
    return raw
      .replace(/_/g, ' ')                          // snake_case -> spaced
      .replace(/([a-z])([A-Z])/g, '$1 $2')          // camelCase -> spaced
      .replace(/(\d)([a-z])/gi, '$1 $2')            // 100monthly -> 100 monthly
      .replace(/\b(oid)\b/gi, 'OID')                // known acronym
      .replace(/\b(transaction)(month|year)\b/gi, '$1 / $2')  // transactionmonth -> transaction / month
      .split(' ')
      .map(w => w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
      .join(' ')
      .replace(/Oid/g, 'OID')
  }

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

  // Features for popup  only those matching the PCC's GDS
  const popupGdsId = featurePopup ? featurePopup.gds_id : null
  const availableFeatures = allFeatures.filter(f => f.gds_id === popupGdsId)

  const popupFunc = featurePopup?.gds_functionality as GDSFunctionality | undefined
  const popupGds = featurePopup?.gds as GDS | undefined
  const popupOrg = featurePopup?.organisation as Organisation | undefined
  const popupOta = featurePopup?.ota_client as OTAClient | undefined

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

  function fmtCost(cost: number, currency: string, cycle: string) {
    if (!cost) return null
    const amt = new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
    const suffixes: Record<string, string> = { monthly: '/mo', yearly: '/yr', per_user: '/user', per_transaction: '/txn', one_time: '' }
    return `${amt}${suffixes[cycle] ?? ''}`
  }

  //  COLUMNS 
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
          style={{ width: '16px', height: '16px', accentColor: D.accent, cursor: 'pointer' }}
        />
      ) : null
    },
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
    // 5. PCC Functionality
    {
      key: 'pcc_functionality', label: 'PCC Functionality', width: '140px',
      render: (row: PCCList) => {
        const val = row.pcc_functionality
        return val
          ? <span style={{fontSize:'14px',fontWeight:600,color:PCC_FUNC_DARK[val]??D.fgMuted,textTransform:'uppercase',letterSpacing:'0.03em'}}>{val}</span>
          : <span style={{color:D.fgDim}}>—</span>
      }
    },
    // 4. PCC Assigned  badge + view logins link
    {
      key: 'ota_client_id', label: 'PCC Assigned', width: '220px',
      render: (row: PCCList) => {
        const ota = row.ota_client as OTAClient
        return ota ? (
          <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
            <span style={{fontSize:'15px',fontWeight:600,color:D.fg,whiteSpace:'nowrap'}}>{ota.company_name}</span>
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
    // 4b. Client Group
    {
      key: 'client_group', label: 'Client Group', width: '120px',
      render: (row: PCCList) => {
        const g = row.client_group as {id:number;name:string} | null
        return g
          ? <span style={{fontSize:'14px',fontWeight:600,color:D.purple}}>{g.name}</span>
          : <span style={{color:D.fgDim}}>—</span>
      }
    },
    // 6. GDS Feature  clickable badge that opens popup
    {
      key: 'functionality_id', label: 'GDS Feature', width: '120px',
      render: (row: PCCList) => {
        const func = row.gds_functionality as GDSFunctionality
        const directCount = ((row as unknown as {pcc_features?: {feature_id: number}[]}).pcc_features ?? []).length
        return (
          <button onClick={() => openFeaturePopup(row)}
            style={{display:'flex',alignItems:'center',gap:'6px',background:'none',border:'none',cursor:'pointer',padding:0}}>
            <span style={{fontSize:'14px',fontWeight:600,color: directCount > 0 ? D.fg : D.fgDim,textTransform:'uppercase',letterSpacing:'0.02em'}}>
              {func ? func.name : directCount > 0 ? 'Assigned' : 'Unassigned'}
            </span>
            <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'20px',height:'20px',borderRadius:'50%',
              fontSize:'11px',fontWeight:700,
              color: directCount > 0 ? D.accent : D.fgDim,
              background: directCount > 0 ? D.accentSoft : 'rgba(139,148,158,0.10)'}}>
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
        const c = STATUS_DARK[s] ?? { dot: D.fgDim, text: D.fgMuted }
        return (
          <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'13px',fontWeight:600,color:c.text,textTransform:'uppercase',letterSpacing:'0.05em'}}>
            <span style={{width:'7px',height:'7px',borderRadius:'50%',background:c.dot,flexShrink:0,display:'inline-block',boxShadow: s==='Active' ? `0 0 6px ${c.dot}` : 'none'}}/>
            {s}
          </span>
        )
      }
    },
    // 8. Remarks
    {
      key: 'remarks', label: 'Remarks', width: '260px',
      render: (row: PCCList) => {
        if (!row.remarks) return <span style={{color:D.fgDim,fontSize:'12px'}}>—</span>
        const points = row.remarks.split('\n').map(l => l.trim()).filter(Boolean)
        return (
          <ul style={{listStyleType:'disc',listStylePosition:'outside',paddingLeft:'16px',display:'flex',flexDirection:'column',gap:'2px'}}>
            {points.map((p, i) => {
              const chunks = chunkText(p, 50)
              return (
                <li key={i} style={{fontSize:'14px',color:D.fgMuted,wordBreak:'break-word'}}>
                  {chunks.map((line, j) => (
                    <span key={j}>{line}{j < chunks.length - 1 && <br />}</span>
                  ))}
                </li>
              )
            })}
          </ul>
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
              <button onClick={handleExport} disabled={filtered.length === 0}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.fgMuted, cursor:'pointer', opacity:filtered.length===0?0.4:1}}
                onMouseOver={e => { e.currentTarget.style.background=D.borderLight; e.currentTarget.style.color=D.fg }}
                onMouseOut={e => { e.currentTarget.style.background=D.card; e.currentTarget.style.color=D.fgMuted }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export xlsx
              </button>
            )}
            {isAdmin && selectedIds.size > 0 && (
              <button onClick={openBulk}
                style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.purpleSoft, border:`1px solid ${D.purple}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:D.purple, cursor:'pointer'}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Bulk Edit ({selectedIds.size})
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
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr 1fr auto', alignItems:'flex-end', gap:'12px', width:'100%'}}>

            {/* Organisation */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Organisation</label>
              <AutocompleteInput value={filterOrg} onChange={v => { setFilterOrg(v); resetPage() }} placeholder="Search org..." options={orgList.map(o => o.organisation)} />
            </div>

            {/* PCC */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>PCC</label>
              <AutocompleteInput value={filterPCC} onChange={v => { setFilterPCC(v); resetPage() }} placeholder="Code..." options={[...new Set(records.map(r => r.pcc))].sort()} />
            </div>

            {/* PCC Assigned */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>PCC Assigned</label>
              <AutocompleteInput value={filterOTA} onChange={v => { setFilterOTA(v); resetPage() }} placeholder="Assigned..." options={otaClients.map(o => o.company_name)} />
            </div>

            {/* Client Group */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Client Group</label>
              <AutocompleteInput value={filterGroup} onChange={v => { setFilterGroup(v); resetPage() }} placeholder="Group..." options={clientGroups.map(g => g.name)} />
            </div>

            {/* PCC Functionality */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>PCC Functionality</label>
              <select value={filterPccFunc} onChange={e => { setFilterPccFunc(e.target.value); resetPage() }}
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', cursor:'pointer', transition:'border-color 0.15s, box-shadow 0.15s'}}
                onFocus={e => { e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${D.accentSoft}` }}
                onBlur={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = 'none' }}>
                <option value="">All</option>
                {pccFunctionalityOptions.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            </div>

            {/* GDS */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>GDS</label>
              <select value={filterGDS} onChange={e => { setFilterGDS(e.target.value); resetPage() }}
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', cursor:'pointer', transition:'border-color 0.15s, box-shadow 0.15s'}}
                onFocus={e => { e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${D.accentSoft}` }}
                onBlur={e => { e.currentTarget.style.borderColor = D.borderLight; e.currentTarget.style.boxShadow = 'none' }}>
                <option value="all">All GDS</option>
                {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
              </select>
            </div>

            {/* Status */}
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Status</label>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); resetPage() }}
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
                onClick={() => { setFilterOrg(''); setFilterPCC(''); setFilterOTA(''); setFilterGDS('all'); setFilterStatus('all'); setFilterGroup(''); setFilterPccFunc(''); resetPage() }}
                title="Reset filters"
                style={{display:'flex', alignItems:'center', justifyContent:'center', width:'38px', height:'38px', background:D.bg, color:D.fgMuted, border:`1px solid ${D.border}`, borderRadius:'8px', cursor:'pointer', flexShrink:0}}
                onMouseOver={e => { e.currentTarget.style.color=D.accent; e.currentTarget.style.borderColor=D.accent }}
                onMouseOut={e => { e.currentTarget.style.color=D.fgMuted; e.currentTarget.style.borderColor=D.border }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
            </div>

          </div>
        </div>

        {/* Top record bar */}
        {!loading && filtered.length > 0 && (
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px'}}>
            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
              <span style={{fontSize:'14px', color:D.fgMuted}}>
                {pageSize === 'all'
                  ? <><strong style={{color:D.fg}}>{filtered.length}</strong> records total</>
                  : <><strong style={{color:D.fg}}>{((currentPage-1)*effectiveSize)+1}-{Math.min(currentPage*effectiveSize, filtered.length)}</strong> of <strong style={{color:D.fg}}>{filtered.length}</strong> records</>
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

        {/* Select all + records count bar */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px'}}>
          {isAdmin && !loading && filtered.length > 0 && (
            <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'14px', color:D.fgMuted}}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected }}
                onChange={toggleSelectAll}
                style={{width:'16px', height:'16px', cursor:'pointer', accentColor:D.accent}}
              />
              Select all
            </label>
          )}
          {isAdmin && selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())}
              style={{fontSize:'13px', color:D.fgDim, background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0}}>
              Clear ({selectedIds.size} selected)
            </button>
          )}
          {!loading && (
            <span style={{fontSize:'13px', color:D.fgDim, marginLeft:'auto'}}>
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'15px'}}>Loading</div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1400px'}}>
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.key} style={{padding:'12px 16px', fontSize:'14px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', whiteSpace:'nowrap', width: col.width}}>{col.label}</th>
                    ))}
                    {isAdmin && (
                      <th style={{padding:'12px 16px', fontSize:'14px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign:'right', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)'}}>Actions</th>
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
                          <td key={col.key} style={{padding:'12px 16px', verticalAlign:'middle'}}>{col.render(row as PCCList)}</td>
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
          </div>
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && totalPages > 1 && pageSize !== 'all' && (
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Client Group</label>
            <select value={(form as Partial<PCCList> & {client_group_id?:number|null}).client_group_id ?? ''} onChange={e => setForm(f => ({ ...f, client_group_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value=""> None </option>
              {clientGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Organisation</label>
            <select value={form.org_id ?? ''} onChange={e => setForm(f => ({ ...f, org_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value=""> None </option>
              {orgList.map(o => <option key={o.id} value={o.id}>{o.organisation}{o.iata ? ` (${o.iata})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id ?? ''} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value=""> None </option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
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

      {/*  GDS Feature Detail Popup  */}
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
                  <p className="text-sm text-slate-700 font-medium mt-0.5">{popupOrg?.organisation ?? <span className="text-slate-300"></span>}</p>
                  {popupOrg?.iata && <p className="text-xs text-slate-400 font-mono">{popupOrg.iata}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">OTA Client</p>
                  {popupOta
                    ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full mt-0.5 inline-block">{popupOta.company_name}</span>
                    : <p className="text-sm text-slate-300 mt-0.5"></p>}
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
                            {enabled ? '' : ''}
                          </span>
                          <div>
                            <p className={`text-sm ${enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{f.label}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {costStr && <p className="text-xs text-slate-400">{costStr}</p>}
                              {f.billing_cycle && costStr && <span className="text-xs text-slate-300"></span>}
                              {f.billing_cycle && <p className="text-xs text-slate-400">{cycleLabel(f.billing_cycle as string)}</p>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(f as {pricing_tiers?: unknown[]}).pricing_tiers && (f as {pricing_tiers?: unknown[]}).pricing_tiers!.length > 0 && (
                            <button
                              onClick={() => setTierModalFeature({label: f.label, tiers: (f as {pricing_tiers: {sort_order:number;tier:string;price:number;currency:string;unit:string;billing:string}[]}).pricing_tiers})}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                               Tiers
                            </button>
                          )}
                        <button
                          onClick={() => toggleProfileFeature(f.id)}
                          disabled={featureToggling}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                        >
                          {enabled ? ' Remove' : '+ Add'}
                        </button>
                        </div>
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
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex-shrink-0"></span>
                            <div>
                              <p className="text-sm text-slate-800 font-medium">{f.label}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {costStr && <p className="text-xs text-slate-400">{costStr}</p>}
                                {(f as {pricing_tiers?: unknown[]}).pricing_tiers && (f as {pricing_tiers?: unknown[]}).pricing_tiers!.length > 0 && (
                                  <button onClick={() => setTierModalFeature({label: f.label, tiers: (f as {pricing_tiers: {sort_order:number;tier:string;price:number;currency:string;unit:string;billing:string}[]}).pricing_tiers})} className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"> Tiers</button>
                                )}
                                {f.billing_cycle && <span className="text-xs text-slate-300"></span>}
                                {f.billing_cycle && <p className="text-xs text-slate-400">{cycleLabel(f.billing_cycle as string)}</p>}
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

      {/*  PCC Assigned Login Popup  */}
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
                          <tr>{['Login','Sign-On ID','OID','Status'].map(h=><th key={h} className="text-left px-4 py-2 text-xs font-medium text-slate-500">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {loginPopupData.amadeus.map((r,i)=>(
                            <tr key={r.id} className={i<loginPopupData.amadeus.length-1?'border-b border-slate-50':''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.login}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.sign_on_id??''}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.oid??''}</td>
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

      {/*  Bulk Edit Modal  */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Bulk Edit GDS Features  ${selectedIds.size} PCC${selectedIds.size !== 1 ? 's' : ''} selected`} size="md">
        <div className="space-y-4">
          {bulkResult ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-700 font-medium"> {bulkResult}</p>
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
                      {m === 'add' ? '+ Add features to all selected' : ' Remove features from all selected'}
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

              {/* Feature selection  grouped by GDS */}
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
                {bulkSaving ? 'Applying' : `${bulkMode === 'add' ? 'Add' : 'Remove'} to ${selectedIds.size} PCC${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
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
      {/* ── Pricing Tiers Modal ── */}
      {tierModalFeature && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div style={{background:'white',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'560px',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
              <div>
                <h3 style={{fontSize:'16px',fontWeight:700,color:'#1E293B',margin:0}}>{tierModalFeature.label}</h3>
                <p style={{fontSize:'13px',color:'#64748B',marginTop:'2px'}}>Transaction Tier Pricing</p>
              </div>
              <button onClick={() => setTierModalFeature(null)} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'#94A3B8',lineHeight:1}}>×</button>
            </div>
            <div style={{border:'1px solid #E2E8F0',borderRadius:'10px',overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',background:'#F0FDF4',borderBottom:'2px solid #6EE7B7',padding:'10px 14px'}}>
                {['Contracted Price Item','Currency','Market Price'].map(h => (
                  <div key={h} style={{fontSize:'11px',fontWeight:800,color:'#065F46',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>
                ))}
              </div>
              {tierModalFeature.tiers.sort((a,b) => a.sort_order - b.sort_order).map((pt, i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',padding:'10px 14px',borderBottom: i < tierModalFeature.tiers.length-1 ? '1px solid #F1F5F9' : 'none',background: i%2===0 ? 'white' : '#F8FAFC'}}>
                  <span style={{fontSize:'14px',color:'#1E293B'}}>{pt.tier}</span>
                  <span style={{fontSize:'14px',color:'#64748B'}}>{pt.currency}</span>
                  <span style={{fontSize:'14px',fontWeight:600,color:'#10B981'}}>{pt.price === 0 ? '0.00' : pt.price.toLocaleString('en-MY', {minimumFractionDigits:2})}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'16px'}}>
              <button onClick={() => setTierModalFeature(null)} style={{padding:'8px 20px',fontSize:'13px',fontWeight:600,border:'1px solid #E2E8F0',borderRadius:'8px',background:'white',color:'#64748B',cursor:'pointer'}}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}