import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { BriefResult, HealthSignalFlag, InsightType, SseStartEvent } from '../lib/types'
import { streamSse } from '../lib/api'
import { computeHealthFlags } from '../engine'
import { daysBetween, fmtDate, fmtUsd, titleCase } from '../lib/format'

const TYPE_CHIP: Record<InsightType, string> = {
  save_money: 'chip--accent',
  health: 'chip--rose',
  wealth: 'chip--violet',
  relationship: 'chip--sky',
  time: 'chip--dim',
  alert: 'chip--amber',
}

const STATUS_CHIP: Record<'new' | 'done' | 'dismissed', string> = {
  new: 'chip--sky',
  done: 'chip--accent',
  dismissed: 'chip--dim',
}

const LEDGER_FILTERS = ['all', 'save_money', 'health', 'wealth', 'alert'] as const
type LedgerFilter = (typeof LEDGER_FILTERS)[number]

function daysSince(iso: string | null, refIso: string): number | null {
  if (!iso) return null
  const days = daysBetween(iso, refIso)
  if (Number.isNaN(days)) return null
  return Math.max(0, days)
}

export default function InsightsScreen({ snapshot, analytics }: ScreenProps) {
  const [streaming, setStreaming] = useState(false)
  const [meta, setMeta] = useState<SseStartEvent | null>(null)
  const [streamText, setStreamText] = useState('')
  const [brief, setBrief] = useState<BriefResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<LedgerFilter>('all')

  const generateBrief = () => {
    if (streaming) return
    setStreaming(true)
    setMeta(null)
    setStreamText('')
    setBrief(null)
    setError(null)

    const gen = snapshot.generatedAt
    const peopleNudges = snapshot.people
      .filter((p) => p.family)
      .map((p) => ({ name: p.name, days: daysSince(p.lastContact, gen) }))
      .filter((n) => n.days === null || n.days > 30)
      .sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 3)
      .map((n) => (n.days === null ? `${n.name} (no contact on record)` : `${n.name} (${n.days} days since contact)`))

    const upcomingRenewals = snapshot.subscriptions
      .filter((s) => s.nextRenewal !== null && (s.status === 'active' || s.status === 'trial'))
      .sort((a, b) => (a.nextRenewal ?? '').localeCompare(b.nextRenewal ?? ''))
      .slice(0, 6)
      .map((s) => ({ merchant: s.merchant, nextRenewal: s.nextRenewal, amount: s.amount, cadence: s.cadence }))

    const summary = {
      totalTracked: analytics.totalTracked,
      topCategories: analytics.byCategory.slice(0, 6),
      topMerchants: analytics.byMerchant.slice(0, 8),
      subscriptions: snapshot.subscriptions.map((s) => ({
        merchant: s.merchant,
        plan: s.plan,
        amount: s.amount,
        cadence: s.cadence,
        annualCost: s.annualCost,
        status: s.status,
      })),
      upcomingRenewals,
      healthFlags: computeHealthFlags(snapshot).map((f: HealthSignalFlag) => f.title),
      peopleNudges,
      mode: snapshot.mode,
    }

    void streamSse<BriefResult>(
      '/api/insights-brief',
      { summary },
      {
        onStart: (m) => setMeta(m),
        onDelta: (text) => setStreamText((prev) => prev + text),
        onResult: (result) => setBrief(result),
        onError: (message) => {
          setError(message)
          setStreaming(false)
        },
        onDone: () => setStreaming(false),
      },
    )
  }

  const ledger = useMemo(
    () =>
      snapshot.insights
        .filter((i) => filter === 'all' || i.type === filter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [snapshot.insights, filter],
  )

  return (
    <div className="grid" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <h1>Insights</h1>
        <p>AI daily brief over your compact spend summary, plus the running insight ledger.</p>
      </div>

      <div className="card card--violet">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={generateBrief} disabled={streaming}>
            <Sparkles size={14} aria-hidden />
            {streaming ? 'Generating…' : "Generate today's brief"}
          </button>
          {meta && (
            <>
              <span className="chip chip--violet">{meta.provider}</span>
              <span className="chip chip--dim mono">{meta.model}</span>
            </>
          )}
          <span className="faint" style={{ fontSize: 12 }}>
            Sends only a compact aggregate summary — never raw emails.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="chip chip--rose"
            style={{ marginTop: 12, whiteSpace: 'normal' }}
          >
            {error}
          </div>
        )}

        {(streaming || streamText) && !brief && (
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

        {brief && (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{brief.headline}</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {brief.sections.map((section, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 14,
                    display: 'grid',
                    gap: 6,
                    alignContent: 'start',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{section.title}</span>
                    {section.impactUsd !== null && (
                      <span className="chip chip--accent">{fmtUsd(section.impactUsd, { compact: true })}</span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {section.body}
                  </div>
                </div>
              ))}
            </div>
            {brief.totalPotentialAnnualSavings !== null && (
              <div>
                <div className="stat-value pos">
                  {fmtUsd(brief.totalPotentialAnnualSavings, { compact: true })}
                </div>
                <div className="stat-label">Total potential annual savings identified</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Insight ledger</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {LEDGER_FILTERS.map((f) => (
            <button
              key={f}
              className={`chip ${filter === f ? 'chip--violet' : 'chip--dim'}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              style={{ cursor: 'pointer' }}
            >
              {f === 'all' ? 'All' : titleCase(f)}
            </button>
          ))}
        </div>
        {ledger.length === 0 ? (
          <div className="empty-state">No insights match this filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Created</th>
                  <th scope="col">Type</th>
                  <th scope="col">Insight</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Impact
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((insight) => (
                  <tr key={insight.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {fmtDate(insight.createdAt)}
                    </td>
                    <td>
                      <span className={`chip ${TYPE_CHIP[insight.type]}`}>{titleCase(insight.type)}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{insight.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {insight.body}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span className="mono">{fmtUsd(insight.impactUsd)}</span>
                      {insight.impactKind && (
                        <div className="faint" style={{ fontSize: 11 }}>
                          {titleCase(insight.impactKind)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CHIP[insight.status]}`}>{titleCase(insight.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
