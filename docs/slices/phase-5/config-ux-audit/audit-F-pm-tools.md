# Config UX Audit — Group F: PM tools (notion, airtable, trello, asana, typeform, calendly)

Scope: 59 nodes / 192 fields, verified against `integrations/<provider>/actions/*.meta.ts` + `*.schema.ts` and `services/options/_registry.ts`.

## Systemic patterns

1. **Required payload lives behind `advanced: true` JSON (9 fields, 8 nodes).** notion `create_page.parent`, `create_page.properties`, `create_database.properties`, `create_database_entry.properties`, `append_block_children.children`; airtable `create_record.fields`, `update_record.fields`, `create_multiple_records.records`, `update_multiple_records.records`. These are `required: true` AND `advanced: true` — with the new Advanced tab, the node's *essential content* is off the normal path. A first-time nontechnical user cannot finish these nodes at all (audit Q12 fails). The escape hatches are deliberate (CONFIG-UX-AUDIT-2) and the grammars are irreducible this slice, but the Advanced tab MUST badge required-missing advanced fields in readiness, or these nodes look "done" while unconfigured.
2. **Notion id fields are raw text where a picker already exists (9 fields).** `notion:pages` resolver exists (search-backed, supports `ctx.q`, already backs `list_comments.blockId`). `update_page.pageId`, `get_page.pageId`, `archive_page.pageId`, `restore_page.pageId`, `create_comment.pageId`, `create_database.parentPageId`, `append_block_children.blockId`, `get_block.blockId`, `get_block_children.blockId` are all plain text. Combobox + `allowManualEntry` preserves the string value shape and the `{{...}}` wiring path. `query_database.databaseId` / `create_database_entry.databaseId` need a **new-resolver** `notion:databases` (same `/v1/search` wrapper with `filter: {value:"database"}` — real API, existing scope; the createPage.meta.ts header comment already anticipates exactly this).
3. **Trello `pos` is runtime-broken for numeric input (4 nodes).** Schema is `z.union([z.literal("top"), z.literal("bottom"), z.number().positive()])` (createCard/updateCard/moveCard/createList.schema.ts) but the field is `text`. A typed `"65536"` commits a *string* and fails Zod at runtime (no parse layer). Only "top"/"bottom" survive from the UI.
4. **Pagination cursors sit in the normal path (3 fields).** `airtable:list_records.offset`, `typeform:list_responses.before`, `asana:list_tasks_in_project.offset` are loop-composition plumbing → `advanced: true`. Notion inversely exposes *no* cursor (documented "server-managed; intentionally NOT exposed" in 5 metas) — accepted, but note the cross-provider inconsistency for the loop-on-`nextCursor` story.
5. **Either-or target invisible to readiness (1 node).** `notion:create_comment` requires exactly one of `pageId`/`discussionId` via `.refine()`; both fields are optional in meta, so a user can save neither and only fail at runtime.
6. **Strong pattern done well everywhere else:** UI-scope cascade pickers (trello `boardId`, asana `workspaceId`→`projectId`→`taskGid`, airtable `baseId`→`tableIdOrName`→fields/views) with `allowManualEntry`-style paste fallbacks and honest placeholders. Triggers across all six providers are uniformly clean.

### JSON escape hatches: irreducible vs reducible (assessment requested)

| Field | Verdict |
|---|---|
| notion `properties` (create_page / create_database_entry), `create_database.properties`, `children` BlockSpec[] | **Irreducible this slice** — typed DSL over per-database column schemas; do not rebuild (per brief). Future: schema-aware property editor. |
| notion `query_database.filter` / `sorts` | **Irreducible by design** — passed verbatim (queryDatabase.schema.ts documents V1's advancedQuery builder as intentionally skipped). Keep advanced json. |
| notion `create_page.parent` | **Reducible in principle** (2-key discriminated union) but not with meta-only edits — a structured editor emitting `{databaseId}` XOR `{pageId}` needs the `object`/discriminated editor + `notion:databases` resolver. Flag as next-slice candidate; wording fix now. |
| notion `icon` | Discriminated 2-shape union — not a flat fixed-key object; **not** an `object`-editor candidate yet. Keep. |
| notion `cover` | Single fixed shape but nested (`external.url`) — borderline; keep json, LOW candidate. |
| notion `search.filter` | **Reducible now** — runtime accepts only `{"value":"page"|"database","property":"object"}`; `object` editor with `value` select + `property` defaulted to "object" commits the identical shape. |
| airtable `fields`/`records` (create/update ×4) | **Irreducible this slice** — typed `{type,value}` map keyed by field name (\_fieldInput.schema.ts, 15-variant discriminated union). Best future candidate for a schema-aware row editor (airtable:fields + getTableSchema already exist), but that is DSL-rebuild territory. |
| airtable `list_records.sort` | **Reducible now** — `[{field, direction?}]` maps 1:1 onto `object-list` with itemFields `field` (combobox `airtable:fields`, deps baseId+tableIdOrName) + `direction` (select asc/desc). Identical committed array shape. |

---

## notion (16 nodes)

### notion:create_page (action) — Create Page
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| parent | json req+adv | The node's core decision ("where does the page go") demands hand-authored discriminated JSON | `{{...}}` wiring | core-user-decision (mis-shipped as unsupported-raw-config) | none possible meta-only; next slice: discriminated editor + notion:databases picker | keep json; reword desc to lead with outcome | none (Q11-like: must pick one) | shape `{databaseId}∨{pageId}` preserved | none (wording) |
| properties | json req+adv | Typed property DSL; irreducible this slice | full property map | structured-composition | — | keep; desc OK (lists supported types) | none | verbatim | none |
| children | json opt+adv | OK as advanced escape hatch; desc lists the 9 types | block authoring | structured-composition | — | keep | omitted = no blocks | verbatim | none |
| icon, cover | json opt+adv | OK as advanced; small but discriminated/nested shapes | branding | advanced-user-control | — | keep | omitted | verbatim | none |

### notion:update_page (action) — Update Page
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| pageId | text req | Raw id entry; `notion:pages` picker already exists | paste/wire id | provider-resource-selection | combobox src `notion:pages`, allowManualEntry | — | — | string value unchanged | low |
| properties | json opt+adv | PATCH-semantics desc is good | property patch | structured-composition | — | keep | omitted = untouched | verbatim | none |
| archived | boolean opt | Desc already steers to Archive/Restore actions; niche on this node | tri-state control | advanced-user-control | move `advanced: true` | keep desc | omitted = unchanged | boolean | low |
| icon, cover | json opt+adv | OK; `null`-to-clear documented | clear/set | advanced-user-control | — | keep | omitted | verbatim | none |

### notion:archive_page / notion:restore_page / notion:get_page (actions)
Single `pageId` text field each — descriptions honest (rows-are-pages note is genuinely helpful). Only finding: convert to combobox `notion:pages` + allowManualEntry (provider-resource-selection). Otherwise OK.

### notion:create_database (action) — Create Database
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| parentPageId | text req | Raw id; pages picker exists | wire id | provider-resource-selection | combobox `notion:pages`, allowManualEntry | — | — | string | low |
| title, description, isInline | text/textarea/boolean | OK — plain language, wrapper synthesizes rich_text (correctly derived, not shown) | — | core-user-decision / safe-default | keep | — | isInline omitted = Notion default (documented) | — | none |
| properties | json req+adv | Required column schema behind Advanced; "EXACTLY ONE title" rule only in desc | schema authoring | structured-composition | none meta-only; candidate for object-list (name + type select) next slice — flat `{name:{type}}` map is *nearly* reducible | keep; desc truncation risk: keep supported-type list ≤200 chars | none | verbatim | none |

### notion:create_database_entry (action) — Create Database Entry
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| databaseId | text req | Raw id, no picker exists yet | provider-resource-selection | combobox, **new-resolver** `notion:databases` (search filter value=database; existing scope), allowManualEntry | string | low |
| properties/children/icon/cover | json req/opt +adv | Same as create_page — properties required behind Advanced (systemic #1) | structured-composition | keep this slice | verbatim | none |

### notion:query_database (action) — Query Database
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| databaseId | text req | Raw id | provider-resource-selection | combobox new-resolver `notion:databases`, allowManualEntry | string | low |
| filter, sorts | json opt+adv | Verbatim-passthrough is a documented design decision; desc says "see Notion's filter docs" — honest for an advanced field | unsupported-raw-config (deliberate) | keep; irreducible | verbatim | none |
| pageSize | number opt | Plumbing in normal path | advanced-user-control | `advanced: true` | number | none |

### notion:search (action) — Search
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| query | text req def="" | Good — empty-string default satisfies readiness, title-only caveat is excellent honesty | core-user-decision | keep | string | none |
| filter | json opt+adv | Runtime accepts exactly 2 shapes → json overkill | conditional-option | convert to `object` editor: `value` select [page, database], `property` fixed default "object". Commits identical object | same object shape | low |
| pageSize | number opt | plumbing | advanced-user-control | `advanced: true` | number | none |

### notion:append_block_children (action) — Append Block Children
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| blockId | text req | pages picker covers the dominant page-id case; allowManualEntry keeps block ids | provider-resource-selection | combobox `notion:pages`, allowManualEntry; desc keeps "block ids accepted" | string | low |
| children | json req+adv | Required content behind Advanced (systemic #1); grammar irreducible | structured-composition | keep; ensure Advanced-tab required badge | verbatim | none |

### notion:get_block / notion:get_block_children (actions)
`blockId` text (+ optional `pageSize` on children). OK overall; same combobox-with-manual-entry upgrade applies (LOW — block ids genuinely come from upstream wiring most of the time; descriptions already say so). `pageSize` → advanced (LOW).

### notion:create_comment (action) — Create Comment
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| pageId | text opt | XOR with discussionId enforced only by runtime `.refine()` — readiness lets user save neither (runtime fail) | provider-resource-selection | combobox `notion:pages` allowManualEntry; desc: "Set this OR Discussion ID — exactly one." | string | low |
| discussionId | text opt | OK as wire-from-upstream field; desc good | upstream-data-mapping | keep | string | none |
| text | textarea req | Good — plain text, wrapper synthesizes rich_text | core-user-decision | keep | string | none |
| (node) | — | Either-or gap | — | FLAG: needs either-or readiness semantics or a UI-scope `target` selector (schema addition mirroring Trello `boardId` TRELLO-META-3 precedent) — owner decision, not a meta-only edit | — | medium |

### notion:list_comments (action) — List Comments
No findings — `blockId` already a `notion:pages` combobox (the precedent for systemic #2); `pageSize` → advanced is the only (LOW) nit.

### notion:get_user / notion:list_users (actions)
No findings — `userId` is a `notion:users` combobox with wiring guidance; `list_users.pageSize` LOW-advanced nit. Clean.

## airtable (12 nodes)

### airtable:list_records (action) — List Records
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| baseId, tableIdOrName, view, fields | combobox cascade | Exemplary — existing resolvers, honest placeholders | provider-resource-selection | keep | — | none |
| filterByFormula | textarea opt | Airtable formula grammar in the normal path; example helps but wording is provider-internal | advanced-user-control | `advanced: true`; desc: "Only return records matching an Airtable formula, e.g. {Status}='Open'. Leave empty to return all records." | string verbatim | low |
| sort | json opt+adv | `[{field, direction?}]` — flat, fixed keys, resolver exists | structured-composition | convert json → `object-list` (itemFields: `field` combobox `airtable:fields` deps [baseId, tableIdOrName]; `direction` select [asc, desc]) | identical array shape | low |
| pageSize, maxRecords | number opt | acceptable in normal path (result-size is a user decision); maxRecords fine | core-user-decision | keep | number | none |
| offset | text opt | Loop plumbing in normal path | advanced-user-control | `advanced: true` | string | none |

### airtable:get_record / airtable:delete_record (actions)
No findings — base/table pickers + `recordId` text with "usually mapped from an upstream step" guidance. `airtable:records` picker was deliberately rejected for v1 (registry comment: "large/ambiguous") — text + wiring is the accepted design (upstream-data-mapping). delete_record is destructive but single-purpose and honestly labeled.

### airtable:find_record (action) — Find Record
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| filterByFormula | textarea req | Required formula grammar — but it IS the node's core decision and desc gives a concrete example + TRUE() escape. Passes with wording polish | core-user-decision | desc: "Formula that identifies the record, e.g. {Email}='a@b.com' matches by the Email field. Use TRUE() to take the first record." | string | none |
| baseId, tableIdOrName | combobox | OK | provider-resource-selection | keep | — | none |

### airtable:create_record / airtable:update_record (actions)
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| fields | json req+adv | Systemic #1 — required typed `{type,value}` map behind Advanced; 15-type discriminated union is irreducible meta-only | structured-composition | keep this slice; top candidate for future schema-aware editor (getTableSchema + airtable:fields exist) | verbatim | none |
| typecast | boolean req def=false | Q11-style behavior switch with explicit visible default — correctly required, correctly defaulted, plain description. Good | core-user-decision | keep (do NOT move to advanced — recipient-visible coercion behavior) | boolean | none |
| recordId (update) | text req | upstream-mapping, honest desc | upstream-data-mapping | keep | string | none |

### airtable:create_multiple_records / airtable:update_multiple_records (actions)
Same profile as the single-record variants: `records` json req+adv (systemic #1, irreducible — array-of-rows over the same typed map; desc examples are good and include the recordId key for updates), `typecast` OK. No meta-only fix; future structured editor candidate.

### airtable:add_attachment (action) — Add Attachment
No findings — `fieldName` uses the purpose-built `airtable:attachment_fields` resolver, `file` consumes upstream FileRef with an honest "stage bytes first" note, `filename` optional with derivation stated. This is the model node for the group.

### airtable:get_base_schema / airtable:get_table_schema (actions)
No findings — pickers + `includeViews` required-with-default boolean (readiness-satisfiable, plain wording).

### airtable:record_changed (trigger) — Record Changed
No findings — base picker + optional table narrowing with "leave empty to watch all tables" (correct optional-filter idiom).

## trello (14 nodes)

### trello:create_card (action) — Create Card
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| boardId, listId, idMembers, idLabels | combobox cascade | Exemplary UI-scope pattern (boardId documented as non-handler scope key in schema) | provider-resource-selection | keep | — | none |
| name, desc | text/textarea | OK | core-user-decision | keep | — | none |
| pos | text opt | **Runtime-broken for numbers**: schema `union(["top","bottom", z.number()])` but text commits string → Zod fail | conditional-option | convert text → select options [top, bottom] + `advanced: true`; desc: "Where the card is placed in the list. Leave empty for Trello's default." Note: precise numeric placement only via a `{{...}}` mapping that resolves to a number | "top"/"bottom" strings valid; numeric branch reachable only via variables (already the only working path) | low — existing numeric configs (if any) stay schema-valid |
| due, start | datetime-utc opt | Widget is right; desc leaks wire format + markdown `**UTC**` | core-user-decision | desc: "Optional due date (UTC)." | string | none |
| dueComplete | boolean opt | OK | core-user-decision | keep | boolean | none |

### trello:update_card (action) — Update Card
Same `pos` finding (HIGH→same fix) and due/start wording nit. All other fields OK — optional-means-unchanged phrasing is consistent; runtime has an at-least-one-mutation refine (acceptable: clear error). `closed` boolean plainly worded.

### trello:move_card (action) — Move Card
Same `pos` finding. boardId/cardId/idList cascade OK ("Target List" label is good outcome language).

### trello:archive_card (action) — Archive Card
No findings — cardId cascade + `closed` boolean defaulted true with "On archives; off unarchives" (clear, readiness-satisfied).

### trello:add_comment / trello:add_label_to_card (actions)
No findings — cascade pickers, plain labels, Markdown note on comment body is user-relevant not jargon.

### trello:create_list (action) — Create List
Same `pos` finding (schema union identical). idBoard/name OK.

### trello:create_board (action) — Create Board
No findings — `visibility` is the group's best Q11 execution: required select, no default, explicit "⚠ Public = anyone with the URL" warning. defaultLists boolean plain.

### trello triggers ×6 — new_card, card_updated, card_moved, comment_added, member_changed, card_archived
No findings — each is a single required `trello:boards` combobox with per-event descriptions. Clean.

## asana (12 nodes)

### asana:create_task / asana:create_subtask (actions)
No findings — workspace→project→(parent task)→assignee cascade with honest "Unassigned" / "Leave empty" placeholders; name/notes/dueOn plain. Model nodes.

### asana:update_task (action) — Update Task
No findings — "New task name / Leave empty to keep the current name" is exactly the right update idiom; runtime at-least-one refine gives a clear error on empty updates (minor: readiness can't see it — same class as systemic #5 but low impact since all mutation fields are visible).

### asana:complete_task / asana:get_task / asana:add_comment_to_task (actions)
No findings — pure cascade + (for comment) one required textarea.

### asana:list_tasks_in_project (action) — List Tasks in Project
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| offset | text opt | Loop plumbing in normal path | advanced-user-control | `advanced: true` | string | none |
| others | — | OK | — | keep | — | none |

### asana triggers ×5 — new_task_in_project, task_updated_in_project, task_completed, task_assigned, comment_added_to_task
No findings — workspace/project cascade; task_assigned's optional assignee filter with "Any assignee" placeholder is the right optional-filter idiom.

## typeform (3 nodes)

### typeform:list_responses (action) — List Responses
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| before | text opt | Cursor plumbing in normal path | advanced-user-control | `advanced: true` | string | none |
| formId, pageSize, since, until, query | — | OK — draft-form caveat on formId is excellent honesty; since/until plain outcome language | core / provider-resource-selection | keep | — | none |

### typeform:get_response (action) — Get Response
No findings — `responseToken` desc explicitly tells the user where the value comes from ("map the trigger's responseToken here"). Textbook upstream-data-mapping.

### typeform:new_response_in_form (trigger)
No findings — single form picker with the draft-form caveat.

## calendly (2 nodes)

### calendly:event_scheduled / calendly:event_canceled (triggers)
No findings — optional event-type filter, "Leave empty to fire for all event types", "All event types" placeholder. The cleanest provider in the group.

---

## Change list

### HIGH
1. **trello pos ×4** — `integrations/trello/actions/createCard.meta.ts`, `updateCard.meta.ts`, `moveCard.meta.ts`, `createList.meta.ts`, field `pos`: convert `type: "text"` → `type: "select"` with options `[{value:"top",label:"Top of list"},{value:"bottom",label:"Bottom of list"}]`, add `advanced: true`, description: `"Where the item is placed. Leave empty for Trello's default. For a precise numeric position, map a number from a variable."` Rationale: text commits a string; the schema's `z.number().positive()` branch rejects `"65536"` at runtime — the numeric path is already UI-unreachable, the select makes the field honest. No schema change; existing valid configs unaffected.
2. **Advanced-tab readiness badge for required advanced fields** (infra, this slice's Advanced tab work): notion `create_page.parent/properties`, `create_database.properties`, `create_database_entry.properties`, `append_block_children.children`; airtable `create_record.fields`, `update_record.fields`, `create_multiple_records.records`, `update_multiple_records.records`. If the Advanced tab ships without a required-missing indicator, 8 of this group's highest-traffic write nodes appear configurable but are not. (Meta edits alone cannot fix; do not un-advance these — the JSON belongs in Advanced.)
3. **notion:create_comment either-or gap** — `integrations/notion/actions/createComment.meta.ts`: readiness allows saving with neither `pageId` nor `discussionId` (runtime `.refine()` XOR). Minimal now: description on `pageId` → `"Page to start a NEW comment thread on. Set this OR Discussion ID — exactly one."`; on `discussionId` → `"Existing thread to reply to (from a previous comment step). Set this OR Page ID — exactly one."` Durable fix (flag, owner decision): either-or readiness semantics or a UI-scope selector key (mirrors Trello boardId precedent; touches schema).

### MEDIUM
4. **notion page-id fields → `notion:pages` combobox (existing resolver), `allowManualEntry: true`** — fields: `updatePage.meta.ts:pageId`, `getPage.meta.ts:pageId`, `archivePage.meta.ts:pageId`, `restorePage.meta.ts:pageId`, `createComment.meta.ts:pageId`, `createDatabase.meta.ts:parentPageId`, `appendBlockChildren.meta.ts:blockId`. Keep current descriptions' wiring guidance; value stays a string. Example desc (update_page.pageId): `"Page to update. Pick one, paste an id, or wire {{...}} from an upstream step."`
5. **new-resolver `notion:databases`** (search wrapper + `filter:{value:"database",property:"object"}` — same API/scope as `notion:pages`) backing `queryDatabase.meta.ts:databaseId` and `createDatabaseEntry.meta.ts:databaseId` as combobox + `allowManualEntry`. (Anticipated in createPage.meta.ts's own header comment.)
6. **airtable list_records.sort json → object-list** — `integrations/airtable/actions/listRecords.meta.ts`: `type: "object-list"`, itemFields `field` (combobox `airtable:fields`, deps `["baseId","tableIdOrName"]`, required) + `direction` (select `asc`/`desc`, optional). Committed value shape unchanged (`[{field, direction?}]`). Description: `"Sort the returned records by one or more fields."`
7. **Cursor fields → advanced** — `airtable/actions/listRecords.meta.ts:offset`, `typeform list_responses meta:before`, `asana .../listTasksInProject.meta.ts:offset`: add `advanced: true` (descriptions already correct).
8. **airtable filterByFormula (list_records) → advanced** — `listRecords.meta.ts`: add `advanced: true`; desc: `"Only return records matching an Airtable formula, e.g. {Status}='Open'. Leave empty to return all records."` (find_record's stays in setup — it is that node's core decision.)
9. **notion search.filter json → `object` editor** (if the new object editor lands): `search.meta.ts:filter` — fields `value` select [page, database], `property` fixed/defaulted `"object"`. Commits the identical 2-key object. Otherwise keep json.
10. **notion update_page.archived → advanced** — `updatePage.meta.ts`: add `advanced: true` (desc already steers to the dedicated Archive/Restore actions).
11. **notion create_page.parent wording** — `createPage.meta.ts`: description → `"Where the page is created: {\"databaseId\":\"<id>\"} adds a row to that database; {\"pageId\":\"<id>\"} creates a subpage. Set exactly one key, or wire {{...}} from upstream."` (outcome-first; stays on an advanced field so JSON copy is allowed). Mark as next-slice structured-editor candidate — do not rebuild now.

### LOW
12. **pageSize → advanced across list-style nodes** — notion `query_database`, `search`, `get_block_children`, `list_comments`, `list_users`; asana `list_tasks_in_project`; typeform `list_responses`; airtable `list_records` (`pageSize` + `maxRecords` may stay — result-count is arguably a user decision; apply judgment per node).
13. **trello due/start wording ×2 nodes** — drop wire-format + markdown from descriptions: `"Optional due date (UTC)."` / `"Optional start date (UTC)."` (createCard.meta.ts, updateCard.meta.ts).
14. **notion get_block / get_block_children blockId → combobox `notion:pages` + allowManualEntry** — nice-to-have; block ids dominantly arrive via wiring and descriptions already say so.
15. **notion cover object-editor** — future candidate once nested single-shape objects are supported; keep json now.

## Counts

- Nodes audited: **59** (notion 16, airtable 12, trello 14, asana 12, typeform 3, calendly 2)
- Fields audited: **192**
- Fields OK as-is: **~146** (all 15 trigger nodes clean; asana near-fully clean; calendly/typeform clean but one cursor field)
- Findings: **HIGH 3** (pos runtime mismatch ×4 fields counted once; required-advanced-JSON systemic ×9 fields counted once; create_comment either-or), **MEDIUM 8** (change-list items 4–11 spanning ~18 fields), **LOW 4** (items 12–15 spanning ~12 fields)
