import type { HealthStatus, Snapshot } from './types'

const ACCESS_CODE_KEY = 'lifelens.accessCode'

export function getAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(ACCESS_CODE_KEY, code)
    else localStorage.removeItem(ACCESS_CODE_KEY)
  } catch {
    // storage unavailable (private mode) — owner mode just won't persist
  }
}

function authHeaders(): Record<string, string> {
  const code = getAccessCode()
  return code ? { 'x-access-code': code } : {}
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return null
    return (await res.json()) as HealthStatus
  } catch {
    return null
  }
}

/**
 * Discriminated result of a snapshot fetch:
 * - `owner`   — the server returned a real owner snapshot (has a profile, mode === 'owner').
 * - `bundled` — the server signalled the client to use its bundled synthetic persona
 *               ({ bundled: true } marker, or a synthetic-mode payload with no profile).
 * - `error`   — network failure or non-OK response (status carried for messaging).
 */
export type SnapshotResult =
  | { kind: 'owner'; snapshot: Snapshot }
  | { kind: 'bundled' }
  | { kind: 'error'; status: number }

export async function fetchSnapshot(): Promise<SnapshotResult> {
  let res: Response
  try {
    res = await fetch('/api/snapshot', { headers: authHeaders() })
  } catch {
    return { kind: 'error', status: 0 }
  }
  if (!res.ok) return { kind: 'error', status: res.status }
  let data: (Snapshot & { bundled?: boolean }) | null
  try {
    data = (await res.json()) as Snapshot & { bundled?: boolean }
  } catch {
    return { kind: 'error', status: res.status }
  }
  // The server returns { bundled: true } when no valid access code is present,
  // signalling the client to use its bundled synthetic persona instead.
  if (!data || data.bundled || data.mode !== 'owner' || !data.profile) {
    return { kind: 'bundled' }
  }
  return { kind: 'owner', snapshot: data }
}

export async function postAction(body: {
  kind: string
  target: string
  payload?: Record<string, unknown>
}): Promise<{ ok: boolean; id?: number }> {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false }
    return (await res.json()) as { ok: boolean; id?: number }
  } catch {
    return { ok: false }
  }
}

export interface SseCallbacks<TResult> {
  onStart?: (meta: { provider: string; model: string }) => void
  onDelta?: (text: string) => void
  onResult: (result: TResult) => void
  onError?: (message: string) => void
  onDone?: () => void
}

/**
 * POST to an SSE endpoint and dispatch typed events.
 * Server emits: `event: start|delta|result|error|done` with JSON `data:` lines.
 * Never call res.json() on these endpoints — there is no JSON body, only event frames.
 */
export async function streamSse<TResult>(
  path: string,
  body: Record<string, unknown>,
  callbacks: SseCallbacks<TResult>,
): Promise<void> {
  // onDone must fire EXACTLY once — whether from a 'done' frame, normal loop
  // completion, or a mid-stream throw — so callers can always re-enable UI.
  let doneFired = false
  const fireDone = () => {
    if (doneFired) return
    doneFired = true
    callbacks.onDone?.()
  }

  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
  } catch {
    callbacks.onError?.('Network error — request failed to send.')
    fireDone()
    return
  }
  if (!res.ok || !res.body) {
    callbacks.onError?.(`Request failed (${res.status})`)
    fireDone()
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (frame: string) => {
    const lines = frame.split('\n')
    let event = 'message'
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data && event !== 'done') return
    try {
      switch (event) {
        case 'start':
          callbacks.onStart?.(JSON.parse(data))
          break
        case 'delta':
          callbacks.onDelta?.((JSON.parse(data) as { text?: string }).text ?? '')
          break
        case 'result':
          callbacks.onResult(JSON.parse(data) as TResult)
          break
        case 'error':
          callbacks.onError?.((JSON.parse(data) as { message?: string }).message ?? 'Unknown error')
          break
        case 'done':
          fireDone()
          break
      }
    } catch {
      // malformed frame — skip
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (frame.trim() && !frame.startsWith(':')) dispatch(frame)
      }
    }
  } catch {
    // Reader threw mid-stream (connection dropped, decode error): surface it and
    // guarantee completion so busy buttons re-enable.
    callbacks.onError?.('Connection lost mid-stream')
  } finally {
    // Fires exactly once even if a 'done' frame already fired it above.
    fireDone()
  }
}
