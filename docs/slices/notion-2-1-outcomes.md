# Notion 2.1 — Page lifecycle + users + comments + databases/blocks outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-notion.md`](parity-notion.md) (accepted before Commit 2 began).
**Phase 1 predecessor:** [`docs/slices/slice-9-notion.md`](slice-9-notion.md) (7-action OAuth-only port; established the V2 Notion baseline + typed property polymorphism + non-refreshable token handling).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/notion/`](../../integrations/notion/).

Notion 2.1 closes the largest action gap from the parity audit: 9 new
actions spanning page lifecycle, user lookups, comment thread
management, database creation, and block reads. The slice introduces
**zero new platform infrastructure** — all behavior fits the Slice 9
OAuth + property polymorphism + `notionRequest` HTTP helper stack.

The largest qualitative change is that V1's 3,041-LOC `handlers.ts`
kitchen-sink dispatcher and its 532-LOC `manageDatabase.ts` /
613-LOC `managePage.ts` /288-LOC `manageUsers.ts` routers are
NOT ported as-is. V2 ships 9 typed `ActionHandler` modules — one
Notion endpoint per action — with locked output key sets and strict
schemas.

---

## 1. Scope shipped

### Actions (9)

| Action | Notion endpoint | What it does | V1 reference |
|---|---|---|---|
| `archive_page` | `PATCH /v1/pages/{id}` with `archived: true` | Soft-archives a page or database row. Database items ARE pages in Notion's model. | `manageDatabase.ts` archive op |
| `restore_page` | `PATCH /v1/pages/{id}` with `archived: false` | Un-archives. | `manageDatabase.ts` restore op |
| `get_user` | `GET /v1/users/{id}` | Single user lookup; normalizes person vs bot discriminator into flat output. | `manageUsers.ts` get op |
| `list_users` | `GET /v1/users` | Single-page workspace user list. | `manageUsers.ts` list op |
| `create_comment` | `POST /v1/comments` | Page-parent OR discussion reply (exactly one). | `manageComments.ts` create op |
| `list_comments` | `GET /v1/comments?block_id=...` | Single-page comment list for a page/block. | `manageComments.ts` list op |
| `create_database` | `POST /v1/databases` | Page-parented; safe-property-types only; exactly one title property. | `manageDatabase.ts` create op |
| `get_block` | `GET /v1/blocks/{id}` | Single block read with bounded type-specific content + plainText extraction. | `manageBlocks.ts` get op |
| `get_block_children` | `GET /v1/blocks/{id}/children` | Single-page child blocks list; folds V1's `list_page_content`. | `manageBlocks.ts` get-children + V1 granular `list_page_content` |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Notion action total after 2.1: 16** (7 Slice 9 + 9 Notion 2.1).

### API wrappers (5 new functions across 3 module extensions)

| Wrapper | Module | Used by |
|---|---|---|
| `usersRetrieve` | NEW [`api/users.ts`](../../integrations/notion/api/users.ts) | `get_user` |
| `usersList` | NEW [`api/users.ts`](../../integrations/notion/api/users.ts) | `list_users` |
| `commentsCreate` | NEW [`api/comments.ts`](../../integrations/notion/api/comments.ts) | `create_comment` |
| `commentsList` | NEW [`api/comments.ts`](../../integrations/notion/api/comments.ts) | `list_comments` |
| `databasesCreate` | EXTENDED [`api/databases.ts`](../../integrations/notion/api/databases.ts) | `create_database` |
| `blocksRetrieve` | EXTENDED [`api/blocks.ts`](../../integrations/notion/api/blocks.ts) | `get_block` |
| `blocksChildrenList` | EXTENDED [`api/blocks.ts`](../../integrations/notion/api/blocks.ts) | `get_block_children` |

All 7 wrappers route through Slice 9's [`notionRequest`](../../integrations/notion/api/_request.ts):
- Notion-Version pin (`2022-06-28`) — every request.
- `NOTION_API_BASE` env override — every request (used by future e2e mock).
- 401 → `Unauthorized401Error` (caught by `refreshAndRetry`; non-refreshable Notion surfaces as `IntegrationActionRequiredError(reason: "refresh_not_supported")`).
- 404 → `NotFoundError(resourceLabel)` with stable per-wrapper labels.
- Other non-2xx → tagged `Error("Notion <METHOD> <path> failed: <surfaced message>")`.

**Zero changes** to `notionRequest` / `_base.ts` / `errors.ts`.

### Property + block-type support

**Property types (9 supported, 7 deferred):** No change to the Slice 9
baseline. `create_database` accepts only the 9 `SupportedPropertyType`
values for the new database column schemas (`title`, `rich_text`,
`number`, `select`, `checkbox`, `date`, `url`, `email`,
`phone_number`). `multi_select`, `status`, `relation`, `people`,
`files`, `rollup`, `formula` remain deferred to Notion 2.2.

**Block types (9 supported, 10 deferred):** No change to the Slice 9
baseline. `get_block` + `get_block_children` return Notion's
type-specific `content` payload verbatim regardless of block type
(read path doesn't care about V2's supported-set), but the
`plainText` extraction only resolves usefully for rich-text-bearing
types (paragraph, headings, list items, quote, to_do, callout, code,
toggle); image / divider / embed return `plainText: ""` and
workflow authors read `content` directly.

### Manifest scope changes

**None.** `read_content` + `update_content` + `insert_content` from
Slice 9 cover every Notion 2.1 endpoint. Notion's OAuth capability
scopes are configured in the integration's developer-portal settings,
not requested per-OAuth-flow, so no V2 manifest change was possible
even if more granularity had been desired.

---

## 2. Durable decisions worth preserving

### 2.1 Typed actions only — no kitchen-sink router

V1 had three multi-operation router files: `managePage.ts` (613 LOC),
`manageDatabase.ts` (532 LOC), `manageUsers.ts` (288 LOC),
`manageComments.ts` (140 LOC), `manageBlocks.ts` (130 LOC). Each
accepted an `operation: string` field and dispatched to one of 2–6
inner code paths. The V1 builder UI used `commentTarget` / `listTarget`
synthetic discriminators to choose the operation.

V2 ships every Notion endpoint as its own typed `ActionHandler`. One
action = one Notion endpoint = one strict schema = one locked output
key set. No `operation` field. No router.

### 2.2 No raw API escape hatch (V1's `make_api_call` rejected)

V1's [`notion_action_api_call`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/actions/makeApiCall.schema.ts)
accepted method / path / body / headers and forwarded to Notion's
API without versioning safety. Per audit §7 row + N-R5 entry: NOT
PORTED. Action gaps will be filled by targeted typed ports
(Notion 2.2 backlog) rather than a generic escape hatch.

### 2.3 No raw Notion wire-format passthrough

Every Notion 2.1 action that takes a structured input synthesizes the
Notion wire-format internally:

| Action | What V2 input becomes |
|---|---|
| `create_comment.text` | `[{ type: "text", text: { content: text } }]` rich_text array |
| `create_database.title` | Same rich_text array shape |
| `create_database.description` | Same rich_text array shape |
| `create_database.properties` | `{ <name>: { type: "title" } }` → `{ <name>: { title: {} } }` Notion wire-format |

Workflow authors cannot supply a pre-built `rich_text` array or a raw
Notion property schema. Schemas are `.strict()` and reject those
fields at design time.

### 2.4 No workspace selector

V1 carried a `workspace` config field on every action (a dynamic
select against `notion_workspaces`). V2 resolves the integration row
via `triggerEvent.accountId` — same pattern as every other V2
provider since the Slack 2.3 era. NOT PORTED.

### 2.5 No input spreading into output

V1's `manageComments.ts:84` and `:118` did
`output: { commentId, ..., ...result.output }` which leaked Notion's
raw response keys (e.g. snake_case `comment_id`, `created_time`)
alongside the renamed V2 keys.

Every V2 action builds its output strictly from named fields. Tests
pin the exact key set via:
```ts
const outKeys = Object.keys(result.output).sort();
expect(outKeys).toEqual([...locked list...].sort());
```

### 2.6 Single-page list behavior — no auto-pagination

`list_users`, `list_comments`, `get_block_children` all return exactly
ONE page of results and stop. Workflow authors that want all results
compose a downstream loop on `nextCursor` + `hasMore`. The unit tests
pin this with explicit "no auto-pagination" guards — even when the
mock returns `has_more: true`, exactly one wrapper call fires.

V1's `manageUsers.ts:108` returned a synthetic `total_count` field
computed from `users.length` post-filter — misleading because Notion's
API never returns a workspace-wide total. NOT PORTED.

### 2.7 No hidden defaults

`isInline` on `create_database` is `undefined` by default and omitted
from the request body (Notion applies its own default of `false`).

V1's `parseInt(config.page_size) || 100` coercion (in `queryDatabase`,
`retrieveComments`, etc.) is NOT ported — V2 schemas enforce
`int().positive().max(100).optional()` and reject invalid values
loudly at design time.

V1's `parent_type !== "page"` silent fallback to `{ workspace: true }`
in `createDatabase` (handlers.ts:879-883) is NOT ported. V2 requires
explicit `parentPageId`; workspace-level databases are deferred to
on-demand follow-up.

### 2.8 `archive_page` / `restore_page` — database items ARE pages

Notion's data model treats database rows as pages. V1 had separate
`archive_database_item` / `restore_database_item` actions plus
`manage_page` archive/restore ops. V2 collapses into single
`archive_page` / `restore_page` actions accepting any page id (bare
page OR database row). The `archived` boolean is hard-coded inside
each handler — workflow authors cannot bypass the contract by passing
`archived: false` through `archive_page`'s schema (schema rejects).

### 2.9 Comment target — page parent OR discussion reply, exactly one

V1's `manageComments.ts` plumbed a third `parent_type === "block"`
option that mapped to the `page_id` field and was silently dropped by
the handler because Notion's public API does not support block-level
comment creation. V2 rejects ambiguity at schema time: `pageId` xor
`discussionId`, never both, never neither. Schema `.refine`
enforces.

### 2.10 `get_block` returns bounded content — V1 raw-block leak guard

V1's `notionGetBlock` returned `block: result` (the entire raw block
response). That leaks every Notion field including undocumented future
ones. V2 builds a stable flat projection with a bounded `content`
field set to `block[block.type]` (e.g. `block.paragraph`,
`block.image`). The test pins a leak-guard assertion that
undocumented future fields do NOT propagate.

### 2.11 `blockId` dual-meaning convention preserved

Notion treats pages as blocks at the API level. V2's `appendBlockChildren`
(from Slice 9) already used `blockId` as the input field name with the
"pages accepted too" convention. Notion 2.1 actions follow the same
precedent: `get_block` / `get_block_children` / `list_comments` all
accept a page id OR a block id under the `blockId` field. Documented
inline at the schema level.

### 2.12 `get_block_children` folds V1's `list_page_content`

V1 had a granular `notion_action_list_page_content` action (schema at
[`actions/listPageContent.schema.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/actions/listPageContent.schema.ts))
that hit the same `/v1/blocks/{id}/children` endpoint as
`get_block_children`. Per parity audit §7 and §13 cross-cutting
decisions: V2 ships ONE canonical action with the `blockId`
dual-meaning convention.

---

## 3. V1 rot fixed (consolidated)

All entries from parity-notion §8 are addressed:

| ID | Pattern | V2 status |
|---|---|---|
| N-R1 | 3,041-LOC `handlers.ts` kitchen-sink | NOT PORTED — already mitigated in Slice 9 with per-action splits; Notion 2.1 preserves the pattern |
| N-R2 | Orphaned `manage_*` unified actions | NOT PORTED — V2 ships per-action only |
| N-R3 | Deprecated commented-out schemas in `index.ts:317+` | NOT PORTED — V2 doesn't carry the dead code |
| N-R4 | `getPageContent.schema.ts` orphan | NOT PORTED — V2 ships `get_block_children` as the canonical version |
| N-R5 | `make_api_call` escape hatch | NOT PORTED |
| N-R6 | `databasePropertyTypes.ts` (416 LOC) + `dataSourceCache.ts` in-memory cache | NOT PORTED — design-time validation belongs to the builder UI |
| N-R7 | `manage_*` 5-operation routers | NOT PORTED — each operation is its own typed action |
| N-R8 | Two API versions in parallel (`2022-06-28` + `2025-09-03`) | V2 stays on `2022-06-28` only; `2025-09-03` reserved for the trigger slice if it ships |
| N-R9 | Webhook route's verbose color-logged logging | N/A — trigger slice deferred |
| N-R10 | Per-workflow URL routing depends on user UI action | N/A — trigger slice deferred |
| N-R11 | Inline `formatNotionPropertyValue` switch in handlers.ts | Already mitigated in Slice 9 (`_shared/notion/properties.ts`); Notion 2.1 doesn't add new types |

---

## 4. Files shipped

### Source

**Actions (Commits 2-5):**
- [`integrations/notion/actions/archivePage.ts`](../../integrations/notion/actions/archivePage.ts) + `.schema.ts` (Commit 1)
- [`integrations/notion/actions/restorePage.ts`](../../integrations/notion/actions/restorePage.ts) + `.schema.ts` (Commit 1)
- [`integrations/notion/actions/getUser.ts`](../../integrations/notion/actions/getUser.ts) + `.schema.ts` (Commit 2)
- [`integrations/notion/actions/listUsers.ts`](../../integrations/notion/actions/listUsers.ts) + `.schema.ts` (Commit 2)
- [`integrations/notion/actions/createComment.ts`](../../integrations/notion/actions/createComment.ts) + `.schema.ts` (Commit 3)
- [`integrations/notion/actions/listComments.ts`](../../integrations/notion/actions/listComments.ts) + `.schema.ts` (Commit 3)
- [`integrations/notion/actions/createDatabase.ts`](../../integrations/notion/actions/createDatabase.ts) + `.schema.ts` (Commit 4)
- [`integrations/notion/actions/getBlock.ts`](../../integrations/notion/actions/getBlock.ts) + `.schema.ts` (Commit 4)
- [`integrations/notion/actions/getBlockChildren.ts`](../../integrations/notion/actions/getBlockChildren.ts) + `.schema.ts` (Commit 4)

**API wrappers:**
- [`integrations/notion/api/users.ts`](../../integrations/notion/api/users.ts) (NEW — Commit 2)
- [`integrations/notion/api/comments.ts`](../../integrations/notion/api/comments.ts) (NEW — Commit 3)
- [`integrations/notion/api/databases.ts`](../../integrations/notion/api/databases.ts) (EXTENDED — Commit 4 added `databasesCreate`)
- [`integrations/notion/api/blocks.ts`](../../integrations/notion/api/blocks.ts) (EXTENDED — Commit 4 added `blocksRetrieve` + `blocksChildrenList`)

**Registry:** `services/execution/handlers/_registry.ts` updated once per commit (9 new entries total).

### Tests

| Commit | Wrapper tests | Schema/handler tests | Registry tests |
|---|---|---|---|
| 1 | n/a (reuses Slice 9 `pagesUpdate`) | 12 archive + 12 restore | +1 |
| 2 | 14 (users.ts) | 13 get + 16 list | +1 |
| 3 | 17 (comments.ts) | 17 create + 17 list | +1 |
| 4 | 21 (8 databases + 13 blocks) | 15 createDB + 13 getBlock + 13 getBlockChildren | +1 |

**Notion focused subset after Commit 4:** 27 suites / 295 tests passing.

### Docs

- [`docs/slices/parity-notion.md`](parity-notion.md) (Commit 0 — audit)
- This file (Commit 5)
- CLAUDE.md updates (Commit 5)

---

## 5. Commit breakdown (5)

| # | Commit hash | What landed |
|---|---|---|
| 0 | `82a853097` | `docs: add Notion parity audit` |
| 1 | `345ec10a6` | `feat(notion): add page lifecycle actions` (`archive_page`, `restore_page`) |
| 2 | `d229bed3e` | `feat(notion): add user lookup actions` (`get_user`, `list_users` + new `api/users.ts` wrapper module) |
| 3 | `d71489771` | `feat(notion): add comment actions` (`create_comment`, `list_comments` + new `api/comments.ts` wrapper module) |
| 4 | `e9c45bdcb` | `feat(notion): add database and block read actions` (`create_database`, `get_block`, `get_block_children` + extended `api/databases.ts` + `api/blocks.ts`) |
| 5 | (this commit) | `docs(notion): document Notion 2.1 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test` (Notion subset green throughout; unrelated parallel-chat failures noted in each commit's report)

Final unit-test totals after Commit 4: **600 suites / 5479 tests
passing** out of 602/5485 (2 unrelated Microsoft Excel WIP failures —
out of scope for this slice). Notion focused subset: **27 suites /
295 tests passing.**

---

## 6. Acceptance criteria (post-merge)

- [x] 9 actions registered in `services/execution/handlers/_registry.ts`.
- [x] 5 new wrapper functions across 2 new modules (`users.ts`, `comments.ts`) and 2 extended modules (`databases.ts`, `blocks.ts`).
- [x] Every wrapper routes through `notionRequest` — no inline `fetch` calls in any new wrapper.
- [x] Every handler uses `refreshAndRetry` with `accountId = triggerEvent.accountId`.
- [x] Every schema is `.strict()` — unknown fields rejected at design time.
- [x] Every output key set is locked by a test asserting `Object.keys(output).sort() === expected.sort()`.
- [x] No kitchen-sink router actions.
- [x] No `make_api_call` escape hatch.
- [x] No workspace selector on any action.
- [x] No input spreading into outputs.
- [x] `create_database` accepts only the 9 V2-supported property types; rejects deferred types (`multi_select`, `status`, `relation`, etc.).
- [x] `create_database` enforces exactly-one-title-property at the schema layer.
- [x] `archive_page` / `restore_page` hard-code the `archived` boolean — workflow authors cannot bypass.
- [x] `create_comment` requires exactly one of `pageId` / `discussionId` (Zod refine).
- [x] `list_users` / `list_comments` / `get_block_children` are single-page only (test asserts single wrapper call when `has_more: true`).
- [x] `get_block` does NOT echo the entire raw block object (test asserts undocumented future fields don't propagate).
- [x] All 9 Notion 2.1 actions present and registered. ✓

---

## 7. What's deferred

### Deferred to Notion 2.2 (property + block type expansion)

| Item | Audit recommendation |
|---|---|
| `multi_select` property type | PORT — common in databases (tags). Accept array-of-string at input. |
| `status` property type | PORT — Same as multi_select but single-value. |
| `relation` property type | PORT — Wire-format: `{ relation: [{ id: pageId }] }`. Straightforward once we accept page-ids verbatim. |
| `people` property type | PORT-WHEN-NEEDED — pairs with `list_users` (already shipped). |
| `files` property type | PORT-WHEN-NEEDED — gated by Notion-side FileRef integration (P-N3). |
| `code` block type | PORT — common; needs `language` discriminator field. |
| `image` block type | PORT — common; external URL only (FileRef-staged deferred to P-N3). |
| `callout` block type | PORT — common; needs `icon` + rich-text. |
| `toggle` block type | PORT — common; rich-text + children. |
| `embed` / `column_list` / `table` block types | PORT-WHEN-NEEDED. |
| `update_database_info` action | PORT-WHEN-NEEDED — rare in workflows. |
| `delete_blocks` action | PORT-WHEN-NEEDED — niche. |
| `duplicate_page` action | PORT-WHEN-NEEDED — high-effort multi-step orchestration. |
| `get_page_with_children` action | PORT-WHEN-NEEDED — cost-sensitive recursive walk. |

### Deferred to Notion 2.3 (triggers — conditional on product decision)

Notion's 6 webhook-based triggers are gated by **P-N1** (manual-webhook
setup UX). Three product options surfaced in parity audit §10:

- **(a) Build the manual-webhook UX** (setup page + verification-token paste-back + per-workflow URL routing) — highest fidelity, most product/UX work.
- **(b) Polling fallback** — `last_edited_time` cursor pattern; lower latency but covers most use cases.
- **(c) Permanent skip** — document the Notion API constraint; ship actions-only forever.

Decision is product-driven, not technical. V2 has the building blocks
for any option. No engineering work starts until Marcus confirms.

### Permanently skipped

| Item | Reason |
|---|---|
| `make_api_call` escape hatch | Generic-passthrough invites undocumented endpoint use without versioning safety. Fill gaps via targeted typed ports. |
| `find_or_create_item` | Functionally `query_database` + `create_database_entry`. Workflow template recipe, not a wrapper action. |
| `rollup` / `formula` property types | Computed by Notion; not writable. `get_page` already returns the raw wire-format under `properties.<name>.rollup`. |
| V1's 17-field synthetic schema for `fileUploaded` trigger | Fiction — not in Notion's actual payload (caught during Slack 2.5 audit; same V1-rot pattern applies to Notion triggers). |
| V1 `manage_*` 5-operation routers | Per-action typed handlers replace them. |
| V1 `workspace` config selector | Resolved via `triggerEvent.accountId`. |
| V1 `total_count` synthetic field | Misleading — Notion's API doesn't return workspace-wide totals. |
| V1 `is_guest` heuristic + `includeGuests` filter | Workspace-domain-string-matching against a placeholder — never produced reliable results. |
| V1 `recent_activity` enrichment on `get_user` | Best-effort secondary `search` call that swallowed errors; compose `search` downstream instead. |
| V1 `access_level` / `description` synthetic fields on `get_user` | Invented strings, not in Notion's response. |
| V1's ambiguous `email` field collapsing `person.email || bot.owner.workspace_name` | V2 separates `personEmail` + `botWorkspaceName` cleanly. |

---

## 8. CLAUDE.md updates landed

A new "Phase 2 progress (Notion)" subsection adds the Notion 2.1
entry under the existing Phase 2 progress block. Plus a short
"Deep Gotchas → Notion Phase 2 patterns" subsection records four
durable rules:

- Notion Phase 2 actions stay typed and narrow; do NOT recreate V1's `handlers.ts` kitchen-sink dispatcher.
- `make_api_call` escape hatch is permanently skipped; fill gaps via targeted typed ports.
- Notion list actions are single-page by default — workflow authors compose pagination loops.
- Notion raw payload passthrough (raw `rich_text`, raw property wire-format, raw block object echo) is rejected unless explicitly approved by a parity audit decision.

---

## 9. What's next (Notion roadmap)

Per parity-notion §11 / §13:

- **Notion 2.2** — property + block type expansion (~5 commits): `multi_select` / `status` / `relation` properties + `code` / `image` / `callout` / `toggle` blocks + on-demand actions (`update_database_info` / `delete_blocks` / `duplicate_page` / `get_page_with_children`).
- **Notion 2.3** — triggers (~7 commits, CONDITIONAL on product decision for P-N1 manual-webhook UX).

Tracking lives in [`docs/slices/parity-notion.md`](parity-notion.md)
§§11–13. None of the deferred items are committed for follow-up
timing in this slice.
