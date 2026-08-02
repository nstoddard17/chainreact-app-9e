# Config UX Audit — Group D: gmail, microsoft-outlook, google-docs, google-sheets

Ground truth verified against `integrations/<provider>/actions/*.meta.ts`, `triggers/**/*.meta.ts`, schemas, `services/options/_registry.ts`, and `docs/slices/phase-5/spreadsheet-guided-config/spreadsheet-config-redesign-closeout.md` §Secondary targets (Sheets `range` history honored — no range redesign proposed here).

## Systemic patterns

1. **Existing pickers not wired up (10 fields).** `gmail:labels` resolver exists and is used by Add Label only; 5 more gmail label fields are free-text "Label_12345" entry (send_email.labels, search_emails.labelIds, remove_label.labelIds, new_email.labelIds, new_labeled_email.labelId). `microsoft-outlook:folders` resolver exists (ANALYTICS-SOURCES-OUTLOOK-1, `integrations/microsoft-outlook/options/folders.ts`) and is used by ZERO outlook fields; 4 folder fields are free text (fetch_emails.folderId, move_email.destinationFolderId, new_email.folder, email_flagged.folder). Cheapest, highest-yield fixes in this group.
2. **Mode-scoped fields shown unconditionally with "(x mode only)" label suffixes (~19 fields).** gmail search_emails (12 fields suffixed "(filter mode)"/"(raw mode only)"), outlook get_attachment (2), docs update_document.searchText (1), docs share_document (message/publicPermission/allowDiscovery, 3), sheets row_changed.keyColumn (1). No provider in this group uses `visibleWhen` yet (grep-verified). The new top-level `visibleWhen` + required-when-visible is exactly what these need; label suffixes then drop.
3. **Implementation jargon in setup-path descriptions (~30 fields + ~20 node descs).** API endpoint names (`documents.batchUpdate`, `spreadsheets.values.get`, `users.messages.modify`, `/replyAll endpoint`), OAuth scope names, internal process names ("Outlook Phase 2 Q11", "V1-parity", "Batch 1"), and one reference to a repo source file a user can never see (readRows.range: "Use the read-rows comment block in `readRows.schema.ts`"). Scope/endpoint info belongs in node-level docs or advanced copy, not setup field descriptions.
4. **Sheets free-text A1 `range` (5 fields: read_rows, append_row, update_row, clear_range, + ranges inside batch_update JSON).** Known deferred product decision (closeout §Secondary targets: sheet picker + derived range must come first). Format Range already ships the target pattern (sheet combobox + bare-A1 range). This audit proposes only copy/placeholder polish and records the follow-up dependency; no redesign.
5. **Q11 required-no-default fields are correctly required** (valueInputOption ×4, isHtml ×2, importance ×2, replyAll, deleteMode ×2, sendNotification). Findings are wording-only: descriptions cite internal doc names instead of explaining the user-visible consequence, and option labels are raw enums (RAW/USER_ENTERED) where friendlier labels with verbatim values would help.
6. **Dates as free text (4 fields).** outlook fetch_emails startDate/endDate (ISO 8601) are candidates for `datetime-utc` (commit shape stays an ISO string — verify renderer output format before switching). gmail dateAfter/dateBefore demand strict `YYYY/MM/DD` (Gmail q-syntax) — a `date` field would commit the wrong shape; keep text, improve copy.
7. **json fields:** formatRange.numberFormat is a small flat fixed-key object `{type, pattern?}` — prime candidate for the new `object` structured editor (type=select of 8 enums, pattern=text). batchUpdate.updates is genuinely nested (array of {range, values[][]}) — correctly stays json+advanced.
8. **Upstream-ID text fields are fine as-is (12 fields).** messageId/emailId/originalMessageId/attachmentId are upstream-data-mapping by nature; every one already tells the user which trigger/action output to wire. No change.

---

## gmail (18 nodes)

### gmail:send_email (action) — Send Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| labels | string-array free text, ph "Label_12345" | Demands internal label IDs; picker exists on Add Label | Paste raw IDs | provider-resource-selection | `optionsSource: "gmail:labels"`, `allowManualEntry: true` (mirror addLabel.meta.ts) | — | — | still string[] of ids | none |
| labels (desc) | cites `users.messages.modify` | API jargon | — | — | "Optionally tag the sent email with Gmail labels. Pick from your labels or paste a label ID." | — | — | — | none |
| replyTo | text, RFC-flavored desc | mostly fine; niche header | header control | advanced-user-control | — | `advanced: true` | — | same key | none |
| signature | textarea, separator internals in desc | works; desc leaks separator mechanics | HTML sig control | advanced-user-control | trim desc to "Optional signature added after the body." | `advanced: true` (optional nicety) | — | same | none |
Fields to, cc, bcc, subject (defaultValue "" pattern is deliberate — keeps required-by-key satisfied), textBody, htmlBody: OK (core decisions, plain labels; either-or body rule documented).

### gmail:reply_to_email (action) — Reply to Email
No findings — fields OK as-is: originalMessageId is upstream-data-mapping with clear sourcing guidance; subject-override semantics explicit; cc/bcc "(additional)" wording explains derivation from the original message. replyTo/signature same LOW advanced-candidates as send_email.

### gmail:create_draft (action) — Create Draft
No findings — mirrors Send Email minus labels; same LOW note on replyTo/signature.

### gmail:create_draft_reply (action) — Create Draft Reply
No findings — mirrors Reply to Email; clear derivation copy.

### gmail:search_emails (action) — Search Emails
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| searchMode | select REQ default "filters" | good gate, good default | raw q-syntax | core-user-decision | keep | — | filters | — | none |
| query | text, label "Query (raw mode only)" | visible in filters mode where it is rejected at save | raw q-syntax | advanced-user-control | `visibleWhen: {field:"searchMode", valueIn:["raw"]}`; label "Query" | `advanced: true` | — | same key | none |
| from/to/subject/hasAttachment/dateAfter/dateBefore/largerThan/smallerThan/labelIds/hasWords/doesntHaveWords (11) | all labeled "… (filter mode)", always visible | 11 suffixed fields at once is overwhelming; suffix is builder-internal speak | — | conditional-option | `visibleWhen: {field:"searchMode", valueIn:["filters"]}` on each; drop "(filter mode)" from labels | largerThan/smallerThan also `advanced: true` (byte-size niche) | — | same keys | none |
| labelIds | free-text ids | picker exists | raw ids | provider-resource-selection | `optionsSource:"gmail:labels"`, `allowManualEntry:true` | — | — | string[] ids | none |
| dateAfter/dateBefore | strict YYYY/MM/DD text | format trips users; a `date` field would commit the wrong shape | — | conditional-option | keep text; desc: "Only emails after this date. Type as YYYY/MM/DD (e.g. 2026/01/01)." | — | — | must stay YYYY/MM/DD string | date-type switch would break q-syntax |
| maxResults, pageToken | always visible; pageToken is pagination plumbing | normal users never touch pageToken | loop composition | advanced-user-control | — | `advanced: true` both | — | same | none |

### gmail:get_attachment (action) — Get Email Attachment
No findings — messageId/attachmentId are upstream-data-mapping with exact payload-path guidance (`payload.attachments[i].attachmentId`).

### gmail:add_label (action) — Add Label
No findings — the model pattern for this group: string-array + `optionsSource:"gmail:labels"` + allowManualEntry + honest system/user-label copy.

### gmail:remove_label (action) — Remove Label
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| labelIds | REQUIRED string-array free text "Label_12345" | required provider-internal ids, no picker — while sibling Add Label has one | raw ids | provider-resource-selection | `optionsSource:"gmail:labels"`, `allowManualEntry:true`, ph "Search labels or paste a label ID"; desc mirror addLabel | — | — | string[] ids | none |
messageId: OK (upstream mapping).

### gmail:mark_as_read (action) — Mark Email as Read
No findings — single upstream messageId.

### gmail:mark_as_unread (action) — Mark Email as Unread
No findings — single upstream messageId.

### gmail:archive_email (action) — Archive Email
No findings — single upstream messageId; desc explains outcome (removes INBOX label, not deleted).

### gmail:delete_email (action) — Delete Email
No findings — deleteMode is a correct Q11 explicit select with outcome-language options (trash-recoverable vs permanent).

### gmail:create_label (action) — Create Label
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| labelListVisibility, messageListVisibility | optional selects, Gmail-internal concepts | normal users never set these; unset = Gmail default already honest | sidebar/list visibility tuning | advanced-user-control | — | `advanced: true` both | unset → Gmail server default (keep) | same keys/enums | none |
name: OK (core decision).

### gmail:list_labels (action) — List Labels
No findings — zero config fields.

### gmail:get_profile (action) — Get Profile
No findings — zero config fields.

### gmail:new_email (trigger) — New Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| labelIds | string-array free text, default ["INBOX"] | default saves the normal path, but narrowing needs raw ids; desc says "AND-match — must have at least one" — self-contradictory ("AND" vs any-of; filters.ts:19 confirms any-of) | raw ids | provider-resource-selection | `optionsSource:"gmail:labels"`, `allowManualEntry:true`; desc: "Only fire for emails carrying at least one of these labels. Default: Inbox." | — | ["INBOX"] (keep) | string[] ids | none |
| subjectExactMatch | boolean default true | fine, but only meaningful when subject set | — | conditional-option | `visibleWhen: {field:"subject", valueTruthy:true}` | — | true (keep) | same | none |
from, subject, hasAttachment: OK (plain-language optional filters with sane defaults).

### gmail:new_labeled_email (trigger) — New Labeled Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| labelId | REQUIRED text, ph "Label_12345", desc points to Gmail Settings → Labels / labels.list API | worst field in gmail: required internal id, no picker, resolver exists | raw id | provider-resource-selection | convert `text` → `combobox`, `optionsSource:"gmail:labels"`, `allowManualEntry:true`; desc: "Pick the Gmail label that starts this workflow when it's applied to an email." | — | — | still a single string id | none (combobox commits string) |

### gmail:new_attachment (trigger) — New Email Attachment
No findings — zero config fields; node desc correctly routes bytes to the downstream action.

---

## microsoft-outlook (14 nodes)

### microsoft-outlook:send_email (action) — Send Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| (node desc) | says "Attachments are an advanced option not yet exposed in the builder — set via direct workflow JSON" | STALE — the `attachments` field IS in the meta and renders; desc actively misleads | — | — | rewrite node desc: drop the stale sentence | — | — | — | none |
| isHtml | boolean REQ, desc cites "Outlook Phase 2 Q11" | correctly required (Q11 — keep); desc is internal-process speak | — | core-user-decision | desc: "How the body is delivered: on = formatted HTML email, off = plain text. Required — match how you wrote the body." | — | none (Q11 — keep) | same | none |
| importance | select REQ, desc cites Q11 | correctly required; jargon desc | — | core-user-decision | desc: "Priority flag recipients see. 'High' shows Outlook's red exclamation mark. Required — pick one (Normal is typical)." | — | none (Q11 — keep) | same enum | none |
| attachments | file-array, desc is a FileRef/v2_storage/provider_url wall | feature is right; copy is engine-internals | ref plumbing details | upstream-data-mapping | desc: "Attach files from earlier steps — use the variable picker to insert a file output (e.g. a downloaded attachment). Limits: 3 MB per file, 25 MB total." | move v2_storage/provider_url rejection detail to advanced/help copy | — | FileRef array | none |
to, cc, bcc, subject (defaultValue "" deliberate), body: OK.

### microsoft-outlook:reply_to_email (action) — Reply to Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| replyAll | boolean REQ, desc cites Q11 + /reply endpoints | correctly required (Q11 — keep); endpoint jargon | — | core-user-decision | desc: "Required. On: reply goes to the sender and everyone else on the email. Off: only the sender. Choose deliberately — reply-all is visible to all recipients." | — | none (keep) | same | none |
emailId (upstream mapping), body: OK.

### microsoft-outlook:forward_email (action) — Forward Email
No findings — emailId upstream mapping, to/cc chips, comment optional with honest omit-when-blank note.

### microsoft-outlook:create_draft_email (action) — Create Draft Email
Same two wording findings as send_email (isHtml, importance — Q11 stays, drop "Phase 2 Q11" from copy). Other fields OK.

### microsoft-outlook:fetch_emails (action) — Fetch Emails
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| folderId | text, ph "inbox", well-known names OR Graph id | free text where a working resolver exists | raw folder id | provider-resource-selection | convert `text` → `combobox`, `optionsSource:"microsoft-outlook:folders"`, `allowManualEntry:true` | — | blank = all folders (keep) | single string (name or id) — resolver returns ids; manual well-known names still accepted | low (verify resolver lists well-known folders too) |
| query | text, "$search" jargon | works; Graph-internals copy | Graph $search syntax | advanced-user-control | desc: "Optional search words (e.g. from:alice invoice). When set, date limits are applied after results return." | `advanced: true` optional | — | same | none |
| startDate/endDate | text ISO 8601 | typing ISO timestamps by hand | — | core-user-decision | candidate: type → `datetime-utc` IF renderer commits ISO-8601 UTC string (verify before change); else keep text | — | — | must stay ISO string | medium if renderer shape differs — verify first |
| maxResults | number default 10 | fine | — | safe-default | keep | — | 10 | — | none |
emailId N/A. Node desc's 50-cap/pagination honesty: good.

### microsoft-outlook:get_attachment (action) — Get Email Attachment
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| fileExtensions | label "File extensions (by_extension mode only)", always visible | runtime-required only in one mode; suffix is schema-speak | — | conditional-option | `visibleWhen: {field:"downloadMode", valueIn:["by_extension"]}`, `required: true` (required-when-visible), label "File extensions" | — | — | same key | none |
| fileNameFilter | label "File name filter (by_name mode only)" | same | — | conditional-option | `visibleWhen: {field:"downloadMode", valueIn:["by_name"]}`, `required: true`, label "File name contains" | — | — | same | none |
| excludeInline | boolean default true, "V1-parity" in desc | good default; internal jargon | include embedded imgs | safe-default | desc: "On (default): skip images embedded in the email body. Turn off to download those too." | — | true | same | none |
emailId, downloadMode: OK (select with default "all").

### microsoft-outlook:add_categories (action) — Set Categories
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| categories | free-text chips, "Red Category" | display-name strings so typo = silently wrong category; Graph has GET /me/outlook/masterCategories | custom names | provider-resource-selection | NEW-RESOLVER candidate `microsoft-outlook:categories` (Graph masterCategories; needs MailboxSettings.Read scope — SCOPE CHECK required) + `allowManualEntry:true`. Until then keep chips. | — | — | string[] display names | new scope may force reconsent — flag to owner |
emailId OK. PATCH-replace warning in both descs: good, keep.

### microsoft-outlook:move_email (action) — Move Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| destinationFolderId | REQUIRED text, ph "archive" | required folder identity as free text while `microsoft-outlook:folders` resolver sits unused | raw id | provider-resource-selection | convert `text` → `combobox`, `optionsSource:"microsoft-outlook:folders"`, `allowManualEntry:true`; desc: "Pick the folder to move the email into, or paste a folder ID." | — | — | single string | none |
emailId OK; new-id-after-move honesty in outputs: good.

### microsoft-outlook:delete_email (action) — Delete Email
No findings — deleteMode is a correct Q11 explicit select; reversible-vs-permanent copy is outcome-language.

### microsoft-outlook:list_folders (action) — List Folders
No findings — zero config fields.

### microsoft-outlook:get_profile (action) — Get Profile
No findings — zero config fields.

### microsoft-outlook:new_email (trigger) — New Email
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| folder | text, well-known names or Graph id | same unused-resolver gap | raw id | provider-resource-selection | `combobox` + `optionsSource:"microsoft-outlook:folders"` + `allowManualEntry:true` | — | blank = all folders | single string | low |
| subjectExactMatch | boolean default true | only meaningful when subject set | — | conditional-option | `visibleWhen: {field:"subject", valueTruthy:true}` | — | true | same | none |
| from | single text (gmail's analog is string-array) | inconsistent across the two mail providers; single sender is fine but LOW polish | multi-sender | conditional-option | LOW: note inconsistency only — changing type alters committed shape; leave | — | — | keep string | type change would break filter |
subject, hasAttachment, importance: OK (plain selects, "any" defaults).

### microsoft-outlook:email_sent (trigger) — Email Sent
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| subjectExactMatch | boolean default true | only meaningful when subject set | — | conditional-option | `visibleWhen: {field:"subject", valueTruthy:true}` | — | true | same | none |
to, subject: OK.

### microsoft-outlook:email_flagged (trigger) — Email Flagged
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| folder | text | unused-resolver gap | raw id | provider-resource-selection | `combobox` + `optionsSource:"microsoft-outlook:folders"` + `allowManualEntry:true` | — | blank = all | single string | low |
Over-fire caveat lives in node desc — good honesty; consider a `warning`-style surfacing later (LOW).

---

## google-docs (7 nodes)

### google-docs:create_document (action) — Create Document
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| content | desc leaks "BODY_START sentinel (index 1) via documents.batchUpdate" | Docs-API internals in a setup textarea | — | core-user-decision | desc: "Optional starting text for the document. Insert values from earlier steps with {{nodeId.field}}. Leave empty to create a blank doc." | — | — | same | none |
title (dup-on-rerun honesty good), folderId (google-drive:folders picker): OK.

### google-docs:update_document (action) — Update Document
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| searchText | optional, desc shouts "REQUIRED when after_text/before_text", always visible | conditional requirement enforced only at save (superRefine); field shown for 3 modes that ignore it | wildcard matching | conditional-option | `visibleWhen: {field:"insertLocation", valueIn:["after_text","before_text"]}`, `required: true` (required-when-visible); label "Text to find" | — | — | same key; schema already enforces | none |
| searchText (desc) | wildcard sentence is self-contradictory ("paste a literal `*` if you want regex-wildcard behavior") | confuses literal vs wildcard | — | — | desc: "Text to locate in the doc (last match wins). `*` matches anything, e.g. `Invoice *:`. Other text matches exactly." | — | — | — | none |
| insertLocation (desc) | "right after BODY_START" leak | minor internals | — | core-user-decision | drop "(right after BODY_START)"; option labels already excellent (incl. irreversible warning on replace) | — | — | — | none |
documentId (picker), content: OK.

### google-docs:share_document (action) — Share Document
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| message | ignored when sendNotification false, always visible | dead field half the time | — | conditional-option | `visibleWhen: {field:"sendNotification", valueTruthy:true}` | — | — | same | none |
| publicPermission | ignored unless makePublic, always visible | dead field | link-permission | conditional-option | `visibleWhen: {field:"makePublic", valueTruthy:true}` | — | reader (keep) | same enum | none |
| allowDiscovery | only meaningful with makePublic | dead field + big consequence | web-publish | conditional-option | `visibleWhen: {field:"makePublic", valueTruthy:true}`; keep the "effectively published on the web" warning | — | false | same | none |
| transferOwnership | boolean default false, irreversible | catastrophic-if-misclicked toggle sitting in normal path | ownership handoff | advanced-user-control | — | `advanced: true` (keeps schema superRefine guardrails); keep irreversibility warning | false | same | none |
| shareWith | required-when-not-public, stated only in prose | conditional requiredness invisible to readiness | — | core-user-decision | desc keep; optionally `visibleWhen` is wrong here (needed by default) — instead note "Required unless 'Make public' is on" first sentence | — | — | same | none |
documentId, permission (default reader), sendNotification (Q11 — correctly required, copy already outcome-first): OK.

### google-docs:get_document (action) — Get Document
No findings — single documentId picker.

### google-docs:export_document (action) — Export Document
No findings — documentId picker; exportFormat is a real core decision with consumer-oriented guidance; fileName derives from doc title when omitted (good derived-value default). 10MB cap honesty in node desc.

### google-docs:new_document (trigger) — New Document
No findings — single optional folderId picker with clear whole-drive default.

### google-docs:document_updated (trigger) — Document Updated
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| folderId | "Ignored when documentId is set" — prose-only precedence | can't express "show when documentId empty" with valueIn/valueTruthy (no negation) | folder scope | conditional-option | LOW: keep as-is; precedence copy is clear. If visibleWhen grows a negation form, gate on documentId empty. | — | — | same | none |
documentId: OK (picker, "narrowest filter" copy good).

---

## google-sheets (14 nodes)

### google-sheets:read_rows (action) — Read Rows
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| range | REQUIRED free-text A1; desc ends "Use the read-rows comment block in `readRows.schema.ts` for the full grammar" | cites a repo source file the user can never open — dead-end misleading copy; A1 free-text itself is the known deferred redesign (closeout §Secondary targets: sheet picker + derived range first) | full A1 grammar | core-user-decision (redesign deferred) | desc: "Which cells to read, in A1 notation. Examples: `Sheet1!A:Z` (all rows in columns A–Z — most common), `Sheet1!A1:D100` (fixed block), or `Sheet1` (whole tab)." | — | — | verbatim A1 string | none (copy only) |
| majorDimension | select REQUIRED default ROWS | pure API concept; default covers ~every workflow | column-major reads | internal-implementation-detail (surfaced) | — | `advanced: true` (defaultValue keeps readiness satisfied) | ROWS | same enum | none |
| valueRenderOption | optional select, API enum | API concept; omit-for-default already honest | formula/unformatted reads | advanced-user-control | — | `advanced: true` | unset → FORMATTED_VALUE | same | none |
spreadsheetId: OK (picker).

### google-sheets:get_cell_value (action) — Get Cell Value
No findings — the target pattern: spreadsheet picker + dependent sheet picker + single-cell text with explicit reject rules and null-on-empty branch guidance.

### google-sheets:get_sheet_metadata (action) — Get Sheet Metadata
No findings — single spreadsheet picker.

### google-sheets:create_spreadsheet (action) — Create Spreadsheet
No findings — title + optional initialSheetName, both plain-language with honest dup-on-rerun note.

### google-sheets:find_row (action) — Find Row
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| operator | select REQ default equals, desc advertises future "follow-up slice" operators | roadmap-speak in user copy | future ops | safe-default | desc: "How to compare. Currently 'equals' (exact match)." | — | equals | same | none |
| column | text header-name | header names (not letters) is the RIGHT UX; a `google-sheets:columns` resolver (headers of selected sheet) would finish it — new-resolver candidate, same pattern the closeout planned for Excel `table_columns` | — | provider-resource-selection | LOW/follow-up: new-resolver `google-sheets:columns` (values.get row 1; existing scope) + `allowManualEntry` | — | — | header string | new resolver only |
spreadsheetId, sheetName (dependent picker), value, returnAll (honest scan-cost note): OK.

### google-sheets:append_row (action) — Append Row
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| range | REQUIRED free-text A1 | known deferred redesign (closeout: no reliable dependsOn parent for a columns resolver until sheet picker + derived range product decision). Copy is already example-first. NOT re-proposed here; recorded as the follow-up dependency. | full A1 | core-user-decision (redesign deferred) | no change this pass | — | — | verbatim | none |
| values | positional string-array | Excel add_row got the `spreadsheet-rows` column-aware editor; Sheets deferred behind the range decision. Record as the same follow-up (needs sheet-derived columns). | — | structured-composition (future) | no change this pass | — | — | string[] | none |
| valueInputOption | select REQ no default (Q11 — keep) | correct requirement; enum labels raw | — | core-user-decision | option labels: "Parse as if typed in Sheets" (value USER_ENTERED) / "Store exactly as written" (value RAW); desc: "How Sheets treats your values. Required — 'parse as typed' turns =SUM(...), dates and numbers live; 'store exactly' keeps them as text." | — | none (Q11) | values verbatim | none |
| insertDataOption | select REQ default INSERT_ROWS | good safe default, destructive alternative labeled | overwrite mode | safe-default | keep | — | INSERT_ROWS | same | none |
spreadsheetId: OK.

### google-sheets:update_row (action) — Update Row
Same three notes as Append Row: range (deferred redesign — no change), values (positional array — future structured editor behind same dependency), valueInputOption (Q11 keep; same friendlier option labels). spreadsheetId OK.

### google-sheets:update_cell (action) — Update Cell
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| valueInputOption | Q11 required select | correct; same friendlier option labels as append_row | — | core-user-decision | same label/desc treatment | — | none (Q11) | verbatim | none |
spreadsheetId, sheetName, cell, value: OK (mirrors get_cell_value pattern).

### google-sheets:clear_range (action) — Clear Range
No findings beyond the shared range note — destructive framing, typed-confirmation requirement, and header-preserving example (`Sheet1!A2:Z100`) are exactly right. range redesign deferred (shared dependency).

### google-sheets:delete_row (action) — Delete Row
No findings — dependent pickers + 1-indexed rowNumber matching the Sheets UI, descending-order chaining caveat in node desc.

### google-sheets:batch_update (action) — Batch Update
No findings — `updates` is correctly the json escape hatch (`advanced: true`, `jsonShape:"array"`, sheet-prefix rule stated, placeholder shows exact shape); genuinely nested, not an `object`-editor candidate. valueInputOption: same Q11 label polish as append_row (MEDIUM shared). Node is inherently power-user.

### google-sheets:format_range (action) — Format Range
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| numberFormat | json ADV `{type, pattern?}` | small flat fixed-key object — exact `object` structured-editor candidate flagged by the brief: type=select (8 enums), pattern=text | raw pattern grammar | structured-composition | convert json → `object` editor when the type lands (type select + optional pattern text); keep advanced | stays advanced | — | identical nested object | none if editor commits same shape |
| backgroundColor/textColor | text hex `#RRGGBB` | typing hex works; no color field type exists — acceptable | — | core-user-decision | LOW: keep; placeholder already shows format | — | — | hex string | none |
spreadsheetId, sheetName, bare-A1 range (the model for the future append/update redesign), bold, italic, horizontalAlignment: OK.

### google-sheets:new_worksheet (trigger) — New Worksheet
No findings — single spreadsheet picker.

### google-sheets:row_changed (trigger) — Row Changed
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| changeKinds | REQUIRED string-array free chips; 3 valid values live only in desc ("do not add new FieldTypes" slice rule per meta comment) | typo ("update" vs "updated") fails only at save; default ["added"] covers normal path | hash-diff modes | conditional-option | convert → `combobox` `multiple:true` with static options added/updated/removed (contract allows inline options on combobox); commits same string[] | — | ["added"] (keep) | string[] of same 3 values | low — verify multi-combobox commits plain string[] |
| snapshotRowLimit | number default 1000, ignored in added-only mode | storage-tuning knob in normal path | bound snapshot cost | advanced-user-control | — | `advanced: true` (visibleWhen can't test array membership — leave unconditional in Advanced) | 1000 | same | none |
| keyColumn | text, "Requires Header row on" prose | dead field when headerRow off; schema rejects mismatch at save | stable row identity | conditional-option | `visibleWhen: {field:"headerRow", valueTruthy:true}` | — | blank = positional | same | none |
spreadsheetId, sheetName, headerRow: OK.

---

## Change list

### HIGH
1. `integrations/gmail/triggers/newLabeledEmail/newLabeledEmail.meta.ts` — `labelId`: `type: "combobox"`, `optionsSource: "gmail:labels"`, `allowManualEntry: true`; desc → "Pick the Gmail label that starts this workflow when it's applied to an email. System labels also accepted by ID." Required internal ID with existing unused resolver.
2. `integrations/gmail/actions/removeLabel.meta.ts` — `labelIds`: add `optionsSource: "gmail:labels"`, `allowManualEntry: true`, ph "Search labels or paste a label ID"; desc mirror addLabel.meta.ts. Required internal IDs, picker exists one file away.
3. `integrations/microsoft-outlook/actions/moveEmail.meta.ts` — `destinationFolderId`: `type: "combobox"`, `optionsSource: "microsoft-outlook:folders"`, `allowManualEntry: true`; desc → "Pick the folder to move the email into, or paste a folder ID." Required folder identity; resolver exists, unused.
4. `integrations/microsoft-outlook/actions/sendEmail.meta.ts` — node `description`: delete the stale sentence "Attachments are an advanced option not yet exposed in the builder — set via direct workflow JSON if needed." (field ships; copy misleads).
5. `integrations/google-sheets/actions/readRows.meta.ts` — `range` desc: remove the `readRows.schema.ts` sentence; replace with "Which cells to read, in A1 notation. Examples: `Sheet1!A:Z` (all rows in columns A–Z — most common), `Sheet1!A1:D100` (fixed block), or `Sheet1` (whole tab)." (users pointed at a repo source file).

### MEDIUM
6. `integrations/gmail/actions/sendEmail.meta.ts` — `labels`: add `optionsSource: "gmail:labels"`, `allowManualEntry: true`; desc → "Optionally tag the sent email with Gmail labels. Pick from your labels or paste a label ID."
7. `integrations/gmail/actions/searchEmails.meta.ts` — add `visibleWhen: {field:"searchMode", valueIn:["filters"]}` to from, to, subject, hasAttachment, dateAfter, dateBefore, largerThan, smallerThan, labelIds, hasWords, doesntHaveWords; `visibleWhen: {field:"searchMode", valueIn:["raw"]}` + `advanced: true` on query; strip "(filter mode)"/"(raw mode only)" from all labels; `labelIds` add `optionsSource:"gmail:labels"` + `allowManualEntry:true`; `advanced: true` on largerThan, smallerThan, maxResults, pageToken.
8. `integrations/gmail/triggers/newEmail/newEmail.meta.ts` — `labelIds`: add `optionsSource:"gmail:labels"`, `allowManualEntry:true`; desc → "Only fire for emails carrying at least one of these labels. Default: Inbox." (fixes the "AND-match" contradiction; filters.ts:19 = any-of). `subjectExactMatch`: `visibleWhen: {field:"subject", valueTruthy:true}`.
9. `integrations/microsoft-outlook/actions/fetchEmails.meta.ts` — `folderId`: `type:"combobox"`, `optionsSource:"microsoft-outlook:folders"`, `allowManualEntry:true`. `query` desc → "Optional search words (e.g. from:alice invoice). When set, date limits are applied after results return."
10. `integrations/microsoft-outlook/triggers/newEmail/newEmail.meta.ts` + `triggers/emailFlagged/emailFlagged.meta.ts` — `folder`: `type:"combobox"`, `optionsSource:"microsoft-outlook:folders"`, `allowManualEntry:true`. newEmail `subjectExactMatch`: `visibleWhen: {field:"subject", valueTruthy:true}` (same on `triggers/emailSent/emailSent.meta.ts`).
11. `integrations/microsoft-outlook/actions/getAttachment.meta.ts` — `fileExtensions`: `visibleWhen: {field:"downloadMode", valueIn:["by_extension"]}`, `required: true`, label "File extensions". `fileNameFilter`: `visibleWhen: {field:"downloadMode", valueIn:["by_name"]}`, `required: true`, label "File name contains". `excludeInline` desc → "On (default): skip images embedded in the email body. Turn off to download those too."
12. `integrations/microsoft-outlook/actions/sendEmail.meta.ts` + `createDraftEmail.meta.ts` — `isHtml` desc → "How the body is delivered: on = formatted HTML email, off = plain text. Required — match how you wrote the body." `importance` desc → "Priority flag recipients see. 'High' shows Outlook's red exclamation mark. Required — pick one (Normal is typical)." (Q11 requiredness unchanged.)
13. `integrations/microsoft-outlook/actions/replyToEmail.meta.ts` — `replyAll` desc → "Required. On: reply goes to the sender and everyone else on the email. Off: only the sender. Choose deliberately — reply-all is visible to all recipients." (Q11 unchanged.)
14. `integrations/microsoft-outlook/actions/sendEmail.meta.ts` — `attachments` desc → "Attach files from earlier steps — use the variable picker to insert a file output (e.g. a downloaded attachment). Limits: 3 MB per file, 25 MB total."
15. `integrations/google-docs/actions/updateDocument.meta.ts` — `searchText`: `visibleWhen: {field:"insertLocation", valueIn:["after_text","before_text"]}`, `required: true`, label "Text to find"; desc → "Text to locate in the doc (last match wins). `*` matches anything, e.g. `Invoice *:`. Other text matches exactly." `insertLocation` desc: drop "(right after BODY_START)".
16. `integrations/google-docs/actions/shareDocument.meta.ts` — `message`: `visibleWhen: {field:"sendNotification", valueTruthy:true}`. `publicPermission` + `allowDiscovery`: `visibleWhen: {field:"makePublic", valueTruthy:true}`. `transferOwnership`: `advanced: true`. `shareWith` desc: lead with "Required unless 'Make public' is on."
17. `integrations/google-docs/actions/createDocument.meta.ts` — `content` desc → "Optional starting text for the document. Insert values from earlier steps with {{nodeId.field}}. Leave empty to create a blank doc."
18. `integrations/google-sheets/actions/readRows.meta.ts` — `majorDimension`: `advanced: true` (defaultValue ROWS keeps readiness green). `valueRenderOption`: `advanced: true`.
19. `integrations/google-sheets/actions/appendRow.meta.ts`, `updateRow.meta.ts`, `updateCell.meta.ts`, `batchUpdate.meta.ts` — `valueInputOption` option labels → "Parse as if typed in Sheets" (USER_ENTERED) / "Store exactly as written" (RAW); desc → "How Sheets treats your values. Required — 'parse as typed' makes =SUM(...), dates and numbers live; 'store exactly' keeps them as text." (values + requiredness verbatim; Q11 intact.)
20. `integrations/google-sheets/triggers/rowChanged/rowChanged.meta.ts` — `keyColumn`: `visibleWhen: {field:"headerRow", valueTruthy:true}`. `snapshotRowLimit`: `advanced: true`. `changeKinds`: convert to `combobox` `multiple:true` with static options {added, updated, removed} (verify multi-combobox commits plain string[] before shipping).
21. `integrations/gmail/actions/createLabel.meta.ts` — `labelListVisibility`, `messageListVisibility`: `advanced: true`.
22. NEW-RESOLVER (scope check required): `microsoft-outlook:categories` via Graph GET /me/outlook/masterCategories for `addCategories.meta.ts` `categories` (+`allowManualEntry:true`). Needs MailboxSettings.Read — may force reconsent; owner decision.

### LOW
23. `integrations/gmail/actions/sendEmail.meta.ts` (+ createDraft, replyToEmail, createDraftReply) — `replyTo`, `signature`: `advanced: true` (declutter the common send path).
24. `integrations/gmail/actions/searchEmails.meta.ts` — `dateAfter`/`dateBefore` desc → "Only emails after this date. Type as YYYY/MM/DD (e.g. 2026/01/01)." (keep text type — a date field would commit the wrong shape for q-syntax).
25. `integrations/microsoft-outlook/actions/fetchEmails.meta.ts` — `startDate`/`endDate`: candidate `datetime-utc` type IF the renderer commits an ISO-8601 UTC string (verify committed shape first; otherwise keep text).
26. `integrations/google-sheets/actions/findRow.meta.ts` — `operator` desc → "How to compare. Currently 'equals' (exact match)." (drop roadmap-speak). Follow-up: new-resolver `google-sheets:columns` (header row of the selected sheet, existing scope) for `column` + Find Row/keyColumn reuse.
27. `integrations/google-sheets/actions/formatRange.meta.ts` — `numberFormat`: convert json → `object` structured editor ({type: select of 8 enums, pattern: optional text}) when the `object` type lands; keep advanced; commit shape identical.
28. Deferred (recorded, not proposed): Sheets `range` free-text on read_rows/append_row/update_row/clear_range and positional `values` on append/update — blocked on the sheet-picker + derived-range product decision per `docs/slices/phase-5/spreadsheet-guided-config/spreadsheet-config-redesign-closeout.md` §Secondary targets; Format Range's sheet-picker + bare-A1 pattern is the model.

## Counts

- Nodes audited: 53 (gmail 18, microsoft-outlook 14, google-docs 7, google-sheets 14) — every node listed above.
- Fields audited: 193.
- Fields OK as-is: ~130 (all upstream-ID fields, recipient chips, resource pickers, Q11 selects' requiredness, destructive-mode selects, zero-field nodes).
- Findings: HIGH 5 · MEDIUM 17 (change-list entries 6–22, several spanning multiple fields — ~44 fields touched) · LOW 6 (entries 23–28).
- New-resolver proposals: 2 (microsoft-outlook:categories — scope check; google-sheets:columns — existing scope), both marked.
- Deliberately not proposed: Sheets range/values redesign (deferred product decision), any Q11 default, any runtime key/shape change.
