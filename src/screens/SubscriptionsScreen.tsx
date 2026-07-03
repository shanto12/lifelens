import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, ExternalLink, PiggyBank, Repeat, Sparkles } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { AlternativesResult, Cadence, Subscription, SubscriptionStatus } from '../lib/types'
import { daysBetween, fmtDate, fmtUsd, pct, titleCase } from '../lib/format'
import { postAction, streamSse } from '../lib/api'
import { detectRecurring, findCatalogAlternatives } from '../engine'

const CADENCE_SHORT: Record<Cadence, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
  unknown: '',
}

const STATUS_CHIP: Record<SubscriptionStatus, string> = {
  active: 'chip chip--accent',
  trial: 'chip chip--sky',
  cancelled: 'chip chip--dim',
  unknown: 'chip chip--dim',
}

/** Normalized view shared by catalog alternatives and AI suggestions. */
interface AltView {
  name: string
  price: number | null
  cadence: Cadence
  annualSavings: number | null
  qualityNote: string | null
  healthNote: string | null
  url: string | null
}

interface AiState {
  streaming: boolean
  text: string
  result: AlternativesResult | null
  error: string | null
}

const EMPTY_AI: AiState = { streaming: false, text: '', result: null, error: null }

type AcceptStatus = 'saving' | 'ok' | 'fail'

function AltCard({ alt, action }: { alt: AltView; action?: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>{alt.name}</span>
        <span className="mono muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {fmtUsd(alt.price)}
          {CADENCE_SHORT[alt.cadence]}
        </span>
      </div>
      {alt.annualSavings !== null && alt.annualSavings > 0 && (
        <div className="pos" style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
          {fmtUsd(alt.annualSavings)}/yr saved
        </div>
      )}
      {alt.qualityNote && (
        <div className="muted" style={{ fontSize: 12 }}>
          {alt.qualityNote}
        </div>
      )}
      {alt.healthNote && <span className="chip chip--rose" style={{ alignSelf: 'flex-start' }}>{alt.healthNote}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
        {alt.url && (
          <a href={alt.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ExternalLink size={12} aria-hidden="true" /> Visit site
          </a>
        )}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
    </div>
  )
}

/**
 * Streaming output panel that auto-scrolls to the bottom as text arrives —
 * unless the user has scrolled up to read earlier output (then we leave it be).
 */
function StreamBox({ text, streaming, error }: { text: string; streaming: boolean; error: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // If the user scrolled up (>24px from the bottom), don't yank them back down.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (nearBottom) el.scrollTop = el.scrollHeight
    // Keyed on text length so it fires as deltas append.
  }, [text.length])
  return (
    <div ref={ref} className={streaming ? 'stream-box pulsing' : 'stream-box'} aria-live="polite">
      {error !== null ? <span className="neg">{error}</span> : text || 'Contacting research model…'}
    </div>
  )
}

/**
 * One subscription table row. Owns its own AI-research + accept state so a
 * streamed delta re-renders only this row — not the entire subscriptions table.
 * Wrapped in React.memo: collapsed rows never re-render while a sibling streams.
 */
const SubscriptionRow = memo(function SubscriptionRow({
  sub,
  generatedAt,
  isOpen,
  onToggle,
}: {
  sub: Subscription
  generatedAt: string
  isOpen: boolean
  onToggle: (id: number) => void
}) {
  const [ai, setAi] = useState<AiState>(EMPTY_AI)
  const [accepted, setAccepted] = useState<Record<string, AcceptStatus>>({})

  const renewDays = sub.nextRenewal !== null ? daysBetween(generatedAt, sub.nextRenewal) : null
  const catalogAlts = isOpen ? findCatalogAlternatives(sub) : []
  const showStream = ai.streaming || ai.error !== null || (ai.result === null && ai.text !== '')

  const runResearch = () => {
    setAi({ streaming: true, text: '', result: null, error: null })
    void streamSse<AlternativesResult>(
      '/api/alternatives',
      {
        merchant: sub.merchant,
        plan: sub.plan,
        amount: sub.amount,
        cadence: sub.cadence,
        annualCost: sub.annualCost,
        category: sub.category,
      },
      {
        onStart: (meta) =>
          setAi((prev) => ({ ...prev, streaming: true, text: `Researching via ${meta.provider} · ${meta.model}…\n` })),
        onDelta: (text) => setAi((prev) => ({ ...prev, text: prev.text + text })),
        onResult: (result) => setAi((prev) => ({ ...prev, result })),
        onError: (message) => setAi((prev) => ({ ...prev, error: message })),
        onDone: () => setAi((prev) => ({ ...prev, streaming: false })),
      },
    )
  }

  const acceptSuggestion = async (name: string, annualSavings: number | null) => {
    setAccepted((prev) => ({ ...prev, [name]: 'saving' }))
    const res = await postAction({
      kind: 'alternative_accepted',
      target: sub.merchant,
      payload: { suggestion: name, annualSavings },
    })
    setAccepted((prev) => ({ ...prev, [name]: res.ok ? 'ok' : 'fail' }))
  }

  return (
    <Fragment>
      <tr>
        <td>
          <button
            className="btn btn--ghost"
            style={{ padding: 4 }}
            onClick={() => onToggle(sub.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} details for ${sub.merchant}`}
          >
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </td>
        <td style={{ fontWeight: 600 }}>{sub.merchant}</td>
        <td className="muted">{sub.plan ?? '—'}</td>
        <td className="mono" style={{ whiteSpace: 'nowrap' }}>
          {fmtUsd(sub.amount)}
          <span className="faint">{CADENCE_SHORT[sub.cadence]}</span>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {sub.nextRenewal === null ? (
            <span className="faint">—</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {fmtDate(sub.nextRenewal)}
              {renewDays !== null && renewDays >= 0 && renewDays <= 14 && (
                <span className="chip chip--amber">{renewDays === 0 ? 'today' : `in ${renewDays}d`}</span>
              )}
            </span>
          )}
        </td>
        <td className="mono" style={{ textAlign: 'right' }}>
          {fmtUsd(sub.annualCost, { compact: true })}
        </td>
        <td>
          <span className="chip chip--dim">{pct(sub.confidence * 100)}</span>
        </td>
        <td>
          <span className={STATUS_CHIP[sub.status]}>{titleCase(sub.status)}</span>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg-raised)' }}>
            <div style={{ display: 'grid', gap: 14, padding: '6px 4px 10px' }}>
              {sub.evidence && (
                <div className="faint" style={{ fontSize: 12 }}>
                  Evidence: {sub.evidence}
                </div>
              )}

              <div>
                <div className="stat-label" style={{ marginBottom: 8 }}>
                  Catalog alternatives
                </div>
                {catalogAlts.length === 0 ? (
                  <div className="faint" style={{ fontSize: 12 }}>
                    No catalog alternatives for this merchant.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                    {catalogAlts.map((alt) => (
                      <AltCard
                        key={alt.name}
                        alt={{
                          name: alt.name,
                          price: alt.price,
                          cadence: alt.cadence,
                          annualSavings: alt.annualSavings,
                          qualityNote: alt.qualityNote,
                          healthNote: alt.healthNote,
                          url: alt.url,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="stat-label">Live research</span>
                  <button className="btn btn--violet" disabled={ai.streaming} onClick={runResearch}>
                    <Sparkles size={14} />
                    {ai.streaming ? 'Researching…' : 'Research live alternatives (AI)'}
                  </button>
                </div>

                {showStream && <StreamBox text={ai.text} streaming={ai.streaming} error={ai.error} />}

                {ai.result && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {ai.result.suggestions.length === 0 ? (
                      <div className="faint" style={{ fontSize: 12 }}>
                        The model found no better alternatives.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                        {ai.result.suggestions.map((s) => {
                          const status = accepted[s.name]
                          return (
                            <AltCard
                              key={s.name}
                              alt={{
                                name: s.name,
                                price: s.price,
                                cadence: s.cadence,
                                annualSavings: s.annualSavings,
                                qualityNote: s.qualityNote,
                                healthNote: s.healthNote,
                                url: s.url,
                              }}
                              action={
                                <button
                                  className={status === 'ok' ? 'btn' : 'btn btn--primary'}
                                  style={{ padding: '5px 10px', fontSize: 12 }}
                                  disabled={status === 'saving' || status === 'ok'}
                                  onClick={() => void acceptSuggestion(s.name, s.annualSavings)}
                                >
                                  {status === 'ok' ? (
                                    <>
                                      <Check size={13} /> Accepted
                                    </>
                                  ) : status === 'saving' ? (
                                    'Saving…'
                                  ) : status === 'fail' ? (
                                    'Retry accept'
                                  ) : (
                                    'Accept'
                                  )}
                                </button>
                              }
                            />
                          )
                        })}
                      </div>
                    )}
                    {ai.result.recommendation && (
                      <p className="muted" style={{ fontSize: 13, maxWidth: 720 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>Recommendation: </span>
                        {ai.result.recommendation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
})

export default function SubscriptionsScreen({ snapshot, analytics }: ScreenProps) {
  const { generatedAt } = snapshot
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showUntracked, setShowUntracked] = useState(false)

  const subs = useMemo(
    () =>
      [...snapshot.subscriptions].sort(
        (a, b) => (b.annualCost ?? -1) - (a.annualCost ?? -1),
      ),
    [snapshot.subscriptions],
  )

  const activeCount = useMemo(
    () => snapshot.subscriptions.filter((s) => s.status === 'active').length,
    [snapshot.subscriptions],
  )

  const potentialSavings = useMemo(
    () =>
      snapshot.subscriptions.reduce((sum, sub) => {
        let best = 0
        for (const alt of findCatalogAlternatives(sub)) best = Math.max(best, alt.annualSavings ?? 0)
        return sum + best
      }, 0),
    [snapshot.subscriptions],
  )

  // Recurring charges the engine detects in transactions that aren't already
  // tracked as subscriptions — surfaces spend that would otherwise go unnoticed.
  const untracked = useMemo(() => {
    const tracked = new Set(snapshot.subscriptions.map((s) => s.merchant.trim().toLowerCase()))
    return detectRecurring(snapshot.transactions).filter(
      (s) => !tracked.has(s.merchant.trim().toLowerCase()),
    )
  }, [snapshot.subscriptions, snapshot.transactions])

  const annualTotal = analytics.subscriptionAnnualTotal

  const handleToggle = useCallback(
    (id: number) => setExpandedId((cur) => (cur === id ? null : id)),
    [],
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--sky)' }}>
            <Repeat size={15} />
            <span className="stat-label">Active subscriptions</span>
          </div>
          <div className="stat-value">{activeCount}</div>
          <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
            of {snapshot.subscriptions.length} detected
          </div>
        </div>
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 8 }}>
            Total monthly
          </div>
          <div className="stat-value">{fmtUsd(annualTotal / 12)}</div>
          <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
            monthly-equivalent burn
          </div>
        </div>
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 8 }}>
            Total annual
          </div>
          <div className="stat-value">{fmtUsd(annualTotal, { compact: true })}</div>
          <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
            across all detected subscriptions
          </div>
        </div>
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--accent)' }}>
            <PiggyBank size={15} />
            <span className="stat-label">Potential savings</span>
          </div>
          <div className="stat-value pos">{fmtUsd(potentialSavings, { compact: true })}/yr</div>
          <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
            best catalog alternative per subscription
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Detected subscriptions</div>
        {subs.length === 0 ? (
          <div className="empty-state">No subscriptions detected yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 34 }}>
                    <span className="faint" style={{ fontSize: 10 }}>
                      More
                    </span>
                  </th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Next renewal</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Annual
                  </th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    generatedAt={generatedAt}
                    isOpen={expandedId === sub.id}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {untracked.length > 0 && (
        <div className="card">
          <button
            className="card-title"
            onClick={() => setShowUntracked((v) => !v)}
            aria-expanded={showUntracked}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            {showUntracked ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Detected in transactions — not yet tracked
            <span className="chip chip--amber" style={{ marginLeft: 4 }}>
              {untracked.length}
            </span>
          </button>
          {showUntracked && (
            <div style={{ marginTop: 10, overflowX: 'auto' }}>
              <p className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
                Recurring charges the engine spotted in your transactions that aren&apos;t in the tracked
                list above.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Merchant</th>
                    <th scope="col">Cadence</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Amount
                    </th>
                    <th scope="col">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {untracked.map((s) => (
                    <tr key={s.merchant}>
                      <td style={{ fontWeight: 600 }}>{s.merchant}</td>
                      <td className="muted">{titleCase(s.cadence)}</td>
                      <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtUsd(s.amount)}
                        <span className="faint">{CADENCE_SHORT[s.cadence]}</span>
                      </td>
                      <td>
                        <span className="chip chip--dim">{pct(s.confidence * 100)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
