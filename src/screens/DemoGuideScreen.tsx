import { ArrowRight, Calculator, Database, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react'
import type { ScreenId, ScreenProps } from '../lib/screen-props'
import type { HealthStatus } from '../lib/types'

const STEPS: { screen: ScreenId; title: string; body: string }[] = [
  { screen: 'money', title: 'Follow the money', body: 'See how sample transactions become monthly totals, spending categories, and merchant trends.' },
  { screen: 'subscriptions', title: 'Find a better fit', body: 'Expand a subscription to compare catalog alternatives and estimated annual savings.' },
  { screen: 'insights', title: 'Turn patterns into priorities', body: 'Generate a snapshot brief from the sample numbers. The result identifies its source.' },
  { screen: 'actions', title: 'Rehearse the next step', body: 'Draft a negotiation script, then simulate a call. Public demo actions never contact anyone.' },
  { screen: 'people', title: 'Make room for people', body: 'Explore the fictional family and interaction patterns behind relationship reminders.' },
  { screen: 'health', title: 'Review everyday habits', body: 'Explore spending and calendar signals with transparent, rule-based explanations.' },
]
const SERVICES: { key: keyof HealthStatus['capabilities']; label: string }[] = [
  { key: 'glm', label: 'GLM' }, { key: 'grok', label: 'Grok' },
  { key: 'supabase', label: 'Snapshot store' }, { key: 'composio', label: 'OAuth connectors' },
  { key: 'twilio', label: 'Telephony' },
]

export default function DemoGuideScreen({ health, snapshot, onNavigate }: ScreenProps) {
  const sampleDate = new Date(snapshot.generatedAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div className="grid" style={{ maxWidth: 1120 }}>
      <div className="page-head">
        <div className="eyebrow">A small tour of the big picture</div>
        <h1>Meet LifeLens</h1>
        <p>A personal copilot that connects spending, subscriptions, relationships, and everyday habits.</p>
      </div>
      <div className="card card--cyan">
        <div className="card-title"><ShieldCheck size={14} aria-hidden /> Explore with a fictional persona</div>
        <p className="muted">The public demo follows Jordan Rivera using a fixed synthetic snapshot from {sampleDate}. Renewal countdowns and contact ages use that reference date. No personal account is connected for a public visitor.</p>
      </div>
      <div className="grid guide-steps">
        {STEPS.map((step, index) => (
          <button key={step.screen} className="card guide-step" onClick={() => onNavigate(step.screen)}>
            <span className="guide-step__number">0{index + 1}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <span className="guide-step__link">Explore <ArrowRight size={15} aria-hidden /></span>
          </button>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <div className="card"><div className="card-title"><Calculator size={14} aria-hidden /> Numbers you can trace</div><p className="muted">Spending totals, recurring charges, savings comparisons, and relationship scores are computed with deterministic TypeScript rules. Catalog prices are illustrative and need checking before a purchase.</p></div>
        <div className="card"><div className="card-title"><Sparkles size={14} aria-hidden /> Clear generation labels</div><p className="muted">Public briefs and scripts use deterministic sample generation. Provider configuration is shown separately from execution results; a configured key does not establish a successful live AI request.</p></div>
        <div className="card"><div className="card-title"><Database size={14} aria-hidden /> Separate owner access</div><p className="muted">Private snapshots require server-verified owner access. The public demo uses fictional records, catalog examples, and simulated actions.</p></div>
      </div>
      <div className="card">
        <div className="card-title">Service configuration</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {health ? SERVICES.map((service) => <span key={service.key} className={`chip ${health.capabilities[service.key] ? 'chip--violet' : 'chip--dim'}`}>{service.label} · {health.capabilities[service.key] ? 'configured' : 'not configured'}</span>) : <span className="chip chip--amber">Status unavailable · bundled sample remains available</span>}
        </div>
        <p className="faint" style={{ marginTop: 12, fontSize: 12 }}>These flags report server configuration, not provider availability, connected accounts, or completed workflows.</p>
      </div>
      <a className="btn btn--ghost" style={{ justifySelf: 'start' }} href="https://github.com/shanto12/lifelens" target="_blank" rel="noreferrer">Read the source and architecture <ExternalLink size={14} aria-hidden /></a>
    </div>
  )
}
