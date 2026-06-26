# UX-Quality Session Closeout — 2026-06-26

**Type:** Session closeout (docs only). Consolidates the product-quality slices landed
on `v2-main` this session. **Nothing pushed — all commits are local.**
**Branch:** `v2-main`

This is a roll-up. Each item links to its own detailed plan/closeout; this doc is the
single index of what shipped locally this session, what changed, and what is still
open.

---

## 1. Connected Apps recovery

**Arc:** `507a228e8` (audit + plan) → `e7ba8bc33` (CS-1) → `e9bd83c36` (CS-2) →
`0150fe2bc` (arc closeout) → `056521a00` (manual QA checklist).
**Detail docs:** [connected-apps-recovery-ux-closeout.md](../workflows/connected-apps-recovery-ux-closeout.md),
[connected-apps-recovery-ux-plan.md](../workflows/connected-apps-recovery-ux-plan.md),
[connected-apps-recovery-manual-qa-checklist.md](../workflows/connected-apps-recovery-manual-qa-checklist.md).

### 1a. Runtime reconnect-needed signal (CS-1, `e7ba8bc33`)

- **Before:** a non-refreshable credential that failed in the background (e.g. a
  smoke/real connection revoked provider-side) left the Apps card **green-while-broken**
  — nothing flipped the row until a manual health check or option-load happened to mark
  it.
- **After:** at the execution seam ([services/oauth/refreshAndRetry.ts](../../../../services/oauth/refreshAndRetry.ts)),
  the two **durable** auth-required exits (`refresh_not_supported`, `refresh_failed`)
  best-effort mark **exactly that integration row** `needs_reconnect_at` and fire **one**
  connector notification. Transient (5xx / network / config) failures do **not** mark.
  The original run failure always still surfaces — marking is best-effort and never
  masks it.
- **Guarantees:** per-row only (never provider/account-wide); one-shot via the
  conditional `needs_reconnect_at IS NULL → now()` UPDATE; DTO still emits booleans +
  the opaque row id only (no timestamp/token/scope/provider-account leak).

### 1b. Collapsed-card Reconnect / Review reconnects UX (CS-2, `e9bd83c36`)

- **Before:** the per-row Reconnect affordance was only reachable **after** discovering
  the expand chevron — a broken connection on a collapsed card had no visible recovery
  control.
- **After:** [deriveCollapsedReconnect](../../../../features/apps/collapsedReconnect.ts) drives a
  collapsed-card affordance:
  - exactly **one** reconnectable broken row → a direct **Reconnect** button
    (`app-card-collapsed-reconnect`) bound to that row's opaque id;
  - **multiple / mixed** broken rows → **Review reconnects** (`app-card-collapsed-review`)
    which expands the card (never auto-picks an identity to re-auth);
  - **only blocked** broken rows → status pill "Reconnect needed", **no** actionable
    button (never a dead control). Hidden once expanded.
- Every affordance reuses the real, authorized per-row reconnect OAuth start — no fake
  controls, no new authz path (inherits the existing `canReconnect` gate).

### 1c. Manual QA checklist (`056521a00`)

- The arc is fully covered by deterministic unit/component tests. The **one** remaining
  caveat is live: there is no safe automated way to force a *runtime* 401 on a
  smoke-owned connection without real provider mutation.
- Added [connected-apps-recovery-manual-qa-checklist.md](../workflows/connected-apps-recovery-manual-qa-checklist.md):
  the explicit procedure for the live loop (break smoke-owned credential → background run
  hits auth failure → exact row flips to reconnect-needed → collapsed single-row
  Reconnect vs multi-row Review reconnects → per-row reconnect targets the exact row →
  reconnect clears `needsReconnect` → notification fires once → disconnect
  warning/cascade unchanged), plus safety notes (no real credentials, smoke connection
  only, no send/broadcast actions, ids in local notes only).

---

## 2. Builder drawer close UX (`03c2a46cf`)

**Marker:** `BUILDER-VALIDATION-PANEL-CLOSE-UX`. **File:**
[features/workflow-builder/layout/BuilderRightDrawer.tsx](../../../../features/workflow-builder/layout/BuilderRightDrawer.tsx)
+ its test.

- **Before:** the far-right builder drawer (Inspector / Run results / **Validation**)
  close `×` was a bare muted glyph with **no chrome until hover** — easy to miss as an
  interactive control. And a header-originated floating callout
  ([HeaderRunControls](../../../../features/workflow-builder/layout/HeaderRunControls.tsx)'
  `z-10` private-credential status, hanging `top-full right-0`) could **paint over** the
  drawer's top-right corner where the only dismiss control lives, making the panel feel
  "stuck".
- **After:**
  - **Visible close button:** the `×` now carries standing chrome (border +
    `--builder-panel-2` background) so it reads as a real, reachable control at rest, not
    just on hover. Kept `aria-label="Close drawer"`, added `title="Close (Esc)"`; Esc +
    `onClose` behavior unchanged.
  - **Z-index guard:** the drawer header is now `relative z-30`, establishing a stacking
    context so **any** header-originated floating callout can never paint over the close
    control (generic fix, not a one-banner patch). The historical "N setup issues to fix
    before activate" callout that previously overlapped it was already removed earlier
    (`0f78c3576`); this hardens the corner for good.
- **Unchanged:** validation/activation gating, the header validation pill, and the
  validation summary list. No fake controls.

---

## 3. Commits this session (local on `v2-main`)

| Commit | Summary |
|--------|---------|
| `507a228e8` | docs(apps): connected-apps recovery UX audit + plan |
| `e7ba8bc33` | feat(integrations): mark reconnect-needed at the execution seam (CS-1) |
| `e9bd83c36` | feat(apps): collapsed-card reconnect discoverability (CS-2) |
| `0150fe2bc` | docs(apps): connected-apps recovery UX arc closeout (CS-3) |
| `03c2a46cf` | fix(builder): right validation/setup panel close control visible + unobstructable |
| `056521a00` | docs(apps): connected-apps recovery manual QA checklist |
| _(this doc)_ | docs: UX-quality session closeout (roll-up) |

---

## 4. Shipped locally vs not pushed

- **All of the above is local on `v2-main` and has NOT been pushed.** No deploy, no
  `db:push`, no feature-flag flips.
- **No migration added** by these slices. Connected Apps recovery relies on
  `needs_reconnect_at` (`20260624000000`), the reconnect-needed notification type
  (`20260625000000`), and the authenticated-write revoke (`20260627000000`) — all
  predate this work and are already applied.
- **No feature flag added.** The recovery surface (reconnect/disconnect/collapsed
  affordance) is unflagged correctness/discoverability; the builder close fix is
  additive UI. `HERMES_AGENT_ENABLED` untouched.

---

## 5. Remaining caveats

- **Connected Apps live recovery QA is pending** — the deferred live loop is now
  documented (§1c) but has not been run as a live smoke; it needs a tester with a
  smoke-owned connection.
- **Notification recipient = connector** (`connected_by_user_id`); when null, the notify
  is skipped with no owner/admin escalation (inherited limitation, not built here).
- **Builder close fix verified by unit/component tests**, not a live visual pass.
- **jsdom note:** `var()` inline styles don't survive jsdom serialization, so the
  drawer's always-visible close affordance is asserted via the `border` utility class
  (not the inline `background`). The visual chrome is real in the browser.

---

## 6. Verification baseline (this session)

- BuilderRightDrawer: `…/layout/BuilderRightDrawer.test.tsx` → **8/8 pass**; broader
  `…/workflow-builder/layout/` + `…/panels/` → **276 tests pass**. eslint on touched
  files → **0**. `npx tsc --noEmit` → clean.
- QA checklist + this doc: docs-only; `npm run lint:structure` → **OK**;
  `npx tsc --noEmit` → **exit 0** (re-confirmed repo builds clean).
- Connected Apps recovery arc: see its closeout §8 (36 suites / 439 tests + 3 suites /
  65 tests, tsc exit 0, eslint 0, lint:structure OK — measured at that arc's close).

**Nothing pushed.**
