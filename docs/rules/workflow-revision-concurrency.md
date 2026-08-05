# Workflow revision concurrency (WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1)

If the saved workflow changes after a session loaded it, ChainReact must not
silently overwrite those newer changes. The user is told the workflow changed
elsewhere and given a safe recovery path. This document is the durable contract;
the reproduction, audit tables, and certification evidence live in
[`docs/slices/phase-5/workflow-changed-elsewhere/workflow-changed-elsewhere-conflict-protection.md`](../slices/phase-5/workflow-changed-elsewhere/workflow-changed-elsewhere-conflict-protection.md).

## The canonical token

`workflows.updated_at` is the ONE optimistic-concurrency token for the draft
definition. It is server-generated (the `set_updated_at` trigger stamps `now()`
on every UPDATE), monotonically advancing, and travels on the wire as the
`updatedAt` string every workflow response already carries. Clients treat it as
OPAQUE: echo it verbatim, never parse, construct, or advance it. It was chosen
over adding a revision column because the AI patch-apply path
(`applyWorkflowPatchForAI`) had already live-certified it as a compare-and-swap
key — no migration, one revision space.

Not the token (different spaces — never compare across them):
`computeEditableGraphVersion` (a CONTENT fingerprint of the local draft, used
for proposal freshness), `active_revision_id` / `workflow_revisions` (published
immutable snapshots), `activeRevisionId`.

## The save contract

Every authoritative definition save — builder PATCH, template replace,
checkpoint restore, AI apply — follows one rule:

1. The client loads the workflow and keeps the response's `updatedAt`
   (`graphSlice.hydratedRevision`).
2. The save request carries the proposed definition **and** `expectedRevision`.
   `UpdateWorkflowRequestSchema` REJECTS a `draftDefinition` without it (400).
3. The server verifies auth + account membership, fast-fails at read time when
   the loaded row already moved, then writes through
   `repositories/workflows.updateDraftDefinitionIfRevisionMatches` — a single
   atomic UPDATE predicated on `(id, account_id, updated_at)`. There is NO
   unguarded definition writer any more (`updateDraftDefinition` is deleted);
   compare-then-update as two queries is forbidden (another writer can land
   between them), and process-local locks are not a substitute (serverless).
4. A zero-row CAS is classified by re-reading through the caller's RLS scope:
   gone/deleted/non-member → the standard no-leak 404; still visible → typed
   conflict.
5. Success returns the row's NEW `updatedAt`; the client adopts it from the
   response. The client never invents the next token.

### The typed conflict

HTTP 409, stable code `WORKFLOW_REVISION_CONFLICT`, body: safe message +
`workflowId` + `latestRevision` only — NEVER definition content, editor
identity, or account detail (the caller is an already-authorized member, so
"a newer version exists" is safe to reveal; who wrote it is not revealed —
"another tab or account member" is the whole story). Clients branch on the
code (`isRevisionConflictError`), never on message text. Emitted via
`workflowRevisionConflictResponse` (app/api/workflows/_shared.ts), which also
logs the safe structured diagnostic `workflow.save.revision_conflict`
(ids + savePath + comparison — no definitions, no token values).

## Lifecycle ordering

`saveDraftDefinition` runs the guarded write FIRST; the active-trigger-change
deactivation (and any trigger teardown) runs only when the write landed. A
stale save therefore causes NO lifecycle transition, NO trigger_resources
write, NO notification — nothing partial. Template replace additionally
read-time-checks the revision BEFORE capturing its pre-replace checkpoint.

## Client behavior (builder)

- `graphSlice.hydratedRevision` is the session token; every save sends it.
- On conflict the slice records `graphSlice.conflict` (safe metadata only) and
  PRESERVES all local pending state — nodes, edges, config, presentation,
  undo history. Nothing hydrates over unsaved work automatically, the generic
  save-error banner is not used (conflicts have their own channel), and a
  repeat save with the same stale token is refused up-front (no 409 loop;
  there is no autosave to pause).
- **Metadata-only rebase:** when the 409 was caused by a row bump whose
  DEFINITION still equals this session's saved baseline (rename, folder move,
  lifecycle transition), the slice adopts the fresh token and retries once.
  This is not a graph merge — the base content is proven identical.
- **External vs explicit hydrate:** an EXTERNAL strictly-newer hydrate (RSC
  re-render, rename echo) over a dirty draft adopts the token when content is
  unchanged, records a conflict when it differs — it never clobbers edits. An
  EXPLICIT hydrate (user-confirmed reload-latest / checkpoint restore /
  template replace / apply pipelines) always applies and clears the conflict.
- Visual and Document builders share `graphSlice`, so they share one token and
  one conflict state; switching modes cannot bypass the protection.
- `WorkflowConflictDialog` is the single conflict experience: neutral copy
  (never blames a user, never shows tokens), "Keep my changes here" (dismiss
  to a persistent reminder banner), and "Reload latest version" behind an
  explicit discard confirmation. There is NO force-overwrite option — adding
  one requires a product decision + security/ownership audit. Automatic graph
  merging is deliberately not attempted (no canonical merge engine exists;
  a wrong merge is silent corruption). "Save as a copy" is deferred — no safe
  workflow-duplication path exists today (tracked follow-up).
- Conflict state clears only on: explicit reload, a save that lands against
  the latest revision, workflow close/switch, or reset. It never leaks across
  workflows.

## React Agent + templates

- Server AI apply keeps its read-time `baseRevision` check + the same guarded
  write (STALE_PATCH). Client proposal freshness stays fingerprint-based
  (react-agent rules); a stale proposal cannot apply, and an applied draft
  saves through the same PATCH contract — React can never claim "saved" past a
  conflict. New proposals are generated server-side from the saved workflow,
  so React always reasons from the authoritative version.
- Template replace and checkpoint restore REQUIRE `expectedRevision` and map a
  miss to the same 409; their client surfaces hand off to the shared dialog.

## Multi-member editing & the future

Any account member may edit; the CAS is member-agnostic (two members are just
two sessions). If real-time collaboration ever lands, this contract stays the
floor: presence/merge layers may reduce conflicts, but an authoritative save
still requires the CAS — last-write-wins must never return.

## Regression anchors

- `tests/integration/features/workflow-save-revision-conflict.dev.test.ts` —
  real route + repository against the dev DB (two-session reproduction, CAS
  atomicity, exactly-one-winner races).
- `tests/unit/app/api/workflows/detail-route.test.ts` (409 contract),
  `tests/unit/features/workflow-builder/state/graphSlice.conflict.test.ts`
  (preservation/rebase/lifecycle),
  `tests/unit/features/workflow-builder/panels/WorkflowConflictDialog.test.tsx`
  (user-visible recovery), plus template/checkpoint suites.
- Two-tab browser certification (2026-08-04, dev DB): see the slice doc.
