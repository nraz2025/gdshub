'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

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

const GDS_COLORS: Record<string, string> = {
  Amadeus:    '#f3e8ff',
  Sabre:      '#e0f2fe',
  Travelport: '#dcfce7',
}

// Main page dark theme (matches TopNav's System group = coral)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#f78166', accentSoft: 'rgba(247,129,102,0.10)',
  cyan: '#39d2c0', cyanSoft: 'rgba(57,210,192,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  blue: '#58a6ff', blueSoft: 'rgba(88,166,255,0.10)',
}
const GDS_DARK: Record<string, { color: string; soft: string }> = {
  Amadeus:    { color: D.purple, soft: D.purpleSoft },
  Sabre:      { color: D.accent, soft: D.accentSoft },
  Travelport: { color: D.blue,   soft: D.blueSoft },
}

type GDS = { id: number; name: string }

type CountRow = {
  gds_name: string; pcc: string; organisation: string; organisation_id: number | null
  total_users: number; active_users: number; inactive_users: number; ota_users: number
}

type DetailRow = {
  gds_name: string; pcc: string; organisation: string
  first_name: string | null; last_name: string | null; initial: string | null
  email: string | null; login_id: string | null; sign_on_id: string | null
  duty_code: string | null; user_status: string | null
}

type MonthlyCreationRow = {
  month: string       // 'YYYY-MM'
  monthLabel: string  // 'Jan 2026'
  amadeus: number; sabre: number; travelport: number; total: number
}

type MonthColumn = { key: string; label: string; endDate: Date }
type PccMonthlyRow = { pcc: string; gds: string; counts: number[] } // counts aligned with monthColumns

type FilterState = { email: string; pcc_oid: string; status: string; ota: string; gds_id: string; organisation: string }
type ReportTemplate = { id: number; name: string; filters: FilterState; months_back: number; created_at: string }

//  Component 
export default function ReportingPage() {
  const supabase = createClient()

  const [loading, setLoading]   = useState(true)
  const [isAdmin, setIsAdmin]   = useState(false)
  const [gdsList, setGdsList]   = useState<GDS[]>([])
  const [orgList, setOrgList]   = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated]   = useState(false)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [counts, setCounts]     = useState<CountRow[]>([])
  const [details, setDetails]   = useState<DetailRow[]>([])
  const [monthlyCreation, setMonthlyCreation] = useState<MonthlyCreationRow[]>([])
  const [pccMonthly, setPccMonthly] = useState<PccMonthlyRow[]>([])
  const [monthColumns, setMonthColumns] = useState<MonthColumn[]>([])
  const [monthsBack, setMonthsBack] = useState(6)
  const [activeTab, setActiveTab] = useState<'counts' | 'users' | 'monthly' | 'pcc'>('counts')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Templates
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('')

  // Filters
  const blankFilters = { email: '', pcc_oid: '', status: '', ota: '', gds_id: '', organisation: '' }
  const [filters, setFilters] = useState(blankFilters)

  //  Load GDS list, admin status, and saved templates 
  const loadTemplates = useCallback(async () => {
    const { data: t } = await supabase.from('report_template').select('*').order('name')
    setTemplates((t as ReportTemplate[]) ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      const { data: g } = await supabase.from('gds').select('id, name').order('name')
      setGdsList(g ?? [])
      const { data: oc } = await supabase.from('ota_client').select('company_name').order('company_name')
      setOrgList(Array.from(new Set((oc ?? []).map(o => o.company_name).filter(Boolean))) as string[])
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIsAdmin(p?.role === 'admin')
      }
      await loadTemplates()
      setLoading(false)
    }
    init()
  }, [])

  //  Generate report: live-pull from the 3 GDS user tables, applying filters, no persistence 
  const generateReport = useCallback(async (overrideFilters?: FilterState, overrideMonthsBack?: number) => {
    const f = overrideFilters ?? filters
    const mb = overrideMonthsBack ?? monthsBack
    setGenerating(true); setError('')

    type RawUser = { first_name?: string; last_name?: string; email_address?: string }
    type RawOtaClient = { company_name?: string }

    const filterEmail  = f.email.toLowerCase().trim()
    const filterPccOid = f.pcc_oid.toLowerCase().trim()
    const filterStatus = f.status.toLowerCase().trim()
    const filterOta     = f.ota.toLowerCase().trim() // 'yes' | 'no' | ''
    const filterGdsId   = f.gds_id ? Number(f.gds_id) : null
    const filterOrg     = f.organisation.trim()

    const [{ data: amadeusRaw, error: e1 }, { data: sabreRaw, error: e2 }, { data: travelportRaw, error: e3 }, { data: resignedRaw, error: e4 }] = await Promise.all([
      supabase.from('amadeus_user').select('id, login, sign_on_id, initial, duty_code, oid, ota, status, created_at, users:user_id(first_name, last_name, email_address), ota_client:ota_client_id(company_name)'),
      supabase.from('sabre_user').select('id, epr, pcc, initial, status, created_at, ota, users:user_id(first_name, last_name, email_address), ota_client:ota_client_id(company_name)'),
      supabase.from('travelport_user').select('id, sign_on_id, cid, gtid, pcc, status, created_at, ota, users:user_id(first_name, last_name, email_address), ota_client:ota_client_id(company_name)'),
      supabase.from('resigned_user').select('pcc, source_gds, email, organisation, date_created_in_gds, date_resigned'),
    ])
    if (e1 || e2 || e3 || e4) { setError((e1 ?? e2 ?? e3 ?? e4)!.message); setGenerating(false); return }

    const amadeusGdsId = gdsList.find(g => g.name === 'Amadeus')?.id ?? null
    const sabreGdsId   = gdsList.find(g => g.name === 'Sabre')?.id ?? null
    const tpGdsId      = gdsList.find(g => g.name === 'Travelport')?.id ?? null

    // Respect the GDS filter (blank = all GDS)
    const amadeusScoped    = filterGdsId && filterGdsId !== amadeusGdsId ? [] : (amadeusRaw ?? [])
    const sabreScoped      = filterGdsId && filterGdsId !== sabreGdsId   ? [] : (sabreRaw ?? [])
    const travelportScoped = filterGdsId && filterGdsId !== tpGdsId      ? [] : (travelportRaw ?? [])

    // Apply email / PCC-OID / status / OTA / organisation filters
    function passes(email?: string, pccOid?: string, status?: string, ota?: boolean, org?: string) {
      if (filterEmail && !(email ?? '').toLowerCase().includes(filterEmail)) return false
      if (filterPccOid && !(pccOid ?? '').toLowerCase().includes(filterPccOid)) return false
      if (filterStatus && (status ?? '').toLowerCase() !== filterStatus) return false
      if (filterOta === 'yes' && !ota) return false
      if (filterOta === 'no' && ota) return false
      if (filterOrg && org !== filterOrg) return false
      return true
    }

    const amadeus = amadeusScoped.filter(r => {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      return passes(u?.email_address, (r as {oid?: string}).oid, (r as {status?: string}).status, (r as {ota?: boolean}).ota, oc?.company_name)
    })
    const sabre = sabreScoped.filter(r => {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      return passes(u?.email_address, (r as {pcc?: string}).pcc, (r as {status?: string}).status, (r as {ota?: boolean}).ota, oc?.company_name)
    })
    const travelport = travelportScoped.filter(r => {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      return passes(u?.email_address, (r as {pcc?: string}).pcc, (r as {status?: string}).status, (r as {ota?: boolean}).ota, oc?.company_name)
    })

    // Resigned users — needed to reconstruct historical headcounts (status/OTA filters don't apply to past records)
    type RawResigned = { pcc?: string; source_gds?: string; email?: string; organisation?: string; date_created_in_gds?: string; date_resigned?: string }
    const resigned = (resignedRaw ?? []).filter(r => {
      const rr = r as RawResigned
      if (filterGdsId) {
        const rrGdsId = rr.source_gds === 'Amadeus' ? amadeusGdsId : rr.source_gds === 'Sabre' ? sabreGdsId : rr.source_gds === 'Travelport' ? tpGdsId : null
        if (rrGdsId !== filterGdsId) return false
      }
      if (filterEmail && !(rr.email ?? '').toLowerCase().includes(filterEmail)) return false
      if (filterPccOid && !(rr.pcc ?? '').toLowerCase().includes(filterPccOid)) return false
      if (filterOrg && rr.organisation !== filterOrg) return false
      return true
    })

    //  Build user detail rows 
    const detailRows: DetailRow[] = []
    for (const r of amadeus) {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      detailRows.push({ gds_name: 'Amadeus', pcc: '', organisation: oc?.company_name ?? '', first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {login?: string}).login ?? null, sign_on_id: (r as {sign_on_id?: string}).sign_on_id ?? null, duty_code: (r as {duty_code?: string}).duty_code ?? null, user_status: (r as {status?: string}).status ?? 'active' })
    }
    for (const r of sabre) {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      detailRows.push({ gds_name: 'Sabre', pcc: (r as {pcc?: string}).pcc ?? '', organisation: oc?.company_name ?? '', first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {epr?: string}).epr ?? null, sign_on_id: null, duty_code: null, user_status: (r as {status?: string}).status ?? 'active' })
    }
    for (const r of travelport) {
      const u = (r as {users?: RawUser}).users as RawUser
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      detailRows.push({ gds_name: 'Travelport', pcc: (r as {pcc?: string}).pcc ?? '', organisation: oc?.company_name ?? '', first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {sign_on_id?: string}).sign_on_id ?? null, sign_on_id: (r as {sign_on_id?: string}).sign_on_id ?? null, duty_code: null, user_status: (r as {status?: string}).status ?? 'active' })
    }

    //  Build monthly count grouped by GDS + PCC + Organisation 
    type CountEntry = { gds_name: string; pcc: string; organisation: string; organisation_id: number | null; total: number; active: number; inactive: number; ota: number }
    const countMap = new Map<string, CountEntry>()

    const allRows = [
      ...amadeus.map(r => ({ gds: 'Amadeus', pcc: '', r })),
      ...sabre.map(r => ({ gds: 'Sabre', pcc: (r as {pcc?: string}).pcc ?? '', r })),
      ...travelport.map(r => ({ gds: 'Travelport', pcc: (r as {pcc?: string}).pcc ?? '', r })),
    ]

    for (const { gds, pcc, r } of allRows) {
      const oc = (r as {ota_client?: RawOtaClient}).ota_client as RawOtaClient
      const org    = oc?.company_name ?? '(No OTA Client)'
      const key    = `${gds}||${pcc}||${org}`
      const status = ((r as {status?: string}).status ?? 'active').toLowerCase()
      if (!countMap.has(key)) countMap.set(key, { gds_name: gds, pcc, organisation: org, organisation_id: null, total: 0, active: 0, inactive: 0, ota: 0 })
      const e = countMap.get(key)!
      e.total++
      if (status === 'active') e.active++
      if (status === 'inactive' || status === 'suspended') e.inactive++
      if ((r as {ota?: boolean}).ota) e.ota++
    }

    const countRows: CountRow[] = Array.from(countMap.values()).map(c => ({
      gds_name: c.gds_name, pcc: c.pcc, organisation: c.organisation, organisation_id: c.organisation_id,
      total_users: c.total, active_users: c.active, inactive_users: c.inactive, ota_users: c.ota,
    }))

    //  Build monthly creation trend (users created per calendar month, per GDS) 
    const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    type MonthEntry = { amadeus: number; sabre: number; travelport: number }
    const monthMap = new Map<string, MonthEntry>()

    function bucket(rows: unknown[], key: keyof MonthEntry) {
      for (const r of rows) {
        const createdAt = (r as {created_at?: string}).created_at
        if (!createdAt) continue
        const d = new Date(createdAt)
        if (isNaN(d.getTime())) continue
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!monthMap.has(monthKey)) monthMap.set(monthKey, { amadeus: 0, sabre: 0, travelport: 0 })
        monthMap.get(monthKey)![key]++
      }
    }
    bucket(amadeus, 'amadeus')
    bucket(sabre, 'sabre')
    bucket(travelport, 'travelport')

    const monthlyRows: MonthlyCreationRow[] = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, v]) => {
        const [y, m] = monthKey.split('-').map(Number)
        return {
          month: monthKey,
          monthLabel: `${MONTH_LABELS[m - 1]} ${y}`,
          amadeus: v.amadeus, sabre: v.sabre, travelport: v.travelport,
          total: v.amadeus + v.sabre + v.travelport,
        }
      })

    //  Build PCC monthly headcount (as-of-month-end reconstruction, active + resigned) 
    const cols: MonthColumn[] = []
    const now = new Date()
    for (let i = mb - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
      cols.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTH_LABELS[d.getMonth()]}${String(d.getFullYear()).slice(2)}`, endDate: endOfMonth })
    }

    const pccMap = new Map<string, { pcc: string; gds: string; counts: number[] }>()
    function ensurePcc(pcc: string, gds: string) {
      const key = `${gds}||${pcc}`
      if (!pccMap.has(key)) pccMap.set(key, { pcc, gds, counts: new Array(cols.length).fill(0) })
      return pccMap.get(key)!
    }

    // Currently-active users: count toward every month column on/after their created_at
    function addActive(rows: unknown[], gds: string, pccField: 'pcc' | 'oid') {
      for (const r of rows) {
        const pcc = (r as Record<string, string | undefined>)[pccField] ?? ''
        if (!pcc) continue
        const createdAt = (r as {created_at?: string}).created_at
        if (!createdAt) continue
        const created = new Date(createdAt)
        const entry = ensurePcc(pcc, gds)
        cols.forEach((c, idx) => { if (created <= c.endDate) entry.counts[idx]++ })
      }
    }
    addActive(amadeus, 'Amadeus', 'oid')
    addActive(sabre, 'Sabre', 'pcc')
    addActive(travelport, 'Travelport', 'pcc')

    // Resigned users: only count toward months where they were created AND not yet resigned
    for (const r of resigned) {
      const rr = r as RawResigned
      if (!rr.pcc || !rr.date_created_in_gds) continue
      const created  = new Date(rr.date_created_in_gds)
      const resignedAt = rr.date_resigned ? new Date(rr.date_resigned) : null
      const entry = ensurePcc(rr.pcc, rr.source_gds ?? '')
      cols.forEach((c, idx) => {
        if (created <= c.endDate && (!resignedAt || resignedAt > c.endDate)) entry.counts[idx]++
      })
    }

    const pccRows: PccMonthlyRow[] = Array.from(pccMap.values()).sort((a, b) => a.pcc.localeCompare(b.pcc))

    setCounts(countRows)
    setDetails(detailRows)
    setMonthlyCreation(monthlyRows)
    setPccMonthly(pccRows)
    setMonthColumns(cols)
    setGenerated(true)
    setGeneratedAt(new Date())
    setActiveTab('counts')
    setGenerating(false)
  }, [filters, gdsList, monthsBack])

  function resetFilters() {
    setFilters(blankFilters)
    setSelectedTemplateId('')
    setGenerated(false)
    setCounts([]); setDetails([]); setMonthlyCreation([]); setPccMonthly([]); setMonthColumns([])
    setError('')
  }

  //  Templates: save current filters, apply a saved one, delete 
  async function saveTemplate() {
    setSavingTemplate(true); setError('')
    if (!templateName.trim()) { setError('Template name is required.'); setSavingTemplate(false); return }
    const { error: e } = await supabase.from('report_template').insert({
      name: templateName.trim(),
      filters,
      months_back: monthsBack,
    })
    if (e) { setError(e.message); setSavingTemplate(false); return }
    setShowSaveTemplate(false); setTemplateName('')
    await loadTemplates()
    setSavingTemplate(false)
    setSuccess('Template saved.')
    setTimeout(() => setSuccess(''), 3000)
  }

  function applyTemplate(id: number | '') {
    setSelectedTemplateId(id)
    if (id === '') return
    const t = templates.find(t => t.id === id)
    if (!t) return
    setFilters(t.filters)
    setMonthsBack(t.months_back ?? 6)
    generateReport(t.filters, t.months_back ?? 6)
  }

  async function deleteTemplate(id: number) {
    if (!confirm('Delete this report template? This cannot be undone.')) return
    const { error: e } = await supabase.from('report_template').delete().eq('id', id)
    if (e) { setError(e.message); return }
    if (selectedTemplateId === id) setSelectedTemplateId('')
    await loadTemplates()
  }

  //  Export Excel 
  function exportExcel() {
    const gdsName = filters.gds_id ? gdsList.find(g => String(g.id) === filters.gds_id)?.name ?? 'All GDS' : 'All GDS'
    const wb = XLSX.utils.book_new()
    const summaryData = [
      ['Generated At', generatedAt ? generatedAt.toLocaleString('en-GB') : ''],
      ['Email filter', filters.email || '(none)'],
      ['PCC / OID filter', filters.pcc_oid || '(none)'],
      ['Status filter', filters.status || '(all)'],
      ['OTA filter', filters.ota || '(all)'],
      ['GDS', gdsName],
      ['Organisation filter', filters.organisation || '(none)'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')
    if (counts.length > 0) {
      const headers = ['GDS', 'PCC', 'Organisation', 'Total Users', 'Active', 'Inactive', 'OTA']
      const rows = counts.map(c => [c.gds_name, c.pcc, c.organisation, c.total_users, c.active_users, c.inactive_users, c.ota_users])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Monthly Count')
    }
    if (details.length > 0) {
      const headers = ['GDS', 'PCC', 'Organisation', 'First Name', 'Last Name', 'Initial', 'Email', 'Login ID', 'Sign-On ID', 'Duty Code', 'Status']
      const rows = details.map(u => [u.gds_name, u.pcc, u.organisation, u.first_name ?? '', u.last_name ?? '', u.initial ?? '', u.email ?? '', u.login_id ?? '', u.sign_on_id ?? '', u.duty_code ?? '', u.user_status ?? ''])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'User Detail')
    }
    if (monthlyCreation.length > 0) {
      const headers = ['Month', 'Amadeus', 'Sabre', 'Travelport', 'Total']
      const rows = monthlyCreation.map(m => [m.monthLabel, m.amadeus, m.sabre, m.travelport, m.total])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Monthly Creation')
    }
    if (pccMonthly.length > 0 && monthColumns.length > 0) {
      // Combined pivot: one row per PCC, one column per month
      const pivotHeaders = ['GDS', 'PCC / OID', ...monthColumns.map(c => c.label)]
      const pivotRows = pccMonthly.map(p => [p.gds, p.pcc, ...p.counts])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([pivotHeaders, ...pivotRows]), 'PCC Headcount (Pivot)')
      // One sheet per month, matching the PCC + Total User format
      monthColumns.forEach((c, idx) => {
        const sheetRows = pccMonthly.map(p => [p.pcc, p.counts[idx]])
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['PCC / OID', 'Total User'], ...sheetRows]), c.label)
      })
    }
    const stamp = (generatedAt ?? new Date()).toISOString().slice(0, 10)
    XLSX.writeFile(wb, `GDSHub_Report_${stamp}.xlsx`)
  }

  //  Input style helper 
  // Modal keeps light styling (inp/lbl) — main page filter fields use these dark, colorful versions
  const inpDark = (extra?: object) => ({ padding:'10px 14px', fontSize:'15px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, transition:'border-color 0.15s, box-shadow 0.15s', ...extra })
  const lblDark = (color: string) => ({ fontSize:'13px', fontWeight:700, color, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' })
  const inp = (extra?: object) => ({ padding:'7px 10px', fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', background:T.card, color:'#334155', outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lbl = { fontSize:'11px', fontWeight:600, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'4px', display:'block' }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',background:D.bg,color:D.fgMuted,fontSize:'14px'}}>
      Loading reporting module
    </div>
  )

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg, padding:'32px 28px 40px'}}>

      {/* Header */}
      <div style={{marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:'12px'}}>
        <div>
          <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'30px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Report</h1>
          <p style={{fontSize:'15px', color:D.fgMuted, marginTop:'5px'}}>Live GDS user report — set filters and generate real-time reports</p>
        </div>
      </div>

      {/* Saved templates */}
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px', flexWrap:'wrap'}}>
        <label style={{fontSize:'15px', fontWeight:600, color:D.fgMuted}}>Saved Report:</label>
        <select value={selectedTemplateId} onChange={e => applyTemplate(e.target.value ? Number(e.target.value) : '')}
          style={{padding:'9px 14px', fontSize:'15px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, minWidth:'220px', outline:'none', cursor:'pointer'}}>
          <option value="">— Choose a saved template —</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {selectedTemplateId !== '' && isAdmin && (
          <button onClick={() => deleteTemplate(selectedTemplateId as number)}
            style={{fontSize:'14px', color:D.danger, background:'transparent', border:`1px solid ${D.danger}`, borderRadius:'6px', padding:'6px 12px', cursor:'pointer'}}>
            Delete Template
          </button>
        )}
        {isAdmin && (
          <button onClick={() => { setTemplateName(''); setShowSaveTemplate(true) }}
            style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px', fontSize:'15px', fontWeight:600, color:D.accent, background:D.accentSoft, border:`1px solid ${D.accent}`, borderRadius:'8px', padding:'8px 14px', cursor:'pointer'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save current filters as template
          </button>
        )}
      </div>

      {/* Toast messages */}
      {error && <div style={{background:D.dangerSoft, border:`1px solid ${D.danger}`, color:D.danger, padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'14px'}}>{error}</div>}
      {success && <div style={{background:D.successSoft, border:`1px solid ${D.success}`, color:D.success, padding:'10px 14px', borderRadius:'8px', fontSize:'13px', marginBottom:'14px'}}>{success}</div>}

      {/* Report Filters */}
      <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'20px 22px', marginBottom:'18px'}}>
        <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:'0 0 16px'}}>Report Filters</h2>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'16px', marginBottom:'16px'}}>
          <div>
            <label style={lblDark(D.accent)}>Email Address</label>
            <input value={filters.email} onChange={e => setFilters(s => ({...s, email: e.target.value}))}
              placeholder="e.g. user@company.com" style={inpDark()}
              onFocus={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.accentSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }} />
          </div>
          <div>
            <label style={lblDark(D.cyan)}>PCC / OID</label>
            <input value={filters.pcc_oid} onChange={e => setFilters(s => ({...s, pcc_oid: e.target.value}))}
              placeholder="e.g. KULMY217Z" style={inpDark()}
              onFocus={e => { e.currentTarget.style.borderColor=D.cyan; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.cyanSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }} />
          </div>
          <div>
            <label style={lblDark(D.success)}>User Status</label>
            <select value={filters.status} onChange={e => setFilters(s => ({...s, status: e.target.value}))} style={inpDark({cursor:'pointer'})}
              onFocus={e => { e.currentTarget.style.borderColor=D.success; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.successSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label style={lblDark(D.blue)}>GDS Provider</label>
            <select value={filters.gds_id} onChange={e => setFilters(s => ({...s, gds_id: e.target.value}))} style={inpDark({cursor:'pointer'})}
              onFocus={e => { e.currentTarget.style.borderColor=D.blue; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.blueSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }}>
              <option value="">All Providers</option>
              {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lblDark(D.purple)}>Organisation</label>
            <select value={filters.organisation} onChange={e => setFilters(s => ({...s, organisation: e.target.value}))} style={inpDark({cursor:'pointer'})}
              onFocus={e => { e.currentTarget.style.borderColor=D.purple; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.purpleSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }}>
              <option value="">All Organisations</option>
              {orgList.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label style={lblDark(D.warning)}>OTA</label>
            <select value={filters.ota} onChange={e => setFilters(s => ({...s, ota: e.target.value}))} style={inpDark({cursor:'pointer'})}
              onFocus={e => { e.currentTarget.style.borderColor=D.warning; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.warningSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }}>
              <option value="">All Users</option>
              <option value="yes">OTA Users</option>
              <option value="no">Non-OTA</option>
            </select>
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:'12px', flexWrap:'wrap', paddingTop:'16px', borderTop:`1px solid ${D.border}`}}>
          <div style={{maxWidth:'200px'}}>
            <label style={lblDark(D.fgMuted)}>PCC Headcount: Months Back</label>
            <select value={monthsBack} onChange={e => setMonthsBack(Number(e.target.value))} style={inpDark({cursor:'pointer'})}
              onFocus={e => { e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.boxShadow=`0 0 0 3px ${D.accentSoft}` }}
              onBlur={e => { e.currentTarget.style.borderColor=D.borderLight; e.currentTarget.style.boxShadow='none' }}>
              {[3,6,9,12].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{display:'flex', gap:'8px'}}>
            <button onClick={resetFilters}
              style={{padding:'9px 18px', background:D.card, border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', fontSize:'15px', color:D.fgMuted, cursor:'pointer', fontWeight:600}}>
              Reset
            </button>
            <button onClick={() => generateReport()} disabled={generating}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 20px', background:D.accent, color:'#fff', border:`1.5px solid ${D.accent}`, borderRadius:'8px', fontSize:'15px', fontWeight:600, cursor:'pointer', opacity:generating?0.6:1}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              {generating ? 'Generating' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {!generated ? (
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px 24px', textAlign:'center', color:D.fgMuted}}>
          <div style={{width:'56px', height:'56px', borderRadius:'14px', background:D.accentSoft, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={D.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <p style={{fontSize:'16px', margin:0}}>Set your filters above and click Generate Report to view results</p>
        </div>
      ) : (
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'hidden'}}>

          {/* Detail header */}
          <div style={{padding:'14px 18px', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'10px'}}>
            <div style={{fontSize:'12px', color:D.fgDim}}>
              Generated {generatedAt?.toLocaleString('en-GB')}
            </div>
            <button onClick={exportExcel}
              style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', background:D.success, color:'#fff', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:600, cursor:'pointer'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
          </div>

          {/* Tabs */}
          <div style={{display:'flex', borderBottom:`1px solid ${D.border}`, background:D.card, overflowX:'auto'}}>
            {(['counts','users','monthly','pcc'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{padding:'12px 20px', fontSize:'13px', fontWeight:600, border:'none', background:'none', cursor:'pointer', whiteSpace:'nowrap',
                  color: activeTab===tab ? D.accent : D.fgMuted,
                  borderBottom: activeTab===tab ? `2px solid ${D.accent}` : '2px solid transparent',
                  transition:'all 0.15s'}}>
                {tab === 'counts' ? `Monthly Count (${counts.length})` : tab === 'users' ? `User Detail (${details.length})` : tab === 'monthly' ? `Monthly Creation (${monthlyCreation.length})` : `PCC Headcount (${pccMonthly.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{padding:'18px'}}>

            {/* Monthly Count Tab */}
            {activeTab === 'counts' && (
              counts.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:D.fgDim, fontSize:'13px'}}>No users matched these filters.</div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'700px'}}>
                    <thead>
                      <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                        {['GDS','PCC','Organisation','Total','Active','Inactive','OTA'].map(h => (
                          <th key={h} style={{padding:'10px 12px', textAlign:'left', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {counts.map((c, i) => (
                        <tr key={`${c.gds_name}-${c.pcc}-${c.organisation}-${i}`} style={{borderBottom: i < counts.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                          onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{padding:'3px 9px', borderRadius:'6px', background: GDS_DARK[c.gds_name]?.soft ?? 'rgba(139,148,158,0.10)', color: GDS_DARK[c.gds_name]?.color ?? D.fgMuted, fontSize:'11px', fontWeight:600}}>{c.gds_name}</span>
                          </td>
                          <td style={{padding:'10px 12px', fontFamily:'monospace', fontWeight:600, color:D.fg}}>{c.pcc}</td>
                          <td style={{padding:'10px 12px', color:D.fgMuted}}>{c.organisation}</td>
                          <td style={{padding:'10px 12px', fontWeight:700, color:D.fg, textAlign:'center'}}>{c.total_users}</td>
                          <td style={{padding:'10px 12px', color:D.success, fontWeight:600, textAlign:'center'}}>{c.active_users}</td>
                          <td style={{padding:'10px 12px', color:D.danger, fontWeight:600, textAlign:'center'}}>{c.inactive_users}</td>
                          <td style={{padding:'10px 12px', color:D.purple, fontWeight:600, textAlign:'center'}}>{c.ota_users}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:`2px solid ${D.border}`, background:'rgba(0,0,0,0.1)'}}>
                        <td colSpan={3} style={{padding:'10px 12px', fontSize:'12px', fontWeight:700, color:D.fgMuted}}>TOTAL</td>
                        <td style={{padding:'10px 12px', fontWeight:800, color:D.fg, textAlign:'center'}}>{counts.reduce((s,c) => s + c.total_users, 0)}</td>
                        <td style={{padding:'10px 12px', fontWeight:700, color:D.success, textAlign:'center'}}>{counts.reduce((s,c) => s + c.active_users, 0)}</td>
                        <td style={{padding:'10px 12px', fontWeight:700, color:D.danger, textAlign:'center'}}>{counts.reduce((s,c) => s + c.inactive_users, 0)}</td>
                        <td style={{padding:'10px 12px', fontWeight:700, color:D.purple, textAlign:'center'}}>{counts.reduce((s,c) => s + c.ota_users, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            )}

            {/* User Detail Tab */}
            {activeTab === 'users' && (
              details.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:D.fgDim, fontSize:'13px'}}>No users matched these filters.</div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'900px'}}>
                    <thead>
                      <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                        {['GDS','PCC','Organisation','Initial','Name','Email','Login ID','Sign-On','Status'].map(h => (
                          <th key={h} style={{padding:'10px 12px', textAlign:'left', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((u, i) => {
                        const statusStyle = (u.user_status ?? '').toLowerCase() === 'active' ? { soft: D.successSoft, color: D.success }
                          : (u.user_status ?? '').toLowerCase() === 'inactive' ? { soft: D.dangerSoft, color: D.danger }
                          : { soft: D.warningSoft, color: D.warning }
                        return (
                          <tr key={`${u.gds_name}-${u.email}-${i}`} style={{borderBottom: i < details.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                            onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{padding:'10px 12px'}}>
                              <span style={{padding:'3px 9px', borderRadius:'6px', background: GDS_DARK[u.gds_name]?.soft ?? 'rgba(139,148,158,0.10)', color: GDS_DARK[u.gds_name]?.color ?? D.fgMuted, fontSize:'11px', fontWeight:600}}>{u.gds_name}</span>
                            </td>
                            <td style={{padding:'10px 12px', fontFamily:'monospace', fontWeight:600, color:D.fg}}>{u.pcc}</td>
                            <td style={{padding:'10px 12px', color:D.fgMuted}}>{u.organisation}</td>
                            <td style={{padding:'10px 12px', fontFamily:'monospace', fontWeight:600, color:D.purple}}>{u.initial ?? ''}</td>
                            <td style={{padding:'10px 12px', color:D.fgMuted}}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || ''}</td>
                            <td style={{padding:'10px 12px', color:D.blue, fontSize:'12px'}}>{u.email ?? ''}</td>
                            <td style={{padding:'10px 12px', fontFamily:'monospace', fontSize:'12px', color:D.fgMuted}}>{u.login_id ?? ''}</td>
                            <td style={{padding:'10px 12px', fontFamily:'monospace', fontSize:'12px', color:D.fgMuted}}>{u.sign_on_id ?? ''}</td>
                            <td style={{padding:'10px 12px'}}>
                              <span style={{fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'20px', background:statusStyle.soft, color:statusStyle.color}}>
                                {u.user_status ?? ''}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Monthly Creation Tab */}
            {activeTab === 'monthly' && (
              monthlyCreation.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:D.fgDim, fontSize:'13px'}}>No users matched these filters.</div>
              ) : (
                <div>
                  <div style={{display:'flex', alignItems:'flex-end', gap:'10px', height:'160px', padding:'10px 4px 0', marginBottom:'20px', borderBottom:`1px solid ${D.border}`, overflowX:'auto'}}>
                    {(() => {
                      const maxTotal = Math.max(...monthlyCreation.map(m => m.total), 1)
                      return monthlyCreation.map(m => (
                        <div key={m.month} style={{display:'flex', flexDirection:'column', alignItems:'center', minWidth:'52px', flexShrink:0}}>
                          <div style={{fontSize:'11px', fontWeight:700, color:D.fg, marginBottom:'4px'}}>{m.total}</div>
                          <div style={{width:'28px', height:`${Math.max((m.total / maxTotal) * 120, 3)}px`, background:`linear-gradient(180deg, ${D.accent}, #da6b50)`, borderRadius:'4px 4px 0 0'}} />
                          <div style={{fontSize:'10px', color:D.fgDim, marginTop:'6px', whiteSpace:'nowrap'}}>{m.monthLabel}</div>
                        </div>
                      ))
                    })()}
                  </div>

                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth:'560px'}}>
                      <thead>
                        <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                          {['Month','Amadeus','Sabre','Travelport','Total'].map(h => (
                            <th key={h} style={{padding:'10px 12px', textAlign:'left', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyCreation.map((m, i) => (
                          <tr key={m.month} style={{borderBottom: i < monthlyCreation.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                            onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <td style={{padding:'10px 12px', fontWeight:600, color:D.fg}}>{m.monthLabel}</td>
                            <td style={{padding:'10px 12px', color:D.purple, fontWeight:600, textAlign:'center'}}>{m.amadeus}</td>
                            <td style={{padding:'10px 12px', color:D.accent, fontWeight:600, textAlign:'center'}}>{m.sabre}</td>
                            <td style={{padding:'10px 12px', color:D.blue, fontWeight:600, textAlign:'center'}}>{m.travelport}</td>
                            <td style={{padding:'10px 12px', fontWeight:800, color:D.fg, textAlign:'center'}}>{m.total}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{borderTop:`2px solid ${D.border}`, background:'rgba(0,0,0,0.1)'}}>
                          <td style={{padding:'10px 12px', fontSize:'12px', fontWeight:700, color:D.fgMuted}}>TOTAL</td>
                          <td style={{padding:'10px 12px', fontWeight:700, color:D.purple, textAlign:'center'}}>{monthlyCreation.reduce((s,m) => s + m.amadeus, 0)}</td>
                          <td style={{padding:'10px 12px', fontWeight:700, color:D.accent, textAlign:'center'}}>{monthlyCreation.reduce((s,m) => s + m.sabre, 0)}</td>
                          <td style={{padding:'10px 12px', fontWeight:700, color:D.blue, textAlign:'center'}}>{monthlyCreation.reduce((s,m) => s + m.travelport, 0)}</td>
                          <td style={{padding:'10px 12px', fontWeight:800, color:D.fg, textAlign:'center'}}>{monthlyCreation.reduce((s,m) => s + m.total, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* PCC Monthly Headcount Tab */}
            {activeTab === 'pcc' && (
              pccMonthly.length === 0 || monthColumns.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', color:D.fgDim, fontSize:'13px'}}>No PCC/OID records matched these filters.</div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <p style={{fontSize:'12px', color:D.fgDim, marginBottom:'10px'}}>Total users present at each PCC / OID, reconstructed as of the end of each month (includes users who later resigned).</p>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth: `${360 + monthColumns.length * 70}px`}}>
                    <thead>
                      <tr style={{background:'rgba(0,0,0,0.1)', borderBottom:`1px solid ${D.border}`}}>
                        <th style={{padding:'10px 12px', textAlign:'left', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>GDS</th>
                        <th style={{padding:'10px 12px', textAlign:'left', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>PCC / OID</th>
                        {monthColumns.map(c => (
                          <th key={c.key} style={{padding:'10px 12px', textAlign:'center', fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap'}}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pccMonthly.map((p, i) => (
                        <tr key={`${p.gds}-${p.pcc}`} style={{borderBottom: i < pccMonthly.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                          onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{padding:'10px 12px'}}>
                            <span style={{padding:'3px 9px', borderRadius:'6px', background: GDS_DARK[p.gds]?.soft ?? 'rgba(139,148,158,0.10)', color: GDS_DARK[p.gds]?.color ?? D.fgMuted, fontSize:'11px', fontWeight:600}}>{p.gds}</span>
                          </td>
                          <td style={{padding:'10px 12px', fontFamily:'monospace', fontWeight:600, color:D.fg}}>{p.pcc}</td>
                          {p.counts.map((c, idx) => (
                            <td key={idx} style={{padding:'10px 12px', textAlign:'center', fontWeight: idx === p.counts.length - 1 ? 800 : 500, color: idx === p.counts.length - 1 ? D.fg : D.fgMuted}}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:`2px solid ${D.border}`, background:'rgba(0,0,0,0.1)'}}>
                        <td colSpan={2} style={{padding:'10px 12px', fontSize:'12px', fontWeight:700, color:D.fgMuted}}>TOTAL</td>
                        {monthColumns.map((c, idx) => (
                          <td key={c.key} style={{padding:'10px 12px', textAlign:'center', fontWeight:800, color:D.fg}}>{pccMonthly.reduce((s,p) => s + p.counts[idx], 0)}</td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/*  Save Template Modal  */}
      {showSaveTemplate && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div style={{background:T.card,borderRadius:'14px',width:'420px',maxWidth:'90vw',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #e2e8f0'}}>
              <h3 style={{fontSize:'16px',fontWeight:700,color:T.text,margin:0}}>Save as Report Template</h3>
            </div>
            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:'14px'}}>
              {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'13px'}}>{error}</div>}
              <div>
                <label style={lbl}>Template Name *</label>
                <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                  placeholder="e.g. Monthly OTA Audit" style={inp()} autoFocus />
              </div>
              <div style={{fontSize:'12px',color:'#94a3b8',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px 12px'}}>
                Saves the current filter values (Email: <b>{filters.email || 'any'}</b>, PCC/OID: <b>{filters.pcc_oid || 'any'}</b>, Status: <b>{filters.status || 'any'}</b>, OTA: <b>{filters.ota || 'any'}</b>, GDS: <b>{filters.gds_id ? (gdsList.find(g => String(g.id)===filters.gds_id)?.name ?? 'selected') : 'any'}</b>) and Months Back (<b>{monthsBack}</b>) so this exact report can be re-run anytime.
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
              <button onClick={() => setShowSaveTemplate(false)}
                style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#475569',cursor:'pointer',fontWeight:500}}>
                Cancel
              </button>
              <button onClick={saveTemplate} disabled={savingTemplate}
                style={{padding:'8px 18px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:savingTemplate?0.6:1}}>
                {savingTemplate ? 'Saving' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
