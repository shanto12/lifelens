import { computeSpendAnalytics } from '../../src/engine'
import type { Account, Snapshot, Subscription, Transaction } from '../../src/lib/types'

let nextId = 0

function tx(over: Partial<Transaction> & Pick<Transaction, 'date' | 'merchant'>): Transaction {
  nextId += 1
  return {
    id: nextId,
    amount: 10,
    currency: 'USD',
    category: 'other',
    kind: 'one_time',
    subject: null,
    ...over,
  }
}

function sub(over: Partial<Subscription> = {}): Subscription {
  nextId += 1
  return {
    id: nextId,
    merchant: 'Sub',
    plan: null,
    amount: null,
    currency: 'USD',
    cadence: 'monthly',
    lastCharge: null,
    nextRenewal: null,
    category: 'streaming',
    status: 'active',
    annualCost: null,
    confidence: 0.8,
    evidence: null,
    ...over,
  }
}

function account(over: Partial<Account> = {}): Account {
  nextId += 1
  return {
    id: nextId,
    institution: 'Bank',
    kind: 'utility',
    last4: null,
    typicalAmount: null,
    cadence: 'monthly',
    autopay: null,
    evidence: null,
    ...over,
  }
}

function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    mode: 'synthetic',
    generatedAt: '2025-06-01T00:00:00Z',
    profile: {
      name: 'Test User',
      email: 'test@example.com',
      location: null,
      summary: {
        headline: '',
        facts: [],
        socialProfiles: [],
        foodPreferences: { frequentItems: [], dietaryNotes: [] },
        healthSignals: [],
        learning: [],
        hobbies: [],
        employerSignals: [],
      },
    },
    people: [],
    transactions: [],
    subscriptions: [],
    alternatives: [],
    insights: [],
    events: [],
    accounts: [],
    actions: [],
    ...over,
  }
}

describe('computeSpendAnalytics', () => {
  it('returns zeros and empty buckets for an empty snapshot', () => {
    const a = computeSpendAnalytics(makeSnapshot())
    expect(a.totalTracked).toBe(0)
    expect(a.byCategory).toEqual([])
    expect(a.byMerchant).toEqual([])
    expect(a.byMonth).toEqual([])
    expect(a.subscriptionAnnualTotal).toBe(0)
    expect(a.recurringBillsAnnualTotal).toBe(0)
    expect(a.nonUsd).toEqual([])
  })

  it('sums non-null amounts and excludes refunds', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        transactions: [
          tx({ date: '2025-01-10', merchant: 'Walmart', amount: 60, category: 'groceries' }),
          tx({ date: '2025-01-20', merchant: 'DoorDash', amount: 25, category: 'dining' }),
          tx({ date: '2025-03-05', merchant: 'DoorDash', amount: 15, category: 'dining' }),
          tx({ date: '2025-01-25', merchant: 'Amazon', amount: 40, kind: 'refund' }),
          tx({ date: '2025-01-26', merchant: 'Mystery', amount: null }),
        ],
      }),
    )
    expect(a.totalTracked).toBe(100)
    expect(a.byCategory.map((c) => c.category)).toEqual(['groceries', 'dining'])
    expect(a.byCategory[0]).toMatchObject({ total: 60, txCount: 1, pctOfTotal: 60 })
    expect(a.byCategory[1]).toMatchObject({ total: 40, txCount: 2, pctOfTotal: 40 })
  })

  it('builds chronological month buckets including empty gap months', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        transactions: [
          tx({ date: '2025-01-10', merchant: 'A', amount: 85 }),
          tx({ date: '2025-03-05', merchant: 'B', amount: 15 }),
        ],
      }),
    )
    expect(a.byMonth).toEqual([
      { month: '2025-01', total: 85 },
      { month: '2025-02', total: 0 },
      { month: '2025-03', total: 15 },
    ])
  })

  it('caps byMerchant at the top 20 by total', () => {
    const transactions = Array.from({ length: 22 }, (_, i) =>
      tx({ date: '2025-01-10', merchant: `M${i + 1}`, amount: i + 1, category: 'shopping' }),
    )
    const a = computeSpendAnalytics(makeSnapshot({ transactions }))
    expect(a.byMerchant).toHaveLength(20)
    expect(a.byMerchant[0]).toMatchObject({ merchant: 'M22', total: 22 })
    expect(a.byMerchant.some((m) => m.merchant === 'M1' || m.merchant === 'M2')).toBe(false)
  })

  it('assigns each merchant its dominant category', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        transactions: [
          tx({ date: '2025-01-01', merchant: 'Mix', amount: 10, category: 'dining' }),
          tx({ date: '2025-01-02', merchant: 'Mix', amount: 10, category: 'dining' }),
          tx({ date: '2025-01-03', merchant: 'Mix', amount: 10, category: 'groceries' }),
        ],
      }),
    )
    expect(a.byMerchant[0]).toMatchObject({ merchant: 'Mix', total: 30, txCount: 3, category: 'dining' })
  })

  it('computes subscription annual total from annualCost or amount x cadence', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        subscriptions: [
          sub({ annualCost: 120 }),
          sub({ amount: 10, cadence: 'monthly' }), // 120 via multiplier
          sub({ annualCost: 999, status: 'cancelled' }), // skipped
          sub({ amount: null, annualCost: null }), // no data, contributes 0
          sub({ amount: 5, cadence: 'unknown' }), // unknown cadence, contributes 0
        ],
      }),
    )
    expect(a.subscriptionAnnualTotal).toBe(240)
  })

  it('computes recurring bills annual total from accounts', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        accounts: [
          account({ typicalAmount: 100, cadence: 'monthly' }), // 1200
          account({ typicalAmount: 130, cadence: 'quarterly' }), // 520
          account({ typicalAmount: null }),
          account({ typicalAmount: 50, cadence: 'unknown' }),
        ],
      }),
    )
    expect(a.recurringBillsAnnualTotal).toBe(1720)
  })

  it('segregates non-USD charges instead of mixing currencies into USD totals', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        transactions: [
          tx({ date: '2025-01-10', merchant: 'Walmart', amount: 60, category: 'groceries' }),
          tx({ date: '2025-01-20', merchant: 'DoorDash', amount: 40, category: 'dining' }),
          // AUD charges must NOT count toward USD totals/categories.
          tx({ date: '2025-02-01', merchant: 'Woolworths', amount: 30, category: 'groceries', currency: 'AUD' }),
          tx({ date: '2025-02-05', merchant: 'Coles', amount: 20, category: 'groceries', currency: 'AUD' }),
          // AUD refund stays excluded, consistent with USD refund handling.
          tx({ date: '2025-02-06', merchant: 'Coles', amount: 5, category: 'groceries', currency: 'AUD', kind: 'refund' }),
        ],
      }),
    )
    // (a) AUD excluded from totalTracked / byCategory
    expect(a.totalTracked).toBe(100)
    expect(a.byCategory).toHaveLength(2)
    expect(a.byCategory.find((c) => c.category === 'groceries')).toMatchObject({ total: 60, txCount: 1 })
    // (b) nonUsd carries the AUD bucket with correct total/txCount (refund excluded)
    expect(a.nonUsd).toEqual([{ currency: 'AUD', total: 50, txCount: 2 }])
  })

  it('returns an empty nonUsd bucket when all charges are USD', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        transactions: [tx({ date: '2025-01-10', merchant: 'Walmart', amount: 60, category: 'groceries' })],
      }),
    )
    expect(a.nonUsd).toEqual([])
  })

  it('excludes non-USD subscriptions from the subscription annual total', () => {
    const a = computeSpendAnalytics(
      makeSnapshot({
        subscriptions: [
          sub({ annualCost: 120 }), // USD, counted
          sub({ annualCost: 240, currency: 'AUD' }), // non-USD, skipped
        ],
      }),
    )
    expect(a.subscriptionAnnualTotal).toBe(120)
  })
})
