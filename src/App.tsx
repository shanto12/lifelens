import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Shell from './components/Shell'
import type { ScreenId, ScreenProps } from './lib/screen-props'
import type { HealthStatus, Snapshot } from './lib/types'
import { fetchHealth, fetchSnapshot, getAccessCode, setAccessCode } from './lib/api'
import { computeSpendAnalytics } from './engine'
import { syntheticSnapshot } from './data/persona'
import DashboardScreen from './screens/DashboardScreen'
import MoneyMapScreen from './screens/MoneyMapScreen'
import SubscriptionsScreen from './screens/SubscriptionsScreen'
import PeopleScreen from './screens/PeopleScreen'
import HealthScreen from './screens/HealthScreen'
import InsightsScreen from './screens/InsightsScreen'
import ActionsScreen from './screens/ActionsScreen'
import ConnectionsScreen from './screens/ConnectionsScreen'
import DemoGuideScreen from './screens/DemoGuideScreen'

const SCREENS: Record<ScreenId, (props: ScreenProps) => React.ReactElement> = {
  dashboard: DashboardScreen,
  money: MoneyMapScreen,
  subscriptions: SubscriptionsScreen,
  people: PeopleScreen,
  health: HealthScreen,
  insights: InsightsScreen,
  actions: ActionsScreen,
  connections: ConnectionsScreen,
  guide: DemoGuideScreen,
}

export type OwnerError = 'bad_code' | 'server'

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('dashboard')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ownerError, setOwnerError] = useState<OwnerError | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  // Guards against overlapping loads clobbering each other's results.
  const inFlight = useRef(false)
  // Mirror of the latest snapshot so load() can branch on prior data without
  // nesting a setState inside a state updater (which StrictMode may double-run).
  const snapshotRef = useRef<Snapshot | null>(null)
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  /**
   * Fetch snapshot + health and reconcile state.
   * @param codeSubmitted true when a fresh access code was just entered (so a
   *   `bundled` result means the code was wrong, not merely absent).
   */
  const load = useCallback(async (codeSubmitted = false) => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    try {
      const [result, hl] = await Promise.all([fetchSnapshot(), fetchHealth()])
      setHealth(hl)
      if (result.kind === 'owner') {
        setSnapshot(result.snapshot)
        setOwnerError(null)
        setRefreshFailed(false)
      } else if (result.kind === 'bundled') {
        // A submitted code that resolves to bundled means the code was rejected.
        setOwnerError(codeSubmitted ? 'bad_code' : null)
        setRefreshFailed(false)
        // First load with no prior data → show the bundled synthetic persona.
        // Never demote an already-unlocked owner snapshot back to synthetic.
        if (!snapshotRef.current) setSnapshot(syntheticSnapshot)
      } else {
        // Network / server error.
        setOwnerError(codeSubmitted ? 'server' : null)
        if (snapshotRef.current) {
          // Keep the data we already have; just flag the failed refresh.
          setRefreshFailed(true)
        } else {
          // Cold first load with nothing to show → bundled synthetic persona.
          setSnapshot(syntheticSnapshot)
        }
      }
    } finally {
      inFlight.current = false
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    // `load` is stable (useCallback with empty deps), so this runs once on mount.
    void load(false)
  }, [load])

  const handleUnlock = useCallback(
    (code: string) => {
      if (code) {
        setAccessCode(code)
        void load(true)
      } else {
        // Explicit lock-out: clear the code and reload as the bundled persona.
        setAccessCode('')
        setSnapshot(syntheticSnapshot)
        setOwnerError(null)
        setRefreshFailed(false)
        void load(false)
      }
    },
    [load],
  )

  const clearOwnerError = useCallback(() => setOwnerError(null), [])

  const analytics = useMemo(
    () => computeSpendAnalytics(snapshot ?? syntheticSnapshot),
    [snapshot],
  )

  if (loading && !snapshot) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="pulsing muted">Loading LifeLens…</div>
      </div>
    )
  }

  const snap = snapshot ?? syntheticSnapshot
  const Active = SCREENS[screen]

  return (
    <Shell
      active={screen}
      onNavigate={setScreen}
      mode={snap.mode}
      onUnlock={handleUnlock}
      onRefresh={refresh}
      refreshing={refreshing}
      refreshFailed={refreshFailed}
      ownerError={ownerError}
      onClearOwnerError={clearOwnerError}
      hasAccessCode={getAccessCode().length > 0}
    >
      <Active
        snapshot={snap}
        analytics={analytics}
        health={health}
        refresh={refresh}
        onNavigate={setScreen}
      />
    </Shell>
  )
}
