# Builder Config UX Audit — Group B: monday (29 nodes), hubspot (27 nodes)

Ground truth verified against `integrations/monday/actions/**/*.meta.ts|schema.ts`, `integrations/monday/triggers/*/`, `integrations/hubspot/actions/meta/*.meta.ts`, `integrations/hubspot/actions/*.schema.ts`, `integrations/hubspot/actions/line_items/*`, `integrations/hubspot/triggers/webhookReceived/webhookReceived.meta.ts`, and `services/options/_registry.ts`.

Registered resolvers: monday — `boards`, `groups`, `columns`, `items`, `file_columns`, `item_files`, `users`. hubspot — `owners`, `deal_pipelines`, `deal_stages`, `ticket_pipelines`, `ticket_stages`, `lists`, plus enum-property resolvers via `propertyOptions.ts` (`contact_lifecyclestage`, `contact_lead_status`, `company_lifecyclestage`, `deal_dealtype`, `ticket_category`, `ticket_source_type`).

## Systemic patterns

1. **SCREAMING_SNAKE / raw enum values used as option LABELS (hubspot, ~28 options across 8 select fields).** `createTask` (status 5 / priority 3 / type 3), `createCall` (direction 2 / status 9), `createTicket` + `updateTicket` priority (3+3), `createMeeting` outcome (5), and `duplicateHandling` labels `fail`/`update`/`skip` (create_contact, create_company). Values are HubSpot wire enums and must be preserved; labels should be plain English ("Not started", "No show", "Fail the step"). MEDIUM, pure meta polish, zero runtime risk.
2. **"Numeric STRING" wire-format jargon leads normal-path descriptions (hubspot, 13 fields).** `amount`, `closedate`-adjacent, `price`×3, `quantity`×2, `discount`×2, `annualrevenue`×2, `numberofemployees`×2, `hs_cost_of_goods_sold`×2, `hs_call_duration`. Runtime keys are `z.string()` so field type must stay text (a number field would commit a number → wire break), but copy should lead with the outcome ("Enter a number, e.g. 5000") and demote the stringified-wire note. MEDIUM wording.
3. **Pagination cursor fields sit in the normal path (5 fields).** monday `list_items.cursor`, `list_boards.cursor`; hubspot `after` on get_contacts/companies/deals/tickets/products/line_items/owners (7 fields actually). Loop-composition is power-user; all should be `advanced: true`. hubspot get_* `limit` fields also have no `defaultValue` (monday's do: 25) — inconsistent readiness signal. MEDIUM.
4. **Required free-text provider-internal enum/ids with no picker (monday 2, hubspot 8).** Worst: monday `add_column.columnType` (Monday ColumnType id) and `update_item.columnValue` (column-type-specific JSON wire shape in the required normal path). hubspot update-family ids (`contactId`/`companyId`/`dealId`/`ticketId`/`productId`/`lineItemId`×2, `create_line_item.dealId`) are honest upstream-mapping fields with wiring examples ("picker is a follow-up slice" acknowledged in meta) — MEDIUM, not HIGH, because the documented normal usage is `{{...}}` mapping.
5. **API-endpoint-flavored copy in node/field descriptions (hubspot, pervasive).** "via `/crm/v3/objects/contacts`", "PATCHes", "409", "EQ match", "HubSpot `firstname` property" on ~40 normal-path fields. Labels are clean (copy-guard satisfied), but descriptions assume API literacy. MEDIUM systemic; propose outcome-first rewrites on the worst offenders only.
6. **Paired filter fields without conditional visibility (hubspot, 6 nodes).** `filterProperty` + `filterValue` must both be set; `filterValue` should get `visibleWhen: { field: "filterProperty", valueTruthy: true }` (new top-level infra supports this) so the pairing is structural instead of prose.
7. **Genuinely good bones.** Monday's cascaded board→item/group/column comboboxes are the model pattern (every board-scoped node), all 5 monday triggers are one-picker clean, JSON escape hatches are already `advanced: true` + `jsonShape: "object"`, and hubspot's `webhook_received` object-list with row-local `visibleWhen(valueEndsWith: ".propertyChange")` is the best trigger config in the audit.

---

## monday

### monday:create_item (action) — Create Item
Fields `boardId`, `groupId`, `itemName`: OK (provider-resource-selection ×2 cascaded, core-user-decision; plain labels).
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| columnValues | json, adv, jsonShape object | Correctly parked in Advanced; example given | Set many columns at create | advanced-user-control | — | Keep; add one line: "Column keys come from Get Board / the Column picker on Update Item." | none | key + JSON string preserved | none |

### monday:update_item (action) — Update Item
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| boardId/itemId/columnId | cascaded comboboxes | Model pattern | — | provider-resource-selection | OK as-is | — | — | — | — |
| columnValue | required textarea, JSON for status/person/date | **HIGH**: normal user picks "Status" column, then must hand-author `{"label":"Done"}` — provider wire knowledge in the required normal path | Full control of any column type | structured-composition | Ideal: column-type-aware value editor (options resolver `monday:columns` already returns column type; plausible follow-up). Minimal now: reword desc — "Text/number columns: type the value. Status: type the label exactly as it appears in Monday, wrapped as {\"label\":\"Done\"}. Dates: {\"date\":\"2026-07-15\"}." | — | none possible | zod accepts string OR object — string always safe | none (copy only) |
| additionalColumns | json, adv | Correct escape hatch | multi-column write | advanced-user-control | — | OK | — | preserved | none |

### monday:get_item (action) — Get Item
No findings — fields OK as-is: two cascaded pickers (board → item), nothing to type.

### monday:list_items (action) — List Items
Fields `boardId`, `groupId` (optional filter, "All groups" placeholder), `limit` (defaultValue 25): OK.
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| cursor | text, normal path | Only meaningful inside a loop; noise for first-time user | pagination loops | advanced-user-control | remove from setup | `advanced: true` | omit = first page | key/value untouched | none |

### monday:search_items (action) — Search Items
Fields `boardId`, `groupId`, `limit` (default 25): OK.
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| columnValue | required text "Search value" | Behavior switches (exact column match vs name substring) based on a *different* field being empty — desc explains it, but mode is implicit | exact-match searches | core-user-decision | Keep; tighten desc: "What to search for. With a Column selected: exact match on that column. Without: matches item names containing this text." | — | none | preserved | none |
| columnId | optional combobox | OK; placeholder honestly explains empty = name search | — | conditional-option | OK as-is | — | — | — | — |

### monday:move_item (action) — Move Item
No findings — fields OK as-is: three cascaded pickers (board → item, board → target group).

### monday:duplicate_item (action) — Duplicate Item
No findings — fields OK as-is: pickers + one plain boolean ("Copy updates") with outcome description.

### monday:archive_item (action) — Archive Item
No findings — fields OK as-is: two pickers; node desc honestly says restorable from Monday's UI.

### monday:delete_item (action) — Delete Item
No findings — fields OK as-is: two pickers; node desc gives the honest "treat as permanent" warning (audit Q11-warning satisfied at node level).

### monday:create_subitem (action) — Create Subitem
Fields `boardId` (desc explains it's the parent's board), `parentItemId`, `subitemName`: OK. `columnValues` json is `advanced: true` + jsonShape — OK (advanced-user-control), same note as create_item.

### monday:list_subitems (action) — List Subitems
No findings — fields OK as-is: two cascaded pickers.

### monday:create_update (action) — Create Update
No findings — fields OK as-is: board/item pickers + plain "Update body" textarea.

### monday:list_updates (action) — List Updates
No findings — fields OK as-is: pickers + limit with defaultValue 25.

### monday:list_boards (action) — List Boards
`limit` (default 25): OK.
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| cursor | text; label "Next-page cursor", placeholder "Page index from a previous call" | Label says opaque cursor, placeholder says page index — contradictory copy; loop-only field | pagination | advanced-user-control | remove from setup | `advanced: true`; align copy with the actual runtime shape (it is Monday's boards page index surfaced as `nextCursor`): "Paste `nextCursor` from the previous call to get the next page." | omit = first page | key untouched | none |

### monday:get_board (action) — Get Board
No findings — fields OK as-is: single board picker.

### monday:create_board (action) — Create Board
No findings — fields OK as-is: name text, `boardKind` required select with NO default and plain labels ("Public (visible to the workspace)" etc.) — correct Q11-style explicit visibility choice; optional description.

### monday:duplicate_board (action) — Duplicate Board
Fields `boardId`, `newBoardName`: OK. `duplicateType`: select with defaultValue `duplicate_board_with_structure` and plain labels ("Structure only (no items)") — good.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| duplicateType | desc: "structure = columns/groups only…; pulses = + items; pulses_and_updates = …" | Description leaks Monday's internal enum names ("pulses") the labels already hide | safe-default | LOW: desc → "Choose how much to copy: just the structure, structure + items, or structure + items + their updates." | LOW |

### monday:create_group (action) — Create Group
Fields `boardId`, `groupTitle`: OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| color | optional text, ph `#037f4c` | Monday only accepts its own palette values; free hex may be rejected/coerced server-side; desc admits "name/hex" ambiguity | conditional-option | LOW: convert text→select of Monday's documented group palette (static labels "Green #037f4c" etc., values = hex Monday accepts), or leave and desc → "Pick from Monday's group palette (e.g. #037f4c). Leave empty and Monday picks one." | LOW |

### monday:list_groups (action) — List Groups
No findings — fields OK as-is: single board picker.

### monday:add_column (action) — Add Column
Fields `boardId`, `columnTitle`: OK. `defaults` json is `advanced: true` + jsonShape: OK (advanced-user-control; meta comment acknowledges column-aware editor deferred as D-MON7).
| Field | Current | Why fails | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| columnType | **required free text** expecting Monday ColumnType id | **HIGH** per calibration: required provider-internal enum with no picker; a nontechnical user cannot know `long_text` vs `text` vs `numbers` | new/rare column types Monday ships | provider-resource-selection | Convert text→combobox `allowManualEntry: true` with **new static resolver** `monday:column_types` (no provider API call — static list of Monday's documented ColumnType ids with plain labels: "Text"=text, "Status"=status, "Numbers"=numbers, "Date"=date, "People"=people, "Checkbox"=checkbox, "Dropdown"=dropdown, "Long text"=long_text, …). Manual entry keeps forward-compat with new Monday types (the meta comment's stated reason for free text). | — | none (required, no safe default) | value stays the raw ColumnType string | new-resolver (static, no scope needed) |

### monday:list_users (action) — List Users
No findings — fields OK as-is: `limit` default 25; `kind` select default "all" with plain labels ("All users", "Guests", …).

### monday:get_user (action) — Get User
No findings — fields OK as-is: single `monday:users` combobox.

### monday:add_file (action) — Add File
Fields `boardId`, `itemId`, `columnId` (`monday:file_columns` with honest "__item_files__ not valid" note): OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| file | file type, ph "Paste a {{...}} FileRef token" | "FileRef" is internal contract jargon in a normal-path placeholder | upstream-data-mapping | LOW: ph → "Insert a file from an earlier step"; desc → "The file to upload — insert the file output of an earlier step (e.g. Download File, Get Attachment)." | LOW |
| filename | optional text | OK — placeholder explains default derivation | derived-value | OK as-is | — |

### monday:download_file (action) — Download File
No findings — fields OK as-is: fully cascaded board → item → file-column → file pickers (`monday:item_files` deps itemId+columnId); optional fileId honestly defaults to first file. Best-in-class file selection UX.

### monday:new_item (trigger) — New Item
No findings — single required board picker with outcome description.

### monday:column_changed (trigger) — Column Value Changed
No findings — board picker + optional column filter picker; blank = any column, stated plainly.

### monday:item_moved (trigger) — Item Moved to Group
No findings — single board picker.

### monday:new_subitem (trigger) — New Subitem
No findings — single board picker.

### monday:new_update (trigger) — New Update Posted
No findings — single board picker.

---

## hubspot

### hubspot:create_contact (action) — Create Contact
Fields `email` (required, dedup-key note), `firstname`…`country` (12 plain optional texts), `lifecyclestage`/`hs_lead_status` (portal-real comboboxes w/ manual paste): OK — descriptions say "HubSpot `x` property" (systemic pattern 5, LOW here since labels are plain).
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| duplicateHandling | required select, defaultValue "fail", labels `fail`/`update`/`skip`, desc mentions 409/PATCH | Behavior-switching field correctly required+defaulted, but labels are raw values and desc is API jargon | core-user-decision | MEDIUM: labels → "Fail the step" / "Update the existing contact" / "Skip (keep existing contact unchanged)"; desc → "What to do when a contact with this email already exists. Fail stops the workflow; Update overwrites it with the fields above; Skip leaves it unchanged and returns it." | MEDIUM |

### hubspot:update_contact (action) — Update Contact
Property fields (14 optional, same as create): OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| contactId | required text, desc shows `{{...}}` wiring, "picker is a follow-up slice" | Normal usage is upstream mapping and desc teaches it; still blocks a standalone first-timer | upstream-data-mapping | MEDIUM: desc → "Which contact to update — insert the contact ID from an earlier step (Create Contact or Get Contacts)." Mark **new-resolver** follow-up: `hubspot:contacts` search combobox via `POST /crm/v3/objects/contacts/search` (existing crm.objects.contacts.read scope), allowManualEntry for {{...}}. | MEDIUM |

### hubspot:get_contacts (action) — Get Contacts
| Field | Current | Why | Class | Proposed Setup | Proposed Advanced | Severity |
|---|---|---|---|---|---|---|
| limit | number, no default | Fine but inconsistent w/ monday's defaultValue 25 | safe-default | `defaultValue: 25` (within 1..100 cap) | — | LOW |
| after | text cursor, normal path | Loop-only | advanced-user-control | remove from setup | `advanced: true` | MEDIUM |
| properties | string-array, chips of raw property names | Requires knowing HubSpot internal property names | advanced-user-control | — | `advanced: true`; **new-resolver** option: per-chip optionsSource `hubspot:contact_properties` via `GET /crm/v3/properties/contacts` (same scope family as existing propertyOptions.ts resolvers), allowManualEntry for custom props | MEDIUM |
| filterProperty | text, ph "email" | Internal property name, but optional + example given | conditional-option | same new-resolver as above (allowManualEntry) | — | MEDIUM |
| filterValue | text; prose "BOTH must be set" | Pairing enforced only by prose | conditional-option | add `visibleWhen: { field: "filterProperty", valueTruthy: true }`; desc → "Only return contacts whose chosen property exactly equals this value." | — | MEDIUM |

### hubspot:create_company (action) — Create Company
Property fields (`name` required, `domain` w/ good dedup note, address block, `industry`, `description`, `lifecyclestage` combobox): OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| annualrevenue / numberofemployees | text, desc leads "**Numeric STRING**" | Wire-format jargon first, outcome last (systemic 2) | core-user-decision | desc → "Annual revenue as a number, e.g. 5000000." / "Employee count, e.g. 250." (keep a trailing note: "Stored as text — HubSpot's required format.") | MEDIUM |
| duplicateHandling | same as create_contact | raw labels + 409 jargon | core-user-decision | same relabel; desc keyed to domain: "…when a company with this domain already exists. Requires Domain for Update/Skip." | MEDIUM |

### hubspot:update_company (action) — Update Company
Property fields: OK (same as create).
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| companyId | required text | upstream mapping, honest desc | upstream-data-mapping | MEDIUM: same treatment as contactId; new-resolver `hubspot:companies` search (search-by-domain noted as follow-up in meta) | MEDIUM |
| annualrevenue / numberofemployees | Numeric STRING jargon | systemic 2 | core-user-decision | same rewording | MEDIUM |

### hubspot:get_companies (action) — Get Companies
Same five-field pattern as get_contacts: `after` → advanced (MEDIUM), `properties` → advanced + new-resolver `hubspot:company_properties` (MEDIUM), `filterValue` visibleWhen (MEDIUM), `limit` default 25 (LOW). `filterProperty` ph "domain" is a good example.

### hubspot:create_deal (action) — Create Deal
Fields `dealname` (required text), `pipeline` (optional combobox, honest "portal default when omitted"), `dealstage` (required, gated on pipeline — model cascade), `dealtype` (portal-real combobox), `description`, `hubspot_owner_id` (owners picker): OK. Note: `hubspot_owner_id` desc "returns the owner `id` (NOT the `userId`)" is internal detail the picker already hides — LOW trim.
| Field | Current | Why | Class | Proposed Setup | Default/derivation | Runtime | Severity |
|---|---|---|---|---|---|---|---|
| amount | text, "**Numeric STRING**" lead | systemic 2 | core-user-decision | desc → "Deal amount as a number, e.g. 5000 (portal's default currency)." | none | stays text/string | MEDIUM |
| closedate | **text** expecting hand-typed ISO 8601 | Other hubspot date fields already use datetime-utc; here the normal user must type `2026-12-31T00:00:00Z` | core-user-decision | convert `text` → `datetime-utc` (runtime is `z.string()`; datetime-utc commits an ISO string — verbatim-compatible; meta desc already says epoch-ms strings still hydrate as text on the sibling fields) | none | ISO string preserved; pasted epoch strings still valid per schema | MEDIUM |

### hubspot:update_deal (action) — Update Deal
`pipeline`/`dealstage` cascade, `dealtype`, `description`, `hubspot_owner_id`: OK ("leave both empty to keep existing stage" is good honest copy).
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| dealId | required text | upstream mapping | upstream-data-mapping | MEDIUM: same as contactId; new-resolver `hubspot:deals` search follow-up | MEDIUM |
| amount | Numeric STRING lead | systemic 2 | core-user-decision | same rewording | MEDIUM |
| closedate | text ISO | systemic (same as create_deal) | core-user-decision | text → datetime-utc | MEDIUM |

### hubspot:get_deals (action) — Get Deals
Same pattern as get_contacts: `after` → advanced (MEDIUM), `properties` → advanced + new-resolver `hubspot:deal_properties` (MEDIUM), `filterValue` visibleWhen + note that dealstage filter values are internal stage ids (ph "closedwon") (MEDIUM), `limit` default (LOW).

### hubspot:create_ticket (action) — Create Ticket
Fields `subject`, `hs_pipeline`→`hs_pipeline_stage` (required gated cascade — model pattern), `content`, `hs_ticket_category`/`source_type` (portal-real comboboxes), `hubspot_owner_id`: OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| hs_ticket_priority | select, labels `LOW`/`MEDIUM`/`HIGH` | raw enum labels (systemic 1) | core-user-decision | labels → "Low"/"Medium"/"High" (values preserved) | MEDIUM |
| associatedContactId / CompanyId / DealId | optional texts | upstream mapping, honest best-effort desc | upstream-data-mapping | LOW: desc → "Link this ticket to a contact — insert a contact ID from an earlier step. If it can't be linked the ticket is still created (see associationWarnings)." | LOW |

### hubspot:update_ticket (action) — Update Ticket
Cascade + comboboxes: OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| ticketId | required text | upstream mapping | upstream-data-mapping | MEDIUM: same treatment; new-resolver follow-up | MEDIUM |
| hs_ticket_priority | raw labels | systemic 1 | core-user-decision | plain labels | MEDIUM |

### hubspot:get_tickets (action) — Get Tickets
Same get-family pattern: `after` → advanced (MEDIUM), `properties` → advanced + new-resolver `hubspot:ticket_properties` (MEDIUM), `filterValue` visibleWhen — note ph "1" for a stage id is especially cryptic; add "Stage filters use the internal stage id — copy it from the Stage picker on Create Ticket" (MEDIUM), `limit` default (LOW).

### hubspot:get_owners (action) — Get Owners
`email` exact filter: OK (plain, well-explained). `limit`: OK-ish (LOW: add defaultValue 100 to match wrapper default the desc mentions). `after`: `advanced: true` (MEDIUM, systemic 3). Node desc's id-vs-userId warning is necessary here (this node exists to feed hubspot_owner_id) — keep.

### hubspot:create_note (action) — Create Note
Fields `hs_note_body` (required textarea), `hs_timestamp` (datetime-utc, honest "defaults to now"), `hubspot_owner_id`: OK. 4 `associated*Id` fields: upstream-data-mapping, OK with LOW copy softening (as create_ticket). The datetime-utc + default-now pattern here is what create/update_deal `closedate` should copy.

### hubspot:create_task (action) — Create Task
Fields `hs_task_subject`, `hs_task_body`, `hs_timestamp` (datetime-utc), owner, 4 association ids: OK.
| Field | Current | Why | Class | Proposed Setup | Proposed Advanced | Severity |
|---|---|---|---|---|---|---|
| hs_task_status / priority / type | selects, raw labels `NOT_STARTED`, `TODO`… + zod defaults exist but no meta defaultValue | systemic 1; also defaults live only in runtime zod ("Defaults to X if omitted" prose) — surface as meta `defaultValue` so readiness/UI show them | safe-default | plain labels ("Not started", "To-do", "Call", "Email"); add `defaultValue: "NOT_STARTED"` / `"MEDIUM"` / `"TODO"` (matches zod default — no behavior change) | — | MEDIUM |
| hs_task_reminders | text, "Comma-separated millisecond-epoch timestamps" | Raw epoch-ms authoring in normal path — nontechnical user cannot produce this | advanced-user-control | remove from setup | `advanced: true`; desc → "Reminder times as millisecond timestamps, comma-separated (e.g. from `{{Date.parse(...)}}`). HubSpot validates server-side." | MEDIUM |

### hubspot:create_call (action) — Create Call
Fields `hs_call_title`, `hs_call_body`, `hs_timestamp` (datetime-utc, default now), owner, 4 association ids: OK. `hs_call_direction`: correctly no-default (matches HubSpot's empty-when-omitted), but labels `INBOUND`/`OUTBOUND` → "Inbound"/"Outbound" (MEDIUM, systemic 1).
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| hs_call_status | select, 9 raw labels, zod default COMPLETED | systemic 1 + default only in zod | safe-default | plain labels ("Completed", "No answer", …); `defaultValue: "COMPLETED"` | MEDIUM |
| hs_call_duration | text "Duration (ms)", Numeric STRING lead | ms as the input unit is implementation-flavored but wire-honest; keep unit, fix copy | core-user-decision | desc → "How long the call lasted, in milliseconds (15 min = 900000)." | LOW |
| hs_call_disposition | free text expecting a **portal-configured GUID** | Optional, but no human can type a GUID from memory; desc admits "free-form here" | provider-resource-selection | convert text→combobox, **new-resolver** `hubspot:call_disposition` reusing the existing `propertyOptions.ts` enum-property pattern (`GET /crm/v3/properties/calls/hs_call_disposition` — same API + scope family as `ticket_category` etc.), allowManualEntry | MEDIUM |

### hubspot:create_meeting (action) — Create Meeting
Fields `hs_meeting_title`, `hs_meeting_body`, start/end (datetime-utc pair, good copy), `hs_meeting_location` (location type — nice), `hs_timestamp`, owner, 4 association ids: OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| hs_meeting_outcome | select, raw labels `NO_SHOW` etc., zod default SCHEDULED | systemic 1 + zod-only default | safe-default | plain labels ("Scheduled", "No show", …); `defaultValue: "SCHEDULED"` | MEDIUM |

### hubspot:add_contact_to_list (action) — Add Contact to List
No findings — fields OK as-is: `listId` picker surfaces MANUAL/DYNAMIC on option descriptions (the one provider constraint that matters), `email` plain. Desc's `contactIdsAdded.length === 0` branching tip is power-user but lives in the node desc, not a field — acceptable. (Polish idea, LOW: have the `hubspot:lists` resolver filter/sort MANUAL lists first since DYNAMIC always 400s.)

### hubspot:remove_from_list (action) — Remove from List
No findings — fields OK as-is: same pair as add_contact_to_list; "removes the membership only" honesty is exactly right.

### hubspot:create_product (action) — Create Product
Fields `name`, `description`, `hs_sku`: OK.
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| price / hs_cost_of_goods_sold | Numeric STRING lead | systemic 2 | core-user-decision | desc → "Unit price as a number, e.g. 99.00 (portal's default currency)." | MEDIUM |
| hs_recurring_billing_period | text expecting ISO 8601 duration `P1M` | Provider format in normal path, but ph+examples given | conditional-option | convert text→select: "Monthly"=P1M, "Quarterly"=P3M, "Every 6 months"=P6M, "Yearly"=P1Y … as combobox `allowManualEntry` for other durations (values are the ISO strings — preserved) | MEDIUM |

### hubspot:update_product (action) — Update Product
`productId` required text: MEDIUM (upstream-data-mapping, same treatment/new-resolver follow-up). `price`/`hs_cost_of_goods_sold` wording: MEDIUM (systemic 2). `hs_recurring_billing_period`: same select conversion (MEDIUM). Rest OK.

### hubspot:get_products (action) — Get Products
Same get-family pattern: `after` → advanced (MEDIUM), `properties` → advanced + new-resolver `hubspot:product_properties` (MEDIUM), `filterValue` visibleWhen (MEDIUM), `limit` default (LOW).

### hubspot:create_line_item (action) — Create Line Item
| Field | Current | Why | Class | Proposed | Severity |
|---|---|---|---|---|---|
| dealId | required text | The action's whole point is attach-to-deal; desc teaches `{{...}}` wiring | upstream-data-mapping | MEDIUM: desc → "The deal this line item belongs to — insert the deal ID from an earlier step (e.g. Create Deal)." New-resolver `hubspot:deals` follow-up shared with update_deal | MEDIUM |
| hs_product_id / name | either-or enforced by handler, prose "one of … MUST be present" | Cross-field constraint only in prose; user discovers at run time | conditional-option | MEDIUM: keep both visible; desc lead → "Link an existing product (Product ID) or type a one-off Name — set at least one." New-resolver `hubspot:products` combobox for hs_product_id (search API exists, scope in family) | MEDIUM |
| quantity / price / discount | Numeric STRING lead | systemic 2 | core-user-decision | outcome-first rewording; keep the useful "amount = price × quantity computed by HubSpot" note on price | MEDIUM |

### hubspot:update_line_item (action) — Update Line Item
`lineItemId` required text: MEDIUM (upstream mapping, same treatment). `quantity`/`price`/`discount` wording: MEDIUM (systemic 2). `name`: OK.

### hubspot:get_line_items (action) — Get Line Items
Same get-family pattern: `after` → advanced (MEDIUM), `properties` → advanced (MEDIUM), `filterValue` visibleWhen (MEDIUM), `limit` default (LOW). ph "hs_product_id" for filterProperty is actually the right example here.

### hubspot:remove_line_item (action) — Remove Line Item
Single field `lineItemId` (required text): OK as upstream-data-mapping — desc explains wiring and post-delete invalidity; node desc carries the DESTRUCTIVE warning. LOW: soften desc jargon ("canonical `NotFoundError`" is internal).

### hubspot:webhook_received (trigger) — Webhook Received
No findings on the field surface — this is the best-configured trigger in the group: single required `subscriptions` object-list; each row = plain-English event select (12 options, compile-time-guarded against the runtime allowlist) + `propertyName` text that appears only via row-local `visibleWhen { valueEndsWith: ".propertyChange" }`. Renderer writes the real `[{eventType, propertyName?}]` array activation expects.
LOW (enhancement, new-resolver): `propertyName` could become a combobox fed by `GET /crm/v3/properties/{objectType}` derived from the row's eventType — needs row-local dependsOn support in object-list, which does not exist yet; flag as future infra, not a change-list item. Node description is very long/API-heavy (MEDIUM-LOW copy trim; builder card truncates anyway).

---

## Change list

### HIGH
1. `integrations/monday/actions/boards/addColumn.meta.ts` — `columnType`: convert `type: "text"` → `type: "combobox"`, `allowManualEntry: true`, `optionsSource: "monday:column_types"` (**new-resolver**, static — mirrors Monday's documented ColumnType ids with plain labels: Text/Status/Numbers/Date/People/Checkbox/Dropdown/Long text/Link/Email/Phone/Timeline/Tags/Rating/Hour/World clock/Country/Color picker/File/Location…; no provider API call, no scope). New description: "What kind of column to add — pick a type, or type a Monday column-type id for newer types." Manual entry preserves the meta's stated forward-compat reason for free text.
2. `integrations/monday/actions/items/updateItem.meta.ts` — `columnValue`: (copy-only now; structured column-type-aware editor is the real fix, needs `monday:columns` resolver to expose column type — flag follow-up). New description: "The new value. Text and number columns: just type it. Status: {\"label\":\"Done\"} with the label exactly as shown in Monday. Date: {\"date\":\"2026-07-15\"}. People: {\"personsAndTeams\":[{\"id\":123,\"kind\":\"person\"}]}." (≤200 chars if trimmed to 3 examples; runtime zod already accepts string OR object — no compat risk.)

### MEDIUM
3. hubspot get-family (`getContacts/getCompanies/getDeals/getTickets/getProducts/getLineItems/getOwners.meta.ts`) — `after`: add `advanced: true`. Same for monday `listItems.meta.ts` + `listBoards.meta.ts` `cursor`. (9 fields; loop-composition is power-user.)
4. hubspot get-family — `filterValue`: add `visibleWhen: { field: "filterProperty", valueTruthy: true }` (6 metas). New description: "Only return records whose chosen property exactly equals this value."
5. hubspot get-family — `properties`: add `advanced: true` (6 metas). Optional **new-resolver** per-chip optionsSource `hubspot:{object}_properties` via `GET /crm/v3/properties/{objectType}` (same auth/scope family as existing `propertyOptions.ts` resolvers), `allowManualEntry` for custom properties; also reusable by `filterProperty`.
6. Raw enum labels → plain labels, values unchanged (8 select fields): `createTask.meta.ts` (status/priority/type), `createCall.meta.ts` (direction/status), `createTicket.meta.ts` + `updateTicket.meta.ts` (priority), `createMeeting.meta.ts` (outcome). E.g. `{ value: "NOT_STARTED", label: "Not started" }`, `{ value: "NO_SHOW", label: "No show" }`.
7. `createContact.meta.ts` + `createCompany.meta.ts` — `duplicateHandling`: labels → "Fail the step" / "Update the existing record" / "Skip (return it unchanged)". New description (contact): "What to do when a contact with this email already exists. Fail stops the workflow; Update overwrites it with the fields above; Skip leaves it unchanged."
8. `createDeal.meta.ts` + `updateDeal.meta.ts` — `closedate`: convert `type: "text"` → `type: "datetime-utc"` (runtime `z.string()`; datetime-utc commits an ISO string — verbatim compatible, matches the provider's other timestamp fields). New description: "When you expect the deal to close, in UTC."
9. Numeric-string copy rewrite (13 fields): `createDeal/updateDeal` amount, `createCompany/updateCompany` annualrevenue + numberofemployees, `createProduct/updateProduct` price + hs_cost_of_goods_sold, `create/updateLineItem` quantity + price + discount, `createCall` hs_call_duration. Pattern: lead with outcome ("Deal amount as a number, e.g. 5000 — portal's default currency."), demote/drop the "**Numeric STRING**" wire note to a trailing sentence.
10. `createTask.meta.ts` — `hs_task_reminders`: add `advanced: true`; new description: "Reminder times as millisecond timestamps, comma-separated. HubSpot validates server-side."
11. `createCall.meta.ts` — `hs_call_disposition`: convert text → combobox `allowManualEntry`, **new-resolver** `hubspot:call_disposition` reusing the `propertyOptions.ts` enum-property pattern (`GET /crm/v3/properties/calls/hs_call_disposition`; options carry the portal GUID values + human labels).
12. Surface zod defaults as meta `defaultValue` (no behavior change, readiness/UI honesty): `createTask.meta.ts` status=NOT_STARTED, priority=MEDIUM, type=TODO; `createCall.meta.ts` hs_call_status=COMPLETED; `createMeeting.meta.ts` hs_meeting_outcome=SCHEDULED.
13. Update-family id fields (`updateContact.contactId`, `updateCompany.companyId`, `updateDeal.dealId`, `updateTicket.ticketId`, `updateProduct.productId`, `update/removeLineItem.lineItemId`, `createLineItem.dealId`): reword to outcome-first ("Which contact to update — insert the contact ID from an earlier step (Create Contact or Get Contacts)."), drop "Search-by-X picker is a follow-up slice" from user-facing copy. **New-resolver** follow-ups: `hubspot:contacts` / `hubspot:companies` / `hubspot:deals` / `hubspot:tickets` / `hubspot:products` search comboboxes (`POST /crm/v3/objects/{type}/search`, existing scopes), `allowManualEntry` so `{{...}}` wiring keeps working.
14. `createProduct.meta.ts` + `updateProduct.meta.ts` — `hs_recurring_billing_period`: convert text → combobox `allowManualEntry` with static options [P1M "Monthly", P3M "Quarterly", P6M "Every 6 months", P1Y "Yearly"]; values are the ISO duration strings HubSpot expects.
15. `createLineItem.meta.ts` — `hs_product_id` / `name`: description lead: "Link an existing product (Product ID) or type a one-off Name — set at least one."
16. hubspot get-family + monday `listBoards` — `limit`: add `defaultValue` (25 hubspot, aligning with monday; getOwners: 100 to match wrapper default).

### LOW
17. `monday/actions/boards/listBoards.meta.ts` — `cursor` copy: reconcile label vs placeholder ("Paste nextCursor from the previous call").
18. `monday/actions/boards/duplicateBoard.meta.ts` — `duplicateType` description: drop "pulses" internal enum names; "Choose how much to copy: structure only, structure + items, or structure + items + updates."
19. `monday/actions/boards/createGroup.meta.ts` — `color`: static select/combobox of Monday's group palette, or keep text with clarified desc.
20. `monday/actions/files/addFile.meta.ts` — `file` placeholder/desc: replace "FileRef token" jargon with "Insert a file from an earlier step".
21. hubspot engagement `associated*Id` fields (15 across create_note/task/call/meeting/ticket): outcome-first copy ("Link this note to a contact — insert a contact ID from an earlier step; if linking fails the note is still created.").
22. `hubspot/options/lists.ts` — sort/flag MANUAL lists first (DYNAMIC always rejected by the two membership actions).
23. `removeLineItem.meta.ts` — drop "canonical `NotFoundError`" internal jargon from desc.
24. `hubspot_owner_id` descriptions (8 metas): trim "(NOT the `userId`)" — the picker already guarantees the right id; keep the note only on get_owners outputs.

## Counts
- Nodes audited: 56 (monday 29 — 24 actions + 5 triggers; hubspot 27 — 26 actions + 1 trigger). Every node listed above.
- Fields audited: 274 (monday 77, hubspot 197).
- Fields OK as-is: ~192 (monday ~68, hubspot ~124) — monday is largely exemplary; hubspot's pickers/cascades are strong but copy + enum labels drag.
- Findings: HIGH 2 (both monday: add_column.columnType, update_item.columnValue), MEDIUM ~64 field-instances rolled into 14 change-list entries (dominated by 4 systemic hubspot patterns: cursor/properties advanced placement 15 fields, numeric-string copy 13, raw enum labels ~28 options/8 fields+2 duplicateHandling, update-id mapping 7), LOW 8 entries (~25 field-instances).
- New-resolver proposals: monday:column_types (static); hubspot:{contact,company,deal,ticket,product}_properties (GET /crm/v3/properties/{type}); hubspot:call_disposition (existing propertyOptions pattern); hubspot record-search pickers for update-family ids (POST /crm/v3/objects/{type}/search). All name real APIs within existing scope families.
