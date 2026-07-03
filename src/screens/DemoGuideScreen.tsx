import {
  AlertTriangle,
  Bot,
  Clock,
  Cog,
  Database,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import type { ScreenId, ScreenProps } from '../lib/screen-props'
import type { HealthStatus } from '../lib/types'

const CAPABILITIES: { key: keyof HealthStatus['capabilities']; label: string }[] = [
  { key: 'glm', label: 'GLM (Z.ai)' },
  { key: 'grok', label: 'Grok (xAI)' },
  { key: 'supabase', label: 'Supabase' },
  { key: 'twilio', label: 'Twilio' },
  { key: 'ownerMode', label: 'Owner mode' },
]

const BUILT_WITH: { icon: typeof Cog; title: string; body: string }[] = [
  {
    icon: Cog,
    title: 'Deterministic engine',
    body: 'Parsers, recurrence detection, closeness scoring and health flags are pure, unit-tested TypeScript — no LLM in the data path.',
  },
  {
    icon: Bot,
    title: 'AI boundary',
    body: 'GLM-5.1 via Z.ai generates the daily brief and researches live alternatives with web search. Grok (xAI) is an optional provider for call scripts.',
  },
  {
    icon: Database,
    title: 'Supabase',
    body: 'The real (owner) snapshot lives server-side behind an access code. RLS is deny-all; only the service-role key — server-side only — can read it.',
  },
  {
    icon: Zap,
    title: 'Netlify Functions + SSE',
    body: 'All AI endpoints stream over Server-Sent Events (start / delta / result / done frames) from Netlify Functions.',
  },
  {
    icon: Clock,
    title: 'Scheduled ingest',
    body: 'A daily scheduled ingest-run function re-derives the owner snapshot from Gmail and Calendar exports.',
  },
]

const WALKTHROUGH: { text: string; screen?: ScreenId }[] = [
  { text: 'Open the Dashboard — the synthetic persona loads instantly, no login required.', screen: 'dashboard' },
  { text: 'Money Map — category, merchant and monthly analytics, all computed client-side by the engine.', screen: 'money' },
  { text: 'Subscriptions — expand a row; catalog alternatives appear instantly (deterministic, zero latency).', screen: 'subscriptions' },
  { text: "Hit 'Research live alternatives (AI)' — GLM streams real web-searched offers over SSE.", screen: 'subscriptions' },
  { text: "Insights — generate the AI daily brief; watch the stream, then the structured result.", screen: 'insights' },
  { text: 'Actions — draft a negotiation call script, then place a dry-run call (audited).', screen: 'actions' },
  { text: 'People & Health tabs — relationship map and wellbeing signals from the same snapshot.', screen: 'people' },
  { text: 'Owner unlock — enter the access code (header, top right) to flip to real Gmail/Calendar-derived data.' },
]

const ENV_VARS: { name: string; purpose: string; scope: string }[] = [
  { name: 'GLM_API_KEY', purpose: 'Z.ai GLM key — daily briefs & live alternatives research', scope: 'AI features' },
  { name: 'GLM_BASE_URL', purpose: 'Override for the Z.ai endpoint (defaults to the coding-plan URL)', scope: 'optional' },
  { name: 'GLM_MODEL', purpose: 'Model id (defaults to glm-5.1)', scope: 'optional' },
  { name: 'XAI_API_KEY', purpose: 'xAI Grok key — optional call-script provider', scope: 'optional' },
  { name: 'SUPABASE_URL', purpose: 'Supabase project URL (owner snapshot store)', scope: 'owner mode' },
  { name: 'SUPABASE_ANON_KEY', purpose: 'Anon key — useless alone; RLS is deny-all without the gate header', scope: 'owner mode' },
  { name: 'SUPABASE_API_SECRET', purpose: 'Server-side gate secret sent as x-lifelens-key; RLS only opens for it', scope: 'owner mode' },
  { name: 'LIFELENS_ACCESS_CODE', purpose: 'Code that unlocks the real owner snapshot', scope: 'owner mode' },
  { name: 'TWILIO_ACCOUNT_SID', purpose: 'Twilio account — enables real outbound calls', scope: 'telephony' },
  { name: 'TWILIO_AUTH_TOKEN', purpose: 'Twilio auth token', scope: 'telephony' },
  { name: 'TWILIO_FROM_NUMBER', purpose: 'Verified caller-ID number calls originate from', scope: 'telephony' },
  { name: 'OWNER_PHONE_NUMBER', purpose: 'The only number calls may be placed to', scope: 'telephony' },
]

const ENDPOINTS: { method: string; path: string; purpose: string }[] = [
  { method: 'GET', path: '/api/health', purpose: 'Capability probe (powers the status card above)' },
  { method: 'GET', path: '/api/snapshot', purpose: 'Synthetic or owner snapshot (x-access-code gated)' },
  { method: 'POST', path: '/api/insights-brief', purpose: 'SSE — AI daily brief (GLM)' },
  { method: 'POST', path: '/api/alternatives', purpose: 'SSE — live web-searched alternatives (GLM + search)' },
  { method: 'POST', path: '/api/call-script', purpose: 'SSE — negotiation script (GLM or Grok)' },
  { method: 'POST', path: '/api/call-initiate', purpose: 'Twilio outbound call, or dry-run without credentials' },
  { method: 'POST', path: '/api/action', purpose: 'Audit-log an action' },
  { method: 'CRON', path: 'ingest-run', purpose: 'Scheduled daily — re-ingest Gmail/Calendar into the snapshot' },
]

const TALK_TRACKS: { label: string; bullets: string[] }[] = [
  {
    label: '90 seconds',
    bullets: [
      'One-liner: LifeLens turns my own Gmail + Calendar exhaust into a money & life copilot.',
      'Show Dashboard → Subscriptions → tap the live AI research once and let it stream.',
      'Close: deterministic engine for facts, AI only at the reasoning edge — real data stays server-side.',
    ],
  },
  {
    label: '5 minutes',
    bullets: [
      'Dashboard + Money Map: analytics computed client-side from the snapshot by pure TS.',
      'Subscriptions: recurrence detector with confidence scores; instant catalog swaps, then streamed AI research.',
      'Insights: structured JSON brief from GLM rendered as impact cards with dollar figures.',
      'Actions: draft a call script (GLM or Grok), place a dry-run Twilio call, show the audit trail.',
    ],
  },
  {
    label: '15 minutes',
    bullets: [
      'Architecture: Vite + React 19 strict TS front end; Netlify Functions; SSE protocol (start/delta/result/done).',
      'The deterministic-vs-AI boundary and why it matters: testability, cost control, trust in numbers.',
      'Data security: Supabase RLS deny-all, service-role only server-side, access-code gate, no client keys.',
      'Safety: telephony dry-run by default, owner-only call targets, every action logged.',
      'Roadmap: bank feeds (Plaid), embeddings for the people graph, more providers behind the same SSE contract.',
    ],
  },
]

export default function DemoGuideScreen({ health, onNavigate }: ScreenProps) {
  return (
    <div className="grid" style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 2 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Demo Guide</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Live system status, how it was built, and how to present it.
        </p>
      </div>

      {health === null ? (
        <div className="card" style={{ borderColor: 'var(--amber)' }} role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontWeight: 600 }}>
            <AlertTriangle size={15} aria-hidden />
            Degraded — API layer unreachable
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Running fully client-side on the bundled synthetic persona. Deploy with Netlify Functions (or run
            `netlify dev`) to light up live capabilities.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">Live system status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {CAPABILITIES.map((cap) => (
              <span
                key={cap.key}
                className={`chip ${health.capabilities[cap.key] ? 'chip--accent' : 'chip--dim'}`}
              >
                {cap.label} · {health.capabilities[cap.key] ? 'LIVE' : 'OFF'}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
            <span className={`chip ${health.mode === 'live' ? 'chip--accent' : 'chip--amber'}`}>
              mode: {health.mode}
            </span>
            <span className="mono muted">model: {health.model}</span>
            <span className="mono muted">
              {health.service} v{health.version}
            </span>
            <span className="faint">as of {new Date(health.timestamp).toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">How this was built</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {BUILT_WITH.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'grid',
                  gap: 6,
                  alignContent: 'start',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
                  <Icon size={15} aria-hidden style={{ color: 'var(--violet)' }} />
                  {item.title}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {item.body}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Demo walkthrough</div>
        <ol style={{ paddingLeft: 22, display: 'grid', gap: 8 }}>
          {WALKTHROUGH.map((step) => {
            const targetScreen = step.screen
            return (
              <li key={step.text} style={{ fontSize: 13 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {step.text}
                  {targetScreen && (
                    <button
                      className="btn btn--ghost"
                      style={{ padding: '2px 8px', fontSize: 12 }}
                      onClick={() => onNavigate(targetScreen)}
                    >
                      Open →
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="card">
        <div className="card-title">Config cheatsheet — environment</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Purpose</th>
                <th scope="col">Needed for</th>
              </tr>
            </thead>
            <tbody>
              {ENV_VARS.map((v) => (
                <tr key={v.name}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {v.name}
                  </td>
                  <td className="muted">{v.purpose}</td>
                  <td>
                    <span className="chip chip--dim">{v.scope}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Config cheatsheet — endpoints</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Path</th>
                <th scope="col">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={`${e.method}-${e.path}`}>
                  <td>
                    <span className={`chip ${e.method === 'CRON' ? 'chip--amber' : 'chip--sky'}`}>{e.method}</span>
                  </td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                    {e.path}
                  </td>
                  <td className="muted">{e.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {TALK_TRACKS.map((track) => (
          <div key={track.label} className="card">
            <div className="card-title">{track.label} talk track</div>
            <ul style={{ paddingLeft: 18, display: 'grid', gap: 5 }}>
              {track.bullets.map((b) => (
                <li key={b} className="muted" style={{ fontSize: 12 }}>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={13} aria-hidden />
          Data policy
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Public visitors only ever see the synthetic persona bundled with the app. Real, personal data
          requires the owner access code, is served exclusively server-side from Supabase, and never ships
          in the client bundle.
        </p>
      </div>
    </div>
  )
}
