'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getAuditFields } from '@/lib/audit'
import PageHeader from '@/components/shared/PageHeader'
import Modal from '@/components/shared/Modal'

interface ClientGroup {
  id: number
  name: string
  description: string | null
  created_at: string
  modified_at: string | null
  modified_by: string | null
  client_count?: number
}

const EMPTY = { name: '', description: '' }

export default function ClientGroupPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<ClientGroup[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editing, setEditing] = useState<ClientGroup | null>(null)
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
    // Fetch groups with client count
    const { data, error: cgError } = await supabase
      .from('client_group')
      .select('*')
      .order('name')
    console.log('[ClientGroup] data:', data, 'error:', cgError)
    // Get client count per group from pcc_list
    const { data: pccData } = await supabase
      .from('pcc_list')
      .select('client_group_id')
      .not('client_group_id', 'is', null)
    const groupCounts: Record<number, number> = {}
    for (const p of pccData ?? []) {
      if (p.client_group_id) groupCounts[p.client_group_id] = (groupCounts[p.client_group_id] ?? 0) + 1
    }
    const withCount = (data ?? []).map((g: ClientGroup) => ({ ...g, client_count: groupCounts[g.id] ?? 0 }))
    setRecords(withCount)
    setLoading(false)
    return

    // handled above
  }

  function openAdd() {
    setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true)
  }

  function openEdit(row: ClientGroup) {
    setEditing(row)
    setForm({ name: row.name, description: row.description ?? '' })
    setError(''); setSaving(false); setModalOpen(true)
  }

  function openDelete(row: ClientGroup) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Group name is required.'); return }
    setSaving(true); setError('')
    // Check for duplicate name (excluding current record on edit)
    const { data: existing } = await supabase.from('client_group').select('id').ilike('name', form.name.trim()).maybeSingle()
    if (existing && (!editing || existing.id !== editing.id)) {
      setError(`A group named "${form.name.trim()}" already exists.`)
      setSaving(false); return
    }
    const audit = await getAuditFields()
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      ...audit,
    }
    const { error: err } = editing
      ? await supabase.from('client_group').update(payload).eq('id', editing.id)
      : await supabase.from('client_group').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('client_group').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  const filtered = records.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        title="Client Group"
        description="Manage client group categories linked to clients"
        action={isAdmin && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Group
          </button>
        )}
      />

      <div className="flex items-center gap-3 mb-5">
        <input type="text" placeholder="Search groups…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-72 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        {!loading && <span className="text-xs text-slate-400">{filtered.length} group{filtered.length !== 1 ? 's' : ''}</span>}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl text-center py-16 text-slate-400 text-sm">
          {search ? `No groups matching "${search}"` : 'No client groups yet. Click Add Group to create one.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Group Name</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500">Description</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500 w-28">Clients</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500 w-40">Last Modified</th>
                <th className="text-left px-5 py-3 font-medium text-slate-500 w-28">Created</th>
                {isAdmin && <th className="text-left px-5 py-3 font-medium text-slate-500 w-28">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${i === filtered.length - 1 ? 'border-b-0' : ''}`}>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-slate-800">{row.name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 text-sm">
                    {row.description || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                      (row.client_count ?? 0) > 0
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}>
                      {row.client_count ?? 0} client{(row.client_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {row.modified_at ? (
                      <div>
                        <p className="text-xs text-slate-600">{new Date(row.modified_at).toLocaleDateString('en-MY')}</p>
                        {row.modified_by && <p className="text-xs text-slate-400">{row.modified_by}</p>}
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleDateString('en-MY')}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(row)} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">Edit</button>
                        <button onClick={() => openDelete(row)} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Client Group' : 'Add Client Group'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Group Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Accomy Group" autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description…" rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Group'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Client Group" size="sm">
        <div className="space-y-4">
          {(editing?.client_count ?? 0) > 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-700 font-medium">⚠️ This group has {editing?.client_count} linked client{(editing?.client_count ?? 0) !== 1 ? 's' : ''}.</p>
              <p className="text-sm text-amber-600 mt-1">Deleting it will remove the group assignment from those clients. The clients themselves will not be deleted.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Delete <strong>{editing?.name}</strong>? This cannot be undone.</p>
          )}
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
