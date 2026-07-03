// POST /api/alternatives — SSE. Finds cheaper/healthier real alternatives for a
// subscription via GLM + web_search; falls back to an inline deterministic catalog.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

const PUBLIC_AI_DAILY_CAP = 200

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

// Global daily AI-usage throttle for NON-OWNER callers. Fails open on any error
// or when Supabase is unconfigured (local dev). Returns true when OVER the cap.
async function overPublicAiCap() {
  const env = supabaseEnv()
  if (!env) return false // fail-open for local dev
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/bump_ai_usage_gated`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'x-lifelens-key': env.gate,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      console.log('alternatives: bump_ai_usage_gated failed', res.status)
      return false // fail-open
    }
    const count = Number(await res.json())
    return Number.isFinite(count) && count > PUBLIC_AI_DAILY_CAP
  } catch (err) {
    console.log('alternatives: bump_ai_usage_gated error', err && err.message)
    return false // fail-open
  }
}

// Keep a model-supplied url only when it parses AND is http(s). Otherwise null.
function safeUrl(v) {
  if (typeof v !== 'string' || !v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : null
  } catch {
    return null
  }
}

function sseResponse(run) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const enqueue = (text) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          closed = true
        }
      }
      const send = (event, data) => enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      const heartbeat = setInterval(() => enqueue(': keepalive\n\n'), 6000)
      try {
        await run(send)
      } catch (err) {
        console.log('alternatives stream error:', err && err.message)
        send('error', { message: err && err.message ? String(err.message) : 'Unexpected error' })
      } finally {
        send('done', {})
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    },
  })
}

async function streamChat({ url, apiKey, body, onDelta }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upstream model error (${res.status}): ${text.slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let finishReason = null
  let usage = null
  let doneUpstream = false
  while (!doneUpstream) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        doneUpstream = true
        break
      }
      try {
        const chunk = JSON.parse(data)
        const choice = chunk.choices && chunk.choices[0]
        const piece =
          choice && choice.delta && typeof choice.delta.content === 'string'
            ? choice.delta.content
            : ''
        if (piece) {
          content += piece
          if (onDelta) onDelta(piece)
        }
        if (choice && choice.finish_reason) finishReason = choice.finish_reason
        if (chunk.usage) usage = chunk.usage
      } catch {
        // malformed chunk — skip
      }
    }
  }
  return { content, finishReason, usage }
}

function extractJson(text) {
  if (!text) return null
  const cleaned = text.replace(/```(?:json)?/gi, '')
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function numOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

const CADENCES = ['weekly', 'monthly', 'quarterly', 'annual', 'unknown']

function coerceCadence(v) {
  return typeof v === 'string' && CADENCES.includes(v) ? v : 'unknown'
}

function coerceAlternatives(obj, merchant, annualCost) {
  if (!obj || typeof obj !== 'object') return null
  const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : [])
    .filter((s) => s && typeof s === 'object' && typeof s.name === 'string' && s.name)
    .slice(0, 4)
    .map((s) => ({
      name: s.name,
      price: numOrNull(s.price),
      cadence: coerceCadence(s.cadence),
      annualSavings: numOrNull(s.annualSavings),
      qualityNote: typeof s.qualityNote === 'string' ? s.qualityNote : '',
      healthNote: typeof s.healthNote === 'string' ? s.healthNote : null,
      url: safeUrl(s.url),
    }))
  if (suggestions.length === 0) return null
  return {
    merchant: typeof obj.merchant === 'string' && obj.merchant ? obj.merchant : merchant,
    currentAnnualCost: numOrNull(obj.currentAnnualCost) ?? annualCost,
    suggestions,
    recommendation: typeof obj.recommendation === 'string' ? obj.recommendation : '',
  }
}

// ---- deterministic fallback catalog (used when GLM is missing or fails) ----

const round2 = (n) => Math.round(n * 100) / 100

function annualOf(price, cadence) {
  if (typeof price !== 'number') return null
  if (cadence === 'weekly') return round2(price * 52)
  if (cadence === 'monthly') return round2(price * 12)
  if (cadence === 'quarterly') return round2(price * 4)
  if (cadence === 'annual') return round2(price)
  return null
}

const CATALOG = [
  {
    match: ['netflix'],
    items: [
      {
        name: 'Netflix Standard with ads',
        price: 7.99,
        cadence: 'monthly',
        qualityNote: 'Same catalog with a handful of ads per hour; 1080p on 2 screens.',
        healthNote: null,
        url: 'https://www.netflix.com/signup/planform',
      },
    ],
  },
  {
    match: ['spotify'],
    items: [
      {
        name: 'Spotify Premium Duo',
        price: 14.99,
        cadence: 'monthly',
        qualityNote: 'Two Premium accounts under one bill — cheaper per person than two Individual plans.',
        healthNote: null,
        url: 'https://www.spotify.com/us/duo/',
      },
      {
        name: 'Spotify Free',
        price: 0,
        cadence: 'monthly',
        qualityNote: 'Ad-supported; shuffle-only on mobile, but full catalog on desktop.',
        healthNote: null,
        url: 'https://www.spotify.com/us/free/',
      },
    ],
  },
  {
    match: ['youtube'],
    items: [
      {
        name: 'YouTube Premium Lite',
        price: 7.99,
        cadence: 'monthly',
        qualityNote: 'Ad-free on most videos; drops offline downloads, background play, and YouTube Music.',
        healthNote: null,
        url: 'https://www.youtube.com/premium',
      },
    ],
  },
  {
    match: ['at&t', 'att ', 'verizon', 't-mobile', 'tmobile'],
    items: [
      {
        name: 'Visible by Verizon (unlimited)',
        price: 25,
        cadence: 'monthly',
        qualityNote: 'Runs on the Verizon network; app-based support only, no retail stores.',
        healthNote: null,
        url: 'https://www.visible.com',
      },
      {
        name: 'Mint Mobile (unlimited)',
        price: 30,
        cadence: 'monthly',
        qualityNote: 'T-Mobile network; the low rate requires prepaying 3-12 months upfront.',
        healthNote: null,
        url: 'https://www.mintmobile.com',
      },
    ],
  },
  {
    match: ['tesla'],
    items: [
      {
        name: 'Pause FSD in low-driving months',
        price: 0,
        cadence: 'monthly',
        qualityNote: 'FSD is month-to-month — cancel from the Tesla app and re-subscribe only for road-trip months.',
        healthNote: null,
        url: 'https://www.tesla.com/support/full-self-driving-subscriptions',
      },
    ],
  },
  {
    match: ['applecare', 'apple care'],
    items: [
      {
        name: 'Self-insure: cancel AppleCare+ and bank the premium',
        price: 0,
        cadence: 'monthly',
        qualityNote: 'Setting the premium aside usually beats AppleCare+ unless you break devices often; repairs become pay-per-incident.',
        healthNote: null,
        url: 'https://support.apple.com/repair',
      },
    ],
  },
  {
    match: ['audible'],
    items: [
      {
        name: 'Libby (free library audiobooks)',
        price: 0,
        cadence: 'monthly',
        qualityNote: 'Free with a public library card; smaller catalog and hold queues on new releases.',
        healthNote: 'Reading before bed beats doomscrolling — same habit, zero cost.',
        url: 'https://libbyapp.com',
      },
    ],
  },
]

function catalogFallback({ merchant, annualCost }) {
  const m = (merchant || '').toLowerCase()
  const entry = CATALOG.find((c) => c.match.some((token) => m.includes(token.trim())))
  const items = entry ? entry.items : []
  const suggestions = items.map((it) => {
    const suggestionAnnual = annualOf(it.price, it.cadence)
    const annualSavings =
      annualCost != null && suggestionAnnual != null
        ? round2(Math.max(0, annualCost - suggestionAnnual))
        : null
    return {
      name: it.name,
      price: it.price,
      cadence: it.cadence,
      annualSavings,
      qualityNote: it.qualityNote,
      healthNote: it.healthNote,
      url: it.url,
    }
  })
  const recommendation =
    suggestions.length > 0
      ? `Start with "${suggestions[0].name}" — the lowest-friction switch for ${merchant}. (catalog fallback)`
      : `No catalog match for ${merchant}; retry when live AI search is available. (catalog fallback)`
  return {
    merchant,
    currentAnnualCost: annualCost,
    suggestions,
    recommendation,
  }
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }
  if (!body || typeof body !== 'object' || typeof body.merchant !== 'string' || !body.merchant.trim()) {
    return json(400, { error: 'Missing required field: merchant (string)' })
  }

  const merchant = body.merchant.trim().slice(0, 120)
  const plan = typeof body.plan === 'string' ? body.plan.slice(0, 120) : null
  const amount = numOrNull(body.amount)
  const cadence = coerceCadence(body.cadence)
  const annualCost = numOrNull(body.annualCost)
  const category = typeof body.category === 'string' ? body.category.slice(0, 40) : 'other'
  const owner = isOwner(req)

  const apiKey = process.env.GLM_API_KEY || ''
  const baseUrl = (process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, '')
  const model = process.env.GLM_MODEL || 'glm-5.1'

  return sseResponse(async (send) => {
    if (!apiKey) {
      send('start', { provider: 'catalog', model: 'deterministic' })
      send('result', catalogFallback({ merchant, annualCost }))
      return
    }

    // Throttle non-owner callers: over the shared daily budget, serve the
    // deterministic catalog fallback instead of spending on live AI search.
    if (!owner && (await overPublicAiCap())) {
      send('start', { provider: 'catalog', model: 'deterministic' })
      const fallback = catalogFallback({ merchant, annualCost })
      fallback.recommendation = `${fallback.recommendation} Daily AI budget reached — showing catalog suggestions.`
      send('result', fallback)
      return
    }

    send('start', { provider: 'glm', model })

    const systemPrompt = [
      'You are a savings researcher. Find 2-4 REAL, currently-available cheaper or healthier alternatives to the given subscription, with current US prices.',
      'Prefer official plan/pricing pages for the url field. Never invent products or prices.',
      'Respond with ONLY a single JSON object, no markdown fences, matching exactly:',
      '{',
      '  "merchant": string,',
      '  "currentAnnualCost": number | null,',
      '  "suggestions": [',
      '    { "name": string, "price": number | null, "cadence": "weekly"|"monthly"|"quarterly"|"annual"|"unknown",',
      '      "annualSavings": number | null, "qualityNote": string, "healthNote": string | null, "url": string | null }',
      '  ],',
      '  "recommendation": string',
      '}',
      'annualSavings = current annual cost minus the alternative\'s annual cost. Keep notes under 25 words each.',
    ].join('\n')

    const userPrompt = [
      `Subscription: ${merchant}${plan ? ` (${plan})` : ''}`,
      `Amount: ${amount != null ? `$${amount}` : 'unknown'} per ${cadence}`,
      `Annual cost: ${annualCost != null ? `$${annualCost}` : 'unknown'}`,
      `Category: ${category}`,
      'Find cheaper or healthier alternatives and return the JSON.',
    ].join('\n')

    let content = ''
    try {
      const out = await streamChat({
        url: `${baseUrl}/chat/completions`,
        apiKey,
        body: {
          model,
          thinking: { type: 'disabled' },
          max_tokens: owner ? 1500 : 900,
          temperature: 0.4,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          tools: [
            {
              type: 'web_search',
              web_search: {
                enable: 'True',
                search_engine: 'search-prime',
                search_result: 'True',
                count: '3',
                content_size: 'low',
                search_recency_filter: 'noLimit',
                search_prompt: `Current 2026 US prices for cheaper alternatives to the ${merchant} ${plan || ''} ${category} subscription`.trim(),
              },
            },
          ],
        },
        onDelta: (text) => send('delta', { text }),
      })
      content = out.content
      if (!content.trim()) {
        console.log('alternatives: empty GLM content', JSON.stringify({ finish_reason: out.finishReason, usage: out.usage }))
      }
    } catch (err) {
      console.log('alternatives GLM failed, using catalog:', err && err.message)
      content = ''
    }

    const parsed = coerceAlternatives(extractJson(content), merchant, annualCost)
    if (parsed) {
      send('result', parsed)
      return
    }

    send('result', catalogFallback({ merchant, annualCost }))
  })
}
