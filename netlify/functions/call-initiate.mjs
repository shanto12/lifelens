// POST /api/call-initiate — places a real Twilio call reading the script aloud
// (owner + full Twilio env only); otherwise returns a dry-run result.

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

async function sbInsert(env, table, row) {
  const res = await fetch(`${env.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'x-lifelens-key': env.gate,
      'content-type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status})`)
  return res.json()
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function logAction(owner, row) {
  const env = supabaseEnv()
  if (!env || !owner) return
  try {
    await sbInsert(env, 'actions', row)
  } catch (err) {
    console.log('call-initiate action log failed:', err && err.message)
  }
}

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
    if (typeof body.script !== 'string' || !body.script.trim()) {
      return json(400, { error: 'Missing required field: script (string)' })
    }
    if (body.script.length > 2000) {
      return json(400, { error: 'script must be 2000 characters or fewer' })
    }
    if (typeof body.target !== 'string' || !body.target.trim()) {
      return json(400, { error: 'Missing required field: target (string)' })
    }
    if (body.to !== undefined && body.to !== null && typeof body.to !== 'string') {
      return json(400, { error: 'to must be a string phone number when provided' })
    }

    const script = body.script.trim()
    const target = body.target.trim().slice(0, 160)
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    if (to && !/^\+?[0-9\s\-().]{7,20}$/.test(to)) {
      return json(400, { error: 'to does not look like a valid phone number' })
    }

    const sid = process.env.TWILIO_ACCOUNT_SID || ''
    const token = process.env.TWILIO_AUTH_TOKEN || ''
    const from = process.env.TWILIO_FROM_NUMBER || ''
    const ownerNumber = process.env.OWNER_PHONE_NUMBER || ''
    const owner = isOwner(req)
    const twilioReady = !!(sid && token && from && (to || ownerNumber))

    if (twilioReady && owner) {
      const params = new URLSearchParams()
      params.set('To', to || ownerNumber)
      params.set('From', from)
      params.set('Twiml', `<Response><Say voice="Polly.Matthew">${escapeXml(script)}</Say></Response>`)

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.log('twilio call failed:', res.status, errText.slice(0, 300))
        await logAction(owner, {
          kind: 'call_initiated',
          target,
          payload: { scriptChars: script.length },
          status: 'failed',
          result: { httpStatus: res.status },
        })
        return json(502, { ok: false, error: `Twilio call failed (${res.status})` })
      }

      const call = await res.json().catch(() => ({}))
      await logAction(owner, {
        kind: 'call_initiated',
        target,
        payload: { scriptChars: script.length },
        status: 'done',
        result: { sid: call.sid || null },
      })
      return json(200, { ok: true, status: 'initiated', sid: call.sid || null })
    }

    // Dry-run path: no call placed.
    await logAction(owner, {
      kind: 'call_initiated',
      target,
      payload: { scriptChars: script.length, dryRun: true },
      status: 'dry_run',
      result: null,
    })
    return json(200, {
      ok: true,
      status: 'dry_run',
      wouldCall: to || 'owner number',
      note: 'Twilio env not configured — no call placed',
    })
  } catch (err) {
    console.log('call-initiate error:', err && err.message)
    return json(500, { error: 'Internal error' })
  }
}
