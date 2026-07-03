# LifeLens — Architecture

LifeLens is a single-user "life & money copilot": a Vite/React SPA served by
Netlify, a set of Netlify Functions behind `/api/*`, Supabase as the only data
store for real (owner) data, and a hard AI boundary where GLM/Grok are used for
research and narrative only.

## System diagram

```
                          ┌──────────────────────────────┐
   Gmail / Calendar       │   Ingestion workflow          │
   (owner's own data) ───▶│   Gmail + Calendar MCP tools, │
   OAuth'd MCP access     │   run in a Claude session     │
                          │   (or manual script run)      │
                          └───────────────┬───────────────┘
                                          │ parsed rows (upsert,
                                          │ service-role key)
                                          ▼
                                 ┌─────────────────┐
                                 │    Supabase     │  Postgres. RLS: deny-all
                                 │  (owner data)   │  to anon/authenticated —
                                 └────────┬────────┘  only service role reads.
                                          │ server-side reads only
                                          ▼
              ┌───────────────────────────────────────────────────┐
              │        Netlify Functions  (/api/* redirects)      │
              │                                                   │
              │  health · snapshot · action                       │
              │  insights-brief · alternatives · call-script (SSE)│
              │  call-initiate (Twilio, owner-only, dry-run-able) │
              │  ingest-run  (scheduled @daily, netlify.toml)     │
              └────────┬──────────────────┬──────────────┬────────┘
                       │ JSON + SSE       │ AI boundary  │ voice
                       ▼                  ▼              ▼
              ┌─────────────────┐  ┌──────────────┐  ┌────────────┐
              │    React UI     │  │  GLM (Z.ai)  │  │   Twilio   │
              │ Vite SPA, dark  │  │  Grok (xAI)  │  │ owner-only │
              │ enterprise UI   │  │  narrative + │  │  numbers   │
              │ + bundled       │  │  research    │  └────────────┘
              │ synthetic       │  │  ONLY        │
              │ persona         │  └──────────────┘
              └─────────────────┘
```

## The deterministic core

The heavy lifting is deterministic, on purpose:

- **Parsing** — receipts, bills, and calendar entries are turned into typed
  rows (`Transaction`, `Subscription`, `LifeEvent`, `Person`, …) by ordinary
  code during ingestion, not by a model.
- **Recurrence & subscription detection** — cadence, next-renewal projection,
  and detector confidence are computed from charge history.
- **Scoring & analytics** — closeness scores, staleness nudges, category and
  merchant rollups (`SpendAnalytics`) are computed client-side in
  `src/engine` from the snapshot. Same input, same output, every time.

AI is only allowed on the other side of the boundary, for two jobs:

1. **Research** — alternative suggestions (`/api/alternatives`) where a model
   proposes cheaper/better substitutes for a detected subscription.
2. **Narrative** — the daily brief (`/api/insights-brief`) and negotiation
   call scripts (`/api/call-script`), streamed to the UI over SSE
   (`event: start | delta | result | error | done`).

If every AI key is absent, `/api/health` reports `mode: "degraded"` and the
app remains fully browsable — the deterministic screens lose nothing.

## Data flow by mode

| Mode | Source of truth | Path to the UI |
| --- | --- | --- |
| `synthetic` | `src/data/persona.ts` (fictional, in repo) | Bundled with the client; also what `/api/snapshot` implies via `{ bundled: true }` when no access code is presented |
| `owner` | Supabase tables | `/api/snapshot` with `x-access-code` header → service-role read → JSON snapshot |

## Scheduled ingestion

`ingest-run` is declared in `netlify.toml` with `schedule = "@daily"`. Gmail
OAuth is **not** wired into that function yet (see `docs/known-limits.md`), so
the daily run is a placeholder/heartbeat; the real refresh happens when the
owner runs the MCP ingestion workflow from a Claude session, which upserts
into Supabase using the service-role key.

## Key repo locations

- `src/lib/types.ts` — the single domain contract (Snapshot and friends)
- `src/lib/api.ts` — fetch + SSE client (`streamSse`)
- `src/engine/` — deterministic analytics
- `src/screens/` — one component per sidebar destination
- `src/data/persona.ts` — the synthetic persona
- `netlify/functions/` — all server code
- `netlify.toml` — redirects, CSP and security headers, scheduled function
