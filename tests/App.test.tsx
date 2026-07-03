import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'
import { syntheticSnapshot } from '../src/data/persona'
import type { HealthStatus } from '../src/lib/types'

const healthPayload: HealthStatus = {
  ok: true,
  capabilities: { glm: false, grok: false, supabase: false, twilio: false, ownerMode: false },
  mode: 'degraded',
  service: 'lifelens',
  version: '1.0.0',
  model: 'glm-5.1',
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
    expect(await screen.findByRole('button', { name: /Money Map/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: /Primary/i })
    for (const label of [
      /Dashboard/,
      /Subscriptions/,
      /People & Family/,
      /Insights/,
      /Actions & Calls/,
      /Demo Guide/,
    ]) {
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
    await user.click(within(nav).getByRole('button', { name: /Subscriptions/ }))

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
    await user.click(within(nav).getByRole('button', { name: /Demo Guide/ }))

    // The guide's env cheatsheet references the GLM provider (GLM_API_KEY / glm-5.1).
    const glmMentions = await screen.findAllByText(/GLM/i)
    expect(glmMentions.length).toBeGreaterThan(0)
  })
})
