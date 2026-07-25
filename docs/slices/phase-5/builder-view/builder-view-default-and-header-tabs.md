# Builder view choice + header tabs (BUILDER-TABS-HEADER-1 · BUILDER-VIEW-DEFAULT-1)

Two local commits. Everything is gated on `ENABLE_DOCUMENT_BUILDER` exactly like
the existing Visual/Document toggle — flag off keeps the builder behavior
identical (chooser never shows, preference rows hidden, view locked to visual).

## 1. Header tab strip — both view modes (BUILDER-TABS-HEADER-1)

The `Builder | Runs | Data Map | History | Settings` tablist moved out of the
Visual-only `CanvasActionBar` into `layout/BuilderTabStrip.tsx`, rendered by
`WorkflowBuilder` in the shell's header region (under the 48px action bar).
Tab state lives in `WorkflowBuilder` (survives Visual/Document switches;
resets per workflow). The non-Builder tab bodies render via
`layout/BuilderTabPanels.tsx` ABOVE the mode branch — so the Document view now
reaches Runs / Data Map / History / Settings too. `CanvasActionBar` keeps only
the env/trigger/count tags + Add action; `WorkflowCanvas` is builder-content
only (dropped `workflowSettings` / `onWorkflowNameSaved` / `runEditBlocked` /
`historyPanel` props).

## 2. Per-user default view + first-open chooser (BUILDER-VIEW-DEFAULT-1)

**Storage:** `user_profiles.default_builder_view` (additive migration
`20260803000000…`, nullable, CHECK 'visual'|'document', inherits the
row-scoped RLS + updated_at trigger — same shape as the notify_* columns;
**applied to the dev DB via `npm run db:push`**). `null` = "no default chosen".

**Chain (mirrors notification-preferences):**
`contracts/builderViewPreference.ts` → `repositories/userProfiles.ts`
(`get/updateDefaultBuilderView`, session client, self-row only) →
`services/accounts/builderViewPreference.ts` →
`GET/PATCH /api/account/builder-view` (session-scoped, strict zod, null clears)
→ `lib/api/accounts.ts` helpers.

**Resolution order** (`readBuilderViewPref(workflowId, serverDefault)`):
per-workflow localStorage (last used on THIS workflow/device) → server default
(explicit user choice) → device-wide localStorage → `"visual"`.

**The ask:** every creation flow (`CreateWorkflowButton`,
`OnboardingCreateChooser`, Templates dashboard/preview/builder-modal,
`AnonymousDraftRestorer`) now navigates to `/workflows/{id}?created=1`. The
route parses the one-shot marker + the user's saved default; with the flag on,
`justCreated` and **no saved default**, `WorkflowBuilder` shows
`panels/BuilderViewChooser.tsx` — Visual/Document option cards + an OPT-IN
(unchecked) "Always use this view" checkbox. Choosing switches immediately and
writes the local pref; remembering also PATCHes the server default (fail-safe:
a failed save never blocks building). Dismiss (× / Esc) keeps the current view
and saves nothing → asks again on the next new workflow. The `?created` param
is stripped after mount (history.replaceState, same idiom as `?focus`).
Anonymous local-only drafts never see the chooser.

**Changing it later:** the shared `features/account/DefaultBuilderViewControl`
("Ask each time / Visual builder / Document builder", optimistic save +
revert-on-error) renders in BOTH: Account settings → Profile ("Default builder
view" row) and the builder's Settings tab ("Your preferences" section). Both
surfaces exist only while the flag is on.

## Tests

Stage 1: `layout/BuilderTabs.test.tsx` (strip order/selection + each tab's real
panel, carried from the old canvas tab tests), rewritten
`CanvasActionBar.test.tsx` / `WorkflowCanvas.test.tsx`; full workflow-builder
tree green (206 suites / 2,486). Stage 2: route guards
(`builder-view.route.test.ts`), resolution order
(`documentViewPref.serverDefault.test.ts`), chooser behavior
(`BuilderViewChooser.test.tsx`), control load/save/revert
(`DefaultBuilderViewControl.test.tsx`), both settings surfaces flag-on/off
(`BuilderViewPreferenceSurfaces.test.tsx`), and the 8 creation-flow suites
updated to pin `?created=1`. Affected sweep: 258 suites / 3,058 tests green.

## Real-browser certification (BUILDER-VIEW-QA-1, 2026-08-03 local dev)

Driven with Playwright (headless Chromium) against the local dev server +
dev DB, using a disposable service-role-created `@chainreact.test` user
signed in through the app's real `/auth/callback` (the e2e harness's
captcha-free recovery-link path). **48/48 scenario checks passed** after two
QA fixes (below). Highlights, with the exact scenarios:

- **Chooser / creation paths:** appears on Create-button and template-"Use"
  creations (`?created=1`); Visual/Document open the right view; unchecked
  choice is per-workflow (next creation asks again); checked choice saves the
  account default (next creation skips, opens Document); × and Esc dismiss;
  reload, existing workflows, and back/forward never re-show it; the
  `?created` marker is stripped from the URL after mount.
- **Header tabs:** strip renders under the header in BOTH modes; Runs stayed
  selected across a Document→Visual switch; exactly 5 tabs (no duplicate
  strip); canvas bar keeps env/trigger/count tags + "+ Add action";
  keyboard Tab reaches tabs and Enter activates; usable at 768px and 375px
  with 0px horizontal page overflow; no console/page errors.
- **Preference surfaces:** Account→Profile and builder Settings read the same
  saved value; a builder-side change shows in Account after reload; "Saved."
  confirmation appears; "Ask each time" clears the default and the chooser
  returns.
- **Resolution order, proven layer by layer:** (L1) workflow last used as
  Document opened Document despite a Visual account default; (L2) in a fresh
  browser context with a planted `document` device key, the Visual server
  default won; (L3) with the server default cleared, the device key won;
  (L4) with no layers at all, Visual.
- **Flag OFF** (separate worktree server, `ENABLE_DOCUMENT_BUILDER=false`,
  same dev DB, stored `document` server preference + planted `document`
  localStorage): builder renders Visual, NO view toggle, NO Document view,
  NO chooser on a new workflow, NO preference rows in account Profile or
  builder Settings, tab strip fully functional, zero page errors.

### Defects found and fixed (commit `a152c0fe4`)

1. **Chooser re-showed after back→forward** on the same workflow — Next's
   router cache remounts the builder with the original `justCreated=true`
   payload. Fixed with a session-scoped per-workflow resolved marker
   (`chainreact:builder:viewChooserResolved:<id>`).
2. **Chooser was mouse-only** — the dialog never took focus, so keyboard Tab
   traversed the page behind the overlay. Fixed with a mount focus on the
   dialog. Both re-verified in the browser and pinned by unit tests.

## Migration + production deployment order

`20260803000000_user_profiles_default_builder_view.sql` re-reviewed:
additive + forward-only + idempotent (`ADD COLUMN IF NOT EXISTS`), nullable
(null ≡ "Ask each time"), CHECK-constrained to `visual|document`, inherits
row-scoped RLS (`user_profiles_{select,update}_own`) + `set_updated_at`; no
existing migration edited; no generated-types drift (repo uses hand-typed
repository contracts, updated in `repositories/userProfiles.ts`).
**Order-safety:** old app code never selects the new column → applying the
migration first is safe under old code; new code reads via `.maybeSingle` +
schema-parse with a null fallback and the builder route wraps the read in
try/catch → a briefly missing/inaccessible column degrades to "no default",
never a broken page. Recommended production order: (1) apply migration,
(2) verify column exists + profiles readable, (3) deploy app commits,
(4) production smoke + authenticated checks. **Not performed — awaiting
Marcus's authorization.**

## Remaining limitations

- The chooser was NOT browser-certified on the onboarding-checklist and
  anonymous-draft-restore creation paths (both go through the same
  `?created=1` navigation, pinned by their unit suites; anonymous restore
  additionally blocked in automation by sign-up captcha).
- "Open failed step" returning to the Builder tab is pinned by unit tests
  (`BuilderTabs.test.tsx`); fabricating a real failed run in the browser was
  out of budget.
- No new Playwright specs were committed: the certification drivers live in
  the session scratchpad and depend on service-role user creation; porting
  them into `tests/e2e` is follow-up work.
- Hydration: no flicker or hydration errors were observed on monitored
  loads; the theoretical SSR-vs-localStorage mismatch predates this arc
  (device-pref layer) and is unchanged.

## Release-readiness verdict

**Code-ready.** Both features + QA fixes are browser-certified with the flag
on and off, the migration is deploy-order-safe, and all gates pass locally.
Release is **not** push-clean in isolation: unrelated concurrent-session
commits sit between/above these commits on `v2-main` (see the batch Owner
Report) — releasing ONLY this work requires either the concurrent work to
ship first or a cherry-pick release worktree. Production remains unverified
until after an authorized deploy.

## Deferred

- A WorkflowBuilder-level integration test of the chooser end-to-end (the
  chooser, resolution, and route threading are each covered in isolation).
- A service-layer unit test for the trivial pass-through
  (`builderViewPreference.ts`) — covered via the route tests.
- Porting the scratchpad browser drivers into committed `tests/e2e` specs.
