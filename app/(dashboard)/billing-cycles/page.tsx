'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'

interface BillingCycle {
  id: number
  value: string
  label: string
  sort_order: number
  created_at: string
}

const EMPTY = { value: '', label: '', sort_order: 0 }

export default function BillingCyclesPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<BillingCycle[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<BillingCycle | null>(null)
  const [form, setForm] = useState(EMPTY)
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
    const { data } = await supabase.from('billing_cycles').select('*').order('sort_order')
    setRecords(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    const nextOrder = records.length > 0 ? Math.max(...records.map(r => r.sort_order)) + 1 : 1
    setForm({ value: '', label: '', sort_order: nextOrder })
    setError(''); setSaving(false); setModalOpen(true)
  }

  function openEdit(row: BillingCycle) {
    setEditing(row)
    setForm({ value: row.value, label: row.label, sort_order: row.sort_order })
    setError(''); setSaving(false); setModalOpen(true)
  }

  function openDelete(row: BillingCycle) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.value.trim()) { setError('Value is required.'); return }
    if (!form.label.trim()) { setError('Label is required.'); return }
    setSaving(true); setError('')
    const payload = {
      value:      form.value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label:      form.label.trim(),
      sort_order: form.sort_order,
    }
    const { error: err } = editing
      ? await supabase.from('billing_cycles').update(payload).eq('id', editing.id)
      : await supabase.from('billing_cycles').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('billing_cycles').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  async function moveRow(id: number, dir: 'up' | 'down') {
    const idx = records.findIndex(r => r.id === id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= records.length) return

    const a = records[idx]
    const b = records[swapIdx]
    await Promise.all([
      supabase.from('billing_cycles').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('billing_cycles').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    fetchAll()
  }

  return (
    <div>
      <PageHeader
        title="Billing Cycles"
        description="Manage dropdown values for GDS Functionality billing cycles"
        action={isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Billing Cycle
          </button>
        )}
      />

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {records.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">No billing cycles yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 w-10">Order</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Label</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Value (key)</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-500 w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr key={row.id} className={`border-b border-slate-50 ${i === records.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="px-5 py-3">
                      {isAdmin && (
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveRow(row.id, 'up')} disabled={i === 0}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors leading-none">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                          </button>
                          <button onClick={() => moveRow(row.id, 'down')} disabled={i === records.length - 1}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors leading-none">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.label}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{row.value}</span>
                    </td>
                    <td className="px-5 py-3">
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(row)} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Edit</button>
                          <button onClick={() => openDelete(row)} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Billing Cycle' : 'Add Billing Cycle'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Label <span className="text-red-500">*</span></label>
            <input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Per Month" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            <p className="text-xs text-slate-400 mt-1">This is what users see in the dropdown.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Value (key) <span className="text-red-500">*</span></label>
            <input type="text" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="e.g. monthly" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
            <p className="text-xs text-slate-400 mt-1">Auto-generated from label. Used internally as the stored key.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Billing Cycle" size="sm">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-700 font-medium">⚠️ Warning</p>
            <p className="text-sm text-amber-600 mt-1">Deleting <strong>{editing?.label}</strong> will affect any GDS features using this billing cycle.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
