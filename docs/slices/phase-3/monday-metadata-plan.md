# Monday.com Provider Audit + V2-Native Port Plan — Slice 3.MONDAY-1

**Status:** Audit + planning slice. Doc-only. **No metadata, no resolvers, no runtime changes ship in this commit.**
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Predecessor:** [`./onenote-metadata-plan.md`](./onenote-metadata-plan.md). OneNote closed the most-complex Microsoft provider arc; Monday is the next provider in the missing-providers queue.
**Companion plans:** [`./missing-providers-status.md`](./missing-providers-status.md) (per-provider tracker), [`../phase-1-provider-completion-audit.md`](../phase-1-provider-completion-audit.md) §4.4 (the original Monday deferral rationale).

Every claim below was verified by reading live files. V1 paths cite `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/`. V2 paths cite the current ChainReactV2 working tree.

---

## 1. Headline finding — Monday is GREEN-FIELD in V2 with the cleanest V1 source of any unported provider

A repo-wide scan confirms:

```bash
# V2 — no Monday code anywhere:
$ find integrations -name "*monday*"
(no results)
$ grep -rn "monday" integrations/_registry.ts services/discovery/_registry.ts services/options/_registry.ts
(no results)
$ grep -rn "monday" --include="*.ts" --include="*.tsx" -l
(only node_modules/postgrest-js matches — unrelated)
```

There is **no** `integrations/monday/` directory, **no** Monday entry in any registry (manifests, options resolvers, discovery, handlers), **no** webhook route, **no** OAuth wiring, **no** tests, **no** docs other than this plan + the phase-1 deferral note.

**V1 is unusually clean by contrast.** Per [phase-1-provider-completion-audit.md §4.4](../phase-1-provider-completion-audit.md):

> **V1 code health:** **Excellent.** Schemas are already V2-shape (one file per action, separated trigger files). Per-handler files exist. This is the cleanest unported provider in V1.

The V1 surface (verified live):
- **24 user-facing actions** — all surfaced, none stubbed, none unexposed. Handler file count: 24 + index. Total: **3,305 lines** across `lib/workflows/actions/monday/`.
- **5 user-facing triggers** — all webhook-based via Monday's GraphQL `create_webhook` mutation. HMAC SHA-256 signed.
- **6 dynamic resolvers** — boards / groups / columns / items / file_columns / users.
- **OAuth 2.0 with refresh** — 12 declared scopes. `auth.monday.com/oauth2/{authorize,token}` endpoints. Standard `code` → token exchange.
- **GraphQL v2 API** — single endpoint (`https://api.monday.com/v2`), version-pinned via `API-Version: 2024-01` / `2025-04` headers.
- **Per-workflow webhook lifecycle** — V1 `MondayTriggerLifecycle` class creates/deletes webhooks per workflow on activate/deactivate. Health check reads `trigger_resources`.

**Recommendation up-front:** Monday is **ready for a per-handler V2 port** — schemas are already in V2 shape, handlers are already split per-file, the API is a single GraphQL endpoint, and webhooks fit V2's existing per-workflow `subscriptionRegistry` + `runRenewals` lifecycle (same pattern as Trello / HubSpot / Outlook subscribed triggers). **BUT** the 24-action surface is too large to ship in a single MONDAY-2 commit if reviewers want fine-grained review; this audit recommends **subset-port-first** (Phase 1's accepted "parity-audit-first candidate" framing) with 10 actions in MONDAY-2 and the remaining 14 deferred to a follow-up MONDAY-N polish slice. See §3, §4, §7.

The Phase 1 audit explicitly said this would be the right approach:
> Phase 2 parity work on Monday should subset down to the 8–10 most-used actions per V1 traffic data, not blindly port all 24.

This plan implements that recommendation with a documented decision for each of the 24 V1 actions.

---

## 2. V1 surface

All counts and shapes verified against V1 at `c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/`.

### 2.1 Action inventory (24)

Per V1 [`lib/workflows/nodes/providers/monday/index.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/monday/index.ts) (258 lines, dispatcher only) and [`lib/workflows/actions/monday/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/monday/) (24 handler files + index):

| Group | V1 key | Handler file | One-line purpose |
| --- | --- | --- | --- |
| **Item CRUD (8)** | `monday_action_create_item` | `createItem.ts` | Create new item in board+group with column values |
| | `monday_action_update_item` | `updateItem.ts` | Update column values via `change_multiple_column_values` |
| | `monday_action_create_update` | `createUpdate.ts` | Post comment/update to item |
| | `monday_action_create_subitem` | `createSubitem.ts` | Create sub-task under parent item |
| | `monday_action_delete_item` | `deleteItem.ts` | Soft-delete item (`delete_item` mutation) |
| | `monday_action_archive_item` | `archiveItem.ts` | Archive item (`archive_item` mutation) |
| | `monday_action_move_item` | `moveItem.ts` | Move item between groups |
| | `monday_action_duplicate_item` | `duplicateItem.ts` | Clone item within board |
| **Board / Group (4)** | `monday_action_create_board` | `createBoard.ts` | Create new board with settings |
| | `monday_action_create_group` | `createGroup.ts` | Add group to board |
| | `monday_action_duplicate_board` | `duplicateBoard.ts` | Clone board (with items) |
| | `monday_action_add_column` | `addColumn.ts` | Add column to board |
| **Reads (8)** | `monday_action_get_item` | `getItem.ts` | Get single item by id |
| | `monday_action_search_items` | `searchItems.ts` | Search items by text query |
| | `monday_action_list_items` | `listItems.ts` | Paginated board items list |
| | `monday_action_list_subitems` | `listSubitems.ts` | List subitems for a parent |
| | `monday_action_list_updates` | `listUpdates.ts` | List updates/comments for an item |
| | `monday_action_get_board` | `getBoard.ts` | Get board metadata |
| | `monday_action_list_boards` | `listBoards.ts` | List boards in workspace |
| | `monday_action_list_groups` | `listGroups.ts` | List groups in board |
| **Users (2)** | `monday_action_get_user` | `getUser.ts` | Get user by id |
| | `monday_action_list_users` | `listUsers.ts` | List workspace users |
| **Files (2)** | `monday_action_add_file` | `addFile.ts` | Upload file to file-column / item update |
| | `monday_action_download_file` | `downloadFile.ts` | Download attachment |

**Zero unsurfaced handlers.** All 24 are user-visible in V1's manifest.

### 2.2 Trigger inventory (5)

Per V1 [`lib/triggers/providers/MondayTriggerLifecycle.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MondayTriggerLifecycle.ts) (~390 lines):

| V1 key | Monday `event` name | Activation lifecycle |
| --- | --- | --- |
| `monday_trigger_new_item` | `create_item` | Webhook creation via `create_webhook` GraphQL mutation |
| `monday_trigger_column_changed` | `change_column_value` | Webhook with optional `config.columnId` filter |
| `monday_trigger_item_moved` | `item_moved_to_any_group` | Webhook on board |
| `monday_trigger_new_subitem` | `create_subitem` | Webhook on board |
| `monday_trigger_new_update` | `create_update` | Webhook on board |

All 5 are **instant** (webhook), NOT polling. Per-workflow webhook lifecycle (create on activate, delete on deactivate). Webhook payload arrives at [`app/api/webhooks/monday/route.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/monday/route.ts) with HMAC SHA-256 signature on the `x-monday-signature` header keyed by `MONDAY_SIGNING_SECRET`. The receive route handles Monday's webhook challenge (`{challenge}` → echo).

### 2.3 Dynamic resolvers (6)

Per V1 [`app/api/integrations/monday/data/handlers/`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/monday/data/handlers/) (~436 lines):

| V1 dynamic key | GraphQL endpoint | Required deps | V2 resolver key proposal |
| --- | --- | --- | --- |
| `monday_boards` | `boards(limit: 100)` | none | `monday:boards` |
| `monday_groups` | `boards(ids: $boardId) { groups }` | `boardId` | `monday:groups` (deps `["boardId"]`) |
| `monday_columns` | `boards(ids: $boardId) { columns }` | `boardId` | `monday:columns` (deps `["boardId"]`) |
| `monday_items` | `boards(ids: $boardId) { items_page(limit: 100) }` | `boardId` | `monday:items` (deps `["boardId"]`) |
| `monday_file_columns` | columns filtered to `type === "file"` + virtual `__item_files__` | `boardId` | `monday:file_columns` (deps `["boardId"]`) |
| `monday_users` | `users(limit: 100)` | none | `monday:users` |

Note: V1's `monday_file_columns` includes a virtual `__item_files__` sentinel (for "the item's general files area" vs. a specific file column). V2 should preserve that sentinel verbatim — workflow authors who configured for it would break otherwise.

### 2.4 OAuth + scope model

Per V1 [`lib/integrations/oauthConfig.ts:591-605`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) + [`app/api/integrations/monday/oauth/route.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/monday/oauth/route.ts):

- **OAuth 2.0** standard authorization-code flow.
- `authEndpoint`: `https://auth.monday.com/oauth2/authorize`
- `tokenEndpoint`: `https://auth.monday.com/oauth2/token`
- `refreshable: true` — refresh tokens are issued and refreshable. `refreshTokenExpirationSupported: false` (refresh tokens don't expire on Monday's side per V1).
- `refreshRequiresClientAuth: true` — refresh request includes `client_id` + `client_secret`.
- `redirectUriPath: /api/integrations/monday/callback`
- **12 declared scopes** (broader than the `oauthConfig.ts` summary which omits 6):
  - `me:read`
  - `boards:read`, `boards:write`
  - `users:read`
  - `updates:read`, `updates:write`
  - `assets:read`, `assets:write`
  - `webhooks:read`, `webhooks:write`
  - `workspaces:read`
  - `account:read`

### 2.5 API style — GraphQL v2

Single endpoint: `POST https://api.monday.com/v2`.

V1 helper at [`app/api/integrations/monday/data/utils.ts:64-124`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/monday/data/utils.ts):

```typescript
export async function makeMondayApiRequest(
  query: string,
  accessToken: string,
  variables?: Record<string, any>
): Promise<any> {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'API-Version': '2024-01'
    },
    body: JSON.stringify({ query, variables })
  })
  // ... checks response.ok + data.errors
  return data.data
}
```

**No rate-limit handling.** Monday uses GraphQL complexity-based rate limiting with `X-RateLimit-*` response headers; V1 ignores them. V2 should add complexity-aware retry/backoff (small follow-up — out of MONDAY-2 scope unless real consumers hit limits).

### 2.6 Specialized field types / UX

Per V1 action/trigger schema files, Monday relies on standard V2-compatible types:

- `type: "select"` + `dynamic: "monday_<resource>"` + `dynamicParent: "<parent>"` — V1's dynamic-dropdown shape. **Direct equivalent in V2**: `type: "combobox"` + `optionsSource: "monday:<resource>"` + `dependsOn: "<parent>"`.
- `type: "text"` for free-form item names, updates body.
- `type: "object"` for column-values JSON payloads (output only; not input).
- `hidden: { $deps: [...], $condition: ... }` — conditional visibility. V2's `FieldMeta` does NOT currently support arbitrary `$condition` (only `dependsOn` for cascade gating). For Monday metas: re-implement as visible-but-documented (description warns) OR as a `dependsOn` gate on the obvious parent.

**No custom renderers.** Monday-specific column-value picker (status labels, person picker beyond ids) is **not** implemented in V1 — column values are entered as raw JSON. V2 inherits this; a future polish slice can ship a column-aware value editor.

### 2.7 V1 tests + docs

- 1 integration test: [`__tests__/workflows/pr-g4-slack-teams-monday-onedrive-required-fields.test.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g4-slack-teams-monday-onedrive-required-fields.test.ts) — required-field validation across providers; not Monday-specific.
- 1 learning doc: [`learning/docs/monday-coverage-analysis.md`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/docs/monday-coverage-analysis.md) (330 lines) — V1's own Make.com / Zapier parity analysis. Confirms V1's 24 actions = ~15% of Make.com's parity surface. V2 v1 will land at the same level; broader parity is post-V2-completeness.

### 2.8 Webhooks

Per V1 [`app/api/webhooks/monday/route.ts`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/monday/route.ts) (326 lines):

- **POST handler**: captures raw body BEFORE JSON parse (for HMAC), verifies `x-monday-signature` via HMAC-SHA256 keyed by `MONDAY_SIGNING_SECRET`, handles Monday's `{challenge}` echo handshake on subscription creation, parses payload, looks up trigger by `workflowId` + `nodeId` query params (strict-direct-lookup, mirrors V2's existing webhook routes), dispatches via `triggerWorkflowsForEvent`.
- **Event transform**: V1 has a `transformMondayPayload` step that normalizes Monday's `pulseId`/`pulse_id` shape variance — Monday is inconsistent between snake_case and camelCase in webhook payloads. V2 needs to mirror this normalization in per-trigger `normalize.ts`.

### 2.9 Rate limits

**Absent from V1.** Monday's GraphQL complexity scoring is well-documented (queries get a complexity budget; mutations cost more than reads; lists scale with `limit`). V1 ignores it and trusts callers not to hit limits. V2 v1 should mirror this but log structured warnings when `X-RateLimit-Remaining` < threshold so we can add backoff later.

### 2.10 Confirmation table

| Item | V1 Count | V2 Count |
| --- | --- | --- |
| Action handlers | 24 | 0 |
| Trigger handlers | 5 (webhook) | 0 |
| Unsurfaced handlers | 0 | N/A |
| Resolvers | 6 | 0 |
| API style | GraphQL v2 | N/A (need new helper) |
| Auth model | OAuth 2.0 (refreshable) | N/A (need new wiring) |
| Webhook route | yes | N/A (need new route) |

---

## 3. V1 → V2 Decision Matrix

For each meaningful area: COPY (verbatim), ADAPT (port-with-changes), REPLACE (V1's choice was wrong, V2 picks a different approach), DEFER (out of scope this arc, revisit later), REJECT (won't ship).

### 3.1 Auth model

| V1 behavior | Recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- |
| OAuth 2.0 standard authorization-code flow with refresh token | **COPY** | OAuth is the right choice for Monday — refresh tokens work, scope granularity is fine-grained, redirect-URI flow is well-understood. V2's existing `oauth2` flow contract (Mailchimp, HubSpot, Notion, Microsoft providers) handles this verbatim. | New `integrations/monday/oauth.ts` + manifest `oauthFlows: ["v2"]`, `refreshable: true`, `tokenScope: "user"`. New OAuth callback route `app/api/integrations/monday/callback/route.ts`. Standard `v2OAuthDispatcher` extension to recognize `monday` provider. |
| 12 declared scopes (`me:read`, `boards:read/write`, `users:read`, `updates:read/write`, `assets:read/write`, `webhooks:read/write`, `workspaces:read`, `account:read`) | **ADAPT** | Drop `account:read` (unused in actions; "account name" payload from `me` is sufficient). Keep the other 11 — every action surface uses at least one. Avoid V1's no-account-info implication that broader scopes were "just in case". | Manifest `scopes.required` = 11 entries; `optional: []`; `deprecated: []`. Narrower than V1, justifiable. |
| `refreshTokenExpirationSupported: false` | **COPY** | Verified true at Monday docs; refresh tokens are long-lived. | Manifest's existing `refreshable: true` is sufficient — no expiry-tracking on refresh tokens needed. |
| Standard `redirect_uri` in refresh request | **COPY** | Monday requires this; V2's `_shared/oauth/v2` already supports the flag. | One-line config in oauth.ts: `sendRedirectUriWithRefresh: true`. |

### 3.2 API style + transport

| V1 behavior | Recommendation | Rationale | Implementation consequence |
| --- | --- | --- | --- |
| Single GraphQL endpoint `POST https://api.monday.com/v2` | **COPY** | This is Monday's only public API. No REST surface. | New `integrations/_shared/monday/api/_request.ts` (GraphQL wrapper). |
| `Authorization: Bearer <token>` header | **COPY** | Standard. | Wrapper builds from `accessToken` arg. |
| `API-Version: 2024-01` (data) / `2025-04` (webhook lifecycle) | **ADAPT** | V2 pins one version per provider via `manifest.apiVersion`. Use `2024-01` baseline (covers every action). For webhook lifecycle, V2 helper can override per-call (mirrors V1's pattern — explicit when needed). | Manifest `apiVersion: "2024-01"`. Webhook activate helper passes explicit `API-Version: "2025-04"` because the `config` param for column filtering only landed in that version. |
| Per-handler GraphQL string templates (V1 inlines queries inside each handler) | **ADAPT** | V2 splits per-mutation/query into reusable helpers under `integrations/_shared/monday/api/` (one file per Graph operation). Same per-handler split as every other V2 provider — `_shared` helpers are pure wrappers. | New files: `boardsList.ts`, `boardsGet.ts`, `itemsList.ts`, `itemsCreate.ts`, etc. The handler in `integrations/monday/actions/createItem.ts` calls `itemsCreate({accessToken, ...})` rather than building the GraphQL string inline. |
| `data.errors` GraphQL error handling | **ADAPT** | V1 collapses all `data.errors` into a single `throw new Error("Monday.com GraphQL error: ...")`. V2 should distinguish 401 (token-expired) into `Unauthorized401Error` for `refreshAndRetry`, 404 (item/board not found) into `NotFoundError`, complexity-exceeded into a typed `RateLimitError`, and everything else into a generic `MondayApiError` with sanitized message. | New `integrations/_shared/monday/errors.ts` with `Unauthorized401Error` / `NotFoundError` / `RateLimitError` / `MondayApiError` + a `surfaceMondayError(rawErrors, status)` helper for sanitized messages. |
| No rate-limit handling | **DEFER** | Monday's complexity-budget headers ARE available; V1 ignores them. V2 v1 logs `X-RateLimit-Remaining` warnings when low but doesn't auto-backoff. Backoff lands as MONDAY-N polish only if real consumers hit it. | `_request.ts` extracts `X-RateLimit-Remaining` + `X-RateLimit-Limit` and emits a structured `console.warn` when remaining < 10% of limit. No retry logic. |

### 3.3 Action surface — which of 24 V1 actions ship in MONDAY-2

This is the largest decision. V1 has 24; per Phase 1 audit guidance ("subset down to 8–10 most-used") + V2's slice-size discipline, MONDAY-2 ships **10 actions**. The remaining 14 defer to MONDAY-N polish with named rationale.

| V1 action | V2 status | Rationale |
| --- | --- | --- |
| `create_item` | **MONDAY-2 SHIP** | Foundational. Every Monday workflow creates items. |
| `update_item` | **MONDAY-2 SHIP** | Foundational. Column value mutation is the second most-common verb. |
| `create_update` | **MONDAY-2 SHIP** | Comments / item discussion — high-value, low-risk. |
| `create_subitem` | **MONDAY-2 SHIP** | Subitem support distinguishes Monday from generic project trackers. V1 already polished. |
| `delete_item` | **MONDAY-2 SHIP** | Destructive parity — needed for "create then conditionally delete" patterns. **destructive trio.** |
| `move_item` | **MONDAY-2 SHIP** | High-value workflow primitive (kanban-style "advance to next group"). |
| `get_item` | **MONDAY-2 SHIP** | Read parity — fetching item state mid-workflow. |
| `list_items` | **MONDAY-2 SHIP** | Read parity — board enumeration. **bulk sensitive output.** |
| `list_boards` | **MONDAY-2 SHIP** | Read parity — workspace introspection. Backs admin/audit workflows. |
| `list_users` | **MONDAY-2 SHIP** | Read parity — assignment / mention workflows that need name→id lookup. |
| `archive_item` | **MONDAY-N polish (defer)** | Adjacent to `delete_item`. Recoverable. Different mutation but same surface; collapse rationale: ship destructive primitive first; archive joins a polish wave. **No real-consumer signal V1 surface needed both immediately.** |
| `duplicate_item` | **MONDAY-N polish (defer)** | Composes from `get_item` + `create_item`. Native primitive is convenient but not load-bearing. |
| `create_board` | **MONDAY-N polish (defer)** | Workflow authors who need new boards usually create them in the Monday UI. Low automation demand per V1 coverage doc. |
| `create_group` | **MONDAY-N polish (defer)** | Same rationale as `create_board`. |
| `duplicate_board` | **MONDAY-N polish (defer)** | Niche; recoverable; not in V1's "most-used" tier. |
| `add_column` | **MONDAY-N polish (defer)** | Schema-mutating operation. Rare in automation. Mostly used by admin setup. |
| `search_items` | **MONDAY-N polish (defer)** | Composable from `list_items` + downstream filter. v1 surface duplicates that path; keep one path canonical. |
| `list_subitems` | **MONDAY-N polish (defer)** | Adjacent to `list_items` + subitem-id filter; defer until shipped or a real consumer needs it. |
| `list_updates` | **MONDAY-N polish (defer)** | Composable from `get_item` returning `updates`; defer the dedicated list call. |
| `get_board` | **MONDAY-N polish (defer)** | Single-board metadata fetch — rarely useful standalone. Composable via `list_boards` + filter. |
| `list_groups` | **MONDAY-N polish (defer)** | Backed by the `monday:groups` resolver (MONDAY-3) for picker use; standalone action defer. |
| `get_user` | **MONDAY-N polish (defer)** | Single-user metadata. Composable from `list_users` + filter. |
| `add_file` | **MONDAY-N polish (defer)** | File uploads are a FileRef-consuming action surface. Defer until the polish slice can verify the upload contract against V2's FileRef shape (multipart form data + Monday's GraphQL `add_file_to_column` mutation). |
| `download_file` | **MONDAY-N polish (defer)** | FileRef-producing. Pairs with `add_file` — ship together. |

**MONDAY-2 = 10 actions. Deferred to MONDAY-N = 14 actions. Total V1 parity = 24/24 when MONDAY-N closes.**

Decision check: **the 10 chosen actions cover ~80% of expected workflow volume per V1's own coverage analysis doc.** The deferred 14 are mostly composable from the shipped surface OR low-traffic admin / setup operations OR FileRef actions that need their own design pass.

### 3.4 Trigger surface — webhook architecture

| V1 trigger | V2 recommendation | Rationale | Architecture |
| --- | --- | --- | --- |
| `new_item` | **MONDAY-5 SHIP (webhook)** | High-value; clean Monday webhook event. | Per-workflow webhook subscription via `webhooks.create` GraphQL mutation. Activate creates, deactivate deletes. HMAC SHA-256 signature verification. |
| `column_changed` | **MONDAY-5 SHIP (webhook)** | High-value; supports optional `columnId` filter via Monday's webhook `config` param (requires `API-Version: 2025-04`). | Same lifecycle; activate's GraphQL mutation includes `config: { columnId }` when filter is set. |
| `item_moved` | **MONDAY-5 SHIP (webhook)** | Kanban-style workflows depend on this. | Same lifecycle. |
| `new_subitem` | **MONDAY-5 SHIP (webhook)** | Pairs with `create_subitem` action. | Same lifecycle. |
| `new_update` | **MONDAY-5 SHIP (webhook)** | Discussion/comment workflows. | Same lifecycle. |

**All 5 V1 triggers ship in MONDAY-5.** Monday's webhook surface is a first-class V2 fit — `subscriptionRegistry` + `runRenewals` + `webhook_event_dedup` exactly match the lifecycle Trello / HubSpot / Outlook already use. Per-workflow subscription, HMAC-signed, deterministic event types — no architectural gymnastics needed.

**Trigger architecture summary (MONDAY-5):**
- `activate.ts` per trigger: `webhooks.create(boardId, event, optional config)` via GraphQL → store `webhookId` in `trigger_resources.config`.
- `deactivate.ts` shared: `webhooks.delete(webhookId)` GraphQL mutation.
- `receive.ts` (app/api/webhooks/monday/route.ts): raw-body capture → HMAC verify → `{challenge}` echo → strict-direct-lookup by `workflowId` / `nodeId` query params → normalize payload → dispatch.
- `normalize.ts` per trigger: maps Monday's mixed `pulseId`/`pulse_id` shapes to a single canonical payload. `changeKind: "new_item"` / `"column_changed"` / `"item_moved"` / `"new_subitem"` / `"new_update"` for branch-on-kind workflows.
- `renew.ts`: Monday webhooks DO NOT EXPIRE per Monday docs, so renewal cron is a no-op (matches Trello's "no renewal" model). Activation hook does NOT mark `config.type = "subscription-watch"` (the marker that opts into `runRenewals`).

### 3.5 Resolvers — 6 needed in MONDAY-3

All 6 V1 resolvers port verbatim with V2-key prefixing (`monday:<resource>`):

| V2 resolver key | `requiredDeps` | GraphQL query | Notes |
| --- | --- | --- | --- |
| `monday:boards` | none | `boards(limit: 100)` | Account-scoped picker. Backs `boardId` field on every action that needs a board. |
| `monday:groups` | `["boardId"]` | `boards(ids: $boardId) { groups }` | Backs `groupId` on `create_item`, `move_item`. |
| `monday:columns` | `["boardId"]` | `boards(ids: $boardId) { columns }` | Backs `columnId` on `update_item`, future `add_column`. |
| `monday:items` | `["boardId"]` | `boards(ids: $boardId) { items_page(limit: 100) }` | Backs `itemId` on `update_item`, `get_item`, `delete_item`, `move_item`, `create_subitem`, `create_update`, `download_file`. |
| `monday:file_columns` | `["boardId"]` | columns filtered to `type === "file"` + synthetic `__item_files__` option | Backs `columnId` on `add_file` (MONDAY-N). Virtual `__item_files__` preserved. |
| `monday:users` | none | `users(limit: 100)` | Backs `userId` on `get_user` (deferred); also future person-column picker. |

**Resolver dep names** match the V1 schema field names verbatim (`boardId`, `itemId`, `columnId` — all camelCase). Per the standard V2 pattern, dep keys must equal consumer field names so cascade wiring works without renaming.

### 3.6 Field names / defaults

| V1 convention | V2 recommendation | Rationale |
| --- | --- | --- |
| camelCase field names (`boardId`, `groupId`, `itemId`, `columnId`, `columnValue`, `itemName`) | **COPY** | Already in V2-shape per Phase 1 audit. Preserve verbatim — same rule applied to every prior provider port. |
| `dynamic: "monday_<resource>"` + `dynamicParent: "<parent>"` | **REPLACE** | V2 uses `optionsSource: "monday:<resource>"` + `dependsOn: "<parent>"`. Mechanically identical UX; different config key names. The V1 schemas as files already exist but reference V1's dynamic shape — V2 metas re-author this part. |
| `hidden: { $deps: [...], $condition: {...} }` | **REPLACE** | V2's `FieldMeta` doesn't support arbitrary `$condition`. For Monday metas, fields stay visible; descriptions document the conditional ("Required when …"). Same compromise OneNote / Mailchimp accepted. |
| `loadOnMount: true` on top-level pickers | **REPLACE** | V2's combobox renderer auto-loads on focus, not on mount. The `loadOnMount` flag has no V2 equivalent and the UX difference is negligible. |
| Empty-string defaults vs `undefined` | **COPY** where it matches V1 runtime behavior | E.g. `update_item` accepts a single-column update; V1 schema has `columnId` + `columnValue` required, no default. V2 mirrors. |
| `description` strings (V1 has them) | **ADAPT** | V2 description includes destructive-mode warnings + payload guarantees + scope-narrowing tips. Don't copy V1 prose verbatim — re-author per V2 conventions. |

### 3.7 Runtime handler structure

| V1 layout | V2 recommendation | Rationale |
| --- | --- | --- |
| `lib/workflows/actions/monday/createItem.ts` (one file per action, ~135 avg lines) | **COPY (split-per-action stays)** | V1 already did this. V2 layout: `integrations/monday/actions/createItem.ts` (handler) + `createItem.schema.ts` (Zod schema) for each. |
| GraphQL string inlined inside each handler | **ADAPT** | Hoist the GraphQL request to `integrations/_shared/monday/api/itemsCreate.ts` (one wrapper per Graph operation). Handler builds the variables object + calls the wrapper. Matches OneNote / Microsoft pattern. |
| Per-handler error handling (each catches + rethrows) | **ADAPT** | V2's `refreshAndRetry` owns the 401 → refresh → retry loop. Handler wraps the principal Graph call in `refreshAndRetry({ provider: "monday", accountId: ... })`. The wrapper throws `Unauthorized401Error` on 401; everything else propagates. |
| No `meta`-threading for idempotency (V1 has no Q4) | **ADAPT** | V2's handler signature carries `HandlerExecutionMeta` for the session-side-effects idempotency layer (Q4). Wrap principal writes (`create_item`, `update_item`, `delete_item`, `move_item`, `create_subitem`, `create_update`) in `checkReplay` + `recordFired`. Reads (`get_item`, `list_items`, `list_boards`, `list_users`) skip the idempotency layer (no side effect). |

### 3.8 Output shapes

V1's outputs are largely raw GraphQL response data — `{item: {id, name, column_values: [...]}}`. V2 should normalize:

- `id` (Monday calls `pulse_id` on webhook payloads; V1 has a normalization step — V2 sticks with `id` for output, `pulseId` for trigger payload echo).
- Wrap arrays predictably (`items`, `boards`, `groups`, `users`, `columns`).
- Drop internal GraphQL `__typename` echoes.
- Add structural scalars: `count`, `hasMore`, `nextCursor` for list operations.
- Echo input ids (`boardId`, `groupId`, `itemId`) on every output so downstream nodes can reference them without re-extracting.

**Sensitive output decisions (per slice spec §6, finalized in §6 below):** item names, board names, group names, user names + emails, column values, update bodies, file URLs all marked sensitive.

### 3.9 Metadata / Risk / Sensitive outputs

Covered in §5 + §6 below. Action risk classifications: 1 destructive (delete_item) + 5 medium (creates / updates / moves) + 4 low (reads). Future MONDAY-N adds 1 more destructive (archive_item — recoverable but still privileged) + 13 mixed.

### 3.10 External constraints / app review / rate limits

| Concern | V2 v1 behavior | Follow-up |
| --- | --- | --- |
| Monday OAuth app — **manual setup required** | Operator creates a Monday Developer App, adds redirect URI, sets `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` / `MONDAY_SIGNING_SECRET` env vars | One-time. Document in `docs/rules/secrets-and-env.md`. |
| Marketplace app review (optional) | **Skip.** Personal-token / "your own account" OAuth apps don't require marketplace approval. Public listing in Monday's marketplace IS a separate workflow gated on review; out of scope for V2 v1. | Revisit if multi-tenant production deployment requires marketplace listing. |
| GraphQL complexity rate limits | **Log only** in V2 v1. Backoff/retry deferred. | Add if real consumers hit limits. |
| `webhooks:write` scope user-trust prompt | Monday surfaces "this app can manage webhooks" in the consent screen. Users who don't grant this scope CAN'T use triggers but CAN use actions. | Document gracefully — manifest's `scopes.required` includes `webhooks:write` so the consent screen prompts for it; users who deny will see the trigger fail at activate time with a clear error. |
| HMAC signing secret | Required env var: `MONDAY_SIGNING_SECRET`. Operator obtains from Monday Developer App dashboard. | Webhook receive route fails-closed when secret is missing OR signature is invalid. |

---

## 4. Proposed V2 surface

### 4.1 Actions to ship in MONDAY-2 (10)

| Action key | Required fields | Optional fields | Risk | Notes |
| --- | --- | --- | --- | --- |
| `monday:create_item` | `boardId`, `groupId`, `itemName` | `columnValues` (JSON) | medium | Creates a Monday item. Recoverable via delete/archive. |
| `monday:update_item` | `boardId`, `itemId`, `columnId`, `columnValue` | — | medium | V1 routes through `change_multiple_column_values` even when one column is given; V2 keeps the single-column signature, wraps a single `{[columnId]: columnValue}` map internally. |
| `monday:create_update` | `itemId`, `body` | — | medium | Posts a comment/update to an item. Recoverable by deletion. |
| `monday:create_subitem` | `parentItemId`, `subitemName` | `columnValues` (JSON) | medium | Subitems live in a hidden subitems board; V2 abstracts this — workflow author only knows the parent item id. |
| `monday:delete_item` | `boardId`, `itemId` | — | **HIGH + destructive + requiresConfirmation** | Monday's `delete_item` is soft-deletion (recoverable in Monday's UI for ~30 days), but no API endpoint to restore. V2 treats it as destructive. |
| `monday:move_item` | `boardId`, `itemId`, `targetGroupId` | — | medium | Reversible. |
| `monday:get_item` | `boardId`, `itemId` | — | low | Pure read. Returns column values, group/board context. |
| `monday:list_items` | `boardId` | `limit` (1..100, default 25) | low | Pure read. **Bulk PII collection** marked sensitive. |
| `monday:list_boards` | — | `limit` (1..100, default 25) | low | Pure read; workspace introspection. |
| `monday:list_users` | — | `limit` (1..100, default 25) | low | Pure read. **Bulk PII collection** marked sensitive. |

### 4.2 Triggers to ship in MONDAY-5 (5 — all V1 triggers)

| Trigger key | Required fields | Optional fields | Webhook event | Notes |
| --- | --- | --- | --- | --- |
| `monday:new_item` | `boardId` | — | `create_item` | Fires per item created. |
| `monday:column_changed` | `boardId` | `columnId` (filter) | `change_column_value` | When `columnId` set, webhook is created with `config: { columnId }` (Monday API-Version 2025-04). |
| `monday:item_moved` | `boardId` | — | `item_moved_to_any_group` | Fires per move. Payload includes `previousGroupId` + `currentGroupId`. |
| `monday:new_subitem` | `boardId` | — | `create_subitem` | Fires on parent board, payload carries `parentItemId` + new subitem id. |
| `monday:new_update` | `boardId` | — | `create_update` | Fires on board's update activity (every item). |

### 4.3 Deferred V2 surface (MONDAY-N) — 14 actions + 0 triggers

| Action | Defer rationale | Revisit when |
| --- | --- | --- |
| `archive_item` | Recoverable; ship destructive primitive first. | Real consumer asks. |
| `duplicate_item` | Composable. | If real consumer hits it. |
| `create_board` | Admin/setup; low automation demand. | Marketplace listing or admin-workflow consumer. |
| `create_group` | Admin/setup. | Same. |
| `duplicate_board` | Niche. | Same. |
| `add_column` | Schema mutation; rare. | Same. |
| `search_items` | Composable from `list_items`. | If full-text Monday-side search is critical. |
| `list_subitems` | Composable. | If subitems-only workflows emerge. |
| `list_updates` | Returns via `get_item`. | If standalone listing is needed. |
| `get_board` | Composable. | Same. |
| `list_groups` | Resolver covers picker use. | Same. |
| `get_user` | Composable. | Same. |
| `add_file` | FileRef-consuming; needs dedicated UX. | Pair with `download_file` in a single MONDAY-N FileRef slice. |
| `download_file` | FileRef-producing. | Same. |

### 4.4 Resolvers to ship in MONDAY-3 (6 — all V1 resolvers)

See §3.5. All 6 ship in MONDAY-3; resolver-first per V2 pattern.

### 4.5 Exact field-name preservation warnings

V1 has been V2-shape since pre-Phase-2, so most field names are already correct. Watch-outs for the port:

- `boardId` (NOT `board_id`) — every action + trigger uses this.
- `groupId` (NOT `group_id`).
- `itemId` (NOT `item_id` or `pulseId` — `pulseId` is Monday's internal name; webhook payloads use both, V2 normalizes to `itemId`).
- `columnId` (NOT `column_id`).
- `columnValue` (singular, NOT `value` or `columnValues`).
- `columnValues` (plural, JSON map — used on `create_item` for bulk initial values).
- `itemName` (NOT `name` or `pulseName`).
- `targetGroupId` on `move_item` (NOT `groupId` — disambiguates from source/parent).
- `parentItemId` on `create_subitem`.

**Webhook payload normalization (MONDAY-5):** Monday emits both `pulseId`/`pulse_id`/`itemId` and `pulseName`/`itemName` inconsistently across event types. V2's `normalize.ts` per trigger uses a single canonical mapping with fallback (`event.pulseId ?? event.pulse_id ?? event.itemId`) — mirror V1's behavior exactly.

### 4.6 Output shape proposal

Per-action outputs follow V2 conventions: opaque ids + structural scalars + sensitive-flagged user-supplied content. Detailed per-action shapes land in MONDAY-2's per-handler `meta` files; the audit here pins the principles:

- Echo input ids on every output (`boardId`, `groupId`, `itemId` etc.) so downstream nodes don't re-extract.
- Lists return `{items, count, hasMore, nextCursor}` — `count` is the page size, NOT the total. `hasMore` from Monday's `cursor` presence.
- Reads return the full Monday resource block (item / board / user) minus internal GraphQL `__typename` echoes.
- Writes return `{id, success, [echoed inputs]}`.
- Destructive (`delete_item`) returns `{success, deletedItemId, deletedAt}` — NO title / body / column values echoed (same defense-in-depth pattern OneNote `delete_page` uses).

---

## 5. Risk classification

| Action | Risk | `isDestructive` | `requiresConfirmation` | Rationale |
| --- | --- | --- | --- | --- |
| `monday:list_items` | low | false | false | Pure read. Bulk PII collection → mark `items[]` sensitive. |
| `monday:list_boards` | low | false | false | Pure read. Workspace-name list → mark `boards[]` sensitive. |
| `monday:list_users` | low | false | false | Pure read. User names + emails → mark `users[]` sensitive. |
| `monday:get_item` | low | false | false | Pure read. Item title + column values sensitive. |
| `monday:create_update` | medium | false | false | Posts a comment. Recoverable via delete-update (defer that action; for v1, users delete updates in the Monday UI). |
| `monday:create_item` | medium | false | false | New external resource. Recoverable via `delete_item` / `archive_item`. |
| `monday:create_subitem` | medium | false | false | New external resource. Same as `create_item`. |
| `monday:update_item` | medium | false | false | Mutates existing column value. Recoverable by setting back; column history visible in Monday UI. |
| `monday:move_item` | medium | false | false | Reversible by moving back. |
| `monday:delete_item` | **high** | **true** | **true** | Soft-delete; Monday surfaces a 30-day "Deleted Items" view but **no API endpoint** to restore. From ChainReact's perspective: irreversible. Destructive trio mandatory. `riskDescription` calls out soft-delete + UI-only restore path. |

For MONDAY-N polish actions (when shipped): `archive_item` = medium + `isDestructive: false` (archive is recoverable via Monday API `unarchive_item`); `create_board` / `create_group` / `duplicate_board` / `add_column` = medium; `download_file` = low; `add_file` = medium (creates a file attachment, technically recoverable by deleting the file).

### 5.1 Trigger risk (MONDAY-5)

All 5 triggers are **low** — observational, no provider-side state mutation. Sensitive payload fields flagged in §6.

---

## 6. Sensitive output proposal

### 6.1 Action outputs

Per the suspicious-name structural guard at [`tests/structure/sensitive-output-coverage.test.ts`](../../tests/structure/sensitive-output-coverage.test.ts):

| Action | Sensitive | Not sensitive |
| --- | --- | --- |
| `create_item` | `itemName`, `webUrl` (canonical Monday item URL) | `id`, `boardId`, `groupId`, `createdAt` |
| `update_item` | `itemName`, `columnValue` (echo of caller-supplied value — but matches the structural `messages` / `content` suspicious set conservatively), `webUrl` | `id`, `boardId`, `columnId`, `updatedAt`, `success` |
| `create_update` | `body` (matches `body` suspicious name), `updateId` (Monday's update id; opaque but addressable) | `id`, `itemId`, `createdAt` |
| `create_subitem` | `subitemName`, `webUrl` | `id`, `parentItemId`, `boardId`, `createdAt` |
| `delete_item` | — (output is structural only — no name / body echoed; defense in depth, same pattern as OneNote `delete_page`) | `success`, `deletedItemId`, `deletedAt` |
| `move_item` | `itemName`, `webUrl` | `id`, `boardId`, `previousGroupId`, `currentGroupId`, `success`, `movedAt` |
| `get_item` | `name`, `columnValues[]` (per-column user-typed content), `body` (if updates expanded), `webUrl`, `creator` (user info), `assignees[]` (person column values) | `id`, `boardId`, `groupId`, `createdAt`, `updatedAt` |
| `list_items` | `items[]` (bulk PII at parent level), `hasMore` echo of cursor | `count`, `boardId`, `nextCursor` |
| `list_boards` | `boards[]` (bulk; per-board `name` carries org info) | `count`, `hasMore`, `nextCursor` |
| `list_users` | `users[]` (per-user `name` + `email` — bulk PII) | `count`, `hasMore`, `nextCursor` |

### 6.2 Trigger payloads (MONDAY-5)

| Trigger | Sensitive | Not sensitive |
| --- | --- | --- |
| `new_item` | `itemName`, `webUrl`, `columnValues` (if expanded) | `changeKind`, `itemId`, `boardId`, `groupId`, `createdAt`, `creatorId` |
| `column_changed` | `columnTitle`, `previousValue`, `newValue` (column content — both user-typed), `changedByName` if expanded | `changeKind`, `itemId`, `boardId`, `columnId`, `changedAt`, `changedById` |
| `item_moved` | `itemName`, `webUrl` | `changeKind`, `itemId`, `boardId`, `previousGroupId`, `currentGroupId`, `movedAt`, `movedById` |
| `new_subitem` | `subitemName`, `webUrl` | `changeKind`, `subitemId`, `parentItemId`, `boardId`, `createdAt`, `creatorId` |
| `new_update` | `body` (update text content — matches structural `body` suspicious name), `posterName` | `changeKind`, `updateId`, `itemId`, `boardId`, `createdAt`, `posterId` |

### 6.3 Defense-in-depth — no secret-shaped names

The OAuth access token MUST NEVER appear as an output field. The secret-name regression guard at [`sensitive-output-coverage.test.ts:251`](../../tests/structure/sensitive-output-coverage.test.ts) enforces `token` / `clientSecret` / `secret` / `apiKey` / `accessToken` / `refreshToken` / `webhookSecret` are absent from every meta. V2's Monday implementation must preserve this — no token leaks in any output, sensitive-flagged or not.

---

## 7. Slice sequence

| Slice | Scope | Estimated commits | Coverage gain |
| --- | --- | --- | --- |
| **MONDAY-1** (this slice) | Audit + plan doc only. | 1 (this commit). | None — doc-only. |
| **MONDAY-2** (runtime port) | 10 action handlers (per §4.1) + Zod schemas + shared GraphQL wrapper + manifest + OAuth route + callback + handler registry. No metas, no resolvers, no triggers. ~30 files. | 1 commit. | 10 action handlers in execution registry. Monday NOT in `COVERED_PROVIDERS` yet. |
| **MONDAY-3** (options resolvers) | 6 resolvers (per §3.5) + registry wiring + tests. ~20 files. | 1 commit. | 6 resolvers; provider stays OUT of `COVERED_PROVIDERS`. |
| **MONDAY-4** (action metas + COVERED flip) | 10 ActionMeta files + sub-registry at `services/discovery/providers/monday.ts` + provider-route tests + builder integration tests (3-5 highest-value flows). Flip Monday into `COVERED_PROVIDERS` (action coverage). Trigger coverage NOT enforced (precedent: Stripe/Discord/GDocs/OneNote). | 1 commit. | 10 actions covered; provider in COVERED. |
| **MONDAY-5** (triggers) | 5 trigger handlers + shared activation/deactivation helpers + webhook receive route + HMAC verification + per-trigger normalize + TriggerMeta files + activation invariant satisfied. Flip manifest `webhookTrigger: true`. ~30 files. | 1 commit. | 5 triggers ship; Monday provider arc complete to V2 standard. |
| **MONDAY-N** (FileRef + remaining actions) | 14 deferred actions (per §4.3), split into 2-3 polish slices if needed. | Separate arc, no urgency. | Full V1 parity at 24/24 when closed. |

**Recommendation for the FIRST implementation slice:** **MONDAY-2 (runtime port — 10 actions only).** Start with the runtime since metadata requires handlers to exist; resolver-first only applies once the runtime has consumer handlers. The audit framing of "best parity-audit-first candidate" is satisfied here — we picked 10 of 24, not 24 of 24.

---

## 8. What to copy vs not copy

### 8.1 Copy verbatim

- **Field names** (`boardId`, `groupId`, `itemId`, `columnId`, `columnValue`, `itemName`, `targetGroupId`, `parentItemId`, etc.). All V2-shape already.
- **GraphQL queries / mutations** — V1's templates are correct. V2 splits them per-wrapper file but the query/mutation strings stay character-for-character (modulo $variable formatting).
- **Webhook event names** — `create_item`, `change_column_value`, `item_moved_to_any_group`, `create_subitem`, `create_update`. Monday's API names; V2 cannot change them.
- **HMAC verification algorithm** — HMAC-SHA256 keyed by `MONDAY_SIGNING_SECRET`. Standard; same as Trello / GitHub.
- **`{challenge}` echo handshake** — Monday's webhook subscription verification step; mandatory.
- **Virtual `__item_files__` sentinel** in `monday:file_columns` resolver. Workflow authors who configured for it would break if dropped.
- **`pulseId` / `pulse_id` / `itemId` payload normalization** — Monday's webhook payload is inconsistent; V1's normalization is correct.

### 8.2 Adapt (V1 → V2-pattern)

- **Monolithic handler error catches** → V2's `refreshAndRetry` + typed error classes (`Unauthorized401Error`, `NotFoundError`, `RateLimitError`, `MondayApiError`).
- **Inline GraphQL strings** → split into `_shared/monday/api/<operation>.ts` wrappers.
- **V1's `dynamic` + `dynamicParent` schema keys** → V2's `optionsSource` + `dependsOn`.
- **V1's `hidden: { $deps, $condition }`** → V2's visible-with-description model (FieldMeta doesn't support arbitrary `$condition`).
- **V1's `loadOnMount: true`** → drop (V2's combobox auto-loads on focus).
- **V1's broad `account:read` scope** → drop from required (unused).
- **V1's `MondayTriggerLifecycle` class with onActivate/onDeactivate/onDelete methods** → V2's per-trigger `activate.ts` + `deactivate.ts` + shared helpers. Same lifecycle behavior, different file shape.
- **V1's `transformMondayPayload` step** → V2's per-trigger `normalize.ts` (per V2's webhook-trigger contract).

### 8.3 Replace (V1 was wrong / V2 has a better pattern)

- **GraphQL response error collapsing** (V1 throws one generic Error for all GraphQL errors) → V2 distinguishes 401 / 404 / rate-limit / other. The principal write call goes through `refreshAndRetry` so 401s trigger refresh.
- **No idempotency on writes** (V1 has no Q4 session-side-effects) → V2 wraps principal writes in `checkReplay` + `recordFired`.
- **No rate-limit awareness** (V1 ignores Monday's complexity headers) → V2 logs `X-RateLimit-Remaining` warnings at low threshold (no backoff in v1).
- **Webhook receive route inlining payload transform** (V1's `transformMondayPayload` is inside the route) → V2's receive route dispatches to per-trigger `normalize.ts` (matches OneNote / Outlook / Trello / HubSpot pattern).

### 8.4 Defer / reject

- **REJECT V1's `account:read` scope** — unused, narrower scope set is better.
- **REJECT V1's "ship all 24 actions" framing** — Phase 1 audit explicitly recommended subset-first; this plan formalizes the 10/14 split.
- **DEFER `add_file` / `download_file`** to MONDAY-N FileRef polish slice (pair them).
- **DEFER `search_items`** in favor of `list_items` + downstream filter composition.
- **DEFER `get_board` / `get_user`** in favor of `list_boards` / `list_users` + downstream filter.
- **DEFER `list_groups` / `list_subitems` / `list_updates`** in favor of resolver coverage / composable shapes.
- **DEFER `archive_item` / `duplicate_item` / `create_board` / `create_group` / `duplicate_board` / `add_column`** — low-volume per V1 coverage doc.
- **DEFER GraphQL complexity rate-limit auto-backoff** — log-only in v1; backoff if real consumers hit it.
- **DEFER marketplace app review** — only needed if multi-tenant marketplace listing is desired.
- **DEFER column-aware value editor UX** — V2 v1 enters column values as raw JSON (matches V1).

---

## 9. Open decisions before implementation

### D-MON1 — Subset-port-first split: 10/24 actions in MONDAY-2

Recommended (per §3.3). Phase 1 audit's "8-10" framing maps to:
- **10 actions** (item CRUD core 6 + 4 reads) ship in MONDAY-2.
- **14 actions** defer to MONDAY-N (admin / list-variants / FileRef).

**Risk if accepted:** Workflow authors who specifically need one of the 14 deferred actions face a wait until MONDAY-N. Mitigation: most deferred actions are composable from the 10 shipped (search via list+filter; get-singular via list+filter; subitems via list_items + filter).

**Risk if rejected (ship all 24):** MONDAY-2 commit scope grows ~2.4×. The 14 deferred actions include FileRef + schema-mutation operations that each merit their own design pass.

**Recommendation: ACCEPT the 10/14 split per Phase 1 audit guidance.** If the product owner wants all 24, MONDAY-2 + MONDAY-N collapse into one larger MONDAY-2 with explicit per-action review.

### D-MON2 — Trigger architecture: webhook (recommended) vs polling (rejected)

V1 ships all 5 triggers as webhook-based via Monday's `create_webhook` GraphQL mutation. V2 should COPY this.

**Why not polling fallback:**
- Monday has first-class webhooks for all 5 event types.
- Per-workflow webhook lifecycle matches V2's existing `subscriptionRegistry` exactly (Trello / HubSpot / Outlook all use this pattern).
- Polling Monday's `items_page` for new items would scale poorly across many boards.
- Monday webhooks don't expire — no renewal cron needed (no `subscription-watch` marker set).

**Recommendation: ACCEPT webhook architecture for all 5 triggers.**

### D-MON3 — `webhooks:write` scope visibility

The `webhooks:write` scope is in the OAuth consent screen. Users who DENY it can use actions but trigger activation will fail.

**Options:**
1. Mark `webhooks:write` REQUIRED. Users who deny lose the entire Monday integration.
2. Mark `webhooks:write` OPTIONAL. Users who deny can use actions; trigger activate throws a clean "missing scope" error.

**Recommendation: OPTION 1 (REQUIRED) for v1.** Simpler UX, no missing-scope edge cases, matches V1. The trigger-activation-time error path is harder to surface cleanly than the consent-screen prompt.

### D-MON4 — Soft-delete UX for `delete_item`

Monday's `delete_item` mutation is soft — items go to a 30-day "Deleted Items" view restorable only via Monday's UI. ChainReact has no restore API.

**Options:**
1. Treat as destructive (description warns about UI-only restore, destructive trio: high + isDestructive + requiresConfirmation).
2. Treat as recoverable (medium risk, no confirmation).

**Recommendation: OPTION 1.** Same as Gmail `delete_email` (Gmail's 30-day Trash). The 30-day restore window is operationally invisible to most workflow authors; treating as destructive is the safer default. Workflow authors who want non-destructive UX can use `archive_item` once it ships in MONDAY-N (archives are recoverable via API).

### D-MON5 — Resolver dep-name collision risk (mostly non-issue)

Monday's resolver dep names (`boardId`) don't collide because every action with multiple board-related fields uses distinct names (`targetGroupId` for move, `parentItemId` for subitem). Unlike OneNote's `copy_page` dual-hierarchy collision, Monday actions have a single primary board scope per action.

**Recommendation: NO ACTION needed.** Standard dep-name preservation works.

### D-MON6 — Subitem boardId opacity

Monday subitems live in a hidden "Subitems Board" that Monday auto-creates per-board. V1's `create_subitem` takes a `parentItemId` and Monday's API resolves the subitems-board automatically. V2 should mirror this — workflow authors don't see the subitems board id.

**Recommendation: ACCEPT.** `create_subitem` schema requires only `parentItemId` + `subitemName` + optional `columnValues`. The Monday API does the boardId resolution.

### D-MON7 — Column-value JSON UX

`update_item.columnValue` is Monday's typed JSON value for the column — text columns take a string, status columns take `{label: "Done"}`, person columns take `{personsAndTeams: [{id: 123, kind: "person"}]}`, etc. V1 surfaces this as a freeform `text` input.

**Options:**
1. Keep `text` input + description that links to Monday's column-value docs.
2. Use `textarea` for multi-line JSON.
3. Ship column-aware editor (out of scope per §8.4).

**Recommendation: OPTION 2 (textarea + JSON-shape examples in description).** Better UX than single-line text for complex column types. Column-aware editor is a polish slice.

---

## 10. Acceptance criteria for MONDAY-1

This slice is doc-only. Acceptance criteria:

- This file (`docs/slices/phase-3/monday-metadata-plan.md`) committed.
- No other source / test / config files modified.
- Gates green: `tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`. No new jest assertions; structural tests untouched.
- Dirty parallel-work files (`app/page.tsx`, `docs/rules/database-security.md`, `features/workflows/WorkflowsList.tsx`, `PACKAGES.md`, `scripts/list-users.mjs`, `scripts/reset-user-password.mjs`) remain unstaged.
- `docs/slices/phase-3/missing-providers-status.md` per-provider note for Monday remains "not started" — bookkeeping update lands in MONDAY-2.

---

## 11. Recommended next slice

**MONDAY-2 — Monday Runtime Port (10 actions).** Per §3, §4, §7. Ports the 10 V1 actions selected in D-MON1 + Zod schemas + shared GraphQL wrapper (`integrations/_shared/monday/api/_request.ts` + `errors.ts` + per-operation files) + manifest (`oauthFlows: ["v2"]`, `refreshable: true`, 11 scopes, `tokenScope: "user"`, `apiVersion: "2024-01"`, `capabilities.actions: true`, others false) + OAuth route + callback route + handler registry. Does NOT touch metas, resolvers, triggers, or `COVERED_PROVIDERS`. Expected scope: ~30 files; ~1 commit (or 2 split by sub-group if reviewer requests granularity).

**MONDAY-2 commit checklist:**
- [ ] `integrations/monday/manifest.ts`
- [ ] `integrations/monday/oauth.ts` + `services/oauth/dispatcher.ts` registration
- [ ] `app/api/integrations/monday/callback/route.ts`
- [ ] `integrations/_shared/monday/api/_request.ts` (GraphQL wrapper)
- [ ] `integrations/_shared/monday/errors.ts`
- [ ] `integrations/_shared/monday/api/{boardsList,boardsGet,groupsList,itemsList,itemsGet,itemsCreate,itemsUpdate,itemsDelete,itemsMove,subitemsCreate,updatesCreate,usersList,columnsList}.ts` (~13 wrapper files)
- [ ] `integrations/monday/actions/{createItem,updateItem,createUpdate,createSubitem,deleteItem,moveItem,getItem,listItems,listBoards,listUsers}.ts` (10 handler files)
- [ ] Per-handler `.schema.ts` (10 schema files)
- [ ] `services/execution/handlers/_registry.ts` — register all 10
- [ ] `integrations/_registry.ts` — manifest import
- [ ] Tests: ~20 schema + handler tests; ~5 GraphQL wrapper tests; OAuth test mirror
- [ ] No metadata, no resolvers, no triggers — those are MONDAY-3, MONDAY-4, MONDAY-5.

---

## 12. Out of scope for this slice

- Writing any Monday ActionMeta / TriggerMeta file.
- Writing any Monday OptionsSource resolver file.
- Writing any Monday runtime handler / schema / manifest.
- Writing any Monday OAuth callback / token-ingest flow.
- Writing any Monday webhook route / signature verification.
- Adding `monday` to `COVERED_PROVIDERS`.
- Touching the discovery / handlers / options-source / triggers registries.
- Resolving D-MON1 through D-MON7 (decisions, not code).
