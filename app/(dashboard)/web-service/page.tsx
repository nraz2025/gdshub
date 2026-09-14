'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface WebServiceRow {
  id: number
  pcc: string
  company_name: string | null
  agent_id: string
  password: string
  notes: string | null
  source: string | null
  created_at: string
}

const EMPTY = { pcc: '', company_name: '', agent_id: '', password: '', notes: '', source: '' }

// Dark theme (matches TopNav's GDS group = teal)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#39d2c0', accentSoft: 'rgba(57,210,192,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
}

// Generates a password in the "WS" + 6-digit format seen in your real existing data
function generateWsPassword() {
  const digits = Math.floor(100000 + Math.random() * 900000)
  return `WS${digits}`
}

// Custom autocomplete — native <datalist> popups can't be styled, so this is a real component
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
      <input type="text" value={value} onChange={e => onChange(e.target.value)} onFocus={() => setOpen(true)} placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px', fontSize: '14px', border: `1.5px solid ${D.borderLight}`, borderRadius: '8px', background: D.bg, color: D.fg, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', textTransform: 'uppercase' }} />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, maxHeight: '200px', overflowY: 'auto', background: D.card, border: `1.5px solid ${D.fg}`, borderRadius: '8px', boxShadow: '0 12px 28px rgba(0,0,0,0.4)', zIndex: 60, padding: '4px' }}>
          {filtered.slice(0, 50).map(o => (
            <div key={o} onClick={() => { onChange(o); setOpen(false) }}
              style={{ padding: '8px 10px', fontSize: '14px', fontFamily: 'monospace', color: D.fg, cursor: 'pointer', borderRadius: '6px' }}
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

export default function WebServicePage() {
  const supabase = createClient()
  const [records, setRecords] = useState<WebServiceRow[]>([])
  const [pccOptions, setPccOptions] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WebServiceRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [filterPcc, setFilterPcc] = useState('all')

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setModalOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(p?.role === 'admin')
    }
    const [{ data: ws }, { data: pcc }] = await Promise.all([
      supabase.from('web_service').select('*').order('pcc').order('company_name'),
      supabase.from('pcc_list').select('pcc'),
    ])
    setRecords(ws ?? [])
    setPccOptions(Array.from(new Set((pcc ?? []).map(p => p.pcc))).sort())
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm({ ...EMPTY, password: generateWsPassword() }); setError(''); setModalOpen(true) }
  function openEdit(row: WebServiceRow) {
    setEditing(row)
    setForm({ pcc: row.pcc, company_name: row.company_name ?? '', agent_id: row.agent_id, password: row.password, notes: row.notes ?? '', source: row.source ?? '' })
    setError(''); setModalOpen(true)
  }

  async function handleSave() {
    if (!form.pcc.trim()) { setError('PCC / OID is required.'); return }
    if (!form.agent_id.trim()) { setError('Agent ID / Web Service number is required.'); return }
    if (!form.password.trim()) { setError('Password is required.'); return }
    setSaving(true); setError('')
    const payload = {
      pcc: form.pcc.trim().toUpperCase(), company_name: form.company_name.trim() || null,
      agent_id: form.agent_id.trim(), password: form.password.trim(),
      notes: form.notes.trim() || null, source: form.source.trim() || null,
    }
    const { error: e } = editing
      ? await supabase.from('web_service').update(payload).eq('id', editing.id)
      : await supabase.from('web_service').insert(payload)
    if (e) { setError(e.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete(row: WebServiceRow) {
    if (!confirm(`Delete web service for PCC ${row.pcc} (Agent ID ${row.agent_id})? This cannot be undone.`)) return
    await supabase.from('web_service').delete().eq('id', row.id)
    fetchAll()
  }

  function toggleReveal(id: number) {
    setRevealedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = records.filter(r => {
    const matchPcc = filterPcc === 'all' || r.pcc === filterPcc
    const term = search.toLowerCase()
    const matchSearch = !term || r.pcc.toLowerCase().includes(term) || r.agent_id.toLowerCase().includes(term) || (r.company_name ?? '').toLowerCase().includes(term)
    return matchPcc && matchSearch
  })

  const distinctPccs = new Set(records.map(r => r.pcc)).size

  const inpDark = (extra?: object) => ({ padding:'9px 12px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', width:'100%', boxSizing:'border-box' as const, ...extra })
  const lblDark = { fontSize:'12px', fontWeight:700, color:D.fgMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em', marginBottom:'6px', display:'block' as const }

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>Web Service List</h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'5px'}}>Web service credentials by PCC / OID</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Web Service
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'16px', marginBottom:'22px'}}>
          {[
            { label: 'Total Web Services', value: records.length, color: D.accent, soft: D.accentSoft },
            { label: 'Distinct PCCs', value: distinctPccs, color: D.purple, soft: D.purpleSoft },
          ].map(s => (
            <div key={s.label} style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'8px', padding:'14px 18px'}}>
              <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'22px', fontWeight:700, color:s.color}}>{s.value}</div>
              <div style={{fontSize:'12px', color:D.fgMuted, marginTop:'3px'}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'18px', flexWrap:'wrap'}}>
          <div style={{position:'relative', flex:'1 1 240px'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'13px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search PCC, Agent ID, or company..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%', padding:'9px 14px 9px 38px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, outline:'none', boxSizing:'border-box'}} />
          </div>
          <select value={filterPcc} onChange={e => setFilterPcc(e.target.value)}
            style={{padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.card, color:D.fg, cursor:'pointer', outline:'none', minWidth:'140px'}}>
            <option value="all">All PCC / OID</option>
            {Array.from(new Set(records.map(r => r.pcc))).sort().map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{textAlign:'center', padding:'60px', color:D.fgMuted, fontSize:'14px'}}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'14px'}}>
            {search || filterPcc !== 'all' ? 'No web services match your filters.' : 'No web services configured yet.'}
          </div>
        ) : (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', minWidth:'900px'}}>
              <thead>
                <tr>
                  {['PCC / OID', 'Company', 'Agent ID / WS', 'Password', 'Notes', 'Actions'].map((h, i) => (
                    <th key={h} style={{padding:'12px 16px', fontSize:'13px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign: i === 5 ? 'right' : 'left', borderBottom:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const revealed = revealedIds.has(row.id)
                  return (
                    <tr key={row.id} style={{borderBottom: i < filtered.length - 1 ? `1px solid ${D.border}` : 'none', transition:'background 0.15s'}}
                      onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{padding:'12px 16px', fontFamily:'monospace', fontWeight:600, color:D.fg, fontSize:'14px'}}>{row.pcc}</td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted}}>{row.company_name ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px', fontFamily:'monospace', fontSize:'13px', color:D.fgMuted}}>{row.agent_id}</td>
                      <td style={{padding:'12px 16px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <span style={{fontFamily:'monospace', fontSize:'13px', color:D.accent, fontWeight:600}}>
                            {revealed ? row.password : '•'.repeat(Math.min(row.password.length, 10))}
                          </span>
                          <button onClick={() => toggleReveal(row.id)}
                            style={{background:'none', border:'none', color:D.fgDim, cursor:'pointer', padding:'2px', display:'flex'}}
                            title={revealed ? 'Hide' : 'Show'}>
                            {revealed ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td style={{padding:'12px 16px', fontSize:'13px', color:D.fgMuted}}>{row.notes ?? <span style={{color:D.fgDim}}>—</span>}</td>
                      <td style={{padding:'12px 16px'}}>
                        {isAdmin && (
                          <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                            <button onClick={() => openEdit(row)}
                              style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                              onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                              Edit
                            </button>
                            <button onClick={() => handleDelete(row)}
                              style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                              onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                              onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{padding:'12px 16px', borderTop:`1px solid ${D.border}`, background:'rgba(0,0,0,0.1)', fontSize:'13px', color:D.fgDim}}>
              {filtered.length} of {records.length} web service{records.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px'}}
            onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div style={{width:'100%', maxWidth:'560px', maxHeight:'90vh', overflowY:'auto', background:D.card, border:`1px solid ${D.accent}`, borderRadius:'14px', padding:'22px', boxShadow:`0 20px 60px rgba(0,0,0,0.4), 0 0 0 3px ${D.accentSoft}`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'18px'}}>
              <h2 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'17px', fontWeight:700, color:D.fg, margin:0}}>{editing ? 'Edit Web Service' : 'Add Web Service'}</h2>
              <button onClick={() => setModalOpen(false)} style={{background:'none', border:'none', color:D.fgDim, fontSize:'18px', cursor:'pointer'}}>✕</button>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>PCC / OID <span style={{color:D.danger}}>*</span></label>
              <AutocompleteInput value={form.pcc} onChange={v => setForm(f => ({ ...f, pcc: v }))} options={pccOptions} placeholder="e.g. B7Y8" />
              <p style={{fontSize:'11px', color:D.fgDim, marginTop:'4px'}}>Sourced from GDS Access Record — type to search existing PCCs</p>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Company Name</label>
              <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. Forecepts New System" style={inpDark()} />
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', marginBottom:'14px'}}>
              <div>
                <label style={lblDark}>Agent ID / Web Service <span style={{color:D.danger}}>*</span></label>
                <input type="text" value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))} placeholder="e.g. 935028" style={{...inpDark(), fontFamily:'monospace'}} />
              </div>
              <div>
                <label style={lblDark}>Source / System</label>
                <input type="text" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Automation Hub" style={inpDark()} />
              </div>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={lblDark}>Password <span style={{color:D.danger}}>*</span></label>
              <div style={{display:'flex', gap:'8px'}}>
                <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="e.g. WS258022" style={{...inpDark(), fontFamily:'monospace'}} />
                <button type="button" onClick={() => setForm(f => ({ ...f, password: generateWsPassword() }))}
                  style={{display:'flex', alignItems:'center', gap:'6px', padding:'0 14px', background:D.accentSoft, border:`1px solid ${D.accent}`, borderRadius:'8px', color:D.accent, fontSize:'13px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap'}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  Generate
                </button>
              </div>
              <p style={{fontSize:'11px', color:D.fgDim, marginTop:'4px'}}>Generates in the WS + 6-digit format. Still editable if you need a different one.</p>
            </div>

            <div style={{marginBottom:'18px'}}>
              <label style={lblDark}>Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. PCC Cert, Prod, Cert" style={inpDark()} />
            </div>

            {error && <p style={{fontSize:'13px', color:D.danger, marginBottom:'12px'}}>{error}</p>}
            <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
              <button onClick={() => setModalOpen(false)} style={{padding:'9px 18px', fontSize:'14px', fontWeight:600, background:'transparent', border:`1px solid ${D.border}`, borderRadius:'8px', color:D.fgMuted, cursor:'pointer'}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{padding:'9px 20px', fontSize:'14px', fontWeight:600, background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', color:'#fff', cursor:'pointer', opacity:saving?0.6:1}}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Web Service'}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
