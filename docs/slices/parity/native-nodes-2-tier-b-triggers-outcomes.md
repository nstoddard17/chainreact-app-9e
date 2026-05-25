# Native-nodes Slice 2 — Tier B triggers outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Provider audit:** [`docs/slices/parity/parity-native-nodes.md`](./parity-native-nodes.md) (accepted before Slice 1 began).
**Implementation plan:** [`docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md`](./native-nodes-2-tier-b-triggers-plan.md) (accepted before Slice 2 Commit 1 began).
**Slice 1 outcomes:** [`docs/slices/parity/native-nodes-1-tier-a-outcomes.md`](./native-nodes-1-tier-a-outcomes.md).
**V2 surface:** new [`integrations/native/triggers/`](../../../integrations/native/triggers/), [`app/api/workflows/[id]/run-now/`](../../../app/api/workflows/), [`app/api/cron/run-scheduled-triggers/`](../../../app/api/cron/), [`services/cron/cronExpression.ts`](../../../services/cron/cronExpression.ts), [`services/cron/runScheduledTriggers.ts`](../../../services/cron/runScheduledTriggers.ts), plus the parallel `NativeActivationFn` registry inside [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts).

Native Slice 2 closes the Tier B parity gap defined in the accepted audit §7: **2 native triggers** (`manual_trigger`, `scheduled_trigger`) + **2 new HTTP entry points** (`POST /api/workflows/[id]/run-now`, `POST /api/cron/run-scheduled-triggers`) + supporting registry / scheduler / cron-expression utility. Engine BFS / branching / loop / pause-resume all untouched. One new runtime dep added (`cron-parser` per accepted NPD-N11).

Largest qualitative outcomes: (1) **`POST /run-now` ships as the canonical manual-trigger entry path** (NPD-N1) with owner-only auth, body-size cap, state gate covering active/paused/draft, and asynchronous 202 response. (2) **Scheduled-trigger crash-safety lands through composite eventId + dispatch-then-advance ordering**, with the existing dedup table catching double-fire and the cursor write retrying on its own. (3) **Native activation surface is now first-class**: a parallel `NativeActivationFn` / `registerNativeActivation` / `findNativeActivation` registry was added inside `services/triggers/activationRegistry.ts` rather than weakening the provider activation contract with a nullable `integration` — zero provider activation files needed an edit. (4) **One new dep added intentionally**: `cron-parser@^5.5.0` for DST + leap-year + dow-vs-dom semantics, behind a single-file facade so the choice stays reversible.

Remaining native parity work splits into the engine-branching slice (which unblocks Tier C: `if_then_condition` + `router`) and the various deferred items (loop / wait_for_event / unbounded delay → Phase 6; AI cluster + tavily_search → Phase 5; HITL → Phase 8; parse_file / extract_website_data / generic webhook trigger → pending product signal). Six V1 orphan handlers stay PERMANENT SKIP per NPD-N10.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `ec0acbc1c` | `docs(native-nodes): plan tier b triggers` — Commit 0 (implementation plan; doc-only). |
| `1d8a7c37c` | `feat(native): add manual_trigger + run-now route` — Commit 1 (manual_trigger module + `POST /api/workflows/[id]/run-now` + 33 tests). |
| `47cf5ba74` | `feat(native): add cron-expression utility` — Commit 2 (`cron-parser` runtime dep + `services/cron/cronExpression.ts` facade + 29 tests). |
| `eedd2af00` | `feat(native): add scheduled_trigger + scheduler` — Commit 3 (scheduled_trigger module + `NativeActivationFn` parallel registry + `services/cron/runScheduledTriggers.ts` + `POST /api/cron/run-scheduled-triggers` + activation/lifecycle test augments + 42 new tests). |
| `7d7065fbf` | `test(e2e): add native nodes slice 2 walkthrough` — Commit 4 (4 Playwright scenarios covering manual + scheduled + lean failure paths). |

This doc (Commit 5) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Triggers (2 new, both native)

| Trigger | Provider | EventType | Entry path | Activation hook |
|---|---|---|---|---|
| `manual_trigger` | `native` | `manual.run` | `POST /api/workflows/[id]/run-now` | None — lifecycle persists the trigger_resources row with empty config straight from the WorkflowNode. |
| `scheduled_trigger` | `native` | `schedule.fired` | Cron tick via `POST /api/cron/run-scheduled-triggers` (minute resolution) | NativeActivationFn computes `nextFireAt` via `computeNextFireTime` at activation; orchestrator advances `nextFireAt` on every fire. |

Both registered through the new parallel native-activation seam at [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts) (`registerNativeActivation` / `findNativeActivation`). manual_trigger doesn't register one; scheduled_trigger does, at module import.

### HTTP routes (2 new)

| Route | Auth | Method | Purpose |
|---|---|---|---|
| `POST /api/workflows/[id]/run-now` | `requireUser()` (signed-in) + workflow-owner check | POST | Manual-trigger entry path. Body `{inputs?: Record<string,unknown>}`, max 256 KiB. Returns 202 `{runId, enqueuedAt}`. |
| `POST /api/cron/run-scheduled-triggers` (and GET for Vercel cron) | `requireCronAuth` (Bearer `$CRON_SECRET`) | GET + POST | Scheduled-trigger cron entry. Returns 200 `{ok, examined, fired, skipped, errors, startedAt}`. |

### Runtime modules

| Module | Purpose |
|---|---|
| [`integrations/native/triggers/manualTrigger.{ts,schema.ts}`](../../../integrations/native/triggers/) | Constants + config schema + payload schema. |
| [`integrations/native/triggers/scheduledTrigger.{ts,schema.ts}`](../../../integrations/native/triggers/) | Constants + config schema + stored-config schema + activation hook registration. |
| [`services/cron/cronExpression.ts`](../../../services/cron/cronExpression.ts) | Single facade around `cron-parser`. Exports `isValidCronExpression` + `computeNextFireTime`. |
| [`services/cron/runScheduledTriggers.ts`](../../../services/cron/runScheduledTriggers.ts) | Cron orchestrator. Promise.allSettled with concurrency 5, per-row 25s timeout, no catch-up. |

### Surface changes

| Module | Change |
|---|---|
| [`services/triggers/activationRegistry.ts`](../../../services/triggers/activationRegistry.ts) | Added `NativeActivationContext` (no `integration` field), `NativeActivationFn`, `registerNativeActivation`, `findNativeActivation`. `__resetActivationRegistryForTests` clears BOTH registries. Provider surface UNCHANGED. |
| [`services/triggers/lifecycle.ts`](../../../services/triggers/lifecycle.ts) | `registerWorkflowTriggers` now consults `findNativeActivation` FIRST; falls through to the existing provider activation path on miss. |
| [`integrations/_registry.ts`](../../../integrations/_registry.ts) | Added side-effect `import "./native/triggers/scheduledTrigger"` so the native activation hook registers at module load. |
| `package.json` / `package-lock.json` | Added `cron-parser@^5.5.0` (MIT, ~30 KB, server-only). |

### Tests (new)

| File | Tests |
|---|---|
| `tests/unit/integrations/native/triggers/manualTrigger.test.ts` | 15 |
| `tests/unit/app/api/workflows/runNow-route.test.ts` | 18 |
| `tests/unit/services/cron/cronExpression.test.ts` | 29 |
| `tests/unit/integrations/native/triggers/scheduledTrigger.test.ts` | 17 |
| `tests/unit/services/cron/runScheduledTriggers.test.ts` | 10 |
| `tests/unit/app/api/cron/run-scheduled-triggers.route.test.ts` | 7 |
| `tests/unit/services/triggers/activationRegistry.test.ts` (+5 new) | 12 total (5 added in Slice 2) |
| `tests/unit/services/triggers/lifecycle.test.ts` (+3 new) | total grew by 3 |
| `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` | 4 Playwright scenarios |

**Slice 2 new unit tests: 101 added. New e2e scenarios: 4.**

### File system

New top-level directory [`integrations/native/triggers/`](../../../integrations/native/triggers/) parallel to Slice 1's `integrations/native/actions/`. New cron orchestrator + route under existing `services/cron/` + `app/api/cron/` patterns. No structure-test exemptions needed beyond Slice 1's `NON_PROVIDER_ROOTS = new Set(["native"])`. All leaf folders well under 50 files.

### Database changes

**None.** Slice 2 stores scheduled-trigger state inside the existing `trigger_resources.config` JSONB column (`nextFireAt` + `schedulerState` fields appended at activation). No migrations.

---

## 3. Durable decisions worth preserving

### 3.1 NPD-N1 — manual_trigger API shape locked at `POST /api/workflows/[id]/run-now`

Accepted before Commit 1 began. Owner-only auth, JSON body `{inputs?: Record<string,unknown>}`, 256 KiB cap, async 202 response. Bypasses `dispatchTriggerEvent` (calls `enqueueRun` directly) since the route already has the workflow, trigger node, and authenticated caller — going through the dispatcher would just add a redundant `trigger_resources` lookup and burn cycles on dedup (each call gets a fresh UUID anyway).

### 3.2 NPD-N11 — cron-parser dep over vendor

Accepted before Commit 2 began. `cron-parser@^5.5.0`, MIT, ~30 KB, server-only. Reversible behind a single-file facade at [`services/cron/cronExpression.ts`](../../../services/cron/cronExpression.ts) that exports exactly two functions (`isValidCronExpression` + `computeNextFireTime`). Anything outside this module imports those; nothing else touches `cron-parser` directly. **Rule:** if cron-parser ever needs replacing (lockfile audit, license change, etc.), the swap is one file.

### 3.3 NPD-N12 — UTC only

Accepted before Commit 3 began. `cronExpression.ts` passes `{ tz: "UTC" }` on every parse call. The 5-field validator pre-tokenizes to reject presets (`@hourly` / `@daily`) + 6-field (second-precision) BEFORE cron-parser ever sees the string, so cron-parser's permissive default behavior doesn't leak through. Workflow authors who want local-time scheduling encode the UTC offset manually (`"0 13 * * 1-5"` for 9am EST). Per-trigger timezone field deferred — revisit if/when a customer asks.

### 3.4 NPD-N13 — single-fire only (no catch-up)

Accepted before Commit 3 began. The orchestrator computes `newNextFireAt = computeNextFireTime(expr, now)` after firing — NOT `computeNextFireTime(expr, scheduledFireAt)`. A 2-hour cron outage on an hourly trigger fires once at the recovery tick and advances to the next future fire; it does NOT replay every missed instant. Workflow authors who need backfill semantics build them in the workflow via `{{trigger.payload.firedAt}}` vs `{{trigger.payload.scheduledFireAt}}` delta.

### 3.5 Native activation surface is a parallel registry, not a nullable integration

The plan §6.2 proposed making `ActivationContext.integration: IntegrationRecord | null` and adding ~16 per-provider null-checks at activation entry. Actual call-site count was 31. Each would have weakened the provider activation contract by forcing a top-of-function null-guard.

**Shipped instead:** a parallel `NativeActivationContext` / `NativeActivationFn` / `registerNativeActivation` / `findNativeActivation` surface inside the same module. Lifecycle calls `findNativeActivation` first; falls through to existing provider path on miss. **Zero per-provider edits.** Documented in Commit 3.

**Rule for future non-OAuth pseudo-providers:** register via `registerNativeActivation`. Don't extend the provider `ActivationFn` type.

### 3.6 scheduledTriggerRegistry.ts dropped as YAGNI

The plan §6.2 also called for a separate `services/triggers/scheduledTriggerRegistry.ts` for scheduler-side dispatch lookup. Slice 2 ships exactly ONE scheduled-trigger type (`native:schedule.fired`); a registry with one entry is unnecessary indirection. The orchestrator hardcodes the (provider, eventType) pair directly. The "native-trigger registry" requirement from the user's accepted scope is satisfied by the `NativeActivationFn` parallel registry above.

**Rule:** if a SECOND scheduled-trigger type ever lands (e.g. a different provider also wants cron-driven dispatch), refactor `runScheduledTriggers.ts` to consult a registry then. Don't pre-empt.

### 3.7 Composite eventId for scheduled triggers

`eventId = "schedule.fired:<workflowId>:<nodeId>:<scheduledFireAtMs>"`. Stable across retries that observe the SAME `nextFireAt`; unique once the orchestrator advances. The existing `dispatch.markSeen("native", eventId)` dedup catches double-fire after a crash between dispatch return and cursor advance — only the row-write retries. Crash safety without any new infrastructure.

### 3.8 Dispatch-then-advance ordering

The orchestrator dispatches FIRST, then computes + persists the new `nextFireAt`. This means a crash after dispatch but before the row write retries safely (the same eventId hits the dedup table → no double-fire; only the cursor update is retried on the next tick). The alternative (advance-then-dispatch) would drop runs on the failure path. Documented inline in `runScheduledTriggers.ts`.

### 3.9 Run-now state gate: {active, paused, draft}

Manual run-now accepts workflows in active / paused / draft. Rationale:
- `active` — obvious.
- `paused` — user explicitly paused automated triggers but still wants ad-hoc test runs.
- `draft` — testing during builder iteration IS the whole point.

Rejected: `disabled` (platform flagged a hard problem; surfacing runs hides it) / `eligible_to_resume` (transient — user should resume explicitly) / `deleted` (treats as 404).

The state gate runs at the route layer because `dispatchTriggerEvent` only accepts `active` and would silently drop runs for the other accepted states.

### 3.10 Route auth: `requireUser` + owner-only check; RLS surfaces 404 for non-owners

The route reads `workflowsRepo.getById` which uses the SSR client (RLS-aware). Non-owners can't see the row → route returns 404, NOT 403. This is the correct security posture (don't disclose existence). The e2e accepts {403, 404} to remain robust to future refactors that might surface "owner mismatch" explicitly.

### 3.11 No log lines from native trigger code paths

Same rule as Slice 1's actions. The cron route + orchestrator log structured events only on warnings (malformed config) / errors (per-row timeout, no-future-fire). The handler-level activation hook is silent. Engine-layer logging captures the run lifecycle.

### 3.12 Body size cap enforced at content-length header, not at .text()

The run-now route reads `request.headers.get("content-length")` and bails with 413 if > 256 KiB BEFORE calling `request.text()` / `.json()`. Streaming a multi-MiB body just to reject it later is wasteful and exposes the server to denial-of-resource. Header check is O(1).

### 3.13 Cron expression: 5-field UTC pre-tokenization, then cron-parser

The facade rejects presets / 6-field / nonsense via a pre-tokenization check (split on whitespace, length === 5, no `@` prefix) before handing the trimmed expression to `cron-parser`. cron-parser's permissive default (accepts presets + 6-field) is intentionally narrower in our facade. Zod's `.refine` consumes the boolean cleanly without try/catch.

### 3.14 Strictly-after next-fire semantics

`cron-parser`'s `.next()` returns the first fire **strictly** greater than `currentDate`. This is the right semantics for scheduler advancement: after firing at T, the next fire must be strictly later than T so we don't re-emit the same scheduled instant. Asserted by the unit test "May 1st 00:00 exactly → returns June 1st".

### 3.15 e2e auth seam: `page.request`, not `request`

Surfaced during Slice 2 e2e debugging. Playwright's top-level `request` fixture doesn't share session cookies with `page`. Authenticated route calls (POST /run-now, POST /activate) must use `page.request`. Webhook POSTs (which carry their own HMAC sig) can use `request`. Slice 1 didn't hit this because it only used `request` for the signed Slack webhook.

**Rule for future native / authenticated e2e tests:** use `page.request` for anything that requires the user session.

---

## 4. V1 native rot inventory status after Slice 2

Audit-numbered rows from [`parity-native-nodes.md`](./parity-native-nodes.md) §8. Updated status:

| ID | Pattern | Status after Slice 2 |
|---|---|---|
| N-R7 | No scheduled trigger in V1 | **CLOSED in Slice 2 Commit 3** — V2 ships `native:scheduled_trigger` (5-field UTC, NPD-N2 net-new feature). |
| (others) | Per Slice 1 outcomes | Unchanged. N-R1-R6 + N-R8-R12 status as documented in Slice 1 outcomes. |

---

## 5. Test totals

### Slice 2 unit tests added

| Suite | Tests |
|---|---:|
| `manualTrigger.test.ts` | 15 |
| `runNow-route.test.ts` | 18 |
| `cronExpression.test.ts` | 29 |
| `scheduledTrigger.test.ts` | 17 |
| `runScheduledTriggers.test.ts` | 10 |
| `run-scheduled-triggers.route.test.ts` | 7 |
| `activationRegistry.test.ts` (Slice 2 additions) | 5 |
| `lifecycle.test.ts` (Slice 2 additions) | 3 |
| **Slice 2 unit total** | **104** |

Native-focused jest suites after Slice 2 (combined Slice 1 + Slice 2):
**6 + 6 = 12 suites; 173 + 104 = 277 tests, all passing.**

### Slice 2 e2e scenarios added

| Spec | Scenarios |
|---|---|
| `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` | 4 — manual + scheduled + lean failure (422 + 404 vs 403) + invalid-cron-fails-activation |

Playwright runtime: **40.8 s** for all 4, `--workers=1`.

### Full project totals after Slice 2

- `npm test`: **7389 / 7389 passing** (delta: +252 over the Slice 2 plan commit `ec0acbc1c`; mix of native + parallel-chat additions).
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (1 pre-existing max-lines warning at `services/execution/handlers/_registry.ts`).
- `npm run lint:structure`: OK.
- `npm run lint:migrations`: OK.

---

## 6. What remains for Phase 2 native-nodes

### Engine-branching slice (prerequisite for Tier C)

- `WorkflowEdge.label?: string` widening.
- `ActionHandlerResult.branchTaken?: string | null` widening.
- Label-aware BFS in `services/execution/engine.ts`.
- Skip-rest semantics when `branchTaken: null`.

Estimated effort: ~3-4 commits per audit §12.

### Slice 3 — Tier C native control-flow (after engine branching)

- `native:if_then_condition` (single-branch with skip-rest).
- `native:router` (N-label generalization).

Estimated effort: ~4 commits per audit §12.

### Deferred — NOT Phase 2 scope

- `loop` (NPD-N5 — Phase 6).
- `wait_for_event` (Phase 6).
- Unbounded / durable `delay` (NPD-N6 — Phase 6).
- AI cluster `ai_agent` + 7 sub-actions + `tavily_search` (NPD-N7 — Phase 5).
- `hitl_conversation` (NPD-N8 — Phase 8).
- `parse_file` / `extract_website_data` (NPD-N9 — pending product signal).
- Generic webhook trigger (NPD-N3 — pending product signal).
- 6 V1 orphan handlers (NPD-N10 — PERMANENT SKIP).
- Per-trigger timezone for scheduled_trigger (NPD-N12 follow-up — revisit on customer ask).
- Catch-up / backfill on missed scheduled runs (NPD-N13 follow-up — revisit on customer ask).
- SSRF / private-network hardening for `http_request` (deferred to a dedicated hardening slice).

---

## 7. Cross-chat coordination notes

Slice 2 ran alongside an active **Outlook Mail 2.3** chat that was concurrently:
- Adding new Outlook trigger types (`email_sent`, `email_flagged`).
- Adding new Outlook actions (`fetch_emails`, `get_attachment`).
- Editing `integrations/_registry.ts`, `services/execution/handlers/_registry.ts`, and `tests/e2e/helpers/mockMicrosoftServer.ts`.

Coordination observations:

1. **No registry sweeps this slice.** Unlike Slice 1 Commit 2 (which accidentally swept Outlook fetch_emails registry lines), every Slice 2 commit landed with only native-related staged paths. The pre-commit `git diff --cached <file>` check pattern from Slice 1's corrective `ed50446f7` has become a durable habit.

2. **Echo server duplicated inline in spec** rather than extracted to `tests/e2e/helpers/`. Slice 1 already established this pattern; Slice 2 kept it for the same reason — `tests/e2e/helpers/mockMicrosoftServer.ts` was actively being edited by the Outlook chat.

3. **`integrations/_registry.ts` parallel edits intercepted twice.** Slice 2 Commit 3 originally edited the file to add `import "./native/triggers/scheduledTrigger"`; a parallel agent's edits temporarily reverted that line. Re-applying was straightforward (1-line addition; explicit path staging gave a clean diff).

4. **Port-conflict cleanup on e2e runs.** When the user has a manual `npm run dev` running on port 3001 AND prior playwright runs left mock servers on 9876-9886, fresh `CI=1 npx playwright test` fails to start. Cleanup via `Get-NetTCPConnection -LocalPort N -State Listen | Stop-Process` is necessary. This is operational, not code-side.

**Durable rule:** before every commit, run `git diff --cached <each-staged-file>` and skim for unintended hunks. Slice 1's corrective commit cost is the warning shot — same-file concurrent edits ARE going to happen.

---

## 8. Exit checklist

- [x] NPD-N11 / NPD-N12 / NPD-N13 resolved before implementation.
- [x] All 2 new trigger modules + schemas + activation hook committed.
- [x] `services/triggers/activationRegistry.ts` extended with `NativeActivationFn` parallel registry.
- [x] `services/triggers/lifecycle.ts` consults native registry first.
- [x] `services/cron/cronExpression.ts` + `services/cron/runScheduledTriggers.ts` shipped.
- [x] `app/api/workflows/[id]/run-now/route.ts` + `app/api/cron/run-scheduled-triggers/route.ts` shipped.
- [x] `integrations/_registry.ts` side-effect import wired.
- [x] `cron-parser@^5.5.0` added with single-file facade.
- [x] Engine / TriggerEvent / migrations / WorkflowEdge / WorkflowNodeKind: UNCHANGED.
- [x] Unit test suite passes — 104 new native-focused tests across the new modules + augmented activation / lifecycle.
- [x] E2E walkthrough at `tests/e2e/native-nodes-slice-2-triggers-walkthrough.spec.ts` proves: run-now → engine → workflow_runs shape for manual; cron-tick → engine → next-fire-advance for scheduled; lean failure coverage.
- [x] Outcomes doc (this file) landed.
- [x] All gates green: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test` (7389 / 7389), `npx playwright test` (4 / 4).
- [x] No `git add .` — every commit uses explicit path staging on `v2-provider-port-local`.
- [x] No push, no PR.

**Native Slice 2 complete. Next: engine-branching slice (Tier C prerequisite) once Marcus signals to start.**
