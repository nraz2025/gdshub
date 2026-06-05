'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'
import type { GDSFeature, GDS } from '@/types'

const GDS_COLORS: Record<string, { badge: string; row: string; btn: string }> = {
  Sabre:      { badge: 'bg-blue-50 text-blue-700 border-blue-200',       row: 'border-blue-100',   btn: 'bg-blue-500 hover:bg-blue-600'     },
  Amadeus:    { badge: 'bg-purple-50 text-purple-700 border-purple-200', row: 'border-purple-100', btn: 'bg-purple-500 hover:bg-purple-600' },
  Travelport: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', row: 'border-emerald-100', btn: 'bg-emerald-500 hover:bg-emerald-600' },
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
  if (!cost) return '—'
  const amount = new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cost)
  const suffix = BILLING_CYCLES.find(c => c.value === cycle)?.label ?? ''
  return cycle === 'one_time' ? amount : `${amount} / ${suffix}`
}

interface FeatureWithGDS extends GDSFeature { gds?: GDS }

export default function GDSFunctionalityPage() {
  const supabase = createClient()
  const [features, setFeatures] = useState<FeatureWithGDS[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterGDS, setFilterGDS] = useState('all')

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FeatureWithGDS | null>(null)
  const [form, setForm] = useState({ gds_id: '' as number | '', label: '', cost: '0', currency: 'USD', billing_cycle: 'monthly' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Delete modal
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

  function openAdd() {
    setEditing(null)
    setForm({ gds_id: '', label: '', cost: '0', currency: 'USD', billing_cycle: 'monthly' })
    setError('')
    setModalOpen(true)
  }

  function openEdit(f: FeatureWithGDS) {
    setEditing(f)
    setForm({ gds_id: f.gds_id ?? '', label: f.label, cost: String(f.cost ?? 0), currency: f.currency ?? 'USD', billing_cycle: (f.billing_cycle as string) ?? 'monthly' })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.gds_id) { setError('Please select a GDS.'); return }
    if (!form.label.trim()) { setError('Feature name is required.'); return }
    const cost = parseFloat(form.cost) || 0
    const key = form.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    setSaving(true); setError('')
    const payload = { gds_id: form.gds_id, label: form.label.trim(), key, cost, currency: form.currency, billing_cycle: form.billing_cycle }
    const { error: err } = editing
      ? await supabase.from('gds_features').update(payload).eq('id', editing.id)
      : await supabase.from('gds_features').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleteSaving(true)
    await supabase.from('gds_features').delete().eq('id', deleteTarget.id)
    setDeleteSaving(false); setDeleteOpen(false); fetchAll()
  }

  const filtered = features.filter(f => filterGDS === 'all' || String(f.gds_id) === filterGDS)

  // Group by GDS
  const grouped = gdsList.map(gds => ({
    gds,
    features: filtered.filter(f => f.gds_id === gds.id),
  }))

  return (
    <div>
      <PageHeader
        title="GDS Functionality"
        description="Master list of features available per GDS — assign directly to PCCs in GDS Information"
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
            if (filterGDS !== 'all' && String(gds.id) !== filterGDS) return null
            return (
              <div key={gds.id}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${colors.badge}`}>{gds.name}</span>
                  <span className="text-xs text-slate-400">{gdsFeatures.length} feature{gdsFeatures.length !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {gdsFeatures.length === 0 ? (
                  <p className="text-sm text-slate-400 italic pl-1 py-2">No features yet. Click Add Feature to add one.</p>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {gdsFeatures.map((f, i) => (
                      <div key={f.id} className={`flex items-center justify-between px-5 py-3.5 ${i < gdsFeatures.length - 1 ? `border-b ${colors.row}` : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex-shrink-0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                          </span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{f.label}</p>
                            <p className="text-xs text-slate-400 font-mono">{f.key}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-medium text-slate-600">
                            {f.cost > 0 ? fmtCost(f.cost, f.currency, f.billing_cycle as string) : <span className="text-slate-300">No cost</span>}
                          </span>
                          {isAdmin && (
                            <div className="flex gap-1.5">
                              <button onClick={() => openEdit(f)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-medium">Edit</button>
                              <button onClick={() => { setDeleteTarget(f); setDeleteOpen(true) }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium">Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit — ${editing.label}` : 'Add Feature'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS <span className="text-red-500">*</span></label>
            <select value={form.gds_id} onChange={e => setForm(f => ({ ...f, gds_id: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— Select GDS —</option>
              {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Feature Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Booking, NDC, Ticketing" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cost</label>
              <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Billing Cycle</label>
            <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Feature'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Feature" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 font-medium">⚠️ Warning</p>
            <p className="text-sm text-amber-600 mt-1">Deleting <strong>{deleteTarget?.label}</strong> will also remove it from all PCC assignments in GDS Information.</p>
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
