# Parity audit — Notion

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/notion/`](../../integrations/notion/) (slice 9 Phase 1)
**Phase 1 surface shipped:** 7 actions (`create_page`, `update_page`, `query_database`, `create_database_entry`, `append_block_children`, `get_page`, `search`), 0 triggers (manifest `webhookTrigger: false` — deferred per Slice 9 §"Critical constraint: webhooks are manual-only").
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.
**Predecessor:** [`docs/slices/slice-9-notion.md`](slice-9-notion.md) (Phase 1 port — extensively documents the OAuth + property polymorphism + webhook constraint).

**Recommendation up front.** V1 ships **27 active actions** (5 page + 6 database + 2 comment + 2 user + 4 block + 3 unified + 5 granular) and **6 webhook-based triggers** (Notion's webhook subscriptions are configured manually through Notion's UI — no programmatic `POST /v1/webhooks` API exists). V2 ships **7 actions** and **0 triggers**. The gap is **~17–20 actions and all 6 triggers**, though much of the V1 action surface is wrappers for the same underlying Notion endpoints (e.g. `manage_page` is a 5-operation router covering create / update / archive / restore / find-or-create). Audit recommends **9 actions PORT** (small / clean increments), **5 actions PORT-WHEN-NEEDED** (chrome / niche), **2 actions SKIP** (V1 dead code / API-passthrough rot), **3 property types PORT** (multi_select / status / relation — the highest-impact deferred set), **2 property types PORT-WHEN-NEEDED** (people, files — require multi-step uuid resolution), **2 property types SKIP** (rollup, formula — read-only-computed-by-Notion). **6 triggers gate behind a single product decision** (manual-webhook UX vs polling vs skip permanently); slicing recommends one platform slice (`P-N1` manual-webhook setup UX) followed by a triggers slice if accepted. Three required platform gaps surface during port (P-N1 manual-webhook UX; P-N2 schema-aware property validation; P-N3 expanded block-types — all optional / on-demand). Recommended split: **3 parity slices** (Notion 2.1 expanded actions / Notion 2.2 expanded property + block types / Notion 2.3 manual-webhook triggers, conditional on product decision) totaling ~12–18 commits.

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/notion/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/index.ts) (683 lines) — assembles `notionNodes` from per-domain files; declares 6 trigger schemas inline.
- [`lib/workflows/nodes/providers/notion/page-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/page-actions.ts) — 5 page-action schemas.
- [`lib/workflows/nodes/providers/notion/database-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/database-actions.ts) — 6 database-action schemas.
- [`lib/workflows/nodes/providers/notion/comment-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/comment-actions.ts) — 2 comment-action schemas.
- [`lib/workflows/nodes/providers/notion/user-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/user-actions.ts) — 2 user-action schemas.
- [`lib/workflows/nodes/providers/notion/block-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/block-actions.ts) — 4 block-action schemas.
- [`lib/workflows/nodes/providers/notion/unified-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/unified-actions.ts) — 7 schemas; 4 are filtered out by `index.ts` (replaced by per-domain files), leaving 3 actively listed.
- [`lib/workflows/nodes/providers/notion/actions/*.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/actions/) — 6 granular schemas (`listPageContent`, `appendPageContent`, `deletePageContent`, `searchObjects`, `makeApiCall`, plus the orphaned `getPageContent.schema.ts` whose import is removed in `index.ts`).
- [`lib/workflows/nodes/providers/notion/comprehensive-actions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/comprehensive-actions.ts) — referenced but no longer imported (orphan).

### Action handlers

- [`lib/workflows/actions/notion/handlers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/handlers.ts) — **3,041 LOC kitchen-sink dispatcher.** ~30 exported action functions in one file. Includes inline `formatNotionPropertyValue` switch (covers 13 property types) and inline `buildFilterForProperty` switch.
- [`lib/workflows/actions/notion/managePage.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/managePage.ts) — 613 lines; 5-operation page router (create / update / archive / restore / find-or-create).
- [`lib/workflows/actions/notion/manageDatabase.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/manageDatabase.ts) — 532 lines; 6-operation database router.
- [`lib/workflows/actions/notion/manageBlocks.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/manageBlocks.ts) — 130 lines; block CRUD router.
- [`lib/workflows/actions/notion/manageComments.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/manageComments.ts) — 140 lines; comment create + list.
- [`lib/workflows/actions/notion/manageUsers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/manageUsers.ts) — 288 lines; user list + retrieve.
- [`lib/workflows/actions/notion/updateDatabaseSchema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/updateDatabaseSchema.ts) — 112 lines; add/remove/modify database properties.
- [`lib/workflows/actions/notion/advancedQuery.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/advancedQuery.ts) — 103 lines; JSON-filter query builder.
- [`lib/workflows/actions/notion/getPageProperty.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/getPageProperty.ts) — 64 lines.
- [`lib/workflows/actions/notion/getPageDetails.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/getPageDetails.ts) — 273 lines.
- [`lib/workflows/actions/notion/pageActions.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/pageActions.ts) — 659 lines.
- [`lib/workflows/actions/notion/databasePropertyTypes.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/databasePropertyTypes.ts) — 416 lines; per-property metadata (type → option shape, format hints, validation rules).
- [`lib/workflows/actions/notion/dataSourceCache.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/dataSourceCache.ts) — in-memory cache of database structures.
- [`lib/workflows/actions/notion/schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/schema.ts) + [`schemas.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/schemas.ts) — handler-side schema declarations (separate from node-level schemas).

### Triggers / webhook lifecycle

- 6 trigger schemas inline in `index.ts` lines 100–303 (`notion_trigger_new_comment`, `notion_trigger_database_item_created`, `notion_trigger_database_item_updated`, `notion_trigger_page_content_updated`, `notion_trigger_page_properties_updated`, `notion_trigger_database_schema_updated`).
- [`lib/triggers/providers/NotionTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/NotionTriggerLifecycle.ts) (~250 lines) — activation writes to `trigger_resources` with `status: 'active'`, builds per-workflow webhook URL, fetches `data_source_id` via Notion's `2025-09-03` API, logs setup instructions for the user. **Manual UX — no programmatic webhook create.**
- [`app/api/webhooks/notion/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/notion/route.ts) (~426 lines) — receive endpoint. Parses both legacy `{type:"url_verification", token, challenge}` and current `{verification_token}` shapes. Stores token in `trigger_resources.metadata.verificationToken`. Validates `X-Notion-Signature` HMAC-SHA256 against the stored token. Dispatches via `processNotionEvent`.

### OAuth + integration config

- [`lib/integrations/oauthConfig.ts:449-461`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L449) — Notion OAuth config (HTTP Basic auth on token exchange, no PKCE, no refresh token).
- Generic dynamic-route callback at [`app/api/integrations/[id]/callback/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/[id]/callback/route.ts).
- [`app/api/integrations/notion/data/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/notion/data/) — 16 data-loader handlers (`databases.ts`, `databaseFields.ts`, `databaseItems.ts`, `databaseMetadata.ts`, `databaseProperties.ts`, `databaseRows.ts`, `pages.ts`, `pageBlocks.ts`, `pageBlocksDeletable.ts`, `pageBlocksSelectable.ts`, `pageDetails.ts`, `teamspaces.ts`, `templates.ts`, `users.ts`, `workspaces.ts`) for the UI's combobox / select dynamic options. Not action handlers — UX support.
- [`app/api/integrations/notion/debug/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/notion/debug/route.ts) + [`/test/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/notion/test/route.ts) — internal debug routes; not parity surface.

### Tests / docs / learning notes

- V1: 0 unit tests under `__tests__/notion/` (Notion was historically under-tested in V1).
- V1: extensive learning notes — `learning/docs/notion-webhook-manual-setup.md` (2025-10-17), `learning/docs/notion-integration-gap-analysis.md` (2025-11-29).
- V1: [`app/api/workflows/notion/search-pages-preview/route.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/workflows/notion/search-pages-preview/route.ts) — preview helper for the builder UI.

---

## 2. V1 actions inventory

**27 active actions** (excluding deprecated commented-out duplicates in `index.ts` lines 317+).

### Page actions (5 — `page-actions.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_create_page` | `pageActions.ts` + handlers.ts | Page in database OR workspace root. Optional icon / cover / template / multi-property setting / block content. |
| `notion_action_update_page` | `pageActions.ts` + handlers.ts | Update properties + optional archived flag. |
| `notion_action_append_to_page` | `pageActions.ts` | Append block content to an existing page. **Functionally overlaps with `append_block_children` and `append_page_content` granular.** |
| `notion_action_duplicate_page` | `pageActions.ts` | Clone an existing page + properties. Notion API does NOT have a direct duplicate endpoint — V1 implements as create + iterative copy. |
| `notion_action_get_page_details` | `getPageDetails.ts` | Fetch page + properties; V1 keeps the children-walk separate. |

### Database actions (6 — `database-actions.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_create_database` | `manageDatabase.ts` | Create new database (top-level or under page). |
| `notion_action_update_database_info` | `manageDatabase.ts` | Update database title / description / icon / cover. |
| `notion_action_update_database_item` | `manageDatabase.ts` | Subset of `update_page` for items in databases. **Functionally overlaps with `update_page`.** |
| `notion_action_archive_database_item` | `manageDatabase.ts` | Soft-archive a database row. |
| `notion_action_restore_database_item` | `manageDatabase.ts` | Restore archived database row. |
| `notion_action_find_or_create_item` | `manageDatabase.ts` | Look up by property value; create if missing. Composes `query_database` + `create_database_entry`. |

### Comment actions (2 — `comment-actions.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_create_comment` | `manageComments.ts` | Create comment on page OR existing discussion thread. |
| `notion_action_list_comments` | `manageComments.ts` | List comments on a page or block. |

### User actions (2 — `user-actions.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_get_user` | `manageUsers.ts` | Single user lookup by id. |
| `notion_action_list_users` | `manageUsers.ts` | List workspace users (paginated). |

### Block actions (4 — `block-actions.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_add_block` | `manageBlocks.ts` | Append a single block to a page or block. **Functionally overlaps with `append_block_children`.** |
| `notion_action_get_block` | `manageBlocks.ts` | Fetch a single block by id. |
| `notion_action_get_block_children` | `manageBlocks.ts` | List immediate children of a block. **Functionally overlaps with `list_page_content`.** |
| `notion_action_get_page_with_children` | `manageBlocks.ts` | Recursive page + children walk; potentially large response. |

### Unified actions (3 — `unified-actions.ts`, post-filter)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_advanced_query` | `advancedQuery.ts` | Database filter builder (JSON-shape). V1 exposes a custom UI for constructing the Notion filter object. |
| `notion_action_get_page_property` | `getPageProperty.ts` | Fetch one property value from a page. **Subset of `get_page` output.** |
| `notion_action_update_database_schema` | `updateDatabaseSchema.ts` | Add / remove / modify database properties (column-level schema mutation). |

The other 4 unified actions (`manage_page`, `manage_database`, `manage_blocks`, `manage_comments`, `manage_users`) are filtered out of `notionNodes` per `index.ts:81–87` because they were replaced by the per-domain action arrays above. They remain as commented-out / legacy code paths but **do not appear in the workflow builder.**

### Granular actions (5 — `actions/*.schema.ts`)

| V1 type | Backing handler | Notes |
|---|---|---|
| `notion_action_list_page_content` | granular schema; handler in handlers.ts | List blocks on a page (paginated). |
| `notion_action_append_page_content` | granular schema; handler in handlers.ts | Append block content (typed). **Functionally overlaps with `add_block` and `append_to_page`.** |
| `notion_action_delete_page_content` | granular schema; handler in handlers.ts | Delete (archive) specific blocks. |
| `notion_action_search` | granular schema; handler in handlers.ts | Search pages and databases globally. **Subsumed by V2's `search` action shipped in Phase 1.** |
| `notion_action_api_call` | `makeApiCall.schema.ts` + handler in handlers.ts | **Escape hatch — passes raw method / path / body / headers to Notion API.** A V1 generic-passthrough that exists to compensate for action gaps. |

### Deprecated orphans (in `index.ts` lines 317+, NOT in `notionNodes`)

`notion_action_create_page` (old version), `notion_action_append_to_page` (old version), `notion_action_create_database` (old version), `notion_action_search_pages` (old version), `notion_action_update_page` (old version) — all kept as commented-out documentation references in `index.ts`. Not in the active manifest.

---

## 3. V1 triggers inventory

**6 active triggers** — all `webhookBased: true`, all gated by Notion's manual webhook setup constraint.

| V1 type | Slack-equivalent eventType candidate | Notes |
|---|---|---|
| `notion_trigger_new_comment` | `notion.comment.created` (proposed) | Filters: all comments / specific database / specific page. |
| `notion_trigger_database_item_created` | `notion.page.created` (where parent is database) | Filter: target database. Required field. |
| `notion_trigger_database_item_updated` | `notion.page.updated` (where parent is database) | Filters: any update / properties only / content only. |
| `notion_trigger_page_content_updated` | `notion.page.content_updated` | Filter: specific page or all pages. |
| `notion_trigger_page_properties_updated` | `notion.page.properties_updated` | Filter: specific page; optional watch-specific-properties list. |
| `notion_trigger_database_schema_updated` | `notion.database.schema_updated` | Filter: specific database or all databases. |

### Webhook lifecycle constraint (verified)

**Both V1's audit and a fresh check of `developers.notion.com/reference/webhooks` confirm: Notion does not expose `POST /v1/webhooks` or any other programmatic webhook subscription endpoint.** Webhooks are created in Notion's integration settings UI at `notion.so/my-integrations → [integration] → Webhooks → + Create a subscription`. The verification handshake is two-phase:

1. **Phase 1 (manual):** Notion POSTs `{ verification_token: "..." }` to the configured URL. The receiving system surfaces the token to the user; the user pastes it back into Notion's UI to complete subscription verification.
2. **Phase 2 (live):** Notion sends events with `X-Notion-Signature: sha256=<hex>` over the raw body, HMAC-SHA256 keyed with the verification_token.

V1's [route](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/webhooks/notion/route.ts) supports both legacy `{type:"url_verification", token, challenge}` and current `{verification_token}` shapes; signature validation lives at `validateNotionSignature` (lines 40–95) and uses `crypto.timingSafeEqual`. Per-workflow routing reads `workflowId` + `nodeId` from URL query string — **the user is responsible for setting this up correctly in Notion's UI** during the manual subscription flow.

---

## 4. V2 current surface

### Actions (7 — shipped in Slice 9 Phase 1)

| V2 type | Source file | V1 equivalent |
|---|---|---|
| `create_page` | [`integrations/notion/actions/createPage.ts`](../../integrations/notion/actions/createPage.ts) | V1 `manage_page` (op=create) + `notion_action_create_page` |
| `update_page` | [`integrations/notion/actions/updatePage.ts`](../../integrations/notion/actions/updatePage.ts) | V1 `manage_page` (op=update) + `notion_action_update_page` |
| `query_database` | [`integrations/notion/actions/queryDatabase.ts`](../../integrations/notion/actions/queryDatabase.ts) | V1 `manage_database` (op=query) |
| `create_database_entry` | [`integrations/notion/actions/createDatabaseEntry.ts`](../../integrations/notion/actions/createDatabaseEntry.ts) | V1 `manage_database` (op=create) |
| `append_block_children` | [`integrations/notion/actions/appendBlockChildren.ts`](../../integrations/notion/actions/appendBlockChildren.ts) | V1 `add_block` + `append_to_page` + `append_page_content` (3-way overlap) |
| `get_page` | [`integrations/notion/actions/getPage.ts`](../../integrations/notion/actions/getPage.ts) | V1 `get_page_details` |
| `search` | [`integrations/notion/actions/search.ts`](../../integrations/notion/actions/search.ts) | V1 `search_objects` |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) as the 7 entries listed above.

### Triggers

**Zero.** Manifest declares `webhookTrigger: false`, `pollingTrigger: false`. Per Slice 9 §"Critical constraint: webhooks are manual-only" — deferred pending product decision on UX shape (manual-webhook setup page vs polling fallback vs skip).

### Manifest + OAuth

[`integrations/notion/manifest.ts`](../../integrations/notion/manifest.ts):
- `tokenScope: "workspace"` (one integration per `(user, bot_id)`).
- `accountIdField: "bot_id"`.
- `apiVersion: "2022-06-28"` (Slice 9 Batch 1 — `2025-09-03` API version reserved for the trigger slice if it lands; introduces `data_source_id` distinct from `database_id`).
- `refreshable: false` (Notion does not issue refresh tokens; `refreshToken()` throws `RefreshNotSupportedError`).
- `healthCheckIntervalMs: 12h`.
- `scopes.required: ["read_content", "update_content", "insert_content"]` — declarative metadata (Notion's authorize URL does not take a `scope` parameter; capability scopes are configured in the Notion integration's developer-portal settings).

### Property polymorphism

[`integrations/_shared/notion/properties.ts`](../../integrations/_shared/notion/properties.ts):
- **9 supported:** `title`, `rich_text`, `number`, `select`, `checkbox`, `date`, `url`, `email`, `phone_number`.
- **7 deferred:** `relation`, `people`, `files`, `rollup`, `formula`, `multi_select`, `status` — explicit `UnsupportedPropertyTypeError` on coercion attempts.

### Block types

[`integrations/_shared/notion/blocks.ts`](../../integrations/_shared/notion/blocks.ts):
- **9 supported:** `paragraph`, `heading_1`, `heading_2`, `heading_3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `quote`, `divider`.
- **10 deferred:** `code`, `image`, `embed`, `callout`, `toggle`, `column_list`, `table`, `child_database`, `child_page`, `synced_block` — explicit `UnsupportedBlockTypeError`.

### API wrappers

[`integrations/notion/api/`](../../integrations/notion/api/) — 5 files: `_request.ts`, `blocks.ts`, `databases.ts`, `pages.ts`, `search.ts`. Plus [`integrations/_shared/notion/api/`](../../integrations/_shared/notion/api/) — `_base.ts`, `errors.ts`.

### Tests

- 15 unit test files at [`tests/unit/integrations/notion/`](../../tests/unit/integrations/notion/).
- 1 e2e walkthrough at [`tests/e2e/slice-9-notion-walkthrough.spec.ts`](../../tests/e2e/slice-9-notion-walkthrough.spec.ts).

---

## 5. Missing actions

**~17–20 V1 actions not yet ported.** Sorted by audit-recommended priority (see §7 for full classification).

### High-value gaps (recommend Notion 2.1)

| V1 type | V2 proposed type | Why it's high-value |
|---|---|---|
| `notion_action_archive_database_item` | `archive_page` (treats database items as pages) | Common "mark this row as done / hidden" workflow. Notion API exposes via `PATCH /v1/pages/{id}` with `archived: true`. Two-line handler. |
| `notion_action_restore_database_item` | `restore_page` | Inverse of archive. Same endpoint. |
| `notion_action_get_user` | `get_user` | Single user lookup by id. Needed for any people-property workflow. |
| `notion_action_list_users` | `list_users` | Workspace user list (paginated). Composes with `get_user` for filter workflows. |
| `notion_action_create_comment` | `create_comment` | High-value workflow integration ("post a comment when X happens"). |
| `notion_action_list_comments` | `list_comments` | Pairs with `create_comment`. |
| `notion_action_create_database` | `create_database` | Useful for templated workflow setup (rare but high-leverage). |
| `notion_action_get_block` | `get_block` | Read a single block — needed for fine-grained content workflows. |
| `notion_action_get_block_children` | `get_block_children` | List immediate children. **Functionally overlaps with `list_page_content`; ship one canonical version.** |

### Medium-value gaps (recommend Notion 2.2 or on demand)

| V1 type | V2 proposed type | Why it's medium-value |
|---|---|---|
| `notion_action_update_database_info` | `update_database` | Update database title / description / icon / cover. Rare in workflows; ship if a use case surfaces. |
| `notion_action_delete_page_content` | `delete_blocks` | Archive specific blocks. Notion's API requires per-block `DELETE /v1/blocks/{id}` calls. |
| `notion_action_duplicate_page` | `duplicate_page` | Clone page + properties. **High-effort** — Notion API has no direct duplicate; V1 implements as `get_page` + `create_page` + iterative `append_block_children` walk. Multi-step orchestration. |
| `notion_action_get_page_with_children` | `get_page_with_children` | Recursive page walk. Cost-sensitive (Notion charges 1 API call per block-children fetch). |
| `notion_action_advanced_query` | (subsume into `query_database` filter param) | V2's `query_database` already forward-passes a `filter` object verbatim. V1's "advanced query" was a UI builder — that's V2 design-time concern, not a separate action. **Recommend collapsing into existing action.** |
| `notion_action_find_or_create_item` | (recipe / docs only) | Functionally `query_database` + `create_database_entry`. Workflow authors compose. **Recommend NOT shipping as a separate action** — it's a UX shortcut V1 added because composition was awkward in V1's builder; V2's variable resolution makes the composition path natural. |

### Low-value / skip candidates

| V1 type | Audit recommendation |
|---|---|
| `notion_action_make_api_call` (escape hatch) | **SKIP.** V1 ships a raw-passthrough API call because V1's action surface had gaps. V2's surface should grow per real need; a generic-passthrough invites workflow authors to use undocumented Notion endpoints without versioning safety. |
| `notion_action_update_database_schema` | **PORT-WHEN-NEEDED.** Database schema mutation (add/remove/rename columns) is rare in workflows and high-stakes. Defer pending a real use case. |
| `notion_action_get_page_property` | **SKIP** (subset of `get_page`). |
| `notion_action_append_to_page` | **SKIP** (duplicate of `append_block_children`). |
| `notion_action_append_page_content` | **SKIP** (duplicate of `append_block_children`). |
| `notion_action_add_block` | **SKIP** (subset of `append_block_children` with `children: [oneBlock]`). |
| `notion_action_update_database_item` | **SKIP** (duplicate of `update_page` — database items ARE pages). |
| `notion_action_list_page_content` | **PORT-OR-CONSOLIDATE.** Functionally `get_block_children` for a page parent. Ship one canonical version (recommend `get_block_children`). |
| `notion_action_search` (granular) | **ALREADY PORTED** as V2 `search`. V1's was a synonym. |

### Property type gaps

V2 currently supports 9 of 16 Notion property types. Deferred:

| Type | V2 status | Audit recommendation |
|---|---|---|
| `multi_select` | deferred | **PORT.** Common in databases (tags, categories). Validation against database schema can be deferred — accept array-of-string at input, let Notion enforce option-set membership. |
| `status` | deferred | **PORT.** Same as multi_select but single-value with a status group. Accept string at input. |
| `relation` | deferred | **PORT.** Common (linking rows across databases). Requires `database_id` resolution but the wire-format itself is `{ relation: [{ id: pageId }] }` — straightforward once we accept page-ids verbatim from upstream nodes. |
| `people` | deferred | **PORT-WHEN-NEEDED.** Wire-format: `{ people: [{ id: userId }] }`. Needs `list_users` shipped first (so user-ids can be resolved). |
| `files` | deferred | **PORT-WHEN-NEEDED.** Notion's files are URLs (external) or upload-via-API; latter requires P-S3-style FileRef integration. Defer until a real use case surfaces. |
| `rollup` | deferred | **SKIP.** Computed by Notion; not writable. Only outbound read makes sense, and `get_page` already returns the raw wire-format under `properties.<name>.rollup`. |
| `formula` | deferred | **SKIP.** Same reasoning as `rollup`. |

### Block type gaps

V2 currently supports 9 of 19 Notion block types. Deferred:

| Type | Audit recommendation |
|---|---|
| `code` | **PORT** (common; needs `language` discriminator field). |
| `image` | **PORT** (common; needs external URL OR P-S3 FileRef integration). |
| `callout` | **PORT** (common; needs `icon` + rich-text). |
| `toggle` | **PORT** (common; rich-text + children). |
| `embed` | **PORT-WHEN-NEEDED**. |
| `column_list` | **PORT-WHEN-NEEDED** (complex; nested column blocks). |
| `table` | **PORT-WHEN-NEEDED** (complex; rows × cells). |
| `child_database` | **SKIP** (creating a database inline is `create_database`, not block append). |
| `child_page` | **SKIP** (creating a page inline is `create_page`, not block append). |
| `synced_block` | **SKIP** (niche; rare in workflow contexts). |

---

## 6. Missing triggers

**All 6 V1 triggers are missing in V2** — gated by the manual-webhook constraint described in §3.

| # | V1 Trigger | Slack-equivalent canonical eventType (proposed) | Per-trigger filter needed | Notes |
|---|---|---|---|---|
| 1 | `notion_trigger_new_comment` | `notion.comment.created` | filterType=all/database/page + optional database/page | Most-useful generic trigger. |
| 2 | `notion_trigger_database_item_created` | `notion.page.created` (parent.type==database_id) | databaseId required | Common "new row in this database" trigger. |
| 3 | `notion_trigger_database_item_updated` | `notion.page.updated` (parent.type==database_id) | databaseId required + updateType filter | High-effort because Notion's payload doesn't include diffs — V2 would need to fetch + cache previous-state to detect "properties only" vs "content only" changes. |
| 4 | `notion_trigger_page_content_updated` | `notion.page.content_updated` | optional pageId filter | Same diff-detection complexity. |
| 5 | `notion_trigger_page_properties_updated` | `notion.page.properties_updated` | optional pageId + watch-specific-properties list | Same complexity. |
| 6 | `notion_trigger_database_schema_updated` | `notion.database.schema_updated` | optional databaseId filter | Niche; rarely actioned in workflows. |

**Plus dead-code emit risk:** Notion delivers many event types beyond these 6 (per their docs: `comment.created`, `comment.deleted`, `page.created`, `page.updated`, `page.deleted`, `database.created`, `database.updated`, `database.deleted`, `database.schema.updated`). V2's normalizer (when shipped) should emit `notion.<event.type>` and only register filters for the 6 V1-baselined triggers initially; unmatched event types drop with `matched=0` like Slack's pattern.

---

## 7. Port / skip / defer table

Decisions per item from §5 + §6. Reasoning cites master-plan rot IDs (R1..R14) where applicable.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `archiveDatabaseItem` | action | **port** (Notion 2.1) | Two-line handler (`PATCH /v1/pages/{id}` with `archived: true`). High-leverage common workflow. |
| `restoreDatabaseItem` | action | **port** (Notion 2.1) | Inverse of archive. Identical endpoint shape. |
| `getUser` | action | **port** (Notion 2.1) | Single user lookup; needed for people-property workflows. |
| `listUsers` | action | **port** (Notion 2.1) | Pairs with `getUser`. Pagination support. |
| `createComment` | action | **port** (Notion 2.1) | Common "post comment when X happens" pattern. |
| `listComments` | action | **port** (Notion 2.1) | Pairs with `createComment`. |
| `createDatabase` | action | **port** (Notion 2.1) | Template / setup workflows. Low-frequency, high-leverage. |
| `getBlock` | action | **port** (Notion 2.1) | Fine-grained block read. |
| `getBlockChildren` | action | **port** (Notion 2.1) | List blocks; subsumes V1's `list_page_content`. |
| `updateDatabaseInfo` | action | **port** (Notion 2.2 on demand) | Rare in workflows. |
| `deleteBlocks` | action | **port** (Notion 2.2 on demand) | Niche; Notion API requires per-block DELETE. |
| `duplicatePage` | action | **port** (Notion 2.2 on demand) | High-effort multi-step orchestration; defer until use case proven. |
| `getPageWithChildren` | action | **port** (Notion 2.2 on demand) | Recursive walk; cost-sensitive. |
| `advancedQuery` | action | **fold into `query_database`** | V2's `query_database` already accepts a verbatim `filter` object. V1's "advanced query" was a builder UI; V2 design-time concern, not separate action. |
| `findOrCreateItem` | action | **skip — recipe only** | Functionally `query_database` + `create_database_entry`. Document in workflow templates rather than ship as a wrapper. |
| `make_api_call` (escape hatch) | action | **skip** | Generic passthrough; invites undocumented endpoint use. V2 fills gaps through targeted ports. |
| `updateDatabaseSchema` | action | **defer** | Database column mutation; rare + high-stakes; ship on demand. |
| `getPageProperty` | action | **skip** | Subset of `get_page`. |
| `appendToPage` | action | **skip** | Duplicate of `append_block_children`. |
| `appendPageContent` (granular) | action | **skip** | Duplicate of `append_block_children`. |
| `addBlock` | action | **skip** | Subset of `append_block_children`. |
| `updateDatabaseItem` | action | **skip** | Duplicate of `update_page` (database items ARE pages). |
| `listPageContent` (granular) | action | **fold into `getBlockChildren`** | Same Notion endpoint. |

**Action totals: 9 PORT (Notion 2.1), 4 PORT-WHEN-NEEDED (Notion 2.2), 2 PORT-DEFERRED, 8 SKIP/CONSOLIDATE, 1 ESCAPE-HATCH SKIP.**

### Property types

| Type | Recommendation | Reasoning |
|---|---|---|
| `multi_select` | **port** (Notion 2.2) | High demand; wire-format is `{ multi_select: [{ name: "tag" }] }`. Accept array-of-string at input. |
| `status` | **port** (Notion 2.2) | Wire-format: `{ status: { name: "in_progress" } }`. Accept string. Same option-set caveat as multi_select. |
| `relation` | **port** (Notion 2.2) | Wire-format: `{ relation: [{ id: pageId }] }`. Accept page-id strings. |
| `people` | **port-when-needed** (Notion 2.2 if `list_users` accepted) | Wire-format: `{ people: [{ id: userId }] }`. Pairs with `list_users`. |
| `files` | **port-when-needed** | External URL or upload-via-API; latter requires FileRef integration (P-S3 pattern). Defer. |
| `rollup` | **skip** | Read-only; computed by Notion. `get_page` already returns raw wire-format. |
| `formula` | **skip** | Same as rollup. |

**Property totals: 3 PORT (multi_select, status, relation), 2 PORT-WHEN-NEEDED (people, files), 2 SKIP (rollup, formula).**

### Block types

| Type | Recommendation | Reasoning |
|---|---|---|
| `code` | **port** (Notion 2.2) | Common; `{ language, rich_text }`. |
| `image` | **port** (Notion 2.2) | Common; external URL accepted today, FileRef path follows P-S3 once a use case surfaces. |
| `callout` | **port** (Notion 2.2) | Common; `{ icon, rich_text }`. |
| `toggle` | **port** (Notion 2.2) | Common; rich-text + children blocks. |
| `embed` | **port-when-needed** | URL embed. |
| `column_list` | **port-when-needed** | Nested column blocks; complex. |
| `table` | **port-when-needed** | Rows × cells; complex. |
| `child_database` | **skip** | Use `create_database` instead. |
| `child_page` | **skip** | Use `create_page` instead. |
| `synced_block` | **skip** | Niche. |

**Block totals: 4 PORT (code, image, callout, toggle), 3 PORT-WHEN-NEEDED (embed, column_list, table), 3 SKIP (child_database, child_page, synced_block).**

### Triggers

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `newComment` | trigger | **port — needs product decision on UX shape** | Most-useful generic trigger. Gated by P-N1 (manual-webhook setup UX) — product decision required before slice 2.3 starts. |
| `databaseItemCreated` | trigger | **port — needs product decision on UX shape** | Common pattern. Same gate. |
| `databaseItemUpdated` | trigger | **port — needs design** | Diff-detection complexity (Notion payload lacks per-property diffs). Ship initially WITHOUT updateType filter; let workflow authors branch downstream. |
| `pageContentUpdated` | trigger | **port — needs design** | Same diff-detection caveat. |
| `pagePropertiesUpdated` | trigger | **port — needs design** | Same. `watchProperties` filter requires per-trigger config-driven diff. |
| `databaseSchemaUpdated` | trigger | **port-when-needed** | Niche; rarely actioned. Defer to second triggers slice. |

**Trigger totals: 5 PORT (gated by P-N1), 1 PORT-WHEN-NEEDED.**

### Summary counts

- **Port (Notion 2.1):** 9 actions
- **Port (Notion 2.2):** 4 actions + 3 properties + 4 block types
- **Port-when-needed:** 4 actions + 2 properties + 3 block types
- **Port-deferred:** 2 actions (`updateDatabaseSchema` + `databaseSchemaUpdated` trigger)
- **Skip / consolidate / fold-into-existing:** 9 actions + 2 properties + 3 block types
- **Trigger work:** 5 ports gated by P-N1 + 1 port-when-needed
- **Total new V2 surface if all PORT decisions accepted:** **~17 actions + 5 properties + 7 block types + 6 triggers (+ P-N1 platform slice).**

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 catalog. Each row tagged with the master-plan rot ID where the pattern matches.

| ID | Finding | V1 location | V2 mitigation |
|---|---|---|---|
| **N-R1** (cites R1) | **3,041-line `handlers.ts` monolith** — 30 exported action functions in one file. Inline `formatNotionPropertyValue` 76-line switch at lines 43–119. Inline `buildFilterForProperty` switch at 121–169. Each action repeats `getDecryptedAccessToken` + raw fetch + try/catch boilerplate. | `lib/workflows/actions/notion/handlers.ts` | V2 already split per-action under `integrations/notion/actions/*.ts`; property polymorphism extracted to `_shared/notion/properties.ts`. **Already mitigated in Slice 9.** Don't regress when adding new actions. |
| **N-R2** (cites R5) | **Orphaned `manage_*` unified actions** filtered out at manifest assembly time. `unified-actions.ts` exports 7 actions; `index.ts:81-87` filters out 4 (manage_page, manage_database, manage_blocks, manage_comments, manage_users) because they were replaced by per-domain files. The orphan handlers in `handlers.ts` still exist as dead code. | `lib/workflows/nodes/providers/notion/unified-actions.ts` + `lib/workflows/actions/notion/handlers.ts` | V2 ships per-action only; no `manage_*` router actions. |
| **N-R3** (cites R5) | **Deprecated commented-out action schemas** in `index.ts:317+` (~300 lines of commented `notion_action_create_page`, `notion_action_append_to_page`, `notion_action_create_database`, `notion_action_search_pages`, `notion_action_update_page`). Dead documentation. | `lib/workflows/nodes/providers/notion/index.ts:317+` | V2 doesn't carry the dead code. |
| **N-R4** (cites R5) | **`getPageContent.schema.ts` orphan** — schema file exists at `actions/getPageContent.schema.ts` but the import is explicitly removed in `index.ts:27` ("NOTE: getPageContentActionSchema removed - duplicate of listPageContentActionSchema"). Schema file remains as dead code. | `lib/workflows/nodes/providers/notion/actions/getPageContent.schema.ts` | V2 doesn't ship the dead schema. |
| **N-R5** | **`make_api_call` escape hatch.** V1 ships a generic raw-passthrough action (`notion_action_api_call`) accepting method / path / body / headers. Invites workflow authors to use undocumented Notion endpoints without versioning safety. | `lib/workflows/nodes/providers/notion/actions/makeApiCall.schema.ts` + handler in `handlers.ts` | V2 does NOT port. Fill action gaps through targeted ports per audit §7. |
| **N-R6** | **`databasePropertyTypes.ts` (416 LOC) + `dataSourceCache.ts` in-memory cache** — V1 maintains a per-property metadata table (type → option-set shape, format hints, validation rules) and an in-memory cache of database structures for UI-side validation. Coupling design-time validation to runtime handler load. | `lib/workflows/actions/notion/databasePropertyTypes.ts` + `dataSourceCache.ts` | V2 does NOT port. Property validation happens at action-handler `formatPropertyValue` / `parsePropertyValue`; design-time validation belongs to the builder UI (Phase 3 concern, not parity). |
| **N-R7** | **V1's `manage_*` 5-operation routers** in `managePage.ts` (613 LOC) and `manageDatabase.ts` (532 LOC). Each carries 5 distinct operation paths (create / update / archive / restore / find-or-create for pages; create / query / update / archive / restore / find-or-create for databases). Hard to test in isolation; hard to discover via search. | `lib/workflows/actions/notion/managePage.ts` + `manageDatabase.ts` | V2 splits each operation into its own typed action (`create_page` / `update_page` / future `archive_page` / `restore_page`). One action = one Notion endpoint. |
| **N-R8** | **Two API versions in parallel** — `2022-06-28` for OAuth + most actions, `2025-09-03` for the trigger lifecycle's `data_source_id` detection. V1 maintains both. | `lib/triggers/providers/NotionTriggerLifecycle.ts` references `2025-09-03` | V2 currently uses `2022-06-28` exclusively. Trigger slice (if accepted) will need to decide whether `2025-09-03` is necessary for the in-scope triggers (Slice 9 §6 #6 noted it's relevant only for triggers, but worth verifying at port-time). |
| **N-R9** | **Webhook route's verbose color-logged logging** — `app/api/webhooks/notion/route.ts` has 12 lines of ANSI-color constants and a `logSection` helper. Aesthetic, not functional. Plus `validateNotionSignature` reads from `trigger_resources.metadata.verificationToken` via Supabase client per request — should batch / cache when the volume warrants. | `app/api/webhooks/notion/route.ts:17-33` | V2 port (when it lands) uses structured logging via V2's `logger`. Per-request DB read is acceptable for V2's expected volume but worth noting. |
| **N-R10** | **Per-workflow URL routing depends on user UI action.** V1's webhook route reads `workflowId` + `nodeId` from URL query string. User MUST configure the URL correctly in Notion's UI for routing to work. No protection against typos. | `app/api/webhooks/notion/route.ts` | V2 port should keep query-string routing (it's the only way Notion can deliver per-workflow) but consider validating that the workflow + node exist before processing the verification handshake — surface a clear error if the URL is wrong. |
| **N-R11** | **Inline `formatNotionPropertyValue` switch covering 13 property types** at `handlers.ts:43-119`. V2's typed property polymorphism in `_shared/notion/properties.ts` covers 9 of those 13 with explicit deferred-error throws on the rest. Migration is incremental per audit §7 property table. | `lib/workflows/actions/notion/handlers.ts:43-119` | V2 already mitigated for 9 types. Notion 2.2 ports add 3 more (multi_select, status, relation); 2 stay deferred (people, files for now); 2 stay permanently skipped (rollup, formula). |

---

## 9. V2 dependency map

Every ported action depends on (existing V2 contracts):

- [`contracts/integration.ts`](../../contracts/integration.ts) — `ProviderManifest`, `ProviderOAuth`, `ActionResult`.
- [`contracts/triggerEvent.ts`](../../contracts/triggerEvent.ts) — `TriggerEvent`, `TriggerEventSchema` (relevant for trigger slice).
- [`services/execution/handlers/types.ts`](../../services/execution/handlers/types.ts) — `ActionHandler` shape.
- [`repositories/integrations.ts`](../../repositories/integrations.ts) — `getActiveForExecution(userId, provider, accountId)`.
- [`core/encryption/tokens.ts`](../../core/encryption/tokens.ts) — `decryptToken`.
- [`services/oauth/refreshAndRetry.ts`](../../services/oauth/refreshAndRetry.ts) — wraps Notion API calls; surfaces `IntegrationActionRequiredError(reason: "refresh_not_supported")` on 401 (Notion's non-refreshable token path).
- [`integrations/_shared/notion/properties.ts`](../../integrations/_shared/notion/properties.ts) — property polymorphism (extends when porting new types).
- [`integrations/_shared/notion/blocks.ts`](../../integrations/_shared/notion/blocks.ts) — block-type polymorphism (extends when porting new types).
- [`integrations/_shared/notion/api/_base.ts`](../../integrations/_shared/notion/api/_base.ts) + [`api/errors.ts`](../../integrations/_shared/notion/api/errors.ts) — Notion API base + error shapes.

### Per-handler-batch additional dependencies

- **Page lifecycle batch (Notion 2.1, 2 actions):** `archive_page`, `restore_page` — none beyond core. Both are simple `PATCH /v1/pages/{id}` with `archived` boolean.
- **Users batch (Notion 2.1, 2 actions):** `get_user`, `list_users` — Notion `/v1/users/{id}` + `/v1/users` endpoints. No new platform deps.
- **Comments batch (Notion 2.1, 2 actions):** `create_comment`, `list_comments` — Notion `/v1/comments` endpoints. No new platform deps.
- **Databases / blocks batch (Notion 2.1, 3 actions):** `create_database`, `get_block`, `get_block_children` — Notion endpoints; no new deps.
- **Property polymorphism extension (Notion 2.2, 3 types):** `multi_select`, `status`, `relation` — extends `_shared/notion/properties.ts` SupportedPropertyType union + adds switch cases in `formatPropertyValue` + `parsePropertyValue`. No new platform deps.
- **Block-type extension (Notion 2.2, 4 types):** `code`, `image`, `callout`, `toggle` — extends `_shared/notion/blocks.ts` SupportedBlockType union + adds switch cases. No new platform deps. `image` block accepts external URL initially; FileRef integration deferred (would require P-S3 pattern application to Notion).
- **Triggers batch (Notion 2.3, conditional on P-N1):** 5 trigger filters + webhook normalizer + manual setup UX page. New platform deps below.

### Trigger dependencies (Notion 2.3 — conditional)

- **P-N1** (manual-webhook setup UX) — new platform slice. Likely involves: a setup page at `/workflows/{id}/triggers/{nodeId}/notion-setup` that surfaces webhook URL + event types to subscribe to in Notion's UI, plus the verification-token paste-back UI; webhook route at `/api/webhooks/notion/route.ts` parses both legacy and current verification shapes; `trigger_resources.metadata.verificationToken` storage.
- Trigger filter registry pattern (existing P-S2 infrastructure from Slack 2.1 — fully reused).
- Webhook signature verification: `crypto.createHmac` + `timingSafeEqual` (same primitives Slack uses). New `core/triggers/notion/` directory or extend the existing Slack-pattern setup at `core/triggers/`.
- Per-workflow URL routing: query-string-driven (mirrors V1's pattern; only way Notion's per-subscription URL config can route to V2's multi-tenant workflow context).

---

## 10. Required platform gaps

Three gaps surfaced by this audit. P-N1 is essential for the trigger slice; P-N2 and P-N3 are optional / on-demand.

### P-N1 — Manual-webhook setup UX

**What:** Notion does not expose programmatic webhook subscription endpoints. The user MUST configure webhooks in Notion's integration UI: copy V2's webhook URL into Notion's UI, receive a verification token in Notion's first POST to V2, surface the token in V2's UI for the user to paste back into Notion. V2 needs:

- A setup page (likely `/workflows/{id}/triggers/{nodeId}/notion-setup` or similar) that displays the webhook URL the user needs to paste into Notion's UI.
- A webhook receive endpoint that parses BOTH the legacy `{type:"url_verification", token, challenge}` shape AND the current `{verification_token}` shape (Notion supports both; V1's route handles both).
- A UI surface that captures the `verification_token` from Notion's first POST and displays it for the user to copy back to Notion.
- Storage in `trigger_resources.metadata.verificationToken` (mirroring V1's pattern).
- HMAC-SHA256 verification on subsequent events keyed by the stored verification token.
- Per-workflow routing via URL query string (the only way Notion can route to per-workflow URLs given the manual setup model).

**Options:**

- **(a) Build the manual-webhook UX.** Highest fidelity to V1's behavior. Requires builder UI work plus the receive endpoint plus the verification handshake plus the per-workflow routing. **Recommended IF product confirms Notion triggers are a near-term workflow blocker.**
- **(b) Polling fallback.** Notion's `/v1/search` and `/v1/databases/{id}/query` return `last_edited_time` per page. A `pollingTrigger` could cursor against this. Slack 2.5's filter pattern + V2's polling registry could implement this cleanly. **Recommended IF the manual UX is too much work for the trigger demand.** Trade-off: latency (poll interval, typically 5-15 min) vs the trigger UX complexity.
- **(c) Skip Notion triggers entirely.** Document the constraint; ship actions-only forever. **Recommended IF Notion triggers haven't been requested.**

**Slice:** Independent design slice. Not bundled into a Notion parity action slice. The decision is product-driven, not technical — V2 has the building blocks for any of (a), (b), or (c).

### P-N2 — Schema-aware property validation (optional)

**What:** V1's `databasePropertyTypes.ts` (416 LOC) + `dataSourceCache.ts` maintained a per-database property cache so that the builder UI could validate user input against the live database schema (e.g. multi_select option-set membership, status group, relation target database). V2 doesn't have this and currently accepts user input verbatim (Notion enforces at API time).

**Trade-off:** Schema-aware validation gives better design-time UX but couples action handlers to a schema-cache infrastructure. V2's actions handle Notion's API rejections cleanly via `SlackApiError`-style errors — they fail loud rather than silently miscoercing. The schema cache is a UX enhancement, not a correctness requirement.

**Slice:** Optional. Only needed if workflow templates frequently fail because users supplied invalid multi_select options. Don't pre-build.

### P-N3 — Expanded block-type support with file uploads

**What:** The `image` and `files` block types in Notion can accept either an external URL or an internal Notion-hosted file. The latter requires a separate file-upload-via-API flow that V2 doesn't have for Notion (P-S3's FileRef contract was designed for Slack; extending it to Notion is a non-trivial cross-provider integration).

**Slice:** Defer until a workflow template requires Notion-hosted uploads. The external-URL path covers the dominant use case.

---

## 11. Effort estimate

Per master plan §6 sizing matrix. Notion is "Notion-sized" — the V1 surface is large (3,041 LOC monolith) but most of the surface collapses to a few endpoints. Slice 9 already absorbed the OAuth + property + block + 7-action shape, so the parity port is incremental rather than from-scratch.

### Notion 2.1 — Page lifecycle + users + comments + light database/block reads

**Scope:** 9 actions. No new property types. No new block types. No new platform infrastructure.

| Commits | Content |
|---|---|
| 1 | This audit. |
| 2 | feat(notion): port page lifecycle actions (archive_page, restore_page) |
| 3 | feat(notion): port user lookups (get_user, list_users) |
| 4 | feat(notion): port comment actions (create_comment, list_comments) |
| 5 | feat(notion): port create_database |
| 6 | feat(notion): port get_block + get_block_children (folds in list_page_content) |
| 7 | test(e2e): extend Notion walkthrough with 2.1 surface |
| 8 | docs(notion): document Notion 2.1 outcomes |

**Estimate: 7 implementation commits + 1 audit + 1 outcomes = 9 commits.** Similar shape to Slack 2.3.

### Notion 2.2 — Property + block type expansion

**Scope:** 3 properties (multi_select, status, relation) + 4 block types (code, image, callout, toggle) + optionally 1-3 PORT-WHEN-NEEDED actions if specific use cases surface. No new platform infrastructure.

| Commits | Content |
|---|---|
| 1 | (audit ref — this doc) |
| 2 | feat(notion): extend property polymorphism (multi_select, status, relation) |
| 3 | feat(notion): extend block-type support (code, callout, toggle) |
| 4 | feat(notion): add image block (external URL only; FileRef deferred per P-N3) |
| 5 | test(e2e): extend Notion walkthrough with 2.2 surface |
| 6 | docs(notion): document Notion 2.2 outcomes |

**Estimate: 5 commits.** Smaller than 2.1 because new property/block types are mostly extensions of `_shared/notion/properties.ts` + `blocks.ts` patterns established in Slice 9.

### Notion 2.3 — Triggers (CONDITIONAL on P-N1 product decision)

**Scope:** 5 triggers + manual-webhook setup UX + webhook receive endpoint + filter registry entries.

| Commits | Content |
|---|---|
| 1 | P-N1 plan doc (manual-webhook UX design — separate audit-style doc) |
| 2 | feat(notion): manual-webhook setup UX + verification handshake |
| 3 | feat(notion): webhook receive endpoint + HMAC verification + canonical eventType derivation |
| 4 | feat(notion): trigger filters (comment_created, page_created_in_database, page_updated_in_database) |
| 5 | feat(notion): page-content + properties + schema triggers |
| 6 | test(e2e): extend Notion walkthrough with trigger dispatch |
| 7 | docs(notion): document Notion 2.3 outcomes |

**Estimate: 6 implementation commits + 1 P-N1 plan = 7 commits.** Largest slice; ships ONLY if Marcus confirms trigger demand.

### Cross-slice totals

- **Total commits across 2 baseline parity slices (Notion 2.1 + 2.2):** ~14.
- **Total commits if Notion 2.3 + P-N1 ship:** +7 = ~21.
- **New V2 surface (baseline):** 9 actions + 3 properties + 4 block types.
- **New V2 surface (with 2.3):** + 5 triggers + 1 platform slice (P-N1).
- **Calendar effort:** Notion 2.1 is ~1.5× a typical Phase 2 slice. Notion 2.2 is ~0.7×. Notion 2.3 (if green-lit) is ~2×, mostly because P-N1's UX work is non-trivial.

---

## 12. Risk estimate

Top 3 risks with likelihood × impact × mitigation.

### R-1 — Property-type validation gaps cause silent miscoercion or runtime failures

- **Likelihood:** medium. Notion's option-set validation (multi_select, status) happens at API time. Workflow authors with no schema awareness can submit invalid option values; Notion's error message is generic ("Option not found"). Without P-N2's schema cache, V2 surfaces the Notion error but doesn't pre-validate.
- **Impact:** low/medium. The error is visible in the run history; workflows fail loud (not silent). User experience suffers but data integrity is preserved.
- **Mitigation:** Document the option-validation behavior in Notion 2.2 outcomes. If P-N2 becomes a real demand, ship as a follow-up slice. In the meantime, ensure the API-error message is surfaced clearly via `SlackApiError`-style classification.

### R-2 — Trigger diff-detection complexity (Notion 2.3) blows up scope

- **Likelihood:** high IF Notion 2.3 ships. Notion's webhook payload reports that a page changed, but does NOT include per-property diffs. V1's `pagePropertiesUpdated` trigger advertises a `changedProperties` filter — which V1 implements by fetching the page's previous state from local cache and diffing. This adds significant state management to the trigger path.
- **Impact:** medium. Workflow authors who want "trigger only when property X changes" lose that filter; they'd have to branch downstream after fetching `get_page` to compare.
- **Mitigation:** Ship the triggers WITHOUT diff filters first (`updateType: any` only). Document the limitation. Add filter complexity only if workflow templates regularly need diff-aware branching. P-N1 design doc should explicitly skip diff filters in v1.

### R-3 — Manual-webhook UX (P-N1) is product-design heavy, not engineering heavy

- **Likelihood:** high IF Notion 2.3 ships. The technical work (receive endpoint, HMAC validation, query-string routing) is straightforward — Slack 2.5's filter pattern applies cleanly. The UX work (setup page, copy-URL flow, paste-token-back flow) is product-design-heavy and benefits from a design pass before engineering starts.
- **Impact:** medium. Engineering can stall on "what should the setup page look like" without a clear product spec.
- **Mitigation:** P-N1 plan doc (separate from Notion 2.3 implementation commits) lands first. Includes wireframes / UX flow before engineering starts. If design ambiguity surfaces, **STOP-AND-REPORT** rather than ship engineering for a flow that may not match product intent.

---

## 13. Recommended parity batch plan

Sequence of slices and the order they ship in. Each slice is its own audit-accepted unit; this plan is the recommendation, not the commitment.

1. **Notion 2.1 — Page lifecycle + users + comments + database / block reads** (9 commits) — closes the highest-leverage action gaps. No new platform infrastructure. Mirrors Slack 2.3 in shape and effort.
2. **Notion 2.2 — Property + block type expansion** (5 commits) — extends the type-polymorphism patterns established in Slice 9. No new actions unless a use case surfaces during the slice.
3. **Notion 2.3 — Triggers** (7 commits, CONDITIONAL) — gated by product decision on manual-webhook UX (P-N1). Land separately from 2.1 / 2.2; do not bundle.

**Across all 2-3 slices:**
- Update master plan §3 priority table: Notion drops out as priority 3 once 2.1 lands; subsequent providers (Microsoft Excel at priority 4) proceed.
- Append to master plan §5 rot catalog: any new patterns surfaced during port (N-R-prefixed entries above are candidates).

**Cross-cutting decisions Marcus must make before 2.1 starts:**
- Confirm `archive_page` + `restore_page` are the right names (vs `archiveDatabaseItem` + `restoreDatabaseItem` from V1). V2 collapses the page/database distinction since database items ARE pages in Notion's data model. **Recommend:** `archive_page` / `restore_page` (works for both bare pages and database items).
- Confirm `getBlockChildren` is the right name (vs V1's `list_page_content` granular). **Recommend:** `get_block_children` (closer to Notion's API naming).
- Confirm `make_api_call` escape-hatch action is permanently skipped. **Recommend:** SKIP (per audit §7 + N-R5).
- Confirm `find_or_create_item` ships as a workflow-template recipe rather than an action. **Recommend:** SKIP (per audit §7 — V2's variable resolution makes the composition path natural).

**Cross-cutting decisions Marcus must make before 2.3 starts (if 2.3 ships):**
- Decide P-N1 option (a / b / c per §10): manual-webhook UX, polling fallback, or permanently skip Notion triggers.
- Decide whether `updateType` filter on `databaseItemUpdated` ships in v1 of the trigger or is deferred (recommend: defer, ship match-all).
- Decide whether `watchProperties` filter on `pagePropertiesUpdated` ships in v1 (recommend: defer).

---

## 14. Exit checklist

This audit is complete when Marcus has:

- [ ] Read sections 1–13.
- [ ] Confirmed the action port / skip / consolidate / defer table (§7) — especially the **SKIP** decisions (8 actions consolidated into existing V2 surface; `make_api_call` escape hatch skipped; `find_or_create_item` skipped as recipe-only).
- [ ] Confirmed the property type table (§7) — 3 PORT, 2 PORT-WHEN-NEEDED, 2 SKIP.
- [ ] Confirmed the block type table (§7) — 4 PORT, 3 PORT-WHEN-NEEDED, 3 SKIP.
- [ ] Confirmed the trigger product decision is **NEEDS DECISION**, not implicitly PORT — see §10 P-N1 options (a / b / c).
- [ ] Confirmed the 3 platform gaps (§10): **P-N1** manual-webhook UX (conditional), **P-N2** schema-aware property validation (optional), **P-N3** expanded block-type uploads (optional).
- [ ] Confirmed the recommended split into **2–3 parity slices** (§11) with an estimated **~14 commits baseline / ~21 commits with 2.3**.
- [ ] Decided whether to:
  - **(a)** start Notion 2.1 immediately after acceptance, defer 2.3 product decision until 2.1 ships; OR
  - **(b)** make the P-N1 product decision before 2.1 starts so the trigger timeline is locked; OR
  - **(c)** modify the slice boundary (e.g. fold property/block expansion into 2.1 if a 2.1 workflow template needs multi_select).
- [ ] Confirmed name decisions (§13 "Cross-cutting decisions"): `archive_page` / `restore_page` over V1's database-specific names; `get_block_children` over V1's `list_page_content`; permanent SKIP for `make_api_call` and `find_or_create_item`.
- [ ] Confirmed Notion's `2022-06-28` API version stays in Slice 9's actions-only surface — and that the `2025-09-03` decision is deferred until / unless 2.3 trigger work happens (per N-R8).

**Implementation does NOT begin before Marcus checks every box above.**
