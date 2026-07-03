import { findCatalogAlternatives, savingsCatalog } from '../../src/engine'
import type { Subscription } from '../../src/lib/types'

function sub(over: Partial<Subscription> & Pick<Subscription, 'merchant'>): Subscription {
  return {
    id: 7,
    plan: null,
    amount: 22.99,
    currency: 'USD',
    cadence: 'monthly',
    lastCharge: '2025-05-01',
    nextRenewal: '2025-06-01',
    category: 'streaming',
    status: 'active',
    annualCost: 275.88,
    confidence: 0.9,
    evidence: null,
    ...over,
  }
}

describe('savingsCatalog', () => {
  it('is a substantial, well-formed catalog', () => {
    expect(savingsCatalog.length).toBeGreaterThanOrEqual(14)
    for (const entry of savingsCatalog) {
      expect(entry.matchMerchants.length).toBeGreaterThan(0)
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.qualityNote.length).toBeGreaterThan(0)
      for (const token of entry.matchMerchants) {
        expect(token).toBe(token.toLowerCase())
      }
      if (entry.price !== null) expect(entry.price).toBeGreaterThanOrEqual(0)
    }
  })

  it('covers the headline merchants', () => {
    const tokens = savingsCatalog.flatMap((e) => e.matchMerchants)
    for (const expected of ['netflix', 'spotify', 'youtube', 'tesla', 'verizon', 'audible', 'hugging face', 'icloud']) {
      expect(tokens).toContain(expected)
    }
  })
})

describe('findCatalogAlternatives', () => {
  it('matches Netflix and computes annual savings vs the ads tier', () => {
    const alts = findCatalogAlternatives(sub({ merchant: 'Netflix' }))
    expect(alts).toHaveLength(1)
    const alt = alts[0]
    expect(alt.name).toContain('ads')
    expect(alt.price).toBe(7.99)
    expect(alt.annualSavings).toBeCloseTo(275.88 - 7.99 * 12, 2)
    expect(alt.source).toBe('catalog')
    expect(alt.status).toBe('suggested')
    expect(alt.id).toBe(0)
    expect(alt.subscriptionId).toBe(7)
    expect(alt.merchant).toBe('Netflix')
  })

  it('matches case-insensitively and by substring', () => {
    expect(findCatalogAlternatives(sub({ merchant: 'NETFLIX' }))).toHaveLength(1)
    expect(findCatalogAlternatives(sub({ merchant: 'Netflix.com Membership' }))).toHaveLength(1)
  })

  it('offers multiple MVNOs for the big carriers', () => {
    for (const carrier of ['AT&T', 'Verizon', 'T-Mobile']) {
      const alts = findCatalogAlternatives(
        sub({ merchant: carrier, category: 'telecom', amount: 85, annualCost: 1020 }),
      )
      expect(alts.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('is null-safe when the subscription annual cost is unknown', () => {
    const alts = findCatalogAlternatives(sub({ merchant: 'Netflix', annualCost: null }))
    expect(alts).toHaveLength(1)
    expect(alts[0].annualSavings).toBeNull()
  })

  it('treats free alternatives as saving the full annual cost', () => {
    const alts = findCatalogAlternatives(
      sub({ merchant: 'Audible', category: 'entertainment', amount: 14.95, annualCost: 179.4 }),
    )
    expect(alts).toHaveLength(1)
    expect(alts[0].price).toBe(0)
    expect(alts[0].annualSavings).toBeCloseTo(179.4, 2)
  })

  it('returns null savings when the alternative price depends on usage', () => {
    const alts = findCatalogAlternatives(
      sub({ merchant: 'HelloFresh', category: 'groceries', cadence: 'weekly', amount: 79, annualCost: 4108 }),
    )
    expect(alts).toHaveLength(1)
    expect(alts[0].annualSavings).toBeNull()
  })

  it('returns an empty list for unknown merchants and empty names', () => {
    expect(findCatalogAlternatives(sub({ merchant: "Bob's Bait Shop" }))).toEqual([])
    expect(findCatalogAlternatives(sub({ merchant: '' }))).toEqual([])
  })

  it('can return several options for one merchant (Spotify tiers)', () => {
    const alts = findCatalogAlternatives(sub({ merchant: 'Spotify', annualCost: 143.88, amount: 11.99 }))
    expect(alts.length).toBeGreaterThanOrEqual(2)
    for (const alt of alts) {
      expect(alt.subscriptionId).toBe(7)
      expect(alt.source).toBe('catalog')
    }
  })
})
