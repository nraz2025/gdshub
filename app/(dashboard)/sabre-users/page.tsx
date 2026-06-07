'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { SabreUser, User, OTAClient } from '@/types'
import { syncUserToTable, syncUserToOTAClient } from '@/lib/syncUser'

type SabreStatus = 'Active' | 'Vacant'
const STATUSES: SabreStatus[] = ['Active', 'Vacant']
const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-blue-50 text-blue-600 border-blue-200',
  Vacant: 'bg-slate-100 text-slate-500 border-slate-200',
}

const EMPTY = {
  epr: '', initial: '', status: 'Active' as SabreStatus,
  pcc: '', user_id: '', ota_client_id: '' as number | '',
  cta: '', pta: '', minicom: '',
  newEmail: '', newFirstName: '', newLastName: '',
  newEmail: '', newFirstName: '', newLastName: '',
}

interface ImportRow {
  epr: string; initial: string; status: string; pcc: string
  cta: string; pta: string; minicom: string
  _row: number; _errors: string[]
}

export default function SabreUsersPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<SabreUser[]>([])
  const [usersList, setUsersList] = useState<User[]>([])
  const [otaClients, setOtaClients] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<SabreUser | null>(null)
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
    const [{ data: sabreData }, { data: usersData }, { data: otaData }] = await Promise.all([
      supabase.from('sabre_user')
        .select('*, users:user_id(id, first_name, last_name, email_address), ota_client:ota_client_id(id, company_name)')
        .order('epr'),
      supabase.from('users').select('id, first_name, last_name, email_address').order('first_name'),
      supabase.from('ota_client').select('id, company_name').order('company_name'),
    ])
    setRecords(sabreData ?? [])
    setUsersList(usersData ?? [])
    setOtaClients(otaData ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }

  function openEdit(row: SabreUser) {
    setEditing(row)
    setForm({
      epr: row.epr,
      initial: row.initial ?? '',
      status: row.status,
      pcc: row.pcc ?? '',
      user_id: row.user_id ?? '',
      ota_client_id: row.ota_client_id ?? '',
      cta: row.cta ?? '',
      pta: row.pta ?? '',
      minicom: row.minicom ?? '',
      newEmail: '', newFirstName: '', newLastName: '',
    })
    setError(''); setSaving(false); setModalOpen(true)
  }

  function openDelete(row: SabreUser) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.epr.trim()) { setError('EPR is required.'); return }
    setSaving(true); setError('')

    // Auto-sync: if admin entered a new email, ensure user exists in users table
    let resolvedUserId = form.user_id || null
    if (form.newEmail?.trim()) {
      const synced = await syncUserToTable({
        email:     form.newEmail,
        firstName: form.newFirstName ?? '',
        lastName:  form.newLastName  ?? '',
      })
      if (synced) {
        resolvedUserId = synced
      }
    }

    const payload = {
      epr:           form.epr.trim().toUpperCase(),
      initial:       form.initial.trim().toUpperCase() || null,
      status:        form.status,
      pcc:           form.pcc.trim().toUpperCase() || null,
      user_id:       resolvedUserId,
      ota_client_id: form.ota_client_id || null,
      cta:           form.cta.trim() || null,
      pta:           form.pta.trim() || null,
      minicom:       form.minicom.trim() || null,
    }
    const { error: err } = editing
      ? await supabase.from('sabre_user').update(payload).eq('id', editing.id)
      : await supabase.from('sabre_user').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    // Sync ota_client_users junction table
    if (resolvedUserId) {
      const prevOtaId = editing?.ota_client_id ?? null
      const newOtaId  = form.ota_client_id ? Number(form.ota_client_id) : null

      // OTA was removed or changed — remove the old link
      if (prevOtaId && prevOtaId !== newOtaId) {
        await supabase.from('ota_client_users')
          .delete()
          .eq('ota_client_id', prevOtaId)
          .eq('user_id', resolvedUserId)
      }

      // OTA is set — add new link (if not already there)
      if (newOtaId) {
        await syncUserToOTAClient({ userId: resolvedUserId, otaClientId: newOtaId })
      }
    }

    // If OTA was cleared and no user_id, still clean up old link
    if (!resolvedUserId && editing?.user_id && editing?.ota_client_id) {
      await supabase.from('ota_client_users')
        .delete()
        .eq('ota_client_id', editing.ota_client_id)
        .eq('user_id', editing.user_id)
    }

    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('sabre_user').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  function handleExport() {
    const data = filtered.map((r, i) => {
      const u = r.users as User
      const ota = r.ota_client as OTAClient
      return {
        'No.':         i + 1,
        'EPR':         r.epr,
        'Initial':     r.initial ?? '',
        'Status':      r.status,
        'PCC':         r.pcc ?? '',
        'OTA Client':  ota?.company_name ?? '',
        'Linked User': u ? `${u.first_name} ${u.last_name}` : '',
        'CTA':         r.cta ?? '',
        'PTA':         r.pta ?? '',
        'Minicom':     r.minicom ?? '',
        'Created':     new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sabre Users')
    XLSX.writeFile(wb, `GDSHub_Sabre_Users_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'EPR': 'AB1', 'Initial': 'AB', 'Status': 'Active', 'PCC': 'KULMY217Z', 'CTA': 'CTA-2024-001', 'PTA': '', 'Minicom': 'MC-456' },
      { 'EPR': 'CD2', 'Initial': 'CD', 'Status': 'Vacant', 'PCC': 'KULMY217Z', 'CTA': '',              'PTA': 'PTA-88',   'Minicom': '' },
    ])
    ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sabre Users')
    XLSX.writeFile(wb, 'GDSHub_Sabre_Users_Template.xlsx')
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
        const epr     = getF(r, 'EPR', 'epr').toUpperCase()
        const initial = getF(r, 'Initial', 'initial').toUpperCase()
        const status  = getF(r, 'Status', 'status')
        const pcc     = getF(r, 'PCC', 'pcc').toUpperCase()
        const cta     = getF(r, 'CTA', 'cta')
        const pta     = getF(r, 'PTA', 'pta')
        const minicom = getF(r, 'Minicom', 'minicom')
        const errors: string[] = []
        if (!epr) errors.push('EPR is required')
        if (status && !STATUSES.includes(status as SabreStatus)) errors.push('Status must be Active or Vacant')
        return { epr, initial, status: status || 'Active', pcc, cta, pta, minicom, _row: i + 2, _errors: errors }
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
      const { error } = await supabase.from('sabre_user').insert({
        epr: row.epr, initial: row.initial || null, status: row.status,
        pcc: row.pcc || null, cta: row.cta || null, pta: row.pta || null, minicom: row.minicom || null,
      })
      if (error) { failed++; failedRows.push(`${row.epr} — ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const filtered = records.filter(r => {
    const u = r.users as User
    const ota = r.ota_client as OTAClient
    const name = u ? `${u.first_name} ${u.last_name}`.toLowerCase() : ''
    const term = search.toLowerCase()
    const matchSearch = r.epr.toLowerCase().includes(term)
      || (r.pcc ?? '').toLowerCase().includes(term)
      || name.includes(term)
      || (ota?.company_name ?? '').toLowerCase().includes(term)
    const matchStatus = filterStatus === 'all' || r.status === filterStatus
    return matchSearch && matchStatus
  })

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'epr',     label: 'EPR',     render: (row: SabreUser) => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{row.epr}</span> },
    { key: 'initial', label: 'Initial', render: (row: SabreUser) => <span className="text-slate-600">{row.initial ?? '—'}</span> },
    { key: 'status',  label: 'Status',  render: (row: SabreUser) => <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[row.status]}`}>{row.status}</span> },
    { key: 'pcc',     label: 'PCC',     render: (row: SabreUser) => <span className="font-mono text-xs text-slate-600">{row.pcc ?? '—'}</span> },
    {
      key: 'ota_client_id', label: 'OTA Client',
      render: (row: SabreUser) => {
        const ota = row.ota_client as OTAClient
        return ota
          ? <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">{ota.company_name}</span>
          : <span className="text-slate-300 text-xs">—</span>
      }
    },
    {
      key: 'user_id', label: 'Linked User',
      render: (row: SabreUser) => {
        const u = row.users as User
        return u
          ? <div><p className="text-sm text-slate-700 font-medium">{u.first_name} {u.last_name}</p><p className="text-xs text-slate-400">{u.email_address}</p></div>
          : <span className="text-slate-300 text-xs">—</span>
      }
    },
    { key: 'cta',     label: 'CTA',     render: (row: SabreUser) => row.cta ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.cta}</span> : <span className="text-slate-300 text-xs">—</span> },
    { key: 'pta',     label: 'PTA',     render: (row: SabreUser) => row.pta ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.pta}</span> : <span className="text-slate-300 text-xs">—</span> },
    { key: 'minicom', label: 'Minicom', render: (row: SabreUser) => row.minicom ? <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{row.minicom}</span> : <span className="text-slate-300 text-xs">—</span> },
    { key: 'created_at', label: 'Created', render: (row: SabreUser) => new Date(row.created_at).toLocaleDateString('en-MY') },
  ]

  return (
    <div>
      <PageHeader
        title="Sabre Users"
        description="Manage Sabre EPR accounts"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
            <button onClick={handleExport} disabled={filtered.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export xlsx
            </button>
            )}
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import xlsx
                </button>
                <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Sabre User
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search EPR, PCC, OTA or name…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400">
          <option value="all">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {!loading && <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}{search && ` matching "${search}"`}</span>}
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable columns={columns} data={filtered as unknown as Record<string, unknown>[]} onEdit={isAdmin ? r => openEdit(r as unknown as SabreUser) : undefined} onDelete={isAdmin ? r => openDelete(r as unknown as SabreUser) : undefined} isAdmin={isAdmin} emptyMessage="No Sabre users found." />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Sabre User' : 'Add Sabre User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">EPR <span className="text-red-500">*</span></label>
              <input type="text" value={form.epr} onChange={e => setForm(f => ({ ...f, epr: e.target.value.toUpperCase() }))} placeholder="e.g. AB1" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Initial</label>
              <input type="text" value={form.initial} onChange={e => setForm(f => ({ ...f, initial: e.target.value.toUpperCase() }))} placeholder="e.g. AB" maxLength={5} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SabreStatus }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC</label>
              <input type="text" value={form.pcc} onChange={e => setForm(f => ({ ...f, pcc: e.target.value.toUpperCase() }))} placeholder="e.g. KULMY217Z" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono uppercase" />
            </div>
          </div>

          {/* OTA Client — from ota_client table */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">OTA Client</label>
            <select value={form.ota_client_id} onChange={e => setForm(f => ({ ...f, ota_client_id: e.target.value ? Number(e.target.value) : '' }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {otaClients.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}
            </select>
          </div>

          {/* Linked User — from users table */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Linked User</label>
            <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white">
              <option value="">— None —</option>
              {usersList.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} — {u.email_address}</option>)}
            </select>
          </div>

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
          )}

          {/* CTA, PTA, Minicom — freetext license */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">CTA License</label>
            <input type="text" value={form.cta} onChange={e => setForm(f => ({ ...f, cta: e.target.value }))} placeholder="e.g. CTA-2024-001" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PTA License</label>
            <input type="text" value={form.pta} onChange={e => setForm(f => ({ ...f, pta: e.target.value }))} placeholder="e.g. PTA-88" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Minicom License</label>
            <input type="text" value={form.minicom} onChange={e => setForm(f => ({ ...f, minicom: e.target.value }))} placeholder="e.g. MC-456" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono" />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add User'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Sabre User" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete Sabre user <strong className="font-mono">{editing?.epr}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Sabre Users" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-medium">✅ Imported {importResult.success} record{importResult.success !== 1 ? 's' : ''}.</p>
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
                Required: <span className="font-mono font-medium text-slate-700">EPR</span> · Optional: <span className="font-mono font-medium text-slate-700">Initial</span>, <span className="font-mono font-medium text-slate-700">Status</span> (Active/Vacant), <span className="font-mono font-medium text-slate-700">PCC</span>, <span className="font-mono font-medium text-slate-700">CTA</span>, <span className="font-mono font-medium text-slate-700">PTA</span>, <span className="font-mono font-medium text-slate-700">Minicom</span>
                <br/>Note: OTA Client and Linked User must be assigned manually after import.
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','EPR','Initial','Status','PCC','CTA','PTA','Minicom','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-bold">{row.epr || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2">{row.initial || '—'}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>{row.status}</span></td>
                        <td className="px-3 py-2 font-mono">{row.pcc || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.cta || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.pta || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.minicom || '—'}</td>
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
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing…' : `Import ${validRows.length} Record${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
