import { rankPeople, scoreCloseness } from '../../src/engine'
import type { Person } from '../../src/lib/types'

const REF = '2025-06-01'

let nextId = 0
function person(over: Partial<Person> & Pick<Person, 'name' | 'closeness'>): Person {
  nextId += 1
  return {
    id: nextId,
    emails: [],
    relationship: 'friend',
    family: false,
    lastContact: null,
    signals: { evidence: [], topics: [] },
    ...over,
  }
}

describe('scoreCloseness', () => {
  it('scores zero for no signals', () => {
    expect(
      scoreCloseness({ sentTo: 0, received: 0, lastContact: null, family: false }, REF),
    ).toBe(0)
  })

  it('scores higher for more frequent contact', () => {
    const light = scoreCloseness({ sentTo: 2, received: 1, lastContact: null, family: false }, REF)
    const heavy = scoreCloseness({ sentTo: 40, received: 40, lastContact: null, family: false }, REF)
    expect(heavy).toBeGreaterThan(light)
    expect(light).toBeGreaterThan(0)
  })

  it('scores higher for recent contact than stale contact', () => {
    const recent = scoreCloseness(
      { sentTo: 10, received: 10, lastContact: '2025-06-01', family: false },
      REF,
    )
    const stale = scoreCloseness(
      { sentTo: 10, received: 10, lastContact: '2024-06-01', family: false },
      REF,
    )
    expect(recent).toBeGreaterThan(stale)
  })

  it('applies a family bonus', () => {
    expect(
      scoreCloseness({ sentTo: 0, received: 0, lastContact: null, family: true }, REF),
    ).toBe(15)
  })

  it('adds calendar co-attendance', () => {
    const without = scoreCloseness({ sentTo: 5, received: 5, lastContact: null, family: false }, REF)
    const withCo = scoreCloseness(
      { sentTo: 5, received: 5, lastContact: null, family: false, coAttendance: 8 },
      REF,
    )
    expect(withCo - without).toBe(10)
  })

  it('stays within 0-100 for extreme inputs', () => {
    const max = scoreCloseness(
      { sentTo: 10000, received: 10000, lastContact: REF, family: true, coAttendance: 50 },
      REF,
    )
    expect(max).toBe(100)
    const min = scoreCloseness({ sentTo: -5, received: -5, lastContact: null, family: false }, REF)
    expect(min).toBe(0)
  })

  it('treats malformed dates as no recency signal', () => {
    const malformed = scoreCloseness(
      { sentTo: 0, received: 0, lastContact: 'not-a-date', family: false },
      REF,
    )
    expect(malformed).toBe(0)
  })

  it('clamps future last-contact dates to full recency', () => {
    const future = scoreCloseness(
      { sentTo: 0, received: 0, lastContact: '2025-07-15', family: false },
      REF,
    )
    expect(future).toBe(30)
  })
})

describe('rankPeople', () => {
  it('sorts by closeness descending', () => {
    const ranked = rankPeople([
      person({ name: 'Low', closeness: 10 }),
      person({ name: 'High', closeness: 90 }),
      person({ name: 'Mid', closeness: 50 }),
    ])
    expect(ranked.map((p) => p.name)).toEqual(['High', 'Mid', 'Low'])
  })

  it('is stable for ties and does not mutate the input', () => {
    const input = [
      person({ name: 'A', closeness: 50 }),
      person({ name: 'B', closeness: 80 }),
      person({ name: 'C', closeness: 50 }),
    ]
    const ranked = rankPeople(input)
    expect(ranked.map((p) => p.name)).toEqual(['B', 'A', 'C'])
    expect(input.map((p) => p.name)).toEqual(['A', 'B', 'C'])
  })

  it('handles an empty list', () => {
    expect(rankPeople([])).toEqual([])
  })
})
