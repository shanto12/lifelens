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
  Scan,
  Plug,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { OwnerError } from '../App'
import type { ScreenId } from '../lib/screen-props'
import type { SnapshotMode } from '../lib/types'

const NAV: { id: ScreenId; label: string; icon: ReactNode; accent: string }[] = [
  { id: 'dashboard', label: 'Home', icon: <LayoutDashboard size={20} />, accent: '110,231,179' },
  { id: 'money', label: 'Money', icon: <Wallet size={20} />, accent: '110,231,179' },
  { id: 'subscriptions', label: 'Subs', icon: <Repeat size={20} />, accent: '167,139,250' },
  { id: 'people', label: 'People', icon: <Users size={20} />, accent: '103,232,249' },
  { id: 'health', label: 'Health', icon: <HeartPulse size={20} />, accent: '251,113,133' },
  { id: 'insights', label: 'Insights', icon: <Sparkles size={20} />, accent: '167,139,250' },
  { id: 'actions', label: 'Actions', icon: <PhoneCall size={20} />, accent: '251,191,36' },
  { id: 'connections', label: 'Connect', icon: <Plug size={20} />, accent: '167,139,250' },
  { id: 'guide', label: 'Guide', icon: <BookOpen size={20} />, accent: '103,232,249' },
]

interface ShellProps {
  active: ScreenId
  onNavigate: (s: ScreenId) => void
  mode: SnapshotMode
  onUnlock: (code: string) => void
  onRefresh: () => void
  refreshing: boolean
  refreshFailed: boolean
  ownerError: OwnerError | null
  onClearOwnerError: () => void
  hasAccessCode: boolean
  children: ReactNode
}

export default function Shell({
  active,
  onNavigate,
  mode,
  onUnlock,
  onRefresh,
  refreshing,
  refreshFailed,
  ownerError,
  onClearOwnerError,
  hasAccessCode,
  children,
}: ShellProps) {
  const [showUnlock, setShowUnlock] = useState(false)
  const [code, setCode] = useState('')

  const submitCode = () => {
    const trimmed = code.trim()
    if (!trimmed) return
    // Do NOT close the input here. On a wrong code, App flips `ownerError` and
    // `mode` stays synthetic, so this branch keeps rendering with the inline
    // error. On success, `mode` becomes 'owner' and the whole unlock branch is
    // replaced by the Lock button — no explicit close needed.
    onUnlock(trimmed)
  }

  const cancelUnlock = () => {
    setShowUnlock(false)
    setCode('')
    onClearOwnerError()
  }

  const lockOut = () => {
    // Reset the input so a later synthetic session starts closed and clean.
    setShowUnlock(false)
    setCode('')
    onUnlock('')
  }

  return (
    <div className="shell">
      <div className="app-atmosphere" aria-hidden="true">
        <div className="app-glow app-glow--1" />
        <div className="app-glow app-glow--2" />
        <div className="app-glow app-glow--3" />
      </div>
      <aside className="shell-aside">
        <div
          className="shell-brand"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, marginBottom: 26 }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(140deg, rgba(110,231,179,0.95), rgba(167,139,250,0.95))',
              boxShadow: '0 0 24px -4px rgba(167,139,250,0.6)',
            }}
          >
            <Scan size={21} color="#0a0a0c" strokeWidth={2.4} />
          </div>
          <div
            style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)' }}
          >
            LIFELENS
          </div>
        </div>
        <nav className="shell-nav" aria-label="Primary">
          {NAV.map((item) => {
            const on = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={on ? 'page' : undefined}
                title={item.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  padding: '11px 0',
                  borderRadius: 14,
                  border: 'none',
                  background: on ? `rgba(${item.accent},0.10)` : 'transparent',
                  color: on ? `rgb(${item.accent})` : 'var(--text-faint)',
                  boxShadow: on
                    ? `inset 0 0 0 1px rgba(${item.accent},0.22), 0 0 24px -6px rgba(${item.accent},0.5)`
                    : 'none',
                  fontWeight: on ? 600 : 500,
                  transition: 'all 0.2s ease',
                }}
              >
                {item.icon}
                <span style={{ fontSize: 9.5, letterSpacing: '0.03em' }}>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="shell-aside__footer">
          Independent
          <br />
          personal tool
        </div>
      </aside>

      <div className="shell-body">
        <header className="shell-header">
          <span className={mode === 'owner' ? 'chip chip--accent' : 'chip chip--dim'}>
            {mode === 'owner' ? 'OWNER DATA' : 'SYNTHETIC PERSONA'}
          </span>
          <span className="faint" style={{ fontSize: 12, minWidth: 0 }}>
            {mode === 'owner'
              ? 'Showing your real snapshot (access-code verified, served server-side).'
              : 'Showing a synthetic demo persona. Unlock with your access code to see real data.'}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {refreshFailed && (
              <span className="chip chip--amber" role="status">
                Refresh failed — showing last data
              </span>
            )}
            <button
              className="btn btn--ghost"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh data"
            >
              <RefreshCcw size={14} className={refreshing ? 'pulsing' : undefined} aria-hidden="true" />{' '}
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {mode === 'owner' ? (
              <button className="btn" onClick={lockOut}>
                <Lock size={14} /> Lock
              </button>
            ) : showUnlock ? (
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <input
                    type="password"
                    placeholder="Access code"
                    value={code}
                    autoFocus
                    onChange={(e) => {
                      setCode(e.target.value)
                      if (ownerError) onClearOwnerError()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitCode()
                      else if (e.key === 'Escape') cancelUnlock()
                    }}
                    aria-label="Access code"
                    aria-invalid={ownerError !== null}
                    style={{ width: 150 }}
                  />
                  <button className="btn btn--primary" onClick={submitCode} disabled={refreshing}>
                    Unlock
                  </button>
                  <button className="btn btn--ghost" onClick={cancelUnlock} aria-label="Cancel unlock">
                    Cancel
                  </button>
                </span>
                {ownerError && (
                  <span className="neg" role="alert" style={{ fontSize: 11 }}>
                    {ownerError === 'bad_code'
                      ? 'Invalid access code'
                      : 'Server unavailable — try again'}
                  </span>
                )}
              </span>
            ) : (
              <button
                className="btn"
                onClick={() => {
                  onClearOwnerError()
                  setShowUnlock(true)
                }}
                data-testid="owner-unlock"
              >
                <Unlock size={14} /> {hasAccessCode ? 'Re-enter code' : 'Owner unlock'}
              </button>
            )}
          </div>
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  )
}
