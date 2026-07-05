# LifeLens — UX & Integrations Roadmap

Ideas for making LifeLens prettier, faster, and genuinely more helpful — plus the
plan for letting the system request access to more of a user's world. Ordered by
value-to-effort. Items marked ✅ are shipped; ▶ is the current focus.

## Connections layer (▶ shipped in preview)

The app can now grow its own reach through a **Connections** screen backed by
**Composio** — a managed, per-account OAuth fabric (1,000+ toolkits). LifeLens never
sees passwords; OAuth tokens live in Composio's vault; connecting is owner-only.

- ✅ Connections screen with a curated catalog (Gmail, Calendar, GitHub, Slack,
  Notion, Drive, Spotify, Linear, + planned Plaid/Amazon), per-item "what this
  unlocks", and live `/api/connectors` (graceful preview mode without a key).
- ✅ `composio` capability in `/api/health`; owner-gated connect flow.
- **Next:** wire connected toolkits into the daily ingest so new sources feed the
  engine automatically; add a per-source "last synced / records added" line.

### Why Composio (vs. alternatives)

| Platform | Best for | Notes |
| --- | --- | --- |
| **Composio** (chosen) | Agent-native tool-calling + managed OAuth | 1,000+ toolkits, Claude Agent SDK support, free 20k tool-calls/mo, $29 for 200k. Lowest barrier. |
| Nango | Max control, open-source, self-host | More engineering; best if we need to own the OAuth layer. |
| Paragon | Low-code embedded iPaaS | Good if we wanted a visual builder. |
| Merge | Unified HRIS/ATS/accounting data models | Overkill for a personal-finance tool. |

**Banking is special:** Plaid (or Teller/MX) is the right path for real cleared
transactions — it fills the ~40% of email-derived charges with no amount. Treat it
as a first-class direct integration, not just a Composio toolkit.

## Highest-value "be helpful" features

1. **Plaid bank connection** → real transactions & balances. Biggest single
   accuracy jump; turns estimates into ground truth.
2. **Proactive delivery** → the daily brief + renewal/anomaly alerts pushed to
   SMS (Twilio, already wired), email (SendGrid), or Slack — not another inbox to check.
3. **Anomaly & price-hike detection** → "your fiber bill jumped $24" / "a charge
   you've never seen." Deterministic z-score over per-merchant history; the highest-signal
   surprise-saver.
4. **One-click actions from insights** → "cancel before Jul 14" drafts a
   cancellation email or a Linear/Todoist task; accepted alternatives generate the switch.
5. **Goals & streaks** → savings goals, no-spend-day streaks, "subscription budget"
   with progress rings (the Claude Design mock already sketched these).

## UX quick wins (small, high polish)

- **⌘K command palette / "Ask LifeLens anything"** — natural-language query over the
  snapshot (the redesign header already reserves the slot). Route to a GLM function
  that answers with the user's own numbers.
- **Privacy blur toggle** — a one-tap "hide amounts" eye (in the design mock) for
  screen-sharing; blur all currency values.
- **Trend sparklines on the hero stats** — tiny 12-week lines under each big number.
- **Empty-first-run onboarding** — a "connect your accounts" wizard that lands new
  users straight on the Connections screen.
- **Shareable read-only report** — a signed, expiring link to a snapshot summary.
- **Merchant logos & smarter categories** — enrich transactions for scannability.

## Performance & platform

- **PWA / installable + offline snapshot** — it's already a fast SPA; add a manifest
  + service worker for a home-screen app.
- **Incremental snapshot fetch** — the owner snapshot is one payload today; paginate
  transactions for very large histories.
- **Route-level suspense** for the heaviest screens if the bundle grows past ~120KB gz.

## Intelligence

- **Multi-model routing** — GLM for bulk/cheap narrative, a frontier model for the
  monthly deep review; Grok already available as a second provider.
- **Retrieval over history** — index past insights/transactions so "what did I spend
  on coffee last spring?" is answerable.
- **Weekly "what changed" digest** — diff this week vs. last across spend, subs, people.

---

*This is a living document. The Connections layer is built to make most of the
"highest-value" items above a matter of flipping on a toolkit rather than new plumbing.*
