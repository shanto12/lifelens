// Data provenance — where each snapshot mode's data actually comes from.
// Rendered by the Demo Guide and mirrored in docs/data-provenance.md.

export interface ProvenanceEntry {
  mode: 'synthetic' | 'owner'
  label: string
  origin: string
  storage: string
  consent: string
  notes: string[]
}

export interface DataProvenance {
  lastReviewed: string
  entries: ProvenanceEntry[]
}

export const dataProvenance: DataProvenance = {
  lastReviewed: '2026-07-01',
  entries: [
    {
      mode: 'synthetic',
      label: 'Synthetic persona — "Jordan Rivera"',
      origin:
        'Authored by hand for the public demo. Every person, merchant amount, subscription, event, and insight is fictional; no real individuals or real accounts are represented. Emails use the reserved example.com / example.net domains and phone numbers use the reserved 555 range.',
      storage:
        'Bundled with the client as a TypeScript module (src/data/persona.ts). It ships in the repo on purpose — there is nothing sensitive in it.',
      consent:
        'Not applicable — no real person’s data is involved.',
      notes: [
        'The persona is deliberately over-instrumented (three overlapping streaming services, duplicate 2TB cloud storage, a creeping phone bill) so every screen and optimization path has something to show.',
        'Anyone loading the public demo sees exactly this dataset, marked with the SYNTHETIC PERSONA chip.',
      ],
    },
    {
      mode: 'owner',
      label: 'Owner mode — the owner’s real snapshot',
      origin:
        'Derived from the owner’s own Gmail and Google Calendar via a consented ingestion workflow (MCP-driven, run by the owner). The ingestion parses receipts, bills, and calendar entries into the same Snapshot shape the UI renders.',
      storage:
        'Stored in Supabase (Postgres) with deny-all row-level security; read server-side by Netlify Functions using the service-role key. Owner data never appears in this repository, in the client bundle, or in build artifacts.',
      consent:
        'Single-user tool: the owner ingests only their own mailbox and calendar, under their own Google account authorization. No third party’s inbox is read.',
      notes: [
        'Owner mode unlocks only with a long random access code sent as a request header; without it, /api/snapshot returns { bundled: true } and the client falls back to the synthetic persona.',
        'Email content is treated strictly as data during ingestion — it is parsed, never executed and never used as instructions.',
      ],
    },
  ],
}
