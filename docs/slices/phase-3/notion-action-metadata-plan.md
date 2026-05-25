# Phase 3 — Notion Action Metadata Plan

**Status:** Plan only. No metadata / runtime / handler changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Checkpoint reference:** [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md) §8 ranked Notion as the next provider metadata batch after Slack reached completeness — no new resolver needed, no triggers to handle.
**Companion plans:** [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md), [`./options-source-plan.md`](./options-source-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md), [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md).

This plan sequences the Notion action metas onto the existing builder infrastructure. By the end of the arc, Notion flips into `COVERED_PROVIDERS` and the structural test enforces 1:1 handler-to-meta coverage from then on. No new resolver, no new field type, no runtime schema or handler changes.

---

## 1. Current Notion metadata state

| Surface | Status |
| --- | --- |
| Triggers | **None — Notion has no registered trigger handlers in V2.** [`integrations/notion/manifest.ts`](../../../integrations/notion/manifest.ts) declares `capabilities.webhookTrigger: false` + `capabilities.pollingTrigger: false` (Notion exposes no programmatic webhook subscription API; webhooks are configured manually through the Notion integration UI per Slice 9 plan). Metadata batch is action-only. |
| Action metas | **0 of 16** — Notion has zero discovery metadata today. |
| Async options source | **None.** No `notion:*` resolver registered in [`services/options/_registry.ts`](../../../services/options/_registry.ts). |
| `COVERED_PROVIDERS` membership | NOT included — Notion stays uncovered until every handler has a meta. |
| Outstanding action handlers | **16** (full inventory in §2). |
| Provider route test status | [`tests/unit/app/api/providers/providers-route.test.ts:113-122`](../../../tests/unit/app/api/providers/providers-route.test.ts) currently asserts `notion.hasMetadata === false`. Flipped to `true` in the first implementation slice. |

---

## 2. Full Notion action handler inventory

Verified by reading [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 396-415 (16 entries) and every schema + handler under [`integrations/notion/actions/`](../../../integrations/notion/actions/). Every registered Notion action handler is listed; cross-referenced against the `*.meta.ts` glob (returns zero results today).

| # | Handler key | Schema file | User-configurable fields | Output shape | Concerns / notes |
| --- | --- | --- | --- | --- | --- |
| 1 | `notion:create_page` | [`createPage.schema.ts`](../../../integrations/notion/actions/createPage.schema.ts) | `parent` (discriminated `{databaseId} \| {pageId}`), `properties` (typed property map), `children?` (typed block array, ≤100), `icon?`, `cover?` | `{pageId, url, parent, createdTime, lastEditedTime}` | PORT. JSON-paste shape needed for `parent`, `properties`, `children`, `icon`, `cover`. |
| 2 | `notion:update_page` | [`updatePage.schema.ts`](../../../integrations/notion/actions/updatePage.schema.ts) | `pageId` (required), `properties?`, `archived?`, `icon?`, `cover?` | `{pageId, url, archived, lastEditedTime}` | PORT. Schema `refine` requires at least one of `properties`/`archived`/`icon`/`cover`. |
| 3 | `notion:query_database` | [`queryDatabase.schema.ts`](../../../integrations/notion/actions/queryDatabase.schema.ts) | `databaseId`, `filter?` (raw object), `sorts?` (raw array), `pageSize?` (1-100), `startCursor?` | `{results: array, hasMore: boolean, nextCursor: string\|null}` — each row carries `{id, url, archived, createdTime, lastEditedTime, properties, skippedProperties}` | PORT. `filter` + `sorts` are paste-JSON. `startCursor` is server-managed pagination — omit from meta per established convention. |
| 4 | `notion:create_database_entry` | [`createDatabaseEntry.schema.ts`](../../../integrations/notion/actions/createDatabaseEntry.schema.ts) | `databaseId`, `properties` (required non-empty typed property map), `children?`, `icon?`, `cover?` | `{pageId, url, parent, createdTime, lastEditedTime}` (mirrors create_page intentionally) | PORT. Same JSON-paste fields as create_page. |
| 5 | `notion:append_block_children` | [`appendBlockChildren.schema.ts`](../../../integrations/notion/actions/appendBlockChildren.schema.ts) | `blockId` (accepts block id OR page id), `children` (required, 1-100 typed blocks) | `{childIds: string[], count: number}` | PORT. `children` is paste-JSON discriminated `BlockSpec[]`. Schema enforces 100-block cap. |
| 6 | `notion:get_page` | [`getPage.schema.ts`](../../../integrations/notion/actions/getPage.schema.ts) | `pageId` | `{pageId, url, archived, parent, createdTime, lastEditedTime, properties, skippedProperties, icon, cover}` | PORT. Simplest read action — strict, id-only. |
| 7 | `notion:search` | [`search.schema.ts`](../../../integrations/notion/actions/search.schema.ts) | `query` (required string, "" = all), `filter?` (discriminated `{value: "page"\|"database", property: "object"}`), `pageSize?` (1-100), `startCursor?` | `{results: array, hasMore: boolean, nextCursor: string\|null}` — items are RAW Notion search hits | PORT. **Known asymmetry:** `results` items are raw Notion hits (the handler comment is explicit — "surfaces the search-list shape as-is"). Meta declares `results: array` and lets downstream actions drill or chain `get_page`. The `filter` field is paste-JSON for v1 (object shape doesn't fit a single FieldType). |
| 8 | `notion:archive_page` | [`archivePage.schema.ts`](../../../integrations/notion/actions/archivePage.schema.ts) | `pageId` | `{pageId, url, archived, lastEditedTime}` | PORT. Smallest lifecycle action. Handler hard-codes `archived: true` — no `archived` field. |
| 9 | `notion:restore_page` | [`restorePage.schema.ts`](../../../integrations/notion/actions/restorePage.schema.ts) | `pageId` | `{pageId, url, archived, lastEditedTime}` | PORT. Inverse of #8. Handler hard-codes `archived: false`. |
| 10 | `notion:get_user` | [`getUser.schema.ts`](../../../integrations/notion/actions/getUser.schema.ts) | `userId` | `{userId, object, type, name, avatarUrl, personEmail, botOwnerType, botOwnerUserId, botWorkspaceName}` | PORT. Id-only contract — no name/email lookup variant. |
| 11 | `notion:list_users` | [`listUsers.schema.ts`](../../../integrations/notion/actions/listUsers.schema.ts) | `pageSize?` (1-100), `startCursor?` | `{users: array (same shape as get_user output), nextCursor, hasMore}` | PORT. Single-page list; no auto-pagination. |
| 12 | `notion:create_comment` | [`createComment.schema.ts`](../../../integrations/notion/actions/createComment.schema.ts) | `pageId?` XOR `discussionId?` (refine: exactly one), `text` (required, plain text only) | `{commentId, object, parentType, parentId, parentBlockId, discussionId, plainText, createdTime, lastEditedTime, createdByUserId}` | PORT. Discriminated target — schema refine enforces exactly one of `pageId`/`discussionId`. |
| 13 | `notion:list_comments` | [`listComments.schema.ts`](../../../integrations/notion/actions/listComments.schema.ts) | `blockId` (accepts block id OR page id), `pageSize?` (1-100), `startCursor?` | `{comments: array, nextCursor, hasMore}` | PORT. |
| 14 | `notion:create_database` | [`createDatabase.schema.ts`](../../../integrations/notion/actions/createDatabase.schema.ts) | `parentPageId`, `title` (plain string), `description?` (plain string), `isInline?`, `properties` (required `Record<name, {type: SupportedPropertyType}>`, refine: exactly 1 title) | `{databaseId, object, url, title, description, archived, isInline, parentType, parentId, createdTime, lastEditedTime, properties}` | PORT. `properties` is the column-schema map (different shape from create_page's row-value `properties`). Paste-JSON for v1. Output `properties` echoes Notion's raw schema verbatim — intentional per handler comment, declared `object`. |
| 15 | `notion:get_block` | [`getBlock.schema.ts`](../../../integrations/notion/actions/getBlock.schema.ts) | `blockId` (accepts block id OR page id) | `{blockId, object, type, archived, hasChildren, parentType, parentId, createdTime, lastEditedTime, plainText, content}` | PORT. `content` is the type-specific block payload (bounded by Notion's per-type shape) — declared `object`. |
| 16 | `notion:get_block_children` | [`getBlockChildren.schema.ts`](../../../integrations/notion/actions/getBlockChildren.schema.ts) | `blockId` (accepts block id OR page id), `pageSize?` (1-100), `startCursor?` | `{blocks: array (same shape as get_block output), nextCursor, hasMore}` | PORT. |

**Totals:** 16 handlers · 0 metas · **16 metas missing** · **0 DEFER · 0 SKIP** — every registered handler is in scope for metadata coverage. No dead/unregistered handlers; no permanently-unsupported actions.

### 2.1 Cross-cutting observations

- **Every action requires the Notion integration** (`requiresIntegration: true`). Notion has no native variant.
- **Zero `producesFileRef` / `consumesFileRef`** actions in Notion. FileRef is irrelevant to this batch.
- **Pagination cursors (`startCursor`) are server-managed.** Per the established convention (Slack `list_*` metas, Gmail `search_emails`, Outlook `fetch_emails`), the meta omits `startCursor` entirely — authors call the action again with `{{prev.nextCursor}}` for page 2.
- **Output `nextCursor` is always `string | null`.** The variable picker treats `string` as a usable scalar; `null` resolves at runtime. No special handling needed.
- **Dual-meaning ID fields.** `blockId` accepts both block ids AND page ids on `append_block_children` / `get_block` / `list_comments` / `get_block_children`. The meta description must call this out (matches handler comments).
- **JSON-paste fields are the only structural complexity.** Six fields across the inventory accept nested objects/arrays where no current `FieldType` represents the shape directly: `parent`, `properties` (×2 shapes — row values vs database schema), `children`, `filter` (×2), `sorts`, `icon`, `cover`. See §3.2 for the strategy (mirror Slack's `post_interactive_blocks.blocks` pattern — textarea + paste-JSON + `{{...}}` reference support).

---

## 3. Field metadata strategy

### 3.1 Use existing FieldTypes only

Every Notion field maps cleanly to one of the 12 existing `FieldType` variants. **No new FieldType is introduced in this batch.** The mapping:

| Schema field shape | FieldType | Reason |
| --- | --- | --- |
| `z.string().min(1)` short identifiers (`pageId`, `databaseId`, `blockId`, `userId`, `discussionId`, `parentPageId`) | `text` | v1 stays text-first; a future `notion:databases` / `notion:pages` resolver can flip these without contract churn. |
| `z.string().min(1)` short labels (`title`, `name`) | `text` | Single-line input. |
| `z.string().min(1)` body content (`text` on `create_comment`, `description` on `create_database`) | `textarea` | Multi-line free input. |
| `z.string()` (`query` on `search`, where empty = "all") | `text` | Schema's only string field that accepts empty. |
| `z.number().int().positive().max(100)` (`pageSize`) | `number` with `numeric: {min:1, max:100, integer:true, step:1}` | Mirrors Notion's hard ceiling exactly. |
| `z.boolean()` (`archived`, `isInline`) | `boolean` | One-to-one. |
| Nested object / discriminated union (see §3.2) | `textarea` | Paste-JSON OR `{{...}}` reference. |

No `select` / `combobox` static-option fields are needed in this batch (the one candidate, `search.filter.value` enum of `page`/`database`, lives inside an object field — see §3.2).

No `string-array` fields are needed in this batch.

No `keyvalue` fields are needed in this batch (could fit `create_database.properties` with `value = property type name` but loses the SupportedPropertyType enum constraint and reshapes the user-facing object — defer to a follow-up if the JSON-paste UX becomes a pain point).

No `file` / `file-array` fields are needed in this batch.

### 3.2 Nested-object fields → `textarea` with paste-JSON placeholder

Six logical fields across the inventory carry nested object / array shapes that no single FieldType represents structurally. Follows the established `slack:post_interactive_blocks.blocks` pattern ([`integrations/slack/actions/postInteractiveBlocks.meta.ts:51-58`](../../../integrations/slack/actions/postInteractiveBlocks.meta.ts) — meta declares `textarea`, schema accepts the parsed object, author either pastes a JSON literal or wires `{{...}}` from upstream output).

| Field | Where it appears | Shape (per schema) |
| --- | --- | --- |
| `parent` | `create_page` | `{databaseId} \| {pageId}` (discriminated union) |
| `properties` (row values) | `create_page`, `update_page`, `create_database_entry` | `Record<name, {type, value}>` (typed discriminated map) |
| `children` | `create_page`, `create_database_entry`, `append_block_children` | `BlockSpec[]` (typed discriminated union, ≤100) |
| `icon` | `create_page`, `update_page`, `create_database_entry` | `{type:"emoji",emoji} \| {type:"external",external:{url}}` |
| `cover` | `create_page`, `update_page`, `create_database_entry` | `{type:"external",external:{url}}` |
| `filter` (db query) | `query_database` | `Record<string, unknown>` (forward-passed to Notion API) |
| `sorts` | `query_database` | `Record<string, unknown>[]` (forward-passed) |
| `filter` (search) | `search` | `{value:"page"\|"database", property:"object"}` |
| `properties` (db schema) | `create_database` | `Record<name, {type: SupportedPropertyType}>` (different shape from row-value properties) |

Every one of these is rendered as:
```ts
{
  name: "<fieldName>",
  label: "<Human label>",
  description: "<Shape doc + how to wire {{...}} from upstream>",
  type: "textarea",
  required: <schema-driven>,
  placeholder: '<short JSON literal example>',
}
```

Required helper text per field (drafted at implementation time): documents the shape, points authors at Notion's developer docs for the property/block types, and explicitly mentions both modes (paste JSON OR `{{...}}` reference).

### 3.3 Required vs optional

Mirror the Zod schemas exactly. Q11 (no hidden high-risk defaults) rides along — none of the Notion fields trip the high-risk list ([`learning/docs/handler-defaults-audit.md`](../../../learning/docs/handler-defaults-audit.md) registry). Schema-`refine`d cross-field constraints (`create_comment`'s `pageId XOR discussionId`; `update_page`'s "at least one mutating field"; `create_database`'s "exactly 1 title property") are surfaced via field descriptions only — the meta layer can't express XOR / "at least one of" / cardinality constraints, and the schema rejects bad payloads at runtime with a clear error.

### 3.4 What metas MUST NOT expose

- **`startCursor` fields.** Server-managed pagination handle. Workflows call the action again with `{{prev.nextCursor}}` for page 2. Matches every other paginated action in the codebase.
- **Internal handler knobs.** None currently exist on Notion handlers but the rule stands.
- **Raw bytes / base64 / content / data.** None apply — Notion has no FileRef-producing actions.

---

## 4. `optionsSource` strategy

**No Notion option resolvers ship in this slice.** All ID fields (`pageId`, `databaseId`, `blockId`, `userId`, `discussionId`, `parentPageId`) ship as `type: "text"` for v1.

Reasoning (matches the Slack precedent in [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md) §4.2 — ship coverage first, picker polish later):

- The two largest Notion field UX pain points (database picker, page picker) BOTH require new resolvers — `notion:databases` and `notion:pages`. Building them blocks the metadata batch on resolver work.
- Notion's search API is the natural backing for `notion:pages`, but workflows usually wire `pageId` from upstream `query_database.results[*].id` / `search.results[*].id` / `create_page.pageId` — the variable picker already handles this case.
- `notion:users` would benefit `get_user.userId`, but Notion workspaces rarely exceed 100 users; the single-page resolver model from `slack:channels` would land cleanly later.
- Block IDs are essentially never typed by hand — they come from upstream `append_block_children.childIds` / `get_block_children.blocks[*].blockId`. No resolver value here.
- The metadata coverage unlock (16 actions) dwarfs the marginal UX improvement on typed-id fields.

**Future possible resolvers** (each = same cost as `slack:channels` was — one new colocated file + one registry line + tests):

| Source | Backing API | Would unlock | Priority |
| --- | --- | --- | --- |
| `notion:databases` | `POST /v1/search` with `filter.value="database"` | `query_database.databaseId`, `create_database_entry.databaseId` | **Highest** — flips the two highest-value typed-id fields. |
| `notion:pages` | `POST /v1/search` with `filter.value="page"` | `update_page.pageId`, `get_page.pageId`, `archive_page.pageId`, `restore_page.pageId`, `append_block_children.blockId`, `list_comments.blockId`, `get_block.blockId`, `get_block_children.blockId`, `create_comment.pageId`, `create_database.parentPageId` | Medium — Notion search returns up to 100 results per call; large workspaces may exceed. |
| `notion:users` | `GET /v1/users` | `get_user.userId` | Low. |

Each resolver is a 1-slice polish on top of completed metadata coverage. **None block this batch.**

---

## 5. Output metadata strategy

Mirror handler return shapes verbatim. Verified by reading every handler under [`integrations/notion/actions/`](../../../integrations/notion/actions/) — output shapes are stable per the Slice 9 + Notion 2.1 commits.

### 5.1 Output discipline

- **No raw Notion response spreads at top level.** Every output names its fields explicitly per the handler's return statement.
- **Bounded sub-objects ARE allowed at the field level.** `parent`, `icon`, `cover`, `content`, `properties` (on `create_database` output), and `results` (on `query_database` / `search`) are all `object` / `array` outputs where the handler intentionally surfaces Notion's bounded sub-shape verbatim (per handler comments — workflows drill into known Notion fields). The variable picker treats these as drillable opaque values today; richer per-field metadata would require Notion-specific drill UI which is out of scope.
- **`search.results` is a known asymmetry.** Items are raw Notion search hits (the handler explicitly does not transform them — see [`search.ts:42-48`](../../../integrations/notion/actions/search.ts) comment "surfaces the search-list shape as-is"). Meta declares `results: array` — downstream workflows chain `get_page` for typed property values. NOT a meta-layer problem to fix; flagged so reviewers don't expect a tightened output shape in this PR.
- **No `bytes` / `base64` / `content` / `data` siblings.** Notion has no FileRef-producing actions. The single output named `content` (on `get_block`) is the Notion type-specific block payload, not a binary blob.
- **Output descriptions are picker-useful.** "Notion comment id — wire to `create_comment.discussionId` to reply on the same thread" beats "the comment id".

### 5.2 Per-action output shape summary

Drafted by reading each handler's `return { output: ... }`. Final descriptions land at meta-implementation time.

| Action | Outputs |
| --- | --- |
| `create_page` | `pageId: string`, `url: string`, `parent: object`, `createdTime: string`, `lastEditedTime: string` |
| `update_page` | `pageId: string`, `url: string`, `archived: boolean`, `lastEditedTime: string` |
| `query_database` | `results: array` (each row: `{id, url, archived, createdTime, lastEditedTime, properties: object, skippedProperties: array}`), `hasMore: boolean`, `nextCursor: string` |
| `create_database_entry` | mirrors `create_page` |
| `append_block_children` | `childIds: array` (of strings), `count: number` |
| `get_page` | `pageId: string`, `url: string`, `archived: boolean`, `parent: object`, `createdTime: string`, `lastEditedTime: string`, `properties: object`, `skippedProperties: array`, `icon: object`, `cover: object` |
| `search` | `results: array` (raw Notion hits — see §5.1), `hasMore: boolean`, `nextCursor: string` |
| `archive_page` | `pageId: string`, `url: string`, `archived: boolean`, `lastEditedTime: string` |
| `restore_page` | `pageId: string`, `url: string`, `archived: boolean`, `lastEditedTime: string` |
| `get_user` | `userId: string`, `object: string`, `type: string`, `name: string`, `avatarUrl: string`, `personEmail: string`, `botOwnerType: string`, `botOwnerUserId: string`, `botWorkspaceName: string` |
| `list_users` | `users: array` (each item matches `get_user` output shape), `nextCursor: string`, `hasMore: boolean` |
| `create_comment` | `commentId: string`, `object: string`, `parentType: string`, `parentId: string`, `parentBlockId: string`, `discussionId: string`, `plainText: string`, `createdTime: string`, `lastEditedTime: string`, `createdByUserId: string` |
| `list_comments` | `comments: array` (each item matches `create_comment` output shape), `nextCursor: string`, `hasMore: boolean` |
| `create_database` | `databaseId: string`, `object: string`, `url: string`, `title: string`, `description: string`, `archived: boolean`, `isInline: boolean`, `parentType: string`, `parentId: string`, `createdTime: string`, `lastEditedTime: string`, `properties: object` |
| `get_block` | `blockId: string`, `object: string`, `type: string`, `archived: boolean`, `hasChildren: boolean`, `parentType: string`, `parentId: string`, `createdTime: string`, `lastEditedTime: string`, `plainText: string`, `content: object` |
| `get_block_children` | `blocks: array` (each item matches `get_block` output shape), `nextCursor: string`, `hasMore: boolean` |

All `producesFileRef` / `consumesFileRef` flags are **false** for every Notion action.

---

## 6. Category strategy

`ActionCategorySchema` ([`contracts/actionMeta.ts:306-321`](../../../contracts/actionMeta.ts)) enum: `messaging`, `email`, `calendar`, `files`, `data`, `commerce`, `crm`, `marketing`, `developer`, `logic`, `http`, `transform`, `scheduling`, `other`. There is no `productivity` / `docs` / `knowledge_base` category.

**Recommendation: all 16 Notion actions use `category: "data"`.** Reasoning:

- The Slack precedent ([`slack-action-metadata-plan.md`](./slack-action-metadata-plan.md) §9.2) is "one category per provider unless a clear distinction exists, matching the trigger convention." Notion has no triggers, so the convention comes from the dominant surface — all 16 actions manipulate Notion's data model (pages, databases, blocks, comments, users).
- `data` is the closest fit for query/CRUD over structured records. Notion's database actions are explicit data-table operations (`query_database`, `create_database_entry`, `create_database`); page/block/comment/user actions are data-model CRUD around the same workspace tree.
- Alternatives considered and rejected:
  - **`other`** — would group Notion with the catch-all bucket; provides no UX grouping value.
  - **Split between `data` (databases) + `other` (pages/blocks/users)** — inconsistent with the "one category per provider" precedent and creates a weak split (databases ARE pages in Notion's model).
  - **`crm`** — semantically wrong; Notion isn't a contact system.
  - **`messaging`** — could apply to `create_comment` / `list_comments`, but two actions out of 16 doesn't warrant a per-action category split.

The picker UI already groups by category visually; using a single Notion category keeps the surface compact.

---

## 7. Implementation grouping

**Recommendation: TWO implementation slices.** Group split by surface area:

### 7.1 Slice 3.41 — Notion pages + databases (9 actions)

`create_page`, `update_page`, `archive_page`, `restore_page`, `get_page`, `create_database`, `create_database_entry`, `query_database`, `search`.

Why grouped together: every action keys on `pageId` / `databaseId` and exercises the page/database surface that's the bulk of Notion workflows. The paste-JSON fields (`properties`, `children`, `icon`, `cover`, `filter`, `sorts`) all live in this batch. Largest single slice but the metas share shape.

### 7.2 Slice 3.42 — Notion blocks + comments + users + COVERED_PROVIDERS flip (7 actions + structural)

`append_block_children`, `get_block`, `get_block_children`, `create_comment`, `list_comments`, `get_user`, `list_users` + Notion added to `COVERED_PROVIDERS` + final regression sweep.

Why grouped: smaller actions with bounded fields (one mandatory id + optional pagination on the read variants). `append_block_children` is the only paste-JSON action in the group (`children`). The block + comment + user surfaces ride together because they share the "bounded read with `nextCursor` pagination" pattern and none of them need new picker UX.

### 7.3 Slice size rationale

- 3.41 is the heavier slice (9 actions) — acceptable because the metas share shape (page/database id + paste-JSON nested fields). Three actions involve JSON-paste UX (`create_page`, `update_page`, `create_database_entry`); two more involve raw filter/sort JSON (`query_database`, `search`); the rest are id-only.
- 3.42 is the smaller slice (7 actions) and bundles the coverage flip — same precedent as Slack Slice 3.38 (D + E groups + flip in one PR).

### 7.4 Alternative groupings considered

- **Single slice (all 16).** Reject for the same reason the Slack arc avoided it — a 16-meta single PR is unforgiving, any one meta error blocks the whole batch, and the JSON-paste field UX is novel enough to warrant a smaller second-iteration slice.
- **Three slices (databases / pages / blocks+comments+users).** Reject — the database/page actions are too coupled (database entries ARE pages) to split cleanly.
- **Four slices matching the original Slice 9 commits.** Reject — the original commit boundaries reflect runtime implementation order, not metadata UX shape.

---

## 8. `COVERED_PROVIDERS` strategy

Notion stays out of [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) `COVERED_PROVIDERS` until the final Slice 3.42. Until then the structural test treats Notion as uncovered (`{native, github, gmail, microsoft-outlook, slack}` only).

The flip itself is one line + a green regression sweep:

```ts
const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
  "slack",
  "notion",         // ← added at the end of Slice 3.42
]);
```

The structural test will then enforce: every Notion handler in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (16 entries) MUST have a meta in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts). Drift becomes a build error.

The flip MUST land in the same PR as the last batch of metas (Slice 3.42) so the test goes green in one move. Splitting the flip and the final metas would mean a red `main` between PRs.

---

## 9. Testing strategy

### 9.1 Per-slice registry tests

Each implementation slice adds metas to [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts) and extends [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts) with per-action assertions:

- Notion action count matches the registered handler count (16 after Slice 3.42).
- All Notion metas have `provider: "notion"`.
- All Notion metas have `requiresIntegration: true`.
- All Notion metas have `category: "data"` (pinned per §6).
- All Notion metas have `producesFileRef: false` and `consumesFileRef: false`.
- Field names + types + required flags mirror the Zod schema (per-action).
- Outputs match the handler return shape verbatim (per-action).
- `displayOrder` is unique within Notion and produces a stable sort.

### 9.2 Provider-route count test

[`tests/unit/app/api/providers/providers-route.test.ts:113-122`](../../../tests/unit/app/api/providers/providers-route.test.ts) currently asserts `notion.hasMetadata === false`. **First implementation slice (3.41) flips this assertion to `true` AND adds a new test paralleling Slack's** ([providers-route.test.ts:168-244](../../../tests/unit/app/api/providers/providers-route.test.ts)) that asserts the full action list in displayOrder. The final form after Slice 3.42 will be a 16-entry array.

### 9.3 Integration tests

Add tests sparingly — one canonical builder-shell flow per major UX shape, not one per action. Mirror the Slack precedent ([`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md) §8.3):

| Slice | Canonical integration test | Why this action |
| --- | --- | --- |
| 3.41 | `notion-create-page-config.test.tsx` | Exercises the canonical paste-JSON UX (`parent`, `properties`, `children`, `icon`, `cover` — five JSON fields in one action). If this works, the remaining JSON-paste fields across the batch work. |
| 3.41 | `notion-query-database-config.test.tsx` | Exercises `databaseId` (text) + paste-JSON `filter` + `sorts` + `pageSize` (number with bounds). Different JSON-field shape from create_page. |
| 3.42 | `notion-append-block-children-config.test.tsx` | Exercises the dual-meaning `blockId` field (block-or-page) + the `children` paste-JSON UX in a smaller meta. |
| 3.42 | `notion-list-comments-config.test.tsx` | Exercises the bounded-read shape: required id field + optional pagination + `cursor` field intentionally absent. |

**Total: 4 integration tests across 2 slices.** Mirrors the proportions Slack used (6 tests / 29 metas ≈ Notion's 4 / 16). Each test only asserts the meta drives a valid form — not Notion API behavior.

### 9.4 Structural test

The `COVERED_PROVIDERS` flip in Slice 3.42 triggers the structural test's full 1:1 sweep. The same PR must produce zero violations.

---

## 10. Out of scope

- **Runtime Notion handler changes.** Every meta mirrors the existing schema; no schema rewrites, no handler reshaping, no new Notion API calls.
- **Notion OAuth scope changes.** All scopes for currently-registered handlers already ship in [`integrations/notion/manifest.ts`](../../../integrations/notion/manifest.ts).
- **New Notion actions.** Adding new endpoints (`databases.update`, `blocks.update`, `blocks.delete`, etc.) is not part of metadata coverage.
- **`notion:databases` / `notion:pages` / `notion:users` resolvers.** Each is a follow-up after the coverage flip — see §4 future-resolver table.
- **Structured Notion property editor.** Paste-JSON UX is the v1 — a typed property editor (column picker → value input by inferred type) would require Notion-database schema discovery (another DB call per modal open) and a new FieldType. Out of scope.
- **Notion block builder UI.** Same reason as above for `children`.
- **Rich-text editor.** `text` on `create_comment` ships as plain `textarea`; mark-up authoring is future polish.
- **Database schema discovery.** Reading a database's column schema to drive the create_database_entry properties UI requires both a resolver and a new field type. Future.
- **Multi-select async combobox.** Slice 3.7 deferral stands; no Notion field needs it today.
- **Type-aware variable picker filtering.** Out of scope per FileRef deferrals (D-FRA-6 / D-SFR-10).
- **Triggers.** Notion has zero V2 trigger handlers and Notion's webhook API is manual-config-only (per manifest comment) — no trigger metadata batch follows this arc.
- **Canvas polish.** Out of scope per the checkpoint recommendation (§9 of the checkpoint).
- **Pushing / PR creation.** Local-only branch.

---

## 11. Open decisions for Marcus

Recommended defaults listed first; mark disagreements when accepting the plan.

| Decision | Recommended default | Why |
| --- | --- | --- |
| Single slice (all 16) vs two slices (9 + 7)? | **Two slices: 3.41 (9 actions) / 3.42 (7 actions + flip).** | Mirrors the Slack 4-slice cadence at half the scale. The 9-action first slice is the heaviest pure-meta slice in any provider arc to date but the metas share shape; the 7-action second slice bundles the COVERED_PROVIDERS flip + smaller surfaces. |
| Should Notion IDs (`pageId`, `databaseId`, `blockId`, `userId`) stay as `text` in v1? | **Yes — defer all resolvers to follow-up slices.** | Lands 16 actions immediately; resolvers are 1-slice polish work on top of completed coverage. Authors wire IDs from upstream `query_database.results[*].id` / `search.results[*].id` / `create_page.pageId` via the variable picker (most common pattern). |
| Should the first resolver (`notion:databases`) ship BEFORE Slice 3.41 to flip 2-3 high-value fields from day one? | **No — ship metadata batch first.** | The same precedent that Slack followed — resolver-less first slice (3.27 `upload_file` was text-only `channel`), resolver-paired upgrade later (3.32 retrofit). Building the resolver first delays the bigger metadata unlock. |
| Category — one (`data`) or per-action split? | **One — all 16 actions use `data`.** | Matches the "one category per provider" precedent set by Slack (`messaging` for 28 of 31, `files` only for the 3 file actions). No comparable cleanly-distinct sub-surface inside Notion. |
| Should paste-JSON fields ship as `textarea` for v1? | **Yes — mirror `slack:post_interactive_blocks.blocks` exactly.** | The only established pattern for nested-object FieldMeta today. Authors paste from Notion's API docs / Block Kit Builder analog or wire `{{...}}` from upstream. A structured editor is its own infrastructure investment and would duplicate Notion's API docs UX. |
| Canonical integration tests — 4 total or more? | **4 total (2 per slice).** | Slack ratio was 6/29 ≈ 21%; 4/16 = 25%. Covers the four distinct UX shapes (heavy paste-JSON, query-with-JSON-filter, dual-meaning-id + paste-JSON, bounded-read pagination). Extra per-action tests are diminishing returns. |
| Should `COVERED_PROVIDERS` flip in Slice 3.41 (after 9 metas) or 3.42 (after all 16)? | **3.42 only.** | Same precedent as Slack — flip lands with the last batch of metas so the structural test goes green in one move. Flipping after 9 would mean 7 missing handlers would break the test until 3.42. |
| Should `search.results` raw-passthrough be tightened (handler change) before the meta ships? | **No — meta mirrors the current handler exactly.** | Reshaping outputs is a runtime concern. Metas are a documentation surface — if the handler returns raw search hits, the meta declares `results: array` and lets downstream actions drill. A future runtime cleanup slice can tighten the shape; until then, meta accuracy beats meta aspiration. |
| Should `keyvalue` be used for `create_database.properties` (column-schema map)? | **No — paste-JSON `textarea` for v1.** | `keyvalue` is `Record<string, string>`. The schema's `properties` value is `{type: SupportedPropertyType}` — an object, not a string. Using `keyvalue` would either lose the enum or require a reshape at form-submit time. textarea preserves correctness; a future `notion:property-schema` typed editor can replace it. |
| Cross-field XOR / "at-least-one" / "exactly-one" constraints (`create_comment`, `update_page`, `create_database`) — express in meta or only in description? | **Description-only — the schema enforces at runtime.** | `FieldMetaSchema` can't express XOR / "at least one of" / cardinality across fields. Following the established Slack convention (e.g. `cancelScheduledMessage` field-pair constraints documented in descriptions only). |

---

## 12. Acceptance criteria for the arc

By the end of Slice 3.42:

- ✅ All 16 Notion action handlers have metas in [`services/discovery/_registry.ts`](../../../services/discovery/_registry.ts).
- ✅ Notion is in `COVERED_PROVIDERS` and [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) passes.
- ✅ [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) asserts `notion.hasMetadata === true` and the full 16-action Notion list in displayOrder.
- ✅ Every meta field mirrors its Zod schema (required/optional, type, paste-JSON for nested objects).
- ✅ Every output mirrors its handler's `return { output: ... }` shape verbatim.
- ✅ Every Notion meta declares `category: "data"`, `requiresIntegration: true`, `producesFileRef: false`, `consumesFileRef: false`.
- ✅ Four new integration tests covering the canonical UX shapes (per §9.3).
- ✅ `npm test` green, `tsc` clean, lint clean (apart from the existing pre-PR `_registry.ts` max-lines warning).
- ✅ No runtime Notion handler changes shipped under this arc.
- ✅ No new `optionsSource` resolvers introduced under this arc.
- ✅ Local-only branch `v2-provider-port-local`; no pushes.

Stretch (Slice 3.43+):

- ✅ `notion:databases` resolver shipped; `query_database.databaseId` + `create_database_entry.databaseId` flipped from `text` to `combobox` + `optionsSource: "notion:databases"`.
- ✅ Optional `notion:pages` resolver shipped; the 10 page-id-bearing fields flipped to `combobox`.
- ✅ Optional `notion:users` resolver shipped; `get_user.userId` flipped to `combobox`.
