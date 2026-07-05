// ingest-run — scheduled daily (schedule lives in netlify.toml) and manually
// POSTable. Purely deterministic insight generation: renewal alerts, category
// spend jumps, subscription-cost snapshot, and consolidation opportunities.
// No LLM calls — must finish well inside the 30s cap.

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function supabaseEnv() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_ANON_KEY || ''
  const gate = process.env.SUPABASE_API_SECRET || ''
  return url && key && gate ? { url, key, gate } : null
}

function isOwner(req) {
  const code = process.env.LIFELENS_ACCESS_CODE || ''
  if (!code) return false
  return (req.headers.get('x-access-code') || '') === code
}

async function sbSelect(env, pathAndQuery) {
  const res = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'x-lifelens-key': env.gate },
  })
  if (!res.ok) {
    throw new Error(`Supabase read failed (${res.status}) for ${pathAndQuery.split('?')[0]}`)
  }
  return res.json()
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
  if (!res.ok) throw new Error(`Supabase insert into ${table} failed (${res.status})`)
  return res.json()
}

async function sbUpdate(env, table, filter, patch) {
  const res = await fetch(`${env.url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'x-lifelens-key': env.gate,
      'content-type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Supabase update ${table} failed (${res.status})`)
}

const round2 = (n) => Math.round(n * 100) / 100

// Advance a YYYY-MM-DD date by one cadence period. For monthly/quarterly/annual the
// day-of-month is taken from `anchorDay` (the ORIGINAL renewal day), not the running
// value, so a Jan-31 anchor lands on Feb-28 then recovers to Mar-31 instead of pinning
// to the 28th forever.
function advanceByCadence(dateStr, cadence, anchorDay) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  if (cadence === 'weekly') {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  }
  const add = { monthly: 1, quarterly: 3, annual: 12 }
  const months = add[cadence]
  if (months === undefined) return null
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(anchorDay || d, lastDay))
  return target.toISOString().slice(0, 10)
}

// Roll a past-due renewal forward to the next occurrence that is >= todayStr.
function nextRenewalOnOrAfter(dateStr, cadence, todayStr) {
  const anchorDay = Number(dateStr.slice(8, 10)) || undefined
  let cur = dateStr.slice(0, 10)
  // Bounded loop: at most ~130 monthly steps covers a decade of staleness.
  for (let i = 0; i < 130 && cur < todayStr; i++) {
    const next = advanceByCadence(cur, cadence, anchorDay)
    if (!next || next <= cur) return null
    cur = next
  }
  return cur < todayStr ? null : cur
}

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

export default async (req) => {
  const startedAt = new Date().toISOString()
  console.log('ingest-run: start', startedAt)

  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    // Read the body ONCE (scheduled invocations POST JSON with a next_run field).
    let parsedBody = null
    try {
      const raw = await req.text()
      parsedBody = raw ? JSON.parse(raw) : null
    } catch {
      parsedBody = null
    }
    const isScheduled = !!(parsedBody && typeof parsedBody === 'object' && parsedBody.next_run)

    // Gate HTTP invocations: allow only scheduled runs, the owner, or the shared
    // ingest secret. Everyone else is forbidden.
    const secret = process.env.SUPABASE_API_SECRET || ''
    const hasSecret = !!secret && (req.headers.get('x-ingest-secret') || '') === secret
    if (!isScheduled && !isOwner(req) && !hasSecret) {
      return json(403, { error: 'forbidden' })
    }

    const env = supabaseEnv()
    if (!env) {
      console.log('ingest-run: Supabase env missing — nothing to do')
      return json(200, { ok: true, skipped: true, note: 'Supabase not configured' })
    }

    const now = new Date()
    const cutoff120 = new Date(now.getTime() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const [subscriptions, transactions, accounts, existingInsights] = await Promise.all([
      sbSelect(env, 'subscriptions?select=*'),
      sbSelect(env, `transactions?select=date,amount,category,kind&date=gte.${cutoff120}&order=date.desc&limit=2000`),
      sbSelect(env, 'accounts?select=*'),
      sbSelect(env, 'insights?select=title,data'),
    ])
    const subs = Array.isArray(subscriptions) ? subscriptions : []
    const txns = Array.isArray(transactions) ? transactions : []
    const accts = Array.isArray(accounts) ? accounts : []
    console.log(`ingest-run: loaded ${subs.length} subs, ${txns.length} txns, ${accts.length} accounts`)

    // Build dedupe indexes ONCE across ANY status (dropped &status=eq.new so
    // dismissed/done insights are never resurrected). Prefer the stable data.key;
    // fall back to title for legacy rows without a key.
    const existing = Array.isArray(existingInsights) ? existingInsights : []
    const existingKeys = new Set(
      existing.map((r) => r && r.data && r.data.key).filter(Boolean),
    )
    const existingTitles = new Set(existing.map((r) => r && r.title).filter(Boolean))

    const newRows = []
    const seenKeys = new Set()
    // Queue an insight unless its stable key (or, for legacy rows, title) exists.
    const queue = (insight) => {
      const key = insight.data && insight.data.key
      if (key && (existingKeys.has(key) || seenKeys.has(key))) {
        console.log('ingest-run: dedupe skip (key):', key)
        return
      }
      if (existingTitles.has(insight.title)) {
        console.log('ingest-run: dedupe skip (title):', insight.title)
        return
      }
      if (key) seenKeys.add(key)
      newRows.push({ ...insight, status: 'new' })
    }

    const todayStr = now.toISOString().slice(0, 10)

    // (0) Self-heal stale renewals: active/trial subs whose next_renewal is in the
    // past get rolled forward by their cadence to the next future occurrence, so
    // "renewing soon" stays accurate and alerts don't silently drop or repeat.
    let renewalsHealed = 0
    for (const s of subs) {
      // Heal every non-cancelled sub — matching how the wealth/consolidation
      // insights below count "active" (status !== 'cancelled'). cadence 'unknown'
      // makes nextRenewalOnOrAfter return null, so those rows are left untouched.
      if (!s || s.status === 'cancelled' || !s.next_renewal) continue
      const cur = String(s.next_renewal).slice(0, 10)
      if (cur >= todayStr) continue
      const rolled = nextRenewalOnOrAfter(cur, s.cadence, todayStr)
      if (!rolled || rolled === cur) continue
      try {
        await sbUpdate(env, 'subscriptions', `id=eq.${s.id}`, { next_renewal: rolled })
        s.next_renewal = rolled // keep in-memory copy fresh for the alert loop below
        renewalsHealed++
      } catch (e) {
        console.log(`ingest-run: renewal roll-forward failed for sub ${s.id}: ${e.message}`)
      }
    }
    if (renewalsHealed) console.log(`ingest-run: rolled forward ${renewalsHealed} stale renewal(s)`)

    // (a) renewals due within 14 days → 'alert' insights
    const in14 = new Date(now.getTime() + 14 * 24 * 3600 * 1000)
    for (const s of subs) {
      if (!s || s.status === 'cancelled' || !s.next_renewal) continue
      const renewal = new Date(s.next_renewal)
      if (Number.isNaN(renewal.getTime())) continue
      if (renewal < new Date(todayStr) || renewal > in14) continue
      const amount = num(s.amount)
      const renewalDate = String(s.next_renewal).slice(0, 10)
      const title = `Renewal due: ${s.merchant} on ${renewalDate}`
      const body = `${s.merchant}${s.plan ? ` (${s.plan})` : ''} renews on ${renewalDate}${
        amount != null ? ` for $${round2(amount)}` : ''
      }. Decide before it charges: keep, downgrade, or cancel.`
      queue({
        type: 'alert',
        title,
        body,
        impact_usd: amount,
        impact_kind: amount != null ? 'one_time' : null,
        data: { key: `renewal:${s.merchant}:${renewalDate}` },
      })
    }

    // (b) current-month category spend vs prior month: >40% jump AND >$100 increase
    const curMonth = now.toISOString().slice(0, 7)
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const priorMonth = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`
    const byCatCur = {}
    const byCatPrior = {}
    for (const t of txns) {
      if (!t || t.kind === 'refund') continue
      const amount = num(t.amount)
      if (amount == null || amount <= 0) continue
      const month = String(t.date || '').slice(0, 7)
      const cat = t.category || 'other'
      if (month === curMonth) byCatCur[cat] = (byCatCur[cat] || 0) + amount
      else if (month === priorMonth) byCatPrior[cat] = (byCatPrior[cat] || 0) + amount
    }
    for (const cat of Object.keys(byCatCur)) {
      const cur = byCatCur[cat]
      const prev = byCatPrior[cat] || 0
      if (prev <= 0) continue
      const jumpPct = ((cur - prev) / prev) * 100
      if (jumpPct <= 40 || cur - prev <= 100) continue
      const title = `Spending jump: ${cat} up ${Math.round(jumpPct)}% this month`
      const body = `You have spent $${round2(cur)} on ${cat} in ${curMonth} vs $${round2(prev)} in ${priorMonth} — a $${round2(
        cur - prev,
      )} increase. Review the largest charges in this category.`
      queue({
        type: 'save_money',
        title,
        body,
        impact_usd: round2(cur - prev),
        impact_kind: 'one_time',
        data: { key: `spend_jump:${cat}:${curMonth.replace('-', '')}` },
      })
    }

    // (c) subscription annual-cost snapshot → one 'wealth' insight per run day
    const activeSubs = subs.filter((s) => s && s.status !== 'cancelled')
    const annualTotal = round2(
      activeSubs.reduce((sum, s) => sum + (num(s.annual_cost) || 0), 0),
    )
    if (activeSubs.length > 0) {
      const title = `Subscription total: $${annualTotal}/yr as of ${todayStr}`
      const body = `You have ${activeSubs.length} active subscriptions costing about $${annualTotal} per year ($${round2(
        annualTotal / 12,
      )}/month). That figure invested at 7% would be worth roughly $${round2(annualTotal * 5.75)} in 5 years.`
      queue({
        type: 'wealth',
        title,
        body,
        impact_usd: annualTotal,
        impact_kind: null,
        data: { key: `wealth:${todayStr.replace(/-/g, '')}` },
      })
    }

    // (d) >=3 active subscriptions in one category → consolidation opportunity
    const byCat = {}
    for (const s of activeSubs) {
      const cat = s.category || 'other'
      if (!byCat[cat]) byCat[cat] = []
      byCat[cat].push(s)
    }
    for (const cat of Object.keys(byCat)) {
      const group = byCat[cat]
      if (group.length < 3) continue
      const costs = group.map((s) => num(s.annual_cost)).filter((c) => c != null && c > 0)
      // Total annual cost of the category — informational, not a savings figure
      // (impact_kind null): we cannot promise elimination of any given service.
      const totalCost = costs.length ? round2(costs.reduce((a, b) => a + b, 0)) : null
      const names = group.map((s) => s.merchant).filter(Boolean).slice(0, 5).join(' + ')
      const title = `Consolidation opportunity: ${group.length} ${cat} subscriptions`
      const body = `You are paying for ${group.length} ${cat} services at once (${names})${
        totalCost != null ? ` — about $${totalCost}/yr combined` : ''
      }. Cutting or rotating just one would save real money every year.`
      queue({
        type: 'save_money',
        title,
        body,
        impact_usd: totalCost,
        impact_kind: null,
        data: { key: `consolidation:${cat}` },
      })
    }

    // Insert all new insight rows in ONE call (PostgREST accepts an array body).
    let inserted = 0
    if (newRows.length > 0) {
      await sbInsert(env, 'insights', newRows)
      inserted = newRows.length
      console.log(`ingest-run: inserted ${inserted} insights`)
    }

    const considered = subs.length + txns.length + accts.length

    // record the run (considered is kept in internal run stats, not the response)
    try {
      await sbInsert(env, 'runs', {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        kind: 'ingest_run',
        status: 'ok',
        stats: { inserted, considered, renewalsHealed },
      })
    } catch (err) {
      console.log('ingest-run: failed to write runs row:', err && err.message)
    }

    console.log(`ingest-run: done — inserted ${inserted}, considered ${considered}`)
    return json(200, { ok: true })
  } catch (err) {
    console.log('ingest-run: error:', err && err.message)
    const env = supabaseEnv()
    if (env) {
      try {
        await sbInsert(env, 'runs', {
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          kind: 'ingest_run',
          status: 'error',
          stats: { error: String((err && err.message) || 'unknown') },
        })
      } catch {
        // best effort only
      }
    }
    return json(500, { ok: false, error: 'Ingest run failed' })
  }
}
