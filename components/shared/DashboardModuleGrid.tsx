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

// Same grouping as TopNav's dropdown groups, so the Dashboard mirrors the nav structure
const GROUPS: { title: string; color: string; soft: string; keys: string[] }[] = [
  { title: 'Organisation', color: '#d29922', soft: 'rgba(210,153,34,0.10)', keys: ['organisation'] },
  { title: 'GDS',          color: '#39d2c0', soft: 'rgba(57,210,192,0.10)', keys: ['gds', 'gds_functionality', 'gds_info', 'queue_management', 'web_service'] },
  { title: 'Users',        color: '#a371f7', soft: 'rgba(163,113,247,0.10)', keys: ['users', 'sabre_users', 'amadeus_users', 'travelport_users', 'resigned_users'] },
  { title: 'System',       color: '#f78166', soft: 'rgba(247,129,102,0.10)', keys: ['billing_cycles', 'client', 'reporting', 'admin_panel'] },
]

export default function DashboardModuleGrid({ modules }: ModuleGridProps) {
  const [search, setSearch] = useState('')

  const filtered = modules.filter(m => m.label.toLowerCase().includes(search.toLowerCase()))
  const groupedSections = GROUPS
    .map(g => ({ ...g, items: g.keys.map(k => filtered.find(m => m.module === k)).filter(Boolean) as NavItem[] }))
    .filter(g => g.items.length > 0)

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px', flexWrap:'wrap', gap:'12px'}}>
        <div style={{fontFamily:"'Space Grotesk', sans-serif", fontSize:'20px', fontWeight:600, color:T.fg, display:'flex', alignItems:'center', gap:'10px'}}>
          Modules
          <span style={{fontSize:'14px', fontWeight:600, padding:'2px 9px', borderRadius:'20px', background:T.accentSoft, color:T.accent}}>{modules.length}</span>
        </div>
        <div style={{position:'relative'}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.fgDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute', left:'11px', top:'50%', transform:'translateY(-50%)'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search modules..."
            style={{padding:'7px 12px 7px 32px', background:T.card, border:`1px solid ${T.border}`, borderRadius:'8px', color:T.fg, fontSize:'14px', outline:'none', width:'200px'}} />
        </div>
      </div>

      {groupedSections.length === 0 ? (
        <div style={{padding:'40px', textAlign:'center', color:T.fgDim, fontSize:'13px'}}>No modules match &ldquo;{search}&rdquo;</div>
      ) : (
        groupedSections.map((g, gi) => (
          <div key={g.title} style={{marginBottom: gi < groupedSections.length - 1 ? '28px' : 0}}>
            <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
              <span style={{width:'10px', height:'10px', borderRadius:'50%', background:g.color, boxShadow:`0 0 10px ${g.color}`, flexShrink:0}} />
              <h3 style={{fontSize:'19px', fontWeight:700, color:g.color, textTransform:'uppercase', letterSpacing:'0.06em', margin:0}}>{g.title}</h3>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(230px, 1fr))', gap:'16px'}}>
              {g.items.map(item => (
                <a key={item.href} href={item.href}
                  style={{
                    background:T.card, border:`1px solid ${T.border}`, borderRadius:'10px', overflow:'hidden',
                    textDecoration:'none', color:'inherit', display:'block', position:'relative', transition:'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background=T.cardHover; e.currentTarget.style.borderColor=T.borderLight; e.currentTarget.style.transform='translateY(-2px)' }}
                  onMouseOut={e => { e.currentTarget.style.background=T.card; e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform='translateY(0)' }}>
                  <div style={{position:'absolute', top:0, left:0, right:0, height:'3px', background:g.color}} />
                  <div style={{padding:'20px 22px', display:'flex', alignItems:'center', gap:'14px'}}>
                    <div style={{width:'42px', height:'42px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:g.soft, color:g.color}}>
                      {item.icon}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:'19px', fontWeight:600, color:T.fg, lineHeight:1.3}}>{item.label}</div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.fgMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:'auto', flexShrink:0}}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
