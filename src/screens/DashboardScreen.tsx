import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Repeat, Sparkles, Users, Wallet } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { InsightType } from '../lib/types'
import { daysBetween, fmtDate, fmtMonth, fmtUsd, titleCase } from '../lib/format'

const INSIGHT_CHIP: Record<InsightType, string> = {
  save_money: 'chip chip--accent',
  health: 'chip chip--rose',
  wealth: 'chip chip--violet',
  alert: 'chip chip--amber',
  relationship: 'chip chip--sky',
  time: 'chip chip--dim',
}

/** Day-granular timestamp for date-only or full ISO strings. */
function dayValue(iso: string): number {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

function StatCard({
  icon,
  accent,
  variant,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  /** rgb triple, e.g. '110,231,179' */
  accent: string
  variant: string
  label: string
  value: string
  sub: string
}) {
  const color = `rgb(${accent})`
  return (
    <div className={`card ${variant}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color }}>
        {icon}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value" style={{ color, textShadow: `0 0 30px rgba(${accent}, 0.4)` }}>
        {value}
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
        {sub}
      </div>
    </div>
  )
}

export default function DashboardScreen({ snapshot, analytics, onNavigate }: ScreenProps) {
  const { generatedAt } = snapshot

  const monthRange = useMemo(() => {
    if (analytics.byMonth.length === 0) return 'No tracked months'
    const months = analytics.byMonth.map((m) => m.month).sort()
    const first = months[0]
    const last = months[months.length - 1]
    return first === last ? fmtMonth(first) : `${fmtMonth(first)} – ${fmtMonth(last)}`
  }, [analytics.byMonth])

  const topCategories = useMemo(
    () => [...analytics.byCategory].sort((a, b) => b.total - a.total).slice(0, 8),
    [analytics.byCategory],
  )
  const maxCategory = topCategories.length > 0 ? topCategories[0].total : 0

  const renewingSoon = useMemo(
    () =>
      snapshot.subscriptions
        .filter(
          (s) =>
            (s.status === 'active' || s.status === 'trial') &&
            s.nextRenewal !== null &&
            daysBetween(generatedAt, s.nextRenewal) >= 0,
        )
        .sort(
          (a, b) =>
            daysBetween(generatedAt, a.nextRenewal as string) -
            daysBetween(generatedAt, b.nextRenewal as string),
        )
        .slice(0, 5),
    [snapshot.subscriptions, generatedAt],
  )

  const upcomingEvents = useMemo(
    () =>
      snapshot.events
        .filter((e) => dayValue(e.date) >= dayValue(generatedAt))
        .sort((a, b) => dayValue(a.date) - dayValue(b.date))
        .slice(0, 5),
    [snapshot.events, generatedAt],
  )

  const topPeople = useMemo(
    () => [...snapshot.people].sort((a, b) => b.closeness - a.closeness).slice(0, 4),
    [snapshot.people],
  )

  const latestInsights = useMemo(
    () => [...snapshot.insights].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 3),
    [snapshot.insights],
  )

  const openInsights = snapshot.insights.filter((i) => i.status === 'new').length
  const familyCount = snapshot.people.filter((p) => p.family).length
  const subAnnual = analytics.subscriptionAnnualTotal

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <StatCard
          icon={<Wallet size={15} />}
          accent="110,231,179"
          variant="card--emerald"
          label="Tracked spend"
          value={fmtUsd(analytics.totalTracked, { compact: true })}
          sub={monthRange}
        />
        <StatCard
          icon={<Repeat size={15} />}
          accent="251,191,36"
          variant="card--amber"
          label="Subscription burn"
          value={`${fmtUsd(subAnnual, { compact: true })}/yr`}
          sub={`${fmtUsd(subAnnual / 12)}/mo across ${snapshot.subscriptions.length} subscriptions`}
        />
        <StatCard
          icon={<Users size={15} />}
          accent="103,232,249"
          variant="card--cyan"
          label="People mapped"
          value={String(snapshot.people.length)}
          sub={`${familyCount} family`}
        />
        <button
          className="card card--violet"
          onClick={() => onNavigate('insights')}
          style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit', display: 'block', width: '100%' }}
          aria-label={`${openInsights} open insights — go to insights`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--violet)' }}>
            <Sparkles size={15} />
            <span className="stat-label">Insights open</span>
          </div>
          <div className="stat-value" style={{ color: 'var(--violet)', textShadow: '0 0 30px rgba(167,139,250,0.4)' }}>
            {openInsights}
          </div>
          <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
            View all insights →
          </div>
        </button>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))' }}>
        <div className="card card--emerald">
          <div className="card-title">Where the money goes</div>
          {topCategories.length === 0 ? (
            <div className="empty-state">No categorized spend yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {topCategories.map((c) => (
                <div
                  key={c.category}
                  style={{ display: 'grid', gridTemplateColumns: '110px 1fr 76px', gap: 10, alignItems: 'center' }}
                >
                  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {titleCase(c.category)}
                  </span>
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 5, height: 10, overflow: 'hidden' }} aria-hidden="true">
                    <div
                      style={{
                        width: `${maxCategory > 0 ? Math.max((c.total / maxCategory) * 100, 1) : 0}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, rgb(110,231,179), rgb(103,232,249))',
                        borderRadius: 5,
                        boxShadow: '0 0 14px rgba(110,231,179,0.45)',
                      }}
                    />
                  </div>
                  <span className="mono" style={{ fontSize: 12, textAlign: 'right' }}>
                    {fmtUsd(c.total, { compact: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card--amber">
          <div className="card-title">Renewing soon</div>
          {renewingSoon.length === 0 ? (
            <div className="empty-state">No upcoming renewals detected.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {renewingSoon.map((s) => {
                const days = daysBetween(generatedAt, s.nextRenewal as string)
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.merchant}</div>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {fmtDate(s.nextRenewal)}
                      </div>
                    </div>
                    <span className="mono muted" style={{ fontSize: 12 }}>
                      {fmtUsd(s.amount)}
                    </span>
                    <span className={days <= 7 ? 'chip chip--amber' : 'chip chip--dim'}>
                      {days === 0 ? 'today' : `in ${days}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))' }}>
        <div className="card card--cyan">
          <div className="card-title">Life pulse</div>
          {upcomingEvents.length === 0 ? (
            <div className="empty-state">No upcoming events on the calendar.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {upcomingEvents.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="faint mono" style={{ fontSize: 11, width: 86, flexShrink: 0 }}>
                    {fmtDate(e.date)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.title}
                  </span>
                  <span className="chip chip--dim">{titleCase(e.kind)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="stat-label" style={{ marginBottom: 8 }}>
            Closest people
          </div>
          {topPeople.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>
              No people mapped yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {topPeople.map((p) => (
                <span key={p.id} className="chip chip--sky" title={titleCase(p.relationship)}>
                  {p.name} · {p.closeness}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card card--violet">
          <div className="card-title">Latest insights</div>
          {latestInsights.length === 0 ? (
            <div className="empty-state">No insights generated yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {latestInsights.map((i) => (
                <div key={i.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span className={INSIGHT_CHIP[i.type]}>{titleCase(i.type)}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.title}
                    </span>
                    {i.impactUsd !== null && (
                      <span className="pos mono" style={{ fontSize: 12, marginLeft: 'auto', flexShrink: 0 }}>
                        {fmtUsd(i.impactUsd, { compact: true })}
                      </span>
                    )}
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {i.body}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn--ghost" style={{ marginTop: 12 }} onClick={() => onNavigate('insights')}>
            All insights <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
