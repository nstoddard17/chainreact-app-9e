# 4.WORKFLOW-FOLDERS-6B — Nested Folder Tree UI Follow-up

**Type:** Implementation follow-up (UI + tests only). Documented here after the fact.
**Date:** 2026-06-04
**Branch:** `builder-ui-v1-audit-1`
**Commit:** `3f62e4947` (`feat(workflows): nested folder tree navigation in dashboard (WF-5 nested pass)`)
**Builds on:** 4.WORKFLOW-FOLDERS-6 / WF-5 (folders + Trash + filters dashboard UI) and the WF-1..WF-4 backend.

---

## Context

WF-5 had **already shipped** before this follow-up:

- `3f53bff98` — folders + Trash + filters dashboard UI (Slice 4.WORKFLOW-FOLDERS-6 / WF-5).
- `f995703db` — grid-table list view + full-width page + toolbar reorder (WF-5 polish).

The remaining gap: the dashboard's Folders tab rendered folders as a **flat grid** and
never used `parentFolderId`, even though the WF-1..WF-4 backend already supports **depth-3
nesting** (create-with-parent, reparent, per-sibling reorder, `FOLDER_TOO_DEEP` /
`FOLDER_CYCLE` guards). This pass surfaces that nesting in the UI. No backend was touched —
the existing folder API (`lib/api/folders.ts`) already exposed everything needed.

## Design note

The Anthropic `Workflows.html` design bundle URL was **unavailable (HTTP 404 / auth-gated)**
and could not be fetched. Rather than copy unreachable design markup, this pass was built
against the **real V2 backend** and the **existing app-shell / dark design language**, keeping
the established dashboard idioms (cards, lightweight Tailwind modals, popover menus).

## What shipped

- **Nested folder-tree navigation** — the Folders tab is now a drill-down navigator instead of
  a flat grid.
- **Breadcrumb / drill-down browsing** — `All folders / … / current`; a folder name drills into
  its subfolders; "Open →" still narrows the Automations list to that folder.
- **Create subfolder in the current level** — "New folder" becomes "New subfolder" inside a
  folder; the request omits `parentFolderId` at root so the root create shape is unchanged.
- **Move / reparent folder dialog** (`FolderMoveDialog`) — pick a destination folder or
  "Top level".
- **Cycle-safe / depth-safe destinations** — the dialog lists only targets that don't create a
  cycle or exceed the 3-level cap; the server re-validates and any `FOLDER_CYCLE` /
  `FOLDER_TOO_DEEP` is surfaced inline.
- **Move to top level** — reparent a nested folder back to the root.
- **Sibling reorder controls** — ▲/▼ buttons reorder within a sibling group via
  `reorderFolders` (no drag-and-drop system).
- **Stale-nav fallback to root** — if the browsed folder is deleted / moved to Trash /
  restored away, the navigator falls back to the top level instead of stranding on a ghost.
- **Hierarchy-indented folder filter facet** — the filters panel's Folder facet indents by
  depth so nested folders read as a tree.

New pure helper module `features/workflows/folders/folderTree.ts` holds the hierarchy logic
(children, depth, path, descendants, subtree height, create-gate, eligible-move-parents,
flatten-for-display) — UX gating only; the server remains the source of truth.

## What stayed intact

All prior WF-5 behavior and test ids were preserved:

- Trash view
- restore
- "purges in N days" copy
- undo snackbar via `deleteOperationId`
- two-mode folder delete (folder-only / with-contents)
- the filter system (search, status, folder, apps, date, sort, clear-all, active count)
- empty states (no-workflows, no-matches, empty-folder, no-folders, empty-trash, limit)

## Scope boundaries

- No schema / migrations.
- No backend behavior; no new API routes; no new API-client wrappers (reused
  `createFolder` / `updateFolder` / `reorderFolders`).
- No folder permissions / sharing / billing / credentials.
- No account-scoped URLs.
- No Team / Business / Enterprise divisions.
- No new drag-and-drop dependency.
- Folders remain account-scoped organization only.

## Verification

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run lint` — 0 errors (one pre-existing `max-lines` warning on `WorkflowsDashboard.tsx`;
  the file was already 458 lines at HEAD before this pass).
- Targeted nested-folder tests — `folderTree.test.ts` + the +5 nested-tree cases in
  `WorkflowsDashboardFolders.test.tsx` (drill + breadcrumb, subfolder create, depth-3 cap,
  move-to-top-level, sibling reorder) green, alongside the existing WF-5 suites.
- Full Jest — **15475 passed / 0 failed / 104 skipped**.
