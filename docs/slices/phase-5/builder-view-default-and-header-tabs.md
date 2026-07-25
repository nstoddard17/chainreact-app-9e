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

## Deferred

- A WorkflowBuilder-level integration test of the chooser end-to-end (the
  chooser, resolution, and route threading are each covered in isolation).
- A service-layer unit test for the trivial pass-through
  (`builderViewPreference.ts`) — covered via the route tests.
- Live browser QA of the chooser + tab strip in Document mode (not performed
  in this session).
