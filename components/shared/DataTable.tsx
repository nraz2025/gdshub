'use client'

import { useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  isAdmin?: boolean
  emptyMessage?: string
}

export default function DataTable<T extends Record<string, unknown>>({
  columns, data, onEdit, onDelete, isAdmin = false, emptyMessage = 'No records found.'
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setScrollWidth(el.scrollWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data, columns])

  function onMirrorScroll() {
    if (mirrorRef.current && scrollRef.current)
      scrollRef.current.scrollLeft = mirrorRef.current.scrollLeft
  }
  function onTableScroll() {
    if (mirrorRef.current && scrollRef.current)
      mirrorRef.current.scrollLeft = scrollRef.current.scrollLeft
  }

  return (
    // Outer wrapper — no overflow:hidden so sticky works
    <div style={{borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', position:'relative'}}>

      {/* ── Right-edge fade shadow — visual cue that table scrolls ── */}
      <div style={{
        position:'absolute', top:0, right:0, width:'60px', height:'100%',
        background:'linear-gradient(to right, transparent, rgba(241,245,249,0.85))',
        zIndex:10, pointerEvents:'none', borderRadius:'0 12px 12px 0',
      }} />

      {/* ── Sticky top scrollbar ── */}
      {/* Must be outside any overflow:hidden parent for sticky to work */}
      <div
        ref={mirrorRef}
        onScroll={onMirrorScroll}
        className="overflow-x-auto"
        style={{
          position:'sticky',
          top:0,
          zIndex:20,
          height:'20px',
          background:'#e2e8f0',
          border:'1px solid #cbd5e1',
          borderBottom:'none',
          borderRadius:'12px 12px 0 0',
          boxShadow:'0 2px 6px rgba(0,0,0,0.10)',
          cursor:'ew-resize',
          display:'flex',
          alignItems:'center',
          paddingLeft:'12px',
          gap:'6px',
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3"/></svg>
        <span style={{fontSize:'10px',fontWeight:600,color:'#94a3b8',letterSpacing:'0.05em',userSelect:'none',whiteSpace:'nowrap'}}>SCROLL TO SEE MORE →</span>
        <div style={{flex:1}} />
        <div style={{width: scrollWidth, height:'1px', position:'absolute'}} />
      </div>

      {/* ── Table container ── */}
      <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderTop:'none', borderRadius:'0 0 12px 12px', overflow:'hidden'}}>
        <div ref={scrollRef} onScroll={onTableScroll} className="overflow-x-auto">
          <table className="w-full" style={{minWidth:'1400px', borderCollapse:'collapse'}}>
            <thead>
              <tr style={{borderBottom:'1px solid #e2e8f0', background:'#f8fafc'}}>
                {columns.map(col => (
                  <th key={col.key}
                    style={{
                      textAlign:'left', padding:'14px 16px',
                      fontSize:'12px', fontWeight:700,
                      color:'#94a3b8', textTransform:'uppercase',
                      letterSpacing:'0.05em', whiteSpace:'nowrap',
                      borderRight:'1px solid #e2e8f0',
                      ...(col.width ? {width: col.width} : {})
                    }}>
                    {col.label}
                  </th>
                ))}
                {isAdmin && (onEdit || onDelete) && (
                  <th style={{textAlign:'right', padding:'14px 16px', fontSize:'12px', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', borderRight:'none'}}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1}
                    style={{textAlign:'center', padding:'48px 16px', color:'#94a3b8', fontSize:'14px'}}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr key={i}
                    style={{
                      borderBottom: i < data.length - 1 ? '1px solid #f1f5f9' : 'none',
                      transition:'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8faff')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {columns.map(col => (
                      <td key={col.key}
                        style={{
                          padding:'12px 16px',
                          fontSize:'13px',
                          color:'#334155',
                          whiteSpace:'nowrap',
                          textTransform:'uppercase' as const,
                          letterSpacing:'0.02em',
                          borderRight:'1px solid #f1f5f9',
                          ...(col.width ? {width: col.width} : {})
                        }}>
                        {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                    {isAdmin && (onEdit || onDelete) && (
                      <td style={{padding:'12px 16px', textAlign:'right'}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:'6px'}}>
                          {onEdit && (
                            <button onClick={() => onEdit(row)}
                              style={{fontSize:'12px', padding:'4px 12px', borderRadius:'6px', border:'1px solid #e2e8f0', background:'white', color:'#475569', cursor:'pointer', fontWeight:500}}>
                              Edit
                            </button>
                          )}
                          {onDelete && (
                            <button onClick={() => onDelete(row)}
                              style={{fontSize:'12px', padding:'4px 12px', borderRadius:'6px', border:'1px solid #e2e8f0', background:'white', color:'#475569', cursor:'pointer', fontWeight:500}}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
