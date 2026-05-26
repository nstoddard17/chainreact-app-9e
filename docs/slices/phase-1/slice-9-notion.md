# Slice 9 — **Notion** provider port

**Branch:** `slice-9-notion` (off `slice-8-onedrive` @ `e5ff80b38`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Notion from V1 as the **first non-Google / non-Microsoft OAuth provider** in V2. Ships the OAuth dispatcher entry, a typed action surface (7 actions covering pages / databases / blocks / search), and a typed property polymorphism layer covering the 9 most common Notion property types.

**Webhook trigger is intentionally deferred.** Notion does not expose a programmatic webhook subscription API — webhooks must be configured manually through the user's Notion integration UI. See §"Critical constraint: webhooks are manual-only" below for the audit finding and the recommendation that landed Slice 9 as **actions-only Batch 1**, with a separate slice scoped to manual-webhook UX if/when product confirms the demand.

---

## Why Notion next

1. **First non-Google / non-Microsoft OAuth provider in V2.** Every existing V2 OAuth provider belongs to either Google (Gmail, Calendar, Drive, Sheets) or Microsoft (Outlook Mail, Outlook Calendar, OneDrive). Slack uses non-refreshing tokens but on a different shape entirely. Notion is the first provider that exercises V2's `services/oauth/dispatcher.ts` + `services/oauth/refreshAndRetry.ts` against a third API family — proves the abstractions generalize beyond the two big OAuth families V2 grew up around.
2. **Validates V2's `RefreshNotSupportedError` path on a real provider.** Notion access tokens are long-lived and Notion does not issue refresh tokens (V1's `oauthConfig.ts:457` — `refreshTokenExpirationSupported: false`). V2's `services/oauth/refreshAndRetry.ts` already has the contract for this — on 401 from a non-refreshable provider it throws `IntegrationActionRequiredError` (reason `"refresh_not_supported"`), surfacing reconnect. Slice 9 is the first OAuth (non-API-key) provider to exercise it end-to-end.
3. **High product value.** Notion is universally used for documentation / wikis / task management / CRM / databases. Even an actions-only Batch 1 unlocks "create a Notion page from this trigger" and "look up a row in this Notion database" — the two most common Notion automation patterns.
4. **Forces typed property polymorphism.** Notion's property system is the most-polymorphic in the candidate set. Building `_shared/notion/properties.ts` here establishes the pattern Airtable's field handling will follow. V1 has the polymorphism but as a 76-line `switch` inside `lib/workflows/actions/notion/handlers.ts:43-119` — a port-time cleanup target.
5. **Unlocks the next 3 candidates.** Once Notion's OAuth-only-no-refresh + REST-actions pattern is in V2's pattern library, Airtable / HubSpot / Dropbox become near-mechanical ports.

---

## Critical constraint: webhooks are manual-only

**Both V1's October 2025 audit (`learning/docs/notion-webhook-manual-setup.md`) and a fresh check of `developers.notion.com/reference/webhooks` (this commit) confirm: Notion does not expose `POST /v1/webhooks` or any other programmatic subscription endpoint.** Webhooks must be created through the user's Notion integration settings UI at `notion.so/my-integrations → [integration] → Webhooks → + Create a subscription`. The verification handshake is also manual: Notion sends a `verification_token` to the configured webhook URL, the user copies it from the receiving system's UI, and pastes it back into Notion's UI.

Per the Slice 9 brief — *"If Notion webhooks cannot be created programmatically: stop and report before designing activation. Do not invent a fake activation lifecycle."* — Slice 9 ships **actions-only**. Two paths exist for webhook support if/when product confirms demand:

- **Slice 9b — Manual-webhook UX** — V2 provides a setup page that displays the webhook URL + event types the user should subscribe to in Notion, captures the `verification_token` returned by Notion's first POST to V2's webhook receive endpoint, surfaces it to the user for paste-back, then validates inbound webhook signatures using that token as the HMAC secret. The "trigger" exists at the dispatcher level but its lifecycle is fundamentally driven by the user's actions in Notion's UI, not by V2 API calls.
- **Polling fallback** — Notion's `/v1/search` and `/v1/databases/{id}/query` endpoints return `last_edited_time` per page, which a `pollingTrigger` could cursor against. V1 has no polling implementation for Notion. Both webhook-manual and polling have product-UX implications worth discussing before either lands.

**Slice 9 does not pre-judge between Slice 9b options.** It ships actions cleanly so the OAuth + action / property pattern is in V2 today; webhook decisions can be made independently against actual product demand.

---

## Confirmed scope decisions

1. **New provider id — `notion`.** Single Notion integration per user. Notion's own auth model is workspace-scoped: each authorize call grants access to exactly one workspace, returned in the token response as `workspace_id` + `workspace_name`. V2 maps a Notion workspace to one integration row using the bot user's id as `provider_account_id` (Notion's `/v1/users/me` endpoint, which returns the bot user representing the integration in the workspace).
2. **Seven actions — `create_page`, `update_page`, `query_database`, `create_database_entry`, `append_block_children`, `get_page`, `search`.** Slice 9 collapses V1's 30-action surface (`lib/workflows/actions/notion/handlers.ts`, 3,041 LOC) to the 7 core actions that cover the dominant workflow patterns. Per-action V1 audit + classification in §"V1 audit" below.
3. **Property polymorphism — 9 supported types.** `title`, `rich_text`, `number`, `select`, `checkbox`, `date`, `url`, `email`, `phone_number`. Defer: `relation`, `people`, `files`, `rollup`, `formula`, `multi_select`, `status`. The deferred set either requires multi-step uuid resolution (`relation`, `people`), is mostly read-only at the API (`rollup`, `formula`, `files`), or has a separate user-decision shape that's worth designing carefully (`multi_select`, `status` — both look simple but interact with the database's option set, which we'd need to fetch + cache to validate). Defers explicitly flagged in `_shared/notion/properties.ts` so unknown types throw a clear `UNSUPPORTED_PROPERTY_TYPE` error, not a silent miscoercion.
4. **OAuth model — long-lived token, no refresh.** Notion's OAuth grants a long-lived `access_token` per workspace; no refresh token is issued. Manifest declares `refreshable: false`. The `refreshToken()` method on Notion's `ProviderOAuth` throws `RefreshNotSupportedError` (V2's contract for non-refreshable providers — already exercised by Slack). On 401 from any Notion API call wrapped in `refreshAndRetry`, the user is surfaced an `action_required` health signal directing them to reconnect. No surprises.
5. **OAuth endpoint — `https://api.notion.com/v1/oauth/{authorize,token}`.** Token exchange uses HTTP Basic auth (V1: `authMethod: "basic"`). No PKCE — Notion does not require/support PKCE on this flow. The redirect URI lives at V2's standard `/api/integrations/oauth/notion/callback`.
6. **Notion API version — `2022-06-28`.** V1 uses two API versions in parallel (`2022-06-28` for OAuth + most actions, `2025-09-03` for the trigger lifecycle's data-source detection). Slice 9 uses `2022-06-28` exclusively in Batch 1 because it covers all 7 in-scope actions cleanly and avoids the multi-source database complexity (`2025-09-03` introduced `data_source_id` as a distinct concept from `database_id` — relevant for triggers, but the 7 in-scope actions all work on the older shape). Migration to `2025-09-03` is a follow-up if/when the trigger slice lands.
7. **`accountIdField` — `bot_id`.** Resolved via `GET /v1/users/me` which returns the bot user representing the integration in the workspace. The bot id is stable per (integration, workspace) and uniquely identifies which workspace the access token belongs to. Bot user metadata also includes the workspace name + owner email for display.
8. **`tokenScope` — `user`.** One Notion integration per (user, bot_id). If a user reauthorizes against a different workspace, V2 stores a sibling integration row.
9. **Health check interval — 12h.** Matches V2's "other providers" tier (Google/Microsoft are 6h, Slack/Discord/GitHub/Notion fit the longer interval per CLAUDE.md). Notion's API rate limits are gentle (~3 req/s average) — no need to pound `/v1/users/me` every 6h.
10. **Q11 — explicit fields with no hidden defaults:**
    - `create_page` requires explicit `parent` (a discriminated union: `{ databaseId }` or `{ pageId }`) and explicit `properties` (object keyed by property name; values typed via `_shared/notion/properties.ts`). No silent fallback that interprets a missing `parent` as "use the integration's home workspace."
    - `update_page` requires explicit `pageId` and `properties`. Optional `archived` boolean (defaults `false` only when explicitly passed; otherwise the field is omitted from the PATCH body — Q11 means the action does NOT make assertions about properties the user didn't set).
    - `query_database` requires explicit `databaseId`. Optional `filter`, `sorts`, `pageSize` (default 100, capped at 100 — Notion's hard ceiling), `startCursor`. Filter is forward-passed verbatim to Notion's API (no client-side translation in Batch 1; advanced query builder is V1 chrome we're skipping).
    - `create_database_entry` is `create_page` with `parent: { databaseId }` semantics — but a separate handler with its own schema so the database-only path is type-clean and the property-validation surface is narrower (no page-parent fields). Explicit `databaseId` + `properties`. Subsumes V1's separate `notion_action_create_database_entry`.
    - `append_block_children` requires explicit `blockId` (parent block / page id) and explicit `children` (array of typed block specs). Block types covered in Batch 1: `paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `quote`, `divider`. Defer: `code`, `image`, `embed`, `callout`, `toggle`, `column_list`, `table`, `child_database`, `child_page`, `synced_block`.
    - `get_page` requires explicit `pageId`. Returns the full page object plus its top-level properties resolved via `_shared/notion/properties.ts`. Does NOT recursively walk children blocks — V1's `notionGetPageWithChildren` is a separate (deferred) action.
    - `search` requires explicit `query` (can be empty string for "all accessible objects"). Optional `filter` (object discriminant: `value: "page" | "database"`), `pageSize` (default 100, capped 100), `startCursor`. Returns paginated results.
11. **Dedup key shape — N/A in Batch 1.** No webhook trigger ships in Slice 9. When the trigger slice lands, the proposed key is `${botId}:${eventType}:${entityId}:${eventTimestamp}` (the `eventTimestamp` discriminator handles successive edits to the same page; pattern mirrors Slice 8 OneDrive's `${subscriptionId}:${itemId}:${lastModifiedDateTime}`).
12. **No new DB migration.** All state fits existing `integrations` (`metadata` JSONB carries `workspace_id`, `workspace_name`, `bot_id`, `owner` — same shape as V1's `workspaces[workspaceId].metadata`). **STOP-AND-REPORT** if a new table is needed.

---

## Six confirmation answers

| Question | Answer | Citation |
|---|---|---|
| **1. Notion OAuth refresh tokens?** | **No.** Long-lived access tokens, no refresh-token issuance. V2 manifest declares `refreshable: false`; provider's `refreshToken()` throws `RefreshNotSupportedError`. On 401, V2 surfaces `action_required` health signal. | V1: `lib/integrations/oauthConfig.ts:457` (`refreshTokenExpirationSupported: false`). Notion docs: token-issuance response schema includes `access_token` + `workspace_id` + `bot_id`, no `refresh_token`. |
| **2. Notion webhooks created programmatically?** | **No. Manual-only.** No `POST /v1/webhooks` API endpoint exists. Webhooks must be created in the Notion integration UI; the user must paste a verification token between the receiving system and Notion's UI. | V1: `learning/docs/notion-webhook-manual-setup.md` "Key Discovery" (2025-10-17). V1: `learning/docs/notion-integration-gap-analysis.md:8-26` "CRITICAL CONSTRAINT" (2025-11-29). Confirmed: `developers.notion.com/reference/webhooks` (this commit) — no programmatic create / delete / list endpoint mentioned, only manual UI. |
| **3. Subscription scope?** | **Integration-level.** A single subscription is created against the integration (not per-page or per-database), and the user picks event types + an optional filter (data_source_id in `2025-09-03`, database_id in older versions). One integration's webhook receives all matching events from all workspaces it's installed in. | V1: `learning/docs/notion-webhook-manual-setup.md:115-145` (subscription record shape). |
| **4. Verification format?** | **Two phases.** Phase 1 (manual): Notion POSTs to the configured webhook URL with `{ verification_token: "..." }` — receiving system surfaces this token to the user, who pastes it back into Notion's UI. Phase 2 (live): Notion sends events with `X-Notion-Signature: sha256=<hex>` over the raw body, HMAC-SHA256 keyed with the verification_token. | Notion docs (this commit): `X-Notion-Signature` header, format `sha256=<hex>`, "HMAC-SHA256 hash of the request body, signed with your verification_token". V1 webhook route at `app/api/webhooks/notion/route.ts:194-258` shows the (legacy) `{type:"url_verification", token, challenge}` shape — likely still accepted but the current Notion docs describe the simpler `{verification_token}` shape. V2 handler should accept both for compatibility. |
| **5. Signature scheme?** | **HMAC-SHA256 over raw body, hex-encoded, prefixed `sha256=`. Key = the per-subscription `verification_token` Notion generated.** | Notion docs (this commit). V1: `app/api/webhooks/notion/route.ts:69-78` confirms: `crypto.createHmac('sha256', verificationToken).update(body).digest('hex')` + `crypto.timingSafeEqual` for safe compare. |
| **6. V1 webhook route current or stale?** | **Current as of November 2025**, but built around V1's specific lifecycle assumptions. V1's route at `app/api/webhooks/notion/route.ts` reads `workflowId` + `nodeId` from the inbound URL's query string (the user is responsible for setting this up in Notion's UI as part of the manual setup) and joins back to `trigger_resources` to resolve the verification token. Functional but depends on the user pasting the right URL. **Slice 9 does NOT port this route — webhook trigger is deferred.** When the trigger slice lands, V2 should keep the query-string routing (it's the only way Notion can deliver to a per-workflow URL). |

---

## V1 audit + port classification

V1 paths inspected (`chainreact-app-9e`):

| V1 path | What's there | Slice 9 classification |
|---|---|---|
| `lib/integrations/oauthConfig.ts:449-461` | OAuth config: basic-auth token exchange, no refresh, redirect at `/api/integrations/notion/callback` | **Reference for OAuth wire-format.** V2 implements this in a typed `integrations/notion/oauth.ts` against V2's `ProviderOAuth` contract; redirect path moves to V2's standard `/api/integrations/oauth/notion/callback`. |
| `lib/workflows/actions/notion/handlers.ts` (3,041 LOC) | **Kitchen-sink dispatcher.** 30 exported action functions in one file. Per-property `formatNotionPropertyValue` switch at lines 43-119 covers 13 property types inline. Per-property `buildFilterForProperty` switch at 121-169. Each action is 50-300 LOC with manual `getDecryptedAccessToken` + raw `fetch` + try/catch + Q4/Q8d boilerplate inline. | **Rewrite per V2 boundary.** V2 ships 7 typed `ActionHandler` modules under `integrations/notion/actions/`, each with its own `*.schema.ts`. Property polymorphism extracted to `_shared/notion/properties.ts` (covering the 9 in-scope types only — unsupported types throw `UNSUPPORTED_PROPERTY_TYPE`). Q4 idempotency + Q8d test-mode interception are handled by V2's engine layer (V2's pattern), not duplicated per-handler — Slice 9 actions are clean. |
| `lib/workflows/actions/notion/managePage.ts` (613 LOC) | Page-management dispatch (create / update / archive / restore / find-or-create) | **Skip as-is.** V2's `create_page` + `update_page` cover the core patterns; archive/restore/find-or-create are V1 chrome we defer. |
| `lib/workflows/actions/notion/manageDatabase.ts` (532 LOC) | Database management (create / query / update / archive item / restore item / find-or-create item) | **Reference for `query_database` + `create_database_entry`.** V2 ports the query + create paths only. |
| `lib/workflows/actions/notion/manageBlocks.ts` (130 LOC) | Block dispatch (add / get / get-children / get-page-with-children) | **Reference for `append_block_children`.** V2's `append_block_children` covers the core add-children path; `get` / `get_children` / recursive walk deferred. |
| `lib/workflows/actions/notion/databasePropertyTypes.ts` (416 LOC) | Per-property metadata: type → option-set shape, format hints, validation rules | **Skip in Batch 1.** Useful for a future "validate property values against the live database schema" feature. Not needed for the 7 in-scope actions which trust the user's `properties` object. |
| `lib/workflows/actions/notion/dataSourceCache.ts` (~65 LOC) | In-memory cache of database / data source structures | **Skip.** V2 doesn't need this — actions trust the resolved config and don't make pre-flight schema queries. |
| `lib/workflows/actions/notion/advancedQuery.ts` | JSON-filter query builder | **Skip.** Slice 9 forward-passes the user's `filter` verbatim to Notion's API — same final wire-format, no V2 builder. |
| `lib/workflows/actions/notion/manageComments.ts` (lines in handlers.ts) | Comment create / list | **Skip.** Comments are a separate user-decision; defer. |
| `lib/workflows/actions/notion/manageUsers.ts` (lines in handlers.ts) | User list / retrieve | **Skip.** Used only by the `people` property handler which we're deferring. |
| `lib/workflows/actions/notion/updateDatabaseSchema.ts` (lines in handlers.ts) | Add / remove / update database properties | **Skip.** Schema-mutation is rare in workflows; defer. |
| `lib/workflows/nodes/providers/notion/{index,page-actions,database-actions,block-actions,user-actions,comment-actions,unified-actions,comprehensive-actions}.ts` | Node manifest (action types, field definitions, input schemas) | **Reference for action input shapes.** V2 owns its own typed schemas; this is a reference for action / field naming conventions. |
| `lib/triggers/providers/NotionTriggerLifecycle.ts` (~250 LOC) | Trigger activation: stores config in `trigger_resources` with `status: 'active'`, builds the per-workflow webhook URL, fetches data_source_id from database via `2025-09-03` API, logs setup instructions for the user | **Skip Slice 9.** Webhook trigger is deferred per §"Critical constraint." When Slice 9b lands, V2 should follow this lifecycle's intent (store webhook URL + event types in `trigger_resources.config`, surface setup instructions to user) but rebuild against V2's `activationRegistry` + a new "manual-config-required" status pattern V2 doesn't have today. |
| `app/api/webhooks/notion/route.ts` (~426 LOC) | Webhook receive: parses `url_verification` requests, stores verification token in `trigger_resources.metadata.verificationToken`, validates `X-Notion-Signature` HMAC, dispatches to `processNotionEvent` | **Skip Slice 9.** When trigger lands, V2 ports this with cleanup: drop the `colors`/`logSection` verbose logging, route to V2's `webhook_event_dedup`, use `core/triggers/errors.ts` `InvalidSignatureError`. |
| `lib/webhooks/processor.ts:230-275` (Notion event mapping) | Maps Notion's webhook event types (`page.created`, `data_source.row_updated`, etc.) to V1 trigger types | **Skip Slice 9.** Reference for the trigger-type → webhook-event mapping when the trigger slice lands. |
| `learning/docs/notion-webhook-manual-setup.md` | Manual-setup guide + verification flow + setup instructions | **Reference.** Authoritative source for the manual-setup constraint. |
| `learning/docs/notion-api-2025-09-03-migration.md` | Multi-source database migration notes | **Skip Slice 9.** Slice 9 uses `2022-06-28`. Migration is relevant only when triggers land. |

---

## In-scope action list (final)

1. **`create_page`** — `{ parent: { databaseId } | { pageId }, title?, properties?, children?, icon?, cover? }` → POST `/v1/pages`. Returns `{ id, url, properties, createdTime, lastEditedTime }`. The discriminated `parent` union enforces Q11: workflows MUST explicitly choose database-parent vs page-parent (V1 silently dispatched on `parentType` string).
2. **`update_page`** — `{ pageId, properties?, archived?, icon?, cover? }` → PATCH `/v1/pages/{pageId}`. Returns the updated page. Optional fields are omitted from the body when undefined (Q11 — no implicit clears).
3. **`query_database`** — `{ databaseId, filter?, sorts?, pageSize?, startCursor? }` → POST `/v1/databases/{databaseId}/query`. Returns `{ results, hasMore, nextCursor }`. Filter / sorts forward-passed verbatim to Notion.
4. **`create_database_entry`** — `{ databaseId, properties, children?, icon?, cover? }` → POST `/v1/pages` with `parent: { database_id }`. Returns the new page. Effectively `create_page` with the database-parent constraint baked in — but a separate handler keeps the schema narrow (no page-parent fields) and matches V1's separate node type.
5. **`append_block_children`** — `{ blockId, children }` → PATCH `/v1/blocks/{blockId}/children`. `children` is an array of typed block specs (`paragraph`, headings, list items, `to_do`, `quote`, `divider`). Returns `{ results }`.
6. **`get_page`** — `{ pageId }` → GET `/v1/pages/{pageId}`. Returns full page object plus resolved-property values for the 9 in-scope property types.
7. **`search`** — `{ query, filter?, pageSize?, startCursor? }` → POST `/v1/search`. Returns paginated `{ results, hasMore, nextCursor }`.

All actions wrap their principal API call in `refreshAndRetry`. Because Notion has no refresh, the wrapper's 401 handling falls into the `RefreshNotSupportedError` → `IntegrationActionRequiredError` path, surfacing `action_required` to the user. This is Slice 9's load-bearing OAuth-pattern test.

---

## Property polymorphism strategy — `_shared/notion/properties.ts`

A single typed module covers the 9 in-scope property types in two directions:

**Outbound — `formatPropertyValue(propertyType, value): NotionPropertyValue`**
Used by `create_page` / `update_page` / `create_database_entry` to coerce the user's typed value into Notion's wire-format object.

| Property type | Input value | Wire-format |
|---|---|---|
| `title` | `string` | `{ title: [{ type: "text", text: { content: string } }] }` |
| `rich_text` | `string` | `{ rich_text: [{ type: "text", text: { content: string } }] }` |
| `number` | `number \| null` | `{ number: number \| null }` |
| `select` | `string \| null` | `{ select: { name: string } \| null }` |
| `checkbox` | `boolean` | `{ checkbox: boolean }` |
| `date` | `string \| { start: string, end?: string }` | `{ date: { start: string, end?: string } \| null }` |
| `url` | `string \| null` | `{ url: string \| null }` |
| `email` | `string \| null` | `{ email: string \| null }` |
| `phone_number` | `string \| null` | `{ phone_number: string \| null }` |

**Inbound — `parsePropertyValue(notionProperty): TypedValue`**
Used by `get_page` / `query_database` / `create_database_entry` (for the response page) to extract typed values from Notion's response shape.

**Unsupported types throw `UNSUPPORTED_PROPERTY_TYPE`** (a typed error) immediately at the outbound boundary, with the property type + the supported set in the message. Workflows using deferred types (`relation`, `people`, `files`, `rollup`, `formula`, `multi_select`, `status`) fail loud at design time, not silently at runtime. Slice 9b can extend the supported set without breaking the handler contract.

V1's handlers.ts:43-119 implementation is the reference; V2 ports the wire-shape mappings verbatim and adds typed input/output, the unsupported-type guard, and unit tests per type.

---

## OAuth model — long-lived token, no refresh

Notion is V2's first non-API-key OAuth provider that does not issue refresh tokens. The implementation:

1. **`integrations/notion/oauth.ts`** implements `ProviderOAuth`:
   - `generatePkce()` returns `null` (Notion does not use PKCE).
   - `buildAuthUrl({state, scopes, pkce})` builds `https://api.notion.com/v1/oauth/authorize?owner=user&client_id=...&redirect_uri=...&state=...&response_type=code`. No `scope` param (Notion's authorize URL doesn't take one — capabilities are configured in the integration settings).
   - `handleCallback(code, state, pkce)` POSTs `https://api.notion.com/v1/oauth/token` with `grant_type=authorization_code`, `code`, `redirect_uri`. HTTP Basic auth header carries `${client_id}:${client_secret}`. Response: `{ access_token, token_type: "bearer", workspace_id, workspace_name, workspace_icon, bot_id, owner }`. V2 calls `/v1/users/me` with the new access token to confirm the bot user record (defensive — also gives us `bot.workspace_name` even if Notion's response omits it). Returns `{ tokens: { accessTokenEncrypted, refreshTokenEncrypted: null, accessTokenExpiresAt: null, scopes: [] }, account: { providerAccountId: bot_id, displayName: workspace_name, metadata: { workspace_id, workspace_name, bot_id, owner } } }`.
   - `refreshToken(refreshToken)` throws `RefreshNotSupportedError` immediately. V2's dispatcher catches this and surfaces the `action_required` user signal.
   - `revoke(token)` is a stub deferred to the disconnect-UX slice (matches every other V2 provider).

2. **Manifest** declares:
   - `refreshable: false`
   - `accountIdField: "bot_id"`
   - `tokenScope: "user"`
   - `scopes.required: []` (Notion has no per-action scopes; capabilities are integration-level)
   - `apiVersion: "v1"`
   - `healthCheckIntervalMs: 12 * 60 * 60 * 1000` (12h)

3. **Health check** hits `GET /v1/users/me` with the access token. 200 → healthy; 401 → action_required (token revoked from Notion side or workspace deleted). Cron tick resilience matches Slack's pattern.

4. **`refreshAndRetry` integration** — every action handler wraps its principal call in `refreshAndRetry`. On 401, V2's dispatcher tries to refresh, the Notion provider throws `RefreshNotSupportedError`, the wrapper converts to `IntegrationActionRequiredError(reason: "refresh_not_supported")`, the engine surfaces a clean error classification. No retry attempt; user must reconnect.

---

## V1 patterns to skip

- **Kitchen-sink `handlers.ts`.** V2 ships one file per action, each ≤ 200 LOC.
- **Inline `getDecryptedAccessToken` per handler.** V2 wraps everything in `refreshAndRetry` which handles token resolution.
- **Per-handler Q4 / Q8d boilerplate.** V2's engine layer owns idempotency + test-mode interception (`services/execution/`).
- **`workspaces[workspaceId]` metadata fan-out.** V1 stores all workspaces a user has connected in `integration.metadata.workspaces` keyed by workspace id, and the user picks one per workflow node config. V2 makes one integration row per (user, bot_id) — workflow nodes inherit the active workspace from the integration, no per-config workspace selector.
- **`databasePropertyTypes.ts` cache + dynamic property introspection.** V2 trusts the user's `properties` object and lets Notion's API reject invalid values. The introspect-and-validate pattern is useful but a separate UX feature, not a handler concern.
- **V1's two-API-version straddling.** Slice 9 uses `2022-06-28` exclusively.
- **The `colors` / `logSection` verbose webhook logging in `app/api/webhooks/notion/route.ts`.** Diagnostic at best; not a V2 pattern.

## V1 rot to fix during port

- **Property polymorphism extracted to `_shared/notion/properties.ts`** — typed input + typed output + explicit unsupported-type errors. V1 has the polymorphism but as inline switch statements duplicated across handlers (`formatNotionPropertyValue` for outbound, `buildFilterForProperty` for filters, `parsePropertyValue` implicit per handler).
- **OAuth callback path standardization** — V2's redirect URI is `/api/integrations/oauth/notion/callback` (matches every other V2 provider), not V1's `/api/integrations/notion/callback`.
- **`accountId` field standardization** — `bot_id` is stable + unique, vs V1's de-facto reliance on `owner.user.id` which can drift if the integration is reinstalled.
- **Action input schemas are typed** — every action ships with a strict `*.schema.ts` (Q11 — no hidden defaults, no implicit type coercion). V1 has untyped `config: any` parameters everywhere.
- **No webhook receive route in Slice 9** — defers the route entirely until product confirms the manual-setup UX is worth building. Avoids leaving a half-functional `/api/webhooks/notion` in V2 that depends on a yet-to-be-designed manual setup flow.

---

## Open questions / decisions to flag

1. **Slice 9b path — manual-webhook UX vs polling fallback vs neither.** Slice 9 ships actions only; webhook trigger is deferred. The user-facing question is whether triggers are worth shipping at all given the manual-setup friction. Polling is an alternative that has a better UX (no manual setup) but consumes more API quota. I have no opinion to argue for here without product input — flagging for a separate discussion.
2. **Search filter shape.** Notion's `/v1/search` accepts a `filter` of `{ property: "object", value: "page" | "database" }`. V2's schema enforces this discriminated shape today; if Notion adds new filter discriminators (they have hinted at sort filters), V2's schema needs to widen. Tracked as a follow-up; not a blocker.
3. **Property unsupported-type error path.** Throwing `UNSUPPORTED_PROPERTY_TYPE` at handler entry is the strict path. An alternative is to log + skip the unsupported property silently (V1 default-falls-through-to-`rich_text`). Strict-throw is the V2 pattern (Q11) — confirming this isn't surprising for users porting from V1 workflows.
4. **`children` (block payload) in `create_page` / `create_database_entry`.** Both actions optionally take a `children` array of typed block specs. The block-spec schema lives in `_shared/notion/blocks.ts` (introduced alongside `append_block_children` in Commit 3). Block types in Batch 1 are the same 9 types `append_block_children` supports. Same defer list applies.

---

## Revised commit shape

| Commit | Title | Scope |
|---|---|---|
| **1** | `docs: slice 9 notion plan` | This file — V1 audit, six confirmation answers, scope decisions, action surface, property strategy, V1 rot to fix, V1 patterns to skip, open questions, revised commit shape. |
| **2** | `feat(notion): manifest + OAuth + dispatcher registration` | `integrations/notion/{manifest,oauth}.ts`, `services/oauth/dispatcher.ts` register, `app/api/integrations/oauth/notion/{connect,callback}` (handled by the dispatcher's standard `[provider]` route — no per-provider route), `_shared/notion/api/_base.ts` (NotionApiBase env override), unit tests. Manifest capabilities: `oauth: true`, `actions: false`, `webhookTrigger: false`, `pollingTrigger: false`. |
| **3** | `feat(notion): 7 actions + property polymorphism + Notion API wrappers` | `integrations/notion/api/{pages,databases,blocks,users,search}.ts` (auth-aware HTTP wrappers, refreshAndRetry-friendly), `_shared/notion/properties.ts` (typed in/out for the 9 supported property types + `UNSUPPORTED_PROPERTY_TYPE`), `_shared/notion/blocks.ts` (typed block specs for the 9 supported block types), `integrations/notion/actions/{create_page,update_page,query_database,create_database_entry,append_block_children,get_page,search}.{ts,schema.ts}`, services/execution/handlers/_registry.ts updates, unit tests per action + property + block. Manifest flips `actions: true`. |
| **4** | ~~`feat(notion): page/database changed trigger + webhook receiver`~~ — **DEFERRED.** Slice 9 ships actions-only per §"Critical constraint." A future Slice 9b ships the manual-webhook UX or polling alternative based on product input. | n/a |
| **5** | `test(e2e): add Notion walkthrough with mocked Notion API boundary` | New `tests/e2e/helpers/mockNotionServer.ts` (port 9879), new `tests/e2e/slice-9-notion-walkthrough.spec.ts`. Mock routes: `/v1/oauth/authorize`, `/v1/oauth/token`, `/v1/users/me`, `/v1/pages` POST, `/v1/pages/{id}` GET / PATCH, `/v1/databases/{id}/query` POST, `/v1/blocks/{id}/children` PATCH, `/v1/search` POST. Walkthrough: sign in → connect Notion → create workflow with manual trigger + a `create_page` action → trigger run via API → assert succeeded run + correct Notion API call. Action-only walkthrough since no webhook trigger ships. |

**Total estimated output:** ~700 LOC actions + ~200 LOC property/block helpers + ~200 LOC OAuth + ~400 LOC e2e helpers + spec ≈ ~1,500 LOC across Commits 2–5.

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

For Commit 5 (e2e), run all sequential provider walkthroughs + Notion twice for stability:

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
npx playwright test tests/e2e/slice-9-notion-walkthrough.spec.ts
```

---

## Constraints

- No push.
- No PR.
- No DB migration (stop and report if one becomes necessary).
- No webhook trigger (deferred — see §"Critical constraint").
- No support for `relation` / `people` / `files` / `rollup` / `formula` / `multi_select` / `status` properties in Batch 1.
- No support for `code` / `image` / `embed` / `callout` / `toggle` / `column_list` / `table` / `child_database` / `child_page` / `synced_block` blocks in Batch 1.
