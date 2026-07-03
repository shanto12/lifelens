// People-graph scoring: closeness from interaction signals.
// Pure functions — no I/O, no React, no Date.now().

import type { Person } from '../lib/types'
import { daysBetween } from './recurrence'

export interface ClosenessInput {
  sentTo: number
  received: number
  lastContact: string | null
  family: boolean
  coAttendance?: number
}

/**
 * 0-100 closeness blend:
 * - frequency (log-scaled message volume, up to 45 pts)
 * - recency relative to referenceDate (exponential decay, up to 30 pts)
 * - calendar co-attendance (up to 10 pts)
 * - family bonus (+15 pts)
 */
export function scoreCloseness(input: ClosenessInput, referenceDate: string): number {
  const sent = Math.max(0, input.sentTo)
  const received = Math.max(0, input.received)
  const frequencyScore = Math.min(1, Math.log10(1 + sent + received) / 2)

  let recencyScore = 0
  if (input.lastContact !== null) {
    const days = daysBetween(input.lastContact, referenceDate)
    // Future/last-moment contact clamps to "today"; malformed dates score 0.
    if (days !== null) recencyScore = Math.exp(-Math.max(0, days) / 120)
  }

  const coScore = Math.min(1, Math.max(0, input.coAttendance ?? 0) / 8)

  const raw =
    45 * frequencyScore + 30 * recencyScore + 10 * coScore + (input.family ? 15 : 0)
  return Math.round(Math.min(100, Math.max(0, raw)))
}

/** Sort people by closeness (desc). Stable: ties keep input order. Does not mutate the input. */
export function rankPeople(people: Person[]): Person[] {
  return people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => b.person.closeness - a.person.closeness || a.index - b.index)
    .map((entry) => entry.person)
}
