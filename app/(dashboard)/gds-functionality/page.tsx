'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { GDSFeature, GDS } from '@/types'


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




const GDS_COLORS: Record<string, { badge: string; row: string; btn: string }> = {
  Sabre:      { badge: 'bg-blue-50 text-blue-700 border-blue-200',         row: 'border-blue-100',    btn: 'bg-blue-500 hover:bg-blue-600'     },
  Amadeus:    { badge: 'bg-purple-50 text-purple-700 border-purple-200',   row: 'border-purple-100',  btn: 'bg-purple-500 hover:bg-purple-600' },
  Travelport: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',row: 'border-emerald-100', btn: 'bg-emerald-500 hover:bg-emerald-600'},
}
const GDS_CHECK_COLORS: Record<string, string> = {
  Sabre: 'accent-blue-500', Amadeus: 'accent-purple-500', Travelport: 'accent-emerald-500',
}

interface BillingCycle { id: number; value: string; label: string; sort_order: number }
const CURRENCIES = ['USD', 'MYR', 'EUR', 'GBP', 'SGD']

function fmtCost(cost: number, currency: string, cycle: string, cycles: {value:string;label:string}[]) {
  if (!cost) return null
  const amt = new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
  const cycleLabel = cycles.find(c => c.value === cycle)?.label ?? ''
  return cycleLabel && cycleLabel !== 'One-Time' ? `${amt} / ${cycleLabel}` : amt
}

interface PricingTier {
  sort_order: number
  tier: string
  price: number
  currency: string
  unit: string
  billing: string
}

interface FeatureWithGDS extends GDSFeature {
  gds?: GDS
  pricing_tiers?: PricingTier[] | null
}

//  ADD form: one name, multiple GDS 
const ADD_EMPTY = { label: '', selectedGDS: new Set<number>() }

//  EDIT form: single GDS entry 
const EDIT_EMPTY = { label: '', cost: '0', currency: 'USD', billing_cycle: 'monthly' }
const PRICING_TIER_EMPTY: PricingTier = { sort_order: 0, tier: '', price: 0, currency: 'MYR', unit: 'Per Customer', billing: 'Per month' }

export default function GDSFunctionalityPage() {
  const supabase = createClient()
  const [features, setFeatures] = useState<FeatureWithGDS[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [billingCycles, setBillingCycles] = useState<BillingCycle[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterGDS, setFilterGDS] = useState('all')

  // ADD modal  one name, tick GDS
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(ADD_EMPTY)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // EDIT modal  single feature row
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FeatureWithGDS | null>(null)
  const [editForm, setEditForm] = useState(EDIT_EMPTY)
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([])
  const [showPricingTiers, setShowPricingTiers] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // DELETE modal
  const [deleteTarget, setDeleteTarget] = useState<FeatureWithGDS | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(prof?.role === 'admin')
    }
    const [{ data: featureData }, { data: gdsData }, { data: cycleData }] = await Promise.all([
      supabase.from('gds_features').select('*, gds:gds_id(id, name), pricing_tiers').order('label'),
      supabase.from('gds').select('*').order('name'),
      supabase.from('billing_cycles').select('*').order('sort_order'),
    ])
    setFeatures(featureData ?? [])
    setGdsList(gdsData ?? [])
    setBillingCycles(cycleData ?? [])
    setLoading(false)
  }

  //  ADD handlers 
  function openAdd() {
    setAddForm({ label: '', selectedGDS: new Set() })
    setAddError(''); setAddSaving(false); setAddOpen(true)
  }

  function toggleAddGDS(gdsId: number) {
    setAddForm(f => {
      const next = new Set(f.selectedGDS)
      next.has(gdsId) ? next.delete(gdsId) : next.add(gdsId)
      return { ...f, selectedGDS: next }
    })
  }

  async function handleAdd() {
    if (!addForm.label.trim()) { setAddError('Feature name is required.'); return }
    if (addForm.selectedGDS.size === 0) { setAddError('Select at least one GDS.'); return }
    setAddSaving(true); setAddError('')
    const key = addForm.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    for (const gdsId of addForm.selectedGDS) {
      const { error: err } = await supabase.from('gds_features')
        .insert({ gds_id: gdsId, label: addForm.label.trim(), key, cost: 0, currency: 'USD', billing_cycle: 'monthly' })
      if (err) { setAddError(err.message); setAddSaving(false); return }
    }
    setAddSaving(false); setAddOpen(false); fetchAll()
  }

  //  EDIT handlers (per individual GDS row) 
  function openEdit(f: FeatureWithGDS) {
    setEditTarget(f)
    setPricingTiers(f.pricing_tiers ?? [])
    setShowPricingTiers((f.pricing_tiers ?? []).length > 0)
    setEditForm({
      label:         f.label,
      cost:          f.cost != null ? String(f.cost) : '0',
      currency:      f.currency ?? 'USD',
      billing_cycle: (f.billing_cycle as string) ?? 'monthly',
    })
    setEditError(''); setEditSaving(false); setEditOpen(true)
  }

  async function handleEdit() {
    if (!editTarget) return
    if (!editForm.label.trim()) { setEditError('Feature name is required.'); return }
    setEditSaving(true); setEditError('')
    const rawCost = String(editForm.cost).trim()
    const cost = rawCost === '' ? 0 : parseFloat(rawCost)
    const costValue = isNaN(cost) || cost < 0 ? 0 : cost
    // Only regenerate key if label changed; otherwise keep existing to avoid constraint errors
    const labelChanged = editForm.label.trim().toLowerCase() !== editTarget.label.trim().toLowerCase()
    const key = labelChanged
      ? editForm.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
      : editTarget.key
    const { error: err } = await supabase.from('gds_features')
      .update({ label: editForm.label.trim(), key, cost: costValue, currency: editForm.currency, billing_cycle: editForm.billing_cycle, pricing_tiers: showPricingTiers && pricingTiers.length > 0 ? pricingTiers : null })
      .eq('id', editTarget.id)
    if (err) { setEditError(err.message); setEditSaving(false); return }
    setEditSaving(false); setEditOpen(false); fetchAll()
  }

  //  DELETE 
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteSaving(true)
    await supabase.from('gds_features').delete().eq('id', deleteTarget.id)
    setDeleteSaving(false); setDeleteOpen(false); fetchAll()
  }

  //  DISPLAY: group by GDS then sort by label 
  const filtered = filterGDS === 'all'
    ? features
    : features.filter(f => String(f.gds_id) === filterGDS)

  const grouped = gdsList.map(gds => ({
    gds,
    features: filtered.filter(f => f.gds_id === gds.id).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter(g => filterGDS === 'all' || String(g.gds.id) === filterGDS)

  const editGdsName = editTarget ? (editTarget.gds as GDS)?.name ?? '' : ''

  const sabreCount = features.filter(r=>(r.gds as {name?:string})?.name==='Sabre').length
  const amadeusCount = features.filter(r=>(r.gds as {name?:string})?.name==='Amadeus').length
  const tpCount = features.filter(r=>(r.gds as {name?:string})?.name==='Travelport').length

  return (
    <div style={{fontFamily:'Inter, system-ui, sans-serif', background:T.surface, minHeight:'100vh'}}>
      {/* Header */}
      <div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:'20px 28px',marginBottom:'24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h1 style={{fontSize:'24px',fontWeight:800,color:T.text,margin:0,letterSpacing:'-0.025em'}}>GDS Functionality</h1>
            <p style={{fontSize:'13px',color:T.textMid,marginTop:'3px'}}>Master list of features available per GDS platform</p>
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{display:'flex',alignItems:'center',gap:'7px',padding:'10px 22px',background:T.primary,border:'none',borderRadius:T.radius,fontSize:'17px',fontWeight:700,color:'white',cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Feature
            </button>
          )}
        </div>
      </div>
      <div style={{padding:'0 28px 28px'}}>
        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'14px',marginBottom:'24px'}}>
          {[{label:'Sabre Features',value:sabreCount,bg:'#eff6ff',color:'#1d4ed8',border:'#bfdbfe'},{label:'Amadeus Features',value:amadeusCount,bg:'#faf5ff',color:'#7c3aed',border:'#ddd6fe'},{label:'Travelport Features',value:tpCount,bg:'#f0fdf4',color:'#166534',border:'#bbf7d0'}].map((s,i)=>(
            <div key={i} style={{background: i===2?T.primary:'white',border:`1px solid ${i===2?T.primary:T.border}`,borderRadius:T.radius,padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:i===2?'rgba(255,255,255,0.75)':T.textLight,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:'6px'}}>{s.label}</div>
              <div style={{fontSize:'28px',fontWeight:800,color:i===2?'white':T.text,letterSpacing:'-0.03em',lineHeight:1}}>{s.value}</div>
            </div>
          ))}
        </div>
        {/* Filter */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:T.radius,padding:'12px 16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'10px'}}>
          <select value={filterGDS} onChange={e => setFilterGDS(e.target.value)}
            style={{padding:'8px 12px',fontSize:'13px',border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.text,outline:'none',cursor:'pointer'}}>
            <option value="all">All GDS</option>
            {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
          {!loading && <span style={{fontSize:'17px',color:'#065F46',fontWeight:600}}>{filtered.length} feature{filtered.length !== 1 ? 's' : ''}</span>}
        </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ gds, features: gdsFeatures }) => {
            const colors = GDS_COLORS[gds.name] ?? { badge: 'bg-slate-100 text-slate-600 border-slate-200', row: 'border-slate-100', btn: 'bg-slate-500 hover:bg-slate-600' }
            return (
              <div key={gds.id}>
                {/* GDS section header */}
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${colors.badge}`}>{gds.name}</span>
                  <span className="text-xs text-slate-400">{gdsFeatures.length} feature{gdsFeatures.length !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {gdsFeatures.length === 0 ? (
                  <p className="text-sm text-slate-400 italic pl-1 py-2">No features yet for {gds.name}.</p>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {gdsFeatures.map((f, i) => {
                      const costStr = fmtCost(f.cost, f.currency, f.billing_cycle as string, billingCycles)
                      const cycleLabel = billingCycles.find(c => c.value === f.billing_cycle)?.label ?? ''
                      return (
                        <div key={f.id} className={`flex items-center justify-between px-5 py-3.5 ${i < gdsFeatures.length - 1 ? `border-b ${colors.row}` : ''}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex-shrink-0">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-800">{f.label}</p>
                              <p className="text-xs text-slate-400 font-mono">{f.key}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6 flex-shrink-0">
                            <div className="text-right">
                              {costStr
                                ? <><p className="text-sm font-medium text-slate-700">{costStr}</p><p className="text-xs text-slate-400">{cycleLabel}</p></>
                                : <p className="text-sm text-slate-300">No cost</p>}
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1.5">
                                <button onClick={() => openEdit(f)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">Edit</button>
                                <button onClick={() => { setDeleteTarget(f); setDeleteOpen(true) }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium">Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/*  ADD Modal  one name, tick GDS  */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Feature" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Feature Name <span className="text-red-500">*</span></label>
            <input type="text" value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Booking, NDC, Ticketing" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Apply to GDS <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {gdsList.map(gds => {
                const colors = GDS_COLORS[gds.name]
                const checked = addForm.selectedGDS.has(gds.id)
                return (
                  <label key={gds.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${checked ? `${colors?.badge ?? 'bg-slate-50 text-slate-700 border-slate-200'}` : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAddGDS(gds.id)} className={`w-4 h-4 rounded ${GDS_CHECK_COLORS[gds.name] ?? 'accent-blue-500'}`} />
                    <span className="text-sm font-medium">{gds.name}</span>
                    {checked && <span className="ml-auto text-xs opacity-60"></span>}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-slate-400 mt-2">Cost and billing can be set per GDS after adding.</p>
          </div>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleAdd} disabled={addSaving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{addSaving ? 'Adding' : 'Add Feature'}</button>
          </div>
        </div>
      </Modal>

      {/*  EDIT Modal  per GDS row  */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit  ${editTarget?.label ?? ''}`} size="sm">
        <div className="space-y-4">
          {editGdsName && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${GDS_COLORS[editGdsName]?.badge ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{editGdsName}</span>
              <span className="text-xs text-slate-400">editing this GDS only</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Feature Name <span className="text-red-500">*</span></label>
            <input type="text" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cost</label>
              <input type="number" min="0" step="0.01" value={editForm.cost} onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
              <select value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Billing Cycle</label>
            <select value={editForm.billing_cycle} onChange={e => setEditForm(f => ({ ...f, billing_cycle: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value=""> None </option>
              {billingCycles.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {/* ── Pricing Tiers ── */}
          <div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
              <label className="block text-sm font-medium text-slate-700">Pricing Tiers</label>
              <button type="button" onClick={() => setShowPricingTiers(v => !v)}
                style={{fontSize:'12px', color:T.primary, background:'none', border:`1px solid ${T.border}`, borderRadius:'6px', padding:'3px 10px', cursor:'pointer', fontWeight:600}}>
                {showPricingTiers ? 'Hide' : '+ Add Tiers'}
              </button>
            </div>
            {showPricingTiers && (
              <div style={{border:`1px solid ${T.border}`, borderRadius:'8px', overflow:'hidden'}}>
                {/* Header */}
                <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', background:'#F0FDF4', borderBottom:`1px solid #6EE7B7`, padding:'7px 10px'}}>
                  {['Contracted Price Item','Currency','Market Price'].map(h => (
                    <div key={h} style={{fontSize:'11px', fontWeight:700, color:'#065F46', textTransform:'uppercase', letterSpacing:'0.05em', borderRight:'1px solid #d1fae5'}}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {pricingTiers.map((tier, i) => (
                  <div key={i} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'4px', padding:'6px 10px', borderBottom:`1px solid ${T.border}`, alignItems:'center', background: i%2===0 ? 'white' : '#F8FAFC'}}>
                    <input value={tier.tier} onChange={e => setPricingTiers(ts => ts.map((t,j) => j===i ? {...t, tier:e.target.value} : t))}
                      style={{fontSize:'12px', padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:'4px', width:'100%', outline:'none'}} placeholder="e.g. Up to 5K/year" />
                    <input value={tier.currency} onChange={e => setPricingTiers(ts => ts.map((t,j) => j===i ? {...t, currency:e.target.value} : t))}
                      style={{fontSize:'12px', padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:'4px', width:'100%', outline:'none'}} placeholder="MYR" />
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
                      <input type="number" value={tier.price} onChange={e => setPricingTiers(ts => ts.map((t,j) => j===i ? {...t, price:Number(e.target.value)} : t))}
                        style={{fontSize:'12px', padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:'4px', flex:1, outline:'none'}} />
                      <button type="button" onClick={() => setPricingTiers(ts => ts.filter((_,j) => j!==i))}
                        style={{fontSize:'14px', color:'#EF4444', background:'none', border:'none', cursor:'pointer', padding:'0 2px', lineHeight:1}}>×</button>
                    </div>
                  </div>
                ))}
                {/* Add row button */}
                <div style={{padding:'6px 10px', background:'white'}}>
                  <button type="button"
                    onClick={() => setPricingTiers(ts => [...ts, {...PRICING_TIER_EMPTY, sort_order: ts.length+1}])}
                    style={{fontSize:'12px', color:T.primary, background:'none', border:`1px dashed ${T.primary}`, borderRadius:'6px', padding:'4px 12px', cursor:'pointer', width:'100%', fontWeight:600}}>
                    + Add Row
                  </button>
                </div>
              </div>
            )}
          </div>
          {editError && <p className="text-sm text-red-500">{editError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleEdit} disabled={editSaving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.primary,color:"white",cursor:"pointer"}}>{editSaving ? 'Saving' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>

      {/*  DELETE Modal  */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Feature" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 font-medium"> Warning</p>
            <p className="text-sm text-amber-600 mt-1">
              Delete <strong>{deleteTarget?.label}</strong> for <strong>{(deleteTarget?.gds as GDS)?.name}</strong>? This will also remove it from PCC assignments.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} style={{flex:1,padding:"9px",fontSize:"13px",border:`1px solid ${T.border}`,borderRadius:T.radius,background:T.card,color:T.textMid,cursor:"pointer"}}>Cancel</button>
            <button onClick={handleDelete} disabled={deleteSaving} style={{flex:1,padding:"9px",fontSize:"13px",fontWeight:700,border:"none",borderRadius:T.radius,background:T.danger,color:"white",cursor:"pointer"}}>{deleteSaving ? 'Deleting' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}
