'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type View = 'login' | 'signup' | 'forgot' | 'forgot_sent' | 'signup_done'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [idleLogout, setIdleLogout] = useState(false)
  const [view, setView] = useState<View>('login')

  useEffect(() => {
    if (searchParams.get('reason') === 'idle') setIdleLogout(true)
  }, [searchParams])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  // ── SIGN IN ───────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/dashboard'); router.refresh() }
  }

  // ── SIGN UP ───────────────────────────────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { setView('signup_done') }
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true); setResetError('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setResetError(error.message); setResetLoading(false) }
    else { setView('forgot_sent'); setResetLoading(false) }
  }

  function switchView(v: View) {
    setError(''); setResetError(''); setLoading(false)
    if (v === 'forgot') setResetEmail(email)
    setView(v)
  }

  const Logo = () => (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500 mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white">GDSHub</h1>
      <p className="text-slate-400 text-sm mt-1">GDS Management System</p>
    </div>
  )

  const BackBtn = ({ to, label = 'Back to sign in' }: { to: View; label?: string }) => (
    <button onClick={() => switchView(to)} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-5 transition-colors">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Logo />

        {/* ── SIGN IN ── */}
        {view === 'login' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-6">Sign in to your account</h2>
            {idleLogout && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-4 py-2.5 rounded-lg mb-4 flex items-center gap-2">
                <span>⏱</span>
                <span>You were signed out after 15 minutes of inactivity.</span>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-300">Password</label>
                  <button type="button" onClick={() => switchView('forgot')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <div className="mt-5 pt-5 border-t border-slate-800 text-center">
              <p className="text-sm text-slate-400">
                Don't have an account?{' '}
                <button onClick={() => switchView('signup')} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Sign up</button>
              </p>
            </div>
          </div>
        )}

        {/* ── SIGN UP ── */}
        {view === 'signup' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <BackBtn to="login" label="Back to sign in" />
            <h2 className="text-lg font-semibold text-white mb-2">Create account</h2>
            <p className="text-slate-400 text-sm mb-6">Register your PST Travel email to access GDSHub.</p>
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@psttravel.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Re-enter password"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
            <div className="mt-5 pt-5 border-t border-slate-800 text-center">
              <p className="text-sm text-slate-400">
                Already have an account?{' '}
                <button onClick={() => switchView('login')} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Sign in</button>
              </p>
            </div>
          </div>
        )}

        {/* ── SIGN UP DONE ── */}
        {view === 'signup_done' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/15 mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Account created</h2>
            <p className="text-slate-400 text-sm mb-1">Check your email to confirm your account.</p>
            <p className="text-blue-400 text-sm font-medium mb-6">{email}</p>
            <p className="text-slate-500 text-xs mb-5">After confirming, sign in to access GDSHub. An admin will assign your access level.</p>
            <button onClick={() => switchView('login')} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-sm transition-colors">
              Back to sign in
            </button>
          </div>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {view === 'forgot' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <BackBtn to="login" />
            <h2 className="text-lg font-semibold text-white mb-2">Reset your password</h2>
            <p className="text-slate-400 text-sm mb-6">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email address</label>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required autoFocus placeholder="you@company.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition" />
              </div>
              {resetError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-lg">{resetError}</div>}
              <button type="submit" disabled={resetLoading} className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
                {resetLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </div>
        )}

        {/* ── RESET EMAIL SENT ── */}
        {view === 'forgot_sent' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/15 mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Check your email</h2>
            <p className="text-slate-400 text-sm mb-1">We sent a reset link to</p>
            <p className="text-blue-400 text-sm font-medium mb-6">{resetEmail}</p>
            <p className="text-slate-500 text-xs mb-5">Didn't receive it? Check your spam folder.</p>
            <button onClick={() => switchView('forgot')} className="text-sm text-slate-400 hover:text-white transition-colors underline mb-3 block w-full">Try a different email</button>
            <button onClick={() => switchView('login')} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-sm transition-colors">
              Back to sign in
            </button>
          </div>
        )}

        <p className="text-center mt-4">
          <a href="/pcc" className="text-slate-400 hover:text-slate-300 underline text-xs transition-colors">
            View GDS Info without logging in →
          </a>
        </p>
        <p className="text-center text-slate-600 text-xs mt-2">PST Travel Services · Internal System</p>
      </div>
    </div>
  )
}
