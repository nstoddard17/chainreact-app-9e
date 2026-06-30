# Agent Change History / History Tab — Launch Closeout

**Type:** Closeout / handoff. **Docs-only — no source, test, migration, schema, UI, or behavior
change in THIS doc. Nothing pushed.**
**Date:** 2026-06-30
**Branch:** `v2-main` (local-only; the arc is unpushed — `v2-main` is ahead of `origin/v2-main`
by 69 commits as of this writing)
**Marker:** AGENT-CHANGE-HISTORY-CLOSEOUT-1

Closes out the arc that added a **user-visible React Agent change history** — an account-scoped
activity timeline of what the agent did to a workflow — surfaced it as a **top-level History tab**
in the builder, added **per-item "View diff"** and **Restore**, wired **repair test-verification**
(`tested` / `test_failed`) and **eval-event linkage**, and added **DB/RLS integration coverage** for
the new table.

Builds directly on the preceding arc:
[`react-agent-preview-review-checkpoints-closeout.md`](./react-agent-preview-review-checkpoints-closeout.md)
(the config-diff "Review changes" rail + durable checkpoints this timeline links to and reuses).

> **Shared-worktree note.** These commits are interleaved in `git log` with concurrent
> trigger-smoke and other React-Agent builder work (e.g. `414a0a9b3`, `04c257378`, the
> "Why this change?" commits). Only the five commits below are in this arc's scope. A separate,
> still-uncommitted concurrent arc (**REACT-AGENT-APPLY-MODES-1**, the `kept_as_preview` status +
> `20260717000000_…kept_as_preview.sql`) is **out of scope here** and is not part of these commits.

---

## 1. Summary (per slice)

- **`6723eccf6` — Foundation (AGENT-CHANGE-HISTORY-1).** New account-scoped
  `agent_change_history` table + migration, contract/repository/service/route, client API, builder
  emission from the preview lifecycle (preview/apply/discard/undo/restore), and an initial
  "Agent changes" rail panel.
- **`c718c42f5` — View diff (AGENT-CHANGE-HISTORY-2).** Added the redacted `diff` + `ai_cost_event_id`
  columns/contract, persisted the secret-scrubbed `ConfigDiff` per change, and a per-item **View diff**
  that reuses the live "Review changes" renderer.
- **`d7ac97592` — Test-fix history + eval linkage (AGENT-CHANGE-HISTORY-3).** `tested` / `test_failed`
  verification entries driven off the next user-run after a repair apply, and linkage to the
  `ai_cost_events` row on the server apply / failed-run repair path where one exists.
- **`b0d9a13b4` — History tab UX restructure (AGENT-CHANGE-HISTORY-4).** Moved the timeline into a
  top-level **History** tab, removed the permanent rail footers (Recent checkpoints + Agent changes),
  and replaced inline restore confirmation with a non-layout-shifting **Restore popover**.
- **`8132794d0` — DB/RLS coverage.** Focused integration test for `agent_change_history` RLS +
  write-constraint behavior against the dev DB.

---

## 2. Completed commit chain

| Commit | Message | Date |
|--------|---------|------|
| `6723eccf6` | feat(workflows): user-visible React Agent change history (AGENT-CHANGE-HISTORY-1) | _2026-06-29_ |
| `c718c42f5` | feat(workflows): View diff per agent-change item + diff/cost-event schema (AGENT-CHANGE-HISTORY-2) | _2026-06-29_ |
| `d7ac97592` | feat(workflows): test-fix history + eval-event linkage on the repair path (AGENT-CHANGE-HISTORY-3) | _2026-06-29_ |
| `b0d9a13b4` | feat(builder): move Agent Change History into a top-level History tab (AGENT-CHANGE-HISTORY-4) | _2026-06-29_ |
| `8132794d0` | test(security): add agent_change_history RLS + constraint integration coverage | _2026-06-29_ |

All five are real commits on local `v2-main` (verified via `git log`/`git show`). The orphaned
`AgentChangesPanel.tsx` (the original rail panel) was deleted in an **adjacent** out-of-scope builder
commit (`414a0a9b3`), not in `b0d9a13b4`; `b0d9a13b4` itself removed the footer *rendering* from
`BuilderGuidanceRail` and introduced `HistoryPanel` + `RestoreConfirmPopover`.

---

## 3. Launch checklist

- [x] Account-scoped `agent_change_history` table created with RLS + GRANTs (`20260716000000`).
- [x] Migration applied to the dev DB (empirically: the RLS integration test ran green against it
      this session — see §8). **Production apply: not verified this session.**
- [x] Contract / repository / service / route / client-API path in place.
- [x] Builder emits history on preview / apply / discard / undo / restore.
- [x] Per-item **View diff** reuses `ConfigDiff` + `PreviewReviewPanel` (no second diff engine).
- [x] **Restore** offered only where a linked checkpoint still exists (`checkpointId !== null`).
- [x] `tested` / `test_failed` repair-verification entries wired off the next user run after a repair.
- [x] Eval/cost-event linkage populated where a real `ai_cost_events` row exists; `null` otherwise.
- [x] Top-level **History** tab; permanent rail footers removed; restore via popover.
- [x] No raw config values / before-after values / secrets / tokens stored (contract + service
      sanitizer + DB object-shape CHECK; asserted by the RLS test).
- [x] DB/RLS integration test added and green this session.
- [x] `lint` / `lint:migrations` / `lint:structure` / `tsc --noEmit` run green this session (§8).
- [ ] **Feature-level unit/component/route/service test suites re-run this session** — NOT done.
      The test files exist and ship with their commits, but only the new RLS test + the lints +
      typecheck were executed this session (§8).
- [ ] **Pushed / PR'd / deployed** — NOT done (local-only by instruction).
- [ ] **Production migration apply** — not verified this session.
- [ ] Per-chat-turn history footer (turn ↔ agentChange correlation) — deferred (§7).

---

## 4. Current behavior (end to end)

- **The table.** `agent_change_history` records one row per notable agent interaction on a workflow,
  carrying: the user's own `prompt`, `created_at` timestamp, a typed `status`, value-free
  `title`/`summary`, the change `counts` (changed/added/removed nodes, changed config) and a
  `setup_issue_count`, optional links (`checkpoint_id`, `run_id`, `ai_cost_event_id`,
  `preview_patch_ref`), a redacted `diff`, and aggregate-safe `metadata`. It is the user-facing
  timeline — distinct from `workflow_checkpoints` (restore points) and from the value-free
  governance audit ledger.
- **Emission.** The builder records a change from the preview lifecycle: `preview_created` on a
  shown preview, then a transition in place to `preview_applied` / `preview_discarded` / `undone` /
  `apply_failed` sharing the same client-minted `agent_change_id`; a checkpoint **restore** is its
  own `restored_checkpoint` row.
- **View diff.** Each history item with a stored diff exposes **View diff**, opening
  `AgentChangeDiffDrawer`, which renders the persisted redacted `ConfigDiff` through the same
  `PreviewReviewPanel` the live rail uses.
- **Restore.** Items whose linked checkpoint still exists offer **Restore** (via
  `RestoreConfirmPopover`), reusing the builder's existing checkpoint-restore path. When the
  checkpoint has been pruned (`checkpoint_id` SET NULL), the Restore action disappears; the history
  row survives.
- **Repair verification.** After a repair apply, the next user run produces a `tested` or
  `test_failed` entry (driven by `useRepairTestVerification` / `repairVerificationStore`), reflecting
  whether the subsequent run succeeded. This follows a real user run — it is **not** an automatic
  test execution (§7).
- **Eval / cost linkage.** On the server apply / failed-run repair path, the row links to the
  `ai_cost_events` row for that change where one was written; `ai_cost_event_id` is `null` for paths
  that write no cost event (e.g. the local builder overlay apply).
- **History tab.** The timeline lives in a top-level **History** tab in the builder. The previous
  permanent rail footers ("Recent checkpoints" and "Agent changes") were removed; restore uses a
  popover rather than a layout-shifting inline confirmation.

---

## 5. Architecture summary

- **Layered path:** `contracts/agentChangeHistory.ts` (Zod request + safe DTO) →
  `repositories/agentChangeHistory.ts` (SSR-cookie client, DB only, RLS as backstop) →
  `services/workflows/agentChangeHistory.ts` (clamp/sanitize, create-vs-transition, prune,
  project to DTO) → `app/api/workflows/[id]/agent-changes/route.ts` (thin: auth → account-member
  gate → delegate) → `lib/api/agentChangeHistory.ts` (client API:
  `listAgentChangeHistory` / `recordAgentChange`) → builder hooks/panels.
- **Diff reuse.** No second diff engine: the stored diff is the same secret-scrubbed `ConfigDiff`
  shape produced by `core/workflows/buildConfigDiff`, and the history drawer reuses
  `PreviewReviewPanel`. The service defensively re-scrubs secret-flagged fields and size-caps the
  diff before persisting.
- **RLS / account-membership model.** RLS gates SELECT/INSERT/UPDATE/DELETE by **account
  membership joined through `workflows.account_id`** (mirrors `workflow_checkpoints`), not by
  creator. `account_id` is denormalized for cheap scoping (CASCADE with the account);
  `created_by_user_id` is provenance only, never authorization. Members write via the authenticated
  client (RLS as backstop); the route's `loadWorkflowForMember` is the explicit membership gate
  (non-members collapse to the standard 404).
- **No raw values/secrets.** The contract does not even accept config values / before-after values /
  raw patches / tokens; the service sanitizer forces secret-flagged diff fields to
  `{ kind: 'redacted' }`; and DB CHECKs require `diff` + `metadata` to be JSON objects (so no scalar
  value blob can be smuggled). `prompt` is the member's own request text; `title`/`summary` are the
  secret-scrubbed descriptions already shown in the live preview.

---

## 6. Security / no-leak guarantees

- Account members (owner **and** non-creator co-members) can read/write their account's workflow
  history; a different-account user and anon get **zero rows** (no existence leak), and a forged
  `workflow_id` insert is rejected by the policy `WITH CHECK` (42501).
- Service-role (the system path) is the only writer that bypasses membership.
- No tokens / secrets / config values / before-after values stored or returned; diff value-level
  redaction is enforced in the service and the DB enforces object shape.
- `UNIQUE(workflow_id, agent_change_id)`, status CHECK, FK integrity, object-shape CHECKs, and
  non-negative count CHECKs are all enforced at the DB and asserted by the integration test (§8).

---

## 7. Deferred / known limitations

- **Eval linkage is `null` where no real `ai_cost_event` exists.** Only the server apply / failed-run
  repair path writes a cost event; the local builder overlay apply does not, so those rows carry
  `ai_cost_event_id = null` by design.
- **`tested` / `test_failed` follows the next user run, not automatic test execution.** There is no
  automatic test harness run on apply; the verification entry reflects the outcome of the user's
  subsequent run after a repair.
- **Per-chat-turn history footer deferred.** A footer correlating history to individual chat turns
  needs a turn ↔ `agentChange` correlation design that does not exist yet; not built.
- **Apply-modes (`kept_as_preview`) is a separate concurrent arc**, not part of these five commits.
  Its contract/repo/service edits and `20260717000000_…kept_as_preview.sql` were **uncommitted WIP**
  in the worktree at closeout time and are out of scope here.
- **Pre-existing unrelated test failure (observed this session):**
  `tests/integration/security/workflow-node-credentials-rls.test.ts` fails its anon assertion
  (`expect(anonOnA).toHaveLength(0)` on a `null` because anon has no Data API grant on that table, so
  PostgREST returns 42501 → `null` data). It is a committed file outside this arc; not modified here.
  (The new RLS test uses the robust `(data ?? []).length` pattern and is unaffected.)
- **Local-only.** Nothing pushed; no PR; no deploy. Production migration apply not verified.

---

## 8. Verification baseline

**Run this session (newly measured):**

- `npx jest tests/integration/security/agent-change-history-rls.test.ts` → **12 passed** against the
  dev DB (with `ALLOW_DB_INTEGRATION_TESTS=true` + Supabase URL/anon/service-role keys). This is also
  the empirical proof that migration `20260716000000` (incl. the diff/cost-event columns) is applied
  to the **dev** DB.
- `npx jest tests/integration/security/workflow-node-credentials-rls.test.ts` (closest analog) →
  **3 passed, 1 failed** — the failure is the pre-existing unrelated anon assertion noted in §7.
- `npm run lint:migrations` → OK. `npm run lint:structure` → OK.
- `npm run lint` → **0 errors**, 11 pre-existing `max-lines` warnings (unrelated).
- `npx tsc --noEmit` → clean (no errors).

**NOT run this session (exists, not executed):**

- The feature commits' own unit/component/route/service suites — these test files ship with their
  commits and are real (e.g. `agent-changes-route.test.ts`, `agentChangeHistory.test.ts` service +
  repository, `AgentChangesPanel.test.tsx`, `PreviewReviewPanel.test.tsx`, `useAgentChangeEmission`,
  `agentChangeSummary`, `useRepairTestVerification`, `RunResultsRepairBlock`, `ai-apply-route`,
  `aiCostEvents`, `recordAiRouteEvents`, and `HistoryPanel.test.tsx` / `CanvasActionBar.test.tsx`) —
  but were **not executed this session**. Their green state is **not** independently confirmed here;
  it is inherited from when those commits were authored.

**Migrations / flags:**

- `20260716000000_agent_change_history.sql` — applied to **dev** (verified above). Production apply
  not verified.
- This arc adds **no feature flag**. (The separate apply-modes arc and its `20260717` migration are
  out of scope — §7.)

---

## 9. Recommended next tracks

- Re-run and confirm the feature-level unit/component/route/service suites green together on a clean
  tree (they were not executed this session).
- Land or close out the concurrent apply-modes arc (`kept_as_preview` + `20260717`) so the worktree
  is no longer carrying uncommitted WIP across this surface.
- Fix the pre-existing `workflow-node-credentials-rls.test.ts` anon assertion (switch to the robust
  `(data ?? []).length` pattern) so the security suite is fully green.
- Design the turn ↔ `agentChange` correlation if the per-chat-turn footer is still wanted.
- Apply `20260716000000` to production (and verify) as part of the launch push.

---

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc path:
[`docs/slices/phase-5/agent-change-history-closeout.md`](./agent-change-history-closeout.md).
