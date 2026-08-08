'use client'

import { useState } from 'react'
import { NavItem } from '@/components/layout/nav-items'

interface ModuleGridProps {
  modules: NavItem[]
}

const T = {
  card: '#1c2129', cardHover: '#222830', border: '#2d333b', borderLight: '#373e47',
  fg: '#e6edf3', fgMuted: '#8b949e', fgDim: '#6e7681', accent: '#58a6ff', accentSoft: 'rgba(88,166,255,0.10)',
}

const PALETTE = [
  { bg: 'rgba(88,166,255,0.10)',  text: '#58a6ff' },  // blue
  { bg: 'rgba(63,185,80,0.10)',   text: '#3fb950' },  // green
  { bg: 'rgba(163,113,247,0.10)', text: '#a371f7' },  // purple
  { bg: 'rgba(210,153,34,0.10)',  text: '#d29922' },  // warning
  { bg: 'rgba(57,210,192,0.10)',  text: '#39d2c0' },  // cyan
  { bg: 'rgba(247,129,102,0.10)', text: '#f78166' },  // orange
  { bg: 'rgba(219,97,162,0.10)',  text: '#db61a2' },  // pink
  { bg: 'rgba(248,81,73,0.10)',   text: '#f85149' },  // danger
]

export default function DashboardModuleGrid({ modules }: ModuleGridProps) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const filtered = modules.filter(m => m.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px'}}>
        <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'20px', fontWeight:600, color:T.fg, display:'flex', alignItems:'center', gap:'10px'}}>
          Modules
          <span style={{fontSize:'14px', fontWeight:600, padding:'2px 9px', borderRadius:'20px', background:T.accentSoft, color:T.accent}}>{modules.length}</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <div style={{position:'relative'}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'11px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search modules..."
              style={{padding:'7px 12px 7px 32px', background:T.card, border:`1px solid ${T.border}`, borderRadius:'8px', color:T.fg, fontSize:'14px', outline:'none', width:'200px'}} />
          </div>
          <div style={{display:'flex', border:`1px solid ${T.border}`, borderRadius:'8px', overflow:'hidden'}}>
            <button onClick={() => setView('grid')}
              style={{padding:'7px 12px', fontSize:'14px', background: view==='grid' ? T.accentSoft : 'transparent', border:'none', color: view==='grid' ? T.accent : T.fgDim, cursor:'pointer'}}>
              Grid
            </button>
            <button onClick={() => setView('list')}
              style={{padding:'7px 12px', fontSize:'14px', background: view==='list' ? T.accentSoft : 'transparent', border:'none', borderLeft:`1px solid ${T.border}`, color: view==='list' ? T.accent : T.fgDim, cursor:'pointer'}}>
              List
            </button>
          </div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns: view === 'list' ? '1fr' : 'repeat(auto-fill, minmax(230px, 1fr))', gap:'16px'}}>
        {filtered.map((item, i) => {
          const c = PALETTE[i % PALETTE.length]
          return (
            <a key={item.href} href={item.href}
              style={{
                background:T.card, border:`1px solid ${T.border}`, borderRadius:'10px', overflow:'hidden',
                textDecoration:'none', color:'inherit', display:'block', position:'relative', transition:'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background=T.cardHover; e.currentTarget.style.borderColor=T.borderLight; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseOut={e => { e.currentTarget.style.background=T.card; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform='translateY(0)' }}>
              <div style={{position:'absolute', top:0, left:0, right:0, height:'3px', background:c.text}} />
              <div style={{padding:'20px 22px', display:'flex', alignItems:'center', gap:'14px'}}>
                <div style={{width:'42px', height:'42px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:c.bg, color:c.text}}>
                  {item.icon}
                </div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:'16px', fontWeight:600, color:T.fg, lineHeight:1.3}}>{item.label}</div>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.fgMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:'auto', flexShrink:0}}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </a>
          )
        })}
        {filtered.length === 0 && (
          <div style={{gridColumn:'1/-1', padding:'40px', textAlign:'center', color:T.fgDim, fontSize:'13px'}}>No modules match &ldquo;{search}&rdquo;</div>
        )}
      </div>
    </div>
  )
}
