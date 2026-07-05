import { useMemo } from 'react'
import { BellRing, Users } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { Person, Relationship } from '../lib/types'
import { daysBetween, fmtDate, titleCase } from '../lib/format'

const STALE_DAYS = 30

const AVATAR_GRADIENTS = [
  'linear-gradient(140deg, #67E8F9, #A78BFA)',
  'linear-gradient(140deg, #6EE7B3, #67E8F9)',
  'linear-gradient(140deg, #FBBF24, #6EE7B3)',
  'linear-gradient(140deg, #A78BFA, #67E8F9)',
  'linear-gradient(140deg, #FB7185, #A78BFA)',
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  // Deterministic gradient from the name so a person keeps the same color.
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const grad = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
  return (
    <div
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.34, background: grad }}
    >
      {initials(name)}
    </div>
  )
}

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
          height: 7,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, var(--sky), var(--violet))',
            boxShadow: '0 0 12px rgba(103,232,249,0.5)',
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
    <div className="card card--cyan" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Avatar name={person.name} size={44} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>{person.name}</div>
          <span className="chip chip--sky" style={{ marginTop: 3 }}>
            {titleCase(person.relationship)}
          </span>
        </div>
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

  const { family, circle, countRows, nudges } = useMemo(() => {
    const fam = people.filter((p) => p.family).sort((a, b) => b.closeness - a.closeness)
    const circ = people.filter((p) => !p.family).sort((a, b) => b.closeness - a.closeness)

    const counts = new Map<Relationship, number>()
    for (const p of people) counts.set(p.relationship, (counts.get(p.relationship) ?? 0) + 1)
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])

    const nudgeList = people
      .filter((p) => p.family || p.relationship === 'friend')
      .map((p) => ({ person: p, days: daysSince(p.lastContact, generatedAt) }))
      .filter((n) => n.days === null || n.days > STALE_DAYS)
      .sort((a, b) => (b.days ?? Number.MAX_SAFE_INTEGER) - (a.days ?? Number.MAX_SAFE_INTEGER))

    return { family: fam, circle: circ, countRows: rows, nudges: nudgeList }
  }, [people, generatedAt])

  return (
    <div className="grid" style={{ maxWidth: 1120 }}>
      <div className="page-head">
        <h1>People &amp; Family</h1>
        <p>Relationship map derived deterministically from message and calendar interaction patterns.</p>
      </div>

      <div className="card card--cyan">
        <div className="card-title">
          <Users size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden />
          Your network at a glance
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
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
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
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
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                        <Avatar name={p.name} size={26} />
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </span>
                    </td>
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
