# Dual Builder — Document rail/layout cleanup (DOC-RAIL-LAYOUT-1)

**Status:** shipped locally (flag-gated: `ENABLE_DOCUMENT_BUILDER`, default OFF — unchanged).
**Scope:** UI layout/state only. No schema, migration, route, AI, engine, entitlement, or
persistence change.

## Problem

In Document mode the persistent React Agent rail stayed open on the left, duplicating the
Document's built-in Ask React bar and squeezing the readable workflow column into a narrow,
off-center strip of a mostly empty canvas.

## Behavior now

- **Document mode defaults to the Agent rail collapsed** (40px spine). The Document owns the
  full workspace; its Ask React bar is the one visible AI entry. Every entry into Document
  mode re-collapses the rail; an explicit open (Ask React or the toggle/spine) lasts until the
  user closes it or switches modes.
- **Visual mode is unchanged** — same default-expanded rail, same per-device localStorage
  persistence (`chainreact:builder:leftAgentRail:collapsed`). Document-mode toggling is
  session-only and **never writes** that key; switching Document → Visual restores the
  persisted Visual state. Implemented as a builder-mode parameter on the existing
  `useLeftAgentRail` hook (`features/workflow-builder/hooks/useLeftAgentRail.ts`) — no new
  store, no new storage key, no DB field.
- **Ask React (empty state · persistent bar · insertion menu) still opens the ONE existing
  rail** and seeds the ONE composer via the versioned composer-seed path. No second rail,
  composer, conversation, route, or Agent state; never auto-sends; never dirties/saves.
- **Rail keep-alive** (`features/workflow-builder/layout/BuilderLeftAgentRail.tsx`): a rail
  that has never been expanded still mounts nothing (no chat effects/network). After the first
  expansion, collapsing HIDES the payload at a stable tree position instead of unmounting it,
  so composer text and the conversation transcript survive close → reopen (both modes).
- **Layout:** the Document column widened 720px → 860px (still prose-width, centered,
  `mx-auto`), top padding tightened (`py-10` → `pt-6 pb-16`) so small workflows sit higher.
  Warm paper styling, masthead, banner, chips, sections, Ask React styling untouched.
- **Panel conflicts:** map = temporary right sheet inside the Document region; inspector =
  the right drawer; map still closes before the inspector opens (unchanged CS-3 rule). Below
  `md` the map becomes an absolute overlay sheet (≤85vw) so a 400px viewport never crushes
  the Document; the expanded rail below `md` keeps its existing stacked (full-width) behavior.

## Evidence

- Unit: `tests/unit/features/workflow-builder/hooks/useLeftAgentRail.test.tsx` (mode-aware
  describe), `tests/unit/features/workflow-builder/layout/BuilderLeftAgentRail.test.tsx`
  (keep-alive describe).
- Integration: `tests/unit/features/workflow-builder/document/documentRailLayout.integration.test.tsx`
  (13 tests: defaults, Visual-state preservation, three Ask React entries → one rail/composer,
  close/reopen state survival, no mutation/dirty/save, flag OFF, map/inspector determinism).
- Live browser: `tests/e2e/dual-builder-rail-layout-journey.spec.ts` (Visual → Document →
  Ask React → close → Visual → map → 1920/1366/1024/400px, overflow checks).
- Screenshots: `owner-review/doc-rail-layout/before-*.png` / `after-*.png`.

## Contract updates (deliberate)

The old "guidance rail unmounts on collapse" assertion in `WorkflowBuilder.test.tsx` and the
"exactly one agent conversation" empty-state assertion in
`creationLayer.integration.test.tsx` were updated to the new contract (hidden-not-unmounted
after first expansion; a never-expanded collapsed rail mounts zero panels).
