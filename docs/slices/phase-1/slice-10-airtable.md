# Slice 10 — **Airtable** provider port

**Branch:** `slice-10-airtable` (off `slice-9-notion` @ `c6dfc898f`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Airtable from V1 as the **first non-Google / non-Microsoft refreshable OAuth provider** in V2 *and* the **first webhook-with-cursor-payload-fetch trigger model**. Ships an OAuth dispatcher entry (refreshable + PKCE + rotated refresh tokens), 8 typed action handlers covering records/schema, a typed field polymorphism helper covering 14 of Airtable's 30+ field types, plus a `record_changed` consolidated trigger using V2's `subscriptionRegistry` for renewal.

Slice 10 introduces TWO new V2 patterns simultaneously:

1. **Refreshable OAuth outside Google/Microsoft.** V2 has validated refresh against Google (Gmail, Calendar, Drive, Sheets) and Microsoft (Outlook Mail, Outlook Calendar, OneDrive). Slice 9 (Notion) and Slice 1 (Slack) validated the non-refreshable path. Airtable proves V2's `services/oauth/refreshAndRetry.ts` + dispatcher's `updateTokens()` flow generalize to a third refreshable family — including **rotated refresh tokens** (each refresh issues a new refresh token; the old one is invalidated) and **60-min access TTL with 60-day idle window**.
2. **Webhook ping → cursor payload fetch.** Different from every existing V2 webhook trigger. Microsoft Graph delivers full payloads in the notification (Slice 6/7/8). Google Drive watch + Sheets onChange deliver push notifications carrying the changed item id. Slack delivers full event payloads. **Airtable webhooks deliver only `{ base, webhook, timestamp }` — V2 must POST `/v0/bases/{baseId}/webhooks/{id}/payloads?cursor=N` to fetch the actual changes.** Slice 10 builds the cursor-management primitive that future ping-only providers can reuse.

Slice 10 also **reuses Notion's typed-polymorphism pattern** as `_shared/airtable/fields.ts` — proves the design intent that `_shared/<vendor>/properties.ts`-style modules generalize beyond a single provider.

---

## Why Airtable now

Confirmed via deep V1 audit + cross-check against current Airtable API docs (this commit):

1. **Validates V2's refresh-rotation contract on a real provider.** Notion exercises the `RefreshNotSupportedError` path; Google/Microsoft exercise the persistent-refresh-token path. **Nothing in V2 today exercises rotated refresh tokens.** Airtable issues a new refresh token on every refresh and invalidates the old one — V2's `dispatcher.refresh` → `updateTokens` flow needs to correctly persist the new refresh token (it already does; this is just the first real test).
2. **Validates V2's PKCE contract on a fourth provider.** Gmail / Microsoft Outlook / Microsoft Outlook Calendar / Microsoft OneDrive use PKCE; Slack / Notion don't. Airtable **requires** PKCE per current docs (`code_challenge` + `code_challenge_method` mandatory on authorize; `code_verifier` mandatory on token exchange). Slice 10 is the first non-Google / non-Microsoft PKCE provider.
3. **Establishes the cursor-payload-fetch trigger primitive.** Future providers with similar models (e.g., Webflow, Asana for some events, certain SaaS analytics) can reuse the V2 helper Slice 10 introduces. The pattern is meaningfully different from delta cursors (OneDrive's `deltaToken` advances on each receive; Airtable's cursor is a per-webhook integer counter advanced by the *fetch*, not the *receive*).
4. **High product value.** Airtable is the most-requested non-Google/Microsoft destination for "create a row when X happens" workflow patterns.
5. **Light external setup.** Airtable developer-portal app registration + OAuth scopes config — no admin consent (Teams), no Stripe Connect platform setup, no GitHub App vs OAuth choice.
6. **Notion's `_shared/notion/properties.ts` pattern proven; Airtable validates it generalizes.** `_shared/airtable/fields.ts` follows the exact shape: typed inputs, typed outputs, `UnsupportedFieldTypeError` thrown on deferred types.

---

## Confirmed scope decisions

1. **New provider id — `airtable`.** Standard V2 provider folder + dispatcher route. Single Airtable OAuth integration per (user, accountId).
2. **Eight actions — `list_records`, `get_record`, `find_record`, `create_record`, `update_record`, `delete_record`, `get_base_schema`, `get_table_schema`.** Per-action V1 audit + classification in §"V1 audit" below.
3. **One consolidated trigger — `record_changed`** with payload `eventType: "created" | "updated" | "deleted" | "unknown"` discriminator. V1 conceptually has separate created / updated / deleted hooks but Airtable's webhook delivers all three through the same cursor-fetched payload — V2 normalizes to one trigger that workflows can branch on. Mirrors Slice 7 (calendar) and Slice 8 (OneDrive) consolidation.
4. **14 supported field types in Batch 1:** `singleLineText`, `longText`, `number`, `currency`, `percent`, `singleSelect`, `multipleSelects`, `checkbox`, `date`, `dateTime`, `email`, `url`, `phoneNumber`, `multipleRecordLinks`. Defer: `attachment`, `formula`, `rollup`, `lookup`, `count`, `rating`, `duration`, `autoNumber`, `barcode`, `button`, `singleCollaborator`, `multipleCollaborators`, `createdBy`, `createdTime`, `lastModifiedBy`, `lastModifiedTime`, `externalSyncSource`, `aiText`. Deferred set throws `UnsupportedFieldTypeError` from `_shared/airtable/fields.ts`.
5. **OAuth — refreshable + PKCE.** Manifest declares `refreshable: true`. `generatePkce()` returns SHA-256 challenge. Token exchange: HTTP Basic auth header (`Basic base64(client_id:client_secret)`) + `application/x-www-form-urlencoded` body with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`. Refresh: same Basic auth + form body with `grant_type=refresh_token`, `refresh_token`, `redirect_uri`. **Refresh tokens are rotated** — V2's existing `dispatcher.refresh` → `updateTokens` flow correctly persists the new refresh token + new access token. **60-min access token TTL** — V2 stores `accessTokenExpiresAt` so health checks can proactively refresh. **60-day refresh token idle window** — refreshing extends the clock; integrations used regularly never expire. After 60 days idle, user must reconnect.
6. **OAuth scopes — exactly four (Batch 1):** `data.records:read`, `data.records:write`, `schema.bases:read`, `webhook:manage`. Defer: `schema.bases:write` (no schema-mutation actions in Batch 1), `user.email:read` (V2 doesn't surface email — uses `id` from `/v0/meta/whoami`). Scopes are space-separated in the authorize URL, matching V1's wire-format.
7. **`tokenScope` — `user`.** One Airtable integration per (user, providerAccountId).
8. **`accountIdField` — `userId`** (Airtable's `/v0/meta/whoami` returns `id` like `usrL2PNC5o3H4lBEi`). The bot/workspace concept doesn't apply to Airtable — each authorize grants tokens scoped to the user's Airtable account.
9. **`apiVersion` — `v0`.** Airtable's REST API version. All wrappers use `/v0/...` paths.
10. **Health check interval — 12h.** Matches V2's "other providers" tier (Notion, Slack, Discord). Airtable's API is gentle on rate limits; 12h `/v0/meta/whoami` ping is more than enough.
11. **Webhook subscription resource — `/v0/bases/{baseId}/webhooks`.** One subscription per (base, trigger) — workflows pick a base + optional table filter at trigger config time. Webhook spec includes `dataTypes: ["tableData"]` and optional `recordChangeScope` for table-level filtering.
12. **Webhook signature — HMAC-SHA256 hex, `X-Airtable-Content-MAC: hmac-sha256=<hex>`.** Key is the base64-decoded `macSecretBase64` returned at webhook creation. V1's `validateAirtableSignature` accepts both hex and base64-encoded signature values defensively; V2 follows current Airtable docs (hex only) and falls back to base64 for backward compat. Constant-time compare via `crypto.timingSafeEqual`.
13. **Webhook payload-fetch — cursor-based, integer counter.** V2 stores `lastCursor` in `trigger_resources.config`. On each ping, V2 POSTs `/v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor=lastCursor+1` (or omits cursor on first call). Response includes `payloads[]` and `cursor` (next sequential id). V2 advances the cursor on successful fetch; on transient failure, the next ping's fetch picks up from the persisted cursor without data loss.
14. **Webhook subscription expiration — 7 days.** V1's renewal cron checks for ≤2-day-to-expiry. V2 uses `subscriptionRegistry`'s renewal hook with a **6-day renewal threshold** (close to V1's effective "≤24h-to-expiry could miss the cron" safety) — registers via the existing `subscriptionRegistry` cron without a per-provider cron route. Renewal POSTs `/v0/bases/{baseId}/webhooks/{webhookId}/refresh` (no body required); response returns the new `expirationTime`.
15. **Trigger dedup key shape — `${webhookId}:${tableId|table}:${recordId}:${eventType}:${transactionNumber}`.** Each Airtable payload includes a `transactionNumber` integer (per-webhook sequential). Combined with record id + eventType, each per-record change in each transaction produces a unique dedup key. Falls back to `${webhookId}:${tableId|table}:${recordId}:${eventType}:${notificationOccurredAt}` when transaction number is absent (defensive — should always be present per Airtable docs).
16. **No new DB migration.** All state fits existing `integrations` (PKCE verifier on `oauth_states`; new refresh token rotates into `refresh_token_encrypted`) and `trigger_resources` (`config.lastCursor`, `config.macSecretBase64`, `config.baseId`, `config.tableId?`, `config.webhookUrl`, `expires_at` already on the row). **STOP-AND-REPORT** if a new table is needed.

---

## Six confirmation answers

| Question | Answer | Citation |
|---|---|---|
| **1. Airtable OAuth refreshable?** | **Yes — and refresh tokens are ROTATED on every refresh.** Each successful refresh returns a new access_token AND a new refresh_token; the old refresh token is invalidated. 60-min access TTL; 60-day refresh idle window (sliding). V1's `refreshTokenExpirationSupported: false` flag means *the refresh token has no explicit expiration metadata*, NOT that refresh isn't supported. Manifest declares `refreshable: true`; V2's `dispatcher.refresh` flow correctly persists the rotated tokens via `updateTokens()`. | Current docs: airtable.com/developers/web/api/oauth-reference (this commit). V1: [`oauthConfig.ts:412-417`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L412), [`tokenRefreshService.ts:252-258`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/tokenRefreshService.ts#L252). |
| **2. PKCE required?** | **Yes — `code_challenge` + `code_challenge_method` are mandatory on the authorize URL; `code_verifier` is mandatory on the token exchange. V2's `ProviderOAuth.generatePkce()` is the integration point. SHA-256 method.** | Current docs (this commit). |
| **3. Webhook subscription model?** | **Programmatic.** POST `/v0/bases/{baseId}/webhooks` with `{ notificationUrl, specification: { options: { filters: { dataTypes: ["tableData"], recordChangeScope?: tableId } } } }`. Response: `{ id, macSecretBase64, expirationTime }`. Webhook becomes active immediately — no validation handshake (unlike Microsoft Graph's `?validationToken=...` callback). 7-day TTL when created via OAuth. Refresh via POST `/v0/bases/{baseId}/webhooks/{id}/refresh`. | Current docs: airtable.com/developers/web/api/create-a-webhook (this commit). V1: [`AirtableTriggerLifecycle.ts:127-145`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/AirtableTriggerLifecycle.ts#L127). |
| **4. Inbound notification format?** | **Ping only.** Body shape: `{ base: { id }, webhook: { id }, timestamp }`. NO record-change data in the notification — V2 must fetch via cursor. Signature header: `X-Airtable-Content-MAC: hmac-sha256=<hex>` over the raw JSON body. | Current docs: airtable.com/developers/web/api/webhooks-overview (this commit). V1: [`app/api/workflow/airtable/route.ts:418-456`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts#L418), [`webhooks.ts:475-543`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts#L475). |
| **5. Cursor model?** | **Integer counter, scoped per-webhook.** Each payload includes a `transactionNumber` (sequential per webhook). V2 fetches via POST `/v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor=N` where N is the next-after-last-seen. Response returns `payloads[]` + `cursor` (next sequential id). V2 persists the new cursor in `trigger_resources.config.lastCursor` after a successful fetch. | Current docs (this commit). V1: [`webhooks.ts:593-643`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts#L593). |
| **6. V1 webhook receive route current or stale?** | **Current as of October 2025**, but built around the deprecated `airtable_webhooks` table (V1 has a documented migration to `trigger_resources` via `AirtableTriggerLifecycle` but the receive route at `/api/workflow/airtable` still queries the old table — V1's own dual-system rot). V2 ships ONE clean receive route at `/api/webhooks/airtable` reading from `trigger_resources` only. The V1 route also uses **in-memory deduplication** (`processedRecords` Map at `route.ts:16-26`) — V2 uses DB-backed `webhook_event_dedup` exclusively. | V1: [`app/api/workflow/airtable/route.ts:14-28`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts#L14) (in-memory dedup), [`webhooks.ts:1-26`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts#L1) (deprecation notice). |

---

## V1 audit + port classification

V1 paths inspected:

| V1 path | What's there | Slice 10 classification |
|---|---|---|
| [`lib/integrations/oauthConfig.ts:405-419`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L405) | OAuth config: Basic auth, form-encoded body, `sendRedirectUriWithRefresh: true`, scopes string | **Reference for OAuth wire-format.** V2 implements via typed `integrations/airtable/oauth.ts`. |
| [`lib/integrations/tokenRefreshService.ts:252-258, 389-394`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/tokenRefreshService.ts#L252) | Airtable-specific refresh quirks (always send redirect_uri; surface "refresh expired or invalid" message on 401) | **Port intent.** V2's `notionOAuth.refreshToken()`-style implementation handles this cleanly per-provider. |
| [`lib/triggers/providers/AirtableTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/AirtableTriggerLifecycle.ts) (351 LOC) | onActivate (creates webhook + writes `trigger_resources`), onDeactivate (deletes webhook), onDelete (alias for deactivate), checkHealth (renewal-window check) | **Port mostly as-is, adapted to V2 patterns.** V2 splits into `triggers/recordChanged/{activate,deactivate,renew}.ts` matching Slice 7/8 shape. The `integrationId:baseId` compound encoding from V1 (line 41-91) is retained for backward compat. Removes V1's silent-FK-error swallow at line 169-175 — V2 lets the error surface. |
| [`app/api/workflow/airtable/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflow/airtable/route.ts) (529 LOC) | Webhook receive: signature verify, cursor-based payload fetch, in-memory dedup + delayed-execution timers, 530 LOC of payload normalization (createdRecordsById/changedRecordsById/destroyedRecordIds + snake_case ↔ camelCase reconciliation) | **Rewrite per V2 boundary.** V2 ships ONE clean receive route at `/api/webhooks/airtable/route.ts` (~120 LOC) using `webhook_event_dedup` (drops in-memory tracking + delayed-execution timers). The payload normalization logic is meaningfully complex and ports to `triggers/recordChanged/normalize.ts` with simplification (V2 trusts `camelCase` keys per current Airtable API; legacy snake_case fallback only if unit tests show real responses use it). |
| [`lib/integrations/airtable/webhooks.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/webhooks.ts) (705 LOC) | DEPRECATED dual system. `validateAirtableSignature` (lines 475-543) + `fetchAirtableWebhookPayloads` (lines 593-643) are the only load-bearing exports. | **Skip everything but the signature + fetch helpers.** V2 ports the signature logic to `_shared/airtable/webhooks/signature.ts` and the fetch logic into `triggers/recordChanged/pull.ts`. Drop all `airtable_webhooks` table references. |
| [`app/api/webhooks/refresh-airtable/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/refresh-airtable/route.ts) (80 LOC) | Per-provider cron route querying deprecated `airtable_webhooks` table | **Skip.** V2 uses `services/triggers/subscriptionRegistry.ts` + `services/triggers/runRenewals.ts` (existing) — Airtable registers its renewal handler in `triggers/recordChanged/renew.ts` and the existing cron picks it up. No per-provider cron route. |
| [`lib/integrations/airtable/api.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/api.ts) (32 LOC) | Thin OAuth → list-bases helper | **Skip.** V2 has typed `api/bases.ts` + `api/records.ts` + `api/tables.ts`. |
| [`lib/integrations/airtable/verification.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/verification.ts) (193 LOC) | Record-existence check + Airtable token validation helpers | **Skip.** Used only by V1's delayed-execution timers (which V2 removes). |
| [`lib/integrations/airtable/payloadUtils.*`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtable/) | Compiled JS + .d.ts; payload normalization helpers | **Skip.** V2 reimplements in TypeScript directly. |
| [`lib/integrations/airtableRateLimiter.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/airtableRateLimiter.ts) (52 LOC) | Always-1-second-delay + exponential 429 backoff | **Skip per accepted plan.** V2 doesn't ship Airtable-specific rate limiting in Batch 1. If Airtable's rate limit (5 req/s per base) becomes a real issue, add a focused 429-only retry inside `_request.ts`. The always-1-second-prepend is over-engineering — V2 sends requests immediately and lets Airtable rate-limit naturally. |
| [`lib/workflows/actions/airtable/createRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/createRecord.ts) (924 LOC) | Schema-aware field formatting (date/dateTime, linked records, attachments via Supabase). Handles 30+ field types via inline switching + heuristics ("if field name contains 'photo' it's an attachment"). | **Reference for create_record contract.** V2 ships ~150-200 LOC: typed schema (Q11), `formatFields` from `_shared/airtable/fields.ts`, plain POST. Inline date formatting (lines 593-636) ports to the shared fields module. Linked-record `recXXX::Display Name` → `recXXX` cleanup (lines 644-657) ports as the `multipleRecordLinks` formatter. Attachment-name heuristic + Supabase upload — **skipped entirely** (attachments deferred). |
| [`lib/workflows/actions/airtable/updateRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/updateRecord.ts) (356 LOC) | Same shape as createRecord | **Reference.** V2 update_record handler ~150 LOC. |
| [`lib/workflows/actions/airtable/deleteRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/deleteRecord.ts) (274 LOC) | DELETE record + verification | **Reference.** V2 delete_record handler ~80 LOC (drops verification — relies on Airtable's 404 + V2's NotFoundError). |
| [`lib/workflows/actions/airtable/getRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getRecord.ts) (68 LOC) | GET single record | **Port mostly as-is.** |
| [`lib/workflows/actions/airtable/findRecord.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/findRecord.ts) (216 LOC) | List records with filterByFormula, returns first match | **Port with V2 adaptation.** V2's find_record forward-passes `filterByFormula` verbatim (V2 trusts the user's formula; same as Notion's filter-passthrough). |
| [`lib/workflows/actions/airtable/listRecords.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/listRecords.ts) (253 LOC) | List records with filter / sort / view / dateFilter / keyword search builders | **Port with V2 adaptation.** V2 forward-passes `filterByFormula`, `sort`, `view`, `pageSize`, `offset`, `fields` verbatim. The keyword-search and dateFilter convenience builders are V1 chrome — V2 skips them; workflow authors pre-compute the formula. |
| [`lib/workflows/actions/airtable/getBaseSchema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getBaseSchema.ts) (97 LOC) | GET `/v0/meta/bases/{baseId}/tables` | **Port mostly as-is.** Already wraps in V1's `refreshAndRetry` — V2's wrapping is the same shape. |
| [`lib/workflows/actions/airtable/getTableSchema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/airtable/getTableSchema.ts) (94 LOC) | GET `/v0/meta/bases/{baseId}/tables` then filter to one table | **Port mostly as-is.** |
| `lib/workflows/actions/airtable/{createMultipleRecords,updateMultipleRecords,duplicateRecord,moveRecord,addAttachment,supabaseAttachment}.ts` | Batch + attachment + record-movement handlers | **Skip per accepted plan.** All deferred. |
| [`lib/workflows/nodes/providers/airtable/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/airtable/) (if exists) | V1 node manifest (action types, field definitions) | **Reference for action / field naming conventions.** V2 owns its own typed schemas. |
| V1 Airtable tests | None found | **Skip — V2 builds the suite.** |

---

## In-scope action list (final)

1. **`list_records`** — `{ baseId, tableIdOrName, filterByFormula?, sort?, view?, pageSize?, offset?, fields? }` → GET `/v0/{baseId}/{tableIdOrName}`. `pageSize` capped at 100 (Airtable's hard ceiling). Returns `{ records, offset }` for pagination.
2. **`get_record`** — `{ baseId, tableIdOrName, recordId }` → GET `/v0/{baseId}/{tableIdOrName}/{recordId}`. Returns full record with parsed fields (typed via `_shared/airtable/fields.ts`).
3. **`find_record`** — `{ baseId, tableIdOrName, filterByFormula }` → GET `/v0/{baseId}/{tableIdOrName}?filterByFormula=...&maxRecords=1`. Returns first match (or null when no match — does NOT throw NotFoundError; "find" semantically allows zero results).
4. **`create_record`** — `{ baseId, tableIdOrName, fields, typecast? }` → POST `/v0/{baseId}/{tableIdOrName}`. `fields` is a typed map keyed by field name; values run through `_shared/airtable/fields.ts` `formatFields` for the 14 supported types. `typecast: false` default (Q11 — workflow authors who want Airtable to coerce strings to enums must opt in explicitly).
5. **`update_record`** — `{ baseId, tableIdOrName, recordId, fields, typecast? }` → PATCH `/v0/{baseId}/{tableIdOrName}/{recordId}`. Same field handling as create_record. PATCH (not PUT) — only the fields the user passed are updated; other fields preserved.
6. **`delete_record`** — `{ baseId, tableIdOrName, recordId }` → DELETE `/v0/{baseId}/{tableIdOrName}/{recordId}`. Returns `{ id, deleted: true }` on success. NotFoundError on 404 (mirrors Notion / Microsoft pattern).
7. **`get_base_schema`** — `{ baseId, includeViews? }` → GET `/v0/meta/bases/{baseId}/tables`. Returns `{ tables: [{ id, name, primaryFieldId, fields, views? }] }`. `includeViews` defaults `false` per V1.
8. **`get_table_schema`** — `{ baseId, tableIdOrName }` → GET `/v0/meta/bases/{baseId}/tables` then filter. Returns the single matching table object. NotFoundError when the table id/name doesn't match any in the base.

All actions wrap their principal API call in `refreshAndRetry`. Airtable's refreshable-with-rotation nature exercises the V2 dispatcher's `updateTokens` flow — load-bearing test for the rotated-refresh-token contract.

---

## Field polymorphism strategy — `_shared/airtable/fields.ts`

Mirrors `_shared/notion/properties.ts` shape. 14 supported types, two directions:

**Outbound — `formatFieldValue(fieldType, value): unknown`**
Used by create_record / update_record. Coerces typed user values into Airtable's wire-format. Most types pass through unchanged; the load-bearing transformations:

| Field type | Input | Wire-format |
|---|---|---|
| `singleLineText`, `longText` | `string` | `string` (passthrough) |
| `number`, `currency`, `percent` | `number \| null` | `number \| null` |
| `singleSelect` | `string \| null` | `string \| null` (Airtable expects the option name) |
| `multipleSelects` | `string[]` | `string[]` (option names) |
| `checkbox` | `boolean` | `boolean` |
| `date` | `string \| Date \| null` | `"YYYY-MM-DD"` (V1's `formatDateForAirtable` logic at lines 619-626) |
| `dateTime` | `string \| Date \| null` | ISO-8601 string |
| `email`, `url`, `phoneNumber` | `string \| null` | `string \| null` |
| `multipleRecordLinks` | `string[] \| string` | `string[]` of record ids; strips `recXXX::Display Name` → `recXXX` per V1 lines 644-657 |

**Inbound — `parseFieldValue(fieldType, rawValue): TypedValue`**
Used by get_record / list_records / find_record / record_changed trigger. Read direction is mostly identity for the supported types — Airtable returns the same shape it accepts. The notable case is `multipleRecordLinks` which always comes back as a plain `string[]` (no display-name suffix on the read path).

**Unsupported types throw `UnsupportedFieldTypeError`** — typed error with the field type name + supported set + deferred set in the message. Workflow authors using deferred types fail loud at design time. The 17 deferred types live in the const `DEFERRED_FIELD_TYPES` so the error message is auto-derived.

**`formatFields(record, schema?)` / `parseFields(record, schema?)`** convenience wrappers iterate a record map. When `schema` is provided (the user passed a base/table schema), the wrapper looks up each field's type and applies the right formatter; when omitted, the wrapper trusts the user's typed input map (keyed by field type discriminator, mirroring Notion's `TypedPropertyInput`). Slice 10 ships both — V1 uses the schema-aware path; V2 prefers the typed-input path for safety, and falls back to schema-aware when get_base_schema is the upstream node.

---

## OAuth model — refreshable + PKCE + rotated tokens

V2's third refreshable-OAuth family (Google, Microsoft, now Airtable) and the **first non-G/non-MS PKCE provider**.

1. **`integrations/airtable/oauth.ts`** implements `ProviderOAuth`:
   - `generatePkce()` returns `{ codeVerifier, codeChallenge, codeChallengeMethod: "S256" }` (43-128 char base64url verifier per RFC 7636; SHA-256 challenge). Same shape as Microsoft's PKCE generation.
   - `buildAuthUrl({state, scopes, pkce})` builds `https://airtable.com/oauth2/v1/authorize?client_id=...&redirect_uri=...&response_type=code&scope=<space-joined>&state=...&code_challenge=...&code_challenge_method=S256`. Scope param IS sent (unlike Notion).
   - `handleCallback(code, state, pkce)` POSTs `https://airtable.com/oauth2/v1/token` with HTTP Basic auth header (`Basic base64(client_id:client_secret)`) and `application/x-www-form-urlencoded` body containing `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`. Response: `{ access_token, refresh_token, token_type: "Bearer", expires_in, scope, refresh_expires_in? }`. V2 calls `/v0/meta/whoami` with the new access token to resolve `providerAccountId`. Returns `{ tokens: { accessTokenEncrypted, refreshTokenEncrypted, accessTokenExpiresAt: now + expires_in, scopes: scope.split(" ") }, account: { providerAccountId: whoamiResponse.id, displayName: whoamiResponse.email ?? whoamiResponse.id, metadata: { userId: whoamiResponse.id, email: whoamiResponse.email ?? null, scopesGranted: whoamiResponse.scopes ?? [] } } }`.
   - `refreshToken(refreshToken)` POSTs the same `/oauth2/v1/token` endpoint with HTTP Basic auth + form body containing `grant_type=refresh_token`, `refresh_token`, `redirect_uri` (sent per V1's `sendRedirectUriWithRefresh: true`). **Returns the new refresh_token** alongside the new access_token — V2's dispatcher writes both via `updateTokens`. Throws if the response is missing `access_token` or `refresh_token` (rotation invariant).
   - `revoke(token)` is a stub deferred to disconnect-UX slice (matches every V2 provider).

2. **Manifest** declares:
   - `refreshable: true`
   - `accountIdField: "userId"`
   - `tokenScope: "user"`
   - `oauthFlows: ["v2"]`
   - `scopes.required: ["data.records:read", "data.records:write", "schema.bases:read", "webhook:manage"]`
   - `apiVersion: "v0"`
   - `healthCheckIntervalMs: 12 * 60 * 60 * 1000` (12h)

3. **Health check** hits `GET /v0/meta/whoami`. 200 → healthy; 401 → action_required after refresh attempt fails (60-day idle → reconnect).

4. **Refresh-token rotation** is the load-bearing test. V2's `dispatcher.refresh` flow already calls `updateTokens(provider, accountId, newTokens)` which UPDATES `refresh_token_encrypted`. Airtable validates this end-to-end — the e2e walkthrough exercises a refresh and asserts the new refresh token is persisted and the old one rejected.

---

## Webhook trigger model — programmatic + cursor-fetch + 7-day renewal

V2's first webhook-with-cursor-payload-fetch trigger. Different from every existing V2 trigger.

1. **Activate** (`triggers/recordChanged/activate.ts`):
   - Reads `config.baseId` (required), `config.tableIdOrName` (optional — when omitted, watch all tables in the base).
   - Wraps in `refreshAndRetry`. Calls `webhooksCreate({ baseId, notificationUrl: V2's webhook URL with `?workflowId=X&nodeId=Y` query, recordChangeScope: tableIdOrName? })` from `_shared/airtable/api/webhooks.ts`.
   - Returns config patch: `{ type: "subscription-watch", webhookEnabled: true, baseId, tableIdOrName, webhookId, macSecretBase64, lastCursor: 0, expiresAt }`. The `subscriptionRegistry` recognizes `type: "subscription-watch"` and applies the renewal hook.
2. **Deactivate** (`triggers/recordChanged/deactivate.ts`):
   - Wraps in `refreshAndRetry`. Calls `webhooksDelete({ baseId, webhookId })`. Swallows 404 (already deleted server-side) and 403 (permissions revoked).
3. **Renew** (`triggers/recordChanged/renew.ts`):
   - Registered via `subscriptionRegistry`. **6-day renewal threshold** (close to V1's 5-day-equivalent ≤2-day buffer; runs hourly). POSTs `/v0/bases/{baseId}/webhooks/{webhookId}/refresh`. Updates `expiresAt` in `trigger_resources.config`.
4. **Webhook receive** (`app/api/webhooks/airtable/route.ts`):
   - POST handler. Reads raw body (signature verification needs raw bytes).
   - Looks up the trigger row by `webhookId` (from notification body's `webhook.id`).
   - Verifies `X-Airtable-Content-MAC: hmac-sha256=<hex>` against the stored `macSecretBase64`. Mismatch → log + skip (mirrors V2's V1-V2-V3 pattern: never throw on mismatch to avoid probing exposure).
   - Calls `pull(trigger, occurredAt)` from `triggers/recordChanged/pull.ts`.
5. **Pull** (`triggers/recordChanged/pull.ts`):
   - Wraps `webhooksListPayloads({ baseId, webhookId, cursor: lastCursor + 1 })` in `refreshAndRetry`.
   - For each payload in the response: walks `createdRecordsById` / `changedRecordsById` / `destroyedRecordIds` (snake_case fallback for legacy responses). Calls `normalize(record, eventType, ctx)` per record per event type.
   - **Persists the new `cursor` in `trigger_resources.config.lastCursor` BEFORE returning** (so a downstream dispatch failure doesn't replay).
6. **Normalize** (`triggers/recordChanged/normalize.ts`):
   - Builds canonical `TriggerEvent` shape.
   - `eventType: "created" | "updated" | "deleted" | "unknown"` (from which payload bucket the record came from).
   - `eventId: ${webhookId}:${tableId|"all"}:${recordId}:${eventType}:${transactionNumber}` (per Q15).
   - `payload`: typed record fields (parsed via `_shared/airtable/fields.ts` if a schema is available; raw otherwise).
7. **Dispatch** runs through V2's `services/triggers/dispatch.ts` — DB-backed `webhook_event_dedup` blocks duplicates. Same shape as Slice 7 / 8 / 9.

---

## V1 patterns to skip

- **Deprecated `lib/integrations/airtable/webhooks.ts` dual system** (705 LOC, marked deprecated 2025-10-03). V2 ships only the `AirtableTriggerLifecycle`-equivalent path.
- **In-memory `processedRecords` Map + `pendingRecords` delayed-execution timers** in V1's receive route (lines 16-26 + processPendingRecords). V2 uses DB-backed `webhook_event_dedup` exclusively. The V1 60s in-memory dedup is a workaround for the lack of DB dedup — not portable to V2's serverless model anyway.
- **Per-provider cron route** (`/api/webhooks/refresh-airtable`). V2 uses `subscriptionRegistry` + `runRenewals`.
- **V1 `airtableRateLimiter.ts`** — always-1-second-prepend + custom 429 backoff. V2 lets Airtable rate-limit naturally; if 429 becomes a real concern, add focused retry inside `_request.ts` later.
- **V1 attachment heuristic** (`createRecord.ts:669-672` — "if field name contains 'photo' it's an attachment"). Heuristic-based field detection is rejected per V2 conventions; V2's typed-input shape forces the workflow author to declare the type explicitly.
- **V1 Supabase attachment coupling** (`supabaseAttachment.ts` 133 LOC). Attachments deferred entirely.
- **V1 `keywordSearch` / `dateFilter` / `customDateRange` convenience builders** in `listRecords.ts:23-30, 80-130`. V2 forward-passes `filterByFormula` verbatim — same wire-format, no V2 builder.
- **V1's two-trigger-types-per-event** (V1 has `airtable_trigger_record_created` + `_record_updated` + `_record_deleted` separately). V2 collapses to one consolidated `record_changed` per Q3.
- **V1's payload snake_case ↔ camelCase reconciliation** (`route.ts:76-172`). V2 trusts current Airtable's camelCase responses; legacy fallback only added if unit tests show otherwise.

## V1 rot to fix during port

- **DB-backed dedup, not in-memory.** V1's `processedRecords` Map is a workaround for missing DB dedup. V2's `webhook_event_dedup` table is canonical.
- **Single source of truth for trigger state — `trigger_resources` only.** V1 has BOTH `airtable_webhooks` and `trigger_resources`. V2 ships only `trigger_resources`.
- **PKCE flow.** V1 doesn't implement PKCE for Airtable (none of V1's per-provider configs in `oauthConfig.ts` indicate PKCE — V1 may rely on the user's Airtable app being configured in "no PKCE required" mode, or PKCE may have become required after V1's last Airtable touch). V2 implements PKCE per current Airtable docs (mandatory).
- **Refresh-token rotation invariant.** V1's refresh path relies on the generic `tokenRefreshService` which handles rotation. V2's typed `refreshToken()` throws if the response is missing the new refresh_token — surfaces rotation contract violations loudly.
- **Strict Q11 schemas** for every action — no `config: any` handlers.
- **Typed field polymorphism** in `_shared/airtable/fields.ts` instead of inline switches in 924-LOC `createRecord.ts`.
- **One clean receive route** (~120 LOC) instead of V1's 529-LOC mega-route with normalization helpers inline.

---

## Open questions / decisions to flag

1. **Airtable PKCE was likely added after V1's last touch.** V1's `oauthConfig.ts` doesn't mention PKCE; V1 may have been built when PKCE was optional for Airtable. Slice 10 implements PKCE per current docs because it's now mandatory. If the Airtable app registered for V2's e2e was created before PKCE became required, the manifest's `pkceMode: "required"` may need adjustment — the e2e mock will validate that V2 sends PKCE correctly.
2. **The `userId` from `/v0/meta/whoami` is stable across re-auth?** Per current Airtable docs, the `id` is "A user ID" returned consistently. Treating it as the immutable provider account id matches the V2 contract for `accountIdField`.
3. **Cursor reset behavior.** Airtable doesn't document cursor reset; if a webhook is deleted and recreated with the same notification URL, the new webhook starts at cursor 1. V2's `lastCursor` resets to 0 on activate (which means "fetch from the start"). Confirming this is the intent — it doesn't risk re-firing past events because a fresh webhook has no past payloads.
4. **`tableIdOrName` accepts both?** V1 uses table name. Current Airtable docs accept both. V2 forward-passes whatever the user supplied. Workflows using table names break if the table is renamed; using the table id is more durable. The schema documents this — workflow authors with stable schemas can use names; workflows that survive renames should use ids.
5. **Health check on rotated refresh token.** If V2's health check refreshes successfully, the new tokens get persisted. If the user's session is offline > 60 days, the refresh fails — V2 surfaces `IntegrationActionRequiredError(reason: "refresh_failed")`. Confirming this matches the user-facing reconnect prompt from existing V2 health UI.

---

## Revised commit shape

| Commit | Title | Scope |
|---|---|---|
| **1** | `docs: slice 10 airtable plan` | This file. |
| **2** | `feat(airtable): manifest + OAuth + dispatcher registration` | `integrations/airtable/{manifest,oauth}.ts`, `services/oauth/dispatcher.ts` register, `_shared/airtable/api/_base.ts` (NotionApiBase-equivalent). Manifest capabilities: `oauth: true`, others `false`. Tests: manifest validation, OAuth wire-format (PKCE + Basic auth + form body), refresh-token rotation invariant (refreshToken throws when response missing new refresh_token). |
| **3** | `feat(airtable): 8 actions + field polymorphism + Airtable API wrappers` | `integrations/airtable/api/{records,bases,tables}.ts` HTTP wrappers (auth-aware, refreshAndRetry-friendly), `_shared/airtable/fields.ts` (typed in/out for 14 supported types + UnsupportedFieldTypeError), 8 typed action handlers + Q11 schemas, registry updates. Manifest flips `actions: true`. |
| **4** | `feat(airtable): record_changed webhook trigger + cursor payload fetch + renewal` | `_shared/airtable/api/webhooks.ts` (create / delete / refresh / listPayloads), `_shared/airtable/webhooks/signature.ts` (HMAC verify), `integrations/airtable/triggers/recordChanged/{activate,deactivate,renew,normalize,pull,index}.ts`, `app/api/webhooks/airtable/route.ts` (signature verify, lookup, pull, dispatch). Subscription via `subscriptionRegistry` with 6-day renewal threshold. Manifest flips `webhookTrigger: true`. |
| **5** | `test(e2e): add Airtable walkthrough with mocked Airtable boundary` | New `tests/e2e/helpers/mockAirtableServer.ts` (port 9880) — OAuth (authorize 302, token exchange with PKCE + Basic auth + form body, refresh with rotated tokens), `/v0/meta/whoami`, records CRUD, webhooks create/delete/refresh, payload listing with cursor advancement. New `tests/e2e/slice-10-airtable-walkthrough.spec.ts` exercising: PKCE state consume, refresh-token rotation, webhook activate → ping → cursor fetch → workflow run → succeeded, dedup probe, spoofed-signature rejection. |

**Total estimated output:** ~1,000 LOC OAuth + helpers + ~800 LOC actions + wrappers + ~900 LOC trigger + receive + ~700 LOC e2e ≈ **~3,400 LOC** + **~180 new unit tests** + **1 e2e**. Slightly larger than Slice 9 because of the new trigger + cursor primitive.

---

## Validation gates

After each meaningful commit:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For Commit 5 (e2e), run all sequential provider walkthroughs + Airtable twice for stability:

```bash
npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts
npx playwright test tests/e2e/slice-2f-gmail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-4b-google-drive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts
npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts
npx playwright test tests/e2e/slice-7-outlook-calendar-walkthrough.spec.ts
npx playwright test tests/e2e/slice-8-onedrive-walkthrough.spec.ts
npx playwright test tests/e2e/slice-9-notion-walkthrough.spec.ts
npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts
npx playwright test tests/e2e/slice-10-airtable-walkthrough.spec.ts
```

---

## Constraints

- No push.
- No PR.
- No DB migration (stop and report if one becomes necessary).
- No attachment support (deferred from Batch 1 entirely).
- No batch CRUD (`create_multiple_records`, `update_multiple_records`).
- No `duplicate_record` / `move_record`.
- No V1 rate limiter port.
- No Supabase attachment coupling.
- No support for the 17 deferred field types — fail loud with `UnsupportedFieldTypeError`.
- No separate created / updated / deleted triggers — one consolidated `record_changed` with eventType discriminator.
