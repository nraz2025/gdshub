'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { User } from '@/types'

const EMPTY: Partial<User> = { name: '', email_address: '' }

export default function UsersPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<User[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<User>>(EMPTY)
  const [editing, setEditing] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setError('')
    setModalOpen(true)
  }

  function openEdit(row: User) {
    setEditing(row)
    setForm({ name: row.name, email_address: row.email_address })
    setError('')
    setModalOpen(true)
  }

  function openDelete(row: User) {
    setEditing(row)
    setDeleteOpen(true)
  }

  async function handleSave() {
    if (!form.name?.trim() || !form.email_address?.trim()) {
      setError('Name and email are required.')
      return
    }
    setSaving(true)
    setError('')
    if (editing) {
      const { error } = await supabase.from('users').update({ name: form.name, email_address: form.email_address }).eq('id', editing.id)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('users').insert({ name: form.name, email_address: form.email_address })
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setModalOpen(false)
    fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('users').delete().eq('id', editing.id)
    setSaving(false)
    setDeleteOpen(false)
    fetchAll()
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email_address.toLowerCase().includes(search.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email_address', label: 'Email Address' },
    {
      key: 'created_at', label: 'Created',
      render: (row: User) => new Date(row.created_at).toLocaleDateString('en-MY')
    },
  ]

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage internal user directory"
        action={isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add User
          </button>
        )}
      />

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          onEdit={isAdmin ? (row) => openEdit(row as unknown as User) : undefined}
          onDelete={isAdmin ? (row) => openDelete(row as unknown as User) : undefined}
          isAdmin={isAdmin}
          emptyMessage="No users found."
        />
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit User' : 'Add User'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={form.email_address ?? ''}
              onChange={e => setForm(f => ({ ...f, email_address: e.target.value }))}
              placeholder="user@company.com"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add User'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{editing?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteOpen(false)}
              className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
