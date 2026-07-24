# Slice: Apps + Vehicle Links — Claude Design implementation (APPS-VL-DESIGN-1)

**Type:** local UI slice (presentational + one thin server read). No push.

## Goal

Bring the `ChainV2 Apps.html` / `ChainV2 Vehicle Links.html` Claude Design
direction into the real app for `/apps` and `/apps/vehicle-links`, treating the
mock as a **visual/interaction reference** — not code to copy. All existing
behavior, routes, services, permissions, feature flags, account isolation, and
tests stay intact.

## Key grounding facts (verified in-repo)

- The authenticated shell (`components/app-shell/AppShell.tsx`) already carries
  `data-app-surface="dark"`, which re-themes the HSL tokens in
  `app/globals.css` to **exactly** the design palette (`--primary: 199 89% 60%`
  = the design's sky accent, `--card`, `--border`, `--success`, `--warning`,
  `--destructive`). ⇒ We match the direction with **semantic Tailwind tokens**
  (`bg-card`, `text-primary`, `border-border`, `text-muted-foreground`,
  `text-success`, `text-warning-foreground`, `bg-destructive`), never hardcoded
  hexes, so both light + dark render correctly.
- `AppCatalogItem` DTO shape is safety-pinned (`_shared-dto-safety.test.ts`) —
  we do **not** add fields to it. Bridge data + chip href are threaded as
  **separate props** from the server page.
- Vehicle-links components are heavily test-coupled (testids + copy substrings +
  a load-bearing `.font-medium` hook in a suggestion row). Restyle is a **visual
  wrapper** change: identical logic, testids, copy, and control flow preserved.
- `listVehicleLinks` is readable by any member; `loadMotiveInventory` is one
  account-scoped provider call.

## Apps page (`/apps`)

1. **Bridge summary** (design's "Bridge" panel) — new `features/apps/AppsBridge`
   client component + `services/resourceLinks/vehicleBridgeSummary.loadVehicleBridgeSummary`.
   Rendered only when `ENABLE_RESOURCE_LINKS_UI` is on AND at least one of
   Motive/Fleetio is connected. States:
   - **both connected** → real counts (paired / unpaired / total from
     `listVehicleLinks` + `loadMotiveInventory`) + meter + CTA →
     `/apps/vehicle-links`. This is the only added provider call, gated to
     both-connected users.
   - **one connected** → static prompt, **no** provider call, CTA reuses the
     existing `?highlight=<provider>` deep-link to ring the missing card.
   - **neither** → no bridge.
   - **Deviation:** the mock's "N pairings waiting on your yes" count needs the
     full suggestion matcher (extra Motive+Fleetio load) — omitted from the Apps
     bridge for page performance; the suggestions themselves live on the
     vehicle-links page. The bridge shows honest pairing *progress*.
2. **Vehicle-links chip** on the Motive and Fleetio cards (`AppCard`), flag-gated,
   only on connected cards → `/apps/vehicle-links`.
3. Stat cards / toolbar / category nav: keep existing truthful content; light
   polish only.

## Vehicle Links page (`/apps/vehicle-links`)

Document/sentence restyle of the 5 existing components. Section order + labels
follow the mock (Suggested pairings → Not yet paired → Paired), plus a masthead
tally line and the "labels are last-seen snapshots" footer. Every testid, copy
substring, control, and permission branch is preserved; only presentation
changes (status dots, sentence phrasing, right-margin mono annotations, spacing).
The heading of the suggestions section keeps the token **"Suggested"** because a
test asserts it.

## Non-goals

- No shell/rail/topbar redesign (already the design shell).
- No `AppCatalogItem` contract change.
- No new backend behavior, no mock data, no weakened routes/services/permissions.

## Verification

`npm run typecheck`, `npm run lint`, `npm run lint:structure`, and the focused
Jest suites for apps + vehicle links. Local commit only.
