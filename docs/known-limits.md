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

## 2. Gmail OAuth is not wired into the scheduled function

`ingest-run` is scheduled `@daily` in `netlify.toml`, but it does not hold a
Gmail OAuth grant. Today the daily refresh actually happens one of two ways:

- the owner runs the MCP ingestion workflow from a Claude session, or
- a manual script run with the owner's credentials.

Until OAuth is embedded in the function, the schedule is a heartbeat, and
owner-mode data is only as fresh as the last manual/assisted run.

## 3. Access code is a simple string compare

Owner mode is gated by one long random access code compared server-side with
a plain string comparison:

- no rate limiting, no lockout, no constant-time comparison, no rotation UX;
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
- **AI outputs are suggestions.** Alternatives and call scripts can be stale
  or wrong on price; every money-moving step requires a human click, and the
  model has no tools or write access.
- **Twilio calling is owner-only and default dry-run** in the demo; no real
  calls are placed without explicit configuration.
- **Single owner by design.** No sessions, roles, or multi-tenancy.
