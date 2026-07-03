import { computeHealthFlags } from '../../src/engine'
import type { LifeEvent, Snapshot, Subscription, Transaction } from '../../src/lib/types'

let nextId = 0

function tx(over: Partial<Transaction> & Pick<Transaction, 'merchant' | 'category'>): Transaction {
  nextId += 1
  return {
    id: nextId,
    date: '2025-04-10',
    amount: 20,
    currency: 'USD',
    kind: 'one_time',
    subject: null,
    ...over,
  }
}

function streamingSub(status: Subscription['status'] = 'active'): Subscription {
  nextId += 1
  return {
    id: nextId,
    merchant: `Stream${nextId}`,
    plan: null,
    amount: 9.99,
    currency: 'USD',
    cadence: 'monthly',
    lastCharge: '2025-04-01',
    nextRenewal: '2025-05-01',
    category: 'streaming',
    status,
    annualCost: 119.88,
    confidence: 0.9,
    evidence: null,
  }
}

function event(over: Partial<LifeEvent> & Pick<LifeEvent, 'kind'>): LifeEvent {
  nextId += 1
  return {
    id: nextId,
    date: '2025-04-15',
    title: 'Event',
    calendar: 'personal',
    attendees: [],
    recurring: false,
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

describe('computeHealthFlags', () => {
  it('returns no flags for an empty snapshot', () => {
    expect(computeHealthFlags(makeSnapshot())).toEqual([])
  })

  it('flags dining share above 25% as a watch item', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({ merchant: 'DoorDash', category: 'dining', amount: 300 }),
          tx({ merchant: 'Rent Co', category: 'home', amount: 700 }),
        ],
      }),
    )
    const flag = flags.find((f) => f.title.includes('Dining'))
    expect(flag).toBeDefined()
    expect(flag?.kind).toBe('watch')
    expect(flag?.detail).toContain('30%')
  })

  it('does not flag dining share at or below 25%', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({ merchant: 'DoorDash', category: 'dining', amount: 200 }),
          tx({ merchant: 'Rent Co', category: 'home', amount: 800 }),
        ],
      }),
    )
    expect(flags.find((f) => f.title.includes('Dining'))).toBeUndefined()
  })

  it('flags fresh groceries as positive when evidence exists', () => {
    const snapshot = makeSnapshot({
      transactions: [tx({ merchant: 'Walmart', category: 'groceries', amount: 80 })],
    })
    snapshot.profile.summary.foodPreferences.frequentItems = ['fresh berries', 'spinach']
    const flags = computeHealthFlags(snapshot)
    const flag = flags.find((f) => f.title.includes('Fresh groceries'))
    expect(flag?.kind).toBe('positive')
  })

  it('uses transaction subjects as fresh-item evidence too', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({
            merchant: 'Instacart',
            category: 'groceries',
            amount: 60,
            subject: 'Your order: organic produce box',
          }),
        ],
      }),
    )
    expect(flags.find((f) => f.title.includes('Fresh groceries'))?.kind).toBe('positive')
  })

  it('notes supplement purchases as positive and pharmacy-only as a suggestion', () => {
    const withSupplements = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({ merchant: 'CVS', category: 'health', amount: 30, subject: 'Vitamin D3 + magnesium' }),
        ],
      }),
    )
    expect(withSupplements.find((f) => f.title.includes('supplements'))?.kind).toBe('positive')

    const pharmacyOnly = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({ merchant: 'CVS', category: 'health', amount: 30, subject: 'Prescription pickup' }),
        ],
      }),
    )
    expect(pharmacyOnly.find((f) => f.title.includes('Pharmacy'))?.kind).toBe('suggestion')
  })

  it('flags calendar fitness events as positive', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        events: [
          event({ kind: 'fitness', title: 'Morning run', recurring: true }),
          event({ kind: 'fitness', title: 'Gym session' }),
          event({ kind: 'work', title: 'Standup' }),
        ],
      }),
    )
    const flag = flags.find((f) => f.title.includes('Movement'))
    expect(flag?.kind).toBe('positive')
    expect(flag?.detail).toContain('2 fitness events')
  })

  it('suggests movement when the calendar has events but no workouts', () => {
    const flags = computeHealthFlags(
      makeSnapshot({ events: [event({ kind: 'work' }), event({ kind: 'social' })] }),
    )
    expect(flags.find((f) => f.title.includes('No workouts'))?.kind).toBe('suggestion')
  })

  it('flags more than 3 active streaming subscriptions', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        subscriptions: [streamingSub(), streamingSub(), streamingSub(), streamingSub()],
      }),
    )
    expect(flags.find((f) => f.title.includes('Streaming'))?.kind).toBe('watch')
  })

  it('does not count cancelled streaming subscriptions or stacks of 3 or fewer', () => {
    const flags = computeHealthFlags(
      makeSnapshot({
        subscriptions: [streamingSub(), streamingSub(), streamingSub(), streamingSub('cancelled')],
      }),
    )
    expect(flags.find((f) => f.title.includes('Streaming'))).toBeUndefined()
  })

  it('flags late-night food orders from timestamped dates or subjects', () => {
    const byTimestamp = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({ merchant: 'DoorDash', category: 'dining', amount: 28, date: '2025-03-01T23:12:00' }),
        ],
      }),
    )
    expect(byTimestamp.find((f) => f.title.includes('Late-night'))?.kind).toBe('watch')

    const bySubject = computeHealthFlags(
      makeSnapshot({
        transactions: [
          tx({
            merchant: 'DoorDash',
            category: 'dining',
            amount: 28,
            subject: 'Your late-night order is on the way',
          }),
        ],
      }),
    )
    expect(bySubject.find((f) => f.title.includes('Late-night'))?.kind).toBe('watch')
  })
})
