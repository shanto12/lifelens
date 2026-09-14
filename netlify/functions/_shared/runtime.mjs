import { timingSafeEqual } from 'node:crypto'

export function matchesSecret(candidate, expected) {
  if (!expected || typeof candidate !== 'string') return false
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function isOwner(req) {
  return matchesSecret(req.headers.get('x-access-code') || '', process.env.LIFELENS_ACCESS_CODE || '')
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

// Bound request allocation even when the caller omits Content-Length.
export async function readJson(req, limit = 24000) {
  if (Number(req.headers.get('content-length')) > limit) throw new Error('Request body too large')
  const reader = req.body?.getReader()
  if (!reader) throw new Error('Missing request body')
  const parts = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new Error('Request body too large')
      }
      parts.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'))
  } finally {
    reader.releaseLock()
  }
}

const money = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const usd = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const text = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 180) : fallback

export function deterministicBrief(summary) {
  const subscriptions = Array.isArray(summary.subscriptions) ? summary.subscriptions.filter((s) => s && ['active', 'trial'].includes(s.status)) : []
  const annual = subscriptions.reduce((sum, sub) => sum + money(sub.annualCost), 0)
  const costliest = [...subscriptions].sort((a, b) => money(b.annualCost) - money(a.annualCost))[0]
  const renewals = Array.isArray(summary.upcomingRenewals) ? summary.upcomingRenewals.filter((s) => s && typeof s.merchant === 'string') : []
  const people = Array.isArray(summary.peopleNudges) ? summary.peopleNudges.filter((s) => typeof s === 'string').slice(0, 3) : []
  const total = money(summary.totalTracked)
  return {
    headline: `${usd(total)} tracked · ${subscriptions.length} active subscriptions to review`,
    sections: [
      { title: 'Your spending snapshot', body: `The submitted dataset contains ${usd(total)} in tracked spending. Known active subscription costs total ${usd(annual)} per year. These are dataset calculations, not account balances.`, impactUsd: null },
      { title: 'One subscription decision', body: costliest ? `Review ${text(costliest.merchant, 'your largest subscription')} first: ${usd(money(costliest.annualCost))} per year. Compare usage with cost, then keep, pause, or prepare a cancellation draft. No savings are assumed until you choose.` : 'No active subscription costs are available in this summary. Add known costs before estimating savings.', impactUsd: null },
      { title: 'Renewals to check', body: renewals.length ? renewals.slice(0, 3).map((r) => `${text(r.merchant, 'Subscription')}: ${text(r.nextRenewal, 'date unknown')}`).join('; ') + '. Dates come from the submitted snapshot.' : 'No upcoming renewal dates were supplied.', impactUsd: null },
      { title: 'Make room for people', body: people.length ? `Consider a personal check-in: ${people.map((p) => p.slice(0, 150)).join('; ')}. These are suggestions only; no message has been sent.` : 'No overdue relationship check-ins were supplied. Contact timing alone does not measure relationship quality.', impactUsd: null },
    ],
    totalPotentialAnnualSavings: null,
    source: 'deterministic',
    note: 'Rule-based brief calculated from the submitted summary. No live model or external account was accessed.',
  }
}

export function deterministicScript(target, goal) {
  const cancelling = /cancel|pause|end subscription/i.test(goal)
  return {
    target,
    goal,
    opening: `Hello, I am reviewing my ${target} service. I would like to ${cancelling ? 'understand my cancellation or pause options' : 'review options to reduce my bill without adding services'}. Can you help me compare the available choices?`,
    keyPoints: [
      `My goal: ${goal}`,
      'Confirm the current plan, recurring charge, next billing date, and any remaining commitment.',
      cancelling ? 'Ask when cancellation takes effect and whether access, refunds, or fees are affected.' : 'Ask for the total price after taxes, the promotion end date, and any contract or cancellation terms.',
      'Do not approve a plan change until the full terms are clear.',
    ],
    objectionHandlers: [
      { objection: 'This is our best available offer.', response: 'Are there lower tiers, a pause option, or a no-contract offer I should compare?' },
      { objection: 'You need to decide now.', response: 'Please provide the terms in writing so I can review them before deciding.' },
    ],
    closing: 'Please summarize any agreed change, effective date, and confirmation reference in writing. Thank you.',
    estimatedSavingsUsd: null,
    source: 'deterministic',
    note: 'Prepared template, not live AI output. No call has been placed and no account has been changed.',
  }
}
