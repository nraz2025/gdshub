import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
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
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map(col => (
                <th key={col.key} className="text-left px-4 py-3 font-medium text-slate-500 whitespace-nowrap">
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
                    <td key={col.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                  {isAdmin && (onEdit || onDelete) && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors font-medium"
                          >
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors font-medium"
                          >
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
