'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { useAppContext } from '@/lib/context/AppContext'

const GDS_NAME = 'Sabre'

interface PricingItem {
  id: number
  gds_id: number | null
  product: string
  provider: string | null
  price_item: string | null
  unit_of_measure: string | null
  list_price: number | null
  discount_pct: number | null
  customer_price: number | null
  currency: string
  billing_frequency: string | null
  billing_conditions: string | null
  effective_date: string | null
  status: 'Active' | 'Inactive'
  sort_order: number
  created_at: string
}

// Dark theme (matches the rest of GDSHub's GDS-group pages)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#f78166', accentSoft: 'rgba(247,129,102,0.10)', titleColor: '#ffc4b0',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
}

const EMPTY_FORM = {
  product: '',
  provider: '',
  price_item: '',
  unit_of_measure: '',
  list_price: '',
  discount_pct: '0',
  customer_price: '',
  currency: 'MYR',
  billing_frequency: '',
  billing_conditions: '',
  effective_date: '',
  status: 'Active' as 'Active' | 'Inactive',
}

function fmtMoney(n: number | null, currency: string) {
  if (n === null || n === undefined) return ''
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currency || 'MYR', minimumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Reading order within a product's tiers: Setup first, then recurring/monthly
// fees, then everything else in the order it was added.
function priceItemRank(item: string | null): number {
  const s = (item ?? '').toLowerCase()
  if (s.includes('setup')) return 0
  if (s.includes('monthly') || s.includes('per month')) return 1
  return 2
}

export default function PricingSabrePage() {
  const supabase = createClient()
  const { canManage: isAdmin, isAdmin: canEdit } = useAppContext()   // isAdmin = can view (admin or manager), canEdit = can add/edit/delete (admin only)

  const [gdsId, setGdsId] = useState<number | null>(null)
  const [records, setRecords] = useState<PricingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'Active' | 'Inactive'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PricingItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: gds } = await supabase.from('gds').select('id, name').eq('name', GDS_NAME).maybeSingle()
    const id = gds?.id ?? null
    setGdsId(id)
    if (id) {
      const { data } = await supabase.from('pricing').select('*').eq('gds_id', id)
        .order('sort_order').order('product').order('price_item')
      setRecords((data as PricingItem[]) ?? [])
    } else {
      setRecords([])
    }
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  function openEdit(row: PricingItem) {
    setEditing(row)
    setForm({
      product: row.product,
      provider: row.provider ?? '',
      price_item: row.price_item ?? '',
      unit_of_measure: row.unit_of_measure ?? '',
      list_price: row.list_price?.toString() ?? '',
      discount_pct: row.discount_pct?.toString() ?? '0',
      customer_price: row.customer_price?.toString() ?? '',
      currency: row.currency ?? 'MYR',
      billing_frequency: row.billing_frequency ?? '',
      billing_conditions: row.billing_conditions ?? '',
      effective_date: row.effective_date ?? '',
      status: row.status ?? 'Active',
    })
    setError('')
    setModalOpen(true)
  }

  function openDelete(row: PricingItem) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.product.trim()) { setError('Product name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      gds_id: gdsId,
      product: form.product.trim(),
      provider: form.provider.trim() || null,
      price_item: form.price_item.trim() || null,
      unit_of_measure: form.unit_of_measure.trim() || null,
      list_price: form.list_price ? Number(form.list_price) : null,
      discount_pct: form.discount_pct ? Number(form.discount_pct) : 0,
      customer_price: form.customer_price ? Number(form.customer_price) : null,
      currency: form.currency.trim() || 'MYR',
      billing_frequency: form.billing_frequency.trim() || null,
      billing_conditions: form.billing_conditions.trim() || null,
      effective_date: form.effective_date || null,
      status: form.status,
      modified_at: new Date().toISOString(),
    }
    const { error: err } = editing
      ? await supabase.from('pricing').update(payload).eq('id', editing.id)
      : await supabase.from('pricing').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('pricing').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    const matchesSearch = !term || r.product.toLowerCase().includes(term) || (r.price_item ?? '').toLowerCase().includes(term)
    if (!matchesSearch) return false
    if (filterStatus === 'all') return true
    return r.status === filterStatus
  })

  // Group by product so a product with several price items (tiers) — e.g.
  // "Amadeus Margin Manager" → Setup / Booking Fee / Maintenance — reads as
  // one card with its tiers listed underneath, instead of the product name
  // repeating on every flat row.
  const grouped = filtered.reduce((acc, r) => {
    (acc[r.product] = acc[r.product] ?? []).push(r)
    return acc
  }, {} as Record<string, PricingItem[]>)
  const productNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b))

  return (
    <div style={{fontFamily:"'DM Sans', Inter, system-ui, sans-serif", background:D.bg, minHeight:'100vh', color:D.fg}}>
      <div style={{padding:'32px 28px 40px'}}>

        {/* Page Header */}
        <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'16px', marginBottom:'22px'}}>
          <div>
            <h1 style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'26px', fontWeight:700, letterSpacing:'-0.5px', color:D.fg, margin:0}}>
              <span style={{display:'inline-flex', alignItems:'center', fontSize:'15px', fontWeight:700, color:D.accent, background:D.accentSoft, border:`1px solid ${D.accent}40`, borderRadius:'8px', padding:'5px 12px', marginRight:'10px', verticalAlign:'middle'}}>Sabre</span>
              Pricing
            </h1>
            <p style={{fontSize:'13px', color:D.fgMuted, marginTop:'8px'}}>Product charges and pricing schedule</p>
          </div>
          {canEdit && (
            <button onClick={openAdd}
              style={{display:'flex', alignItems:'center', gap:'7px', padding:'9px 17px', background:D.accent, border:`1px solid ${D.accent}`, borderRadius:'8px', fontSize:'14px', fontWeight:600, color:'#fff', cursor:'pointer'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Pricing Item
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'16px', marginBottom:'18px'}}>
          <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'12px'}}>
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Search</label>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by product or price item..."
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box'}} />
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
              <label style={{fontSize:'12px', fontWeight:600, color:D.fgDim, textTransform:'uppercase', letterSpacing:'0.05em'}}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'Active' | 'Inactive')}
                style={{width:'100%', padding:'9px 14px', fontSize:'14px', border:`1.5px solid ${D.borderLight}`, borderRadius:'8px', background:D.bg, color:D.fg, outline:'none', boxSizing:'border-box', cursor:'pointer'}}>
                <option value="all">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Single table, all products — Product column merges across each product's tiers */}
        {loading ? (
          <div style={{padding:'60px', textAlign:'center', color:D.fgMuted, fontSize:'15px'}}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', padding:'48px', textAlign:'center', color:D.fgDim, fontSize:'15px'}}>
            {records.length === 0 ? 'No pricing items yet. Add the first Sabre pricing item to get started.' : 'No pricing items match your search or filter.'}
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
            <div style={{background:D.card, border:`1px solid ${D.border}`, borderRadius:'10px', overflow:'auto', boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}>
              <table style={{width:'100%', borderCollapse:'collapse', minWidth:'1240px', tableLayout:'fixed'}}>
                <colgroup>
                  <col style={{width:'220px'}} />
                  <col style={{width:'240px'}} />
                  <col style={{width:'110px'}} />
                  <col style={{width:'150px'}} />
                  <col style={{width:'110px'}} />
                  <col style={{width:'90px'}} />
                  <col style={{width:'auto'}} />
                  <col style={{width:'130px'}} />
                </colgroup>
                <thead>
                  <tr>
                    {['Product', 'Price Item', 'Unit of Measure', 'Pricing', 'Billing Frequency', 'Effective', 'Notes', 'Actions'].map((h, i) => (
                      <th key={h} style={{padding:'10px 18px', fontSize:'11.5px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:D.fgDim, textAlign: i === 7 ? 'right' : 'left', verticalAlign:'top', borderBottom:`1px solid ${D.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productNames.map((product, pi) => {
                    const tiers = [...grouped[product]].sort((a, b) => priceItemRank(a.price_item) - priceItemRank(b.price_item))
                    const isLastProduct = pi === productNames.length - 1
                    return tiers.map((r, i) => (
                      <tr key={r.id} style={{borderBottom: (isLastProduct && i === tiers.length - 1) ? 'none' : `1px solid ${D.border}`}}
                        onMouseEnter={e => (e.currentTarget.style.background = D.accentSoft)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {i === 0 && (() => {
                          const provider = tiers[0]?.provider
                          return (
                            <td rowSpan={tiers.length} style={{padding:'12px 18px', verticalAlign:'top', borderLeft:`3px solid ${D.accent}`}}>
                              <span style={{fontSize:'14px', fontWeight:400, color:D.titleColor, letterSpacing:'-0.1px', wordBreak:'break-word'}}>{product}</span>
                              {provider && provider !== GDS_NAME && (
                                <p style={{fontSize:'11px', fontWeight:600, color:D.fgMuted, margin:'6px 0 0'}}>via {provider}</p>
                              )}
                            </td>
                          )
                        })()}
                        <td style={{padding:'12px 18px', overflow:'hidden'}}>
                          <p style={{fontSize:'14px', fontWeight:400, color:D.fg, margin:0, wordBreak:'break-word'}}>{r.price_item || '—'}</p>
                        </td>
                        <td style={{padding:'12px 18px', fontSize:'13px', color:D.fgMuted}}>{r.unit_of_measure || '—'}</td>
                        <td style={{padding:'12px 18px'}}>
                          {r.customer_price !== null ? (
                            <div>
                              <p style={{fontSize:'14px', fontWeight:700, color:D.fg, margin:0}}>{fmtMoney(r.customer_price, r.currency)}</p>
                              {r.list_price !== null && r.list_price !== r.customer_price && (
                                <p style={{fontSize:'12px', color:D.fgDim, margin:'2px 0 0', textDecoration:'line-through'}}>{fmtMoney(r.list_price, r.currency)}</p>
                              )}
                              {r.discount_pct ? <span style={{fontSize:'11px', fontWeight:600, color:D.warning, background:D.warningSoft, borderRadius:'6px', padding:'1px 6px', marginLeft: r.list_price !== null && r.list_price !== r.customer_price ? '6px' : '0'}}>-{r.discount_pct}%</span> : null}
                            </div>
                          ) : <span style={{color:D.fgDim}}>—</span>}
                        </td>
                        <td style={{padding:'12px 18px', fontSize:'13px', color:D.fgMuted}}>{r.billing_frequency || '—'}</td>
                        <td style={{padding:'12px 18px', fontSize:'13px', color:D.fgMuted}}>{fmtDate(r.effective_date) || '—'}</td>
                        <td style={{padding:'12px 18px', overflow:'hidden'}}>
                          {r.billing_conditions ? (
                            <ul style={{listStyleType:'disc', listStylePosition:'outside', paddingLeft:'16px', margin:0, display:'flex', flexDirection:'column', gap:'3px'}}>
                              {r.billing_conditions.split('\n').map(l => l.trim()).filter(Boolean).map((line, li) => (
                                <li key={li} style={{fontSize:'12.5px', color:D.fgMuted, lineHeight:1.45, wordBreak:'break-word'}}>{line}</li>
                              ))}
                            </ul>
                          ) : <span style={{color:D.fgDim}}>—</span>}
                        </td>
                        <td style={{padding:'12px 18px', textAlign:'right'}}>
                          {canEdit && (
                            <div style={{display:'flex', gap:'6px', justifyContent:'flex-end'}}>
                              <button onClick={() => openEdit(r)}
                                style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                                onMouseOver={e => { e.currentTarget.style.background=D.accentSoft; e.currentTarget.style.borderColor=D.accent; e.currentTarget.style.color=D.accent }}
                                onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                                Edit
                              </button>
                              <button onClick={() => openDelete(r)}
                                style={{padding:'6px 12px', fontSize:'13px', fontWeight:600, border:`1px solid ${D.border}`, borderRadius:'6px', background:'transparent', color:D.fgMuted, cursor:'pointer'}}
                                onMouseOver={e => { e.currentTarget.style.background=D.dangerSoft; e.currentTarget.style.borderColor=D.danger; e.currentTarget.style.color=D.danger }}
                                onMouseOut={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=D.border; e.currentTarget.style.color=D.fgMuted }}>
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:'12px', color:D.fgDim, margin:0}}>{productNames.length} product{productNames.length !== 1 ? 's' : ''} · {filtered.length} pricing item{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Pricing Item' : 'Add Pricing Item'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Product <span className="text-red-500">*</span></label>
            <input type="text" value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))}
              placeholder="e.g. Sell Connect, Amadeus Margin Manager"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Provider</label>
            <input type="text" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              placeholder="e.g. Sabre, SAP Concur, i:FAO GROUP GmbH — leave blank if Sabre itself"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Price Item</label>
            <input type="text" value={form.price_item} onChange={e => setForm(f => ({ ...f, price_item: e.target.value }))}
              placeholder="e.g. Yearly Fee, Setup, Per Transaction"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Unit of Measure</label>
              <input type="text" value={form.unit_of_measure} onChange={e => setForm(f => ({ ...f, unit_of_measure: e.target.value }))}
                placeholder="e.g. Per User, Per Transaction"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Billing Frequency</label>
              <input type="text" value={form.billing_frequency} onChange={e => setForm(f => ({ ...f, billing_frequency: e.target.value }))}
                placeholder="e.g. Yearly, Per request, One-off"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">List Price</label>
              <input type="number" step="0.01" value={form.list_price} onChange={e => setForm(f => ({ ...f, list_price: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Discount %</label>
              <input type="number" step="0.01" value={form.discount_pct} onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Customer Price</label>
              <input type="number" step="0.01" value={form.customer_price} onChange={e => setForm(f => ({ ...f, customer_price: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
              <input type="text" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 uppercase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Effective Date</label>
              <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'Active' | 'Inactive' }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Billing Conditions / Notes</label>
            <textarea value={form.billing_conditions} onChange={e => setForm(f => ({ ...f, billing_conditions: e.target.value }))}
              rows={3} placeholder="Any conditions or notes about this pricing item"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Pricing Item'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Pricing Item" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete <strong>{editing?.product}</strong>{editing?.price_item ? ` — ${editing.price_item}` : ''}? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
