# Airtable 2.1 — Attachment + batch CRUD + table_deleted fold outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-airtable.md`](parity-airtable.md) (accepted before Commit 1 began).
**Phase 1 predecessor:** [`docs/slices/slice-10-airtable.md`](slice-10-airtable.md) (8-action + 1-trigger refreshable-PKCE port; established the V2 Airtable baseline + field polymorphism + cursor-paged webhook payload fetch).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/airtable/`](../../integrations/airtable/).

Airtable 2.1 closes the parity gap from the audit: **3 new actions** + **1 trigger discriminator fold** + **1 field-type promotion**. Every behavior fits Slice 10's `airtableRequest` + `refreshAndRetry` + `_shared/airtable/fields.ts` + `subscriptionRegistry` stack — **zero new platform infrastructure**. The single platform-tier change is promoting `"attachment"` from `DEFERRED_FIELD_TYPES` to `SUPPORTED_FIELD_TYPES`, which enables both the dedicated `add_attachment` action AND inline attachment writes via `create_record` / `update_record` / `create_multiple_records` / `update_multiple_records`. Airtable becomes V2's **third P-S3 FileRef consumer** (after Slack 2.4 + Gmail 2.3).

V1's three "batch" patterns (`createMultipleRecords` / `updateMultipleRecords` / `addAttachment`) are NOT ported as-is. V1's `createMultipleRecords` + `updateMultipleRecords` were sequential single-record loops marketed as batch; V2 ships real Airtable batch APIs (`POST` / `PATCH /v0/{baseId}/{tableIdOrName}` with `records: [...]`, max 10, all-or-nothing). V1's `addAttachment` did Supabase temp-uploads + scheduled cleanup; V2 reuses the P-S3 contract instead. V1's `airtable_trigger_table_deleted` separate trigger type is NOT ported — it's a payload discriminator inside the existing consolidated `record_changed` trigger.

---

## 1. Commit chain

| Commit | Title |
|---|---|
| `f4d25faa7` | `docs(airtable): add parity audit` — Commit 0 (audit; doc-only). |
| `e695cbc21` | `feat(airtable): promote attachment field type` — Commit 1 (platform-tier; `attachment` moves from DEFERRED to SUPPORTED + read/write formatters; no new action). |
| `aff3b6cf7` | `feat(airtable): add attachment action` — Commit 2 (`add_attachment`; third V2 P-S3 consumer). |
| `83b043686` | `feat(airtable): add batch create records action` — Commit 3 (`create_multiple_records`; true Airtable batch POST). |
| `43fc44197` | `feat(airtable): add batch update records action` — Commit 4 (`update_multiple_records`; true Airtable batch PATCH). |
| `55afbf3c5` | `test(airtable): extend walkthrough with 2.1 parity coverage` — Commit 5 (`record_changed` `table_deleted` fold + e2e coverage of all four 2.1 surfaces). |

This doc (Commit 6) is the retro. **No runtime code changes.**

---

## 2. Scope shipped

### Field types

| Type | Status before 2.1 | Status after 2.1 |
|---|---|---|
| `attachment` (write) | DEFERRED — `UnsupportedFieldTypeError` thrown at handler-side `formatFieldValue` | **SUPPORTED** — `[{url, filename?}]` wire shape |
| `attachment` (read) | DEFERRED (`parseFieldValue` rejected) | **SUPPORTED** — 6-key bounded projection `{id, url, filename, size, type, thumbnails?}` |

DEFERRED list shrinks from 17 → 16 entries. The remaining 16 are all computed (formula, rollup, lookup, count, autoNumber, createdTime, lastModifiedTime, …) or collaborator types (singleCollaborator, multipleCollaborators, createdBy, lastModifiedBy) — write-supportable promotion is intentionally limited to `attachment` only in 2.1.

### Actions (3 new + 4 existing get attachment support)

| Action | Airtable endpoint | What it does | V1 reference |
|---|---|---|---|
| `add_attachment` | `PATCH /v0/{baseId}/{tableIdOrName}/{recordId}` | Writes a `FileRef`-described file into an attachment field. Third V2 P-S3 consumer. **REPLACE-only semantic** — no GET-then-merge. | `lib/workflows/actions/airtable/addAttachment.ts` (249 LOC; V2 redesigned, NOT ported as-is) |
| `create_multiple_records` | `POST /v0/{baseId}/{tableIdOrName}` with `body.records = [{fields}]` | True Airtable batch create. Max 10. All-or-nothing. ONE HTTP request per call. | `lib/workflows/actions/airtable/createMultipleRecords.ts` (228 LOC; sequential loop NOT ported) |
| `update_multiple_records` | `PATCH /v0/{baseId}/{tableIdOrName}` with `body.records = [{id, fields}]` | True Airtable batch update. Max 10. All-or-nothing. ONE HTTP request per call. PATCH semantics per record. | `lib/workflows/actions/airtable/updateMultipleRecords.ts` (119 LOC; sequential loop NOT ported) |

Plus, attachment-field writes are now valid in `create_record` / `update_record` / `create_multiple_records` / `update_multiple_records` via the discriminated union `TypedFieldInputSchema` (the `type: "attachment"` arm). Workflow authors that already have a public URL can write the attachment inline; workflows that need byte ingestion use the dedicated `add_attachment` action.

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Airtable action total after 2.1: 11** (8 Slice 10 + 3 Airtable 2.1).

### API wrappers (2 new)

| Wrapper | Module | Used by |
|---|---|---|
| `recordsBatchCreate` | EXTENDED [`api/records.ts`](../../integrations/airtable/api/records.ts) | `create_multiple_records` |
| `recordsBatchUpdate` | EXTENDED [`api/records.ts`](../../integrations/airtable/api/records.ts) | `update_multiple_records` |

Both wrappers route through Slice 10's [`airtableRequest`](../../integrations/airtable/api/_request.ts):
- `Authorization: Bearer <accessToken>` header.
- 401 → `Unauthorized401Error` (caught by `refreshAndRetry`; Airtable surfaces `IntegrationActionRequiredError(reason: "refresh_failed")` only after a second 401).
- 404 → `NotFoundError(resourceLabel)`.
- Other non-2xx → tagged `Error("Airtable <METHOD> <path> failed: <surfaced message>")`.

Both wrappers do **defensive field selection** — only `id` + `fields` (or `fields` alone for `recordsBatchCreate`) survive from each caller-supplied entry. Extras cannot smuggle into the wire request.

**Zero changes** to `airtableRequest` / `_base.ts` / `errors.ts`.

`add_attachment` reuses the existing `recordsUpdate` wrapper (no new wrapper needed) — it's just a single-record PATCH with `fields[<attachmentField>] = [{url, filename}]`.

### Trigger surface — no new types

- Existing consolidated `airtable:record_changed` trigger remains. **No `airtable:table_deleted` registry entry was added** (NPD-A4 — fold).
- `RecordChangedEventType` union extended with `"table_deleted"`.
- `normalizePayload` now also walks payload-root-level `destroyedTableIds` after the existing `changedTablesById` walk; emits one event per destroyed tableId.
- Existing record-level event semantics (`created` / `updated` / `deleted`) preserved unchanged.

### Manifest scope changes

**None.** The four Slice 10 Batch 1 scopes (`data.records:read`, `data.records:write`, `schema.bases:read`, `webhook:manage`) cover every Airtable 2.1 endpoint. The mock-tests `webhook:manage` covers `webhooks.list_payloads`; the action surface uses only `data.records:read` (find/list/get) and `data.records:write` (single + batch create/update/delete + attachment).

### File system

No reshape. New files added in-place:
- `integrations/airtable/actions/addAttachment.ts` + `.schema.ts`
- `integrations/airtable/actions/createMultipleRecords.ts` + `.schema.ts`
- `integrations/airtable/actions/updateMultipleRecords.ts` + `.schema.ts`

The `integrations/airtable/actions/` leaf folder has 22 files (well under the 50-file limit).

---

## 3. Durable decisions worth preserving

### 3.1 Attachment field type — typed write shape, bounded read projection, NO name heuristic

`_shared/airtable/fields.ts` `formatFieldValue` (write) accepts `AttachmentWriteInput[]` — strict `{url, filename?}` objects — and forwards verbatim to Airtable's wire shape (Airtable's REST API accepts the same `[{url, filename?}]` shape). Empty array allowed and forwarded (clears the field — same semantic as `multipleSelects`).

`_shared/airtable/fields.ts` `parseFieldValue("attachment", …)` (read) projects Airtable's response (`[{id, url, filename, type, size, thumbnails?, width, height, ...}]`) into a bounded 6-key shape: `{id, url, filename, size, type, thumbnails?}`. `width` / `height` / `presignedUrl` / future extras do NOT propagate. Missing fields default cleanly (`size: 0` if absent; `id: ""` if absent — which signals "Airtable hasn't ingested yet").

V1's "if field name contains 'photo' it's an attachment" heuristic (`createRecord.ts:669-672`) is **permanently rejected**. V2's discriminated-union `TypedFieldInputSchema` requires explicit `type: "attachment"` from the caller — there is no name-based inference at any layer.

### 3.2 `add_attachment` — FileRef in, replace-only out

`add_attachment` is the third V2 P-S3 consumer (after Slack 2.4 `upload_file` + Gmail 2.3 `get_attachment`).

- **Input:** `file: FileRef`.
  - `kind: "v2_storage"` — handler mints a 10-min Supabase signed URL via `services/files/createWorkflowFileSignedUrl`. Airtable fetches from the signed URL during ingestion; the signed URL never appears in output.
  - `kind: "signed_url"` — handler forwards the URL directly. Caller-provided URL must be auth-free (P-S3 invariant).
  - `kind: "provider_url"` — REJECTED at handler entry with `AirtableAddAttachmentConfigError(code: "provider_url_unsupported")` + a hint pointing to `slack:download_file` / `gmail:get_attachment` for staging. Mirrors Slack 2.4's `SlackUploadConfigError` pattern. Per P-S3 durable rule #5.
- **Semantic:** REPLACE. The PATCH body sets the attachment field to a single-element array. Existing attachments on the field are overwritten.
- **No GET-then-merge.** No `preserveExisting` flag (NPD-A5 — deferred). No `appendToExisting` flag (NPD-A6 — deferred). One PATCH per call.
- **Output:** `{baseId, tableIdOrName, recordId, fieldName, attachmentCount, attachments: ParsedAttachment[]}` — bounded 6-key projection per attachment. The signed URL we sent NEVER appears in the output (Airtable mints its own URL on ingestion; the e2e mock simulates this and the e2e regression-guards the no-leak property).
- **No bytes / base64 / content / `data`** in output. **No raw Airtable response spread.**
- **No Supabase temp-upload coupling** (V1's `supabaseAttachment.ts` 133-LOC helper is NOT ported).

### 3.3 Batch create / batch update — true Airtable batch APIs

V1's `createMultipleRecords` (228 LOC) and `updateMultipleRecords` (119 LOC) are sequential single-record loops marketed as batch (parity-audit A-R11). V2 uses Airtable's **real** batch wire format.

- **One wrapper call per action invocation.** No sequential loop. Unit + handler tests explicitly assert that `recordsCreate` / `recordsUpdate` (single-record) are NEVER called from the batch handlers.
- **Max 10 records per request — fail loud.** Schema enforces `.min(1).max(10)` with a `cap`-mentioning error message. V1's `Math.min(Number(config.maxRecords) || 10, 10)` silent truncation (A-R12) is NOT ported.
- **All-or-nothing semantics (NPD-A1).** Airtable returns 422 if any record fails validation; the error propagates verbatim. **No `continueOnError`** (A-R13). **No `success: false` synthetic ActionResult envelope** (A-R15). **No `failedRecords[]` / partial-success output.** **No per-record retry.**
- **Every record's fields flow through the shared `formatFields` helper** — same path as `create_record` / `update_record`. Deferred field types throw `UnsupportedFieldTypeError` BEFORE the wrapper call (no network, no `refreshAndRetry`).
- **Attachment fields supported in batch records** via Commit 1's promotion. Unit tests pin this for both `create_multiple_records` and `update_multiple_records`.
- **Defensive entry selection at the wrapper layer.** `recordsBatchCreate` wire selects only `fields` from each entry; `recordsBatchUpdate` selects only `id + fields`. Unit tests pin that an `extra` key on a caller-supplied entry is dropped before the wire request.
- **Bounded output projection.** `{baseId, tableIdOrName, createdCount/updatedCount, records: [{id, fields, createdTime}]}`. `createdTime` falls back to `null` if Airtable omits it. **No raw Airtable response spread.**
- **`typecast` is explicit per Q11 — no silent default.** Same convention as Slice 10's `create_record` / `update_record`.
- **No `maxRecords` config field.** V1 exposed it; V2 forces the user to supply the actual records they want.

### 3.4 `record_changed` `table_deleted` fold — discriminator inside the consolidated trigger

V1 ships THREE trigger types (`new_record` / `record_updated` / `table_deleted`). Slice 10 already collapsed V1's first two into a single consolidated `record_changed` trigger with `eventType: "created" | "updated" | "deleted" | "unknown"`. Airtable 2.1 extends the same discriminator with `"table_deleted"` rather than introducing a fourth trigger type.

- **Wire shape consumed:** root-level `destroyedTableIds: string[]` on the webhook payload (Airtable's actual shape — destroyed tables live at the payload root, NOT inside `changedTablesById`, since the table no longer exists).
- **`RecordChangedEventType` union extended** with `"table_deleted"`. Five values total (`created` / `updated` / `deleted` / `table_deleted` / `unknown`).
- **One TriggerEvent per destroyed tableId.** Per-event payload: `{eventType: "table_deleted", baseId, tableId, destroyedTableIds: [...full snapshot...], baseTransactionNumber}`. No `recordId`, no `fields`.
- **Dedup key shape:** `${webhookId}:${tableId}:_table_:table_deleted:${baseTransactionNumber}`. Preserves the 5-segment shape; unique per `(webhookId, tableId, baseTransactionNumber)`.
- **NO `airtable:table_deleted` trigger registry entry.** Workflows branch on `payload.eventType`, not a separate trigger type. The outer `TriggerEvent.eventType` remains `record_changed` so the dispatcher's `(provider, eventType)` lookup uses the existing scope.
- **Record create/update/delete semantics preserved.** No regression to the existing record-level event handling.
- **V1's `destroyed_table_ids` snake_case alias NOT ported.** V2 trusts current Airtable's camelCase responses (same convention as the snake_case ↔ camelCase reconciliation rejection on V1 receive route, A-R10).
- **V1's `watchedTables: string[]` config-side filter NOT ported.** Workflows that want to filter by tableId branch on `payload.tableId` downstream.

### 3.5 P-S3 reuse — Airtable is the third consumer

Slack 2.4 was the first P-S3 consumer (`upload_file`). Gmail 2.3 was the second (`get_attachment`). Airtable 2.1 is the third (`add_attachment`).

Pattern: action accepts `FileRef`, rejects `provider_url` with a structured error pointing to a staging action, resolves `v2_storage` via `services/files/createWorkflowFileSignedUrl`, forwards `signed_url` directly. The FileRef contract didn't change — Airtable validates the reuse story across three different provider archetypes (Slack chat, Gmail email, Airtable record-attachment).

Generalized rule: **`provider_url` FileRefs are rejected at handler entry for any provider that doesn't have a provider-safe URL fetcher.** This is per-provider, not platform — generic fetching is future work that hasn't landed yet.

### 3.6 NO orphan / workflow-recipe ports

- **`duplicate_record` SKIPPED as workflow recipe.** Workflow equivalent: `get_record` → `create_record` with field overrides. V1's `fieldsToCopy` / `fieldsToOverride` structural mapping belongs in the builder UI / variable mapping (Phase 3), not a dedicated handler.
- **`move_record` PERMANENTLY SKIPPED — V1 orphan dead code.** Per the post-Stripe-2.1 rule: V1 orphan handlers are dead code and not pre-ported. Workflow recipe equivalent: `get_record` → `create_record` in destination → `delete_record` in source.

---

## 4. V1 rot NOT ported

Cross-referenced with `parity-airtable.md` §8.

| ID | Pattern | V2 stance |
|---|---|---|
| A-R1 | Deprecated dual webhooks table (`lib/integrations/airtable/webhooks.ts`, 704 LOC, marked DEPRECATED 2025-10-03) | NOT PORTED — V2 ships only `trigger_resources` (already addressed in Slice 10). |
| A-R2 | In-memory `processedRecords` Map + `pendingRecords` setTimeout-based delayed execution | NOT PORTED — V2 uses DB-backed `webhook_event_dedup` (already addressed in Slice 10). |
| A-R3 | `verificationDelay` Node-setTimeout deferred dispatch | NOT PORTED — V2's webhook receive dispatches synchronously. |
| A-R4 | Per-provider cron route (`/api/webhooks/refresh-airtable`) | NOT PORTED — V2 uses `subscriptionRegistry` + `runRenewals` cron. |
| A-R5 | Orphan API route (`/api/integrations/airtable/register-webhooks`) | NOT PORTED — dead code. |
| A-R6 | Attachment-by-name heuristic ("if field name contains 'photo' it's an attachment") | NOT PORTED — V2 requires explicit `type: "attachment"` via the discriminated-union schema. |
| A-R7 | Supabase temp-upload + 10-min `setTimeout` cleanup helper (`supabaseAttachment.ts`, 133 LOC) | NOT PORTED — Airtable 2.1's `add_attachment` uses the P-S3 contract instead. |
| A-R8 | Always-1-second-prepend rate limiter | NOT PORTED — V2 lets Airtable rate-limit naturally. |
| A-R9 | Convenience builder layer in `listRecords` (`keywordSearch`, `dateFilter`, `customDateRange`) | NOT PORTED — V2 forward-passes `filterByFormula` verbatim. |
| A-R10 | snake_case ↔ camelCase reconciliation in receive route | NOT PORTED — V2 trusts current Airtable's camelCase. |
| A-R11 | Sequential single-record loops marketed as "batch" | **REDESIGNED** — V2 ships real Airtable batch APIs. |
| A-R12 | Silent `Math.min(maxRecords, 10)` cap | **REDESIGNED** — V2 fails loud at parse time on `.max(10)`. |
| A-R13 | `continueOnError` partial-success semantics | **REDESIGNED** — V2 batch is all-or-nothing per Airtable's wire contract. |
| A-R14 | 5-minute in-memory schema cache | NOT PORTED — V2 doesn't cache schema in memory. |
| A-R15 | `success: false` synthetic ActionResult envelopes | NOT PORTED — V2 lets errors propagate to the engine; `findRecord` returns `{found: false}` only for the "no-match" semantic. |
| A-R16 | "preserveExisting" GET-then-merge attachment pattern | DEFERRED to follow-up (NPD-A5) — `add_attachment` is REPLACE-only in 2.1. |

---

## 5. E2E validation

[`tests/e2e/slice-10-airtable-walkthrough.spec.ts`](../../tests/e2e/slice-10-airtable-walkthrough.spec.ts) extended with a new compressed test (`2.1 parity: ...`) covering all four Airtable 2.1 surfaces against the same connected integration (one OAuth dance, four fresh workflows). Existing Slice 10 walkthrough (cursor-advance + dedup + invalid-sig 401) stays green.

### 5.1 Scenarios

1. **`create_multiple_records`** — workflow with batch-create action (2 records). Asserts:
   - Exactly ONE POST batch request to `/v0/appBASE/Logs`.
   - `body.records.length === 2`.
   - Typed-field wire formatting verified (`singleLineText → string`, `checkbox → boolean`).
   - `typecast: false` threaded.
   - Mock's recorded call has `recordId: null` (proves batch path, not single-record path).
   - Bounded `createdCount: 2` + records each with id matching `recMOCK*`.
   - No sequential per-record `recordsCreate` calls.

2. **`update_multiple_records`** — workflow with batch-update action (2 records). Asserts:
   - Exactly ONE PATCH at the table endpoint (`recordId: null`).
   - `body.records = [{id, fields}, ...]` with both entries forwarded verbatim.
   - No per-record loop.
   - Bounded `updatedCount: 2`.

3. **`add_attachment`** — workflow with `signed_url` FileRef. Asserts:
   - Exactly ONE PATCH at the record endpoint.
   - `fields[Photo] = [{url: signedUrl, filename: "cat.png"}]` flows IN.
   - No preceding GET — no GET-then-merge.
   - Bounded `attachmentCount: 1` + `attachments[0].url` matches `https://airtable-mock.example/attachments/att*` (Airtable's minted URL).
   - **Signed URL does NOT leak into step output.** The e2e injects a recognizable token (`NEVER_LEAK_THIS_TO_OUTPUT`) into the input URL and asserts via `expect(JSON.stringify(step.output)).not.toContain("NEVER_LEAK_THIS")`. This is the load-bearing assertion for the P-S3 no-secret-leak invariant.

4. **`record_changed` `table_deleted` fold** — workflow with the existing `record_changed` trigger. Asserts:
   - `__injectTableDeleted` payload (with root-level `destroyedTableIds`) triggers the workflow.
   - `workflow_runs.status === "succeeded"`.
   - `trigger_event.eventType === "record_changed"` (outer canonical type unchanged).
   - `trigger_event.payload.eventType === "table_deleted"` (discriminator inside payload).
   - `payload.baseId` + `payload.tableId` + `payload.destroyedTableIds` all present and correct.
   - **No separate `airtable:table_deleted` trigger required.**

### 5.2 Mock additions

[`tests/e2e/helpers/mockAirtableServer.ts`](../../tests/e2e/helpers/mockAirtableServer.ts) extended:
- POST `/v0/{baseId}/{tableIdOrName}` discriminates batch (`body.records[]`) vs single (`body.fields`).
- PATCH `/v0/{baseId}/{tableIdOrName}` (new — batch update at the table endpoint). Auto-creates missing record ids for e2e ergonomics.
- PATCH `/v0/{baseId}/{tableIdOrName}/{recordId}` (existing) now mints Airtable-style URLs for any field value shaped as `[{url, filename?}]`. Simulates Airtable's ingestion — the caller-supplied URL never appears in the response.
- New `/__injectTableDeleted` control endpoint pushes a payload with root-level `destroyedTableIds`.
- `attachmentCounter` added to state.

### 5.3 Test-isolation lesson — DO NOT `/__reset` between scenarios

The first version of the new e2e test called `/__reset` between scenarios, which timed out scenario 2 waiting for a workflow_run. Root cause:

> The mock's `webhookCounter` resets to 0 on `/__reset`. Each subsequent workflow activation re-runs the mock's webhook-create path and receives webhookId `achMOCKWEBHOOK1` again, but with a fresh random MAC secret. The Supabase `trigger_resources` table accumulates two rows with the same `webhookId` and different secrets. Signature verification mismatches against whichever row the lookup happens to return, the receive route 401s, and the workflow never runs.

This is a **test-isolation bug, not production behavior** — in production, every Airtable webhook has a globally-unique id. The cure is to NOT reset between scenarios: each scenario snapshots `calls.records.length` before activation and asserts the diff via `calls.records.slice(snapshot)`. Webhook ids increment 1→2→3→4 across the run.

Companion rule for future e2e additions to provider-mock specs: **`/__reset` is for between-test scoping (where the DB also gets reset via `deleteTestUser`), not between-scenario scoping inside a single test that shares trigger_resources state.**

---

## 6. Test totals

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`
- `npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts --workers=1` (Commit 5)

Final totals after Commit 5:
- **Full `npm test`: 658 suites / 6404 tests passing.**
- **Airtable focused (`tests/unit/integrations/airtable/` + `tests/unit/services/execution/handlers/`): 28 suites / 319 tests passing.**
- **Wider airtable scope (incl. `_shared/airtable/`): 32 suites / 403 tests passing.**
- **Airtable e2e: 2/2 walkthrough tests pass (~43s with `--workers=1`).**

---

## 7. Acceptance criteria (post-merge)

- [x] 3 new actions registered in `services/execution/handlers/_registry.ts` (total 11 Airtable actions).
- [x] 2 new wrapper functions (`recordsBatchCreate`, `recordsBatchUpdate`) routed through `airtableRequest`.
- [x] Every handler uses `refreshAndRetry` with `accountId = triggerEvent.accountId`.
- [x] Every schema is `.strict()` — unknown fields rejected at design time.
- [x] Every output key set is locked by a test asserting `Object.keys(output).sort() === expected.sort()`.
- [x] No `success: false` synthetic ActionResult envelopes — errors propagate.
- [x] No `continueOnError` / `preserveExisting` / `appendToExisting` flags exposed.
- [x] No `maxRecords` config field on batch actions.
- [x] Batch actions reject > 10 records at parse time (fail loud).
- [x] Batch actions make exactly ONE wrapper call (no sequential loop).
- [x] `add_attachment` rejects `FileRef(kind=provider_url)` at handler entry with a structured error.
- [x] Attachment field type promoted from DEFERRED to SUPPORTED.
- [x] `RecordChangedEventType` extended with `"table_deleted"`.
- [x] NO separate `airtable:table_deleted` trigger type registered.
- [x] `record_changed` continues to fire on `created` / `updated` / `deleted` event types unchanged.
- [x] E2E walkthrough covers all 4 surfaces with regression guards on signed-URL leak and batch single-call.
- [x] Existing Slice 10 walkthrough remains green.

---

## 8. What's deferred

### Deferred to a follow-up Airtable slice (preserveExisting / appendToExisting attachments)

| Item | Audit recommendation |
|---|---|
| `add_attachment` `preserveExisting: true` (V1 GET-then-merge) | DEFERRED (NPD-A5). Two API calls per add. Ship the simpler REPLACE-only semantic first; revisit if a workflow needs append. |
| `add_attachment` `appendToExisting: true` (variant of preserveExisting) | DEFERRED (NPD-A6). Same rationale — explicit opt-in if needed. |
| `watchedTables: string[]` filter on `record_changed` trigger | NOT PORTED. Workflows branch on `payload.tableId` downstream. Could be added as a typed activation-config field if usage signal emerges. |

### Permanently skipped

| Item | Reason |
|---|---|
| `airtable:table_deleted` separate trigger type | Folded as `payload.eventType` discriminator inside `record_changed` (NPD-A4). |
| `duplicate_record` action | Workflow recipe — `get_record` + `create_record` with overrides. Structural mapping belongs in the builder UI / variable mapping (Phase 3). |
| `move_record` action | V1 orphan — dead code per the post-Stripe-2.1 rule. Workflow recipe equivalent. |
| Attachment-by-name heuristic ("photo" → attachment) | Replaced by explicit discriminated-union `type: "attachment"`. |
| Supabase temp-upload + scheduled cleanup helper | Replaced by P-S3. |
| V1 sequential fake-batch loops | Replaced by true Airtable batch APIs. |
| `continueOnError` partial-success envelope | Replaced by all-or-nothing per Airtable's wire contract. |
| V1's `success: false` synthetic ActionResult envelopes | Replaced by error propagation to the engine. |
| V1's `destroyed_table_ids` snake_case alias | V2 trusts current Airtable's camelCase. |
| 5-minute in-memory schema cache | Per-action schema fetch (already addressed in Slice 10). |

### Out of scope — not started

- Any Airtable 2.2 work. The audit covered Airtable 2.1 only; Airtable 2.2 would require a fresh audit and is not pre-committed.

---

## 9. CLAUDE.md updates landed

A new "Phase 2 progress (Airtable)" entry under "Current Local Development State" records the Airtable 2.1 commit chain and shipped surface.

A new "Airtable Phase 2 patterns" subsection under "Deep Gotchas" records six durable rules:
- Airtable batch actions use true batch APIs (max 10, fail loud, all-or-nothing).
- No V1 sequential fake-batch loops; no `continueOnError` / partial-success envelopes.
- Attachment writes use typed `[{url, filename?}]` shape OR `add_attachment` with a FileRef — never V1's temp-upload heuristic or name-based detection.
- `provider_url` FileRefs are rejected at the `add_attachment` handler entry — workflows stage via `slack:download_file` / `gmail:get_attachment` first.
- `table_deleted` is a `payload.eventType` discriminator inside `record_changed`, NOT a separate trigger type.
- Orphan `moveRecord` permanently skipped; workflow-recipe equivalents (`duplicate_record`, `move_record`) belong in the builder UI, not the handler registry.

---

## 10. What's next (Airtable roadmap)

Per parity-airtable §§11–13:

- Airtable 2.2 — not pre-committed. If product signal emerges for `preserveExisting` / `appendToExisting` attachments, or `watchedTables` trigger filter, or unrecorded action gaps surface, a fresh parity audit drives the slice.
- No platform-tier follow-up work depends on Airtable 2.1.

Airtable 2.1 closes the parity gap surfaced by the audit. The next provider audit is the natural next step unless Marcus assigns Airtable 2.2 work explicitly.
