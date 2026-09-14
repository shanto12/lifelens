// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import health from '../../netlify/functions/health.mjs'
import snapshot from '../../netlify/functions/snapshot.mjs'
import action from '../../netlify/functions/action.mjs'
import connectors from '../../netlify/functions/connectors.mjs'
import initiate from '../../netlify/functions/call-initiate.mjs'
import script from '../../netlify/functions/call-script.mjs'
import brief from '../../netlify/functions/insights-brief.mjs'
import alternatives from '../../netlify/functions/alternatives.mjs'
import ingest from '../../netlify/functions/ingest-run.mjs'

const post = (name: string, body: unknown, headers = {}) => new Request(`https://example.test/api/${name}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
})
const get = (name: string, headers = {}) => new Request(`https://example.test/api/${name}`, { headers })
const frames = async (response: Response) => (await response.text()).split('\n\n').filter((line) => line.startsWith('event:')).map((frame) => {
  const [event, data] = frame.split('\n')
  return { event: event.slice(7), data: JSON.parse(data.slice(6)) }
})

beforeEach(() => {
  for (const key of ['GLM_API_KEY', 'XAI_API_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_API_SECRET', 'LIFELENS_ACCESS_CODE', 'COMPOSIO_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'OWNER_PHONE_NUMBER']) vi.stubEnv(key, `fake-test-${key}`)
  vi.stubEnv('SUPABASE_URL', 'https://database.example.test')
  vi.stubEnv('TWILIO_ALLOWED_TO', '')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external side effect') }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('public isolation even when all server providers are configured', () => {
  it('returns only a synthetic marker for absent or incorrect owner code', async () => {
    for (const headers of [{}, { 'x-access-code': 'wrong-code' }]) {
      const response = await snapshot(get('snapshot', headers))
      expect(await response.json()).toEqual({ mode: 'synthetic', bundled: true })
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('never authenticates an empty configured access code', async () => {
    vi.stubEnv('LIFELENS_ACCESS_CODE', '')
    expect(await (await snapshot(get('snapshot'))).json()).toEqual({ mode: 'synthetic', bundled: true })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('labels health as demo and configuration as unprobed', async () => {
    const data = await (await health(get('health'))).json()
    expect(data).toMatchObject({ mode: 'demo', providerStatus: 'configuration_only_not_probed', publicAi: 'deterministic' })
    expect(JSON.stringify(data)).not.toContain('fake-test')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('simulates public action writes and calls without contacting any service', async () => {
    expect(await (await action(post('action', { kind: 'note', target: 'Synthetic Alex', payload: { note: 'Review next week' } }))).json()).toEqual({ ok: true, dryRun: true })
    expect(await (await initiate(post('call-initiate', { target: 'Demo service', script: 'Please review my plan.' }))).json()).toMatchObject({ ok: true, status: 'dry_run', reason: 'not_owner' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('honors explicit previews even with a valid synthetic owner code', async () => {
    const headers = { 'x-access-code': 'fake-test-LIFELENS_ACCESS_CODE' }
    expect(await (await action(post('action', { kind: 'note', target: 'Demo', dryRun: true }, headers))).json()).toMatchObject({ ok: true, dryRun: true })
    expect(await (await initiate(post('call-initiate', { target: 'Demo', script: 'Preview only', dryRun: true }, headers))).json()).toMatchObject({ status: 'dry_run', reason: 'requested_preview' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does not report synthetic accounts as live connections or initiate OAuth', async () => {
    const data = await (await connectors(get('connectors'))).json()
    expect(data.owner).toBe(false)
    expect(data.connectors.some((item: { status: string }) => item.status === 'connected')).toBe(false)
    expect(await (await connectors(post('connectors', { toolkit: 'gmail' }))).json()).toMatchObject({ ok: false, status: 'not_owner' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects forged scheduler bodies, wrong secrets, and GET before any DB read/write', async () => {
    for (const request of [post('ingest-run', { next_run: '2099-01-01' }), post('ingest-run', {}, { 'x-ingest-secret': 'wrong' }), get('ingest-run')]) {
      const response = await ingest(request)
      expect([403, 405]).toContain(response.status)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('deterministic public workflows', () => {
  it('calculates a numeric brief and relationship nudges from synthetic input only', async () => {
    const events = await frames(await brief(post('insights-brief', { summary: {
      totalTracked: 1234.5,
      subscriptions: [{ merchant: 'Demo Service', annualCost: 240, status: 'active' }, { merchant: 'Cancelled', annualCost: 999, status: 'cancelled' }],
      upcomingRenewals: [{ merchant: 'Demo Service', nextRenewal: '2026-10-01' }],
      peopleNudges: ['Alex (45 days since contact)'],
    } })))
    expect(events.map((event) => event.event)).toEqual(['start', 'result', 'done'])
    expect(events[0].data).toEqual({ provider: 'rules', model: 'deterministic' })
    const result = events[1].data
    expect(result.headline).toContain('$1,234.50')
    expect(result.headline).toContain('1 active')
    expect(result.sections[0].body).toContain('$240')
    expect(result.sections[3].body).toContain('Alex (45 days')
    expect(result.totalPotentialAnnualSavings).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('prepares a cancellation template without model calls or invented savings', async () => {
    const events = await frames(await script(post('call-script', { target: 'Demo Service', goal: 'cancel subscription', provider: 'grok' })))
    expect(events[0].data.provider).toBe('rules')
    expect(events[1].data.opening).toContain('cancellation or pause')
    expect(events[1].data.estimatedSavingsUsd).toBeNull()
    expect(events[1].data.note).toContain('No call has been placed')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('gives honest illustrative catalog calculations and useful unknown-merchant options', async () => {
    const known = await frames(await alternatives(post('alternatives', { merchant: 'Netflix', annualCost: 240 })))
    expect(known[0].data.provider).toBe('catalog')
    expect(known[1].data.suggestions[0].annualSavings).toBe(144.12)
    expect(known[1].data.pricesVerified).toBe(false)
    const unknown = await frames(await alternatives(post('alternatives', { merchant: 'Demo Cloud', annualCost: 120 })))
    expect(unknown[1].data.suggestions).toHaveLength(2)
    expect(unknown[1].data.suggestions[0].price).toBeNull()
    expect(unknown[1].data.suggestions[1].annualSavings).toBe(120)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('falls back when an authenticated synthetic model request fails without exposing provider bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PRIVATE_PROVIDER_DETAIL', { status: 429 })))
    for (const [handler, request] of [
      [brief, post('insights-brief', { summary: { totalTracked: 20 } }, { 'x-access-code': 'fake-test-LIFELENS_ACCESS_CODE' })],
      [script, post('call-script', { target: 'Demo', goal: 'reduce bill' }, { 'x-access-code': 'fake-test-LIFELENS_ACCESS_CODE' })],
    ] as const) {
      const events = await frames(await handler(request))
      expect(events.find((event) => event.event === 'result')?.data.source).toBe('deterministic')
      expect(JSON.stringify(events)).not.toContain('PRIVATE_PROVIDER_DETAIL')
      expect(events.at(-1)?.event).toBe('done')
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('input boundaries', () => {
  it('rejects malformed, null, array and oversized bodies cleanly', async () => {
    const requests = [
      [connectors, post('connectors', null)],
      [connectors, post('connectors', [])],
      [brief, post('insights-brief', { summary: [] })],
      [script, post('call-script', { target: 'Demo', goal: '' })],
      [alternatives, post('alternatives', { merchant: 'Demo', annualCost: -10 })],
      [action, post('action', { kind: 'note', target: 'Demo', payload: [] })],
      [initiate, post('call-initiate', { target: 'Demo', script: 'hello', to: 'not a phone' })],
      [brief, post('insights-brief', { summary: { huge: 'x'.repeat(25000) } })],
      [brief, new Request('https://example.test/api/insights-brief', { method: 'POST', body: '{' })],
    ] as const
    for (const [handler, request] of requests) expect((await handler(request)).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
})
