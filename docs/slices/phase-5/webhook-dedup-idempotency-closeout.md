# Webhook Dedup Idempotency — Fail-Safe Closeout (LAUNCH-DEDUP-FAILSAFE)

## Date

2026-07-03. Branch `v2-main` (local commit only, not pushed).

## Why this slice existed

The MVP launch-readiness audit
([`mvp-launch-readiness-audit.md`](./mvp-launch-readiness-audit.md), Execution row +
must-fix #7) flagged that the webhook dedup outage policy is documented as
**fail-open**, relying on a downstream Q4 within-session side-effect idempotency
backstop to prevent duplicate external side effects — but suspected that backstop
was never actually implemented. If true, a dedup-store outage plus a duplicate
provider delivery could enqueue and run the same workflow twice, causing a
duplicate email / Slack message / CRM write / charge.

This slice audited whether the backstop exists and, finding it does not,
implemented the smallest safe launch fix.

## What the audit found

**The suspicion was correct. The Q4 within-session side-effect backstop is NOT
wired.**

1. **Dedup is fail-open in code.** `services/triggers/dispatch.ts`
   (pre-change lines 54–69): when `dedup.markSeen(...)` threw, the dispatcher set
   `dedupOutage = true`, left `fresh = true`, logged a `webhook.dedup.outage`
   marker, and **proceeded to enqueue the run anyway**.

2. **The Q4 storage it relied on does not exist.**
   [`core/workflows/idempotency.ts`](../../../core/workflows/idempotency.ts) ships
   only pure helpers — `buildIdempotencyKey()` and `hashPayload()` — with an
   explicit header comment: *"No storage layer in this slice — the within-session
   `checkReplay`/`recordFired` storage is deferred."* A repo-wide grep for
   `checkReplay` / `recordFired` / `session_side_effects` found **zero**
   implementation call sites: matches are only in docs, in Stripe/Monday/Discord
   handlers that use `buildIdempotencyKey`/`hashPayload` to drive *provider-side*
   idempotency keys (Stripe `Idempotency-Key`, Google Meet `requestId`), and in
   the pure helper file itself. There is **no engine-boundary replay guard** and
   **no `session_side_effects` table**.

3. **Duplicate runs would both execute.** Enqueue
   ([`services/execution/enqueue.ts`](../../../services/execution/enqueue.ts))
   mints a fresh `randomUUID()` run id per call and persists a durable `queued`
   row per call; the run-queue processor claims each queued row independently.
   Nothing across two runs from the same provider event shares an idempotency key
   at the run/engine/handler boundary. So two enqueues → two executions → two
   side effects.

**Net:** the documented fail-open backstop was fictional. During a dedup-store
outage, duplicate side effects were genuinely possible (narrow — outage-only — but
real and irreversible).

### Idempotency scope, precisely

| Layer | Idempotency today |
|---|---|
| Webhook dedup (`webhook_event_dedup`, `(provider, eventId)`) | Real — the only cross-delivery guard. Was fail-open on outage; now fail-closed. |
| Per-run / per-node / per-workflow (Q4 `checkReplay`/`recordFired` storage) | **Missing** — pure key/hash helpers only, no storage, no engine guard. |
| Provider-side (Stripe `Idempotency-Key`, Meet `requestId`) | Present only for the handful of handlers that opt in; not a general backstop. |

## Decision

**Change the dedup outage policy from fail-open to fail-CLOSED** (audit Option A).

When `markSeen` throws, the dispatcher can no longer confirm the event is new, and
there is no downstream idempotency to catch a duplicate. So it **skips enqueue**
for that event rather than risk a duplicate irreversible side effect. This matches
the task's north star: *prefer preventing duplicate external side effects over
maximizing webhook availability.*

**HTTP status stays 200 (no 5xx / no provider retry).** Rationale: this MVP runs
on a **single shared Supabase project** (dev == prod, the audit's #1 risk). A
dedup-store outage means that DB is already degraded; answering every webhook with
5xx would trigger a provider retry storm against the struggling DB. Shedding the
event (bounded to the outage window, loudly logged/alertable) is the safer
operational trade than either duplicating side effects (old fail-open) or
retry-storming a degraded DB. The cost is honest and documented: **events that
arrive during a dedup-store outage are dropped, not retried.**

Fail-open can be reconsidered once durable Q4 side-effect storage lands at the
engine boundary (recommended slice `DEDUP-BACKSTOP-1`).

## What behavior changed

- **Before:** dedup outage → log `webhook.dedup.outage` (warn) → dispatch/enqueue
  proceeds → duplicate delivery during outage could double-run.
- **After:** dedup outage → log `webhook_dedup_unavailable_skip_enqueue` (error) →
  **return early, no lookup, no enqueue** (`{ matched: 0, enqueued: 0,
  duplicate: false, dedupOutage: true }`). Route returns 200; provider does not
  retry. Zero duplicate runs possible from an outage.
- Unchanged: normal dedup (duplicate `(provider, eventId)` dropped), state gate
  (paused/disabled/deleted/draft dropped), frozen-account drop, per-trigger
  filters, async-enqueue contract, and the `DispatchResult` shape (the
  `dedupOutage` flag now means "outage occurred → event skipped", and pairs with
  `enqueued: 0`).

## Files changed

**Source (1):**
- [`services/triggers/dispatch.ts`](../../../services/triggers/dispatch.ts) —
  fail-closed on `markSeen` throw: emit `webhook_dedup_unavailable_skip_enqueue`
  (error level) and return early without enqueueing. Rewrote the module header to
  document the policy + rationale; updated the `dedupOutage` field doc.

**Tests (2):**
- [`tests/unit/services/triggers/dispatch.test.ts`](../../../tests/unit/services/triggers/dispatch.test.ts) —
  replaced the old "fail-open on dedup outage: dispatch proceeds" test with:
  (a) "fails closed on dedup outage: skips enqueue rather than risk a duplicate
  side effect" (asserts no lookup, no enqueue, exact result shape); (b) "emits an
  alertable `webhook_dedup_unavailable_skip_enqueue` marker on outage" (asserts
  the marker + dedup key are logged, and the raw payload text is **not** logged).
- [`tests/parity/duplicate-webhook-delivery.test.ts`](../../../tests/parity/duplicate-webhook-delivery.test.ts) —
  **new** parity test for the `duplicate-webhook-delivery` V1 regression named in
  `testing-strategy.md §H`: exactly one run for a doubled delivery (normal dedup),
  zero runs when the dedup store is down (fail-closed), and zero runs when the
  store is down AND the provider double-delivers.

**Docs (3):**
- [`docs/rules/webhook-receipt-routes.md`](../../rules/webhook-receipt-routes.md) —
  Resolved Decisions dedup outage policy (fail-open → fail-closed, with the
  "no backstop exists" rationale); Allowed flows idempotency bullet; required
  test #13.
- [`docs/rules/testing-strategy.md`](../../rules/testing-strategy.md) — corrected
  the error-handling example that claimed fail-open + "downstream Q4 catches
  duplicates."
- [`docs/slices/phase-5/mvp-launch-readiness-audit.md`](./mvp-launch-readiness-audit.md) —
  follow-up notes only (Execution row status → RESOLVED; must-fix #7 struck
  through with resolution pointer). The audit findings themselves are unchanged.

**No** migrations, schema, RLS, or GRANT changes. **No** new tables. **No** route
changes (all ~17 provider webhook routes keep their existing 200/5xx contract).

## Tests added / updated + results

Commands run (local, read-only except the test runner):

```
npx jest tests/unit/services/triggers/dispatch.test.ts tests/parity/duplicate-webhook-delivery.test.ts
  → 2 suites passed, 28 tests passed

npx jest tests/unit/integrations/facebook/triggers/dispatch.test.ts   (other dispatchTriggerEvent caller)
  → 1 suite passed, 5 tests passed

MCP run_typecheck (tsc --noEmit)
  → exit 0
```

Not run (not claimed as passing): the full Jest suite, `npm run lint`, Playwright
e2e, and any live provider / real-DB round-trip. The dedup-outage path is
exercised here with a mocked dedup store (the store's `markSeen` throwing is the
external boundary); a real dedup-store outage against the live DB is not
simulated (and is out of scope for this launch-safety slice).

## Remaining risks

1. **Dropped events during a dedup-store outage.** By design, events arriving
   while `webhook_event_dedup` is unavailable are shed (not enqueued, not
   retried). Bounded to the outage window and loudly logged
   (`webhook_dedup_unavailable_skip_enqueue`). An alert on that marker is
   recommended so an outage is noticed and the shared DB investigated. This is
   the deliberate trade vs. duplicate side effects; it is honest, not hidden.
2. **Q4 within-session side-effect storage still does not exist.** This fix
   removes the *outage* exposure but does not add a general cross-run idempotency
   backstop. It becomes load-bearing the moment **auto-retry** or
   **resume-from-failed-node** ships (both currently deferred). `DEDUP-BACKSTOP-1`
   must land before either. Until then, there is no protection against duplicate
   side effects from any *other* source of duplicate runs (e.g. a future manual
   re-run of a partially-completed run).
3. **Not exercised against the live DB.** Behavior is proven at the dispatcher
   boundary with a mocked store. A live dedup-store-outage drill belongs to the
   `LAUNCH-LIVE-QA-1` manual pass.

## Is this launch-safe?

**Yes, for the specific risk it targets.** The audit's medium-severity
"dedup outage → duplicate side effects" exposure is closed: an outage can no
longer double-run a workflow. The change is small, contained to one source file +
tests + docs, does not touch the DB or the 17 provider routes, and the docs now
honestly describe what the code does (no more phantom Q4 backstop claim).

It does **not** by itself make the broader launch ready — the audit's other
blockers (staging DB, live-provider QA, prod config, cross-device email confirm)
are independent and unchanged. And it intentionally does **not** build the full
Q4 side-effect subsystem, which is correctly deferred to `DEDUP-BACKSTOP-1` and
gated before any auto-retry / resume work.
