'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { AmadeusUser, User, OTAClient } from '@/types'
import { syncUserToTable, syncUserToOTAClient } from '@/lib/syncUser'

const EMPTY = { login: '', sign_on_id: '', initial: '', duty_code: '', oid: '', user_id: '', ota: false, ota_client_id: '' as number | '', newEmail: '', newFirstName: '', newLastName: '',
}

interface ImportRow {
  login: string; sign_on_id: string; initial: string; duty_code: string; oid: string; ota: boolean
  _row: number; _errors: string[]
}

export default function AmadeusUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<AmadeusUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<AmadeusUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    const [{ data: amData }, { data: usersData }, { data: otaData }] = await Promise.all([
      supabase.from('amadeus_user').select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)').order('login'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
    ])
    setRecords(amData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: AmadeusUser) {
    setEditing(row)
    setForm({ login: row.login, sign_on_id: row.sign_on_id ?? '', initial: row.initial ?? '', duty_code: row.duty_code ?? '', oid: row.oid ?? '', user_id: row.user_id ?? '', ota: row.ota, ota_client_id: row.ota_client_id ?? '', newEmail: '', newFirstName: '', newLastName: '' })
    setError(''); setSaving(false); setModalOpen(true)
  }
  function openDelete(row: AmadeusUser) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.login.trim()) { setError('Login is required.'); return }
    setSaving(true); setError('')

    // Resolve user_id — use selected user or auto-create from email
    let resolvedUserId = form.user_id || null
    if ((form as {newEmail?: string}).newEmail?.trim()) {
      const synced = await syncUserToTable({
        email:     (form as {newEmail: string}).newEmail,
        firstName: (form as {newFirstName?: string}).newFirstName ?? '',
        lastName:  (form as {newLastName?: string}).newLastName  ?? '',
      })
      if (synced) { resolvedUserId = synced }
    }

    const payload = { login: form.login.trim(), sign_on_id: form.sign_on_id.trim().toUpperCase() || null, initial: form.initial.trim().toUpperCase() || null, duty_code: form.duty_code.trim().toUpperCase() || null, oid: form.oid.trim().toUpperCase() || null, user_id: resolvedUserId, ota: form.ota, ota_client_id: form.ota_client_id || null }
    const { error: err } = editing
      ? await supabase.from('amadeus_user').update(payload).eq('id', editing.id)
      : await supabase.from('amadeus_user').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    // Sync ota_client_users junction table
    if (resolvedUserId) {
      const prevOtaId = editing?.ota_client_id ?? null
      const newOtaId  = form.ota_client_id ? Number(form.ota_client_id) : null
      if (prevOtaId && prevOtaId !== newOtaId) {
        await supabase.from('ota_client_users').delete().eq('ota_client_id', prevOtaId).eq('user_id', resolvedUserId)
      }
      if (newOtaId) { await syncUserToOTAClient({ userId: resolvedUserId, otaClientId: newOtaId }) }
    }
    if (!resolvedUserId && editing?.user_id && editing?.ota_client_id) {
      await supabase.from('ota_client_users').delete().eq('ota_client_id', editing.ota_client_id).eq('user_id', editing.user_id)
    }

    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('amadeus_user').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => {
      const u = r.users as User
      return { 'No.': i + 1, 'Login': r.login, 'Sign-On ID': r.sign_on_id ?? '', 'Initial': r.initial ?? '', 'Duty Code': r.duty_code ?? '', 'OID': r.oid ?? '', 'OTA': r.ota ? 'Yes' : 'No', 'Linked User': u ? `${u.first_name} ${u.last_name}` : '', 'Created': new Date(r.created_at).toLocaleDateString('en-MY') }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 8 }, { wch: 25 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Amadeus Users')
    XLSX.writeFile(wb, `GDSHub_Amadeus_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'Login': 'JOHNSMITH', 'Sign-On ID': 'JS', 'Initial': 'JS', 'Duty Code': 'TP', 'OID': 'KULMY255W', 'OTA': 'No' },
    ])
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 8 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Amadeus Users')
    XLSX.writeFile(wb, 'GDSHub_Amadeus_Users_Template.xlsx')
  }

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
        const login = getF(r, 'Login', 'login', 'username')
        const sign_on_id = getF(r, 'Sign-On ID', 'SignOnID', 'sign_on_id', 'signon').toUpperCase()
        const initial = getF(r, 'Initial', 'initial').toUpperCase()
        const duty_code = getF(r, 'Duty Code', 'DutyCode', 'duty_code').toUpperCase()
        const oid = getF(r, 'OID', 'oid', 'office id').toUpperCase()
        const ota_raw = getF(r, 'OTA', 'ota').toLowerCase()
        const ota = ota_raw === 'yes' || ota_raw === 'true' || ota_raw === '1'
        const errors: string[] = []
        if (!login) errors.push('Login is required')
        return { login, sign_on_id, initial, duty_code, oid, ota, _row: i + 2, _errors: errors }
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
      const { error } = await supabase.from('amadeus_user').insert({ login: row.login, sign_on_id: row.sign_on_id || null, initial: row.initial || null, duty_code: row.duty_code || null, oid: row.oid || null, ota: row.ota })
      if (error) { failed++; failedRows.push(`${row.login} — ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const filtered = records.filter(r => {
    const u = r.users as User
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    return r.login.toLowerCase().includes(term) || (r.oid ?? '').toLowerCase().includes(term) || name.includes(term) || (r.sign_on_id ?? '').toLowerCase().includes(term)
  })

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'login', label: 'Login', render: (row: AmadeusUser) => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{row.login}</span> },
    { key: 'sign_on_id', label: 'Sign-On ID', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.sign_on_id ?? '—'}</span> },
    { key: 'initial', label: 'Initial', render: (row: AmadeusUser) => <span className="text-slate-600">{row.initial ?? '—'}</span> },
    { key: 'duty_code', label: 'Duty Code', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.duty_code ?? '—'}</span> },
    { key: 'oid', label: 'OID', render: (row: AmadeusUser) => <span className="font-mono text-xs text-slate-600">{row.oid ?? '—'}</span> },
    { key: 'ota', label: 'OTA', render: (row: AmadeusUser) => <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${row.ota ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{row.ota ? 'Yes' : 'No'}</span> },
    { key: 'ota_client_id', label: 'OTA Client', render: (row: AmadeusUser) => { const ota = row.ota_client as OTAClient; return ota ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">{ota.company_name}</span> : <span className="text-slate-300 text-xs">—</span> } },
    { key: 'user_id', label: 'Linked User', render: (row: AmadeusUser) => { const u = row.users as User; return u ? <div><p className="text-sm text-slate-700 font-medium">{u.first_name} {u.last_name}</p><p className="text-xs text-slate-400">{u.email_address}</p></div> : <span className="text-slate-300 text-xs">—</span> } },
    { key: 'created_at', label: 'Created', render: (row: AmadeusUser) => new Date(row.created_at).toLocaleDateString('en-MY') },
  ]

  return (
    <div>
      <PageHeader title="Amadeus Users" description="Manage Amadeus login accounts"
        action={<div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export xlsx</button>
          {isAdmin && <><input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Import xlsx</button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Amadeus User</button></>}
        </div>}
      />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search login, OID or name…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        {!loading && <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}{search && ` matching "${search}"`}</span>}
      </div>
      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable columns={columns} data={filtered as unknown as Record<string, unknown>[]} onEdit={isAdmin ? r => openEdit(r as unknown as AmadeusUser) : undefined} onDelete={isAdmin ? r => openDelete(r as unknown as AmadeusUser) : undefined} isAdmin={isAdmin} emptyMessage="No Amadeus users found." />
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Amadeus User' : 'Add Amadeus User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Login <span className="text-red-500">*</span></label>
              <input type="text" value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} placeholder="e.g. JOHNSMITH" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Sign-On ID</label>
              <input type="text" value={form.sign_on_id} onChange={e => setForm(f => ({ ...f, sign_on_id: e.target.value.toUpperCase() }))} placeholder="e.g. JS" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. JS" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Duty Code</label>
              <input type="text" value={form.duty_code} onChange={e => setForm(f => ({ ...f, duty_code: e.target.value.toUpperCase() }))} placeholder="e.g. TP" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">OID</label>
            <input type="text" value={form.oid} onChange={e => setForm(f => ({ ...f, oid: e.target.value.toUpperCase() }))} placeholder="e.g. KULMY255W" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email_address})</option>)}</select></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-2">OTA
          {/* Create & link new user inline */}
          {!form.user_id && (
            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Or create & link a new user</p>
              <p className="text-xs text-slate-400">If the user does not exist yet — fill in their details and they will be added to the Users table automatically. If the email already exists, the existing user will be linked instead.</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
                <input type="email" value={form.newEmail ?? ''} onChange={e => setForm(f => ({ ...f, newEmail: e.target.value }))} placeholder="user@company.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                  <input type="text" value={form.newFirstName ?? ''} onChange={e => setForm(f => ({ ...f, newFirstName: e.target.value }))} placeholder="First name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                  <input type="text" value={form.newLastName ?? ''} onChange={e => setForm(f => ({ ...f, newLastName: e.target.value }))} placeholder="Last name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white" />
                </div>
              </div>
            </div>
          )}</label>
            <div className="flex gap-4">{[true, false].map(v => <label key={String(v)} className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={form.ota === v} onChange={() => setForm(f => ({ ...f, ota: v }))} className="accent-blue-500" /><span className="text-sm text-slate-700">{v ? 'Yes' : 'No'}</span></label>)}</div></div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Amadeus User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Amadeus user <strong>{editing?.login}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={importOpen} onClose={closeImport} title="Import Amadeus Users" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0 ? <p className="font-medium">✅ Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p> : (
                <div className="space-y-1"><p className="font-medium">✅ {importResult.success} imported · ⚠️ {importResult.failed} skipped</p>
                  {importResult.failedRows.map((r, i) => <p key={i} className="text-xs opacity-70 font-mono">{r}</p>)}</div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-slate-600">File: <span className="font-medium">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">{importRows.length} rows — <span className="text-emerald-600 font-medium">{validRows.length} valid</span>{invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} errors</span></>}</p></div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">Download template</button>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                Required: <span className="font-mono font-medium text-slate-700">Login</span> · Optional: <span className="font-mono font-medium text-slate-700">Sign-On ID</span>, <span className="font-mono font-medium text-slate-700">Initial</span>, <span className="font-mono font-medium text-slate-700">Duty Code</span>, <span className="font-mono font-medium text-slate-700">OID</span>, <span className="font-mono font-medium text-slate-700">OTA</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Login','Sign-On','Initial','Duty Code','OID','OTA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-bold">{row.login || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2 font-mono">{row.sign_on_id || '—'}</td>
                        <td className="px-3 py-2">{row.initial || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.duty_code || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.oid || '—'}</td>
                        <td className="px-3 py-2">{row.ota ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2">{row._errors.length === 0 ? <span className="text-emerald-600 font-medium">✓ OK</span> : <span className="text-red-500">✗ {row._errors[0]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invalidRows.length > 0 && <p className="text-xs text-slate-400">⚠️ {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} with errors will be skipped.</p>}
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={closeImport} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">{importResult ? 'Close' : 'Cancel'}</button>
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing…' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
