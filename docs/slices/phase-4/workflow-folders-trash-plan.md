# 4.WORKFLOW-FOLDERS-1 — Workflow Folders + Trash Model Plan

**Type:** Planning / design only. No code, schema, migrations, tests, or UI in this slice.
**Date:** 2026-06-03
**Branch:** `builder-ui-v1-audit-1`
**Source of truth (verified current state):**
[20260506000000_workflows.sql](../../../supabase/migrations/20260506000000_workflows.sql) ·
[20260530000003_workflows_account_cutover.sql](../../../supabase/migrations/20260530000003_workflows_account_cutover.sql) ·
[20260531000006_account_deletion_lifecycle.sql](../../../supabase/migrations/20260531000006_account_deletion_lifecycle.sql) ·
[repositories/workflows.ts](../../../repositories/workflows.ts) ·
[core/workflows/lifecycle.ts](../../../core/workflows/lifecycle.ts) ·
[app/api/cron/purge-pending-deletions/route.ts](../../../app/api/cron/purge-pending-deletions/route.ts)

> **Planning only.** This proposes a V2 workflow folder + trash model and breaks the work
> into slices. Nothing here is built. The model deliberately mirrors the **already-shipped
> account-deletion lifecycle** (`purge_after` + partial index + service-role flag-gated purge
> cron) rather than inventing a new soft-delete mechanism.

---

## 1. Context

V1 had workflow folders, nested folders, and a self-cleaning weekly trash folder. We want the
same user value in V2 with a cleaner model. Two facts from the current V2 schema shape the
whole design:

1. **Workflows already soft-delete.** The `workflow_state` enum already includes `deleted`,
   and `workflows.deleted_at timestamptz` is already set by the `delete` lifecycle transition
   (`applyTransition({ setDeletedAt: true })`,
   [repositories/workflows.ts:444](../../../repositories/workflows.ts)). The list query already
   excludes deleted rows (`listByAccount` → `.neq("state", "deleted")`). **But `deleted` is
   terminal** — `core/workflows/lifecycle.ts` has no `restore` transition out of it, and there
   is **no `purge_after`, no restore window, and no trash batch grouping.** So V2 has a
   one-way soft-delete today, not a trash.
2. **The account-deletion lifecycle is the precedent to copy.** Account deletion already
   implements exactly the trash shape we need: a `purge_after timestamptz`, a partial index
   `WHERE deletion_status = 'pending_deletion'`, a durable audit trail, and a **service-role,
   flag-gated purge cron** (`ENABLE_ACCOUNT_PURGE_CRON`, route at
   `app/api/cron/purge-pending-deletions`). We reuse that shape rather than inventing one.

**Workflows are account-owned.** `workflows.account_id` is `NOT NULL` (FK to `accounts(id)`
`ON DELETE RESTRICT`); `created_by_user_id` is provenance only, not authorization. RLS is
account-membership based (`workflows_select/insert/update/delete_account_member`). Folders
must slot into this exact ownership + RLS model.

**Dependent-table FK behavior (drives purge design, Q22):**

| Table | FK to `workflows(id)` | On purge (hard delete) |
|-------|----------------------|------------------------|
| `workflow_revisions` | `ON DELETE CASCADE` | removed |
| `workflow_runs` | `ON DELETE CASCADE` | removed |
| `trigger_resources` | `ON DELETE CASCADE` | removed |
| `workflow_files` | `ON DELETE CASCADE` | removed |
| `hubspot_subscription_refs` | `ON DELETE CASCADE` | removed |
| `builder_agent_threads` | `ON DELETE CASCADE` | removed |
| `task_usage_events` | `ON DELETE SET NULL` | **kept** (billing history) |
| `ai_cost_events` | `ON DELETE SET NULL` | **kept** (billing history) |

This split is exactly what we want: a hard purge tears down runtime artifacts but **billing
ledgers survive with `workflow_id` nulled** — no separate anonymization step needed for
workflow purge (mirrors the account-deletion ledger-anonymization decision).

---

## 2. Product rules / locked decisions

- Folders are **account-scoped organization only** — **not** workspaces, permission
  boundaries, billing scopes, credential scopes, or Team/Business/Enterprise divisions.
- Workflows still belong to an **account**. A workflow may **optionally** belong to **one**
  folder.
- Folders may contain workflows **and** subfolders. Nesting allowed with a **reasonable max
  depth** (recommended **3**).
- **Trash is a system soft-delete view, not a user-created folder.**
- Deleted workflows/folders are **restorable for 7 days**; after 7 days they are
  **permanently purged**.
- Users get **undo/restore** during the 7-day window.
- Folder delete supports **both modes from day one**:
  1. **Delete folder only** → folder removed; contained workflows/subfolders move up safely
     (promote one level / become uncategorized).
  2. **Delete folder + contents** → folder, subfolders, and contained workflows move to Trash
     **together**.
- **Tier differences are limits, not separate code paths.** Team and Business share the same
  folder system with different limits. Business = one shared business account ≤ 25 members
  (not nested teams). Enterprise departments/groups are a **future, separate** system —
  folders must not become it.
- **Out of scope (do not build):** folder-level permissions / credentials / billing,
  Enterprise departments, workflow-ownership changes, account-scoped URLs, Team/Business
  pricing.

---

## 3. Recommended data model

Two new soft-delete-bearing surfaces: a `workflow_folders` table, and four trash columns
added to `workflows`. The trash column set is **identical** on both, so one helper + one cron
serve both.

### `workflow_folders` (new)

```
id                        uuid PK default gen_random_uuid()
account_id                uuid NOT NULL  FK accounts(id) ON DELETE RESTRICT   -- ownership root, mirrors workflows
parent_folder_id          uuid NULL      FK workflow_folders(id) ON DELETE RESTRICT  -- adjacency list; RESTRICT so a parent is never silently orphaned
name                      text NOT NULL
position                  integer NOT NULL DEFAULT 0   -- manual sort within (account_id, parent_folder_id)
created_by_user_id        uuid NULL      FK auth.users(id) ON DELETE SET NULL  -- provenance only, NOT authorization
created_at                timestamptz NOT NULL DEFAULT now()
updated_at                timestamptz NOT NULL DEFAULT now()
-- trash columns (mirror the account-deletion lifecycle shape) --
deleted_at                timestamptz NULL
deleted_by_user_id        uuid NULL      FK auth.users(id) ON DELETE SET NULL
purge_after               timestamptz NULL
deleted_from_parent_folder_id  uuid NULL  -- snapshot of parent_folder_id at delete time (no FK — target may be purged)
delete_operation_id       uuid NULL      -- trash batch id; shared across folder+contents deletes
```

### `workflows` (add columns)

```
folder_id                 uuid NULL      FK workflow_folders(id) ON DELETE RESTRICT  -- nullable = uncategorized
deleted_by_user_id        uuid NULL      FK auth.users(id) ON DELETE SET NULL
purge_after               timestamptz NULL
deleted_from_folder_id    uuid NULL      -- snapshot of folder_id at delete time (no FK)
delete_operation_id       uuid NULL      -- trash batch id
```

`workflows.deleted_at` and the `deleted` state **already exist** — we extend, not replace.

### Indexes

```
-- folder listing within a parent (live rows only)
workflow_folders (account_id, parent_folder_id, position)  WHERE deleted_at IS NULL
-- workflow listing within a folder (live rows only)
workflows (account_id, folder_id)                          WHERE state <> 'deleted'
-- purge sweep (both tables) — partial, mirrors accounts_pending_deletion_purge_after_idx
workflow_folders (purge_after)  WHERE deleted_at IS NOT NULL
workflows (purge_after)         WHERE deleted_at IS NOT NULL
-- batch restore lookups
workflow_folders (delete_operation_id)  WHERE delete_operation_id IS NOT NULL
workflows (delete_operation_id)          WHERE delete_operation_id IS NOT NULL
```

**Why no `deleted_at` overload / no separate `deleted_workflows` table:** the existing
`deleted` state + the new `purge_after` already express "in trash, restorable until X". A
parallel table would fork the list/RLS/lifecycle code. The locked "simplest model" preference
wins.

---

## 4. Folder hierarchy strategy

**Q2 — Recommended: adjacency list (`parent_folder_id`).** At max depth 3, adjacency list is
the simplest model that supports move/rename/delete/restore. A closure table or materialized
path is overbuild for a 3-deep tree and adds write-amplification on every move. A single
recursive CTE handles the only two reads that need the whole subtree (delete-with-contents
selection, depth validation).

**Q3 — Max depth: 3** (root → child → grandchild). Enforced as a config constant, not
hardcoded per tier (all tiers share depth 3 for launch; depth is a structural limit, not a
tier perk). Depth is computed in the service layer on create/move via a bounded parent walk
(≤ 3 hops, cheap with the adjacency index).

**Q4 — Circular-parent prevention:** two guards, both in the service layer (depth makes them
trivial):
1. **Self/ancestor check on move:** a folder cannot be moved into itself or any of its own
   descendants. Walk up from the proposed new parent; if we hit the folder being moved, reject
   (`FOLDER_CYCLE`).
2. **Depth ceiling:** the resulting subtree must not exceed depth 3. Reject `FOLDER_TOO_DEEP`.

   The `parent_folder_id` FK is `ON DELETE RESTRICT` so the DB also refuses to leave a dangling
   parent; cycles are structurally impossible to *create* because every new parent must already
   exist and pass the ancestor walk.

**Q5 — Ordering/sorting:** explicit `position integer` within each `(account_id,
parent_folder_id)` sibling group (manual drag-reorder), with a stable secondary sort by
`name`/`created_at` for ties. Workflows inside a folder keep the existing dashboard sort
(`updated_at DESC`) — folder `position` orders *folders*, not the workflows within them.
Reordering is a small batch `UPDATE` of `position` values.

**Q6 — Duplicate names within the same parent:** **soft-block with a partial unique index** on
`(account_id, parent_folder_id, lower(name)) WHERE deleted_at IS NULL`. Trashed siblings don't
collide (so you can re-create "Marketing" after trashing the old one). On create/rename
conflict, return `FOLDER_NAME_TAKEN`; the UI may also offer auto-suffix ("Marketing (2)") but
the constraint is the source of truth. Names across *different* parents may repeat.

---

## 5. Workflow attachment strategy

**Q7 / Q8 — Recommended: a nullable `workflows.folder_id` FK, NOT a join table.** The locked
rule is "a workflow may belong to **one** folder" — that is a strict 1-to-(0,1) relationship,
which a nullable FK models exactly. A join table only earns its keep for many-to-many (a
workflow in multiple folders), which is explicitly not the product. `folder_id IS NULL` =
**uncategorized** (the default; shown at the dashboard root alongside top-level folders).

- **Move** = `UPDATE workflows SET folder_id = $target` (or `NULL` to uncategorize), guarded by
  account membership + that the target folder is in the **same account** and **not trashed**.
- The FK is `ON DELETE RESTRICT` so a live folder can never be hard-deleted out from under a
  workflow — folder removal always goes through the soft-delete service (§7), which reparents
  or batch-trashes first.

---

## 6. Trash / soft-delete model

Trash is a **view over soft-deleted rows**, not a row itself (**Q11**).

- **Trash membership:** a row is "in Trash" when `deleted_at IS NOT NULL AND purge_after >
  now()`. For workflows, `state = 'deleted'` is also set (preserving the existing enum
  semantics). Folders have no state enum — `deleted_at` is the sole signal.
- **Trash view query (per account):**
  - workflows: `account_id = $acct AND state = 'deleted' AND deleted_at IS NOT NULL AND
    purge_after > now()`
  - folders: `account_id = $acct AND deleted_at IS NOT NULL AND purge_after > now()`
- **`purge_after` is set to `now() + 7 days`** at soft-delete time (constant
  `WORKFLOW_TRASH_RETENTION_DAYS = 7`, env-overridable like the account flow).
- **Q9 — workflow soft-delete:** reuse the existing `delete` transition (sets `state='deleted'`
  + `deleted_at`), and additionally stamp `purge_after`, `deleted_by_user_id`,
  `deleted_from_folder_id` (= current `folder_id`), and `delete_operation_id`. **Make `deleted`
  non-terminal:** add a `restore` transition `deleted → draft` (§8). Triggers were already torn
  down by the delete transition; restoring to `draft` means no live triggers, so restore is
  safe with no resource re-creation (the user re-activates explicitly).
- **Q10 — folder soft-delete:** stamp `deleted_at`, `purge_after`, `deleted_by_user_id`,
  `deleted_from_parent_folder_id`, `delete_operation_id`. A trashed folder disappears from the
  live tree (partial index excludes it) and appears in Trash.

**Why mirror the account lifecycle:** identical column names (`purge_after`,
`deleted_*`), identical partial-index strategy, identical service-role purge cron shape →
one mental model, reviewers already know it, and the trash batch (`delete_operation_id`) is the
only genuinely new concept.

---

## 7. Folder deletion modes

Both modes run inside **one transaction** and share a single freshly-generated
`delete_operation_id` (the trash batch, **Q13** — yes, we need it so folder+contents restore
together).

### Mode 1 — Delete folder only (Q14)

- The folder is soft-deleted.
- **Direct children are promoted one level** (move up safely): contained workflows get
  `folder_id ← folder.parent_folder_id`; direct child subfolders get `parent_folder_id ←
  folder.parent_folder_id`. If the folder was top-level (`parent_folder_id IS NULL`), children
  become uncategorized / top-level.
- Promotion **cannot exceed depth 3** because we removed a level, so it never deepens the tree.
- Children are **not** trashed — only the one folder row is. Its `delete_operation_id` batch
  contains just itself; restore re-creates the folder empty (children already live elsewhere).

### Mode 2 — Delete folder + contents (Q15)

- Select the full descendant set with a **recursive CTE** rooted at the folder
  (`WITH RECURSIVE subtree AS (... parent_folder_id = root ...)`), bounded by depth 3 so the
  recursion is shallow and cheap.
- Soft-delete **every** descendant folder and **every** workflow whose `folder_id` is in the
  subtree, plus the root folder — all stamped with the **same `delete_operation_id`** and the
  same `purge_after`.
- Each row snapshots its own `deleted_from_*` (workflow → `deleted_from_folder_id`, folder →
  `deleted_from_parent_folder_id`) so the subtree can be reconstructed on restore.
- Each affected **active** workflow runs its normal `delete` transition (trigger teardown) as
  part of the batch.

Both modes are **idempotent-safe** (re-issuing a delete on an already-trashed row is a no-op)
and the choice is an explicit API parameter (`mode: "folder_only" | "with_contents"`), never a
silent default — the UI must ask.

---

## 8. Restore / undo behavior

**Q12 — fields needed for restore:** `deleted_at`, `purge_after` (window check),
`deleted_from_folder_id` / `deleted_from_parent_folder_id` (where it lived), and
`delete_operation_id` (batch grouping). All proposed above.

- **Restore a single workflow:** clear the trash columns, set `folder_id ←
  deleted_from_folder_id` **if** that folder still exists and is live, else `NULL`
  (uncategorized). Run the new `restore` transition `deleted → draft`. The workflow comes back
  **inactive**; the user re-activates.
- **Restore a folder (or a batch):** restore by `delete_operation_id` so a folder trashed
  *with contents* comes back as a whole subtree. Within a batch, parents are restored before
  children, so each child's `deleted_from_*` target exists again.
- **Q16 — original parent no longer exists:** restore to the **nearest surviving ancestor**,
  else **root** (folder `parent_folder_id ← NULL`; workflow `folder_id ← NULL`). This happens
  when the parent was purged, or trashed in a *different* batch and not co-restored. Never fail
  a restore because the old location is gone — degrade to root and surface a toast ("Restored
  to top level — original folder no longer exists").
- **Undo** is just an immediate restore of the last `delete_operation_id` (the dashboard keeps
  the id from the delete response for a one-click "Undo" snackbar).
- **Restore validates limits:** restoring into an account that is now at its folder cap
  restores to root rather than re-creating an over-limit nesting; restoring workflows never
  hits a workflow cap (workflows aren't folder-capped).

---

## 9. Purge behavior

**Q17 — cron:** a new service-role, flag-gated route `app/api/cron/purge-trashed-workflows`
modeled **exactly** on `purge-pending-deletions` (`requireCronAuth`, `ENABLE_WORKFLOW_TRASH_PURGE_CRON`
defaults OFF, GET for Vercel cron + POST for manual, counts-only response, structured
`event` logs). It calls a `purgeDueTrashedItems()` service that:
1. selects folders + workflows where `deleted_at IS NOT NULL AND purge_after <= now()` (uses the
   partial indexes),
2. **hard-deletes** them (children-before-parents for folders to satisfy the RESTRICT FK).

**Q18 — hard-delete, no anonymize.** The dependent-table FK split (§1) gives us the right
outcome for free: hard-deleting a workflow CASCADE-removes its runs/revisions/trigger_resources/
files/threads, while `task_usage_events` + `ai_cost_events` keep their rows with `workflow_id`
set `NULL` (`ON DELETE SET NULL`). **Billing/usage ledgers survive purge** — consistent with
the account-deletion ledger-preservation decision; no extra anonymization step is required for
the workflow path. Folders carry no runtime children, so folder purge is a plain delete once
descendants are resolved.

**Ordering / safety:** purge folders only after all rows that reference them
(`workflows.folder_id`, child `parent_folder_id`) are themselves purged or reparented — the
RESTRICT FKs enforce this, and the service deletes deepest-first. Schedule alongside the
existing daily purge crons.

---

## 10. Account / RLS / security model

**Q19 — account membership / RLS.** `workflow_folders` gets the **same four account-membership
policies** as `workflows` (`_select/insert/update/delete_account_member`), each an
`EXISTS (SELECT 1 FROM account_memberships am WHERE am.user_id = auth.uid() AND am.account_id =
workflow_folders.account_id)`. Workflows' existing policies already cover the new columns (no
new policy needed; `folder_id` is just a column). Per the post-Oct-2026 rule, the migration
includes explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_folders TO
authenticated, service_role`.

**Cross-account safety:** a workflow's `folder_id` must always point at a folder in the **same
account**. Enforced two ways: (1) service-layer check on move/create; (2) optionally a DB CHECK
via a trigger that asserts `folder.account_id = workflow.account_id` (recommended — cheap, and
RLS alone doesn't stop a member of *both* accounts from cross-linking).

**Q20 — role restrictions:** **none for launch.** Consistent with the just-shipped Team
workflow builder (`team-workflows-closeout.md`): roles gate **people management only**;
workflow access — and now folder management + workflow placement — is **membership-based**. Any
account member can create/rename/move/delete/restore folders and move workflows between them.
Folders carry no credential or billing risk, so there is nothing for a role gate to protect.

---

## 11. Tier limits

**Q21 — limits, not code paths.** A single `FOLDER_LIMITS` config keyed by `account.type`,
enforced in the folder-create service (same table, same RLS, same cron for every tier). **Max
depth = 3 for all tiers.** Recommended starting caps (flag as a product decision — easy to
tune, no schema impact):

| Account type | Max folders | Max depth |
|--------------|-------------|-----------|
| Personal / Free | 10 | 3 |
| Team | 100 | 3 |
| Business | 250 | 3 |
| Enterprise | 1000 (or config-driven) | 3 |

Counts exclude trashed folders (`deleted_at IS NULL`). Over-limit create returns
`FOLDER_LIMIT_REACHED`. Enterprise departments/groups remain a **separate future system** — do
not grow folders into it.

---

## 12. API surface

All routes account-scoped via the existing `requireUserWithAccount()`; the workflow's / folder's
own `account_id` + membership authorizes mutations (mirrors the Team workflow model).

| Method + path | Purpose |
|---------------|---------|
| `GET /api/folders` | List folders for the active account (live tree; positions). |
| `POST /api/folders` | Create folder (`name`, optional `parentFolderId`). Depth + name-unique + tier-limit checks. |
| `PATCH /api/folders/[id]` | Rename / move (`name?`, `parentFolderId?`, `position?`). Cycle + depth checks. |
| `DELETE /api/folders/[id]?mode=folder_only\|with_contents` | Soft-delete (§7). Returns `deleteOperationId` for Undo. |
| `POST /api/folders/[id]/restore` | Restore folder (and its batch). |
| `PATCH /api/workflows/[id]` (extend) | Accept `folderId` (move / uncategorize). |
| `DELETE /api/workflows/[id]` (extend) | Already soft-deletes; now also stamps `purge_after` + trash columns + returns `deleteOperationId`. |
| `POST /api/workflows/[id]/restore` | New `restore` transition (`deleted → draft`) + relocate per `deleted_from_folder_id`. |
| `GET /api/trash` | List trashed workflows + folders for the active account (within window). |

No migrations beyond the two described; all reuse `requireUserWithAccount`, `isMember`, the
lifecycle orchestrator, and the cron-auth helper.

---

## 13. UI expectations

- **Dashboard** ([app/workflows/page.tsx](../../../app/workflows/page.tsx) →
  `WorkflowsDashboard`): a left folder tree (root = uncategorized + top-level folders), drag a
  workflow into a folder, drag folders to reorder/reparent (respecting depth 3). Breadcrumb for
  the current folder.
- **Delete folder** opens a small dialog with the **two explicit choices** (§7) — never a
  silent default.
- **Undo snackbar** after any delete ("Moved to Trash · Undo"), wired to the returned
  `deleteOperationId`.
- **Trash view** (a dashboard tab or `/workflows/trash`): lists trashed items with "deleted N
  days ago / purges in M days", per-item Restore, and batch Restore. Read-only otherwise
  (can't edit/run a trashed workflow).
- Empty-state + tier-limit messaging ("You've reached your folder limit for this plan").
- No folder permission/credential/billing UI (out of scope).

---

## 14. Test plan (Q23)

**Hierarchy / integrity:**
- Create nested folders to depth 3; depth-4 create/move rejected (`FOLDER_TOO_DEEP`).
- Move-into-self and move-into-descendant rejected (`FOLDER_CYCLE`).
- Duplicate name in same parent rejected; same name in different parents allowed; re-create a
  name after trashing the original succeeds (partial unique index).
- Reorder updates `position` deterministically.

**Attachment:**
- Move workflow into / out of (uncategorize) a folder; cross-account folder target rejected.
- Cannot attach to a trashed folder.

**Soft-delete / trash:**
- Workflow delete sets `state='deleted'` + `deleted_at` + `purge_after = +7d` + trash columns;
  drops out of the live list; appears in `/api/trash`.
- Folder-only delete promotes children one level (workflows + subfolders), trashes only the
  folder.
- Folder+contents delete trashes the whole subtree under one `delete_operation_id` with one
  `purge_after`; active workflows in the subtree get trigger teardown.

**Restore / undo:**
- Restore single workflow → `draft`, relocates to `deleted_from_folder_id` when it still exists,
  else root.
- Restore batch by `delete_operation_id` rebuilds the subtree (parents before children).
- Restore when original parent purged/missing → degrades to root, no failure.
- Undo immediately after delete restores the last batch.

**Purge:**
- Cron disabled by default (flag OFF) → no-op, counts-only response.
- With flag ON: rows past `purge_after` hard-deleted; runtime children CASCADE-removed;
  `task_usage_events` / `ai_cost_events` rows **kept** with `workflow_id` NULL; folders deleted
  deepest-first (no RESTRICT violation). Rows still within window are untouched.

**Security / RLS / roles:**
- Non-member of the account cannot list/create/move/delete/restore its folders (403 / zero
  rows).
- A `member` (non-owner/admin) can fully manage folders + placement (roles don't gate).
- Cross-account workflow↔folder link blocked at service + DB-trigger layer.

**Limits:**
- Folder create at tier cap rejected (`FOLDER_LIMIT_REACHED`); trashed folders don't count;
  restore into an over-cap account lands at root.

**Regression:** existing workflow lifecycle, list, builder, Team-workflow, and account-deletion
suites stay green; `deleted` becoming non-terminal doesn't break the terminal-state assumptions
elsewhere (audit lifecycle tests).

---

## 15. Implementation slice breakdown (proposed; none built here)

- **WF-1 — Schema + RLS.** `workflow_folders` table (+ policies + GRANTs + indexes + same-account
  trigger), `workflows` trash/`folder_id` columns, partial indexes. Backfill: none (all new
  columns nullable). Migration only + repository types.
- **WF-2 — Folder CRUD + hierarchy service.** Create/rename/move/list with depth + cycle +
  name-unique + tier-limit guards; `GET/POST/PATCH /api/folders`, `PATCH /api/workflows/[id]`
  folder move. Adjacency-list helpers + recursive-CTE subtree reader.
- **WF-3 — Trash: soft-delete + restore.** Extend workflow delete to stamp trash columns; add
  `restore` lifecycle transition (`deleted → draft`); folder delete (both modes) +
  `delete_operation_id` batching; `POST .../restore`; `GET /api/trash`.
- **WF-4 — Purge cron.** `purgeDueTrashedItems()` service + `app/api/cron/purge-trashed-workflows`
  route, flag-gated (`ENABLE_WORKFLOW_TRASH_PURGE_CRON`), modeled on `purge-pending-deletions`.
- **WF-5 — Dashboard UI.** Folder tree, drag-to-folder/reorder, delete-mode dialog, Undo
  snackbar, Trash view, tier-limit messaging.
- **WF-6 — Tier limits config + tests** (can fold into WF-2; called out for the limits decision).

Suggested order: **WF-1 → WF-2 → WF-3 → WF-4 → WF-5** (WF-6 alongside WF-2). WF-1/2 deliver
organization; WF-3/4 deliver the 7-day trash; WF-5 makes it visible.

---

## 16. Risks / open questions

1. **Tier limits (product decision).** The §11 caps (10 / 100 / 250 / 1000) are a proposal —
   confirm the numbers. Pure config, no schema impact.
2. **Should Personal/Free get folders at all, or is it a paid perk?** Recommended: yes, with a
   small cap (org hygiene is table-stakes UX, not a monetization lever). Flag if product wants
   it gated.
3. **`deleted` becoming non-terminal.** The lifecycle currently documents `deleted` as terminal.
   Adding a `restore` transition is the cleanest path, but audit/analytics that assume terminal
   `deleted` must be reviewed (low risk — it's a forward transition to `draft`).
4. **Concurrent folder moves / reorders** by multiple Team members. `position` writes can race;
   recommend a per-parent reorder endpoint that takes the full ordered id list (last-write-wins
   on the sibling group) rather than per-item deltas. UX for "someone else reorganized" is out
   of scope.
5. **Purge of a folder whose workflow was un-trashed mid-window.** Handled: purge only deletes
   rows still `deleted_at IS NOT NULL AND purge_after <= now()`; a restored workflow cleared its
   trash columns and is skipped.
6. **Self-cleaning weekly trash parity (V1).** V1 cleaned weekly; V2 uses a per-item 7-day
   `purge_after` + daily cron. Confirm 7 days (vs V1's weekly folder sweep) is the intended
   retention.
7. **Folder count vs nesting limit interaction on restore** — restoring a deep batch when the
   account is near the folder cap. Resolved by degrade-to-root + skip over-cap nesting; confirm
   that's acceptable UX.

---

## 17. Acceptance criteria (for the eventual build, not this doc)

- Account members can create/rename/move/delete/restore folders and move workflows in/out;
  nesting limited to depth 3; cycles impossible; duplicate sibling names blocked.
- A workflow belongs to at most one folder (nullable `folder_id`); uncategorized is the default.
- Delete supports both **folder-only** (children promoted) and **folder+contents** (subtree
  trashed together under one `delete_operation_id`) — chosen explicitly, never defaulted.
- Trash shows soft-deleted items for 7 days with per-item + batch Restore + Undo; restore
  relocates to original location or degrades to root if it's gone.
- Purge cron (flag-gated, service-role) hard-deletes items past `purge_after`, CASCADE-removing
  runtime children while **preserving billing ledgers** (`workflow_id` nulled).
- RLS + route layer scope all folder/trash ops to account membership; roles gate people
  management only.
- Tier limits enforced via one config map; no per-tier code paths; max depth 3 universal.
- No folder-level permissions/credentials/billing; no Enterprise departments; no
  workflow-ownership / account-URL / pricing changes.
- All prior workflow-lifecycle, Team-workflow, and account-deletion suites remain green.

---

## Report summary

- **Recommended folder model:** **adjacency list** (`workflow_folders.parent_folder_id`,
  `ON DELETE RESTRICT`), **max depth 3**, cycles prevented by an ancestor-walk + depth ceiling
  in the service layer. Closure table/materialized path rejected as overbuild for depth 3.
- **Workflow attachment:** nullable `workflows.folder_id` FK (one folder max), **no join
  table**; `NULL` = uncategorized.
- **Trash / restore model:** mirror the shipped **account-deletion lifecycle** — `purge_after`
  + partial index + service-role flag-gated purge cron. Reuse the existing `deleted` state (make
  it non-terminal via a new `restore → draft` transition); Trash = a view over
  `deleted_at IS NOT NULL AND purge_after > now()`. Batch grouping via `delete_operation_id`.
- **Delete-folder modes:** (1) folder-only → promote children one level; (2) folder+contents →
  recursive-CTE subtree soft-deleted together under one `delete_operation_id`. Explicit choice,
  never defaulted.
- **Purge:** hard-delete past `purge_after`; runtime children CASCADE; billing ledgers survive
  via existing `ON DELETE SET NULL`. No anonymization step needed.
- **Tier limits (proposed):** Personal 10 / Team 100 / Business 250 / Enterprise 1000; depth 3
  for all. One config map, no per-tier code paths.
- **Slice breakdown:** WF-1 schema+RLS → WF-2 folder CRUD/hierarchy → WF-3 trash soft-delete +
  restore → WF-4 purge cron → WF-5 dashboard UI (WF-6 limits config alongside WF-2).
- **Open product decisions:** (1) confirm tier caps; (2) folders for Free/Personal or paid
  perk? (3) accept `deleted` becoming non-terminal; (4) confirm 7-day retention vs V1 weekly;
  (5) concurrent-reorder UX.
