# Native-nodes Slice 2 — Tier B triggers + run-now API plan

**Status:** Plan / not yet implemented. **Doc-only commit.**
**Accepted audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) (commit `de0a87256`).
**Slice 1 outcomes:** [`docs/slices/parity/native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md) (commit `3763429eb`).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface (to land):** new modules under [`integrations/native/triggers/`](../../../integrations/native/triggers/), new route [`app/api/workflows/[id]/run-now/route.ts`](../../../app/api/workflows/[id]/run-now/route.ts), new orchestrator [`services/cron/runScheduledTriggers.ts`](../../../services/cron/runScheduledTriggers.ts), new orchestrator [`services/triggers/scheduledTriggerRegistry.ts`](../../../services/triggers/scheduledTriggerRegistry.ts), engine-touching changes confined to threading `userId` into `enqueueRun` for the manual entry path.

This is the second native-nodes implementation slice. It ships **2 native triggers** (`manual_trigger`, `scheduled_trigger`) + **1 new HTTP route** (`POST /api/workflows/[id]/run-now`) + **1 new cron entry** (`/api/cron/run-scheduled-triggers`) + supporting registries + cron-expression validation. Closes the **Tier B** parity gap defined in the accepted audit §7.

**Implementation does not begin until this plan is committed AND open decision NPD-N11 (cron-expression dep) is resolved.**

---

## 1. Accepted Native Slice 1 summary

Native Slice 1 shipped (`8 commits`, retro at [`native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md)):

- `native:http_request` — pure-handler port.
- `native:format_transformer` — pure-handler port; in-tree HTML/Markdown converter (no turndown dep).
- `native:delay` — narrow ≤30s in-process sleep.
- Bug fix: `services/triggers/preconditions.ts` exempts `provider="native"` from the OAuth integration presence check (NON_OAUTH_PROVIDERS allowlist).
- Structure-test exemption mirrors the precondition allowlist.
- 173 native-focused tests; 7087 / 7087 full jest; 2 / 2 Playwright walkthrough scenarios.

Durable Slice 1 rules carried forward (all apply to Slice 2):

- `native` is a non-OAuth pseudo-provider. No manifest, no scopes, no integrations row, no health check.
- Native handlers register by `(provider, type)` key in `services/execution/handlers/_registry.ts`.
- No log lines from native code paths.
- `.strict()` schemas reject V1 cosmetic flags at parse.
- Throw on failure; engine converts to step failure (no `{success, error, message}` envelopes).
- No new runtime dependencies without explicit user approval.
- Bounded outputs everywhere; no raw response spread.

---

## 2. Native Slice 2 scope

This slice ships exactly:

| # | Surface | Kind |
|---|---|---|
| 1 | `native:manual_trigger` | trigger |
| 2 | `native:scheduled_trigger` | trigger |
| 3 | `POST /api/workflows/[id]/run-now` | HTTP route (manual-trigger entry point) |
| 4 | `services/triggers/scheduledTriggerRegistry.ts` | new registry — owns scheduled_trigger lifecycle (activation: compute first nextFireAt; deactivation: no-op) |
| 5 | `services/cron/runScheduledTriggers.ts` + `app/api/cron/run-scheduled-triggers/route.ts` | new cron entry — minute-resolution scheduled-trigger evaluator |
| 6 | `services/cron/cronExpression.ts` (or vendored dep wrapper) | cron-expression validation + next-fire-time calculation. **Blocked on NPD-N11.** |
| 7 | Activation registry extension to permit non-OAuth providers | tiny edit to `services/triggers/activationRegistry.ts`'s `ActivationContext` so `integration` is optional for native providers |
| 8 | Engine / enqueue extension | thread `userId` into `enqueueRun` for the manual entry path so the run record gets credited to the right user (was already plumbed through the dispatcher path via `triggerResources.userId`). |

No engine BFS / branching / loop / pause-resume work. No DB migrations. No new manifest entries.

---

## 3. Explicit out-of-scope list

The following are **NOT** in Slice 2 and must not appear in any of its commits:

| Item | Reason |
|---|---|
| Generic webhook trigger | NPD-N3 — deferred pending product signal. |
| `if_then_condition` | Tier C; blocked on engine-branching slice. |
| `router` | Tier C; same blocker. |
| `loop` | NPD-N5 — deferred to Phase 6. |
| `wait_for_event` | NPD-N5 / NPD-N6 — Phase 6 (durable queue). |
| Unbounded `delay` | NPD-N6 — Phase 6. |
| `ai_agent` + 7 AI sub-actions + `tavily_search` | NPD-N7 — Phase 5. |
| `hitl_conversation` | NPD-N8 — Phase 8. |
| `parse_file` / `extract_website_data` | NPD-N9 — pending product signal. |
| 6 V1 orphan handlers | NPD-N10 — PERMANENT SKIP. |
| Per-user-timezone scheduling | Out of scope; Slice 2 ships UTC only (NPD-N12 below). |
| Catch-up / backfill on missed scheduled runs after a cron outage | Out of scope; Slice 2 fires only the most recent missed instance (NPD-N13 below). |
| Step-CA / RBAC on run-now beyond "owner only" | Out of scope; Slice 2 is workflow-owner only. |

---

## 4. Manual trigger plan

### 4.1 File layout

```
integrations/native/triggers/manualTrigger.ts             # registers TriggerEvent shape constants + helpers
integrations/native/triggers/manualTrigger.schema.ts      # resolved-config schema (intentionally empty — no per-trigger config)
tests/unit/integrations/native/triggers/manualTrigger.test.ts
```

The trigger is a no-op at activation time — V2's existing `services/triggers/lifecycle.ts` already loops over `node.kind === "trigger"` and persists a `trigger_resources` row even when there's no activation function registered. Manual triggers ride that path unchanged.

### 4.2 Resolved-config schema

```typescript
// integrations/native/triggers/manualTrigger.schema.ts
export const MANUAL_TRIGGER_EVENT_TYPE = "manual.run";

export const ManualTriggerConfigSchema = z.object({}).strict();
export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;
```

Empty config object. `.strict()` rejects any keys — keeps stale workflow definitions surfacing as ZodError instead of silently ignoring unknowns. (V1 had `outputSchema` declarations but those are UI-only and irrelevant to V2's runtime.)

### 4.3 Payload shape

The manual-trigger payload is the JSON body of the `POST /api/workflows/[id]/run-now` call, validated by:

```typescript
// integrations/native/triggers/manualTrigger.schema.ts (continued)
export const ManualTriggerPayloadSchema = z
  .object({
    inputs: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type ManualTriggerPayload = z.infer<typeof ManualTriggerPayloadSchema>;
```

- `inputs`: arbitrary JSON object the caller supplies. Workflow steps reference it via `{{trigger.payload.inputs.<key>}}`.
- `.strict()` so extension fields fail loudly (callers explicitly opt in to new shape).
- Body size cap: 256 KiB enforced at the route layer (`Content-Length` check before parsing). Above that → `413 Payload Too Large`.

**No `triggeredAt` / `triggeredBy` / `workflowId` shoved into the payload by the server** (V1 did this; V2's TriggerEvent already carries `occurredAt`, the workflow row has the workflow id, and authorship is implicit from the authenticated route). Workflows that want those values reference `{{trigger.occurredAt}}` or `{{<triggerNodeId>.occurredAt}}` — already exposed by the engine variable map.

### 4.4 TriggerEvent shape

```typescript
{
  provider: "native",
  eventType: "manual.run",
  eventId: <uuid generated per run-now call>,
  occurredAt: <ISO timestamp at route entry>,
  accountId: "system",          // native pseudo-provider; constant placeholder
  payload: ManualTriggerPayload // { inputs: {...} }
}
```

`accountId` defaults to the literal string `"system"` — required by `TriggerEventSchema` (`z.string().min(1)`); native has no real accountId, so a stable constant is the least-surprising choice. Matches Native Slice 1 e2e walkthrough convention.

### 4.5 EventId / dedup strategy

- `eventId = randomUUID()` generated by the route on each call.
- Each click intentionally produces a new run; consecutive identical bodies are NOT deduped. (V1 behavior — each click of "Test" produced a new run.)
- The existing `dedup.markSeen("native", eventId)` call inside `dispatchTriggerEvent` still runs but always succeeds (`fresh: true`) because the UUID is fresh. Cheap pass-through; we don't bypass dedup for symmetry with provider triggers.

### 4.6 Authorization / ownership checks (route-level)

The route uses the standard `requireUser()` helper at [`app/api/workflows/_shared.ts`](../../../app/api/workflows/_shared.ts) + an explicit ownership check:

1. `requireUser()` — must be signed in (401 otherwise).
2. Load workflow by id via `workflowsRepo.getById(id)` — 404 if not found OR `state === "deleted"`.
3. Compare `workflow.userId === auth.userId` — **403 Forbidden** if not the owner. (Future: team-share / RBAC, but not Slice 2.)
4. Workflow must have a `native:manual_trigger` node in its `draftDefinition`. If not, **422 Unprocessable Entity** with `error: "Workflow has no manual_trigger node"`.

### 4.7 Workflow state requirement

Run-now accepts workflows in state ∈ `{ active, paused, draft }`. Rationale:

- `active` — obvious.
- `paused` — user explicitly paused webhook / scheduled triggers but still wants manual test runs.
- `draft` — testing during builder iteration is the whole point of "Test" buttons.

States rejected (**409 Conflict**):
- `disabled` — workflow has a hard problem flagged by the platform; surfacing test runs hides the problem.
- `eligible_to_resume` — workflow is in a transient state; user should resume explicitly first.
- `deleted` — soft-deleted; behaves identically to 404.

The state gate is enforced at the route layer (not via the dispatcher) because the dispatcher only looks at `active` and would silently drop runs for the other allowed states.

### 4.8 Activation precondition

`checkActivationPreconditions` already exempts `provider="native"` per Slice 1's NON_OAUTH_PROVIDERS skip. A workflow with `native:manual_trigger` as its trigger and any provider action node continues to gate on the action's provider being connected.

A workflow with `native:manual_trigger` + only native actions can activate without any OAuth integration — already supported by Slice 1's "skips integrations lookup entirely when every node is native" test.

### 4.9 Run-now route plan

```
app/api/workflows/[id]/run-now/route.ts          # POST handler
```

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const workflow = await workflowsRepo.getById(id);
  if (!workflow || workflow.state === "deleted") {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }
  if (workflow.userId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const stateOk =
    workflow.state === "active" ||
    workflow.state === "paused" ||
    workflow.state === "draft";
  if (!stateOk) {
    return NextResponse.json(
      { error: `Workflow state '${workflow.state}' does not accept run-now.` },
      { status: 409 },
    );
  }

  // Body parse + size cap.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > 256 * 1024) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = ManualTriggerPayloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manual trigger payload.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Locate the manual_trigger node in the workflow's draft definition.
  const triggerNode = workflow.draftDefinition.nodes.find(
    (n) => n.kind === "trigger"
      && n.provider === "native"
      && n.type === "manual.run",
  );
  if (!triggerNode) {
    return NextResponse.json(
      { error: "Workflow has no manual_trigger node." },
      { status: 422 },
    );
  }

  const event: TriggerEvent = {
    provider: "native",
    eventType: "manual.run",
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    accountId: "system",
    payload: parsed.data,
  };

  const enqueued = await enqueueRun({
    workflowId: workflow.id,
    triggerNodeId: triggerNode.id,
    event,
  });

  return NextResponse.json(
    { runId: enqueued.runId, enqueuedAt: enqueued.enqueuedAt },
    { status: 202 },
  );
}
```

**Response shapes:**

- `202 Accepted` — `{ runId: string (uuid), enqueuedAt: string (iso) }` on successful enqueue.
- `400 Bad Request` — body validation failure (Zod flatten).
- `401 Unauthorized` — `{ error: "Authentication required." }`.
- `403 Forbidden` — not the workflow owner.
- `404 Not Found` — workflow id doesn't exist or is soft-deleted.
- `409 Conflict` — workflow state forbids run-now.
- `413 Payload Too Large` — body > 256 KiB.
- `422 Unprocessable Entity` — workflow has no manual_trigger node.

**Notably absent**: 5xx for engine errors. The engine runs asynchronously after enqueue; the route returns 202 as soon as the runId is assigned. Engine failures surface in `workflow_runs.status === "failed"` and the existing notification orchestrator — not on this route's response.

### 4.10 What is NOT in Manual Trigger

- No "Test" button UI — that's a builder-UI concern; the API exists for now, builder UI lands later.
- No per-workflow cool-down / rate limit — Slice 2 trusts the workflow owner. (Owner-only auth + the workflow-level billing gate at engine entry are sufficient guards.)
- No payload schema declaration in the workflow definition. The payload is open-shape `Record<string, unknown>` — workflow authors reference `{{trigger.payload.inputs.foo}}` and the resolver returns `undefined` (→ `MissingVariableError`) when the field is absent.

---

## 5. Scheduled trigger plan

### 5.1 File layout

```
integrations/native/triggers/scheduledTrigger.ts          # registers activation hook in scheduledTriggerRegistry
integrations/native/triggers/scheduledTrigger.schema.ts   # cron + timezone schema
tests/unit/integrations/native/triggers/scheduledTrigger.test.ts
```

### 5.2 Cron expression schema

```typescript
// integrations/native/triggers/scheduledTrigger.schema.ts
export const SCHEDULED_TRIGGER_EVENT_TYPE = "schedule.fired";

export const ScheduledTriggerConfigSchema = z
  .object({
    /**
     * Standard 5-field cron expression (UTC).
     *   minute (0-59) hour (0-23) day-of-month (1-31)
     *   month (1-12 or JAN-DEC) day-of-week (0-6 or SUN-SAT)
     * Examples:
     *   "0 9 * * 1-5"       every weekday 09:00 UTC
     *   "*/15 * * * *"      every 15 minutes
     *   "0 0 1 * *"         first of every month, midnight UTC
     */
    cronExpression: z.string().min(1).max(120).refine(isValidCronExpression, {
      message: "Invalid cron expression.",
    }),
  })
  .strict();
export type ScheduledTriggerConfig = z.infer<typeof ScheduledTriggerConfigSchema>;
```

`isValidCronExpression` is exported from `services/cron/cronExpression.ts` (see §5.5). Cron presets like `@hourly` / `@daily` are NOT accepted in Slice 2 — only the 5-field form. (Easy to add later; explicit scope.)

### 5.3 Timezone behavior — NPD-N12

**Slice 2 ships UTC only.** No per-trigger timezone. Workflow authors who want "9am New York time" compute the UTC offset themselves and pin it (`"0 13 * * 1-5"` in EST, `"0 14 * * 1-5"` during DST). The shipped cron-expression validator does NOT do DST math.

Rationale:
- Per-user / per-trigger TZ requires plumbing `timezone` through the cron-next-fire calculation. The chosen cron library (NPD-N11) may or may not support this natively.
- Misalignment between user-set TZ and `timezone` semantics is a class of confusing-bug. UTC-only is unambiguous.
- Customer surface for TZ-aware scheduling is unproven in V2; revisit if/when a customer asks.

The plan flags TZ as a follow-up so the slice doesn't over-commit. **Documented as NPD-N12 in §10 for explicit acceptance.**

### 5.4 Activation behavior

At workflow activation, the trigger lifecycle calls `services/triggers/scheduledTriggerRegistry.findActivation("native", "schedule.fired")` (returns a registered fn) which:

1. Parses `cronExpression` via the chosen validator.
2. Computes `nextFireAt = computeNextFireTime(cronExpression, now)`.
3. Returns the partial config patch `{ nextFireAt: nextFireAtISO, schedulerState: "armed" }`.

The merged config is persisted on the `trigger_resources` row. The polling cron (see §5.6) reads `nextFireAt` on every tick.

The lifecycle's existing flow (`registerWorkflowTriggers` in `services/triggers/lifecycle.ts`) needs a small extension to allow native triggers to register an activation function without requiring an `integrations` row. **Proposed change**: make `ActivationContext.integration` optional. Provider activations continue to assert `integration !== null` themselves; native activations skip the lookup entirely.

### 5.5 Cron-expression validation — NPD-N11

**Open decision.** Two options:

**Option A — Add `cron-parser` as a runtime dep.** ~30 KB, well-maintained, MIT, handles DST + leap years + day-of-month vs day-of-week conflicts robustly. One new line in `package.json`. The dep is server-only and tree-shakes off the client bundle.

**Option B — Vendor in-tree.** ~150-200 LOC. Standard 5-field parser + next-fire-time math. Risks: DST math is subtle; leap-year February gotchas; day-of-month vs day-of-week is OR (not AND) when both are constrained — easy to get wrong silently.

**Recommendation: Option A (add `cron-parser` dep).** Reason: cron next-fire-time math is a textbook source of off-by-one / DST / leap-day bugs. A dedicated library with comprehensive tests is meaningfully safer than vendored code, the bundle cost is server-only, and it doesn't conflict with V2's "lean deps" rule the way a general-purpose framework would (cron is a tightly-scoped, well-defined problem).

**Locked decision recorded as NPD-N11. Implementation does NOT begin until NPD-N11 is resolved.**

In either case the slice exports a single facade:

```typescript
// services/cron/cronExpression.ts
export function isValidCronExpression(expr: string): boolean;
export function computeNextFireTime(expr: string, now: Date | number): Date | null;
```

so the choice of underlying implementation is reversible by swapping this one module.

### 5.6 Scheduler / cron integration

A new cron orchestrator parallels the existing `runPollingTriggers`:

```
services/cron/runScheduledTriggers.ts            # orchestrator
app/api/cron/run-scheduled-triggers/route.ts     # HTTP entry, auth via requireCronAuth
```

Algorithm (per cron tick):

1. Read all `trigger_resources` rows where `provider="native"` and `event_type="schedule.fired"`.
2. For each row:
   1. Skip if the row's workflow state is not `active` (defense-in-depth; the activate transition already wrote the row).
   2. Read `config.nextFireAt` (ISO string). If absent (corrupt row), log a warn and skip.
   3. If `nextFireAt > now`, skip (not yet time).
   4. If `nextFireAt <= now`:
      - Build a `TriggerEvent` (§5.7).
      - Call `dispatchTriggerEvent(event)` — runs through the existing dedup + state-gate + enqueue path.
      - Compute `newNextFireAt = computeNextFireTime(config.cronExpression, now)`.
      - Update the row's `config.nextFireAt` via `triggerResourcesRepo.upsert` (in-place; same workflow_id + node_id key).
3. Return summary `{ examined, fired, errors, startedAt }`.

The cron route uses `requireCronAuth` (same pattern as poll-triggers). Recommended Vercel cron cadence: every minute. Per-trigger work is small (one row read + maybe one dispatch + one row write); the polling cron's Promise.allSettled + concurrency-cap pattern carries over.

**Scheduler does NOT support catch-up / backfill** (NPD-N13). If a tick is missed (Vercel cron outage), only one event fires (the next `nextFireAt <= now` check). E.g., a daily 9am trigger that misses a tick at 9:00 and is evaluated at 9:05 fires once (`nextFireAt=9:00`, fire, advance to next day's 9:00). It does NOT backfill the missed-by-5-minutes window. Documented as NPD-N13.

### 5.7 TriggerEvent shape

```typescript
{
  provider: "native",
  eventType: "schedule.fired",
  eventId: `schedule.fired:${workflowId}:${nodeId}:${scheduledFireAtMs}`,
  occurredAt: <ISO timestamp at scheduler dispatch>,
  accountId: "system",
  payload: {
    scheduledFireAt: <ISO timestamp from the row's nextFireAt at dispatch>,
    cronExpression: <verbatim from config>,
    firedAt: <ISO timestamp matching occurredAt>,
  }
}
```

### 5.8 EventId / dedup strategy

`eventId` composite: `schedule.fired:<workflowId>:<nodeId>:<scheduledFireAtEpochMs>`.

Properties:
- Stable across cron retries that observe the SAME `nextFireAt` value — the dedup table catches the second attempt (`fresh: false`) so we don't double-fire.
- Unique per scheduled fire — once we advance `nextFireAt`, the next fire has a new key.
- Includes `workflowId + nodeId` so two different workflows scheduled at the same time don't collide.

Crash-after-dispatch-before-write safety: if the cron crashes after `dispatchTriggerEvent` but before persisting the new `nextFireAt`, the next tick re-reads the same `nextFireAt`, builds the SAME `eventId`, dispatch dedups (`fresh: false`), and only the row write retries. **No double-fire, no missed-fire.**

Crash-after-write-before-dispatch is the only loss scenario: row already advanced to next fire, current event never went out. This is an explicit tradeoff — the alternative (write-then-dispatch outage drops the run, dispatch-then-write outage double-fires) was rejected. With dispatch-then-write + composite eventId, the worst case is a missed fire under the very narrow window of "between dispatch return and row update crash."

### 5.9 What is NOT in Scheduled Trigger

- Per-trigger timezone (NPD-N12 — UTC only).
- Catch-up / backfill on missed runs (NPD-N13 — fires only the most recent scheduled time).
- Cron presets (`@hourly`, `@daily`, etc.) — Slice 2 ships 5-field only; presets can be added without contract changes.
- Year field (6-field cron) — same.
- Second-precision (`* * * * * *`) — minute-resolution scheduler can't observe second-level fires.

---

## 6. Native-trigger registry plan

### 6.1 Where native triggers live

`integrations/native/triggers/` (parallel to Slice 1's `integrations/native/actions/`). One file pair per trigger:

```
integrations/native/triggers/manualTrigger.{ts,schema.ts}
integrations/native/triggers/scheduledTrigger.{ts,schema.ts}
integrations/native/index.ts                          # NEW: side-effect imports for triggers
```

### 6.2 Registry mechanism

Two existing registries get the additions for native triggers without code restructuring:

- **`services/triggers/activationRegistry.ts`** — `scheduled_trigger` registers a `(native, schedule.fired)` activation function that returns `{ nextFireAt, schedulerState: "armed" }`. `manual_trigger` does NOT register here (no activation work needed — empty config is the activation result).

  **Required surface change:** make `ActivationContext.integration: IntegrationRecord | null` (currently `IntegrationRecord`). The lifecycle calls activation BEFORE looking up an integration when the provider is in NON_OAUTH_PROVIDERS. Provider activations continue to assert `integration !== null` at the top of their function bodies (small per-provider edit; ~16 call sites).

- **`services/triggers/scheduledTriggerRegistry.ts`** (NEW) — owns the scheduler-side surface that polling-handler doesn't quite fit. Single registration: `registerScheduledTrigger(eventType, { handler })`. The cron orchestrator reads from this registry; no polling-handler `canHandle` predicates needed.

  Why not extend `pollingRegistry`? The polling handler abstraction is built around "fixed interval; have I waited long enough since lastPolledAt?" Cron-driven scheduling is fundamentally a "look up the next scheduled time" model — a separate, narrower registry is cleaner than overloading the polling abstraction with cron-expression logic. (And `runPollingTriggers` keeps its 5-minute default cadence semantics; the new `runScheduledTriggers` runs at minute cadence.)

### 6.3 How trigger dispatch finds native triggers

For **manual_trigger**: dispatch is **NOT** webhook-driven. The run-now route bypasses `dispatchTriggerEvent` (which does dedup + state-gate + trigger_resources lookup) and calls `enqueueRun` directly. Reason: the run-now route already knows `workflowId + triggerNodeId` from the URL + workflow lookup; it has authenticated the caller; the workflow state gate ran at the route layer. The dedup step is a no-op (UUID per call). Going through dispatcher adds a redundant DB lookup.

For **scheduled_trigger**: dispatch IS webhook-style — the scheduler builds a TriggerEvent and calls `dispatchTriggerEvent` so the existing dedup + state-gate + per-trigger-filter (always match-all for native) + enqueue chain handles it. This is the right path because (a) it gives us the eventId-based dedup for crash safety (§5.8) and (b) the trigger_resources row is the canonical source of truth for which workflow's scheduled trigger fired.

### 6.4 How native triggers differ from provider triggers

| Concern | Provider triggers | Native triggers |
|---|---|---|
| Authentication | OAuth token decrypted from `integrations` row | None — `manual_trigger` is route-authenticated by signed-in Supabase user; `scheduled_trigger` is server-internal (cron auth) |
| ProviderManifest | Required | None |
| `integrations` row | Required (`getActiveForExecution`) | None (Slice 1 NON_OAUTH_PROVIDERS exemption) |
| Activation hook receives `integration` | Yes | No (`integration: null` via the optional-context surface change in §6.2) |
| Webhook receive route | `app/api/webhooks/<provider>/route.ts` | None — no inbound provider HTTP |
| Health check | Yes (manifest `healthCheckIntervalMs`) | None |
| Refresh / token lifecycle | Yes | N/A |
| Dispatch path | `dispatchTriggerEvent` from webhook receive | `manual` skips dispatcher; `scheduled` uses dispatcher |

---

## 7. API route plan

See §4.9 above for full route implementation. Summary:

- **Endpoint:** `POST /api/workflows/[id]/run-now`
- **Auth:** signed-in user, workflow owner only.
- **Body:** JSON, `{ inputs?: Record<string, unknown> }`, max 256 KiB.
- **Success (202):** `{ runId, enqueuedAt }`.
- **Failure shapes (matching the existing `/api/workflows/[id]/<action>` route family conventions):** `400 / 401 / 403 / 404 / 409 / 413 / 422`. No 5xx for engine-internal errors (asynchronous).

---

## 8. Execution engine impact

**Minimal.** Slice 2 does not change BFS traversal, variable resolution, edge model, error-classification shape, or step persistence. The two specific touchpoints:

1. **`enqueueRun`** is reused as-is. The run-now route and the scheduler both call it; the engine loads the workflow and seeds the variables map with `trigger` + `<triggerNodeId>` — unchanged from Slice 1.

2. **No branching, no loop scope, no pause/resume.** All three remain deferred per NPD-N4 / NPD-N5 / NPD-N6.

3. **TriggerEvent contract unchanged.** Both native triggers fit the existing `{provider, eventType, eventId, occurredAt, accountId, payload}` shape. The `payload` for `manual.run` is the user-supplied JSON; for `schedule.fired` it's the small `{scheduledFireAt, cronExpression, firedAt}` object.

4. **Engine variable resolution** continues to expose the trigger event under both `trigger` and `<triggerNodeId>`. `{{trigger.payload.inputs.foo}}` (manual) and `{{trigger.payload.scheduledFireAt}}` (scheduled) work without any engine changes.

---

## 9. Data-passing tests

Slice 2 must prove three properties (per the user brief). All are testable without engine changes.

### 9.1 Manual trigger payload feeds downstream native/provider action config

Engine-level integration test: linear graph `native:manual_trigger → native:http_request → slack:send_channel_message` where:
- `http_request.config.url = "https://example.com/{{trigger.payload.inputs.target}}"`
- `slack.config.text = "{{trigger.payload.inputs.message}}"`

Test seeds a `TriggerEvent` with `payload: { inputs: { target: "abc", message: "hi" } }`, runs the engine with stub handlers, asserts the resolver substituted both variables into the resolved config before each handler was called.

### 9.2 Scheduled trigger payload feeds downstream action

Engine-level integration test: linear graph `native:scheduled_trigger → native:format_transformer` where:
- `format_transformer.config.content = "Fired at {{trigger.payload.firedAt}} per {{trigger.payload.cronExpression}}"`

Asserts the resolved config contains both substituted values.

### 9.3 Native trigger output persists in workflow_runs.steps

Engine-level integration test asserts the recorded `steps[0]` (the trigger step) is `{ nodeId: <triggerNodeId>, status: "succeeded", output: { event: <TriggerEvent> } }` for both manual and scheduled triggers. This is the existing engine behavior — Slice 2 just confirms native triggers ride it.

### 9.4 End-to-end variable threading across all three native triggers + actions

The e2e walkthrough (§11) chains `native:manual_trigger → native:http_request → native:delay → slack:send_channel_message` AND covers a second workflow `native:scheduled_trigger → native:format_transformer → slack:send_channel_message`. Both assert variable resolution end-to-end through the dev server.

---

## 10. Unit test plan

### 10.1 `manualTrigger.test.ts` — target ~12-15 tests

| Group | Test |
|---|---|
| Schema | `ManualTriggerConfigSchema` accepts `{}` and rejects any non-empty object. |
| Payload schema | `ManualTriggerPayloadSchema` accepts `{ inputs: {} }`. |
| Payload schema | Accepts `{ inputs: { foo: 1, bar: "x", baz: { nested: true } } }`. |
| Payload schema | Defaults `inputs` to `{}` when omitted. |
| Payload schema | Rejects extension fields (`{ inputs: {}, extra: 1 }`). |
| Constants | `MANUAL_TRIGGER_EVENT_TYPE === "manual.run"`. |

### 10.2 `runNow/route.test.ts` (or integration-style under `tests/integration/api/`) — target ~15-20 tests

Route-level tests mock `requireUser`, `workflowsRepo.getById`, and `enqueueRun`:

| Group | Test |
|---|---|
| Auth | 401 when `requireUser` returns failure. |
| Auth | 403 when workflow.userId !== auth.userId. |
| Auth | 404 when workflow not found OR state === "deleted". |
| State gate | 409 when state ∈ `{ disabled, eligible_to_resume }`. |
| State gate | accepts `active`. |
| State gate | accepts `paused`. |
| State gate | accepts `draft`. |
| Body parse | 400 on invalid JSON / Zod parse failure. |
| Body parse | 413 when `content-length > 256 KiB`. |
| Body parse | Empty body defaults to `{ inputs: {} }` (uses default). |
| Trigger lookup | 422 when workflow has no manual_trigger node. |
| Trigger lookup | Finds the manual_trigger by `(kind === "trigger", provider === "native", type === "manual.run")`. |
| Happy path | 202 with `{ runId, enqueuedAt }` shape. |
| Happy path | EventId is a UUID (regex). |
| Happy path | `occurredAt` is an ISO string. |
| Happy path | `payload.inputs` is passed through unchanged. |
| Happy path | `accountId === "system"`. |
| Happy path | `triggerNodeId` matches the trigger node's id. |
| Happy path | Returns BEFORE the engine completes (response status comes back synchronously after enqueueRun). |

### 10.3 `scheduledTrigger.test.ts` — target ~12-15 tests

| Group | Test |
|---|---|
| Schema | Accepts `"0 9 * * 1-5"` (weekday morning). |
| Schema | Accepts `"*/15 * * * *"` (every 15 minutes). |
| Schema | Accepts `"0 0 1 * *"` (monthly). |
| Schema | Rejects empty string. |
| Schema | Rejects `"@hourly"` (preset — out of scope). |
| Schema | Rejects 6-field expressions. |
| Schema | Rejects expressions > 120 chars. |
| Schema | Rejects nonsense (`"foo bar baz qux quux"`). |
| Schema | Rejects unknown extension fields (`.strict()`). |
| Constants | `SCHEDULED_TRIGGER_EVENT_TYPE === "schedule.fired"`. |

### 10.4 `cronExpression.test.ts` — target ~10-12 tests

| Group | Test |
|---|---|
| `isValidCronExpression` | `"*/5 * * * *"` → true. |
| `isValidCronExpression` | `"0 9 * * MON-FRI"` → true. |
| `isValidCronExpression` | `"@daily"` → false (preset out of scope). |
| `isValidCronExpression` | Empty string → false. |
| `isValidCronExpression` | Bogus string → false. |
| `computeNextFireTime` | `"*/5 * * * *"` at `2026-05-15T12:03:00Z` → next is `2026-05-15T12:05:00Z`. |
| `computeNextFireTime` | `"0 9 * * 1-5"` at `2026-05-15T10:00:00Z` (Friday) → next is `2026-05-18T09:00:00Z` (next Monday — skips weekend). |
| `computeNextFireTime` | DST awareness check (deferred to NPD-N12 — UTC only; test asserts UTC behavior is consistent). |
| `computeNextFireTime` | Returns `null` for invalid expression. |

### 10.5 `scheduledTriggerRegistry.test.ts` — target ~8-10 tests

| Group | Test |
|---|---|
| Register | `registerScheduledTrigger` accepts the manual entry. |
| Register | Duplicate `(provider, eventType)` registration throws. |
| Find | `findScheduledTrigger` returns the registered handler. |
| Find | Returns null for unregistered keys. |
| Reset | `__resetScheduledTriggerRegistryForTests` clears state. |

### 10.6 `runScheduledTriggers.test.ts` — target ~10-12 tests

| Group | Test |
|---|---|
| Empty | Returns `{examined: 0, fired: 0, errors: 0}` when no native scheduled rows exist. |
| Skip inactive | Drops rows whose workflow state is not `active`. |
| Skip future | Skips rows where `nextFireAt > now`. |
| Fire | Row with `nextFireAt <= now` dispatches via `dispatchTriggerEvent` AND updates the row's `nextFireAt` to the next computed time. |
| Fire | EventId composite matches `schedule.fired:<workflowId>:<nodeId>:<scheduledFireAtMs>`. |
| Idempotency | Dedup outage during dispatch still updates the row's `nextFireAt` (so we don't loop). |
| Error isolation | One row's failure doesn't abort the batch. |
| Concurrency | Honors the per-tick concurrency cap. |
| Timing | Per-trigger timeout fires on stuck handlers. |
| Auth | Cron route honors `requireCronAuth` (separate route-level test if practical). |

### 10.7 Activation registry surface change — augment `preconditions.test.ts` / `lifecycle.test.ts`

| Group | Test |
|---|---|
| Lifecycle | `registerWorkflowTriggers` for a workflow with `native:scheduled_trigger` (no integration lookup) calls the activation hook with `integration: null` and merges its returned partial config. |
| Lifecycle | `registerWorkflowTriggers` for a workflow with a provider trigger still asserts `integration !== null` inside the provider's activation function (the surface change makes the field optional in the type system; provider activations enforce non-null themselves). |
| Lifecycle | Activation hook for `native:manual_trigger` is NOT called (no activation registered). The `trigger_resources` row is upserted with the empty config. |

---

## 11. E2E plan

Extend the existing Playwright walkthrough at [`tests/e2e/native-nodes-slice-1-walkthrough.spec.ts`](../../../tests/e2e/native-nodes-slice-1-walkthrough.spec.ts) with a **new spec file** `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` (separate file so Slice 1 and Slice 2 walkthroughs run independently). Spec covers two scenarios:

### 11.1 Scenario 1 — manual_trigger via run-now API

1. `beforeAll`: boot the spec-owned echo HTTP server (reuse the pattern from Slice 1's walkthrough).
2. `beforeEach`: create test user, connect Slack (for the final action).
3. Build a workflow via UI + PATCH the draft definition with `native:manual_trigger → native:http_request → native:format_transformer → slack:send_channel_message`. `http_request.config.url` references `{{trigger.payload.inputs.target}}` (a URL pointing at the spec echo server). `slack.config.text` references `{{format-transformer.transformedContent}}`.
4. Activate the workflow via UI.
5. `POST /api/workflows/<id>/run-now` with body `{ inputs: { target: "echo/json", message: "hi from manual" } }`.
6. Assert response is `202` with `{ runId }` shape.
7. Wait for `workflow_runs` row → assert `status === "succeeded"`.
8. Per-step assertions on `workflow_runs.steps[]`:
   - `manual_trigger` step has output `{ event: <TriggerEvent> }`.
   - `http_request` step has output with `bodyJson` echoing the target.
   - `format_transformer` step has output `transformedContent` containing the echoed body.
   - Slack mock recorded one `chat.postMessage` with text matching `transformedContent`.

### 11.2 Scenario 2 — scheduled_trigger via cron tick

1. Reuse the spec-owned echo HTTP server.
2. Create test user, connect Slack.
3. Build workflow with `native:scheduled_trigger → native:format_transformer → slack:send_channel_message`. Cron expression: `"*/1 * * * *"` (every minute). `format_transformer.content = "Scheduled fire at {{trigger.payload.firedAt}}"`. `slack.text = "{{format-transformer.transformedContent}}"`.
4. Activate workflow via UI. Snapshot `trigger_resources.config.nextFireAt` via supabaseAdmin helper; assert it's an ISO string in the near future.
5. **Time-travel via direct DB write:** set `trigger_resources.config.nextFireAt = <ISO 1 second ago>` to simulate the cron tick observing a due trigger. (Avoids the spec waiting an actual minute.)
6. Hit `POST /api/cron/run-scheduled-triggers` with `Authorization: Bearer $CRON_SECRET`.
7. Assert response `{ ok: true, fired: 1 }`.
8. Wait for `workflow_runs` row → assert `status === "succeeded"`.
9. Assert `trigger_resources.config.nextFireAt` has advanced to a new (later) ISO timestamp.
10. Assert Slack mock recorded one `chat.postMessage` whose text matches the expected format.

### 11.3 Schema-fail scenarios (optional, single test)

Cover route-level rejections:
- `POST /run-now` without auth → 401.
- `POST /run-now` for a workflow owned by a different user → 403.
- `POST /run-now` for a workflow without a manual_trigger node → 422.
- Scheduled-trigger workflow saved with an invalid cron expression → activation fails (`MISSING_PRECONDITIONS` lifecycle error).

Lean — single test exercising the most surprising path each. Unit tests already cover schema-level failures exhaustively.

---

## 12. Commit sequence

| # | Commit | Files touched | Approx LOC |
|---|---|---|---|
| 0 | **This plan** (`docs(native-nodes): plan tier b triggers`) | `docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md` | — (doc-only) |
| 1 | `feat(native): add manual_trigger + run-now route` | `integrations/native/triggers/manualTrigger.{ts,schema.ts}`, `app/api/workflows/[id]/run-now/route.ts`, `services/triggers/activationRegistry.ts` (optional integration), per-provider activation null-checks (~16 sites), `tests/unit/integrations/native/triggers/manualTrigger.test.ts`, `tests/unit/app/api/workflows/runNow.test.ts` (or integration), registration in `_registry.ts` if needed for trigger-side schema introspection | ~300 src + ~450 test |
| 2 | `feat(native): add cron-expression utility` (NPD-N11 dep / vendored) | `services/cron/cronExpression.ts`, `tests/unit/services/cron/cronExpression.test.ts`, possibly `package.json` (+ `package-lock.json`) | ~150 src + ~200 test |
| 3 | `feat(native): add scheduled_trigger + scheduler` | `integrations/native/triggers/scheduledTrigger.{ts,schema.ts}`, `services/triggers/scheduledTriggerRegistry.ts`, `services/cron/runScheduledTriggers.ts`, `app/api/cron/run-scheduled-triggers/route.ts`, `tests/unit/integrations/native/triggers/scheduledTrigger.test.ts`, `tests/unit/services/triggers/scheduledTriggerRegistry.test.ts`, `tests/unit/services/cron/runScheduledTriggers.test.ts` | ~450 src + ~600 test |
| 4 | `test(e2e): native-nodes slice 2 walkthrough` | `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` + supabaseAdmin helper extension for `trigger_resources` reads/updates if not present | ~500 e2e |
| 5 | `docs(native-nodes): slice 2 outcomes` | `docs/slices/parity/native-nodes-2-tier-b-triggers-outcomes.md` | — (doc-only) |

**Each commit gates locally with:**

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

No commit lands until all five gates pass. Commit 4 additionally runs:

```
CI=1 npx playwright test tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts --workers=1
```

**Approx total:** ~900 src LOC + ~1250 test LOC + ~500 e2e LOC = ~2,650 LOC. ~Slice 1 scale; smaller than Slack 2.1.

---

## 13. Open decisions

### NPD-N11 — Cron-expression validation: dep vs. vendor

**Question:** Add `cron-parser` (or equivalent) as a runtime dependency, or vendor the parser + next-fire-time calculator in-tree?

**Recommendation:** Add `cron-parser` as a server-only dep. ~30 KB, MIT, handles DST + leap years + day-of-month vs day-of-week semantics correctly. Vendoring duplicates well-known bug surfaces in an area where silent miscalculation maps directly to missed customer runs.

**Decision required before Commit 2.**

### NPD-N12 — Per-trigger timezone

**Question:** Ship scheduled_trigger with UTC-only behavior, or add a `timezone` field that takes an IANA TZ string (e.g. `"America/New_York"`)?

**Recommendation:** UTC-only in Slice 2. Per-trigger TZ requires plumbing the TZ through every next-fire calculation (which DST-aware libraries handle natively, but the surface still grows) and pre-emptively complicates the cron-expression validator. Customer surface for TZ-aware scheduling is unproven; revisit if/when a customer asks.

**Decision required before Commit 3.**

### NPD-N13 — Catch-up behavior on missed scheduled runs

**Question:** When a scheduled trigger is overdue (e.g. `nextFireAt=09:00`, scheduler observes at `09:05`), should the scheduler fire (a) only once (the most recent missed instance), or (b) every missed instance in the interim?

**Recommendation:** Option (a). A daily 9am trigger that misses its 9:00 tick due to a Vercel cron outage fires once at 9:05, then advances to next day's 9:00. Workflow authors who need backfill semantics build them into their workflow logic (the trigger payload's `scheduledFireAt` vs. `firedAt` delta is exposed). Option (b) is a "thundering herd" footgun under multi-hour outages.

**Decision required before Commit 3.**

---

## 14. Implementation expectations (locked at plan time)

These are the durable contracts the implementation commits MUST honour. Deviation requires re-acceptance of this plan.

### manual_trigger

- Empty `.strict()` config schema; payload schema is `{ inputs: Record<string,unknown> }`.
- TriggerEvent shape: `{ provider:"native", eventType:"manual.run", eventId:uuid, accountId:"system", payload: {inputs} }`.
- Run-now route: owner-only auth, workflow state ∈ `{active, paused, draft}`, body ≤ 256 KiB, response `202 {runId, enqueuedAt}`.
- No log lines from native code paths.
- No dedup-bypass; uses UUID per call so dedup is a cheap pass-through.

### scheduled_trigger

- 5-field UTC cron expressions only; presets / 6-field / second-precision rejected at schema parse.
- TriggerEvent shape: `{ provider:"native", eventType:"schedule.fired", eventId: composite, accountId:"system", payload: {scheduledFireAt, cronExpression, firedAt} }`.
- Composite `eventId` enables crash-safe replay (dedup catches double-fire; row advance retries are safe).
- Scheduler fires at minute resolution; no catch-up beyond the most recent missed instance (NPD-N13).
- UTC only (NPD-N12).

### Cron utility

- Single facade module exporting `isValidCronExpression(expr)` and `computeNextFireTime(expr, now)`.
- Underlying implementation reversible — Option A (dep) vs Option B (vendor) is a single-file swap.
- `computeNextFireTime` returns `null` for invalid expressions (never throws).

### Activation registry

- `ActivationContext.integration: IntegrationRecord | null`.
- Provider activations enforce non-null at function entry.
- Native activations work with `integration: null`.

### Scheduled-trigger registry

- New module `services/triggers/scheduledTriggerRegistry.ts`.
- API: `registerScheduledTrigger({eventType, handler})`, `findScheduledTrigger(eventType)`, `__resetScheduledTriggerRegistryForTests()`.
- Native-only at Slice 2; future providers (none planned) extend the same registry.

---

## 15. Exit checklist — Slice 2 implementation complete when:

- [ ] NPD-N11 / NPD-N12 / NPD-N13 resolved.
- [ ] All 4 new schema + handler / trigger files committed.
- [ ] `services/triggers/activationRegistry.ts` extended (optional integration); ~16 per-provider activation null-checks added.
- [ ] `services/triggers/scheduledTriggerRegistry.ts` + `services/cron/runScheduledTriggers.ts` + `services/cron/cronExpression.ts` shipped.
- [ ] `app/api/workflows/[id]/run-now/route.ts` + `app/api/cron/run-scheduled-triggers/route.ts` shipped.
- [ ] Engine / TriggerEvent / migrations / `WorkflowEdge` / WorkflowNodeKind: untouched.
- [ ] Unit test suite passes — ~75-90 new tests across the new modules + augmented activation/lifecycle tests.
- [ ] E2E walkthrough at `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` proves: run-now → engine → workflow_runs.steps shape for manual; cron-tick → engine → next-fire-advance for scheduled.
- [ ] Outcomes doc landed at `docs/slices/parity/native-nodes-2-tier-b-triggers-outcomes.md`.
- [ ] All gates green: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`, Playwright.
- [ ] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [ ] No push, no PR.
