import { json } from './_shared/runtime.mjs'

// GET /api/health — service health + capability flags. No secrets echoed.

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
    const composioKey = process.env.COMPOSIO_API_KEY || ''
    const model = process.env.GLM_MODEL || 'glm-5.2'

    return json(200, {
      ok: true,
      service: 'lifelens',
      version: '1.0.0',
      mode: 'demo',
      providerStatus: 'configuration_only_not_probed',
      publicAi: 'deterministic',
      privateRunner: 'authenticated_manual_only',
      capabilities: {
        glm: !!glmKey,
        grok: !!grokKey,
        supabase: !!(supabaseUrl && supabaseKey && supabaseGate),
        twilio: !!(twilioSid && twilioToken && twilioFrom && process.env.OWNER_PHONE_NUMBER),
        composio: !!composioKey,
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
