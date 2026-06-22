'use client'

import { NavItem } from '@/components/layout/nav-items'

interface ModuleGridProps {
  modules: NavItem[]
}

const PALETTE = [
  { bg: '#dbeafe', text: '#2563eb' }, // blue
  { bg: '#dcfce7', text: '#16a34a' }, // green
  { bg: '#fef3c7', text: '#d97706' }, // amber
  { bg: '#f3e8ff', text: '#9333ea' }, // purple
  { bg: '#ffe4e6', text: '#e11d48' }, // rose
  { bg: '#ccfbf1', text: '#0d9488' }, // teal
  { bg: '#e0e7ff', text: '#4f46e5' }, // indigo
  { bg: '#ffedd5', text: '#ea580c' }, // orange
]

export default function ModuleGrid({ modules }: ModuleGridProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h2 className="font-semibold text-slate-800 mb-4" style={{ fontSize: '1.125rem' }}>All Modules</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {modules.map((item, i) => {
          const c = PALETTE[i % PALETTE.length]
          return (
            <a
              key={item.href}
              href={item.href}
              className="module-card"
              style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px',
                padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer',
                textDecoration: 'none', color: 'inherit', display: 'block',
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', position: 'relative',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = '#ffffff'
                e.currentTarget.style.borderColor = '#2d8a5e'
                e.currentTarget.style.transform = 'translateY(-3px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
                const icon = e.currentTarget.querySelector('.module-icon') as HTMLElement
                if (icon) icon.style.transform = 'scale(1.1) rotate(5deg)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = '#f8fafc'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
                const icon = e.currentTarget.querySelector('.module-icon') as HTMLElement
                if (icon) icon.style.transform = 'scale(1) rotate(0deg)'
              }}
            >
              <div
                className="module-icon"
                style={{
                  width: '56px', height: '56px', borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1rem', background: c.bg, color: c.text,
                  transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {item.icon}
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {item.module.replace(/_/g, ' ')}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}
