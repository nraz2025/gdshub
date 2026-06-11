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
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const STATUS_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  draft:    { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
  final:    { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  archived: { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
}

const GDS_COLORS: Record<string, string> = {
  Amadeus:    '#f3e8ff',
  Sabre:      '#e0f2fe',
  Travelport: '#dcfce7',
}

//  Component 
export default function ReportingPage() {
  const supabase = createClient()

  const [isAdmin, setIsAdmin]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [gdsList, setGdsList]         = useState<GDS[]>([])
  const [snapshots, setSnapshots]     = useState<ReportSnapshot[]>([])
  const [selected, setSelected]       = useState<ReportSnapshot | null>(null)
  const [counts, setCounts]           = useState<ReportMontlyCount[]>([])
  const [details, setDetails]         = useState<ReportUserDetail[]>([])
  const [activeTab, setActiveTab]     = useState<'counts' | 'users'>('counts')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [showForm, setShowForm]       = useState(false)
  const [showAddCount, setShowAddCount] = useState(false)
  const [showAddUser, setShowAddUser]   = useState(false)

  // Available months from user creation dates across all 3 GDS tables
  // Each entry: { month: number, year: number }
  const [availableMonths, setAvailableMonths] = useState<{month: number; year: number}[]>([])
  const [loadingMonths, setLoadingMonths]     = useState(false)

  // New snapshot form
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const blankSnap = { report_name: '', date_from: firstOfMonth, date_to: today, gds_id: '', notes: '' }
  const [snapForm, setSnapForm] = useState(blankSnap)

  // New count row form
  const blankCount = { gds_name: '', pcc: '', organisation: '', total_users: 0, active_users: 0, inactive_users: 0, ota_users: 0, adjusted_count: '', count_note: '' }
  const [countForm, setCountForm] = useState(blankCount)

  // New user detail form
  const blankUser = { gds_name: '', pcc: '', organisation: '', first_name: '', last_name: '', initial: '', email: '', login_id: '', sign_on_id: '', duty_code: '', user_status: 'active', last_login_date: '', last_login_note: '' }
  const [userForm, setUserForm] = useState(blankUser)

  //  Load initial data 
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIsAdmin(p?.role === 'admin')
      }
      const { data: g } = await supabase.from('gds').select('id, name').order('name')
      setGdsList(g ?? [])
      await Promise.all([loadSnapshots(), loadAvailableMonths()])
      setLoading(false)
    }
    init()
  }, [])

  //  Load distinct year/month from all 3 GDS user tables 
  const loadAvailableMonths = useCallback(async () => {
    setLoadingMonths(true)
    const tables = ['amadeus_user', 'sabre_user', 'travelport_user']
    const results = await Promise.all(
      tables.map(t => supabase.from(t).select('created_at').order('created_at'))
    )
    // Collect all created_at values, extract unique year+month combos
    const seen = new Set<string>()
    const months: {month: number; year: number}[] = []
    for (const { data } of results) {
      for (const row of data ?? []) {
        const d = new Date(row.created_at)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        if (!seen.has(key)) {
          seen.add(key)
          months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
        }
      }
    }
    // Sort descending: newest first
    months.sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
    setAvailableMonths(months)
    // Auto-select the latest available month in the form
    if (months.length > 0) {
      setSnapForm(s => ({ ...s, report_month: months[0].month, report_year: months[0].year }))
    }
    setLoadingMonths(false)
  }, [])

  const loadSnapshots = useCallback(async () => {
    const { data } = await supabase
      .from('report_snapshot')
      .select('*, gds(id, name)')
      .order('report_year', { ascending: false })
      .order('report_month', { ascending: false })
    setSnapshots((data as ReportSnapshot[]) ?? [])
  }, [])

  const loadSnapshotDetail = useCallback(async (snap: ReportSnapshot) => {
    setSelected(snap)
    const [{ data: c }, { data: u }] = await Promise.all([
      supabase.from('report_monthly_count').select('*').eq('snapshot_id', snap.id).order('gds_name').order('organisation').order('pcc'),
      supabase.from('report_user_detail').select('*').eq('snapshot_id', snap.id).order('gds_name').order('organisation').order('last_name')
    ])
    setCounts((c as ReportMontlyCount[]) ?? [])
    setDetails((u as ReportUserDetail[]) ?? [])
    setActiveTab('counts')
  }, [])

  const [pulling, setPulling] = useState(false)

  //  Pull live data from all 3 GDS user tables filtered by snapshot month/year 
  const pullFromGDS = useCallback(async (snap: ReportSnapshot) => {
    if (!snap) return
    setPulling(true); setError('')

    type RawUser = { first_name?: string; last_name?: string; email_address?: string; organisation?: { id?: number; organisation?: string } }

    // Fetch ALL records from all 3 GDS user tables (no date filter)
    const [{ data: amadeus }, { data: sabre }, { data: travelport }] = await Promise.all([
      supabase.from('amadeus_user').select('id, login, sign_on_id, initial, duty_code, oid, ota, status, created_at, users:user_id(first_name, last_name, email_address, organisation:organisation_id(id, organisation)), ota_client:ota_client_id(company_name)'),
      supabase.from('sabre_user').select('id, epr, pcc, initial, status, created_at, ota, users:user_id(first_name, last_name, email_address, organisation:organisation_id(id, organisation)), ota_client:ota_client_id(company_name)'),
      supabase.from('travelport_user').select('id, sign_on_id, cid, gtid, pcc, initial, status, created_at, ota, users:user_id(first_name, last_name, email_address, organisation:organisation_id(id, organisation)), ota_client:ota_client_id(company_name)'),
    ])

    //  Build user detail rows 
    const detailRows: object[] = []
    const amadeusGdsId = gdsList.find(g => g.name === 'Amadeus')?.id ?? null
    const sabreGdsId   = gdsList.find(g => g.name === 'Sabre')?.id ?? null
    const tpGdsId      = gdsList.find(g => g.name === 'Travelport')?.id ?? null

    for (const r of amadeus ?? []) {
      const u = (r as {users?: RawUser}).users as RawUser
      const o = u?.organisation as { id?: number; organisation?: string }
      detailRows.push({ snapshot_id: snap.id, gds_id: amadeusGdsId, gds_name: 'Amadeus', pcc: '', organisation: o?.organisation ?? '', organisation_id: o?.id ?? null, first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {login?: string}).login ?? null, sign_on_id: (r as {sign_on_id?: string}).sign_on_id ?? null, duty_code: (r as {duty_code?: string}).duty_code ?? null, user_status: (r as {status?: string}).status ?? 'active' })
    }
    for (const r of sabre ?? []) {
      const u = (r as {users?: RawUser}).users as RawUser
      const o = u?.organisation as { id?: number; organisation?: string }
      detailRows.push({ snapshot_id: snap.id, gds_id: sabreGdsId, gds_name: 'Sabre', pcc: (r as {pcc?: string}).pcc ?? '', organisation: o?.organisation ?? '', organisation_id: o?.id ?? null, first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {epr?: string}).epr ?? null, sign_on_id: null, duty_code: null, user_status: (r as {status?: string}).status ?? 'active' })
    }
    for (const r of travelport ?? []) {
      const u = (r as {users?: RawUser}).users as RawUser
      const o = u?.organisation as { id?: number; organisation?: string }
      detailRows.push({ snapshot_id: snap.id, gds_id: tpGdsId, gds_name: 'Travelport', pcc: (r as {pcc?: string}).pcc ?? '', organisation: o?.organisation ?? '', organisation_id: o?.id ?? null, first_name: u?.first_name ?? null, last_name: u?.last_name ?? null, initial: (r as {initial?: string}).initial ?? null, email: u?.email_address ?? null, login_id: (r as {sign_on_id?: string}).sign_on_id ?? null, sign_on_id: (r as {sign_on_id?: string}).sign_on_id ?? null, duty_code: null, user_status: (r as {status?: string}).status ?? 'active' })
    }

    // Delete existing then insert fresh in batches of 100
    await supabase.from('report_user_detail').delete().eq('snapshot_id', snap.id)
    for (let i = 0; i < detailRows.length; i += 100) {
      await supabase.from('report_user_detail').insert(detailRows.slice(i, i + 100))
    }

    //  Build monthly count grouped by GDS + PCC + Organisation 
    type CountEntry = { gds_name: string; pcc: string; organisation: string; organisation_id: number | null; total: number; active: number; inactive: number; ota: number }
    const countMap = new Map<string, CountEntry>()

    const allRows = [
      ...(amadeus ?? []).map(r => ({ gds: 'Amadeus', pcc: '', r })),
      ...(sabre   ?? []).map(r => ({ gds: 'Sabre',   pcc: (r as {pcc?: string}).pcc ?? '', r })),
      ...(travelport ?? []).map(r => ({ gds: 'Travelport', pcc: (r as {pcc?: string}).pcc ?? '', r })),
    ]

    for (const { gds, pcc, r } of allRows) {
      const u = (r as {users?: RawUser}).users as RawUser
      const o = u?.organisation as { id?: number; organisation?: string }
      const org    = o?.organisation ?? '(No Organisation)'
      const orgId  = o?.id ?? null
      const key    = `${gds}||${pcc}||${org}`
      const status = ((r as {status?: string}).status ?? 'active').toLowerCase()
      if (!countMap.has(key)) countMap.set(key, { gds_name: gds, pcc, organisation: org, organisation_id: orgId, total: 0, active: 0, inactive: 0, ota: 0 })
      const e = countMap.get(key)!
      e.total++
      if (status === 'active') e.active++
      if (status === 'inactive' || status === 'suspended') e.inactive++
      if ((r as {ota?: boolean}).ota) e.ota++
    }

    const countRows = Array.from(countMap.values()).map(c => ({
      snapshot_id: snap.id, gds_name: c.gds_name, pcc: c.pcc,
      organisation: c.organisation, organisation_id: c.organisation_id,
      total_users: c.total, active_users: c.active,
      inactive_users: c.inactive, ota_users: c.ota,
    }))

    await supabase.from('report_monthly_count').delete().eq('snapshot_id', snap.id)
    if (countRows.length > 0) await supabase.from('report_monthly_count').insert(countRows)

    await loadSnapshotDetail(snap)
    setPulling(false)
    setSuccess(`Pulled ${detailRows.length} users across ${countRows.length} groups.`)
    setTimeout(() => setSuccess(''), 5000)
  }, [gdsList, loadSnapshotDetail])


  //  Create snapshot 
  async function createSnapshot() {
    setSaving(true); setError('')
    if (!snapForm.report_name.trim()) { setError('Report name is required.'); setSaving(false); return }
    if (!snapForm.date_from || !snapForm.date_to) { setError('From and To dates are required.'); setSaving(false); return }
    if (snapForm.date_from > snapForm.date_to) { setError('"From" date cannot be after "To" date.'); setSaving(false); return }
    const from = new Date(snapForm.date_from)
    const payload = {
      report_name:  snapForm.report_name.trim(),
      report_month: from.getMonth() + 1,
      report_year:  from.getFullYear(),
      gds_id:       snapForm.gds_id ? Number(snapForm.gds_id) : null,
      notes:        snapForm.notes.trim() || null,
      status:       'draft' as const,
    }
    const { error: e } = await supabase.from('report_snapshot').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSuccess('Report snapshot created.'); setShowForm(false); setSnapForm(blankSnap)
    await loadSnapshots(); setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  //  Add count row 
  async function addCountRow() {
    if (!selected) return
    setSaving(true); setError('')
    const { error: e } = await supabase.from('report_monthly_count').insert({
      snapshot_id:    selected.id,
      gds_name:       countForm.gds_name,
      pcc:            countForm.pcc.toUpperCase(),
      organisation:   countForm.organisation,
      total_users:    Number(countForm.total_users),
      active_users:   Number(countForm.active_users),
      inactive_users: Number(countForm.inactive_users),
      ota_users:      Number(countForm.ota_users),
      adjusted_count: countForm.adjusted_count !== '' ? Number(countForm.adjusted_count) : null,
      count_note:     countForm.count_note || null,
    })
    if (e) { setError(e.message); setSaving(false); return }
    setShowAddCount(false); setCountForm(blankCount)
    await loadSnapshotDetail(selected); setSaving(false)
  }

  //  Add user detail row 
  async function addUserRow() {
    if (!selected) return
    setSaving(true); setError('')
    const { error: e } = await supabase.from('report_user_detail').insert({
      snapshot_id:     selected.id,
      gds_id:          gdsList.find(g => g.name === userForm.gds_name)?.id ?? null,
      gds_name:        userForm.gds_name,
      pcc:             userForm.pcc.toUpperCase(),
      organisation:    userForm.organisation,
      first_name:      userForm.first_name || null,
      last_name:       userForm.last_name || null,
      initial:         userForm.initial || null,
      email:           userForm.email || null,
      login_id:        userForm.login_id || null,
      sign_on_id:      userForm.sign_on_id || null,
      duty_code:       userForm.duty_code || null,
      user_status:     userForm.user_status,
      last_login_date: userForm.last_login_date || null,
      last_login_note: userForm.last_login_note || null,
    })
    if (e) { setError(e.message); setSaving(false); return }
    setShowAddUser(false); setUserForm(blankUser)
    await loadSnapshotDetail(selected); setSaving(false)
  }

  //  Update snapshot status 
  async function updateStatus(id: number, status: string) {
    await supabase.from('report_snapshot').update({ status, modified_at: new Date().toISOString() }).eq('id', id)
    await loadSnapshots()
    if (selected?.id === id) setSelected(s => s ? { ...s, status: status as ReportSnapshot['status'] } : s)
  }

  //  Delete snapshot 
  async function deleteSnapshot(id: number) {
    if (!confirm('Delete this report snapshot and all its data?')) return
    await supabase.from('report_snapshot').delete().eq('id', id)
    if (selected?.id === id) { setSelected(null); setCounts([]); setDetails([]) }
    await loadSnapshots()
  }

  //  Export Excel 
  function exportExcel() {
    if (!selected) return
    const wb = XLSX.utils.book_new()
    // Summary sheet
    const summaryData = [
      ['Report Name', selected.report_name],
      ['Period', selected.date_from && selected.date_to ? `${selected.date_from}  ${selected.date_to}` : `${MONTHS[selected.report_month - 1]} ${selected.report_year}`],
      ['GDS', (selected.gds as GDS)?.name ?? 'All GDS'],
      ['Status', selected.status],
      ['Notes', selected.notes ?? ''],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')
    // Monthly counts sheet
    if (counts.length > 0) {
      const headers = ['GDS', 'PCC', 'Organisation', 'Total Users', 'Active', 'Inactive', 'OTA', 'Adjusted Count', 'Note']
      const rows = counts.map(c => [c.gds_name, c.pcc, c.organisation, c.total_users, c.active_users, c.inactive_users, c.ota_users, c.adjusted_count ?? '', c.count_note ?? ''])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Monthly Count')
    }
    // User detail sheet
    if (details.length > 0) {
      const headers = ['GDS', 'PCC', 'Organisation', 'First Name', 'Last Name', 'Initial', 'Email', 'Login ID', 'Sign-On ID', 'Duty Code', 'Status', 'Last Login Date', 'Login Note']
      const rows = details.map(u => [u.gds_name, u.pcc, u.organisation, u.first_name ?? '', u.last_name ?? '', u.initial ?? '', u.email ?? '', u.login_id ?? '', u.sign_on_id ?? '', u.duty_code ?? '', u.user_status ?? '', u.last_login_date ?? '', u.last_login_note ?? ''])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'User Detail')
    }
    XLSX.writeFile(wb, `GDSHub_Report_${selected.date_from ?? selected.report_year}_to_${selected.date_to ?? selected.report_month}.xlsx`)
  }

  //  Input style helper 
  const inp = (extra?: object) => ({ padding:'7px 10px', fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', background:T.card, color:'#334155', outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lbl = { fontSize:'11px', fontWeight:600, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'4px', display:'block' }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'#94a3b8',fontSize:'14px'}}>
      Loading reporting module
    </div>
  )

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif'}}>

      {/*  Page Header  */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'20px'}}>
        <div>
          <h1 style={{fontSize:'24px',fontWeight:800,color:T.text,margin:0,letterSpacing:'-0.025em'}}>Reporting</h1>
          <p style={{fontSize:'14px',color:'#64748b',marginTop:'4px'}}>Monthly GDS user snapshots by GDS, PCC and Organisation</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setError('') }}
            style={{display:'flex',alignItems:'center',gap:'7px',padding:'9px 16px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Report
          </button>
        )}
      </div>

      {/*  Toast messages  */}
      {error   && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'14px'}}>{error}</div>}
      {success && <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'14px'}}>{success}</div>}

      <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:'16px',alignItems:'start'}}>

        {/*  Left: Snapshot list  */}
        <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
          <div style={{padding:'12px 14px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc'}}>
            <span style={{fontSize:'12px',fontWeight:700,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.06em'}}>Report Snapshots</span>
            <span style={{marginLeft:'8px',fontSize:'12px',color:'#94a3b8'}}>({snapshots.length})</span>
          </div>
          {snapshots.length === 0 ? (
            <div style={{padding:'32px 16px',textAlign:'center',color:'#94a3b8',fontSize:'13px'}}>
              No reports yet.<br/>
              {isAdmin && <span style={{color:'#6366f1',cursor:'pointer',fontWeight:500}} onClick={() => setShowForm(true)}>Create the first one </span>}
            </div>
          ) : (
            <div style={{maxHeight:'600px',overflowY:'auto'}}>
              {snapshots.map(snap => {
                const st = STATUS_STYLE[snap.status]
                const isActive = selected?.id === snap.id
                return (
                  <div key={snap.id} onClick={() => loadSnapshotDetail(snap)}
                    style={{padding:'12px 14px',borderBottom:'1px solid #f1f5f9',cursor:'pointer',background: isActive ? '#f0f9ff' : 'white',borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',transition:'all 0.1s'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
                      <span style={{fontSize:'13px',fontWeight:600,color:'#0f172a'}}>{snap.report_name}</span>
                      <span style={{fontSize:'11px',fontWeight:600,padding:'2px 8px',borderRadius:'20px',background:st.bg,color:st.color,display:'flex',alignItems:'center',gap:'4px'}}>
                        <span style={{width:'5px',height:'5px',borderRadius:'50%',background:st.dot,display:'inline-block'}}/>
                        {snap.status}
                      </span>
                    </div>
                    <div style={{fontSize:'12px',color:'#64748b'}}>
                      {snap.date_from && snap.date_to
                        ? `${snap.date_from}  ${snap.date_to}`
                        : snap.date_from && snap.date_to ? `${snap.date_from}  ${snap.date_to}` : `${MONTHS[snap.report_month - 1]} ${snap.report_year}`}
                      {snap.gds && <span style={{marginLeft:'6px',padding:'1px 6px',borderRadius:T.radiusSm,background: GDS_COLORS[snap.gds.name] ?? '#f1f5f9',fontSize:'11px',fontWeight:600,color:'#334155'}}>{snap.gds.name}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/*  Right: Detail panel  */}
        {!selected ? (
          <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'12px',padding:'60px 24px',textAlign:'center',color:'#94a3b8',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:'0 auto 12px'}}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <p style={{fontSize:'14px',margin:0}}>Select a report from the left to view details</p>
          </div>
        ) : (
          <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>

            {/* Detail header */}
            <div style={{padding:'14px 18px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'10px'}}>
              <div>
                <div style={{fontSize:'15px',fontWeight:700,color:'#0f172a'}}>{selected.report_name}</div>
                <div style={{fontSize:'12px',color:'#64748b',marginTop:'2px'}}>
                  {selected.date_from && selected.date_to ? `${selected.date_from}  ${selected.date_to}` : `${MONTHS[selected.report_month - 1]} ${selected.report_year}`}
                  {selected.gds && <span style={{marginLeft:'8px',padding:'1px 7px',borderRadius:T.radiusSm,background: GDS_COLORS[(selected.gds as GDS)?.name] ?? '#f1f5f9',fontSize:'11px',fontWeight:600}}>{(selected.gds as GDS)?.name}</span>}
                  {selected.notes && <span style={{marginLeft:'8px',color:'#94a3b8'}}> {selected.notes}</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                {isAdmin && (
                  <>
                    <select value={selected.status} onChange={e => updateStatus(selected.id, e.target.value)}
                      style={{padding:'5px 10px',fontSize:'12px',fontWeight:600,border:'1px solid #e2e8f0',borderRadius:'7px',background:T.card,color:'#475569',outline:'none',cursor:'pointer'}}>
                      <option value="draft">Draft</option>
                      <option value="final">Final</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button onClick={() => pullFromGDS(selected)} disabled={pulling}
                      style={{display:'flex',alignItems:'center',gap:'6px',padding:'6px 12px',background:'#4f46e5',color:'white',border:'none',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer',opacity:pulling?0.6:1}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      {pulling ? 'Pulling' : 'Pull from GDS'}
                    </button>
                    <button onClick={exportExcel}
                      style={{display:'flex',alignItems:'center',gap:'6px',padding:'6px 12px',background:'#16a34a',color:'white',border:'none',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Export
                    </button>
                    <button onClick={() => deleteSnapshot(selected.id)}
                      style={{padding:'6px 12px',background:T.card,color:'#dc2626',border:'1px solid #fecaca',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:'flex',borderBottom:'1px solid #e2e8f0',background:T.card}}>
              {(['counts','users'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{padding:'10px 20px',fontSize:'13px',fontWeight:600,border:'none',background:'none',cursor:'pointer',
                    color: activeTab===tab ? '#4f46e5' : '#64748b',
                    borderBottom: activeTab===tab ? '2px solid #4f46e5' : '2px solid transparent',
                    transition:'all 0.15s'}}>
                  {tab === 'counts' ? `Monthly Count (${counts.length})` : `User Detail (${details.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{padding:'16px 18px'}}>

              {/*  Monthly Count Tab  */}
              {activeTab === 'counts' && (
                <>
                  {isAdmin && (
                    <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
                      <button onClick={() => { setShowAddCount(true); setCountForm(blankCount) }}
                        style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',background:'#0f172a',color:'white',border:'none',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Row
                      </button>
                    </div>
                  )}
                  {counts.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px',color:'#94a3b8',fontSize:'13px'}}>No count data yet. Add rows above.</div>
                  ) : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px',minWidth:'800px'}}>
                        <thead>
                          <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                            {['GDS','PCC','Organisation','Total','Active','Inactive','OTA','Adjusted','Note'].map(h => (
                              <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {counts.map((c, i) => (
                            <tr key={c.id} style={{borderBottom: i < counts.length - 1 ? '1px solid #f1f5f9' : 'none'}}
                              onMouseEnter={e => (e.currentTarget.style.background='#f8faff')}
                              onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                              <td style={{padding:'10px 12px'}}>
                                <span style={{padding:'2px 8px',borderRadius:T.radiusSm,background: GDS_COLORS[c.gds_name] ?? '#f1f5f9',fontSize:'11px',fontWeight:600}}>{c.gds_name}</span>
                              </td>
                              <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:600,color:'#0f172a'}}>{c.pcc}</td>
                              <td style={{padding:'10px 12px',color:'#334155'}}>{c.organisation}</td>
                              <td style={{padding:'10px 12px',fontWeight:700,color:'#0f172a',textAlign:'center'}}>{c.adjusted_count ?? c.total_users}</td>
                              <td style={{padding:'10px 12px',color:'#16a34a',fontWeight:600,textAlign:'center'}}>{c.active_users}</td>
                              <td style={{padding:'10px 12px',color:'#dc2626',fontWeight:600,textAlign:'center'}}>{c.inactive_users}</td>
                              <td style={{padding:'10px 12px',color:'#7c3aed',fontWeight:600,textAlign:'center'}}>{c.ota_users}</td>
                              <td style={{padding:'10px 12px',color:'#0369a1',fontWeight:600,textAlign:'center'}}>{c.adjusted_count ?? ''}</td>
                              <td style={{padding:'10px 12px',color:'#64748b',fontSize:'12px'}}>{c.count_note ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Totals row */}
                        <tfoot>
                          <tr style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc'}}>
                            <td colSpan={3} style={{padding:'10px 12px',fontSize:'12px',fontWeight:700,color:'#475569'}}>TOTAL</td>
                            <td style={{padding:'10px 12px',fontWeight:800,color:'#0f172a',textAlign:'center'}}>{counts.reduce((s,c) => s + (c.adjusted_count ?? c.total_users), 0)}</td>
                            <td style={{padding:'10px 12px',fontWeight:700,color:'#16a34a',textAlign:'center'}}>{counts.reduce((s,c) => s + c.active_users, 0)}</td>
                            <td style={{padding:'10px 12px',fontWeight:700,color:'#dc2626',textAlign:'center'}}>{counts.reduce((s,c) => s + c.inactive_users, 0)}</td>
                            <td style={{padding:'10px 12px',fontWeight:700,color:'#7c3aed',textAlign:'center'}}>{counts.reduce((s,c) => s + c.ota_users, 0)}</td>
                            <td colSpan={2}/>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/*  User Detail Tab  */}
              {activeTab === 'users' && (
                <>
                  {isAdmin && (
                    <div style={{marginBottom:'12px',display:'flex',justifyContent:'flex-end'}}>
                      <button onClick={() => { setShowAddUser(true); setUserForm(blankUser) }}
                        style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',background:'#0f172a',color:'white',border:'none',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add User
                      </button>
                    </div>
                  )}
                  {details.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px',color:'#94a3b8',fontSize:'13px'}}>No user records yet. Add users above.</div>
                  ) : (
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px',minWidth:'900px'}}>
                        <thead>
                          <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                            {['GDS','PCC','Organisation','Initial','Name','Email','Login ID','Sign-On','Status','Last Login'].map(h => (
                              <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {details.map((u, i) => (
                            <tr key={u.id} style={{borderBottom: i < details.length - 1 ? '1px solid #f1f5f9' : 'none'}}
                              onMouseEnter={e => (e.currentTarget.style.background='#f8faff')}
                              onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                              <td style={{padding:'10px 12px'}}>
                                <span style={{padding:'2px 8px',borderRadius:T.radiusSm,background: GDS_COLORS[u.gds_name] ?? '#f1f5f9',fontSize:'11px',fontWeight:600}}>{u.gds_name}</span>
                              </td>
                              <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:600,color:'#0f172a'}}>{u.pcc}</td>
                              <td style={{padding:'10px 12px',color:'#334155'}}>{u.organisation}</td>
                              <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:600,color:'#7c3aed'}}>{u.initial ?? ''}</td>
                              <td style={{padding:'10px 12px',color:'#334155'}}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || ''}</td>
                              <td style={{padding:'10px 12px',color:'#0369a1',fontSize:'12px'}}>{u.email ?? ''}</td>
                              <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'12px'}}>{u.login_id ?? ''}</td>
                              <td style={{padding:'10px 12px',fontFamily:'monospace',fontSize:'12px'}}>{u.sign_on_id ?? ''}</td>
                              <td style={{padding:'10px 12px'}}>
                                <span style={{fontSize:'11px',fontWeight:600,padding:'2px 8px',borderRadius:'20px',
                                  background: u.user_status==='active' ? '#dcfce7' : u.user_status==='inactive' ? '#fee2e2' : '#fef9c3',
                                  color:      u.user_status==='active' ? '#166534' : u.user_status==='inactive' ? '#dc2626' : '#854d0e'}}>
                                  {u.user_status ?? ''}
                                </span>
                              </td>
                              <td style={{padding:'10px 12px',color:'#64748b',fontSize:'12px'}}>{u.last_login_date ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 
          MODAL: New Snapshot
       */}
      {showForm && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
          <div style={{background:T.card,borderRadius:'14px',width:'100%',maxWidth:'500px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'15px',fontWeight:700,color:'#0f172a'}}>New Report Snapshot</span>
              <button onClick={() => setShowForm(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:'20px',lineHeight:1}}></button>
            </div>
            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:'14px'}}>
              <div>
                <label style={lbl}>Report Name *</label>
                <input value={snapForm.report_name} onChange={e => setSnapForm(s => ({...s, report_name: e.target.value}))}
                  placeholder="e.g. June 2026 GDS User Report" style={inp()} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <label style={lbl}>Period From</label>
                  <input type="date" value={snapForm.date_from} onChange={e => setSnapForm(s => ({...s, date_from: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Period To</label>
                  <input type="date" value={snapForm.date_to} onChange={e => setSnapForm(s => ({...s, date_to: e.target.value}))} style={inp()} />
                </div>
              </div>
              <div>
                <label style={lbl}>GDS (optional  leave blank for all)</label>
                <select value={snapForm.gds_id} onChange={e => setSnapForm(s => ({...s, gds_id: e.target.value}))} style={inp()}>
                  <option value="">All GDS</option>
                  {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={snapForm.notes} onChange={e => setSnapForm(s => ({...s, notes: e.target.value}))}
                  placeholder="Optional notes..." rows={2}
                  style={{...inp(), resize:'vertical', fontFamily:'inherit'}} />
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
              <button onClick={() => setShowForm(false)} style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#475569',cursor:'pointer',fontWeight:500}}>Cancel</button>
              <button onClick={createSnapshot} disabled={saving}
                style={{padding:'8px 20px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:saving?0.6:1}}>
                {saving ? 'Creating' : 'Create Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
          MODAL: Add Count Row
       */}
      {showAddCount && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
          <div style={{background:T.card,borderRadius:'14px',width:'100%',maxWidth:'520px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'15px',fontWeight:700,color:'#0f172a'}}>Add Count Row</span>
              <button onClick={() => setShowAddCount(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:'20px',lineHeight:1}}></button>
            </div>
            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>GDS</label>
                  <select value={countForm.gds_name} onChange={e => setCountForm(s => ({...s, gds_name: e.target.value}))} style={inp()}>
                    <option value="">Select</option>
                    {gdsList.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>PCC</label>
                  <input value={countForm.pcc} onChange={e => setCountForm(s => ({...s, pcc: e.target.value}))} placeholder="e.g. KULMY217Z" style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Organisation</label>
                  <input value={countForm.organisation} onChange={e => setCountForm(s => ({...s, organisation: e.target.value}))} placeholder="Company name" style={inp()} />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'10px'}}>
                {(['total_users','active_users','inactive_users','ota_users'] as const).map(f => (
                  <div key={f}>
                    <label style={lbl}>{f.replace('_users','').replace('_',' ')}</label>
                    <input type="number" min="0" value={countForm[f]} onChange={e => setCountForm(s => ({...s, [f]: e.target.value}))} style={inp()} />
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>Adjusted Count</label>
                  <input type="number" min="0" value={countForm.adjusted_count} onChange={e => setCountForm(s => ({...s, adjusted_count: e.target.value}))} placeholder="Optional" style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Note</label>
                  <input value={countForm.count_note} onChange={e => setCountForm(s => ({...s, count_note: e.target.value}))} placeholder="Reason for adjustment" style={inp()} />
                </div>
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
              <button onClick={() => setShowAddCount(false)} style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#475569',cursor:'pointer',fontWeight:500}}>Cancel</button>
              <button onClick={addCountRow} disabled={saving}
                style={{padding:'8px 20px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:saving?0.6:1}}>
                {saving ? 'Saving' : 'Add Row'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
          MODAL: Add User Detail
       */}
      {showAddUser && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
          <div style={{background:T.card,borderRadius:'14px',width:'100%',maxWidth:'580px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:'15px',fontWeight:700,color:'#0f172a'}}>Add User Record</span>
              <button onClick={() => setShowAddUser(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:'20px',lineHeight:1}}></button>
            </div>
            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>GDS</label>
                  <select value={userForm.gds_name} onChange={e => setUserForm(s => ({...s, gds_name: e.target.value}))} style={inp()}>
                    <option value="">Select</option>
                    {gdsList.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>PCC</label>
                  <input value={userForm.pcc} onChange={e => setUserForm(s => ({...s, pcc: e.target.value}))} placeholder="e.g. KULMY217Z" style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Organisation</label>
                  <input value={userForm.organisation} onChange={e => setUserForm(s => ({...s, organisation: e.target.value}))} placeholder="Company name" style={inp()} />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>First Name</label>
                  <input value={userForm.first_name} onChange={e => setUserForm(s => ({...s, first_name: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Last Name</label>
                  <input value={userForm.last_name} onChange={e => setUserForm(s => ({...s, last_name: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Initial</label>
                  <input value={userForm.initial} onChange={e => setUserForm(s => ({...s, initial: e.target.value}))} placeholder="e.g. NS" style={inp()} />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={userForm.email} onChange={e => setUserForm(s => ({...s, email: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Login ID</label>
                  <input value={userForm.login_id} onChange={e => setUserForm(s => ({...s, login_id: e.target.value}))} style={inp()} />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>Sign-On ID</label>
                  <input value={userForm.sign_on_id} onChange={e => setUserForm(s => ({...s, sign_on_id: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Duty Code</label>
                  <input value={userForm.duty_code} onChange={e => setUserForm(s => ({...s, duty_code: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Status</label>
                  <select value={userForm.user_status} onChange={e => setUserForm(s => ({...s, user_status: e.target.value}))} style={inp()}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'10px'}}>
                <div>
                  <label style={lbl}>Last Login Date</label>
                  <input type="date" value={userForm.last_login_date} onChange={e => setUserForm(s => ({...s, last_login_date: e.target.value}))} style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Login Note</label>
                  <input value={userForm.last_login_note} onChange={e => setUserForm(s => ({...s, last_login_note: e.target.value}))} placeholder="e.g. Active booking agent" style={inp()} />
                </div>
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'flex-end',gap:'8px'}}>
              <button onClick={() => setShowAddUser(false)} style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#475569',cursor:'pointer',fontWeight:500}}>Cancel</button>
              <button onClick={addUserRow} disabled={saving}
                style={{padding:'8px 20px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:saving?0.6:1}}>
                {saving ? 'Saving' : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
