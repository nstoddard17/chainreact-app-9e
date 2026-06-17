# 4.AI-REPAIR-SAFETY-HARDENING — Schema-driven field apply-safety + Check/Activate readiness convergence — Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-17
**Branch:** `v2-main`

**Source of truth (verified current state — every file below was read for this plan):**
[services/workflows/patch/applySafety.ts](../../../../services/workflows/patch/applySafety.ts) (the apply-safety contract — `classifyOperationSafety` / `assessApplyReadiness`, the field-level block decision) ·
[core/security/secretKeys.ts](../../../../core/security/secretKeys.ts) (`isSecretLikeKey` — substring/word heuristic) ·
[core/security/recipientKeys.ts](../../../../core/security/recipientKeys.ts) (`isRecipientOrDestinationKey` — word heuristic) ·
[contracts/actionMeta.ts](../../../../contracts/actionMeta.ts) (`FieldMeta` / `OutputMeta` / `ActionMeta` Zod contracts — **`OutputMeta.sensitive` exists; `FieldMeta` has no sensitivity flag**) ·
[services/ai/repair/deterministicRepairPreview.ts](../../../../services/ai/repair/deterministicRepairPreview.ts) (model-free repair previews; `classifyOperationSafety` is the apply gate) ·
[services/ai/repair/repairStrategies.ts](../../../../services/ai/repair/repairStrategies.ts) (per-category strategy builders) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (Check composition; `overallReady` gate at lines ~510-521) ·
[services/diagnostics/workflowReadiness.ts](../../../../services/diagnostics/workflowReadiness.ts) (readiness diagnostic; adds invalid-var-refs + self-loops on top of the engine verdict) ·
[services/workflows/executionReadiness.ts](../../../../services/workflows/executionReadiness.ts) (`checkWorkflowReadiness` — the shared server gate for run-now / Activate / engine) ·
[core/workflows/executionReadiness.ts](../../../../core/workflows/executionReadiness.ts) (`findGraphIssues` / `evaluateExecutionReadiness` — the pure runtime validator; codes: `no_trigger` / `multiple_triggers` / `stale_edge` / `unreachable_node`) ·
[services/ai/tools/providerCatalog.ts](../../../../services/ai/tools/providerCatalog.ts) (`getNodeSchema` → `FieldMeta` is the live field-schema surface repairs already read) ·
[tests/unit/services/workflows/patch/applySafety.test.ts](../../../../tests/unit/services/workflows/patch/applySafety.test.ts) (current apply-safety contract tests) ·
[tests/structure/no-authenticated-integration-grants.test.ts](../../../../tests/structure/no-authenticated-integration-grants.test.ts) (precedent for a regression-guard structure test)

**Sibling docs (not superseded by this plan):**
[ai-repair-3-apply-arc-closeout.md](./ai-repair-3-apply-arc-closeout.md) (Apply arc — LIVE) ·
[ai-repair-coverage-1-self-loop-closeout.md](./ai-repair-coverage-1-self-loop-closeout.md) (self-loop repair — local) ·
[ai-repair-coverage-2-plan.md](./ai-repair-coverage-2-plan.md) (next repair *category* — duplicate-edge; **orthogonal** to this safety-model plan)

---

## 1. Context

The owner approved the AI repair/apply architecture and explicitly forbade a redesign. The
core model stays exactly as shipped:

- deterministic diagnosis first,
- deterministic **no-LLM** repair where possible,
- LLM only for ambiguous explanation/planning, later,
- **all** mutation expressed as a typed `WorkflowPatch`,
- **all** mutation gated by the shared `assessApplyReadiness` / `classifyOperationSafety`,
- Apply stays **draft-only** — never runs, activates, deactivates, registers triggers,
  mutates integrations, or touches credentials.

This plan addresses two specific hardening concerns the owner raised, plus one small
maintainability question. **None of them change the architecture** — they make the existing
safety decision authoritative and close a known asymmetry.

This is a **safety-model** plan. It does not add a repair category (that is
[ai-repair-coverage-2-plan.md](./ai-repair-coverage-2-plan.md)).

---

## 2. Current codebase findings (verified)

### 2.1 Field-level apply safety is key-name heuristics only

The field-level block decision lives in `classifyConfigKey()` inside
[applySafety.ts](../../../../services/workflows/patch/applySafety.ts) (lines ~164-185). For
each config key written by an `updateNodeConfig` or `repairVariableReference` op it returns
one of three block codes, **purely from the key name**:

- `SECRET_WRITE` ← `isSecretLikeKey(key)` ([secretKeys.ts](../../../../core/security/secretKeys.ts)) — substring match on `token`/`secret`/`password`/`credential`/`apikey`/… + word match on `auth`.
- `CREDENTIAL_OR_ACCOUNT_MUTATION` ← `isConnectionIdentityKey(key)` — a hardcoded `CONNECTION_IDENTITY_KEYS` set (`accountid`/`provideraccountid`/`integrationid`/`connectionid`/`credentialid`/`connectedbyuserid`).
- `RECIPIENT_CHANGE` ← `isRecipientOrDestinationKey(key)` ([recipientKeys.ts](../../../../core/security/recipientKeys.ts)) — word match on `to`/`cc`/`bcc`/`recipient`/`channel`/`webhook`/`url`/`email`/`phone`/`address`/`target`/… **unless** `recipientChangeConfirmed`.

These three heuristics are **client-safe, pure, well-tested, and shared** with the chat-fill
eligibility guard — they are good *defense-in-depth*. The gap the owner identified is real:
they are the **only** source of truth. A genuinely sensitive field whose key name doesn't
match (e.g. a provider names its destination field `endpoint`, `route`, `inbox`, `list`, or
`board`; or a token field named `signingMaterial`) classifies as **apply-safe** and a
deterministic repair could rewrite it. The narrow apply allow-list (config + var-repair +
edge + move) limits blast radius, but the seam exists.

### 2.2 The schema already carries sensitivity — but only on OUTPUTS

[contracts/actionMeta.ts](../../../../contracts/actionMeta.ts):

- `OutputMeta.sensitive?: boolean` **already exists** (Slice 3.SEC-7, lines ~316-358). It
  drives run-detail redaction and the variable-picker "Sensitive" chip. It is **additive,
  default-false, purely opt-in** — existing metas parse unchanged.
- `FieldMeta` (lines ~129-296) — the **config-input** contract — has **no** sensitivity
  flag. It carries `name`, `label`, `type`, `required`, `options`, `dependsOn`,
  `optionsSource`, `multiple`, numeric bounds, etc. — nothing that says "this field holds a
  secret / is a recipient / is a connection identity."
- `ActionMeta` already proves the additive-flag pattern twice more: `isDestructive` /
  `requiresConfirmation` / `riskLevel` (Slice 3.SEC-2A) are additive, default-safe, and
  validated by a `superRefine` consistency check.

So the V2-native move is unambiguous: **add an additive sensitivity discriminator to
`FieldMeta`, mirroring `OutputMeta.sensitive` and the risk-flag precedent.** No new system,
no new file, no new concept.

### 2.3 Repairs already read `FieldMeta` at runtime

[repairStrategies.ts](../../../../services/ai/repair/repairStrategies.ts) (`buildMissingFieldOutcome`,
line ~138) and [workflowReadiness.ts](../../../../services/diagnostics/workflowReadiness.ts)
(`resolveFieldLabel`, line ~127) **already call** `getNodeSchema(`${provider}:${type}`)` from
[providerCatalog.ts](../../../../services/ai/tools/providerCatalog.ts) and read
`schema.data.fields`. The metadata is therefore **already on the repair path** — making the
apply gate consult it is wiring, not new plumbing.

> **The one architectural wrinkle to call out:** `classifyOperationSafety` is currently
> **pure and schema-free** — it takes only `operations` + a few flags, no provider/registry
> access. It is also used as **defense-in-depth before execution** (per its own JSDoc,
> "Shared single source of truth between `assessApplyReadiness` and the AI-REPAIR-3C
> executor"). Any schema lookup must NOT be forced into that pure function. See §4.2 for how
> we keep purity (resolve sensitivity to a per-op hint *before* calling the classifier).

### 2.4 Check is stricter than runtime for exactly TWO findings

The shared runtime validator
[core/workflows/executionReadiness.ts](../../../../core/workflows/executionReadiness.ts)
`findGraphIssues` emits four codes: `no_trigger`, `multiple_triggers`, **`stale_edge`**,
`unreachable_node`. `checkWorkflowReadiness`
([services/workflows/executionReadiness.ts](../../../../services/workflows/executionReadiness.ts))
wraps it and is the **single shared gate** for run-now preflight, the Activate gate, and the
engine pre-dispatch backstop.

[diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts)
computes `overallReady = runnable && allRequiredConnected && !hasInvalidRefs &&
!hasSelfLoopEdges` (lines ~510-521). The two extra terms come from
[workflowReadiness.ts](../../../../services/diagnostics/workflowReadiness.ts):
`invalidVariableRefs` (line ~256) and `selfLoopEdges` (line ~258). **Neither feeds the
engine's `runnable`.**

Net result — the seam is exactly two findings:

| Finding | Detected at Check? | Blocks `runnable` / Activate / run-now? | Repairable (deterministic)? |
|---|---|---|---|
| `no_trigger`, `multiple_triggers`, `unreachable_node` | yes | **yes** (runtime) | guidance only |
| **`stale_edge`** (dangling edge) | yes | **yes** (runtime — already in `findGraphIssues`) | yes (`removeEdge`) |
| **`INVALID_VARIABLE_REFERENCE`** | yes | **no** | yes (`repairVariableReference`) |
| **`SELF_LOOP_EDGE`** | yes | **no** | yes (`removeEdge`) |

> **Correction to a common assumption:** dangling `stale_edge` is **already** a runtime
> blocker — it is *not* part of the seam. The seam is **only** invalid-variable-reference
> and self-loop. Both were added Check-only on purpose (AI-REPAIR-3G and COVERAGE-1
> respectively), each documented as "Check deliberately stricter than runtime."

The product consequence: a user can **Publish + Activate + run** a workflow that "Check"
calls not-ready because a field references a deleted step (fails at variable-resolution time)
or a step loops to itself. That is the convergence question.

---

## 3. Product / model decision

- **What this is:** make the *existing* field-safety decision **schema-authoritative** (the
  field metadata declares its own sensitivity; heuristics demote to a secondary net), and
  decide whether the two Check-only structural findings should also gate Publish/Activate.
- **What this is NOT:**
  - NOT a redesign. The patch model, the gate functions, the draft-only Apply, and the
    no-leak contract are all unchanged.
  - NOT a broadening of Apply-eligible operations. The allow-list in
    [applySafety.ts](../../../../services/workflows/patch/applySafety.ts) (`updateNodeConfig`,
    `repairVariableReference`, `addEdge`, `removeEdge`, `replaceEdge`, `moveNode`) does not grow.
  - NOT a weakening of any fail-closed path. Metadata can only **add** blocks; it can never
    *clear* a heuristic block (§4.3).
  - NOT a DB/data change. `FieldMeta` is **code** (in `.meta.ts` files), not stored workflow
    data — so there is **no migration and no backfill** (§Q6).
- **Account-model anchor:** unchanged. Apply still operates only on the account-owned
  workflow *draft*; the credential-sharing/creator-pin policy in
  `core/integrations/credentialSharing.ts` is untouched. Schema-driven field safety is
  strictly *additive* protection over the same boundary.

---

## 4. Recommended approach — Concern #1: schema-driven field safety

### 4.1 Where sensitivity lives — `FieldMeta` (Q1)

Add an **optional, additive** discriminator to `FieldMeta` in
[contracts/actionMeta.ts](../../../../contracts/actionMeta.ts), mirroring
`OutputMeta.sensitive` and the `riskLevel` precedent.

### 4.2 The flag (Q2)

A single 3-value enum, not a boolean — because the apply contract already distinguishes
**three** block reasons and we must preserve them:

```ts
// contracts/actionMeta.ts — additive, default-absent ( = not sensitive )
export const FieldSensitivitySchema = z.enum(["secret", "connection", "recipient"]);
export type FieldSensitivity = z.infer<typeof FieldSensitivitySchema>;

// inside FieldMetaSchema:
sensitivity: FieldSensitivitySchema.optional(),
```

Mapping (1:1 with today's block codes — no new categories, no new copy):

| `FieldMeta.sensitivity` | Apply block code |
|---|---|
| `"secret"` | `SECRET_WRITE` |
| `"connection"` | `CREDENTIAL_OR_ACCOUNT_MUTATION` |
| `"recipient"` | `RECIPIENT_CHANGE` (still allowed only with `recipientChangeConfirmed`) |

Rationale for an enum over `sensitive: boolean`: a boolean would collapse the three block
reasons into one, losing the user-facing distinction (a "this writes to a secret field"
message vs "this changes where the workflow sends") and the `recipientChangeConfirmed` carve-out.

**Keep `classifyOperationSafety` pure.** Do *not* make it call `getNodeSchema`. Instead resolve
sensitivity to a per-op input *before* the pure classifier runs:

```ts
// services/workflows/patch/ (new small helper — schema-aware, impure, thin)
// Resolves, for each config-bearing op, a map fieldKey -> FieldSensitivity from getNodeSchema,
// using the op's target node provider:type. Returns ONLY enum values, never config values.
resolveFieldSensitivity(operations, graph): Map<opIndex, Record<fieldKey, FieldSensitivity>>
```

Then extend the **pure** `classifyConfigKey` to accept an optional resolved sensitivity for
that key and take the **union** (§4.3). The schema read happens in the impure caller
(`assessApplyReadiness` already runs in an async, schema-capable context); the pure classifier
keeps taking plain data, so the executor's defense-in-depth call is unaffected.

### 4.3 Interaction with heuristics — additive union, fail-closed (Q4)

The single most important rule, to honor "do not weaken fail-closed behavior":

```
blocked(key) = metadataSaysSensitive(key)  OR  heuristicSaysSensitive(key)
```

- Metadata is **authoritative** in the sense that it can flag fields the heuristics miss
  (the owner's concern). It is the *source of truth for intent*.
- Heuristics **stay** as a secondary net and can still block on their own. Metadata can
  **never clear** a heuristic hit — a field the heuristic flags stays blocked even if its
  metadata omits `sensitivity`. (Over-blocking is safe; under-blocking is the failure we are
  removing.)
- When both fire, the **metadata** category wins for the user-facing code (more precise),
  but presence-of-block is the union.

This means the rollout is **monotonic**: annotating a field can only *add* protection, never
remove it. There is no flag and no risk window.

### 4.4 Which fields get blocked from deterministic Apply (Q3)

Unchanged in spirit, sharpened in precision. A deterministic Apply is blocked when its
config-write / var-repair targets a field that is `secret` or `connection` (always), or
`recipient` (unless explicitly confirmed) — **by metadata OR heuristic**. No new field
*categories* become blockable; we only stop missing the ones the heuristics can't name.

### 4.5 Anti-drift coverage (the lock-down) (Q5)

The hardening only pays off if metadata coverage doesn't rot. Add a **structure regression
test** (precedent: [tests/structure/no-authenticated-integration-grants.test.ts](../../../../tests/structure/no-authenticated-integration-grants.test.ts))
that walks every registered `ActionMeta`/`TriggerMeta` field and asserts:

> For every field whose **key-name heuristic** says secret/recipient/connection, the field's
> `FieldMeta.sensitivity` is **set** (to the corresponding category).

This converts the heuristics from "the only line of defense" into "a drift detector that
forces the metadata to be filled in." Once coverage is green, the heuristics are pure backstop
— exactly the owner's desired end state — **without** ever deleting them. (Deleting the
heuristics is explicitly out of scope and a no-go; see §10.)

---

## 5. Recommended approach — Concern #2: Check ↔ runtime convergence

### 5.1 Which Check findings should gate Publish/Activate (Q1)

Recommendation, grounded in the two-finding seam (§2.4):

- **`SELF_LOOP_EDGE` → promote to a runtime graph issue.** It is unambiguous, structural,
  and already detected by a pure `core` function (`findSelfLoopEdges`). A self-loop is never
  valid and can only mean a broken graph. Promoting it into `findGraphIssues` makes
  run-now/Activate/Publish reject it — closing the "Check says broken, engine runs it"
  contradiction for the cheapest, safest case.
- **`INVALID_VARIABLE_REFERENCE` → gate Publish/Activate, but treat carefully.** A broken
  `{{deleted.path}}` *will* fail at resolution time, so blocking activation is correct. But
  it is detected by scanning config strings (`findInvalidVariableReferences`), which is a
  heavier and slightly different check than the pure graph validator. Recommendation: gate it
  at the **Activate/Publish** layer (where Check already runs) rather than folding it into the
  hot `findGraphIssues` path used by every engine pre-dispatch — see §5.3.

### 5.2 Which stay warnings (Q2)

Everything `diagnoseWorkflowConnections` surfaces (provider not connected, token expired,
reconnect-needed, recent-run-failed) stays a **warning**, never an activation hard-block —
they are runtime-recoverable and already modeled as warnings/connection findings. This plan
does **not** touch them. The convergence is **only** about the two structural findings.

### 5.3 Activation gate vs publish gate vs UI copy — what changes first (Q3)

Recommended order, least-risky first:

1. **UI copy / Check verdict first (already true).** Check already says not-ready; no change
   needed. This is the safety net while the gates converge.
2. **`SELF_LOOP_EDGE` into `findGraphIssues`** (`core/workflows/executionReadiness.ts`). One
   pure function, one new `GraphIssueCode`. This is the clean convergence — every shared-gate
   consumer (run-now, Activate, engine) inherits it at once, *and* the Check path can then
   drop its separate self-loop term and read it from the shared verdict (removing the
   asymmetry rather than papering over it).
3. **`INVALID_VARIABLE_REFERENCE` at the Activate/Publish service** (`lifecycleOrchestrator.ts`
   / `activeRevision.ts`), as an explicit pre-publish readiness check — *not* in
   `findGraphIssues` — because it is a config-scan, not a graph-topology check, and we do not
   want to add string-scanning to every engine pre-dispatch.

### 5.4 Interaction with active revisions (Q4)

This is the critical safety constraint and the reason to **not** rush runtime changes:

- The active-revision model (durable decision 2026-06-15) means **already-active workflows
  run an immutable snapshot.** Promoting a finding to a runtime blocker must **not**
  retroactively break a *currently-active* revision that happens to contain a self-loop or a
  broken ref — that would take a running production workflow down on deploy.
- Therefore the runtime promotion gates **Publish (snapshotting a new active revision)** and
  **Activate**, i.e. the *write* path that creates the next active revision. It must **not**
  be applied as a fresh validation against an already-active revision at execution time
  without a migration audit of live data.
- **Unverified — must confirm before implementing:** whether any *currently-active*
  production revisions contain a self-loop or invalid ref. Needs a read-only audit (no prod
  data access in this planning slice). If any exist, the promotion needs a grandfather path
  (existing active revision keeps running; the block only applies to the next Publish).

### 5.5 Tests required (Q5)

- Core: `findGraphIssues` emits the new `self_loop_edge` code; `evaluateExecutionReadiness.ok`
  goes false; existing four codes unchanged.
- Service: `checkWorkflowReadiness` surfaces it; Activate/run-now preflight returns the
  standardized `INVALID_WORKFLOW_GRAPH` 422.
- Convergence: `diagnoseWorkflowForAgent` self-loop term now derives from the shared verdict
  (no double source); `overallReady` unchanged in outcome.
- Publish-gate: a draft with an invalid variable ref is refused at Publish with a typed error;
  an **already-active** revision with one is **not** retroactively failed (active-revision
  guard test).
- No-leak: new gate messages carry labels/codes only — no node ids, config values, or tokens.

---

## 6. Secondary concern — `repairStrategies.ts` registry shape

**Finding:** [repairStrategies.ts](../../../../services/ai/repair/repairStrategies.ts) is
~297 lines of free **exported functions** — ~7 recommendation-only outcome builders + 4
patch-producing builders (`buildMissingFieldOutcome`, `buildVariableRepairOutcome`,
`buildEdgeRepairOutcome`, `buildSelfLoopEdgeRepairOutcome`). The orchestration that *chooses*
which builder runs lives in the route/preview layer
([deterministicRepairPreview.ts](../../../../services/ai/repair/deterministicRepairPreview.ts))
via explicit `hasXFinding(dto)` branches, each repeating: short-circuit if no finding → read
graph → call builder → preview ops.

**Recommendation: a *small* registry, only if COVERAGE-2 lands.** Today, with 3 edge-style
repairs, the duplication is tolerable. The smallest shape that reduces drift, if/when a 4th
category (duplicate-edge per [ai-repair-coverage-2-plan.md](./ai-repair-coverage-2-plan.md))
is added:

```ts
interface DeterministicRepairCategory {
  code: AgentFindingCode;                    // e.g. "SELF_LOOP_EDGE"
  hasFinding(dto): boolean;                  // the short-circuit guard
  buildOutcome(graph): StrategyOutcome | null; // the existing builder
  summaryFor(count): string;                 // the count-aware copy
  patchIdPrefix: string;
}
const REGISTRY: readonly DeterministicRepairCategory[] = [ /* dangling, self-loop, … */ ];
```

`runDeterministicRepairPreview` iterates the registry instead of N hand-written branches.
**Do not over-engineer:** keep the recommendation-only outcome builders as-is (they're not a
drift source), keep `removeEdge`-only categories sharing one preview helper, and add the
registry **in the same slice that adds the 4th category** so it earns its keep immediately. If
COVERAGE-2 is shelved, leave `repairStrategies.ts` alone. This is a maintainability nicety,
**not** a safety issue — it carries no behavior change.

---

## 7. Alternatives considered

| Option | Security | Migration | Builder/UI | AI/exec consistency | Verdict |
|---|---|---|---|---|---|
| **A. `FieldMeta.sensitivity` enum, union w/ heuristics, anti-drift test** (recommended) | Strong — schema authoritative, heuristics still backstop, fail-closed monotonic | **None** (code, not data) | Optional later (label) | High — same metadata Check/repair already read | **Chosen** |
| B. `sensitive: boolean` on `FieldMeta` | Weaker — loses 3-way block reason + recipient-confirm carve-out | None | — | Medium | Rejected — collapses categories |
| C. Replace heuristics entirely with metadata | **Unsafe** during rollout — any unannotated field becomes apply-safe (weakens fail-closed) | None | — | — | **No-go** (violates constraint) |
| D. Make `classifyOperationSafety` call `getNodeSchema` directly | Breaks its purity + the executor's defense-in-depth reuse | None | — | — | Rejected — resolve sensitivity *before* the pure fn (§4.2) |
| **E. Promote self-loop to `findGraphIssues`; invalid-ref at Publish gate** (recommended) | Strong — closes seam at the write path; respects active revisions | Possibly a read-only active-revision audit | Check copy already exists | High — single shared verdict | **Chosen** |
| F. Promote both findings into `findGraphIssues` (hot path) | Adds string-scanning to every engine pre-dispatch; risk to active revisions | Needs live-data audit | — | — | Rejected — too broad, perf + grandfather risk |
| G. Do nothing on the seam (leave Check stricter) | Status quo: contradiction persists; users hit resolution-time failures | None | — | Low | Rejected — the owner asked to converge |

---

## 8. Security / data model

- **No schema (DB) change, no migration, no backfill.** `FieldMeta` is in-code metadata
  (`.meta.ts` files), validated at module load by `FieldMetaSchema`. Workflows store config
  *values*, not field metadata — so there is nothing to migrate and no existing-row backfill.
  This is the same shape as the `OutputMeta.sensitive` and `riskLevel` additions, which
  shipped with zero migrations.
- **No-leak intact:** the resolved sensitivity is an **enum**, never a value. Block messages
  stay generic ("writes to a sensitive field"). No node id, config value, token, provider
  body, or trigger payload enters any diagnostics/repair/gate response — unchanged from today.
- **Fail-closed preserved and strengthened:** metadata is union-only; it cannot clear a
  heuristic block. The anti-drift test prevents silent coverage rot. Apply stays draft-only.
- **Active-revision safety (§5.4)** is the one place real-data care is needed — gate the
  *write* path, grandfather running revisions, audit before flipping.

---

## 9. Implementation slice breakdown (ordered, each small)

> All slices: local-only, no push, no flag unless noted. No Apply-eligibility broadening.

- **CS-1 — `FieldMeta.sensitivity` contract (additive).** Add the enum + optional field +
  (optional) a `superRefine` note. Pure contract change; existing metas parse unchanged.
  Tests: contract accepts omitted/each value, rejects bad value.
- **CS-2 — Schema-aware resolution + union in apply-safety.** Add `resolveFieldSensitivity`
  (impure, thin) + extend `classifyConfigKey` to take a resolved category; union with
  heuristics, fail-closed. Keep `classifyOperationSafety` pure. Tests: metadata-flagged
  innocuous-named field blocks; heuristic still blocks when metadata absent; recipient-confirm
  carve-out preserved; executor defense-in-depth path unaffected.
- **CS-3 — Anti-drift structure test + first-wave annotations.** Add the coverage guard
  (§4.5) and annotate the first-wave metas (§Q7) so the guard is green. Mechanical.
- **CS-4 — Self-loop → runtime (`findGraphIssues`).** New `self_loop_edge` code; shared gate
  inherits it; Check self-loop term reads the shared verdict. Tests per §5.5.
- **CS-5 — Invalid-ref Publish/Activate gate.** Pre-publish readiness check in the lifecycle
  service; **grandfather active revisions**; read-only active-revision audit first. Tests per
  §5.5.
- **CS-6 (conditional) — repair registry.** Only bundled with COVERAGE-2's 4th category (§6).

Suggested grouping: **#1 (CS-1→CS-3)** ships independently and immediately (no runtime risk).
**#2 (CS-4→CS-5)** ships as a second mini-arc after the active-revision audit. **CS-6** rides
COVERAGE-2.

## 9.1 First-wave metadata targets (Q7)

Annotate the metas whose config fields are real repair/Apply targets and clearly sensitive —
derive the exact list mechanically from the CS-3 guard (it will name every offender), but the
expected first wave (recipient/secret-bearing send-like actions):

- **Recipient:** Gmail / Microsoft-Outlook `send_email` (`to`/`cc`/`bcc`), Slack / Discord /
  Microsoft-Teams send actions (`channel`), Google-Calendar / Outlook-Calendar create
  (`attendees`), any webhook-URL field.
- **Secret / connection:** any action exposing an API key / token / signing field, and any
  field in the `CONNECTION_IDENTITY_KEYS` family.

> **Unverified:** the precise per-provider field list. Do **not** hand-write it from memory —
> CS-3's guard enumerates it from the live registry, which is the honest source. This plan
> names the *categories*, not a fabricated field inventory.

---

## 10. Risks / open questions (each with a recommendation)

1. **Active revisions containing a self-loop / invalid ref (§5.4).** *Unverified* — needs a
   read-only audit. **Rec:** gate the write path only + grandfather; do the audit in CS-5
   before flipping. **No-go:** retroactively failing a running active revision.
2. **Heuristic false-positives over-blocking after annotation.** Already true today; union
   doesn't worsen it. **Rec:** accept (over-blocking is safe); the metadata category just
   gives a more precise message.
3. **Coverage rot.** **Rec:** the CS-3 structure guard is the mitigation — without it, this
   whole effort decays back to heuristics-only.
4. **Scope creep into removing heuristics.** **No-go in this arc.** Heuristics stay as
   backstop permanently; deleting them is a separate, later decision once coverage is proven
   and stable.
5. **`classifyOperationSafety` purity.** **Rec:** resolve sensitivity before the pure fn
   (§4.2); never inject a registry read into it (keeps executor defense-in-depth intact).

---

## 11. Acceptance criteria

**For this planning slice:** this doc exists under `docs/slices/phase-4/ai/`, every
current-state claim is tied to a file read this session, no source/tests/migrations/UI
changed, nothing pushed.

**For the implementation slices (later):** `FieldMeta.sensitivity` is additive + default-safe;
apply-safety blocks via metadata-OR-heuristic (fail-closed, monotonic); the anti-drift guard
is green; self-loop blocks Activate/Publish via the shared verdict; invalid-ref blocks Publish
without breaking active revisions; no-leak unchanged; Apply still draft-only; Apply-eligibility
not broadened; no migration/backfill introduced.

## 12. Hard boundaries (what this slice did NOT change)

No code, no tests, no migrations, no schema, no UI, no behavior. No feature flag added. The
patch model, the two gate functions, draft-only Apply, the no-leak contract, the key-name
heuristics, and the account/credential model are all untouched. Docs-only, nothing pushed.

## 13. Recommended next step

Pick up **CS-1 + CS-2 + CS-3 as one small mini-arc** (the `FieldMeta.sensitivity` flag, the
union-with-heuristics apply gate, and the anti-drift coverage guard). It is the highest-value,
lowest-risk half — pure additive metadata + a strictly-additive gate change + a regression
guard, with **no runtime, migration, or active-revision exposure**. Defer the readiness
convergence (CS-4/CS-5) to a second mini-arc gated on the read-only active-revision audit.
