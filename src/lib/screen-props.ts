import type { HealthStatus, Snapshot, SpendAnalytics } from './types'

export type ScreenId =
  | 'dashboard'
  | 'money'
  | 'subscriptions'
  | 'people'
  | 'health'
  | 'insights'
  | 'actions'
  | 'connections'
  | 'guide'

/** Every screen receives the same props object and uses what it needs. */
export interface ScreenProps {
  snapshot: Snapshot
  analytics: SpendAnalytics
  health: HealthStatus | null
  refresh: () => void
  onNavigate: (screen: ScreenId) => void
}
