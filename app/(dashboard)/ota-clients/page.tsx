'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import { getAuditFields } from '@/lib/audit'
import type { OTAClient } from '@/types'

interface SabreRow   { id: number; epr: string; initial: string | null; pcc: string | null; status: string }
interface AmadeusRow { id: number; login: string; sign_on_id: string | null; oid: string | null; duty_code: string | null }
interface TravelportRow { id: number; sign_on_id: string | null; cid: string | null; pcc: string | null }

interface GDSLogins {
  sabre: SabreRow[]
  amadeus: AmadeusRow[]
  travelport: TravelportRow[]
}

const EMPTY = { company_name: '', remarks: '' }

interface ImportRow { company_name: string; _row: number; _errors: string[] }

export default function OTAClientPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<OTAClient[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<OTAClient | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // GDS Logins popup
  const [loginsOpen, setLoginsOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<OTAClient | null>(null)
  const [gdsLogins, setGdsLogins] = useState<GDSLogins>({ sabre: [], amadeus: [], travelport: [] })
  const [loginsLoading, setLoginsLoading] = useState(false)

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
    const { data } = await supabase.from('ota_client').select('*').order('company_name')
    setRecords(data ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setSaving(false); setModalOpen(true) }
  function openEdit(row: OTAClient) { setEditing(row); setForm({ company_name: row.company_name, remarks: (row as OTAClient & {remarks?: string}).remarks ?? '' }); setError(''); setSaving(false); setModalOpen(true) }
  function openDelete(row: OTAClient) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.company_name.trim()) { setError('Company name is required.'); return }
    setSaving(true); setError('')
    const audit = await getAuditFields()
    const payload = { company_name: form.company_name.trim(), remarks: (form as {remarks?: string}).remarks?.trim() || null }
    const { error: err } = editing
      ? await supabase.from('ota_client').update({ ...payload, ...audit }).eq('id', editing.id)
      : await supabase.from('ota_client').insert({ ...payload, ...audit })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('ota_client').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── GDS LOGINS POPUP ─────────────────────────────────────────
  async function openLogins(row: OTAClient) {
    setSelectedClient(row)
    setLoginsOpen(true)
    setLoginsLoading(true)
    const [{ data: sabreData }, { data: amData }, { data: tpData }] = await Promise.all([
      supabase.from('sabre_user').select('id, epr, initial, pcc, status').eq('ota_client_id', row.id).order('epr'),
      supabase.from('amadeus_user').select('id, login, sign_on_id, oid, duty_code').eq('ota_client_id', row.id).order('login'),
      supabase.from('travelport_user').select('id, sign_on_id, cid, pcc').eq('ota_client_id', row.id).order('sign_on_id'),
    ])
    setGdsLogins({ sabre: sabreData ?? [], amadeus: amData ?? [], travelport: tpData ?? [] })
    setLoginsLoading(false)
  }

  const totalLogins = (client: OTAClient) => {
    // We'll show the count from the current gdsLogins only when that client is selected
    return null // count shown in popup
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const data = filtered.map((r, i) => ({
      'No.': i + 1,
      'Company Name': r.company_name,
      'Created': new Date(r.created_at).toLocaleDateString('en-MY'),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Client')
    XLSX.writeFile(wb, `GDSHub_Client_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([{ 'Company Name': 'Example Travel Sdn Bhd' }])
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

  const filtered = records.filter(r => r.company_name.toLowerCase().includes(search.toLowerCase()))
  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const totalGdsLogins = gdsLogins.sabre.length + gdsLogins.amadeus.length + gdsLogins.travelport.length

  // ── COLUMNS ───────────────────────────────────────────────────
  const columns = [
    {
      key: 'company_name', label: 'Company Name', width: '260px',
      render: (row: OTAClient) => <span className="font-medium text-slate-800">{row.company_name}</span>
    },
    {
      key: 'remarks', label: 'Remarks', width: '380px',
      render: (row: OTAClient & {remarks?: string}) => {
        if (!row.remarks) return <span className="text-slate-300 text-xs">—</span>
        const points = row.remarks.split('\n').map((l: string) => l.trim()).filter(Boolean)
        return points.length > 1 ? (
          <ul className="list-disc list-inside space-y-0.5">
            {points.map((p: string, i: number) => <li key={i} className="text-sm text-slate-600">{p}</li>)}
          </ul>
        ) : <span className="text-sm text-slate-600">{row.remarks}</span>
      }
    },
    {
      key: 'modified_at', label: 'Last Modified',
      render: (row: OTAClient) => {
        const r = row as OTAClient & {modified_at?: string; modified_by?: string}
        if (!r.modified_at) return <span className="text-slate-300 text-xs">—</span>
        return (
          <div>
            <p className="text-xs text-slate-600">{new Date(r.modified_at).toLocaleDateString('en-MY')}</p>
            {r.modified_by && <p className="text-xs text-slate-400">{r.modified_by}</p>}
          </div>
        )
      }
    },
    {
      key: 'created_at', label: 'Created', width: '120px',
      render: (row: OTAClient) => new Date(row.created_at).toLocaleDateString('en-MY')
    },
  ]

  return (
    <div>
      <PageHeader
        title="Client"
        description="Manage client companies and view their GDS login accounts"
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
                  Add Client
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search by company name…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-80 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
        {!loading && <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}{search && ` matching "${search}"`}</span>}
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable columns={columns} data={filtered as unknown as Record<string, unknown>[]} onEdit={isAdmin ? r => openEdit(r as unknown as OTAClient) : undefined} onDelete={isAdmin ? r => openDelete(r as unknown as OTAClient) : undefined} isAdmin={isAdmin} emptyMessage="No clients found." />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Client' : 'Add Client'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="e.g. PST Travel Services Sdn Bhd" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Remarks</label>
            <textarea
              value={(form as {remarks?: string}).remarks ?? ''}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              placeholder="Additional notes (one per line for bullet points)…"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
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

      {/* ── GDS Logins Popup ── */}
      <Modal open={loginsOpen} onClose={() => { setLoginsOpen(false); setSelectedClient(null) }} title={`GDS Logins — ${selectedClient?.company_name}`} size="lg">
        {loginsLoading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading GDS logins…</div>
        ) : (
          <div className="space-y-5">
            {totalGdsLogins === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">No GDS logins assigned to this client yet.</p>
                <p className="text-slate-400 text-xs mt-1">Set the OTA Client field on Sabre, Amadeus, or Travelport user records to link them here.</p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500 font-medium">{totalGdsLogins} login{totalGdsLogins !== 1 ? 's' : ''} total</span>
                  {gdsLogins.sabre.length > 0      && <span className="bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded-full font-medium">Sabre: {gdsLogins.sabre.length}</span>}
                  {gdsLogins.amadeus.length > 0    && <span className="bg-purple-50 text-purple-600 border border-purple-200 px-2.5 py-1 rounded-full font-medium">Amadeus: {gdsLogins.amadeus.length}</span>}
                  {gdsLogins.travelport.length > 0 && <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">Travelport: {gdsLogins.travelport.length}</span>}
                </div>

                {/* Sabre */}
                {gdsLogins.sabre.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">Sabre</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {['EPR','Initial','PCC','Status'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gdsLogins.sabre.map((r, i) => (
                            <tr key={r.id} className={i < gdsLogins.sabre.length - 1 ? 'border-b border-slate-50' : ''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.epr}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.initial ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc ?? '—'}</td>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${r.status === 'Active' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{r.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Amadeus */}
                {gdsLogins.amadeus.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-full">Amadeus</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {['Login','Sign-On ID','OID','Duty Code'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gdsLogins.amadeus.map((r, i) => (
                            <tr key={r.id} className={i < gdsLogins.amadeus.length - 1 ? 'border-b border-slate-50' : ''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.login}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.sign_on_id ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.oid ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.duty_code ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Travelport */}
                {gdsLogins.travelport.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">Travelport</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            {['Sign-On ID','CID','PCC'].map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {gdsLogins.travelport.map((r, i) => (
                            <tr key={r.id} className={i < gdsLogins.travelport.length - 1 ? 'border-b border-slate-50' : ''}>
                              <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.sign_on_id ?? '—'}</span></td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.cid ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{r.pcc ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={() => { setLoginsOpen(false); setSelectedClient(null) }} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Close</button>
            </div>
          </div>
        )}
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
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Company Name','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
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
