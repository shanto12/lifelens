# LifeLens — Known Limits

Honest edges of the current build. None of these are hidden behind the demo.

## 1. No bank API — email-derived amounts are partial

There is no Plaid/bank aggregation. Money data comes from parsing receipt and
bill emails, which means:

- Purchases with no email receipt are invisible.
- Some emails announce a charge without an amount ("your bill is ready") —
  these become transactions with `amount: null` and are excluded from totals.
- Cash, checks, and in-store card swipes without e-receipts never appear.

Treat totals as a **floor**, not a statement. The subscription detector is
the strongest part of the pipeline because subscriptions are exactly the
thing that reliably emails you every month.

## 2. Private ingestion is manual and unverified in this release

The automatic schedule is disabled. The private `ingest-run` endpoint requires
owner credentials; a request body claiming to be scheduled grants no access.
Gmail OAuth is not wired into this function. No private ingestion or database
mutation was performed in the public portfolio verification.

## 3. Owner access is a shared secret

Owner mode is gated by one long random access code with a constant-time
server-side comparison (implementation is in `netlify/functions/_shared/runtime.mjs`):

- no full identity provider, per-user sessions, account lockout, or rotation UX;
- mitigated by keyspace size and by the response being indistinguishable from
  demo mode on failure (no oracle);
- acceptable for a single-user personal tool, not a pattern to copy for
  multi-user products. See `threat-model.md` §1.

## 4. Other edges

- **Recurrence detection is heuristic.** Confidence scores (0–1) are shown in
  the UI; low-confidence rows (e.g. bank-memo-only gym charges) can be wrong
  in either direction.
- **Closeness scores are interaction proxies.** They measure email/calendar
  frequency, not actual affection; a chatty newsletter-ish contact can
  outrank a beloved friend who prefers phone calls.
- **Public outputs are deterministic sample suggestions.** Owner AI outputs and sample catalog prices can be stale
  or wrong on price; every money-moving step requires a human click, and the
  model has no tools or write access.
- **Twilio calling is owner-only and default dry-run** in the demo; no real
  calls are placed without explicit configuration.
- **Single owner by design.** No sessions, roles, or multi-tenancy.
