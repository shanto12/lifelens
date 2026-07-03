// Barrel for the deterministic intelligence engine (pure TS, zero React, zero I/O).

export { normalizeMerchant, parseAmount } from './normalize'
export { categorizeMerchant } from './categorize'
export { detectRecurring, cadenceMultiplier, daysBetween } from './recurrence'
export { computeSpendAnalytics } from './analytics'
export { computeHealthFlags } from './health'
export { scoreCloseness, rankPeople } from './people'
export type { ClosenessInput } from './people'
export { savingsCatalog, findCatalogAlternatives } from './savings'
export type { SavingsCatalogEntry } from './savings'
