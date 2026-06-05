'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'
import type { GDSFeature, PCCList, GDS } from '@/types'

interface PCCFeatureRow { pcc_list_id: number; feature_id: number; gds_features?: GDSFeature }
interface PCCWithFeatures extends PCCList { pcc_features?: PCCFeatureRow[] }

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

export default function GDSInformationPage() {
  const supabase = createClient()
  const [pccList, setPccList] = useState<PCCWithFeatures[]>([])
  const [allFeatures, setAllFeatures] = useState<GDSFeature[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filterGDS, setFilterGDS] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedPCC, setExpandedPCC] = useState<number | null>(null)

  // Edit features modal
  const [editPCC, setEditPCC] = useState<PCCWithFeatures | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<number>>(new Set())
  const [toggling, setToggling] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(prof?.role === 'admin')
    }
    const [{ data: pccData }, { data: featData }, { data: gdsData }] = await Promise.all([
      supabase.from('pcc_list').select(`
        *, gds:gds_id(id, name),
        pcc_features ( pcc_list_id, feature_id, gds_features:feature_id(id, key, label, cost, currency, billing_cycle) )
      `).order('pcc'),
      supabase.from('gds_features').select('*').order('label'),
      supabase.from('gds').select('*').order('name'),
    ])
    setPccList(pccData ?? [])
    setAllFeatures(featData ?? [])
    setGdsList(gdsData ?? [])
    setLoading(false)
  }

  // ── Open Edit Modal ───────────────────────────────────────────
  function openEdit(pcc: PCCWithFeatures) {
    setEditPCC(pcc)
    const existing = new Set((pcc.pcc_features ?? []).map(pf => pf.feature_id))
    setSelectedFeatureIds(existing)
    setEditOpen(true)
  }

  // ── Toggle feature — instant save ────────────────────────────
  async function toggleFeature(featureId: number) {
    if (!editPCC || !isAdmin) return
    setToggling(true)
    const has = selectedFeatureIds.has(featureId)
    if (has) {
      await supabase.from('pcc_features').delete()
        .eq('pcc_list_id', editPCC.id).eq('feature_id', featureId)
      setSelectedFeatureIds(prev => { const s = new Set(prev); s.delete(featureId); return s })
    } else {
      await supabase.from('pcc_features').insert({ pcc_list_id: editPCC.id, feature_id: featureId })
      setSelectedFeatureIds(prev => new Set([...prev, featureId]))
    }
    setToggling(false)
    // Silently refresh pcc list to update chips
    const { data } = await supabase.from('pcc_list').select(`
      *, gds:gds_id(id, name),
      pcc_features ( pcc_list_id, feature_id, gds_features:feature_id(id, key, label, cost, currency, billing_cycle) )
    `).order('pcc')
    setPccList(data ?? [])
  }

  // ── Helpers ───────────────────────────────────────────────────
  function getFeatures(pcc: PCCWithFeatures): GDSFeature[] {
    return (pcc.pcc_features ?? []).map(pf => pf.gds_features).filter(Boolean) as GDSFeature[]
  }

  // Features available for this PCC's GDS
  function availableFeatures(pcc: PCCWithFeatures): GDSFeature[] {
    return allFeatures.filter(f => f.gds_id === pcc.gds_id)
  }

  function totalCost(features: GDSFeature[]): number {
    return features.reduce((sum, f) => sum + (f.cost ?? 0), 0)
  }

  function fmtCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
  }

  const filtered = pccList.filter(p => {
    const gdsName = (p.gds as GDS)?.name ?? ''
    const matchGDS = filterGDS === 'all' || String(p.gds_id) === filterGDS
    const matchSearch = p.pcc.toLowerCase().includes(search.toLowerCase()) || gdsName.toLowerCase().includes(search.toLowerCase())
    return matchGDS && matchSearch
  })

  const editAvailable = editPCC ? availableFeatures(editPCC) : []
  const editEnabledCount = selectedFeatureIds.size

  return (
    <div>
      <PageHeader
        title="GDS Information"
        description="Assign GDS features directly to each PCC"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search PCC…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        <select value={filterGDS} onChange={e => setFilterGDS(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400">
          <option value="all">All GDS</option>
          {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
        {!loading && <span className="text-xs text-slate-400">{filtered.length} PCC{filtered.length !== 1 ? 's' : ''}</span>}
      </div>

      {!loading && allFeatures.length === 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          ⚠️ No features found. Please add features first in <strong>GDS Functionality</strong>.
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No PCCs found. Add PCCs in PCC List first.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(pcc => {
            const gdsName = (pcc.gds as GDS)?.name ?? ''
            const features = getFeatures(pcc)
            const total = totalCost(features)
            const currency = features[0]?.currency ?? 'USD'
            const isExpanded = expandedPCC === pcc.id
            const available = availableFeatures(pcc)

            return (
              <div key={pcc.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* PCC header row */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  onClick={() => setExpandedPCC(isExpanded ? null : pcc.id)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>

                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded text-sm">{pcc.pcc}</span>

                  {gdsName && <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`}>{gdsName}</span>}
                  {pcc.status && <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[pcc.status] ?? 'bg-slate-100 text-slate-500'}`}>{pcc.status}</span>}

                  <div className="ml-auto flex items-center gap-4">
                    {features.length > 0 && (
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {features.length} feature{features.length !== 1 ? 's' : ''}
                        {total > 0 && <> · {fmtCurrency(total, currency)}</>}
                      </span>
                    )}
                    {features.length === 0 && (
                      <span className="text-xs text-slate-400">No features assigned</span>
                    )}
                    {isAdmin && available.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(pcc) }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors font-medium"
                      >
                        Manage Features
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded: feature chips */}
                {isExpanded && (
                  <div className="px-5 py-4 border-t border-slate-100">
                    {features.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        No features assigned yet.
                        {isAdmin && available.length > 0 && <> Click <span className="font-medium">Manage Features</span> to assign.</>}
                        {available.length === 0 && <> Add features for {gdsName} in <span className="font-medium">GDS Functionality</span> first.</>}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {features.sort((a, b) => a.label.localeCompare(b.label)).map(f => (
                          <span key={f.id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                            ✓ {f.label}
                            {f.cost > 0 && <span className="ml-1 opacity-60">({fmtCurrency(f.cost, f.currency)})</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Manage Features Modal ── */}
      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditPCC(null) }}
        title={`Manage Features — ${editPCC?.pcc}`}
        size="md"
      >
        {editPCC && (
          <div className="space-y-4">
            {/* PCC info + count */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => { const gdsName = (editPCC.gds as GDS)?.name ?? ''; return gdsName ? <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`}>{gdsName}</span> : null })()}
                <span className="text-sm text-slate-500">{editEnabledCount} of {editAvailable.length} features enabled</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => { for (const f of editAvailable) { if (!selectedFeatureIds.has(f.id)) await toggleFeature(f.id) } }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors font-medium"
                >Enable All</button>
                <button
                  onClick={async () => { for (const f of editAvailable) { if (selectedFeatureIds.has(f.id)) await toggleFeature(f.id) } }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors font-medium"
                >Disable All</button>
              </div>
            </div>

            {editAvailable.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                No features defined for {(editPCC.gds as GDS)?.name}. Add them in GDS Functionality first.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {editAvailable.map((f, i) => {
                  const enabled = selectedFeatureIds.has(f.id)
                  return (
                    <div key={f.id} className={`flex items-center justify-between px-4 py-3 ${i < editAvailable.length - 1 ? 'border-b border-slate-100' : ''} ${enabled ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {enabled ? '✓' : '✕'}
                        </span>
                        <div>
                          <span className={`text-sm block ${enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{f.label}</span>
                          {f.cost > 0 && <span className="text-xs text-slate-400">{fmtCurrency(f.cost, f.currency)}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleFeature(f.id)}
                        disabled={toggling}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                      >
                        {enabled ? '− Remove' : '+ Add'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total cost summary */}
            {editEnabledCount > 0 && (() => {
              const enabledFeatures = editAvailable.filter(f => selectedFeatureIds.has(f.id))
              const total = enabledFeatures.reduce((s, f) => s + (f.cost ?? 0), 0)
              const cur = enabledFeatures[0]?.currency ?? 'USD'
              return total > 0 ? (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
                  <span className="text-xs text-slate-500 font-medium">Estimated Total Cost</span>
                  <span className="text-sm font-bold text-slate-800">{fmtCurrency(total, cur)}</span>
                </div>
              ) : null
            })()}

            <div className="flex justify-end pt-1">
              <button onClick={() => { setEditOpen(false); setEditPCC(null) }} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
