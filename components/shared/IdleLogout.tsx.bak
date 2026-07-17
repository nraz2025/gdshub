'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const IDLE_MINUTES = 15
const IDLE_MS = IDLE_MINUTES * 60 * 1000
const WARNING_MS = 60 * 1000 // warn 1 min before logout

export default function IdleLogout() {
  const router = useRouter()
  const supabase = createClient()
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningShown = useRef(false)

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/login?reason=idle')
  }, [supabase, router])

  const showWarning = useCallback(() => {
    if (warningShown.current) return
    warningShown.current = true
    // Show a non-blocking toast-style warning
    const el = document.createElement('div')
    el.id = 'idle-warning'
    el.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: #1e293b; border: 1px solid #f59e0b; border-radius: 12px;
      padding: 16px 20px; max-width: 320px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      animation: slideIn 0.3s ease;
    `
    el.innerHTML = `
      <style>@keyframes slideIn { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }</style>
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <span style="font-size:20px; flex-shrink:0;">⏱</span>
        <div>
          <p style="color:#f59e0b; font-size:13px; font-weight:600; margin:0 0 4px">Session expiring soon</p>
          <p style="color:#94a3b8; font-size:12px; margin:0 0 12px">You'll be logged out in 1 minute due to inactivity.</p>
          <button id="idle-stay" style="background:#3b82f6; color:white; border:none; border-radius:8px; padding:6px 16px; font-size:12px; font-weight:600; cursor:pointer;">
            Stay signed in
          </button>
        </div>
      </div>
    `
    document.body.appendChild(el)
    document.getElementById('idle-stay')?.addEventListener('click', resetTimers)
  }, [])

  const clearWarning = useCallback(() => {
    warningShown.current = false
    document.getElementById('idle-warning')?.remove()
  }, [])

  const resetTimers = useCallback(() => {
    clearWarning()

    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (warningTimer.current) clearTimeout(warningTimer.current)

    // Warning fires 1 min before logout
    warningTimer.current = setTimeout(showWarning, IDLE_MS - WARNING_MS)
    // Logout fires after full idle time
    idleTimer.current = setTimeout(logout, IDLE_MS)
  }, [logout, showWarning, clearWarning])

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    const handleActivity = () => resetTimers()

    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))
    resetTimers() // start on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity))
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (warningTimer.current) clearTimeout(warningTimer.current)
      clearWarning()
    }
  }, [resetTimers, clearWarning])

  return null // no UI — purely behavioural
}
