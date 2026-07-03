# LifeLens — Demo Script

Three cuts: 90 seconds, 5 minutes, 15 minutes. All run against the synthetic
persona ("Jordan Rivera") — no keys required; AI moments degrade gracefully
if GLM/Grok are not configured.

---

## 90-second cut (elevator)

1. **Dashboard** (15s) — "This is LifeLens: a personal life & money copilot
   built from email and calendar exhaust. Everything you see is a synthetic
   persona — note the chip in the header."
2. **Subscriptions** (30s) — "The detector found 11 subscriptions from
   receipt emails alone. Three overlapping streaming services, and iCloud+
   plus Google One both billing for the same 2TB. That's ~$550/yr of pure
   overlap, found deterministically — no AI involved yet."
3. **Insights** (25s) — "The engine turns that into ranked insights with
   dollar impacts — streaming rotation, storage consolidation, an AT&T bill
   that crept from $89 to $95."
4. **Actions & Calls** (20s) — "And it closes the loop: an AI-drafted
   retention call script, and a Twilio dry-run of the actual call. Human
   clicks the button; the machine does the homework."

**Closer:** "Deterministic engine for the facts, AI only for research and
narrative. Real mode runs on my own Gmail behind an access code."

---

## 5-minute cut (walkthrough)

1. **Framing** (30s) — the philosophy: parsing, recurrence detection, and
   scoring are deterministic code; AI is confined to research (alternatives)
   and narrative (briefs, call scripts). Point at the SYNTHETIC PERSONA chip;
   mention owner mode behind an access code.
2. **Dashboard** (45s) — snapshot date, headline stats, the "life" side
   (people nudges) next to the "money" side (renewals, tracked spend).
3. **Money Map** (60s) — six months of transactions by category and month;
   call out refunds and `null`-amount emails ("bill is ready") as honest
   gaps — this is email-derived, not a bank feed.
4. **Subscriptions** (60s) — sort by annual cost. Tesla FSD at $1,188/yr,
   AT&T creeping upward, Planet Fitness at 0.62 confidence because there are
   only bank memo lines, no receipts. Then the optimization bait: 3 streamers,
   duplicate 2TB storage.
5. **People & Family** (45s) — closeness scores from interaction frequency;
   two family members past the 35-day threshold fire nudges (Mom: 38 days,
   Dad: 43). "The same engine that watches renewals watches relationships."
6. **Insights → Actions** (60s) — the ranked list with impacts; open the
   AT&T retention script (AI-drafted, streamed over SSE), show the dry-run
   call record and the accepted Mint Mobile alternative ($420/yr).
7. **Close** (10s) — stack: React/Vite SPA, Netlify Functions, Supabase,
   GLM for narrative, Twilio for calls. Demo Guide screen has the env
   cheatsheet.

---

## 15-minute cut (deep dive)

**0:00–1:30 — Framing.** The problem: life admin is a part-time job and the
data to automate it already sits in your inbox. The bet: deterministic
engine for facts, AI for judgment-flavored work only. Show the architecture
diagram (`docs/architecture.md`).

**1:30–4:00 — Data story.** Demo Guide → provenance: synthetic persona is
hand-authored and in-repo; owner mode is the owner's own Gmail/Calendar via
consented MCP ingestion into Supabase, deny-all RLS, service-role reads only.
Show the SYNTHETIC/OWNER chip toggle behavior (lock/unlock with access code).

**4:00–7:00 — Money screens.** Money Map (category/month rollups, refunds,
null amounts as honest gaps) → Subscriptions (confidence scores, evidence
strings, renewal projections). Emphasize: every number here is reproducible
from the same input — no model in the loop.

**7:00–9:00 — Life screens.** People & Family (closeness scoring, staleness
nudges, third-party sensitivity) → Health (grocery-derived diet signals,
low-sugar streak, gym-usage contradiction: paying $24.99/mo with zero
check-in emails since March).

**9:00–12:00 — The AI boundary, live.** Insights brief (SSE streaming: watch
`start → delta → result` frames land) → Alternatives for AT&T (Mint Mobile,
$420/yr, quality caveat about coverage) → Call script generation → Twilio
dry-run. If keys are absent, show `/api/health` reporting `degraded` and note
the deterministic screens lose nothing.

**12:00–14:00 — Engineering.** TypeScript-strict end to end with one domain
contract (`src/lib/types.ts`); tests stub `fetch` and drive the real App;
CSP with no external origins; threat model (access-code brute force, prompt
injection treated as data, Twilio owner-only). Known limits stated plainly
(`docs/known-limits.md`): no bank API, OAuth not in the scheduled function,
simple string compare.

**14:00–15:00 — Close.** What's next (OAuth in `ingest-run`, rate limiting,
bank aggregation as an optional source) and the disclaimer: independent
personal tool; the public demo is 100% synthetic.

---

### Q&A crib notes

- **"Why not just use a model for parsing?"** Determinism: same email, same
  row, testable, free, and no hallucinated amounts in money math.
- **"What if someone brute-forces the code?"** Long random code, no oracle
  (failure looks like demo mode), single-user blast radius; limits documented.
- **"Prompt injection?"** Email text is parsed as data, never executed; the
  model has no tools/write access; actions require human clicks.
- **"Why GLM?"** Cost/perf for narrative workloads; the provider sits behind
  one boundary and is swappable (Grok is already wired as an alternate).
