# Slice 4.HOMEPAGE-V2-1 — Marketing homepage (`Homepage v2`)

**Date:** 2026-05-30
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Public marketing landing page at `/`. No Workflow Builder /
React Agent / planner / provider-metadata / workflow-execution / billing
changes; no general app-help assistant; no global app shell.

## Design source

Claude Design handoff bundle (gzip/tar), downloaded to
`C:/tmp/homepage-v2-design/chainv2builder/`:

- `chainv2builder/README.md` — handoff instructions (read first).
- `chainv2builder/chats/chat1.md` — transcript that traces the marketing
  page back to "designs along the same theme as www.chainreact.app's
  homepage … dense/technical aesthetic, dark by default, Geist + JetBrains
  Mono."
- **Primary file: `chainv2builder/project/Homepage v2.html`** — pulls
  `src/icons.jsx`, `src/home-nav.jsx`, `src/home-effects.jsx`,
  `src/home-v2-sections.jsx`, `src/home-footer.jsx`, `src/home-v2-app.jsx`.

`Homepage v2` is the **editorial / image-heavy** marketing variant (the
v1 file is the dense / technical alternative). The chat transcript shows
the user iterating multiple homepage drafts and landing on this one — big
editorial headline, inline prompt textarea, animated product visual,
"selected work" case-study cards, mission paragraph, expandable feature
rows, final CTA, footer.

## Decisions locked with the user (before implementation)

1. **Route = replace `app/page.tsx`. Signed-in users redirect to
   `/workflows`** server-side. The placeholder ChainReact V2 splash
   (with `signOut` form + unread-notification badge) is gone — the
   unread badge moves to the in-app shell when it ships.
2. **Token strategy = scoped marketing palette.** Added `[data-
   marketing-surface]` (default dark; opt-in light via `data-marketing-
   theme="light"` on the same node) in `app/globals.css` next to the
   existing `[data-builder-surface]` scope. The page never touches app
   HSL tokens, never bleeds into in-app surfaces, never uses
   `--builder-*` tokens.
3. **Fabricated content = OMITTED.**
   - The design's `StatsTestimonial` section (named-customer quote
     "Maria Reyes · Rey's Plumbing & Heating" + dollar/hour claims) is
     **not rendered.**
   - The per-case stat tiles inside `FeaturedCases` ("$24k recovered per
     quarter", "94% delivered without owner involvement", etc.) are
     **not rendered.** The case categories, name, description, and
     animated SVG art ship.
   - The footer newsletter form + "Real humans · helpful support ·
     usually under 2 hours" claim are **not rendered.**
4. **No theme toggle.** Default dark (matches the design + current
   www.chainreact.app). The Anthropic Design "Tweaks" panel is a dev
   tool, not a customer surface; deferred to a future global-shell
   slice if needed.

## Implemented vs deferred (design → V2)

| Design element                              | This slice                                                   |
|---|---|
| HomeNav (sticky + brand mark + nav links)   | ✅ Static sticky glass nav. Drops storm/rain/lightning effects (heavy, distracting; not customer-relevant). Drops scroll-driven backdrop swap (always glass). |
| HeroV2 — big editorial headline (`<h1>`)    | ✅                                                            |
| V2Prompt — inline textarea + typed example  | ✅ Rotating typed-placeholder examples. Submit → `/auth/sign-up`. |
| V2Prompt chips                              | ✅ Cosmetic chips (not clickable filters — not yet wired to any state) |
| V2HeroMedia — animated product moments      | ✅ Rotating Gmail/Slack/Notion/HubSpot illustrative cards (generic copy; no customer-attributed claims) |
| Hero lead paragraph                         | ✅                                                            |
| "Start building" CTA                        | ✅ → `/auth/sign-up`                                          |
| LogoMarquee — infinite scroll of providers  | ✅ Resolved server-side from `@/integrations/_registry`; real `/integrations/<id>.svg` icons with initials fallback. Renders nothing if zero providers (defensive). |
| FeaturedCases — case cards (4 cards)        | ✅ Categories + name + description + animated SVG art         |
| FeaturedCases — per-case stat tiles         | ❌ **Not rendered** — fabricated numbers; backlog-safe (when we have real customer data we can add a `stats?: ReadonlyArray<{v,k}>` prop) |
| Mission editorial paragraph                 | ✅                                                            |
| StatsTestimonial (Maria Reyes block)        | ❌ **Not rendered** — named-customer claims                   |
| FeatureRows — 5 expandable rows             | ✅ Default-open first row; one open at a time; `aria-expanded` + `<button>` semantics |
| FinalCtaV2                                  | ✅ → `/auth/sign-up`                                          |
| HomeFooter — brand + 4 link columns         | ✅ Brand + 3 reduced columns (Product / Get started / Legal). Real V2 routes wired (`/integrations`, `/auth/sign-up`, `/auth/sign-in`); other slugs remain in-page anchors awaiting marketing pages. |
| HomeFooter — newsletter signup              | ❌ **Not rendered** — no backend, would be a fake action      |
| HomeFooter — "Real humans · usually < 2hrs" | ❌ **Not rendered** — unsubstantiated availability claim      |
| HomeFooter — social links                   | ⏸️ **Deferred** — design uses placeholder hrefs; awaiting real handles |
| HomeFooter — giant ChainReact watermark     | ⏸️ **Deferred** — visual flourish; can ship later             |
| BackgroundEffects (orbs + chain collisions) | ⏸️ **Deferred** — heavy GPU work; ship after we have render-budget telemetry |
| ScrollReveal section transitions            | ⏸️ **Deferred** — same reason                                  |
| Tweaks panel (dev-only)                     | ❌ Never ships to customers                                   |
| Theme toggle in nav                         | ⏸️ **Deferred** — global theme is a future app-shell slice    |

## Route / page behavior

- `app/page.tsx` (server) — auth gate via `createClient()` /
  `auth.getUser()`. If `user` exists → `redirect("/workflows")`. Else →
  resolve a curated 12-provider marquee strip through
  `@/integrations/_registry.getProvider()` / `providerIconUrl()`
  (`features/` may not import `integrations/` per
  project-structure-and-module-boundaries.md, so the route owns this
  resolution and emits the route-safe shape `{ id, label, iconUrl }` —
  no raw manifest fields leak through).
- `MarketingHome` (server) — composes the section stack inside a
  `[data-marketing-surface]` root.
- Sub-sections marked `"use client"` where local state is needed:
  `MarketingHero` (typed prompt + rotating media), `MarketingLogoMarquee`
  (per-chip onError fallback to initials), `MarketingFeatureRows`
  (expand/collapse). Everything else is server-renderable.
- All animations defer to a global `prefers-reduced-motion: reduce` rule
  inside `[data-marketing-surface]` (declared in `app/globals.css`).

## Styling

- App HSL tokens / `[data-builder-surface]` / `--builder-*` are
  untouched.
- New `[data-marketing-surface]` scope in `app/globals.css` defines the
  marketing palette tokens (`--mk-bg`, `--mk-panel`, `--mk-text`,
  `--mk-muted`, `--mk-accent`, `--mk-success`, etc.) with a light
  variant gated by `data-marketing-theme="light"` (unused today; kept
  for future toggle).
- Geist + JetBrains Mono are already loaded at root via `next/font` —
  the marketing page reuses `--font-sans` / `--font-mono` rather than
  re-loading from `fonts.googleapis.com`.

## Data sources

- **Auth user** — Supabase `auth.getUser()` (existing pattern).
- **Marquee providers** — `@/integrations/_registry`. Real V2
  registered providers only; unknown ids drop out. Icons resolve to
  `/integrations/<id>.svg` (existing public assets).
- **Nothing else.** No client API call, no Supabase query from the
  client. The page has no `refresh()` and no error/loading states
  because it has no fetches to fail.

## Files (this slice)

**Route shell:**
- `app/page.tsx` (rewritten) — auth gate + redirect + marquee resolution.

**Globals:**
- `app/globals.css` (extended) — added `[data-marketing-surface]` scope
  + `prefers-reduced-motion` rule under it.

**Feature components** (`features/marketing/`):
- `MarketingHome.tsx` — composition shell (server).
- `MarketingHeader.tsx` — sticky glass nav (server).
- `MarketingHero.tsx` — hero + typed prompt + rotating media (client).
- `MarketingLogoMarquee.tsx` — infinite-scroll logo strip (client; uses
  per-chip onError fallback to initials).
- `MarketingFeaturedCases.tsx` — 4 case cards + animated SVG art (server).
- `MarketingMission.tsx` — editorial paragraph (server).
- `MarketingFeatureRows.tsx` — expandable rows (client; useState).
- `MarketingFinalCta.tsx` — closing CTA (server).
- `MarketingFooter.tsx` — reduced 3-column footer (server).
- `marqueeProviders.ts` — pure contract type only; no integration
  imports (preserves the `features/` → `integrations/` boundary).

## Tests

- `tests/unit/app/HomePage.test.tsx` — server route:
  - signed-in → `redirect("/workflows")` (throws NEXT_REDIRECT)
  - signed-out → returns `<MarketingHome>` element
  - unknown provider ids drop out (no broken chips on rename)
  - route DTO is exactly `{ id, label, iconUrl }` per entry (no raw
    manifest field leak — explicit "no leaked config" assertion)
  - `iconUrl` is `null` when registry returns undefined
- `tests/unit/features/marketing/MarketingHome.test.tsx` —
  - composes every section the slice ships
  - `[data-marketing-surface]` scope present
  - exactly one `<h1>`
  - testimonial NOT rendered (explicit "Maria Reyes" / "Rey's Plumbing"
    / "18 hrs" / "$3,200" assertions)
  - per-case stat tiles NOT rendered (explicit "$24k" / "94%" / "5+ hrs"
    / "4.2×" / "leads slipped through" assertions inside FeaturedCases)
  - newsletter form NOT rendered (no `placeholder="your@email.com"`, no
    "Get tips" button inside footer)
  - all CTAs wired to real V2 routes (`/auth/sign-in`, `/auth/sign-up`,
    `/integrations`)
  - LogoMarquee renders 2× providers (doubled row for seamless scroll);
    empty list renders nothing
- `tests/unit/features/marketing/MarketingHero.test.tsx` —
  - hero h1 copy
  - prompt textarea has accessible label
  - submit pushes `/auth/sign-up` (no preserved-prompt promise)
  - "Start building" CTA href
- `tests/unit/features/marketing/MarketingFeatureRows.test.tsx` —
  - 5 rows, first expanded by default
  - clicking another row's header closes the prior one; only one body
    visible at a time
  - re-clicking the open row collapses it
  - accessible heading

## Boundaries

- **No Workflow Builder / React Agent / planner / provider-metadata /
  workflow-execution / billing changes.** Reads provider names + icon
  URLs from the registry; never invokes execution, runs, or billing
  code.
- **No global app shell.** Marketing chrome is page-local; signed-in
  users redirect away.
- **No general app-help assistant.**
- **No fake actions.** Newsletter form, named-customer testimonial,
  per-case stat tiles, "Real humans" availability claim, social
  placeholder hrefs, and Tweaks panel are all omitted/deferred per §
  "Implemented vs deferred."
- **Explicit path staging only.** No `scripts/trash/` files, no
  unrelated working-tree state.

## Gate results

- `npx tsc --noEmit` — ✅ clean
- `npm run lint -- --max-warnings=0` — ✅ clean
- `npm run lint:structure` — ✅ every leaf folder ≤ 50 files
- `npm run lint:migrations` — ✅ migration RLS check passes (this slice
  adds no migrations)
- Targeted marketing tests — ✅ 4 suites / 23 tests
- Workflows page + auth regression sweep — ✅ 9 suites / 52 tests
- Structure boundary tests — ✅ 11 suites / 41 tests
- **Full project sweep — ✅ 14,726 passed / 17 skipped / 0 failed (+25
  vs prior baseline of 14,701 — matches the 23 net new tests added
  here, with the 2-test delta from earlier sweeps).**

## Follow-ups (out of scope for this slice)

- **App-shell slice** owns the in-app top bar / sidebar / theme
  toggle / unread-notification badge.
- **Examples / Pricing / Help / About** marketing pages — when those
  ship, repoint the corresponding footer + nav anchors.
- **Real customer content** — when we have permission, ship a
  testimonial block + per-case stats. The current `FeaturedCases`
  component already has space for a `stats?: ReadonlyArray<{v,k}>`
  prop; we just don't populate it today.
- **Background effects** (orbs, chain collisions, scroll reveal) —
  ship after we have render-budget telemetry. Adding them today is a
  GPU cost without proven user benefit.
- **Reusable patterns from this slice** — the
  page-implementation-guide currently only covers authenticated
  dashboards. A future companion section ("marketing pages") could
  codify the patterns this slice settled (scoped-token surface,
  fabricated-content omission, in-page anchors for unbuilt marketing
  pages). For now those decisions live in this plan + the component
  JSDoc.
