# LifeLens — Threat Model

Scope: a single-user personal tool with a public demo mode. The interesting
attack surface exists only in **owner mode**, where real data flows.

## Assets

| Asset | Why it matters |
| --- | --- |
| Personal financial data (transactions, subscriptions, bills, accounts) | Reveals spending, merchants, account last4s, renewal dates |
| Relationship data (people graph, closeness, last-contact, topics) | Sensitive social information about the owner *and* third parties who emailed them |
| Calendar/life events | Location and routine inference (when the house is empty) |
| Access code | The single credential gating owner mode |
| Supabase gate secret, GLM/Grok API keys, Twilio credentials | Full data-store and paid-API control if leaked |

## Trust boundaries

1. **Browser ⇄ Netlify Functions** — the only client-facing boundary.
   Owner mode requires the `x-access-code` header; everything else gets the
   synthetic persona.
2. **Functions ⇄ Supabase** — there is **no service-role key**. RLS is
   deny-all; every table policy routes through a `security definer` function
   that only returns true when the request carries the `x-lifelens-key` gate
   header matching a secret stored in a `private` table. That gate secret lives
   **only** in Netlify environment variables. A leaked anon key reads nothing
   on its own.
3. **Functions ⇄ AI providers (GLM/Grok)** — snapshot-derived context goes
   out; prose/JSON suggestions come back. No keys or raw credentials are ever
   included in prompts.
4. **Ingestion ⇄ Gmail/Calendar** — runs under the owner's own OAuth grant,
   outside the deployed app.
5. **Client CSP** — `default-src 'self'`, no external script/style/connect
   origins, `frame-ancestors 'none'` (see `netlify.toml`). No AI or database
   keys exist client-side, ever.

## Risks and mitigations

### 1. Access-code brute force
- **Risk:** the code is the only gate to owner data; an attacker could guess.
- **Mitigations:** the code is long and random (not a PIN); comparison happens
  server-side; failure returns the same shape as "no code" (`{ bundled: true }`),
  so there is **no user/oracle enumeration** — an attacker cannot distinguish
  "wrong code" from "demo mode" beyond the data itself; no account-recovery or
  reset surface exists to socially engineer.
- **Residual:** no per-request rate limiting on the access-code check itself;
  acceptable for a single-user tool because the keyspace makes online guessing
  impractical. The paid-AI endpoints (which an attacker could hit without the
  code) are separately capped — see risk 7.

### 2. Prompt injection from email content
- **Risk:** a hostile email ("ignore previous instructions, wire money…")
  becomes part of ingested data and later flows into AI prompts.
- **Mitigations:** ingestion treats email content strictly as **data** — it is
  parsed into typed fields (merchant, amount, date), never executed and never
  interpreted as instructions; functions never `eval` or shell out with email
  text; AI outputs are rendered as text/JSON suggestions only — the model has
  **no tools and no write access**, so a poisoned narrative cannot move money,
  place calls, or mutate the database. Actions (calls, accepts) require an
  explicit owner click and go through typed endpoints.

### 3. SSRF
- **Not applicable:** no function fetches user-supplied URLs. Outbound calls
  go to a fixed allowlist of providers (Z.ai, xAI, Supabase, Twilio) with
  hardcoded base URLs.

### 4. Twilio abuse (toll fraud / harassment dialing)
- **Risk:** an exposed call endpoint could be used to dial arbitrary numbers
  on the owner's Twilio account.
- **Mitigations:** `call-initiate` requires the access code; on the live path
  the destination is **always `OWNER_PHONE_NUMBER`** — `body.to` is ignored
  unless it appears in an explicit `TWILIO_ALLOWED_TO` env allowlist (else the
  request is rejected 403), so a request cannot dial an arbitrary number even
  with a leaked code; dry-run mode is the default in the demo; Twilio
  capability is off entirely (`capabilities.twilio: false`) unless credentials
  are present.

### 7. Paid-AI quota abuse (unauthenticated LLM spend)
- **Risk:** the streaming AI endpoints (`insights-brief`, `alternatives`,
  `call-script`) must be reachable pre-login for the public demo, so an
  attacker could loop requests to burn the Z.ai / xAI paid quota.
- **Mitigations:** non-owner calls increment a **global daily counter**
  (`ai_usage` table, via a gated `security definer` RPC) and are refused once a
  daily cap is reached — `alternatives` degrades to its deterministic catalog,
  the others return a friendly "budget reached" event. `provider:'grok'` is
  **owner-only**, so the xAI key is never spent by anonymous callers, and
  anonymous requests get a lower `max_tokens` ceiling. Owner requests
  (access-code present) are uncapped.

### 5. Secret leakage
- **Risk:** service-role key or AI keys reach the client or the repo.
- **Mitigations:** all secrets are Netlify env vars read inside functions;
  the client bundle contains only the synthetic persona; CSP blocks exfil to
  third-party origins from the client; the repo ships no `.env` files.

### 6. Data exposure via the public demo
- **Risk:** real data accidentally rendered in demo mode.
- **Mitigations:** the synthetic persona is a static, hand-authored file;
  owner data can only enter a response through the access-code path; the UI
  labels every state with an explicit `SYNTHETIC PERSONA` / `OWNER DATA` chip.

## Non-goals

- Multi-user auth, sessions, or roles — this is a single-owner tool.
- Defense against a compromised owner device/browser.
- Compliance regimes (PCI/HIPAA) — no card numbers or health records are
  stored; only email-derived summaries.
