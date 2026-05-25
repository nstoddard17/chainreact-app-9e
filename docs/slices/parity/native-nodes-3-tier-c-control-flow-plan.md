# Native-nodes Slice 3 — Tier C control-flow plan

**Status:** Plan / not yet implemented. **Doc-only commit.**
**Accepted audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) §7 Tier C.
**Native Slice 1 outcomes:** [`docs/slices/parity/native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md).
**Native Slice 2 outcomes:** [`docs/slices/parity/native-nodes-2-tier-b-triggers-outcomes.md`](./native-nodes-2-tier-b-triggers-outcomes.md).
**Engine-branching outcomes:** [`docs/slices/parity/engine-branching-outcomes.md`](./engine-branching-outcomes.md).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface (to land):** new modules under [`integrations/native/actions/`](../../../integrations/native/actions/), new registry entries in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts), no engine changes, no migrations, no new runtime dependencies, no new HTTP routes.

This is the third native-nodes implementation slice. It ships **2 native action handlers** (`if_then_condition`, `router`) that consume the engine-branching contract surface delivered in the engine-branching slice (`WorkflowEdge.label?`, `ActionHandlerResult.branchTaken?`, label-aware traversal, `INVALID_BRANCH` failure code). Closes the **Tier C** parity gap defined in the accepted audit §7.

**Implementation does not begin until this plan is committed AND the open decisions in §5 + §6 are resolved.**

---

## 1. Accepted Native Slice 1 summary

Native Slice 1 shipped (Tier A pure handlers):

- `native:http_request` — pure HTTP request handler (GET/POST/PUT/PATCH/DELETE), URL scheme allowlist, 256 KiB response cap, 15 s default / 30 s max timeout, sanitized response headers, non-2xx does not throw.
- `native:format_transformer` — HTML / Markdown / Plain / Slack-Markdown converter; in-tree converters (no `turndown` dep); 2 MiB output cap; `.strict()` schema rejects V1 cosmetic flags.
- `native:delay` — narrow in-process sleep with required `seconds: integer in [1, 30]`; `setTimeout`-only; defense-in-depth `DelayCapExceededError`.
- Bug fix: `services/triggers/preconditions.ts` exempts `provider="native"` from OAuth-integration presence check.

173 native-focused tests; 7087 / 7087 full jest; 2 / 2 Playwright walkthrough scenarios.

Durable Slice 1 rules carried forward (all apply to Slice 3):

- `native` is a non-OAuth pseudo-provider. No manifest. No scopes. No integrations row.
- Native handlers register by `(provider, type)` key in `services/execution/handlers/_registry.ts`.
- No log lines from native handler code.
- `.strict()` schemas reject unknown / V1-cosmetic fields at parse time.
- Throw on failure; engine converts to step failure (no `{success, error, message}` envelopes).
- No new runtime dependencies without explicit user approval.
- Bounded outputs everywhere.

---

## 2. Accepted Native Slice 2 summary

Native Slice 2 shipped (Tier B triggers):

- `native:manual_trigger` — fires from `POST /api/workflows/[id]/run-now` (owner-only, 256 KiB body cap, async 202).
- `native:scheduled_trigger` — 5-field UTC cron via `cron-parser@^5.5.0` (single-file facade); dispatch-then-advance crash safety; single-fire catch-up (no backfill).
- `POST /api/cron/run-scheduled-triggers` — concurrency 5, per-row 25 s timeout.
- Parallel `NativeActivationFn` registry inside [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts) (zero per-provider edits).

277 native-focused tests (combined Slice 1 + 2); 7389 / 7389 full jest; 6 Playwright scenarios across Slice 1 + Slice 2.

Durable Slice 2 rules carried forward (apply to Slice 3 indirectly — they govern trigger-side ergonomics, not control-flow):

- Active / paused / draft state gate for manual run-now is the standard.
- RLS surfaces 404 for unauthorized access.
- 5-field UTC cron is the standard schedule format.

---

## 3. Accepted Engine Branching summary

Engine-branching slice shipped (the platform substrate Slice 3 consumes):

- `WorkflowEdge.label?: z.string().min(1).max(64).optional()` — added to [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts).
- `ActionHandlerResult.branchTaken?: string | null` — added to [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts).
- `RunFailureCode INVALID_BRANCH` — added to [`services/execution/engine.ts`](../../../services/execution/engine.ts), humanizer row at [`core/errors/humanizeActionError.ts`](../../../core/errors/humanizeActionError.ts).
- Label-aware traversal — engine maintains `reachable: Set<string>`; per-edge selection via pure [`selectActivatedEdges`](../../../services/execution/branching.ts) helper.
- Skipped nodes emit `RunStepResult { status: "skipped" }`; no handler call, no resolver call, no `variables[id]`.
- Duplicate-edge dedup keyed on `(from, to, label ?? "")` (allows router fan-out via same-source / different-target / same-label).

49 new engine-branching tests; 7439 / 7439 full jest after the slice; zero provider/native handler edits.

Activation rule (from engine-branching plan §4.1 — pinned for Slice 3 reference):

| Edge label | Handler's `branchTaken` | Edge activated? |
|---|---|---|
| `undefined` (unlabeled) | any value | **YES** — always-follow |
| `string "X"` | `undefined` | **NO** (§6.2.a permissive default) |
| `string "X"` | `"X"` | **YES** |
| `string "X"` | `"Y"` matching a different outgoing label | **NO** |
| `string "X"` | `"Y"` matching NO outgoing label | **NO + run fails with INVALID_BRANCH** |
| `string "X"` | `null` | **NO** |

**Consequence Slice 3 must respect:** any time a handler returns a string `branchTaken`, at least one outgoing edge with a matching label MUST exist or the run fails with INVALID_BRANCH. This shapes the if_then_condition `onFalse` decision (§5.5) + the router `defaultRoute` decision (§6.4).

---

## 4. Native Slice 3 scope

This slice ships exactly:

| # | Surface | Kind |
|---|---|---|
| 1 | `native:if_then_condition` | action (boolean branch) |
| 2 | `native:router` | action (N-label branch) |

Both consume the engine-branching contract surface; both register through the existing handler registry pattern from Slices 1 + 2. **No engine changes. No new contracts. No new HTTP routes. No new migrations. No new runtime dependencies. Zero per-provider handler files touched.**

File layout (mirrors Slices 1 + 2):

```
integrations/native/actions/ifThenCondition.ts              # handler
integrations/native/actions/ifThenCondition.schema.ts       # resolved-config schema
integrations/native/actions/router.ts                       # handler
integrations/native/actions/router.schema.ts                # resolved-config schema
integrations/native/actions/_conditionEvaluator.ts          # shared operator engine (pure)
tests/unit/integrations/native/actions/ifThenCondition.test.ts
tests/unit/integrations/native/actions/router.test.ts
tests/unit/integrations/native/actions/_conditionEvaluator.test.ts
tests/e2e/native-nodes-slice-3-control-flow-walkthrough.spec.ts
```

The shared condition-evaluator module (`_conditionEvaluator.ts`) holds the pure operator semantics used by BOTH actions — extracted so the operator set + comparison rules are unit-testable in isolation and the two handlers stay focused on their schema + branchTaken emission logic. Mirrors the engine-branching `services/execution/branching.ts` extraction pattern.

---

## 5. `if_then_condition` plan

### 5.1 Schema (proposed)

```typescript
// integrations/native/actions/ifThenCondition.schema.ts
export const IF_THEN_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_equal",
  "less_equal",
  "is_empty",
  "is_not_empty",
  "is_truthy",
  "is_falsy",
] as const;

export const IfThenConditionOnFalseSchema = z.enum(["branch", "skip"]);

export const IfThenConditionConfigSchema = z.object({
  input: z.unknown(),
  operator: z.enum(IF_THEN_OPERATORS),
  // `value` is required for binary operators (equals, not_equals, contains,
  // etc.), forbidden for unary operators (is_empty, is_not_empty, is_truthy,
  // is_falsy). Enforced via .superRefine.
  value: z.unknown().optional(),
  onFalse: IfThenConditionOnFalseSchema.default("branch"),
}).strict().superRefine((cfg, ctx) => {
  const isUnary = cfg.operator === "is_empty" || cfg.operator === "is_not_empty"
    || cfg.operator === "is_truthy" || cfg.operator === "is_falsy";
  if (isUnary && cfg.value !== undefined) {
    ctx.addIssue({ code: "custom", path: ["value"], message: `Operator '${cfg.operator}' does not take a value.` });
  }
  if (!isUnary && cfg.value === undefined) {
    ctx.addIssue({ code: "custom", path: ["value"], message: `Operator '${cfg.operator}' requires a value.` });
  }
});
```

### 5.2 Supported operators (D-IT1 — locked: V1 minimal set with strict semantics)

14 operators total. Mirrors V1's accepted operator surface — proven by years of V1 workflow authoring — minus V1's `is_true` / `is_false` (replaced with `is_truthy` / `is_falsy` for explicit semantics). No JavaScript expression mode. No multi-condition AND/OR within a single node (D-IT4 below).

| Operator | Cardinality | Compares | Notes |
|---|---|---|---|
| `equals` | binary | both | **Strict `===`** (D-IT2 below). |
| `not_equals` | binary | both | Strict `!==`. |
| `contains` | binary | string→string, array→element | Case-insensitive (D-IT3). |
| `not_contains` | binary | same | Case-insensitive. |
| `starts_with` | binary | string→string | Case-insensitive. |
| `ends_with` | binary | string→string | Case-insensitive. |
| `greater_than` | binary | numeric | Both sides coerced via `Number()`; `NaN` → false. |
| `less_than` | binary | numeric | Same. |
| `greater_equal` | binary | numeric | Same. |
| `less_equal` | binary | numeric | Same. |
| `is_empty` | unary | any | True for `null` / `undefined` / `""` / `[]` / `{}` / numeric 0 — **false** (zero is a real value). |
| `is_not_empty` | unary | any | Inverse of `is_empty`. |
| `is_truthy` | unary | any | True when `Boolean(input)` is true. |
| `is_falsy` | unary | any | Inverse of `is_truthy`. |

### 5.3 Input/value comparison model (D-IT2 + D-IT3 — locked)

- **D-IT2 (equality semantics) — locked at strict `===`.** V1 used loose `==` which produces surprises (`"5" == 5 → true`). V2 uses strict `===`. Authors who need cross-type comparison use the upstream `format_transformer` action to coerce explicitly. This matches the rest of V2's "no implicit type coercion at boundaries" philosophy.
- **D-IT3 (case sensitivity for string operators) — locked at case-insensitive default for V1 parity.** `contains` / `starts_with` / `ends_with` / `not_contains` lowercase both sides before comparison. Adding a `caseSensitive: boolean` field is deferred to a follow-up slice if a real user request lands.
- **D-IT4 (multi-condition AND/OR in a single node) — locked at DEFERRED.** Slice 3 ships single-condition only. Authors who need AND chain two `if_then_condition` nodes (`A` → `B` only on true). Authors who need OR-like fan-out use `router` with two routes whose conditions are the OR-arms. The schema stays small + the handler stays a one-liner against the shared evaluator.
- **D-IT5 (V1 `continueOnFalse` field) — locked at DROPPED.** The engine-branching model subsumes this: an author who wants "continue regardless" wires an unlabeled outgoing edge (always activates per §3 row 1) or sets `onFalse: "skip"` and wires post-branch cleanup as unlabeled. V1's binary flag becomes more expressive in V2.
- **Input resolution.** The engine pre-resolves the `input` field via the strict resolver before dispatching the handler. The handler receives the concrete value (string / number / boolean / array / object). The handler does NOT re-resolve.

### 5.4 `branchTaken` output (D-IT6 — locked: `"true"` | `"false"` | `null`)

| Condition evaluation | `onFalse` config | `branchTaken` returned |
|---|---|---|
| Evaluates true | (any) | `"true"` |
| Evaluates false | `"branch"` (default) | `"false"` |
| Evaluates false | `"skip"` | `null` |

Symmetric with router (§6.5). Authors wire outgoing edges with `label: "true"` and `label: "false"` (and/or unlabeled cleanup). The most common pattern is: `"true"` → action chain that runs on match; `"false"` → cleanup or "do nothing else"; unlabeled → analytics / always-run.

### 5.5 `onFalse: "branch" | "skip"` — why both modes (D-IT6 cont.)

Two distinct workflow-author intents:

- **`"branch"` (default) — both branches wired.** Author wants distinct downstream chains on true vs false. Engine requires a `"false"` labeled edge (else INVALID_BRANCH fires when condition is false, per engine-branching §6.1). This is the "router with two labels" pattern.
- **`"skip"` — single branch, false short-circuits.** Author wants "do this thing only if condition is true; if false, do nothing else downstream." Returning `null` skips all labeled edges (engine-branching §4.1 row 7); unlabeled outgoing edges still activate (cleanup pattern). This is V1's `continueOnFalse: false` rebuilt on the branching primitive — no `"false"` edge required.

**Rule for workflow authors documented in handler comments:** if you wire only a `"true"` outgoing edge, set `onFalse: "skip"` to avoid INVALID_BRANCH on the false path.

### 5.6 Output shape

```typescript
{
  output: {
    conditionMet: boolean,         // true if evaluated to true, false otherwise
    operator: string,              // echo the operator used (debug aid)
    onFalse: "branch" | "skip",    // echo the resolved onFalse (debug aid)
  },
  branchTaken: "true" | "false" | null,  // per §5.4 table
}
```

Downstream nodes can reference `{{<nodeId>.conditionMet}}` to know which branch ran (e.g. for analytics that wants to log the decision). The output is intentionally bounded — no input/value echo (potentially large).

### 5.7 Error behavior (D-IT7 — locked: defensive false, no throws on operator type mismatch)

- **Schema-parse failure** (e.g. `value` provided for `is_empty`) → handler throws on `IfThenConditionConfigSchema.parse()` → engine emits `HANDLER_FAILED` step with the Zod issue message. This is the standard native-handler failure pattern (Slice 1 §3.x).
- **Operator type mismatch at runtime** (e.g. `contains` with a non-string non-array `input`, or `greater_than` with a `NaN` result after `Number()`) → handler returns `conditionMet: false`. **No throw.** Defensive default — workflow authors don't want a hard failure when an upstream field is missing or shaped unexpectedly; the false branch handles the "not what we wanted" path.
- **Truly missing upstream variable in `input`** → caught earlier by the engine's strict resolver as `MISSING_VARIABLE` before the handler runs. Not a handler concern.
- **No-match downstream wiring** (handler returns `"false"` but no `"false"` edge) → caught by the engine's `INVALID_BRANCH` machinery. Handler does not pre-check edge wiring (no engine-context API).

---

## 6. `router` plan

### 6.1 Schema (proposed)

```typescript
// integrations/native/actions/router.schema.ts
import { IF_THEN_OPERATORS } from "./ifThenCondition.schema";

export const ROUTE_LABEL_MAX = 64; // matches WorkflowEdge.label cap.

const RouteConditionSchema = z.object({
  input: z.unknown(),
  operator: z.enum(IF_THEN_OPERATORS),
  value: z.unknown().optional(),
}).strict();

const RouteSchema = z.object({
  label: z.string().min(1).max(ROUTE_LABEL_MAX),
  condition: RouteConditionSchema,
}).strict();

export const RouterConfigSchema = z.object({
  routes: z.array(RouteSchema).min(1).max(32),
  defaultRoute: z.string().min(1).max(ROUTE_LABEL_MAX).optional(),
}).strict().superRefine((cfg, ctx) => {
  // Reject duplicate labels within the routes list.
  const seen = new Set<string>();
  for (let i = 0; i < cfg.routes.length; i++) {
    const label = cfg.routes[i]!.label;
    if (seen.has(label)) {
      ctx.addIssue({ code: "custom", path: ["routes", i, "label"], message: `Duplicate route label '${label}'.` });
    }
    seen.add(label);
  }
});
```

### 6.2 Route-matching model (D-RT1 — locked: full operator set, single condition per route, first-match-wins)

Each route has exactly one `condition` (same 14 operators as if_then_condition, evaluated by the shared `_conditionEvaluator.ts`). Routes are evaluated in declaration order; the **first matching route wins**. V1 parity.

| Decision | Locked outcome |
|---|---|
| Operators per route | All 14 from §5.2 — consistent UX with `if_then_condition`. |
| Conditions per route | **One** in Slice 3. AND/OR composition deferred (matches §5 D-IT4). |
| Match order | First-match-wins — deterministic, mirrors V1. |
| Max routes | 32 (defensive cap; chosen to be unhittable in real-world UX but rejects pathological config). |

### 6.3 Operator set (locked at the same 14 from §5.2)

Reuses `IF_THEN_OPERATORS` exported from `ifThenCondition.schema.ts`. **No regex.** D-RT4 below locks regex out of Slice 3 — ReDoS risk requires a bounded executor (RE2 / safe-regex / etc.) which is a dedicated hardening slice. Workflow authors who want partial-match routing use the `contains` / `starts_with` / `ends_with` operators.

### 6.4 Default / no-match behavior (D-RT3 — locked: optional `defaultRoute`; `null` when absent)

| Configured | No route matches | `branchTaken` returned |
|---|---|---|
| `defaultRoute: "fallback"` | (any) | `"fallback"` — engine requires a `"fallback"` labeled edge or INVALID_BRANCH fires |
| `defaultRoute` not set | yes | `null` — no labeled edge activates; unlabeled edges still follow |

This avoids V1's magic `"Else"` string. The default label is author-controlled, validated against actual edge labels by the engine's existing INVALID_BRANCH machinery. Predictable, deterministic, no engine surgery.

### 6.5 `branchTaken` output (D-RT5 — locked: matching route's `label`, else `defaultRoute`, else `null`)

```typescript
{
  output: {
    matched: boolean,              // true if a route matched
    routeLabel: string | null,     // the matched label, or defaultRoute, or null
    evaluatedCount: number,        // how many routes were checked before halting (debug)
  },
  branchTaken: string | null,      // per §6.4 table
}
```

Downstream `{{<nodeId>.routeLabel}}` is a useful audit/log field. `evaluatedCount` helps debug "why did the wrong route win" scenarios (first-match-wins means earlier routes shadow later ones if both conditions match).

### 6.6 Route-label conflict with edge dedup

Per engine-branching §3.5, two outgoing edges from the same router node to the same target with different labels are allowed; same `(from, to, label)` is rejected. Router config rejects duplicate labels (§6.1 schema). The two checks together mean: router with routes `[{label: "A"}, {label: "B"}]` may wire `routerNode → downstream A label="A"` + `routerNode → downstream A label="B"` (one node, two activation paths) — engine activates one of them depending on which route matched.

### 6.7 Error behavior (mirrors §5.7)

- **Schema-parse failure** (`routes: []`, duplicate labels, unknown operator) → handler throws via `RouterConfigSchema.parse()` → `HANDLER_FAILED` step. Standard pattern.
- **Operator type mismatch at runtime within a route's condition** → that route does not match (treated as false). Evaluation continues to the next route.
- **No matching route + no `defaultRoute`** → handler returns `branchTaken: null`. Not an error.
- **`defaultRoute` references a label not present on any outgoing edge** → engine `INVALID_BRANCH` machinery fires per §3 activation rule. Handler does not pre-check (no engine-context API).

### 6.8 Decisions explicitly out of scope for the router

- **Regex matching** (D-RT4) — ReDoS surface; deferred.
- **`eval` / JavaScript expression mode** (V1 had this on `if_then`) — security + sandboxing burden; deferred.
- **All-matches mode / multi-branch activation** — `ActionHandlerResult.branchTaken` is single-string-or-null. Multi-branch activation requires `branchTaken: string[]` which would widen the engine contract; out of scope for Slice 3.
- **Weight / priority on routes** — first-match-wins is sufficient; priorities are deferred.
- **Pluggable matchers** — extension point not needed at Slice 3 scale.

---

## 7. Edge-label convention

Documented in the handler comments + outcomes doc + CLAUDE.md so workflow authors and the AI planner can rely on it.

### 7.1 `if_then_condition` (D-IT-EDGE — locked)

| Expected label | Activates when | Required? |
|---|---|---|
| `"true"` | Condition evaluates true | Recommended — the canonical "run on match" branch |
| `"false"` | Condition evaluates false AND `onFalse: "branch"` | Required IF `onFalse: "branch"` (default) AND a false-branch downstream is intended; OPTIONAL if author sets `onFalse: "skip"` |
| (unlabeled) | Always — regardless of condition | Optional — use for analytics / cleanup / always-run downstream |

**Author-facing rule** (documented in handler header comment): *"If you wire only the `"true"` edge, set `onFalse: "skip"` to avoid INVALID_BRANCH on the false path."*

### 7.2 `router` (D-RT-EDGE — locked)

| Expected label | Activates when | Required? |
|---|---|---|
| Any label `"L"` matching a `routes[].label` | Matching route is the first to fire | Required for every route the author intends to consume |
| `defaultRoute` label | No route matches AND `defaultRoute` configured | Required IF `defaultRoute` is set |
| (unlabeled) | Always — regardless of route decision | Optional — use for analytics / cleanup |

**Author-facing rule** (documented in handler header comment): *"Every `routes[].label` you reference must have at least one outgoing edge with that exact label, or the run fails with INVALID_BRANCH when that route is selected. If you set `defaultRoute`, wire an edge with that label too."*

---

## 8. Data-passing tests

Slice 3's data-passing coverage builds on the engine-branching tests (`tests/unit/services/execution/engine.test.ts` "label-aware branching" block — already proves skipped nodes don't populate variables, downstream nodes inherit upstream output via the resolver, OR-merge works, INVALID_BRANCH fires on missing labels). Slice 3's data-passing tests are HANDLER-LEVEL, asserting the if_then / router output shape feeds downstream resolution correctly.

| # | Test | Where |
|---|---|---|
| 1 | `if_then_condition` reads `input` from `{{trigger.payload.status}}` (resolved by engine pre-dispatch), evaluates `equals "active"`, returns `branchTaken: "true"` and `output.conditionMet: true` | `__tests__/native/ifThenCondition.test.ts` |
| 2 | Same shape but `status: "inactive"` → `branchTaken: "false"`, `output.conditionMet: false` | same |
| 3 | `router` reads `input` from `{{a1.tier}}`, evaluates 3 routes (`vip` / `premium` / `standard`), picks first match | `__tests__/native/router.test.ts` |
| 4 | Engine-level e2e in `engine.test.ts` (already shipped): skipped branch nodes do not populate variables — referencing a skipped node's output fails with MISSING_VARIABLE. This guarantees the if_then_condition false-branch downstream cannot accidentally read the true-branch's variables and vice versa | engine-branching slice already covers this |
| 5 | Downstream node after a matched if_then_condition can reference the if_then's own output (`{{ifThenNodeId.conditionMet}}`) | engine.test.ts label-aware block has a similar pattern; Slice 3 adds an integration test that chains `manualTrigger → if_then → http_request` with `http_request.config.url = "https://example.com?match={{ifThen.conditionMet}}"` |
| 6 | Router's selected-route downstream receives router output (`{{routerId.routeLabel}}`) | analogous to #5 |

The handler-level tests in `__tests__/native/` use mock `ActionHandlerInput` shapes — they don't depend on the engine. Coverage of "the engine threads variables through a branching chain" already lives in the engine-branching slice; Slice 3 doesn't re-derive that.

---

## 9. Unit test plan

### 9.1 `_conditionEvaluator.test.ts` (shared evaluator)

Pure-function tests; no engine, no mocks. Mirrors `tests/unit/services/execution/branching.test.ts` shape.

| Suite | Tests | Coverage |
|---|---:|---|
| `equals` / `not_equals` (strict semantics) | 4 | `"5" === 5` → false, `5 === 5` → true, object identity, null/undefined |
| `contains` / `not_contains` (string + array) | 6 | case-insensitive string substring, array element exact match (per V1), wrong types → false |
| `starts_with` / `ends_with` | 4 | case-insensitive, wrong types → false |
| `greater_than` / `less_than` / `greater_equal` / `less_equal` | 8 | `Number()` coercion, `NaN` → false on either side, integer + decimal |
| `is_empty` / `is_not_empty` | 6 | null / undefined / "" / [] / {} / 0 (zero is NOT empty) / "hello" |
| `is_truthy` / `is_falsy` | 4 | true / 1 / "x" / [] (truthy in JS!) / null / 0 / "" |
| Unknown operator | 1 | throws `UnknownOperatorError` (defensive; schema would have caught it earlier) |

**~33 pure tests** for the evaluator.

### 9.2 `ifThenCondition.test.ts`

| Suite | Tests | Coverage |
|---|---:|---|
| Schema parse | 6 | required `input` + `operator`; `value` required for binary, forbidden for unary; unknown field rejected (`.strict()`); `onFalse` defaults to `"branch"` |
| Handler — true branch | 3 | `equals` true → `branchTaken: "true"`, `conditionMet: true`; output shape; operator echoed |
| Handler — false branch with `onFalse: "branch"` (default) | 2 | `equals` false → `branchTaken: "false"`, `conditionMet: false` |
| Handler — false branch with `onFalse: "skip"` | 2 | `equals` false → `branchTaken: null`, `conditionMet: false` |
| Handler — unary operators | 4 | `is_empty(null)` → true, `is_empty("")` → true, `is_empty(0)` → false, `is_truthy([])` → true (JS semantics) |
| Handler — operator type mismatch returns false (defensive) | 3 | `greater_than("abc", 5)` → false, `contains(null, "x")` → false, `starts_with({}, "y")` → false |
| Handler — config sanity (defense-in-depth) | 1 | handler re-parses schema, rejects malformed input |

**~21 handler tests.**

### 9.3 `router.test.ts`

| Suite | Tests | Coverage |
|---|---:|---|
| Schema parse | 7 | `routes: []` rejected; duplicate labels rejected; >32 routes rejected; `defaultRoute` optional; route label too long rejected; unknown field rejected; valid 3-route config parses |
| Handler — first-match-wins | 3 | route 1 matches → `branchTaken: "route1"`; route 2 matches when route 1 doesn't → `"route2"`; later routes shadowed by earlier match |
| Handler — no match + `defaultRoute` configured | 2 | `branchTaken: defaultRoute`, `output.matched: false`, `routeLabel: defaultRoute` |
| Handler — no match + no `defaultRoute` | 2 | `branchTaken: null`, `output.matched: false`, `routeLabel: null` |
| Handler — `evaluatedCount` reflects stop point | 2 | matches on route 1 → `evaluatedCount: 1`; matches on route 3 → `evaluatedCount: 3` |
| Handler — operator type mismatch within a route → route does not match | 2 | `greater_than("abc", 5)` route skipped; next route gets a chance |
| Handler — output shape | 1 | full shape assertion |

**~19 handler tests.**

### 9.4 Test totals

- Shared evaluator: ~33 tests.
- `if_then_condition` handler: ~21 tests.
- `router` handler: ~19 tests.
- **~73 new unit tests across 3 new test files.**

Full project total after Slice 3 implementation commits: 7439 + 73 = ~7512 jest tests passing.

---

## 10. E2E plan

### 10.1 Single Playwright spec covering both actions end-to-end

[`tests/e2e/native-nodes-slice-3-control-flow-walkthrough.spec.ts`](../../../tests/e2e/native-nodes-slice-3-control-flow-walkthrough.spec.ts) (NEW) — 3 scenarios, one Playwright file. Uses the manual-trigger `POST /api/workflows/[id]/run-now` entry point from Slice 2 so no UI driving is needed.

### 10.2 Scenario A — `if_then_condition` true branch with `format_transformer` downstream

Workflow: `manual_trigger → if_then_condition → format_transformer`. Edge from if_then to format_transformer has `label: "true"`. Body payload sets `inputs.status = "active"`; condition is `input: "{{trigger.payload.status}}", operator: "equals", value: "active"`. Asserts:

- POST /run-now returns 202 with `runId`.
- Poll until `workflow_runs.status === "succeeded"`.
- `workflow_runs.steps[]` contains: `trigger=succeeded`, `if_then=succeeded`, `format_transformer=succeeded`.
- `format_transformer.config` was resolved with `{{if_then.conditionMet}}` → `"true"` baked in.

### 10.3 Scenario B — `if_then_condition` false branch with `onFalse: "skip"` + unlabeled cleanup

Same workflow shape but `if_then` config has `onFalse: "skip"`, and a SECOND outgoing edge from `if_then` to a `format_transformer` cleanup node is UNLABELED. Body payload sets `inputs.status = "inactive"`. Asserts:

- POST /run-now returns 202.
- Run succeeds.
- `workflow_runs.steps[]` contains: `trigger=succeeded`, `if_then=succeeded`, `format_transformer (cleanup)=succeeded`, `format_transformer (true branch)=skipped`.
- No INVALID_BRANCH despite no `"false"` labeled edge (because `onFalse: "skip"` returns null).

### 10.4 Scenario C — `router` first-match-wins with `defaultRoute`

Workflow: `manual_trigger → router → 3 http_request branches`. Router has routes `[{label: "vip", ...}, {label: "premium", ...}, {label: "standard", ...}]` + `defaultRoute: "other"`. Outgoing edges from router: `vip` / `premium` / `standard` / `other`. Body payload sets `inputs.tier = "premium"`. Asserts:

- Run succeeds.
- Steps: trigger=succeeded, router=succeeded, premium=succeeded, vip=skipped, standard=skipped, other=skipped.
- `output.routeLabel === "premium"`, `evaluatedCount === 2`.

### 10.5 No additional Playwright work beyond this one spec

3 scenarios in one file matches Slice 1 + Slice 2 cadence (`native-nodes-slice-1-walkthrough.spec.ts` had 2 scenarios; `native-nodes-slice-2-triggers-walkthrough.spec.ts` had 4). The shared echo-server harness pattern (inline within the spec for parallel-chat coordination, per Slice 2 §7.2) carries forward; no extraction to `tests/e2e/helpers/`.

---

## 11. Commit sequence

Five commits, mirroring Slices 1 + 2 cadence. Each commit lands green (all gates pass) before the next.

| # | Commit | Scope | Files staged |
|---|---|---|---|
| 0 | `docs(native-nodes): plan tier c control flow` | THIS commit (plan doc) | `docs/slices/parity/native-nodes-3-tier-c-control-flow-plan.md` |
| 1 | `feat(native): add shared condition evaluator` | Pure `_conditionEvaluator.ts` + 33 evaluator tests. No handler / registry / e2e changes — keeps the evaluator surface auditable in isolation. | `integrations/native/actions/_conditionEvaluator.ts` (NEW), `tests/unit/integrations/native/actions/_conditionEvaluator.test.ts` (NEW) |
| 2 | `feat(native): add if_then_condition action` | Schema + handler + 21 handler tests + registry entry. | `integrations/native/actions/ifThenCondition.ts` (NEW), `integrations/native/actions/ifThenCondition.schema.ts` (NEW), `tests/unit/integrations/native/actions/ifThenCondition.test.ts` (NEW), `services/execution/handlers/_registry.ts` (+1 entry, careful — parallel-chat hot file) |
| 3 | `feat(native): add router action` | Schema + handler + 19 handler tests + registry entry. | `integrations/native/actions/router.ts` (NEW), `integrations/native/actions/router.schema.ts` (NEW), `tests/unit/integrations/native/actions/router.test.ts` (NEW), `services/execution/handlers/_registry.ts` (+1 entry) |
| 4 | `test(e2e): add native nodes slice 3 walkthrough` | 3 Playwright scenarios (true branch / false branch with skip / router first-match-wins). | `tests/e2e/native-nodes-slice-3-control-flow-walkthrough.spec.ts` (NEW) |
| 5 | `docs(native-nodes): document tier c outcomes` | Retrospective. | `docs/slices/parity/native-nodes-3-tier-c-control-flow-outcomes.md` (NEW) |

### 11.1 Pre-commit discipline (carried from Slices 1 + 2 + engine-branching)

Before each commit, run `git diff --cached <each-staged-file>` and skim for unintended hunks. Files at risk of parallel edits this slice:

- `services/execution/handlers/_registry.ts` — **high-risk** (Slices 1 + 2 + every Outlook commit touch this). Two registry edits to land this slice (one per action). Inspect cached diff before each commit.
- All other staged files are NEW (greenfield native actions + tests + e2e + outcomes); low risk.

Explicit-path staging only. No `git add .`. No push. No PR.

### 11.2 Why split shared evaluator + each action into separate commits

- Commit 1's evaluator is consumed by Commits 2 + 3 — landing it first lets the action handlers be one-line `evaluate(condition, input, value)` calls in their handler bodies.
- Splitting if_then (Commit 2) from router (Commit 3) keeps each diff small, reviewable, and revertable independently. If router needs a follow-up correction, if_then doesn't ship a redo.
- E2E (Commit 4) lands last because it exercises both actions; needs both registered.

---

## 12. Explicit out-of-scope list

The following are **NOT** in Slice 3 and must not appear in any of its commits:

| Item | Why out of scope |
|---|---|
| `loop` action + per-iteration scope + `loop_executions` parallel state + serial / parallel modes | NPD-N5 — Phase 6 engine hardening. |
| `wait_for_event` — durable queue + suspended-run state + event-matching dispatcher | NPD-N5 / NPD-N6 — Phase 6. |
| Unbounded / durable `delay` | NPD-N6 — Phase 6. (`native:delay` ≤30 s in-process shipped per Slice 1.) |
| Pause / resume of in-flight runs | Phase 6 platform tier. |
| Durable queue (BullMQ / Inngest / etc.) | Phase 6. |
| AI cluster `ai_agent` + 7 AI sub-actions + `tavily_search` | NPD-N7 — Phase 5. |
| `hitl_conversation` — full HITL stack including Discord/Slack/email + memory service | NPD-N8 — Phase 8 HITL UX. |
| `parse_file` / `extract_website_data` | NPD-N9 — pending product signal. |
| Generic webhook trigger | NPD-N3 — pending product signal. |
| 6 V1 orphan handlers (executePath duplicate, executeFilter duplicate, fileUpload, googleSearch, transformer, emailClassifier) | NPD-N10 — PERMANENT SKIP. |
| Multiple AND/OR conditions in a single `if_then_condition` node | D-IT4 — deferred. Compose via chained nodes / router OR-arms. |
| `caseSensitive` field on string operators | D-IT3 — deferred. Case-insensitive default is V1 parity. |
| `continueOnFalse` field on `if_then_condition` | D-IT5 — V1 behavior subsumed by `onFalse: "skip"` + unlabeled outgoing edges. |
| JavaScript expression operator (V1's `conditionType: "advanced"`) | Out — requires sandboxing / eval surface; not the right Slice 3 scope. |
| Regex operator on router or if_then | D-RT4 — ReDoS surface; deferred to a hardening slice if needed. |
| Multi-branch fan-out (router activating > 1 route) | Requires `branchTaken: string[]` widening — out of scope; engine contract is `string \| null`. |
| Route weight / priority beyond declaration order | First-match-wins is sufficient. |
| Builder UI for editing labeled edges / router routes / if_then operators | UI concern; ships in its own slice. |
| Any additional engine changes | Only allowed if a Slice 3 test exposes a real engine bug. Default: do not touch the engine. |
| New runtime dependencies | None. Slice 3 is handler files + tests + e2e + outcomes only. |

---

## 13. Exit checklist (for the slice as a whole, not this commit)

The Tier C control-flow slice is complete when:

- [ ] §5 + §6 decisions (D-IT1..D-IT7, D-RT1..D-RT5, D-IT-EDGE, D-RT-EDGE) all locked or amended by the user before Commit 1.
- [ ] Commit 1 (shared evaluator) lands green: tsc / lint / lint:structure / lint:migrations / npm test.
- [ ] Commit 2 (if_then_condition) lands green; registry edit cleanly captured.
- [ ] Commit 3 (router) lands green; registry edit cleanly captured.
- [ ] Commit 4 (e2e walkthrough) — 3 Playwright scenarios pass against the local dev server.
- [ ] Commit 5 (outcomes) lands.
- [ ] Full jest: ~7512 passing (delta +73 from this slice).
- [ ] No engine changes. No contract widening. No migrations. No new runtime deps. No new HTTP routes.
- [ ] Outlook Mail files untouched.
- [ ] Edge-label convention (§7) documented in CLAUDE.md if Marcus wants the AI planner to consume it.
- [ ] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [ ] No push. No PR.

**This commit (Commit 0) is doc-only.** Implementation begins at Commit 1.

---

## 14. Open decisions to lock before Commit 1

Twelve decisions surfaced. My recommendations are the first-listed in each. All twelve are pre-resolved against my reading of V1 + engine-branching constraints + Slice 1/2 patterns. The user may override any of them; the implementation commit chain pauses until all are locked.

| ID | Decision | Recommendation |
|---|---|---|
| D-IT1 | `if_then_condition` operator set | **Full V1 minimal set (14 operators) per §5.2.** Maintains V1 muscle memory; no JS-expression mode. |
| D-IT2 | Equality semantics | **Strict `===` per §5.3.** Predictable; explicit coercion via `format_transformer` upstream. |
| D-IT3 | Case sensitivity for string operators | **Case-insensitive default per §5.3.** V1 parity; `caseSensitive` field deferred. |
| D-IT4 | Multi-condition AND/OR in a single node | **Deferred per §5.3.** Compose via chained nodes / router OR-arms. |
| D-IT5 | V1's `continueOnFalse` field | **Dropped per §5.3.** Subsumed by `onFalse: "skip"` + unlabeled outgoing edges. |
| D-IT6 | `branchTaken` values + `onFalse` modes | **`"true" \| "false" \| null` per §5.4 + §5.5.** `onFalse: "branch"` default; `"skip"` returns null. |
| D-IT7 | Error vs false on operator/type mismatch | **Defensive false; no throws at runtime** per §5.7. Schema-parse errors still throw. |
| D-RT1 | Router operator + condition cardinality | **All 14 operators; one condition per route; first-match-wins** per §6.2. V1 parity. |
| D-RT3 | Default / no-match behavior | **Optional `defaultRoute`; `null` when absent** per §6.4. Author-controlled; no magic `"Else"`. |
| D-RT4 | Regex support | **Dropped per §6.3 + §6.8.** ReDoS surface; deferred. |
| D-RT5 | `branchTaken` output | **Matching route's `label`, else `defaultRoute`, else `null`** per §6.5. |
| D-RT-EDGE | Edge-label convention | **Every `routes[].label` + `defaultRoute` must have a wired edge** per §7.2. Engine INVALID_BRANCH is the safety net. |

Open decisions surfaced in the user's task brief that this plan answers:

- **Router matching semantics:** locked to full operator set (D-RT1), first-match-wins, no regex, no eval.
- **Default / no-match behavior:** locked to optional configured `defaultRoute` (D-RT3); `null` (deterministic skip) when absent.
- **Regex support:** locked OUT (D-RT4).
- **Operator set:** locked to 14 V1-parity operators with strict equality + case-insensitive string compares (D-IT1 + D-IT2 + D-IT3).

**No "kitchen-sink router" — the slice ships a deterministic minimal-but-V1-compatible surface.** A second-pass slice can add `caseSensitive`, AND/OR composition, weight/priority, regex (behind a bounded executor), and JS expression mode if and when the AI planner or workflow-author feedback demands them.
