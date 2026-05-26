# Parity audit — Airtable

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/airtable/`](../../integrations/airtable/) (Slice 10, shipped locally)
**Phase 1 surface shipped:** 8 actions + 1 consolidated `record_changed` webhook trigger backed by Airtable's per-base webhook + HMAC `X-Airtable-Content-MAC` verification + cursor-paged `webhooksListPayloads` fetch + 6-day renewal via `subscriptionRegistry`. PKCE + Basic-auth-Bearer + ROTATED-refresh-token OAuth. V2-first non-Google / non-Microsoft refreshable + PKCE provider.

**Recommendation up front.** V1 registers **12 Airtable actions** + **3 trigger node defs** + **1 unregistered orphan** (`moveRecord.ts`). V2 ships **8 actions** + **1 consolidated `record_changed` trigger** that covers V1's `new_record` + `record_updated` (+ a `deleted` discriminator that V1 lacked entirely). Action gap is **3 net-new ports** (`add_attachment`, `create_multiple_records`, `update_multiple_records` — all three need **V2 redesigns**, not literal V1 ports), **1 V1 action skipped as workflow recipe** (`duplicate_record` = `get_record` + `create_record`), and **1 V1 orphan permanently skipped** (`moveRecord.ts` per accepted decision). Trigger gap is **1 missing discriminator value** (`table_deleted` for `destroyedTableIds` payloads — recommendation: **fold into `record_changed`** with a new `eventType: "table_deleted"`). **One V2 contract change required:** promote `"attachment"` from `_shared/airtable/fields.ts` `DEFERRED_FIELD_TYPES` to `SUPPORTED_FIELD_TYPES` with a write formatter — needed for `add_attachment` AND to let `create_record` / `update_record` write attachment fields directly. **One platform reuse:** Airtable becomes V2's **third P-S3 FileRef consumer** (after Slack 2.4 + Gmail 2.3) — `add_attachment` accepts FileRef input, stages bytes via `services/files/fetchFileBytes.ts`, then writes Airtable's `[{url, filename}]` wire format. Estimated **1 parity slice in 6 commits** if Marcus accepts the 3 ports + 1 trigger fold + 1 field-type promotion (Airtable 2.1). **No batch-CRUD redesign work** beyond Airtable 2.1; **no orphan-action backfill slice** (`moveRecord` is dead code, per the post-Stripe-2.1 decision). **Zero new platform infrastructure** — every port reuses Slice 10's `airtableRequest` + `refreshAndRetry` + field polymorphism stack + the existing P-S3 file contract.

---

## 1. V1 source paths audited

**Action handlers** (`lib/workflows/actions/airtable/`, 15 `.ts` files, 3,419 LOC):
- [`createRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/createRecord.ts) — **924 LOC**. Schema-aware field formatting, attachment heuristic ("if field name contains 'photo' it's an attachment"), Supabase temp-upload coupling, 5-minute in-memory schema cache.
- [`updateRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/updateRecord.ts) — **356 LOC**.
- [`deleteRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/deleteRecord.ts) — **274 LOC**.
- [`duplicateRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/duplicateRecord.ts) — **266 LOC**. GET + create with `fieldsToCopy` / `fieldsToOverride`.
- [`listRecords.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/listRecords.ts) — **253 LOC**. `keywordSearch` / `dateFilter` / `customDateRange` convenience builders + post-processing keyword filter.
- [`addAttachment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/addAttachment.ts) — **249 LOC**. URL / base64 / upload sources; `preserveExisting` GET-first-then-merge pattern.
- [`createMultipleRecords.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/createMultipleRecords.ts) — **228 LOC**. **Sequential single-record loop** (NOT Airtable's batch API).
- [`findRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/findRecord.ts) — **216 LOC**.
- [`supabaseAttachment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/supabaseAttachment.ts) — **133 LOC** helper. `uploadTempAttachmentToSupabase` + `scheduleTempAttachmentCleanup` (10-min Node setTimeout).
- [`moveRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/moveRecord.ts) — **129 LOC**. **V1 orphan — NOT registered.** GET + create + delete pattern.
- [`updateMultipleRecords.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/updateMultipleRecords.ts) — **119 LOC**. **Sequential single-record loop** (NOT batch).
- [`getTableSchema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getTableSchema.ts) — **94 LOC**.
- [`getBaseSchema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getBaseSchema.ts) — **97 LOC**.
- [`getRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getRecord.ts) — **68 LOC**.
- [`index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/index.ts) — **13 LOC** barrel.

**Node definitions** ([`lib/workflows/nodes/providers/airtable/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/airtable/), 9 schemas + `index.ts` 519 LOC):
- 3 trigger types inlined in `index.ts`: `airtable_trigger_new_record`, `airtable_trigger_record_updated`, `airtable_trigger_table_deleted`.
- 3 action types inlined in `index.ts`: `airtable_action_create_record`, `airtable_action_update_record`, `airtable_action_list_records`.
- 9 schema-based actions: `addAttachment` / `createMultipleRecords` / `deleteRecord` / `duplicateRecord` / `findRecord` / `getBaseSchema` / `getRecord` / `getTableSchema` / `updateMultipleRecords`.

**Trigger lifecycle:** [`lib/triggers/providers/AirtableTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/AirtableTriggerLifecycle.ts) — **350 LOC**. `onActivate` (POST `/v0/{baseId}/webhooks` with `notificationUrl` + spec), `onDeactivate`, no explicit renewal hook (relied on V1's `/api/webhooks/refresh-airtable` cron).

**Receive route:** [`app/api/workflow/airtable/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts) — **1,298 LOC**. In-memory `processedRecords` Map + `pendingRecords` delayed-execution map + `activeTimers` Node-setTimeout map. `DUPLICATE_BLOCK_MS = 60000`. `verificationDelay` config field used to defer dispatch via setTimeout. Linked-record `changeGrouping: combine_linked` batches multiple records into one workflow run. snake_case ↔ camelCase reconciliation on Airtable payload field names.

**Deprecated dual webhook system:** [`lib/integrations/airtable/webhooks.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts) — **704 LOC**, marked `⚠️ DEPRECATED FILE (2025-10-03)`. Old `airtable_webhooks` table (no workflow tracking). V1 itself migrated to `trigger_resources` + `AirtableTriggerLifecycle`.

**Cron route:** [`app/api/webhooks/refresh-airtable/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/refresh-airtable/route.ts) — **79 LOC**. Per-provider cron.

**Orphan route:** [`app/api/integrations/airtable/register-webhooks/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/airtable/register-webhooks/route.ts) — **16 LOC**. Unwired.

**Registry:** [`lib/workflows/actions/registry.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/registry.ts:853-875) — 12 Airtable entries (lines 853–875).

**Tests:** `__tests__/nodes/airtable-create-record.test.ts` — **only 1 V1 test file** for Airtable. Sparse coverage.

---

## 2. V1 actions inventory

12 V1-registered actions + 1 V1 orphan:

| # | V1 action type | One-line description | Status |
|---|---|---|---|
| 1 | `airtable_action_create_record` | Create one record with typed fields, attachments via Supabase temp-upload, attachment field heuristic by name. | live |
| 2 | `airtable_action_update_record` | PATCH one record's fields. | live |
| 3 | `airtable_action_list_records` | List records with filter / sort / view + V1's keywordSearch / dateFilter / customDateRange convenience builders. | live |
| 4 | `airtable_action_find_record` | List with `maxRecords=1` + filterByFormula. Returns first match or `{found: false}`. | live |
| 5 | `airtable_action_get_record` | GET one record by id. | live |
| 6 | `airtable_action_delete_record` | DELETE one record by id. | live |
| 7 | `airtable_action_add_attachment` | Upload (URL / base64 / FileRef-like) → Supabase temp store → PATCH attachment field. `preserveExisting` GET-first merge. | live |
| 8 | `airtable_action_duplicate_record` | GET one record + create new with `fieldsToCopy` / `fieldsToOverride` overrides. | live |
| 9 | `airtable_action_get_table_schema` | GET `/v0/meta/bases/{id}/tables` filtered to one table. | live |
| 10 | `airtable_action_get_base_schema` | GET `/v0/meta/bases/{id}/tables` (all tables). | live |
| 11 | `airtable_action_create_multiple_records` | **Sequential single-record loop** up to `min(maxRecords, 10)`. NOT Airtable's true batch API. | live |
| 12 | `airtable_action_update_multiple_records` | **Sequential single-record loop** up to 10 record ids. NOT Airtable's true batch API. | live |
| O1 | `airtable_action_move_record` (`moveRecord.ts`, 129 LOC) | GET source + create in destination + delete source. | **V1 orphan — NOT registered.** Dead code per accepted decision. |

---

## 3. V1 triggers inventory

3 V1 trigger types — all webhook, per-workflow lifecycle (one Airtable webhook per workflow base/table):

| # | V1 trigger type | Description | Trigger model |
|---|---|---|---|
| 1 | `airtable_trigger_new_record` | Webhook event with `createdRecordsById` in payload. Includes `verificationDelay` (default 30s) and `changeGrouping: combine_linked` for batched linked-record updates. | webhook / per-workflow |
| 2 | `airtable_trigger_record_updated` | Webhook event with `changedRecordsById` in payload. `verificationDelay` default 0s. Same `changeGrouping` option. | webhook / per-workflow |
| 3 | `airtable_trigger_table_deleted` | Webhook event with `destroyedTableIds` in payload. Watches whole base or specific tables; ONLY fires when an entire table is deleted (Airtable docs: "Airtable webhooks only detect when entire tables are deleted, not individual records"). | webhook / per-workflow |

Lifecycle: one webhook per workflow base/table via `AirtableTriggerLifecycle.onActivate`. Renewal: per-provider cron `/api/webhooks/refresh-airtable`. Deactivation: `AirtableTriggerLifecycle.onDeactivate`.

---

## 4. V2 current surface

8 actions (Slice 10 Commit 3, registered in [`services/execution/handlers/_registry.ts:358-365`](../../services/execution/handlers/_registry.ts#L358)):

1. `list_records` — `recordsList` (filterByFormula, sort, view, pageSize, offset, fields, maxRecords). Wrapper: [`integrations/airtable/api/records.ts`](../../integrations/airtable/api/records.ts).
2. `get_record` — `recordsGet`. Single-record GET by id.
3. `find_record` — `recordsList` with `maxRecords=1` + filterByFormula; returns `{found, record}`.
4. `create_record` — `recordsCreate`. Typed fields via `_shared/airtable/fields.ts` `formatFields`. **`typecast` is explicit, defaults `false`.**
5. `update_record` — `recordsUpdate`. PATCH (V2 doesn't expose PUT). Same typed-field formatting.
6. `delete_record` — `recordsDelete`.
7. `get_base_schema` — `tablesList` via `_shared/airtable/api/_request.ts`.
8. `get_table_schema` — `tablesList` filtered to one table.

1 consolidated trigger (Slice 10 Commit 4, [`integrations/airtable/triggers/recordChanged/`](../../integrations/airtable/triggers/recordChanged/)):

- `record_changed` — webhook trigger. `eventType` discriminator (`created` / `updated` / `deleted` / `unknown`) inside the canonical TriggerEvent payload. Webhook receive: HMAC `X-Airtable-Content-MAC` verification → cursor-paged `webhooksListPayloads` → normalize → dispatch. Renewal: `subscriptionRegistry` with 6-day threshold against Airtable's 7-day TTL. Webhook route: [`app/api/webhooks/airtable/route.ts`](../../app/api/webhooks/airtable/route.ts).

Manifest ([`integrations/airtable/manifest.ts`](../../integrations/airtable/manifest.ts)): `tokenScope: user`, `accountIdField: userId`, `apiVersion: v0`, `oauthFlows: ["v2"]`, scopes `["data.records:read", "data.records:write", "schema.bases:read", "webhook:manage"]`, `refreshable: true` (ROTATED refresh tokens enforced).

Field polymorphism ([`integrations/_shared/airtable/fields.ts`](../../integrations/_shared/airtable/fields.ts)): **14 SUPPORTED** field types (`text`, `multilineText`, `richText`, `email`, `url`, `phoneNumber`, `number`, `percent`, `currency`, `checkbox`, `singleSelect`, `multipleSelects`, `date`, `dateTime`, `multipleRecordLinks`). **17 DEFERRED** field types (`attachment`, `formula`, `rollup`, `lookup`, `count`, `rating`, `duration`, `autoNumber`, `barcode`, `button`, `singleCollaborator`, `multipleCollaborators`, `createdBy`, `createdTime`, `lastModifiedBy`, `lastModifiedTime`, `externalSyncSource`). `UnsupportedFieldTypeError` thrown loudly when a deferred type is encountered at create/update time.

E2E: [`tests/e2e/slice-10-airtable-walkthrough.spec.ts`](../../tests/e2e/slice-10-airtable-walkthrough.spec.ts) (580 LOC) + [`tests/e2e/helpers/mockAirtableServer.ts`](../../tests/e2e/helpers/mockAirtableServer.ts) (1,046 LOC). Covers: OAuth (PKCE + Basic auth + form body), refresh-token rotation, webhook activate → ping → cursor fetch → workflow run → succeeded, dedup probe, spoofed-signature rejection. **Does NOT cover:** view-aware reads, attachment writes/reads, batch CRUD, table_deleted events.

---

## 5. Missing actions

Set diff: V1 registered (12) minus V2 (8) = 4 candidates.

| V1 action | One-line gap |
|---|---|
| `airtable_action_add_attachment` | Write to an Airtable attachment field from a URL / FileRef / bytes source. V2's `_shared/airtable/fields.ts` lists `attachment` as DEFERRED — `create_record` / `update_record` cannot write attachment fields either. |
| `airtable_action_create_multiple_records` | Batch create. V1's implementation is a sequential single-record loop (not real batch) — V2 would design as **true** Airtable batch (`POST /v0/{baseId}/{tableIdOrName}` with `records: []` up to 10). |
| `airtable_action_update_multiple_records` | Batch update. Same shape — V1 sequential loop; V2 would do **true** batch PATCH. |
| `airtable_action_duplicate_record` | GET source + create with override fields. Workflow recipe — composable from `get_record` + `create_record`. |

V1 orphans (NOT registered) — per the post-Stripe-2.1 decision these are **dead code, permanent skip**:
- `moveRecord.ts` (129 LOC) — GET + create + delete. Workflow recipe + orphan. **PERMANENT SKIP.**

---

## 6. Missing triggers

Set diff: V1 (3) minus V2 (1 consolidated trigger that covers V1's `new_record` + `record_updated` + a `deleted` discriminator V1 didn't have) = 1 candidate.

| V1 trigger | One-line gap |
|---|---|
| `airtable_trigger_table_deleted` | Webhook payload `destroyedTableIds` not consumed by V2's `record_changed` normalize. The normalize walks `changedTablesById` only (created/changed/destroyed records inside a table — NOT destroyed tables themselves). |

---

## 7. Port / skip / defer table

Every row from §5 + §6.

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `add_attachment` | action | **PORT (Airtable 2.1) with V2 redesign** | Third V2 consumer of the P-S3 FileRef contract (after Slack 2.4 + Gmail 2.3). Accept FileRef input; stage bytes via `core/files/fetchFileBytes.ts`; write Airtable's `[{url, filename?}]` shape. V1's URL/base64/upload union + Supabase temp-upload + scheduled-cleanup chrome (`supabaseAttachment.ts`) is rejected per master plan §5 V1 rot — duplicates P-S3's storage stack. |
| `create_multiple_records` | action | **REDESIGN (Airtable 2.1)** | V2's wrapper for **true** Airtable batch (`POST /v0/{baseId}/{tableIdOrName}` with `records: []`, max 10). V1's sequential loop is NOT a port reference — it's a workaround. Fail loud at parse time if > 10 records supplied (V1 silently capped). All-or-nothing semantics (Airtable returns 422 if any record fails; V2 surfaces the failure, no per-record retry, no partial-success silent merge). |
| `update_multiple_records` | action | **REDESIGN (Airtable 2.1)** | Same shape — true Airtable batch PATCH (`PATCH /v0/{baseId}/{tableIdOrName}` with `records: [{id, fields}]`, max 10). Same all-or-nothing semantics. |
| `duplicate_record` | action | **SKIP (workflow recipe)** | Equivalent to `get_record` → `create_record` with field overrides. V1's `fieldsToCopy` / `fieldsToOverride` is structural mapping that belongs in the builder UI / variable mapping (Phase 3), not a dedicated handler. No new Airtable API surface. |
| `move_record` (V1 orphan) | action | **PERMANENT SKIP** | Per the post-Stripe-2.1 decision: V1 orphan handlers are dead code. Also a workflow recipe (`get_record` + `create_record` in destination + `delete_record` in source). |
| `table_deleted` discriminator | trigger | **FOLD into `record_changed`** | V2's `record_changed` already uses an `eventType` discriminator (`created` / `updated` / `deleted` / `unknown`). Add `eventType: "table_deleted"` value + extend `normalize.ts` to walk `destroyedTableIds`. Avoids a second trigger type for an event that's already covered by the same webhook subscription. |
| `attachment` field type (in DEFERRED list) | platform | **PROMOTE in Airtable 2.1 Commit 1** | Prerequisite for `add_attachment`. Add a write formatter in `_shared/airtable/fields.ts` that accepts `[{url, filename?}]` (Airtable's wire shape) so `create_record` and `update_record` can also write attachment fields without the dedicated `add_attachment` flow. Read formatter returns the same shape (Airtable returns `[{id, url, filename, type, size}]` on reads). |

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 categories:

| ID | Pattern | Citation | V2 status |
|---|---|---|---|
| A-R1 | Deprecated dual webhooks system | [`lib/integrations/airtable/webhooks.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts) — 704 LOC, marked `⚠️ DEPRECATED FILE (2025-10-03)`. Old `airtable_webhooks` table (no workflow tracking) parallel to `trigger_resources`. | NOT PORTED — V2 ships only `trigger_resources`. (Already addressed in Slice 10.) |
| A-R2 | In-memory `processedRecords` Map + `pendingRecords` setTimeout-based delayed execution | [`app/api/workflow/airtable/route.ts:16-26`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts) — `processedRecords` + `pendingRecords` + `activeTimers` maps. `DUPLICATE_BLOCK_MS = 60000`. Workaround for missing DB dedup; fundamentally broken in serverless (each lambda gets a fresh Map). | NOT PORTED — V2 uses DB-backed `webhook_event_dedup`. (Already addressed in Slice 10.) |
| A-R3 | `verificationDelay` config field — Node `setTimeout` deferred dispatch | V1 receive route at lines ~150–300 schedules dispatches via `setTimeout(ms, ...)` to "wait for record verification." Doesn't survive lambda cold-start; breaks on retries. | NOT PORTED — V2's webhook receive dispatches synchronously. Dedup is the only deferral. |
| A-R4 | Per-provider cron route | [`app/api/webhooks/refresh-airtable/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/refresh-airtable/route.ts) (79 LOC). | NOT PORTED — V2 uses `subscriptionRegistry` + `runRenewals` cron. (Already addressed in Slice 10.) |
| A-R5 | Orphan API route | [`app/api/integrations/airtable/register-webhooks/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/airtable/register-webhooks/route.ts) (16 LOC). Unwired. | NOT PORTED. Dead code. |
| A-R6 | Attachment-by-name heuristic | [`createRecord.ts:669-672`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/createRecord.ts) — "if field name contains 'photo' it's an attachment." Heuristic field-type detection. | NOT PORTED — V2 requires explicit typed field declaration via `_shared/airtable/fields.ts`. |
| A-R7 | Supabase temp-upload + scheduled cleanup helper | [`supabaseAttachment.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/supabaseAttachment.ts) (133 LOC). Uploads to a temp bucket, schedules 10-min `setTimeout` cleanup. Bypasses V2's P-S3 contract entirely. | NOT PORTED — Airtable 2.1's `add_attachment` will use P-S3 (`workflow-files` bucket + `services/files/fetchFileBytes.ts` + signed-URL or storage-path-aware fetcher). |
| A-R8 | V1 always-1-second-prepend rate limiter | `lib/integrations/airtable/airtableRateLimiter.ts` (V1 implementation). | NOT PORTED — V2 lets Airtable rate-limit naturally; focused retry in `_request.ts` if 429 becomes a real concern. (Already addressed in Slice 10.) |
| A-R9 | Convenience builder layer in `listRecords` | [`listRecords.ts:23-30, 80-130`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/listRecords.ts) — `keywordSearch` (post-processing client-side filter), `dateFilter` (synthesizes `CREATED_TIME()` formulas), `customDateRange`. | NOT PORTED — V2 forward-passes `filterByFormula` verbatim. Workflow authors pre-compute the formula. (Already addressed in Slice 10.) |
| A-R10 | snake_case ↔ camelCase reconciliation in receive route | [`app/api/workflow/airtable/route.ts:76-172`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts) — repeated `field || field_alias` chains for legacy payload shapes. | NOT PORTED — V2 trusts current Airtable's camelCase responses. (Already addressed in Slice 10.) |
| A-R11 | Sequential single-record loops marketed as "batch" | `createMultipleRecords.ts:40-72`, `updateMultipleRecords.ts:43-90`. Both loop `await` per record. NOT Airtable's real batch API (`records: []` up to 10 per request). | **NOT PORTED — V2 will REDESIGN.** Airtable 2.1's `create_multiple_records` / `update_multiple_records` use real batch wire-format. |
| A-R12 | Silent maxRecords cap to 10 | `createMultipleRecords.ts:34` — `Math.min(Number(config.maxRecords) || 10, 10)`. V1 silently truncates user input. | NOT PORTED — V2 Airtable 2.1 fails loud at parse time if user supplies > 10 records (Q11 — no silent coercion). |
| A-R13 | `continueOnError` partial-success semantics | `createMultipleRecords.ts:35` — `continueOnError` config returns `success: true` with `failedRecords[]` partial result. | NOT PORTED — V2 Airtable's true batch is all-or-nothing per Airtable's wire contract. (Q14 — error envelopes propagate.) |
| A-R14 | 5-minute in-memory schema cache | [`createRecord.ts:14-15`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/createRecord.ts) — `TABLE_SCHEMA_CACHE = new Map<string, ...>`. Process-local cache; breaks across lambda invocations. | NOT PORTED — V2 doesn't cache schema in memory. (Already addressed in Slice 10's per-action schema fetch.) |
| A-R15 | `success: false` synthetic ActionResult envelopes | Multiple V1 handlers wrap errors in `{ success: false, message }` (e.g. `addAttachment.ts:38, 43, 49`) instead of throwing. | NOT PORTED — V2 lets errors propagate to the engine; `findRecord` returns `{found: false}` for the "no-match" semantic only. |
| A-R16 | "preserveExisting" GET-then-merge attachment pattern | [`addAttachment.ts:163-192`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/addAttachment.ts) — fetches current record + appends new attachment. Two API calls per add. | PORT-IF-NEEDED — V2's `add_attachment` recommendation: ship the simpler "replace attachment field" semantic; add preserveExisting as a follow-up if workflows need it. |

---

## 9. V2 dependency map

Which V2 contracts each ported / redesigned item depends on. Identifies contract gaps.

| Item | Dependencies | Contract gap |
|---|---|---|
| `add_attachment` | `airtableRequest`, `refreshAndRetry`, `_shared/airtable/fields.ts` (attachment formatter — NEW), P-S3 contract (`core/files/createFileRef.ts`, `core/files/fetchFileBytes.ts`, `services/files/stageFileToStorage.ts`), action handler registry | **One V2 contract change:** promote `"attachment"` from `_shared/airtable/fields.ts` `DEFERRED_FIELD_TYPES` → `SUPPORTED_FIELD_TYPES` + add typed write formatter (`AttachmentInput[] → [{url, filename}]`) + read parser. Then `create_record` / `update_record` can write attachment fields too. |
| `create_multiple_records` | `airtableRequest`, `refreshAndRetry`, `recordsBatchCreate` wrapper (**NEW**), `_shared/airtable/fields.ts`, action handler registry | **One new wrapper** in `integrations/airtable/api/records.ts`: `recordsBatchCreate({records: [{fields}], typecast})` → `POST /v0/{baseId}/{tableIdOrName}` with `records: []`. |
| `update_multiple_records` | `airtableRequest`, `refreshAndRetry`, `recordsBatchUpdate` wrapper (**NEW**), `_shared/airtable/fields.ts`, action handler registry | **One new wrapper**: `recordsBatchUpdate({records: [{id, fields}], typecast})` → `PATCH /v0/{baseId}/{tableIdOrName}` with `records: []`. |
| `record_changed` `table_deleted` discriminator | `_shared/airtable/api/webhooks.ts` (existing), `triggers/recordChanged/normalize.ts` (extend), `RecordChangedEventType` union (extend) | **One discriminator value addition** + normalize walk of `destroyedTableIds` from the payload. No new wrapper / no new contract type. |

Everything else (`refreshAndRetry`, `airtableRequest`, `actionHandlerRegistry`, `subscriptionRegistry`, `webhook_event_dedup`, P-S3 file contract) **already exists**.

---

## 10. Required platform gaps (if any)

**One V2 contract change** (Airtable 2.1 Commit 1 scope):

- **Promote `"attachment"` to `_shared/airtable/fields.ts` `SUPPORTED_FIELD_TYPES`** with a typed write formatter + read parser. The shared module is the canonical type-polymorphism layer for Airtable; the change is additive (no breaking change for existing handlers) and enables both the dedicated `add_attachment` action AND attachment writes via `create_record` / `update_record`.

**No new platform infrastructure** beyond that:
- P-S3 contract (FileRef + Supabase storage + `fetchFileBytes`) is already shipped and proven by Slack 2.4 + Gmail 2.3.
- Airtable batch API uses the existing `airtableRequest` form-shape; only per-resource wrappers are added.
- Trigger discriminator extension lives entirely inside `triggers/recordChanged/normalize.ts`.

---

## 11. Effort estimate

Compared to Phase 1 reference slices:

- **Airtable 2.1 = ~Stripe-2.1-sized.** 4-action surface (3 ports + 1 trigger fold) vs Stripe 2.1's 6-action surface, but Airtable adds the `_shared/airtable/fields.ts` attachment-type promotion. Roughly 6 commits in the same shape: parity audit → field-type promotion → action × 3 → trigger fold + e2e extension → outcomes doc.

| Commit | Scope | Est. LOC |
|---|---|---|
| 1 | This audit. Doc-only. | — |
| 2 | `feat(airtable): promote attachment field type` (`_shared/airtable/fields.ts` + read/write formatters + tests; **no new action shipped**). | ~200 src + ~150 test |
| 3 | `feat(airtable): add attachment action` (P-S3 FileRef consumer). | ~250 src + ~250 test |
| 4 | `feat(airtable): add create_multiple_records action` (true Airtable batch). | ~200 src + ~200 test |
| 5 | `feat(airtable): add update_multiple_records action` (true Airtable batch). | ~200 src + ~200 test |
| 6 | `feat(airtable): record_changed table_deleted discriminator` + e2e walkthrough extension (view-aware reads + attachment writes + batch CRUD + table_deleted events). | ~150 src + ~600 e2e |
| 7 | `docs(airtable): document 2.1 outcomes` + CLAUDE.md durable notes. | — |

**Total estimate: 6 implementation commits + 1 audit + 1 outcomes ≈ ~1,000 src LOC + ~800 test LOC + ~600 e2e LOC + ~400 docs LOC.** Smaller than Stripe 2.1 by a handful of test cases — Airtable's wire-format surface is narrower per action.

---

## 12. Risk estimate

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Attachment field type promotion accidentally breaks existing `create_record` / `update_record` callers by treating non-attachment fields as attachments | low | medium | Schema-aware dispatch via `_shared/airtable/fields.ts` — formatter only runs when the table-schema fetch identifies the field as `type: "attachment"`. Existing tests pin behavior for all 14 currently-supported types; new tests pin attachment-specific behavior. |
| R2 | Airtable batch 422 "any record fails" semantics surprise workflow authors expecting partial success (V1's `continueOnError` shape) | medium | low | Doc loudly in the schema header that batch is **all-or-nothing**. Mention V1's per-record-retry sequential loop in outcomes doc + flag it as NOT PORTED. Test the 422 propagation path explicitly. |
| R3 | P-S3 FileRef bytes path for Airtable attachments needs URL-vs-storage-path branching that Slack 2.4 / Gmail 2.3 didn't exercise | low | low | The `core/files/fetchFileBytes.ts` API already handles all three FileRef kinds. The new code path is Airtable-specific multipart upload to Airtable's content-uploads endpoint (or just providing a public URL when the FileRef is `kind: "signed_url"` / `"provider_url"`). 3 unit tests cover the three FileRef kinds. |
| R4 | Migrating `attachment` out of `DEFERRED_FIELD_TYPES` while `formula` / `rollup` / `lookup` / `count` / `createdTime` / etc. remain deferred is incomplete | low | low | The remaining 16 DEFERRED types are **computed** Airtable types (read-only — Airtable rejects writes anyway) or **collaborator** types (need user-id mapping). Promoting `attachment` is the only write-supportable promotion in scope. The DEFERRED list shrinks from 17 → 16 entries; the `UnsupportedFieldTypeError` message auto-updates. |

---

## 13. Recommended parity batch plan

Ordered list of commits Airtable 2.1 would land if accepted:

| Commit | Title | Scope |
|---|---|---|
| **0** | `docs(airtable): add parity audit` | This doc. **Doc-only.** Already drafted; pending Marcus's acceptance. |
| **1** | `feat(airtable): promote attachment field type` | Promote `"attachment"` from `_shared/airtable/fields.ts` `DEFERRED_FIELD_TYPES` to `SUPPORTED_FIELD_TYPES` + typed write formatter (`AttachmentInput[] → [{url, filename}]`) + read parser. Tests pin (a) attachment read/write through `formatFields` / `parseFieldsWithSchema`, (b) `UnsupportedFieldTypeError` shrinks to 16 entries, (c) `create_record` + `update_record` integration tests now exercise attachment writes. **No new action shipped this commit.** |
| **2** | `feat(airtable): add attachment action` | New action `add_attachment` + schema + handler + tests + registry entry + manifest test count bump (8 → 9). Third V2 P-S3 consumer: accepts FileRef input, fetches bytes via `core/files/fetchFileBytes.ts`, posts to Airtable's content-uploads endpoint, then PATCHes the record's attachment field with `[{url, filename}]`. Default behavior: **replace** the attachment field. Optional `appendToExisting: boolean` for the V1 preserveExisting semantic — additive follow-up if a workflow needs it. |
| **3** | `feat(airtable): add create_multiple_records action` | New wrapper `recordsBatchCreate` (true Airtable batch — `POST /v0/{baseId}/{tableIdOrName}` with `records: []`, max 10) + action `create_multiple_records` + schema + handler + tests + registry entry + manifest test count bump (9 → 10). Schema rejects > 10 records at parse time. All-or-nothing semantics; 422 propagates. |
| **4** | `feat(airtable): add update_multiple_records action` | New wrapper `recordsBatchUpdate` + action `update_multiple_records` + schema + handler + tests + registry entry + manifest test count bump (10 → 11). Same shape as Commit 3. |
| **5** | `feat(airtable): record_changed table_deleted + e2e extension` | Extend `RecordChangedEventType` union with `"table_deleted"` + extend `normalize.ts` to walk `destroyedTableIds` from payloads. E2E walkthrough extended with: (a) view-aware list_records using V2's existing `view` schema field, (b) attachment write via `add_attachment`, (c) attachment write via `create_record` (new field type), (d) batch create + batch update (full and partial-field), (e) table_deleted event handling. |
| **6** | `docs(airtable): document 2.1 outcomes` | New `docs/slices/airtable-2-1-outcomes.md` (14-section retro template) + CLAUDE.md Phase 2 progress (Airtable) entry + Deep Gotchas Airtable Phase 2 patterns subsection. Durable rules: typed field formatting via `_shared/airtable/fields.ts`; batch all-or-nothing; P-S3 FileRef for attachment writes; one trigger with eventType discriminator (no per-event-type proliferation). |

**Each implementation commit independently passes gates:** `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. Commit 5 additionally passes `npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts --workers=1`.

**No commit introduces a new platform contract.** No new shared utility module, no new contract type, no new infrastructure cron, no schema migration.

---

## 14. Exit checklist

This audit is complete when:

- [ ] Marcus has read §1 (paths) + §2 (V1 actions) + §3 (V1 triggers) + §4 (V2 today) and agrees the inventory is accurate.
- [ ] §5 + §6 (missing items) match Marcus's understanding of the parity gap.
- [ ] §7 (port / skip / defer) decisions accepted, especially:
  - `duplicate_record` SKIP as workflow recipe (NOT a dedicated handler).
  - `move_record` PERMANENT SKIP (V1 orphan dead code).
  - `table_deleted` FOLD into `record_changed` (NOT a separate trigger type).
  - `attachment` field type promotion is the only `DEFERRED_FIELD_TYPES` change in scope.
- [ ] §8 (V1 rot) inventory accepted — confirms most rot was already addressed in Slice 10, and that the new rot rows (A-R11, A-R12, A-R13 batch semantics) are intentional NOT-PORTED choices.
- [ ] §10 (platform gap) — the single field-type promotion is the only V2 contract change.
- [ ] §11 (effort) ≈ 6 implementation commits + 1 audit + 1 outcomes is in the right ballpark.
- [ ] §13 (batch plan) commit ordering accepted.
- [ ] **Open decisions confirmed:**
  - **NPD-A1:** Bulk-CRUD failure mode — recommendation: **fail loud at handler boundary** when Airtable returns 422. No partial-success silent merge. No per-record retry loop. Accept/reject.
  - **NPD-A2:** Attachment write shape — recommendation: **accept FileRef** in `add_attachment` (single attachment per call) AND accept typed `[{url, filename?}]` array in `create_record` / `update_record` field map (Airtable's wire shape). Accept/reject.
  - **NPD-A3:** Create / update record attachment writes — recommendation: **allow** attachment-field writes in `create_record` / `update_record` once the field type is promoted (Commit 1). Workflow authors who need byte-uploading use the dedicated `add_attachment` action; those who already have a public URL can write the attachment field inline. Accept/reject.
  - **NPD-A4:** `table_deleted` discriminator — recommendation: **fold into `record_changed`** with `eventType: "table_deleted"`. Accept/reject.
  - **NPD-A5:** preserveExisting (V1 GET-then-merge) for `add_attachment` — recommendation: **defer** to additive follow-up; ship replace-only first.
  - **NPD-A6:** `appendToExisting: true` would require a GET round-trip — recommendation: explicit opt-in if Marcus wants it in Commit 2, otherwise defer.
- [ ] Implementation does not start until all checkboxes are ticked.
