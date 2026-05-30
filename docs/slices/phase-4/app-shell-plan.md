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

## Design-parity tune — Slice 4.APP-SHELL-DESIGN-PARITY-1

**Design source for shell visual parity:** the `TopBar` + `Sidebar`
idiom in `chainv2builder/project/src/workflows-page.jsx` (≡ the same
file the Workflows + Connections pages consume). The same design
tokens / spacing language already drives the in-page toolbars
(`WorkflowsToolbar`, `AppsToolbar`); the shell now reuses them.

**What changed visually** (no route, no API, no nav-item changes —
pure CSS tune; zero tests modified):

| Component | Before (APP-SHELL-1) | After (APP-SHELL-DESIGN-PARITY-1) |
|---|---|---|
| `AppHeader` | `bg-background/95 backdrop-blur-sm`, variable height (`py-3`) | Solid `bg-card`, hard `border-b`, fixed `h-14` (= design's 56px), no blur |
| `AppNav` (desktop) | Inline pills, active = `bg-primary/10 text-primary` | Segmented-tab container `rounded-md border bg-muted/40 p-0.5`; active = `bg-background text-foreground shadow-sm`; inactive = `text-muted-foreground hover:text-foreground` — matches `WorkflowsToolbar` status-filter group exactly |
| `AppMobileNav` trigger | `h-9 w-9 bg-card` | `h-8 w-8 bg-muted/40` with hover-darken — matches the V2 icon-button idiom used in `AppsToolbar` |
| `UserMenu` trigger | Solo 32×32 initials circle | Pill: initials avatar (28×28) + chevron-down inside a rounded-full `bg-muted/40` pill — matches the design's `tb-profile` button (`workflows-page.jsx:223-231`) |

**Deferred design-shell elements** (out of scope here — already noted
above and unchanged by this tune):

- Left slim icon rail (`Sidebar` in the design). Only 2 of its 8
  items (Automations → `/workflows`, Connections → `/apps`) resolve
  to real V2 routes; the other 6 (Templates, AI assistant, Activity,
  Team, Billing, Settings) would be fake links. The top-only shell
  covers the real navigation surface without rendering empty rails.
  Sidebar revisits when ≥ 5 of those routes ship.
- Global `⌘K` search input (`tb-search`) — no cross-surface search
  index yet.
- Task-usage progress meter (`tb-tasks`) — billing/tasks scope
  intentionally untouched.
- Notification bell + unread-count dot (`tb-bell`) —
  `countUnreadForUser` is wired in the repository, but the design's
  bell deep-links into a panel/popover that doesn't exist. The
  existing `/notifications` nav item already exposes the same data
  without duplication.
- Theme toggle — locked decision (no global theme system).
- Workspace switcher — no workspaces in V2 yet.

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

`AppShell` (server) → `AppHeader` (server) composes `AppBrand` (server) +
`AppMobileNav` (client — Popover) + `AppNav` (client — `usePathname`) +
`UserMenu` (client — Popover + server-action form). Auth is the caller's
responsibility; the shell ASSUMES it's rendering inside a server
component that already verified `auth.getUser()` and gated on it.

## Implemented vs deferred (design → V2)

| Design element                              | This slice                                                                |
|---|---|
| Sticky top header                            | ✅ `sticky top-0 z-40 h-14 bg-card border-b` (design-parity tune Slice 4.APP-SHELL-DESIGN-PARITY-1 — solid panel, hard 1px border, fixed 56px height, no backdrop blur — matches Workflows / Connections `TopBar`) |
| Brand mark + wordmark                        | ✅ Real ChainReact mark + "ChainReact" text → links to `/workflows`       |
| Primary nav (desktop)                        | ✅ Workflows / Apps / Notifications inside a segmented `rounded-md border bg-muted/40 p-0.5` container; active item is a white pill with shadow — same pattern as `WorkflowsToolbar` / `AppsToolbar` so the shell visually belongs with the pages |
| Mobile hamburger + popover                   | ✅ Same item set, `aria-expanded` + closes on item click; trigger restyled to match V2 icon-button idiom (`h-8 w-8 bg-muted/40`) |
| User menu                                    | ✅ Pill-shape trigger (initials avatar + chevron, matches design profile button) + popover with email + Sign out form |
| Workspace breadcrumb ("Acme Co › …")         | ⏸️ **Deferred** — no workspaces in V2                                       |
| Workspace switcher                           | ⏸️ **Deferred** — same reason                                              |
| Left sidebar / vertical rail                 | ⏸️ **Deferred** — top header alone covers nav scope today                  |
| Global search                                | ⏸️ **Deferred** — no search index across workflows + apps + runs yet       |
| Notifications bell badge                     | ⏸️ **Deferred** — has its own `/notifications` route; not surfaced inline  |
| Theme toggle                                 | ❌ Out of scope (locked decision; no global theme system)                  |
| Settings / Billing / Account menu items      | ❌ **Not rendered** — no real routes                                       |
| "Create workflow" CTA in header              | ⏸️ **Deferred** — `WorkflowsDashboard` already exposes Create; adding to header would duplicate |

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
- **APP-SHELL-NOTIF-BELL-1** — inline unread-notifications bell badge
  in the header (reuses `notificationsRepo.countUnreadForUser`).
