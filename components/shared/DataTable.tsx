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
    <div style={{background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
      {/* Mirror scrollbar on top */}
      <div ref={mirrorRef} onScroll={onMirrorScroll} className="overflow-x-auto" style={{height:'10px'}}>
        <div style={{width: scrollWidth, height:'1px'}} />
      </div>

      <div ref={scrollRef} onScroll={onTableScroll} className="overflow-x-auto">
        <table className="w-full" style={{minWidth:'1400px', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{borderBottom:'2px solid #e2e8f0', background:'#f1f5f9'}}>
              {columns.map(col => (
                <th key={col.key}
                  style={{
                    textAlign:'left', padding:'11px 16px',
                    fontSize:'12px', fontWeight:700,
                    color:'#4f46e5', textTransform:'uppercase',
                    letterSpacing:'0.07em', whiteSpace:'nowrap',
                    ...(col.width ? {width: col.width} : {})
                  }}>
                  {col.label}
                </th>
              ))}
              {isAdmin && (onEdit || onDelete) && (
                <th style={{textAlign:'right', padding:'11px 16px', fontSize:'12px', fontWeight:700, color:'#4f46e5', textTransform:'uppercase', letterSpacing:'0.07em'}}>
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
  )
}
