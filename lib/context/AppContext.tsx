'use client'

// Shared app context: the role/isAdmin/permMap that layout.tsx already
// fetches ONCE (server-side) per visit to the (dashboard) section.
// Pages read it from here via useAppContext() instead of independently
// re-fetching auth.getUser() + a profiles lookup on every mount, which
// was adding two redundant round trips to every single page load.

import { createContext, useContext } from 'react'

export interface AppContextValue {
  userId: string | null
  userEmail: string | null
  role: string          // 'admin' | 'manager' | 'user'
  isAdmin: boolean       // role === 'admin'
  canManage: boolean     // role === 'admin' || role === 'manager' (the broader "can see admin-ish controls" check several pages use)
  permMap: Record<string, { can_access: boolean; can_edit: boolean }>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// Throws if used outside the provider — every dashboard page sits under
// layout.tsx, which always provides it, so this should never fire; if it
// does, it means a page got rendered outside the (dashboard) layout.
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useAppContext() must be used inside the (dashboard) layout — AppProvider is missing.')
  }
  return ctx
}
