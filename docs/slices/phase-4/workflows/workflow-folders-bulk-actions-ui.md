# 4.WORKFLOW-FOLDERS-6C — Workflow Bulk Actions UI

**Type:** Implementation (UI + hook + tests).
**Date:** 2026-06-04
**Branch:** `builder-ui-v1-audit-1`
**Builds on:** 4.WORKFLOW-FOLDERS-6 / WF-5 (folders + Trash + filters dashboard UI) and
4.WORKFLOW-FOLDERS-6B (nested folder tree UI).

---

## Context

The WF-5 dashboard already provides folders, Trash, restore/undo, and the filter system,
and 6B added depth-3 nested folder navigation. This slice adds **list-view multi-select with
bulk actions** so a user can check several workflows and mass-move them to a folder or mass-move
them to Trash in one gesture, instead of repeating the per-row actions menu.

It is a pure UI/UX addition over the **existing** single-item workflow APIs — no new backend.

## What shipped

- **Per-row checkboxes** in the list/table view — a leading 28px select lane
  (`WORKFLOW_ROW_GRID_SELECTABLE`) with a subtle row highlight when selected.
- **Select-all header checkbox** with **indeterminate** state — selects every currently visible
  (filtered) row.
- **Bulk action bar above the table**, shown when ≥1 workflow is selected: a "N selected" count,
  a **Move to folder** popover (Uncategorized + folders, hierarchy-indented), **Move to Trash**,
  and **Clear**.
- **Bulk move to folder / Uncategorized** — fans the existing `moveWorkflowToFolder(id, folderId)`
  over the selection (`folderId = null` → Uncategorized).
- **Bulk move to Trash** — fans the existing `deleteWorkflow(id)` over the selection.
- **Clear selection** — empties the selection and hides the bar.
- **Undo snackbar for bulk trash** — reuses the existing undo toast ("N workflows moved to
  Trash · Undo") and restores every workflow via `restoreWorkflow(id)`.
- **Selection pruning** — ids that filter out of view are dropped automatically, so a bulk action
  can never touch a hidden row.
- **Selection clears** when leaving the list view or the Automations tab.

### Files

- `features/workflows/WorkflowRow.tsx` — optional `selectable` / `selected` / `onSelectChange`
  props + the leading checkbox cell + `WORKFLOW_ROW_GRID_SELECTABLE`.
- `features/workflows/WorkflowsTable.tsx` — selection props + select-all header checkbox
  (indeterminate via a ref).
- `features/workflows/folders/WorkflowsBulkActions.tsx` — the bulk action bar (new).
- `features/workflows/folders/useWorkflowSelection.ts` — selection state + bulk move/trash
  fan-out + prune/clear effects, extracted from the dashboard so the orchestrator stays lean and
  the logic is independently testable (new).
- `features/workflows/WorkflowsDashboard.tsx` — wires the hook, renders the bar + selectable
  table.

## Scope boundaries

- **No bulk backend endpoint** — bulk move/trash/restore fan the existing single-item APIs
  (`moveWorkflowToFolder` / `deleteWorkflow` / `restoreWorkflow`) over the selection.
- **No grid/card selection** — checkboxes are list/table-view only.
- **No sticky bottom bar** — the bar sits above the table (deferred UX option).
- No schema / migrations; no new API routes; no new API-client wrappers.
- No folder permissions / sharing / billing / credentials; no account-scoped URLs.
- Existing undo behavior preserved.

## Verification

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run lint` — 0 errors (one pre-existing `max-lines` warning on `WorkflowsDashboard.tsx`;
  selection logic was extracted into `useWorkflowSelection` to keep the orchestrator near its
  prior size).
- Full Jest — **15480 passed / 0 failed / 104 skipped**.
- New bulk tests in `tests/unit/features/workflows/WorkflowsDashboardFolders.test.tsx`:
  - selecting a row reveals the bulk bar; select-all checks every row; Clear hides the bar;
  - bulk-moves every selected workflow into a folder (per-id fan-out);
  - bulk-moves selected workflows to Uncategorized;
  - bulk-trashes selected workflows and Undo restores each;
  - drops selection that filters out of view.
