import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { syntheticSnapshot } from '../src/data/persona'
import type { HealthStatus } from '../src/lib/types'

const healthPayload: HealthStatus = {
  ok: true,
  capabilities: { glm: false, grok: false, supabase: false, twilio: false, composio: false, ownerMode: false },
  mode: 'degraded',
  service: 'lifelens',
  version: '1.0.0',
  model: 'glm-5.2',
  timestamp: '2026-07-01T00:00:00Z',
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('/api/health')) return jsonResponse(healthPayload)
      if (url.includes('/api/snapshot')) {
        // No access code → server signals the client to use its bundled persona.
        return jsonResponse({ mode: 'synthetic', bundled: true })
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LifeLens shell', () => {
  it('renders the sidebar navigation once the snapshot loads', async () => {
    render(<App />)
    // findByRole awaits the post-loading render.
    expect(await screen.findByRole('button', { name: /Money/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: /Primary/i })
    for (const label of [/Home/, /Subs/, /People/, /Insights/, /Actions/, /Guide/]) {
      expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('shows the SYNTHETIC PERSONA chip when no owner access code is set', async () => {
    render(<App />)
    expect(await screen.findByText('SYNTHETIC PERSONA')).toBeInTheDocument()
  })

  it('navigates to Subscriptions and shows a persona merchant', async () => {
    const user = userEvent.setup()
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: /Primary/i })
    await user.click(within(nav).getByRole('button', { name: /Subs/ }))

    // Sanity: the merchant we look for really is in the bundled persona.
    expect(syntheticSnapshot.subscriptions.some((s) => s.merchant === 'Hulu')).toBe(true)
    // The name can repeat (table row, evidence, alternatives) — use getAll semantics.
    const matches = await screen.findAllByText(/Hulu/)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the env cheatsheet on the Demo Guide screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: /Primary/i })
    await user.click(within(nav).getByRole('button', { name: /Guide/ }))

    // The guide's env cheatsheet references the GLM provider (GLM_API_KEY / glm-5.2).
    const glmMentions = await screen.findAllByText(/GLM/i)
    expect(glmMentions.length).toBeGreaterThan(0)
  })
})

describe('Owner session boundaries', () => {
  it('keeps the demo locked when an earlier owner refresh finishes after locking', async () => {
    const user = userEvent.setup()
    let releaseRefresh: ((response: Response) => void) | undefined
    let ownerRequests = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/health')) return jsonResponse(healthPayload)
      const code = (init?.headers as Record<string, string>)?.['x-access-code']
      if (code === 'test-only-owner') {
        ownerRequests++
        if (ownerRequests > 1) return new Promise<Response>((resolve) => { releaseRefresh = resolve })
        return jsonResponse({ ...syntheticSnapshot, mode: 'owner' })
      }
      return jsonResponse({ mode: 'synthetic', bundled: true })
    }))
    render(<App />)
    await user.click(await screen.findByTestId('owner-unlock'))
    await user.type(screen.getByLabelText('Access code'), 'test-only-owner')
    await user.click(screen.getByRole('button', { name: /^Unlock$/ }))
    expect(await screen.findByText('OWNER DATA')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh data' }))
    await user.click(screen.getByRole('button', { name: /^Lock$/ }))
    await act(async () => { releaseRefresh?.(jsonResponse({ ...syntheticSnapshot, mode: 'owner' })) })
    expect(await screen.findByText('SYNTHETIC PERSONA')).toBeInTheDocument()
    expect(screen.queryByText('OWNER DATA')).not.toBeInTheDocument()
  })

  it('removes owner data when refreshed credentials are rejected', async () => {
    const user = userEvent.setup()
    let accepted = true
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/health')) return jsonResponse(healthPayload)
      const code = (init?.headers as Record<string, string>)?.['x-access-code']
      return jsonResponse(code === 'test-only-owner' && accepted
        ? { ...syntheticSnapshot, mode: 'owner' }
        : { mode: 'synthetic', bundled: true })
    }))
    render(<App />)
    await user.click(await screen.findByTestId('owner-unlock'))
    await user.type(screen.getByLabelText('Access code'), 'test-only-owner')
    await user.click(screen.getByRole('button', { name: /^Unlock$/ }))
    expect(await screen.findByText('OWNER DATA')).toBeInTheDocument()
    accepted = false
    await user.click(screen.getByRole('button', { name: 'Refresh data' }))
    expect(await screen.findByText('SYNTHETIC PERSONA')).toBeInTheDocument()
    localStorage.clear()
  })
})

describe('Synthetic fallback isolation', () => {
  it('clears saved owner credentials after snapshot failure and never attaches them to demo generation', async () => {
    const user = userEvent.setup()
    localStorage.setItem('lifelens.accessCode', 'saved-test-owner')
    const requests: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (url.includes('/api/health')) return jsonResponse(healthPayload)
      if (url.includes('/api/snapshot')) return { ok: false, status: 503 } as Response
      if (url.includes('/api/call-script')) return new Response('event: done\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
      return jsonResponse({})
    }))
    render(<App />)
    expect(await screen.findByText('SYNTHETIC PERSONA')).toBeInTheDocument()
    expect(localStorage.getItem('lifelens.accessCode')).toBeNull()
    // Even a token introduced after fallback must not cross the sample boundary.
    localStorage.setItem('lifelens.accessCode', 'saved-test-owner')
    const nav = screen.getByRole('navigation', { name: /Primary/i })
    await user.click(within(nav).getByRole('button', { name: 'Actions' }))
    await user.click(screen.getByRole('button', { name: 'Draft script' }))
    const generation = requests.find((request) => request.url.includes('/api/call-script'))
    expect(generation).toBeDefined()
    expect((generation?.init?.headers as Record<string, string>)['x-access-code']).toBeUndefined()
    expect(JSON.parse(String(generation?.init?.body)).demo).toBe(true)
  })
})
