# AI-REPAIR-3 — Apply contract & safe-patch guardrails

**Status:** AI-REPAIR-3A landed the *contract + guardrails only*. **No Apply button, no
persistence, no run** exists yet. This doc is the binding contract a future Apply must
satisfy before the button can ship.

**Source of truth (code):**
- Guardrail: [`services/workflows/patch/applySafety.ts`](../../../../services/workflows/patch/applySafety.ts) — `assessApplyReadiness()`.
- Structural validation (composed, not replaced): [`services/workflows/patch/validateWorkflowPatch.ts`](../../../../services/workflows/patch/validateWorkflowPatch.ts).
- Deterministic preview: [`services/ai/preview/previewWorkflowPatch.ts`](../../../../services/ai/preview/previewWorkflowPatch.ts).
- Shared key classifiers: [`core/security/secretKeys.ts`](../../../../core/security/secretKeys.ts), [`core/security/recipientKeys.ts`](../../../../core/security/recipientKeys.ts).

---

## What Apply will eventually do

Apply a **previously-previewed, deterministically-validated, apply-safe** `WorkflowPatch`
to the workflow's persisted definition — a small diff over the existing graph, never a
regeneration. Concretely, only the apply-eligible operation kinds:

- `updateNodeConfig` — safe (non-secret, non-credential, non-recipient) config fields.
- `repairVariableReference` — repair a broken `{{nodeId.path}}` reference on a safe field.
- `addEdge` / `removeEdge` / `replaceEdge` — repair simple broken edge references, validation-gated.
- `moveNode` — layout only.

Untouched nodes/edges are preserved byte-for-byte. The deterministic validator's risk +
`requiresConfirmation` are authoritative; a high-risk/confirmation-required apply still
needs explicit user confirmation even when otherwise applyable.

## What Apply will NEVER do (blocked categories)

Enforced by `assessApplyReadiness` (fail-closed — collects every reason):

| Category | Block code |
|---|---|
| Secret / token / password / credential field writes | `SECRET_WRITE` |
| OAuth/integration credential or provider-account switch | `CREDENTIAL_OR_ACCOUNT_MUTATION` |
| Recipient / destination change (no explicit confirmation) | `RECIPIENT_CHANGE` |
| Trigger change on an active workflow | `TRIGGER_CHANGE_ACTIVE` |
| Trigger change at all (no lifecycle handling yet) | `TRIGGER_CHANGE_REQUIRES_LIFECYCLE` |
| Destructive node deletion | `DESTRUCTIVE_DELETION` |
| Whole-graph replacement (removes every current node) | `WHOLE_GRAPH_REPLACEMENT` |
| Structural add of a node (v1) | `OP_NOT_APPLYABLE` |
| Unknown operation kind | `UNKNOWN_OPERATION` |
| Raw model text instead of typed operations | `RAW_MODEL_TEXT` |
| Empty operation list | `NO_OPERATIONS` |

Apply will also **never** activate a workflow, run/execute it, or mutate credentials —
those are out of the patch model entirely (no such operation kind exists).

## Required preview/apply metadata

A patch may only be applied when the caller can prove all of:

- **workflow id** — the target.
- **base revision** + **preview revision** — the snapshot the patch was built against and
  the snapshot the user reviewed (the preview emits `currentRevision`).
- **typed operation list** — `PatchOperation[]`, never raw model text.
- **fresh validation result** — `validateWorkflowPatch` re-run against the current
  definition immediately before apply (`NO_VALIDATION_METADATA` / `VALIDATION_FAILED`).
- **blocked-operation summary** — `ApplyReadiness.blocks` / `blockedCategories`.
- **generated-at + provenance** (model/diagnosis) — stamped by the caller (kept out of the
  pure contract so it stays deterministic); useful for telemetry, not a gate.
- **no secret values serialized** — the verdict carries only op kinds, non-secret reason
  codes, and safe messages. Never a config value, secret/credential key, token, role, or
  account/provider identity.

> AI-REPAIR-3A did **not** change the existing `PatchPreviewResult` shape. The new
> apply-readiness metadata lives in the standalone `ApplyReadiness` the future apply path
> computes from the typed patch + a fresh validation + a fresh revision. This keeps the
> preview (and the CHECK-ACTIONS diagnosis types that share it) untouched.

## Stale-patch protection

Two independent revision gates, both fail-closed:

- `STALE_PREVIEW` — the patch's `baseRevision` ≠ the previewed snapshot revision.
- `GRAPH_CHANGED_SINCE_PREVIEW` — the workflow changed between preview and apply (fresh
  `currentRevision` ≠ preview revision). Apply **must** read the revision fresh at apply
  time and re-validate; a passing preview is necessary but not sufficient.

(The deterministic validator additionally emits `PATCH_CONFLICT` / `BASE_REVISION_MISSING`
when `currentRevision` is passed to it — the apply path uses both layers.)

## Active-workflow lifecycle boundary

Trigger changes interact with live resources (webhooks, polling). In v1 there is **no**
lifecycle handling, so a `replaceTrigger` is blocked: `TRIGGER_CHANGE_ACTIVE` when the
workflow is active or its state is unknown (fail-closed), `TRIGGER_CHANGE_REQUIRES_LIFECYCLE`
when known-inactive. Enabling trigger apply requires the trigger-lifecycle work to land
first (deactivate → re-point → reactivate).

## Secrets / credentials boundary

Apply never writes secret material or switches the connected account/credential. Secret
keys are classified by the shared `isSecretLikeKey`; connection/account identity keys
(`accountId`, `providerAccountId`, `integrationId`, `connectionId`, `connectedByUserId`,
`credentialId`) are blocked as credential mutation. Credential management stays in the Apps
/ OAuth surfaces — out of the patch model.

## Server persistence boundary

The persistence boundary is the future apply service (`applyWorkflowPatchForAI`, not yet
built). Nothing before it writes: preview, diagnosis, repair-proposal, and this contract
are all read-only. The future apply must: (1) load the **unredacted** current definition,
(2) re-validate, (3) `assessApplyReadiness`, (4) only on `applyable && (!requiresConfirmation
|| userConfirmed)` write a new revision via the normal workflow-save path — never a raw graph
overwrite, never a credential write, never an activation/run.

## Remaining future slices before enabling the button

1. **AI-REPAIR-3B** — apply service: unredacted load → re-validate → `assessApplyReadiness`
   → persist via the standard save path; new revision returned. Server-only, still no UI.
2. **AI-REPAIR-3C** — confirmation UX + the Apply control on a valid, applyable preview
   (honors `requiresConfirmation`), with the immutable "what changed" record.
3. **AI-REPAIR-3D** — recipient/destination change confirmation flow (lifts the
   `RECIPIENT_CHANGE` block behind explicit user opt-in).
4. **AI-REPAIR-3E** (later) — trigger-change apply behind the trigger-lifecycle work.

The Apply button does not ship until at least 3B + 3C are complete and verified.
