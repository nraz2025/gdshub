'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { Organisation, PCCList, GDS } from '@/types'

const EMPTY = { organisation: '', iata: '' }

interface ImportRow {
  organisation: string; iata: string
  _row: number; _errors: string[]
}

export default function OrganisationPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [records, setRecords] = useState<Organisation[]>([])
  const [pccList, setPccList] = useState<PCCList[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pccOpen, setPccOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<Organisation | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null)
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
    const [{ data: orgData }, { data: pccData }] = await Promise.all([
      supabase.from('organisation').select('*').order('organisation'),
      supabase.from('pcc_list').select('*, gds:gds_id(id, name), organisation:org_id(id, organisation, iata)').order('pcc'),
    ])
    setRecords(orgData ?? [])
    setPccList(pccData ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() { setEditing(null); setForm(EMPTY); setError(''); setModalOpen(true) }
  function openEdit(row: Organisation) {
    setEditing(row)
    setForm({ organisation: row.organisation, iata: row.iata ?? '' })
    setError(''); setModalOpen(true)
  }
  function openDelete(row: Organisation) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.organisation.trim()) { setError('Organisation name is required.'); return }
    setSaving(true); setError('')
    const payload = { organisation: form.organisation.trim(), iata: form.iata.trim().toUpperCase() || null }
    const { error: err } = editing
      ? await supabase.from('organisation').update(payload).eq('id', editing.id)
      : await supabase.from('organisation').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('organisation').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── VIEW LINKED PCCs ─────────────────────────────────────────
  function openPCCs(row: Organisation) { setSelectedOrg(row); setPccOpen(true) }
  function linkedPCCs(orgId: number) { return pccList.filter(p => p.org_id === orgId) }

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const data = filtered.map((r, i) => {
      const linked = linkedPCCs(r.id)
      return {
        'No.': i + 1,
        'Organisation': r.organisation,
        'IATA': r.iata ?? '',
        'Linked PCCs': linked.map(p => p.pcc).join(', '),
        'PCC Count': linked.length,
        'Created': new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 5 }, { wch: 35 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Organisations')
    XLSX.writeFile(wb, `GDSHub_Organisations_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleDownloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { 'Organisation': 'PST Travel Services Sdn Bhd', 'IATA': '12345678' },
      { 'Organisation': 'Example Travel Agency',       'IATA': '87654321' },
    ])
    ws['!cols'] = [{ wch: 40 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Organisations')
    XLSX.writeFile(wb, 'GDSHub_Organisation_Template.xlsx')
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
        const organisation = getF(r, 'Organisation', 'organisation', 'org', 'company', 'name')
        const iata = getF(r, 'IATA', 'iata', 'iata_code').toUpperCase()
        const errors: string[] = []
        if (!organisation) errors.push('Organisation name is required')
        return { organisation, iata, _row: i + 2, _errors: errors }
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
      const { error } = await supabase.from('organisation').insert({
        organisation: row.organisation, iata: row.iata || null
      })
      if (error) { failed++; failedRows.push(`${row.organisation} — ${error.message}`) } else { success++ }
    }
    setImporting(false); setImportResult({ success, failed, failedRows })
    if (success > 0) fetchAll()
  }

  function closeImport() { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportResult(null) }

  const GDS_COLORS: Record<string, string> = {
    Sabre:      'bg-blue-50 text-blue-600 border-blue-200',
    Amadeus:    'bg-purple-50 text-purple-600 border-purple-200',
    Travelport: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  }

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    return r.organisation.toLowerCase().includes(term) || (r.iata ?? '').toLowerCase().includes(term)
  })

  const validRows = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    { key: 'organisation', label: 'Organisation', render: (row: Organisation) => <span className="font-medium text-slate-800">{row.organisation}</span> },
    { key: 'iata', label: 'IATA', render: (row: Organisation) => row.iata ? <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{row.iata}</span> : <span className="text-slate-300 text-xs">—</span> },
    {
      key: 'pcc_count', label: 'Linked PCCs',
      render: (row: Organisation) => {
        const count = linkedPCCs(row.id).length
        return count > 0
          ? <button onClick={() => openPCCs(row)} className="text-xs font-medium text-blue-600 hover:text-blue-800 underline">{count} PCC{count !== 1 ? 's' : ''}</button>
          : <span className="text-slate-300 text-xs">None</span>
      }
    },
    { key: 'created_at', label: 'Created', render: (row: Organisation) => new Date(row.created_at).toLocaleDateString('en-MY') },
  ]

  const selectedPCCs = selectedOrg ? linkedPCCs(selectedOrg.id) : []

  return (
    <div>
      <PageHeader
        title="Organisation"
        description="Manage organisations and link them to PCC codes"
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
                  Add Organisation
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="text" placeholder="Search organisation or IATA…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-80 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
        {!loading && <span className="text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}{search && ` matching "${search}"`}</span>}
      </div>

      {loading ? <div className="text-center py-16 text-slate-400 text-sm">Loading…</div> : (
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          onEdit={isAdmin ? r => openEdit(r as unknown as Organisation) : undefined}
          onDelete={isAdmin ? r => openDelete(r as unknown as Organisation) : undefined}
          isAdmin={isAdmin}
          emptyMessage="No organisations found."
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Organisation' : 'Add Organisation'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Organisation Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.organisation} onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} placeholder="e.g. PST Travel Services Sdn Bhd" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">IATA Code</label>
            <input type="text" value={form.iata} onChange={e => setForm(f => ({ ...f, iata: e.target.value.toUpperCase() }))} placeholder="e.g. 12345678" maxLength={20} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-mono uppercase" />
            <p className="text-xs text-slate-400 mt-1">Optional — 8-digit IATA accreditation number</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Organisation'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Organisation" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete <strong>{editing?.organisation}</strong>? PCC links will be unset but PCCs themselves will not be deleted.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Linked PCCs Modal ── */}
      <Modal open={pccOpen} onClose={() => setPccOpen(false)} title={`PCCs — ${selectedOrg?.organisation}`} size="md">
        <div className="space-y-3">
          {selectedPCCs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No PCCs linked to this organisation.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">PCC Code</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">GDS</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPCCs.map((pcc, i) => {
                    const gdsName = (pcc.gds as GDS)?.name ?? ''
                    return (
                      <tr key={pcc.id} className={i < selectedPCCs.length - 1 ? 'border-b border-slate-50' : ''}>
                        <td className="px-4 py-2.5"><span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">{pcc.pcc}</span></td>
                        <td className="px-4 py-2.5">
                          {gdsName && <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[gdsName] ?? 'bg-slate-100 text-slate-600'}`}>{gdsName}</span>}
                        </td>
                        <td className="px-4 py-2.5"><span className="text-xs text-slate-500">{pcc.status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={() => setPccOpen(false)} className="px-6 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors">Close</button>
          </div>
        </div>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import Organisations" size="lg">
        <div className="space-y-4">
          {importResult ? (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0
                ? <p className="font-medium">✅ Imported {importResult.success} organisation{importResult.success !== 1 ? 's' : ''}.</p>
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
                Required: <span className="font-mono font-medium text-slate-700">Organisation</span> · Optional: <span className="font-mono font-medium text-slate-700">IATA</span>
              </div>
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>{['Row','Organisation','IATA','Validation'].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-slate-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2 font-medium">{row.organisation || <span className="text-red-400 italic font-normal">empty</span>}</td>
                        <td className="px-3 py-2 font-mono">{row.iata || '—'}</td>
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
            {!importResult && <button onClick={handleImportConfirm} disabled={importing || validRows.length === 0} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{importing ? 'Importing…' : `Import ${validRows.length} Organisation${validRows.length !== 1 ? 's' : ''}`}</button>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
