import { BellRing, Users } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { Person, Relationship } from '../lib/types'
import { daysBetween, fmtDate, titleCase } from '../lib/format'

const STALE_DAYS = 30

function daysSince(iso: string | null, refIso: string): number | null {
  if (!iso) return null
  const days = daysBetween(iso, refIso)
  if (Number.isNaN(days)) return null
  return Math.max(0, days)
}

function ClosenessBar({ value, showValue = true }: { value: number; showValue?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        role="img"
        aria-label={`Closeness ${clamped} out of 100`}
        style={{
          flex: 1,
          minWidth: 70,
          height: 6,
          borderRadius: 999,
          background: 'var(--bg-hover)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, var(--sky), var(--violet))',
          }}
        />
      </div>
      {showValue && (
        <span className="mono faint" style={{ fontSize: 11, minWidth: 22, textAlign: 'right' }}>
          {clamped}
        </span>
      )}
    </div>
  )
}

function FamilyCard({ person, generatedAt }: { person: Person; generatedAt: string }) {
  const days = daysSince(person.lastContact, generatedAt)
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{person.name}</span>
        <span className="chip chip--sky">{titleCase(person.relationship)}</span>
      </div>
      <ClosenessBar value={person.closeness} />
      <div className="muted" style={{ fontSize: 12 }}>
        Last contact: {fmtDate(person.lastContact)}
        {days !== null && <span className="faint"> · {days}d ago</span>}
      </div>
      {person.signals.evidence.length > 0 && (
        <ul style={{ paddingLeft: 18, display: 'grid', gap: 3 }}>
          {person.signals.evidence.slice(0, 4).map((e) => (
            <li key={e} className="muted" style={{ fontSize: 12 }}>
              {e}
            </li>
          ))}
        </ul>
      )}
      {person.signals.topics.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {person.signals.topics.map((t) => (
            <span key={t} className="chip chip--dim">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeopleScreen({ snapshot }: ScreenProps) {
  const { people, generatedAt } = snapshot

  const family = people
    .filter((p) => p.family)
    .sort((a, b) => b.closeness - a.closeness)
  const circle = people
    .filter((p) => !p.family)
    .sort((a, b) => b.closeness - a.closeness)

  const counts = new Map<Relationship, number>()
  for (const p of people) counts.set(p.relationship, (counts.get(p.relationship) ?? 0) + 1)
  const countRows = [...counts.entries()].sort((a, b) => b[1] - a[1])

  const nudges = people
    .filter((p) => p.family || p.relationship === 'friend')
    .map((p) => ({ person: p, days: daysSince(p.lastContact, generatedAt) }))
    .filter((n) => n.days === null || n.days > STALE_DAYS)
    .sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER))

  return (
    <div className="grid" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>People &amp; Family</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Relationship map derived deterministically from message and calendar interaction patterns.
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <Users size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />
          Your network at a glance
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {countRows.map(([rel, count]) => (
            <span key={rel} className="chip chip--sky">
              {titleCase(rel)} · {count}
            </span>
          ))}
        </div>
        <div className="card-title" style={{ marginBottom: 8 }}>
          <BellRing size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />
          Gentle nudges — reach out
        </div>
        {nudges.length === 0 ? (
          <span className="chip chip--accent">All close contacts touched within the last {STALE_DAYS} days</span>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {nudges.map(({ person, days }) => (
              <span key={person.id} className="chip chip--amber">
                {person.name} · {days === null ? 'no contact on record' : `${days}d since contact`}
              </span>
            ))}
          </div>
        )}
      </div>

      <section aria-labelledby="family-heading">
        <h2 id="family-heading" className="card-title" style={{ marginBottom: 10 }}>
          Family
        </h2>
        {family.length === 0 ? (
          <div className="card empty-state">No family contacts detected in this snapshot.</div>
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {family.map((p) => (
              <FamilyCard key={p.id} person={p} generatedAt={generatedAt} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="circle-heading" className="card">
        <h2 id="circle-heading" className="card-title">
          Circle
        </h2>
        {circle.length === 0 ? (
          <div className="empty-state">No wider-circle contacts in this snapshot.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Relationship</th>
                  <th scope="col" style={{ minWidth: 140 }}>
                    Closeness
                  </th>
                  <th scope="col">Last contact</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Msg evidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {circle.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className="chip chip--dim">{titleCase(p.relationship)}</span>
                    </td>
                    <td>
                      <ClosenessBar value={p.closeness} />
                    </td>
                    <td className="muted">{fmtDate(p.lastContact)}</td>
                    <td className="mono muted" style={{ textAlign: 'right' }}>
                      {p.signals.evidence.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
