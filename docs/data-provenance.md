# LifeLens — Data Provenance

Two datasets can appear in the UI, and they never mix. The machine-readable
version of this document is `src/data/sources.ts` (`dataProvenance`).

## 1. Synthetic persona — "Jordan Rivera" (public demo)

- **What it is:** a fully fictional persona authored by hand for the demo:
  Jordan Rivera (`jordan.rivera@example.com`, Austin TX), spouse Sam, kids
  Maya and Leo, ~70 transactions across Jan–Jun 2026, 11 subscriptions,
  13 contacts, insights, events, accounts, and actions.
- **No real individuals** are represented. Names, amounts, merchants-as-used,
  dates, and relationships are invented. Emails use the reserved
  `example.com` / `example.net` domains; phone numbers use the reserved
  555 range.
- **Where it lives:** `src/data/persona.ts`, bundled into the client. It is
  in the repository on purpose — there is nothing sensitive in it.
- **Deliberate bait:** the persona is over-instrumented so every screen has
  something to find — three overlapping streaming services, duplicate 2TB
  cloud storage (iCloud+ and Google One), a creeping AT&T bill, a gym
  membership with no visible usage, and two family members past the
  35-day contact threshold.
- **Labeling:** whenever this dataset is shown, the header displays the
  `SYNTHETIC PERSONA` chip.

## 2. Owner mode — the owner's real snapshot (private)

- **Origin:** derived from the **owner's own** Gmail and Google Calendar via
  a consented, owner-initiated ingestion workflow (MCP tools run in a Claude
  session). Receipts, bills, and calendar entries are parsed into the same
  typed `Snapshot` shape the UI renders.
- **Consent:** single-user tool — the owner reads only their own mailbox and
  calendar under their own Google authorization. No one else's inbox is ever
  accessed.
- **Storage:** Supabase (Postgres) with deny-all row-level security. Only
  Netlify Functions holding the service-role key can read it, server-side.
- **Never in the repo:** owner data does not appear in this repository, in
  the client bundle, in build artifacts, or in the public demo. It is served
  only to a request carrying the correct access code, and labeled with the
  `OWNER DATA` chip.

## Third parties in owner data

Owner-mode people records necessarily describe third parties (family,
friends, colleagues) inferred from email metadata. That data stays behind the
access code, is never used to contact anyone automatically, and exists solely
to serve the owner's own relationship nudges.

## Retention & deletion

Owner data lives in a single Supabase project controlled by the owner.
Deleting the project (or truncating its tables) removes everything; there are
no replicas, analytics sinks, or third-party mirrors.
