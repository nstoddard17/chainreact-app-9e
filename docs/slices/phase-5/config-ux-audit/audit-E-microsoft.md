# Audit E — Microsoft group (excel, onedrive, teams, onenote, outlook-calendar)

Ground truth verified against `integrations/<provider>/actions/*.meta.ts` + `*.schema.ts`, `services/options/_registry.ts`, and `docs/slices/phase-5/spreadsheet-config-redesign-closeout.md`. 55 nodes / 172 fields audited.

## Systemic patterns

1. **Zero `advanced: true` anywhere in this group (0/172 fields).** Power-user knobs sit in the normal path: `includeIDs`/`preGenerated` (onenote get_page_content), `contentEncoding` (onedrive upload_file), `position` (onenote update_page), plus 8 pagination caps. ~11 fields are Advanced-tab candidates.
2. **Graph/implementation jargon in setup-path descriptions (~18 fields).** "Graph $orderby clause", "Graph caps `$top` at 100", "(Graph $filter)", "Graph parses with the HTML5 parser", wire values in backticks, and slice IDs ("ONENOTE-5", "ONENOTE-N polish") leaking into builder-visible action descriptions (onenote copy_page). Violates the "outcome not implementation" principle; brief allows JSON-flavored copy only on advanced fields.
3. **Required raw-provider-ID text fields where a picker is feasible (2 HIGH).** teams `chatId` (resolver explicitly deferred in `_registry.ts` — 1:1 chats unnamed) and onenote copy_page `targetSectionId` (dual-hierarchy dep-name limitation documented in meta). Both are documented decisions, but both block a nontechnical user from finishing the normal path.
4. **Excel value entry is column-aware only on add_row.** `add_table_row` (positional string-array — silent column misalignment risk), `update_row` (hand-typed case-sensitive headers, fails loudly on typo), `find_row.lookupColumn` (typed header). All three named as deferred in the spreadsheet-redesign closeout; the `tableColumnsList.ts` Graph helper already exists, so a `microsoft-excel:table_columns` resolver unlocks all three.
5. **Conditional fields not gated — visibleWhen candidates now that the infra lands (~6 fields).** outlook `bodyContentType` (required-when-Body-set, currently always shown), onenote update_page `target` + `position` (only used when `updateMode=insert`, enforced only by prose in ALL-CAPS).
6. **Inconsistent max-results labeling (8 fields):** "Top" (teams list_channel_messages, excel read_table_rows), "Page Size", "Max Results", "Max results", "Limit", "Row Limit". Same concept, six labels.

---

## microsoft-excel

### microsoft-excel:add_row (action) — Add Row
No findings — fields OK as-is: full spreadsheet-rows redesign already landed (closeout doc); `rows` carries `renderedBy: "values"` so the batch shape is committed by the same editor, not shown twice. Workbook/worksheet pickers cascade correctly. Model node for the rest of the group.

### microsoft-excel:add_table_row (action) — Add Table Row
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| values | string-array, req, positional | User must know column order + count from memory; misalignment silently writes wrong columns; blank cell awkward as a chip | Variable-wiring of a whole row | structured-composition | Convert to `spreadsheet-rows` (batch-less: no `batchRowsField`) with `optionsSource: microsoft-excel:table_columns` (**new-resolver**; Graph helper `integrations/microsoft-excel/api/tableColumnsList.ts` exists; scope already granted), `dependsOn: ["workbookId","tableName"]` | — | Columns derived from selected table | Schema union already accepts header-keyed record branch (`addTableRow.schema.ts` line 24) — editor commits record shape, no key rename | Low — additive; positional branch stays for API/variable authors |
| workbookId, tableName | comboboxes w/ resolvers | OK (resource pickers, cascade) | — | provider-resource-selection | — | — | — | — | — |

### microsoft-excel:update_row (action) — Update Row
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| values | keyvalue, req | User hand-types case-sensitive header names; handler throws on any typo (by design, no silent skip) — typo-prone with no picker | Precise partial-cell PATCH | structured-composition | Column-aware record editor (closeout's deferred "record-commit mode on spreadsheet editor" or sibling `spreadsheet-record` type) fed by `microsoft-excel:worksheet_columns` (resolver exists) | — | Column names derived from worksheet | Runtime is `Record<header, value>` — record editor commits identical shape | Low |
| rowNumber | number, req | OK but no guidance on finding it | — | upstream-data-mapping | Desc: "The row to update, counted from 1 (row 1 is usually your header row). Often wired from Find Row's rowNumber output." | — | — | — | None |
| workbookId, worksheetName | comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-excel:find_row (action) — Find Row
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| lookupColumn | text, req | Typed header name; typo = runtime failure | Manual entry for dynamic tables | provider-resource-selection | combobox w/ `microsoft-excel:table_columns` (**same new-resolver as add_table_row**), `allowManualEntry: true`, `dependsOn: ["workbookId","tableName"]` | — | Options derived from table | Value stays the header string | Low |
| lookupValue | text, req | OK (core decision; string-coercion note is helpful) | — | core-user-decision | — | — | — | — | — |
| maxRows | number, def 100 | OK but power-user knob | — | safe-default | — | Move `advanced: true` | default 100 | — | None |
| workbookId, tableName | comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-excel:delete_row (action) — Delete Row
No findings — workbook/worksheet pickers + 1-based rowNumber with plain description. rowNumber is a core decision often wired upstream; description is adequate.

### microsoft-excel:read_range (action) — Read Range
No findings — `address` (A1 range) is a user-facing Excel concept, not provider-internal; description shows examples and the bounded-range rule plainly. Core-user-decision.

### microsoft-excel:read_table_rows (action) — Read Table Rows
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| top | label "Top", def 100 | "Top" is Graph jargon as a label | Page sizing | safe-default | Relabel "Max rows"; desc "How many rows to return at most (1–500). Default 100." | Optionally `advanced: true` | default 100 | key `top` unchanged | None |
| workbookId, tableName | comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-excel:export_sheet (action) — Export Sheet
No findings — hasHeaders (defaulted boolean, plain outcome wording), limit optional cap, pickers OK.

### microsoft-excel:create_worksheet / rename_worksheet / delete_worksheet (actions)
No findings (3 nodes) — pickers + plain-language name fields with the 1–31-char constraint stated. delete_worksheet relies on riskLevel for warning; adequate.

### microsoft-excel:get_workbooks (action) — Get Workbooks
No findings — single optional `top` ("Limit"); label could join the "Max results" convention (LOW, see change list).

### microsoft-excel:get_worksheets (action) — Get Worksheets
No findings — single workbook picker.

### microsoft-excel:new_row / updated_row (triggers)
No findings (2 nodes) — workbook + worksheet pickers, plain "to watch" wording.

### microsoft-excel:new_table_row / updated_table_row (triggers)
No findings (2 nodes) — workbook + table pickers.

### microsoft-excel:new_worksheet (trigger)
No findings — single workbook picker.

---

## microsoft-onedrive

### microsoft-onedrive:list_items (action) — List Items
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| orderBy | text; desc "Graph $orderby clause, e.g. \"name asc\"" | Requires OData knowledge to type correctly | Arbitrary sort clauses | conditional-option | Convert text→select, options: `name asc`/`name desc`/`lastModifiedDateTime desc`/`lastModifiedDateTime asc`/`size desc` with labels "Name (A–Z)", "Name (Z–A)", "Recently modified first", "Oldest modified first", "Largest first". Desc: "How the returned items are sorted." | If arbitrary clauses must stay: combobox + `allowManualEntry` instead | none (Graph default order) | Stored values are the exact strings Graph accepts today | Low — existing saved free-text remains valid strings |
| top | number "Page Size" | OK; "Graph defaults to 200" is mild jargon | — | safe-default | Desc: "How many items to return at most (1–1000). Leave empty for the standard page of 200." | — | — | — | None |
| parentItemId | combobox, optional, root default | OK — good empty-means-root pattern | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onedrive:get_file (action) — Get File
No findings — single file picker with paste/wire escape hatch explained in outcome language.

### microsoft-onedrive:upload_file (action) — Upload File
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| mimeType | text, req; ph "e.g. application/pdf" | Normal user doesn't know MIME strings; typo = wrong content type served | Exotic types | provider-resource-selection | Convert text→combobox w/ static options (Plain text `text/plain`, PDF `application/pdf`, PNG `image/png`, JPEG `image/jpeg`, CSV `text/csv`, JSON `application/json`, Word `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, Excel `...spreadsheetml.sheet`, Binary `application/octet-stream`) + `allowManualEntry: true`. Desc: "What kind of file this is — pick the type that matches the file name's extension." | — | Ideally derivable from `filename` extension (future); can't silently default at runtime today | Value stays the raw MIME string | Low |
| content | textarea, req | Paste/wire-only; parenthetical honestly says no FileRef accepted yet | base64 payloads | upstream-data-mapping | Desc: "The file's contents. Paste text, or wire text/base64 from an earlier step. For binary files (images, PDFs) supply base64 and set Content Encoding to base64." FileRef intake is a deliberate non-port (schema docstring) — product follow-up, not a meta edit | — | — | — | None |
| contentEncoding | select, def utf8 | Behavior-switching but safely defaulted; "utf8/base64" is jargon | Binary uploads | safe-default | Option labels: "Text (as typed)" / "Base64 (binary files)" | Keep in setup (it pairs with content) | default utf8 | values `utf8`/`base64` unchanged | None |
| parentItemId, filename | picker + text | OK | — | provider-resource-selection / core-user-decision | — | — | — | — | — |

### microsoft-onedrive:create_folder (action) — Create Folder
No findings — parent picker (empty = root) + plain name field.

### microsoft-onedrive:move_item (action) — Move / Rename Item
No findings — source-folder-as-scope-narrower pattern is well explained ("Optional — leave empty if the item id comes from an upstream step"); target folder + newName both optional with clear omit semantics.

### microsoft-onedrive:copy_item (action) — Copy Item
No findings — same pattern as move_item; required target folder is a picker.

### microsoft-onedrive:delete_item (action) — Delete Item
No findings — folder scope-narrower + item picker with paste escape hatch; destructive risk carried by node metadata.

### microsoft-onedrive:file_changed (trigger) — File Changed
No findings — zero config fields (watches the whole drive); nothing for a user to get wrong. Optional folder-scope filter would be a product enhancement, not a UX defect.

---

## microsoft-teams

### microsoft-teams:send_channel_message (action) — Send Channel Message
No findings — team→channel cascade pickers, message textarea, contentType select defaulted to HTML. Clean.

### microsoft-teams:reply_to_channel_message (action) — Reply to Channel Message
No findings — messageId is upstream-data-mapping with exactly the right guidance ("usually from the New Channel Message trigger (e.g. {{trigger.messageId}})").

### microsoft-teams:send_chat_message (action) — Send Chat Message
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| chatId | text, req; ph `19:...@thread.v2` | Required raw provider-internal id; "Obtain it from … Microsoft Graph, or admin tooling" is not completable by a nontechnical user — normal path blocked | Wire from upstream | provider-resource-selection | Add `microsoft-teams:chats` resolver (**new-resolver**; Graph `GET /me/chats?$expand=members`; `Chat.ReadWrite` scope; label 1:1 chats by other-participant displayName, group chats by `topic` or member list) as combobox + `allowManualEntry: true`. NOTE: resolver was explicitly DEFERRED by Marcus decision recorded in `services/options/_registry.ts` (1:1 chats unnamed → needs participant expansion) — this proposal is the participant-expansion version; needs Marcus sign-off to un-defer | — | — | Value stays the chat id string; manual entry preserved | Low — additive |
| content, contentType | textarea + defaulted select | OK | — | core-user-decision / safe-default | — | — | — | — | — |

### microsoft-teams:get_channel_details (action) / list_channels / list_teams / get_team_members (actions)
No findings (4 nodes) — pickers only (or none); get_team_members `top` "Page Size (1–999)" wording is fine.

### microsoft-teams:list_channel_messages (action) — List Channel Messages
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| top | label "Top", def 20 | "Top" label is Graph jargon | — | safe-default | Relabel "Max messages"; desc "How many recent messages to return (1–50). Default 20." | — | default 20 | key unchanged | None |
| teamId, channelId | comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-teams:new_channel_message (trigger) — New Channel Message
No findings — team→channel cascade pickers with watch-oriented wording.

---

## microsoft-onenote

### microsoft-onenote:create_page (action) — Create Page
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| contentType | select, req, def `text/html`; option labels "HTML (text/html — V2 default)" etc. | MIME strings + "V2 default" (internal slice jargon) inside option LABELS; desc explains `<pre>` wrapping and XHTML strictness | XHTML authors | safe-default | Option labels: "HTML" / "Plain text" / "Strict XHTML". Desc: "How your Content is read: HTML renders formatting; Plain text keeps it exactly as typed." | Move field `advanced: true` (has safe default; required-with-default stays satisfiable) | default `text/html` | option VALUES (`text/html` etc.) unchanged | None |
| content | textarea; desc mentions `contentType` backtick + `{{nodeId.field}}` syntax | Mostly OK; variable-syntax mention is useful, backtick key-reference is mild jargon; placeholder `<p>Body…</p>` assumes HTML | HTML fragments | core-user-decision | Desc: "What the page says. Formatting follows the Content type below. You can insert values from earlier steps with the variable picker." | — | — | — | None |
| title | text, req; desc mentions "rendered HTML's `<title>` element" | Implementation detail in desc | — | core-user-decision | Desc: "The page's title, as shown in OneNote's page list." | — | — | — | None |
| notebookId, sectionId | cascade comboboxes | OK ("Required so the section picker can scope its results" is builder-mechanics wording — tolerable) | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onenote:update_page (action) — Update Page
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| target | text; desc "REQUIRED when `updateMode` is `insert` — ignored for…CSS selector…`data-id`" | Always visible though only relevant for insert; prose-enforced requiredness; CSS-selector knowledge needed | Precise insert targeting | conditional-option | Add `visibleWhen: { field: "updateMode", valueIn: ["insert"] }` (new infra; required-when-visible) | Keep with jargon allowed once conditional-advanced | — | key/values unchanged | None — hidden field cleared per SchemaForm rules; insert-mode users still see it |
| position | select, def "after" | Only used for insert; always visible | — | conditional-option | Same `visibleWhen` as target. Option labels "After the target" / "Before the target" / "Inside the target" | — | default after | values unchanged | None |
| updateMode | select, req, def append | Desc is one dense sentence covering all 4 modes incl. recoverability caveat — good honesty, heavy wording | replace/insert modes | core-user-decision | Desc: "Where your content goes: add to the end (append), the start (prepend), replace everything (old content only recoverable via OneNote's version history), or insert at a specific spot (set Insert target)." | — | default append | values unchanged | None |
| content | textarea, req; "HTML fragment… Graph parses with the HTML5 parser" | Graph-parser jargon | — | core-user-decision | Desc: "The content to add or insert. HTML formatting is supported; variables from earlier steps resolve at runtime." | — | — | — | None |
| notebookId, sectionId, pageId | cascade comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onenote:copy_page (action) — Copy Page
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| targetSectionId | text, req; desc: "**Text input — no picker.** Paste a section id from a URL or chain a `list_sections` action…" | Required raw section id; a nontechnical user cannot finish (paste-an-id or build a second node + variable picker). Root cause documented in meta: cascade deps key on literal field NAME (`notebookId`), so source+target cascades can't coexist | Cross-notebook copies via variables | provider-resource-selection | Add sibling resolver `microsoft-onenote:sections_by_target_notebook` accepting dep `targetNotebookId` (**new-resolver** — the fix the meta itself names as deferred "ONENOTE-N polish"), plus new optional scope-narrower field `targetNotebookId` (combobox, `microsoft-onenote:notebooks`) and convert targetSectionId→combobox (`dependsOn: targetNotebookId`, `allowManualEntry: true`). Requires adding `targetNotebookId` to `copyPage.schema.ts` as handler-ignored optional (same pattern as existing notebookId/sectionId scope-narrowers) | — | — | targetSectionId key + value unchanged; additive optional field, `.strict()` schema gains one optional key | Low-medium — schema + meta touch, no rename/migration |
| (node description) | Mentions "Graph `POST /me/onenote/pages/{id}/copyToSection`", "ONENOTE-5", "ONENOTE-N polish" | Internal slice IDs + wire endpoint in builder-visible copy | — | internal-implementation-detail | Desc: "Copy a page into another section. The copy finishes on Microsoft's side shortly after this step succeeds — use the New Note trigger if a later step needs the new page." | — | — | — | None |
| notebookId, sectionId, sourcePageId | cascade comboboxes | OK (source side) | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onenote:get_page_content (action) — Get Page Content
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| includeIDs | boolean, def; desc "Graph embeds `data-id` attributes…load-bearing when chaining into Update Page" | Pure power-user chaining knob in normal path | Update-Page insert chaining | advanced-user-control | — | `advanced: true`; desc: "Turn on when a later Update Page step will insert at a specific spot on this page." | default kept | key unchanged | None |
| preGenerated | boolean, def true; "Graph performance hint…cached HTML representation" | Provider performance internals in normal path | Freshness control | advanced-user-control | — | `advanced: true`; desc: "Faster (may return a slightly stale copy of the page). Turn off to always fetch the latest content." | default kept | key unchanged | None |
| notebookId, sectionId, pageId | cascade comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onenote:list_pages (action) — List Pages
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| top | number, def 20; desc "Graph caps `$top` at 100 for OneNote pages — the schema enforces 1..100" | `$top`/schema jargon | — | safe-default | Desc: "How many pages to return (1–100). Default 20." | — | default 20 | key unchanged | None |
| orderBy | select, defaulted | OK (select with sensible default) | — | safe-default | — | — | — | — | — |
| notebookId, sectionId | comboboxes | OK | — | provider-resource-selection | — | — | — | — | — |

### microsoft-onenote:create_section / create_notebook (actions)
No findings (2 nodes) — picker + plain name field; variable-syntax mention in desc is acceptable guidance.

### microsoft-onenote:delete_page (action) — Delete Page
No findings — full cascade pickers; description carries an honest unrecoverability warning ("cannot be recovered through ChainReact").

### microsoft-onenote:list_sections / get_section_details / list_notebooks / get_notebook_details (actions)
No findings (4 nodes) — pickers and defaulted sort selects with plain labels.

### microsoft-onenote:new_note (trigger) — New Note
No findings — notebook→section cascade, watch-scope clearly explained.

### microsoft-onenote:updated_note (trigger) — Updated Note
No findings — optional page filter is exemplary conditional wording ("When set, the trigger fires ONLY when this specific page is updated. Leave empty to fire for any update in the section.").

---

## microsoft-outlook-calendar

### microsoft-outlook-calendar:create_event (action) — Create Event
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| bodyContentType | select, optional, always visible; "Required when Body is set" prose | Conditional requirement enforced only by prose; shown even with no Body | HTML bodies | conditional-option | `visibleWhen: { field: "body", truthy: true }` + required-when-visible (new infra). Options "Formatted (HTML)" / "Plain text" | — | — | key/values unchanged | None — hidden when body empty, mandatory when body set |
| subject | text, req; desc "(Graph accepts an empty subject)" | Contradiction: field is required but desc advertises empty-is-fine; Graph name-drop | — | core-user-decision | Desc: "The event's title, as attendees will see it on the invite." | — | — | — | None |
| isAllDay | boolean, req (Q11 — keep required, no default) | Correctly required; desc leads with "Microsoft Graph requires…" | — | core-user-decision | Desc: "Make this an all-day event. All-day events must start and end at midnight in the event's time zone." (keep required — Q11) | — | NO default (Q11) | — | None |
| responseRequested | boolean, req (Q11) | OK — plain RSVP outcome wording | — | core-user-decision | — | — | NO default (Q11) | — | — |
| startTimeZone / endTimeZone | timezone, optional, UTC fallback | OK; two separate zones is provider-faithful; most users set one | Split-zone events | safe-default | LOW: consider endTimeZone `advanced: true` (rare to differ from start) | endTimeZone advanced | UTC fallback stated | keys unchanged | Low |
| location | location type | OK — best-in-group field ("type any free-text place") | — | core-user-decision | — | — | — | — | — |
| attendees | string-array of emails | OK; cross-references Add Attendees for optional invitees | — | core-user-decision | — | — | — | — | — |
| showAs, sensitivity, importance, reminderMinutesBeforeStart | optional selects/number | OK but 4 optional refinements crowd setup | Calendar presentation | advanced-user-control | — | `advanced: true` on all 4 (all optional; importance is optional here so Q11's required-importance rule for Outlook mail does not bind) | omit = provider default | keys unchanged | None |
| startDateTime, endDateTime, body | datetime/textarea | OK | — | core-user-decision | — | — | — | — | — |

### microsoft-outlook-calendar:update_event (action) — Update Event
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| eventId | text, req; ph `{{trigger.eventId}}` | OK — event ids are inherently upstream-fed (no stable picker universe); placeholder teaches the wiring | — | upstream-data-mapping | — | — | — | — | — |
| bodyContentType | as create_event | Same prose-conditional | — | conditional-option | Same `visibleWhen: body truthy` | — | — | — | None |
| attendees | label "Attendees (Replace)" | GOOD — replace-semantics warning is exactly right (recipient-visible destructive-ish) | — | core-user-decision | — | — | — | — | — |
| showAs, sensitivity, importance, reminderMinutesBeforeStart | optional | Same as create_event | — | advanced-user-control | — | `advanced: true` on all 4 | — | — | None |
| others (subject, times, zones, isAllDay, responseRequested, location, body) | all optional leave-empty-to-keep | OK — consistent "leave empty to keep current" pattern; paired-times Graph rule stated plainly | — | core-user-decision | — | — | — | — | — |

### microsoft-outlook-calendar:delete_event (action) — Delete Event
No findings — single eventId (upstream-data-mapping with teaching placeholder).

### microsoft-outlook-calendar:add_attendees (action) — Add Attendees
No findings — eventId (upstream mapping), attendees string-array with dedup note, attendeeType required select whose description explains the outcome ("mandatory invitees" vs "FYI invitees"). "Microsoft Graph shows these differently" clause is trimmable (LOW).

### microsoft-outlook-calendar:list_events (action) — List Events
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| startDateTime / endDateTime | datetime-utc; desc "entered in **UTC** (stored as `2026-06-01T00:00:00Z`)" | Wire-format storage detail in desc; both-or-neither rule prose-only | Windowed queries | core-user-decision | Desc: "Earliest event start to include (UTC). Set both window fields or neither." / mirror for end. (Both-or-neither cross-field validation is runtime; wording is the available lever) | — | — | keys/format unchanged | None |
| subjectFilter | text; "(Graph $filter)" | $filter jargon | — | core-user-decision | Desc: "Only include events whose title contains this text." | — | — | — | None |
| top, orderBy | defaulted number/select | OK | — | safe-default | — | — | — | — | — |

### microsoft-outlook-calendar:event_changed (trigger) — Event Changed
No findings — zero config fields; watches the primary calendar. Nothing to misconfigure.

---

## Change list

### HIGH (normal user blocked/misled)
1. `integrations/microsoft-excel/actions/addTableRow.meta.ts` — `values`: convert `string-array` → `spreadsheet-rows` (no `batchRowsField`), `optionsSource: "microsoft-excel:table_columns"`, `dependsOn: ["workbookId","tableName"]`. **new-resolver**: register `microsoft-excel:table_columns` in `services/options/_registry.ts` backed by existing `integrations/microsoft-excel/api/tableColumnsList.ts` (scope already granted). Editor commits the schema's existing header-keyed record branch. Desc: "Fill in a value for each of the table's columns. Columns load from the table you picked." (Matches closeout's named deferred item.)
2. `integrations/microsoft-teams/actions/sendChatMessage.meta.ts` — `chatId`: convert text → combobox `optionsSource: "microsoft-teams:chats"`, `allowManualEntry: true`. **new-resolver** (Graph `GET /me/chats?$expand=members`, existing Chat scope; label 1:1 chats by other participant's displayName). NOTE: un-defers an explicit Marcus decision recorded in `_registry.ts` — needs his sign-off; if kept deferred, at minimum reword desc: "Paste the chat's id from a Teams chat link, or wire it from an earlier step." and mark this action power-user in copy.
3. `integrations/microsoft-onenote/actions/copyPage.meta.ts` + `copyPage.schema.ts` — add optional handler-ignored `targetNotebookId` (combobox, `microsoft-onenote:notebooks`); convert `targetSectionId` text → combobox with **new-resolver** `microsoft-onenote:sections_by_target_notebook` (dep name `targetNotebookId`), `allowManualEntry: true`. This is the fix path the meta itself defers to "ONENOTE-N polish". Schema gains one optional key (additive, `.strict()` updated) — no rename/migration.

### MEDIUM (confusing/technical wording, missing conditional/advanced placement)
4. `integrations/microsoft-excel/actions/updateRow.meta.ts` — `values`: column-aware record editor (closeout's deferred "record-commit mode" / `spreadsheet-record` type) fed by existing `microsoft-excel:worksheet_columns`; commits identical `Record<header,value>` shape. Until then desc: "Pick a column and enter its new value. Column names must match your header row exactly, including capitals."
5. `integrations/microsoft-excel/actions/findRow.meta.ts` — `lookupColumn`: text → combobox `optionsSource: "microsoft-excel:table_columns"` (same new-resolver as #1), `allowManualEntry: true`.
6. `integrations/microsoft-onedrive/actions/listItems.meta.ts` — `orderBy`: text → select, options `[name asc|Name (A–Z), name desc|Name (Z–A), lastModifiedDateTime desc|Recently modified first, lastModifiedDateTime asc|Oldest modified first, size desc|Largest first]`; desc "How the returned items are sorted."
7. `integrations/microsoft-onedrive/actions/uploadFile.meta.ts` — `mimeType`: text → combobox, static common-type options (values are real MIME strings) + `allowManualEntry: true`; desc "What kind of file this is — pick the type matching the file extension." `contentEncoding` option labels → "Text (as typed)" / "Base64 (binary files)".
8. `integrations/microsoft-onenote/actions/updatePage.meta.ts` — `target` + `position`: add `visibleWhen: { field: "updateMode", valueIn: ["insert"] }` (required-when-visible for `target`). `updateMode` desc → plain outcome sentence (see node table). `content` desc → drop "Graph parses with the HTML5 parser".
9. `integrations/microsoft-onenote/actions/getPageContent.meta.ts` — `includeIDs` + `preGenerated`: `advanced: true` + plain-outcome descs (see node table).
10. `integrations/microsoft-onenote/actions/createPage.meta.ts` — `contentType`: option labels → "HTML" / "Plain text" / "Strict XHTML" (values unchanged); consider `advanced: true` (safe default `text/html`). `title`/`content` descs: drop `<title>`-element and backtick-key jargon (see node table).
11. `integrations/microsoft-onenote/actions/copyPage.meta.ts` — node `description`: remove Graph endpoint path and "ONENOTE-5"/"ONENOTE-N" slice IDs; replacement in node table.
12. `integrations/microsoft-outlook-calendar/actions/createEvent.meta.ts` + `updateEvent.meta.ts` — `bodyContentType`: `visibleWhen: { field: "body", truthy: true }` + required-when-visible (preserves the Q11 no-silent-default rule while hiding it when irrelevant).
13. `integrations/microsoft-outlook-calendar/actions/createEvent.meta.ts` + `updateEvent.meta.ts` — `showAs`, `sensitivity`, `importance`, `reminderMinutesBeforeStart`: `advanced: true` (all optional refinements; importance is optional on calendar events so Q11's mail rule doesn't bind).
14. `integrations/microsoft-outlook-calendar/actions/listEvents.meta.ts` — window/subjectFilter descs: drop stored-wire-format and "$filter" mentions (replacements in node table).
15. `integrations/microsoft-excel/actions/readTableRows.meta.ts` + `integrations/microsoft-teams/actions/listChannelMessages.meta.ts` — relabel `top` "Top" → "Max rows" / "Max messages"; plain range desc.
16. `integrations/microsoft-onenote/actions/listPages.meta.ts` — `top` desc: "How many pages to return (1–100). Default 20." (drop `$top`/schema mention).

### LOW (polish)
17. `integrations/microsoft-outlook-calendar/actions/createEvent.meta.ts` — `subject` desc: drop "(Graph accepts an empty subject)" contradiction → "The event's title, as attendees will see it on the invite." `isAllDay` desc: lead with outcome, not "Microsoft Graph requires". `endTimeZone`: candidate `advanced: true`.
18. Normalize max-results labels group-wide to "Max results" (excel get_workbooks "Limit", export_sheet "Row Limit", onedrive/teams "Page Size", outlook "Max Results").
19. `integrations/microsoft-excel/actions/findRow.meta.ts` — `maxRows`: `advanced: true`.
20. `integrations/microsoft-outlook-calendar/actions/addAttendees.meta.ts` — `attendeeType` desc: trim trailing "Microsoft Graph shows these differently in the calendar grid."
21. `integrations/microsoft-onenote/actions/createPage.meta.ts` — `content` placeholder `<p>Body…</p>` → "Write the page content…".

## Counts

- Nodes audited: **55** (excel 18, onedrive 8, teams 9, onenote 14, outlook-calendar 6 — every node in the slice appears above)
- Fields audited: **172** (actions 156, triggers 16)
- Fields OK as-is: **~131**
- Findings: **HIGH 3** fields (add_table_row.values, send_chat_message.chatId, copy_page.targetSectionId) · **MEDIUM 27** field-level items (13 change-list entries #4–#16 covering wording/conditional/advanced placement) · **LOW 11** polish items (#17–#21)
- New resolvers proposed: 3 (`microsoft-excel:table_columns` — helper exists; `microsoft-teams:chats` — needs Marcus un-defer; `microsoft-onenote:sections_by_target_notebook` — the meta's own named deferred fix)
- Hard-rule compliance: no key renames, no migrations, Q11 fields (isAllDay, responseRequested, bodyContentType-when-body) stay required; visibleWhen proposals rely on the new required-when-visible semantics.
