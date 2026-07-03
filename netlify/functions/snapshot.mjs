// GET /api/snapshot — serves the full Snapshot payload for the owner,
// or a { mode: 'synthetic', bundled: true } marker for everyone else
// (the client then falls back to its bundled synthetic persona).

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

function supabaseEnv() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_ANON_KEY || ''
  const gate = process.env.SUPABASE_API_SECRET || ''
  return url && key && gate ? { url, key, gate } : null
}

async function sbSelect(env, pathAndQuery) {
  const res = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'x-lifelens-key': env.gate },
  })
  if (!res.ok) {
    throw new Error(`Supabase read failed (${res.status}) for ${pathAndQuery.split('?')[0]}`)
  }
  return res.json()
}

// ---- tolerant mapping helpers (seeder may have written snake_case or camelCase jsonb) ----

function firstOf(obj, keys, fallback) {
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k]
    }
  }
  return fallback
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

function strArray(v) {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x : x == null ? '' : String(x))).filter(Boolean)
}

function numOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

function mapProfile(row) {
  const r = row || {}
  const s = (r.summary && typeof r.summary === 'object' ? r.summary : {}) || {}
  const socialRaw = firstOf(s, ['socialProfiles', 'social_profiles'], [])
  const social = (Array.isArray(socialRaw) ? socialRaw : []).map((p) => ({
    platform: str(firstOf(p, ['platform'], ''), ''),
    activityLevel: str(firstOf(p, ['activityLevel', 'activity_level'], ''), ''),
    evidence: str(firstOf(p, ['evidence'], ''), ''),
  }))
  const food = firstOf(s, ['foodPreferences', 'food_preferences'], {}) || {}
  return {
    name: str(r.name),
    email: str(r.email),
    location: typeof r.location === 'string' ? r.location : null,
    summary: {
      headline: str(firstOf(s, ['headline'], '')),
      facts: strArray(firstOf(s, ['facts'], [])),
      socialProfiles: social,
      foodPreferences: {
        frequentItems: strArray(firstOf(food, ['frequentItems', 'frequent_items'], [])),
        dietaryNotes: strArray(firstOf(food, ['dietaryNotes', 'dietary_notes'], [])),
      },
      healthSignals: strArray(firstOf(s, ['healthSignals', 'health_signals'], [])),
      learning: strArray(firstOf(s, ['learning'], [])),
      hobbies: strArray(firstOf(s, ['hobbies'], [])),
      employerSignals: strArray(firstOf(s, ['employerSignals', 'employer_signals'], [])),
    },
  }
}

function mapPerson(r) {
  const sig = (r.signals && typeof r.signals === 'object' ? r.signals : {}) || {}
  return {
    id: r.id,
    name: str(r.name),
    emails: strArray(r.emails),
    relationship: str(r.relationship, 'unknown'),
    family: !!r.family,
    closeness: numOrNull(r.closeness) ?? 0,
    lastContact: typeof r.last_contact === 'string' ? r.last_contact : null,
    signals: {
      evidence: strArray(firstOf(sig, ['evidence'], [])),
      topics: strArray(firstOf(sig, ['topics'], [])),
    },
  }
}

function mapTransaction(r) {
  return {
    id: r.id,
    date: str(r.date),
    merchant: str(r.merchant),
    amount: numOrNull(r.amount),
    currency: str(r.currency, 'USD'),
    category: str(r.category, 'other'),
    kind: str(r.kind, 'one_time'),
    subject: typeof r.subject === 'string' ? r.subject : null,
  }
}

function mapSubscription(r) {
  return {
    id: r.id,
    merchant: str(r.merchant),
    plan: typeof r.plan === 'string' ? r.plan : null,
    amount: numOrNull(r.amount),
    currency: str(r.currency, 'USD'),
    cadence: str(r.cadence, 'unknown'),
    lastCharge: typeof r.last_charge === 'string' ? r.last_charge : null,
    nextRenewal: typeof r.next_renewal === 'string' ? r.next_renewal : null,
    category: str(r.category, 'other'),
    status: str(r.status, 'unknown'),
    annualCost: numOrNull(r.annual_cost),
    confidence: numOrNull(r.confidence) ?? 0,
    evidence: typeof r.evidence === 'string' ? r.evidence : null,
  }
}

function mapAlternative(r) {
  return {
    id: r.id,
    subscriptionId: numOrNull(r.subscription_id),
    merchant: str(r.merchant),
    name: str(r.name),
    price: numOrNull(r.price),
    cadence: str(r.cadence, 'unknown'),
    annualSavings: numOrNull(r.annual_savings),
    qualityNote: typeof r.quality_note === 'string' ? r.quality_note : null,
    healthNote: typeof r.health_note === 'string' ? r.health_note : null,
    url: typeof r.url === 'string' ? r.url : null,
    source: str(r.source, 'catalog'),
    status: str(r.status, 'suggested'),
  }
}

function mapInsight(r) {
  return {
    id: r.id,
    createdAt: str(r.created_at),
    type: str(r.type, 'alert'),
    title: str(r.title),
    body: str(r.body),
    impactUsd: numOrNull(r.impact_usd),
    impactKind: typeof r.impact_kind === 'string' ? r.impact_kind : null,
    status: str(r.status, 'new'),
  }
}

function attendeesToStrings(a) {
  if (!Array.isArray(a)) return []
  return a
    .map((x) => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object') return str(firstOf(x, ['name', 'email'], ''))
      return ''
    })
    .filter(Boolean)
}

function mapEvent(r) {
  return {
    id: r.id,
    date: str(r.start_date),
    title: str(r.title),
    calendar: str(r.calendar),
    attendees: attendeesToStrings(r.attendees),
    recurring: !!r.recurring,
    kind: str(r.kind, 'other'),
  }
}

function mapAccount(r) {
  return {
    id: r.id,
    institution: str(r.institution),
    kind: str(r.kind, 'other'),
    last4: typeof r.last4 === 'string' ? r.last4 : null,
    typicalAmount: numOrNull(r.typical_amount),
    cadence: str(r.cadence, 'unknown'),
    autopay: typeof r.autopay === 'boolean' ? r.autopay : null,
    evidence: typeof r.evidence === 'string' ? r.evidence : null,
  }
}

function mapAction(r) {
  return {
    id: r.id,
    createdAt: str(r.created_at),
    kind: str(r.kind, 'note'),
    target: str(r.target),
    payload: r.payload && typeof r.payload === 'object' ? r.payload : {},
    status: str(r.status, 'pending'),
    result: r.result && typeof r.result === 'object' ? r.result : null,
  }
}

export default async (req) => {
  try {
    if (req.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    if (!isOwner(req)) {
      // No valid access code — the client uses its bundled synthetic persona.
      return json(200, { mode: 'synthetic', bundled: true })
    }

    const env = supabaseEnv()
    if (!env) {
      return json(503, { error: 'Supabase is not configured on the server' })
    }

    const [
      profileRows,
      people,
      transactions,
      subscriptions,
      alternatives,
      insights,
      events,
      accounts,
      actions,
    ] = await Promise.all([
      sbSelect(env, 'profile?select=*&id=eq.1&limit=1'),
      sbSelect(env, 'people?select=*'),
      sbSelect(env, 'transactions?select=*&order=date.desc&limit=600'),
      sbSelect(env, 'subscriptions?select=*'),
      sbSelect(env, 'alternatives?select=*'),
      sbSelect(env, 'insights?select=*&order=created_at.desc&limit=100'),
      sbSelect(env, 'events?select=*'),
      sbSelect(env, 'accounts?select=*'),
      sbSelect(env, 'actions?select=*&order=created_at.desc&limit=100'),
    ])

    const snapshot = {
      mode: 'owner',
      generatedAt: new Date().toISOString(),
      profile: mapProfile(Array.isArray(profileRows) ? profileRows[0] : null),
      people: (Array.isArray(people) ? people : []).map(mapPerson),
      transactions: (Array.isArray(transactions) ? transactions : []).map(mapTransaction),
      subscriptions: (Array.isArray(subscriptions) ? subscriptions : []).map(mapSubscription),
      alternatives: (Array.isArray(alternatives) ? alternatives : []).map(mapAlternative),
      insights: (Array.isArray(insights) ? insights : []).map(mapInsight),
      events: (Array.isArray(events) ? events : []).map(mapEvent),
      accounts: (Array.isArray(accounts) ? accounts : []).map(mapAccount),
      actions: (Array.isArray(actions) ? actions : []).map(mapAction),
    }

    return json(200, snapshot)
  } catch (err) {
    console.log('snapshot error:', err && err.message)
    return json(500, { error: 'Failed to build snapshot' })
  }
}
