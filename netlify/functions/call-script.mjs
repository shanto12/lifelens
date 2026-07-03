// POST /api/call-script — SSE. Generates a bill-negotiation/cancellation phone
// script via GLM (or Grok when body.provider === 'grok' and XAI_API_KEY is set),
// then best-effort logs an actions row for the owner.

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
        console.log('call-script stream error:', err && err.message)
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

function coerceCallScript(obj, goal, target) {
  if (!obj || typeof obj !== 'object') return null
  const keyPoints = (Array.isArray(obj.keyPoints) ? obj.keyPoints : []).filter(
    (p) => typeof p === 'string' && p,
  )
  const objectionHandlers = (Array.isArray(obj.objectionHandlers) ? obj.objectionHandlers : [])
    .filter((o) => o && typeof o === 'object')
    .map((o) => ({
      objection: typeof o.objection === 'string' ? o.objection : '',
      response: typeof o.response === 'string' ? o.response : '',
    }))
    .filter((o) => o.objection && o.response)
  if (typeof obj.opening !== 'string' || !obj.opening || keyPoints.length === 0) return null
  return {
    goal: typeof obj.goal === 'string' && obj.goal ? obj.goal : goal,
    target: typeof obj.target === 'string' && obj.target ? obj.target : target,
    opening: obj.opening,
    keyPoints,
    objectionHandlers,
    closing: typeof obj.closing === 'string' ? obj.closing : '',
    estimatedSavingsUsd: numOrNull(obj.estimatedSavingsUsd),
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
  if (!body || typeof body !== 'object') {
    return json(400, { error: 'Missing request body' })
  }
  if (typeof body.target !== 'string' || !body.target.trim()) {
    return json(400, { error: 'Missing required field: target (string)' })
  }
  if (typeof body.goal !== 'string' || !body.goal.trim()) {
    return json(400, { error: 'Missing required field: goal (string)' })
  }

  const target = body.target.trim().slice(0, 160)
  const goal = body.goal.trim().slice(0, 400)
  const context = typeof body.context === 'string' ? body.context.slice(0, 4000) : ''
  const wantGrok = body.provider === 'grok'
  const owner = isOwner(req)

  const glmKey = process.env.GLM_API_KEY || ''
  const glmBase = (process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, '')
  const glmModel = process.env.GLM_MODEL || 'glm-5.1'
  const xaiKey = process.env.XAI_API_KEY || ''
  const xaiModel = process.env.XAI_MODEL || 'grok-4'

  const useGrok = wantGrok && !!xaiKey

  return sseResponse(async (send) => {
    if (!useGrok && !glmKey) {
      send('error', { message: 'No LLM provider configured — call script unavailable' })
      return
    }

    const provider = useGrok ? 'grok' : 'glm'
    const model = useGrok ? xaiModel : glmModel
    send('start', { provider, model })

    const systemPrompt = [
      'You are an expert bill-negotiation and cancellation phone coach. You write short, confident scripts a real person reads aloud on a call with a company\'s retention or billing department.',
      'Be concrete: name the competitor prices or plan names when the context includes them, and never be rude or dishonest.',
      'Respond with ONLY a single JSON object, no markdown fences, matching exactly:',
      '{',
      '  "goal": string,',
      '  "target": string,',
      '  "opening": string,                    // 2-3 sentence opener the caller says first',
      '  "keyPoints": string[],                // 3-6 talking points in priority order',
      '  "objectionHandlers": [ { "objection": string, "response": string } ],   // 2-4 pairs',
      '  "closing": string,                    // how to lock in the outcome and confirm in writing',
      '  "estimatedSavingsUsd": number | null  // estimated annual savings if the call succeeds',
      '}',
    ].join('\n')

    const userPrompt = [
      `Target company: ${target}`,
      `Goal: ${goal}`,
      context ? `Context:\n${context}` : 'Context: none provided',
      'Write the call script JSON now.',
    ].join('\n')

    const requestBody = useGrok
      ? {
          model,
          stream: true,
          max_tokens: 1400,
          temperature: 0.5,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }
      : {
          model,
          thinking: { type: 'disabled' },
          max_tokens: 1400,
          temperature: 0.4,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }

    const { content, finishReason, usage } = await streamChat({
      url: useGrok ? 'https://api.x.ai/v1/chat/completions' : `${glmBase}/chat/completions`,
      apiKey: useGrok ? xaiKey : glmKey,
      body: requestBody,
      onDelta: (text) => send('delta', { text }),
    })

    if (!content.trim()) {
      send('error', {
        message: 'Model returned empty content',
        finish_reason: finishReason,
        usage,
      })
      return
    }

    const script = coerceCallScript(extractJson(content), goal, target)
    if (!script) {
      send('error', { message: 'Could not parse the model output into a call script' })
      return
    }

    send('result', script)

    // Best-effort action log — never fail the stream over it.
    const env = supabaseEnv()
    if (env && owner) {
      try {
        await sbInsert(env, 'actions', {
          kind: 'call_script',
          target,
          payload: { goal, provider },
          status: 'done',
        })
      } catch (err) {
        console.log('call-script action log failed:', err && err.message)
      }
    }
  })
}
