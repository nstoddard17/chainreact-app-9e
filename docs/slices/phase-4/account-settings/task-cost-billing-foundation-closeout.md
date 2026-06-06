# Phase 4 — Billing/Tasks Foundation Closeout + Next-Step Roadmap

**Slice:** 4.COST-8
**Type:** Doc-only closeout. **No runtime / source / test / migration files modified.**
**Date:** 2026-05-25
**Branch:** `v2-ai-architecture-planning`
**HEAD at authoring:** `de391f62a` (COST-7 — owner/admin task + AI analytics service layer)
**Companion doc:** [`task-cost-billing-model-audit.md`](../task-cost-billing-model-audit.md) (the COST-1 audit + per-slice implementation notes this closeout summarizes)

> Purpose: a single honest snapshot of the billing/tasks foundation built across COST-1 → COST-7 — what shipped, what is still ledger-only, what is safe to use now, what remains future, the decisions Marcus must make before any live-billing change, and how this substrate supports AI, templates, and future custom providers/nodes. **Nothing here changes runtime behavior.**

---

## 1. Final status

- **The billing/tasks foundation is in place.** Estimation, preview, ledgers, cost provenance, and owner analytics services all exist and are reusable.
- **Live billing is still flat 1 task/run** for real runs — unchanged from Slice 1N (pre-execution deduct via the billing gate + `deduct_tasks_if_available` RPC).
- **Test/dry-run executions no longer bill** (COST-2A) — the one intentional live-billing change in this arc.
- **Actual per-node usage is recorded in the ledger in parallel** (COST-3) — for auditability, NOT for charging.
- **Workflow cost estimation + read-only preview are available** (COST-2, COST-5).
- **AI cost/observability event foundation exists** (COST-6) — a separate ledger, "AI credits" as a distinct unit.
- **Owner/admin analytics service layer exists** (COST-7) — backend services only.
- **No owner dashboard UI exists yet.**
- **No reserve/reconcile live-billing switch has happened** — the ledger does not drive user billing.

One line: *the system can now measure, estimate, preview, and analyze task + AI cost deterministically, while live billing remains the deliberately-simple flat gate (minus the test-run fix).*

---

## 2. Completed slices

| Slice | Commit | What it shipped |
|---|---|---|
| **COST-1** | `6e67f1482` | Audit + V2 plan (doc-only). Identified flat pre-deduct 1/run billing; the absence of any per-node ledger, cost preview, or AI cost model; and the architectural shift needed for richer accounting. |
| **COST-2A** | `1753f2cb2` | Narrow safety fix: test/dry-run runs no longer deduct tasks (`executionBillingGate` `{ testMode }` → skipped outcome). Real runs unchanged. |
| **COST-2** | — | Central deterministic task cost policy + workflow cost estimator (pure, read-only; nothing enforces them). |
| **COST-3** | `3821fa0ba` | `task_usage_events` ledger + per-run estimate/actual recording (ledger-only, parallel) + `workflow_runs` estimated/actual cost columns. Live billing still flat 1/run. |
| **COST-4** | `1d5743420` | Central cost-override map in `taskCostPolicy.ts` (no ActionMeta/TriggerMeta edits) + cost `source` provenance threaded through estimator + ledger. |
| **COST-5** | `3200844f8` | Read-only workflow cost preview service + `GET /api/workflows/[id]/cost-preview`. Reuses the COST-2 estimator; no billing change, no ledger writes. |
| **COST-6** | `04a79c89f` | `ai_cost_events` observability ledger + recorder service. Separate from `task_usage_events`; AI credits as a distinct unit. No AI behavior, no model calls. |
| **COST-7** | `de391f62a` | Owner/admin task + AI analytics service layer over the two ledgers. Backend-only; no routes, no UI. |

Reference files:
- Policy: [`services/billing/taskCostPolicy.ts`](../../../../services/billing/taskCostPolicy.ts)
- Estimator: [`services/billing/workflowCostEstimator.ts`](../../../../services/billing/workflowCostEstimator.ts)
- Recorder: [`services/billing/taskUsageRecorder.ts`](../../../../services/billing/taskUsageRecorder.ts)
- Preview: [`services/billing/workflowCostPreview.ts`](../../../../services/billing/workflowCostPreview.ts) + [`app/api/workflows/[id]/cost-preview/route.ts`](../../../../app/api/workflows/[id]/cost-preview/route.ts)
- AI ledger: [`repositories/aiCostEvents.ts`](../../../../repositories/aiCostEvents.ts) + [`services/billing/aiCostEvents.ts`](../../../../services/billing/aiCostEvents.ts)
- Task ledger: [`repositories/taskUsageEvents.ts`](../../../../repositories/taskUsageEvents.ts)
- Analytics: [`services/analytics/taskUsageStats.ts`](../../../../services/analytics/taskUsageStats.ts) + [`services/analytics/ownerAiStats.ts`](../../../../services/analytics/ownerAiStats.ts)
- Gate: [`services/billing/executionBillingGate.ts`](../../../../services/billing/executionBillingGate.ts)

---

## 3. Current live billing behavior

Documented honestly — this is what actually happens at runtime today:

- **Real workflow runs still deduct a flat 1 task at run start** (pre-execution gate, Slice 1N). The deduction is atomic + race-safe via the `deduct_tasks_if_available` RPC.
- **Test / dry-run runs do NOT deduct** (COST-2A). The engine passes the test flag; the gate returns a skipped outcome.
- **The ledger records actual successful billable nodes in parallel** (COST-3), but **the ledger does not drive user billing.** It is auditability only.
- **No reserve/reconcile model is active.** There is no mid-run hold, no post-run true-up against actuals.
- **Failed / skipped / non-billable nodes are not recorded as billable actual usage** under the current policy — only successful billable action nodes produce a `node_task_charged` ledger row. (A `run_estimate_recorded` row captures the estimate vs actual rollup.)
- **AI usage does not touch the task gate at all** — it is a separate ledger with its own unit.

Net: a user is charged exactly 1 task per real run regardless of how many nodes run, and 0 for test runs. Everything richer is measured but not enforced.

---

## 4. Current task cost policy

The accepted default policy (`TASK_COST_POLICY_VERSION = "v1"`), classified purely from `(node, meta?)` with no I/O:

| Node / event | Cost | Reason enum | Source |
|---|---|---|---|
| Grounded provider action (registered `meta` present) | **1 task** (billable on success) | `provider_action` | `default_policy` |
| `native:http_request` (real external egress) | **1 task** | `native_external_egress` | `override` (central map) |
| Native control-flow / transform / delay (`if_then_condition`, `router`, `delay`, `format_transformer`) | **0** | `native_control_flow` | `default_policy` |
| Any trigger node | **0** | `trigger` | `default_policy` |
| Unknown / unregistered / ungrounded node | **0** + warning | `unknown_node` | `default_policy` |
| AI operations | not a workflow task | — | separate ledger (COST-6) |

Key properties:
- **Policy version** `v1` is stamped on every estimate + ledger row + per-run column, so a run costed under `v1` stays attributable when the policy later moves to `v2`.
- **`default_policy` vs `override`:** all category costs come from defaults; the **single** override map ([`taskCostPolicy.ts`](../../../../services/billing/taskCostPolicy.ts)) holds exactly one entry today (`native:http_request`). New non-default costs are introduced by adding a reviewable map entry — never by editing per-provider metadata.
- **`future_metadata_override`** is a reserved `source` value for an optional `taskCost` slot on ActionMeta/TriggerMeta (COST-4 hook) — declared, unused.
- **`perItemTasks`** is reserved on the cost shape for bulk/loop nodes (`base + perItem × itemCount`) but is **not active** — V2 has no bulk/loop node yet, so nothing emits or consumes it.
- **Grounding guarantee:** a provider node is billable only when the discovery registry supplied its `meta`. An ungrounded provider node is `unknown_node` (0 + warning), never silently charged — the policy is structurally unable to bill an invented node.

---

## 5. Estimation and preview

- **`estimateWorkflowTaskCost(definition)`** ([`workflowCostEstimator.ts`](../../../../services/billing/workflowCostEstimator.ts)) — deterministic, pure, side-effect free. Sums billable node base cost into `estimatedTasksPerRun`.
- **`getWorkflowCostPreview({ workflowId, userId })`** ([`workflowCostPreview.ts`](../../../../services/billing/workflowCostPreview.ts)) — wraps the estimate in a user-safe shape + best-effort billing summary (remaining tasks, would-exceed flag).
- **`GET /api/workflows/[id]/cost-preview`** ([route](../../../../app/api/workflows/[id]/cost-preview/route.ts)) — the read surface for the Builder, future AI patch preview, and templates.

Honest caveats (all documented in code + warnings):
- **Read-only:** no billing, no ledger writes, no provider/AI calls, no workflow mutation.
- **No secret exposure:** built only from node identity + registry metadata; `node.config` is never read.
- **`estimatedTasksPerRun` is an upper bound** — it assumes all reachable nodes run. With branching (`router` / `if_then_condition` follow one path per run) the estimate carries a `BRANCHING_UPPER_BOUND` warning so consumers know actual cost may be lower.
- **Schedule → monthly estimates are deferred** — a scheduled trigger emits a `SCHEDULE_ESTIMATE_UNAVAILABLE` warning (no cron-frequency parser yet); event-driven triggers emit `EVENT_VOLUME_UNKNOWN`; ungrounded nodes emit `UNKNOWN_NODE_TYPE`.

---

## 6. Ledger and analytics

**Append-only ledgers** (RLS enabled + explicit GRANTs; no secrets, no raw payloads):
- **`task_usage_events`** — workflow-task usage. One `run_estimate_recorded` (estimate vs actual rollup) + one `node_task_charged` per successful billable node, per real run. Test runs write nothing. Reserved event types exist for a future reserve/reconcile + polling layer.
- **`ai_cost_events`** — AI cost/observability. Model calls, tokens, `estimated_cost_micros` (USD millionths), AI credits, latency, tool calls/failures, patch outcomes, safety blocks, feedback, template signals.
- **`workflow_runs`** denormalized columns: `estimated_task_cost`, `actual_task_cost`, `task_cost_policy_version` (O(1) per-run cost vs aggregating the ledger).

**Recorders** (write side):
- [`taskUsageRecorder.ts`](../../../../services/billing/taskUsageRecorder.ts) — pure `computeRunTaskUsage` (estimate + actuals from step results, never reads config) + `recordRunActuals` (ledger writer; never deducts).
- [`aiCostEvents.ts`](../../../../services/billing/aiCostEvents.ts) — `recordAiCostEvent` (+ typed wrappers); sanitizes metadata as defense in depth.

**Analytics** (read side, COST-7):
- [`taskUsageStats.ts`](../../../../services/analytics/taskUsageStats.ts) — overview, provider/node-type/workflow/user grouping, most-expensive ranking, per-user.
- [`ownerAiStats.ts`](../../../../services/analytics/ownerAiStats.ts) — usage overview, feature/model/tool grouping, latency (avg + p95), tool-failure, patch-outcome (+ acceptance rate), validation-failure, safety-block, feedback, template/custom-node signal counts.

Clarifications:
- Both ledgers are **append-only**; no secrets / raw payloads are ever stored (sanitized + redacted by construction).
- The owner/admin analytics services are **backend-only** — no admin routes, no UI yet.
- The async analytics reads are cross-user via **service-role (RLS-bypassing)** and are documented as OWNER/ADMIN-only; a future admin route must gate them.
- A future owner dashboard can consume these services directly with no schema change.

---

## 7. AI relationship

**AI implementation remains paused.** This doc does not recommend resuming it. But the billing/tasks foundation already provides everything a future AI layer needs for cost + trust observability:

- **Deterministic workflow cost estimates** (`estimateWorkflowTaskCost`) — the AI never guesses cost; it calls the same estimator.
- **A patch-validation cost hook** — the estimator + preview can be run against a candidate definition before apply.
- **An AI cost event ledger** (`ai_cost_events`) with its own "AI credits" unit, separate from workflow tasks.
- **Patch outcome event types** (proposed / validation_failed / previewed / applied / rejected) → acceptance-rate analytics.
- **Validation-failure analytics** — hallucination catches by error code.
- **Safety-block analytics** — deterministic-guard blocks by reason.
- **Owner observability** — per-feature/model/tool cost + latency + failure, ready for a dashboard.

---

## 8. Template relationship

**Templates do not exist yet.** The foundation supports them without a separate cost system:

- The **workflow definition estimator is reusable for templates** — a template is a `WorkflowDefinition`, so `estimateWorkflowTaskCost` already costs it.
- **`estimatedTasksPerRun`** gives a template a cost figure for ranking/display the moment templates land.
- **Template recommendation / instantiation AI events** (`ai_template_recommended`, `ai_template_instantiated`) already exist in the AI ledger.
- **Owner analytics already count template signals** (event types + presence-only `templateId` metadata).
- **No separate template cost system is needed** — templates flow through the same policy + estimator + preview + ledgers.

---

## 9. Custom providers/nodes relationship

**Custom providers/nodes do not exist yet.** They should be built — by design — to reuse this foundation, not a parallel path:

- Custom nodes should become **first-class, metadata-driven nodes** (ActionMeta/TriggerMeta-shaped), so the registry grounding works unchanged.
- The **central cost policy/override system** should classify custom nodes the same way — default category cost, or a central override entry / `future_metadata_override` slot for non-default cost.
- The **estimator should handle custom node definitions** once a custom registry exists (it already keys off `provider:type` + meta).
- The **ledger should record custom-node usage** through the same `task_usage_events` path — no side system.
- **AI analytics already count `customProviderId` / `customNodeId` metadata signals** (presence-only) — demand is measurable before the feature exists.
- **Owner analytics should eventually surface custom-node cost / failure / usage** through the same grouping functions.
- **Do not build future custom nodes as a separate billing path.**

---

## 10. Remaining decisions for Marcus

Open product/technical decisions that gate any live-billing change:

1. **When to switch from flat 1/run to per-successful-action billing?** (The ledger already measures the difference.)
2. **Should failed provider attempts ever bill?** (Today: no.)
3. **Should retries bill?** (Today: a retry is a new run → another flat 1.)
4. **Should polling have plan limits, or only internal cost tracking?**
5. **How should AI credits/tasks be priced** relative to workflow tasks?
6. **Should the owner dashboard come before reserve/reconcile**, or after?
7. **What admin-auth convention** should owner analytics routes use (the COST-7 services are gated on this)?
8. **Should task/cost data be shown to users in the Builder now or later?**
9. **Should cost preview become part of workflow activation gating** (block activation when one run would exceed remaining tasks)?
10. **How should templates show cost estimates** (per-run figure, range, monthly)?
11. **How should custom nodes define/override task cost** when that system is built (central map vs metadata slot)?

---

## 11. Recommended next implementation options

Presented as options — none mandatory unless Marcus chooses.

**Option A — Push the current branch now (stable checkpoint).**
Recommended if Marcus wants a clean checkpoint. Includes AI-1/2/3 (planning + read-only metadata/context + WorkflowPatch validator) and COST-1..7. AI remains paused after merge. Lowest risk; banks the foundation.

**Option B — COST-9: owner/admin analytics API route.**
Only after the admin-auth convention (decision #7) is chosen. Expose the COST-7 read-only owner stats behind that gate. No UI yet.

**Option C — COST-10: Builder cost chip / UI.**
Consume `GET /api/workflows/[id]/cost-preview`; show estimated tasks per run in the Builder. No billing behavior change. User-facing, low risk.

**Option D — COST-11: reserve/reconcile implementation plan.**
High-risk. Required before switching live billing from flat 1/run to per-successful-action. Should start as a **detailed design doc** (mid-run hold, partial-run true-up, insufficient-balance handling, idempotency, refund-on-failure) before any implementation.

**Option E — COST-12: live billing switch.**
Only after the COST-11 design + tests land. **Not recommended as the immediate next step** unless Marcus explicitly chooses it — it is the one change that alters what users are charged.

Suggested default: **Option A** (checkpoint) now; then C (visible value, no risk) and/or B (after admin-auth), with D's design doc preceding any move toward E.

---

## 12. Acceptance statement

- The billing/tasks foundation is **ready for a stable checkpoint.**
- Live billing remains **intentionally unchanged** except the test/dry-run skip (COST-2A).
- The system now has **deterministic estimation, read-only preview, append-only ledgers, cost provenance, and owner analytics services.**
- **AI implementation remains paused** until Marcus resumes it.
