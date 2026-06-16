# V2-READY-41A — Active / published workflow revision model — feasibility audit + plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-15
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this audit):**
`supabase/migrations/20260506000000_workflows.sql` (workflows + workflow_revisions tables,
`active_revision_id` FK) ·
`repositories/workflows.ts` (`WorkflowRecord`, `updateDraftDefinition`,
`updateDraftDefinitionIfRevisionMatches`, `createRevision`, `setActiveRevision`,
`getByIdServiceRole`) ·
`services/execution/engine.ts:132,152` (loads `workflow.draftDefinition`) ·
`services/triggers/lifecycle.ts:66-127` (`registerWorkflowTriggers` reads
`workflow.draftDefinition.nodes`) ·
`services/workflows/lifecycleOrchestrator.ts` (activate/resume/disable/delete/restore) ·
`services/workflows/orchestratorFactory.ts:29-30` (wires register/unregister hooks) ·
`services/workflows/saveDraftDefinition.ts` + `core/workflows/triggerChange.ts`
(active-edit deactivation) ·
`app/api/workflows/[id]/route.ts` (PATCH draft save) ·
`supabase/migrations/20260507000001_workflow_runs.sql` (no `revision_id`) ·
`app/api/workflows/_shared.ts:435` + `services/ai/tools/workflowContext.ts:112,140`
(surface `activeRevisionId` read-through only).

> **Decision being made:** should V2 adopt the durable published/active-revision model
> NOW (before launch) instead of patching the paused-resume stale-trigger bug
> (FINDING-1, [V2-READY-40](./v2-ready-40-trigger-resource-lifecycle-audit.md))? This doc
> is the focused feasibility slice Marcus asked for. It implements nothing.

---

## 1. Context

[V2-READY-40](./v2-ready-40-trigger-resource-lifecycle-audit.md) found a real stale-trigger
bug (FINDING-1): `active → pause → edit trigger → resume` re-activates a workflow whose
`trigger_resources` are frozen at the pre-pause activation, so the dispatcher fires the old
node id / old filter config. The proposed quick fix was **Option B** (re-register on
resume drift). Marcus challenged this: since V2 has not launched, do not defer the durable
architecture if it is correct. This audit evaluates whether to adopt the
published/active-revision model (**Option C**) now.

It builds directly on two prior workflow audits:
[active-edit-stale-trigger-audit.md](../workflows/active-edit-stale-trigger-audit.md) (§6
"long-term" already names the publish/active-revision model as the durable answer) and
[template-replace-lifecycle-audit.md](../workflows/template-replace-lifecycle-audit.md).

---

## 2. Current codebase findings (verified)

### 2.1 The revision model already exists in the schema — but is UNWIRED

`supabase/migrations/20260506000000_workflows.sql` (the very first workflows migration) was
authored *for* the published-revision model. Its header comment states: *"publish creates
an immutable revision (workflow_revisions) — the workflow points at the running version via
`active_revision_id`."*

- `workflows.active_revision_id uuid` → FK to `workflow_revisions(id)` `ON DELETE SET NULL`
  (lines 36, 69-73).
- `workflow_revisions` (lines 58-64): `id`, `workflow_id` (FK CASCADE), `definition jsonb`,
  `created_at`. INSERT + SELECT RLS only — **immutable by construction** (no UPDATE/DELETE
  policy, lines 92-98). Account-cutover (`20260530000003_workflows_account_cutover.sql`)
  dropped `user_id` and re-scoped RLS to account membership via JOIN through `workflows`.
- `draft_definition jsonb` (line 40) is the editable copy, *intended* to be snapshotted on
  publish (line 38-39 comment).

`repositories/workflows.ts` already provides the write helpers:
- `createRevision({ workflowId, definition })` → inserts a `workflow_revisions` row
  (lines 325-347).
- `setActiveRevision(workflowId, revisionId)` → repoints `active_revision_id`
  (lines 349-364).
- `WorkflowRecord.activeRevisionId` is read and surfaced (lines 46, 103).

**But these helpers have ZERO production callers** (`grep createRevision|setActiveRevision`
across `services/` + `app/` → empty). `active_revision_id` is only *read-through* to API /
AI context (`app/api/workflows/_shared.ts:435`,
`services/ai/tools/workflowContext.ts:112,140`); nothing ever **writes** it, and nothing
uses it to **execute**. There is **no revision READ helper** (`getRevisionById`) today.

> Net: V2 has the durable model's tables, FK, immutability, RLS, and write helpers already
> shipped — only the wiring (write on activate, read on execute) was deferred.

### 2.2 Execution reads the mutable draft, not the active revision

`services/execution/engine.ts:132,152`:
```ts
const workflow = await workflowsRepo.getByIdServiceRole(input.workflowId);
...
const def = workflow.draftDefinition;          // ← live, mutable draft
const triggerNode = def.nodes.find((n) => n.id === input.triggerNodeId);
// missing → fatal TRIGGER_NODE_NOT_FOUND
```
So **every** live run reads whatever the draft currently says — not a frozen activated
version.

### 2.3 Trigger registration reads the mutable draft too

`services/triggers/lifecycle.ts:69` — `registerWorkflowTriggers` filters
`workflow.draftDefinition.nodes`; `trigger_resources` rows are keyed `(workflow_id,
node_id)` with the node's then-current `config`, carrying **no revision marker**
(`repositories/triggerResources.ts`; UNIQUE `(workflow_id, node_id)`).

### 2.4 Lifecycle behavior today (verified in V2-READY-40 + re-confirmed)

| Path | Today |
|---|---|
| Active edit (trigger change) | `saveDraftDefinition` → deactivate active workflow → teardown + Reactivate→Resume re-registers off the *current draft*. |
| Active edit (action/label/layout) | Draft written; **takes effect on the next live run immediately** (engine reads draft). No publish step. |
| Paused edit | Draft written; **no** deactivation (only `previousState === "active"` deactivates). |
| Resume (from paused) | No re-register (registration retained). → **FINDING-1.** |
| Resume (from eligible_to_resume) | Re-registers off current draft. |
| Deactivate / disable / trash | Teardown (deactivation hook + `deleteByWorkflow`). |
| Restore from trash | → draft, never auto-activates (locked decision). |
| Template replace / AI-apply | Route through `saveDraftDefinition` (same active-edit rule). |

### 2.5 The draft "revision" token is NOT the active revision

`updateDraftDefinitionIfRevisionMatches` (lines 300-316) guards on `updated_at` — a
**draft optimistic-concurrency lock** for AI-apply. Unrelated to `active_revision_id`.
Don't conflate them.

### 2.6 Runs do not record which version ran

`workflow_runs` (`20260507000001_workflow_runs.sql`) references `workflow_id` only — **no
`revision_id`**. Run history therefore cannot attribute a run to a specific revision today.

---

## 3. Exact reason FINDING-1 exists (under the current model)

FINDING-1 is **not** a paused-resume-specific defect. It is one symptom of a single root
cause: **live execution and trigger registration both read the mutable `draftDefinition`,
while `trigger_resources` are a point-in-time snapshot taken at activation.** Any path that
lets the draft change without re-running registration desynchronizes the two:

- `active → pause → edit → resume(paused)` — registration frozen at pre-pause activation
  (the discovered case).
- (Already patched, narrowly) `active → edit` — handled only by deactivating on trigger
  change; action edits still go live with no review.

A snapshot/active-revision model removes the *class* by making "the version that runs" an
immutable thing the draft can't mutate.

---

## 4. Product / model decision

**Recommended product rule (matches Marcus's description):**
1. **Draft edits are draft-only.** Editing an active workflow never changes what is live.
2. **Active workflows run a frozen activated revision** (`active_revision_id`), not the
   draft — for *both* execution and trigger registration.
3. **`trigger_resources` are bound to the active revision** (registered off the active
   revision's definition; carry the `revision_id` they were registered for).
4. **Changes require explicit (re)activation / publish** to affect live execution.
5. **Builder shows "draft has unpublished changes"** = `draftDefinition` differs from the
   active revision's definition.
6. **Resume from paused republishes the current draft IF it drifted; otherwise resumes the
   existing active revision.** (Closes FINDING-1 structurally.)
7. **Restore from trash stays inactive** (unchanged locked decision — no auto-reactivate).
8. **Run history points to the revision that ran** (needs `workflow_runs.revision_id` — the
   one migration; see §6).

**Explicitly NOT in scope:** revision diffing UI, revision rollback/restore-to-revision,
revision retention/pruning policy, multi-revision A/B. Those are post-launch.

---

## 5. Recommended approach — **Option C (wire the existing revision model)**, phased behind a flag

Because the durable schema already exists (§2.1), "Option C" here is **wiring, not a
rebuild**:

1. **Add a revision READ helper** — `getRevisionById(revisionId)` (and a convenience
   `getActiveDefinition(workflow)` that returns the active revision's definition, falling
   back to draft only when `active_revision_id` is null).
2. **Activate / Resume-from-eligible / republish** → `createRevision(draft)` then
   `setActiveRevision`; then `registerWorkflowTriggers` reads the **active revision**
   definition (not the draft). Repeated activation reuses the same flow; `trigger_resources`
   stay idempotent via UNIQUE `(workflow_id, node_id)`.
3. **Execution** (`engine.ts`) reads the **active revision** definition when the workflow is
   active (flag ON); draft only for explicit test/preview runs. Behind
   `ENABLE_ACTIVE_REVISION_EXECUTION` (default OFF) so it ships dark and flips after parity
   tests.
4. **Resume from paused** → if `draft` differs from active revision, publish a new revision
   + re-register; else resume unchanged. **This is the structural FINDING-1 fix.**
5. **"Unpublished changes"** = pure comparison of draft vs active-revision definition
   (reuses the stable-value compare from `core/workflows/triggerChange.ts`).
6. **Retire the active-edit deactivation** (`saveDraftDefinition`) once execution reads the
   active revision — editing an active workflow no longer needs to disable it; it just marks
   "unpublished changes." (Sequenced last, after the flag flips.)

Why C over a snapshot column or a hash: the immutable, FK'd, RLS'd revisions table is
already there and is strictly more capable than a single `active_definition` column (it
enables run attribution and future rollback at no extra schema cost). Adding a parallel
`active_definition` column (Option B-snapshot) would create **two** sources of truth
alongside the existing unused table — worse, not simpler.

---

## 6. Migration question (answer up front)

- **Core Option C requires NO new migration.** `workflow_revisions`, `active_revision_id`
  FK, immutability RLS, account-membership RLS, and the `createRevision` /
  `setActiveRevision` helpers all already exist and are applied. Wiring is pure
  application code + one read helper.
- **ONE optional migration** — `ALTER TABLE workflow_runs ADD COLUMN revision_id uuid
  REFERENCES workflow_revisions(id) ON DELETE SET NULL` — is needed only for product-rule
  #8 (run-history attribution). It is **additive, nullable, non-breaking**, and can land as
  its own slice.

Per the task constraint, **no migration is written or applied in this audit.** If approved,
the `workflow_runs.revision_id` migration design is presented for sign-off **before** any
coding (RLS unaffected — column is on an already-account-scoped table; add GRANT parity per
the post-Oct-2026 rule for any *new* table — N/A here since it's an ALTER).

---

## 7. Alternatives considered

| Option | What | Migration | Builder/UI | Fixes FINDING-1 class? | Verdict |
|---|---|---|---|---|---|
| **A** — patch resume drift only | `resume(paused)` re-registers if draft changed | none | none | Only the paused-resume symptom; action-edit-goes-live remains | ❌ Leaves the root cause; contradicts pre-launch "do it right" |
| **B (column)** — `active_definition` snapshot column | copy draft→column on activate; execute from column | **yes** (new column) — *and ignores the existing revisions table* | small | Yes, but creates a 2nd source of truth beside unused `workflow_revisions` | ❌ Redundant with shipped schema; no run attribution; throwaway |
| **C** — wire existing `workflow_revisions` | snapshot to immutable revision; execute/register off active revision | **none** for core (one optional additive column for run attribution) | medium (publish/unpublished-changes UX) | **Yes — removes the class** | ✅ **Recommended** — uses schema already designed for this |
| **D** — hash marker in `trigger_resources` | store `triggerDefinitionHash`; detect drift | maybe (column) | small | Detects drift but still executes the mutable draft | ❌ Half-measure; doesn't make execution deterministic |

---

## 8. Product behavior changes (must be called out to users/QA)

1. **Editing an active workflow no longer takes effect immediately.** Today action/label
   edits go live on the next run; under C they are draft-only until republish. **This is the
   intended new rule** but it is a visible behavior change — needs the "unpublished changes"
   + Publish/Reactivate affordance so users aren't confused.
2. **Active trigger edits no longer auto-disable the workflow** (once C lands) — they mark
   "unpublished changes" instead of forcing Reactivate→Resume. Net friction reduction.
3. **Resume from paused** becomes deterministic: stale registrations can't fire.
4. **Run history** can show the exact revision that ran (after the optional migration).
5. Restore-from-trash behavior **unchanged** (still inactive, no auto-reactivate).

---

## 9. Risk / complexity estimate

**Medium.** No schema risk for the core (tables exist, additive-only optional column).
The real work is (a) routing execution + registration through the active revision behind a
flag, (b) parity testing v1-draft-read vs revision-read, and (c) the builder "unpublished
changes / Publish" UX. Biggest risks:
- **Execution divergence during rollout** — mitigated by `ENABLE_ACTIVE_REVISION_EXECUTION`
  default OFF + parity tests before flip (mirrors the v1→v2 engine rollout pattern).
- **Workflows with `active_revision_id = NULL`** at flip (every existing active workflow
  today) — need a one-time **backfill**: on first activate/publish under the flag, snapshot
  the current draft into a revision. Until then, `getActiveDefinition` falls back to draft
  (safe, identical to today). Backfill is data-only via the normal activate path; no raw SQL
  required.
- **Test-mode / preview must keep reading the draft** (you preview what you're editing) —
  explicit branch, covered by tests.

---

## 10. Tests required (for the implementation slices)

- `getActiveDefinition` falls back to draft when `active_revision_id` is null; returns the
  revision definition otherwise.
- Activate/Resume-from-eligible/republish: creates exactly one revision, repoints
  `active_revision_id`, registers `trigger_resources` off the **revision** (not later draft
  edits), and is idempotent on repeated activation (no duplicate revisions beyond one per
  publish; no duplicate `trigger_resources`).
- Execution (flag ON) reads the active revision; draft edits do not change live runs;
  test/preview reads draft.
- **FINDING-1 composition test:** `active → pause → edit trigger → resume` does NOT fire the
  pre-pause registration (either resumes the unchanged active revision, or republishes +
  re-registers on drift).
- "Unpublished changes" flag = draft ≠ active revision; equal after publish.
- Restore-from-trash still does not activate.
- No-leak: revision/publish errors are typed + generic; no raw graph internals, provider
  payloads, account ids, or secrets in user-facing errors.

---

## 11. Implementation slice breakdown (if approved)

All behind `ENABLE_ACTIVE_REVISION_EXECUTION` (default OFF) until CS-6.

- **CS-1 (no migration):** add `getRevisionById` + `getActiveDefinition(workflow)` read
  helper with draft fallback. Pure addition + unit tests. No caller switch yet.
- **CS-2 (no migration):** wire `createRevision` + `setActiveRevision` into
  `lifecycleOrchestrator.activate` and `resume`-from-eligible (publish-on-activate).
  `registerWorkflowTriggers` reads the active revision. Backfill-on-first-activate. Flag
  still OFF for execution.
- **CS-3 (no migration):** `engine.ts` reads `getActiveDefinition` under the flag; draft for
  test/preview. Parity tests (draft-read vs revision-read) — mirror `tests/parity/`.
- **CS-4 (no migration):** resume-from-paused drift handling → **closes FINDING-1**;
  composition test.
- **CS-5 (no migration):** builder "unpublished changes" indicator + Publish/Reactivate
  control (UI reads draft-vs-active comparison from a real endpoint). Retire active-edit
  auto-deactivation in `saveDraftDefinition` once execution is revision-based.
- **CS-6:** flip `ENABLE_ACTIVE_REVISION_EXECUTION` to ON after parity verification.
- **CS-7 (MIGRATION — separate approval):** `workflow_runs.revision_id` additive column +
  stamp it at run start + show "ran revision N" in history. Present design before coding.

---

## 12. Risks / open questions (each with a recommendation)

1. **Should resume-from-paused auto-republish on drift, or require explicit reactivate?**
   *Recommendation:* auto-republish on resume (resume is already an explicit user action;
   forcing a second step is friction). Confirm with Marcus.
2. **Do action-only edits on an active workflow require Publish, or auto-apply?**
   *Recommendation:* require Publish (rule #1 — deterministic live execution). This is the
   main UX change; confirm.
3. **Run attribution now or later?** *Recommendation:* later (CS-7) — it's the only
   migration and isn't needed to fix FINDING-1.
4. **Revision retention/pruning?** *Recommendation:* out of scope; revisit post-launch
   (immutable rows are cheap; cascade-delete with the workflow already handles teardown).

---

## 13. Acceptance criteria

**For this planning slice:** doc exists under `docs/slices/phase-4/readiness/`, every
current-state claim cites a file actually read, no source/schema/test/UI changed, nothing
pushed. ✅

**For the implementation (later):** the FINDING-1 composition test passes; active runs read
an immutable revision; draft edits never alter live execution; repeated activation creates
no duplicate revisions or `trigger_resources`; restore stays inactive; no-leak tests pass;
flag flips only after parity.

---

## 14. Hard boundaries (what this slice did NOT do)

- No source, schema, migration, `db:push`, test, or UI change.
- No AI / MCP / billing behavior touched.
- No new providers. No push / deploy.
- Did not implement Option B; did not modify the existing active-edit deactivation.

---

## 15. Recommended next step

**Adopt Option C now (pre-launch).** Pick up **CS-1** (the no-migration `getActiveDefinition`
read helper) first — it's a safe, isolated addition that unblocks CS-2/CS-3. Defer the only
migration (`workflow_runs.revision_id`, CS-7) and present its design for explicit approval
before coding. Decide open questions §12.1 and §12.2 before CS-4/CS-5.
