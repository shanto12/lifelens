import { useMemo } from 'react'
import type { ScreenProps } from '../lib/screen-props'
import type { Account, Cadence, SpendCategory } from '../lib/types'
import { fmtDate, fmtMonth, fmtUsd, pct, titleCase } from '../lib/format'

const CATEGORY_CHIP: Record<SpendCategory, string> = {
  groceries: 'chip chip--accent',
  dining: 'chip chip--accent',
  transport: 'chip chip--sky',
  shopping: 'chip chip--violet',
  electronics: 'chip chip--sky',
  health: 'chip chip--rose',
  entertainment: 'chip chip--violet',
  software: 'chip chip--sky',
  ai_tools: 'chip chip--violet',
  auto: 'chip chip--amber',
  home: 'chip chip--amber',
  streaming: 'chip chip--violet',
  cloud: 'chip chip--sky',
  telecom: 'chip chip--amber',
  insurance: 'chip chip--amber',
  fitness: 'chip chip--rose',
  news: 'chip chip--dim',
  other: 'chip chip--dim',
}

const CADENCE_SHORT: Record<Cadence, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
  unknown: '',
}

/** Format a non-USD amount with its own currency symbol (e.g. AUD 120 → "A$120"). */
function formatNonUsd(currency: string, total: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(total)
  } catch {
    // Unknown/invalid currency code — fall back to a plain "CODE amount" label.
    return `${currency} ${Math.round(total)}`
  }
}

const KIND_ORDER: Account['kind'][] = [
  'checking',
  'credit_card',
  'investment',
  'crypto',
  'telecom',
  'utility',
  'insurance',
  'mortgage_rent',
  'other',
]

export default function MoneyMapScreen({ snapshot, analytics }: ScreenProps) {
  const months = useMemo(
    () => [...analytics.byMonth].sort((a, b) => (a.month < b.month ? -1 : 1)),
    [analytics.byMonth],
  )
  const maxMonth = months.reduce((m, x) => Math.max(m, x.total), 0)

  const categories = useMemo(
    () => [...analytics.byCategory].sort((a, b) => b.total - a.total),
    [analytics.byCategory],
  )

  const topMerchants = useMemo(
    () => [...analytics.byMerchant].sort((a, b) => b.total - a.total).slice(0, 15),
    [analytics.byMerchant],
  )

  const accountGroups = useMemo(() => {
    const groups = new Map<Account['kind'], Account[]>()
    for (const kind of KIND_ORDER) groups.set(kind, [])
    for (const a of snapshot.accounts) (groups.get(a.kind) ?? groups.get('other'))?.push(a)
    return KIND_ORDER.map((kind) => ({ kind, accounts: groups.get(kind) ?? [] })).filter(
      (g) => g.accounts.length > 0,
    )
  }, [snapshot.accounts])

  const recentTx = useMemo(
    () => [...snapshot.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50),
    [snapshot.transactions],
  )

  const nonUsd = analytics.nonUsd

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {nonUsd.length > 0 && (
        <div className="card" style={{ display: 'grid', gap: 6 }}>
          <div className="stat-label">Non-USD activity — shown separately</div>
          <div className="muted" style={{ fontSize: 13 }}>
            The USD totals above exclude charges in other currencies so nothing is mixed.{' '}
            {nonUsd
              .map((n) => `${formatNonUsd(n.currency, n.total)} across ${n.txCount} charge${n.txCount === 1 ? '' : 's'}`)
              .join(' · ')}
            .
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title">Month-by-month spend</div>
        {months.length === 0 ? (
          <div className="empty-state">No monthly spend data yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minWidth: months.length * 52 }}>
              {months.map((m) => (
                <div
                  key={m.month}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
                >
                  <span className="mono faint" style={{ fontSize: 10 }}>
                    {fmtUsd(m.total, { compact: true })}
                  </span>
                  <div
                    role="img"
                    aria-label={`${fmtMonth(m.month)}: ${fmtUsd(m.total)}`}
                    style={{
                      width: '100%',
                      maxWidth: 46,
                      height: maxMonth > 0 ? Math.max(Math.round((m.total / maxMonth) * 140), 3) : 3,
                      background: 'linear-gradient(180deg, var(--accent), rgba(52, 211, 153, 0.3))',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <span className="faint" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                    {fmtMonth(m.month)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div className="card">
          <div className="card-title">Spend by category</div>
          {categories.length === 0 ? (
            <div className="empty-state">No categorized spend yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" style={{ width: '38%' }}>
                      Share
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Tx
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.category}>
                      <td>{titleCase(c.category)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            aria-hidden="true"
                            style={{ flex: 1, background: 'var(--bg-hover)', borderRadius: 4, height: 8, overflow: 'hidden' }}
                          >
                            <div
                              style={{
                                width: `${Math.min(Math.max(c.pctOfTotal, 1), 100)}%`,
                                height: '100%',
                                background: 'var(--accent)',
                                borderRadius: 4,
                              }}
                            />
                          </div>
                          <span className="faint mono" style={{ fontSize: 11, width: 36, textAlign: 'right' }}>
                            {pct(c.pctOfTotal)}
                          </span>
                        </div>
                      </td>
                      <td className="muted" style={{ textAlign: 'right' }}>
                        {c.txCount}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {fmtUsd(c.total, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Top merchants</div>
          {topMerchants.length === 0 ? (
            <div className="empty-state">No merchant data yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Merchant</th>
                    <th scope="col">Category</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Tx
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topMerchants.map((m) => (
                    <tr key={m.merchant}>
                      <td style={{ fontWeight: 600 }}>{m.merchant}</td>
                      <td>
                        <span className={CATEGORY_CHIP[m.category]}>{titleCase(m.category)}</span>
                      </td>
                      <td className="muted" style={{ textAlign: 'right' }}>
                        {m.txCount}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        {fmtUsd(m.total, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Accounts &amp; recurring bills</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Recurring bills total {fmtUsd(analytics.recurringBillsAnnualTotal, { compact: true })}/yr (
          {fmtUsd(analytics.recurringBillsAnnualTotal / 12)}/mo).
        </div>
        {accountGroups.length === 0 ? (
          <div className="empty-state">No accounts detected yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {accountGroups.map((g) => (
              <div key={g.kind}>
                <div className="stat-label" style={{ marginBottom: 6 }}>
                  {titleCase(g.kind)}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {g.accounts.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'var(--bg-raised)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '7px 10px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.institution}
                          {a.last4 && (
                            <span className="faint mono" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                              ••{a.last4}
                            </span>
                          )}
                        </div>
                        <div className="faint" style={{ fontSize: 11 }}>
                          {fmtUsd(a.typicalAmount)}
                          {CADENCE_SHORT[a.cadence]}
                        </div>
                      </div>
                      {a.autopay !== null && (
                        <span className={a.autopay ? 'chip chip--accent' : 'chip chip--dim'}>
                          {a.autopay ? 'Autopay' : 'Manual'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          Recent transactions
          <span className="faint" style={{ textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
            latest {recentTx.length} of {snapshot.transactions.length}
          </span>
        </div>
        {recentTx.length === 0 ? (
          <div className="empty-state">No transactions tracked yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Merchant</th>
                  <th scope="col">Category</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((t) => {
                  const isRefund = t.kind === 'refund'
                  const displayAmount = t.amount === null ? null : isRefund ? -Math.abs(t.amount) : t.amount
                  return (
                    <tr key={t.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(t.date)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.merchant}</div>
                        {t.subject && (
                          <div className="faint" style={{ fontSize: 11, maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.subject}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={CATEGORY_CHIP[t.category]}>{titleCase(t.category)}</span>
                      </td>
                      <td className={isRefund ? 'mono pos' : 'mono'} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtUsd(displayAmount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
