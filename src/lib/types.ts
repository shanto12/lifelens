// LifeLens domain types — the single contract shared by the engine, screens, and API layer.

export type SnapshotMode = 'synthetic' | 'owner'

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'unknown'

export type SpendCategory =
  | 'groceries'
  | 'dining'
  | 'transport'
  | 'shopping'
  | 'electronics'
  | 'health'
  | 'entertainment'
  | 'software'
  | 'ai_tools'
  | 'auto'
  | 'home'
  | 'streaming'
  | 'cloud'
  | 'telecom'
  | 'insurance'
  | 'fitness'
  | 'news'
  | 'other'

export type Relationship =
  | 'spouse'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'relative'
  | 'friend'
  | 'colleague'
  | 'recruiter'
  | 'service_provider'
  | 'unknown'

export interface Profile {
  name: string
  email: string
  location: string | null
  summary: {
    headline: string
    facts: string[]
    socialProfiles: { platform: string; activityLevel: string; evidence: string }[]
    foodPreferences: { frequentItems: string[]; dietaryNotes: string[] }
    healthSignals: string[]
    learning: string[]
    hobbies: string[]
    employerSignals: string[]
  }
}

export interface Person {
  id: number
  name: string
  emails: string[]
  relationship: Relationship
  family: boolean
  /** 0-100 interaction-strength score from the deterministic people graph */
  closeness: number
  lastContact: string | null
  signals: { evidence: string[]; topics: string[] }
}

export interface Transaction {
  id: number
  date: string
  merchant: string
  amount: number | null
  currency: string
  category: SpendCategory
  kind: 'one_time' | 'recurring_charge' | 'refund'
  subject: string | null
}

export type SubscriptionStatus = 'active' | 'cancelled' | 'trial' | 'unknown'

export interface Subscription {
  id: number
  merchant: string
  plan: string | null
  amount: number | null
  currency: string
  cadence: Cadence
  lastCharge: string | null
  nextRenewal: string | null
  category: SpendCategory
  status: SubscriptionStatus
  annualCost: number | null
  /** 0-1 detector confidence */
  confidence: number
  evidence: string | null
}

export interface Alternative {
  id: number
  subscriptionId: number | null
  /** merchant of the subscription/spend this alternative replaces */
  merchant: string
  name: string
  price: number | null
  cadence: Cadence
  annualSavings: number | null
  qualityNote: string | null
  healthNote: string | null
  url: string | null
  source: 'catalog' | 'ai'
  status: 'suggested' | 'accepted' | 'dismissed'
}

export type InsightType = 'save_money' | 'health' | 'wealth' | 'relationship' | 'time' | 'alert'

export interface Insight {
  id: number
  createdAt: string
  type: InsightType
  title: string
  body: string
  impactUsd: number | null
  impactKind: 'annual_savings' | 'one_time' | 'risk_avoided' | 'non_monetary' | null
  status: 'new' | 'done' | 'dismissed'
}

export interface LifeEvent {
  id: number
  date: string
  title: string
  calendar: string
  attendees: string[]
  recurring: boolean
  kind: 'work' | 'family' | 'health' | 'fitness' | 'social' | 'travel' | 'finance' | 'personal_dev' | 'other'
}

export interface Account {
  id: number
  institution: string
  kind:
    | 'checking'
    | 'credit_card'
    | 'investment'
    | 'crypto'
    | 'telecom'
    | 'utility'
    | 'insurance'
    | 'mortgage_rent'
    | 'other'
  last4: string | null
  typicalAmount: number | null
  cadence: Cadence
  autopay: boolean | null
  evidence: string | null
}

export interface ActionItem {
  id: number
  createdAt: string
  kind: 'call_script' | 'call_initiated' | 'cancel_draft' | 'alternative_accepted' | 'note'
  target: string
  payload: Record<string, unknown>
  status: 'pending' | 'done' | 'failed' | 'dry_run'
  result: Record<string, unknown> | null
}

/** The full data payload the UI renders. Served by /api/snapshot. */
export interface Snapshot {
  mode: SnapshotMode
  generatedAt: string
  profile: Profile
  people: Person[]
  transactions: Transaction[]
  subscriptions: Subscription[]
  alternatives: Alternative[]
  insights: Insight[]
  events: LifeEvent[]
  accounts: Account[]
  actions: ActionItem[]
}

export interface HealthStatus {
  ok: boolean
  service: string
  version: string
  mode: 'live' | 'degraded'
  capabilities: {
    glm: boolean
    grok: boolean
    supabase: boolean
    twilio: boolean
    ownerMode: boolean
  }
  model: string
  timestamp: string
}

// ---- SSE event payloads ----

export interface SseStartEvent {
  provider: string
  model: string
}

export interface BriefResult {
  headline: string
  sections: { title: string; body: string; impactUsd: number | null }[]
  totalPotentialAnnualSavings: number | null
}

export interface AlternativeSuggestion {
  name: string
  price: number | null
  cadence: Cadence
  annualSavings: number | null
  qualityNote: string
  healthNote: string | null
  url: string | null
}

export interface AlternativesResult {
  merchant: string
  currentAnnualCost: number | null
  suggestions: AlternativeSuggestion[]
  recommendation: string
}

export interface CallScriptResult {
  goal: string
  target: string
  opening: string
  keyPoints: string[]
  objectionHandlers: { objection: string; response: string }[]
  closing: string
  estimatedSavingsUsd: number | null
}

// ---- Derived analytics (computed client-side by the engine) ----

export interface CategorySpend {
  category: SpendCategory
  total: number
  txCount: number
  pctOfTotal: number
}

export interface MerchantSpend {
  merchant: string
  total: number
  txCount: number
  category: SpendCategory
}

export interface MonthlySpend {
  month: string // YYYY-MM
  total: number
}

export interface NonUsdSpend {
  currency: string
  total: number
  txCount: number
}

export interface SpendAnalytics {
  /** USD-only aggregate — non-USD charges are segregated into `nonUsd` so totals never mix currencies. */
  totalTracked: number
  byCategory: CategorySpend[]
  byMerchant: MerchantSpend[]
  byMonth: MonthlySpend[]
  subscriptionAnnualTotal: number
  recurringBillsAnnualTotal: number
  /** Charges whose currency is neither USD nor blank, grouped by currency. Empty when all data is USD. */
  nonUsd: NonUsdSpend[]
}

export interface HealthSignalFlag {
  kind: 'positive' | 'watch' | 'suggestion'
  title: string
  detail: string
}
