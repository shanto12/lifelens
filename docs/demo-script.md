# LifeLens — reviewer walkthrough

[Open the public demo](https://lifelens-copilot.netlify.app). No login or provider key is needed for the public sample.

## 90 seconds

1. **Home:** point out the fictional Jordan Rivera persona and July 1, 2026 snapshot date. Totals describe this dataset, not a bank account.
2. **Subs:** expand AT&T and choose **Compare sample alternatives**. Wait for the completed deterministic catalog; explain that prices are illustrative.
3. **Insights:** choose **Generate snapshot brief**. Show the result's rule-based provenance and the four completed sections.
4. **Actions:** supply a synthetic service target and goal, generate a script, then **Simulate call**. Show the dry-run result; no phone call or owner write occurred.

## Five-minute engineering review

- Open Money, People and Health. Explain the typed records and deterministic calculations rather than claiming real-time private ingestion.
- Open Sources and Guide. Integrations are setup/gated entries, not proof that OAuth or a database is connected.
- Read [`src/lib/types.ts`](../src/lib/types.ts) and [`src/engine`](../src/engine).
- Show [`snapshot.mjs`](../netlify/functions/snapshot.mjs): visitors receive a bundled-persona marker; authorized owner reads use the Supabase REST adapter.
- Show [`action.mjs`](../netlify/functions/action.mjs): public dry-run returns before any database write. Owner persistence is implemented but untested against the private database in this release.
- Explain the [data-model evidence](architecture.md): the repository has TypeScript contracts and table access paths, not SQL DDL/migrations or verified deployed RLS.

## Questions to answer precisely

**Does this use real AI?** Public results are deterministic. Optional owner GLM/Grok narrative and research paths are implemented separately; this public verification did not invoke them.

**Does it read Gmail or my bank?** This public demo uses a checked-in fictional persona. No bank integration exists. The manual private maintenance route reads stored records; Gmail/Calendar OAuth ingestion is not implemented inside that route.

**What is the database?** The owner adapter targets Supabase PostgREST using an anon key plus a custom gate header. Private schema, policies and successful writes are unverified here; no service-role/deny-all-RLS claim is made.

**How was it checked?** Real-profile UI and actual public workflow completion, plus isolated browser layouts/API tests and local regression checks. See [the dated evidence](VERIFICATION-2026-09-14.md).
