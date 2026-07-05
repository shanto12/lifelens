# LifeLens — Futuristic Redesign (branch: `futuristic-redesign`)

A visual overhaul generated with **Claude Design** (`claude.ai/design`) and ported into the
existing React app. The data layer, engine, Netlify functions, and all screen logic are
unchanged — only the design language changed. `main` keeps the original look.

## Source

The Claude Design handoff bundle lives in
[`docs/claude-design-handoff/`](claude-design-handoff/lifelens-dark-mode-interface/). The
primary artifact is `LifeLens Dashboard.dc.html` — a glassmorphic bento dashboard. Rather
than copying the single-screen prototype wholesale, the **design language** (tokens, glass
card treatment, glows, typography, chart styling) was transplanted into the app's shared CSS
so every screen inherits it at once.

## Design language

- **Fonts** — Space Grotesk (UI) + JetBrains Mono (numbers/data), self-hosted via
  `@fontsource/*` so the strict CSP (`font-src 'self'`) stays intact. No CDN fonts/icons.
- **Surface** — deep `#08080b` canvas with three drifting radial accent glows
  (`.app-atmosphere`) and a subtle top highlight.
- **Cards** — frosted glass (`backdrop-filter: blur(18px)`), thin luminous 1px borders,
  accent glow shadows + an inner top highlight. Accent variants: `.card--emerald`,
  `.card--violet`, `.card--cyan`, `.card--amber`.
- **Accents** — emerald `110,231,179` (money), violet `167,139,250` (AI), cyan
  `103,232,249` (people), amber `251,191,36` (alerts), rose `251,113,133` (watch).
- **Numbers** — big JetBrains Mono with tight tracking and an accent-colored glow.
- **Sidebar** — an 84–96px console icon-rail with per-section accent glow on the active item;
  collapses to a scrollable top bar below 760px.

All existing class names (`.card`, `.chip`, `.btn`, `.table`, `.stat-value`, …) were kept, so
the transplant is a pure token/treatment swap — no screen markup rewrites required beyond the
Dashboard hero cards and the Shell.

## Preview & verify

```bash
npm ci
npm run verify      # lint + 84 tests + build (all green)
npm run preview     # then open the served URL
```

## Deploy (optional)

This branch is not wired to the production site (which serves `main`). To publish it as a
separate Netlify preview, deploy the branch to its own site or enable branch deploys — keep
the production `lifelens-copilot` site on `main`.
