'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { OTAClient, User } from '@/types'

interface OTAClientWithUsers extends OTAClient {
  ota_client_users?: { user_id: string; users: User }[]
}

const EMPTY = { company_name: '' }

interface ImportRow {
  company_name: string
  _row: number; _errors: string[]
}

export default function OTAClientPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<OTAClientWithUsers[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<OTAClientWithUsers | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Manage linked users modal
  const [usersModalOpen, setUsersModalOpen] = useState(false)
  const [selectedOTA, setSelectedOTA] = useState<OTAClientWithUsers | null>(null)
  const [linkedUserIds, setLinkedUserIds] = useState<Set<string>>(new Set())
  const [userToggling, setUserToggling] = useState(false)

  // Import
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: string[] } | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setIsAdmin(profile?.role === 'admin')
    }
    const [{ data: otaData }, { data: usersData }] = await Promise.all([
      supabase.from('ota_client')
        .select('*, ota_client_users(user_id, users:user_id(id, first_name, last_name, email_address))')
        .order('company_name'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
    ])
    setRecords(otaData ?? [])
    setUsersList(usersData ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }

  function openEdit(row: OTAClientWithUsers) {
    setEditing(row)
    setForm({ company_name: row.company_name })
    setError(''); setModalOpen(true)
  }

  function openDelete(row: OTAClientWithUsers) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.company_name.trim()) { setError('Company name is required.'); return }
    setSaving(true); setError('')
    const { error: err } = editing
      ? await supabase.from('ota_client').update({ company_name: form.company_name.trim() }).eq('id', editing.id)
      : await supabase.from('ota_client').insert({ company_name: form.company_name.trim() })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('ota_client').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── MANAGE LINKED USERS ───────────────────────────────────────
  function openUsersModal(row: OTAClientWithUsers) {
    setSelectedOTA(row)
    const existing = new Set((row.ota_client_users ?? []).map(u => u.user_id))
    setLinkedUserIds(existing)
    setUsersModalOpen(true)
  }

  async function toggleLinkedUser(userId: string) {
    if (!selectedOTA || !isAdmin) return
    setUserToggling(true)
    const has = linkedUserIds.has(userId)
    if (has) {
      await supabase.from('ota_client_users').delete()
        .eq('ota_client_id', selectedOTA.id).eq('user_id', userId)
      setLinkedUserIds(prev => { const s = new Set(prev); s.delete(userId); return s })
    } else {
      await supabase.from('ota_client_users').insert({ ota_client_id: selectedOTA.id, user_id: userId })
      setLinkedUserIds(prev => new Set([...prev, userId]))
    }
    setUserToggling(false)
    fetchAll()
  }

  // ── AUTO-SYNC from GDS tables ─────────────────────────────────
  // Called automatically when a GDS user with ota_client_id is saved
  // This is handled by the syncUserToOTAClient utility — see lib/syncUser.ts
  // The junction table is updated server-side via the GDS user save flow

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const data = filtered.map((r, i) => {
      const users = (r.ota_client_users ?? []).map(u => u.users).filter(Boolean) as User[]
      return {
        'No.':          i + 1,
        'Company Name': r.company_name,
        'Linked Users': users.map(u => `${u.first_name} ${u.last_name}`).join('; '),
        'Emails':       users.map(u => u.email_address).join('; '),
        'Created':      new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 50 }, { wch: 60 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Client')
    XLSX.writeFile(wb, `GDSHub_Client_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'Company Name': 'Example Travel Sdn Bhd' },
      { 'Company Name': 'Another Client Company' },
    ])
    ws['!cols'] = [{ wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Client')
    XLSX.writeFile(wb, 'GDSHub_Client_Template.xlsx')
  }

  // ── IMPORT ────────────────────────────────────────────────────
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportFileName(file.name); setImportResult(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' })
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const getF = (row: Record<string, string>, ...keys: string[]) => {
        const norm = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, '')
        const match = Object.keys(row).find(k => keys.some(c => norm(k) === norm(c)))
        return match ? (row[match] ?? '').toString().trim() : ''
      }
      const parsed: ImportRow[] = raw.map((r, i) => {
        const company_name = getF(r, 'Company Name', 'CompanyName', 'company', 'name')
        const errors: string[] = []
        if (!company_name) errors.push('Company name is required')
        return { company_name, _row: i + 2, _errors: errors }
      })
      setImportRows(parsed); setImportOpen(true)
    }
    reader.readAsBinaryString(file); e.target.value = ''
  }

  async function handleImportConfirm() {
    const valid = importRows.filter(r => r._errors.length === 0)
    if (!valid.length) return
    setImporting(true)
    let success = 0; let failed = 0; const failedRows: string[] = []
    for (const row of valid) {
      const { error } = await supabase.from('ota_client').insert({ company_name: row.company_name })
      if (error) { failed++; failedRows.push(`${row.company_name} — ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  // ── FILTER ────────────────────────────────────────────────────
  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    const userNames = (r.ota_client_users ?? []).map(u => `${u.users?.first_name} ${u.users?.last_name}`).join(' ').toLowerCase()
    return r.company_name.toLowerCase().includes(term) || userNames.includes(term)
  })

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  // ── COLUMNS ───────────────────────────────────────────────────
  const columns = [
    {
      key: 'company_name', label: 'Company Name',
      render: (row: OTAClientWithUsers) => <span className="font-medium text-slate-800">{row.company_name}</span>
    },
    {
      key: 'ota_client_users', label: 'Linked Users',
      render: (row: OTAClientWithUsers) => {
        const users = (row.ota_client_users ?? []).map(u => u.users).filter(Boolean) as User[]
        if (users.length === 0) {
          return isAdmin
            ? <button onClick={() => openUsersModal(row)} className="text-xs text-slate-400 hover:text-blue-500 transition-colors italic">+ link users</button>
            : <span className="text-slate-300 text-xs">—</span>
        }
        return (
          <div className="flex items-start gap-2">
            <ul className="list-disc list-inside space-y-0.5">
              {users.map(u => (
                <li key={u.id} className="text-sm text-slate-700">
                  {u.first_name} {u.last_name}
                  <span className="text-slate-400 text-xs ml-1">({u.email_address})</span>
                </li>
              ))}
            </ul>
            {isAdmin && (
              <button
                onClick={() => openUsersModal(row)}
                className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-700 transition-colors ml-1"
                title="Manage linked users"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}
          </div>
        )
      }
    },
    {
      key: 'created_at', label: 'Created',
      render: (row: OTAClientWithUsers) => new Date(row.created_at).toLocaleDateString('en-MY')
    },
  ]

  return (
    <div>
      <PageHeader
        title="Client"
        description="Manage client companies and their linked users"
        action={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export xlsx
            </button>
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import xlsx
                </button>
                <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Client
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search by company or user name…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-80 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
        {!loading && <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}{search && ` matching "${search}"`}</span>}
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable columns={columns} data={filtered as unknown as Record<string, unknown>[]} onEdit={isAdmin ? r => openEdit(r as unknown as OTAClientWithUsers) : undefined} onDelete={isAdmin ? r => openDelete(r as unknown as OTAClientWithUsers) : undefined} isAdmin={isAdmin} emptyMessage="No clients found." />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Client' : 'Add Client'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. PST Travel Services Sdn Bhd" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Client'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Client" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete <strong>{editing?.company_name}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Manage Linked Users Modal ── */}
      <Modal open={usersModalOpen} onClose={() => { setUsersModalOpen(false); setSelectedOTA(null) }} title={`Linked Users — ${selectedOTA?.company_name}`} size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {linkedUserIds.size} user{linkedUserIds.size !== 1 ? 's' : ''} linked
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            {usersList.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">No users in the system yet.</p>
            ) : (
              usersList.map((u, i) => {
                const linked = linkedUserIds.has(u.id)
                return (
                  <div key={u.id} className={`flex items-center justify-between px-4 py-3 ${i < usersList.length - 1 ? 'border-b border-slate-100' : ''} ${linked ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0 ${linked ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {linked ? '✓' : '✕'}
                      </span>
                      <div>
                        <p className={`text-sm ${linked ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{u.first_name} {u.last_name}</p>
                        <p className="text-xs text-slate-400">{u.email_address}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleLinkedUser(u.id)}
                      disabled={userToggling}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${linked ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                    >
                      {linked ? '− Remove' : '+ Add'}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => { setUsersModalOpen(false); setSelectedOTA(null) }} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Done</button>
          </div>
        </div>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Clients" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-medium">✅ Imported {importResult.success} client{importResult.success !== 1 ? 's' : ''}.</p>
                : <div className="space-y-1"><p className="font-medium">✅ {importResult.success} imported · ⚠️ {importResult.failed} skipped</p>
                    {importResult.failedRows.map((r, i) => <p key={i} className="text-xs opacity-70 font-mono">{r}</p>)}</div>}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">File: <span className="font-medium">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows — <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p>
                </div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                Required: <span className="font-mono font-medium text-slate-700">Company Name</span>
                <br />Note: Linked users are managed separately via the edit ✏️ button after import.
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row', 'Company Name', 'Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-medium">{row.company_name || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium">✓ OK</span> : <span className="text-red-500">✗ {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing…' : `Import ${validRows.length} Client${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
