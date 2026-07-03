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

const round2 = (n) => Math.round(n * 100) / 100

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

// Insert an insight unless an open one with the identical title already exists.
async function insertInsightDeduped(env, insight) {
  const q = `insights?select=id&title=eq.${encodeURIComponent(insight.title)}&status=eq.new&limit=1`
  const existing = await sbSelect(env, q)
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('ingest-run: dedupe skip:', insight.title)
    return false
  }
  await sbInsert(env, 'insights', { ...insight, status: 'new' })
  console.log('ingest-run: inserted insight:', insight.title)
  return true
}

export default async (req) => {
  const startedAt = new Date().toISOString()
  console.log('ingest-run: start', startedAt)

  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return json(405, { error: 'Method not allowed' })
    }

    const env = supabaseEnv()
    if (!env) {
      console.log('ingest-run: Supabase env missing — nothing to do')
      return json(200, { ok: true, skipped: true, note: 'Supabase not configured' })
    }

    const now = new Date()
    const cutoff120 = new Date(now.getTime() - 120 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const [subscriptions, transactions, accounts] = await Promise.all([
      sbSelect(env, 'subscriptions?select=*'),
      sbSelect(env, `transactions?select=*&date=gte.${cutoff120}&order=date.desc&limit=2000`),
      sbSelect(env, 'accounts?select=*'),
    ])
    const subs = Array.isArray(subscriptions) ? subscriptions : []
    const txns = Array.isArray(transactions) ? transactions : []
    const accts = Array.isArray(accounts) ? accounts : []
    console.log(`ingest-run: loaded ${subs.length} subs, ${txns.length} txns, ${accts.length} accounts`)

    const considered = subs.length + txns.length + accts.length
    let inserted = 0
    const todayStr = now.toISOString().slice(0, 10)

    // (a) renewals due within 14 days → 'alert' insights
    const in14 = new Date(now.getTime() + 14 * 24 * 3600 * 1000)
    for (const s of subs) {
      if (!s || s.status === 'cancelled' || !s.next_renewal) continue
      const renewal = new Date(s.next_renewal)
      if (Number.isNaN(renewal.getTime())) continue
      if (renewal < new Date(todayStr) || renewal > in14) continue
      const amount = num(s.amount)
      const title = `Renewal due: ${s.merchant} on ${String(s.next_renewal).slice(0, 10)}`
      const body = `${s.merchant}${s.plan ? ` (${s.plan})` : ''} renews on ${String(s.next_renewal).slice(0, 10)}${
        amount != null ? ` for $${round2(amount)}` : ''
      }. Decide before it charges: keep, downgrade, or cancel.`
      const ok = await insertInsightDeduped(env, {
        type: 'alert',
        title,
        body,
        impact_usd: amount,
        impact_kind: amount != null ? 'one_time' : null,
      })
      if (ok) inserted++
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
      const ok = await insertInsightDeduped(env, {
        type: 'save_money',
        title,
        body,
        impact_usd: round2(cur - prev),
        impact_kind: 'one_time',
      })
      if (ok) inserted++
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
      const ok = await insertInsightDeduped(env, {
        type: 'wealth',
        title,
        body,
        impact_usd: annualTotal,
        impact_kind: null,
      })
      if (ok) inserted++
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
      const minCost = costs.length ? round2(Math.min(...costs)) : null
      const names = group.map((s) => s.merchant).filter(Boolean).slice(0, 5).join(' + ')
      const title = `Consolidation opportunity: ${group.length} ${cat} subscriptions`
      const body = `You are paying for ${group.length} ${cat} services at once (${names}). Cutting or rotating just one would save${
        minCost != null ? ` at least $${minCost}/yr` : ' real money every year'
      }.`
      const ok = await insertInsightDeduped(env, {
        type: 'save_money',
        title,
        body,
        impact_usd: minCost,
        impact_kind: minCost != null ? 'annual_savings' : null,
      })
      if (ok) inserted++
    }

    // record the run
    try {
      await sbInsert(env, 'runs', {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        kind: 'ingest_run',
        status: 'ok',
        stats: { inserted, considered },
      })
    } catch (err) {
      console.log('ingest-run: failed to write runs row:', err && err.message)
    }

    console.log(`ingest-run: done — inserted ${inserted}, considered ${considered}`)
    return json(200, { ok: true, inserted, considered })
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
