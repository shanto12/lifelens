// POST /api/action — records a user action row for the owner; dry-run otherwise.

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

const ACTION_KINDS = ['call_script', 'call_initiated', 'cancel_draft', 'alternative_accepted', 'note']

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return json(405, { error: 'Method not allowed' })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return json(400, { error: 'Invalid JSON body' })
    }
    if (!body || typeof body !== 'object') {
      return json(400, { error: 'Missing request body' })
    }
    if (typeof body.kind !== 'string' || !ACTION_KINDS.includes(body.kind)) {
      return json(400, { error: `kind must be one of: ${ACTION_KINDS.join(', ')}` })
    }
    if (typeof body.target !== 'string' || !body.target.trim()) {
      return json(400, { error: 'Missing required field: target (string)' })
    }
    if (body.payload !== undefined && (body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload))) {
      return json(400, { error: 'payload must be an object when provided' })
    }

    const kind = body.kind
    const target = body.target.trim().slice(0, 200)
    const payload = body.payload || {}

    const env = supabaseEnv()
    if (!isOwner(req) || !env) {
      // Visitors (and owner without a database) get a harmless dry-run — nothing is written.
      return json(200, { ok: true, dryRun: true })
    }

    const res = await fetch(`${env.url}/rest/v1/actions`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'x-lifelens-key': env.gate,
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ kind, target, payload, status: 'done' }),
    })
    if (!res.ok) {
      console.log('action insert failed:', res.status)
      return json(502, { ok: false, error: 'Failed to record action' })
    }
    const rows = await res.json().catch(() => [])
    const id = Array.isArray(rows) && rows[0] && rows[0].id !== undefined ? rows[0].id : undefined

    return json(200, { ok: true, id })
  } catch (err) {
    console.log('action error:', err && err.message)
    return json(500, { error: 'Internal error' })
  }
}
