'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'

interface VendorContract {
  id: number
  vendor: string
  doc_type: 'Main Contract' | 'Addendum'
  label: string
  contract_number: string | null
  start_date: string | null
  end_date: string | null
  notes: string | null
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

// Dark theme (matches the rest of GDSHub's GDS-group pages)
const D = {
  bg: '#0e1117', card: '#1c2129', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681',
  accent: '#39d2c0', accentSoft: 'rgba(57,210,192,0.10)',
  success: '#3fb950', successSoft: 'rgba(63,185,80,0.10)',
  purple: '#a371f7', purpleSoft: 'rgba(163,113,247,0.10)',
  warning: '#d29922', warningSoft: 'rgba(210,153,34,0.10)',
  orange: '#f78166', orangeSoft: 'rgba(247,129,102,0.10)',
  blue: '#58a6ff', blueSoft: 'rgba(88,166,255,0.10)',
  danger: '#f85149', dangerSoft: 'rgba(248,81,73,0.10)',
}

const SUGGESTED_VENDORS = ['Amadeus', 'Travelport', 'Sabre', 'SkyTravel']
const BUCKET = 'vendor-contracts'
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
const MAX_SIZE = 20 * 1024 * 1024

function getStatus(endDate: string | null): { label: string; color: string; soft: string } {
  if (!endDate) return { label: 'No Expiry', color: D.fgMuted, soft: 'rgba(139,148,158,0.10)' }
  const end = new Date(endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((end.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return { label: 'Expired', color: D.danger, soft: D.dangerSoft }
  if (diffDays <= 60) return { label: `Expiring (${diffDays}d)`, color: D.warning, soft: D.warningSoft }
  return { label: 'Active', color: D.success, soft: D.successSoft }
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = {
  vendor: '',
  doc_type: 'Main Contract' as 'Main Contract' | 'Addendum',
  label: '',
  contract_number: '',
  start_date: '',
  end_date: '',
  notes: '',
}

export default function ContractPage() {
  const supabase = createClient()
  const [records, setRecords] = useState<VendorContract[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)   // can view (admin or manager)
  const [canEdit, setCanEdit] = useState(false)   // can upload/delete (admin only)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = profile?.role ?? 'user'
      setIsAdmin(role === 'admin' || role === 'manager')
      setCanEdit(role === 'admin')
    }
    const { data } = await supabase.from('vendor_contracts').select('*').order('vendor').order('doc_type').order('created_at', { ascending: false })
    setRecords((data as VendorContract[]) ?? [])
    setLoading(false)
  }

  const knownVendors = Array.from(new Set([...SUGGESTED_VENDORS, ...records.map(r => r.vendor)])).sort()

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    if (!term) return true
    return r.vendor.toLowerCase().includes(term) || r.label.toLowerCase().includes(term) || (r.contract_number ?? '').toLowerCase().includes(term)
  })

  // Group by vendor
  const byVendor = filtered.reduce((acc, r) => {
    (acc[r.vendor] = acc[r.vendor] ?? []).push(r)
    return acc
  }, {} as Record<string, VendorContract[]>)
  const vendorNames = Object.keys(byVendor).sort()

  function vendorStatus(vendor: string) {
    const mains = byVendor[vendor].filter(r => r.doc_type === 'Main Contract')
    if (mains.length === 0) return getStatus(null)
    // Prefer the main contract with the latest end_date (most current)
    const withDates = mains.filter(m => m.end_date)
    const pick = withDates.length > 0
      ? withDates.reduce((a, b) => (new Date(a.end_date as string) > new Date(b.end_date as string) ? a : b))
      : mains[0]
    return getStatus(pick.end_date)
  }

  function toggleCollapse(vendor: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(vendor)) next.delete(vendor); else next.add(vendor)
      return next
    })
  }

  function openUpload(prefillVendor?: string) {
    setForm({ ...EMPTY_FORM, vendor: prefillVendor ?? '' })
    setFile(null)
    setUploadError('')
    setModalOpen(true)
  }

  function handlePickFile(f: File) {
    setUploadError('')
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.includes(ext)) { setUploadError('Only PDF, Word (doc/docx) or images (jpg/png) are allowed.'); return }
    if (f.size > MAX_SIZE) { setUploadError('File must be under 20MB.'); return }
    setFile(f)
  }

  async function handleUpload() {
    setUploadError('')
    if (!form.vendor.trim()) { setUploadError('Vendor is required.'); return }
    if (!form.label.trim()) { setUploadError('Label is required (e.g. "Main Contract 2024-2026" or "Addendum 1").'); return }
    if (!file) { setUploadError('Please choose a file to upload.'); return }

    setUploading(true)
    const safeVendor = form.vendor.trim().replace(/[^a-zA-Z0-9-_]/g, '_')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${safeVendor}/${form.doc_type === 'Addendum' ? 'addendum' : 'main'}/${Date.now()}_${safeName}`

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (uploadErr) { setUploadError(uploadErr.message); setUploading(false); return }

    const { error: insertErr } = await supabase.from('vendor_contracts').insert({
      vendor: form.vendor.trim(),
      doc_type: form.doc_type,
      label: form.label.trim(),
      contract_number: form.contract_number.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
    })
    if (insertErr) { setUploadError(insertErr.message); setUploading(false); return }

    setUploading(false)
    setModalOpen(false)
    fetchAll()
  }

  async function handleDownload(r: VendorContract) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.file_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(r: VendorContract) {
    if (!window.confirm(`Delete "${r.label}"? This cannot be undone.`)) return
    await supabase.storage.from(BUCKET).remove([r.file_path])
    await supabase.from('vendor_contracts').delete().eq('id', r.id)
    fetchAll()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', Inter, system-ui, sans-serif", background: D.bg, minHeight: '100vh', color: D.fg }}>
      <div style={{ padding: '32px 28px 40px' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px', color: D.fg, margin: 0 }}>Contract</h1>
            <p style={{ fontSize: '13px', color: D.fgMuted, marginTop: '5px' }}>Vendor & GDS contracts and their addenda</p>
          </div>
          {canEdit && (
            <button onClick={() => openUpload()}
              style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 17px', background: D.accent, border: `1px solid ${D.accent}`, borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Upload Document
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ position: 'relative', maxWidth: '420px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by vendor, label or contract number..."
              style={{ width: '100%', padding: '10px 14px 10px 34px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', color: D.fg, fontSize: '14px', outline: 'none' }} />
          </div>
        </div>

        {/* Vendor groups */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: D.fgMuted, fontSize: '15px' }}>Loading</div>
        ) : vendorNames.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: D.fgDim, fontSize: '15px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px' }}>
            No contracts uploaded yet.{canEdit ? ' Click "Upload Document" to add the first one.' : ''}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {vendorNames.map(vendor => {
              const docs = byVendor[vendor]
              const st = vendorStatus(vendor)
              const isCollapsed = collapsed.has(vendor)
              return (
                <div key={vendor} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div onClick={() => toggleCollapse(vendor)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: D.fg }}>{vendor}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: D.accentSoft, color: D.accent }}>{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: st.soft, color: st.color }}>{st.label}</span>
                      {canEdit && (
                        <button onClick={e => { e.stopPropagation(); openUpload(vendor) }}
                          style={{ fontSize: '13px', color: D.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          + Add document
                        </button>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div style={{ borderTop: `1px solid ${D.border}` }}>
                      {docs.map((r, i) => {
                        const rowStatus = getStatus(r.end_date)
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderBottom: i < docs.length - 1 ? `1px solid ${D.border}` : 'none', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.04em', background: r.doc_type === 'Main Contract' ? D.blueSoft : D.purpleSoft, color: r.doc_type === 'Main Contract' ? D.blue : D.purple, flexShrink: 0 }}>
                                {r.doc_type === 'Main Contract' ? 'Main' : 'Addendum'}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: D.fg, wordBreak: 'break-word' }}>{r.label}</div>
                                <div style={{ fontSize: '12px', color: D.fgDim, marginTop: '2px' }}>
                                  {r.contract_number && <span style={{ fontFamily: 'monospace' }}>{r.contract_number}</span>}
                                  {r.contract_number && (r.start_date || r.end_date) && <span> · </span>}
                                  {(r.start_date || r.end_date) && <span>{fmtDate(r.start_date)} {r.start_date && r.end_date ? '→' : ''} {fmtDate(r.end_date)}</span>}
                                </div>
                                {r.notes && <div style={{ fontSize: '12px', color: D.fgMuted, marginTop: '2px' }}>{r.notes}</div>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                              {r.end_date && (
                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: rowStatus.soft, color: rowStatus.color }}>{rowStatus.label}</span>
                              )}
                              <button onClick={() => handleDownload(r)}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: D.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                View
                              </button>
                              {canEdit && (
                                <button onClick={() => handleDelete(r)}
                                  style={{ fontSize: '13px', color: D.danger, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '4px 8px' }}>
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload Modal (light theme, matches shared Modal component convention) */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Upload Contract Document" size="md">
        <div className="space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
            <input type="text" list="vendor-options" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}
              placeholder="e.g. Amadeus, Travelport, SkyTravel..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <datalist id="vendor-options">
              {knownVendors.map(v => <option key={v} value={v} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
            <div className="flex gap-2">
              {(['Main Contract', 'Addendum'] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm({ ...form, doc_type: t })}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors border ${form.doc_type === t ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
            <input type="text" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder={form.doc_type === 'Addendum' ? 'e.g. Addendum 1 - Fee Update' : 'e.g. Main Contract 2024-2026'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contract Number <span className="text-slate-400 font-normal">(optional)</span></label>
            <input type="text" value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">End Date <span className="text-slate-400 font-normal">(for expiry alert)</span></label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">File</label>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickFile(f); e.target.value = '' }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
              {file ? file.name : 'Click to choose a file'}
            </button>
            <p className="text-xs text-slate-400 mt-1.5">PDF, Word (.doc/.docx) or images (.jpg/.png), max 20MB.</p>
          </div>

          {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors">Cancel</button>
            <button onClick={handleUpload} disabled={uploading} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {uploading ? 'Uploading' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
