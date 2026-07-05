// LifeLens connectors — the integrations layer.
//
// Lets LifeLens request access to more data sources (banking, more calendars,
// GitHub, Slack, Notion, …) via Composio's managed per-user OAuth. Self-contained:
// no shared local imports. Degrades gracefully — without COMPOSIO_API_KEY it
// returns the catalog in "available" (preview) mode, exactly like the AI/Twilio
// boundaries elsewhere in the app.
//
// GET  /api/connectors   → { composioConfigured, owner, connectors[] }
// POST /api/connectors   → { ok, status, redirectUrl? }   body: { toolkit }  (initiate OAuth)

const COMPOSIO_BASE = (process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev/api/v3').replace(/\/+$/, '')
// Single-owner app: one Composio "user" holds all connections.
const OWNER_USER_ID = process.env.COMPOSIO_USER_ID || 'lifelens-owner'

// The curated catalog. `toolkit` is the Composio toolkit slug (null = planned/direct).
const CATALOG = [
  { id: 'gmail', name: 'Gmail', category: 'data', toolkit: 'gmail', status: 'connected',
    blurb: 'Receipts, order confirmations, renewal notices.',
    unlocks: 'The transaction + subscription feed that powers the whole app.' },
  { id: 'googlecalendar', name: 'Google Calendar', category: 'data', toolkit: 'googlecalendar', status: 'connected',
    blurb: 'Events, recurring commitments, travel, birthdays.',
    unlocks: 'The Life Pulse timeline and people co-attendance signals.' },
  { id: 'plaid', name: 'Bank & cards (Plaid)', category: 'finance', toolkit: null, status: 'planned',
    blurb: 'Real cleared transactions straight from your accounts.',
    unlocks: 'Fills the ~40% of email-derived charges that have no amount, and exact balances.' },
  { id: 'github', name: 'GitHub', category: 'dev', toolkit: 'github', status: 'available',
    blurb: 'Repos, activity, and paid developer tooling.',
    unlocks: 'Context for your AI/dev-tool spend and a "what am I actually using" audit.' },
  { id: 'slack', name: 'Slack', category: 'social', toolkit: 'slack', status: 'available',
    blurb: 'Post the daily brief and nudges where you already work.',
    unlocks: 'Proactive delivery — renewals and savings land in a DM, not another inbox.' },
  { id: 'notion', name: 'Notion', category: 'productivity', toolkit: 'notion', status: 'available',
    blurb: 'A living page of your money & life dashboard.',
    unlocks: 'Two-way sync of insights and a personal review doc you own.' },
  { id: 'googledrive', name: 'Google Drive', category: 'data', toolkit: 'googledrive', status: 'available',
    blurb: 'Statements, PDFs and receipts you already store.',
    unlocks: 'Parse attached statements to complete unknown amounts.' },
  { id: 'spotify', name: 'Spotify', category: 'social', toolkit: 'spotify', status: 'available',
    blurb: 'What you actually listen to.',
    unlocks: '"Are you using what you pay for?" — usage vs. cost on streaming.' },
  { id: 'linear', name: 'Linear', category: 'productivity', toolkit: 'linear', status: 'available',
    blurb: 'Turn an insight into a tracked task.',
    unlocks: 'One click: "cancel Windows 365 before Jul 14" becomes a dated to-do.' },
  { id: 'amazon', name: 'Amazon orders', category: 'finance', toolkit: null, status: 'planned',
    blurb: 'Itemized order history beyond the shipping emails.',
    unlocks: 'Category-accurate shopping spend and repeat-purchase detection.' },
]

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function isOwner(req) {
  const code = process.env.LIFELENS_ACCESS_CODE || ''
  if (!code) return false
  return (req.headers.get('x-access-code') || '') === code
}

function composioKey() {
  return process.env.COMPOSIO_API_KEY || ''
}

// Toolkit → auth config id map, created once in the Composio dashboard and
// stored as COMPOSIO_AUTH_CONFIGS='{"github":"ac_...","slack":"ac_..."}'.
function authConfigs() {
  try {
    return JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS || '{}')
  } catch {
    return {}
  }
}

async function composioFetch(path, init) {
  const res = await fetch(`${COMPOSIO_BASE}${path}`, {
    ...init,
    headers: { 'x-api-key': composioKey(), 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { ok: res.ok, status: res.status, data, raw: text }
}

// Best-effort: return the set of toolkit slugs that have an ACTIVE connection.
async function connectedToolkits() {
  try {
    const res = await composioFetch(
      `/connected_accounts?user_ids=${encodeURIComponent(OWNER_USER_ID)}&statuses=ACTIVE`,
      { method: 'GET' },
    )
    if (!res.ok || !res.data) return new Set()
    const items = res.data.items || res.data.data || (Array.isArray(res.data) ? res.data : [])
    const slugs = new Set()
    for (const it of items) {
      const slug = (it.toolkit?.slug || it.toolkitSlug || it.appName || it.app_name || '').toLowerCase()
      if (slug) slugs.add(slug)
    }
    return slugs
  } catch {
    return new Set()
  }
}

export default async (req) => {
  const url = new URL(req.url)
  const owner = isOwner(req)
  const configured = !!composioKey()

  // ---- POST /api/connectors → initiate an OAuth connection ----
  if (req.method === 'POST') {
    let body = {}
    try {
      body = await req.json()
    } catch {
      return json(400, { ok: false, status: 'error', note: 'Invalid JSON body' })
    }
    const toolkit = String(body.toolkit || '').toLowerCase()
    const entry = CATALOG.find((c) => c.toolkit === toolkit)
    if (!toolkit || !entry) return json(400, { ok: false, status: 'error', note: 'Unknown toolkit' })

    if (!owner) {
      return json(200, { ok: false, status: 'not_owner', note: 'Owner mode required to connect an account.' })
    }
    if (!configured) {
      return json(200, {
        ok: false,
        status: 'not_configured',
        note: 'Composio is not configured. Add COMPOSIO_API_KEY (and an auth config for this toolkit) to enable live OAuth connections.',
      })
    }
    const acId = authConfigs()[toolkit]
    if (!acId) {
      return json(200, {
        ok: false,
        status: 'not_configured',
        note: `No auth config for "${toolkit}". Create one in the Composio dashboard and add it to COMPOSIO_AUTH_CONFIGS.`,
      })
    }

    try {
      const callbackUrl = `${url.origin}/?connected=${encodeURIComponent(toolkit)}`
      // Composio v3: create a connected account (initiates OAuth), returns a redirect URL.
      const res = await composioFetch('/connected_accounts', {
        method: 'POST',
        body: JSON.stringify({
          auth_config: { id: acId },
          connection: { user_id: OWNER_USER_ID, callback_url: callbackUrl },
        }),
      })
      const d = res.data || {}
      const redirectUrl =
        d.redirect_url || d.redirectUrl || d.connectionData?.redirectUrl || d.connection_data?.redirect_url
      if (res.ok && redirectUrl) {
        return json(200, { ok: true, status: 'redirect', redirectUrl })
      }
      console.log('connectors: initiate returned no redirect url', res.status, String(res.raw).slice(0, 300))
      return json(200, {
        ok: false,
        status: 'error',
        note: 'Composio did not return an OAuth URL. Check the auth config and toolkit slug.',
      })
    } catch (err) {
      console.log('connectors: initiate failed:', err && err.message)
      return json(200, { ok: false, status: 'error', note: 'Connection request failed — try again shortly.' })
    }
  }

  // ---- GET /api/connectors ----
  if (req.method !== 'GET') return json(405, { composioConfigured: configured, owner, connectors: [] })

  let liveConnected = new Set()
  if (configured && owner) {
    liveConnected = await connectedToolkits()
  }

  const connectors = CATALOG.map((c) => {
    // Gmail/Calendar are already the app's ingestion source → always 'connected'.
    // Others flip to 'connected' when Composio reports an active account.
    let status = c.status
    if (c.toolkit && liveConnected.has(c.toolkit)) status = 'connected'
    return { ...c, status }
  })

  return json(200, { composioConfigured: configured, owner, connectors })
}
