# REACT-AGENT-CS-7B-REPAIR-PATCH-REF — Implementation note

**Type:** Implementation slice (helper + audit threading). Local commit, **nothing pushed**.
No migration, no env/provider change, no UI change.
**Date:** 2026-06-19
**Branch:** `v2-main`
**Parent:** [react-agent-cs-7-approval-governance-plan.md](./react-agent-cs-7-approval-governance-plan.md)
(§6 recommended the deterministic content-hash ref) → CS-7b. Builds on CS-6 repair proposal
wiring + CS-5d audit emission.

## What changed

Adds a deterministic, opaque, one-way **repair-patch reference** and threads it into the repair
**preview** audit row, so a future apply audit row (CS-7d) can correlate to the proposal that
produced it — **with no approval table**. Apply remains unwired.

- **Helper** `services/ai/repair/repairPatchRef.ts` — `repairPatchRef(input)`:
  - **Input:** `{ workflowId, baseRevision, operations }`.
  - **Output:** `repair_patch_sha256:<64-hex>` — or `null` when any required field is
    missing/empty (fail-safe).
  - **Algorithm:** reuses the existing canonical-form SHA-256 `hashPayload`
    ([core/workflows/idempotency.ts](../../../../core/workflows/idempotency.ts)) — object keys
    sorted recursively (operation key order is irrelevant), array order preserved (operation
    order IS semantically meaningful → changes the ref). **No** new hasher/sanitizer.
  - **One-way / opaque:** the raw workflowId, node ids, config VALUES, and operation JSON are
    not recoverable from the digest. Pure; does not mutate input. Carries no accountId /
    userId / prompt / model text.
- **Seam** ([reactAgent/index.ts](../../../../services/ai/reactAgent/index.ts) +
  [types.ts](../../../../services/ai/reactAgent/types.ts)): `runAuthorizedCapability` gains an
  optional `deriveProposedPatchRef?: (result) => string | null | undefined`, called **only on
  the resolved path**, **fail-safe** (a throw or `null` → no ref). The derived opaque ref is the
  only result-derived audit field; **still no metadata at the seam**. Denied/throw paths derive
  nothing.
- **Preview route** ([repair/preview/route.ts](../../../../app/api/workflows/[id]/ai/repair/preview/route.ts)):
  passes `deriveProposedPatchRef` that returns the ref **only when the preview is applyable**
  (`r.ok && r.preview.apply.applyable && operations && baseRevision`), built from
  `r.preview.workflowId` + `apply.baseRevision` + `apply.operations` — which are secret-free by
  construction (a secret-keyed op blocks applyability, per the AI-REPAIR-3A safety contract).

## Where `proposedPatchRef` is attached vs. null

| Path | Ref? | Why |
|------|------|-----|
| Preview model success, **applyable** patch | **ref** | `preview.apply.{operations, baseRevision}` present → deterministic identity. |
| Preview model success, **non-applyable** (validation-blocked) | **null** | No `apply.operations` (not safe to apply) → no deterministic patch. |
| Preview `NO_SAFE_PATCH` / `MODEL_FAILED` / `GRAPH_UNAVAILABLE` | **null** | No preview/operations produced. |
| **Plan** route (`/ai/repair/plan`) | **null** (not wired) | `planWorkflowRepair` returns a natural-language proposal with **no operations** — no deterministic patch identity exists, so the plan route deliberately does not pass a deriver. |
| Deterministic/model-free preview paths | **null** (unaudited) | Run before the gate and are not the AI proposal capability (unchanged from CS-6 — no audit row at all). |
| denied / exec-throw | **null** | Derived only on the resolved path. |

## No-leak

The ref is a SHA-256 digest — opaque and one-way. **No raw operations, patch JSON, model
output, prompt, or config value enters the audit** (verified: the audit input has no `metadata`,
and the serialized input contains neither the config value nor node ids). The seam still attaches
no metadata; only the opaque ref + the existing safe enums.

## Unchanged / not done

- **Route response contracts unchanged** — the ref is audit-only; the preview/plan response
  bodies are byte-for-byte the same (audit is a fail-open side effect).
- **No apply wired**, no workflow mutation, no new capability/intent, no schema/migration, no UI.
- Recorder + seam remain **fail-open** (CS-5c/CS-5d) — a recorder/deriver failure can't break
  the response.

## Tests / verification

- Helper (`repairPatchRef.test.ts`): opaque-shape; determinism; key-order invariance; operation
  **order** sensitivity; workflowId/baseRevision/config-value sensitivity; fail-safe nulls
  (null/empty fields); input immutability; output embeds no raw id/config/op-JSON.
- Seam (`reactAgent.test.ts`): ref threaded on success; omitted when deriver returns null;
  throwing deriver swallowed (result unchanged); no derivation on denied paths.
- Preview route: applyable success attaches an opaque `repair_patch_sha256:…` ref (deterministic
  across calls, no config/node-id leak); non-applyable + model-failure attach none.
- Ran: helper + React Agent seam + both repair routes + Q&A + Explain + recorder + repo +
  migration (**210 passed, 9 suites**); `eslint` touched files (0); `npm run lint:structure`
  (OK); `npm run typecheck` clean for this slice (transient parallel-WIP analytics noise only,
  cleared on re-run; none of this slice's files errored).

## Next slice

**CS-7c** — register the `repair_apply` capability (`requires_approval`, intent `apply_repair`,
`creditFeature: null`, auditKind `react_agent.repair_apply`); then **CS-7d** routes the apply
through the seam and emits the apply audit row, reusing `repairPatchRef` over the applied
operations so the apply row's `proposed_patch_ref` matches the proposal row's — closing the
proposal↔apply correlation.
