import { AlertTriangle, HeartPulse, Lightbulb, Utensils } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { HealthSignalFlag, SpendCategory } from '../lib/types'
import { computeHealthFlags } from '../engine'
import { fmtDate, fmtUsd, pct, titleCase } from '../lib/format'

const FLAG_META: Record<
  HealthSignalFlag['kind'],
  { label: string; color: string; dim: string; icon: typeof HeartPulse }
> = {
  positive: { label: 'Positive signals', color: 'var(--accent)', dim: 'var(--accent-dim)', icon: HeartPulse },
  watch: { label: 'Worth watching', color: 'var(--rose)', dim: 'var(--rose-dim)', icon: AlertTriangle },
  suggestion: { label: 'Suggestions', color: 'var(--violet)', dim: 'var(--violet-dim)', icon: Lightbulb },
}

const FLAG_ORDER: HealthSignalFlag['kind'][] = ['positive', 'watch', 'suggestion']

/** Local catalog fallback: health-angle swaps matched against active subscriptions by category. */
const FALLBACK_SWAPS: { match: SpendCategory[]; name: string; healthNote: string; qualityNote: string }[] = [
  {
    match: ['dining'],
    name: 'Grocery-first meal-prep plan',
    healthNote: 'Cooking at home cuts sodium, sugar and portion creep versus delivery.',
    qualityNote: 'Two prep sessions a week replace most weekday delivery orders.',
  },
  {
    match: ['streaming', 'entertainment'],
    name: 'Single-service rotation + library card',
    healthNote: 'Fewer late-night binge sessions supports a consistent sleep schedule.',
    qualityNote: 'Rotate one paid service per month; Libby and Kanopy are free with a library card.',
  },
  {
    match: ['fitness'],
    name: 'Community rec-center membership',
    healthNote: 'Keeps the workout habit going at a fraction of boutique pricing.',
    qualityNote: 'Most rec centers include pool, weights and group classes.',
  },
]

interface SwapView {
  key: string
  forMerchant: string
  name: string
  healthNote: string
  qualityNote: string | null
  annualSavings: number | null
  url: string | null
}

function ShareBar({ label, value, color }: { label: string; value: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span className="muted">{label}</span>
        <span className="mono">{pct(clamped)}</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${pct(clamped)} of tracked spend`}
        style={{ height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}
      >
        <div style={{ width: `${clamped}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
    </div>
  )
}

export default function HealthScreen({ snapshot, analytics }: ScreenProps) {
  const flags: HealthSignalFlag[] = computeHealthFlags(snapshot)

  const { frequentItems, dietaryNotes } = snapshot.profile.summary.foodPreferences

  const healthTx = snapshot.transactions
    .filter((t) => t.category === 'health')
    .sort((a, b) => b.date.localeCompare(a.date))
  const healthTotal = healthTx.reduce((sum, t) => sum + (t.amount ?? 0), 0)

  const diningShare = analytics.byCategory.find((c) => c.category === 'dining')?.pctOfTotal ?? 0
  const groceriesShare = analytics.byCategory.find((c) => c.category === 'groceries')?.pctOfTotal ?? 0

  const aiSwaps: SwapView[] = snapshot.alternatives
    .filter((a) => a.healthNote !== null)
    .map((a) => ({
      key: `alt-${a.id}`,
      forMerchant: a.merchant,
      name: a.name,
      healthNote: a.healthNote ?? '',
      qualityNote: a.qualityNote,
      annualSavings: a.annualSavings,
      url: a.url,
    }))

  const fallbackSwaps: SwapView[] =
    aiSwaps.length > 0
      ? []
      : snapshot.subscriptions
          .filter((s) => s.status === 'active' || s.status === 'trial')
          .flatMap((s) => {
            const entry = FALLBACK_SWAPS.find((f) => f.match.includes(s.category))
            if (!entry) return []
            return [
              {
                key: `catalog-${s.id}`,
                forMerchant: s.merchant,
                name: entry.name,
                healthNote: entry.healthNote,
                qualityNote: entry.qualityNote,
                annualSavings: null,
                url: null,
              },
            ]
          })

  const swaps = aiSwaps.length > 0 ? aiSwaps : fallbackSwaps

  const wellbeingEvents = snapshot.events
    .filter((e) => e.kind === 'fitness' || e.kind === 'health')
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="grid" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Health</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Wellbeing signals inferred from spending, food habits and calendar patterns.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {FLAG_ORDER.map((kind) => {
          const meta = FLAG_META[kind]
          const Icon = meta.icon
          const group = flags.filter((f) => f.kind === kind)
          return (
            <section key={kind} aria-label={meta.label} className="card">
              <div className="card-title" style={{ color: meta.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon size={13} aria-hidden />
                {meta.label}
              </div>
              {group.length === 0 ? (
                <div className="faint" style={{ fontSize: 12 }}>
                  Nothing flagged in this snapshot.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {group.map((f) => (
                    <div
                      key={f.title}
                      style={{
                        background: meta.dim,
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'grid',
                        gap: 3,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: meta.color }}>{f.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {f.detail}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Utensils size={13} aria-hidden />
            Food &amp; habits
          </div>
          {frequentItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {frequentItems.map((item) => (
                <span key={item} className="chip chip--sky">
                  {item}
                </span>
              ))}
            </div>
          )}
          {dietaryNotes.length > 0 ? (
            <ul style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
              {dietaryNotes.map((n) => (
                <li key={n} className="muted" style={{ fontSize: 12 }}>
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <div className="faint" style={{ fontSize: 12 }}>
              No dietary notes derived yet.
            </div>
          )}
          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            <ShareBar label="Dining out" value={diningShare} color="var(--rose)" />
            <ShareBar label="Groceries" value={groceriesShare} color="var(--accent)" />
            <div className="faint" style={{ fontSize: 11 }}>
              Share of total tracked spend. A groceries-heavy mix usually correlates with more home cooking.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Healthier swaps</div>
          {swaps.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>
              No health-angle alternatives for the current subscriptions.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {swaps.map((s) => (
                <div
                  key={s.key}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <span className="chip chip--dim">replaces {s.forMerchant}</span>
                    {s.annualSavings !== null && (
                      <span className="chip chip--accent">saves {fmtUsd(s.annualSavings, { compact: true })}/yr</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--violet)' }}>{s.healthNote}</div>
                  {s.qualityNote && (
                    <div className="faint" style={{ fontSize: 12 }}>
                      {s.qualityNote}
                    </div>
                  )}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                      View offer
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Health-related spend</span>
          <span className="mono" style={{ color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
            {fmtUsd(healthTotal)} tracked
          </span>
        </div>
        {healthTx.length === 0 ? (
          <div className="empty-state">No health-category transactions in this snapshot.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Merchant</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Amount
                  </th>
                  <th scope="col">Type</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {healthTx.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{fmtDate(t.date)}</td>
                    <td style={{ fontWeight: 600 }}>{t.merchant}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {fmtUsd(t.amount)}
                    </td>
                    <td>
                      <span className="chip chip--dim">{titleCase(t.kind)}</span>
                    </td>
                    <td className="faint" style={{ fontSize: 12 }}>
                      {t.subject ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Fitness &amp; wellbeing events</div>
        {wellbeingEvents.length === 0 ? (
          <div className="empty-state">No fitness or health events in this snapshot.</div>
        ) : (
          <ul style={{ listStyle: 'none', display: 'grid', gap: 8 }}>
            {wellbeingEvents.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="mono faint" style={{ fontSize: 12, minWidth: 92 }}>
                  {fmtDate(e.date)}
                </span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{e.title}</span>
                <span className="chip chip--dim">{e.calendar}</span>
                {e.recurring && <span className="chip chip--sky">recurring</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="faint" style={{ fontSize: 12 }}>
        LifeLens surfaces patterns from your own data for informational purposes only. It is not medical
        advice — consult a clinician for health decisions.
      </p>
    </div>
  )
}
