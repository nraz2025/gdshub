'use client'

import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import DataTable from '@/components/shared/DataTable'
import Modal from '@/components/shared/Modal'
import type { PCCList, GDS } from '@/types'

const EMPTY: Partial<PCCList> = { gds_id: undefined, pcc: '', status: 'Active' }

type PCCStatus = 'Active' | 'Pending' | 'Vacant'
const PCC_STATUSES: PCCStatus[] = ['Active', 'Pending', 'Vacant']

const STATUS_COLORS: Record<string, string> = {
  Active:  'bg-blue-50 text-blue-600 border-blue-200',
  Pending: 'bg-amber-50 text-amber-600 border-amber-200',
  Vacant:  'bg-slate-100 text-slate-500 border-slate-200',
}

interface ImportRow {
  gds_name: string
  pcc: string
  status: PCCStatus
  _row: number
  _errors: string[]
  _gds_id?: number
}

export default function PCCPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [records, setRecords] = useState<PCCList[]>([])
  const [gdsList, setGdsList] = useState<GDS[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGDS, setFilterGDS] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Add / Edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [form, setForm] = useState<Partial<PCCList>>(EMPTY)
  const [editing, setEditing] = useState<PCCList | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    const [{ data: pccData }, { data: gdsData }] = await Promise.all([
      supabase.from('pcc_list').select('*, gds(id, name)').order('pcc'),
      supabase.from('gds').select('*').order('name'),
    ])
    setRecords(pccData ?? [])
    setGdsList(gdsData ?? [])
    setLoading(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setForm({ gds_id: gdsList[0]?.id, pcc: '' })
    setError('')
    setModalOpen(true)
  }

  function openEdit(row: PCCList) {
    setEditing(row)
    setForm({ gds_id: row.gds_id, pcc: row.pcc, status: row.status ?? 'Active' })
    setError('')
    setModalOpen(true)
  }

  function openDelete(row: PCCList) { setEditing(row); setDeleteOpen(true) }

  async function handleSave() {
    if (!form.gds_id) { setError('Please select a GDS.'); return }
    if (!form.pcc?.trim()) { setError('PCC code is required.'); return }
    const pccUpper = form.pcc.trim().toUpperCase()
    setSaving(true); setError('')
    if (editing) {
      const { error } = await supabase.from('pcc_list').update({ gds_id: form.gds_id, pcc: pccUpper, status: form.status ?? 'Active' }).eq('id', editing.id)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('pcc_list').insert({ gds_id: form.gds_id, pcc: pccUpper, status: form.status ?? 'Active' })
      if (error) { setError(error.message); setSaving(false); return }
    }
    setSaving(false); setModalOpen(false); fetchAll()
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    await supabase.from('pcc_list').delete().eq('id', editing.id)
    setSaving(false); setDeleteOpen(false); fetchAll()
  }

  // ── EXPORT ────────────────────────────────────────────────────
  function handleExport() {
    const exportData = filtered.map((r, i) => {
      const gdsName = (r.gds as GDS)?.name ?? gdsList.find(g => g.id === r.gds_id)?.name ?? '—'
      return {
        'No.':      i + 1,
        'GDS':      gdsName,
        'PCC Code': r.pcc,
        'Status':   r.status ?? 'Active',
        'Created':  new Date(r.created_at).toLocaleDateString('en-MY'),
      }
    })
    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [{ wch: 5 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PCC List')
    XLSX.writeFile(wb, `GDSHub_PCC_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── TEMPLATE DOWNLOAD ─────────────────────────────────────────
  function handleDownloadTemplate() {
    const templateData = [
      { 'GDS': 'Sabre',      'PCC Code': 'KULMY217Z', 'Status': 'Active'  },
      { 'GDS': 'Amadeus',    'PCC Code': 'KULMY255W', 'Status': 'Pending' },
      { 'GDS': 'Travelport', 'PCC Code': 'K3MY',      'Status': 'Vacant'  },
    ]
    const ws = XLSX.utils.json_to_sheet(templateData)
    ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'PCC List')
    XLSX.writeFile(wb, 'GDSHub_PCC_Import_Template.xlsx')
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

      // Flexible header resolver
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
        const gds_name   = getField(r, 'GDS', 'gds', 'gds_name', 'gds name', 'platform')
        const pcc        = getField(r, 'PCC Code', 'PCC', 'pcc', 'pcc_code', 'pcccode', 'office id', 'officeid').toUpperCase()
        const status_raw = getField(r, 'Status', 'status', 'pcc_status')
        const status: PCCStatus = (['Active','Pending','Vacant'].includes(status_raw) ? status_raw : 'Active') as PCCStatus

        const errors: string[] = []

        // Validate GDS name matches one we have
        const matched_gds = gdsList.find(g => g.name.toLowerCase() === gds_name.toLowerCase())
        if (!gds_name) {
          errors.push('GDS is required')
        } else if (!matched_gds) {
          errors.push(`GDS "${gds_name}" not found — use Sabre, Amadeus or Travelport`)
        }
        if (!pcc) errors.push('PCC Code is required')

        return {
          gds_name,
          pcc,
          status,
          _row: i + 2,
          _errors: errors,
          _gds_id: matched_gds?.id,
        }
      })

      const foundHeaders = raw.length > 0 ? Object.keys(raw[0]) : []
      setDetectedHeaders(foundHeaders)
      setImportRows(parsed)
      setImportOpen(true)
    }
    reader.readAsBinaryString(file)
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

    for (const row of valid) {
      const { error } = await supabase.from('pcc_list').insert({
        gds_id: row._gds_id,
        pcc:    row.pcc,
        status: row.status,
      })
      if (error) {
        failed++
        failedRows.push(`${row.pcc} (${row.gds_name}) — ${error.message}`)
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
    setDetectedHeaders([])
  }

  // ── HELPERS ───────────────────────────────────────────────────
  const GDS_COLORS: Record<string, string> = {
    Sabre:      'bg-blue-50 text-blue-600 border-blue-200',
    Amadeus:    'bg-purple-50 text-purple-600 border-purple-200',
    Travelport: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  }

  const filtered = records.filter(r => {
    const matchSearch = r.pcc.toLowerCase().includes(search.toLowerCase())
    const matchGDS    = filterGDS === 'all' || String(r.gds_id) === filterGDS
    const matchStatus = filterStatus === 'all' || (r.status ?? 'Active') === filterStatus
    return matchSearch && matchGDS && matchStatus
  })

  const validRows   = importRows.filter(r => r._errors.length === 0)
  const invalidRows = importRows.filter(r => r._errors.length > 0)

  const columns = [
    {
      key: 'status', label: 'Status',
      render: (row: PCCList) => {
        const s = row.status ?? 'Active'
        return (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[s] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {s}
          </span>
        )
      }
    },
    {
      key: 'pcc', label: 'PCC Code',
      render: (row: PCCList) => (
        <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
          {row.pcc}
        </span>
      )
    },
    {
      key: 'gds', label: 'GDS',
      render: (row: PCCList) => {
        const name = (row.gds as GDS)?.name ?? gdsList.find(g => g.id === row.gds_id)?.name ?? '—'
        return (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${GDS_COLORS[name] ?? 'bg-slate-100 text-slate-600'}`}>
            {name}
          </span>
        )
      }
    },
    {
      key: 'created_at', label: 'Created',
      render: (row: PCCList) => new Date(row.created_at).toLocaleDateString('en-MY')
    },
  ]

  return (
    <div>
      <PageHeader
        title="PCC List"
        description="Manage PCC codes by GDS platform"
        action={
          <div className="flex items-center gap-2">
            {/* Export */}
            <button
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export xlsx
            </button>

            {/* Import (admin only) */}
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFilePick} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={gdsList.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 text-sm font-medium rounded-lg border border-slate-200 transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import xlsx
                </button>
              </>
            )}

            {/* Add PCC (admin only) */}
            {isAdmin && (
              <button
                onClick={openAdd}
                disabled={gdsList.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add PCC
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search PCC code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-64 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
        <select
          value={filterGDS}
          onChange={e => setFilterGDS(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All GDS</option>
          {gdsList.map(g => (
            <option key={g.id} value={String(g.id)}>{g.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">All Status</option>
          {PCC_STATUSES.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {!loading && (
          <span className="text-xs text-slate-400">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </span>
        )}
      </div>

      {gdsList.length === 0 && !loading && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          ⚠️ No GDS found. Please add a GDS first before adding PCC records.
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered as unknown as Record<string, unknown>[]}
          onEdit={isAdmin ? (row) => openEdit(row as unknown as PCCList) : undefined}
          onDelete={isAdmin ? (row) => openDelete(row as unknown as PCCList) : undefined}
          isAdmin={isAdmin}
          emptyMessage="No PCC records found."
        />
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit PCC' : 'Add PCC'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">GDS <span className="text-red-500">*</span></label>
            <select
              value={form.gds_id ?? ''}
              onChange={e => setForm(f => ({ ...f, gds_id: Number(e.target.value) }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">— Select GDS —</option>
              {gdsList.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PCC Code <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.pcc ?? ''}
              onChange={e => setForm(f => ({ ...f, pcc: e.target.value.toUpperCase() }))}
              placeholder="e.g. KULMY217Z"
              maxLength={20}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 font-mono uppercase"
            />
            <p className="text-xs text-slate-400 mt-1">Saved in uppercase automatically</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Status</label>
            <select
              value={form.status ?? 'Active'}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as PCCStatus }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
            >
              {PCC_STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add PCC'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Modal ── */}
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete PCC" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete PCC <strong className="font-mono">{editing?.pcc}</strong>? This will also remove linked functionality configurations.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOpen(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} disabled={saving} className="flex-1 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">{saving ? 'Deleting…' : 'Delete'}</button>
          </div>
        </div>
      </Modal>

      {/* ── Import Preview Modal ── */}
      <Modal open={importOpen} onClose={closeImport} title="Import PCC List" size="lg">
        <div className="space-y-4">

          {/* Result banner */}
          {importResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {importResult.failed === 0 ? (
                <p className="font-medium">✅ Successfully imported {importResult.success} PCC record{importResult.success !== 1 ? 's' : ''}.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">✅ {importResult.success} imported &nbsp;·&nbsp; ⚠️ {importResult.failed} skipped</p>
                  {importResult.failedRows.length > 0 && (
                    <div className="max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium mb-1 opacity-80">Skipped rows:</p>
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
                  <p className="text-sm text-slate-600">File: <span className="font-medium text-slate-800">{importFileName}</span></p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {importRows.length} row{importRows.length !== 1 ? 's' : ''} found —{' '}
                    <span className="text-emerald-600 font-medium">{validRows.length} valid</span>
                    {invalidRows.length > 0 && <>, <span className="text-red-500 font-medium">{invalidRows.length} with errors</span></>}
                  </p>
                </div>
                <button onClick={handleDownloadTemplate} className="text-xs text-blue-500 hover:text-blue-700 underline">
                  Download template
                </button>
              </div>

              {/* Column info */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500 space-y-1">
                <div>
                  Required columns:{' '}
                  <span className="font-mono font-medium text-slate-700">GDS</span>,{' '}
                  <span className="font-mono font-medium text-slate-700">PCC Code</span>
                  {' '}· Optional: <span className="font-mono font-medium text-slate-700">Status</span>{' '}
                  (Active / Pending / Vacant — defaults to Active)
                </div>
                <div>
                  GDS values must be exactly:{' '}
                  {gdsList.map((g, i) => (
                    <span key={g.id}>
                      <span className="font-mono font-medium text-slate-700">{g.name}</span>
                      {i < gdsList.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
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
                      <th className="text-left px-3 py-2 font-medium text-slate-500">GDS</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">PCC Code</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${row._errors.length > 0 ? 'bg-red-50/60' : ''}`}>
                        <td className="px-3 py-2 text-slate-400">{row._row}</td>
                        <td className="px-3 py-2">
                          {row.gds_name ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${GDS_COLORS[row.gds_name] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                              {row.gds_name}
                            </span>
                          ) : <span className="text-red-400 italic">empty</span>}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-700">
                          {row.pcc || <span className="text-red-400 italic font-normal">empty</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {row.status}
                          </span>
                        </td>
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
                {importing ? 'Importing…' : `Import ${validRows.length} PCC${validRows.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
