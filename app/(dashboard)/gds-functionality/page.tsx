'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'
import type { GDSFunctionality, GDSFeature, GDS } from '@/types'

const GDS_COLORS: Record<string, { header: string; badge: string }> = {
  Sabre:      { header: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200'       },
  Amadeus:    { header: 'bg-purple-500',  badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  Travelport: { header: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export default function GDSFunctionalityPage() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<GDSFunctionality[]>([])
  const [allFeatures, setAllFeatures] = useState<GDSFeature[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Add Profile modal
  const [addOpen, setAddOpen] = useState(false)
  const [addGdsId, setAddGdsId] = useState<number | ''>('')
  const [addName, setAddName] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit Features modal — manage features per profile
  const [editProfile, setEditProfile] = useState<GDSFunctionality | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [profileFeatureIds, setProfileFeatureIds] = useState<Set<number>>(new Set())
  const [editSaving, setEditSaving] = useState(false)

  // Add new feature to master list modal
  const [newFeatureOpen, setNewFeatureOpen] = useState(false)
  const [newFeatureLabel, setNewFeatureLabel] = useState('')
  const [newFeatureSaving, setNewFeatureSaving] = useState(false)
  const [newFeatureError, setNewFeatureError] = useState('')

  // Delete profile modal
  const [deleteTarget, setDeleteTarget] = useState<GDSFunctionality | null>(null)
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
    const [{ data: profileData }, { data: featureData }, { data: gdsData }] = await Promise.all([
      supabase.from('gds_functionality')
        .select('*, gds:gds_id(id, name), gds_profile_features(profile_id, feature_id, gds_features:feature_id(id, key, label))')
        .order('name'),
      supabase.from('gds_features').select('*').order('label'),
      supabase.from('gds').select('*').order('name'),
    ])
    setProfiles(profileData ?? [])
    setAllFeatures(featureData ?? [])
    setGdsList(gdsData ?? [])
    setLoading(false)
  }

  // ── ADD PROFILE ───────────────────────────────────────────────
  async function handleAddProfile() {
    if (!addGdsId) { setAddError('Please select a GDS.'); return }
    if (!addName.trim()) { setAddError('Profile name is required.'); return }
    setAddSaving(true); setAddError('')
    const { error } = await supabase.from('gds_functionality').insert({
      gds_id: addGdsId, name: addName.trim(),
    })
    if (error) { setAddError(error.message); setAddSaving(false); return }
    setAddSaving(false); setAddOpen(false)
    setAddName(''); setAddGdsId('')
    fetchAll()
  }

  // ── DELETE PROFILE ────────────────────────────────────────────
  async function handleDeleteProfile() {
    if (!deleteTarget) return
    setDeleteSaving(true)
    await supabase.from('gds_functionality').delete().eq('id', deleteTarget.id)
    setDeleteSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── OPEN EDIT FEATURES ────────────────────────────────────────
  function openEditFeatures(profile: GDSFunctionality) {
    setEditProfile(profile)
    const existing = new Set(
      (profile.gds_profile_features ?? []).map(pf => pf.feature_id)
    )
    setProfileFeatureIds(existing)
    setEditOpen(true)
  }

  // ── TOGGLE FEATURE (instant save) ────────────────────────────
  async function toggleFeature(featureId: number) {
    if (!editProfile || !isAdmin) return
    setEditSaving(true)
    const has = profileFeatureIds.has(featureId)
    if (has) {
      await supabase.from('gds_profile_features')
        .delete()
        .eq('profile_id', editProfile.id)
        .eq('feature_id', featureId)
      setProfileFeatureIds(prev => { const s = new Set(prev); s.delete(featureId); return s })
    } else {
      await supabase.from('gds_profile_features')
        .insert({ profile_id: editProfile.id, feature_id: featureId })
      setProfileFeatureIds(prev => new Set([...prev, featureId]))
    }
    setEditSaving(false)
    // Refresh profiles silently to update card counts
    const { data } = await supabase.from('gds_functionality')
      .select('*, gds:gds_id(id, name), gds_profile_features(profile_id, feature_id, gds_features:feature_id(id, key, label))')
      .order('name')
    setProfiles(data ?? [])
  }

  // ── ADD NEW FEATURE TO MASTER LIST ───────────────────────────
  async function handleAddNewFeature() {
    if (!newFeatureLabel.trim()) { setNewFeatureError('Feature name is required.'); return }
    const key = newFeatureLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    setNewFeatureSaving(true); setNewFeatureError('')
    const { error } = await supabase.from('gds_features').insert({ key, label: newFeatureLabel.trim() })
    if (error) { setNewFeatureError(error.message); setNewFeatureSaving(false); return }
    setNewFeatureSaving(false); setNewFeatureOpen(false); setNewFeatureLabel('')
    fetchAll()
  }

  // ── GROUPED BY GDS ────────────────────────────────────────────
  const grouped = gdsList.map(gds => ({
    gds,
    profiles: profiles.filter(p => p.gds_id === gds.id),
  }))

  return (
    <div>
      <PageHeader
        title="GDS Functionality"
        description="Manage feature profiles per GDS platform"
        action={isAdmin && (
          <button
            onClick={() => { setAddName(''); setAddGdsId(''); setAddError(''); setAddOpen(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Profile
          </button>
        )}
      />

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ gds, profiles: gdsProfiles }) => {
            const colors = GDS_COLORS[gds.name] ?? { header: 'bg-slate-500', badge: 'bg-slate-100 text-slate-600 border-slate-200' }
            return (
              <div key={gds.id}>
                {/* Section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${colors.badge}`}>{gds.name}</span>
                  <span className="text-xs text-slate-400">{gdsProfiles.length} profile{gdsProfiles.length !== 1 ? 's' : ''}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {gdsProfiles.length === 0 ? (
                  <p className="text-sm text-slate-400 italic pl-1">No profiles yet.</p>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {gdsProfiles.map(profile => {
                      const features = (profile.gds_profile_features ?? [])
                        .map(pf => pf.gds_features)
                        .filter(Boolean) as GDSFeature[]
                      const count = features.length

                      return (
                        <div key={profile.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                          {/* Card header */}
                          <div className={`${colors.header} px-5 py-3 flex items-center justify-between`}>
                            <div>
                              <p className="font-semibold text-white text-sm">{profile.name}</p>
                              <p className="text-white/60 text-xs mt-0.5">{count} feature{count !== 1 ? 's' : ''} enabled</p>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => openEditFeatures(profile)}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors font-medium"
                                >
                                  Edit Features
                                </button>
                                <button
                                  onClick={() => { setDeleteTarget(profile); setDeleteOpen(true) }}
                                  className="text-xs px-2.5 py-1 rounded-lg bg-white/20 hover:bg-red-500/80 text-white transition-colors font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Feature chips */}
                          <div className="px-5 py-4 min-h-16">
                            {features.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No features added yet. Click Edit Features to add.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {features.sort((a,b) => a.label.localeCompare(b.label)).map(f => (
                                  <span key={f.id} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                                    ✓ {f.label}
                                  </span>
                                ))}
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

      {/* ── Add Profile Modal ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Functionality Profile" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS <span className="text-red-500">*</span></label>
            <select
              value={addGdsId}
              onChange={e => setAddGdsId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select GDS —</option>
              {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Profile Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              placeholder="e.g. Sabre Full Access"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1">Profile is created empty — use Edit Features to add features.</p>
          </div>
          {addError && <p className="text-sm text-red-500">{addError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleAddProfile} disabled={addSaving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {addSaving ? 'Adding…' : 'Add Profile'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Features Modal ── */}
      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditProfile(null) }}
        title={`Edit Features — ${editProfile?.name}`}
        size="md"
      >
        {editProfile && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {profileFeatureIds.size} of {allFeatures.length} features enabled
              </p>
              <button
                onClick={() => { setNewFeatureLabel(''); setNewFeatureError(''); setNewFeatureOpen(true) }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Feature
              </button>
            </div>

            {/* Feature list — Add / Remove per item */}
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              {allFeatures.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No features in master list yet.</p>
              ) : (
                allFeatures.map((f, i) => {
                  const enabled = profileFeatureIds.has(f.id)
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center justify-between px-4 py-3 ${i < allFeatures.length - 1 ? 'border-b border-slate-100' : ''} ${enabled ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 ${enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          {enabled ? '✓' : '✕'}
                        </span>
                        <span className={`text-sm ${enabled ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{f.label}</span>
                      </div>
                      <button
                        onClick={() => toggleFeature(f.id)}
                        disabled={editSaving}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                          enabled
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {enabled ? '− Remove' : '+ Add'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => { setEditOpen(false); setEditProfile(null) }}
                className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── New Feature Modal ── */}
      <Modal open={newFeatureOpen} onClose={() => setNewFeatureOpen(false)} title="Add New Feature" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Feature Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={newFeatureLabel}
              onChange={e => setNewFeatureLabel(e.target.value)}
              placeholder="e.g. NDC, Low Cost Carrier, Hotel Booking"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1">This adds it to the master feature list — then you can assign it to any profile.</p>
          </div>
          {newFeatureError && <p className="text-sm text-red-500">{newFeatureError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setNewFeatureOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleAddNewFeature} disabled={newFeatureSaving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {newFeatureSaving ? 'Adding…' : 'Add Feature'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Profile Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Profile" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 font-medium">⚠️ Warning</p>
            <p className="text-sm text-amber-600 mt-1">
              Deleting <strong>{deleteTarget?.name}</strong> will also remove all its feature assignments and GDS Information links.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDeleteProfile} disabled={deleteSaving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {deleteSaving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
