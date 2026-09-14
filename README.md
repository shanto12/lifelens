# LifeLens — a clearer picture of everyday life

[Open the public demo](https://lifelens-copilot.netlify.app) · [Source](https://github.com/shanto12/lifelens)

LifeLens combines deterministic spending analysis, subscription projections,
relationship signals, and explainable next steps in a personal intelligence workspace.
The public experience uses **Jordan Rivera, a fictional persona with a fixed July 1,
2026 reference date**. Relative dates refer to that sample, not today's calendar.
No private owner records are included in the demo.

## Try it in 90 seconds

1. **Home → Money:** inspect the sample totals, category filters and transaction evidence.
2. **Subscriptions:** select a merchant, compare sample options and preview a draft action.
3. **People / Health:** explore relationship cadence and nonclinical lifestyle observations.
4. **Insights:** generate a reproducible brief from the visible aggregate inputs.
5. **Actions:** enter a synthetic target and goal, generate a script, then preview the call workflow.
6. **Connect / Guide:** see which integrations need setup and how the demo works.

Public generation uses deterministic rules and sample catalog entries, with provenance
shown in the interface. It makes no paid model calls. Comparisons are illustrations,
not current vendor quotes. Drafts and dry runs do not send messages, place calls,
cancel subscriptions, or mutate owner records. Demo actions are not persisted to the
owner audit trail. Reloading restores the original fixture.

## Implementation

| Layer | Implementation |
| --- | --- |
| Interface | React 19, TypeScript, Vite, self-hosted fonts and Lucide icons |
| Analysis | Typed receipt normalization, categorization, recurrence, spend rollups, relationship cadence and savings calculations in `src/engine` |
| Public API | Netlify Functions, validated inputs, deterministic SSE results |
| Owner narrative | Configured GLM / Grok integrations; private live execution is separate from public demo verification |
| Owner storage | Server-side Supabase access, gated by owner access code; public clients receive only a bundled-persona marker |
| Connections | Setup catalog; configured credentials do not establish a working OAuth connection |
| Ingestion | Authenticated manual owner runner; automatic private-data schedule disabled |
| Security | Same-origin CSP, no camera/microphone permissions, frame denial, HSTS, no-store API data |

Owner integrations remain optional deployment capabilities. `/api/health` reports
configuration only; it does not prove provider availability, OAuth ingestion, or task
completion. No owner snapshot, authenticated personal-data workflow, live outbound
call, or private database mutation was exercised for this portfolio release.

## Local development

```bash
npm ci
netlify dev
```

`npm run dev` serves only the Vite interface, which falls back to the bundled persona
when functions are unavailable. `netlify dev` serves the API workflows too.

```bash
npm run verify:release   # lint, tests, production build, production dependency audit
```

The suite covers deterministic engines, owner-session boundaries, public endpoint
validation and no-external-call guarantees. Browser verification must target the
published URL as a separate release gate.

## Configuration and privacy

Secrets belong in Netlify environment variables, never client bundles or Git.
See `.env.example` for names and `netlify/functions/` for the implementation.
Owner access uses a shared code, not a multi-user identity system. The public demo
requires no login. Do not enter real personal data into public demo fields.

This is an independent portfolio application. Lifestyle observations are sample
signals, not medical assessment; spending examples are not financial advice.
