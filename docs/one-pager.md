# LifeLens — project brief

[Live workspace](https://lifelens-copilot.netlify.app) · [Source overview](../README.md)

Built by **Shanto Mathew**, LifeLens brings spending, subscriptions and relationship signals into a clear personal workspace. The engineering focus is reproducible analysis, transparent provenance and a clean boundary between public samples and private integrations.

## What the public demo proves

The fictional Jordan Rivera snapshot produces nine navigable views, subscription comparisons, a completed rule-based brief, a script and a dry-run action. Same inputs produce the same calculations. Dates use July 1, 2026; sample prices are not vendor quotes. No message, cancellation, call or database mutation occurs from public demo actions.

## Stack and data

React 19, TypeScript and Vite serve the UI. Netlify Functions validate inputs and stream SSE results. Deterministic engines normalize records and calculate recurrence, rollups and relationship cadence.

The owner path implements Supabase PostgREST reads and writes through server-side anon-key credentials plus a custom gate header, behind a shared owner code. The repository includes a typed application model and API adapters; it contains no SQL migrations or SQLite implementation. Deployed schema/RLS policies and private reads/writes were not verified. Optional owner GLM/Grok/Twilio code is not a claim of live integration acceptance.

## Evidence

September 14, 2026: real Chrome visited all nine views and completed representative public workflows; isolated tests covered 62 workflow assertions, desktop/mobile layouts and API completion. The backend release passed 100 tests, build and production dependency audit. Final label changes received targeted checks. See [exact verification scope](VERIFICATION-2026-09-14.md).

## Where to review the engineering

Start with [types](../src/lib/types.ts), [engines](../src/engine), [owner snapshot mapping](../netlify/functions/snapshot.mjs), [validated action writes](../netlify/functions/action.mjs) and the [data model](architecture.md). Private ingestion remains authenticated and manual, with automatic scheduling disabled. No bank feed, multi-user identity or enterprise availability claim is made.
