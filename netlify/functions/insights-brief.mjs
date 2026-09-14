import { json, isOwner, readJson, deterministicBrief } from './_shared/runtime.mjs'

// POST /api/insights-brief — SSE. Personal-CFO daily brief from a client-computed
// spend summary. Streams GLM output and emits a strict BriefResult JSON payload.

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
        send('error', { message: 'Unable to complete this request.' })
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
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Upstream model error (${res.status})`)
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
    body = await readJson(req)
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }
  if (!body || typeof body !== 'object' || !body.summary || typeof body.summary !== 'object' || Array.isArray(body.summary)) {
    return json(400, { error: 'Missing required field: summary (object)' })
  }
  const summary = body.summary
  const owner = isOwner(req)

  const apiKey = process.env.GLM_API_KEY || ''
  const baseUrl = (process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, '')
  const model = process.env.GLM_MODEL || 'glm-5.2'

  return sseResponse(async (send) => {
    const fallback = () => {
      send('start', { provider: 'rules', model: 'deterministic' })
      send('result', deterministicBrief(summary))
    }
    if (!owner || !apiKey) {
      fallback()
      return
    }

    send('start', { provider: 'glm', model })

    let content
    try {
      ;({ content } = await streamChat({
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
      fallback()
      return
    }

    if (!content.trim()) {
      fallback()
      return
    }

    const brief = coerceBrief(extractJson(content))
    if (!brief) {
      fallback()
      return
    }

    send('result', brief)
  })
}
