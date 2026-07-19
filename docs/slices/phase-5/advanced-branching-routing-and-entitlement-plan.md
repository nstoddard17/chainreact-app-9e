# Advanced Branching — Routing Hardening + Plan Entitlement (BRANCH-ENT-1)

> Status: PLAN → IN PROGRESS (2026-07-19). Local-only batch; no push, no deploy, no
> `db:push`, no migration expected. Owner report lands with the closeout.

## 0. Scope

Two goals, one batch:

1. **Routing correctness** — branch routes created through the current builder must
   execute correctly (they cannot even be authored today), and the engine's
   reconvergence semantics must not depend on edge array order.
2. **Entitlement enforcement** — advanced branching (If/Then Condition, Router) is a
   Pro+ feature. Free accounts cannot obtain or execute it through any path: builder,
   direct API save, AI, templates, checkpoint restore, activation, test runs, manual
   runs, or background execution. Downgraded accounts keep their workflows recoverable.

Not in scope: redesigning control flow, new node types (no separate Free "filter"
node this batch), Router semantic changes, retry/rerun/duplicate/import surfaces
(none exist today — verified).

## 1. Current-state audit summary (verified against code 2026-07-19)

### Node mapping

| User-facing label | Runtime type | Branching? |
|---|---|---|
| "If/Then Condition" (`ifThenCondition.meta.ts:43`) | `native:if_then_condition` | Yes — returns `branchTaken: "true" \| "false" \| null` |
| "Router" (`router.meta.ts:37`) | `native:router` | Yes — first-match-wins over `routes[].label`, optional `defaultRoute`, else `null` |

There is **no** Else-If node (Else-If = Router routes / chained Ifs), **no** separate
Free-safe linear filter node, and no other handler in the repo returns `branchTaken`.
The closed set already exists as `BRANCHING_TYPES` in
`services/workflows/patch/checks.ts:213` (patch layer only).

### Engine contract (verified correct)

- `services/execution/branching.ts` — labeled edge activates iff
  `branchTaken === edge.label`; unlabeled edges always activate (cleanup);
  `null`/`undefined` activate only unlabeled; string label with no match →
  `INVALID_BRANCH` (checked before the step is recorded succeeded, run halts).
- Strict pre-resolution (`engine.ts:489-528`) runs **before** the handler — a missing
  variable fails `MISSING_VARIABLE` and can never silently evaluate false.
- Skipped nodes: `status: "skipped"`, no handler call, no `variables` entry.
- OR-merge: reconverging node runs when any incoming edge activated, at most once
  (BFS visited set).

### Defects found

- **D1 (engine, real):** the BFS order is computed label-blind and iterated once; a
  merge node whose BFS depth is ≤ its activating parent's is finalized `skipped`
  before the parent executes, and the later activation is lost. Whether a
  reconverging node runs can therefore depend on **edge array order**. Concrete:
  `[router→M ("b"), router→A ("a"), A→M (unlabeled)]`, router picks "a" → M is
  wrongly skipped; reversing the first two edges makes M run. Untested (the OR-merge
  test uses equal-length paths only).
- **D2 (metadata drift):** `ifThenCondition.meta.ts` advertises outputs
  `result`/`branchTaken`; the handler outputs `conditionMet`/`operator`/`onFalse`.
  `router.meta.ts` advertises `branchTaken`; actual outputs are
  `matched`/`routeLabel`/`evaluatedCount`. Builder variable pickers offer refs that
  fail at runtime.
- **D3 (no static branch validation):** nothing at save/readiness verifies that every
  returnable branch label (`"true"`, `"false"` when `onFalse:"branch"`, every
  `routes[].label`, `defaultRoute`) has a matching outgoing edge, or that labeled
  edges out of a branching node correspond to real routes. Miswired graphs fail only
  at runtime (`INVALID_BRANCH`), possibly long after ship.
- **D4 (builder, the big one):** the builder **cannot author or display branch
  routes**. Nodes render one source handle; `graphSlice.connectNodes` never sets
  `label`; `WorkflowEdge.tsx` never renders `props.label`; `insertActionAtEdge` and
  `deleteNodeAndRewire` drop labels on rewire; `onFalse` switches and router route
  rename/remove never touch edges. A user-built "If/Else" therefore runs **both**
  branches (unlabeled edges always activate). Labeled edges exist today only via
  templates, AI patches, or direct PATCH.

### Entitlement infrastructure (verified)

- Plan model: `account_billing.plan` (`free|pro|team|business|enterprise`) +
  `plan_status` (`active|trialing|past_due|canceled|incomplete`); Stripe webhook is
  the sole plan writer; trials are `plan_status='trialing'` (+ one-trial columns);
  subscription deletion reverts personal plan → free. `billing_mode='internal_free'`
  bypasses **task deduction only**, never plan capabilities.
- Capability seam exists: `PlanCapabilities`/`planCapabilitiesFor`
  (`core/billing/planPolicy.ts:136-178`) + fail-closed
  `resolveAccountPlan`/`resolveAccountCapabilities`
  (`services/billing/planCapabilities.ts` — missing row/error → `"free"`). Enforced
  precedents: bulk export (403 `UPGRADE_REQUIRED`), template creation
  (`tier_forbidden`).
- Chokepoints: **all** definition updates flow through
  `services/workflows/saveDraftDefinition.ts` (PATCH save, AI apply, checkpoint
  restore, template replace); the only non-empty create is
  `createWorkflowFromTemplate`; **every** execution path (run-now, webhooks incl.
  HubSpot's direct enqueue, polling, scheduled, public API key route, queue
  processor/cron) converges on `WorkflowEngine.runWorkflow`, which resolves the
  executed definition (test→draft, live→active revision) and `workflow.accountId`
  **before** the billing gate — a pre-billing entitlement rejection consumes no task.
- No duplicate/clone route, no import route, no retry route exist (nothing to gate).
- `workflow_disabled_reason` is a PG enum already containing `billing_exhausted`
  (unused by code today) + a free-text `disabled_context` column → downgrade
  auto-disable needs **no migration**.

## 2. Product decisions locked for this batch

- **Capability id:** `advanced_branching`. **Restricted node set:**
  `native:if_then_condition` and `native:router` (type-level). The `onFalse:"skip"`
  filter-style configuration of If/Then is the *same node* (same library entry, same
  handler) and is therefore restricted with it — a separate Free-safe linear Filter
  node is a documented follow-up, not this batch. Labeled edges alone, the condition
  evaluator, and the engine branching primitives are **not** gated.
- **Entitled:** plan ∈ {pro, team, business, enterprise} AND
  `plan_status` ∈ {active, trialing, past_due}. Trialing covers active Pro/Team
  trials. `past_due` is allowed to match the repo's warn-first billing lifecycle;
  `canceled`/`incomplete` deny. Missing row / read error / unknown → **denied**
  (fail closed, same posture as `resolveAccountPlan`). Entitlement is resolved from
  the **workflow-owning `account_id`** (already how the engine bills), never the
  acting user. `accounts.type` is never consulted.
- **Typed error:** `PLAN_FEATURE_REQUIRED` (HTTP 403 at routes; new `RunFailureCode`
  at the engine, humanized to action `upgrade_plan` → existing `/account` CTA).
  Structured fields: `capability: "advanced_branching"`, `requiredPlan: "pro"`.
  Authorization/membership checks always run first (existing route order), so the
  code never leaks account existence across authz boundaries.
- **Save rule:** validate the **proposed** definition — reject when it contains a
  restricted node and the account is not entitled; a save that removes all
  restricted nodes is allowed (downgrade recovery). Reads are never blocked.
- **Downgrade + background runs:** engine rejects with `PLAN_FEATURE_REQUIRED`
  before readiness/billing (test runs included). For background trigger sources
  (webhook/polling/schedule/api), the engine additionally disables the workflow via
  the existing `LifecycleOrchestrator` with the existing `billing_exhausted` reason +
  `disabled_context` naming advanced branching — one failed run, then the existing
  `state === "active"` dispatch gates stop further noise; recovery follows the
  existing `disabled → eligible_to_resume → user resumes` path. Manual/test
  rejections never change lifecycle state.

## 3. Deliberate semantic changes (called out per task contract)

1. **D1 fix** — reconverging nodes become order-independent (fixpoint worklist
   instead of single-pass finalization). Graphs that previously mis-skipped a merge
   node now execute it; this is the documented OR-merge contract, not a new one.
2. **New blocking readiness issues** (builder validation + write-path readiness +
   engine real-run readiness): missing branch edge for a returnable label, stale
   labeled edge out of a branching node. A previously "runnable" miswired branching
   workflow now fails `WORKFLOW_NOT_READY` instead of running both branches or dying
   mid-run with `INVALID_BRANCH`. `INVALID_BRANCH` remains as the runtime backstop.
3. **Entitlement enforcement itself** (Free accounts lose access to a node type they
   could previously reach through templates/AI/direct PATCH).

## 4. Implementation plan (commit chain)

1. **C1 — policy + classifier.** `core/workflows/advancedBranching.ts` (pure:
   `ADVANCED_BRANCHING_NODE_TYPES`, `isAdvancedBranchingNodeType`,
   `definitionUsesAdvancedBranching`); `canUseAdvancedBranchingForPlan` +
   `PlanCapabilities.canUseAdvancedBranching` + entitled-status rule in
   `core/billing/planPolicy.ts`; server resolver
   `services/billing/advancedBranchingEntitlement.ts` (RLS + service-role variants,
   fail closed) + `getPlanState`/`getPlanStateServiceRole` in
   `repositories/accountBilling.ts`; `services/workflows/patch/checks.ts` reuses the
   core set. Table-driven unit tests.
2. **C2 — engine correctness.** D1 fixpoint fix in `engine.ts` (+ regression tests:
   unequal-path reconvergence both edge orders, nested variant); D2 meta output fixes.
3. **C3 — branch-wiring validation.** Extend
   `core/workflows/executionReadiness.findGraphIssues` with `missing_branch_edge` /
   `stale_branch_edge` (config parsed defensively); surfaces in
   `collectBuilderValidationIssues`, `checkWritePathReadiness`,
   `checkWorkflowReadiness` with node-and-route-naming messages.
4. **C4 — builder branch authoring.** Labeled source handles on branching nodes
   (stable ids `branch:<label>` + an always/cleanup handle), `connectNodes` label
   support, adapters map label↔sourceHandle, `WorkflowEdge` renders labels,
   `insertActionAtEdge`/`deleteNodeAndRewire` preserve labels,
   `updateNodeConfig` reconciles edges on `onFalse`/route changes (drops stale
   labeled edges). Component tests.
5. **C5 — server enforcement.** `saveDraftDefinition` gate (accountId threaded;
   proposed-definition rule), `createWorkflowFromTemplate` destination gate, AI
   (`proposeWorkflowMutation` grounded refusal; apply path covered by
   `saveDraftDefinition`), engine pre-billing gate (+ background auto-disable),
   route preflights (activate, publish, run-now) with typed 403, humanizer + CTA
   wiring. Service/route tests incl. no-task-deducted and authz-before-plan.
6. **C6 — builder locked UX.** Capabilities threaded from
   `app/workflows/[id]/page.tsx`; locked `PickerRow` state (Pro badge, "Route your
   workflow down different paths based on conditions.", upgrade CTA → `/account`),
   keyboard-accessible, explicit upgrade callout on attempt; `handlePickAction`
   backstop; typed `PLAN_FEATURE_REQUIRED` rendering for save/run/activate in the
   builder. Component tests.
7. **C7 — integration + e2e.** Engine-entry integration tests (free blocked on
   run-now/webhook/polling/schedule paths via engine, paid allowed, activated-then-
   downgraded stops, no handler invoked, no task deducted); Playwright: paid
   builder-driven If/Else journey (author via handles → save → reload → true run →
   false run → skipped visibility), free locked-library + direct-API-save journey,
   downgrade recovery (integration-level).
8. **C8 — docs/closeout + owner report.**

## 5. Verification gates

`npx tsc --noEmit` · `npm run lint` · `npm run lint:structure` ·
`npm run lint:migrations` · `npm test` · focused suites per commit · new Playwright
specs (serial where shared fixtures require). Any pre-existing unrelated failures
reported precisely, never claimed green.
