# Engine Branching slice — plan

**Status:** Plan / not yet implemented. **Doc-only commit.**
**Accepted audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) §7 Tier C + §10 LARGE platform gap + §12 Tier C slice 3 commit table.
**Native Slice 1 outcomes:** [`docs/slices/parity/native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md).
**Native Slice 2 outcomes:** [`docs/slices/parity/native-nodes-2-tier-b-triggers-outcomes.md`](./native-nodes-2-tier-b-triggers-outcomes.md).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface (to land):** widened [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) (`WorkflowEdge.label?`), widened [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts) (`ActionHandlerResult.branchTaken?`), label-aware traversal inside [`services/execution/engine.ts`](../../../services/execution/engine.ts). No new modules. No migrations. No new providers. Zero per-provider handler edits.

This is the **engine-only platform slice** that unblocks Tier C native control-flow nodes (`if_then_condition` + `router`). It ships **edge labels** + **handler-emitted branch decisions** + **label-aware BFS** + **skip-rest semantics** — and nothing else. No runtime control-flow action lands in this slice; the new contract surface lights up in the next slice (Native Slice 3 — Tier C).

**Implementation does not begin until this plan is committed AND the open contract decisions in §3.4 + §6.2 are resolved.**

---

## 1. Accepted Native Slice 1 + Slice 2 summary

### Slice 1 (Tier A) shipped

- `native:http_request` — pure-handler port (HTTP GET/POST/PUT/PATCH/DELETE, URL allowlist, 256 KiB response cap, 15s default / 30s max timeout, sanitized response headers, non-2xx does not throw).
- `native:format_transformer` — pure-handler port (HTML / Markdown / Plain / Slack-Markdown converter with in-tree converters; no `turndown` runtime dep; 2 MiB output cap).
- `native:delay` — narrow in-process sleep with required `seconds: integer in [1, 30]`.
- Bug fix: `services/triggers/preconditions.ts` exempts `provider="native"` from the OAuth integration presence check.
- 173 native-focused tests; 7087 / 7087 full jest; 2 / 2 Playwright walkthrough scenarios.

### Slice 2 (Tier B triggers) shipped

- `native:manual_trigger` — `POST /api/workflows/[id]/run-now` (owner-only, 256 KiB body cap, async 202).
- `native:scheduled_trigger` — 5-field UTC cron expression via `cron-parser@^5.5.0` (single-file facade), dispatch-then-advance crash safety, single-fire catch-up (no backfill).
- `POST /api/cron/run-scheduled-triggers` cron entry, concurrency 5, per-row 25 s timeout.
- Parallel `NativeActivationFn` registry inside [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts) (zero per-provider edits).
- Slice 2 unit total: 104 new tests; full jest 7389 / 7389; 4 / 4 Playwright walkthrough scenarios.

### Durable rules carried forward (apply to this slice)

- `native` is a non-OAuth pseudo-provider; no manifest; no scopes; no integrations row.
- Native handlers register by `(provider, type)` key in `services/execution/handlers/_registry.ts`.
- No log lines from native code paths. Engine-layer logging continues to capture the run lifecycle.
- `.strict()` schemas reject cosmetic flags at parse time.
- Throw on failure; engine converts to step failure (no `{success, error, message}` envelopes).
- No new runtime dependencies without explicit user approval.
- Bounded outputs everywhere; no raw response spread.
- Pre-commit `git diff --cached <file>` discipline on parallel-edit hot files (`integrations/_registry.ts`, `services/execution/handlers/_registry.ts`, `tests/e2e/helpers/mockMicrosoftServer.ts`).

---

## 2. Why engine branching is required before `if_then_condition` / `router`

The accepted audit ([`parity-native-nodes.md` §10](./parity-native-nodes.md)) flags engine branching as a **LARGE platform gap**: the only blocker between today's linear-BFS engine and the Tier C native control-flow surface. Concretely:

1. **The engine has no concept of "follow edge A vs edge B".** [`services/execution/engine.ts:bfsExecutionOrder`](../../../services/execution/engine.ts) builds a flat adjacency list from `def.edges`, BFS-walks every reachable node from the trigger, and dispatches each in order. There is no per-edge selection.
2. **The handler contract has no return value beyond `output`.** [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts) `ActionHandlerResult` is `{output}`. A handler cannot tell the engine "I chose path X" or "I'm short-circuiting the rest of the workflow".
3. **The edge contract has no `label`.** [`contracts/workflowDefinition.ts:WorkflowEdgeSchema`](../../../contracts/workflowDefinition.ts) is `{id, from, to}`. Builder UIs that want to attach "true" / "false" / "match-A" labels have no place to store them in the persisted definition.
4. **V1's `if_then_condition` + `router` both depend on these primitives.** V1's `executeRouter.ts` (269 LOC) returns a `selectedPathId` that V1's `advancedExecutionEngine` consumes to skip non-selected outgoing edges. V1's `executePath.ts` / `executeFilter.ts` (the duplicate-implementation pair both unwired or half-wired per audit N-R1) implement single-branch skip-rest.

Building either control-flow action without first widening the engine + contracts forces one of two anti-patterns: (a) the action calls back into the engine via private API (breaks the pure-handler contract); (b) the action "marks" downstream nodes in its `output` and the engine sniffs the output for sentinel keys (couples engine + handler semantics and leaks per-action knowledge into the engine). The accepted audit's recommended fix — **edge labels + handler-emitted `branchTaken`** — is the smallest engine widening that supports both `if_then_condition` (boolean labels) and `router` (N labels) without coupling the engine to any specific action type.

Per the accepted batch plan (audit §13), this slice precedes Native Slice 3 (Tier C) — no `if_then_condition` / `router` runtime implementation lands until this slice is green.

---

## 3. Proposed contract changes

The widening is intentionally narrow: two optional fields, both opt-in. Existing workflows with no labels and existing handlers that return only `{output}` continue to work unchanged.

### 3.1 `WorkflowEdge.label?: string`

Add an optional `label` field to [`contracts/workflowDefinition.ts:WorkflowEdgeSchema`](../../../contracts/workflowDefinition.ts):

```typescript
export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().min(1).max(64).optional(),
});
```

Constraints:
- `label` is **optional**. Missing label = "unlabeled edge" = legacy / always-follow semantics.
- When present, `label` must be a non-empty string ≤ 64 chars. Strict to keep the persisted definition predictable; the action that owns the upstream node decides the label vocabulary (`"true"` / `"false"` for `if_then_condition`, free-form for `router`).
- The existing `WorkflowDefinitionSchema.superRefine` duplicate-edge check stays keyed on `(from, to)` — see §3.5 for the open decision on whether to broaden it to `(from, to, label)`.

### 3.2 `ActionHandlerResult.branchTaken?: string | null`

Widen [`services/execution/handlers/types.ts:ActionHandlerResult`](../../../services/execution/handlers/types.ts):

```typescript
export interface ActionHandlerResult {
  /** Becomes `context.variables[nodeId]` for downstream nodes. */
  output: Readonly<Record<string, unknown>>;
  /**
   * Branch decision for label-aware traversal.
   *   - `undefined` (default): no branch decision; engine follows ALL outgoing
   *     edges regardless of label. Existing handlers behave unchanged.
   *   - `string`: follows only outgoing edges whose `label` matches this
   *     value. Unlabeled outgoing edges are also followed (see §4.2).
   *   - `null`: short-circuits the labeled branches — no outgoing labeled
   *     edge is followed. Unlabeled outgoing edges are still followed.
   */
  branchTaken?: string | null;
}
```

`branchTaken` is **optional**. Provider actions never need to opt in — they return `{output}` exactly as today.

### 3.3 No new failure code in this slice — but two candidates documented

The slice introduces one new failure mode the engine must classify (invalid branch label, §6.1). Two options:

- **3.3.a (preferred):** add `INVALID_BRANCH` to `RunFailureCode` in [`services/execution/engine.ts`](../../../services/execution/engine.ts). Humanizer at [`core/errors/humanizeActionError.ts`](../../../core/errors/humanizeActionError.ts) gets a corresponding row (`title: "Branch label not found"`, `action: "open_node"`, `severity: "error"`).
- **3.3.b:** reuse `HANDLER_FAILED` with a synthetic message. Cheaper, less specific. Worse for the UI's "show what went wrong" surface.

Recommend **3.3.a** — the cost is one enum + one humanizer row + one test case. Acceptance gates the implementation commit.

### 3.4 No `WorkflowNodeKind` widening, no new node-level metadata

The engine does NOT need to know "this node is a branching node" — the presence-or-absence of labeled outgoing edges is the signal. A future builder UI may want to expose a node-kind hint (e.g. badge differently in the canvas) but that is UI metadata, not an engine concern. **Stay narrow: no kind enum extension, no per-node `isBranching` flag.**

### 3.5 Open decision — duplicate-edge check scope

The current `WorkflowDefinitionSchema.superRefine` rejects duplicate `(from, to)` pairs irrespective of labels. With labels in play, a workflow author may legitimately want two edges from a router node to the same downstream node under different labels (e.g. `match-A` and `fallback`). Two options:

- **3.5.a (preferred):** broaden the dedup key to `(from, to, label ?? "")` so different labels between the same node pair are allowed; same-label duplicates are rejected. Matches V1's router semantics.
- **3.5.b:** keep the current `(from, to)` check. Workflow author must pick a single label per pair; downstream merges require an intermediate no-op node. Simpler enforcement but uglier for legitimate router topologies.

Recommend **3.5.a**. Locked before the contract commit.

### 3.6 No change to `WorkflowNodeSchema`, `WorkflowDefinitionSchema.nodes`, `TriggerEvent`, `RunStepResult.output` shape, or `RunResult`

Out of scope. The slice is two field additions plus engine traversal logic plus (possibly) one `RunFailureCode` enum entry.

---

## 4. Label-aware execution plan

### 4.1 Selection rule (per outgoing edge)

For each outgoing edge `e = {from, to, label?}` of node `n` after `n` has executed successfully:

| `e.label` | `n.result.branchTaken` | Edge activated? |
|---|---|---|
| `undefined` (unlabeled) | any value (incl. `undefined` / `null` / string) | **YES** — always-follow |
| `string "X"` | `undefined` (handler emitted no branch decision) | see §6.2 (open decision: default-skip vs default-follow vs hard-fail) |
| `string "X"` | `"X"` (matching label) | **YES** |
| `string "X"` | `"Y"` (non-matching label, where `"Y"` is the label of a DIFFERENT outgoing edge from `n`) | **NO** |
| `string "X"` | `"Y"` (non-matching label, where `"Y"` is NOT the label of any outgoing edge from `n`) | **NO** — and the run **fails** with `INVALID_BRANCH` (see §6.1) |
| `string "X"` | `null` | **NO** |

Net effect:
- **Unlabeled edges are unconditional.** They model "do this regardless of branch decision" — useful for cleanup steps, fan-out from non-branching actions, and the entire legacy / pre-branching workflow corpus.
- **Labeled edges require a matching `branchTaken`.** Multiple labeled edges from the same `n` with the same label all activate (fan-out within a branch — e.g. router's `"yes"` → `[notify, log]`).
- **`branchTaken: null` is the explicit "no labeled edge" choice.** Maps to V1's `if_then_condition` returning false → skip both `true` + `false` branches.

### 4.2 Activation propagation (a node executes IFF it is reachable via an activated edge)

The engine maintains, during execution, a **`reachable` set** of node ids:
- The trigger node is `reachable` at engine entry.
- After a node `n` executes successfully, the engine inspects each outgoing edge; for each activated edge `e`, `e.to` becomes `reachable`.
- A node id present in `reachable` is enqueued for execution; a node id NOT in `reachable` is **skipped** (no handler invocation, no entry in `steps`, no entry in `variables`).

OR-merge semantics: a node with multiple incoming edges executes if **at least one** incoming edge is activated. This matches the natural "wait for any predecessor" model V1 uses; the explicit "wait for all" (AND-merge) is intentionally NOT in scope — it would require a join-node primitive which is not part of Tier C.

### 4.3 BFS ordering

The existing `bfsExecutionOrder()` precomputes a flat order over all reachable-via-edges nodes. With branching, the **order itself does not change** — BFS from the trigger still enumerates every node potentially reachable. What changes is the **dispatch loop**: it consults `reachable` before invoking each node's handler. Nodes not in `reachable` at their dispatch turn are skipped (`status: "skipped"`).

Alternative (rejected for this slice): rebuild the traversal queue dynamically as branches resolve. Cleaner conceptually but harder to reason about for cycle detection (the visited-set guard is part of why the existing engine terminates on cyclic graphs). **Defer dynamic-queue traversal to a later platform slice if it ever becomes necessary.**

### 4.4 Skipped nodes appear in `steps` with `status: "skipped"`

The audit's recommendation is that skipped nodes are **invisible** to the run-history list, but the engine SHOULD emit `RunStepResult { nodeId, status: "skipped" }` rows for them so the run-detail UI can show "this branch was not taken" without inferring it from the topology. This re-uses the existing `status: "succeeded" | "failed" | "skipped"` enum at [`services/execution/engine.ts:RunStepResult`](../../../services/execution/engine.ts) — the `"skipped"` value is already in the schema (Slice 1M wired it for future use) so no schema change is needed.

### 4.5 Variables on skipped nodes

`variables[nodeId]` is NOT populated for skipped nodes. A downstream node that references `{{<skipped-node-id>.<field>}}` in its config will fail with the engine's existing `MISSING_VARIABLE` step result via the strict resolver. This is the intended failure mode — workflow authors who want optional references must either branch the reference paths themselves or use a future merge / null-coalescing primitive (out of scope).

---

## 5. Backward compatibility

The slice is opt-in on both axes. Existing workflows and existing handlers behave **exactly** as today.

### 5.1 Existing workflows without labels

Every edge in every persisted workflow today has no `label`. Under the new rule (§4.1 row 1), an unlabeled edge is always activated. The `reachable` set grows identically to what `bfsExecutionOrder()` produces today. Every existing workflow's step sequence is unchanged.

### 5.2 Existing handlers without `branchTaken`

Every provider action handler returns `{output}` only. `branchTaken` is `undefined`. For a node whose outgoing edges are all unlabeled, traversal is unchanged. For a node that someone has wired with labeled outgoing edges but the handler doesn't return `branchTaken` — see §6.2 open decision.

**Hard guarantee:** zero per-provider handler files are edited in this slice. The handler contract widening is purely additive at the type level.

### 5.3 Existing tests stay green

| Test surface | Why it stays green |
|---|---|
| [`tests/unit/services/execution/engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts) (~30 tests, fully covers linear chains / cycles / failures / persistence / billing / notifications) | All scenarios use unlabeled edges; behavior identical under new rules. |
| All provider-action unit tests (~7000) | Handlers return `{output}` only; engine wraps results as today. |
| All native-action unit tests (~277) | Same — no `branchTaken` in any existing native handler. |
| All trigger-lifecycle unit tests | Triggers are not action handlers; `branchTaken` semantics don't apply. |
| All Playwright walkthroughs (~30 scenarios across providers + native) | Persist workflows with unlabeled edges; behavior unchanged. |
| Structure / migrations / lint scripts | Pure metadata; not exercised. |

The slice's new test surface adds engine-layer tests (§8); no existing test is rewritten.

### 5.4 Existing migrations

Zero migrations. The `draft_definition` JSONB column already accepts arbitrary structured payloads; the optional `label` field passes through unchanged.

---

## 6. Failure behavior

The engine emits one of the following step-level / run-level failures during branching.

### 6.1 Invalid branch label

**Scenario:** handler returns `branchTaken: "maybe"` but no outgoing edge from that node has `label: "maybe"`.

**Engine response:** mark the node `status: "failed"` with `error: { code: "INVALID_BRANCH", message: "Handler returned branchTaken='maybe' but no outgoing edge has that label." }`, set `runFailed = true`, halt traversal. Humanizer renders a `"Branch label not found"` card with `action: "open_node"`.

**Rationale:** silent skip would hide handler bugs (e.g. typo in a router config); the same `INVALID_BRANCH` code makes the failure debuggable from the run-history UI.

### 6.2 Open decision — handler returns `undefined` `branchTaken` but has labeled outgoing edges

Three options:

- **6.2.a (lean strict):** treat undefined as `null` — no labeled edge activates; unlabeled edges still do. Permissive default; new failure code never needed.
- **6.2.b (lean explicit):** fail the node with `INVALID_BRANCH` (or a new `MISSING_BRANCH_DECISION`) — handlers that wire labeled edges MUST return `branchTaken`.
- **6.2.c (configurable):** introduce per-node `requireBranch: boolean` metadata. Overkill for this slice.

Recommend **6.2.a**. Net effect: if a workflow author drags a labeled edge off a node whose handler doesn't know about branching, the labeled downstream is silently skipped. That feels surprising but is symmetric to "unlabeled edges always activate" (the action made no branch decision → no labeled branch activates). Documented in CLAUDE.md if accepted. Locked before the contract commit.

### 6.3 `branchTaken` references missing edge label (same as §6.1)

Already covered. Listed separately in the brief; the implementation is the single code path in §6.1.

### 6.4 Multiple matching labels

**Scenario:** router node `n` has outgoing edges `e1: label="yes" → a1` and `e2: label="yes" → a2`. Handler returns `branchTaken: "yes"`.

**Engine response:** activate BOTH edges. `a1` and `a2` both become `reachable`. This is the intended fan-out-within-branch semantics — V1's router supports the same.

§3.5's dedup-key broadening allows `(from, to1, "yes")` + `(from, to2, "yes")` because the `to` differs. Same `(from, to, label)` triple stays rejected as a duplicate.

### 6.5 Branch handler fails BEFORE making a branch decision

**Scenario:** handler for branching node `n` throws before returning.

**Engine response:** existing `HANDLER_FAILED` semantics. `n` is marked failed; `runFailed = true`; no downstream nodes execute. **No change** to the existing failure path. The branching logic only kicks in on a successful handler return.

### 6.6 Branch handler returns `branchTaken: null` and there are unlabeled outgoing edges

Per §4.1 row 7, unlabeled outgoing edges still activate. This is the "post-branch always-run" pattern (e.g. analytics emit + cleanup after a conditional that no-ops).

### 6.7 Cycles with branching

The existing visited-set guard still applies. A node that becomes `reachable` more than once via different paths is executed at most once per run (the first activation wins; subsequent activation attempts are no-ops). Cyclic graphs with branching still terminate.

---

## 7. Data-passing behavior

The slice does NOT change the resolver, the variable namespace shape, or the `triggerEvent` / `trigger` aliases. It DOES change which nodes contribute variables (skipped nodes do not).

### 7.1 Branch-selected downstream node receives upstream variables

A downstream node `d` whose incoming edge was activated runs after its predecessor `n` produced `variables[n.id] = result.output`. The resolver sees `n`'s output exactly as today. `d`'s config can reference `{{n.field}}` and the resolver resolves normally. No new namespace; no new template syntax.

### 7.2 Skipped branch nodes do not run

Per §4.2. No handler invocation, no provider-API call, no side effects.

### 7.3 Skipped branch nodes do not produce variables

Per §4.5. `variables[skippedId]` is undefined; references to it from downstream nodes fail via the existing strict-resolver `MissingVariableError` path.

### 7.4 Downstream merge behavior (explicit)

A node `m` with two incoming edges `e1: from=A` (activated, A succeeded) and `e2: from=B` (B skipped) executes as soon as `e1` activates — OR-merge per §4.2. References in `m.config` to `{{A.field}}` resolve normally; references to `{{B.field}}` fail. Workflow authors who need to express "values may come from A or B" use either:

- An intermediate router that explicitly nominates which upstream's output is the canonical one (out of scope for this slice's runtime — but the engine accepts the topology).
- A future merge / null-coalescing primitive (deferred — not in any current slice plan).

This is not a regression from V1: V1's `executeRouter` has the same model.

### 7.5 The trigger event continues to be exposed under `trigger` + `<triggerNodeId>`

Unchanged. Always available to every executed node regardless of branching.

---

## 8. Unit test plan

All tests live in [`tests/unit/services/execution/engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts) — the existing engine test file extended with a new `describe("WorkflowEngine — label-aware branching", ...)` block. Helpers (`trigger()`, `action()`, `edge()`) get one additional overload accepting a `label?` arg.

### 8.1 Engine ordering — unlabeled-only baseline (regression guard)

Re-assert the existing linear-chain test (`trigger → action1 → action2`) passes verbatim under the widened engine. Locks the "no-label workflows are identical" guarantee. **1 test.**

### 8.2 Branch selected — `branchTaken: "yes"` activates only the matching edge

`t → router → (label="yes" → A, label="no" → B)`. Handler for `router` returns `branchTaken: "yes"`. Assert: `A` executes, `B` is skipped (appears in `steps` with `status: "skipped"`, no handler invocation), final run `status: "succeeded"`. **1 test.**

### 8.3 False branch selected — `branchTaken: "no"` activates the inverse path

Mirror of §8.2 with `branchTaken: "no"`. Assert: `B` executes, `A` is skipped. **1 test.**

### 8.4 Null branch skips children — `branchTaken: null` skips ALL labeled edges, unlabeled edges still follow

`t → router → (label="yes" → A, label="no" → B, unlabeled → C)`. Handler returns `branchTaken: null`. Assert: `A` skipped, `B` skipped, `C` executes. **1 test.**

### 8.5 Unlabeled legacy edges still work — handler with no `branchTaken` and no labels

`t → A → B → C` (all unlabeled, no `branchTaken` anywhere). Assert: identical to baseline §8.1. Locks the per-handler backward compat guarantee. **1 test.**

### 8.6 Mixed labeled / unlabeled — labeled edges respect `branchTaken`, unlabeled always follow

`t → router → (label="path1" → A, unlabeled → CLEANUP)`. Handler returns `branchTaken: "path1"`. Assert: both `A` and `CLEANUP` execute. Handler returns `branchTaken: null`. Assert: `A` skipped, `CLEANUP` executes. **2 tests (one per `branchTaken` value).**

### 8.7 Missing label handling — INVALID_BRANCH on unknown label

`t → router → (label="yes" → A)`. Handler returns `branchTaken: "maybe"`. Assert: `router` step is `failed` with `error.code === "INVALID_BRANCH"`, run `status: "failed"`, `A` does NOT execute, persistence + notification both fire with the new humanized classification. **2 tests (one for run shape, one for persistence + notification).**

### 8.8 Default branch decision (§6.2 lock) — handler returns undefined `branchTaken` with labeled outgoing edges

Implementation per the locked §6.2 outcome. Assuming **6.2.a (permissive)**: handler returns `{output}` only, no `branchTaken`. `t → router → (label="yes" → A, unlabeled → C)`. Assert: `A` skipped (no decision = no labeled activation), `C` executes. **1 test.**

### 8.9 Fan-out within a branch — multiple edges with the same label both activate

`t → router → (label="match" → A, label="match" → B, label="other" → C)`. Handler returns `branchTaken: "match"`. Assert: `A` AND `B` both execute, `C` skipped. **1 test.**

### 8.10 OR-merge — downstream node with one activated + one skipped predecessor still runs

`t → router → (label="left" → A → M, label="right" → B → M)`. Handler returns `branchTaken: "left"`. Assert: `A` executes, `B` skipped, `M` executes (activated via `A`'s outgoing unlabeled edge). **1 test.**

### 8.11 Skipped node references in downstream config → MISSING_VARIABLE

`t → router → (label="taken" → A → C, label="not-taken" → B)` where `C.config = { x: "{{B.field}}" }`. Handler returns `branchTaken: "taken"`. Assert: `B` skipped, `C` fails with `MISSING_VARIABLE`, run `status: "failed"`. Confirms the natural failure mode for the "reference a skipped node" anti-pattern. **1 test.**

### 8.12 Cycle with branching — visited-set still bounds traversal

`t → A → B (cyclic back to A)` with one branch label per edge. Assert: each non-trigger node executes at most once; run terminates; no infinite loop. **1 test.**

### 8.13 Duplicate-edge dedup with labels (`contracts/workflowDefinition.ts` change, per §3.5)

Parse a workflow with `{from: "n", to: "m", label: "a"}` + `{from: "n", to: "m", label: "b"}`. Assert: parse succeeds (different labels). Parse a workflow with `{from: "n", to: "m", label: "a"}` + `{from: "n", to: "m", label: "a"}`. Assert: parse fails with the existing duplicate-edge issue. **2 tests in `tests/unit/contracts/workflowDefinition.test.ts`** (existing file — no new test file).

### 8.14 Edge schema accepts label

Parse `{id, from, to, label: "yes"}` — passes. Parse `{id, from, to, label: ""}` — fails (min(1)). Parse `{id, from, to, label: "x".repeat(65)}` — fails (max(64)). **3 tests in `tests/unit/contracts/workflowDefinition.test.ts`.**

### Test totals

- Engine: ~12 tests added in `engine.test.ts`.
- Contracts: ~5 tests added in `workflowDefinition.test.ts`.
- **~17 new unit tests total.** Full jest suite stays at 7389+ passing (delta-only).

---

## 9. E2E plan

### 9.1 Scope — no end-user runtime feature ships in this slice

The slice ships engine + contract widening only. No new node type, no new HTTP route, no new builder UI. A user-facing e2e walkthrough would need a registered branching action (`if_then_condition` or `router`) to exercise the new path — those land in Native Slice 3.

### 9.2 Two options for proving branch flows end-to-end

- **9.2.a (preferred, deferred-to-Slice-3 e2e):** the engine-branching slice ships unit-only coverage. Native Slice 3's Playwright walkthrough exercises the end-to-end branching path via the real `if_then_condition` + `router` actions:
  - Compact workflow: `manual_trigger → if_then_condition (condition=true) → http_request → format_transformer`. Branch true → both downstream native actions run; branch false → both skipped.
  - Compact router workflow: `manual_trigger → router (label="A" / "B" / "C") → 3 parallel downstream branches`. Assert only the chosen branch runs and its output feeds the chained downstream action.
  - Both walkthroughs assert `workflow_runs.steps` contains `status: "skipped"` rows for the not-taken branches and that variable threading still works for the taken branch's downstream.
- **9.2.b (alternative, ship an e2e in this slice via a test-only stub branching action):** add a tiny `native:_test_branch` action gated behind a `process.env.JEST_WORKER_ID`-equivalent check that returns `branchTaken` straight from its config. Lets this slice ship an independent e2e proof. Cost: one more action file, one more registry entry, structure-test exemption, ongoing maintenance for a dev-only artifact.

Recommend **9.2.a**. The engine-branching slice's coverage burden is fully met by §8's unit tests at the engine layer — they exercise the exact same code paths with much tighter assertions. The Playwright walkthrough that proves "branch A runs, branch B does not" is more naturally scoped to the slice that ships the user-visible branching action.

### 9.3 E2E sketch (deferred to Native Slice 3 plan but documented here for completeness)

```typescript
// tests/e2e/native-nodes-slice-3-branching-walkthrough.spec.ts
// SLICE 3 — NOT THIS SLICE. Documented here so the engine-branching plan
// fully discloses how branching will be proven end-to-end.

test("if_then_condition: true branch runs, false branch skipped, output threads to downstream", async ({ page }) => {
  // 1. Create workflow via API: manual_trigger → if_then (cond=true) → http_request (echo) → format_transformer (uppercase).
  //    Edges: trigger → if_then unlabeled; if_then → http_request label="true"; if_then → noop_action label="false".
  // 2. Activate workflow.
  // 3. POST /api/workflows/{id}/run-now with input payload.
  // 4. Poll /api/workflows/{id}/runs until status === "succeeded".
  // 5. Assert steps[]: trigger=succeeded, if_then=succeeded, http_request=succeeded, format_transformer=succeeded, noop_action=skipped.
  // 6. Assert variables: format_transformer's resolved config referenced {{http_request.body}} successfully.
});

test("router: only the chosen branch fires, output threads", async ({ page }) => { /* analogous */ });

test("if_then_condition: false branch skips downstream chain end-to-end", async ({ page }) => { /* analogous */ });
```

### 9.4 No Playwright work in this slice's commits

Gates run unit + structure + migrations + tsc + jest only. Playwright remains at the 30+ existing scenarios.

---

## 10. Commit sequence

Five commits, mirroring Native Slice 1 + Slice 2 cadence. Each commit lands green (all gates pass) before the next.

| # | Commit | Scope | Files staged |
|---|---|---|---|
| 0 | `docs(engine): plan branching execution` | THIS commit (plan doc) | `docs/slices/parity/engine-branching-plan.md` |
| 1 | `feat(engine): add edge labels + handler branchTaken contracts` | `WorkflowEdge.label?` + `ActionHandlerResult.branchTaken?` + duplicate-edge key broadening (§3.5.a) + `INVALID_BRANCH` enum entry (§3.3.a) + humanizer row. **No engine traversal changes yet.** Contracts compile + existing tests stay green because nothing reads the new fields. | `contracts/workflowDefinition.ts`, `services/execution/handlers/types.ts`, `services/execution/engine.ts` (RunFailureCode only), `core/errors/humanizeActionError.ts`, `tests/unit/contracts/workflowDefinition.test.ts` (+5 tests), `tests/unit/core/errors/humanizeActionError.test.ts` (+1 test). |
| 2 | `feat(engine): label-aware traversal + skip semantics` | Implement `reachable` set + per-edge selection rule (§4.1) + skip-step emission (§4.4) + INVALID_BRANCH detection (§6.1) + §6.2.a default-branch handling. | `services/execution/engine.ts` (BFS dispatch loop only — `bfsExecutionOrder` stays as today). |
| 3 | `test(engine): label-aware traversal coverage` | Add the 12 engine tests from §8.1–§8.12. (Contract tests already landed in Commit 1.) | `tests/unit/services/execution/engine.test.ts`. |
| 4 | `docs(engine): engine-branching outcomes` | Retrospective. Mirrors `native-nodes-2-tier-b-triggers-outcomes.md` shape. | `docs/slices/parity/engine-branching-outcomes.md`. |

### 10.1 Why split contracts + traversal across two commits

Commit 1 (contracts) keeps the engine's runtime behavior IDENTICAL: nothing reads `label` or `branchTaken` yet. All existing tests stay green; the diff is type-level + schema + one enum entry. This isolates "did the widening break parsing / existing persistence / existing tests" from "did the new traversal logic work". A revert of Commit 2 leaves Commit 1's contracts in place — workflows can be saved with labels even if the engine ignores them. This matches the Native Slice 1 Commit 1/Commit 2 split discipline.

### 10.2 Pre-commit discipline (carried from Slice 2)

Before each commit, run `git diff --cached <each-staged-file>` and skim for unintended hunks. Slice 1's corrective commit (`ed50446f7`) is the warning shot — same-file concurrent edits ARE going to happen. Files at risk of parallel edits this slice:

- `services/execution/engine.ts` — high-risk (Outlook Mail 2.3 or other chats may touch).
- `services/execution/handlers/types.ts` — low-risk (rarely edited).
- `contracts/workflowDefinition.ts` — low-risk (frozen since Slice 1I).
- `core/errors/humanizeActionError.ts` — medium-risk (any slice adding a new failure code edits it).

Explicit-path staging only. No `git add .`. No push. No PR.

---

## 11. Explicit out-of-scope list

The following are **NOT** in this slice and must not appear in any of its commits:

| Item | Why out of scope |
|---|---|
| `if_then_condition` action implementation | Tier C runtime; lands in Native Slice 3 once this engine slice is green. |
| `router` action implementation | Same. |
| `loop` (action + per-iteration scope + `loop_executions` parallel state + serial / parallel modes) | NPD-N5 — deferred to Phase 6 engine hardening. |
| `wait_for_event` (durable queue + suspended-run state + event-matching dispatcher) | NPD-N5 / NPD-N6 — Phase 6 platform tier. |
| `delay` unbounded / cross-invocation | NPD-N6 — Phase 6. (`native:delay` ≤30s in-process is shipped per Slice 1.) |
| Durable queue (BullMQ / Inngest / etc.) | Out of scope for the engine slice. Engine remains in-process fire-and-forget. |
| Pause / resume of in-flight runs | Same. |
| AI agent + 7 AI sub-actions + `tavily_search` | NPD-N7 — Phase 5. |
| HITL conversation | NPD-N8 — Phase 8. |
| `parse_file` / `extract_website_data` / generic webhook trigger | NPD-N9 / NPD-N3 — pending product signal. |
| 6 V1 orphan handlers | NPD-N10 — PERMANENT SKIP. |
| Join / AND-merge primitive (node executes only after ALL incoming activated) | Out of scope. OR-merge is sufficient for Tier C. Revisit if a real workflow needs join semantics. |
| Per-node `requireBranch: boolean` metadata | §3.4 / §6.2.c — overkill for the slice. |
| Dynamic-queue traversal (rebuild order as branches resolve) | §4.3 — deferred unless a real correctness gap emerges. |
| Builder UI for editing edge labels in the canvas | UI concern. The slice ships the contract; builder UI ships in its own slice. |
| `WorkflowNodeKind` widening beyond `"trigger" | "action"` | §3.4 — no need. |
| New cron route / new HTTP route | None. |
| New runtime dependency | None. The slice is engine + contract + tests only. |

---

## 12. Exit checklist (for the slice as a whole, not this commit)

The engine-branching slice is complete when:

- [ ] Marcus has read §3 (contract changes) and resolved §3.5 (duplicate-edge dedup-key scope) + §6.2 (handler-returns-undefined default).
- [ ] Commit 1 (contracts) lands and is green: `npx tsc --noEmit` + `npm run lint` + `npm run lint:structure` + `npm run lint:migrations` + `npm test`.
- [ ] Commit 2 (traversal) lands and is green; existing ~7389 jest tests stay passing; no provider tests rewritten.
- [ ] Commit 3 (tests) adds the §8 coverage; full jest now at 7389+17 = 7406 passing.
- [ ] Commit 4 (outcomes) lands as the retro.
- [ ] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [ ] No push. No PR.
- [ ] Engine-branching outcomes doc enumerates: contract surface that shipped, durable rules (e.g. "skipped nodes appear in `steps` with status `'skipped'`"), §6.2 lock, §3.5 lock, and the link to Native Slice 3's plan as the next unblocked slice.

**This commit (Commit 0) is doc-only.** Implementation begins at Commit 1.
