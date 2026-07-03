import { detectRecurring } from '../../src/engine'
import type { Transaction } from '../../src/lib/types'

let nextId = 0
function tx(
  date: string,
  merchant: string,
  amount: number | null,
  over: Partial<Transaction> = {},
): Transaction {
  nextId += 1
  return {
    id: nextId,
    date,
    merchant,
    amount,
    currency: 'USD',
    category: 'streaming',
    kind: 'recurring_charge',
    subject: null,
    ...over,
  }
}

describe('detectRecurring', () => {
  it('detects a monthly subscription with calendar-aware next renewal', () => {
    const subs = detectRecurring([
      tx('2025-01-05', 'Netflix', 15.49),
      tx('2025-02-05', 'Netflix', 15.49),
      tx('2025-03-05', 'Netflix', 15.49),
      tx('2025-04-05', 'Netflix', 15.49),
    ])
    expect(subs).toHaveLength(1)
    const sub = subs[0]
    expect(sub.merchant).toBe('Netflix')
    expect(sub.cadence).toBe('monthly')
    expect(sub.lastCharge).toBe('2025-04-05')
    expect(sub.nextRenewal).toBe('2025-05-05')
    expect(sub.amount).toBe(15.49)
    expect(sub.annualCost).toBeCloseTo(185.88, 2)
    expect(sub.status).toBe('active')
    expect(sub.confidence).toBeGreaterThan(0.7)
    expect(sub.confidence).toBeLessThanOrEqual(0.99)
    expect(sub.id).toBe(1)
  })

  it('detects weekly cadence', () => {
    const subs = detectRecurring([
      tx('2025-01-01', 'MealBox', 12.5),
      tx('2025-01-08', 'MealBox', 12.5),
      tx('2025-01-15', 'MealBox', 12.5),
    ])
    expect(subs).toHaveLength(1)
    expect(subs[0].cadence).toBe('weekly')
    expect(subs[0].nextRenewal).toBe('2025-01-22')
    expect(subs[0].annualCost).toBeCloseTo(650, 2)
  })

  it('detects annual cadence across a leap year', () => {
    const subs = detectRecurring([
      tx('2023-06-10', 'Amazon', 139),
      tx('2024-06-10', 'Amazon', 139),
    ])
    expect(subs).toHaveLength(1)
    expect(subs[0].cadence).toBe('annual')
    expect(subs[0].nextRenewal).toBe('2025-06-10')
    expect(subs[0].annualCost).toBeCloseTo(139, 2)
  })

  it('tolerates amount jitter within ±15% and gap jitter within ±20%', () => {
    const subs = detectRecurring([
      tx('2025-01-03', 'Spotify', 10.99),
      tx('2025-02-01', 'Spotify', 11.99), // 29-day gap, ~9% amount jitter
      tx('2025-03-06', 'Spotify', 11.99), // 33-day gap
    ])
    expect(subs).toHaveLength(1)
    expect(subs[0].cadence).toBe('monthly')
  })

  it('excludes outlier amounts from the cluster', () => {
    const subs = detectRecurring([
      tx('2025-01-01', 'Apple', 10.0),
      tx('2025-02-01', 'Apple', 10.5),
      tx('2025-02-15', 'Apple', 99.99), // one-off purchase, not part of the cadence
    ])
    expect(subs).toHaveLength(1)
    expect(subs[0].cadence).toBe('monthly')
    expect(subs[0].amount).toBe(10.5)
  })

  it('returns nothing for irregular spacing', () => {
    const subs = detectRecurring([
      tx('2025-01-01', 'RandomShop', 20),
      tx('2025-01-13', 'RandomShop', 20),
      tx('2025-07-20', 'RandomShop', 20),
    ])
    expect(subs).toEqual([])
  })

  it('handles empty and insufficient inputs', () => {
    expect(detectRecurring([])).toEqual([])
    expect(detectRecurring([tx('2025-01-01', 'Solo', 9.99)])).toEqual([])
  })

  it('ignores refunds and null amounts', () => {
    expect(
      detectRecurring([
        tx('2025-01-05', 'Refundy', 15, { kind: 'refund' }),
        tx('2025-02-05', 'Refundy', 15, { kind: 'refund' }),
        tx('2025-01-05', 'Nully', null),
        tx('2025-02-05', 'Nully', null),
      ]),
    ).toEqual([])
  })

  it('marks long-stale subscriptions relative to the dataset max date, never Date.now()', () => {
    const subs = detectRecurring([
      // OldBox stopped charging in Feb 2024
      tx('2024-01-01', 'OldBox', 8),
      tx('2024-02-01', 'OldBox', 8),
      // Fresh keeps charging through the end of the dataset
      tx('2024-11-30', 'Fresh', 20),
      tx('2024-12-30', 'Fresh', 20),
    ])
    expect(subs).toHaveLength(2)
    const fresh = subs.find((s) => s.merchant === 'Fresh')
    const oldBox = subs.find((s) => s.merchant === 'OldBox')
    expect(fresh?.status).toBe('active')
    expect(oldBox?.status).toBe('unknown')
  })

  it('sorts by annual cost desc and assigns sequential ids', () => {
    const subs = detectRecurring([
      tx('2025-01-01', 'Cheap', 2),
      tx('2025-02-01', 'Cheap', 2),
      tx('2025-01-01', 'Pricey', 50),
      tx('2025-02-01', 'Pricey', 50),
    ])
    expect(subs.map((s) => s.merchant)).toEqual(['Pricey', 'Cheap'])
    expect(subs.map((s) => s.id)).toEqual([1, 2])
  })

  it('gains confidence with more observations', () => {
    const two = detectRecurring([
      tx('2025-01-05', 'A', 10),
      tx('2025-02-05', 'A', 10),
    ])[0]
    const six = detectRecurring([
      tx('2025-01-05', 'B', 10),
      tx('2025-02-05', 'B', 10),
      tx('2025-03-05', 'B', 10),
      tx('2025-04-05', 'B', 10),
      tx('2025-05-05', 'B', 10),
      tx('2025-06-05', 'B', 10),
    ])[0]
    expect(six.confidence).toBeGreaterThan(two.confidence)
  })

  it('groups merchants case-insensitively but keeps display casing', () => {
    const subs = detectRecurring([
      tx('2025-01-05', 'Spotify', 11.99),
      tx('2025-02-05', 'SPOTIFY', 11.99),
    ])
    expect(subs).toHaveLength(1)
    expect(subs[0].merchant).toBe('Spotify')
  })
})
