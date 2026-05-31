# Slice 4.APP-SHELL-1 — Authenticated app shell

**Date:** 2026-05-30
**Branch:** `builder-ui-v1-audit-1`
**Scope:** Shared authenticated top header + primary navigation that
wraps V2 dashboard pages. No Workflow Builder / React Agent / planner /
provider-metadata / workflow-execution / billing changes; no global app
shell on marketing; no fake nav items.

## Decisions locked with the user

1. **Architecture = shared component, NOT a Next.js route group.**
   Route groups (`app/(app)/`) would force moving 3 page paths under a
   new directory, breaking `@/app/apps/page` test imports and forcing
   churn in the builder route's own layout. The shared `AppShell`
   component wraps each authenticated page's content directly — URLs
   stay unchanged, every existing test path keeps resolving, the
   builder route stays self-contained.
2. **Pages included:** `/workflows`, `/apps`, `/notifications`.
3. **Pages excluded:** `/` (marketing — signed-in users redirect to
   `/workflows`), `/workflows/[id]` (builder owns its own full-bleed
   shell), `/auth/*`, `/integrations` (legacy redirect — never renders
   content), `/integrations/token-ingest/[provider]` (utility surface).
4. **Nav items rendered now (real routes only):** Workflows, Apps,
   Notifications.
5. **Nav items deferred** (no real route today): Runs / History,
   Templates, Settings, Billing, Account. When those routes ship,
   adding them is a one-line change to `components/app-shell/navItems.ts`.
6. **User menu:** popover with signed-in email + Sign out (existing
   `signOut` server action). No Settings / Billing / Account entries
   rendered.
7. **No new global theme toggle.** App stays light-mode at the in-app
   surface; marketing has its own scoped dark palette.

## Rail nav reduced to Workflows + Apps (2026-05-31)

Marcus pointed out that the rail's `/notifications` entry duplicated
the top-bar notification bell. Removed `/notifications` from
`APP_SHELL_NAV_ITEMS`. The rail now carries only Workflows + Apps;
the top-bar bell (with the real unread badge) is the canonical entry
to `/notifications`. `AppPageContext` returns null on `/notifications`
(the page renders its own h1, so the top-bar context slot stays empty
there — no fabricated label). Tests updated to pin the change:
`navItems.test.ts`, `AppNav.test.tsx`, `AppMobileNav.test.tsx`,
`AppPageContext.test.tsx`.

## Runs joined the rail (Slice 4.RUNS-PAGE-1, 2026-05-30)

With the read-only Runs page live ([runs-page-plan.md](./runs-page-plan.md)),
the rail's primary nav is now Workflows → Apps → Runs. Order is
product-flow (build → connect → observe). A new monoline `Clock`
glyph (defined inline in [`navItems.tsx`](../../../components/app-shell/navItems.tsx))
matches the existing icon stroke + sizing — no new dependency. The
`APP_SHELL_NAV_ITEMS` test pin grew accordingly
([`navItems.test.ts`](../../../tests/unit/components/app-shell/navItems.test.ts)),
and the route-scope test
([`AppShellRouteScope.test.tsx`](../../../tests/unit/app/AppShellRouteScope.test.tsx))
gained an INCLUDED case for `/runs`.

## Design-parity tune — Slice 4.APP-SHELL-DESIGN-PARITY-1 (superseded)

A first design-parity tune restyled the top-header shell (solid panel
+ segmented nav pills + pill-shape user-menu) to match the in-page
toolbars. That pass shipped but Marcus decided the top-nav direction
was wrong for the authenticated app. Replaced by the rail-based dark
shell below.

## Dark-rail rewrite — Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1

**Reason for the rewrite:** the top-nav layout shipped by
`APP-SHELL-1` + the visual tune in `APP-SHELL-DESIGN-PARITY-1` didn't
match the design direction Marcus wants for the authenticated app.
The Anthropic Design reference uses a dark dashboard surface with a
left icon rail. This slice replaces the top header with that
direction.

**Design source:** the dark `Sidebar` + dark `[data-theme="dark"]`
palette from `chainv2builder/project/src/workflows-page.jsx:4-119` —
the same handoff that drives the Workflows + Connections pages. Top
bar with search / task-meter / help / bell / theme toggle / workspace
switcher was deliberately NOT ported; those would all be fake on V2
today (no cross-surface search index, no billing-task data wired into
UI, no help center route, no theme system, no workspaces).

**Layout (≥ md — desktop):** rail + top bar (revised — see
"Top-bar restored" section above).

```
┌──┬──────────────────────────────────┐
│B │ Workflows           🔔³  ⊙ ▾    │ <- top bar (sticky, bg-card border-b)
│──├──────────────────────────────────┤
│ W│                                  │
│ A│   page content (dark bg)         │
│ N│                                  │
│  │                                  │
└──┴──────────────────────────────────┘
```

- 64px-wide sticky rail (`<aside role="complementary"
  aria-label="Sidebar">`): brand → divider → primary nav icons.
  Icon-only — user-menu lives in the top bar (design `tb-profile`
  placement), not at the rail bottom.
- Top bar inside content column: page context label (left) +
  notification bell with real unread badge + user menu (right).

**Layout (< md — mobile):** rail hidden; thin sticky top bar
(hamburger + brand + page context + notification bell + user-menu
avatar). Hamburger opens the mobile drawer popover with the full
nav set.

**Dark scope:** the AppShell root carries `data-app-surface="dark"`.
A scoped CSS rule in [`app/globals.css`](../../../app/globals.css)
re-themes the app HSL tokens (`--background`, `--card`, `--popover`,
`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`,
`--success`, `--warning`, `--border`, `--input`, `--ring`) so EVERY
page component that uses `bg-card`, `text-foreground`, `border-border`,
etc. automatically renders against the dark palette. No per-component
class rewrites needed. Mirrors the existing `[data-builder-surface]`
+ `[data-marketing-surface]` scoping idiom — marketing `/` and builder
`/workflows/[id]` are untouched because they don't carry this
attribute.

**Portal-scope fix:** Radix `PopoverContent` portals to `document.body`,
OUTSIDE the AppShell's dark ancestor. The fix is to re-apply
`data-app-surface="dark"` directly on each `PopoverContent` we render
(UserMenu + AppMobileNav). The CSS rule then matches the portaled
node by attribute, regardless of DOM ancestry.

**Nav active state inside the rail:** active item = `border-primary/30
bg-primary/10 text-primary`; inactive = `text-muted-foreground hover:
bg-muted hover:text-foreground`. Icon-only rail with `aria-label` per
item + a tooltip on hover (`role="tooltip"` span).

**What changed structurally** (`AppHeader` retired; new `AppRail` +
`AppMobileBar`):

| Component | Before (APP-SHELL-DESIGN-PARITY-1) | After (APP-SHELL-DARK-DESIGN-PARITY-1) |
|---|---|---|
| `AppShell` | flex-col with sticky top header | flex-row with rail + content column (md+); content column has a thin sticky mobile bar (< md). Root carries `data-app-surface="dark"`. |
| `AppHeader` | sticky top header | **DELETED** |
| `AppRail` | — | **NEW** — desktop vertical sidebar (`<aside aria-label="Sidebar">`), `bg-card border-r border-border`, sticky |
| `AppMobileBar` | — | **NEW** — mobile-only thin top bar with hamburger + brand + user menu; no fake utility content |
| `AppNav` | horizontal segmented tabs | vertical icon-only stack with tooltip on hover |
| `AppBrand` | brand mark + wordmark | icon-only tile inside the rail; wordmark in `aria-label` + tooltip |
| `UserMenu` trigger | pill (initials + chevron) | circular initials avatar (no chevron); popover opens to the right (`side="right"`) |
| `AppMobileNav` trigger | unchanged | unchanged (lives in mobile bar) |

**Page components — no changes needed.** The Workflows / Apps /
Notifications page components use `bg-card`, `text-foreground`,
`border-border`, etc. — every one of those resolves to the dark value
inside the AppShell's `[data-app-surface="dark"]` scope. Cards / rows /
status pills / stat cards / empty states all auto-render dark without
per-component class rewrites.

## Architecture

```
authenticated page (server)
   ├─ auth gate
   ├─ data fetch (existing repositories)
   └─ render
        <AppShell userEmail={user.email ?? ""}>
          <main className="…">…page-specific content…</main>
        </AppShell>
```

`AppShell` (server) carries `data-app-surface="dark"` and composes:
- `AppRail` (server, ≥ md): `AppBrand` + `AppNav` (client; vertical
  icon stack via `usePathname`) + `UserMenu` (client; popover with
  email + sign-out form).
- `AppMobileBar` (server, < md): `AppMobileNav` (client; hamburger +
  popover drawer) + `AppBrand` + `UserMenu`.

Both layers live in the DOM at all times; Tailwind responsive
utilities (`md:flex` / `md:hidden`) toggle visibility. Auth is the
caller's responsibility; the shell ASSUMES it's rendering inside a
server component that already verified `auth.getUser()` and gated on
it.

## Implemented vs deferred (design → V2)

| Design element                              | This slice                                                                |
|---|---|
| Dark dashboard surface                       | ✅ `data-app-surface="dark"` scope on AppShell root; re-themes app HSL tokens; never bleeds into marketing / builder |
| Left icon rail (slim, sticky, dark panel)    | ✅ 64px-wide rail (`<aside role="complementary" aria-label="Sidebar">`); `bg-card border-r border-border` |
| Top utility bar (desktop)                    | ✅ 56px-tall sticky `bg-card border-b` strip inside the content column — page context (left) + notification bell + user menu (right) |
| Brand mark (rail top)                        | ✅ Real ChainReact mark in a 36×36 tile; `aria-label` carries the wordmark; tooltip on hover |
| Primary nav (vertical icon stack)            | ✅ Workflows + Apps only (rail nav reduced 2026-05-31); icon-only with `aria-label` + hover tooltip; active = `border-primary/30 bg-primary/10 text-primary`. Notifications is reached via the top-bar bell, not the rail. |
| Page context label (top bar + mobile bar)   | ✅ Active primary nav item's label, derived from `usePathname` (single source of truth with the rail highlight) |
| Notification bell + unread badge             | ✅ Real `<Link href="/notifications">` with badge driven by `notificationsRepo.countUnreadForUser`; badge hidden at 0, shown as `99+` above 99; aria-label reflects unread state |
| Mobile hamburger + popover                   | ✅ Lives in the `AppMobileBar` (< md); same item set as desktop; `aria-expanded` + closes on item click; popover carries `data-app-surface="dark"` to keep dark theming through the portal |
| User menu                                    | ✅ Pill trigger in the top bar (desktop) + mobile bar; popover with email + Sign out form |
| Workspace breadcrumb ("Acme Co › …")         | ⏸️ **Deferred** — no workspaces in V2                                       |
| Workspace switcher                           | ⏸️ **Deferred** — same reason                                              |
| Top-bar utility elements NOT shipped (search / task / help / theme) | ❌ **Not rendered** — would be fake on V2 today:                  |
|                                              |   • Global `⌘K` search — no cross-surface search index                     |
|                                              |   • Task-usage meter — billing/tasks scope intentionally untouched         |
|                                              |   • Help button — no help-center route                                     |
|                                              |   • Theme toggle — locked decision (no global theme system)                |
| Settings / Billing / Account menu items      | ❌ **Not rendered** — no real routes                                       |
| "Create workflow" CTA in shell               | ⏸️ **Deferred** — `WorkflowsDashboard` already exposes Create; adding to shell would duplicate |
| Additional rail items in design (Templates, AI assistant, Activity, Team, Billing, Settings) | ❌ **Not rendered** — no real routes; would be fake nav. Rail revisits when ≥ 5 of those routes ship. |

## Route scope (pinned by tests)

[`tests/unit/app/AppShellRouteScope.test.tsx`](../../../tests/unit/app/AppShellRouteScope.test.tsx)
walks the server-rendered React element tree and asserts:

| Route                              | Shell? | Pinned by                                  |
|---|---|---|
| `/workflows`                       | ✅     | `containsElement(result, AppShell) === true`  |
| `/apps`                            | ✅     | same                                          |
| `/notifications`                   | ✅     | same                                          |
| `/` (marketing)                    | ❌     | `containsElement(result, AppShell) === false` + MarketingHome is in tree |
| `/integrations` (legacy redirect)  | ❌     | server-redirect throws before render          |

The builder route (`/workflows/[id]`) and auth routes are excluded by
non-modification — this slice never touched them and they don't import
`AppShell`. They keep their existing layouts.

## Files (this slice)

**New (`components/app-shell/`):**
- `AppShell.tsx` — top-level wrapper. Server component.
- `AppHeader.tsx` — sticky header composition. Server component.
- `AppBrand.tsx` — brand mark + wordmark → `/workflows`. Server component.
- `AppNav.tsx` — desktop horizontal nav. Client (`usePathname`).
- `AppMobileNav.tsx` — hamburger + popover. Client.
- `UserMenu.tsx` — initials + email + Sign out form. Client.
- `navItems.ts` — `APP_SHELL_NAV_ITEMS` array + `isNavItemActive()` predicate.

**Updated (page-level wrappers):**
- `app/workflows/page.tsx` — wraps `<WorkflowsDashboard>` in `<AppShell>`.
- `app/apps/page.tsx` — wraps `<ConnectionStatusBanner>` + `<AppsDashboard>` in `<AppShell>`.
- `app/notifications/page.tsx` — wraps `<NotificationsList>` in `<AppShell>`,
  drops the redundant "← Home" link (the shell's brand link covers it),
  normalizes the page-content layout to match Workflows/Apps.

**Not touched** (explicitly verified):
- `app/page.tsx` (marketing — HOMEPAGE-V2-1 surface).
- `app/workflows/[id]/page.tsx` (builder — owns its own full-bleed layout).
- `app/auth/**` (sign-in / sign-up / callback).
- `app/integrations/page.tsx` (legacy redirect → `/apps`).
- `app/integrations/token-ingest/[provider]/page.tsx` (token-ingest utility).

## Tests (30 new)

| File | Coverage |
|---|---|
| `tests/unit/components/app-shell/navItems.test.ts` | Only real routes in the list; no fake/`#` hrefs; `isNavItemActive` exact / sub-route / false-prefix / unrelated path semantics. 7 tests. |
| `tests/unit/components/app-shell/AppNav.test.tsx` | Items render with real hrefs; never `#`; active state per pathname for `/workflows`, `/apps`, `/notifications`, `/workflows/abc`; no active item on unknown route; `<nav aria-label="Primary">` landmark. 8 tests. |
| `tests/unit/components/app-shell/AppMobileNav.test.tsx` | Trigger toggles `aria-expanded`; popover items mirror desktop nav exactly; active state inside the popover; clicking an item closes the popover. 4 tests. |
| `tests/unit/components/app-shell/UserMenu.test.tsx` | Initials trigger has accessible label; falls back to first 2 chars when no separator; popover shows email + Sign out form ONLY (no Settings / Billing / Account items rendered); Sign out is a `<form>` with `type="submit"`. 4 tests. |
| `tests/unit/components/app-shell/AppShell.test.tsx` | Renders header + brand link → `/workflows` + page children; nav landmark + user menu trigger; mobile hamburger trigger. 3 tests. |
| `tests/unit/app/AppShellRouteScope.test.tsx` | INCLUDED (`/workflows`, `/apps`, `/notifications`) render the shell; EXCLUDED (`/`, `/integrations`) do not. Identifies shell via component identity, not JSX strings, so removing the wrapper from an included route fails this test. 5 tests. |

**Tests NOT touched (intentional):** existing `WorkflowsDashboard`,
`AppsDashboard`, `AppCard`, `MarketingHome`, OAuth-callback, and
notifications tests all keep passing — the shell wraps page content
without changing per-page data or DOM contracts. Verified in the
regression sweep below.

## Manual QA checklist

- `/workflows` → shell renders; Workflows nav item is active.
- `/apps` → shell renders; Apps nav item is active.
- `/notifications` → shell renders; Notifications nav item is active.
- `/integrations` → server-redirected to `/apps`.
- `/` → marketing surface; NO authenticated shell.
- `/workflows/[id]` → builder full-bleed; NO authenticated shell wrapper.
- `/auth/sign-in`, `/auth/sign-up`, `/auth/callback` → unchanged; no shell.
- Brand click anywhere in the shell → lands on `/workflows`.
- User menu → opens, shows email, Sign out form is wired to the
  existing `signOut` server action (lands on `/`).
- Mobile viewport (≤ 640px) → desktop nav hides, hamburger appears,
  popover items match desktop set; clicking an item closes the popover.
- Keyboard → tab order brand → nav items → user menu; popover
  triggers respond to Enter/Space; `aria-current="page"` on the active
  nav item.

## Gate results

- `git branch --show-current` — `builder-ui-v1-audit-1`
- `npx tsc --noEmit` — ✅ clean
- `npm run lint -- --max-warnings=0` — ✅ clean
- `npm run lint:structure` — ✅ every leaf folder ≤ 50 files
- `npm run lint:migrations` — ✅ (no migrations added)
- Targeted shell tests — ✅ 6 suites / 30 tests
- Affected-surface regression sweep (workflows page, apps page,
  marketing, integrations, notifications, OAuth API routes, structure
  boundaries) — ✅ 37 suites / 225 tests
- **Full project sweep — ✅ 14,806 passed / 17 skipped / 0 failed
  (+30 vs prior baseline of 14,776 — matches the new test count exactly).**

## Boundaries (confirmed)

- No Workflow Builder behavior change. (`app/workflows/[id]/page.tsx`
  and `features/workflow-builder/**` untouched.)
- No React Agent behavior change.
- No AI planner / model-tier routing change.
- No provider metadata change.
- No workflow execution semantics change.
- No billing / tasks change.
- No fake nav items (every link → real V2 route).
- No app shell on marketing route.
- No app shell on builder route.
- No global theme toggle.

## Follow-up slices (out of scope)

- **APP-SHELL-RUNS-1** — add a `/runs` history route + nav item once the
  surface ships.
- **APP-SHELL-TEMPLATES-1** — same for `/templates`.
- **APP-SHELL-SETTINGS-1** — `/settings/account`, `/settings/billing`,
  and the corresponding user-menu items. Needs the account-ownership
  model from `docs/rules/account-ownership-model.md` to land first.
- **APP-SHELL-WORKSPACES-1** — workspace switcher + workspace
  breadcrumb once the ownership model + workspace tables exist.

## Bell popover — Slice 4.NOTIFICATIONS-POPOVER-1 (2026-05-30)

**Reason for the slice:** Marcus called out that the top-bar bell was
still a `<Link href="/notifications">` — clicking it took the user out
of context to a full page. Standard webapp pattern is bell → inline
dropdown of recent notifications, with a "View all" link to the full
page as a fallback. Notifications is already off the primary side nav
(rail-nav reduction shipped 2026-05-31), so this slice closes the loop
on the bell's affordance.

**Behavior:**
- `components/app-shell/NotificationBell.tsx` is now a `"use client"`
  component owning popover open-state. Trigger is a `<button>` (not a
  link); `aria-haspopup="dialog"`; `aria-expanded` flips on click.
- Popover content (portaled, re-tagged `data-app-surface="dark"`):
  - **Header** — `"Notifications"` title + a `"Mark all read"` `<form
    action={markAllNotificationsRead}>` (rendered ONLY when
    `unreadCount > 0` — no fake button when there's nothing to mark).
  - **Body** — either the empty state `"No notifications yet."` or
    a `<ul>` of the most-recent rows (≤ `NOTIFICATION_BELL_PREVIEW_LIMIT`
    = 5). Each row shows title + body + relative-time label +
    severity-tinted unread dot. Rows are wrapped in `<Link
    href={actionUrl}>` ONLY if the underlying notification carries
    one — no fake link affordance otherwise.
  - **Footer** — `"View all"` link to `/notifications` (the route is
    preserved as a fallback / email deep-link target).
- Trigger badge rules unchanged: hidden at `0`, displayed as `99+`
  above 99, raw count on `data-unread-count` for instrumentation,
  unread-state-aware `aria-label`.

**Data flow:**
- Pages (server components) fetch
  `notificationsRepo.listForUser(userId, { limit: NOTIFICATION_BELL_PREVIEW_LIMIT })`
  alongside their existing `countUnreadForUser` call in the same
  `Promise.all`.
- Records are mapped through
  [`toNotificationPreview()`](../../../app/notifications/notificationPreview.ts)
  to the UI-safe `NotificationPreview` shape — strips `userId`,
  `type`, and `metadata`; flattens `read_at: string | null` to
  `isUnread: boolean`.
- `<AppShell>` gains a `recentNotifications: readonly
  NotificationPreview[]` prop and forwards it to both `AppTopBar` and
  `AppMobileBar`, which pass it through to the bell.
- The bell receives plain props — no client API calls, no polling.
  Mark-all-read goes through the existing
  [`markAllNotificationsRead`](../../../app/notifications/actions.ts)
  server action which already `revalidatePath`s `/` + `/notifications`.

**`/notifications` route decision: KEEP as a fallback.** The route
already exists with real server actions and is the target of
existing email deep-links; deleting it would break those links. It
stays out of the primary rail and is reached via the popover's
"View all" footer link.

**Type/mapper layout (boundary-safe):**

| File | Role |
|---|---|
| [`components/app-shell/notificationPreview.ts`](../../../components/app-shell/notificationPreview.ts) | Pure type definition — no `@/repositories/**` imports (project-structure-and-module-boundaries §4 forbids `components/` from importing `repositories/`). |
| [`app/notifications/notificationPreview.ts`](../../../app/notifications/notificationPreview.ts) | Server-side mapper `toNotificationPreview(record)` + the `NOTIFICATION_BELL_PREVIEW_LIMIT` constant. Pages may import from `@/repositories/**`, so the conversion lives here. |

**Real-only invariants (re-pinned by tests):**
- Bell trigger renders as a `<button>` (NOT a link).
- Empty state is the honest `"No notifications yet."` — no fake rows.
- `"Mark all read"` renders ONLY when `unreadCount > 0` AND is wired
  to the real existing server action.
- Row gets wrapped in `<Link>` ONLY when `actionUrl !== null`.
- `"View all"` href is `/notifications` (the real route).
- No client polling, no client fetch — the popover reflects the
  server-snapshot taken at page render.

**Files added/changed (slice 4.NOTIFICATIONS-POPOVER-1):**
- ✏️ `components/app-shell/NotificationBell.tsx` — Link → Popover.
- ➕ `components/app-shell/notificationPreview.ts` — UI-safe type.
- ➕ `app/notifications/notificationPreview.ts` — `toNotificationPreview`
   mapper + `NOTIFICATION_BELL_PREVIEW_LIMIT`.
- ✏️ `components/app-shell/AppShell.tsx` — adds
  `recentNotifications` prop.
- ✏️ `components/app-shell/AppTopBar.tsx` — threads
  `recentNotifications`.
- ✏️ `components/app-shell/AppMobileBar.tsx` — threads
  `recentNotifications`.
- ✏️ `app/workflows/page.tsx` — `Promise.all` adds
  `listForUser(userId, { limit })`; maps to previews.
- ✏️ `app/apps/page.tsx` — same.
- ✏️ `app/notifications/page.tsx` — reuses its existing
  `listForUser` call; slices the first
  `NOTIFICATION_BELL_PREVIEW_LIMIT` rows for the bell.
- ✏️ `tests/unit/components/app-shell/NotificationBell.test.tsx`
  — replaces the link-only assertions with 11 popover tests
  (trigger button, badge rules, empty state, list rendering, link-
  only-when-actionUrl, conditional Mark-all-read form, View-all
  href).
- ✏️ `tests/unit/components/app-shell/AppShell.test.tsx` — adds
  `markAllNotificationsRead` mock; passes
  `recentNotifications={[]}` to every render; the bell-href
  assertion flips to a tagName check.
- ✏️ `tests/unit/app/AppsPage.test.tsx` — adds `listForUser` to the
  notifications-repo mock (was `countUnreadForUser`-only).

**Closeout slices:**
- **APP-SHELL-NOTIF-BELL-1** — superseded by this slice.
