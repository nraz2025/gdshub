'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { GDS, GDSName } from '@/types'

const GDS_OPTIONS: GDSName[] = ['Sabre', 'Amadeus', 'Travelport']
const EMPTY: Partial<GDS> = { name: 'Sabre' }

const GDS_COLORS: Record<GDSName, { badge: string; dot: string; card: string }> = {
  Sabre:      { badge: 'bg-blue-50 text-blue-600 border-blue-200',     dot: 'bg-blue-500',    card: 'border-t-blue-400' },
  Amadeus:    { badge: 'bg-purple-50 text-purple-600 border-purple-200', dot: 'bg-purple-500', card: 'border-t-purple-400' },
  Travelport: { badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', dot: 'bg-emerald-500', card: 'border-t-emerald-400' },
}

const GDS_DESC: Record<GDSName, string> = {
  Sabre:      'Global Distribution System — airline, hotel and car rental booking platform',
  Amadeus:    'Travel technology platform for bookings, ticketing and travel management',
  Travelport: 'Travel commerce platform connecting travel providers and agencies',
}

export default function GDSPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<GDS>>(EMPTY)
  const [editing, setEditing] = useState<GDS | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const { data } = await supabase.from('gds').select('*').order('name')
    setRecords(data ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  function openEdit(row: GDS) { setEditing(row); setForm({ name: row.name }); setError(''); setModalOpen(true) }
  function openDelete(row: GDS) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.name) { setError('GDS name is required.'); return }
    const duplicate = records.find(r => r.name === form.name && r.id !== editing?.id)
    if (duplicate) { setError(`${form.name} already exists.`); return }
    setSaving(true); setError('')
    const { error: err } = editing
      ? await supabase.from('gds').update({ name: form.name }).eq('id', editing.id)
      : await supabase.from('gds').insert({ name: form.name })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    const { error: err } = await supabase.from('gds').delete().eq('id', editing.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  const columns = [
    {
      key: 'name',
      label: 'GDS Name',
      render: (row: GDS) => (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${GDS_COLORS[row.name]?.dot ?? 'bg-slate-400'}`} />
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[row.name]?.badge ?? 'bg-slate-100 text-slate-600'}`}>
            {row.name}
          </span>
        </div>
      )
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (row: GDS) => new Date(row.created_at).toLocaleDateString('en-MY')
    },
  ]

  return (
    <div>
      <PageHeader
        title="GDS Platforms"
        description="Manage GDS platforms (Sabre, Amadeus, Travelport)"
        action={isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add GDS
          </button>
        )}
      />

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Total Platforms</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{records.length}</p>
          <p className="text-xs text-slate-400 mt-1">registered GDS</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Active Systems</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{records.length}</p>
          <p className="text-xs text-slate-400 mt-1">all operational</p>
        </div>

      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={records as unknown as Record<string, unknown>[]}
          onEdit={isAdmin ? (row) => openEdit(row as unknown as GDS) : undefined}
          onDelete={isAdmin ? (row) => openDelete(row as unknown as GDS) : undefined}
          isAdmin={isAdmin}
          emptyMessage="No GDS records found. Click Add GDS to get started."
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit GDS' : 'Add GDS'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              GDS Name <span className="text-red-500">*</span>
            </label>
            <select
              value={form.name ?? 'Sabre'}
              onChange={e => setForm(f => ({ ...f, name: e.target.value as GDSName }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {GDS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">Note: GDS values are pre-defined (Sabre, Amadeus, Travelport)</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add GDS'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete GDS" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-700 font-medium">⚠️ Warning</p>
            <p className="text-sm text-amber-600 mt-1">Deleting <strong>{editing?.name}</strong> will also remove all linked PCC records and assignments.</p>
          </div>
          <p className="text-sm text-slate-600">This action cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
