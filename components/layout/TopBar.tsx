'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function TopBar({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = user.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        {isAdmin && (
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            Admin
          </span>
        )}
        <span className="text-sm text-slate-500 hidden sm:block">{user.email}</span>
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
          {initials}
        </div>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1.5"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign out
        </button>
      </div>
    </header>
  )
}
