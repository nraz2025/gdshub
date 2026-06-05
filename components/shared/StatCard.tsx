interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color?: 'blue' | 'green' | 'amber' | 'purple'
}

const colors = {
  blue:   'bg-blue-50 text-blue-500',
  green:  'bg-emerald-50 text-emerald-500',
  amber:  'bg-amber-50 text-amber-500',
  purple: 'bg-violet-50 text-violet-500',
}

export default function StatCard({ label, value, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
