# 4.AI-READINESS-CONVERGENCE — Audit + convergence plan (self-loop & invalid-ref vs Activate/Publish)

**Type:** Planning / audit only. **No source, migrations, tests, UI, or behavior changes
in this slice. Nothing pushed.**
**Date:** 2026-06-17
**Branch:** `v2-main`

**Source of truth (verified current state — every file below was read for this audit):**
[core/workflows/executionReadiness.ts](../../../../core/workflows/executionReadiness.ts) (`findGraphIssues` / `evaluateExecutionReadiness` — the pure runtime validator; codes `no_trigger` / `multiple_triggers` / `stale_edge` / `unreachable_node`) ·
[services/workflows/executionReadiness.ts](../../../../services/workflows/executionReadiness.ts) (`checkWorkflowReadiness` — the shared server gate wrapper) ·
[core/workflows/selfLoopEdges.ts](../../../../core/workflows/selfLoopEdges.ts) (`findSelfLoopEdges` — Check-only detector) ·
[core/workflows/invalidVariableReferences.ts](../../../../core/workflows/invalidVariableReferences.ts) (`findInvalidVariableReferences` — Check-only detector) ·
[services/diagnostics/workflowReadiness.ts](../../../../services/diagnostics/workflowReadiness.ts) (Check diagnostic; adds both findings on top of `checkWorkflowReadiness`) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (`overallReady` gate) ·
[app/api/workflows/[id]/activate/route.ts](../../../../app/api/workflows/%5Bid%5D/activate/route.ts) (Activate gate — `checkWorkflowReadiness(workflow.draftDefinition)`, line 138) ·
[app/api/workflows/[id]/publish/route.ts](../../../../app/api/workflows/%5Bid%5D/publish/route.ts) (Publish route — **no readiness gate**, line 50) ·
[app/api/workflows/[id]/run-now/route.ts](../../../../app/api/workflows/%5Bid%5D/run-now/route.ts) (run-now preflight — `checkWorkflowReadiness(executionDef)`, line 289; `executionDef` from `getDefinitionForExecution`, line 225) ·
[services/execution/engine.ts](../../../../services/execution/engine.ts) (engine pre-dispatch backstop — `checkWorkflowReadiness(def)` for `!isTest`, line 291) ·
[services/workflows/activeRevision.ts](../../../../services/workflows/activeRevision.ts) (`getDefinitionForExecution` — live → active revision w/ safe draft fallback) ·
[services/workflows/lifecycleOrchestrator.ts](../../../../services/workflows/lifecycleOrchestrator.ts) (`activate` snapshots a revision; `publish` re-snapshots + repoints, lines 250-275 — no readiness check) ·
[services/workflows/saveDraftDefinition.ts](../../../../services/workflows/saveDraftDefinition.ts) (shared draft-save path) ·
[contracts/workflowDefinition.ts](../../../../contracts/workflowDefinition.ts) (`WorkflowDefinitionSchema.superRefine` — **rejects self-loops**, lines 104-110) ·
[contracts/workflow.ts](../../../../contracts/workflow.ts) (`UpdateWorkflowRequestSchema.draftDefinition = WorkflowDefinitionSchema`, line 319) ·
[services/workflows/patch/validateWorkflowPatch.ts](../../../../services/workflows/patch/validateWorkflowPatch.ts) (AI-apply candidate re-parsed through the schema, line 190) ·
[repositories/workflows.ts](../../../../repositories/workflows.ts) (`workflow_revisions` table + `active_revision_id`, lines 325-389)

**Parent / sibling docs:**
[ai-repair-safety-hardening-plan.md](./ai-repair-safety-hardening-plan.md) §5 (the convergence concern this audit executes) ·
[ai-repair-coverage-1-self-loop-closeout.md](./ai-repair-coverage-1-self-loop-closeout.md) ·
[active-revision-model-closeout.md](../readiness/active-revision-model-closeout.md)

---

## 1. Context

The field-safety track (CS-1…CS-3 + full sweep, commits `55557a2fe` / `d98f877b9`) is
complete and self-guarding. This audit opens the **second** concern from the safety-hardening
plan §5: "Check" marks a workflow not-ready for two structural findings that do **not**
converge with the runtime / Activate / Publish gates.

Corrected scope (per the owner and confirmed here): the seam is **only**
`SELF_LOOP_EDGE` and `INVALID_VARIABLE_REFERENCE`. Dangling `stale_edge` is **already** a
runtime blocker (`findGraphIssues`, [core/workflows/executionReadiness.ts:88-101](../../../../core/workflows/executionReadiness.ts)) and is **not** part of this seam.

This slice is **audit + plan only**. No behavior changes.

---

## 2. Current codebase findings (verified)

### 2.1 Who calls the shared readiness gate

`checkWorkflowReadiness(def)` → `evaluateExecutionReadiness` → `findGraphIssues` + required-field
gaps. The shared gate is called at exactly four runtime sites (grep-verified, non-test):

| Site | Definition validated | Real-run only? |
|---|---|---|
| Activate ([activate/route.ts:138](../../../../app/api/workflows/%5Bid%5D/activate/route.ts)) | `workflow.draftDefinition` (the draft about to go live) | n/a (activation) |
| run-now preflight ([run-now/route.ts:289](../../../../app/api/workflows/%5Bid%5D/run-now/route.ts)) | `executionDef` = `getDefinitionForExecution(workflow, mode)` → **active revision** for live, **draft** for test | yes (real runs) |
| Engine pre-dispatch ([engine.ts:291](../../../../services/execution/engine.ts)) | `def` = the resolved execution definition (**active revision** for live) | yes (`!isTest`) |
| Check diagnostic ([workflowReadiness.ts:245](../../../../services/diagnostics/workflowReadiness.ts)) | draft (or `draftOverride`) | n/a (read-only) |

**Publish does NOT call `checkWorkflowReadiness` at all.** The Publish route
([publish/route.ts:50](../../../../app/api/workflows/%5Bid%5D/publish/route.ts)) authorizes, then calls
`orch.publish(id)`, which only checks `state === "active"` + draft-drift, then snapshots +
repoints ([lifecycleOrchestrator.ts:262-275](../../../../services/workflows/lifecycleOrchestrator.ts)). **Publish is ungated for readiness today.**

### 2.2 Where the two seam findings are detected

- `SELF_LOOP_EDGE` — `findSelfLoopEdges` ([core/workflows/selfLoopEdges.ts](../../../../core/workflows/selfLoopEdges.ts)), consumed **only** by the Check diagnostic ([workflowReadiness.ts:258](../../../../services/diagnostics/workflowReadiness.ts)). Its own header explicitly says it is "DIAGNOSIS-only … NOT part of `findGraphIssues`."
- `INVALID_VARIABLE_REFERENCE` — `findInvalidVariableReferences` ([core/workflows/invalidVariableReferences.ts](../../../../core/workflows/invalidVariableReferences.ts)), consumed **only** by the Check diagnostic ([workflowReadiness.ts:256](../../../../services/diagnostics/workflowReadiness.ts)).

Both feed only `overallReady` in `diagnoseWorkflowForAgent` (lines ~510-521); neither feeds the
engine's `runnable`.

### 2.3 Current behavior matrix

| Surface | `SELF_LOOP_EDGE` blocks? | `INVALID_VARIABLE_REFERENCE` blocks? | Notes |
|---|---|---|---|
| **Check** (verdict / `overallReady`) | **Yes** | **Yes** | stricter-than-runtime by design |
| **Activate** | No | No | gates `findGraphIssues` on the draft only |
| **Publish** | No | No | **no readiness gate of any kind** |
| **run-now** (real) | No | No | gates `findGraphIssues` on the live def |
| **engine pre-dispatch** (real) | No | No | gates `findGraphIssues` on the live def |
| **active revisions** (execution) | No | No | run via the engine path above |

So today **Check is the only surface where either finding blocks.** A user can Activate,
Publish, and run a workflow that Check calls not-ready for either finding.

### 2.4 The two findings have VERY different data-risk profiles (the key audit result)

- **Self-loops are schema-rejected on every write path.** `WorkflowDefinitionSchema.superRefine`
  rejects `edge.from === edge.to` ([workflowDefinition.ts:104-110](../../../../contracts/workflowDefinition.ts)). The PATCH save validates the body through that schema
  (`UpdateWorkflowRequestSchema.draftDefinition = WorkflowDefinitionSchema`,
  [workflow.ts:319](../../../../contracts/workflow.ts)); AI-apply re-parses the candidate through it
  ([validateWorkflowPatch.ts:190](../../../../services/workflows/patch/validateWorkflowPatch.ts)).
  **A self-loop therefore cannot enter a draft, a patch, or a revision through any validated
  write.** The only way one exists is **legacy data** (saved before the rule existed) or a
  direct DB write. This bounds the self-loop population to an auditable, finite, legacy set —
  very likely zero.
- **Invalid variable references are NOT schema-rejected.** `WorkflowDefinitionSchema` validates
  node/edge *structure*, not whether a config string's `{{nodeId.path}}` points at a live node
  (this is precisely the AI-REPAIR-3G production bug: Check said "ready" while a field held
  `{{deleted-uuid.to}}`). They arise from a **normal, legitimate edit** — deleting a node that
  another node references. So invalid-refs **can be present in any current draft or active
  revision**, are not rare, and must be handled without retroactively breaking live workflows.

### 2.5 Active-revision deployment status (critical for prod risk)

Per project memory + [active-revision-model-closeout.md](../readiness/active-revision-model-closeout.md):
the active-revision migration `20260626000000` is **applied to dev only — not pushed, not in
prod.** In **production today**, `active_revision_id` is effectively absent, so
`getActiveDefinition` takes the **safe draft fallback** ([activeRevision.ts:67-68](../../../../services/workflows/activeRevision.ts)) and **live execution runs the DRAFT.** Therefore, in prod
*right now*, the "active revision" the engine validates at pre-dispatch **is the draft**. The
retroactive-break surface in prod is the set of **currently-executed drafts**, not revision rows.

---

## 3. Product / model decision

- **What this is:** converge the two Check-only structural findings with the **write path**
  (Activate + Publish) so "Check says not ready" implies "can't make this live", **without**
  retroactively failing any workflow that is already live.
- **What this is NOT:**
  - NOT a change to Apply safety / Apply-eligible op kinds / field-sensitivity work.
  - NOT a blanket promotion of both findings into the hot engine path. Invalid-ref stays out
    of `findGraphIssues` (config-string scan + would break live workflows with legitimate
    dangling refs).
  - NOT a retroactive kill switch. New blocks apply to **new** Activate/Publish attempts; an
    already-active revision (or, in prod today, an already-live draft) keeps running.
- **No-leak anchor:** any new gate returns safe typed codes + field **labels** / counts only —
  never a config value, the resolved reference value, a token's target beyond the user-authored
  text already deemed safe by the diagnostic, a node's provider body, or a raw error.

---

## 4. Recommended approach (Phase 2)

Two independent, separately-shippable gates, **gated on the read-only audit (§6) for self-loop
only**.

### 4.1 `SELF_LOOP_EDGE` → promote into `findGraphIssues` — CONDITIONAL on a clean audit

Add a new `GraphIssueCode` `self_loop_edge` and emit it from `findGraphIssues`
([core/workflows/executionReadiness.ts](../../../../core/workflows/executionReadiness.ts)) by
reusing `findSelfLoopEdges`. Because every shared-gate consumer (Activate, run-now, engine,
Check) reads `findGraphIssues`, this converges **all** surfaces at once, and the Check diagnostic
can then **drop its separate self-loop term** and read the shared verdict — removing the
asymmetry rather than papering over it.

This is safe to promote into the hot path **iff** the audit shows **zero** currently-executed
definitions (prod drafts today; dev active revisions) contain a self-loop. Given §2.4 (schema
rejects new self-loops), the expected count is **zero**, making promotion the clean, correct
move. The check is O(edges), no string scan — negligible engine cost.

- **If the audit finds > 0:** do **not** promote into `findGraphIssues` in the same step.
  Either (a) clean up the finite legacy set first (each is a no-op `removeEdge` — the existing
  AI-REPAIR-COVERAGE-1 deterministic repair already does exactly this), then promote; or
  (b) fall back to the §4.2 write-path-only pattern for self-loop too.

### 4.2 `INVALID_VARIABLE_REFERENCE` → gate at Activate + Publish only (write path)

Do **not** add invalid-ref to `findGraphIssues` (would add a per-node config-string scan to
every engine pre-dispatch **and** would break already-live workflows that legitimately contain a
dangling ref). Instead gate it at the two **write-to-live** moments, validating the **draft about
to go live**:

- **Activate** ([activate/route.ts](../../../../app/api/workflows/%5Bid%5D/activate/route.ts)): after the existing `checkWorkflowReadiness` gate, run `findInvalidVariableReferences(draft.nodes)`; if non-empty, return a typed `422` (safe shape — see §6/§7).
- **Publish** ([publish/route.ts](../../../../app/api/workflows/%5Bid%5D/publish/route.ts)): Publish is currently ungated. Add a readiness gate **before** `orch.publish(id)` that runs BOTH the shared `checkWorkflowReadiness` (so Publish finally enforces the same structural rules Activate does — including promoted self-loop) AND the invalid-ref check.

This is **unconditionally safe**: it never touches the engine path, so no active revision / live
draft is retroactively failed. It only blocks a **new** Activate/Publish of a draft that Check
already flags.

### 4.3 Net converged matrix (target)

| Surface | self-loop | invalid-ref |
|---|---|---|
| Check | Yes (from shared verdict) | Yes |
| Activate | **Yes** (shared verdict) | **Yes** (new write-path check) |
| Publish | **Yes** (new gate) | **Yes** (new gate) |
| run-now (real) | Yes (shared verdict)\* | No (preserves live drafts/revisions) |
| engine pre-dispatch | Yes (shared verdict)\* | No (preserves live drafts/revisions) |
| active revisions | not retroactively failed (audit-confirmed empty)\* | unchanged — keep running |

\* self-loop reaches run-now/engine only because it lives in the shared `findGraphIssues`;
audit-confirmed-empty means nothing live is affected.

---

## 5. Alternatives considered

| Option | Active-revision safety | Hot-path cost | Convergence completeness | Verdict |
|---|---|---|---|---|
| **A. self-loop→findGraphIssues (audit-gated) + invalid-ref write-path + Publish gate** | Safe (audit-confirmed; new-writes impossible) | self-loop O(edges); invalid-ref off hot path | Full | **Chosen** |
| B. Both findings → `findGraphIssues` | **Unsafe** — invalid-ref breaks every live workflow with a legitimate dangling ref; adds config scan to every pre-dispatch | High | Full | Rejected |
| C. Both write-path-only (neither in `findGraphIssues`) | Safest (nothing live touched) | None | Self-loop not enforced at run-now of an already-live workflow; Check keeps a separate term (asymmetry remains) | **Fallback** if audit > 0 |
| D. Do nothing | n/a | n/a | None — contradiction persists; users hit resolution-time failures | Rejected |
| E. Gate invalid-ref in engine pre-dispatch | **Unsafe** (retroactive kill) | High | — | Rejected |

---

## 6. Read-only active-revision / live-definition audit (design — NOT run in this slice)

**Goal:** count how many currently-executed definitions contain a self-loop and/or an invalid
ref, to decide whether §4.1 promotion is safe. **Counts only — no config values, tokens, names,
or graph contents leave the query.**

**Scope of "currently executed":**
- **Prod today:** `workflows.draft_definition` for workflows in a live state (`active`) — because
  prod has no active revisions yet (§2.5).
- **Dev / post-deploy:** additionally `workflow_revisions.definition` for rows referenced by
  `workflows.active_revision_id`.

**No prod data accessed in this slice.** The repo has no pre-approved "scan all workflow
definitions" read-only tool (the MCP diagnostic suite is per-workflow + gated, not a bulk
scanner). So this slice **provides the exact script** for Marcus to run/approve; it must run with
the **service-role** client and emit counts only. Recommended location `scripts/trash/` (one-off).

```ts
// scripts/trash/audit-readiness-seam.ts  — READ-ONLY. Counts only. No mutation.
import { createServiceRoleClient } from "@/lib/supabase/serviceRole"; // existing service-role factory
import { findSelfLoopEdges } from "@/core/workflows/selfLoopEdges";
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";

const db = createServiceRoleClient();
let live = 0, selfLoop = 0, invalidRef = 0;
const selfLoopIds: string[] = []; // INTERNAL workflow ids only, for follow-up cleanup — no names/config

// 1. Live drafts (the executed def in prod today; the editable def everywhere).
const { data: wfs } = await db
  .from("workflows")
  .select("id, draft_definition, active_revision_id, state")
  .eq("state", "active");
for (const w of wfs ?? []) {
  live++;
  const def = w.draft_definition ?? { nodes: [], edges: [] };
  if (findSelfLoopEdges(def.edges ?? []).length > 0) { selfLoop++; selfLoopIds.push(w.id); }
  if (findInvalidVariableReferences(def.nodes ?? []).length > 0) invalidRef++;
}

// 2. Active revisions (dev / post-deploy — column may not exist in prod yet; guard the read).
//    SELECT definition FROM workflow_revisions WHERE id IN (active_revision_id…) and repeat the
//    two detectors. Same counters; same counts-only output.

console.log(JSON.stringify({ live, selfLoop, invalidRef, selfLoopIds }, null, 2));
```

**Run posture:** dev DB first (`npm`-style tsx run against the dev service-role creds). Prod
requires Marcus's **explicit approval** to point the same read-only script at prod creds — this
slice does not do it. If prod cannot be audited, §4.1 promotion **must** stay behind the
`selfLoop === 0` precondition proven on the environment being deployed.

---

## 6.1 CS-0 audit RESULTS — DEV, read-only (2026-06-17)

**Environment:** dev Supabase project (ref `qcepijemjlkssfkvzlio`). **Prod was NOT touched.**
The script probed the **dev-only** `workflows.active_revision_id` column with a zero-row
`limit 0` select first; its presence confirmed a dev-shaped DB before any row data was read
(a prod-shaped DB lacking the column would have aborted with zero rows read). Ran the SAME pure
detectors the runtime/Check use (`findSelfLoopEdges`, `findInvalidVariableReferences`). Counts
only — no config values, tokens, payloads, names, or account/user ids. The one-off script was
removed after running (its design is embedded in §6).

| Metric | Count |
|---|---|
| Workflows scanned (drafts) | 38 |
| Workflows in `active` state | 0 |
| Workflows with an active revision | 0 |
| **Drafts containing a self-loop edge** | **0** |
| **Drafts containing an invalid variable reference** | **0** |
| Active-revision rows scanned | 0 (none present in dev) |
| Active-revision defs with self-loop / invalid-ref | 0 / 0 |

**Verdict (dev):** **zero** of either finding. **No legacy cleanup needed.** §4.1 self-loop
promotion into `findGraphIssues` is **safe in dev** (nothing live is affected; nothing to clean
up). §4.2 invalid-ref write-path gating was already unconditionally safe.

**Honest scope limits:**
- **Prod is unaudited** (forbidden without approval). Prod has no active-revision columns yet, so
  it runs **drafts**; the prod *draft* population for self-loops/invalid-refs is unknown. Because
  self-loops are schema-rejected on every validated write (§2.4), the prod self-loop risk is
  bounded to pre-rule legacy data — the dev result (0) is consistent with the schema rule holding.
  **Recommendation:** run the §6 script against prod creds with Marcus's explicit approval before
  the convergence deploys, OR accept the dev-proven-zero + schema-guarantee and re-run as a
  pre-deploy gate.
- Dev currently has **0 active workflows / 0 active revisions**, so the active-revision portion of
  the scan was vacuous; the meaningful signal is the 38-draft scan (clean).

**Proceed decision:** self-loop convergence (CS-1) and invalid-ref + Publish gate (CS-2) are
**clear to implement** as separate slices. The only residual gate is a pre-deploy prod re-run of
the count (self-loop only) — not a blocker for local implementation.

---

## 7. API / service / UI expectations (described, not built)

- **No new UI.** Check already renders both findings; the convergence only changes whether the
  *server* refuses Activate/Publish.
- **Activate / Publish error shape:** reuse the existing readiness `422` envelope
  (`{ error, message, … }`). For invalid-ref, a typed `error: "INVALID_WORKFLOW_GRAPH"` (or a
  new `INVALID_VARIABLE_REFERENCE`) carrying **field labels + affected-node count only** — never
  the resolved value, never config. Self-loop, once in `findGraphIssues`, rides the existing
  `INVALID_WORKFLOW_GRAPH` envelope with the new `self_loop_edge` code.
- **Publish route gains a gate** mirroring Activate (the only structural route change).

---

## 8. Tests required (for the implementation slices)

- **Core:** `findGraphIssues` emits `self_loop_edge`; `evaluateExecutionReadiness.ok` goes false;
  existing four codes unchanged; required-field precedence unchanged.
- **Activate:** a draft with a self-loop → 422; a draft with an invalid ref → 422; clean draft → activates.
- **Publish:** the previously-ungated route now 422s on self-loop / invalid-ref; clean draft → publishes; idempotent no-op still works.
- **Engine / run-now (regression):** a self-loop live def → `WORKFLOW_NOT_READY` (proves promotion reached the shared path); an **invalid-ref** live def still runs to its resolution-time behavior (proves invalid-ref was NOT added to the hot path — the active-revision-preservation guarantee).
- **No-leak:** new gate responses carry codes + labels + counts only (assert no config value / token / name).
- **Check parity:** `diagnoseWorkflowForAgent` self-loop term now derives from the shared verdict; `overallReady` outcome unchanged.

---

## 9. Implementation slice breakdown (ordered; each small)

> All local-only, no push. No flag unless the audit forces a staged rollout.

- **CS-0 — run the §6 audit** (dev; prod on Marcus's approval). Output: `{live, selfLoop, invalidRef}`. **Gates CS-1.**
- **CS-1 — self-loop → `findGraphIssues`** *(only if `selfLoop === 0` on the target env)*: new code + reuse `findSelfLoopEdges`; Check drops its separate term. Core + service + Check parity tests.
- **CS-2 — invalid-ref write-path gate** at Activate + Publish, plus the **Publish readiness gate** itself (shared `checkWorkflowReadiness` + invalid-ref). Route tests + no-leak tests.
- **CS-3 (only if audit `selfLoop > 0`)** — deterministic cleanup of the finite legacy self-loop set (existing COVERAGE-1 `removeEdge` repair) **before** CS-1; or adopt the §5-C write-path-only fallback for self-loop.

No feature flag is needed if the audit is clean — the change is additive structural validation on
the write path with no live-execution exposure. A flag is only warranted if CS-1 must ship while a
non-zero legacy self-loop set still exists (it shouldn't — clean up first).

---

## 10. Risks / open questions (each with a recommendation)

1. **Legacy self-loop in a live definition (prod draft / dev active revision).** *Unverified
   until CS-0 runs.* Bounded to legacy data (schema blocks new). **Rec:** make CS-1 strictly
   conditional on `selfLoop === 0`; otherwise clean up first. **No-go:** promoting self-loop into
   `findGraphIssues` without the audit.
2. **Invalid-ref in a live definition is COMMON and legitimate.** **Rec:** never gate it in the
   engine/run-now path; write-path-only. This is the single most important guardrail here.
3. **Publish was previously ungated.** Adding a gate can refuse a Publish that previously
   succeeded. **Rec:** accept — Publish is a deliberate user action that makes a draft live; it is
   the correct convergence point, and it kills nothing already running.
4. **Active-revision model not in prod yet (§2.5).** The audit must scan **drafts** for the prod
   picture, and active revisions for the dev/post-deploy picture. **Rec:** the §6 script scans
   both; re-run after the revision migration deploys.
5. **Error-shape leak.** The existing readiness envelope includes internal node ids in `graph[]`.
   **Rec:** keep parity with today's Activate/run-now behavior (member-only, own workflow); for
   invalid-ref, expose labels + counts, not resolved values.

---

## 11. Acceptance criteria

**This planning slice:** doc exists under `docs/slices/phase-4/ai/`; every current-state claim
traces to a file read this session; no source/tests/migrations/UI changed; nothing pushed.

**The implementation slices (later):** Activate + Publish refuse both findings on the draft;
engine/run-now unaffected for invalid-ref; self-loop promoted only on a clean audit; Check verdict
unchanged in outcome; no-leak preserved; no Apply-safety / field-sensitivity change; no migration;
no retroactive failure of any already-live workflow.

## 12. Hard boundaries (what this slice did NOT change)

No code, tests, migrations, schema, or UI. No Apply-safety or field-sensitivity change. No
`findGraphIssues` change. No engine/run-now/Activate/Publish behavior change. No production data
accessed. Docs-only, nothing pushed.

## 13. Recommended next step

**CS-0 is COMPLETE (dev, 2026-06-17): zero self-loops, zero invalid-refs across 38 drafts; no
active revisions; no cleanup needed (§6.1).** The convergence is cleared to implement:

- **CS-1 — promote `SELF_LOOP_EDGE` into `findGraphIssues`** + Check derives it from the shared
  verdict. Safe per the dev-zero result.
- **CS-2 — invalid-ref write-path gate at Activate + Publish + add the missing Publish readiness
  gate.** Unconditionally safe (never touches the engine path).

Ship CS-1 and CS-2 as **separate** local slices (not combined with this audit). **One residual
pre-deploy gate:** re-run the §6 self-loop count against **prod** (Marcus-approved) before the
convergence deploys — bounded near-zero by the schema rule, but worth a final confirmation since
prod runs drafts and was not audited here.
