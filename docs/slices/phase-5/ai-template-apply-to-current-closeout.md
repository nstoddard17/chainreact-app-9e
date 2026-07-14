# AI-TEMPLATE-APPLY-CURRENT — apply a React Agent template to the current workflow

**Status:** implemented, local-only (not pushed). Slice marker: `AI-TEMPLATE-APPLY-CURRENT`.

## Problem / incident

When a user was **already editing a workflow in the builder** and accepted an official-template
suggestion from the React Agent rail ("Preview template" → "Use this template"), ChainReact
**created a brand-new workflow and navigated away** — closing the builder session the user was in.
There was no "apply to the workflow I'm editing" option; create-new was the only path.

## Root cause

`features/workflows/useTemplatePreviewFlow.ts` (`confirmUse`) unconditionally called the create-new
route (`useTemplate` → `POST /api/workflow-templates/[id]/use`) then `router.push(/workflows/{new})`.
That hook is shared by the dashboard single-shot panel (where create-new is correct) **and** the
builder conversational rail (`WorkflowGuidancePanel` conversational mode, via `BuilderGuidanceRail`).
In the builder the same create-new+navigate ran, so the open workflow's context (id/name/URL/session)
was abandoned. The AI **plan/preview** apply path was already correct (in-place, checkpoint+History);
only the **official-template-match** path was wrong.

## Behavior now

The initial suggestion click still only opens a **preview** (no write). Inside the builder the
confirmation dialog now presents an explicit **choice** (never two identical "Use" buttons):

- **Apply to current workflow** (primary, recommended) — overwrites the current workflow's draft with
  the template. Keeps the **same workflow id, name, and URL**; no new workflow row; no navigation. A
  **checkpoint** of the pre-replace draft is captured first and a **History** row is recorded (linked
  to the checkpoint → "Restore"), so the change is undoable from the builder's History tab. On failure
  the dialog stays open with safe copy — the previous draft is intact, nothing is created, no fallback
  workflow.
- **Create as new workflow** (secondary) — the original explicit escape hatch: creates one separate
  workflow and navigates to it, leaving the current workflow unchanged.
- **Cancel** — no write, no navigation.

On the **dashboard** (no open workflow) the dialog is unchanged: a single "Use this template"
create-new action.

### Active-workflow safety

The in-place apply reuses the **existing** `POST /api/workflows/[id]/replace-from-template` route and
`replaceWorkflowWithTemplate` service. That service now persists through the **canonical
`saveDraftDefinition`** path (the one shared save+lifecycle rule used by manual save, AI-apply, and
checkpoint restore) instead of its former bespoke blanket-disable. So an ACTIVE workflow whose
activatable trigger changes is deactivated exactly as any other save would deactivate it (stale
`trigger_resources` / provider subscriptions torn down; user reconnects + reactivates); action/layout
or manual-trigger-only replaces leave it active. No parallel lifecycle path.

## Reuse (no second mutation path)

- **Replace/save:** existing `replaceWorkflowWithTemplate` + `saveDraftDefinition` (canonical).
- **Checkpoint:** existing `services/workflows/checkpoints.createCheckpoint` (source `react_agent`).
- **History:** existing `services/workflows/agentChangeHistory.recordAgentChange`
  (`preview_created` → `preview_applied`, checkpoint-linked).
- **Client re-hydration:** the builder re-hydrates the graph from the returned `WorkflowDetail` and
  `router.refresh()`es (same pattern the in-builder Templates modal uses).

Checkpoint + History are opt-in via `origin: "react_agent"` on the replace route (mapped to
`recordHistory` on the service). The in-builder Templates **modal** omits it, keeping its existing
"can't be undone" behavior — no change to that surface.

## Files changed

**Server**
- `services/workflows/templateManagement.ts` — `replaceWorkflowWithTemplate`: canonical
  `saveDraftDefinition`; `recordHistory` → pre-mutation checkpoint + `preview_created`/`preview_applied`
  History (both fail-open).
- `app/api/workflows/[id]/replace-from-template/route.ts` — optional `origin: "react_agent"` (strict) →
  `recordHistory: true`.

**Client / shared panel**
- `lib/api/workflowTemplates.ts` — `replaceCurrentWorkflowFromTemplate(..., { origin })`.
- `features/workflows/useTemplatePreviewFlow.ts` — apply-to-current path + `canApplyToCurrent`.
- `features/workflows/GuidanceTemplatePreviewDialog.tsx` — two-option choice UI (in-builder only).
- `features/workflows/WorkflowGuidancePanel.tsx` — threads `workflowId` + `onTemplateApplyToCurrent`
  (conversational mode only; dashboard `SingleShotGuidancePanel` unchanged).

**Builder**
- `features/workflow-builder/hooks/useBuilderPreview.ts` — expose `refreshAgentChanges`, `showApplyNotice`.
- `features/workflow-builder/panels/BuilderGuidanceRail.tsx` — forward `onTemplateApplyToCurrent`.
- `features/workflow-builder/WorkflowBuilder.tsx` — `handleTemplateApplyToCurrent` (replace → re-hydrate
  → refresh History → `router.refresh()` → success notice); throws on failure.

**Tests**
- `tests/unit/services/workflows/templateReplace.test.ts` (rewritten for canonical delegation +
  checkpoint/History + fail-open).
- `tests/unit/app/api/workflows/template-from-builder-routes.test.ts` (origin → recordHistory; strict).
- `tests/unit/features/workflows/useTemplatePreviewFlow.test.tsx` (apply-to-current + failure paths).
- `tests/unit/features/workflows/GuidanceTemplatePreviewDialog.test.tsx` (choice UI).
- `tests/unit/features/workflows/ai-template-application-keeps-current-workflow.test.tsx` (regression).

## Data / migration impact

**No migration.** Reuses existing `workflow_checkpoints` + `agent_change_history` tables. No production
data touched; no backfill needed for existing AI suggestions (behavior is decided at apply time).

## Verification

- `npx tsc --noEmit` → clean.
- `npm run lint` (changed files) → 0 errors (1 pre-existing `max-lines` warning on `WorkflowBuilder.tsx`).
- `npm run lint:structure` → OK.
- Jest (6 suites, 103 tests) → all pass; plus regression suites for the builder hook/panel/rail,
  checkpoints, and agent-change-history services → pass.

## Follow-ups / caveats

- `WorkflowBuilder.tsx` remains over the `max-lines` soft cap (pre-existing); the ~28-line handler is a
  small, justified addition. Extraction to a hook is a future tidy-up, not required here.
- The in-builder Templates **modal** replace still has no checkpoint (out of scope). Making it undoable
  too would be a small follow-up (pass `recordHistory` from the modal path).
