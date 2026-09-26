'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/shared/Modal'
import { useAppContext } from '@/lib/context/AppContext'

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

type StatusKey = 'draft' | 'active' | 'expiring' | 'expired'

function getStatus(endDate: string | null): { key: StatusKey; label: string; color: string; soft: string; days: number | null } {
  if (!endDate) return { key: 'draft', label: 'Draft', color: D.fgMuted, soft: 'rgba(139,148,158,0.10)', days: null }
  const end = new Date(endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((end.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return { key: 'expired', label: 'Expired', color: D.danger, soft: D.dangerSoft, days: diffDays }
  if (diffDays <= 90) return { key: 'expiring', label: 'Expiring Soon', color: D.warning, soft: D.warningSoft, days: diffDays }
  return { key: 'active', label: 'Active', color: D.success, soft: D.successSoft, days: diffDays }
}

function fmtDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

// GDS brand accent colors (matches the rest of GDSHub's GDS-specific pages)
function gdsColor(vendor: string): { color: string; soft: string } {
  const v = vendor.toLowerCase()
  if (v.includes('amadeus')) return { color: '#a371f7', soft: 'rgba(163,113,247,0.14)' }
  if (v.includes('sabre')) return { color: '#f78166', soft: 'rgba(247,129,102,0.14)' }
  if (v.includes('travelport')) return { color: '#58a6ff', soft: 'rgba(88,166,255,0.14)' }
  return { color: D.fg, soft: D.bg }
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
  const { canManage: isAdmin, isAdmin: canEdit } = useAppContext()   // isAdmin = can view (admin or manager), canEdit = can upload/delete (admin only)
  const [records, setRecords] = useState<VendorContract[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')   // 'all' | vendor name | 'active' | 'expiring' | 'expired'

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<VendorContract | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('vendor_contracts').select('*').order('vendor').order('doc_type').order('created_at', { ascending: false })
    setRecords((data as VendorContract[]) ?? [])
    setLoading(false)
  }

  const knownVendors = Array.from(new Set([...SUGGESTED_VENDORS, ...records.map(r => r.vendor)])).sort()
  const vendorList = Array.from(new Set(records.map(r => r.vendor))).sort()

  // Stat totals reflect all records, independent of search/filter
  const totalDocuments = records.length
  const activeContracts = records.filter(r => getStatus(r.end_date).key === 'active').length
  const expiringSoonCount = records.filter(r => getStatus(r.end_date).key === 'expiring').length
  const expiredCount = records.filter(r => getStatus(r.end_date).key === 'expired').length

  const filtered = records.filter(r => {
    const term = search.toLowerCase()
    const matchesSearch = !term || r.vendor.toLowerCase().includes(term) || r.label.toLowerCase().includes(term) || (r.contract_number ?? '').toLowerCase().includes(term)
    if (!matchesSearch) return false
    if (filter === 'all') return true
    if (filter === 'active' || filter === 'expiring' || filter === 'expired') return getStatus(r.end_date).key === filter
    return r.vendor === filter
  })

  // Group filtered records by vendor/GDS, sections shown in this fixed order (known GDS first, then any others alphabetically)
  const byVendor = filtered.reduce((acc, r) => {
    (acc[r.vendor] = acc[r.vendor] ?? []).push(r)
    return acc
  }, {} as Record<string, VendorContract[]>)
  const orderedVendorNames = Array.from(new Set([...SUGGESTED_VENDORS, ...Object.keys(byVendor)]))
    .filter(v => byVendor[v]?.length)

  function openUpload(prefillVendor?: string) {
    setEditing(null)
    setForm({ ...EMPTY_FORM, vendor: prefillVendor ?? '' })
    setFile(null)
    setUploadError('')
    setModalOpen(true)
  }

  function openEdit(r: VendorContract) {
    setEditing(r)
    setForm({
      vendor: r.vendor,
      doc_type: r.doc_type,
      label: r.label,
      contract_number: r.contract_number ?? '',
      start_date: r.start_date ?? '',
      end_date: r.end_date ?? '',
      notes: r.notes ?? '',
    })
    setFile(null)
    setUploadError('')
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
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
    if (!editing && !file) { setUploadError('Please choose a file to upload.'); return }

    setUploading(true)

    // If a new file was picked (on add, or replacing the file on edit), upload it first.
    let fileFields: { file_name: string; file_path: string; file_size: number } | null = null
    const oldPath = editing?.file_path ?? null
    if (file) {
      const safeVendor = form.vendor.trim().replace(/[^a-zA-Z0-9-_]/g, '_')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${safeVendor}/${form.doc_type === 'Addendum' ? 'addendum' : 'main'}/${Date.now()}_${safeName}`
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (uploadErr) { setUploadError(uploadErr.message); setUploading(false); return }
      fileFields = { file_name: file.name, file_path: path, file_size: file.size }
    }

    const payload = {
      vendor: form.vendor.trim(),
      doc_type: form.doc_type,
      label: form.label.trim(),
      contract_number: form.contract_number.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      ...(fileFields ?? {}),
    }

    const { error: saveErr } = editing
      ? await supabase.from('vendor_contracts').update(payload).eq('id', editing.id)
      : await supabase.from('vendor_contracts').insert(payload)
    if (saveErr) { setUploadError(saveErr.message); setUploading(false); return }

    // Clean up the old storage object once the new one is safely saved.
    if (fileFields && editing && oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath])
    }

    setUploading(false)
    closeModal()
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

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {[
            { label: 'Total documents', value: totalDocuments, color: D.fg },
            { label: 'Active contracts', value: activeContracts, color: D.fg },
            { label: 'Expires within 90 days', value: expiringSoonCount, color: D.warning },
            { label: 'Expired', value: expiredCount, color: D.danger },
          ].map(stat => (
            <div key={stat.label} style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '26px', fontWeight: 700, color: stat.color, letterSpacing: '-0.5px' }}>{stat.value}</div>
              <div style={{ fontSize: '12.5px', color: D.fgMuted, marginTop: '2px' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search + filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, label, or contract number..."
              style={{ width: '100%', padding: '10px 14px 10px 34px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '8px', color: D.fg, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {([
              { key: 'all', label: 'All' },
              ...vendorList.map(v => ({ key: v, label: v })),
              { key: 'active', label: 'Active' },
              { key: 'expiring', label: 'Expiring Soon' },
              { key: 'expired', label: 'Expired' },
            ]).map(opt => {
              const active = filter === opt.key
              return (
                <button key={opt.key} onClick={() => setFilter(opt.key)}
                  style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '20px', cursor: 'pointer', whiteSpace: 'nowrap', background: active ? D.accentSoft : 'transparent', border: `1.5px solid ${active ? D.accent : D.border}`, color: active ? D.accent : D.fgMuted }}>
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: D.fgMuted, fontSize: '14px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '12px' }}>Loading…</div>
        ) : records.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: D.fgDim, fontSize: '14px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '10px', background: D.bg, margin: '0 auto 14px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </div>
            No contracts uploaded yet.{canEdit ? ' Click "Upload Document" to add the first one.' : ''}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: D.fgDim, fontSize: '14px', background: D.card, border: `1px solid ${D.border}`, borderRadius: '12px' }}>
            No contracts match your search or filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {orderedVendorNames.map(vendor => {
              const docs = byVendor[vendor]
              const vc = gdsColor(vendor)
              return (
                <div key={vendor}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: 700, color: vc.color, background: vc.soft, border: `1px solid ${vc.color}40`, borderRadius: '8px', padding: '6px 14px', letterSpacing: '-0.1px' }}>{vendor}</span>
                    {canEdit && (
                      <button onClick={() => openUpload(vendor)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 600, color: D.fgMuted, background: 'transparent', border: `1px solid ${D.border}`, borderRadius: '7px', cursor: 'pointer' }}
                        onMouseOver={e => { e.currentTarget.style.background = D.accentSoft; e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.color = D.accent }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = D.border; e.currentTarget.style.color = D.fgMuted }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Add Document
                      </button>
                    )}
                  </div>
                  <div style={{ background: D.card, border: `1px solid ${D.border}`, borderRadius: '12px', overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: 'auto' }} />
                        <col style={{ width: '110px' }} />
                        <col style={{ width: '220px' }} />
                        <col style={{ width: '140px' }} />
                        <col style={{ width: '230px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          {['Document', 'Type', 'Term', 'Status', 'Actions'].map((h, i, arr) => (
                            <th key={h} style={{ padding: '12px 18px', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: D.fgDim, textAlign: i === arr.length - 1 ? 'right' : 'left', borderBottom: `1px solid ${D.border}`, background: D.card, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {docs.map((r, i) => {
                          const st = getStatus(r.end_date)
                          return (
                            <tr key={r.id} style={{ borderBottom: i < docs.length - 1 ? `1px solid ${D.border}` : 'none', transition: 'background 0.15s' }}
                              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                              <td style={{ padding: '14px 18px', verticalAlign: 'top', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '8px', background: D.bg, flexShrink: 0, marginTop: '1px' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={D.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: D.fg, wordBreak: 'break-word' }}>{r.label}</div>
                                    {r.contract_number && <div style={{ fontSize: '11.5px', color: D.fgDim, fontFamily: 'monospace', marginTop: '2px' }}>{r.contract_number}</div>}
                                    {r.notes && (
                                      <ul style={{ margin: '4px 0 0', paddingLeft: '15px', listStyle: 'disc' }}>
                                        {r.notes.split('\n').map(line => line.trim()).filter(Boolean).map((line, li) => (
                                          <li key={li} style={{ fontSize: '12px', color: D.fgMuted, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'normal' }}>{line}</li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '14px 18px', verticalAlign: 'top' }}>
                                <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '5px', textTransform: 'uppercase', letterSpacing: '0.05em', background: r.doc_type === 'Main Contract' ? D.blueSoft : D.purpleSoft, color: r.doc_type === 'Main Contract' ? D.blue : D.purple, whiteSpace: 'nowrap' }}>
                                  {r.doc_type === 'Main Contract' ? 'Main' : 'Addendum'}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', verticalAlign: 'top', fontSize: '13px', color: D.fgMuted, whiteSpace: 'nowrap' }}>
                                {(r.start_date || r.end_date) ? <>{fmtDate(r.start_date)} {r.start_date && r.end_date ? '→' : ''} {fmtDate(r.end_date)}</> : <span style={{ color: D.fgDim }}>—</span>}
                              </td>
                              <td style={{ padding: '14px 18px', verticalAlign: 'top' }}>
                                <span title={st.days !== null ? (st.key === 'expired' ? `Expired ${Math.abs(st.days)} day${Math.abs(st.days) !== 1 ? 's' : ''} ago` : `${st.days} day${st.days !== 1 ? 's' : ''} left`) : undefined}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600, color: D.fg, whiteSpace: 'nowrap' }}>
                                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                                  {st.label}
                                </span>
                              </td>
                              <td style={{ padding: '14px 18px', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                  <button onClick={() => handleDownload(r)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: D.fgMuted, background: 'transparent', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', padding: '5px 10px' }}
                                    onMouseOver={e => { e.currentTarget.style.background = D.accentSoft; e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.color = D.accent }}
                                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = D.border; e.currentTarget.style.color = D.fgMuted }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    View
                                  </button>
                                  {canEdit && (
                                    <button onClick={() => openEdit(r)}
                                      style={{ fontSize: '12.5px', fontWeight: 600, color: D.fgMuted, background: 'transparent', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', padding: '5px 10px' }}
                                      onMouseOver={e => { e.currentTarget.style.background = D.accentSoft; e.currentTarget.style.borderColor = D.accent; e.currentTarget.style.color = D.accent }}
                                      onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = D.border; e.currentTarget.style.color = D.fgMuted }}>
                                      Edit
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button onClick={() => handleDelete(r)}
                                      style={{ fontSize: '12.5px', fontWeight: 600, color: D.fgMuted, background: 'transparent', border: `1px solid ${D.border}`, borderRadius: '6px', cursor: 'pointer', padding: '5px 10px' }}
                                      onMouseOver={e => { e.currentTarget.style.background = D.dangerSoft; e.currentTarget.style.borderColor = D.danger; e.currentTarget.style.color = D.danger }}
                                      onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = D.border; e.currentTarget.style.color = D.fgMuted }}>
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div style={{ padding: '10px 18px', borderTop: `1px solid ${D.border}`, background: 'rgba(0,0,0,0.1)', fontSize: '12.5px', color: D.fgDim }}>
                      {docs.length} document{docs.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload Modal (light theme, matches shared Modal component convention) */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Contract Document' : 'Upload Contract Document'} size="md">
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(optional — one point per line, shown as bullets)</span></label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4}
              placeholder={'e.g.\nAuto-renewal: extends by 1 year if no notice given\nNotice deadline: 30 days before expiry'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 resize-y" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">File{editing && <span className="text-slate-400 font-normal"> (optional — leave blank to keep the current file)</span>}</label>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickFile(f); e.target.value = '' }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 text-sm border border-dashed border-slate-300 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
              {file ? file.name : editing ? `Current: ${editing.file_name}` : 'Click to choose a file'}
            </button>
            <p className="text-xs text-slate-400 mt-1.5">PDF, Word (.doc/.docx) or images (.jpg/.png), max 20MB.</p>
          </div>

          {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={closeModal} className="flex-1 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-medium transition-colors">Cancel</button>
            <button onClick={handleUpload} disabled={uploading} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
              {uploading ? 'Saving...' : editing ? 'Save Changes' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
