# LifeLens — Personal Life & Money Copilot

LifeLens turns one person's Gmail + Google Calendar exhaust into a live
operating picture of their life: spending, subscriptions, bills,
relationships, health signals, and the next best action. Public visitors see
a fully synthetic persona; the owner unlocks their real snapshot with an
access code.

![LifeLens dashboard](docs/screenshot-dashboard.png)
*Screenshot placeholder — capture the Dashboard with the SYNTHETIC PERSONA
chip visible and drop it at `docs/screenshot-dashboard.png`.*

## The philosophy: the heavy lifting is deterministic

Most "AI life assistant" demos put a model in the middle of everything.
LifeLens deliberately does not:

- **The engine is code.** Parsing receipts/bills/events into typed rows,
  detecting subscription recurrence and projecting renewals, scoring
  relationship closeness and staleness, rolling up spend by category, month,
  and merchant — all deterministic, reproducible, and unit-testable
  (`src/engine`, `src/lib/types.ts`).
- **AI does exactly two jobs:** *research* (suggest cheaper/better
  alternatives for a detected subscription) and *narrative* (daily brief,
  negotiation call scripts), streamed to the UI over SSE.
- **Degrades gracefully.** Remove every AI key and `/api/health` reports
  `degraded` — but every deterministic screen keeps working, because the
  facts never depended on a model.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + Vite, TypeScript strict, dark enterprise design, `lucide-react` icons only |
| API | Netlify Functions behind `/api/*` redirects; SSE for AI streams |
| Data (owner mode) | Supabase Postgres, deny-all RLS, service-role reads server-side only |
| Data (demo mode) | Bundled synthetic persona (`src/data/persona.ts`) |
| AI | GLM (Z.ai) primary, Grok (xAI) alternate — behind one boundary |
| Voice | Twilio (owner-only numbers, dry-run by default) |
| Ingestion | Consented Gmail/Calendar MCP workflow run by the owner |

## Local development

```bash
npm i
netlify dev        # serves the SPA + functions with /api/* redirects
```

Plain `vite` (`npm run dev`) also works: API calls fail soft and the app
falls back to the bundled synthetic persona.

Quality gates:

```bash
npm run verify     # lint + tests + build
npm test           # vitest (jsdom, Testing Library)
```

## Environment variables

All secrets live in Netlify env vars and are read **only** inside functions —
nothing is exposed to the client. The authoritative names are in
`netlify/functions/`; `/api/health` reports which capabilities are live.

| Variable | Enables | Notes |
| --- | --- | --- |
| `LIFELENS_ACCESS_CODE` | Owner mode | Long random string; compared server-side |
| `GLM_API_KEY` | Briefs, alternatives, call scripts | Z.ai GLM (primary provider) |
| `GLM_BASE_URL` | Z.ai endpoint override | Optional |
| `GLM_MODEL` | Model id | Optional; defaults to `glm-5.2` |
| `XAI_API_KEY` | Grok alternate provider | Optional |
| `SUPABASE_URL` | Owner snapshot storage | |
| `SUPABASE_ANON_KEY` | PostgREST apikey (inert alone — RLS denies all) | Public by design |
| `SUPABASE_API_SECRET` | Gate secret sent as `x-lifelens-key`; RLS opens only for it | Never shipped client-side |
| `TWILIO_ACCOUNT_SID` | Outbound calls | Owner-only destinations |
| `TWILIO_AUTH_TOKEN` | Outbound calls | |
| `TWILIO_FROM_NUMBER` | Caller ID | |
| `OWNER_PHONE_NUMBER` | Allowed call destination | Dry-run default in demo |

With **zero** env vars set, the site is still fully demoable: synthetic
persona, `degraded` health, AI panels explain themselves instead of erroring.

## Deploy notes

- Netlify site; `netlify.toml` carries build config, `/api/*` redirects, the
  strict CSP + security headers, and the `ingest-run` schedule (`@daily`).
- Gmail OAuth is **not** wired into the scheduled function yet — owner-mode
  freshness comes from running the MCP ingestion workflow (Claude session or
  manual script). See `docs/known-limits.md`.
- Supabase: single project, RLS deny-all; only functions holding the
  service-role key can read.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — system diagram & AI boundary
- [`docs/threat-model.md`](docs/threat-model.md) — assets, boundaries, risks
- [`docs/data-provenance.md`](docs/data-provenance.md) — what data is real, and where it lives
- [`docs/known-limits.md`](docs/known-limits.md) — honest edges
- [`docs/demo-script.md`](docs/demo-script.md) — 90s / 5min / 15min walkthroughs
- [`docs/one-pager.md`](docs/one-pager.md) — the summary

---

**Disclaimer:** Independent personal tool; not affiliated with any employer.
The public demo uses a synthetic persona — no real individuals or accounts
are represented.
