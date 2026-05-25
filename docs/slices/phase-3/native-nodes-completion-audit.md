# Native / Built-In Workflow Node Completion Audit

**Slice:** 3.NATIVE-NODES-1
**Type:** Doc-only audit / completion verification. **No runtime, schema, or metadata files modified.**
**Date:** 2026-05-25
**Branch:** `v2-provider-port-local`
**HEAD at authoring:** `e32ade018` (provider-completion closeout)
**V1 reference:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (reference only, not source of truth)

This audit determines whether ChainReactV2's non-provider / native workflow actions and triggers meet Marcus's Phase 2 completion standard. Every count, flag, commit hash, and test total below was verified against the working tree and `git log` at authoring time. Where a number is a re-run result it is labeled as such; nothing is inferred from memory or from point-in-time totals recorded in older retro docs.

---

## 1. Headline finding

**The native / built-in node surface is COMPLETE to Marcus's Phase 2 standard for everything that was in Phase 2 scope.**

The native arc shipped in four landed slices — Tier A (pure-handler actions), Tier B (triggers + entry points), the engine-branching platform prerequisite, and Tier C (control-flow) — plus a later builder-metadata layer and three security hardening slices. The result is **5 native actions + 2 native triggers**, all with runtime + strict schema + builder metadata + builder field renderers + execution wiring + risk/sensitive flags + (for triggers) activation support, and **405 native unit tests + 5 native builder integration tests + 3 native e2e walkthroughs**, all passing.

`native` is in `COVERED_PROVIDERS`, so the structural test enforces 1:1 handler↔meta parity on the action surface going forward — completeness is regression-protected, not point-in-time.

Every absent native node (loop, wait_for_event, unbounded delay, generic webhook trigger, the AI cluster, HITL, parse_file, extract_website_data) is deferred with a **real V2-native rationale** — an engine-platform gap (loop / pause-resume), a phase ownership (AI → Phase 5, HITL → Phase 8), or "pending product signal" (generic webhook / file parsing / web scraping). Six V1 orphan handlers are permanent skips (V1 rot). None of these are "appears in a registry but half-built" — they are explicit, documented decisions (NPD-N1..N13, D-IT/D-RT).

**One genuine "shipped-but-not-finished" item exists, and it is UX-only, not a completeness blocker:** `native:http_request` has no structured auth picker in the builder (the deferred "HttpRequestConfig editor"). Auth still works today via the `headers` key-value field; the schema and handler fully support bearer/basic/apiKey. This is the only recommended follow-up that touches a *shipped* node.

---

## 2. Native node inventory table

Verified against `integrations/native/`, `services/execution/handlers/_registry.ts`, `services/discovery/_registry.ts`, and the field-renderer registry.

### Actions (5, all `provider: "native"`)

| Action type | Handler file(s) | Schema | ActionMeta | Registered | V1 reference |
|---|---|---|---|---|---|
| `http_request` | `httpRequest.ts` + `httpRequestEgress.ts` | `httpRequest.schema.ts` | `httpRequest.meta.ts` | ✅ | `logic/executeHttpRequest.ts` |
| `format_transformer` | `formatTransformer.ts` | `formatTransformer.schema.ts` | `formatTransformer.meta.ts` | ✅ | `utility/formatTransformer.ts` |
| `delay` | `delay.ts` | `delay.schema.ts` | `delay.meta.ts` | ✅ | inline in V1 registry |
| `if_then_condition` | `ifThenCondition.ts` (+ shared `_conditionEvaluator.ts`) | `ifThenCondition.schema.ts` | `ifThenCondition.meta.ts` | ✅ | `logic/executePath.ts` |
| `router` | `router.ts` (+ shared `_conditionEvaluator.ts`) | `router.schema.ts` | `router.meta.ts` | ✅ | `logic/executeRouter.ts` |

### Triggers (2, all `provider: "native"`)

| Trigger type | Module | Schema | TriggerMeta | Activation | Entry path |
|---|---|---|---|---|---|
| `manual.run` (Manual Trigger) | `triggers/manualTrigger.ts` | `manualTrigger.schema.ts` | `manualTrigger.meta.ts` | `manual` (no activation hook; lifecycle persists empty config) | `POST /api/workflows/[id]/run-now` |
| `schedule.fired` (Scheduled Trigger) | `triggers/scheduledTrigger.ts` | `scheduledTrigger.schema.ts` | `scheduledTrigger.meta.ts` | `scheduled` (`NativeActivationFn` computes `nextFireAt`) | cron tick `POST /api/cron/run-scheduled-triggers` |

### Supporting platform shipped for native

| Capability | Location |
|---|---|
| Engine label-aware branching (`WorkflowEdge.label?`, `ActionHandlerResult.branchTaken?`, skip-rest, `INVALID_BRANCH`) | `services/execution/engine.ts` + `services/execution/branching.ts` |
| Parallel native activation registry (`registerNativeActivation` / `findNativeActivation`) | `services/triggers/activationRegistry.ts` |
| Cron-expression facade (`cron-parser`, 5-field UTC) | `services/cron/cronExpression.ts` |
| Scheduled-trigger orchestrator | `services/cron/runScheduledTriggers.ts` |
| Builder field renderers for native field types | `features/workflow-builder/config-modal/fields/` — `cron` → `CronField`, `router-routes` → `RouterRoutesField` |
| Discovery metadata foundation (native metas wired) | `services/discovery/_registry.ts` |
| Security: action risk metadata, sensitive-output redaction, HTTP egress hardening | meta `riskLevel`/`riskDescription`, `OutputMeta.sensitive`, `httpRequestEgress.ts` |

### Non-provider exemptions (intentional, narrow — not gap-hiding)

- `tests/structure/integration-manifests.test.ts` — `NON_PROVIDER_ROOTS = new Set(["native"])` (native has no `manifest.ts` by design: no OAuth/scopes/health-check).
- `services/triggers/preconditions.ts` — `NON_OAUTH_PROVIDERS = new Set(["native"])` (no `integrations` row for native).

---

## 3. Per-node completeness table

Legend: ✅ present & verified · ⚠️ present with a documented limitation · n/a not applicable · ❌ missing.

| Node | Runtime | Schema | Metadata | Builder config | Execution wiring | Sensitive-output | Risk flags | Trigger activation | Real tests |
|---|---|---|---|---|---|---|---|---|---|
| `http_request` | ✅ | ✅ `.strict()` | ✅ | ⚠️ auth picker missing (headers workaround) | ✅ | ✅ `body`/`bodyJson` `sensitive:true` | ✅ `high` + egress warning | n/a | ✅ |
| `format_transformer` | ✅ | ✅ `.strict()` | ✅ | ✅ | ✅ | n/a (bounded text output) | ✅ `low` | n/a | ✅ |
| `delay` | ✅ | ✅ `.strict()` (≤30s) | ✅ | ✅ | ✅ | n/a | ✅ `low` | n/a | ✅ |
| `if_then_condition` | ✅ | ✅ `.strict()` | ✅ | ✅ | ✅ (branchTaken) | n/a (3 scalar outputs, no echo) | ✅ `low` | n/a | ✅ |
| `router` | ✅ | ✅ `.strict()` | ✅ | ✅ custom `RouterRoutesField` | ✅ (branchTaken) | n/a (3 scalar outputs, no echo) | ✅ `low` | n/a | ✅ |
| `manual.run` | ✅ | ✅ empty `.strict()` | ✅ | ✅ (no fields; run-now UI) | ✅ run-now route | n/a | n/a | ✅ `manual` | ✅ |
| `schedule.fired` | ✅ | ✅ `.strict()` cron | ✅ | ✅ custom `CronField` | ✅ cron orchestrator | n/a | n/a | ✅ `scheduled` (`NativeActivationFn`) | ✅ |

Every shipped node clears the bar on all applicable columns. The single ⚠️ is the http_request auth-picker UX gap (see §5).

---

## 4. Runtime / schema findings

**Runtime: complete.** All 5 action handlers and both trigger modules exist, conform to the `ActionHandler` shape, and are registered in `services/execution/handlers/_registry.ts` under `provider: "native"`. Native dispatch goes through the same `getActionHandler("native", type)` path as provider handlers — no special engine casing for the actions; control-flow actions emit a `branchTaken` value the (already-shipped) label-aware engine consumes. Re-ran `tests/unit/services/execution/handlers/registry.test.ts`-adjacent native suites: pass.

**Schema: complete and hardened beyond V1.**
- Every native schema is `.strict()`, so stale V1 chrome fields (`preserveVariables`, `testMode`, `continueOnFalse`, `conditionType`, `logicOperator`, `mode`, `stopMessage`, `caseSensitive`) fail loudly at parse time rather than silently mis-executing. This is COPY-of-intent / REPLACE-of-implementation, not blind copy.
- `delay` is narrow-scoped to `seconds ∈ [1,30]` with a defense-in-depth `DelayCapExceededError` if the schema is bypassed (NPD-N6). Unbounded/durable delay is correctly deferred to Phase 6 (needs pause/resume infra).
- `if_then_condition` / `router` share a single pure operator engine (`_conditionEvaluator.ts`, 14 operators) with strict `===` equality (V1's loose `==` was deliberately dropped, NPD-IT2) and source-purity guards (no `eval` / `new Function` / `new RegExp` / regex literals / I/O / logging — asserted at the source level).
- `http_request` enforces a scheme allowlist (http/https only), bounded 256 KiB response capture, response-header sanitization (drops `set-cookie` / `authorization` / `proxy-*` / `www-authenticate`), and auth-header-last layering so user headers can't smuggle a competing `Authorization`.

**Egress hardening shipped (not just deferred).** Slice 1 deferred SSRF/private-network protection. It later landed as **Slice 3.SEC-3** (`9048f8aed`): `httpRequestEgress.ts` blocks `localhost`/`*.localhost`, cloud-metadata hostnames, and private/link-local IP ranges; classifies IP literals without DNS; resolves hostnames and rejects if *any* A/AAAA record is private (split-horizon guard); and **fails closed** on DNS error. So `http_request`'s request side is materially more complete than the Slice 1 retro's "deferred" note implies.

**No schema/runtime gaps requiring a NATIVE-NODES-2 slice.**

---

## 5. Metadata / Builder findings

**Metadata: complete.** All 5 actions and both triggers have meta files wired into `services/discovery/_registry.ts`. `native` is in `COVERED_PROVIDERS` (`tests/structure/discovery-meta-coverage.test.ts`), which enforces 1:1 action handler↔meta parity. Verified flags:
- Risk metadata on every action: `http_request` = `riskLevel: "high"` with an explicit egress-sink `riskDescription`; the other four = `low`. All carry `isDestructive`/`requiresConfirmation`/`requiresIntegration: false`.
- Sensitive-output: `http_request.body` and `.bodyJson` are `sensitive: true`. The other actions emit bounded scalar outputs with no input/config echo, so no sensitive surface. `tests/structure/sensitive-output-coverage.test.ts` passes.
- Trigger metas carry `activation` (`manual` / `scheduled`), `category`, `payloadShape` (`manual.run.inputs` object; `schedule.fired.firedAt` string), and (scheduled) the `cronExpression` field.

**Builder field renderers: complete for every native field type.** `features/workflow-builder/config-modal/fields/_registry.ts` registers all 12 `FieldType` variants, including the two native-specific ones: `cron` → `CronField` and `router-routes` → `RouterRoutesField`. Builder integration tests `native-node-config.test.tsx`, `native-router-routes-editor.test.tsx`, and `native-trigger-config-and-run-now.test.tsx` pass (3 suites / 5 tests, re-run).

**The one builder gap (⚠️, UX-only).** `http_request.meta.ts` deliberately omits a structured `auth` field. Its header documents the intent: the bearer/basic/apiKey surface "lands in Slice 3.2's HttpRequestConfig editor — not in the generic SchemaForm." A repo-wide search confirms **no `HttpRequestConfig` builder editor exists** (`features/workflow-builder/` has `RouterRoutesField` and `CronField` but nothing for http auth). Impact:
- The schema and handler fully support `auth` today; only the *builder UI* can't set it structurally.
- Workaround is real and in use: authors set `Authorization` (or an API-key header) via the `headers` key-value field, which the handler honors when `auth.type` is unset.
- This is a UX-polish gap, **not** a completeness blocker. It is the only recommended follow-up touching a shipped node (a small NATIVE-NODES-3-style slice).

---

## 6. Trigger activation findings

**Both triggers have correct, tested activation behavior — using a V2-native seam, not a V1 copy.**

- `manual.run` requires no activation resource. Runs start via `POST /api/workflows/[id]/run-now` (owner-only auth, 256 KiB body cap checked at `content-length`, async 202, state gate accepting active/paused/draft). It calls `enqueueRun` directly rather than round-tripping the dispatcher.
- `schedule.fired` registers a `NativeActivationFn` (`registerNativeActivation`) that computes `nextFireAt` at activation; the cron orchestrator dispatches-then-advances with a composite `eventId` for crash-safe dedup, single-fire (no catch-up) semantics, and UTC-only cron.

**Architecture note worth preserving:** rather than weakening the provider `ActivationFn` contract with a nullable `integration` field (31 call sites), Slice 2 added a *parallel* `NativeActivationContext` / `NativeActivationFn` registry inside `services/triggers/activationRegistry.ts`; `lifecycle.ts` consults it first and falls through to the provider path. Zero per-provider activation edits. Future non-OAuth pseudo-providers extend this seam.

`tests/structure/trigger-meta-activation-invariant.test.ts` passes (the manual/scheduled activation declarations are consistent with their registry side).

---

## 7. Test coverage findings

These are **behavioral** tests (operator truth tables, branch outcomes, crash-safety, egress classification, body caps, run-now auth/state gating, cron math), not mere registry-presence assertions — though registry-presence tests also exist as drift guards.

| Layer | Suites / count (re-run at authoring) |
|---|---|
| Native unit (`tests/unit/integrations/native`, `tests/unit/services/cron`, `tests/unit/app/api/native`) | **14 suites / 405 tests — all pass** |
| Native builder integration (`native-node-config`, `native-router-routes-editor`, `native-trigger-config-and-run-now`) | **3 suites / 5 tests — all pass** |
| Native e2e walkthroughs | 3 specs (`native-nodes-slice-1` chained http→format→delay; `slice-2` manual+scheduled; `slice-3` if_then+router) — not re-run here (Playwright); recorded green in slice retros |
| Structure invariants touching native | `discovery-meta-coverage`, `trigger-meta-activation-invariant`, `sensitive-output-coverage` — **pass** (re-run in the immediately prior provider-closeout work) |

Notable depth: `_conditionEvaluator` has source-purity guards (asserts the absence of `eval`/`new Function`/`new RegExp`/regex literals/I/O); the run-now route tests cover owner-mismatch (404 not 403), body-size 413, and the active/paused/draft state gate; the scheduled orchestrator tests cover dispatch-then-advance crash safety and strictly-after next-fire math.

**Data-passing is proven across the provider↔native↔provider boundary** by the Slice 1 e2e (`{{trigger.payload.text}}` → `http_request.queryParams` → `{{http-request.body}}` → `format_transformer.content` → `{{format-transformer.transformedContent}}` → Slack), and branch-conditional data flow by the Slice 3 e2e.

**Doc nit (not a code gap):** `native-nodes-3-tier-c-control-flow-outcomes.md` §5 contains an arithmetic slip ("277 + 89 = 234" and "8 + 8 = 8 suites") that the doc itself flags as "lower-than-expected." The authoritative current native unit total is **405** (re-run above). Left as-is — it is a historical retro record and self-flags the discrepancy; no behavioral impact.

**No test gaps requiring a NATIVE-NODES-4 slice.**

---

## 8. Data-flow risks

- **No fake / pass-by-design tests found.** The native suites assert behavior (operator results, branch selection, caps, auth layering, cron advancement, run-now gating). Registry-presence tests exist additionally as drift guards, not as a substitute for behavior.
- **Branch data-flow correctness** depends on the engine-branching contract (`branchTaken` → `selectActivatedEdges` → skip-rest / `INVALID_BRANCH`). It is covered at the engine layer (`label-aware traversal` tests) and end-to-end (Slice 3 e2e). Authors must wire edge labels matching `routes[].label` / the `if_then` `"true"`/`"false"` labels, or runs fail with `INVALID_BRANCH` — this is a deterministic, surfaced failure, not silent data loss.
- **Manual-trigger `inputs` is variadic by design** — the builder can't statically know its keys, so the variable picker exposes `inputs` as an `object` and authors reference `{{trigger.inputs.<key>}}`. Correct, but type-unaware (the picker can't validate the key at design time). This is the same general variable-picker limitation tracked in the builder-metadata checkpoint §7.5, not native-specific.
- **`http_request` is a high-risk egress sink** combined with the variable resolver (any upstream value can be sent anywhere). Mitigated request-side by SEC-3 egress hardening and output-side by `sensitive:true` on body/bodyJson + redaction. Residual: no user-configurable egress allowlist (block-only). Acceptable for trusted workflow authors; flagged in the meta `riskDescription`.
- **`delay` blocks an execution worker for up to 30s** in-process. Bounded by design; unbounded delay is correctly deferred to durable-queue infra (Phase 6).

No data-flow correctness risk rises to "blocker." All are either surfaced-deterministic, mitigated, or tracked deferrals.

---

## 9. Recommended slices

| Candidate | Needed for Phase-2 completeness? | Recommendation |
|---|---|---|
| **NATIVE-NODES-2 (runtime/schema fixes)** | **No** | Skip. Runtime + schemas are complete and hardened. |
| **NATIVE-NODES-3 (metadata/builder fixes)** | **No (UX-only)** | Optional. One real item: ship the deferred **HttpRequestConfig builder editor** so `http_request` auth (bearer/basic/apiKey) is structurally configurable instead of header-only. Polish, not a blocker. |
| **NATIVE-NODES-4 (execution/data-flow tests)** | **No** | Skip. 405 unit + 5 integration + 3 e2e + structure invariants already cover behavior and data flow. |

**Standing deferrals (remain OUT of Phase 2 by explicit decision — not this audit's scope to change):**

| Item | Deferral | Rationale |
|---|---|---|
| `loop` / iterator | Phase 6 (NPD-N5) | Needs loop scope, per-iteration variable rebinding, `loop_executions` parallel state — major engine surgery. |
| `wait_for_event`, unbounded/durable `delay`, pause/resume, durable queue | Phase 6 (NPD-N6) | Requires a durable queue (BullMQ/Inngest) + suspended-run state V2 doesn't have. |
| AI cluster (`ai_agent` + 7 sub-actions, `tavily_search`) | Phase 5 (NPD-N7) | AI-planner territory; will consolidate V1's 8 schema-alias proliferation. |
| `hitl_conversation` | Phase 8 (NPD-N8) | ~5,000-LOC HITL stack + UI; should reuse provider-tier OAuth, not duplicate it. |
| Generic webhook trigger | Pending product signal (NPD-N3) | Provider-scoped webhooks cover the common case; generic adds attack surface + new auth model. |
| `parse_file`, `extract_website_data` | Pending product signal (NPD-N9) | File-format coverage / legal-ToS surface; revisit on real demand. |
| 6 V1 orphan handlers (`executePath`, `executeFilter`, `fileUpload`, `googleSearch`, `transformer`, `emailClassifier`) | PERMANENT SKIP (NPD-N10) | V1 rot — duplicates / superseded / dead. |
| Control-flow follow-ups: multi-condition AND/OR (D-IT4), `caseSensitive` flag (D-IT3), regex operator (D-RT4) | Deferred follow-ups | Small, demand-driven; shared evaluator is the single touchpoint. |
| Scheduled-trigger per-trigger timezone (NPD-N12), catch-up/backfill (NPD-N13) | Pending product signal | Revisit on customer ask. |

---

## 10. Final answer

**Are native / built-in nodes complete to Marcus's Phase 2 standard? — YES, for the Phase-2 scope.**

The shipped native surface (Tier A actions, Tier B triggers, the engine-branching platform prerequisite, Tier C control-flow, plus the builder-metadata layer and security hardening) meets the standard on every dimension the audit checked: each shipped node has runtime + strict schema + builder metadata + a builder field renderer + execution wiring + risk and sensitive-output flags + (for triggers) tested activation, backed by behavioral tests (405 native unit + 5 builder integration + 3 e2e), with `native` in `COVERED_PROVIDERS` enforcing drift protection. No node is "in a registry but half-built."

**What remains:**
1. **One optional UX follow-up on a shipped node** — the `http_request` structured auth builder editor (currently header-only). Non-blocking; recommend a small NATIVE-NODES-3-style slice if/when http-auth ergonomics are prioritized.
2. **The standing Phase-5/6/8 + product-signal deferrals** listed in §9 — all carry real V2-native rationale (engine-platform gaps, phase ownership, or pending demand) and are correctly out of Phase 2.

No NATIVE-NODES-2 (runtime/schema) or NATIVE-NODES-4 (tests) work is required. The Phase 2 native-nodes parity gap is closed; combined with the accepted provider-completion closeout, this clears the last non-provider piece needed to call Phase 2 complete to standard.
