import Link from 'next/link'

export default function PublicTopBar() {
  return (
    <header style={{background:'#0f172a'}} className="px-8 h-14 flex items-center justify-between border-b border-slate-800">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <span className="font-bold text-white text-base tracking-tight">GDSHub</span>
        </div>

      </div>
      <Link href="/login"
        style={{background:'#0f172a'}}
        className="flex items-center gap-2 px-4 py-2 border border-slate-600 hover:border-slate-400 text-white text-sm font-medium rounded-lg transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        Admin Login
      </Link>
    </header>
  )
}
