import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from './components/Shell'
import type { ScreenId, ScreenProps } from './lib/screen-props'
import type { HealthStatus, Snapshot } from './lib/types'
import { fetchHealth, fetchSnapshot, setAccessCode } from './lib/api'
import { computeSpendAnalytics } from './engine'
import { syntheticSnapshot } from './data/persona'
import DashboardScreen from './screens/DashboardScreen'
import MoneyMapScreen from './screens/MoneyMapScreen'
import SubscriptionsScreen from './screens/SubscriptionsScreen'
import PeopleScreen from './screens/PeopleScreen'
import HealthScreen from './screens/HealthScreen'
import InsightsScreen from './screens/InsightsScreen'
import ActionsScreen from './screens/ActionsScreen'
import DemoGuideScreen from './screens/DemoGuideScreen'

const SCREENS: Record<ScreenId, (props: ScreenProps) => React.ReactElement> = {
  dashboard: DashboardScreen,
  money: MoneyMapScreen,
  subscriptions: SubscriptionsScreen,
  people: PeopleScreen,
  health: HealthScreen,
  insights: InsightsScreen,
  actions: ActionsScreen,
  guide: DemoGuideScreen,
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('dashboard')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [snap, hl] = await Promise.all([fetchSnapshot(), fetchHealth()])
    // If the API layer is unreachable (e.g. plain `vite` dev without functions),
    // fall back to the bundled synthetic persona so the UI stays explorable.
    setSnapshot(snap ?? syntheticSnapshot)
    setHealth(hl)
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([fetchSnapshot(), fetchHealth()]).then(([snap, hl]) => {
      if (!active) return
      setSnapshot(snap ?? syntheticSnapshot)
      setHealth(hl)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const handleUnlock = useCallback(
    (code: string) => {
      setAccessCode(code)
      void load()
    },
    [load],
  )

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
      onRefresh={load}
    >
      <Active
        snapshot={snap}
        analytics={analytics}
        health={health}
        refresh={load}
        onNavigate={setScreen}
      />
    </Shell>
  )
}
