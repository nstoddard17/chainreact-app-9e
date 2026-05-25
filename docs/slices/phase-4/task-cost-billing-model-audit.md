# Phase 4 — Workflow Task Cost / Billing Model Audit + V2 Plan

**Slice:** 4.COST-1
**Type:** Doc-only audit + planning slice. **No runtime/source/test/metadata/migration files modified.**
**Date:** 2026-05-25
**Branch:** `v2-ai-architecture-planning`
**HEAD at authoring:** `f9b1fefdd` (docs(ai): owner AI observability + performance dashboard plan — AI-1)
**Base baseline:** `origin/v2-foundation` (Phase 2 merged via PR #92, merge commit `5486f1aff`)

> Why now: AI architecture planning (4.AI-1) has started, and 4.AI-2 read-only context tools exist on disk. Before the AI track builds the `WorkflowPatch` validator (4.AI-3) and preview/apply flow, we need a deterministic, grounded answer to "what does a workflow cost?" — because the AI must *call* a cost estimator, never *guess* cost. This slice audits the **actual** V2 billing implementation (no assumptions) and proposes a V2-native architecture for first-class task-cost awareness. **It implements nothing.**

---

## Implementation status (living section — updated as COST-* slices ship)

| Slice | Status | Notes |
|---|---|---|
| **COST-1** | shipped (`6e67f1482`) | This audit/plan. Doc-only. |
| **COST-2A** | shipped (`1753f2cb2`) | Narrow safety fix: test/dry-run runs no longer deduct tasks ([executionBillingGate.ts](../../../services/billing/executionBillingGate.ts) `{ testMode }` → skipped outcome; engine passes `isTest`). Real runs unchanged (flat 1/run). |
| **COST-2** | shipped | Central task cost policy + deterministic workflow cost estimator (read-only; nothing enforces them yet). See note below. |
| **COST-3** | shipped | Ledger-only first: `task_usage_events` + per-run cost columns + actual-cost recording. Live billing still flat 1/run. Reserve/reconcile remains future. See note below. |
| **COST-4** | shipped | Central cost-override map in `taskCostPolicy.ts` (NO ActionMeta/TriggerMeta edits). `source: "override"` surfaced through estimator + ledger. See note below. |
| COST-5 | future | Workflow preview cost API/UI (calls the COST-2 estimator). |
| COST-6 | future | `ai_cost_events` ledger + AI credits. |
| COST-7 | future | Owner/admin analytics. |
| COST-8 | future | Template cost-estimation hooks (reuse the COST-2 estimator). |

### COST-2 implementation note

Two pure, deterministic, read-only services were added under `services/billing/` (placement follows the [executionBillingGate](../../../services/billing/executionBillingGate.ts) core-vs-ESLint precedent from §10):

- **[`taskCostPolicy.ts`](../../../services/billing/taskCostPolicy.ts)** — the single source of "what does a node cost?" Pure function of `(node, meta?)`. API: `getTaskCostPolicyVersion()`, `classifyNodeTaskCost(node, meta?) → NodeTaskCost`, `isBillableNode(node, meta?)`, `TASK_COST_POLICY_VERSION = "v1"`. `NodeTaskCost = { billable, baseTasks, perItemTasks?, chargeOn, reason, policyVersion, source }`. Default rules (no per-provider metadata edits): provider action (grounded by registered meta) → 1 on success; `native:http_request` → 1; native control-flow (`if_then_condition`/`router`/`delay`/`format_transformer`) → 0; triggers → 0; ungrounded/unknown node → `unknown_node`, non-billable. `chargeOn: "ai_call"` is reserved for the future AI ledger and is **never** returned for a workflow node (AI ops are not WorkflowNodes). `source` is always `default_policy`; `override`/`future_metadata_override` are reserved for COST-4.
- **[`workflowCostEstimator.ts`](../../../services/billing/workflowCostEstimator.ts)** — deterministic estimate over a `WorkflowDefinition`, grounded in the discovery registry + the policy. API: `estimateWorkflowTaskCost(def) → WorkflowCostEstimate`, `estimateNodeTaskCost(node) → NodeCostBreakdown`, `summarizeWorkflowCost(def) → WorkflowCostSummary`. Output: `{ estimatedTasksPerRun, billableNodes[], nonBillableNodes[], unknownCostNodes[], warnings[], policyVersion, nodeBreakdown[] }`; each breakdown carries `{ nodeId, provider, type, displayName?, kind, billable, estimatedTasks, reason, chargeOn, riskLevel?, category? }`. `estimatedTasksPerRun` is the sum of billable nodes (an **upper bound**; branch-aware min/max is a follow-up, flagged via a `BRANCHING_UPPER_BOUND` warning when labeled edges exist). Warnings also cover `EVENT_VOLUME_UNKNOWN` (webhook/polling), `SCHEDULE_ESTIMATE_UNAVAILABLE` (scheduled — monthly derivation deferred; no cron-frequency parser exists yet, only `isValidCronExpression`/`computeNextFireTime`), and `UNKNOWN_NODE_TYPE`.

**Guarantees:** both services are side-effect free — no provider calls, no AI, no token reads, no DB writes, no billing deduction, no workflow mutation. The estimator reads node **identity + registry meta only** and never touches `node.config`, so secrets cannot leak into the estimate (covered by no-leak tests for `accessToken`/`refreshToken`/`apiSecret`/`clientSecret`/`webhookSecret`/`botToken`/`Authorization`/raw config values).

**What COST-2 did NOT change:** actual execution billing is still flat 1 task/run (Slice 1N) with the COST-2A test-mode skip — nothing consumes the policy/estimator yet. No `task_usage_events` ledger, no reserve/reconcile, no migrations, no UI, no AI cost events, no metadata edits. Tests: [`taskCostPolicy.test.ts`](../../../tests/unit/services/billing/taskCostPolicy.test.ts), [`workflowCostEstimator.test.ts`](../../../tests/unit/services/billing/workflowCostEstimator.test.ts).

**Next:** AI-3's WorkflowPatch validator should call `estimateWorkflowTaskCost` (the AI never guesses cost); templates (COST-8) and workflow preview (COST-5) reuse the same estimator.

### COST-3 implementation note

**Approach: Option A (ledger-only first) from §5.** Live billing is **unchanged** — real runs still pay the flat 1-task pre-deduct gate (Slice 1N) with the COST-2A test-mode skip. COST-3 adds, *in parallel*, an append-only ledger + per-run cost columns + actual-cost recording so estimate-vs-actual is auditable and the future reserve/reconcile model has a foundation. **Nothing here deducts tasks.**

**Migration** [`20260525000000_task_usage_events.sql`](../../../supabase/migrations/20260525000000_task_usage_events.sql):
- New `task_usage_events` ledger — RLS enabled, `select_own` policy, explicit least-privilege GRANTs (authenticated SELECT only; service_role full). Columns: `user_id`, `workflow_id`, `workflow_run_id`, `node_id`, `provider`, `node_type`, `node_kind`, `event_type` (CHECK-constrained), `billable`, `tasks_charged`, `estimated_tasks`, `actual_tasks`, `charge_on`, `cost_reason`, `cost_policy_version`, `test_mode`, `metadata jsonb`, `created_at`. Indexes on run / user / workflow.
- `workflow_runs` gains nullable `estimated_task_cost`, `actual_task_cost`, `task_cost_policy_version` (grandfathered table — no new GRANT).

**Repository** [`taskUsageEvents.ts`](../../../repositories/taskUsageEvents.ts): `insertEvents(events)` (service-role, no-op on empty), `listByRun(runId)` (RLS). snake_case ↔ camelCase mapping.

**Service** [`taskUsageRecorder.ts`](../../../services/billing/taskUsageRecorder.ts):
- `computeRunTaskUsage(def, steps)` — **pure**: COST-2 estimate + actual cost (= sum of **successful billable action** nodes) + per-node billable events + redacted numeric summary. Never reads `node.config`.
- `recordRunActuals({ runId, workflowId, userId, usage })` — writes one `run_estimate_recorded` + one `node_task_charged` per billable node.
- `listTaskUsageForRun(runId)`.

**Engine wiring** ([engine.ts](../../../services/execution/engine.ts)): post-run, real runs only — compute usage, write the run-row cost columns via `recordRun`, then `recordRunActuals` (**fail-open**: a ledger failure logs `execution.run.task_usage_record_failed` and never breaks the run). **Test/dry-run runs record nothing** (`usage = null`; run-row cost columns stay NULL) — the documented "skip the ledger in test mode" choice (§5).

**Recording policy:** only SUCCESSFUL billable action nodes produce a `node_task_charged` event. Failed (handler failure / missing variable / invalid branch), skipped, trigger, and non-billable control-flow nodes record nothing billable. Fatal-before-execution runs (`WORKFLOW_NOT_FOUND` / `TRIGGER_NODE_NOT_FOUND` / `BILLING_EXHAUSTED`) record no usage and leave cost columns NULL.

**No-leak:** the recorder receives only `RunTaskUsage` (ids + counts + classification), never config — secrets cannot reach the ledger by construction (no-leak tested).

**What COST-3 did NOT change:** no per-node deduction, no reserve/reconcile, no change to flat 1/run customer billing, no UI, no AI cost events, no metadata edits. **Remaining (future):** COST-3.x reserve/reconcile (charge actual successful billable actions, handle mid-run insufficient balance + partial runs atomically); COST-6 AI cost events (separate ledger); COST-7 owner analytics reading this ledger; COST-5 preview surfacing estimate.

Tests: [`taskUsageEvents.test.ts`](../../../tests/unit/repositories/taskUsageEvents.test.ts), [`taskUsageRecorder.test.ts`](../../../tests/unit/services/billing/taskUsageRecorder.test.ts), COST-3 block in [`engine.test.ts`](../../../tests/unit/services/execution/engine.test.ts).

### COST-4 implementation note

**Override strategy chosen: central override map only — NO metadata fields, NO provider mass-edits.** A metadata `taskCost?` slot on `ActionMeta`/`TriggerMeta` was evaluated and **rejected as premature**: it would invite per-provider edits and there is no node today whose cost can't be expressed centrally. The central map keeps cost a single-file concern, fully reviewable in one diff.

[`taskCostPolicy.ts`](../../../services/billing/taskCostPolicy.ts) additions:
- `TaskCostOverride` interface (`billable`, `baseTasks`, `perItemTasks?`, `chargeOn`, `reason`) + `TASK_COST_OVERRIDES` map keyed by `provider:type`.
- `getTaskCostOverride(provider, type, kind) → TaskCostOverride | undefined` — pure lookup; returns `undefined` for triggers (they are always free).
- `classifyNodeTaskCost` order: **trigger → 0** ⟶ **central override** (`source: "override"`) ⟶ native control-flow → 0 ⟶ native unknown → `unknown_node` ⟶ provider+meta → 1 ⟶ ungrounded → `unknown_node`.

**The map holds exactly one entry today: `native:http_request` → billable 1** (`reason: native_external_egress`). It moved here from the COST-2 inline native-billable set — it is conceptually "the one native node that does external work overrides the native-default of 0." Behavior is identical (still 1 task); only its `source` is now `"override"`. No new product cost numbers were introduced. `perItemTasks` is representable on the override contract but **not applied** to any loop math (no bulk/loop node exists; the estimator never multiplies by it).

**Supported future cases (mechanism only, none seeded):** bulk/loop (`perItemTasks`), file-heavy ops, premium provider actions, high-cost native utilities, AI nodes if they ever become WorkflowNodes. Each lands as one reviewable map entry; the default policy is untouched for everything else, and unknown/ungrounded nodes still resolve to `unknown_node` + non-billable.

**Estimator / recorder / ledger:** `NodeCostBreakdown` (estimator) and `NodeTaskUsage` (recorder) now carry `source`; the recorder writes `metadata: { source }` (enum only — never raw override config) onto `node_task_charged` ledger events. `charge_on`, `cost_reason`, and `cost_policy_version` continue to be stored. No migration (source rides in the existing `metadata jsonb`).

**Unchanged:** no metadata edits, no live per-node deduction, no reserve/reconcile, no AI cost events, no UI, policy version stays `"v1"`. Tests: override-wins / trigger-stays-0 / default-source / `getTaskCostOverride` in [`taskCostPolicy.test.ts`](../../../tests/unit/services/billing/taskCostPolicy.test.ts); source surfacing in [`workflowCostEstimator.test.ts`](../../../tests/unit/services/billing/workflowCostEstimator.test.ts) + [`taskUsageRecorder.test.ts`](../../../tests/unit/services/billing/taskUsageRecorder.test.ts).

---

## 0. Executive summary

**Finding in one line: V2 billing today is a flat, pre-execution charge of exactly 1 task per workflow run, with zero cost awareness in metadata, no per-node/per-provider/per-trigger accounting, no estimate-before-run, no actual-cost recording on the run row, and no user- or owner-facing cost surface.** It is the deliberate "minimum gate" from Slice 1N — it proves a quota can block the engine end-to-end, and explicitly defers everything richer.

This is a clean substrate, not a mess: the gate is atomic, race-safe, single-sourced, and the metadata registries are frozen + Zod-validated. But the shape Marcus wants — *understandable user-facing tasks on top of detailed internal accounting* — requires one **fundamental architectural shift** plus several additive layers:

1. **From pre-deduction to reserve-then-reconcile.** Today the engine deducts 1 task *before any handler runs* ([engine.ts:219](../../../services/execution/engine.ts)). That means failed runs, runtime config failures, and **test runs are all charged**, while the actual work done (1 node or 30 nodes) is irrelevant to the charge. The preferred policy ("charge successful billable action executions; don't charge validation/config failures; don't charge test runs") is **post-execution, per-successful-billable-action** accounting. These are incompatible models. The flat gate stays as a cheap *plan-limit guard*, but real accounting must move to after-execution.

2. **A central cost policy, not per-provider edits.** Cost belongs in **one** `taskCostPolicy` keyed on signals the metadata *already* exposes (`requiresIntegration`, `category`, `riskLevel`, trigger `activation`, `provider:type`), with an **optional** additive `taskCost?` override slot on `ActionMeta` / `TriggerMeta` for the handful of special cases (bulk, file-heavy, future per-item). We do **not** hand-edit ~270 provider metas.

3. **One deterministic estimator, three consumers.** A pure `workflowCostEstimator(WorkflowDefinition)` is the single source of "estimated tasks/run + billable node list + warnings." Manual preview, template preview, and the AI agent all call the *same* function. The AI never reasons about cost — it reads the estimator's output.

4. **AI cost is a separate ledger.** AI interactions are not workflow tasks. They get their own `ai_cost_events` ledger (model, tokens, tool calls, outcome) and convert to **AI credits**, kept attributable and capped independently — even if plans later bundle them.

**What is strong and must not regress:** the atomic `deduct_tasks_if_available` RPC (race-free check-and-write under a row lock); the single-source gate in `services/billing/`; the frozen, Zod-validated discovery registry; webhook dedup + filter + inactive-drop happening *before* enqueue (so deduped/filtered/inactive events already cost nothing). Build on these; don't fork them.

**Honesty note (per repo memory):** every "current behavior" claim below cites a file:line. Where a number (1 task, 0 tasks) is a *proposal* rather than observed code, it is labeled a proposal and surfaced as an open decision for Marcus. No invented cost figures are presented as fact.

---

## 0a. Evidence map (every "current state" claim traces here)

| Claim about current V2 | Source of truth |
|---|---|
| Billing = 1 task per run, flat; per-node deferred | [`services/billing/executionBillingGate.ts:15,29`](../../../services/billing/executionBillingGate.ts) |
| Deduction is atomic check-and-write under row lock | [`supabase/migrations/20260507000002_user_billing.sql:71-115`](../../../supabase/migrations/20260507000002_user_billing.sql) |
| `user_billing` columns: `tasks_limit`(def 100), `tasks_used`, `period_started_at` | [`20260507000002_user_billing.sql:12-19`](../../../supabase/migrations/20260507000002_user_billing.sql) |
| No packs / overage / Stripe (explicitly deferred) | [`20260507000002_user_billing.sql:8-10`](../../../supabase/migrations/20260507000002_user_billing.sql) |
| Repo helpers: `deductTasks` (service-role RPC), `getUsage` (RLS) | [`repositories/userBilling.ts:26-74`](../../../repositories/userBilling.ts) |
| Gate runs once per run, after structural checks, **before** any handler | [`services/execution/engine.ts:216-243`](../../../services/execution/engine.ts) |
| Gate is **unconditional** — no `isTest` guard → test runs billed | [`services/execution/engine.ts:219`](../../../services/execution/engine.ts) |
| Structural failures (`WORKFLOW_NOT_FOUND`, `TRIGGER_NODE_NOT_FOUND`) occur **before** the gate → not billed | [`services/execution/engine.ts:173-214`](../../../services/execution/engine.ts) |
| `workflow_runs` has no cost columns; steps are jsonb | [`20260507000001_workflow_runs.sql:17-44`](../../../supabase/migrations/20260507000001_workflow_runs.sql) |
| `workflow_runs` provenance: `is_test`, `triggered_by`(manual/test/webhook/scheduled/retry/unknown) | [`20260523000000_workflow_runs_test_mode.sql:16-31`](../../../supabase/migrations/20260523000000_workflow_runs_test_mode.sql) |
| ActionMeta has **no** cost field (has category/risk/requiresIntegration/…) | [`contracts/actionMeta.ts:383-485`](../../../contracts/actionMeta.ts) |
| TriggerMeta has **no** cost field (has `activation`/requiresIntegration/…) | [`contracts/triggerMeta.ts:47-96`](../../../contracts/triggerMeta.ts) |
| Native action types + risk: `http_request`(high), `format_transformer`(low), `delay`(low), `if_then_condition`(low), `router`(low) | [`integrations/native/actions/*.meta.ts`](../../../integrations/native/actions/) |
| Native triggers: `native:manual.run`(manual), `native:schedule.fired`(scheduled) | [`integrations/native/triggers/*.meta.ts`](../../../integrations/native/triggers/) |
| `httpRequestEgress.ts` is an egress-hardening helper for `http_request`, **not** a separate node | [`integrations/native/actions/httpRequestEgress.ts:1-25`](../../../integrations/native/actions/httpRequestEgress.ts) |
| Webhook dispatch: dedup + filter + inactive-drop happen **before** `enqueueRun` | [`services/triggers/dispatch.ts:52-167`](../../../services/triggers/dispatch.ts) |
| `enqueueRun` is fire-and-forget; no billing here | [`services/execution/enqueue.ts:48-97`](../../../services/execution/enqueue.ts) |
| Polling `poll()` enqueues only on new events; empty poll = no run | [`services/triggers/pollingRegistry.ts:28-44`](../../../services/triggers/pollingRegistry.ts) |
| Polling interval flat 5 min for all roles; per-tier stubbed for future | [`services/cron/pollingIntervals.ts:22-26`](../../../services/cron/pollingIntervals.ts) |
| run-now `!testMode` gate is the **confirmation** gate, not billing | [`app/api/workflows/[id]/run-now/route.ts:176-205`](../../../app/api/workflows/[id]/run-now/route.ts) |
| No cost estimator / preview anywhere (grep: none) | repo-wide search, 2026-05-25 |
| No admin/owner billing or analytics surface (grep: none) | repo-wide search, 2026-05-25 |
| No AI cost model — AI is planning-only | repo-wide search, 2026-05-25 |
| `getUsage` has zero UI consumers (cost invisible to users) | repo-wide search, 2026-05-25 |
| Billing tests: gate + repo only | [`tests/unit/services/billing/executionBillingGate.test.ts`](../../../tests/unit/services/billing/executionBillingGate.test.ts), [`tests/unit/repositories/userBilling.test.ts`](../../../tests/unit/repositories/userBilling.test.ts) |

---

## 1. Current billing / task model

### 1.1 How a charge happens today (end-to-end trace)

```
trigger event (webhook / poll / schedule / run-now)
  → dispatch.ts: dedup + filter + active-check  [dropped here → 0 charge]
  → enqueueRun()                                [no billing]
  → WorkflowEngine.runWorkflow()
       getByIdServiceRole → WORKFLOW_NOT_FOUND?  [return, no charge]
       trigger node present? → TRIGGER_NODE_NOT_FOUND?  [persist, no charge]
       executionBillingGate(userId)  ──►  deduct_tasks_if_available(userId, 1)
            ok=false → BILLING_EXHAUSTED fatal, persist, return
            ok=true  → 1 task already spent; run proceeds
       for each node: resolve config → (test-mode gate) → handler
       persistRun()  [writes workflow_runs; NO cost columns]
```

The charge is a **single fixed `+1`** on `user_billing.tasks_used`, taken at the *start* of a run that has a valid workflow + trigger node, **regardless of** how many nodes run, whether they succeed, or whether it's a test run. There is no second deduction and no reconciliation.

### 1.2 Explicit Q&A (audit scope §1)

| Question | Answer (with evidence) |
|---|---|
| Is billing flat per workflow run? | **Yes** — flat `+1` per run ([executionBillingGate.ts:29](../../../services/billing/executionBillingGate.ts)). |
| Is billing per action node? | **No.** Node count is irrelevant to the charge. |
| Is billing per provider? | **No.** Provider identity never enters billing. |
| Is billing per workflow execution? | **Yes** — "execution" == "run" == 1 task. |
| Are native nodes charged? | **Not separately.** They're absorbed into the flat per-run charge; a run of only native nodes still costs 1. |
| Are triggers charged? | **No trigger-specific charge.** The trigger doesn't bill; the *run* it starts bills 1. Webhook receipt / poll check don't bill. |
| Are failed runs charged? | **Yes** — deduction precedes handlers; a run that fails at a node already spent its task. (Pre-gate *structural* failures are the exception — not charged.) |
| Are test runs charged? | **Yes.** The gate has no `isTest` guard ([engine.ts:219](../../../services/execution/engine.ts)). **⚠ Contradicts preferred policy — a real gap.** |
| Are validation/config failures charged? | **Yes, if they occur at runtime** (e.g. `MISSING_VARIABLE` at a node, after the gate). Pre-gate structural failures are not. |
| Are missing-integration failures charged? | **Yes, at runtime** (handler 401 happens after the gate). Activation-time precondition checks are separate ([services/triggers/preconditions.ts](../../../services/triggers/preconditions.ts)). |
| Are retries charged? | **Not applicable yet** — `retry` is a valid `triggered_by` value but no retry route is wired. If wired through the engine, it would bill 1/run like any run. |
| Is there a cost estimate before activation/run? | **No.** No estimator exists. |
| Is actual cost recorded per run / node? | **No.** The deduction is a counter bump, not recorded on `workflow_runs` and not linked to the run. |
| Is cost visible to users? | **No.** `getUsage` exists but has zero consumers. |
| Is cost visible to owner/admin? | **No.** No admin/analytics surface. |
| Are AI costs modeled at all? | **No.** AI is planning-only; no AI cost tables/services. |

### 1.3 The structural gap

Two architectural facts dominate everything downstream:

- **Charge timing is pre-execution.** A reserve-style flat gate is the *right* shape for a fast plan-limit guard, but it cannot express "charge only successful billable work." Per-success accounting **must** be post-execution.
- **No cost ledger / no run↔cost link.** `user_billing.tasks_used` is a bare counter. There is no append-only event row tying a charge to a `run_id`/`node_id`, so reconciliation, refunds, analytics, and "why was I charged?" are all impossible today. (V1 solved this with a `task_billing_events` ledger — V2 has no equivalent.)

---

## 2. Provider ActionMeta / TriggerMeta cost-awareness audit

### 2.1 What exists

`ActionMeta` ([contracts/actionMeta.ts](../../../contracts/actionMeta.ts)) and `TriggerMeta` ([contracts/triggerMeta.ts](../../../contracts/triggerMeta.ts)) are `.strict()` Zod objects, parsed at module load in the discovery registry ([services/discovery/_registry.ts:696-701](../../../services/discovery/_registry.ts)). Neither carries any cost field. The closest existing signals:

| Signal | Where | Useful for cost because… |
|---|---|---|
| `requiresIntegration: boolean` | ActionMeta + TriggerMeta | cleanly separates native (false) from provider (true) — the primary billable/non-billable axis. |
| `category` (`logic`, `transform`, `http`, `messaging`, …) | ActionMeta | control-flow/transform categories map to "free"; outward categories map to "billable." |
| `riskLevel` / `isDestructive` | ActionMeta | `high`/egress (e.g. `native:http_request`) is exactly the native node we *do* want to bill. |
| `activation` (`webhook`/`polling`/`manual`/`scheduled`) | TriggerMeta | lets the estimator reason about run cadence (schedule → monthly estimate; polling → volume warning). |

### 2.2 Answers (audit scope §2)

- **Is there already a `taskCost` / `billingCost` / `costPolicy` field?** No.
- **If not, where should it live?** Cost decisions live in a **central policy service**, *defaulted from existing metadata signals*. A thin, **optional** `taskCost?` override slot is added to `ActionMeta`/`TriggerMeta` only for exceptions. Default-driven, not per-meta.
- **Metadata vs central policy vs both?** **Both, with policy primary.** Policy owns the defaults (keyed on `requiresIntegration` + `category` + `riskLevel` + `activation` + `provider:type`); metadata holds rare overrides. This avoids editing ~270 metas while keeping special cases co-located with the node they describe.
- **Can a default policy avoid touching every provider file?** **Yes** — that's the point. A provider action defaults to billable-on-success purely from `requiresIntegration: true`; native nodes default from `category`/`riskLevel`. Zero provider edits needed for the baseline.
- **How would overrides work for expensive/bulk/special nodes?** Additive optional field on the meta, e.g. `taskCost?: { base?: number; perItem?: number; itemsFrom?: string }` — `base` overrides the policy default; `perItem` + `itemsFrom` (a field/output name) drives bulk/loop cost. Validated by the same Zod load gate; the policy reads it when present, else falls through to the default.

> Boundary note: any `taskCost?` addition is **out of scope for this slice** (no metadata edits). It is specced here and lands in COST-4 only if the default policy proves insufficient.

---

## 3. Native node cost audit

Exact types and current risk from the metas. Recommendations are **proposals** matching Marcus's stated baseline; final values are Marcus's call (§11, open decisions).

| Native node | `key` / `type` | Current risk | Recommended cost | Justification |
|---|---|---|---|---|
| Manual trigger | `native:manual.run` (manual) | — | **0** | Triggering is not work; the run's actions bill. |
| Schedule trigger | `native:schedule.fired` (scheduled) | — | **0** | Same; cadence drives an *estimate*, not a per-fire charge. |
| Filter / condition | `native:if_then_condition` | low | **0** | Pure in-process control flow; no external effect. |
| Router | `native:router` | low | **0** | Pure in-process branching. |
| Formatter / transform | `native:format_transformer` | low | **0** | Pure in-process data transform. |
| Delay | `native:delay` | low | **0** (user) | A wait is not billable work. **Internal** caveat: durable delays will consume scheduler/queue resources once a real queue lands — track as an *internal* cost event, never a user task. |
| HTTP request / egress | `native:http_request` | **high** | **1 on success** | Real external egress = real work and real abuse surface (SEC-3 hardened it for a reason). This is the one native node that is genuinely a billable external call. `httpRequestEgress.ts` is its hardening helper, not a separate node — there is **no** second `native:httpRequestEgress` node to price. |

**Do not blanket-zero native nodes.** Control-flow/transform/delay = 0; external egress (`http_request`) = billable. This matches the audit's explicit instruction to justify rather than assume.

---

## 4. Trigger cost audit

| Trigger class | Current behavior (evidence) | Recommendation |
|---|---|---|
| Webhook receipt | Not billed — dispatch dedups/filters/active-checks before `enqueueRun` ([dispatch.ts](../../../services/triggers/dispatch.ts)); billing is engine-only. | **Keep 0.** Receiving an event is not billable. |
| Trigger event that starts a run | The *run* bills 1 (flat). | Under per-node policy: bill the **billable actions the run executes**, not the trigger. |
| Polling check (empty) | Not billed **and** not tracked — `poll()` enqueues nothing on no-events; no cost event written ([pollingRegistry.ts](../../../services/triggers/pollingRegistry.ts)). | **0 user tasks**, but **add an internal-only poll cost event** for analytics/margin. |
| Polling event that starts a run | Same as any run → flat 1. | Bill executed billable actions; trigger itself 0. |
| Active polling pressure | Flat 5-min interval for everyone; per-tier stubbed ([pollingIntervals.ts](../../../services/cron/pollingIntervals.ts)). | Govern polling cost via **plan-tier intervals** (revive the documented free=15m/pro=2m/business=1m design), **not** per-empty-poll user charges. |
| Trigger dedup | Deduped events dropped before enqueue → already 0. | **Keep** — dedup is the first anti-double-bill defense. |
| Filtered-out events | `no-match` dropped before enqueue → 0. | **Keep** — filtered events must never bill. |

**Answers (audit scope §4):** webhook receipt → **0**; a trigger event bills only when it **starts a run**, and then via the run's billable actions; polling checks → **0 user, internal-tracked**; empty polls → **internal cost event only**; active polling → **plan limits, not per-poll charges**; dedup/filter → **drop before enqueue, never billed.**

---

## 5. Failure / retry / test-mode audit

Current model deducts up front, so most of these are *currently mischarged* relative to the preferred policy. Column "Current" = observed; "Preferred" = Marcus's stated baseline; "Needs change?" flags the gap.

| Scenario | Current | Preferred | Needs change? |
|---|---|---|---|
| Successful billable action | flat 1/run (not per action) | charge per successful billable action | **Yes** — per-node post-exec accounting |
| Failed provider API call | already charged (pre-deduct) | not charged (no successful side effect) | **Yes** — reconcile to actual successes |
| Config / schema validation failure | charged if at runtime (post-gate) | not charged | **Yes** |
| Missing-integration failure (runtime) | charged (handler 401 post-gate) | not charged (or only on success) | **Yes** |
| Missing-variable failure | charged (`MISSING_VARIABLE` post-gate) | not charged | **Yes** |
| Rate-limit failure | charged | not charged | **Yes** |
| Retries | not wired | each success billed once; never double-bill an already-succeeded step | **Future** — needs idempotency/lineage (absent in V2) |
| Test / dry-run | **charged** ([engine.ts:219](../../../services/execution/engine.ts)) | 0 unless real external side effect | **Yes — clear bug vs policy.** Test-mode gate already blocks external actions, so a test run does no external work → should be 0. |
| Blocked high-risk test-mode action | recorded as mock "succeeded"; run charged | 0 | **Yes** |
| Partial workflow failure | flat 1/run | charge only the billable actions that succeeded before the failure | **Yes** |
| Run canceled by filter/condition | flat 1/run | unran branch actions never charge | **Yes** (falls out naturally from per-success accounting) |

**Implication:** the preferred policy is **post-execution, per-successful-billable-action**. The fastest correct first step (COST-2/3) is: keep the flat gate as a *pre-flight plan-limit guard* (optionally reserve an *estimate* rather than a hard `+1`), then **reconcile to actual** at run finalization via a usage recorder + ledger. The most urgent standalone fix is **stop charging test runs** (small, high-trust, can ship early).

---

## 6. AI cost model

AI cost is **not** a workflow task and must not share the workflow ledger. Recommended: a dedicated `ai_cost_events` ledger written via a single recorder.

**Track per AI interaction:**
- `feature` — `workflow_create | workflow_edit | workflow_repair | workflow_explain | run_analysis | template_reco | template_customize` (mirrors the AI-1 capability set).
- `model`, `prompt_version` (bump with `AGENT_VERSION`-style discipline).
- `input_tokens`, `output_tokens`, `tool_calls`, `tool_failures`, `latency_ms`.
- `estimated_provider_cost_micros` (USD micro-cents — integer, no float drift).
- `user_facing_credits` — AI credits charged (decoupled from workflow tasks).
- `proposal_outcome` — `accepted | rejected | abandoned`.
- `patch_validation_failures`, `safety_blocks` (deterministic-validator catches, incl. hallucination rejects).
- ids only (user/workspace/workflow/conversation) — **no prompt bodies, no raw chain-of-thought, no PII** (per AI-1 §8 + database-security rule).

**Recommendations (audit scope §6):**
- **Separate ledger** from workflow execution tasks — yes, hard separation.
- **Credits, not tasks.** AI usage converts to **AI credits**; plans may bundle "N AI credits" independently of "N workflow tasks." Keeps user-facing pricing simple while internal accounting stays detailed.
- **Owner analytics:** AI cost by feature/model/user, acceptance rate, validation-failure mix, hallucination-catch count, latency p50/p95.
- **AI estimates workflow cost by *calling the deterministic estimator*** (§8), never by reasoning about it. This is the concrete hook the AI-3 validator must expose (see §14 AI-relationship).

---

## 7. Template cost model (future — design only)

Templates don't exist in V2 yet (confirmed in AI-1 §0a). When they land, the cost story is **free** because a template *is* a `WorkflowDefinition` and the estimator already operates on that shape.

A template card should show:
- estimated **tasks per run** (estimator over the template graph),
- **billable** vs **non-billable** node lists,
- **estimated monthly tasks** when the trigger is `scheduled` (cadence known),
- a **"depends on trigger volume"** warning for event-driven (webhook/polling) triggers,
- **AI customization cost** (credits) if instantiation uses AI,
- a **plan-limit warning** before instantiation ("this template's monthly estimate exceeds your plan").

**Rule:** template-created and AI-created workflows use the **same estimator** as manual workflows. No template-specific cost path.

---

## 8. Workflow preview / activation cost estimate

A new **pure, deterministic** `workflowCostEstimator(def, policy, context?)`:

**Inputs:** `WorkflowDefinition` + the cost policy + optional context (schedule cron, connected integrations).

**Outputs:**
- `estimatedTasksPerRun` (sum of policy costs over the reachable billable nodes),
- `billableNodes[]` / `nonBillableNodes[]` (node id + reason),
- `perNodeBreakdown[]` (node → cost + policy rationale),
- `monthlyEstimate?` (from a `scheduled` trigger's cron),
- `triggerVolumeUnknown: boolean` (event-driven → can't predict run count),
- `pollingWarning?` (active polling cadence note),
- `bulkUnknown?` (bulk/loop nodes whose item count is runtime-only → base + "per-item at runtime"),
- `planLimitCheck` (estimate vs remaining `tasks_limit - tasks_used`),
- `costPolicyVersion` (so estimates are reproducible).

**Determinism is the contract.** The estimator is the **single** cost authority for manual preview, template preview, and AI. The AI agent consumes its output verbatim. Branch reachability is *unknown* at estimate time, so the estimator reports a **range** (min reachable → max all-branches) rather than a false-precise number — never invent a single figure where branches make it indeterminate.

---

## 9. Owner / admin analytics

No analytics surface exists today. Plan an owner-facing observability layer reading from the new ledgers (never from secrets/payloads).

**Owner should see:**
- task usage by **provider / action / node-type**,
- task usage by **workflow / user / workspace / org**,
- task usage by **plan / tier**,
- **most expensive** workflows and providers/actions,
- **failed-but-costly** attempts (failures that still consumed work),
- **polling internal cost** (from internal poll events),
- **AI usage/cost** by feature / model / user,
- **accepted/rejected AI proposals**, validation-failure types, **hallucination catches** from deterministic validators,
- **template cost/success** impact (later),
- **margin / cost health** over time (provider $ cost vs tasks charged).

**Data hygiene (mandatory):** ids, event types, statuses, counts, timings, cost amounts, redacted summaries, aggregates **only**. No tokens, no payloads, no PII — per [database-security.md](../../rules/database-security.md) and the OutputMeta `sensitive` redaction already in V2.

---

## 10. Recommended architecture

V2-native, respecting [project-structure-and-module-boundaries.md](../../rules/project-structure-and-module-boundaries.md).

```
contracts/
  actionMeta.ts        ← (COST-4, optional) additive `taskCost?` override slot
  triggerMeta.ts       ← (COST-4, optional) additive `taskCost?` override slot

services/billing/
  executionBillingGate.ts   ← EXISTS — becomes the plan-limit pre-flight guard
  taskCostPolicy.ts    ← NEW (COST-2) pure: (node | meta) → task cost. Single source.
  workflowCostEstimator.ts  ← NEW (COST-2) pure: WorkflowDefinition → estimate.
  taskUsageRecorder.ts ← NEW (COST-3) post-exec actual recorder (per run + per node) + ledger writer.
  aiCostEvents.ts      ← NEW (COST-6) AI ledger writer (credits + provider $).

services/analytics/    ← NEW (COST-7)
  taskUsageStats.ts    ← owner task/cost aggregations.
  ownerAiStats.ts      ← owner AI usage/cost aggregations.

repositories/
  userBilling.ts       ← EXISTS — extend with reserve/refund as needed.
  taskUsage.ts         ← NEW — ledger + per-run/per-node usage rows.
  aiCostEvents.ts      ← NEW — AI ledger.
```

**Placement rationale:**
- `taskCostPolicy` + `workflowCostEstimator` are **pure** (no I/O) — ideally `core/`, but `core/`'s ESLint guard restricts imports to `contracts/` only. The estimator needs `contracts/workflowDefinition` + `contracts/actionMeta`/`triggerMeta` (all contracts), so it *could* live in `core/billing/`. The policy may need the discovery registry to resolve `provider:type` → meta, which is a `services/` import → it lives in `services/billing/`. **Follow the existing `executionBillingGate` precedent** ([its header](../../../services/billing/executionBillingGate.ts) documents exactly this core-vs-services tension). Keep both in `services/billing/` for a clean lint story; document the "logically core" intent in headers.
- `aiCostEvents` writer lives in `services/billing/` (ledger discipline in one place); AI *feature attribution* lives in `services/ai/` and **calls** the billing writer — no AI cost logic forks into the AI orchestrator.
- **No provider-specific cost logic anywhere** — all provider cost flows from the central policy keyed on metadata (mirrors AI-1's "no provider-specific AI logic" rule).

---

## 11. Proposed cost policy (baseline) + fit check

Marcus's stated baseline, restated as the **proposed** default policy. Numbers are proposals pending sign-off (§14 decisions), **not** observed facts.

| Node / event | Proposed cost | Fits current code? |
|---|---|---|
| Provider action (success) | **1 task** | ✗ today flat-per-run, pre-deducted → needs per-success post-exec accounting |
| Native control-flow (`if_then_condition`, `router`, `format_transformer`) | **0** | ✗ no per-node concept today |
| Manual trigger (`native:manual.run`) | **0** | ✓ (trigger never bills today) |
| Schedule trigger (`native:schedule.fired`) | **0** | ✓ |
| Webhook receipt | **0** | ✓ (already 0 — dropped before engine) |
| Polling check, no event | **0 user, internal cost event** | ◐ 0 today, but **no internal event** exists → add |
| Polling event that starts a run | action nodes bill normally | ✗ needs per-node accounting |
| `native:http_request` / egress (success) | **1 task** | ✗ no per-node concept today |
| AI explain/help | **AI credit** (separate ledger) | ✗ no AI ledger today |
| AI create/repair proposal | **AI credit** (separate ledger) | ✗ |
| Patch apply itself (no external work) | **0 workflow tasks** | n/a (patch model not built) |
| Test / dry-run | **0** unless real external side effect | ✗ **today charges 1** — must fix |
| Bulk / loop (future) | **base + per-item** | ✗ needs `taskCost.perItem` override + runtime item count |
| File-heavy ops (future) | override via meta if needed | ✗ needs override slot |

**Bottom line:** almost every row needs the architectural shift in §0/§5. The only rows that already match are the trigger/webhook zeros. The flat gate is retained as a guard; correctness comes from post-execution reconciliation + a ledger.

---

## 12. Data model recommendations

All new tables follow V2 DB rules ([database-security.md](../../rules/database-security.md)): forward-only migrations, **RLS enabled + explicit GRANTs**, no secrets, tenant isolation, snake_case columns → camelCase in repositories.

| Table / change (proposed) | Purpose | Key columns / notes |
|---|---|---|
| `task_usage_events` | append-only workflow-task ledger (V1 `task_billing_events` analogue) | `user_id`, `run_id`, `node_id?`, `event_type`(charge/reserve/refund/internal_poll), `amount`, `cost_policy_version`, `created_at`; **UNIQUE `(user_id, run_id, node_id, event_type)`** for idempotency |
| `workflow_run_task_usage` | per-run actuals | `run_id` PK, `estimated_tasks`, `actual_tasks`, `cost_policy_version`; or fold into columns below |
| `workflow_node_task_usage` | per-node actuals (query-able) | `run_id`, `node_id`, `provider`, `type`, `tasks`, `status` |
| `workflow_runs` columns | inline estimate/actual on the run row | `estimated_task_cost int`, `actual_task_cost int`, `cost_policy_version text` |
| `ai_cost_events` | AI ledger | per §6 fields; ids only, no payloads |
| `ai_patch_analytics` | proposal/validation telemetry | proposal id, outcome, validation-failure type, safety-block flag |
| owner aggregate views / matviews | analytics read models | refreshable; never expose row-level secrets |
| `cost_policy_version` everywhere a charge/estimate is stored | historical accuracy | a run charged under v1 stays attributable when policy → v2 |

**Design decision to make (§14):** per-node usage as a **separate table** (clean aggregation, more rows) vs **augmenting `workflow_runs.steps` jsonb** (cheaper writes, harder to aggregate). Recommendation: separate `task_usage_events` ledger is the source of truth; per-run/per-node columns/tables are denormalized read caches.

---

## 13. Testing strategy

Per [testing-strategy.md](../../rules/testing-strategy.md); tests mirror existing structure (e.g. [`tests/unit/services/billing/`](../../../tests/unit/services/billing/)).

- **Policy:** provider action → 1; native control-flow → 0; `native:http_request` → billable; manual/schedule trigger → 0.
- **Estimator:** sum over billable nodes; branch range (min/max); schedule → monthly; event-driven → `triggerVolumeUnknown`; polling warning; plan-limit check; bulk → base + per-item.
- **Trigger billing:** webhook receipt not billed; trigger event bills only via the run's actions; empty poll → internal event, **no** user charge; deduped/filtered events never bill.
- **Success vs failure:** successful action billed; failed/rate-limited/missing-variable/config-failure **not** billed (post-exec reconciliation).
- **Test mode:** test/dry-run → **0** (regression-guard the current bug).
- **Partial run:** actual cost = successful billable steps only.
- **AI cost events:** written with correct feature/model/outcome; **no secrets/payloads** asserted absent.
- **Owner analytics:** aggregation correctness; redaction (no PII) enforced.
- **Plan-limit enforcement:** gate still blocks when over limit (regression around `executionBillingGate` + `deduct_tasks_if_available`).
- **Idempotency:** ledger UNIQUE constraint prevents double-charge on retry/replay.
- **Regression:** existing gate + repo tests stay green; the flat-gate guard behavior is preserved where it's still the guard.

---

## 14. Recommended implementation slices

Each independently shippable, behind a flag where it changes runtime behavior, reusing existing services.

| Slice | Deliverable | Depends on |
|---|---|---|
| **COST-1** | This audit + plan (doc-only). | — |
| **COST-2** | `taskCostPolicy.ts` + `workflowCostEstimator.ts` (pure, default policy from existing metadata signals). No runtime billing change. | COST-1 |
| **COST-3** | `taskUsageRecorder.ts` + `task_usage_events` ledger + per-run/per-node actuals; shift engine from flat pre-deduct to **reserve → reconcile** (flag-gated). **Includes the test-run-not-charged fix.** | COST-2 |
| **COST-4** | Optional `taskCost?` override slot on ActionMeta/TriggerMeta — **only if** the default policy proves insufficient (bulk/file-heavy). | COST-2 |
| **COST-5** | Workflow preview cost display + API (`/preview-cost`-style) calling the estimator; plan-limit warning UI. | COST-2 |
| **COST-6** | `ai_cost_events` + `aiCostEvents.ts` recorder + AI-feature wiring (credits). | COST-2 |
| **COST-7** | Owner/admin analytics queries (`services/analytics/*`) + dashboard. | COST-3, COST-6 |
| **COST-8** | Template cost-estimation hooks (reuse estimator) — lands with the template track. | COST-2, template slices |

**Relationship to the AI track:**
- **COST-1 happens now** (this slice). It does not block 4.AI-2 (read-only context tools), which may continue.
- **4.AI-3 (`WorkflowPatch` validator) is not "done" until it can call the deterministic `workflowCostEstimator` — or at minimum ships a planned, named hook for it.** The AI must show estimated task cost before apply/run and must never guess. Add this to the AI-3 acceptance criteria.
- **4.AI owner observability** (the AI-1 sibling dashboard doc, commit `f9b1fefdd`) should read from the COST-6 `ai_cost_events` model rather than inventing its own.
- Suggested sequencing: COST-2 can land in parallel with AI-2; COST-3 before AI-6 (apply) so applied/run workflows reconcile real cost; COST-5 before or with AI-5 (preview) so the patch preview can show cost.

---

## 15. Acceptance criteria

This audit/plan is accepted only if it:

- [x] States what current billing actually does — §1 (flat 1 task/run, pre-deducted, evidence-cited).
- [x] Identifies whether provider/native metadata has cost awareness — §2 (it does not; existing signals catalogued).
- [x] Recommends a clear user-facing task model — §11 (simple tasks; AI credits separate).
- [x] Recommends detailed internal cost accounting — §10, §12 (ledger + per-run/per-node + policy version).
- [x] Covers actions / triggers / native nodes / AI / templates — §3–§7.
- [x] Includes workflow preview / activation estimates — §8.
- [x] Includes owner/admin analytics — §9.
- [x] Avoids fake cost numbers without product decision — proposals labeled; numbers in §14 open decisions.
- [x] Proposes a phased implementation plan — §14.
- [x] Does not require editing every provider ActionMeta manually — §2, §10 (central default policy).
- [x] Documents gaps honestly — §1.3, §5 (test-run charge bug, no ledger, pre-deduct vs per-success).

### Open decisions for Marcus

1. **Charge timing:** move to reserve→reconcile (recommended) vs keep flat pre-deduct + only fix test runs? (§5)
2. **Confirm the baseline numbers** in §11 (provider action = 1, `http_request` = 1, native control-flow = 0, delay = 0).
3. **AI: credits vs tasks** — confirm AI usage is a *separate credit ledger* (recommended) not workflow tasks. (§6)
4. **Plans/tiers:** V2 has only `tasks_limit` (default 100) and no plan table. When do tiers/Stripe land, and should COST-3 assume them? (§1, §4)
5. **Per-node usage storage:** separate ledger + denormalized caches (recommended) vs jsonb augmentation. (§12)
6. **Test-run fix urgency:** ship the "don't charge test runs" fix standalone (small, high-trust) ahead of COST-3, or bundle it? (§5)
7. **`taskCost?` override slot:** add proactively in COST-4, or defer until a bulk/file-heavy node actually needs it? (§2)
8. **Retention** for ledgers/analytics (task_usage_events, ai_cost_events) and matview refresh cadence. (§12)
9. **Internal poll cost events:** worth the write volume for margin analytics, or sample/aggregate instead? (§4)

---

## Appendix A — V2 rules this plan respects (`docs/rules/`)
- [project-structure-and-module-boundaries.md](../../rules/project-structure-and-module-boundaries.md) — pure policy/estimator logically `core/`, lint-housed in `services/billing/` per the existing gate precedent; no provider-specific cost logic.
- [database-security.md](../../rules/database-security.md) — new ledgers/analytics get RLS + explicit GRANTs + tenant isolation; ids/counts/amounts only, no secrets/PII.
- [provider-registry.md](../../rules/provider-registry.md) — cost defaults derive from the discovery registry's metadata; the policy never enumerates capabilities it didn't read.
- [testing-strategy.md](../../rules/testing-strategy.md) — good/bad paths, regression protection around the existing gate, deterministic-estimator coverage.
- [workflow-lifecycle.md](../../rules/workflow-lifecycle.md) — estimates available at design/activation time; charges reconcile at run finalization, not at edit time.
- [webhook-receipt-routes.md](../../rules/webhook-receipt-routes.md) — receipt/dedup/filter stay pre-enqueue and free; billing remains an engine concern.
