# LifeLens — One-Pager

**Personal life & money copilot.** LifeLens turns the exhaust already sitting
in one person's Gmail and Google Calendar into a live operating picture of
their life: spending, subscriptions, bills, relationships, health signals,
and the next best action — with AI kept on a short leash.

---

## The problem

Life admin is a distributed, unpaid part-time job. Subscriptions creep,
bills drift upward, cloud storage gets paid for twice, and the people who
matter go uncalled for six weeks — not from neglect, but because nothing is
watching. The data to catch all of it already exists: every subscription
emails a receipt, every bill announces itself, every relationship leaves a
thread trail.

## The approach: deterministic engine, narrow AI

| Layer | Who does it | Examples |
| --- | --- | --- |
| Parsing | Code | Receipts/bills/events → typed rows |
| Recurrence & detection | Code | Subscription cadence, renewal projection, confidence |
| Scoring & analytics | Code | Closeness scores, staleness nudges, spend rollups |
| Research | AI (GLM/Grok) | Cheaper/better alternatives for a detected subscription |
| Narrative | AI (GLM/Grok) | Daily brief, negotiation call scripts (streamed via SSE) |

The engine's numbers are reproducible and testable. If every AI key is
removed, the app degrades gracefully and every deterministic screen still
works.

## What it finds (synthetic demo persona)

- **$731/yr** across three overlapping streaming services → rotation saves ~$431
- **$120/yr** duplicate 2TB storage (iCloud+ *and* Google One)
- **AT&T bill creep** $89 → $95 → AI-drafted retention script + Twilio dry-run call
- **$300/yr** gym membership with zero visible usage since March
- **Two family members** past the 35-day contact threshold → nudge with a call slot

## Architecture in one breath

React 19 + Vite SPA (dark, enterprise, strict TypeScript) → Netlify Functions
(`/api/*`, SSE streaming) → Supabase (deny-all RLS, service-role reads only)
← consented MCP ingestion of the owner's own Gmail/Calendar. Twilio for
owner-only calls. Strict CSP, no client-side keys.

## Trust posture

- Public demo is a **hand-authored synthetic persona** — no real individuals.
- Owner mode sits behind a long random access code; failure is
  indistinguishable from demo mode (no oracle).
- Email content is treated as data, never instructions; the model has no
  tools and no write access; every action requires a human click.
- Limits stated plainly: no bank API (email-derived totals are a floor),
  OAuth not yet in the scheduled ingest, simple string-compare gate.

## Status

Shipped as a personal tool + portfolio demo. Roadmap: OAuth inside the
scheduled `ingest-run`, function-level rate limiting, optional bank
aggregation as a second source.

---

*Independent personal project. The public demo contains only synthetic data.*
