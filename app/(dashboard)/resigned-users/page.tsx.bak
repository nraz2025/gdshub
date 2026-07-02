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




//  Types 
interface ResignedUser {
  id: number
  source_gds: 'Amadeus' | 'Sabre' | 'Travelport'
  source_record_id: number
  full_name: string | null
  initial: string | null
  email: string | null
  amadeus_login: string | null
  amadeus_sign_on_id: string | null
  amadeus_duty_code: string | null
  amadeus_oid: string | null
  sabre_epr: string | null
  sabre_pcc: string | null
  travelport_sign_on_id: string | null
  travelport_cid: string | null
  travelport_gtid: string | null
  travelport_pcc: string | null
  organisation: string | null
  organisation_id: number | null
  pcc: string | null
  ota_client: string | null
  cta: string | null
  pta: string | null
  minicom: string | null
  date_created_in_gds: string
  date_resigned: string
  remarks: string | null
  created_at: string
}

const GDS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Amadeus:    { bg: '#f3e8ff', color: '#7c3aed', border: '#ddd6fe' },
  Sabre:      { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' },
  Travelport: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
}

export default function ResignedUsersPage() {
  const supabase = createClient()

  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [records, setRecords]     = useState<ResignedUser[]>([])
  const [selected, setSelected]   = useState<ResignedUser | null>(null)
  const [saving, setSaving]       = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  // Filters
  const [search, setSearch]           = useState('')
  const [filterGDS, setFilterGDS]     = useState('all')

  // Edit form  remarks only now
  const blankReuse = { remarks: '' }
  const [reuseForm, setReuseForm] = useState(blankReuse)

  //  Load 
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        setIsAdmin(p?.role === 'admin')
      }
      await load()
      setLoading(false)
    }
    init()
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('resigned_user')
      .select('*')
      .order('date_resigned', { ascending: false })
    setRecords((data as ResignedUser[]) ?? [])
  }, [])

  //  Filtered 
  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    const matchSearch = !term
      || (r.full_name ?? '').toLowerCase().includes(term)
      || (r.initial ?? '').toLowerCase().includes(term)
      || (r.email ?? '').toLowerCase().includes(term)
      || (r.organisation ?? '').toLowerCase().includes(term)
      || (r.pcc ?? '').toLowerCase().includes(term)
      || (r.amadeus_login ?? '').toLowerCase().includes(term)
      || (r.sabre_epr ?? '').toLowerCase().includes(term)
      || (r.travelport_sign_on_id ?? '').toLowerCase().includes(term)
    const matchGDS = filterGDS === 'all' || r.source_gds === filterGDS
    return matchSearch && matchGDS
  })

  //  Open detail 
  function openDetail(row: ResignedUser) {
    setSelected(row)
    setReuseForm({
      remarks:             row.remarks ?? '',
    })
    setShowDetail(true)
    setError('')
  }

  //  Save reuse update 
  async function saveReuse() {
    if (!selected) return
    setSaving(true); setError('')
    const { error: e } = await supabase.from('resigned_user').update({
      remarks:             reuseForm.remarks || null,
      modified_at:         new Date().toISOString(),
    }).eq('id', selected.id)
    if (e) { setError(e.message); setSaving(false); return }
    setSuccess('Record updated.'); setShowDetail(false)
    await load(); setSaving(false)
    setTimeout(() => setSuccess(''), 3000)
  }

  //  Restore — recreate GDS record, reactivate user, remove from resigned_user 
  async function restoreUser() {
    if (!selected) return
    setRestoring(true); setError('')

    // 1. Resolve OTA Client name back to an id (if one was recorded)
    let otaClientId: number | null = null
    if (selected.ota_client) {
      const { data: otaRow } = await supabase.from('ota_client').select('id').eq('company_name', selected.ota_client).maybeSingle()
      otaClientId = otaRow?.id ?? null
    }

    // 2. Resolve / reactivate the linked person in users table
    let userId: string | null = null
    if (selected.email) {
      const { data: userRow } = await supabase.from('users').select('id').eq('email_address', selected.email).maybeSingle()
      if (userRow?.id) {
        userId = userRow.id
        await supabase.from('users').update({ status: 'Active' }).eq('id', userId)
      }
    }

    // 3. Recreate the GDS user record from the snapshot
    let insertError: string | null = null
    if (selected.source_gds === 'Amadeus') {
      const { error: e } = await supabase.from('amadeus_user').insert({
        login:        selected.amadeus_login,
        sign_on_id:   selected.amadeus_sign_on_id,
        duty_code:    selected.amadeus_duty_code,
        oid:          selected.amadeus_oid,
        initial:      selected.initial,
        user_id:      userId,
        ota_client_id: otaClientId,
        status:       'active',
      })
      insertError = e?.message ?? null
    } else if (selected.source_gds === 'Sabre') {
      const { error: e } = await supabase.from('sabre_user').insert({
        epr:           selected.sabre_epr,
        pcc:           selected.sabre_pcc,
        initial:       selected.initial,
        cta:           selected.cta,
        pta:           selected.pta,
        minicom:       selected.minicom,
        user_id:       userId,
        ota_client_id: otaClientId,
        status:        'Active',
      })
      insertError = e?.message ?? null
    } else if (selected.source_gds === 'Travelport') {
      const { error: e } = await supabase.from('travelport_user').insert({
        sign_on_id:    selected.travelport_sign_on_id,
        cid:           selected.travelport_cid,
        gtid:          selected.travelport_gtid,
        pcc:           selected.travelport_pcc,
        initial:       selected.initial,
        user_id:       userId,
        ota_client_id: otaClientId,
        status:        'active',
      })
      insertError = e?.message ?? null
    }

    if (insertError) { setError(insertError); setRestoring(false); return }

    // 4. Remove from resigned_user now that it's been restored
    await supabase.from('resigned_user').delete().eq('id', selected.id)

    setSuccess(`${selected.full_name ?? 'User'} restored to ${selected.source_gds}.`)
    setShowRestoreConfirm(false); setShowDetail(false)
    await load(); setRestoring(false)
    setTimeout(() => setSuccess(''), 4000)
  }

  //  Export 
  function exportExcel() {
    const headers = ['GDS','Full Name','Initial','Email','Organisation','PCC','GDS Login/ID','Date Created in GDS','Date Resigned','Remarks']
    const rows = filtered.map(r => [
      r.source_gds,
      r.full_name ?? '',
      r.initial ?? '',
      r.email ?? '',
      r.organisation ?? '',
      r.pcc ?? r.sabre_pcc ?? r.travelport_pcc ?? '',
      r.amadeus_login ?? r.sabre_epr ?? r.travelport_sign_on_id ?? '',
      r.date_created_in_gds,
      r.date_resigned,
      r.remarks ?? '',
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Resigned Users')
    XLSX.writeFile(wb, `GDSHub_Resigned_Users_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  //  Helpers 
  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-MY', { day:'2-digit', month:'short', year:'numeric' }) : ''
  const lbl = { fontSize:'11px', fontWeight:600, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'4px', display:'block' }
  const inp = (extra?: object) => ({ padding:'7px 10px', fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', background:T.card, color:'#334155', outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'#94a3b8',fontSize:'14px'}}>
      Loading resigned users
    </div>
  )

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif'}}>

      {/*  Page Header  */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'20px'}}>
        <div>
          <h1 style={{fontSize:'24px',fontWeight:800,color:T.text,margin:0,letterSpacing:'-0.025em'}}>Resigned Users</h1>
          <p style={{fontSize:'13px',color:T.textMid,marginTop:'3px'}}>Archive of GDS users who have resigned  track initial reuse history</p>
        </div>
        <button onClick={exportExcel} disabled={filtered.length === 0}
          style={{display:'flex',alignItems:'center',gap:'7px',padding:'9px 16px',background:'#16a34a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:filtered.length===0?0.4:1}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export Excel
        </button>
      </div>

      {/*  Toasts  */}
      {error   && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'14px'}}>{error}</div>}
      {success && <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',color:'#16a34a',padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'14px'}}>{success}</div>}

      {/*  Stats bar  */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginBottom:'16px'}}>
        {[
          { label:'Total Resigned', value: records.length, color:'#0f172a', bg:'#f8fafc' },
          { label:'Amadeus', value: records.filter(r=>r.source_gds==='Amadeus').length, color:'#7c3aed', bg:'#f3e8ff' },
          { label:'Sabre', value: records.filter(r=>r.source_gds==='Sabre').length, color:'#0369a1', bg:'#e0f2fe' },
          { label:'Travelport', value: records.filter(r=>r.source_gds==='Travelport').length, color:'#166534', bg:'#dcfce7' },
        ].map(s => (
          <div key={s.label} style={{background:s.bg,border:'1px solid #e2e8f0',borderRadius:'10px',padding:'14px 16px'}}>
            <div style={{fontSize:'22px',fontWeight:800,color:s.color}}>{s.value}</div>
            <div style={{fontSize:'16px',color:'#64748b',marginTop:'2px'}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/*  Filters  */}
      <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'10px',padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
        <input type="text" placeholder="Search name, initial, email, org, PCC" value={search} onChange={e => setSearch(e.target.value)}
          style={{...inp(), width:'280px'}} />
        <select value={filterGDS} onChange={e => setFilterGDS(e.target.value)} style={inp({width:'140px'})}>
          <option value="all">All GDS</option>
          <option value="Amadeus">Amadeus</option>
          <option value="Sabre">Sabre</option>
          <option value="Travelport">Travelport</option>
        </select>
        <span style={{fontSize:'12px',color:'#94a3b8',marginLeft:'4px'}}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        {(search || filterGDS !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterGDS('all') }}
            style={{display:'flex',alignItems:'center',justifyContent:'center',width:'32px',height:'32px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'7px',cursor:'pointer',color:'#64748b'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        )}
      </div>

      {/*  Table  */}
            <div style={{display:'flex', alignItems:'center', padding:'10px 16px', background:T.card, border:'1px solid #e2e8f0', borderRadius:'6px', marginBottom:'12px'}}>
        <span style={{fontSize:'13px', color:'#94a3b8'}}>Showing {filtered.length} record{filtered.length!==1?'s':''}</span>
      </div>
{loading ? (
        <div style={{textAlign:'center',padding:'60px',color:'#94a3b8',fontSize:'14px'}}>Loading</div>
      ) : filtered.length === 0 ? (
        <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'12px',padding:'60px',textAlign:'center',color:'#94a3b8'}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{margin:'0 auto 12px'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
          <p style={{fontSize:'14px',margin:0}}>No resigned users found</p>
        </div>
      ) : (
        <div style={{background:T.card,border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
          {/* Mirror scrollbar */}
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:'1000px'}}>
              <thead>
                <tr style={{background:'#f1f5f9',borderBottom:'2px solid #e2e8f0'}}>
                  {['GDS','PCC / Login','Full Name','Email','Initial','CTA','PTA','Minicom','Date Created','Date Resigned',''].map(h => (
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:'11px',fontWeight:700,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const gds = GDS_COLORS[r.source_gds]
                  const loginId = r.amadeus_login ?? r.sabre_epr ?? r.travelport_sign_on_id ?? ''
                  const pcc = r.pcc ?? r.sabre_pcc ?? r.travelport_pcc ?? ''
                  return (
                    <tr key={r.id} style={{borderBottom: i < filtered.length-1 ? '1px solid #f1f5f9' : 'none'}}
                      onMouseEnter={e => (e.currentTarget.style.background='#f8faff')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <td style={{padding:'11px 14px'}}>
                        <span style={{fontSize:'11px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:gds.bg,color:gds.color,border:`1px solid ${gds.border}`}}>{r.source_gds}</span>
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        <div style={{fontFamily:'monospace',fontSize:'16px',fontWeight:600,color:'#0f172a'}}>{pcc !== '' ? pcc : ''}</div>
                        <div style={{fontFamily:'monospace',fontSize:'11px',color:'#64748b'}}>{loginId}</div>
                      </td>
                      <td style={{padding:'11px 14px',fontWeight:600,color:'#0f172a',fontSize:'13px'}}>{r.full_name ?? ''}</td>
                      <td style={{padding:'11px 14px',color:'#0369a1',fontSize:'12px'}}>{r.email ?? ''}</td>
                      <td style={{padding:'11px 14px'}}>
                        {r.initial
                          ? <span style={{fontFamily:'monospace',fontWeight:700,fontSize:'14px',color:'#7c3aed',background:'#f3e8ff',padding:'2px 8px',borderRadius:'5px'}}>{r.initial}</span>
                          : <span style={{color:'#cbd5e1'}}></span>}
                      </td>
                      <td style={{padding:'11px 14px'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#334155'}}>{r.cta ?? ''}</span></td>
                      <td style={{padding:'11px 14px'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#334155'}}>{r.pta ?? ''}</span></td>
                      <td style={{padding:'11px 14px'}}><span style={{fontFamily:'monospace',fontSize:'13px',color:'#334155'}}>{r.minicom ?? ''}</span></td>
                      <td style={{padding:'11px 14px',fontSize:'16px',color:'#64748b',whiteSpace:'nowrap'}}>{fmt(r.date_created_in_gds)}</td>
                      <td style={{padding:'11px 14px',fontSize:'12px',color:'#dc2626',fontWeight:600,whiteSpace:'nowrap'}}>{fmt(r.date_resigned)}</td>
                      <td style={{padding:'11px 14px'}}>
                        {isAdmin && (
                          <button onClick={() => openDetail(r)}
                            style={{fontSize:'12px',padding:'4px 12px',borderRadius:'6px',border:'1px solid #e2e8f0',background:T.card,color:'#475569',cursor:'pointer',fontWeight:500,whiteSpace:'nowrap'}}>
                            View / Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 
          DETAIL / EDIT MODAL
       */}
      {showDetail && selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
          <div style={{background:T.card,borderRadius:'14px',width:'100%',maxWidth:'620px',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>

            {/* Header */}
            <div style={{padding:'18px 22px',borderBottom:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:T.card,zIndex:1}}>
              <div>
                <span style={{fontSize:'15px',fontWeight:700,color:'#0f172a'}}>{selected.full_name ?? 'Resigned User'}</span>
                <span style={{marginLeft:'10px',fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'20px',
                  background:GDS_COLORS[selected.source_gds].bg,
                  color:GDS_COLORS[selected.source_gds].color,
                  border:`1px solid ${GDS_COLORS[selected.source_gds].border}`}}>
                  {selected.source_gds}
                </span>
              </div>
              <button onClick={() => setShowDetail(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:'22px',lineHeight:1}}></button>
            </div>

            <div style={{padding:'20px 22px',display:'flex',flexDirection:'column',gap:'16px'}}>

              {/* Read-only snapshot info */}
              <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'14px 16px'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'#4f46e5',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Snapshot at Time of Resignation</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  {[
                    ['Initial', selected.initial ?? ''],
                    ['Email', selected.email ?? ''],
                    ['Organisation', selected.organisation ?? ''],
                    ['OTA Client', selected.ota_client ?? ''],
                    ['Date Created in GDS', fmt(selected.date_created_in_gds)],
                    ['Date Resigned', fmt(selected.date_resigned)],
                    ...(selected.source_gds === 'Amadeus' ? [
                      ['Login', selected.amadeus_login ?? ''],
                      ['Sign-On ID', selected.amadeus_sign_on_id ?? ''],
                      ['Duty Code', selected.amadeus_duty_code ?? ''],
                      ['OID', selected.amadeus_oid ?? ''],
                    ] : selected.source_gds === 'Sabre' ? [
                      ['EPR', selected.sabre_epr ?? ''],
                      ['PCC', selected.sabre_pcc ?? ''],
                    ] : [
                      ['Sign-On ID', selected.travelport_sign_on_id ?? ''],
                      ['CID', selected.travelport_cid ?? ''],
                      ['GTID', selected.travelport_gtid ?? ''],
                      ['PCC', selected.travelport_pcc ?? ''],
                    ]) as [string, string][]
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{fontSize:'14px',color:'#94a3b8',fontWeight:500}}>{k}</div>
                      <div style={{fontSize:'13px',fontWeight:600,color:'#334155',fontFamily: k.includes('Login')||k.includes('EPR')||k.includes('OID')||k.includes('PCC')||k.includes('CID') ? 'monospace' : 'inherit'}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Editable fields */}
              {isAdmin && (
                <>
                  <div>
                    <label style={lbl}>Remarks</label>
                    <textarea value={reuseForm.remarks} onChange={e => setReuseForm(s => ({...s, remarks: e.target.value}))}
                      placeholder="Any additional notes" rows={3}
                      style={{...inp(), resize:'vertical', fontFamily:'inherit'}} />
                  </div>

                  {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'13px'}}>{error}</div>}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:'14px 22px',borderTop:'1px solid #e2e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',bottom:0,background:T.card}}>
              {isAdmin && (
                <button onClick={() => setShowRestoreConfirm(true)}
                  style={{padding:'8px 16px',background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                  ↩ Restore User
                </button>
              )}
              <div style={{display:'flex',gap:'8px'}}>
                <button onClick={() => setShowDetail(false)} style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'16px',color:'#475569',cursor:'pointer',fontWeight:500}}>
                  Close
                </button>
                {isAdmin && (
                  <button onClick={saveReuse} disabled={saving}
                    style={{padding:'8px 20px',background:'#0f172a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:saving?0.6:1}}>
                    {saving ? 'Saving' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirmation */}
      {showRestoreConfirm && selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
          <div style={{background:T.card,borderRadius:'14px',width:'100%',maxWidth:'420px',padding:'24px',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
            <div style={{fontSize:'16px',fontWeight:700,color:'#0f172a',marginBottom:'8px'}}>Restore {selected.full_name}?</div>
            <p style={{fontSize:'13px',color:'#64748b',lineHeight:1.5,marginBottom:'16px'}}>
              This will recreate their {selected.source_gds} account using the saved snapshot, set their status back to <strong>Active</strong> in Users, and remove this record from Resigned Users.
            </p>
            {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',padding:'10px 14px',borderRadius:'8px',fontSize:'13px',marginBottom:'14px'}}>{error}</div>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:'8px'}}>
              <button onClick={() => setShowRestoreConfirm(false)} disabled={restoring}
                style={{padding:'8px 16px',background:T.card,border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'13px',color:'#475569',cursor:'pointer',fontWeight:500}}>
                Cancel
              </button>
              <button onClick={restoreUser} disabled={restoring}
                style={{padding:'8px 20px',background:'#16a34a',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',opacity:restoring?0.6:1}}>
                {restoring ? 'Restoring…' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
