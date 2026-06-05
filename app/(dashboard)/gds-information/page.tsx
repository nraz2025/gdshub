'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'
import type { GDSInformation, GDSFunctionality, GDSFeature, PCCList, GDS } from '@/types'

export default function GDSInformationPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<GDSInformation[]>([])
  const [pccList, setPccList] = useState<PCCList[]>([])
  const [funcList, setFuncList] = useState<GDSFunctionality[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Add modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GDSInformation | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [formPCC, setFormPCC] = useState<number | ''>('')
  const [formFunc, setFormFunc] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Filter + expand
  const [filterGDS, setFilterGDS] = useState('all')
  const [expandedPCC, setExpandedPCC] = useState<number | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const [{ data: infoData }, { data: pccData }, { data: funcData }, { data: gdsData }] = await Promise.all([
      supabase.from('gds_information').select(`
        pcc_list_id, functionality_id,
        pcc_list:pcc_list_id ( id, pcc, status, gds_id, gds:gds_id(id, name) ),
        gds_functionality:functionality_id (
          id, name, gds_id,
          gds:gds_id(id, name),
          gds_profile_features ( feature_id, gds_features:feature_id(id, key, label) )
        )
      `),
      supabase.from('pcc_list').select('*, gds:gds_id(id, name)').order('pcc'),
      supabase.from('gds_functionality').select(`
        id, name, gds_id,
        gds:gds_id(id, name),
        gds_profile_features ( feature_id, gds_features:feature_id(id, key, label) )
      `).order('name'),
      supabase.from('gds').select('*').order('name'),
    ])
    setRecords(infoData ?? [])
    setPccList(pccData ?? [])
    setFuncList(funcData ?? [])
    setGdsList(gdsData ?? [])
    setLoading(false)
  }

  function openAdd() {
    setFormPCC(''); setFormFunc(''); setError(''); setModalOpen(true)
  }

  async function handleSave() {
    if (!formPCC) { setError('Please select a PCC.'); return }
    if (!formFunc) { setError('Please select a Functionality Profile.'); return }
    const exists = records.find(r => r.pcc_list_id === formPCC && r.functionality_id === formFunc)
    if (exists) { setError('This PCC is already linked to that profile.'); return }
    setSaving(true); setError('')
    const { error } = await supabase.from('gds_information').insert({
      pcc_list_id: formPCC,
      functionality_id: formFunc,
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    await supabase.from('gds_information')
      .delete()
      .eq('pcc_list_id', deleteTarget.pcc_list_id)
      .eq('functionality_id', deleteTarget.functionality_id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // Helper: get features from a functionality record
  function getFeatures(func: GDSFunctionality): GDSFeature[] {
    return (func.gds_profile_features ?? [])
      .map((pf: { feature_id: number; gds_features?: GDSFeature }) => pf.gds_features)
      .filter(Boolean) as GDSFeature[]
  }

  // Group records by PCC
  const grouped = records.reduce<Record<number, GDSInformation[]>>((acc, r) => {
    if (!acc[r.pcc_list_id]) acc[r.pcc_list_id] = []
    acc[r.pcc_list_id].push(r)
    return acc
  }, {})

  const filteredPCCIds = Object.keys(grouped).map(Number).filter(pccId => {
    if (filterGDS === 'all') return true
    const pcc = pccList.find(p => p.id === pccId)
    return String(pcc?.gds_id) === filterGDS
  })

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

  return (
    <div>
      <PageHeader
        title="GDS Information"
        description="Link PCC codes to their GDS Functionality profiles"
        action={isAdmin && (
          <button
            onClick={openAdd}
            disabled={pccList.length === 0 || funcList.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Link PCC
          </button>
        )}
      />

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={filterGDS}
          onChange={e => setFilterGDS(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All GDS</option>
          {gdsList.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
        {!loading && (
          <span className="text-xs text-slate-400">
            {filteredPCCIds.length} PCC{filteredPCCIds.length !== 1 ? 's' : ''} linked
          </span>
        )}
      </div>

      {!loading && pccList.length === 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          ⚠️ No PCC records found. Please add PCCs first under <strong>PCC List</strong>.
        </div>
      )}
      {!loading && funcList.length === 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          ⚠️ No Functionality Profiles found. Please add profiles first under <strong>GDS Functionality</strong>.
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filteredPCCIds.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No PCC links found.{isAdmin && ' Click "Link PCC" to assign a functionality profile.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPCCIds.map(pccId => {
            const pccLinks = grouped[pccId]
            const pcc = pccLinks[0].pcc_list as PCCList
            const gdsName = (pcc?.gds as GDS)?.name ?? ''
            const isExpanded = expandedPCC === pccId

            return (
              <div key={pccId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* PCC Header */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  onClick={() => setExpandedPCC(isExpanded ? null : pccId)}
                >
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded text-sm">
                    {pcc?.pcc ?? `PCC #${pccId}`}
                  </span>
                  {gdsName && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`}>
                      {gdsName}
                    </span>
                  )}
                  {pcc?.status && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[pcc.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {pcc.status}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {pccLinks.length} profile{pccLinks.length !== 1 ? 's' : ''} linked
                  </span>
                </div>

                {/* Expanded profiles */}
                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    {pccLinks.map((link, i) => {
                      const func = link.gds_functionality as GDSFunctionality
                      if (!func) return null
                      const features = getFeatures(func)

                      return (
                        <div key={i} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <p className="font-medium text-slate-800 text-sm">{func.name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {features.length} feature{features.length !== 1 ? 's' : ''} enabled
                              </p>
                            </div>
                            {isAdmin && (
                              <button
                                onClick={() => { setDeleteTarget(link); setDeleteOpen(true) }}
                                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium flex-shrink-0"
                              >
                                Unlink
                              </button>
                            )}
                          </div>

                          {/* Feature chips — only enabled ones */}
                          {features.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No features assigned to this profile yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {features.sort((a, b) => a.label.localeCompare(b.label)).map(f => (
                                <span key={f.id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                                  ✓ {f.label}
                                </span>
                              ))}
                            </div>
                          )}
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

      {/* ── Link PCC Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Link PCC to Functionality Profile" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC Code <span className="text-red-500">*</span></label>
            <select
              value={formPCC}
              onChange={e => setFormPCC(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select PCC —</option>
              {pccList.map(p => {
                const gdsName = (p.gds as GDS)?.name ?? ''
                return <option key={p.id} value={p.id}>{p.pcc}{gdsName ? ` (${gdsName})` : ''}</option>
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Functionality Profile <span className="text-red-500">*</span></label>
            <select
              value={formFunc}
              onChange={e => setFormFunc(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select Profile —</option>
              {funcList.map(f => {
                const featureCount = getFeatures(f).length
                return (
                  <option key={f.id} value={f.id}>
                    {f.name} ({featureCount} feature{featureCount !== 1 ? 's' : ''})
                  </option>
                )
              })}
            </select>
          </div>

          {/* Profile preview */}
          {formFunc && (() => {
            const selected = funcList.find(f => f.id === formFunc)
            if (!selected) return null
            const features = getFeatures(selected)
            return (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-medium text-slate-600 mb-2">Profile preview — {selected.name}</p>
                {features.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No features assigned to this profile.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {features.sort((a, b) => a.label.localeCompare(b.label)).map(f => (
                      <span key={f.id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {saving ? 'Linking…' : 'Link PCC'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Unlink Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Unlink Profile" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Remove the link between{' '}
            <strong className="font-mono">{(deleteTarget?.pcc_list as PCCList)?.pcc}</strong>
            {' '}and{' '}
            <strong>{(deleteTarget?.gds_functionality as GDSFunctionality)?.name}</strong>?
          </p>
          <p className="text-xs text-slate-400">This only removes the link — the PCC and Profile are not deleted.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {saving ? 'Removing…' : 'Unlink'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
