# Help Center — Foundation (HELP-CENTER-1)

**Status:** Implemented locally (not pushed). Public routes `/help` + `/help/[slug]`.

## What shipped

The first production-ready Help Center: a public, searchable support surface for
nontechnical customers, in the existing marketing visual system (dark
`[data-marketing-surface]`, `--mk-*` tokens, MarketingHeader/Footer chrome —
matching the locked homepage/security-page decision; no separate light theme was
introduced because the marketing surface is deliberately dark-only today).

- **`/help`** — hero (`How can we help?`) + functional search over the local
  article catalog (title / summary / keywords / category label, ranked, live as
  you type, ArrowUp/Down + Enter + Escape keyboard support, useful no-results
  state with a real support mailto), a five-step **Start here** path mirroring
  the in-product onboarding checklist, six **Browse by topic** category cards
  with catalog-derived article counts and an in-place category article browser,
  a curated **Popular articles** grid (editorial list — deliberately NO fake
  view counts or popularity analytics), **Integration help** cards derived from
  the provider registry, and a restrained support callout to the real staffed
  `support@chainreact.app` mailbox.
- **`/help/[slug]`** — article page with breadcrumbs, category label, one h1,
  summary lede, typed content blocks (paragraphs, headings, ordered steps,
  lists, note/warning callouts), related articles, back link, and a compact
  support mailto. Unknown slugs use the framework's normal `notFound()`.
  Deliberately NO "Was this helpful?" controls — no backend exists to receive
  them in this batch.
- **23 articles** across 6 categories, written in the product's real
  vocabulary (workflow / trigger / action / step / run / app / Test Workflow /
  Run Manually / Activate / task usage / AI credits), fact-checked against the
  actual UI copy and code before writing (onboarding checklist, builder
  lifecycle controls, run statuses, humanized failed-run titles, billing panel
  capabilities incl. the real in-app cancel path, role copy, member caps,
  provider manifests incl. Fleetio's credential-paste guide and Motive's
  one-company-per-connection scoping).
- **Navigation:** "Help Center" → `/help` added to the static marketing footer
  (`MarketingFooter.tsx`) and its homepage parity twin (`MarketingEnding.tsx`)
  in the "Get started" column, and to the authenticated user menu
  (`components/app-shell/UserMenu.tsx`) alongside the existing Contact support
  entry. Primary product nav untouched.

## Content architecture

```
features/marketing/help/
  helpTypes.ts          — HelpCategoryId, HelpArticleBlock, HelpArticle,
                          HelpCategoryDef, HelpProviderEntry + linking contract docs
  helpCategories.ts     — the six category definitions (ordered)
  articles/             — one file per category (+ providers.ts)
  helpCatalog.ts        — concatenated catalog + pure accessors:
                          getHelpArticle, articlesForCategory, helpArticleCount,
                          relatedArticlesFor, helpArticleForProvider,
                          searchHelpArticles, QUICK_START_SLUGS, POPULAR_SLUGS,
                          HELP_PROVIDER_IDS
  HelpSearch.tsx        — client combobox island (local search, keyboard nav)
  HelpCategoryBrowser.tsx — client category grid + article panel
  HelpSupportCallout.tsx  — renders NOTHING when no support email is configured
  HelpProviderIcon.tsx  — provider logo w/ initials fallback (Apps-page idiom)
features/marketing/HelpCenterPage.tsx  — server page composing the islands
features/marketing/HelpArticlePage.tsx — server article page + block renderer
app/help/page.tsx          — thin route shell (metadata; no auth gate)
app/help/[slug]/page.tsx   — generateStaticParams/Metadata + notFound()
app/help/_providers.ts     — buildHelpProviderEntries (server-side)
```

Everything in `features/marketing/help/` is pure data + presentational
components — no services, repositories, or DB access anywhere in the Help
Center (client-server boundary respected; verified by the existing structure
tests plus lint).

## How to add an article

1. Add a `HelpArticle` object to the right `features/marketing/help/articles/`
   file (or a new per-category file concatenated in `helpCatalog.ts`).
2. Pick a **permanent** kebab-case slug — slugs are never renamed or reused.
3. Optionally set `relatedArticleSlugs` (must resolve — tests enforce it) and
   `providerId` (must be a registered provider id — tests enforce it).
4. Done — search, category counts, category browsing, related links, and
   `generateStaticParams` all derive from the catalog. No page edits needed.

## Stable article URL convention (contextual-help readiness)

- Canonical article URL: **`/help/<slug>`**. Slugs are lowercase kebab-case and
  permanent once shipped. Future surfaces (workflow config fields, integration
  connection errors, failed-run error cards, billing-limit messages, onboarding
  checklist items) deep-link with these URLs.
- Provider-scoped lookup: `helpArticleForProvider(providerId)` returns the
  dedicated article for a registered provider (e.g. a connection-error card can
  resolve "the help article for gmail" without hardcoding a slug).
- Category ids (`getting-started`, `workflows`, `connecting-apps`,
  `troubleshooting`, `accounts-teams`, `billing-usage`) are likewise stable.
- **HELP-CENTER-CONTEXTUAL-1:** product surfaces now resolve destinations
  through `features/marketing/help/contextualHelp.ts` (`resolveHelpLink`) —
  the single context → article mapping. See
  [`help-center-contextual-1.md`](./help-center-contextual-1.md).

## Where provider metadata comes from

Single source of truth, no duplication: provider ids/display names from
`integrations/_registry.ts` manifests, icons from `providerIconUrl(id)`
(`/integrations/<id>.svg` + initials fallback), one-line descriptions from
`lib/apps/providerCategories.ts`. `app/help/_providers.ts` builds entries
server-side for the curated list (`motive`, `fleetio`, `gmail`,
`microsoft-outlook`, `slack`, `quickbooks` — all launch-visible), applying the
same `isEnabled && !isExperimental` visibility rule as the Apps catalog, and
drops any id without a registered manifest or a dedicated article. The client
bundle never imports the registry.

## Tests

- `tests/unit/features/marketing/help/helpCatalog.test.ts` — slug/related/
  curated-list integrity, provider ids resolve in the REAL registry, search
  behavior (title/keyword/summary/category, ranking, case-insensitivity,
  empty states, result cap).
- `tests/unit/features/marketing/HelpCenterPage.test.tsx` — sections render,
  search finds/empties/keyboard-navigates, category selection shows the right
  articles, provider entries from props + section hidden when empty, support
  callout is a real mailto, `HelpSupportCallout` renders nothing when
  unconfigured, footer link, single h1, accessible names.
- `tests/unit/features/marketing/HelpArticlePage.test.tsx` — breadcrumbs,
  blocks, related links, back link, no feedback controls.
- `tests/unit/app/HelpRoutes.test.tsx` — known slug renders, unknown slug →
  `notFound()`, static params cover the catalog, metadata, provider-entry
  derivation + visibility gating.
- `tests/unit/app/AppShellRouteScope.test.tsx` — `/help` pinned OUTSIDE the
  authenticated AppShell. `tests/unit/components/app-shell/UserMenu.test.tsx`
  — Help Center menu link. `tests/smoke/public.smoke.spec.ts` — `/help` +
  one article (passes against a deploy that includes this slice).

## Intentionally deferred

- Contextual deep links FROM product surfaces into `/help/<slug>` (the URL
  contract above is the enabler; wiring is follow-up work).
- Per-provider articles beyond the curated six; article search on the article
  page itself; category landing routes (`/help/category/...`).
- "Was this helpful?" feedback (needs a backend), any analytics/popularity
  ranking, AI answers, CMS/DB authoring, ticketing — all out of scope per the
  brief.
- A light-mode marketing variant (would be a marketing-surface-wide decision,
  not a Help-Center one).
