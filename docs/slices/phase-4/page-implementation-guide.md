# V2 Page Implementation Pattern Guide

**Date:** 2026-05-30
**Status:** Docs-only. Establishes the standard pattern for ChainReactV2 dashboard pages going forward.
**Reference implementation:** [Slice 4.WORKFLOWS-PAGE-1 — Workflows dashboard](./workflows-page-plan.md). Every section below cites the matching file in that slice.

## Purpose

V2 deliberately leaves V1's monolithic `page.tsx → useEffect → fetch` pattern behind. When a designer hands off a new dashboard page (Integrations, Runs history, Templates, Billing, Admin, …) it should land in the shape the Workflows page already uses:

- Thin server component that handles auth + the initial fetch.
- Client orchestrator that owns local UI state + post-mutation refresh.
- Typed `lib/api/<domain>` boundary for the client → server call.
- Real lifecycle / mutation APIs only — no faked design-only actions.
- All four states (loading, empty, no-matches, error) wired before merge.
- App HSL tokens + shadcn primitives — never builder tokens.
- Tests that prove behavior, not implementation.

If a new page diverges from this pattern, the slice plan must say so and explain why. Otherwise: follow the shape below.

## 1. Page-content vs. global app-shell boundaries

A page implementation owns the **page body**. It does NOT own:

- The authenticated app shell (top header / primary nav / user menu) — that's `<AppShell>` ([app-shell-plan.md](./app-shell-plan.md)).
- Global theme toggle, task-usage bar.
- Cross-page navigation chrome.
- Workspace switcher / breadcrumb (deferred until workspaces exist).

**Shell-wrapped surfaces** (Slice 4.APP-SHELL-1): every authenticated dashboard page wraps its `<main>` in `<AppShell userEmail={user.email ?? ""}>`. The shell adds the sticky top header (brand + primary nav + mobile hamburger + user menu); the page body stays exactly where it was. Reference: [`app/workflows/page.tsx`](../../../app/workflows/page.tsx), [`app/apps/page.tsx`](../../../app/apps/page.tsx), [`app/notifications/page.tsx`](../../../app/notifications/page.tsx).

```tsx
// app/<feature>/page.tsx — reference: app/workflows/page.tsx
return (
  <AppShell userEmail={user.email ?? ""}>
    <main className="mx-auto flex w-full max-w-6xl flex-col p-6 sm:p-8">
      <FeatureDashboard initialData={...} />
    </main>
  </AppShell>
);
```

**Excluded from the shell:** marketing `/`, builder `/workflows/[id]`, auth pages, `/integrations` (legacy redirect), `/integrations/token-ingest/[provider]` (utility). The route-scope test [`tests/unit/app/AppShellRouteScope.test.tsx`](../../../tests/unit/app/AppShellRouteScope.test.tsx) pins both inclusion and exclusion.

**Nav extension rule:** adding a nav item is a one-line change to [`components/app-shell/navItems.ts`](../../../components/app-shell/navItems.ts) — but ship the route first. Every entry MUST resolve to a real page; `#`/`coming-soon` hrefs are forbidden (the page guide §4 rule applies to the shell too).

**Shell styling — design parity (Slice 4.APP-SHELL-DESIGN-PARITY-1):** the shell intentionally reuses the same visual language as in-page toolbars (`WorkflowsToolbar` / `AppsToolbar`):

- Header: `sticky top-0 z-40 h-14 bg-card border-b border-border` (solid panel, hard 1px border, fixed 56px height — no `backdrop-blur`).
- Header inner container: `max-w-7xl` with `px-4 sm:px-6 lg:px-8`. Pages inside the shell may use any narrower max-width (Workflows uses `max-w-6xl`); the outer rhythm stays consistent.
- Desktop nav: segmented-tab container — `rounded-md border border-border bg-muted/40 p-0.5`. Active item is a white pill (`bg-background text-foreground shadow-sm`); inactive items are `text-muted-foreground hover:text-foreground`. Mirrors the status-filter group in `WorkflowsToolbar`.
- Icon-button idiom (mobile hamburger, future shell utility buttons): `h-8 w-8 rounded-md border border-border bg-muted/40` with `hover:bg-muted hover:text-foreground`. Mirrors `AppsToolbar` view-toggle buttons.
- Profile-pill idiom (`UserMenu` trigger): `rounded-full border border-border bg-muted/40` containing a small avatar (`h-7 w-7 rounded-full bg-primary/10 text-primary`) + chevron-down. Mirrors the design's `tb-profile` pill.

When in doubt about a shell-control style, look at the matching idiom on a dashboard page first — the shell should feel like another piece of that page's chrome, not a separate visual surface.

**Rule:** Do not introduce sidebars / top bars / nav chrome inside a feature dashboard. Defer them to the app-shell slice and document the deferral (see §11).

## 2. Server data loading vs. client interactivity

Split every page into two files:

| Layer | File | Concerns |
|---|---|---|
| **Server** | `app/<feature>/page.tsx` | Auth gate, initial data fetch via repositories, mapping to a route-safe shape, pass as `initial*` prop. **No `"use client"`.** |
| **Client** | `features/<feature>/<Feature>Dashboard.tsx` | `"use client"`, local UI state (search / filter / view), post-mutation `refresh()`, loading/error/empty/no-matches states. |

Reference:
- Server: [`app/workflows/page.tsx`](../../../app/workflows/page.tsx) (40 lines: auth gate, `Promise.all([listByUser, getStatsForUser])`, map to `WorkflowListItem[]`, render dashboard).
- Client: [`features/workflows/WorkflowsDashboard.tsx`](../../../features/workflows/WorkflowsDashboard.tsx) (owns `query` / `statusFilter` / `view` / `refreshing` / `error` / `workflows` state and a single-flight `refresh()`).

**No first-paint loading flash.** The server seeds the dashboard with real data; the spinner only appears on `refresh()`. If a dashboard has nothing useful to render until a client-only call resolves (rare), document it in the slice plan.

**`refresh()` is single-flight.** Mutations propagate success via an `onChanged` callback; the dashboard increments a sequence ref so overlapping refreshes coalesce and the latest invocation wins. See [`WorkflowsDashboard.tsx:46-65`](../../../features/workflows/WorkflowsDashboard.tsx#L46-L65).

## 3. Repository / API usage

The data flow is fixed (per [project-structure-and-module-boundaries.md §"Client/server boundary"](../../rules/project-structure-and-module-boundaries.md)):

```
Server page  →  repositories/<table>.ts                ← initial load only
Client UI    →  features/<feature>/state | hook        ← state + mutations
                  ↓
              lib/api/<domain>.ts                      ← the ONE client→server seam
                  ↓ (HTTP)
              app/api/<domain>/route.ts                ← thin: auth → service/repo → map → respond
                  ↓
              services/<domain>/                       ← orchestration, lifecycle, billing gates
                  ↓
              repositories/<domain>.ts                 ← Supabase reads/writes
```

**Hard rules:**
- Client code (anything under `features/`, `components/`, `stores/`) must NEVER call `fetch()` directly. It calls `lib/api/<domain>.ts`. See [`features/workflows/WorkflowsDashboard.tsx`](../../../features/workflows/WorkflowsDashboard.tsx) — all server reads go through `listWorkflows()`.
- Client code must NEVER import a repository or a server service.
- Server pages may import repositories directly for the initial load (per the rule doc). They may not contain business logic — auth + fetch + map only.
- API routes stay thin (< 50 lines target). The route mapping helper (e.g. [`app/api/workflows/_shared.ts:toWorkflowListItem`](../../../app/api/workflows/_shared.ts)) is responsible for projecting DB records → route-safe DTOs.
- The route DTO must include ONLY what the UI needs: ids, display labels, icon URLs, numeric aggregates. **Never** raw definitions, configs, secrets, or full DB records. The provider chips contract is the model: [`WorkflowProviderChip`](../../../contracts/workflow.ts) is `{ id, label, iconUrl }` — nothing else leaves the server.

**Aggregates use views, not N+1.** When a list needs per-row aggregates (run counts, member counts, etc.), add a `security_invoker` SQL view aggregated from the underlying RLS-protected table and a repository wrapper. Reference: [`supabase/migrations/20260529000000_workflow_run_stats_view.sql`](../../../supabase/migrations/20260529000000_workflow_run_stats_view.sql) + [`repositories/workflowRunStats.ts`](../../../repositories/workflowRunStats.ts). The page fetches it in `Promise.all` next to the main list — one grouped query for the whole page.

## 4. No fake design-only actions

A handoff design often shows buttons, menu items, or filters that V2 doesn't yet support (Delete, Duplicate, Star, Owner-filter, Folders, …). The rule is binary:

> **If the API doesn't exist, the action doesn't render.**

Reference: [`features/workflows/WorkflowActionsMenu.tsx`](../../../features/workflows/WorkflowActionsMenu.tsx) renders only Open / Activate / Pause / Resume — Delete and Duplicate are explicitly NOT rendered, with a JSDoc comment naming the reason. The status filter in [`WorkflowsToolbar.tsx`](../../../features/workflows/WorkflowsToolbar.tsx) exposes only `all / running / draft / paused / attention` because those map to real lifecycle states; Folder / Apps / Owner / Date facets are deferred.

What "fake" looks like — all forbidden:
- A button wired to a no-op handler.
- A button that opens a "coming soon" toast.
- A filter pill that visually highlights but doesn't filter.
- A status indicator computed from heuristics that don't actually represent system state.

When you defer a design element, write it in the slice plan's "Implemented vs deferred" table with a reason (see §11). Do not render the element.

## 5. Loading / empty / no-matches / error states

Every page renders **four** discriminable states, plus the data state, and tests all four:

| State | When | Reference |
|---|---|---|
| **Loading (refresh)** | `refresh()` in flight (NOT on first paint — server seeds data) | `data-testid="workflows-dashboard-loading"`, copy "Refreshing…", `role="status"` |
| **Empty (no records)** | User has 0 records | [`WorkflowsEmptyState`](../../../features/workflows/WorkflowsEmptyState.tsx) `kind="no-workflows"` — friendly copy + the real Create CTA |
| **No matches (filtered empty)** | Records exist but search/filter excludes them | [`WorkflowsEmptyState`](../../../features/workflows/WorkflowsEmptyState.tsx) `kind="no-matches"` — copy prompts the user to relax filters |
| **Error** | `refresh()` rejects | `role="alert"`, the error message, a `Retry` button bound to `refresh()` (NEVER a full reload) |
| **Data** | Records + view | List or grid view |

**Rules:**
- The empty state's CTA is the **same real create flow** the toolbar uses (`<CreateWorkflowButton />`) — never a duplicate inline implementation.
- The error state always has a retry path. Never a dead end.
- "No matches" is a distinct state — do not show "No workflows yet" copy when the user has filtered to zero results.
- Server-page failures (auth) redirect (`redirect("/auth/sign-in")` in [`app/workflows/page.tsx`](../../../app/workflows/page.tsx)). Client-side fetch failures show the in-page error state.

## 6. Layout patterns

The standard dashboard composition, top-to-bottom:

```
<section data-testid="<feature>-dashboard" aria-label="<Feature>">
  ┌─ header ─────────────────────────────────────────────────┐
  │ <h1>                                                     │
  │ "Showing X of Y" subtitle (real counts; no fake totals)  │
  └──────────────────────────────────────────────────────────┘

  ┌─ stat cards (optional) ──────────────────────────────────┐
  │  <ul> of 2–4 derived metrics                             │
  │  Every figure derived from already-fetched data          │
  │  Copy generic ("lifetime") — never implies "today" unless│
  │  a time-bucketed source exists                           │
  └──────────────────────────────────────────────────────────┘

  ┌─ toolbar ────────────────────────────────────────────────┐
  │ search ◌  [status segments]   [view toggle]   Create CTA │
  └──────────────────────────────────────────────────────────┘

  ┌─ error banner (when present) ────────────────────────────┐
  ┌─ loading banner (when present) ──────────────────────────┐

  ┌─ data region ────────────────────────────────────────────┐
  │  list view (default)  OR  grid view                      │
  │  empty-state          OR  no-matches state               │
  └──────────────────────────────────────────────────────────┘
</section>
```

### Page header

```tsx
<header className="flex flex-col gap-1">
  <h1 className="text-2xl font-bold tracking-tight text-foreground">…</h1>
  <p className="text-sm text-muted-foreground">
    Showing <code>{filtered.length}</code> of <code>{total}</code> …
  </p>
</header>
```

Reference: [`WorkflowsDashboard.tsx:81-99`](../../../features/workflows/WorkflowsDashboard.tsx#L81-L99).

The subtitle's counts must reflect **real** filtered + total numbers — do not show a fixed "12 workflows" placeholder.

### Stat cards

- Grid of 2–4 cards (`grid-cols-2 md:grid-cols-4`).
- Each card: small muted label, large bold value, small muted sub-text.
- Every figure is **derived from already-fetched list data** — no second fetch.
- Copy never implies a time bucket unless a time-bucketed source exists. Lifetime aggregates say "lifetime"; counts say "of N total"; rates with no data show `—`.

Reference: [`WorkflowsStatCards.tsx`](../../../features/workflows/WorkflowsStatCards.tsx).

### Toolbar

- Search input on the left, status filter (segmented buttons with `role="tablist"`) next to it, view toggle and Create CTA on the right.
- Status filter facets map ONLY to real states the page surfaces.
- View toggle (list / grid) uses `aria-pressed`.

Reference: [`WorkflowsToolbar.tsx`](../../../features/workflows/WorkflowsToolbar.tsx).

### Table (list view) row

A row is a horizontal flex container with a clear visual hierarchy. Suggested column order:

1. **Name** — `<Link>` to the detail/edit page (`/<feature>/[id]`). Truncates. Hover underline.
2. **Sub-line under name** — secondary metadata (e.g. lifetime run stats copy).
3. **Provider chips** (or equivalent associated entities) — hidden on small viewports.
4. **Last changed** — relative time, narrow column, hidden on smaller breakpoints.
5. **Status badge** — color + shape + text (never color-only; see §8).
6. **Inline status toggle** — non-optimistic (see §7).
7. **Actions menu** — real lifecycle actions only.

Reference: [`WorkflowRow.tsx`](../../../features/workflows/WorkflowRow.tsx).

### Card (grid view)

Reuses the same data and the same status/toggle/actions controls; rearranges them into a vertical card. The data shape is **shared** between row and card — don't compute different fields for the two views.

Reference: [`WorkflowCard.tsx`](../../../features/workflows/WorkflowCard.tsx).

## 7. Status / action behavior

### Status badges

- App HSL Badge variants only: `success` / `warning` / `destructive` / `outline`. No custom builder tokens.
- Status is conveyed by **shape + color + text** (icon + label), never color alone — accessibility requirement.
- Soft-deleted records are filtered before render, not styled into oblivion.

Reference: [`WorkflowStatusBadge.tsx`](../../../features/workflows/WorkflowStatusBadge.tsx). Badge variant chosen from `displayStatus()` projection ([`core/workflows/projections.ts`](../../../core/workflows/projections.ts)); UI never invents a kind.

### Inline status toggle — **non-optimistic**

The default V2 pattern for lifecycle / on-off toggles in lists:

1. `checked` is fully controlled by the latest server data.
2. On user click → call the lifecycle API; show `data-pending` while in flight (Switch disabled).
3. On API success → call `onChanged()` so the parent dashboard `refresh()`es.
4. On API failure → inline error + a "Open builder" / "Open detail" escape link. **Nothing reverts**, because nothing was optimistically changed.

Reference: [`WorkflowStatusToggle.tsx`](../../../features/workflows/WorkflowStatusToggle.tsx) and the matching tests at [`tests/unit/features/workflows/WorkflowStatusToggle.test.tsx`](../../../tests/unit/features/workflows/WorkflowStatusToggle.test.tsx) which assert the non-optimistic invariant ("pending leaves state unchanged" / "failure does not revert").

Optimistic toggles are NOT a V2 default. If a future slice needs one (e.g. a low-risk preference that returns instantly), the slice plan must justify it explicitly.

### Typed-confirmation flow

For destructive / high-risk actions (POSTSEC-5), surfacing `CONFIRMATION_REQUIRED` from the lifecycle API:

- Catch `isConfirmationRequiredError(err)` on the toggle / actions menu.
- Open the confirmation dialog with the server-supplied `confirmationText` — UI never hardcodes the phrase.
- Retry the action with `{ confirmationText }`; on success the dialog closes and `onChanged()` fires.

Reference: [`WorkflowActivateConfirmDialog.tsx`](../../../features/workflows/WorkflowActivateConfirmDialog.tsx) wired by both [`WorkflowStatusToggle.tsx`](../../../features/workflows/WorkflowStatusToggle.tsx) and [`WorkflowActionsMenu.tsx`](../../../features/workflows/WorkflowActionsMenu.tsx).

### Actions menu

- Trigger button is a small icon-only ghost button with `aria-label="Actions for {name}"` and visible focus ring.
- `<Popover>` from `@/components/ui/popover`.
- Each item is a `<button type="button">` with a `data-testid="<feature>-actions-menu-<action>"`.
- State-aware: only render items whose action is currently valid for the record's state.
- On a non-confirmation lifecycle error, show the message + an escape link to the detail page. Never a dead end.

Reference: [`WorkflowActionsMenu.tsx`](../../../features/workflows/WorkflowActionsMenu.tsx).

## 8. App tokens & components

### Tokens — app HSL only

Use `--background` / `--foreground` / `--muted` / `--muted-foreground` / `--border` / `--primary` / `--ring` plus the success / warning / destructive Badge variants. **Do NOT use** `--builder-*` tokens or `[data-builder-surface]` styling — those are scoped to the workflow builder canvas.

Light mode is the V2 default today; no theme toggle is shipped at the page level (deferred to a future app-shell slice).

### shadcn primitives — use the existing wrappers

Pages compose from `@/components/ui/*`:
- `Button` ([`components/ui/button.tsx`](../../../components/ui/button.tsx))
- `Input` ([`components/ui/input.tsx`](../../../components/ui/input.tsx))
- `Switch` ([`components/ui/switch.tsx`](../../../components/ui/switch.tsx))
- `Badge` ([`components/ui/badge.tsx`](../../../components/ui/badge.tsx))
- `Popover` ([`components/ui/popover.tsx`](../../../components/ui/popover.tsx))
- plus existing label / select / textarea / command.

If a primitive doesn't exist yet, add it to `components/ui/` — don't write inline ad-hoc primitives in `features/`. `components/` may not import business or backend code (per the import boundary rule).

### Custom buttons / chips

Where a shadcn primitive doesn't fit (segmented status filter buttons, view toggle, icon-only action trigger), implement them inline with the same tokens (`bg-muted/40`, `bg-background text-foreground shadow-sm` for the active state) and the appropriate ARIA (`role="tab"` + `aria-selected` for segmented, `aria-pressed` for toggle). Pattern: [`WorkflowsToolbar.tsx`](../../../features/workflows/WorkflowsToolbar.tsx).

### `cn` helper

A small inline `cn(...)` helper is acceptable in a single feature file (see [`WorkflowProviderChips.tsx:106-108`](../../../features/workflows/WorkflowProviderChips.tsx#L106-L108)). If you find yourself copying it across three+ files in the same feature, lift it into the feature folder; don't add it to `components/`.

## 9. Accessibility expectations

Required for every page:

- **One `<h1>` per page** in the dashboard header.
- **Real links use `<Link>`**, real buttons use `<button type="button">`. No clickable `<div>`s.
- **Status conveyed by more than color** — every status badge has an icon + label.
- **Segmented controls** use `role="tablist"` + `role="tab"` + `aria-selected`.
- **View toggle** uses `aria-pressed`.
- **Action menu trigger** has an `aria-label` naming the record (e.g. `Actions for Welcome workflow`).
- **Inputs** have an `aria-label` or visible `<label>`.
- **Alert / status regions** use `role="alert"` (errors) or `role="status"` (loading, empty / no-match panels).
- **Icons** that are purely decorative have `aria-hidden`.
- **Provider chip stacks** expose the full list to screen readers via `aria-label="Connected apps: …"`.
- **Focus rings** preserved (`focus:ring-2 focus:ring-ring`); no `outline: none` without a replacement.

The Workflows page's a11y assertions live in [`tests/unit/features/workflows/WorkflowsDashboard.test.tsx`](../../../tests/unit/features/workflows/WorkflowsDashboard.test.tsx) ("a11y basics"). Match that bar for every new dashboard.

## 10. Testing expectations

Per [testing-strategy.md](../../rules/testing-strategy.md): tests prove **business behavior**, not implementation. For a new dashboard, the minimum suite is:

| Test file | Coverage |
|---|---|
| `tests/unit/features/<feature>/<Feature>Dashboard.test.tsx` | Render with data, empty, no-matches (filtered), error+retry, search + filter + view toggle, refresh after a mutation (loading state), Create CTA → create + navigate, row link → detail page, **explicit assertion that fake/deferred actions are NOT rendered** (Delete / Duplicate / etc.), a11y basics. |
| `tests/unit/features/<feature>/<Feature>StatCards.test.tsx` | Derived counts / rates / sub-text copy. **Pin "no fake time bucket"** copy if stats are lifetime. |
| `tests/unit/features/<feature>/<Feature>StatusToggle.test.tsx` | Each lifecycle path (activate / pause / resume / disabled-locked), non-optimistic invariant ("pending leaves state unchanged", "failure does not revert"), typed-confirmation flow, error → escape link. |
| `tests/unit/features/<feature>/<helper>.test.ts` | Pure helpers (relative time, formatters). |
| `tests/unit/core/<feature>/<projection>.test.ts` | Pure data-shape mappers used by the route (e.g. `toWorkflowListItem`'s no-config-leak assertion at [`tests/unit/core/workflows/definitionSummary.test.ts`](../../../tests/unit/core/workflows/definitionSummary.test.ts)). |

**Required negative-path tests**, in addition to the happy path:

- Refresh failure → error banner + Retry calls `refresh()` again.
- Action failure with non-confirmation error → inline error + escape link visible; no state mutation.
- `CONFIRMATION_REQUIRED` flow → dialog opens with the **server-supplied** phrase (test must NOT hardcode "CONFIRM").
- Filter combination that excludes all rows → "no matches" state (NOT the empty state).
- Soft-deleted records filtered out at the route layer (assert via route-mapping test, not at the UI layer).

Mock at the public boundary: `lib/api/<domain>` and `next/navigation`. Do NOT mock the dashboard's own state hooks or assert "called once" without a real reason (per testing-strategy.md §12 anti-patterns).

Reference: see [workflows-page-plan.md §"Tests"](./workflows-page-plan.md) for the full test set on the reference page.

## 11. Documenting deferred design elements

Designs almost always include elements V2 cannot ship in the current slice. The rule is:

1. **Render nothing for the deferred element.** No placeholder, no greyed-out button, no fake count, no "coming soon" toast.
2. **Document the deferral in the slice plan's "Implemented vs deferred" table** with one of these reasons:
   - *No schema in V2 yet* (folders, owners, teams, starred).
   - *No API endpoint yet* (bulk ops, delete, duplicate).
   - *No time-bucketed source yet* (today/24h stats vs. lifetime).
   - *Separate slice scope* (global app shell, theme toggle, billing UI).
   - *Out of slice scope by user decision* (locked decision — quote the decision).
3. **Reference the reason in the relevant component's JSDoc** so a future reader doesn't think it's an oversight. Example: [`WorkflowsToolbar.tsx`](../../../features/workflows/WorkflowsToolbar.tsx) JSDoc explicitly notes that Folder/Apps/Owner/Date filters are deferred and why.
4. **Use the "Implemented vs deferred (design → V2)" table format** from [workflows-page-plan.md](./workflows-page-plan.md) — two columns: the design element on the left, ✅ / ❌ / ⏸️ + a one-line reason on the right. ✅ = shipped, ❌ = not rendered (no API), ⏸️ = deferred to a future slice with the slice named.

Backlog-safe: when the deferred capability ships, the page's components adopt it without a redesign.

## 12. New-page checklist

Before opening the PR for a new dashboard page:

- [ ] Route file is a server component (no `"use client"`) — auth gate + initial fetch + render the client dashboard with `initial*` props.
- [ ] Client dashboard component lives in `features/<feature>/`, marked `"use client"`, owns local UI state + single-flight `refresh()`.
- [ ] All server calls from the client go through `lib/api/<domain>.ts`. Zero `fetch(` calls in `features/` or `components/`.
- [ ] Route DTO has been audited: only ids, display labels, icon URLs, and numeric aggregates leave the server. No raw definitions / configs / secrets.
- [ ] Aggregates for the list come from a `security_invoker` view + one grouped query — no N+1 per row.
- [ ] Loading / empty / no-matches / error states all implemented; error state has a Retry that calls `refresh()`.
- [ ] All status indicators use icon + text + app HSL Badge variant — never color alone, never builder tokens.
- [ ] Inline lifecycle toggles are non-optimistic. `CONFIRMATION_REQUIRED` opens the typed-confirmation dialog with the server-supplied phrase.
- [ ] Actions menu renders ONLY actions backed by real APIs. Deferred actions are not rendered.
- [ ] Page header has a real "Showing X of Y" subtitle reflecting current filter state.
- [ ] Stat cards (if used) are all derived from already-fetched data and never imply a time bucket the source can't back.
- [ ] One `<h1>`, real `<Link>` / `<button>` semantics, segmented control ARIA, alert / status roles, focus rings preserved.
- [ ] Test matrix from §10 lands in the same PR (good path + bad path + error + a11y).
- [ ] Slice plan includes the "Implemented vs deferred" table for every design element.
- [ ] No global sidebar / top bar / theme toggle introduced inline — those wait for the app-shell slice.

If any check is unclear, decide it in the slice plan before writing the code.
