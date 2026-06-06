# Slice 4.APPS-PAGE-1 — Apps dashboard (from `Connections.html`)

**Date:** 2026-05-30
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Authenticated `/apps` dashboard built from the Anthropic Design
`Connections.html` reference. No Workflow Builder / React Agent / planner /
provider-metadata / workflow-execution / billing changes; no global app
shell; no fake unsupported actions.

## Design source

Claude Design handoff bundle (gzip/tar) downloaded to
`C:/tmp/connections-design/chainv2builder/`:

- `chainv2builder/README.md` — handoff instructions.
- `chainv2builder/project/Connections.html` — primary file.
- `chainv2builder/project/src/connections-app.jsx` (200 lines) — top-level
  shell, sidebar/topbar, stat cards, tabs, search, sort, category nav,
  provider list.
- `chainv2builder/project/src/connections-page.jsx` (437 lines) — every
  reusable piece: `ProviderIcon`, `ConnStatCards`, `ConnTabs`,
  `CategoryNav`, **`ProviderCard`** (the expandable row with accounts +
  per-account workflow pills), `ConnPageHeading`.
- `chainv2builder/project/src/connections-data.jsx` (181 lines) — design
  fixture data: 20 connected providers with accounts + workflow names,
  14 available providers, 12 categories.

## Naming decision (locked with the user)

The design file is named `Connections.html`. In V2 the user-facing product
surface is **Apps**. The naming rule applies through this slice:

- Route: `/apps` (new). Legacy `/integrations` redirects.
- Page title: **Apps**. Subtitle, headings, copy: "apps", "available
  apps", "connected apps".
- Component names: `AppsDashboard`, `AppsStatCards`, `AppsToolbar`,
  `AppsCategoryNav`, `AppCard`, `AppStatusPill`, `AppsEmptyState`.
- The verb **"Connect"** is fine (action). Existing impl files
  `ConnectButton` and `ConnectionStatusBanner` keep their names — they
  describe actions, not the page noun.
- The API namespace stays `/api/integrations/*` since it matches the DB
  table + provider folder names; only the product page noun changes.

## Decisions locked with the user (before implementation)

1. **Route = `/apps`.** Legacy `/integrations/page.tsx` is a server
   redirect that preserves query parameters (so OAuth-callback toast
   links keep working). OAuth callback redirect target moves from `/`
   to `/apps`. Workflow-failure notification CTA (`action='reconnect'`)
   moves from `/integrations` to `/apps`. Marketing footer "Apps"
   link repoints to `/apps`. Token-ingest "Return to" link repoints
   to `/apps`.
2. **DTO = `AppCatalogItem`** (`contracts/apps.ts`). Only the
   documented fields leave the server. Token columns, providerAccountId,
   accountMetadata, scopes, expiry all NEVER appear in the projection.
   Pinned by `tests/unit/app/apps/_shared.test.ts`.
3. **Categories = route-layer truthful map** (`lib/apps/providerCategories.ts`).
   V2 manifests don't carry a UI category today; the route-side map is
   small (25 explicit entries + "Other" fallback) and lives outside the
   manifest schema. Out-of-scope to mutate the manifest contract.
4. **Connect = real OAuth flow only.** Reuses the existing
   `ConnectButton` (`features/integrations/ConnectButton.tsx`) which
   calls `startOAuth(provider)` (`lib/api/integrations.ts` →
   `POST /api/integrations/oauth/{provider}/connect`).
5. **No fake disconnect / manage / reconnect.** The `markDisconnected`
   repo function exists but there's no API endpoint wired and no
   health field on the DTO — both deferred to a follow-up slice.

## Implemented vs deferred (design → V2)

| Design element                                | This slice                                                                                |
|---|---|
| Page heading + subtitle                       | ✅ `<h1>Apps</h1>` + "Showing X of Y" real counts                                          |
| Stat cards (4 in design)                      | ✅ **3 cards** — Apps available, Connected, Total accounts                                |
| Stat: "Powering N workflows"                  | ❌ **Deferred** — no integration↔workflow link surfaced today                              |
| Stat: "Need attention"                        | ❌ **Deferred** — no health field on the DTO yet                                           |
| Status tabs (All / Connected / Need attention / Not connected) | ✅ 3 tabs — All / Connected / Not connected. **Need attention deferred** with health      |
| Category sidebar                              | ✅ Categories derive from local route map; "Other" fallback                                |
| "Request an app" CTA in category rail         | ❌ **Not rendered** — no `/request` endpoint                                                |
| Search (name / description / providerId)     | ✅                                                                                          |
| Sort dropdown (4 options in design)           | ✅ **2 options** — A–Z, Recently connected. "Most used" + "Issues first" deferred         |
| Provider card collapsed row                   | ✅ Real `/integrations/<id>.svg` icon (initials fallback), name, category, sub-line       |
| "Popular" badge                               | ❌ **Not rendered** — no popularity flag in V2 manifest                                     |
| Provider card status pill                    | ✅ "Connected" / "Not connected" with icon + variant (a11y; never color-only)             |
| Connect button (per row)                      | ✅ Real OAuth via existing `ConnectButton` (`startOAuth` → provider authorize URL)        |
| Reconnect button (needs_reconnect)            | ❌ **Not rendered** — no health-driven needs_reconnect status on the DTO                   |
| Per-card "More" menu (`⋯`)                    | ❌ **Not rendered** — no backing actions wired                                              |
| Expand row → accounts list                    | ✅ aria-expanded + aria-controls; lists `displayName` + `formatConnectedOn(connectedAt)`  |
| Per-account workflow pills                    | ❌ **Not rendered** — no integration↔workflow link surfaced                                |
| Per-account "Connected on <date>"             | ✅ UTC-stable formatter                                                                    |
| Per-account "Manage" button                   | ❌ **Not rendered** — no manage API exists                                                  |
| Per-account "Disconnect" (X) button           | ❌ **Not rendered** — repository helper exists, no API endpoint / client wrapper yet      |
| "Heads up — disconnecting pauses workflows"   | ❌ **Not rendered** — depends on workflow-link data                                         |
| "Connect another account"                     | ✅ Only when `supportsMultipleAccounts && canConnect`                                       |
| Filter chips ("× Communication")              | ❌ **Not rendered** — the toolbar tabs already let users clear filters                      |
| Empty state (no matches)                      | ✅                                                                                          |
| Empty state (no apps in catalog)              | ✅ Defensive — registry always has providers in shipped builds                             |
| OAuth post-callback success/error banner      | ✅ Reuses existing `ConnectionStatusBanner`                                                |
| Global sidebar (workspace + nav)              | ⏸️ **Deferred** to a future app-shell slice                                                |
| Global top bar (search, notifications, avatar)| ⏸️ **Deferred** to a future app-shell slice                                                |
| Workspace breadcrumb ("Acme Co › Connections")| ⏸️ **Deferred** — no workspaces in V2                                                       |
| Theme toggle / Tweaks dev panel               | ❌ Never ships to customers                                                                |

## Route / page behavior

- `app/apps/page.tsx` (server) — auth gate (`createClient().auth.getUser()`).
  Signed-out → `redirect("/auth/sign-in")`. Signed-in →
  `listActiveByUser(user.id)` + `listProviders()` (registry, no I/O) →
  `resolveAppCatalog(records)` → `buildCategoryList(items)` → render
  `<ConnectionStatusBanner searchParams=...>` + `<AppsDashboard items
  categories>`. Reads + mapper are pure and synchronous after the one
  user-scoped query.
- `app/apps/_shared.ts` — owns `toAppCatalogItem`, `resolveAppCatalog`,
  `buildCategoryList`. Mapper is unit-tested at
  `tests/unit/app/apps/_shared.test.ts` with explicit no-leak assertions.
- `app/integrations/page.tsx` — replaced with a `replace`-mode redirect
  to `/apps`, serializing `searchParams` so OAuth-callback query strings
  pass through unchanged.
- `app/api/integrations/oauth/[provider]/callback/route.ts` — redirect
  target updated from `/?integration=...` to `/apps?integration=...` so
  the post-OAuth toast lands on the new route. `/integrations/oauth/...`
  ingest route mirrors the change.
- `services/notifications/buildWorkflowFailurePayload.ts` —
  `action='reconnect'` CTA now points at `/apps`.
- `features/marketing/MarketingFooter.tsx` — footer "Apps" link →
  `/apps`. Marketing homepage test updated to assert the new target.
- `app/integrations/token-ingest/[provider]/page.tsx` — "Return to" link
  renamed and repointed to `/apps`.

## Data sources (server-side)

- **Auth user** — Supabase `auth.getUser()` (existing pattern).
- **Provider catalog** — `@/integrations/_registry.listProviders()` /
  `providerIconUrl(id)`. Pure registry read, no I/O.
- **Active integrations** — `repositories/integrations.listActiveByUser(userId)`.
  RLS-scoped to the signed-in user; filters `disconnected_at IS NULL`.

**Nothing else.** No client fetch, no client API call, no extra DB query.

## DTO safety contract

`AppCatalogItem` exposes exactly:
- `providerId, name, description, iconUrl, category, isConnected,
  canConnect, supportsMultipleAccounts, accounts, firstConnectedAt`.

`AppAccountSummary` exposes exactly:
- `id, displayName, connectedAt`.

NEVER projected: `accessTokenEncrypted, refreshTokenEncrypted,
accessTokenExpiresAt, scopes, providerAccountId, accountMetadata,
disconnectedAt, userId`.

Asserted by full-text `JSON.stringify` no-leak tests on both the mapper
(`tests/unit/app/apps/_shared.test.ts`) and the route entry point
(`tests/unit/app/AppsPage.test.tsx`) using crafted fixtures with
explicit "SHOULD.NEVER.LEAK" sentinels.

## Files (this slice)

**Contracts + data layer:**
- `contracts/apps.ts` (NEW) — Zod schemas + types for `AppCatalogItem`,
  `AppAccountSummary`, `AppsCategory`.
- `lib/apps/providerCategories.ts` (NEW) — route-layer
  `categoryFor(id)` / `descriptionFor(id)` map + `APPS_CATEGORY_ORDER`.

**Route shell:**
- `app/apps/page.tsx` (NEW)
- `app/apps/_shared.ts` (NEW) — mapper + category list builder.
- `app/integrations/page.tsx` (REWRITTEN as legacy redirect → `/apps`).
- `app/api/integrations/oauth/[provider]/callback/route.ts` — redirect
  target updated from `/` to `/apps`.
- `app/api/integrations/oauth/[provider]/ingest/route.ts` — JSON
  `redirect` field updated from `/?integration=…` to
  `/apps?integration=…`.
- `app/integrations/token-ingest/[provider]/page.tsx` — error-state link
  text + href updated.

**Feature components** (`features/apps/`):
- `AppsDashboard.tsx` (client orchestrator).
- `AppsStatCards.tsx` (server).
- `AppsToolbar.tsx` (client; search + status tabs + sort select).
- `AppsCategoryNav.tsx` (client; sidebar in md+, horizontal scroll on
  small).
- `AppCard.tsx` (client; collapsed row + expandable accounts list).
- `AppStatusPill.tsx` (server; Connected / Not connected with icon).
- `AppsEmptyState.tsx` (server; no-apps + no-matches).
- `relativeDate.ts` (pure UTC formatter).

**Marketing / notifications:**
- `features/marketing/MarketingFooter.tsx` — footer link repointed.
- `services/notifications/buildWorkflowFailurePayload.ts` — reconnect
  CTA repointed.

## Tests (50 new)

| File | Coverage |
|---|---|
| `tests/unit/app/apps/_shared.test.ts` | DTO no-leak (top-level fields, account fields, encrypted tokens, providerAccountId, accountMetadata, scopes); flags + derived fields (isConnected, canConnect, account sort, firstConnectedAt); resolveAppCatalog (enabled+non-experimental filter, grouping); buildCategoryList (All first, only non-empty categories, count accuracy). 15 tests. |
| `tests/unit/app/AppsPage.test.tsx` | Auth (sign-in redirect, user-scoped fetch); DTO no-leak end-to-end (crafted IntegrationRecord with "SHOULD.NEVER.LEAK" sentinels); category list passes through. 4 tests. |
| `tests/unit/app/IntegrationsRedirect.test.ts` | Legacy `/integrations` redirect: bare → `/apps`; preserves `?integration=connected&provider=…`; preserves `?integration_error=…`; drops empty values. 4 tests. |
| `tests/unit/features/apps/AppsDashboard.test.tsx` | Render (h1, subtitle counts, stat cards, toolbar, category nav, one card per app, default A–Z sort); single h1 a11y; no-apps / no-matches; search filters name / description / providerId; status tabs (Connected / Not connected); category nav filters; Recently-connected sort. 11 tests. |
| `tests/unit/features/apps/AppCard.test.tsx` | Connect button only when (!isConnected && canConnect); no Connect when canConnect=false; status pill state; expand a11y (aria-expanded + aria-controls); expanded view lists accounts with displayName + "Connected on <date>" and renders NEITHER manage NOR disconnect NOR reconnect NOR workflow pills; "Connect another" gating on supportsMultipleAccounts && canConnect; icon fallback to initials. 9 tests. |
| `tests/unit/features/apps/AppsStatCards.test.tsx` | Derived counts; empty-account copy; explicit assertion that "Powering workflows" / "Need attention" tiles are NOT rendered. 3 tests. |
| `tests/unit/features/apps/relativeDate.test.ts` | Pure UTC formatter (typical date, month boundaries, invalid input). 3 tests. |
| `tests/unit/features/marketing/MarketingHome.test.tsx` | Updated: footer Apps link now asserts `/apps` (was `/integrations`). |
| `tests/unit/services/notifications/buildWorkflowFailurePayload.test.ts` | Updated: reconnect CTA now asserts `/apps` (was `/integrations`). |
| `tests/unit/app/api/integrations/oauth/ingest-route.test.ts` | Updated: token-ingest success `redirect` now asserts `/apps?integration=connected&provider=trello`. |

## Manual QA checklist

- Visit `/apps` while signed in → renders the page.
- Visit `/apps` while signed out → redirects to `/auth/sign-in`.
- Visit `/integrations` → redirected to `/apps`.
- Visit `/integrations?integration=connected&provider=slack` →
  redirected to `/apps?integration=connected&provider=slack` and the
  banner shows.
- Click "Connect" on a non-connected provider → real OAuth handshake.
- Returning from a successful OAuth → the post-connect toast appears
  on `/apps`.
- Search "slack" / "messages" / "stripe" → filters narrow correctly.
- Click status tabs → counts match, list filters.
- Click category nav items → list narrows; counts in the rail are
  truthful (zero-count categories don't render).
- Expand a connected provider with multiple accounts → shows each
  with displayName + "Connected on <Mon Day, Year>".
- No fake Manage / Disconnect / Reconnect / "Powering workflows" /
  "Need attention" appear anywhere in the UI.
- DevTools → Network: zero secrets in any payload (no
  `accessTokenEncrypted`, no `accountMetadata`, no
  `providerAccountId`).

## Gate results

- `npx tsc --noEmit` — ✅ clean
- `npm run lint -- --max-warnings=0` — ✅ clean
- `npm run lint:structure` — ✅ every leaf folder ≤ 50 files
- `npm run lint:migrations` — ✅ (no migrations added)
- Targeted Apps tests — ✅ 7 suites / 50 tests
- Affected-surface regression sweep (workflows page, marketing,
  integrations, notifications, homepage, OAuth API routes, structure
  boundary checks) — ✅ 31 suites / 190 tests
- **Full project sweep — ✅ 14,776 passed / 17 skipped / 0 failed
  (+50 from this slice — matches the new test count exactly).**

## Boundaries (confirmed)

- No Workflow Builder behavior change.
- No React Agent behavior change.
- No AI planner / model-tier routing change.
- No provider metadata change (manifest schema untouched; new
  `categoryFor()` / `descriptionFor()` live in `lib/apps/`, not in
  `integrations/`).
- No workflow execution semantics change.
- No billing / tasks change.
- No global app shell.
- No fake actions: every rendered button maps to a real endpoint.

## Follow-up slices (out of scope for this slice)

- **APPS-DISCONNECT-1** — add `POST /api/integrations/[id]/disconnect`
  + `disconnectAccount(integrationId)` client helper, wire the per-
  account disconnect button. Needs a confirmation dialog because
  disconnect impacts active triggers.
- **APPS-HEALTH-1** — surface health-engine state (needs_reconnect,
  rate_limited, scopes_revoked) onto the DTO and into the AppCard.
  Adds the "Need attention" stat card + tab + reconnect button +
  "Issues first" sort.
- **APPS-WORKFLOWS-LINK-1** — derive "workflows using this
  integration" from workflow definitions. Adds per-account workflow
  pills, "Powering N workflows" stat, "Most used" sort, and the
  "Heads up — disconnecting pauses workflows" tip.
- **APP-SHELL-1** — global sidebar + top bar + workspace breadcrumb.
  Once shipped, this page slots into it without code churn.
- **APPS-LEGACY-CLEANUP** — `features/integrations/IntegrationsList.tsx`
  + its test are now orphans (the old `/integrations` page that used
  them became a redirect). Safe to delete in a small follow-up;
  retained this slice for diff containment.
