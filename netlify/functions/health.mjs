// GET /api/health — service health + capability flags. No secrets echoed.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export default async (req) => {
  try {
    if (req.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    const glmKey = process.env.GLM_API_KEY || ''
    const grokKey = process.env.XAI_API_KEY || ''
    const supabaseUrl = process.env.SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_ANON_KEY || ''
    const supabaseGate = process.env.SUPABASE_API_SECRET || ''
    const twilioSid = process.env.TWILIO_ACCOUNT_SID || ''
    const twilioToken = process.env.TWILIO_AUTH_TOKEN || ''
    const twilioFrom = process.env.TWILIO_FROM_NUMBER || ''
    const accessCode = process.env.LIFELENS_ACCESS_CODE || ''
    const model = process.env.GLM_MODEL || 'glm-5.2'

    return json(200, {
      ok: true,
      service: 'lifelens',
      version: '1.0.0',
      mode: glmKey ? 'live' : 'degraded',
      capabilities: {
        glm: !!glmKey,
        grok: !!grokKey,
        supabase: !!(supabaseUrl && supabaseKey && supabaseGate),
        twilio: !!(twilioSid && twilioToken && twilioFrom),
        ownerMode: !!accessCode,
      },
      model,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.log('health error:', err && err.message)
    return json(500, { error: 'Internal error' })
  }
}
