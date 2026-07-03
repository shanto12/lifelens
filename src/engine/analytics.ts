// Spend analytics derived from a Snapshot.
// Pure functions — no I/O, no React, no Date.now().

import type {
  CategorySpend,
  MerchantSpend,
  MonthlySpend,
  NonUsdSpend,
  Snapshot,
  SpendAnalytics,
  SpendCategory,
} from '../lib/types'
import { cadenceMultiplier } from './recurrence'

/** A currency counts toward USD aggregates when it is USD, blank, or unset. */
function isUsd(currency: string | null | undefined): boolean {
  return !currency || currency.toUpperCase() === 'USD'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

interface Charge {
  date: string
  merchant: string
  amount: number
  category: SpendCategory
}

function dominantCategory(counts: Map<SpendCategory, number>): SpendCategory {
  let winner: SpendCategory = 'other'
  let winnerCount = 0
  for (const [category, count] of counts) {
    if (count > winnerCount) {
      winner = category
      winnerCount = count
    }
  }
  return winner
}

function monthlyBuckets(charges: Charge[]): MonthlySpend[] {
  const totals = new Map<string, number>()
  let min: string | null = null
  let max: string | null = null
  for (const c of charges) {
    const month = c.date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    totals.set(month, (totals.get(month) ?? 0) + c.amount)
    if (min === null || month < min) min = month
    if (max === null || month > max) max = month
  }
  if (min === null || max === null) return []

  const out: MonthlySpend[] = []
  let [year, month] = min.split('-').map(Number)
  const [endYear, endMonth] = max.split('-').map(Number)
  let guard = 0
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 1200) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    out.push({ month: key, total: round2(totals.get(key) ?? 0) })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    guard += 1
  }
  return out
}

/**
 * Compute spend analytics over a snapshot:
 * - totalTracked: sum of non-null amounts, excluding refunds
 * - byCategory: sorted desc by total, with pctOfTotal
 * - byMerchant: top 20 by total
 * - byMonth: chronological YYYY-MM buckets spanning the transaction range
 * - subscriptionAnnualTotal: annualCost (else amount x cadence multiplier), skipping cancelled
 * - recurringBillsAnnualTotal: account typicalAmount x cadence multiplier
 */
export function computeSpendAnalytics(snapshot: Snapshot): SpendAnalytics {
  const charges: Charge[] = []
  const nonUsdMap = new Map<string, { currency: string; total: number; txCount: number }>()
  for (const t of snapshot.transactions) {
    if (t.kind === 'refund' || t.amount === null) continue
    if (isUsd(t.currency)) {
      charges.push({
        date: t.date.slice(0, 10),
        merchant: t.merchant,
        amount: t.amount,
        category: t.category,
      })
    } else {
      const key = t.currency.toUpperCase()
      const entry = nonUsdMap.get(key) ?? { currency: key, total: 0, txCount: 0 }
      entry.total += t.amount
      entry.txCount += 1
      nonUsdMap.set(key, entry)
    }
  }

  const nonUsd: NonUsdSpend[] = [...nonUsdMap.values()]
    .map((entry) => ({ currency: entry.currency, total: round2(entry.total), txCount: entry.txCount }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency))

  const totalTracked = round2(charges.reduce((sum, c) => sum + c.amount, 0))

  const catMap = new Map<SpendCategory, { total: number; txCount: number }>()
  for (const c of charges) {
    const entry = catMap.get(c.category) ?? { total: 0, txCount: 0 }
    entry.total += c.amount
    entry.txCount += 1
    catMap.set(c.category, entry)
  }
  const byCategory: CategorySpend[] = [...catMap.entries()]
    .map(([category, entry]) => ({
      category,
      total: round2(entry.total),
      txCount: entry.txCount,
      pctOfTotal: totalTracked > 0 ? round2((entry.total / totalTracked) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))

  const merMap = new Map<
    string,
    { merchant: string; total: number; txCount: number; cats: Map<SpendCategory, number> }
  >()
  for (const c of charges) {
    const key = c.merchant.trim().toLowerCase()
    let entry = merMap.get(key)
    if (!entry) {
      entry = { merchant: c.merchant, total: 0, txCount: 0, cats: new Map() }
      merMap.set(key, entry)
    }
    entry.total += c.amount
    entry.txCount += 1
    entry.cats.set(c.category, (entry.cats.get(c.category) ?? 0) + 1)
  }
  const byMerchant: MerchantSpend[] = [...merMap.values()]
    .map((entry) => ({
      merchant: entry.merchant,
      total: round2(entry.total),
      txCount: entry.txCount,
      category: dominantCategory(entry.cats),
    }))
    .sort((a, b) => b.total - a.total || a.merchant.localeCompare(b.merchant))
    .slice(0, 20)

  let subscriptionAnnualTotal = 0
  for (const s of snapshot.subscriptions) {
    if (s.status === 'cancelled') continue
    if (!isUsd(s.currency)) continue
    if (s.annualCost !== null) {
      subscriptionAnnualTotal += s.annualCost
      continue
    }
    const mult = cadenceMultiplier(s.cadence)
    if (s.amount !== null && mult !== null) subscriptionAnnualTotal += s.amount * mult
  }

  let recurringBillsAnnualTotal = 0
  for (const a of snapshot.accounts) {
    const mult = cadenceMultiplier(a.cadence)
    if (a.typicalAmount !== null && mult !== null) recurringBillsAnnualTotal += a.typicalAmount * mult
  }

  return {
    totalTracked,
    byCategory,
    byMerchant,
    byMonth: monthlyBuckets(charges),
    subscriptionAnnualTotal: round2(subscriptionAnnualTotal),
    recurringBillsAnnualTotal: round2(recurringBillsAnnualTotal),
    nonUsd,
  }
}
