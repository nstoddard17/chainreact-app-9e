# 4.AI-CREDITS-3b — First Live AI-Credit Gate Wiring Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12 · **Revised 2026-06-12** (owner decision: bill the
**workflow-owning account**, not the actor's personal account — see §3 / §4 / OQ-A).
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
[services/ai/planner/buildWorkflowPlanRequest.ts](../../../services/ai/planner/buildWorkflowPlanRequest.ts) (TW-4 account-scoped grounding, pre-call) ·
[services/ai/tools/workflowContext.ts](../../../services/ai/tools/workflowContext.ts) (`getWorkflowGraphForAI` — `getById`+`isMember` ownership guard, post-call) ·
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

### 2.4 Account resolution: the recorder bills the WRONG account for team workflows
- The recorder uses `ensurePersonalAccount(auth.userId)` → the actor's **personal**
  account, **always** — even for a Team/Business workflow. This is the bug the owner's
  decision corrects (OQ-A): a team member's planner usage would drain *their own
  personal* pool, not the team's shared pool.
- The **canonical workflow-owning-account resolver already exists**:
  `loadWorkflowForMember(workflowId, userId)`
  ([_shared.ts:181](../../../app/api/workflows/_shared.ts)) does RLS-scoped
  `getById` → no-leak 404 if missing/deleted → `requireWorkflowAccountMember` (`isMember`)
  → no-leak 404 for non-members, and returns `record.accountId` = the **workflow-owning**
  account. This is the same `getById`+`isMember` posture as the planner's own
  `getWorkflowGraphForAI` ([workflowContext.ts](../../../services/ai/tools/workflowContext.ts),
  account-equality + `isMember` defense-in-depth → NOT_FOUND).
- `requireUserWithAccount()`→`resolveActiveAccount` is the *active*-account resolver
  (explicit → `active_account_id` → personal). It is **not** what we want here — a member
  can plan a Team workflow while a *different* account is active; cost must follow the
  **workflow**, not the active account. So we use `loadWorkflowForMember`, not
  `requireUserWithAccount`.

> **Personal-workflow invariant:** under the account-owned model a personal workflow is
> owned by the user's personal account, so for personal workflows
> `record.accountId === ensurePersonalAccount(userId).id`. The decision therefore changes
> attribution **only for Team/Business/Enterprise** workflows; personal-workflow billing
> is unchanged.

### 2.5 The paid model call currently runs BEFORE ownership is verified
The planner's grounding step is workflow-account-scoped *before* the model call
(`getConnectedIntegrationsForAI(userId, workflowId)`,
[buildWorkflowPlanRequest.ts:69](../../../services/ai/planner/buildWorkflowPlanRequest.ts),
TW-4), but the **authoritative ownership/membership guard**
(`getWorkflowGraphForAI` → NOT_FOUND) runs at
[planWorkflowFromPrompt.ts:284](../../../services/ai/planner/planWorkflowFromPrompt.ts)
— **after** the model call at L246. So today a non-member who guesses a `workflowId`
triggers a **paid model call** and only then gets NOT_FOUND.

**Consequence for 3b:** resolving + authorizing the workflow account *up front* (via
`loadWorkflowForMember`) is required anyway to bill the right account — and it
additionally closes this "paid call before authz" gap. That is an intentional,
beneficial behavior change that occurs **regardless of the flag** (see §4.2 callouts).

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

**Account model anchor (owner decision — OQ-A resolved):** AI cost + gating bill the
**workflow-owning account**, never the actor's personal account:
- personal workflow → personal account AI credits,
- team workflow → **team** account shared AI pool,
- business workflow → **business** account shared AI pool,
- enterprise workflow → enterprise/custom account policy (`ai_credits_limit` set directly).

Pooling is automatic: `account_billing` is keyed by `account_id`, so every member's
usage on a team workflow deducts from the one team row (atomic via the RPC row lock).
`accountId` is **always resolved server-side** from the workflow record — **never**
accepted from the client.

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
  auth = requireUser()                              // unchanged → userId
  validate body                                     // unchanged
  wf = await loadWorkflowForMember(id, userId)      // NEW: resolve+authz workflow account
  if (!wf.ok) return wf.response                     //   no-leak 404 (missing/deleted/non-member)
  const accountId = wf.record.accountId             //   WORKFLOW-OWNING account (server-side)
  gate = await aiCreditGate({
           accountId,                                //   NOT ensurePersonalAccount, NOT client-supplied
           feature: "workflow_creation",
           plannedTier: body.modelTier ?? "fast",
         })
  if (!gate.ok) return creditDenialResponse(gate)   // 402 / 403 / 503; planner NOT called
  // gate.ok (incl. skipped:* ) → proceed
  result = await planWorkflowFromPromptForAI({ userId, workflowId: id, ... })  // the paid call
  recordAiPlanOutcome({ accountId, userId, workflowId: id, ... }, result)      // SAME accountId
  ... existing status mapping ...
```
- The **workflow-owning** `accountId` is resolved **once** and used by **both** gate
  and recorder → identical attribution, and the team/business pool is charged for a
  team/business workflow.
- `loadWorkflowForMember` is the **existing** canonical resolver (no new authz path; it
  reuses `getById`+`isMember`, the same posture the planner's own `getWorkflowGraphForAI`
  enforces). It replaces the post-call `ensurePersonalAccount(userId)` the recorder uses
  today.
- The planner is still passed `userId` + `workflowId` exactly as today — its internal
  grounding/ownership behavior is **unchanged**; we do **not** thread `accountId` into the
  pure planner service.

### 4.2.1 Intentional behavior deltas (occur regardless of the flag — must be called out)
Because account resolution + authz must happen **before** the gate, two changes apply
even when `ENABLE_AI_CREDIT_ENFORCEMENT` is OFF. Both are owner-sanctioned corrections,
not regressions:

1. **Telemetry attribution correction (the OQ-A fix).** `recordAiPlanOutcome` now bills
   the **workflow-owning** account. For personal workflows this is byte-identical
   (personal workflow ⇒ personal account; see §2.4 invariant). For **Team/Business**
   workflows, `ai_cost_events` rows now attribute to the team/business account instead of
   the actor's personal account — the intended fix.
2. **Authz-before-paid-call.** A non-member / missing / deleted `workflowId` now returns
   a no-leak **404 before** any model call (previously: paid model call, then NOT_FOUND
   → 404). Legitimate members are unaffected (they pass `loadWorkflowForMember` and
   proceed exactly as today). This eliminates a paid call for unauthorized requests.

> Because of these, "flag OFF = byte-identical" no longer holds for **team-workflow
> telemetry** and **unauthorized requests**. It DOES still hold for the happy path of a
> personal-workflow member (planner behavior, status codes, success body all unchanged).

> **Accepted minor redundancy:** the planner will still call `getWorkflowGraphForAI`
> later (its own defense-in-depth ownership guard), so a member's request does two
> RLS-scoped `getById`s. This is cheap and intentional — we do **not** refactor the
> planner's deeper check (owner direction). The route gate is the authoritative
> pre-paid-call authz; the planner's remains defense-in-depth.

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

| Account resolver | Returns | Authz / no-leak | Verdict |
|---|---|---|---|
| **`loadWorkflowForMember(id, userId)` (chosen)** | workflow-owning `record.accountId` | `getById`(RLS)+`isMember` → no-leak 404 | **Accept** — canonical, no new authz path, bills the workflow's account |
| `ensurePersonalAccount(userId)` (today's recorder) | actor's personal account | none (actor-only) | **Reject** — drains the actor's personal pool for team workflows (the OQ-A bug) |
| `requireUserWithAccount()`→`resolveActiveAccount` | the *active* account | frozen/not-member mapping | Reject — bills the active account, not the workflow's; wrong when a member plans a team workflow with another account active |
| client-supplied `accountId` | — | — | Reject — never trust the client for a cost owner |

---

## 6. Security / data model

- **No schema change.** 3b is wiring only — the AI columns + RPC already exist
  (AI-CREDITS-3, applied to dev). **No migration, no `db:push`** (Q12).
- **No-leak denial:** typed code + fixed copy (+ optional integers the member can
  already see). Mirrors the no-leak posture of `workflowNotFoundResponse` /
  `ACCOUNT_PENDING_DELETION` in `_shared.ts`.
- **Cost-owner resolved server-side**, never client-supplied: the `accountId` is the
  workflow-owning `record.accountId` from `loadWorkflowForMember`, not the request body —
  same rule the gate's own JSDoc states.
- **Atomic + service-role:** all deduction stays inside the existing SECURITY DEFINER
  RPC via the service-role repo; the route never touches `account_billing` directly.
- **Frozen account** is refused first (the gate already checks
  `isAccountFrozen` before any charge).

---

## 7. API / service / UI expectations

**Route (`/ai/plan`):** new pre-planner workflow-account resolution + membership authz
(`loadWorkflowForMember`); new pre-planner gate; new 402 `AI_CREDITS_EXHAUSTED` handled
outcome; 403 reuse for frozen; 503 for `gate_error` (ON only). All other statuses
unchanged. **When flag OFF:** the gate is a no-op (`skipped:enforcement_disabled`,
no DB touch); the member happy-path response is unchanged, **except** the two
owner-sanctioned §4.2.1 corrections (team-workflow telemetry account; 404-before-paid-
call for non-members), which apply regardless of the flag.

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
1. **Personal workflow → personal account:** gate + recorder receive the personal
   account id (= `record.accountId`).
2. **Team workflow → team/workflow-owning account:** gate + recorder receive the
   workflow's account id, **NOT** the actor's personal account (assert
   `ensurePersonalAccount` is not the source; the id equals `record.accountId`).
3. **Gate + recorder receive the SAME `accountId`** (parity), for both personal and
   team cases.
4. **No client-supplied `accountId` is trusted:** an `accountId` in the request body is
   ignored; the resolved workflow account is used.
5. **No-leak authz:** non-member / missing / deleted workflow → 404 before the planner
   is invoked (assert `planWorkflowFromPromptForAI` mock never called).
6. **Flag OFF → no deduction RPC:** planner called for a member; `deductAiCredits` not
   invoked (gate short-circuits `enforcement_disabled`). Success body unchanged.
7. **Flag ON + sufficient credits → planner proceeds**, 200, normal body; exactly one
   deduction.
8. **Flag ON + insufficient → planner NOT called**, 402 `AI_CREDITS_EXHAUSTED`,
   no-leak body.
9. **Flag ON + `gate_error` (RPC throws) → planner NOT called**, 503, fail-closed.
10. **Flag ON + frozen → planner NOT called**, 403 `ACCOUNT_PENDING_DELETION`.
11. **No double-charge:** one deduction per plan; the classifier sub-call adds none.
12. **Existing successful planner behavior preserved** (member happy path: 200 + body).

Gate tests already cover the outcomes
([tests/unit/services/billing/aiCreditGate.test.ts](../../../tests/unit/services/billing/aiCreditGate.test.ts),
47 passing as of `33ac4247c`) — no new gate-unit work needed.

Client/panel tests (if 3b-ii ships): `friendlyError` 402 mapping; panel renders the
credit message on both fresh-plan and follow-up denial.

---

## 9. Implementation slice breakdown

The owner's decision splits the work because correcting attribution to the
workflow-owning account is a telemetry-semantics change (for team workflows) that is
**independent of** the enforcement gate and lands **regardless of the flag**.
Isolating it makes that change independently reviewable + revertable, and keeps the
gate commit purely additive.

- **3b-0 (RECOMMENDED pre-slice) — attribution + authz correction, no gate.** Resolve
  the workflow-owning account at the route via `loadWorkflowForMember`; switch
  `recordAiPlanOutcome` to `record.accountId`; the no-leak-404-before-planner authz
  falls out of it. **No gate, the flag is not involved.** Tests: personal-workflow
  telemetry unchanged; **team-workflow telemetry now → team account**; non-member/
  missing → 404 before planner; member happy path preserved. This is the "small
  pre-slice" the owner asked me to flag — it is where the called-out behavior deltas
  (§4.2.1) actually land.
- **3b-i (the gate) — purely additive on top of 3b-0.** Insert `aiCreditGate({
  accountId: wf.record.accountId, feature:"workflow_creation", plannedTier })` before
  the planner; add the 402/403/503 denial mapping; route tests 6–12. Behind
  `ENABLE_AI_CREDIT_ENFORCEMENT` (OFF). No migration. No client change strictly
  required (panel degrades gracefully). **This proves the gate works.**
- **3b-ii (client message polish) — small, optional, same arc.** Add
  `AI_CREDITS_EXHAUSTED` to `AiPlanFailure.code`; map 402 in `friendlyError`; surface
  the specific bubble on the follow-up `null` path. Client/panel tests. Only ship the
  type addition in 3b-i if needed for type-compatibility.
- **(Deferred, not 3b)** dev-only enablement + dev-DB verification (§13);
  AI-CREDITS-4 reserve/reconcile + reservation ledger + deep-loop cap; any pricing flip.

> **Alternative:** 3b-0 and 3b-i may be **combined into one 3b-i commit** if the owner
> prefers a single slice — the account resolution is shared infra either way. The
> recommendation is to split, for the isolation reasons above. Either path keeps tests
> 1–12 intact.

---

## 10. Owner decisions (RESOLVED) + residual risks

**All OQs resolved by the owner (2026-06-12):**

- **OQ-A — which account owns AI cost: the WORKFLOW-OWNING account.** Personal workflow
  → personal account; team → team shared pool; business → business shared pool;
  enterprise → enterprise/custom policy. Do **not** keep personal-account billing for
  team workflows. Resolve server-side via `loadWorkflowForMember`; never trust a
  client `accountId`. (Drives §3 / §4.2 / 3b-0.)
- **OQ-B — denial status: HTTP 402** `AI_CREDITS_EXHAUSTED`. (Frozen still 403;
  `gate_error` 503.)
- **OQ-C — denial events: skip in v1.** No model call on denial → nothing to attribute;
  no `ai_cost_events` row written on a gate refusal.
- **OQ-D — escalation drift: accepted (bounded) for now.** Deduct the planned-tier
  charge; reserve/reconcile is AI-CREDITS-4. No pre-emptive over-charge.
- **OQ-E — deterministic diagnosis stays 0-credit + ungated.** Abuse/rate-limit is a
  separate concern, not in 3b.

**Residual risks (not decisions):**
- **Flag-OFF is no longer fully byte-identical** — team-workflow telemetry moves to the
  team account, and unauthorized requests 404 before the paid call (§4.2.1). Both are
  owner-sanctioned corrections; the §9 split isolates them for clean review/rollback.
- **Double `getById`** for a member's request (route gate + planner's defense-in-depth).
  Cheap; intentional; we do not refactor the planner's deeper check.
- **Enterprise** workflows rely on `ai_credits_limit` being set on the team/enterprise
  `account_billing` row directly (per the parent plan's tier table) — the gate reads
  that column; no special-casing in 3b.

---

## 11. Acceptance criteria

**This planning slice:** this doc exists under `docs/slices/phase-4/`, every
current-state claim ties to a read file, no source/test/migration/UI changed, nothing
pushed.

**The 3b implementation must later meet:** gate + recorder bill the **same
workflow-owning** account (personal→personal, team→team); no client `accountId` is
trusted; non-member/missing → no-leak 404 before any model call; flag-ON denies before
the paid call with a typed no-leak 402 (403 frozen / 503 gate_error); exactly one
deduction per plan; the planner is provably not invoked on denial; flag-OFF performs no
deduction RPC and preserves the member happy-path response; the only flag-OFF behavior
deltas are the two §4.2.1 corrections; no migration / `db:push`; the panel does not
crash on a denial.

---

## 12. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, RPCs, schema, or UI were written or changed. No
`db:push`, no deploy, no PR, no push. No pricing change. No repair/deep-loop work. No
Hermes wiring. No change to OAuth/reconnect/disconnect/team-credential/
private-connection-sharing. The flag stays **OFF**.

---

## 13. Recommended next step

All OQs are resolved (§10). On approval, implement the **3b-0 pre-slice** first
(workflow-owning-account attribution + the route-level resolve/authz via
`loadWorkflowForMember`, recorder switched to `record.accountId`, no gate), then
**3b-i** (the `aiCreditGate` call + 402/403/503 denial mapping), both behind
`ENABLE_AI_CREDIT_ENFORCEMENT` (OFF), **no migration / no `db:push`**. 3b-ii (client
message) follows. Reserve/reconcile + deep-loop cap stay in AI-CREDITS-4. Enabling the
flag in dev is a later, separately-approved step.

> If the owner prefers a single commit, 3b-0 + 3b-i can be merged (§9 alternative) —
> but the attribution change must still be explicitly called out in that commit
> message as a team-workflow telemetry correction.
