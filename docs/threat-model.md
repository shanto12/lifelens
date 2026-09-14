# LifeLens — threat model and verified boundaries

This is a single-owner application with a public synthetic mode. Public input validation, output rendering and isolation remain relevant even without private data. This document describes source controls and limits; it does not certify production database policies or private integrations.

## Trust boundaries

| Boundary | Implemented control | Limit |
|---|---|---|
| Browser → owner routes | `x-access-code` checked server-side with a timing-safe comparison in `_shared/runtime.mjs` | Shared secret, no multi-user identity, lockout or user-session system |
| Public snapshot | Returns bundled fictional-persona marker before any database read | Owner data paths were not exercised in public acceptance |
| Public SSE routes | Deterministic/sample branch; validated and bounded request bodies | Not proof of every private provider path |
| Functions → Supabase | Server-side anon key plus custom `x-lifelens-key` header | SQL migrations, RLS policies and custom-header enforcement are not present/verified here; no service-role or deny-all-policy claim |
| Manual maintenance | POST requires owner code or configured ingestion secret | Automatic schedule disabled; external mailbox/OAuth ingestion not implemented in this handler |
| Browser output | Text/structured results, same-origin CSP, frame denial, no camera/microphone permissions | CSP is a control, not a comprehensive security guarantee |

## Risks and constraints

- Owner-code guessing and credential theft remain risks. Timing-safe comparison does not replace rate limits, identity lifecycle or device security. An invalid code receives the synthetic snapshot; a valid code unlocks a distinct private response, so no broader no-oracle guarantee is made.
- Public narrative/research endpoints use deterministic code and make no paid provider requests. This release does not rely on an asserted database-backed public AI quota counter. Optional owner provider use has separate costs and was not tested here.
- Supabase policy correctness cannot be inferred from an anon key or a custom header. Validate actual database schema, policies and least privilege before using private data in another deployment.
- Public action routes return dry-run results before writes. Owner action/script/call routes include persistence/integration code; these were not exercised on private records during the portfolio verification.
- Owner call code has configuration and destination restrictions. A public simulation is not a placed call or a test of actual telephone behavior.
- Model text is treated as output data rather than executable code. Generated narrative is not authorization for a payment, call or subscription change.
- API/provider/database secrets are read inside server functions. Keep real `.env` values out of Git. The public bundled persona is fictional; no blanket guarantee about historical or external private environments is implied.

## Out of scope

Production database-policy inspection, backup/restore, private data ingestion, live provider/phone acceptance, multi-user tenancy, compromised devices and regulatory certification. See [data provenance](data-provenance.md), [architecture](architecture.md) and [public release verification](VERIFICATION-2026-09-14.md).
