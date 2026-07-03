import { useMemo, useState } from 'react'
import { Check, PhoneCall, ShieldCheck, Sparkles } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { ActionItem, CallScriptResult, SseStartEvent } from '../lib/types'
import { getAccessCode, streamSse } from '../lib/api'
import { fmtDate, fmtUsd, titleCase } from '../lib/format'

const GOALS = [
  { value: 'negotiate bill down', label: 'Negotiate bill down' },
  { value: 'cancel subscription', label: 'Cancel subscription' },
  { value: 'dispute charge', label: 'Dispute charge' },
  { value: 'ask for retention offer', label: 'Ask for retention offer' },
  { value: 'custom', label: 'Custom goal…' },
] as const

const KIND_CHIP: Record<ActionItem['kind'], string> = {
  call_script: 'chip--violet',
  call_initiated: 'chip--sky',
  cancel_draft: 'chip--amber',
  alternative_accepted: 'chip--accent',
  note: 'chip--dim',
}

const STATUS_CHIP: Record<ActionItem['status'], string> = {
  pending: 'chip--dim',
  done: 'chip--accent',
  failed: 'chip--rose',
  dry_run: 'chip--amber',
}

interface CallOutcome {
  status: 'dry_run' | 'initiated' | 'failed'
  reason?: 'not_owner' | 'twilio_unconfigured'
  sid?: string
}

function flattenScript(s: CallScriptResult): string {
  return [
    `Opening: ${s.opening}`,
    'Key points:',
    ...s.keyPoints.map((k) => `- ${k}`),
    'Objection handling:',
    ...s.objectionHandlers.map((o) => `If "${o.objection}": ${o.response}`),
    `Closing: ${s.closing}`,
  ].join('\n')
}

export default function ActionsScreen({ snapshot }: ScreenProps) {
  const [target, setTarget] = useState('AT&T retention dept')
  const [goal, setGoal] = useState<string>('negotiate bill down')
  const [customGoal, setCustomGoal] = useState('')
  const [context, setContext] = useState('')
  const [provider, setProvider] = useState<'glm' | 'grok'>('glm')

  const [streaming, setStreaming] = useState(false)
  const [meta, setMeta] = useState<SseStartEvent | null>(null)
  const [streamText, setStreamText] = useState('')
  const [script, setScript] = useState<CallScriptResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [placing, setPlacing] = useState(false)
  const [callOutcome, setCallOutcome] = useState<CallOutcome | null>(null)

  const effectiveGoal = goal === 'custom' ? customGoal.trim() : goal
  const canDraft = !streaming && target.trim().length > 0 && effectiveGoal.length > 0

  const draftScript = () => {
    if (!canDraft) return
    setStreaming(true)
    setMeta(null)
    setStreamText('')
    setScript(null)
    setError(null)
    setCallOutcome(null)

    void streamSse<CallScriptResult>(
      '/api/call-script',
      { target: target.trim(), goal: effectiveGoal, context: context.trim(), provider },
      {
        onStart: (m) => setMeta(m),
        onDelta: (text) => setStreamText((prev) => prev + text),
        onResult: (result) => setScript(result),
        onError: (message) => {
          setError(message)
          setStreaming(false)
        },
        onDone: () => setStreaming(false),
      },
    )
  }

  const placeCall = async () => {
    if (!script || placing) return
    setPlacing(true)
    setCallOutcome(null)
    try {
      const code = getAccessCode()
      const res = await fetch('/api/call-initiate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(code ? { 'x-access-code': code } : {}),
        },
        body: JSON.stringify({ target: script.target || target.trim(), script: flattenScript(script) }),
      })
      if (!res.ok) {
        setCallOutcome({ status: 'failed' })
        return
      }
      const data = (await res.json()) as {
        status?: string
        sid?: string
        reason?: 'not_owner' | 'twilio_unconfigured'
      }
      if (data.status === 'dry_run' || data.status === 'initiated') {
        setCallOutcome({ status: data.status, reason: data.reason, sid: data.sid })
      } else {
        setCallOutcome({ status: 'failed' })
      }
    } catch {
      setCallOutcome({ status: 'failed' })
    } finally {
      setPlacing(false)
    }
  }

  const audit = useMemo(
    () =>
      [...snapshot.actions]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => ({ item: a, payload: JSON.stringify(a.payload) })),
    [snapshot.actions],
  )

  return (
    <div className="grid" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Actions &amp; Calls</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Draft negotiation scripts with AI, place (dry-run) calls, and review the full audit trail.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Draft a call script</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
            Who are you calling?
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. AT&T retention dept"
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
            Goal
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          {goal === 'custom' && (
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
              Custom goal
              <input
                type="text"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="e.g. move to the grandfathered loyalty plan"
              />
            </label>
          )}
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-dim)', marginTop: 12 }}>
          Context for the model
          <textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Fiber bill jumped from $65 to $89 after the promo expired; competitor offers $60; customer for 4 years, always on autopay."
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 12 }}>
            Script model:
          </span>
          <span role="group" aria-label="Script model provider" style={{ display: 'inline-flex', gap: 6 }}>
            <button
              className={`chip ${provider === 'glm' ? 'chip--violet' : 'chip--dim'}`}
              aria-pressed={provider === 'glm'}
              onClick={() => setProvider('glm')}
              style={{ cursor: 'pointer' }}
            >
              GLM (default)
            </button>
            <button
              className={`chip ${provider === 'grok' ? 'chip--violet' : 'chip--dim'}`}
              aria-pressed={provider === 'grok'}
              onClick={() => setProvider('grok')}
              style={{ cursor: 'pointer' }}
            >
              Grok
            </button>
          </span>
          <button className="btn btn--violet" onClick={draftScript} disabled={!canDraft} style={{ marginLeft: 'auto' }}>
            <Sparkles size={14} aria-hidden />
            {streaming ? 'Drafting…' : 'Draft script'}
          </button>
        </div>

        {error && (
          <div role="alert" className="chip chip--rose" style={{ marginTop: 12, whiteSpace: 'normal' }}>
            {error}
          </div>
        )}

        {(streaming || streamText) && !script && (
          <div className="stream-box" style={{ marginTop: 12 }} aria-live="polite">
            {streamText ? (
              streamText
            ) : (
              <span className="pulsing muted">
                {meta ? `Streaming from ${meta.provider} (${meta.model})…` : 'Contacting model…'}
              </span>
            )}
          </div>
        )}

        {script && (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="chip chip--violet">{titleCase(script.goal)}</span>
              <span className="chip chip--sky">{script.target}</span>
              {meta && <span className="chip chip--dim mono">{meta.model}</span>}
              {script.estimatedSavingsUsd !== null && (
                <span className="chip chip--accent">
                  Est. savings {fmtUsd(script.estimatedSavingsUsd, { compact: true })}
                </span>
              )}
            </div>

            <blockquote
              style={{
                borderLeft: '3px solid var(--violet)',
                background: 'var(--bg-raised)',
                borderRadius: '0 8px 8px 0',
                padding: '10px 14px',
                fontStyle: 'italic',
                fontSize: 13,
              }}
            >
              “{script.opening}”
            </blockquote>

            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Key points
              </div>
              <ul style={{ listStyle: 'none', display: 'grid', gap: 6 }}>
                {script.keyPoints.map((point) => (
                  <li key={point} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                    <Check size={15} aria-hidden style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            {script.objectionHandlers.length > 0 && (
              <div>
                <div className="card-title" style={{ marginBottom: 8 }}>
                  Objection handling
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {script.objectionHandlers.map((o) => (
                    <div
                      key={o.objection}
                      style={{
                        border: '1px solid var(--border)',
                        background: 'var(--bg-raised)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--rose)' }}>
                        If they say: “{o.objection}”
                      </div>
                      <div style={{ fontSize: 13 }}>{o.response}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <blockquote
              style={{
                borderLeft: '3px solid var(--accent)',
                background: 'var(--bg-raised)',
                borderRadius: '0 8px 8px 0',
                padding: '10px 14px',
                fontStyle: 'italic',
                fontSize: 13,
              }}
            >
              “{script.closing}”
            </blockquote>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" onClick={() => void placeCall()} disabled={placing}>
                <PhoneCall size={14} aria-hidden />
                {placing ? 'Placing call…' : 'Place call'}
              </button>
              {callOutcome?.status === 'dry_run' && (
                <span className="chip chip--amber" role="status">
                  {callOutcome.reason === 'not_owner'
                    ? 'DRY RUN — demo mode never places real calls'
                    : 'DRY RUN — Twilio not configured'}
                </span>
              )}
              {callOutcome?.status === 'initiated' && (
                <span className="chip chip--accent" role="status">
                  Call initiated{callOutcome.sid ? ` · SID ${callOutcome.sid}` : ''}
                </span>
              )}
              {callOutcome?.status === 'failed' && (
                <span className="chip chip--rose" role="status">
                  Call request failed
                </span>
              )}
              <span className="faint" style={{ fontSize: 12 }}>
                Calls only go to owner-configured numbers.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Audit trail</div>
        {audit.length === 0 ? (
          <div className="empty-state">No actions logged yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Target</th>
                  <th scope="col">Status</th>
                  <th scope="col">Payload</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(({ item: a, payload }) => {
                  return (
                    <tr key={a.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(a.createdAt)}
                      </td>
                      <td>
                        <span className={`chip ${KIND_CHIP[a.kind]}`}>{titleCase(a.kind)}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{a.target}</td>
                      <td>
                        <span className={`chip ${STATUS_CHIP[a.status]}`}>{titleCase(a.status)}</span>
                      </td>
                      <td
                        className="mono faint"
                        style={{ fontSize: 11, maxWidth: 280, wordBreak: 'break-all' }}
                      >
                        {payload.length > 90 ? `${payload.slice(0, 90)}…` : payload}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={13} aria-hidden />
          Safety model
        </div>
        <ul style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li className="muted" style={{ fontSize: 13 }}>
            Outbound calls can only be placed to owner-configured numbers — never to arbitrary targets.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            Every script is rendered for human review before a call is placed; nothing dials automatically.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            Without Twilio credentials the endpoint runs in dry-run mode and no call is made.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            Every action — drafts, calls, cancellations — is logged to the audit trail above.
          </li>
        </ul>
      </div>
    </div>
  )
}
