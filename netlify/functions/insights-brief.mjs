// POST /api/insights-brief — SSE. Personal-CFO daily brief from a client-computed
// spend summary. Streams GLM output and emits a strict BriefResult JSON payload.

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
      console.log('insights-brief: bump_ai_usage_gated failed', res.status)
      return false // fail-open
    }
    const count = Number(await res.json())
    return Number.isFinite(count) && count > PUBLIC_AI_DAILY_CAP
  } catch (err) {
    console.log('insights-brief: bump_ai_usage_gated error', err && err.message)
    return false // fail-open
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
        console.log('insights-brief stream error:', err && err.message)
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

// Streams an OpenAI-compatible chat/completions SSE endpoint, accumulating content.
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

// Extract the first {...} JSON object from text via brace matching; strips ``` fences.
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

function coerceBrief(obj) {
  if (!obj || typeof obj !== 'object') return null
  const sections = (Array.isArray(obj.sections) ? obj.sections : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title : 'Section',
      body: typeof s.body === 'string' ? s.body : '',
      impactUsd: numOrNull(s.impactUsd),
    }))
  if (typeof obj.headline !== 'string' || sections.length === 0) return null
  return {
    headline: obj.headline,
    sections,
    totalPotentialAnnualSavings: numOrNull(obj.totalPotentialAnnualSavings),
  }
}

const SYSTEM_PROMPT = [
  'You are LifeLens, a sharp, pragmatic personal CFO writing a daily money-and-life brief for one person.',
  'You are given a pre-computed summary of their finances: totals, top categories and merchants, subscriptions, upcoming renewals, and health flags.',
  'Write a brief that is specific, numeric, and actionable — no generic advice.',
  'Respond with ONLY a single JSON object, no markdown fences, no prose, matching exactly:',
  '{',
  '  "headline": string,                        // one-line summary of today\'s money picture',
  '  "sections": [                              // 3 to 5 sections',
  '    { "title": string, "body": string, "impactUsd": number | null }',
  '  ],',
  '  "totalPotentialAnnualSavings": number | null',
  '}',
  'impactUsd is the estimated annual dollar impact of that section (null when non-monetary).',
  'Keep each body under 60 words. Use plain sentences, not bullet characters.',
].join('\n')

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
  if (!body || typeof body !== 'object' || !body.summary || typeof body.summary !== 'object') {
    return json(400, { error: 'Missing required field: summary (object)' })
  }
  const summary = body.summary
  const owner = isOwner(req)

  const apiKey = process.env.GLM_API_KEY || ''
  const baseUrl = (process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, '')
  const model = process.env.GLM_MODEL || 'glm-5.1'

  return sseResponse(async (send) => {
    if (!apiKey) {
      send('error', { message: 'GLM is not configured — daily brief unavailable' })
      return
    }

    // Throttle non-owner callers against a shared global daily budget.
    if (!owner && (await overPublicAiCap())) {
      send('error', {
        message: 'Daily AI budget reached — try the owner mode or come back tomorrow.',
      })
      return
    }

    send('start', { provider: 'glm', model })

    let content, finishReason, usage
    try {
      ;({ content, finishReason, usage } = await streamChat({
        url: `${baseUrl}/chat/completions`,
        apiKey,
        body: {
          model,
          thinking: { type: 'disabled' },
          max_tokens: owner ? 1400 : 900,
          temperature: 0.4,
          stream: true,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Here is today's financial summary as JSON:\n${JSON.stringify(summary).slice(0, 12000)}\n\nProduce the daily brief JSON now.`,
            },
          ],
        },
        onDelta: (text) => send('delta', { text }),
      }))
    } catch (err) {
      // Do not leak upstream provider error bodies to the client.
      console.log('insights-brief upstream failed:', err && err.message)
      send('error', { message: 'The AI provider request failed — please try again shortly.' })
      return
    }

    if (!content.trim()) {
      send('error', {
        message: 'GLM returned empty content',
        finish_reason: finishReason,
        usage,
      })
      return
    }

    const brief = coerceBrief(extractJson(content))
    if (!brief) {
      send('error', { message: 'Could not parse the model output into a brief' })
      return
    }

    send('result', brief)
  })
}
