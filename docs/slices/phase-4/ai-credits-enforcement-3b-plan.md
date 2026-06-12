# 4.AI-CREDITS-3b — First Live AI-Credit Gate Wiring Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified — every file below was read in full unless noted):**
[services/billing/aiCreditGate.ts](../../../services/billing/aiCreditGate.ts) (the gate, AI-CREDITS-3) ·
[core/billing/aiCreditPolicy.ts](../../../core/billing/aiCreditPolicy.ts) (`computeAiCreditCharge`, feature→credits map) ·
[services/billing/billingFeatureFlags.ts](../../../services/billing/billingFeatureFlags.ts) (`isAiCreditEnforcementEnabled`, default OFF) ·
[repositories/accountBillingAiCredits.ts](../../../repositories/accountBillingAiCredits.ts) (`deductAiCredits`, `getAiCreditUsage`) ·
[services/billing/executionBillingGate.ts](../../../services/billing/executionBillingGate.ts) (the task-gate precedent) ·
[services/ai/events/recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts) (`recordAiPlanOutcome`, recording-only) ·
[app/api/workflows/[id]/ai/plan/route.ts](../../../app/api/workflows/%5Bid%5D/ai/plan/route.ts) (the live plan route) ·
[services/ai/planner/planWorkflowFromPrompt.ts](../../../services/ai/planner/planWorkflowFromPrompt.ts) (`planWorkflowFromPromptForAI` — paid model call at L246) ·
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`requireUser`, `requireUserWithAccount`→`resolveActiveAccount`, `parseJsonBody`) ·
[lib/api/ai.ts](../../../lib/api/ai.ts) (`planWorkflow`, `postStructured`, `AiApiError`, `AiPlanFailure`) ·
[features/workflow-builder/hooks/useBuilderAi.ts](../../../features/workflow-builder/hooks/useBuilderAi.ts) (`plan` / `submitFollowUp` / `friendlyError`) ·
[features/workflow-builder/panels/BuilderAiPanel.tsx](../../../features/workflow-builder/panels/BuilderAiPanel.tsx) (chat rendering of plan / error) ·
[docs/slices/phase-4/ai-credits-enforcement-plan.md](./ai-credits-enforcement-plan.md) (parent AI-CREDITS-3 plan)

> **Read but not in full:** the apply route's failure-status convention
> ([app/api/workflows/[id]/ai/apply/route.ts](../../../app/api/workflows/%5Bid%5D/ai/apply/route.ts)) was inspected via grep
> only — it maps `CONFIRMATION_REQUIRED`→428, `STALE_PATCH`→409 with a typed `code`
> body, cited here as the "distinct status + typed code per handled outcome"
> precedent. `services/accounts/ensurePersonalAccount` is referenced via its
> call site in the plan route (L147), not read.

---

## 1. Context

AI-CREDITS-3 (commit `33ac4247c`, migration applied to dev) shipped the enforcement
**infra**: the `account_billing` AI columns + `deduct_ai_credits_if_available` RPC,
`repositories/accountBillingAiCredits.deductAiCredits`, the pure `aiCreditGate`
service, `PlanLimits.aiCreditsMonthlyLimit`, and the `ENABLE_AI_CREDIT_ENFORCEMENT`
flag (default OFF). The parent plan
([ai-credits-enforcement-plan.md](./ai-credits-enforcement-plan.md) §11) explicitly
deferred **route wiring** to "AI-CREDITS-3b" and reserve/reconcile + the deep-loop
cap to AI-CREDITS-4.

This slice plans **3b**: the smallest live wiring that proves the gate actually gates
a paid LLM call end-to-end, behind the flag, with **zero behavior change while the
flag is OFF** (which it stays in prod). It deliberately touches **no** repair loop, no
deep-agent loop (neither exists yet as an LLM call), and no reserve/reconcile.

---

## 2. Current codebase findings (verified)

### 2.1 The gate is ready and fail-closed
[aiCreditGate.ts](../../../services/billing/aiCreditGate.ts) takes
`{ accountId, feature, plannedTier?, escalated?, testMode? }` and returns a
discriminated `AiCreditGateOutcome`. Order (L66–L113): flag-OFF →
`skipped:enforcement_disabled` (no DB, no charge) → frozen → `account_frozen` →
test-mode → `skipped:test_mode` → compute charge via `computeAiCreditCharge` →
`charge<=0` → `skipped:zero_credit` → `deductAiCredits` (RPC throw is **caught** →
`gate_error`, so a paid call can never proceed unmetered). **It is not called by any
route today** (confirmed: only `services/billing/aiCreditGate.ts` and its test
reference it).

### 2.2 The live paid planner path
`POST /api/workflows/[id]/ai/plan`
([plan/route.ts](../../../app/api/workflows/%5Bid%5D/ai/plan/route.ts)) is the V2
canonical builder planner entry (AI-9A). Flow today:
1. `requireUser()` → `userId` only (L111).
2. validate body (`prompt`, optional `modelTier`, `currentGraph`, `interactionKind`).
3. `planWorkflowFromPromptForAI({ userId, workflowId, prompt, modelTier?, currentGraph? })`
   (L124) — **this is the paid call**; the model request is issued inside the planner
   at [planWorkflowFromPrompt.ts:246](../../../services/ai/planner/planWorkflowFromPrompt.ts)
   (`client.generateStructuredJson(request)`).
4. **After** the planner returns, the route resolves the cost-owner account via
   `ensurePersonalAccount(auth.userId)` (L147) and calls `recordAiPlanOutcome` —
   fire-and-forget, fail-open telemetry into `ai_cost_events` (L145–L159).
5. status mapping: 503 `MODEL_FAILED`, 502 parse/preview, 404 not-found, 200 success.

**Key observation:** the route already resolves the same account the gate needs, but
does it *after* the model call (only for recording). The planner service
(`planWorkflowFromPromptForAI`) has **no** account/billing concept — it is pure,
model-client-injected, and documented as "NEVER mutates / NEVER persists." Threading
billing into it would violate that contract.

### 2.3 Recording is a SEPARATE ledger from the gate
[recordAiRouteEvents.ts](../../../services/ai/events/recordAiRouteEvents.ts)
`modelCallBilling` (L88) computes `aiCreditsCharged` via the **same**
`computeAiCreditCharge` and writes it to `ai_cost_events.ai_credits_charged` — but
this is **telemetry only**; it does **not** touch `account_billing.ai_credits_used`.
The **only** writer of `ai_credits_used` is the gate's `deduct_ai_credits_if_available`
RPC. So gate (enforcement ledger) and recorder (cost telemetry) are two independent
sinks → **there is structurally no double-charge** between them. The planner also
records a **distinct** classifier sub-call event (`provider_discovery`, L133) when the
AI-34C narrowing classifier ran — telemetry only, not deducted.

### 2.4 Account resolution: two helpers, one inconsistency
- The recorder uses `ensurePersonalAccount(auth.userId)` → the actor's **personal**
  account, always.
- The canonical workflow-route resolver is `requireUserWithAccount()` →
  `resolveActiveAccount` ([_shared.ts:99](../../../app/api/workflows/_shared.ts))
  (precedence: explicit → `active_account_id` → personal fallback), and TW-1 routes
  authorize against the **workflow's own** `accountId`
  (`loadWorkflowForMember`, L181).

So "which account owns AI cost" is **already ambiguous** in the codebase: telemetry
bills personal; workflow ownership/grounding is account-scoped (the planner's
`buildWorkflowPlanRequestWithAttribution` is TW-4-scoped to the workflow's account).
This matters for team pooling (Q4 below).

### 2.5 Client + panel failure handling (decides what the user sees)
- [lib/api/ai.ts](../../../lib/api/ai.ts) `planWorkflow`→`postStructured` (L238):
  if the response body has an `ok` boolean → **returns it** as `AiPlanResult` (any
  HTTP status); otherwise **throws** `AiApiError(message, status)`. `AiPlanFailure.code`
  is currently typed `MODEL_FAILED | PARSE_FAILED | PREVIEW_UNAVAILABLE`.
- [useBuilderAi.ts](../../../features/workflow-builder/hooks/useBuilderAi.ts):
  `plan()` (L160) returns a structured `ok:false` result to the panel; on a throw it
  sets `error` via `friendlyError` (L127, special-cases only 401/404) and returns
  `null`. `submitFollowUp()` collapses **any** `!result.ok` to `return null` (L328).
- [BuilderAiPanel.tsx](../../../features/workflow-builder/panels/BuilderAiPanel.tsx):
  a `null` result renders a **hardcoded** "The AI assistant is unavailable right now"
  bubble (L296); a non-null `ok:false` result renders as a `plan_result` message
  showing `result.message` (L311–L322).

**Net:** the panel will **safely** handle a credit denial today (no crash, graceful
message), but will **not** show a credit-*specific* message without a small UI touch.
See Q6.

---

## 3. Product / model decision

**What 3b is:** wire `aiCreditGate` into the `POST /api/workflows/[id]/ai/plan`
route, **before** `planWorkflowFromPromptForAI`, gating the `workflow_creation`
feature (the builder planner — a real paid LLM call). Flag-OFF = today's behavior,
exactly. Flag-ON + insufficient credits = the planner is **not** called and the route
returns a typed, no-leak denial.

**What 3b is deliberately NOT:**
- Not gating the **deterministic** diagnosis route (`/ai/diagnose`) — it is 0-credit,
  read-only, and must stay free + ungated (Q9).
- Not gating **apply** (`/ai/apply`) — it is deterministic (no model call;
  `recordAiApplyOutcome` records `workflow_editing` with **no** model event,
  [recordAiRouteEvents.ts:429](../../../services/ai/events/recordAiRouteEvents.ts)).
- Not gating repair / deep loops — neither is an LLM call yet.
- No reserve/reconcile, no `ai_credit_reservations` ledger, no migration, no pricing.
- No second gate on the classifier sub-call (Q7).

**Account model anchor:** AI credits pool per `account_billing` row (account-scoped),
consistent with the V2 account-owned model. The team-pool question is the one real
open decision (Q4).

---

## 4. Recommended approach

### 4.1 Placement — route shell, before the planner call (Q2)
Place the gate in the **plan route handler**, immediately before
`planWorkflowFromPromptForAI`. Rejected alternatives in §5.

The route is the correct chokepoint because:
- It already owns auth + account resolution (it resolves the account for recording).
- It calls the planner; the model call is strictly **downstream**, so gating here is
  "before the paid LLM call" (the user's stated preference) without coupling the
  **pure** planner service to billing.
- It keeps `planWorkflowFromPromptForAI` injected + testable with zero billing deps.

The user's option list named "AI service before the model call" as the preferred
layer. In this codebase the planner *service* is intentionally pure and the route *is*
the thin service shell for this feature — so the route-shell placement **is** the
"service-level, before the paid call, not in the recorder" intent. We do **not** push
the gate into `planWorkflowFromPrompt.ts` (that would force `accountId` + a billing
import into a deliberately pure module). When a *second* paid route needs gating
(explanation/repair), extract a shared `withAiCreditGate(...)` route helper then —
**not** now (YAGNI; one call site).

### 4.2 Proposed route shape (described, not built)
```
POST /api/workflows/[id]/ai/plan:
  auth = requireUser()                         // unchanged
  validate body                                // unchanged
  account = ensurePersonalAccount(userId)      // MOVED earlier; reused by gate + recorder
  gate = await aiCreditGate({
           accountId: account.id,
           feature: "workflow_creation",
           plannedTier: body.modelTier ?? "fast",
         })
  if (!gate.ok) return creditDenialResponse(gate)   // 402; planner NOT called
  // gate.ok (incl. skipped:* ) → proceed exactly as today
  result = await planWorkflowFromPromptForAI({...})  // the paid call
  recordAiPlanOutcome({ accountId: account.id, ... }, result)   // unchanged, reuses account
  ... existing status mapping ...
```
- `account` is resolved **once** and used by **both** gate and recorder → the gate
  charges the **same** account the telemetry attributes to (no skew).
- `ensurePersonalAccount` already runs in the route today (for recording); moving it
  before the planner adds **zero** new DB calls on the happy path.
- Resolving the account can throw — wrap it so a resolution failure does **not** 500
  the whole route when the flag is OFF (fail-open to "proceed" when enforcement is
  disabled; fail-closed to a 503 only when ON — see Q5/Q8 fail policy).

### 4.3 Denial response (Q6) — structured `ok:false`, HTTP 402
Return a body that **carries an `ok` flag** so `postStructured` treats it as a handled
result (not a transport throw), shaped to match `AiPlanFailure`:
```json
{ "ok": false, "code": "AI_CREDITS_EXHAUSTED",
  "message": "You've used all your AI credits for this billing period.",
  "errors": [{ "stage": "billing", "code": "AI_CREDITS_EXHAUSTED",
               "message": "..." }] }
```
- **HTTP 402 Payment Required** for `insufficient_ai_credits` (semantically "quota /
  upgrade"). For `account_frozen` reuse the existing **403 `ACCOUNT_PENDING_DELETION`**
  shape (matches `_shared.ts`). For `gate_error` while ON → **503** (fail-closed, AI
  temporarily unavailable — same family as `MODEL_FAILED`).
- **No leak:** body carries only the typed code + a fixed sentence (+ optionally
  `used`/`limit` integers, which a member can already read via `getAiCreditUsage`).
  No token/email/provider/account-id/raw error.
- With the structured `ok:false` body, a **fresh** plan renders the message in the chat
  bubble via the existing `plan_result` path (`result.message`). A small client touch
  makes it specific + handles the follow-up path (see Q6 / 3b-ii).

### 4.4 Charge alignment (Q7)
Gate charge = `computeAiCreditCharge({feature:"workflow_creation", isLlmCall:true,
modelTier: plannedTier})` = base `2` × tier multiplier. The recorder computes the
same function with the **actual** `model.tier`. When `plannedTier` == actual tier
(the normal planner path — the route's `modelTier` flows straight into the planner
routing), gate and recorded charge are **identical**. The classifier sub-call is
**not** separately gated (Q7) — its 1 telemetry credit is observability only and is
not deducted; accepted for deduct-only v1.

---

## 5. Alternatives considered

| Placement | Before paid call? | Couples pure planner? | Reusable across routes | Verdict |
|---|---|---|---|---|
| **Route shell, before planner (chosen)** | Yes | No | Per-route (extract helper later) | **Accept** — smallest, safe, planner stays pure |
| Inside `planWorkflowFromPromptForAI` | Yes | **Yes** — needs `accountId` + billing import in a pure, injected service | Only planner | Reject — violates planner purity contract (§2.2) |
| Model-client wrapper (`createPlannerModelClient`) | Yes | Indirectly | All model calls | Reject — wrapper has no account/feature/workflow context; over-broad for a single-feature proof |
| Event recorder (`recordAiPlanOutcome`) | **No** — runs *after* the call | No | All recorded routes | Reject — gating after the paid call defeats the purpose (explicitly excluded by the task) |

| Denial wire shape | Client behavior today | Verdict |
|---|---|---|
| **Structured `ok:false` + 402 (chosen)** | `postStructured` returns it; fresh-plan path renders `message` | **Accept** — graceful now, specific with a tiny touch |
| Transport error (no `ok`) + 402 | `postStructured` throws `AiApiError`; `friendlyError` lacks a 402 case → generic "unavailable" bubble | Reject — strictly worse UX, needs the same client touch anyway |

---

## 6. Security / data model

- **No schema change.** 3b is wiring only — the AI columns + RPC already exist
  (AI-CREDITS-3, applied to dev). **No migration, no `db:push`** (Q12).
- **No-leak denial:** typed code + fixed copy (+ optional integers the member can
  already see). Mirrors the no-leak posture of `workflowNotFoundResponse` /
  `ACCOUNT_PENDING_DELETION` in `_shared.ts`.
- **Cost-owner resolved server-side**, never client-supplied (the `accountId` comes
  from `ensurePersonalAccount(userId)`, not the request body) — same rule the gate's
  own JSDoc states.
- **Atomic + service-role:** all deduction stays inside the existing SECURITY DEFINER
  RPC via the service-role repo; the route never touches `account_billing` directly.
- **Frozen account** is refused first (the gate already checks
  `isAccountFrozen` before any charge).

---

## 7. API / service / UI expectations

**Route (`/ai/plan`):** new pre-planner gate; new 402 `AI_CREDITS_EXHAUSTED` handled
outcome; 403 reuse for frozen; 503 for `gate_error` (ON only). All other statuses
unchanged. **When flag OFF: byte-identical to today** (gate returns
`skipped:enforcement_disabled` before any DB touch).

**Client (`lib/api/ai.ts`):** add `AI_CREDITS_EXHAUSTED` to the documented
`AiPlanFailure.code` union (additive doc/type change; `postStructured` already returns
any `ok:false` body).

**Panel/hook (optional 3b-ii, small):** extend `friendlyError` to map 402 → a
credit-specific sentence, and surface a credit-specific bubble on the `result===null`
follow-up path. **No redesign** — copy + one mapping. If 3b ships backend-only first,
the panel already degrades gracefully (generic "try again" bubble, no crash).

**No fake UI:** no balance meter, no upgrade CTA wiring in this slice (those depend on
pricing/checkout, out of scope). Only the denial message.

---

## 8. Tests required (Q10)

Route tests (extend
[tests/unit/app/api/workflows/ai-plan-route.test.ts](../../../tests/unit/app/api/workflows/ai-plan-route.test.ts)):
1. **Flag OFF → no-op:** planner called, response identical to today; gate writes
   nothing (assert `deductAiCredits` not invoked / gate short-circuits).
2. **Flag ON + sufficient credits → planner proceeds**, 200, normal body; one gate
   deduction recorded.
3. **Flag ON + insufficient → planner NOT called** (assert
   `planWorkflowFromPromptForAI` mock never invoked), 402 `AI_CREDITS_EXHAUSTED`,
   no-leak body.
4. **Flag ON + `gate_error` (RPC throws) → planner NOT called**, 503, fail-closed.
5. **Flag ON + frozen → planner NOT called**, 403 `ACCOUNT_PENDING_DELETION`.
6. **No double-charge:** exactly one deduction per user-initiated plan; classifier
   sub-call does not add a second deduction.
7. **Recorder still runs after a successful gated call** (telemetry path intact); on
   denial the planner-outcome recorder is **not** expected to run (no model call).
8. **Account parity:** gate + recorder receive the **same** `accountId`.

Gate tests already cover the outcomes
([tests/unit/services/billing/aiCreditGate.test.ts](../../../tests/unit/services/billing/aiCreditGate.test.ts),
47 passing as of `33ac4247c`) — no new gate-unit work needed.

Client/panel tests (if 3b-ii ships): `friendlyError` 402 mapping; panel renders the
credit message on both fresh-plan and follow-up denial.

---

## 9. Implementation slice breakdown

- **3b-i (backend wiring, flag-OFF) — the core proof.** Move account resolution
  before the planner; insert `aiCreditGate` call; add the 402/403/503 denial mapping;
  route tests 1–8. Ships behind `ENABLE_AI_CREDIT_ENFORCEMENT` (OFF). No migration, no
  client change strictly required (panel degrades gracefully). **This alone satisfies
  "prove the gate works."**
- **3b-ii (client message polish) — small, optional, same arc.** Add
  `AI_CREDITS_EXHAUSTED` to `AiPlanFailure.code`; map 402 in `friendlyError`; surface
  the specific bubble on the follow-up `null` path. Client/panel tests.
- **(Deferred, not 3b)** dev-only enablement + dev-DB verification (§13);
  AI-CREDITS-4 reserve/reconcile + reservation ledger + deep-loop cap; the team-pool
  account decision (Q4 / OQ-A); any pricing flip.

---

## 10. Risks / open questions (owner decisions)

- **OQ-A — which account owns AI cost (Q4).** Today the recorder bills the actor's
  **personal** account (`ensurePersonalAccount`); for a **team** workflow that means
  each member draws from their **own** pool, not the team pool — even though the
  workflow is account-owned and grounding is TW-4-scoped to the workflow's account.
  *Recommendation:* for 3b keep **parity with the existing recorder** (personal
  account) so gate == telemetry and we change nothing about AI-CREDITS-2 attribution.
  Treat "switch AI cost to the workflow's owning / active account (team pooling)" as a
  dedicated follow-up, because it also moves AI-CREDITS-2 recording. **Decide before
  enabling the flag for any team account.**
- **OQ-B — HTTP status for the denial.** *Recommendation:* **402** (quota/payment).
  Alternative: **403** (the codebase uses 403 for `account_frozen`/`NOT_ACCOUNT_MEMBER`
  and never returns 402 elsewhere today). 402 is more semantically precise; 403 is more
  consistent with current account-state denials. Owner's call.
- **OQ-C — record a denial event?** When the gate denies, no model call happens, so
  there is nothing in `ai_cost_events` to attribute. *Recommendation:* skip recording
  in v1 (keep it minimal); optionally add a lightweight `ai_interaction_started` +
  denial marker later if the funnel needs "attempted-but-blocked" counts.
- **OQ-D — escalation drift (Q8).** No planner path escalates today (`escalated` is
  wired but unused; routing returns a single tier). *Recommendation:* deduct the
  **planned-tier** charge; accept bounded under-count if a future path escalates
  mid-call; the exact fix is reserve/reconcile (AI-CREDITS-4), **not** 3b. Do **not**
  pre-emptively over-charge.
- **OQ-E — deterministic-check abuse.** The 0-credit `/ai/diagnose` stays ungated;
  abuse is a **rate-limit** concern, not a credit one (carried from parent OQ-3). Not
  in 3b.

---

## 11. Acceptance criteria

**This planning slice:** this doc exists under `docs/slices/phase-4/`, every
current-state claim ties to a read file, no source/test/migration/UI changed, nothing
pushed.

**The 3b implementation must later meet:** flag-OFF leaves `/ai/plan` byte-identical;
flag-ON denies before the paid call with a typed no-leak 402; gate + recorder bill the
same account; exactly one deduction per plan; the planner is provably not invoked on
denial; no migration / `db:push` introduced; the panel does not crash on a denial.

---

## 12. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, RPCs, schema, or UI were written or changed. No
`db:push`, no deploy, no PR, no push. No pricing change. No repair/deep-loop work. No
Hermes wiring. No change to OAuth/reconnect/disconnect/team-credential/
private-connection-sharing. The flag stays **OFF**.

---

## 13. Recommended next step

On approval, implement **3b-i** (Q9): the backend route wiring + denial mapping +
route tests, behind `ENABLE_AI_CREDIT_ENFORCEMENT` (OFF), **no migration**. Resolve
**OQ-A (account owner)** and **OQ-B (status code)** before enabling the flag in dev;
3b-ii (client message) follows in the same arc. Reserve/reconcile + deep-loop cap stay
in AI-CREDITS-4.
