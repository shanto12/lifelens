import { useState } from 'react'
import {
  LayoutDashboard,
  Wallet,
  RefreshCcw,
  Repeat,
  Users,
  HeartPulse,
  Sparkles,
  PhoneCall,
  BookOpen,
  Lock,
  Unlock,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ScreenId } from '../lib/screen-props'
import type { SnapshotMode } from '../lib/types'
import { setAccessCode } from '../lib/api'

const NAV: { id: ScreenId; label: string; icon: ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'money', label: 'Money Map', icon: <Wallet size={16} /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <Repeat size={16} /> },
  { id: 'people', label: 'People & Family', icon: <Users size={16} /> },
  { id: 'health', label: 'Health', icon: <HeartPulse size={16} /> },
  { id: 'insights', label: 'Insights', icon: <Sparkles size={16} /> },
  { id: 'actions', label: 'Actions & Calls', icon: <PhoneCall size={16} /> },
  { id: 'guide', label: 'Demo Guide', icon: <BookOpen size={16} /> },
]

interface ShellProps {
  active: ScreenId
  onNavigate: (s: ScreenId) => void
  mode: SnapshotMode
  onUnlock: (code: string) => void
  onRefresh: () => void
  children: ReactNode
}

export default function Shell({ active, onNavigate, mode, onUnlock, onRefresh, children }: ShellProps) {
  const [showUnlock, setShowUnlock] = useState(false)
  const [code, setCode] = useState('')

  const submitCode = () => {
    onUnlock(code.trim())
    setShowUnlock(false)
    setCode('')
  }

  const lockOut = () => {
    setAccessCode('')
    onUnlock('')
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 218,
          flexShrink: 0,
          background: 'var(--bg-raised)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px', marginBottom: 22 }}>
          <img src="/lens.svg" alt="" width={26} height={26} style={{ borderRadius: 6 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>LifeLens</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
              LIFE &amp; MONEY COPILOT
            </div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={active === item.id ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 10px',
                borderRadius: 8,
                border: 'none',
                background: active === item.id ? 'var(--bg-hover)' : 'transparent',
                color: active === item.id ? 'var(--text)' : 'var(--text-dim)',
                fontSize: 13,
                fontWeight: active === item.id ? 600 : 500,
                textAlign: 'left',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '0 8px', fontSize: 11, color: 'var(--text-faint)' }}>
          Independent personal tool.
          <br />
          Data stays server-side.
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-raised)',
          }}
        >
          <span className={mode === 'owner' ? 'chip chip--accent' : 'chip chip--dim'}>
            {mode === 'owner' ? 'OWNER DATA' : 'SYNTHETIC PERSONA'}
          </span>
          <span className="faint" style={{ fontSize: 12 }}>
            {mode === 'owner'
              ? 'Showing your real snapshot (access-code verified, served server-side).'
              : 'Showing a synthetic demo persona. Unlock with your access code to see real data.'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn--ghost" onClick={onRefresh} aria-label="Refresh data">
              <RefreshCcw size={14} /> Refresh
            </button>
            {mode === 'owner' ? (
              <button className="btn" onClick={lockOut}>
                <Lock size={14} /> Lock
              </button>
            ) : showUnlock ? (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <input
                  type="password"
                  placeholder="Access code"
                  value={code}
                  autoFocus
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                  aria-label="Access code"
                  style={{ width: 150 }}
                />
                <button className="btn btn--primary" onClick={submitCode}>
                  Unlock
                </button>
              </span>
            ) : (
              <button className="btn" onClick={() => setShowUnlock(true)} data-testid="owner-unlock">
                <Unlock size={14} /> Owner unlock
              </button>
            )}
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: 22 }}>{children}</main>
      </div>
    </div>
  )
}
