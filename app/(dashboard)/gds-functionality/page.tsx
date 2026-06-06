'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'
import type { GDSFeature, GDS } from '@/types'

const GDS_COLORS: Record<string, { badge: string; row: string; btn: string }> = {
  Sabre:      { badge: 'bg-blue-50 text-blue-700 border-blue-200',         row: 'border-blue-100',    btn: 'bg-blue-500 hover:bg-blue-600'     },
  Amadeus:    { badge: 'bg-purple-50 text-purple-700 border-purple-200',   row: 'border-purple-100',  btn: 'bg-purple-500 hover:bg-purple-600' },
  Travelport: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',row: 'border-emerald-100', btn: 'bg-emerald-500 hover:bg-emerald-600'},
}
const GDS_CHECK_COLORS: Record<string, string> = {
  Sabre: 'accent-blue-500', Amadeus: 'accent-purple-500', Travelport: 'accent-emerald-500',
}

const BILLING_CYCLES = [
  { value: 'monthly',         label: 'Per Month'       },
  { value: 'yearly',          label: 'Per Year'        },
  { value: 'per_user',        label: 'Per User'        },
  { value: 'per_transaction', label: 'Per Transaction' },
  { value: 'one_time',        label: 'One-Time'        },
]
const CURRENCIES = ['USD', 'MYR', 'EUR', 'GBP', 'SGD']

function fmtCost(cost: number, currency: string, cycle: string) {
  if (!cost) return null
  const amt = new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
  const s: Record<string, string> = { monthly: '/mo', yearly: '/yr', per_user: '/user', per_transaction: '/txn', one_time: '' }
  return `${amt}${s[cycle] ?? ''}`
}

interface FeatureWithGDS extends GDSFeature { gds?: GDS }

// ── ADD form: one name, multiple GDS ──────────────────────────
const ADD_EMPTY = { label: '', selectedGDS: new Set<number>() }

// ── EDIT form: single GDS entry ───────────────────────────────
const EDIT_EMPTY = { label: '', cost: '0', currency: 'USD', billing_cycle: 'monthly' }

export default function GDSFunctionalityPage() {
  const supabase = createClient()
  const [features, setFeatures] = useState<FeatureWithGDS[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterGDS, setFilterGDS] = useState('all')

  // ADD modal — one name, tick GDS
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(ADD_EMPTY)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // EDIT modal — single feature row
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FeatureWithGDS | null>(null)
  const [editForm, setEditForm] = useState(EDIT_EMPTY)
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
    const [{ data: featureData }, { data: gdsData }] = await Promise.all([
      supabase.from('gds_features').select('*, gds:gds_id(id, name)').order('label'),
      supabase.from('gds').select('*').order('name'),
    ])
    setFeatures(featureData ?? [])
    setGdsList(gdsData ?? [])
    setLoading(false)
  }

  // ── ADD handlers ──────────────────────────────────────────────
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

  // ── EDIT handlers (per individual GDS row) ────────────────────
  function openEdit(f: FeatureWithGDS) {
    setEditTarget(f)
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
      .update({ label: editForm.label.trim(), key, cost: costValue, currency: editForm.currency, billing_cycle: editForm.billing_cycle })
      .eq('id', editTarget.id)
    if (err) { setEditError(err.message); setEditSaving(false); return }
    setEditSaving(false); setEditOpen(false); fetchAll()
  }

  // ── DELETE ────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteSaving(true)
    await supabase.from('gds_features').delete().eq('id', deleteTarget.id)
    setDeleteSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── DISPLAY: group by GDS then sort by label ──────────────────
  const filtered = filterGDS === 'all'
    ? features
    : features.filter(f => String(f.gds_id) === filterGDS)

  const grouped = gdsList.map(gds => ({
    gds,
    features: filtered.filter(f => f.gds_id === gds.id).sort((a, b) => a.label.localeCompare(b.label)),
  })).filter(g => filterGDS === 'all' || String(g.gds.id) === filterGDS)

  const editGdsName = editTarget ? (editTarget.gds as GDS)?.name ?? '' : ''

  return (
    <div>
      <PageHeader
        title="GDS Functionality"
        description="Master list of features available per GDS platform"
        action={isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Feature
          </button>
        )}
      />

      {/* Filter */}
      <div className="flex items-center gap-3 mb-5">
        <select value={filterGDS} onChange={e => setFilterGDS(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400">
          <option value="all">All GDS</option>
          {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
        {!loading && <span className="text-xs text-slate-400">{filtered.length} feature{filtered.length !== 1 ? 's' : ''}</span>}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
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
                      const costStr = fmtCost(f.cost, f.currency, f.billing_cycle as string)
                      const cycleLabel = BILLING_CYCLES.find(c => c.value === f.billing_cycle)?.label ?? ''
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

      {/* ── ADD Modal — one name, tick GDS ── */}
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
                    {checked && <span className="ml-auto text-xs opacity-60">✓</span>}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-slate-400 mt-2">Cost and billing can be set per GDS after adding.</p>
          </div>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={addSaving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{addSaving ? 'Adding…' : 'Add Feature'}</button>
          </div>
        </div>
      </Modal>

      {/* ── EDIT Modal — per GDS row ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${editTarget?.label ?? ''}`} size="sm">
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
              {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {editError && <p className="text-sm text-red-500">{editError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setEditOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleEdit} disabled={editSaving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{editSaving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </Modal>

      {/* ── DELETE Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Feature" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 font-medium">⚠️ Warning</p>
            <p className="text-sm text-amber-600 mt-1">
              Delete <strong>{deleteTarget?.label}</strong> for <strong>{(deleteTarget?.gds as GDS)?.name}</strong>? This will also remove it from PCC assignments.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={deleteSaving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{deleteSaving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
