# REACT-AGENT-CS-7 — Approved-Repair Governance Plan

**Type:** Planning / design only. **No source, migrations, tests, schema, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent arc:** [react-agent-cs-6-repair-proposal-wiring.md](./react-agent-cs-6-repair-proposal-wiring.md)
(repair PROPOSAL wired) · [react-agent-cs-5d-audit-emission-readonly.md](./react-agent-cs-5d-audit-emission-readonly.md)
(audit emission) · [react-agent-cs-5b-audit-storage.md](./react-agent-cs-5b-audit-storage.md)
(`react_agent_audit_events` storage).

**Source of truth (verified current state — files read for this plan):**
[apply/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply/route.ts) (the guarded apply endpoint) ·
[applyRepairPatch.ts](../../../../services/ai/repair/applyRepairPatch.ts) (the persistence-boundary service) ·
[applySafety.ts](../../../../services/workflows/patch/applySafety.ts) (`assessApplyReadiness` — the safety contract) ·
[executeWorkflowPatch.ts](../../../../services/workflows/patch/executeWorkflowPatch.ts) (deterministic in-memory executor) ·
[patch/types.ts](../../../../services/workflows/patch/types.ts) (patch envelope + operation union) ·
[apply-readiness/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply-readiness/route.ts) (dry-run readiness) ·
[capabilities.ts](../../../../services/ai/reactAgent/capabilities.ts) (capability registry) ·
[reactAgent/index.ts](../../../../services/ai/reactAgent/index.ts) (`runAuthorizedCapability` seam) ·
[reactAgentAuditEvents.ts](../../../../repositories/reactAgentAuditEvents.ts) (audit repo: `proposed_patch_ref` / `approval_id` columns).

---

## 1. Context

The React Agent governs read-only capabilities (`diagnosis_qa`, `diagnosis_explain`) and the
first `proposes_change` capability (`repair_proposal`, CS-6). Every wired capability emits a
`react_agent_audit_events` row through the `runAuthorizedCapability` seam. **No approved-apply
capability exists yet**, and there is no autonomous workflow mutation.

This slice designs the `requires_approval` apply governance **before** wiring it. Architecture
floor (unchanged): AI may propose + preview but MUST NOT apply without explicit user approval;
ChainReact services are the source of truth; approved apply must be deterministic + auditable;
**the model output must never be the authority at apply time — the approved deterministic patch
object is.**

---

## 2. Current codebase findings (verified)

### 2.1 There is already a complete, guarded apply path — it just isn't governed by the seam

`POST /api/workflows/[id]/ai/repair/apply`
([apply/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply/route.ts)):

1. `requireUser()` → 401.
2. `loadWorkflowForMember(id, userId)` → no-leak 404 (not-found AND non-member identical).
3. `assertWorkflowRunEditAllowed(record, userId)` → 403 (the SAME edit gate manual save uses;
   `_shared.ts:541` — WF-RUNPERM + connection-sharing).
4. `applyRepairPatch(...)`.
5. Status map: 409 `STALE_PATCH` · 422 `NOT_APPLYABLE`/`EXECUTION_FAILED` · 200 applied.

Request body: `{ operations: unknown[], baseRevision?, previewRevision?, recipientChangeConfirmed? }`.
The route header states it is **NOT wired into the builder (no Apply button); it exists for
tests + a future UI.** It does **not** call the model and emits **no** telemetry.

### 2.2 The apply is already deterministic and treats the model as non-authoritative

[applyRepairPatch.ts](../../../../services/ai/repair/applyRepairPatch.ts) builds a patch envelope
(`patchId: repair-apply:${workflowId}`) from the client operations, then:

1. **Re-validates** against the FRESH definition + revision via `validateWorkflowPatch`
   (`currentRevision = record.updatedAt`). Per [patch/types.ts](../../../../services/workflows/patch/types.ts),
   the envelope's `riskLevel`/`requiresConfirmation` are **model-proposed and advisory only —
   the validator recomputes both deterministically and overrides** ("a model cannot downgrade
   risk").
2. Runs `assessApplyReadiness` ([applySafety.ts](../../../../services/workflows/patch/applySafety.ts)) —
   the fail-closed, no-leak safety contract: op allow-list (`updateNodeConfig`,
   `repairVariableReference`, `addEdge`, `removeEdge`, `replaceEdge`, `moveNode`); blocks
   `addNode`/`removeNode`/`replaceTrigger`; block codes include `SECRET_WRITE`,
   `CREDENTIAL_OR_ACCOUNT_MUTATION`, `RECIPIENT_CHANGE`, `TRIGGER_CHANGE_ACTIVE`,
   `WHOLE_GRAPH_REPLACEMENT`, `RAW_MODEL_TEXT`, `NO_VALIDATION_METADATA`, `VALIDATION_FAILED`,
   `MISSING_BASE_REVISION`, `STALE_PREVIEW`, `GRAPH_CHANGED_SINCE_PREVIEW`.
3. Gate: nothing executes/persists unless `readiness.applyable`.
4. `executeWorkflowPatch` ([executeWorkflowPatch.ts](../../../../services/workflows/patch/executeWorkflowPatch.ts)) —
   pure, side-effect-free, deep-clones (input never mutated), **re-asserts the op gates as
   defense-in-depth** independent of the passed verdict.
5. Persists DRAFT ONLY via `updateDraftDefinitionIfRevisionMatches` (optimistic,
   account-scoped, `expectedUpdatedAt = currentRevision`; `null` → `STALE_PATCH`).

It deliberately does **not** route through `saveDraftDefinition` (whose active-trigger-change
rule can deactivate a workflow): trigger changes are already **blocked** by readiness, so the
persisted def can only carry config/edge/variable/move changes — nothing to deactivate.

### 2.3 The proposal → apply data flow

The preview proposal route (CS-6) returns `apply: { applyable, operations, baseRevision }`
(verified in the preview fixture). The client re-sends those `operations` + `baseRevision` to
the apply route. The `plan` route produces a **natural-language** proposal only (no operations)
— it is not directly applyable.

### 2.4 A dry-run readiness endpoint already exists

`POST /…/ai/repair/apply-readiness`
([apply-readiness/route.ts](../../../../app/api/workflows/[id]/ai/repair/apply-readiness/route.ts))
runs the full validate + readiness pipeline and returns `{ applyable, readiness, currentRevision }`
**without writing** — the same gates, dry-run.

---

## 3. The approval gap (verified)

| # | Question | Finding |
|---|----------|---------|
| a | Does apply depend only on the frontend sending a patch? | **No.** The client sends `operations`+`baseRevision`, but the server does NOT trust them — it re-validates shape/config/risk, runs readiness, re-asserts op gates in the executor, and optimistic-writes against `expectedUpdatedAt`. The **deterministic re-proven patch is authoritative, not the model output**. (gap already closed) |
| b | Is there a stable patch/proposal id? | **No.** `patchId` is synthetic (`repair-apply:${workflowId}`); `baseRevision`/`previewRevision` are optimistic tokens. No durable proposal identity and **no proposal↔apply correlation**. |
| c | Does the server revalidate the patch against the current workflow? | **Yes** — fresh def + revision; stale/changed → `STALE_PATCH`/`GRAPH_CHANGED_SINCE_PREVIEW`. (gap already closed) |
| d | Does active-workflow lifecycle deactivation happen? | **No deactivation — by design.** Trigger changes are blocked (`TRIGGER_CHANGE_ACTIVE`/`…_REQUIRES_LIFECYCLE`), so the draft write never needs to deactivate. (safe) |
| e | Does apply record who approved? | **Only implicitly** — the authorized editor (`auth.userId`) drives the account-scoped write. No explicit `approved_by`/`approved_at`, no governance row. |
| f | Is apply auditable today? | **No.** Apply does not route through `runAuthorizedCapability` and emits **no** `react_agent_audit_events` row (and no model telemetry). Confirmed: the apply route/service/test reference neither `react_agent` nor `audit`. |

**Net:** safety + determinism + revalidation + lifecycle-safety are **already solid**. The real
gaps are governance-shaped: **(f) no audit trail for apply, (b) no proposal↔apply correlation id,
(e) no first-class approver capture.** None of these require changing how apply decides safety.

---

## 4. Recommended approved-apply governance (minimal, safe)

Wire the existing apply path through the React Agent seam and emit a `requires_approval` audit
row. Change **nothing** about how apply proves safety — only add governance.

1. **New capability** `repair_apply` (registry entry, CS-7c): `allowedIntent: "apply_repair"`
   (new intent), `mode: "requires_approval"`, `creditFeature: null` (apply is deterministic,
   0-credit — it is NOT a model call), `auditKind: "react_agent.repair_apply"`.
2. **Route apply through `runAuthorizedCapability`** (CS-7d): the route keeps owning auth →
   membership → edit gate; the deterministic `applyRepairPatch(...)` becomes the seam `exec`.
   `classifyResult` maps `result.ok` → `success`, else `failed`. The seam **never** calls the
   model (apply has no model client — preserved).
3. **Audit emission:**
   - `success` when the draft is written (`applied: true`).
   - `failed` for `NOT_APPLYABLE`/`EXECUTION_FAILED`; `STALE_PATCH` also `failed` (reason carries
     the safe block category, never config/secret).
   - `denied` for invalid scope / unknown capability / intent mismatch (exec never runs).
   - `actor_user_id` = the approving editor; `account_id`/`workflow_id`/`created_at` give the
     **who-approved-what-when** record — no new column needed.
   - `proposed_patch_ref` = a **deterministic content ref** (see §6); `approval_id` left null
     for now (only needed if durable approvals land — §5 Option B).
   - **No metadata at the seam** (consistent with CS-5d/CS-6) — no operations, patch body,
     config, or block detail beyond a safe enum.
4. **Model is never the apply-time authority** — already true (§2.2); the seam adds governance,
   not a new trust path. Apply must not proceed if the workflow changed (`STALE_PATCH`) —
   already enforced.
5. **Lifecycle** — keep the "block trigger changes, never deactivate" rule (§2.2). A future
   apply that needs trigger changes is a separate lifecycle slice, out of scope here.

---

## 5. New table decision — **Recommend A/C hybrid: NO new table in this arc**

| Option | What it is | Verdict |
|--------|-----------|---------|
| **A — no new table; reuse apply route + audit row** | Apply stays deterministic + revalidating; governance comes from a `react_agent_audit_events` row. | **Recommended (base).** The apply path already has enough deterministic state (re-validation makes the patch authoritative, optimistic concurrency guards staleness, readiness blocks unsafe ops, account-scoped write enforces ownership). Audit closes the only real gap. |
| **C — reuse `react_agent_audit_events.proposed_patch_ref` / `approval_id` as opaque text** | The audit table already has both nullable text columns (CS-5b). | **Recommended (correlation).** Use a deterministic content-hash `proposed_patch_ref` on BOTH the CS-6 preview proposal row and the apply row → storage-free proposal↔apply linkage. `approval_id` stays null until a durable approval is needed. |
| **B — add `react_agent_approvals` / `workflow_repair_approvals` table** | Server-minted, durable proposal/approval identities (client approves by id; one-time-use tokens; cross-session approval queue). | **Deferred.** Only justified when the UX moves from "client re-sends the approved operations" to "client approves a server-stored proposal by id," or we need one-time-use tokens / an approval audit queryable independently of the audit ledger. Not needed for safe apply today; building it now would be Hermes-style over-modeling. |

**Honest rationale:** the task's safety goals are already met by the deterministic pipeline; the
missing piece is the *governance trail*, which `react_agent_audit_events` already provides
(including the two opaque-ref columns). Adding a table now buys durable approval identity we
have no consumer for yet. Revisit Option B at CS-7f if/when server-minted proposals or one-time
approval tokens have a concrete UI/contract driver. **No migration in this arc unless Option B
is later approved separately.**

---

## 6. Proposal↔apply correlation without storage

Add a pure helper (CS-7b) `repairPatchRef(input) → string`: a SHA-256 digest over a **canonical**
representation of `{ workflowId, baseRevision, operations }` (stable key ordering; operation
array order preserved since it is semantically meaningful). Properties:

- **Deterministic** — the same approved operations against the same base revision always produce
  the same ref, so the CS-6 preview proposal row and the CS-7d apply row can be correlated by
  equal `proposed_patch_ref` with **zero storage**.
- **No-leak** — a one-way digest; it is not reversible and carries no plaintext config/secret.
- Plan-route proposals (NL only, no operations) produce no applyable ref — documented; only the
  preview→apply path carries one.

This is the "opaque proposal/patch ref if needed" the brief calls for, achieved without a table.

---

## 7. Security / data model

- **No schema change.** No migration, no RLS/GRANT change. Reuses `react_agent_audit_events`
  (CS-5b: account-scoped, member-read RLS, service-role-write-only, anonymize-retain) and its
  existing `proposed_patch_ref` / `approval_id` columns.
- **No-leak:** the apply audit row carries only ids, registry enums, a safe outcome/reason, and
  the one-way `proposed_patch_ref`. The seam attaches no metadata; the apply route's existing
  no-leak response (op kinds + graph ids + non-secret field keys) is unchanged.
- **Authority:** unchanged — deterministic validate + readiness + executor re-assertion +
  optimistic account-scoped write. The model is not consulted at apply.

---

## 8. API / service / UI expectations

- **Apply route response contract unchanged** — `{ ok, applied, currentRevision, appliedOperations }`
  / `{ ok:false, code, message, blockedCategories? }`. Audit is a pure side effect (fail-open).
- **New intent** `apply_repair` added to `ReactAgentIntent` + `RECOGNIZED_REACT_AGENT_INTENTS`
  ([reactAgent/types.ts](../../../../services/ai/reactAgent/types.ts)).
- **No new UI in this arc.** The apply route remains unwired to a builder button; CS-7d audits
  it anyway (future-proof, consistent with CS-5d/CS-6 auditing currently-inert routes). A real
  Apply button + approval UX is a later, separate slice and must not be implied before wired.

---

## 9. Tests the implementation slices must prove

- **CS-7b:** `repairPatchRef` is deterministic (same input → same digest), order-stable, and
  leaks no plaintext; equal for the proposal and apply of the same operations.
- **CS-7c:** `repair_apply` registered (mode `requires_approval`, intent `apply_repair`,
  `creditFeature: null`, auditKind `react_agent.repair_apply`); `apply_repair` recognized.
- **CS-7d:** apply routes through `runAuthorizedCapability` with `capabilityId: "repair_apply"`;
  emits `success` on applied, `failed` on STALE/NOT_APPLYABLE/EXECUTION_FAILED, `denied` on
  scope/registry/intent reject (exec never runs); `proposed_patch_ref` present + deterministic;
  **apply never imports/calls a model client**; metadata-free / no-leak audit; recorder failure
  swallowed (still applies + returns normally); response contract byte-for-byte unchanged;
  existing apply safety/readiness tests still green.
- **Regression:** Q&A / Explain / repair_proposal audit suites stay green; React Agent import
  guard green.

---

## 10. Implementation slice breakdown

- **CS-7b — patch-ref helper (no schema).** Pure `repairPatchRef`; thread it into the CS-6
  preview proposal audit row's `proposed_patch_ref`. Small, low-risk.
- **CS-7c — register `repair_apply`.** Capability registry entry (`requires_approval`,
  `creditFeature: null`) + add the `apply_repair` intent to the boundary types. Update the
  registry lock/registration tests.
- **CS-7d — route apply through the seam + emit audit.** Wrap `applyRepairPatch` in
  `runAuthorizedCapability` with the live recorder + `classifyResult`; attach `proposed_patch_ref`;
  keep auth/membership/edit-gate/response mapping route-owned; apply still never calls the model.
- **CS-7e — live smoke / manual verification.** Apply happy path + stale + blocked emit correct
  `react_agent_audit_events` rows (query by `auditKind = react_agent.repair_apply`); confirm no
  model call, no deactivation, response contract unchanged.
- **CS-7f (DEFERRED, only if needed) — Option B durable approvals table.** Server-minted
  proposal/approval ids, one-time tokens, or an independent approval queue. Requires a separate
  migration + Marcus approval. Do not build speculatively.

---

## 11. Risks / open questions (each with a recommendation)

1. **Intent: new `apply_repair` vs reuse `propose_repair`?** Recommend a **new `apply_repair`
   intent** — apply is a distinct action/mode (`requires_approval`) and the intent should match
   the action it authorizes; reusing `propose_repair` would blur proposal vs apply in the audit.
2. **`creditFeature` for apply?** Recommend **`null`** — apply is deterministic and 0-credit; it
   is not a model call, so it should not charge or appear as model telemetry.
3. **`proposed_patch_ref` canonicalization.** Recommend canonical JSON (sorted object keys,
   preserved operation array order) before hashing, so the ref is stable across serializations.
4. **Auditing an unwired route.** The apply route has no Apply button yet. Recommend auditing it
   in CS-7d regardless (consistent with CS-5d/CS-6 auditing inert routes) so governance is in
   place before the UI; the doc/UX must not imply a live Apply button until wired.
5. **`STALE_PATCH` → `failed` vs a distinct outcome?** The audit enum is `success|denied|failed`.
   Recommend `failed` with a safe reason (`stale_patch`); a stale apply did not apply, and adding
   a fourth outcome is unwarranted.
6. **Approver identity beyond `actor_user_id`.** For account/team workflows, `actor_user_id` +
   `account_id` already capture who approved within which account. Recommend no extra column;
   revisit only with Option B.

---

## 12. Acceptance criteria

**This planning slice:** the doc exists at the path below; every "current state" claim cites a
file actually read (§2/§3); the recommendation (no new table; audit-based governance + deterministic
patch-ref) is explicit and honest; **no source/schema/test/UI changed; nothing pushed.**

**The implementation arc must later meet:** apply is governed by a `requires_approval` audit row,
the deterministic patch (not the model) is the apply-time authority, apply never calls the model,
the response contract is unchanged, and no secret/config/patch body leaks into the audit.

---

## 13. Hard boundaries (what this slice did NOT do)

No apply wired; no capability registered; no intent added; no migration/schema; no `repairPatchRef`
implemented; no route/service/test/UI changed; no env/provider change. Docs-only. Nothing pushed.
Hermes and MCP remain out of scope and are not dependencies of any recommendation here.

---

## 14. Recommended next step

**CS-7b** — implement the pure `repairPatchRef` helper and thread it into the CS-6 preview
proposal audit row's `proposed_patch_ref` (no schema, fully reversible-free). It is the smallest
slice, unblocks proposal↔apply correlation, and de-risks CS-7d.
