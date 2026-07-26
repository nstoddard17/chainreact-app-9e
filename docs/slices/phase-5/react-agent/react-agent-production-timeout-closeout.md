# REACT-AGENT-PRODUCTION-TIMEOUT-1 — production 503 on complex React Agent turns

**Status:** Fixed locally, gates run, **not pushed** (awaiting Marcus's per-batch approval).
**Branch:** `react-agent-production-timeout-1` (cut from `origin/v2-main` @ `9d2abf272`).
**Scope:** infrastructure/observability. No prompt rewrite, no model change, no capability change.

---

## 1. The report

Manual production testing of the builder React Agent rail:

1. **First turn — worked well.** "When a Stripe invoice is paid, post a message in our Slack billing
   channel…" → correct trigger, correct Slack action, useful message, channel left as a required user
   selection, preview presented before applying.
2. **Second turn, after a builder refresh, more complex — HTTP 503** from
   `POST /api/accounts/<account-id>/ai/workflow-guidance`, at roughly the 30-second mark.

The instruction was to treat this as an infrastructure failure, not a prompt-quality problem, until
the infrastructure was understood. That was the right call — it is infrastructure, and the agent's
reasoning was never involved in the failure.

## 2. Root cause

### 2.0 Which 30-second boundary fired (corrected after Marcus's Render finding)

Marcus confirmed Render carries `HERMES_AGENT_TIMEOUT_MS=60000`. That value **cannot** have produced
the 30s failure, and the reason matters: the variable name is shared by two different processes.

| Where it is set | Which process reads it | Effect on the failed request |
|---|---|---|
| **Vercel (ChainReact)** | `services/ai-guidance/gateway/gatewayConfig.ts` → the `AbortController` in the gateway client | **This is the deadline that fired.** Unset at the time ⇒ the code default `DEFAULT_TIMEOUT_MS = 30_000` applied. `.env.local` mirrors the same `30000`. |
| **Render (the gateway service)** | The gateway's own upstream call to the private Hermes Agent — a **different codebase**, not this repo | None. ChainReact never reads Render's environment; a 60s downstream budget cannot terminate a caller at 30s. |

So the terminating boundary was ChainReact's own client abort at exactly 30,000 ms — the single
`setTimeout(() => controller.abort(), config.timeoutMs)` in the gateway client. Nothing on Render,
nothing on the platform, and nothing in the model was involved. Render being the *longer* of the two
is in fact the correct ordering: ChainReact's deadline stays the binding one, so a slow turn produces
our typed 503 rather than a downstream 502/504 we have to guess at.

### 2.1 The mechanism

`services/ai-guidance/gateway/gatewayConfig.ts` set `DEFAULT_TIMEOUT_MS = 30_000`. The gateway client
arms an `AbortController` with it; on abort it returns `{ ok: false, code: "TIMEOUT" }`, and the route
maps every non-ok result to a single 503 `GUIDANCE_UNAVAILABLE`. The observed ~30s is exactly this
deadline.

Either branch produces the same 30s: `HERMES_AGENT_TIMEOUT_MS` unset on Vercel (code default applies)
or explicitly `30000` there. The repo's `.env.local` carries `30000`, so local dev reproduced it
identically. Which of the two applied in production is not determinable from the repo — and does not
change the diagnosis, since both resolve to the same 30,000 ms abort.

**Why the second turn crossed the deadline and the first did not.** The two turns do not send
comparable prompts. Measured against the real registry (`buildGatewayGuidancePrompt` with live
`buildCapabilityCatalogKeys` + `buildFieldSchemaLines`):

| Turn shape | Prompt | ≈ tokens | What it adds |
|---|---|---|---|
| New workflow (turn 1) | ~25 KB | ~6.2k | goal + field schemas for the narrowed provider set (80 lines) |
| Builder EDIT (turn 2, after refresh) | **~45 KB** | **~11.3k** | + the full capability catalog (**512** `provider:type` keys, ~13.7 KB) + the editable graph + edit instructions |

A refreshed builder posts `currentDraft`, which flips the route onto the editing path
(`route.ts` → `builtEditableGraph` → `capabilityCatalog: buildCapabilityCatalogKeys()`). So the second
turn was not merely "a harder question" — it was a structurally larger request through a reasoning
model. Above ~30s of generation, it failed 100% of the time regardless of how good the prompt was.

**Second, compounding defect: the failure was undiagnosable in production.** Every brain failure
collapsed into the same opaque 503 with the same copy, and into the same
`react_agent_audit_events` row (`reason: "exec_failed"`). A slow brain, a dead Render gateway, a
malformed envelope, and a disabled flag were indistinguishable — which is why this had to be diagnosed
with a stopwatch. The opt-in live smoke did not catch it either: it sends a ~3.5s prose prompt, so it
stayed green throughout.

Third: neither guidance route declared `maxDuration`, so the platform default (not ChainReact) decided
the function budget. A kill there yields a bodyless 504 the panel cannot render.

## 3. What changed

| Change | File |
|---|---|
| Default gateway timeout **30s → 45s**; clamp ceiling **120s → 55s**; `DEFAULT_TIMEOUT_MS` / `MIN_TIMEOUT_MS` / `MAX_TIMEOUT_MS` / `GUIDANCE_ROUTE_MAX_DURATION_SECONDS` exported | [`services/ai-guidance/gateway/gatewayConfig.ts`](../../../../services/ai-guidance/gateway/gatewayConfig.ts) |
| `export const maxDuration = 60` (explicit function budget) | [`app/api/accounts/[id]/ai/workflow-guidance/route.ts`](../../../../app/api/accounts/%5Bid%5D/ai/workflow-guidance/route.ts), [`app/api/ai/anonymous-workflow-guidance/route.ts`](../../../../app/api/ai/anonymous-workflow-guidance/route.ts) |
| Distinct **`GUIDANCE_TIMEOUT`** 503 with actionable copy (timeout only); everything else keeps `GUIDANCE_UNAVAILABLE` | account guidance route |
| Safe server-side failure log — typed code, elapsed ms, request SHAPE (`editing` / `catalogKeys` / `fieldSchemaLines` / `recentTurns`) | both guidance routes |
| Optional `classifyReason` on the governance seam → audit rows record `exec_failed:<CODE>` instead of a bare `exec_failed` | [`services/ai/reactAgent/index.ts`](../../../../services/ai/reactAgent/index.ts), [`…/capabilities/workflowGuidanceIntake.ts`](../../../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts) |
| Panel renders the timeout copy verbatim (was: generic "temporarily unavailable") | [`features/workflows/guidancePanelShared.ts`](../../../../features/workflows/guidancePanelShared.ts) |

**The budget is now a two-part invariant:** gateway abort (≤55s) **<** route `maxDuration` (60s), so a
slow brain always produces ChainReact's typed, renderable 503 — never a platform 504. Next.js requires
`maxDuration` to be a static literal, so the routes cannot import the constant;
[`tests/structure/guidance-route-timeout-budget.test.ts`](../../../../tests/structure/guidance-route-timeout-budget.test.ts)
is what keeps the literal and the constant from drifting apart.

### No-leak posture (unchanged)

`GUIDANCE_TIMEOUT` is a fixed code with fixed, server-authored copy — no provider status, elapsed
time, ids, prompt, guidance text, or internal detail reaches the client. The new server log carries
the typed code plus non-identifying shape counters only (asserted by test: no goal text, no
account id, no token). The audit reason is built from the gateway contract's fixed code union, never
from a provider message.

## 4. Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (26 pre-existing warnings) |
| `npm run lint:migrations` | pass (no migration in this batch) |
| `npm run lint:structure` | **1 pre-existing violation** — `docs/slices/phase-5` holds 51 files (limit 50). Not caused here (this batch adds no file to that folder — the new doc lives in the new `react-agent/` subfolder). See §6. |
| Targeted suites | `ai-workflow-guidance-route` · `hermesAgentGatewayConfig` · `reactAgent` · new `guidance-route-timeout-budget` — **101 passed** |
| Broader sweep (`tests/unit/app/api/accounts`, `tests/unit/app/api/ai`, `tests/unit/services/ai-guidance`, `tests/unit/features/workflows`, `tests/structure`) | 1144 passed / 5 failed — **all 5 failures reproduce on a clean tree** (`no-literal-slack-token-fixtures`, `client-server-boundary`, `field-sensitivity-coverage`, `resource-field-discovery-coverage`, `sensitive-output-coverage`), verified by stashing this batch and re-running. Unrelated to this work. |

**Not verified live.** The fix has not been exercised against the real gateway from production — that
needs the deploy plus a re-run of the manual test. The new latency smoke case is the local instrument
for it (§5).

## 5. What is still unproven — read before calling this closed

1. **45s may not be enough, and the ceiling is 55s.** No measurement of a real EDIT-turn round-trip
   exists yet; 45s is a budget chosen to fit inside a 60s function, not a number derived from
   observed latency. Run the new latency case to get the real number:
   ```bash
   HERMES_AGENT_ENABLED=true HERMES_AGENT_GATEWAY_SMOKE=true \
     npx jest tests/unit/services/ai-guidance/hermesAgentGateway.live.dev.test.ts
   ```
   It prints `elapsedMs` and a `WITHIN BUDGET | AT RISK | OVER BUDGET` verdict. `AT RISK`/`OVER BUDGET`
   means the real fix is prompt size (§6), not a bigger number.
2. **The timeout may also live on the Render side.** If the gateway imposes its own upstream deadline,
   it will fail first and ChainReact will log `PROVIDER_ERROR status_*`, not `TIMEOUT` — and raising
   `HERMES_AGENT_TIMEOUT_MS` will change nothing. The new log distinguishes the two; that distinction
   is the reason to read it before tuning anything further.
3. **Env action required on Vercel.** If `HERMES_AGENT_TIMEOUT_MS=30000` is set there, the raised code
   default does nothing — the explicit value wins. Remove it (preferred: the code default applies) or
   set it to `45000`. Local `.env.local` also pins `30000` and was deliberately NOT edited; change it
   to reproduce/verify locally.
4. **45s of silent waiting is poor UX.** The rail shows a spinner with no progress and no elapsed
   indication. Streaming, or a "still working…" state, is the real answer.

## 6. Recommended follow-ups (not done here)

- **Shrink the EDIT prompt.** The 512-key capability catalog (~13.7 KB) is sent verbatim on every
  editing turn. Narrowing it the way `selectRelevantProviders` already narrows field schemas would cut
  the dominant term in the latency. Deliberately not attempted here: it changes what the model can
  propose, and this batch was scoped to stop the infrastructure failure without touching agent behavior.
- **Progressive/streamed rail responses**, so a 40s turn feels alive.
- **`docs/slices/phase-5` leaf-count violation (pre-existing).** 51 files vs the 50 cap. The cheapest
  fix is moving the 11 `react-agent-*` / `hermes-agent-*` docs into the `react-agent/` subfolder this
  doc starts, which drops the root to 40. Left alone here — it is a docs reorg with cross-link
  fallout, unrelated to a production incident fix.

---

# Owner Report addition — REACT-AGENT-RETRY-BACKOFF-1

### Retry and backoff

**Did retry exist before this batch? No — none of any kind.** Proven, not assumed:

| Audit question | Answer | Evidence |
|---|---|---|
| Hermes attempts per user request | Exactly **1** | One `fetchImpl(...)` call site, no loop, in `hermesAgentGatewayClient.ts`. Pinned by test `(#1)`. |
| Which errors were retryable | **None** | Every transport/HTTP/parse failure returned a typed code directly to the caller. |
| Existing delay/backoff policy | **None** | No timer, sleep, jitter, or attempt counter anywhere in `services/ai-guidance/`. |
| Did retries share the cancellation signal | **N/A** — and the incoming request's signal was **ignored entirely** | `request.signal` appeared nowhere in either guidance route. |
| Was remaining request budget checked | **No** | The single `AbortController` used the full `timeoutMs`; nothing measured what was left. |
| Could an internal retry consume another credit | **N/A** (no retry). The gate ran once, before the call. | `aiCreditGate` is invoked once in the route, outside any loop. |
| Request ID / idempotency key | **Neither existed** | No `randomUUID`, `requestId`, or `idempotency` reference in the guidance path. |
| Secondary model / provider fallback | **None on the live path** | `resolveServerGuidanceProvider` (the only fallback-shaped helper) has **zero production callers**; the route calls the gateway client directly. `noopWorkflowGuidanceProvider` is an inert stub, not a fallback. The deterministic `inferDeterministicPreviewPlan` / `inferDeterministicMutationOps` helpers are model-free local inferers that run only *after* a successful Hermes reply — never as a substitute for a failed one. Pinned by test `(#2)`. |
| Is Render's `60000` clamped by the new code | **Only if it is set on Vercel** — see below | Test `(#3)`. |

Retry utilities **do** exist elsewhere in the repo (`refreshAndRetry`, used by provider/analytics
code). A grep across `services/ai-guidance/`, `services/ai/reactAgent/` and both guidance routes
returns **no import of any of them** — the guidance path never used them.

**Which failures now retry** (fast + plausibly temporary only):
`network_error` (connection reset / DNS / socket interruption) · immediate HTTP `502` · immediate
HTTP `503` · HTTP `429` **only** when the provider sends a `Retry-After` of 2s or less that fits the
remaining budget.

**Which failures never retry:** `GUIDANCE_TIMEOUT` · user cancellation / aborted browser request ·
HTTP `400/401/403/404` (auth, authorization, bad gateway token, invalid model credentials) · HTTP
`500` · malformed structured output · envelope-level provider errors on HTTP 200 · invalid workflow
proposals and unsupported provider/action references (validated *after* the brain call — they never
re-enter it) · any transient-class failure that took **more than 5s** (not actually transient) · any
failure with too little budget left for a useful second attempt.

**Maximum total attempts: 2** (1 initial + 1 retry). `MAX_TOTAL_ATTEMPTS` is a module constant, not a
config value — no environment variable or parameter can make it unbounded.

**Backoff range: 250–750 ms, jittered** (`computeBackoffMs`, uniform over the window). No exponential
ladder, no multi-second wait inside this synchronous route.

**How remaining request time is calculated.** `config.timeoutMs` is the budget for the *whole logical
call*. The client stamps `deadlineAt = start + timeoutMs` once; each attempt's own deadline is
`max(1, deadlineAt - now)`, and the backoff is charged to the same budget. A retry starts only when
`remaining - backoff >= MIN_SECOND_ATTEMPT_MS` (10s). So **retry redistributes the existing budget —
it never extends it**, and the reserve between the 55s ceiling and the 60s `maxDuration` (parse,
validate, audit, credit, respond) is untouched. Test `(#29,#30)` asserts total elapsed is within the
original budget.

**How cancellation works.** The route passes `request.signal` into the runner, which passes it to the
client. It aborts the in-flight fetch *and* the backoff sleep (which resolves immediately as
`cancelled` instead of waiting out its delay and then firing a call nobody wants). An already-aborted
signal makes zero attempts. Cancellation has its own typed code `CANCELLED` → HTTP **499**, is never
retried, and is deliberately **not** written to the error log — a visitor navigating away is not an
incident.

**How one-credit-per-user-request is enforced.** Structurally, not by convention: `aiCreditGate` runs
once in the route *before* the capability call and *outside* the retry, so no retry path can reach it
a second time. The logical `requestId` is minted after the gate, once, and both attempts carry it
(`x-chainreact-request-id`, plus `x-chainreact-attempt: 1|2`). The governance seam writes **one**
`react_agent_audit_events` row per submission, with the attempts as safe metadata
(`{attempts, retried, retryReason, backoffMs, elapsedMs}`) — never a second row.

> **Known gap, stated plainly.** Two of the requested credit outcomes — "both attempts fail → no
> permanently consumed credit" and "timeout → no permanently consumed credit" — **cannot be satisfied
> today**, and this batch does not pretend otherwise. `aiCreditGate` is **deduct-only**: the ledger has
> exactly one RPC (`deduct_ai_credits_if_available`) and there is **no refund, release, or reservation
> primitive anywhere in the repo**. With `ENABLE_AI_CREDIT_ENFORCEMENT=true`, a failed submission
> therefore keeps its credit. This is **pre-existing and unchanged by retry** (retry cannot charge
> twice — tested), and **inert in production today** because enforcement is OFF by default. Closing it
> is a deliberate billing slice, not a reliability fix: either a `refund_ai_credits` RPC (migration) or
> a move to deduct-on-success (which needs a read-only availability probe first and accepts a small
> concurrent-request over-serve). I did not combine that with this change. Duplicate refund/release is
> impossible meanwhile — there is nothing to call twice.

**Is Render's `60000` clamped? It depends which environment holds the variable — both readings
answered:**

- **If `HERMES_AGENT_TIMEOUT_MS=60000` is set on Vercel (ChainReact) → Case A, clamped.** The new
  `MAX_TIMEOUT_MS = 55_000` applies: `configured 60000 ms → effective 55000 ms → route maxDuration
  60000 ms`. Proven by test `(#3)` in `hermesAgentGatewayConfig.test.ts`. No Render change needed.
- **If it is set only on Render (the gateway service) → neither Case A nor B: it is a different
  process's variable.** ChainReact never reads Render's env, so the clamp is irrelevant to it. 60s
  there is *correct as-is*: it sits **downstream** of ChainReact's 55s-or-less deadline, so ChainReact
  always aborts first and the user gets our typed 503 rather than a downstream 502/504.

**Does Marcus need to change the Render environment variable? No — not for correctness.** Leaving
Render at `60000` preserves the right ordering (ChainReact's deadline binds first). The action, if
any, is on **Vercel**: prefer leaving `HERMES_AGENT_TIMEOUT_MS` **unset** so the 45s code default
applies, or set it explicitly within **45000–55000**. A stale `30000` on Vercel would silently
reinstate the original bug — that is the value worth checking. **No environment variable was changed
by this batch.**

**How production logs distinguish the four outcomes:**

| Situation | Log line | Response |
|---|---|---|
| Slow brain (timeout) | `console.error … code=TIMEOUT attempts=1 retrySkipped=timeout` | 503 `GUIDANCE_TIMEOUT` |
| Transient provider failure, **recovered by retry** | `console.warn … recovered after retry attempts=2 retryReason=status_503 backoffMs=…` | 200 (the user never sees a failure) |
| Retry **exhausted** | `console.error … code=PROVIDER_ERROR attempts=2 retryReason=status_503 retrySkipped=attempts_exhausted` | 503 `GUIDANCE_UNAVAILABLE` |
| Transient failure, retry **skipped** | `console.error … attempts=1 retrySkipped=insufficient_budget` (or `slow_failure` / `retry_after_too_long` / `not_retryable`) | 503 `GUIDANCE_UNAVAILABLE` |
| User cancelled | *(no error log — deliberately)* | 499 `GUIDANCE_CANCELLED` |

Every line also carries `requestId=<uuid>` (the one logical id), `creditOutcome=` (which single gate
branch fired), `elapsedMs`, and the request-shape counters. **Never** logged: prompts, model
responses, workflow field values, provider content, tokens, authorization headers, account/user/
workflow ids, or any customer data — asserted by test.

### Retry-and-backoff verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (27 pre-existing warnings) |
| `npm run lint:migrations` | pass — **no migration in this batch** |
| `npm run lint:structure` | 1 pre-existing violation (`docs/slices/phase-5` = 51 files); unchanged by this batch |
| Targeted suites (`tests/unit/services/ai-guidance`, `tests/unit/services/ai/reactAgent`, `tests/unit/app/api/accounts`, `tests/unit/app/api/ai`, `tests/unit/features/workflows`, guidance structure tests) | **91 suites / 1093 tests passed, 0 failed** |

New/changed tests: `hermesAgentGatewayRetry.test.ts` (34 cases — attempt count, per-status
retryability, exhaustion, timeout, cancellation, budget, identity, backoff shape), retry/audit cases
in `workflowGuidanceIntake.test.ts`, route-level credit/identity/logging cases in
`ai-workflow-guidance-route.test.ts`, the `60000 → 55000` clamp case, and `guidanceErrorCopy.test.ts`.
All use **injected clocks/sleep/RNG** — the suite proves 45–60s budget behavior in milliseconds and
never waits.

**Full-suite status:** only the targeted suites above were run for this batch (Marcus asked for
targeted runs, not the full sweep). The earlier full run on the timeout batch showed 32 failing
suites / 75 failing tests, dominated by DB-backed integration suites that need a local Supabase; that
set was not re-baselined here.

**Not verified live.** No retry has been exercised against the real Render gateway; the mechanism is
proven only against mocks. Two existing assertions were deliberately updated rather than worked
around: the route's exact dependency-set assertion (now `auditRecorder` + `requestId` + `signal`) and
the audit row's "no metadata at all" assertion (now an exact safe-key allow-list) — both re-pin the
same no-leak guarantee against the new shape.

**Scope respected.** No change to prompts, catalog contents, model instructions, workflow-proposal
semantics, capability filtering, provider selection, or agent behavior. Catalog-size optimization was
**not** combined with this fix. Nothing pushed, deployed, PR'd, or changed on Render/Vercel.
