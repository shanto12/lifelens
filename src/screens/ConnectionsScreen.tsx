import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plug, Check, ArrowUpRight, ShieldCheck, Sparkles, RefreshCcw } from 'lucide-react'
import type { ScreenProps } from '../lib/screen-props'
import type { Connector, ConnectorStatus } from '../lib/types'
import { fetchConnectors, initiateConnection } from '../lib/api'

const STATUS_CHIP: Record<ConnectorStatus, string> = {
  connected: 'chip chip--accent',
  available: 'chip chip--violet',
  planned: 'chip chip--dim',
}
const STATUS_LABEL: Record<ConnectorStatus, string> = {
  connected: 'Connected',
  available: 'Available',
  planned: 'Planned',
}

const CATEGORY_LABEL: Record<Connector['category'], string> = {
  data: 'Email & calendar',
  finance: 'Money & banking',
  productivity: 'Productivity',
  social: 'Social & media',
  dev: 'Developer',
}
const CATEGORY_ORDER: Connector['category'][] = ['data', 'finance', 'productivity', 'social', 'dev']

export default function ConnectionsScreen({ health }: ScreenProps) {
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
  const [configured, setConfigured] = useState(false)
  const [owner, setOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ id: string; text: string } | null>(null)

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchConnectors>>) => {
    if (res) {
      setConnectors(res.connectors)
      setConfigured(res.composioConfigured)
      setOwner(res.owner)
    } else {
      setConnectors([])
    }
    setLoading(false)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    void fetchConnectors().then(apply)
  }, [apply])

  useEffect(() => {
    let active = true
    void fetchConnectors().then((res) => {
      if (active) apply(res)
    })
    return () => {
      active = false
    }
  }, [apply])

  const connect = useCallback(async (c: Connector) => {
    if (!c.toolkit) return
    setBusy(c.id)
    setNote(null)
    const res = await initiateConnection(c.toolkit)
    setBusy(null)
    if (res.ok && res.redirectUrl) {
      window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
      setNote({ id: c.id, text: 'Opened the secure OAuth window — approve access there, then Refresh.' })
    } else {
      setNote({ id: c.id, text: res.note ?? 'Could not start the connection.' })
    }
  }, [])

  const grouped = useMemo(() => {
    const list = connectors ?? []
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: list.filter((c) => c.category === cat),
    })).filter((g) => g.items.length > 0)
  }, [connectors])

  const connectedCount = (connectors ?? []).filter((c) => c.status === 'connected').length
  const composioLive = health?.capabilities.composio ?? configured

  return (
    <div className="grid" style={{ maxWidth: 1120 }}>
      <div className="page-head">
        <h1>Connections</h1>
        <p>
          Let LifeLens reach more of your world. Each source connects through Composio&rsquo;s managed,
          per-account OAuth — LifeLens never sees your passwords, and keys stay server-side.
        </p>
      </div>

      <div className="card card--violet">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--violet)' }}>
          <Plug size={13} aria-hidden />
          How connecting works
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span className="stat-value" style={{ color: 'var(--accent)', textShadow: '0 0 30px rgba(110,231,179,0.4)' }}>
            {connectedCount}
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            sources connected · {(connectors ?? []).length} in the catalog
          </span>
          <span
            className={composioLive ? 'chip chip--accent' : 'chip chip--dim'}
            style={{ marginLeft: 'auto' }}
            role="status"
          >
            {composioLive ? 'Composio: live' : 'Composio: preview mode'}
          </span>
          <button className="btn btn--ghost" onClick={refresh} disabled={loading}>
            <RefreshCcw size={14} aria-hidden /> {loading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
        <ul style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li className="muted" style={{ fontSize: 13 }}>
            You approve each account in its own provider&rsquo;s OAuth screen — access is scoped and revocable.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            The agent requests only the toolkits it needs; new sources light up as they&rsquo;re enabled.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            {composioLive
              ? 'Composio is configured — connect buttons start a real OAuth flow.'
              : 'Add COMPOSIO_API_KEY server-side to turn on live connections. Until then this is a preview of the catalog.'}
          </li>
        </ul>
      </div>

      {loading && connectors === null ? (
        <div className="card empty-state">Loading connectors…</div>
      ) : (
        grouped.map((g) => (
          <section key={g.cat} aria-label={CATEGORY_LABEL[g.cat]}>
            <h2 className="card-title" style={{ marginBottom: 10 }}>
              {CATEGORY_LABEL[g.cat]}
            </h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {g.items.map((c) => {
                const canConnect = owner && configured && c.status === 'available' && c.toolkit !== null
                return (
                  <div key={c.id} className="card" style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</span>
                      <span className={STATUS_CHIP[c.status]} style={{ marginLeft: 'auto' }}>
                        {c.status === 'connected' && <Check size={11} aria-hidden />}
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {c.blurb}
                    </div>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <Sparkles size={13} aria-hidden style={{ color: 'var(--violet)', flexShrink: 0, marginTop: 2 }} />
                      <span className="faint" style={{ fontSize: 12 }}>
                        {c.unlocks}
                      </span>
                    </div>
                    {c.status === 'connected' ? (
                      <span className="chip chip--accent" style={{ justifySelf: 'start' }}>
                        <Check size={11} aria-hidden /> Feeding LifeLens
                      </span>
                    ) : c.status === 'planned' ? (
                      <span className="faint" style={{ fontSize: 12 }}>
                        On the roadmap.
                      </span>
                    ) : (
                      <button
                        className="btn btn--violet"
                        style={{ justifySelf: 'start' }}
                        disabled={!canConnect || busy === c.id}
                        onClick={() => void connect(c)}
                        title={
                          !owner
                            ? 'Unlock owner mode to connect'
                            : !configured
                              ? 'Composio not configured'
                              : `Connect ${c.name}`
                        }
                      >
                        <Plug size={14} aria-hidden />
                        {busy === c.id ? 'Starting…' : 'Connect'}
                        {canConnect && <ArrowUpRight size={13} aria-hidden />}
                      </button>
                    )}
                    {note?.id === c.id && (
                      <div className="faint" role="status" style={{ fontSize: 12 }}>
                        {note.text}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      <div className="card card--emerald">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
          <ShieldCheck size={13} aria-hidden />
          Trust &amp; control
        </div>
        <ul style={{ paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li className="muted" style={{ fontSize: 13 }}>
            OAuth tokens live inside Composio&rsquo;s vault — never in the LifeLens client or repo.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            Connecting is owner-only; a public visitor sees the catalog but cannot link accounts.
          </li>
          <li className="muted" style={{ fontSize: 13 }}>
            Revoke any connection from the provider or the Composio dashboard at any time.
          </li>
        </ul>
      </div>
    </div>
  )
}
