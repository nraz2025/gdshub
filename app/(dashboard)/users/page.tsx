'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { User } from '@/types'

const EMPTY: Partial<User> = { first_name: '', last_name: '', email_address: '', ota_client: false, status: 'Active' }

interface ImportRow {
  first_name: string
  last_name: string
  email_address: string
  ota_client: boolean
  status: string
  _row: number
  _errors: string[]
}

export default function UsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [users, setUsers] = useState<User[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<User>>(EMPTY)
  const [editing, setEditing] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Import modal
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const { data } = await supabase.from('users').select('*').order('first_name')
    setUsers(data ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() { setEditing(null); setForm(EMPTY); setFormError(''); setModalOpen(true) }

  function openEdit(row: User) {
    setEditing(row)
    setForm({ first_name: row.first_name, last_name: row.last_name, email_address: row.email_address, ota_client: row.ota_client, status: row.status })
    setFormError('')
    setModalOpen(true)
  }

  function openDelete(row: User) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.first_name?.trim()) { setFormError('First name is required.'); return }
    if (!form.last_name?.trim()) { setFormError('Last name is required.'); return }
    if (!form.email_address?.trim()) { setFormError('Email address is required.'); return }
    setSaving(true); setFormError('')
    const payload = {
      first_name:    form.first_name.trim(),
      last_name:     form.last_name.trim(),
      email_address: form.email_address.trim(),
      ota_client:    form.ota_client ?? false,
      status:        form.status ?? 'Active',
    }
    if (editing) {
      const { error } = await supabase.from('users').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('users').insert(payload)
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('users').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const exportData = filtered.map((u, i) => ({
      'No.':           i + 1,
      'First Name':    u.first_name,
      'Last Name':     u.last_name,
      'Email Address': u.email_address,
      'OTA Client':    u.ota_client ? 'Yes' : 'No',
      'Status':        u.status ?? 'Active',
      'Created Date':  new Date(u.created_at).toLocaleDateString('en-MY'),
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users')
    XLSX.writeFile(wb, `GDSHub_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── TEMPLATE DOWNLOAD ─────────────────────────────────────────
  function handleDownloadTemplate() {
    const templateData = [
      { 'First Name': 'Ahmad', 'Last Name': 'Razali', 'Email Address': 'ahmad.razali@company.com', 'OTA Client': 'Yes', 'Status': 'Active'   },
      { 'First Name': 'Siti',  'Last Name': 'Aminah',  'Email Address': 'siti.aminah@company.com',  'OTA Client': 'No',  'Status': 'Inactive' },
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    ws['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Users')
    XLSX.writeFile(wb, 'GDSHub_Users_Import_Template.xlsx')
  }

  // ── IMPORT FILE PICK ──────────────────────────────────────────
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFileName(file.name)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const wb = XLSX.read(data, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      // Flexible header resolver: strips spaces/underscores/dashes, lowercases, then matches
      // Handles: "First Name", "FirstName", "firstname", "FIRST_NAME", "first-name" etc.
      function getField(row: Record<string, string>, ...candidates: string[]): string {
        const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, '')
        const keys = Object.keys(row)
        for (const candidate of candidates) {
          const match = keys.find(k => normalize(k) === normalize(candidate))
          if (match !== undefined) return (row[match] ?? '').toString().trim()
        }
        return ''
      }

      const parsed: ImportRow[] = raw.map((r, i) => {
        const first_name    = getField(r, 'First Name', 'FirstName', 'firstname', 'first_name', 'fname', 'given name', 'givenname')
        const last_name     = getField(r, 'Last Name', 'LastName', 'lastname', 'last_name', 'lname', 'surname', 'family name', 'familyname')
        const email_address = getField(r, 'Email Address', 'Email', 'EmailAddress', 'email_address', 'email', 'e-mail', 'mail').toLowerCase()
        const ota_raw       = getField(r, 'OTA Client', 'OTAClient', 'ota_client', 'OTA', 'ota').toLowerCase()
        const ota_client    = ota_raw === 'yes' || ota_raw === 'true' || ota_raw === '1'
        const status_raw    = getField(r, 'Status', 'status', 'user_status', 'active').toLowerCase()
        const status        = status_raw === 'inactive' ? 'Inactive' : 'Active'

        const errors: string[] = []
        if (!first_name) errors.push('First Name is required')
        if (!last_name)  errors.push('Last Name is required')
        if (!email_address) {
          errors.push('Email Address is required')
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_address)) {
          errors.push('Invalid email format')
        }

        return { first_name, last_name, email_address, ota_client, status, _row: i + 2, _errors: errors }
      })

      // Store the actual headers found in the file for display
      const foundHeaders = raw.length > 0 ? Object.keys(raw[0]) : []
      setDetectedHeaders(foundHeaders)
      setImportRows(parsed)
      setImportOpen(true)
    }
    reader.readAsBinaryString(file)

    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

  // ── IMPORT SUBMIT ─────────────────────────────────────────────
  async function handleImportConfirm() {
    const valid = importRows.filter(r => r._errors.length === 0)
    if (valid.length === 0) return

    setImporting(true)
    let success = 0
    let failed = 0
    const failedRows: string[] = []

    // Insert one row at a time so a duplicate email on one row
    // does NOT cause the entire batch to fail
    for (const row of valid) {
      const { error } = await supabase.from('users').insert({
        first_name:    row.first_name,
        last_name:     row.last_name,
        email_address: row.email_address,
        ota_client:    row.ota_client,
        status:        row.status,
      })
      if (error) {
        failed++
        failedRows.push(`${row.first_name} ${row.last_name} (${row.email_address})`)
      } else {
        success++
      }
    }

    setImporting(false)
    setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() {
    setImportOpen(false)
    setImportRows([])
    setImportFileName('')
    setImportResult(null)
  }

  // ── FILTER ────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
    const term = search.toLowerCase()
    return fullName.includes(term) || u.email_address.toLowerCase().includes(term)
  })

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name',  label: 'Last Name' },
    { key: 'email_address', label: 'Email Address' },
    {
      key: 'ota_client', label: 'OTA Client',
      render: (row: User) => (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
          row.ota_client
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          {row.ota_client ? 'Yes' : 'No'}
        </span>
      )
    },
    {
      key: 'status', label: 'Status',
      render: (row: User) => (
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
          row.status === 'Active'
            ? 'bg-blue-50 text-blue-600 border-blue-200'
            : 'bg-red-50 text-red-500 border-red-200'
        }`}>
          {row.status ?? 'Active'}
        </span>
      )
    },
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
        action={
          <div className="flex items-center gap-2">
            {/* Export */}
            <button
              {isAdmin && (
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export xlsx
            </button>
              )}

            {/* Import (admin only) */}
            {isAdmin && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFilePick}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import xlsx
                </button>
              </>
            )}

            {/* Add User (admin only) */}
            {isAdmin && (
              <button
                onClick={openAdd}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add User
              </button>
            )}
          </div>
        }
      />

      {/* Search + count */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
        {!loading && (
          <span className="text-xs text-slate-400">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </span>
        )}
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

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit User' : 'Add User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.first_name ?? ''} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="e.g. Ahmad" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.last_name ?? ''} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="e.g. Razali" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address <span className="text-red-500">*</span></label>
            <input type="email" value={form.email_address ?? ''} onChange={e => setForm(f => ({ ...f, email_address: e.target.value }))} placeholder="user@company.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">OTA Client</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="ota_client"
                  value="yes"
                  checked={form.ota_client === true}
                  onChange={() => setForm(f => ({ ...f, ota_client: true }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-700">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="ota_client"
                  value="no"
                  checked={form.ota_client === false}
                  onChange={() => setForm(f => ({ ...f, ota_client: false }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-700">No</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="Active"
                  checked={(form.status ?? 'Active') === 'Active'}
                  onChange={() => setForm(f => ({ ...f, status: 'Active' }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-700">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="Inactive"
                  checked={form.status === 'Inactive'}
                  onChange={() => setForm(f => ({ ...f, status: 'Inactive' }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-700">Inactive</span>
              </label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Are you sure you want to delete <strong>{editing?.first_name} {editing?.last_name}</strong>? This action cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Import Preview Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Users" size="lg">
        <div className="space-y-4">

          {/* Result banner */}
          {importResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0 ? (
                <p className="font-medium">✅ Successfully imported {importResult.success} user{importResult.success !== 1 ? 's' : ''}.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">
                    ✅ {importResult.success} imported &nbsp;·&nbsp; ⚠️ {importResult.failed} skipped
                  </p>
                  {importResult.failedRows.length > 0 && (
                    <div className="max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium mb-1 opacity-80">Skipped rows (duplicate email or DB error):</p>
                      {importResult.failedRows.map((r, i) => (
                        <p key={i} className="text-xs opacity-70 font-mono">{r}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!importResult && (
            <>
              {/* File + summary */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">
                    File: <span className="font-medium text-slate-800">{importFileName}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {importRows.length} row{importRows.length !== 1 ? 's' : ''} found —{' '}
                    <span className="text-emerald-600 font-medium">{validRows.length} valid</span>
                    {invalidRows.length > 0 && (
                      <>, <span className="text-red-500 font-medium">{invalidRows.length} with errors</span></>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  Download template
                </button>
              </div>

              {/* Required columns reminder */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
                <div>Required columns: <span className="font-mono font-medium text-slate-700">First Name</span>,{' '}
                <span className="font-mono font-medium text-slate-700">Last Name</span>,{' '}
                <span className="font-mono font-medium text-slate-700">Email Address</span></div>
                {detectedHeaders.length > 0 && (
                  <div>
                    Detected in your file:{' '}
                    {detectedHeaders.map((h, i) => (
                      <span key={i} className="font-mono font-medium text-slate-700 bg-slate-200 px-1 rounded mr-1">{h}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Row</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">First Name</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Last Name</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Email Address</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 text-slate-700">{row.first_name || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-slate-700">{row.last_name  || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2 text-slate-700">{row.email_address || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="px-3 py-2">
                          {row._errors.length === 0 ? (
                            <span className="text-emerald-600 font-medium">✓ OK</span>
                          ) : (
                            <span className="text-red-500" title={row._errors.join(', ')}>
                              ✗ {row._errors[0]}{row._errors.length > 1 ? ` +${row._errors.length - 1}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {invalidRows.length > 0 && (
                <p className="text-xs text-slate-400">
                  ⚠️ Rows with errors will be skipped. Only {validRows.length} valid row{validRows.length !== 1 ? 's' : ''} will be imported.
                </p>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              {importResult ? 'Close' : 'Cancel'}
            </button>
            {!importResult && (
              <button
                onClick={handleImportConfirm}
                disabled={importing || validRows.length === 0}
                className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing…' : `Import ${validRows.length} User${validRows.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
