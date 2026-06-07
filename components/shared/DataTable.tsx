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
  const innerRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)

  // Sync top scrollbar mirror → table scroll
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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Top scrollbar mirror */}
      <div
        ref={mirrorRef}
        onScroll={onMirrorScroll}
        className="overflow-x-auto"
        style={{ height: '12px' }}
      >
        <div style={{ width: scrollWidth, height: '1px' }} />
      </div>

      {/* Actual table */}
      <div
        ref={scrollRef}
        onScroll={onTableScroll}
        className="overflow-x-auto"
      >
        <table className="w-full text-sm" style={{ minWidth: '1400px' }}>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map(col => (
                <th key={col.key} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap" style={col.width ? { width: col.width } : undefined}>
                  {col.label}
                </th>
              ))}
              {isAdmin && (onEdit || onDelete) && (
                <th className="text-right px-4 py-3 font-medium text-slate-500">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-12 text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-slate-50 hover:bg-slate-50/70 transition-colors',
                    i === data.length - 1 && 'border-b-0'
                  )}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-slate-700 whitespace-nowrap" style={col.width ? { width: col.width } : undefined}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                  {isAdmin && (onEdit || onDelete) && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEdit && (
                          <button onClick={() => onEdit(row)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium">
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => onDelete(row)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium">
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
