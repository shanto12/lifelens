// Recurring-charge detection over transaction history.
// Pure date math on YYYY-MM-DD strings — no Date.now(), no I/O, no React.
// "Today" is always derived from the max transaction date in the input.

import type { Cadence, SpendCategory, Subscription, SubscriptionStatus, Transaction } from '../lib/types'

const MS_PER_DAY = 86_400_000
/** Allowed relative deviation of an observed gap from a canonical period. */
const GAP_JITTER = 0.2
/** Allowed relative deviation of a charge amount from the merchant median. */
const AMOUNT_TOLERANCE = 0.15
/** A subscription whose last charge is older than this many periods is stale. */
const STALE_PERIODS = 2.2

interface PeriodDef {
  cadence: Cadence
  days: number
  multiplier: number
}

const PERIODS: PeriodDef[] = [
  { cadence: 'weekly', days: 7, multiplier: 52 },
  { cadence: 'monthly', days: 30, multiplier: 12 },
  { cadence: 'quarterly', days: 90, multiplier: 4 },
  { cadence: 'annual', days: 365, multiplier: 1 },
]

/** Charges per year for a cadence, or null when the cadence is unknown. */
export function cadenceMultiplier(cadence: Cadence): number | null {
  switch (cadence) {
    case 'weekly':
      return 52
    case 'monthly':
      return 12
    case 'quarterly':
      return 4
    case 'annual':
      return 1
    case 'unknown':
      return null
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Days since the UTC epoch for a YYYY-MM-DD(-prefixed) string, or null when malformed. */
function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY
}

/** Whole days from `a` to `b` (positive when b is later); null when either date is malformed. */
export function daysBetween(a: string, b: string): number | null {
  const da = dayNumber(a)
  const db = dayNumber(b)
  if (da === null || db === null) return null
  return db - da
}

function addDays(iso: string, n: number): string | null {
  const dn = dayNumber(iso)
  if (dn === null) return null
  return new Date((dn + n) * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Calendar-aware month addition with end-of-month clamping (Jan 31 + 1mo -> Feb 28). */
function addMonthsClamped(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1
  const day = Number(m[3])
  const total = monthIndex + months
  const targetYear = year + Math.floor(total / 12)
  const targetMonth = ((total % 12) + 12) % 12
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTarget)))
    .toISOString()
    .slice(0, 10)
}

interface Charge {
  date: string
  amount: number
  category: SpendCategory
  currency: string
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function nextRenewalFor(lastCharge: string, cadence: Cadence): string | null {
  switch (cadence) {
    case 'weekly':
      return addDays(lastCharge, 7)
    case 'monthly':
      return addMonthsClamped(lastCharge, 1)
    case 'quarterly':
      return addMonthsClamped(lastCharge, 3)
    case 'annual':
      return addMonthsClamped(lastCharge, 12)
    case 'unknown':
      return null
  }
}

function detectForMerchant(merchant: string, txs: Transaction[], today: string): Subscription | null {
  const charges: Charge[] = []
  for (const t of txs) {
    if (t.amount === null) continue
    charges.push({
      date: t.date.slice(0, 10),
      amount: t.amount,
      category: t.category,
      currency: t.currency || 'USD',
    })
  }
  if (charges.length < 2) return null

  // Keep only charges with similar amounts (±15 % of the merchant median).
  const med = median(charges.map((c) => c.amount))
  const tolerance = Math.abs(med) * AMOUNT_TOLERANCE
  const kept = charges
    .filter((c) => Math.abs(c.amount - med) <= tolerance)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (kept.length < 2) return null

  // Classify each gap to the closest canonical period within ±20 % jitter.
  const votes = new Map<Cadence, number>()
  const normalizedErrors: number[] = []
  for (let i = 1; i < kept.length; i++) {
    const gap = daysBetween(kept[i - 1].date, kept[i].date) ?? 0
    let best: PeriodDef | null = null
    let bestErr = Number.POSITIVE_INFINITY
    for (const p of PERIODS) {
      const err = Math.abs(gap - p.days) / p.days
      if (err <= GAP_JITTER && err < bestErr) {
        best = p
        bestErr = err
      }
    }
    if (best) {
      votes.set(best.cadence, (votes.get(best.cadence) ?? 0) + 1)
      normalizedErrors.push(Math.min(1, bestErr / GAP_JITTER))
    } else {
      normalizedErrors.push(1)
    }
  }

  // Majority cadence; ties resolve to the shorter period (PERIODS order).
  let winner: PeriodDef | null = null
  let winnerVotes = 0
  for (const p of PERIODS) {
    const v = votes.get(p.cadence) ?? 0
    if (v > winnerVotes) {
      winner = p
      winnerVotes = v
    }
  }
  const gapCount = kept.length - 1
  if (!winner || winnerVotes * 2 < gapCount) return null

  const last = kept[kept.length - 1]
  const amount = round2(last.amount)
  const annualCost = round2(amount * winner.multiplier)

  // Confidence: more observations + tighter spacing = higher (0-1).
  const obsScore = Math.min(1, (kept.length - 1) / 4)
  const spacingScore = 1 - normalizedErrors.reduce((s, e) => s + e, 0) / normalizedErrors.length
  const confidence = round2(Math.min(0.99, 0.3 + 0.35 * obsScore + 0.35 * spacingScore))

  const elapsed = daysBetween(last.date, today) ?? 0
  const status: SubscriptionStatus = elapsed > winner.days * STALE_PERIODS ? 'unknown' : 'active'

  return {
    id: 0,
    merchant,
    plan: null,
    amount,
    currency: last.currency,
    cadence: winner.cadence,
    lastCharge: last.date,
    nextRenewal: nextRenewalFor(last.date, winner.cadence),
    category: last.category,
    status,
    annualCost,
    confidence,
    evidence: `${kept.length} charges of ~$${amount.toFixed(2)} every ~${winner.days} days`,
  }
}

/**
 * Detect recurring subscriptions from raw transactions.
 * Groups by merchant, requires >=2 charges with similar amounts (±15 %) spaced
 * ~7/30/90/365 days (±20 % jitter). Results are sorted by annualCost (desc)
 * and assigned sequential ids starting at 1.
 */
export function detectRecurring(transactions: Transaction[]): Subscription[] {
  const usable = transactions.filter(
    (t) => t.kind !== 'refund' && t.amount !== null && dayNumber(t.date) !== null,
  )
  if (usable.length === 0) return []

  // "Today" is the max transaction date in the dataset — never Date.now().
  let today = usable[0].date.slice(0, 10)
  for (const t of usable) {
    const d = t.date.slice(0, 10)
    if (d > today) today = d
  }

  const groups = new Map<string, Transaction[]>()
  for (const t of usable) {
    const key = t.merchant.trim().toLowerCase()
    const existing = groups.get(key)
    if (existing) existing.push(t)
    else groups.set(key, [t])
  }

  const results: Subscription[] = []
  for (const txs of groups.values()) {
    const sub = detectForMerchant(txs[0].merchant, txs, today)
    if (sub) results.push(sub)
  }

  results.sort(
    (a, b) => (b.annualCost ?? 0) - (a.annualCost ?? 0) || a.merchant.localeCompare(b.merchant),
  )
  return results.map((s, i) => ({ ...s, id: i + 1 }))
}
