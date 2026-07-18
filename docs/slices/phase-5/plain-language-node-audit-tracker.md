# Plain-Language Node Audit — Tracker (Phase 5)

**Date:** 2026-07-18
**Status:** Audit COMPLETE · **Batch R1 (renderer safety) SHIPPED 2026-07-18** · R2+ not started
**Owner question audited:** *Could an older, non-technical person (persona: a 65-year-old
office worker) understand and complete every node's configuration without provider
documentation or help?*

## Method

Twelve parallel audit passes, full coverage — every action and trigger `*.meta.ts` in
every provider under `integrations/`, plus a dedicated pass over the shared field
renderers in `features/workflow-builder/config-modal/fields/` (systemic — one defect
there touches every node).

**Scope actually covered:** 33 providers, ~401 actions + ~95 triggers (~496 nodes; adp
has zero nodes), plus ~25 shared renderer components. No sampling — clean nodes were
listed explicitly per provider so coverage is provable. Detailed per-node findings
tables are in the appendix sections below.

**Rubric per node:** plain-English title/description (no jargon: ts, cursor, payload,
token, webhook, JSON, upsert, gid, MIME, scope names, endpoint paths) · labels a
non-technical person understands · descriptions readable without provider docs ·
placeholders that are recognizable examples, not `{{...}}`/UUID/epoch syntax · every
static provider resource behind a picker, never a raw ID box · plumbing marked
`advanced: true` · required fields completable without provider-internal knowledge ·
`visibleWhen` hiding irrelevant mode fields · no silent failures.

**Severity:**
- **P0** — ordinary user cannot complete setup without provider-internal knowledge
  (or the UI silently loses their input).
- **P1** — jargon/confusion likely to stall them (they'd need to ask for help).
- **P2** — polish (wording, nicer example).

## Executive summary

**Headline:** the picker/resolver architecture is in genuinely good shape — most
providers have full cascading pickers, and the newest UI surfaces (spreadsheet row
editor, readiness banner, setup hints) were clearly written for this persona. The
product fails the persona in five repeating, fixable ways:

1. **Silent input loss in shared renderers (3 renderer P0s).** FileField and
   FileRefArrayField silently clear rejected pastes; StringArrayField discards
   uncommitted typed text on save. A cleared input reads as success to this persona.
2. **"Reference an existing thing" fields are raw ID boxes (~24 node P0s).** Message
   timestamps (Slack ×7, Teams), file ids (Slack), payment-intent ids (Stripe ×3),
   attachment array-indexing (Gmail), scheduled-message ids — all bare text boxes
   whose only real fill path is variable mapping the user is never guided into. The
   variable picker itself is an unlabeled `{}` icon with no search, no type filtering,
   no array drill-down, raw node-id headers, and raw camelCase output names.
3. **Structured-value editors are missing (~13 node P0s).** Notion and Airtable
   writes, Monday column values, Sheets Batch Update, and Mailchimp segment
   conditions all require hand-authored wire-format JSON / formula / merge-tag
   strings on required fields — several explicitly telling users to read provider
   API docs.
4. **File upload paths that predate FileRef (3 node P0s).** Google Drive and OneDrive
   Upload File demand base64-in-a-textarea + raw MIME types; every other file
   provider consumes FileRef.
5. **Copy is written engineer-to-engineer, portal-wide (the dominant P1 mass).**
   OAuth scopes, REST endpoints, HTTP verbs/codes, internal rule IDs (Q11, V1/V2,
   slice names), resolver keys, `{{...}}` syntax, and markdown that renders as
   literal asterisks/backticks (FieldShell prints descriptions verbatim). QuickBooks
   and Google Calendar prove the plain voice already exists in-repo.

**P0 inventory: 42** (3 shared-renderer + 39 node-level):

| Where | P0s | What |
|---|---|---|
| Shared renderers | 3 | FileField silent reject · FileRefArrayField silent reject/dup · StringArrayField pending-text discard |
| slack | 10 | message `ts` ×6, `threadTs`, `fileId` ×2, `scheduledMessageId`, Block Kit JSON |
| google-sheets | 5 | A1 `range` on Append/Update/Read/Clear + required-JSON Batch Update |
| notion | 5 | Create Page parent+properties, Create DB Entry properties, Create DB properties, Append Block Children |
| airtable | 5 | typed-JSON `fields`/`records` ×4 + `filterByFormula` |
| stripe | 3 | `paymentIntentId` raw box ×3 (no resolver) |
| google-analytics | 2 | Send Event `apiSecret` + `clientId` |
| mailchimp | 2 | Create Segment `conditions.field` + `conditions.op` (wire-strings, "see Mailchimp's reference") |
| microsoft-onedrive | 2 | Upload File `mimeType` + base64 `content` |
| gmail | 1 | Get Email Attachment array-index mapping (picker can't drill arrays) |
| google-drive | 1 | Upload File base64 `content` |
| microsoft-teams | 1 | Reply to Channel Message raw `messageId` |
| microsoft-powerbi | 1 | Bind Paginated Report gateway-datasource UUID row cell (resolver exists, unwired) |
| monday | 1 | Update Item `columnValue` wire-format JSON (D-MON7) |
| shopify | 1 | Update Inventory `inventory_item_id` |

## Per-provider status

| Provider | P0 | Verdict (persona test) |
|---|---|---|
| google-calendar | 0 | **Best in audit** — the copy/UX template others should follow |
| quickbooks | 0 | Most usable of billing trio; "Send Invoice (emails customer)" title pattern is the model |
| calendly | 0 | Passes outright |
| trello | 0 | Closest to ready; six nodes promise "paste an id" without `allowManualEntry` (copy/capability mismatch) |
| motive | 0 | Strong; fuel-purchase-id trio + bulk-import mode gaps (P1) |
| microsoft-excel | 0 | Strongest MS provider; Update Row / Add Table Row skip the column resolvers siblings already use |
| google-docs | 0 | Strong; Share Document permission options need fixing |
| eden | 0 | Strong; 4 free-text fields need selects; media is public-URL-only |
| facebook | 0 | Good; FileRef-dialect upload copy |
| asana | 0 | Structure excellent; "gid" jargon everywhere |
| github | 0 | Fine for its (developer) audience |
| hubspot | 0 | Structurally best-in-class, language worst-in-class — pure copy sweep |
| microsoft-onenote | 0 | Pickers exemplary; descriptions are Graph API docs |
| microsoft-outlook | 0 | Copy reads like commit messages; 6 nodes share a raw emailId box (P1) |
| microsoft-outlook-calendar | 0 | Sound; **UTC-default timezone trap** will create wrong-time events (P1) |
| discord | 0 | Structure excellent; most developer-voiced copy of its group |
| dropbox | 0 | Good; root-folder resolver hole (borderline P0 for top-level-file users) |
| typeform | 0 | One friction point (Get Response "token") |
| adp | 0 | No nodes shipped |
| gmail | 1 | Copy engineer-voiced; attachment flow P0 |
| google-drive | 1 | Clean except Upload File P0 |
| microsoft-teams | 1 | Reply-to-message P0; HTML/Content Type on Setup |
| microsoft-powerbi | 1 | Strong structure; BI-admin domain caveat; jargon cluster |
| monday | 1 | Pickers excellent; column-VALUES are the hole (D-MON7) |
| shopify | 1 | Good pickers; inventory id P0 + rule-language copy |
| google-analytics | 2 | Read nodes model citizens; Send Event is developer-only as shipped |
| mailchimp | 2 | Pickers strong; copy cites endpoints and even source files |
| microsoft-onedrive | 2 | Upload File fails persona outright |
| stripe | 3 | Payment-intent family is the weak spot; dollars-vs-cents flip between siblings |
| airtable | 5 | Reads pass, writes fail (typed-JSON field maps) |
| notion | 5 | Read-only for the persona; write half requires API-doc JSON |
| google-sheets | 5 | Split personality: Delete Row/Find Row are best-in-audit; range nodes un-completable |
| slack | 10 | Half usable: messaging/channels clean; anything referencing an existing message/file is P0 |

## Systemic findings (highest leverage — fix once, land everywhere)

1. **Silent-loss trio** — FileField / FileRefArrayField silent paste- and dup-reject;
   StringArrayField (+ FileField pending) uncommitted text discarded on save;
   KeyValueField/KeyValueListField empty-key rows visible but dropped from the value.
2. **Variable picker overhaul** — visible labeled trigger ("Use data from an earlier
   step") instead of icon-only `{}`; humanized output names (the `_prefillSource.ts`
   machinery already exists); search; type-aware filtering (a file field must only
   offer file outputs); array drill-down (unblocks the Gmail attachment P0);
   friendly source headers (drop raw node ids); plain validator copy. A shared
   "pick the message/file/payment from a previous step" affordance on dynamic-id
   fields would clear or downgrade ~24 P0s (Slack, Teams, Stripe, Gmail, Outlook).
3. **Structured-value editors** — (a) schema-aware field/property editor (fed by the
   already-resolvable table/database schema) for Airtable + Notion writes; (b)
   column-type-aware value editor for Monday (D-MON7); (c) simple field/operator/value
   condition builder (Airtable Find Record, Mailchimp Create Segment, later Notion
   Query filter). One widget family removes ~13 P0s.
4. **FieldShell copy rendering** — descriptions render verbatim; all backticks,
   `**bold**`, `{{...}}` display as raw punctuation. Decide once: minimal inline
   rendering OR a hard plain-text copy convention (recommended — aligns with the
   plain-language goal), then sweep metas.
5. **Copy style rule** — no OAuth scopes, REST paths, HTTP verbs/codes, internal rule
   IDs (Q11/V1/V2/slice names), resolver keys, `{{...}}` syntax, or markdown in any
   user-facing `description`/`label`/`placeholder`/option label. Output/payloadShape
   descriptions included (they surface in the variable picker). Candidate rule doc +
   lint.
6. **`allowManualEntry` copy lint** — any field whose copy says "paste" must set the
   flag or drop the claim (Trello ×6, eden ×12 promise a paste path the renderer
   never shows).
7. **Meta-contract gaps that force bad copy** — no `requiredWhen` (conditional
   requiredness leaks "schema enforces" language); no either-or/mutex field grouping
   (Stripe ×3, Notion Create Comment, Motive bulk import enforce invariants in prose
   only).
8. **Empty states name the next action** — "No matches." → "No channels found in your
   Slack account…"; adopt the "No X yet — do Y" pattern already used by
   RouterRoutesField and the spreadsheet editor.
9. **Datetime/locale honesty** — CronField is UTC-only; Outlook Calendar silently
   defaults event timezones to UTC (wrong-time trap); List Events windows demand
   ISO-UTC. Let users work in local time.

## Proposed fix batches (in leverage order)

| Batch | Scope | Clears |
|---|---|---|
| **R1 — renderer safety** ✅ SHIPPED | Silent-loss trio, KeyValue row hints, inline reject errors, empty-state copy pass, FieldShell error-stacking — see "Batch R1 outcomes" below | 3 renderer P0s + a P1/P2 band across all nodes |
| **R2 — variable picker overhaul** | Labeled trigger, humanized names, search, type filtering, array drill-down, dynamic-id field affordance | Gmail P0; converts ~23 raw-id P0s (Slack/Teams/Stripe…) into guided flows; those nodes also get copy in C-batches |
| **R3 — copy infrastructure** | Plain-text copy rule doc + lint (markdown ban, jargon list, paste⇒`allowManualEntry`), FieldShell decision, `requiredWhen`/mutex meta evaluation | Prevents regression; unblocks copy sweeps |
| **P1 — google-sheets range redesign** | `range` → sheet picker (+ row number / optional range), Batch Update object-list editor | 5 P0s — single highest-value provider fix |
| **P2 — structured editors** | Schema-aware property editor (Airtable, Notion), Monday column-value editor (D-MON7), condition builder (Airtable Find, Mailchimp Segment) | 13 P0s |
| **P3 — file paths** | Google Drive + OneDrive Upload → FileRef (Dropbox pattern), derive MIME from filename, FileField primary-picker UX | 3 P0s + FileField completion |
| **P4 — resolver gap fills** | PowerBI gateway-datasource wiring, Shopify variant→inventory, Stripe payment-intents, Mailchimp merge-fields + members, Excel column resolvers on Update Row/Add Table Row, OneDrive flat-file picker on Move/Copy/Delete, Dropbox root-folder, eden text→selects, GA event names, GitHub milestone/issue | Remaining node P0s + resolver P1s |
| **C1..Cn — provider copy sweeps** | Grouped: Microsoft family · Google family · commerce (Stripe/Shopify/QuickBooks/Mailchimp) · rest. Rewrite descriptions/labels/placeholders/outputs to the Calendar/QuickBooks voice per the R3 rule | The dominant P1 mass |

Each batch: implement → gates (`tsc`, lint, structure, migrations, tests) → local
commit → owner review. No pushes without explicit approval (per CLAUDE.md).

## Batch R1 outcomes (shipped 2026-07-18, local commit)

Scope: shared field renderers only (`features/workflow-builder/config-modal/fields/`).
No provider metadata, no variable-picker overhaul, no structured editors, no FileRef
provider migrations — those remain R2/R3/P-batches.

Fixed (root cause → new behavior):

1. **FileField** — invalid paste silently cleared the input (read as success).
   Now: inline error ("That text isn't a file reference…"), typed text preserved,
   `aria-invalid`, error clears on the next keystroke. Pasting a value identical to
   the already-set one still clears the input silently — that is truthful success
   feedback (the value IS set), kept deliberately.
2. **FileRefArrayField** — invalid paste AND duplicate add both silently cleared,
   indistinguishable from success; picker re-pick of an existing token was a silent
   no-op. Now: DISTINCT inline messages ("…isn't a file reference" vs "That file is
   already in the list"), input preserved, picker duplicates surface the message too.
3. **StringArrayField (free-text)** — typed-but-not-Added text lived only in local
   state and vanished on Save/Cancel/tab-switch; duplicates silently cleared. Now:
   blur auto-commits valid pending text (every pointer/keyboard route to
   Save/Cancel/tab blurs the input first, and the zustand draft updates
   synchronously, so the commit lands before the draft is saved); duplicates show a
   message and keep the text. Same blur auto-commit added to FileField and
   FileRefArrayField (valid → commit; invalid → error + text preserved).
4. **KeyValueField (record mode)** — a row with a value but no name was silently
   omitted from the committed record; duplicate names silently last-write-win. Now:
   per-row inline messages on both paths (empty-name rows are flagged only once a
   value exists to lose; every occurrence of a duplicated name is flagged). Pairs
   mode deliberately unchanged — it commits rows as-is and duplicates are legal
   there (HTTP headers).
5. **KeyValueListField** — same two paths per pair within each row; same fix.
6. **FieldShell** — the error message REPLACED the field description, hiding the
   guidance needed to fix the error. Now error and description stack (error first).
7. **Empty states** — "No file." / "No attachments." / "No items." / "No entries." /
   "No rows added yet." → action-naming copy ("No file yet — add one from an earlier
   step above.", "Nothing added yet — type above, then press Add.", "No rows yet.
   Add a row to get started."). StringArrayField's options-mode "No matches." now
   distinguishes "No matches for 'X'. Try a different search." from "No options
   found in your connected account. Create one in the app, then reopen this list."

Save-path ownership decision: the config shell's existing blocking mechanism
(`collectJsonFieldBlockingError` + `hasBlockingValidationError`) operates on DRAFT
values and cannot see renderer-local pending state; the correct owner for
pending-text safety is blur auto-commit in the renderer (no new shell seam, no
provider-specific save logic). Residual edge: a focus-loss-free programmatic close
would still drop pending text — no such path exists in the current UI (all
Save/Cancel/tab/close routes are pointer- or Tab-key-driven and blur first).

Verification (all run 2026-07-18): focused fields suite 37 suites / 498 tests PASS ·
`npx tsc --noEmit` PASS · `npm run lint` 0 errors (15 pre-existing warnings in
untouched files) · `npm run lint:structure` PASS · `npm run lint:migrations` PASS ·
full workflow-builder tree run with A/B attribution — the only deterministic
failures (WorkflowCanvas "History" tab, notion-list-comments ×2,
variable-picker-file-array ×2) reproduce at CLEAN HEAD in an isolated worktree and
pre-date this batch; the builder e2e config suites sit at their 5s jest timeout
cliff and flip stochastically on BOTH trees (measured: outlook e2e alone — base
4987ms vs R1 3767ms), independent of R1. Follow-up candidate: raise those suites'
per-test timeout.

Remaining R1-adjacent findings deferred by design: variable-picker overhaul
(labeled trigger, humanized names, search, type filtering, array drill-down) → R2;
ComboboxField/MultiOptionsField "No matches." + manual-entry "Use this ID" +
JsonField replace-without-warning + RouterRoutesField/CronField copy → R2/R3;
FieldShell markdown rendering decision → R3.

## Cross-references
- Setup/Advanced classification rationale: `docs/slices/phase-5/builder-config-setup-advanced-tracker.md`
- Monday column-values deferral: D-MON7 (monday research/pattern docs)
- FileField design decisions: `docs/slices/phase-3/single-file-ref-metadata-plan.md`
- Known-stale meta comments found during audit: notion "future resolver" (resolvers shipped), google-drive "files resolver DEFERRED" (it's wired), gmail Add Label "no name-to-id lookup" (picker exists), quickbooks line-item "find ids in QuickBooks" (row picker exists) — fix alongside copy sweeps.

---

# Appendix — full per-node findings

The sections below are the verbatim consolidated findings from the twelve audit
passes (shared renderers first, then provider groups).

---

# Agent 12 — shared field renderers (systemic; affects every node)

## Findings

| Component | Issue | Severity | Suggested fix direction |
|---|---|---|---|
| FileField (`fields/FileField.tsx:114-136`) | Primary (only) control is a paste-a-`{{token}}`-or-JSON-FileRef text box; anything else silently rejected — input just clears (comment at :126 says "silent reject"). No upload/browse path. | P0 | Inline "That doesn't look like a file from an earlier step" error; make variable picker the primary control ("Choose a file from an earlier step"); demote paste to Advanced. |
| FileRefArrayField (`fields/FileRefArrayField.tsx:133-146`) | Same silent paste-reject AND silent duplicate-reject — both clear input, indistinguishable from success. | P0 | Same; show "Already added" for dups. |
| StringArrayField free-text mode (`fields/StringArrayField.tsx:82-97`) | Text typed but not committed via Enter/Add lives only in local `pending` — closing/saving the modal silently discards it. Same latent-pending pattern in FileField/FileRefArrayField (`pending` FileField.tsx:101). | P0 | Auto-commit non-empty pending on blur/save, or block save with a message. |
| KeyValueField record mode (`KeyValueField.tsx:65-75`) | Row with empty key kept visible but silently omitted from committed value; duplicate keys silently last-write-win (:35). | P1 | Per-row "Needs a name" hint; dup warning. |
| KeyValueListField (`KeyValueListField.tsx:59-71`) | Same silent omission for empty "Column" name. | P1 | Same. |
| VariablePickerButton (`VariablePickerButton.tsx:91-102`) | Gateway to the product's core concept is icon-only `{}` button, no visible text. SpreadsheetRowsField.tsx:368 tells users to "Use the {x} button" — mismatched icon copy. | P1 | Visible text label ("Use data from an earlier step"); fix {x}-vs-{} mismatch. |
| VariablePickerPopover (`VariablePickerPopover.tsx:153-155, 239, 269-274`) | Source header shows raw node id beside friendly name; aria "Insert {{nodeId.path}}"; raw type chip ("string", "fileRef", "unknown") per row; output rows show raw camelCase names though `_prefillSource.ts` already knows how to humanize. | P1 | Drop sourceId; reuse `humanizeOutputName`; plain type words/icons. |
| VariablePickerPopover (D-SFR-10/D-FRA-6) | NO type filtering — a file field's picker inserts `.channel`; no search; many-output steps are one long unsearchable tree. | P1 | Type-aware filtering/ranking per field type; search box. |
| TextField/TextareaField/chips (`TextField.tsx:89-101`, `_fileRefEntry.ts:92-95`, ComboboxField.tsx:144-146,191-195) | Inserted variables display as raw `{{a1b2c3.messageId}}` tokens in inputs/combobox triggers/file chips. FieldSetupHint badge mitigates below the field. | P1 | Token pills with friendly step+field label; short-term extend FieldSetupHint pattern. |
| _variableValidator (`_variableValidator.ts:83,100`) | Warning copy is developer-speak shown verbatim: "no upstream source named 'abc123'", "'foo' is not a declared output of 'abc123'". | P1 | Plain rewrite. |
| ComboboxField/MultiOptionsField/StringArrayField async empty state (ComboboxField.tsx:250,584; MultiOptionsField.tsx:144; StringArrayField.tsx:324) | Just "No matches." — no next step; states a fact, ends the road. | P1 | "No <things> found in your <Provider> account. Create one there, then Try again." |
| ComboboxField manual entry (ComboboxField.tsx:414-427; StringArrayField.tsx:281-293) | "Use this ID: <typed text>" row appears when typed text matches no option — a mistyped search term can be committed as a raw ID failing only at run time; "ID" jargon. | P1 | Reword, separate visually, or confirm. |
| JsonField (`JsonField.tsx:74-77`) | Clicking a variable replaces the entire typed JSON with the token — no warning, no undo. | P1 | Confirm when non-empty would be replaced. |
| RouterRoutesField (RouterRoutesField.tsx:232-247,264-268; _routesValidator.ts:79-80,197-211) | Condition placeholder is literal `{{trigger.field}}` mono; operators "is truthy"/"is falsy"; errors "Operator 'is_truthy' is unary and does not take a value". | P1 | Plain placeholders; rename/drop truthy-falsy; friendly errors. |
| CronField (CronField.tsx:137-140,176,246-267) | Time entry is UTC-only ("At [09:00] UTC") — user wanting "9am my time" must do timezone math (local-time preview softens). | P1 | Enter local time, convert; UTC as advanced detail. |
| ComboboxField saved value (ComboboxField.tsx:110-113,144-146,443-453) | Reopened workflow shows raw stored id until options load; absent-from-list hint renders raw id in mono. | P2 | Persist label snapshots or resolve server-side. |
| KeyValueField (KeyValueField.tsx:172,181) | Placeholders "key"/"value" — developer vocabulary. | P2 | "Name"/"Value" or meta-supplied copy. |
| Empty-state copy family (KeyValueField.tsx:166 "No entries."; StringArrayField.tsx:374 "No items."; FileField.tsx:218 "No file."; FileRefArrayField.tsx:232 "No attachments.") | Fact-stating, no verb; FileField worst (no obvious action). Good pattern exists: RouterRoutesField.tsx:198, SpreadsheetBatchRowsEditor.tsx:56. | P2 | Adopt "No X yet — do Y" everywhere. |
| FieldShell (FieldShell.tsx:57-65) | Error REPLACES the description — guidance disappears exactly when needed. | P2 | Stack error above description. |
| Dep cascades (ObjectField.tsx:124-129; ObjectListField.tsx:166-171) | Changing a parent silently clears dependent values (correct but invisible). | P2 | Inline "Cleared because you changed <parent>". |
| NumberField (NumberField.tsx:60-68) | NaN path emits raw string, defers to later schema error. | P2 | Inline "Enter a number". |

## Clean components
Spreadsheet suite (SpreadsheetRowsField, SingleRowEditor, BatchRowsEditor, CellInput, Preview, RowModeToggle) — exemplary; readiness surface (computeConfigReadiness, NodeConfigReadinessBanner — "One thing left to fill in", names fields by label); FieldSetupHint; _prefillSource.ts (model plain-language layer); _jsonFieldValue.ts (friendly errors); BooleanField; SelectField (model no-options copy); TimezoneField; TemporalField; LocationField; _insertAtCursor; _itemFieldPicker. ComboboxField's connection arms strong ("Reconnect Slack in Apps", "Select Board first").

## Cross-cutting themes
- **Two-tier quality**: newest surfaces (spreadsheet editor, readiness banner, setup hints, prefill labels) written for non-technical users and it shows; older variable/file plumbing (Slice 3.x) still speaks developer, with comments explicitly deferring fixes.
- **"Clear the input" used as feedback** is the standing silent-failure pattern — a cleared input reads as success.
- **Local pending/edit state not committed on save** recurs — what's on screen is not always what's saved.
- **Raw identifiers leak at the edges** even though friendly-label machinery already exists and is used elsewhere.
- **Empty states state facts** instead of the next action; the better pattern already exists in-repo.
- **The variable picker is systemic**: icon-only trigger, unlabeled outputs, no search/type-filter, raw-token insertion — touches every one of the ~500 nodes.

## Verdict
For the "fill in fields and pick from lists" 80% the persona can succeed unaided — the readiness banner and setup hints are better than most competitors. The moment the task involves data flowing between steps (variables) or files, the UI drops to developer grade: an icon-only `{}` button they won't find, raw tokens they can't read, and three renderers that silently discard what they type. The P0 silent-loss fixes plus a labeled, filtered, humanized variable picker are the gap between "usable with a helper on the phone" and "usable alone".

---

# Agent 2 — slack

Coverage: all 41 nodes (31 actions, 10 triggers).

## slack

### Findings

| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Update Message | `ts` (required) | Raw "Message timestamp" text box, no picker; desc "Paste or wire the `ts` output"; placeholder `1700000000.000100` | P0 | renderer + copy |
| Delete Message | `ts` (required) | Same raw timestamp box | P0 | renderer + copy |
| Pin Message | `ts` (required) | Same raw timestamp box | P0 | renderer + copy |
| Unpin Message | `ts` (required) | Same raw timestamp box | P0 | renderer + copy |
| Add Reaction | `ts` (required) | Same raw timestamp box | P0 | renderer + copy |
| Add Reaction | `reaction` (required) | Raw text; user must know Slack emoji names (`white_check_mark`); no emoji picker | P1 | resolver |
| Remove Reaction | `ts` (required) | Same raw timestamp box | P0 | renderer + copy |
| Remove Reaction | `reaction` (required) | Same raw emoji-name box | P1 | resolver |
| Get Thread Messages | `threadTs` (required) | Required "Thread timestamp" raw box; `<seconds>.<microseconds>` in desc | P0 | renderer + copy |
| Download File | `fileId` (required) | Raw "File id" box; desc sources from "file_uploaded trigger payload… or a Slack file URL's `F…` segment"; placeholder `F01ABC23DEF` | P0 | renderer + copy |
| Get File Info | `fileId` (required) | Same raw file-id box | P0 | renderer + copy |
| Cancel Scheduled Message | `scheduledMessageId` (required) | Raw id box, placeholder `Q1298393284`; only obtainable by wiring upstream output | P0 | renderer + copy |
| Post Interactive Blocks | `blocks` (required) | Required raw Block Kit JSON; desc links Slack's Block Kit Builder; persona cannot complete. `advanced: true` but required so it still gates setup | P0 | redesign (or explicit "developer node" labeling) |
| Post Interactive Blocks | title/desc | "Block Kit", "invalid_blocks", `{{...}}` in node description | P1 | copy |
| Send Channel Message | `threadTs` (optional) | "Thread timestamp" label + `ts` jargon + epoch placeholder | P1 | copy |
| Send Direct Message | `threadTs` (optional) | Same | P1 | copy |
| Schedule Message | `threadTs` (optional) | Same | P1 | copy |
| Schedule Message | desc | "No silent 'now + delta' mode — compute the absolute time upstream" is developer-speak | P1 | copy |
| Upload File | desc + `file` desc | "FileRef", "kind=provider_url", "stage the bytes" — wire-format internals in user-facing copy | P1 | copy |
| Upload File | `threadTs` (optional) | Same threadTs pattern | P1 | copy |
| Invite Users to Channel | `users` | Label "User ids" + desc "user ids (U-prefixed); the handler validates ids" — picker exists, copy is the problem | P1 | copy |
| Join Channel | `channel` | Picker lists public + private channels but action only works on public — confusing failure | P2 | resolver (filter to public) |
| Create Channel | `name` | Desc "1..80 chars… `a-z`, `0-9`" regex-speak | P2 | copy |
| Rename Channel | `name` | Same regex-speak | P2 | copy |
| List Users | desc | "Tier 2 rate-limited (20 req/min)" trivia | P2 | copy |
| List Scheduled Messages | `oldest`/`latest` | Epoch-format labels/placeholders (correctly advanced) | P2 | copy |
| Get Messages | `oldest`/`latest` | Same (advanced, OK placement) | P2 | copy |
| Get Thread Messages | `oldest`/`latest` | Same | P2 | copy |
| Reaction Added (trigger) | `reactionEmoji` | Raw emoji-name text box, no picker | P1 | resolver |
| Reaction Removed (trigger) | `reactionEmoji` | Same | P1 | resolver |
| Channel Created (trigger) | desc | "add a downstream guard on the payload's channel object" — jargon | P1 | copy |
| Member Joined Channel (trigger) | desc | "add a downstream guard on the user payload field" | P2 | copy |
| New Message in Private Channel (trigger) | `channelId` desc | "Modern private channels use 'C' ids; legacy… 'G' ids" — id-prefix trivia | P2 | copy |
| New Group Direct Message (trigger) | `channelId` | Label "Channel ID"; placeholder "paste a 'G…' id" | P2 | copy |
| File Uploaded (trigger) | desc | References action keys verbatim ("slack:get_file_info") and "bytes" | P2 | copy |

### Clean nodes
Actions: Get User Info, List Channels, Archive Channel, Unarchive Channel (dedicated archived-channels picker — good pattern), Set Channel Topic, Set Channel Purpose, Leave Channel, Get Channel Info, Remove User from Channel.
Triggers: New Message in Channel, New Direct Message, Member Left Channel.

### Systemic
- **Root cause of every timestamp/id P0:** dynamic-value identifier fields (message `ts`, file id, scheduled-message id) render as bare text boxes with epoch/id placeholders and "paste or wire the `ts` output" copy. No renderer affordance like "Pick the message from a previous step" opening the variable picker pre-filtered. One shared renderer fix + a copy pattern would clear 9 P0s. Labels should read "Reply to an earlier message", not "Thread timestamp".
- **API-method + OAuth-scope jargon in nearly every node description:** "via chat.postMessage", "Requires the Slack chat:write scope", Slack error codes. Copy sweep; scope/method detail → tooltips/docs.
- **Channel-picker description repeated verbatim ~20×:** "…visible to the bot. The saved value is the underlying channel id (C…/G…/D…)" — "the bot" + id-prefix trivia.
- **`{{...}}` wiring syntax and backticked output names** throughout field/output descriptions.
- **List actions surface pagination plumbing in main descriptions** ("loop with the returned `nextCursor`").
- **Trigger payloadShape entries expose raw Slack keys** (`ts`, `thread_ts`, `bot_id`, `item_user`, `channel_type`) with technical descriptions — this is what the persona sees in the variable picker. Names fixed by payload; descriptions could translate.
- Known FileField renderer issue applies (Upload File).
- Positives: channel/user comboboxes with `allowManualEntry` consistently present (no raw channel/user P0s); cursors never exposed; timestamp-window filters correctly advanced; required booleans are genuine decisions; no mode-switch fields so absent visibleWhen is correct.

### Provider verdict
Split. Sending messages / managing channels / inviting people is persona-usable (12 clean nodes). But all 10 nodes referencing an existing message or file require pasting/wiring a raw Slack timestamp/id through a bare text box — P0; Post Interactive Blocks is developer-only outright. One shared "pick a value from a previous step" renderer affordance + jargon copy sweep moves the provider from "half usable" to "usable".

---

# Agent 6 — gmail / google-sheets / google-docs / google-calendar

Coverage: all 45 nodes (16 gmail, 14 google-sheets, 7 google-docs, 6 google-calendar).
P0s: google-sheets `range` ×4 + Batch Update `updates` JSON; gmail Get Email Attachment array-mapping path.

## gmail

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Send Email | description | "label ids only — use Create Label upstream", "Requires the gmail.send scope…" — OAuth/id jargon in first-read blurb | P1 | copy |
| Send Email | htmlBody | "Sent as multipart/alternative alongside the text body" — MIME language; HTML vs text body concept unexplained | P1 | copy |
| Send Email | textBody/htmlBody | Neither marked required; both-empty only fails at save. No plain "Message" framing | P1 | redesign |
| Reply to Email | originalMessageId | "Original message id"; "Source from the new_email / new_labeled_email trigger payload or a search_emails result" — internal node keys + payload jargon; raw box on Setup | P1 | copy |
| Create Draft | fields | Same textBody/htmlBody + scope issues | P1 | copy |
| Create Draft Reply | originalMessageId | Same as Reply | P1 | copy |
| Search Emails | dateAfter/dateBefore | Plain text requiring `YYYY/MM/DD` typed syntax instead of a date picker (renderer could convert to Gmail q-format) | P1 | renderer |
| Search Emails | searchMode | Option label "Raw query (q syntax)" visible on Setup mode select | P2 | copy |
| Search Emails | from | "Literal '\"' characters are not allowed — use Raw query for quoted phrases" | P2 | copy |
| Search Emails | largerThan/smallerThan | "Larger than bytes" (advanced-only) | P2 | copy |
| Get Email Attachment | attachmentId | Desc instructs `payload.attachments[i].attachmentId`. Variable picker cannot drill into arrays (VariablePickerPopover.tsx:51 renders compact type chip) → the ONLY common path (new_attachment trigger → download) requires hand-typing `{{trigger.attachments[0].attachmentId}}` | P0 | redesign (picker array drill-down or attachment-index helper) |
| Get Email Attachment | messageId | Same raw-id/payload copy | P1 | copy |
| Add Label | description | "Labels must be supplied as Gmail label ids (no name-to-id lookup)" — STALE: field HAS `gmail:labels` picker; frightens users off a working path | P1 | copy |
| Add/Remove Label | labelIds | "System labels use uppercase names… user labels use 'Label_<n>' ids" — unnecessary with picker | P2 | copy |
| Add/Remove Label / Archive / Delete / Mark Read / Mark Unread | messageId | "Message id" + "Source from a trigger payload" pattern — needs plain "Which email? Use the value from your trigger" | P1 | copy |
| Create Label | description | "Color is an advanced option not yet exposed in the builder — set via direct workflow JSON if needed" — instructs hand-editing JSON | P1 | copy |
| Create Label | labelListVisibility/messageListVisibility | Gmail-API terms; correctly advanced | P2 | copy |
| Delete Email | messageId | Same pattern (deleteMode itself exemplary Q11) | P1 | copy |
| Archive Email | description | "removes the INBOX system label" | P2 | copy |
| New Email (trigger) | hasAttachment | "top-level mimeType heuristic" | P2 | copy |
| New Email Attachment (trigger) | description | "per-attachment metadata… NO bytes… chain the gmail/get_attachment action downstream" | P2 | copy |

### Clean nodes
List Labels · Get Profile · New Labeled Email (trigger) · Mark Read/Unread (bar shared messageId copy) · Delete Email's deleteMode design (model Q11).

### Systemic
- Nearly every description ends "Requires the gmail.X scope" — strip or move to technical tooltip.
- Raw "Message id" fields on 9 nodes; persona path is trigger-variable mapping but no field says so plainly.

### Provider verdict
Pickers and Q11 selects good; copy written for engineers. One true P0 (attachment array-index mapping). Broad P1 copy pass + date-picker renderer for Search Emails.

## google-sheets

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Append Row | range | Required raw A1 text incl. `Sheet1!A:Z` bang syntax. `google-sheets:sheets` resolver EXISTS, used by siblings, not here (meta admits deferral). | P0 | redesign (sheetName picker + optional range) |
| Update Row | range | Same, worse: compose `Sheet1!A5:Z5` to target row 5 (Delete Row already does picker+row-number) | P0 | redesign |
| Read Rows | range | Same required A1 text | P0 | redesign |
| Clear Range | range | Same, on a destructive node | P0 | redesign |
| Batch Update | updates | REQUIRED `json` field marked `advanced: true` — required field hidden on Advanced tab; raw JSON + A1 the only completion path | P0 | redesign (object-list w/ sheet picker per row) or relabel power-user |
| Append/Update Row, Update Cell, Batch Update | valueInputOption | LABEL is raw API term "Value input option" (option labels themselves excellent) | P1 | copy |
| Append Row | insertDataOption | Option labels raw enums "INSERT_ROWS"/"OVERWRITE" | P1 | copy |
| Find Row | description | "Row 0 is treated as headers" — programmer counting; column field says "reads row 1" — contradictory | P1 | copy |
| Format Range | backgroundColor/textColor | Hex-code text boxes on Setup — needs color picker | P1 | renderer |
| Format Range | range | Bare A1 required text; "**BARE** A1 … rejected at runtime" copy hostile | P1 | copy/redesign |
| Format Range | numberFormat | JSON w/ enum docs — advanced, tolerable | P2 | copy |
| Update Cell / Get Cell Value | cell | `A1`-style cell ref acceptable (spreadsheet-native); backtick-heavy rejection list noisy | P2 | copy |
| Row Changed (trigger) | description | "Drive `files.watch` channel; diffs against a per-row hash snapshot… count-delta fast path" (fields excellent) | P1 | copy |
| New Worksheet (trigger) | description | Same files.watch jargon | P1 | copy |
| Create Spreadsheet | description | "Bare API surface" + backticks | P2 | copy |
| Delete Row / Get Sheet Metadata / Read Rows etc. | descriptions | Backticked API method names | P2 | copy |

### Clean nodes
Delete Row (picker + picker + plain row number — the model) · Find Row (structure) · Get Sheet Metadata · Create Spreadsheet · Get Cell Value / Update Cell (setup path) · Row Changed fields (headerRow/changeKinds/keyColumn genuinely good).

### Systemic
- A1 `range` field is the provider's core P0, on 5 nodes; ONE shared redesign fixes all.
- 3 optionSources (spreadsheets/sheets/columns) wired everywhere they apply; gap is schema-shape (range vs sheetName), not missing resolvers.

### Provider verdict
Split personality: picker-based nodes are best-in-audit; the four range nodes + Batch Update are un-completable without A1 notation. Fixing the range/sheet split is the single highest-value change in this audit.

## google-docs

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Share Document | permission | Option label "Owner (requires transferOwnership: true)" — internal field name + code syntax in a Setup dropdown | P1 | copy |
| Share Document | publicPermission | Ships known-invalid option: "Owner (not valid for public — Drive rejects)" | P1 | copy (remove option) |
| Share Document | permission ↔ transferOwnership | "Owner" on Setup requires enabling an Advanced-tab toggle — invisible cross-tab dependency | P1 | advanced-flag / redesign (visibleWhen pairing) |
| Update Document | insertLocation | "Replace entire body (irreversible via API)" — "via API"; otherwise mode select + visibleWhen well done | P2 | copy |
| Update Document | description | "`documents.batchUpdate`", "wildcard `*` mapping to regex `.*`" | P2 | copy |
| Create Document | content | "{{nodeId.field}}" syntax in description | P2 | copy |
| Get Document | content (output) | "Pass through `format_transformer`" internal node key | P2 | copy |
| Export Document | description | FileRef / mime / `exportSizeLimitExceeded` language (fields plain and excellent) | P2 | copy |
| New Document (trigger) | description | "`createdTime === modifiedTime`", "files.watch push channel" | P2 | copy |
| Document Updated (trigger) | documentId | "the Drive watch is registered against this fileId directly"; scope precedence only in prose | P2 | copy |

### Clean nodes
Create Document · Get Document · Export Document · both triggers' fields · Update Document setup mechanics · Share Document's sendNotification (exemplary plain Q11).

### Provider verdict
Strongest of the four: full picker coverage, no raw ID boxes anywhere. Copy polish + three P1s in Share Document permission options.

## google-calendar

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| List Events | timeMin/timeMax | "entered in **UTC** (stored as `2026-06-01T00:00:00Z`)" — persona thinks in local dates | P1 | copy / renderer |
| Create Event | visibility/transparency/colorId/guestsCanModify/googleMeet | None advanced — Setup shows ~18 fields; power-user knobs crowd the three required Q11 toggles | P1 | advanced-flag |
| Update Event | same set | Same crowding | P1 | advanced-flag |
| Create/Update Event | timezone | "IANA time zone" jargon (widget is a picker, copy-only) | P2 | copy |
| Update Event | colorId | "Google Calendar color id (1–11)" (Create's version is plain — drift) | P2 | copy |
| Update Event / Add Attendees / Delete Event | eventId | Placeholder "Search events or use {{trigger.eventId}}" — syntax in placeholder; cascade design right | P2 | copy |
| Create Event | endDate | "All-day end (exclusive — the day after…)" — persona enters last day, gets one-day-short event | P2 | copy / renderer (auto-adjust) |

### Clean nodes
Delete Event (excellent) · Add Attendees · Event Changed (trigger — only zero-jargon description in the audit) · List Events (bar UTC fields) · Create/Update Event core path.

### Systemic
Calendar demonstrates the target voice — should be the copy template for the other three.

### Provider verdict
Best-in-audit configuration UX. Gaps: Setup-tab overload on Create/Update Event; UTC datetime fields on List Events.

## Cross-provider systemic (agent 6)
1. Engineer-voice descriptions (gmail/sheets/docs) — calendar proves plain voice exists in-repo. Provider-wide copy pass or separate technical-note field.
2. Markdown in descriptions → literal asterisks/backticks if FieldShell doesn't render it.
3. **Variable picker cannot drill into arrays** (VariablePickerPopover renders object/array as compact type chip) — converts Gmail attachment flow into P0; degrades any array-output → scalar-input mapping. Picker-level array drill-down fixes a class of problems.
4. `{{...}}` syntax leaking into placeholders/descriptions across providers.

---

# Agent 8 — notion / airtable / dropbox / google-drive

Coverage: all 48 metas (notion 16a, airtable 11a+1t, dropbox 11a+1t, google-drive 7a+1t).
P0 clusters: notion write-path (5), airtable write-path + formula (5), google-drive upload (1).

## notion

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Page | `parent` (required) | Raw JSON box hand-authoring `{"databaseId":"<id>"}` — no picker despite `notion:pages` AND `notion:databases` resolvers NOW EXISTING (meta comment stale: "future resolver"). Required + advanced-only + wire-format | P0 | resolver + redesign (mode select "In a database"/"Under a page" + picker per mode) |
| Create Page | `properties` (required) | Raw JSON typed-property map; "See Notion's API docs for the value shapes" — explicit provider-doc dependency. Both required fields advanced-only → Setup tab EMPTY, node JSON-only | P0 | redesign (structured property editor) |
| Create Page | node description | "discriminated JSON", "typed property-input map", "wire a `{{...}}` reference" | P1 | copy |
| Create Database Entry | `properties` (required) | Most common Notion task (add a row) = hand-written `{"Name":{"type":"title","value":"..."}}` with Notion type names. Database picker good; row content P0 | P0 | redesign (schema-aware field editor fed by picked database) |
| Create Database | `properties` (required) | Column-schema JSON with invisible "exactly one title type" runtime rule; "configure manually in Notion's UI" pushes user back to provider | P0 | redesign (object-list of name + type-select rows) |
| Append Block Children | `children` (required) | "Add content to a page" = authoring `BlockSpec[]` JSON, 9-type grammar. Title "Append Block Children" pure API jargon | P0 | redesign + copy (title "Add Content to Page") |
| Query Database | `filter`/`sorts` | "Raw Notion filter object — passed verbatim… see Notion's filter docs." Filtering is the point; optional keeps it P1 | P1 | redesign (structured filter builder) |
| Query Database | node description | "passed verbatim", "`nextCursor`" | P1 | copy |
| Update Page | `properties` | Same JSON map for "change a status" (optional → P1); "PATCH a Notion page" jargon | P1 | redesign + copy |
| Create Comment | `pageId`/`discussionId` | Exactly-one-of only prose; no mode switch/visibleWhen; fill both/neither → save-time failure. `discussionId` not advanced | P1 | redesign (mode select) + advanced-flag |
| Create Database | `title`/`description` descs | "The wrapper synthesizes Notion's rich_text array" | P1 | copy |
| Get Block / Get Block Children | title + placeholder | "Block" Notion-internal; raw-UUID placeholder | P2 | copy |
| Search | `filter.property` | One-option dropdown ceremony | P2 | copy/redesign (hardcode + hide) |
| List Comments | `pageSize` | Not advanced (inconsistent) | P2 | advanced-flag |
| Search / List Users | descriptions | "`nextCursor`", "polymorphism resolved", "`/v1/search`" | P2 | copy |

### Clean nodes
Get Page · Archive Page · Restore Page · Get User (single required picker field each).

### Systemic
Only 3 resolvers for 16 actions; write-path payloads (`properties`, `children`, `filter`, `parent`) all raw json — entire create/update surface is hand-authored JSON. Root P0 = missing schema-aware property editor (rule 17: implementation work, not future enhancement).

### Provider verdict
Read side usable via pickers. Write side — create page, add row, add content, update properties — requires Notion wire-format JSON, twice explicitly pointing at Notion API docs. For the persona, Notion is read-only; write half fails the completion bar.

## airtable

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Record | `fields` (required) | Core task ("add a row") = JSON `{"Name":{"type":"singleLineText","value":"Acme"}}` incl. internal type names. No structured path (meta concedes "future builder slice") | P0 | redesign (schema-aware editor — table schema already resolvable) |
| Update Record | `fields` (required) | Same typed-JSON for "change a cell" | P0 | redesign |
| Create Multiple Records | `records` (required) | Same JSON in an array | P0 | redesign |
| Update Multiple Records | `records` (required) | Same + raw `recordId` strings inside JSON, no picker (violates RESOLVERS-3/4) | P0 | redesign |
| Find Record | `filterByFormula` (required) | MUST write an Airtable formula (`{Email}='a@b.com'` or `"TRUE()"`) — formula language on required field, no alternative | P0 | redesign (field/operator/value builder; formula in Advanced) |
| All 4 write nodes | `typecast` | Required boolean "Typecast" on Setup — jargon; plumbing surfaced as required decision | P1 | copy + advanced-flag (keep defaultValue) |
| List Records | `sort.field` | Raw text "Field name to sort by" while `airtable:fields` resolver exists and itemField optionsSource+dependsOn supported | P1 | resolver |
| Add Attachment | node + `file` descs | "Stage bytes first via a download step (provider_url refs are rejected)" | P1 | copy |
| List Records | `filterByFormula` | Formula syntax (optional + advanced → P2) | P2 | copy/redesign |
| List Records | `pageSize`/`maxRecords` | Not advanced; `offset` placeholder `itr…/rec…` cryptic | P2 | advanced-flag + copy |
| Get Base Schema / Get Table Schema | title | "Schema" dev vocabulary (defensible power-user nodes) | P2 | copy |
| Record Changed (trigger) | payload/desc | "Branch on the eventType field"; `fields` payload keyed by field id (not names) — confusing downstream mapping | P2 | copy |

### Clean nodes
Get Record · Delete Record · List Records structure (base→table→record/view/field cascade exemplary) · Record Changed trigger config fields.

### Systemic
Base/table/record/view/attachment-field resolver cascade is best-in-audit; sole structural hole is the typed field-map JSON shared across all 4 write nodes — ONE structured editor fixes four P0s.

### Provider verdict
Two providers in one: selection fully picker-driven (reads/deletes pass unaided); every cell-value write requires typed-JSON with internal type names, Find Record requires formula syntax. Reads pass, writes fail.

## dropbox

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Upload File | `file` | Placeholder "Paste a {{...}} FileRef token"; "Upstream FileRef to upload" as primary instruction | P1 | copy ("Choose a file from an earlier step") |
| Upload File | node description | "FileRef(kind=provider_url) is not supported — stage bytes first" | P1 | copy |
| Download File / Get Temporary Link | descriptions | "stage it as a FileRef", "never raw bytes or base64", "FileRef(kind=signed_url)" | P1 | copy |
| New File (trigger) | description | "app-level webhook plus a per-folder cursor — set the webhook URL once in the Dropbox App Console" — reads as end-user instruction; alarms persona | P1 | copy |
| Move File / Copy File | `toPath` | Required free-text full destination path incl. new name (`/Archive/q1.pdf`) — destination-folder picker + name field would remove path syntax | P2 | redesign |
| Create Folder | `path` | Same full-path composition (legit — target doesn't exist — but parent-picker + name friendlier) | P2 | redesign |
| List Folder | `cursor` | "Opaque token" (advanced) | P2 | copy |

### Clean nodes
List Folder (main path) · Search Files · Get File Metadata · Delete File (trash/30-day warning excellent) · Create Shared Link.

### Systemic
**Root-folder picker gap ×6 nodes**: "Root-level files can't be listed here; type their path manually" (options route drops empty deps). Users whose files live at Dropbox top level — very common for persona — lose the picker on the main path. Borderline P0 for that population; fix once in `dropbox:files` resolver/options route.

### Provider verdict
Picker cascade and safety copy strong; most read/manage nodes pass. Real problems: root-folder resolver hole + FileRef/webhook internals in copy, worst in New File trigger.

## google-drive

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Upload File | `content` (required) | File content as required TEXTAREA; binary requires "set Content Encoding to base64 in an upstream step". Real-file upload impossible without base64 understanding; no FileRef consumption (deferred per meta) — every other file provider consumes FileRef | P0 | redesign (consume FileRef like dropbox) |
| Upload File | `mimeType` (required) | "MIME Type" label + required; friendly option labels mitigate (hence P1); should be "File type" / derived from extension | P1 | copy + derived |
| File Changed (trigger) | `fileId` vs `folderId` | Two folder pickers with subtle semantics ("Folder To Watch" field literally named fileId vs advanced "Restrict To Folder"); desc leaks internals ('stored as the literal "root"', "per Drive's push model") | P1 | copy |
| Move File | node description | "atomically detaches them before attaching the new parent"; "paste a folder id (use the literal \"root\"…)" | P2 | copy |
| List Files / Search Files | `pageToken`/`pageSize` | Page Token advanced (good); Page Size on Setup techy; `incompleteSearch` "across all corpora" | P2 | copy + advanced-flag |
| Get File Metadata | title | "Metadata" ("Get File Details" better) | P2 | copy |

### Clean nodes
Create Folder · Delete File (model Q11 permanent-choice) · Move File structure · Get File Metadata fields · List/Search Files main path.

### Systemic
Stale meta comments claim `google-drive:files` resolver "DEFERRED" but every fileId field declares it and it exists — doc-comment lag only.

### Provider verdict
Smallest, mostly cleanest. Single disqualifying gap: Upload File's required paste-text content + base64 — flipping to FileRef (Dropbox pattern in-repo) resolves the only P0.

## Cross-provider systemic (agent 8)
- **FieldShell prints description verbatim into a <p>** — all backticks/`{{...}}`/markdown shown literally. Strip/render once, or enforce plain-language copy standard.
- **`{{...}}` wiring vocabulary** in ~30 field descriptions — one agreed formula ("or use a value from an earlier step") fixes dozens of hits.
- **No structured typed-field-map editor** in fields/ renderer set (JsonField is raw). This single missing widget is the root cause of all 8 write-path P0s in Notion + Airtable.

---

# Agent 9 — mailchimp / stripe / quickbooks

Coverage: all 49 metas (mailchimp 14a+7t, stripe 16a+1t, quickbooks 7a+4t) + shared renderer check.
P0s: 5 (mailchimp create_segment conditions.field + conditions.op; stripe paymentIntentId ×3). QuickBooks: zero.

## mailchimp

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| ALL 14 actions | node description | Every action embeds raw REST syntax ("via `PUT /lists/{id}/members/{hash}`") | P1 | copy |
| Create Segment | `conditions.field` | Free-text expecting Mailchimp merge-field TAG (`EMAIL`, custom tags). Required when mode=saved | P0 | resolver (merge-fields keyed on audience_id, RESOLVERS-3 row picker) |
| Create Segment | `conditions.op` | Free-text operator wire-strings (`is`, `notcontain`, `starts`); "See Mailchimp's segment-conditions reference" — requires provider docs. Required when visible | P0 | redesign (operator select + validation) |
| Create Segment | node description | "Mailchimp's rule DSL", "`fuzzy` segments, not exposed in V2 Batch 1" | P1 | copy |
| Add Subscriber | `status` | Opens "**Q11 consent gate — REQUIRED with NO default.**" — internal rule ID in user copy; option labels good | P1 | copy |
| Add Subscriber | `email` | "Used to derive the per-list subscriber hash for the API path" | P1 | copy |
| Add Subscriber | `tags` | "V2 mirrors V1's CSV input shape — string-array is a future UI slice"; inconsistent with Add Tag chip array | P1 | copy (+ redesign later) |
| Add Subscriber | node description | "upsert" + CAN-SPAM/GDPR legalese | P1 | copy |
| Update Subscriber | `email`, desc | "derive the per-list subscriber hash", "PATCH semantics", "`upemail` webhook" | P1 | copy |
| Get Subscriber | `email` | Same hash internals | P1 | copy |
| Get Subscribers | `listId` | "Field name is `listId` (camelCase) — preserved verbatim from the action schema; the `mailchimp:audiences` resolver carries no `requiredDeps`…" — pure internals | P1 | copy |
| Get Subscribers | node description | "offset-based", "`nextOffset` — `null` signals end-of-list" | P2 | copy |
| Unsubscribe Subscriber | `emailAddress` | Plain text, no `mailchimp:members` picker — siblings (Remove Subscriber, Add Tag, Add Note) have it | P1 | resolver |
| Unsubscribe Subscriber | `listId`/`emailAddress` | camelCase-preservation internals in both descs | P1 | copy |
| Remove Subscriber | node description | DELETE endpoint paths (fields + destructive gating otherwise exemplary) | P2 | copy |
| Add/Remove Tag | node description | Endpoint + "**Array input** — chip-style entry" UI-mechanics markdown | P2 | copy |
| Create Custom Event | `properties` | JSON literal example for what is a key/value row editor | P2 | copy |
| Create Custom Event | `occurred_at` | "Defaults to `now()`" | P2 | copy |
| Create Audience | booleans | "When `true` …" code literals | P2 | copy |
| Get Campaign | `campaignId` | "Picker sourced from `mailchimp:campaigns` — sorted by `create_time`" | P1 | copy |
| Get Campaign Stats | `campaignId` + desc | "unsent ids return a `NotFoundError` — branch on the error" | P1 | copy |
| Audience Event (trigger) | `audienceId` | Cites source code: "matches `activate.ts:node.config.audienceId`" | P1 | copy |
| Audience Event (trigger) | description | "branch on `payload.type`", "activation rejects anything outside the allowlist" (event-type labels themselves excellent) | P1 | copy |
| Campaign Created (trigger) | description | "Polled by the V2 polling cron — first-poll baseline seeded at activation" | P1 | copy |
| Email Opened / Link Clicked (triggers) | description | "/reports/{id}/open-details endpoint with a per-(campaign, recipient) dedup ledger" | P1 | copy |
| New Audience (trigger) | description | "Polled via `GET /lists`…" | P2 | copy |
| Segment Updated / Subscriber Added to Segment (triggers) | `listId`/`segmentId` | "Backed by the `mailchimp:segments` resolver (`requiredDeps: [listId]`)" | P1 | copy |

### Clean nodes
Add Note (fields are model plain-English + great placeholder). Create Audience structured object editors + Advanced classification exemplary aside from P2s. No node 100% clean due to provider-wide endpoint-path pattern.

### Provider verdict
Selector coverage genuinely strong (audience/member/campaign/segment/link pickers, correct cascades). Copy reads like engineering review notes: endpoints, schema trivia, resolver names, a source-file citation. One true P0 pair: saved-segment Conditions rows demand merge-tag + operator wire-strings with explicit "see Mailchimp's reference".

## stripe

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Capture Payment Intent | `paymentIntentId` | Required raw box, placeholder `pi_xxx`, no resolver (charges/customers/subscriptions have one). Desc demands "`requires_capture` state (created with `capture_method: manual`)" knowledge | P0 | resolver + copy |
| Confirm Payment Intent | `paymentIntentId` | Same raw box; wiring hint is raw token `{{stripe:create_payment_intent.paymentIntentId}}` | P0 | resolver + copy |
| Find Payment Intent | `paymentIntentId` | Same raw required box (read-only, lower stakes) | P0 | resolver |
| Create/Confirm/Capture Payment Intent | titles | "Payment Intent" Stripe-internal vocabulary; 3-step lifecycle unexplained in plain terms | P1 | copy |
| Create Payment Intent | `amount` | "**Critical:** do NOT pass cents here — the capture action expects cents, but THIS action expects dollars" — unit split across siblings pushed onto user | P1 | copy (ideally normalize units provider-wide) |
| Capture Payment Intent | `amount_to_capture` | Cents entry ("2099 for $20.99") — opposite unit from create; advanced softens | P1 | redesign (accept dollars, convert) |
| Create Payment Intent | `currency` | "Uppercase is rejected (`USD` fails validation)" — handler could normalize | P1 | copy + normalize |
| Find Customer | `customerId`/`email` | "EXACTLY ONE of…" prose-only; both optional → passes setup, fails runtime; "list filter", "does NOT throw" | P1 | redesign (search-by mode select + visibleWhen, like QuickBooks Find Customer) |
| Create Refund | `chargeId`/`paymentIntentId` | Same either-or prose; paymentIntentId raw box (charge side has picker) | P1 | redesign + resolver |
| Create Checkout Session | `successUrl`/`cancelUrl` | Required absolute URLs; "`?session_id={CHECKOUT_SESSION_ID}` if the literal placeholder is included"; no-website user stalls | P1 | copy |
| Create Checkout Session | `mode` | Option labels raw enums ("payment"/"subscription"/"setup") | P2 | copy |
| Create Checkout Session | `customer`/`customerEmail` | Mutex prose-only | P1 | redesign |
| Create Subscription | `payment_behavior` | Raw-enum labels ("default_incomplete"); advanced + good descs mitigate | P2 | copy |
| Update Subscription | `collection_method` | Raw-enum labels | P2 | copy |
| Update Subscription | `trial_end` | Text taking `now` OR Unix-seconds — developer-only input; advanced | P2 | redesign (datetime + "now" toggle) |
| Get Payments | description | "**Mutex invariant:**…", "`startingAfter: {{prev.nextCursor}}`" in top-level copy (cursor fields correctly advanced) | P2 | copy |
| Create Payment Link | `afterCompletion` | Raw JSON paste; advanced + "Developer option" label = within policy, but redirect-URL is a plausible ordinary need | P2 | redesign (object editor) |
| Stripe Event Received (trigger) | `enabledEvents` | Option labels are raw dotted event strings ("payment_intent.payment_failed") — value as label; human hint relegated to description | P1 | copy (humanize labels, keep raw value) |
| Various | `metadata` | Label "Metadata" dev vocabulary; optional, minor | P2 | copy |

### Clean nodes
Cancel Subscription (best-in-audit destructive design) · Create Invoice · Find Subscription · Create Customer · Update Customer · Create Subscription core path · Get Payments field layer · Create Payment Link core path. Cancel Subscription + Find Subscription effectively finding-free.

### Systemic
Dollars-vs-cents inconsistency is provider-wide design (create/refund dollars; capture cents; outputs cents). Either-or invariants prose-only ×3 because FieldMeta has no mutex grouping (meta comments acknowledge).

### Provider verdict
Picker coverage excellent on customer/subscription/price/charge/payment-method axes; destructive gating careful. PaymentIntent family is the weak spot: 3 required raw `pi_xxx` boxes, lifecycle-assuming descriptions, dollars/cents flip. Persona completes Checkout/Payment-Link + subscription happy paths, not manual payment-intent flow.

## quickbooks

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Invoice (draft) | `lineItems` group desc | STALE: "find ids via the Items dropdown on other fields or in QuickBooks" — contradicts the row-level product/service picker that now exists (`quickbooks:items`) | P1 | copy |
| Create Invoice (draft) | `lineItems.amount` | Required per-row Amount; row field has NO description; relationship to Quantity × Unit price unexplained | P1 | copy |
| Create Invoice (draft) | `lineItems.quantity`/`unitPrice`/`description` | Row sub-fields have no descriptions (labels self-evident, minor) | P2 | copy |
| Find Customer | node/output copy | "Returns `found: false` … branch on it" (repeated on Get Customer / Get Invoice) | P2 | copy |
| List Invoices | `startPosition` | "map nextStartPosition from a previous run" — advanced, minor | P2 | copy |
| Invoice Paid (trigger) | description | "Derived from payment events with the invoice balance re-checked before firing" — borderline non-issue (communicates partial-payment guarantee) | P2 | copy |

### Clean nodes
Create Customer · Get Customer · Send Invoice (emails customer) — parenthetical-consequence title pattern is the best plain-language signal in the whole audit · Get Invoice · List Invoices field layer · all 4 triggers (zero-config, plain English).

### Systemic
QuickBooks' Find Customer search-by-mode + value pattern is the design Stripe's Find Customer should copy.

### Provider verdict
Most usable of the three: plain titles with consequences, every resource behind a picker incl. row-level items/tax/terms, zero-config triggers, no endpoint paths in user copy. Only work: stale line-item description + unexplained Amount relationship.

## Systemic (agent 9, shared renderer)
1. **Markdown renders as raw text** — FieldShell.tsx lines 61–65 renders description in plain `<p>{description}</p>`; every `**bold**`/backtick displays literally (worst amplifier in the audit; Mailchimp + Stripe copy is markdown-heavy). Fix in renderer (minimal inline-code support) or strip markdown from all provider copy.
2. **No either-or field grouping in FieldMeta** — "exactly one of X/Y" only prose + runtime refine (Stripe ×3); meta comments admit "NOT expressible in FieldMeta". A mutex/one-of group (or QuickBooks search-by-select pattern) fixes all at once.
3. **Raw ISO-8601 placeholders on datetime fields** — cosmetic if TemporalField gives a real picker.

---

# Agent 5 — monday / motive

Coverage: monday 24 actions + 5 triggers; motive 10 actions + 8 triggers. All meta files read; registry verified.

## monday

### Findings

| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Update Item | `columnValue` (required, Setup) | Required textarea where status/date/people columns need hand-typed Monday wire-format JSON (`{"label":"Done"}`, `{"date":"2026-07-15"}`). Most common Monday automation (set a Status) forces JSON on the main path; one typo fails the run. Known D-MON7 deferral but sits on a REQUIRED Setup field. | P0 | redesign (column-type-aware value editor keyed off selected `columnId`) |
| Create Item | `columnValues` (advanced) | Column values at creation require a JSON map + knowing "column keys come from Get Board". Advanced-only so rules-compliant, but creating an item with status/assignee is the ordinary case. | P1 | redesign (same column-aware editor; D-MON7) |
| Create Subitem | `columnValues` (advanced) | Same JSON-map-only path. | P1 | redesign (D-MON7) |
| Add Column | `defaults` (advanced) | Label "Defaults" vague; description raw wire-format JSON. | P1 | copy + redesign later |
| Add Column | node description | "Column type must match Monday's ColumnType" — API-enum jargon; picker already solves it. | P2 | copy |
| Create Group | `color` | Raw text box for a hex code "from Monday's group palette (e.g. #037f4c)". | P1 | redesign (fixed color swatch select) |
| Add File | node description | "Source is a FileRef from an upstream download/staging action… stage bytes first" — internal contract jargon. Field-level copy is good. | P1 | copy |
| Add File | `columnId` | Exposes internal sentinel `__item_files__`. | P2 | copy |
| Download File | node description | "stage it as a FileRef for downstream nodes". | P1 | copy |
| Download File | `columnId` | `__item_files__` sentinel again. | P2 | copy |
| Get Board | node description | "metadata" → "details". | P2 | copy |
| List Users | `kind` | Options "Non-guests" / "Non-pending" are Monday-API filter names. | P2 | copy |
| Search Items | `columnValue` description | "substring" → "contains". | P2 | copy |
| Create Board | `boardKind` | "Board kind" → "Board type" / "Who can see this board". | P2 | copy |

### Clean nodes
Get Item · List Items · List Boards · List Groups · Duplicate Board · Duplicate Item · Move Item · Archive Item · Delete Item · List Subitems · Create Update · List Updates · Get User. Triggers: New Item · New Subitem · Column Value Changed · Item Moved to Group · New Update Posted — single board picker (+ optional column picker with proper dependsOn cascade); excellent.

### Systemic
1. All 5 trigger descriptions end "Backed by a Monday webhook subscribed to the create_item event" — plumbing leak, repeated 5×. P2, copy.
2. Pagination copy (List Boards, List Items): "Paste `nextCursor` from the previous call", "Opaque token" placeholder — correctly advanced; bare "Limit" label with no description repeats. P2, likely cross-provider.
3. Paste-JSON column values (D-MON7) is one design gap surfacing in three nodes; one column-aware value editor fixes all three.
4. Combobox/cascade UX ("Search boards…" → "Select a board first") genuinely good.

### Provider verdict
Resource selection excellent — every board/group/item/column/user/file reference is a dependent picker; destructive actions properly flagged. Real hole: column VALUES (Update Item P0; Create Item/Subitem P1) → D-MON7 column-aware editor. Rest is copy polish (FileRef/webhook/metadata jargon).

## motive

### Findings

| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Get Fuel Purchase | `fuelPurchaseId` (required) | Raw text box, no picker (no `motive:fuel_purchases` source). Designed path is upstream mapping and the copy says so plainly; standalone user stalls. | P1 | resolver (recent-fuel-purchases picker) or richer mapping affordance |
| Update Fuel Purchase | `fuelPurchaseId` (required) | Same raw id box. | P1 | resolver |
| Delete Fuel Purchase | `fuelPurchaseId` (required) | Same — worse: destructive, confirm-gated action driven by a typed-in id. | P1 | resolver |
| Import Fuel Purchases (bulk) | `csvFile` / `rows` mode | Either/or expressed only in prose; both optional; no mode selector, no visibleWhen; nothing stops filling neither or both. | P1 | redesign (mode select + visibleWhen) |
| Import Fuel Purchases (bulk) | `rows[].purchasedAt` | Raw text cell, placeholder `2026-07-17T14:30:00Z` — hand-typed ISO-8601 UTC per row (top-level Create uses `datetime-utc`; row cell doesn't). | P1 | renderer/redesign (datetime cell type) |
| Import Fuel Purchases (bulk) | `csvFile` description | "A CSV in Motive's fuel-import template" — nothing says where the template comes from. | P2 | copy |
| Get Fuel Purchase | node description | "Returns `found: false`… (does NOT fail the run)" — code-speak. | P2 | copy |
| Create/Update Fuel Purchase | `jurisdiction` | Label "Jurisdiction" jargon; description rescues; label "State/Province" wouldn't need rescue. | P2 | copy |

### Clean nodes
Create Fuel Purchase · List Fuel Purchases · Send Message · Create Vehicle · Update Vehicle · Update Driver — vehicle/driver references are real account-aware pickers incl. object-list row cells; enums fixed selects with visible defaults; paging + odometer correctly advanced; `odometerUnit` properly visibleWhen. Triggers (8): seven zero-setup company-scoped; New Fuel Purchase's optional vehicle filter is a picker with "All vehicles". Descriptions plain with helpful firing semantics.

### Systemic
1. **Correction to my earlier note: motive is NOT at 0 optionSources.** `motive:vehicles` + `motive:drivers` implemented (`integrations/motive/options/vehicles.ts`, `drivers.ts`), registered in `services/options/_registry.ts` (~lines 894–895), tested. Only unpickered entity: fuel-purchase id (3 nodes).
2. `datetime-utc` renderer: whether persona can enter local time without understanding UTC depends on the shared renderer — one-time renderer check.

### Provider verdict
Strong for the persona: pickers where possible, fixed selects for enums, honest defaults, correct advanced/visibleWhen, zero-config triggers. Gaps: fuel-purchase-id trio + bulk-import's unenforced CSV-vs-rows mode + ISO timestamp row cell. No P0s.

Key paths: `integrations/monday/actions/items/updateItem.meta.ts` (the P0), `integrations/motive/actions/importFuelPurchasesCsv.meta.ts`, `services/options/_registry.ts` (motive resolver registration proof).

---

# Agent 7 — microsoft-outlook / microsoft-excel / microsoft-outlook-calendar / microsoft-onedrive

Coverage: 46/46 metas + option-source registry verified. P0s: 2 (both OneDrive Upload File). ~24 P1.

## microsoft-outlook

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Send Email | description | "via Microsoft Graph", "V2 forces explicit choice", "Requires the Mail.Send scope" — changelog language | P1 | copy |
| Send Email | isHtml | Label "Is HTML" assumes HTML knowledge; better "Body format" select "Plain text / Formatted" (Q11 preserved) | P1 | copy |
| Send Email | attachments | Placeholder "Paste a {{...}} token or FileRef JSON" | P1 | copy |
| Send Email | subject/body | "required by key but may be left blank" — schema-internals | P2 | copy |
| Reply to Email | emailId | Raw "Email id" box; "Graph message id... Source from a trigger payload (payload.messageId)" — no plain-language path | P1 | copy |
| Reply to Email | description | "the endpoint switches on it" | P1 | copy |
| Forward Email | emailId + description | Same raw box; "Graph's /forward endpoint... the handler parses both shapes into a flat list" | P1 | copy |
| Create Draft Email | isHtml + description | Same as Send Email | P1 | copy |
| Fetch Emails | description | "Graph $top ceiling", "compose multiple calls with date-window slicing" | P1 | copy |
| Fetch Emails | folderId | "paste a folder ID or well-known name ('sentitems'…)" — picker exists; lore belongs in Advanced framing | P2 | copy |
| Fetch Emails | query | Placeholder "from:alice subject:invoice" — operator syntax unexplained | P2 | copy |
| Fetch Emails | maxResults | Tuning knob on Setup; candidate advanced (Excel Find Row precedent) | P2 | advanced-flag |
| Get Email Attachment | emailId + description | Same raw box; "stage them as FileRefs... in v2 storage", "itemAttachment… metadata-only stubs" | P1 | copy |
| Move Email | emailId | Same raw box | P1 | copy |
| Move Email | description | "Graph returns a NEW message id" — concept matters, wording API-speak | P2 | copy |
| Delete Email | emailId | Same raw box | P1 | copy |
| Delete Email | description | "NO default per Outlook Phase 2 Q11 — V2 forces explicit choice" — internal doc reference verbatim | P1 | copy |
| Set Categories | emailId | Same raw box | P1 | copy |
| Set Categories | categories | Leads with "PATCH-REPLACE" in caps | P1 | copy |
| New Email (trigger) | from | Backticked wire path `email.from.emailAddress.address` | P2 | copy |
| New Email (trigger) | subjectExactMatch | "(V1 default)" internal versioning | P2 | copy |
| Email Sent (trigger) | to | "ToRecipients[]" array-notation wire name | P2 | copy |
| Email Flagged (trigger) | description | "V1-parity over-fire behavior", "no prior-state cache", "add a downstream dedupe step" — essential caveat written for engineers | P1 | copy |

### Clean nodes
List Folders · Get Profile (output jargon "Azure AD object id"/"UPN" covered systemically).

### Systemic
- **Six nodes share the raw `emailId` box** (Reply, Forward, Move, Delete, Set Categories, Get Attachment). Not P0 (dynamic upstream value, normal path is trigger-wiring) but identical copy should be fixed once with a plain variable-menu hint. The "2 optionSources" concern checks out: folders + categories both pickered everywhere applicable.
- Every node description ends "Requires the Mail.X scope" — strip to tooling metadata.

### Provider verdict
No P0s; folders/categories pickered; visibleWhen/required-when-visible correct (Get Attachment a model). Copy layer worst of the four — descriptions read like commit messages. Single copy-sweep moves it to office-worker-legible.

## microsoft-excel

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Update Row | values | Keyvalue editor with hand-typed column names ("must match your header row exactly, including capitals") while Add Row already resolves real headers via registered `microsoft-excel:worksheet_columns`. Label says "Pick a column" but nothing to pick. Typos fail at runtime | P1 | resolver |
| Update Row | values | Label "Values (column → value)" arrow notation | P2 | copy |
| Add Table Row | values | Positional string-array "one value per column, in the table's column order" — memorized order + blank-cell problem; `table_columns` resolver exists (Find Row uses it) | P1 | redesign |
| Read Range | address | Required raw A1 text ("A1:D10"; "full columns (`A:A`)… not allowed") — the one notation field in the provider | P2 | copy |
| Find Row | lookupValue | Backtick/escaped-quote formatting confusing | P2 | copy |
| Export Sheet | description | "header-keyed objects" / "positional arrays" | P2 | copy |
| Get Workbooks | outputs | `nextLink` "Graph pagination cursor" + surfaces provider URL (rule-7 tension — separate look) | P2 | copy |
| Read Table Rows | top | "pagination is not auto-followed"; candidate advanced | P2 | advanced-flag |

### Clean nodes
Add Row (MODEL node: workbook→worksheet→column-aware row editor with real headers) · Delete Row · Create/Rename/Delete Worksheet · Get Worksheets · Find Row (structure) · all 5 triggers (New/Updated Row, New/Updated Table Row, New Worksheet).

### Systemic
Trigger/node descriptions use "position-keyed", "stable-id tracking", "Graph-assigned stable row indexes" — useful guidance phrased for engineers; one pattern ×4 triggers + 2 descs.

### Provider verdict
Strongest of the four: full picker cascades, plain labels, Add Row is exactly the bar. Two real gaps: Update Row and Add Table Row not using the column resolvers their siblings prove out — stall-risks rather than blockers.

## microsoft-outlook-calendar

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Event | startTimeZone/endTimeZone | "Defaults to UTC when empty" = silent wrong-time trap (2:00 pm → 2:00 pm UTC). Should default to account zone or be required; "IANA" jargon | P1 | redesign |
| Create Event | bodyContentType | Required-when-Body-set but always visible, ungated, runtime-enforced only; "Is HTML"-class comprehension issue | P2 | renderer / copy |
| Create Event | labels | "Start Date-Time" / "End Date-Time" — "Start"/"End" suffice | P2 | copy |
| Update Event | startTimeZone/endTimeZone | Same UTC trap | P1 | redesign |
| Update Event | startDateTime | "Graph rejects one-sided time edits" — API-speak | P2 | copy |
| Update Event | eventId | Placeholder "Search events or use {{trigger.eventId}}" (picker main path — cosmetic) | P2 | copy |
| List Events | description | "master event series", "calendar view (which expands recurring events)" | P2 | copy |
| List Events | startDateTime/endDateTime | ISO placeholders; "Set both window fields or neither" runtime-only | P2 | copy |
| Delete Event | description | "per your tenant's mail-flow policy" — say "Outlook may automatically email attendees a cancellation" | P1 | copy |
| Add Attendees | eventId | Same `{{trigger.eventId}}` placeholder nit | P2 | copy |

### Clean nodes
Add Attendees (structure) · Event Changed (trigger, zero-config).

### Systemic
Advanced-tab classification here is exemplary (reminder/showAs/sensitivity/importance all advanced) — the pattern Outlook mail's Fetch Emails should copy.

### Provider verdict
Structurally sound; events picker + best Setup/Advanced separation in scope. One persona-level hazard: timezone pair silently defaulting to UTC → wrong-time events for exactly the users least able to diagnose. Plus "tenant mail-flow" copy.

## microsoft-onedrive

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Upload File | mimeType | **Required raw MIME text field ("application/pdf") that must match the extension** — fully derivable from File Name; derive/default + friendly picker, raw in Advanced | P0 | redesign |
| Upload File | content/contentEncoding | Real-file upload requires hand-produced base64 in a textarea — impossible for persona; only typed-text uploads achievable. Known deferred-FileRef decision; "utf8"/"base64" jargon | P0 | redesign (FileRef); copy interim |
| Move / Rename Item | itemId | "Pick a source folder first, or paste an item id" — folders+one-level-items cascade can't reach files deeper than one level; Get File's flat `microsoft-onedrive:files` picker solved this | P1 | resolver |
| Copy Item | itemId | Same one-level cascade limitation | P1 | resolver |
| Delete Item | itemId | Same | P1 | resolver |
| Copy Item | outputs/description | "Runs asynchronously — returns a pending status and a monitor URL"; `monitorUrl` ("Graph operation-status URL to poll") unusable in-product | P2 | copy |
| File Changed (trigger) | description | Zero-field config (good) but coaches in payload-speak ("Branch on changeType / deleted") | P2 | copy |

### Clean nodes
List Items · Get File (flat file picker — the right pattern) · Create Folder.

### Systemic
"…or paste an item id" in every picker description — normalizes ID-pasting as main-path copy; one phrasing fix.

### Provider verdict
Upload File fails the persona test outright (required MIME box + base64 textarea — the provider's headline write action; the 2 P0s). Secondary: Move/Copy/Delete should adopt Get File's flat picker.

## Cross-provider systemic (agent 7)
1. **Description-as-changelog**: Q11, V1/V2 parity, slice names, Graph endpoints, $top, PATCH, scopes in user copy (worst in Outlook mail). One copy-sweep policy ("no version numbers, HTTP verbs, scope names, internal doc refs in user copy") resolves ~60% of P1s here.
2. **Output/payload descriptions in wire jargon** ("post-parseRecipients", "Graph nextLink", "OWA URL", "UPN") — the surface users see when wiring steps.
3. **`{{...}}` tokens and ISO datetimes in placeholders** — mitigated only if shared renderers (datetime-utc etc.) show real pickers.
4. **`nextLink` outputs** (Excel Get Workbooks, OneDrive List Items) surface raw Graph URL — tension with authoring rule 7 (no provider host/paging-link leakage); separate rules check.

---

# Agent 10 — shopify / trello / facebook / discord

Coverage: 43/43 nodes (shopify 11a+1t, trello 8a+6t, facebook 8a+2t, discord 5a+2t) + renderer checks (ComboboxField, FileField). P0 count: 1 (shopify update_inventory).

## shopify

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Update Inventory | `inventory_item_id` | Required raw text for a provider-internal id with NO picker — inventory item id has no merchant-facing identity in Shopify admin. Sole path is mapping `{{step.inventoryItemId}}`; placeholder IS that syntax. Deliberate RESOLVERS-2 rationale documented (no list endpoint) but persona fails; a variant picker resolving the inventory item server-side would fix | P0 | redesign (resolver) |
| Update Order Status | `notify_customer` | Required in all 3 modes but "Has no effect for Add Tags / Add Note (still required)" — dead decision in 2 of 3 modes | P1 | redesign (visibleWhen / per-mode required) |
| Update Order Status | `action` | Backticked internal values "`cancel` is irreversible; `add_tags`…" | P2 | copy |
| Create Customer / Create Fulfillment / Create Order / Update Order Status / Add Order Note | consent booleans | "Required, no default (explicit consent). When true, …" — internal rule-speak, 5 nodes | P1 | copy |
| Create Product (+ variants) | `price` | "Decimal price as a string (e.g. \"29.99\")" — wire-format language | P1 | copy |
| Create/Update Product | `body_html` | Label "Description (HTML)" / "accepts HTML" — no plain-text guidance | P1 | copy |
| Create Order | `line_items` | "The variant id is the numeric id…" — id-speak undermining the row's catalog picker | P2 | copy |
| Create Order | `financial_status` | "Authorized / Voided" no descriptions; maybe Advanced | P2 | copy / advanced-flag |
| Create Fulfillment | node description | "open fulfillment-order line items" — internal API vocabulary | P1 | copy |
| Update Product Variant | node description | "the runtime rejects a variant-id-only update" | P2 | copy |
| Create Product Variant | node description | "`option1..3` correspond to the product's option positions" | P2 | copy |
| Webhook Received (trigger) | title + description | Title pure jargon (should be e.g. "Shopify Event Happens"); desc "branch on `payload.topic`… un-flattened at `payload.body`". Topics field itself friendly | P1 | copy |

### Clean nodes
Update Customer · Add Order Note (bar shared consent copy) · Update Product (bar HTML field).

### Provider verdict
Strong picker coverage (products, variants, orders, customers, locations) + good visibleWhen. One true P0: inventory_item_id. Dominant P1: developer-voiced copy ("decimal string", "When true", Q11 rule language) + jargon-titled webhook trigger.

## trello

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Card, Update Card, Move Card, Add Comment, Archive Card, Add Label to Card | `cardId`/`listId` | **Copy/capability mismatch**: descriptions promise "or paste a card id" / upstream mapping, but NONE set `allowManualEntry: true` — ComboboxField gates manual entry AND variable picker on that flag. Copy is false; anyone following instructions stalls. Picker path works → P1 | P1 | metadata flag or copy |
| Create/Update/Move Card, Create List | `pos` | "map a number from a variable" jargon; correctly advanced | P2 | copy |
| Create/Update Card (+ Create Board, Add Comment) | `desc`/`text` | "Markdown" jargon | P2 | copy |
| Create/Update Card | `due`/`start` | Placeholder "2026-06-01T17:00:00Z" raw ISO/UTC | P2 | copy / renderer |
| Update/Create Card | `dueComplete` | Label "Due Complete" cryptic ("Mark due date as done") | P2 | copy |
| Card Updated + 3 more triggers | description | camelCase payload names ("changedFields / oldValues", "memberAction (added \| removed)") | P2 | copy |

### Clean nodes
Create Board (visibility select with plain per-option descriptions + real Public warning — best field copy in audit) · Create List · New Card (trigger) · Card Moved (trigger).

### Provider verdict
Closest to persona-ready: full picker coverage, coherent cascade, advanced-flags right, one-picker triggers. Single real defect: six nodes' copy promises paste/mapping the metadata never enabled. Rest is polish.

## facebook

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Upload Photo | `photo` | "Upstream FileRef… Insert a {{nodeId.file}} token from a producer (download/staging) action." Placeholder "Paste a {{...}} FileRef token". FileField does render VariablePickerButton → copy stall, not hard block | P1 | copy |
| Upload Photo | node description | "FileRef(kind=provider_url) is not supported — stage bytes first (e.g. gmail:get_attachment…)" | P1 | copy |
| Upload Video | `video` + description | Same FileRef/token/stage-bytes copy | P1 | copy |
| Get Page Insights | `metric` | Only 2 static options; beyond that "type comma-separated metric names" = Graph-doc knowledge; placeholder `page_post_engagements` | P1 | options (expand curated list) + copy |
| Get Page Insights | `period` | Runtime default not surfaced (defaultValue absent by design note) | P2 | metadata (defaultValue) |
| New Post (trigger) | description | "Set the webhook callback URL once in the Meta App Dashboard" — owner/ops burden reads as end-user instruction | P1 | copy |
| Update Post | `isPublished` | "publish state" abstract; minor | P2 | copy |

### Clean nodes
Create Post · Comment on Post · Delete Post (model destructive handling) · Send Message ("Conversation" label over raw PSID exactly right) · New Comment (trigger — "Post (optional filter)" + "All posts" placeholder is a model pattern).

### Provider verdict
Page→post cascades and plain titles persona-friendly. Gaps: FileRef-dialect upload nodes, insights metric box needing Graph docs, Meta-App-Dashboard language in trigger. No P0.

## discord

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Send Message | `message` + description | Raw wire syntax as how-to: "`<@user_id>`, `<#channel_id>`, `<:emoji_name:emoji_id>` entered as raw text". No picker for in-message mentions; basic text works → P1, mention syntax unusable for persona | P1 | copy (+ future rich-text redesign, noted deferred in meta) |
| Delete Message(s) | `messageIds`/`userIds` | Labels "Message ids" / "From user ids" — id-speak on a HIGH-risk destructive node; snowflake placeholders. Pickers exist, manual entry properly flagged | P1 | copy |
| Delete Message(s) | `keywordMatchType` | "substring — widest match radius" jargon on a field whose misunderstanding bulk-deletes; "Exact (case-sensitive substring)" label contradictory; visible even when `keywords` empty (no visibleWhen) | P1 | copy + visibleWhen |
| New Message Posted (trigger) | description | "MESSAGE_CONTENT privileged intent (Discord Developer Portal) must be enabled", "V1's gateway-based sub-second delivery is not used in V2" | P1 | copy |
| New Message Posted (trigger) | payload `channelName`/`guildName` | "surfaced as `null` until a follow-up slice plumbs…" — slice-planning language in variable picker | P2 | copy |
| Slash Command Used (trigger) | `guildId` | "Picker sourced from `discord:guilds`… needs the `applications.commands` OAuth scope" | P1 | copy |
| Edit Message | node description | "picker only surfaces messages the bot authored (`discord:bot_messages`)" | P2 | copy |
| Assign Role | node description | "fails with a 403 from Discord" | P2 | copy |
| Fetch Messages | `filterType` | Option "With embeds" unexplained | P2 | copy |

### Clean nodes
Fetch Messages is otherwise a model node (defaults surfaced, visibleWhen-gated filters) — clean-with-one-P2. No fully finding-free Discord node.

### Provider verdict
Structure excellent (full cascades, destructive trio, visibleWhen) but copy most developer-voiced of the four: snowflakes, wire syntax, resolver keys, HTTP codes, Developer-Portal burdens. No P0; persona stalls on language, worst on the high-risk Delete node.

## Cross-provider systemic (agent 10)
1. **Combobox variable/manual entry opt-in + silently absent** — ComboboxField (CS-2) shows manual entry AND variable-picker button only when `allowManualEntry: true`. Trello (6 nodes) + Discord copy promises paste/map on comboboxes without the flag. Either renderer always offers variable insertion, or lint "paste/map copy requires the flag".
2. **Backticked code identifiers in user-facing descriptions** across all four providers — copy convention: "use the on-screen label, never the config key".
3. **FileRef token copy** — belongs in the renderer as a uniform "pick a file from a previous step" affordance, not per-node token instructions.
4. **Internal design-rule phrases surfaced verbatim** — "Required, no default (explicit consent)" (Q11 rule language) in Shopify ×5.
5. **Raw ISO-UTC placeholders on datetime-utc fields** (Trello, Facebook) — moot if renderer shows a picker; techy if placeholders render.

---

# Agent 11 — asana / microsoft-teams / microsoft-onenote

Coverage: all 35 nodes (asana 12, teams 9, onenote 14) + shared renderer spot-check. P0 count: 1 (teams replyToChannelMessage).

## asana

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Update Task, Complete Task, Get Task, Add Comment to Task, Create Subtask | `taskGid`/`parentTaskGid` | Placeholder "Select a project first, or paste a task gid" — "gid" jargon on Setup. Picker is main path (not P0) but fallback wording assumes gid knowledge | P1 | copy ("or paste a task link/ID from Asana") |
| Get Task | node description | "Fetch one Asana task by gid" — leads with "gid" | P1 | copy |
| All 5 triggers | node description | "The event carries gids only — chain Get Task for the task's content" — "gids", "chain" | P1 | copy ("add a Get Task step after this…") |
| All 12 nodes | `workspaceId` | "Scopes the project picker(s)" — dev vocab; Workspace optional while required Project picker says "Select a workspace first" — ambiguous optional-but-practically-required | P2 | copy / redesign |
| List Tasks in Project | node description | "cursor", "backfills" | P2 | copy |
| List Tasks in Project | `offset` | Advanced (correct) but "Pagination cursor from a previous run's `nextOffset`" renders backticks literally | P2 | copy |

### Clean nodes
Create Task (only provider-wide workspaceId P2; pickers present, labels plain, real date type).

### Systemic
Output descriptions ("Task gid.", "ISO") carry gid jargon into the variable picker — one copy convention fix.

### Provider verdict
Structurally best of the three: every identifier has dependent combobox pickers, manual entry is fallback, plumbing correctly advanced. No P0s. Remaining work purely copy ("gid" leaks everywhere).

## microsoft-teams

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Reply to Channel Message | `messageId` | Required raw "Parent Message ID" text box, no picker (message picker explicitly deferred per file header). Desc teaches raw `{{trigger.messageId}}` syntax. Standalone user cannot find a message id; trigger-driven requires variable-syntax fluency | P0 | resolver (message picker) + copy |
| Send Channel Message, Reply to Channel Message, Send Chat Message | `contentType` | "Content Type" (HTML / Plain text) on Setup, default "html" — persona doesn't know HTML; rendering plumbing, not a user decision | P1 | advanced-flag + copy ("Formatting") |
| List Channel Messages | node description | "header-level metadata only (id, timestamps, importance, type, sender id, deeplink)" | P2 | copy |
| Get Channel Details | node description | "Get metadata for…" | P2 | copy |

### Clean nodes
List Teams · List Channels · Get Team Members ("Max results" is a model plain label) · New Channel Message (trigger — plain title/description, full picker cascade).

### Systemic
Output/payloadShape descriptions engineer-voiced ("ISO-8601 created.", "AAD object id (or null).", "Graph nextLink", "html | text") — visible in downstream variable picker.

### Provider verdict
One real P0: Reply to Channel Message's raw Parent Message ID. Everything else well-pickered; HTML/Content Type on Setup of all three send nodes is the main P1 stall risk.

## microsoft-onenote

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| 11 of 12 actions | node description | Raw Graph wire-format in descriptions: "via Graph `POST /me/onenote/notebooks`", "`PATCH …/content`", "`nextLink` for forward-compat", "Graph HTML5 fragment grammar", "`application/xhtml+xml` requires strict XHTML", "Set `includeIDs: true` when chaining into `update_page`" — API-doc voice | P1 | copy |
| Create Notebook, Create Section | `displayName` | "Variables resolve at runtime — interpolate upstream node outputs with `{{nodeId.field}}` syntax" on a "name the notebook" field | P1 | copy (point at variable picker) |
| Update Page | `target` | "CSS selector (e.g. div#summary) or a data-id value from an earlier Get Page Content step" — requires HTML/CSS knowledge. Correctly visibleWhen insert-mode only (hence not P0), but insert mode unusable for persona | P1 | copy + redesign (structured target picker later) |
| Update Page | `content` | Placeholder `<p>Updated content…</p>` teaches raw HTML | P2 | copy |
| New Note, Updated Note (triggers) | node description | "Graph deprecated OneNote webhook subscriptions in May 2023 — polling is the V2-native architecture", "dedup keyed by page + modification timestamp" — user needs "checks every 5 minutes" at most | P1 | copy |
| Copy Page | `targetSectionId` | "paste a section id" jargon in fallback clause | P2 | copy |
| List Notebooks/Sections/Pages | `orderBy` | Cites raw defaults "`displayName asc`" — option labels already plain ("Name A→Z") | P2 | copy |

### Clean nodes
None fully clean (Graph-endpoint description finding hits every action except Copy Page, which carries its own P2). Field-level UX is strong everywhere: full notebook→section→page cascades, includeIDs/preGenerated correctly advanced with plain labels, flat "Notebook › Section" target picker, destructive trio on Delete Page. Copy Page's description is the plain-language model.

### Provider verdict
No P0s — picker architecture exemplary; ordinary user can complete every main path by pointing and clicking. But copy layer written for engineers; single copy-rewrite pass moves it from "usable but alienating" to clean.

## Systemic (all three)
1. **Descriptions render as literal plain text** — FieldShell.tsx + ConfigModalShell.tsx render `{description}` raw, no markdown. Every backtick/`**bold**`/`{{var}}` shows as raw punctuation. Fix once: light markdown renderer OR copy convention banning markdown in meta strings (cheaper, aligns with plain-language goal).
2. **Raw variable-syntax teaching** — metas instruct typing `{{trigger.messageId}}` although VariablePickerButton exists. Convention: "insert it with the variable picker".
3. **Engineer-voiced output/payload descriptions** ("gid", "ISO-8601", "AAD object id", "Graph nextLink") in the variable picker.
4. **Optional-parent / required-child cascade ambiguity** (Asana Workspace → Project) — parent optional while required child demands it first; renderer or metadata convention should resolve.

---

# Agent 1 — microsoft-powerbi

Coverage: all 63 metas (47 actions: capacities 2, dataflows 4, gateways 5, imports 2, pipelines 10, reports 7, semantic_models 12, workspaces 5; 16 triggers). P0 count: 1.

## Findings

| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Bind Paginated Report to Gateway | `bindDetails[].datasourceObjectId` | Required row cell raw text for "Id (uuid) of the data source in the gateway" — no optionsSource though `microsoft-powerbi:gateway_datasources` resolver EXISTS and `gatewayId` is top-level (RESOLVERS-3 dependsOn would work) | P0 | resolver |
| Bind Paginated Report to Gateway | `bindDetails[].datasourceName` | Raw text for report-internal datasource name; RDL datasources API could feed a picker | P1 | resolver |
| Update Paginated Report Data Sources | `updates[].datasourceName` | Same required raw report-internal name | P1 | resolver |
| Update Semantic Model Data Sources | `updates[].currentServer/currentDatabase/currentUrl` | User must type the model's EXACT current connection values from memory; fetchable/prefillable | P1 | resolver |
| Bind Semantic Model to Gateway | `datasourceObjectIds` | Advanced-only string-array of raw gateway datasource UUIDs, no picker (resolver exists). Main path OK, not P0 | P1 | resolver |
| Add or Update Pipeline User | `principalIdentifier` | One raw box for "Email/UPN … or Azure AD object id"; Group/App path requires an object id, no picker; doesn't split by principalType via visibleWhen like Add Workspace User | P1 | redesign |
| Add or Update Pipeline User | `accessRight` | Select with exactly one option (Admin) — not a decision; derive/hide | P2 | copy |
| Add Workspace User | `principalIdentifier` | Group/App path demands "Entra object id" — raw box, no lookup. (User path fine: email + visibleWhen) | P1 | resolver |
| Update Workspace User | `principalEmail`/`principalIdentifier` | No picker of workspace's EXISTING members though Remove Workspace User has `workspace_users` resolver; retype blind + Entra object id issue | P1 | resolver |
| Add Gateway Datasource User | `accessRight` | "Read + override effective identity (embed)" — undecodable without Power BI embed knowledge | P1 | copy |
| Create Gateway Datasource | `server`/`database`/`url` | Not scoped by visibleWhen on `datasourceType` — all three show for every type; "At least one … required — schema enforces" | P1 | redesign |
| Create Gateway Datasource + Update Gateway Datasource Credentials | credential descs | "Required for Basic/Windows credentials — schema enforces" — validation-layer language, recurring | P2 | copy |
| Same two nodes | `privacyLevel` | "how Power BI is allowed to fold/combine data" — Power Query jargon; options carry no plain hints | P2 | copy |
| Import Power BI File | description | "Link-only (provider_url) files are rejected — stage bytes through an upstream get/download step", "asynchronous" | P1 | copy |
| Import Power BI File | `file` | Placeholder "Insert a {{...}} file from a previous step" — raw template syntax | P2 | copy |
| Import Power BI File | `datasetDisplayName` | Required "include the file extension (e.g. Report.pbix)" — provider quirk; derivable from file | P2 | copy |
| Export Paginated Report to File | `parameterValues[].name` | Raw text for RDL parameter names (case-sensitive); GetParameters API could feed a row picker (pattern exists in Update Semantic Model Parameters). Optional, not P0 | P1 | resolver |
| Export Power BI Report to File / Export Paginated Report to File / Export Report Definition | descs/outputs | "FileRef", "kind: v2_storage", "PPU", "artifact type", "RDL" jargon | P2 | copy |
| Cancel Dataflow Refresh / Get Import Status / Get Pipeline Deployment Status / Cancel Semantic Model Refresh / Get Semantic Model Refresh Details | combobox placeholders | Raw variable syntax in placeholders ("insert {{node.transactionId}}"). Pickers exist, so P2 | P2 | copy |
| Update Dataflow/Semantic Model Refresh Schedule | `localTimeZoneId` | "Power BI expects a WINDOWS time-zone id … NOT an IANA name" — noise on a curated select | P2 | copy |
| Update Semantic Model Refresh Schedule | `enabled` | "To disable, Power BI expects no other schedule changes in the same request" — unclear what user should do | P2 | copy |
| Execute DAX Query | `maxRows` | Required plumbing number with no defaultValue (sibling trigger ships defaultValue: 20) | P2 | advanced-flag |
| Assign Workspace to Capacity | description | "completes asynchronously — chain Get Capacity Assignment Status", Premium/Fabric talk | P2 | copy |
| DAX Condition Met (trigger) | `daxQuery` desc + `impersonatedUserName` | "scalar result", label "Run As (RLS User)" — advanced-only softens | P2 | copy |
| Remove Workspace/Pipeline/Gateway-Datasource User + add/update principal nodes | labels/descs | Recurring "principal", "UPN", "object id" Microsoft-identity jargon | P2 | copy |

## Clean nodes
Actions: Get Capacity Assignment Status · Get Dataflow Refresh History · Refresh Dataflow · Test Gateway Datasource Connection · Assign Workspace to Pipeline Stage · Create Deployment Pipeline · Deploy All Pipeline Content · Get Pipeline Deployment History · Selectively Deploy Pipeline Content · Unassign Workspace from Pipeline Stage · Update Deployment Pipeline · Clone Report · Rebind Report · Get Query Scale-Out Sync Status · Get Semantic Model Refresh History · Refresh Semantic Model · Take Over Semantic Model · Trigger Query Scale-Out Sync · Update Semantic Model Parameters (model-parameter row picker = reference implementation) · Create Workspace · Update Workspace.
Triggers: all 16 clean except DAX Condition Met (P2).

## Systemic
- **Conditional requiredness leaks internals**: meta can't express "required when credentialType = Basic" → fields are optional + visibleWhen and copy compensates with "Required for X — schema enforces". A meta-level `requiredWhen` (or renderer treating visible-conditional as required) deletes this pattern everywhere.
- **`{{...}}` syntax as placeholder copy** in every allowManualEntry combobox (5 nodes here). A renderer-level "insert from a previous step" affordance would prevent authors reaching for raw template syntax.
- Cascading dependsOn pickers, advanced, visibleWhen used consistently and correctly — issues are copy/resolver gaps, not renderer behavior.

## Provider verdict
Structurally one of the stronger providers: virtually every resource is a cascading picker; plumbing consistently advanced. One true P0 (gateway-datasource UUID cell in Bind Paginated Report to Gateway) + a P1 cluster of raw-value row cells (report datasource names, current connection values, Entra object ids) + Microsoft-identity/BI jargon. Caveat: most of these nodes are inherently BI-admin territory — persona could operate refresh/export/import/watch nodes today but was never going to write DAX regardless of copy.

---

# Agent 4 — hubspot / github / google-analytics

Coverage: all 40 nodes (27 hubspot, 7 github, 6 google-analytics) + renderer check on FieldShell.

## hubspot

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Deal | `dealstage` (required) / `pipeline` (optional) | Required Stage picker gated on optional Pipeline (`dependsOn: "pipeline"`, "Select Pipeline first") — user skipping optional Pipeline hits a required picker demanding it. Main-path stall. | P1 | redesign (make pipeline required, or stage resolver serves default pipeline when empty) |
| Create Call | `hs_call_duration` "Duration (ms)" | Milliseconds ("15 min = 900000"), not advanced-flagged. | P1 | redesign (minutes input, convert in handler) or copy+advanced |
| Add Contact to List | `listId` + node desc | Exposes `MANUAL`/`DYNAMIC` processingType, "400 VALIDATION_ERROR", endpoint path; user must read option fine print to avoid runtime failure. | P1 | resolver (filter/flag dynamic lists) + copy |
| Remove from List | `listId` + node desc | Same MANUAL/DYNAMIC/400 problem. | P1 | resolver + copy |
| Add/Remove from List | node description | "branch on `contactIdsAdded.length === 0`" — code expression in user copy. | P1 | copy |
| Get Deals | `filterValue` | "Stage filters use the internal stage id (e.g. `closedwon`) — copy it from the Deal stage picker on Create Deal" — harvest an internal id from another node's picker. | P1 | resolver (dependent value picker for enum properties) or copy |
| Get Tickets | `filterValue` | Same harvesting instruction; placeholder bare `1`. | P1 | resolver or copy |
| Webhook Received (trigger) | title + description | Title "Webhook Received" pure jargon; description engineer-facing (`payload.subscriptionType`, "discriminate", dedup). Fields underneath excellent. | P1 | copy (e.g. "HubSpot Change Detected — fires when a contact, company, deal, or ticket is created, changed, or deleted") |
| Create/Update Product | `hs_recurring_billing_period` | Manual hint "type any ISO 8601 duration (e.g. `P2M`)"; preset labels fine. | P2 | copy |
| Create Task | `hs_task_reminders` | "Reminder times as millisecond timestamps, comma-separated" — advanced (correctly) but unusable without docs. | P2 | redesign (date-time list) |
| Get Owners | node description | "use `id` NOT the `userId`", endpoint path, cursor mechanics. | P2 | copy |
| Create Note / Call / Meeting / Deal, Update Deal | `hs_timestamp` / dates | "millisecond-epoch string still hydrates as editable text", "Defaults to `Date.now()`" — implementation internals in help text. | P2 | copy |

### Clean nodes
Create Contact, Create Company, Create Ticket, Update Contact/Company/Ticket/Deal (aside from systemic copy), Update Product, Create/Update/Remove Line Item (exemplary destructive treatment), Create Note, Create Meeting, Get Contacts/Companies/Line Items/Products — real account-aware pickers with `allowManualEntry`, correct advanced on cursors/properties, visibleWhen on filter values, no raw-ID-only fields.

### Systemic
1. **Node descriptions engineer-facing portal-wide**: REST paths, HTTP codes (409/400/204), PATCH/DELETE, "stringified numerics per HubSpot's wire format". One copy pass over all 27 nodes. (P1, copy)
2. **"HubSpot `firstname` property" pattern**: dozens of field descriptions are just internal property names, not what the field does. (P1, copy)
3. **"Stored as a text string — HubSpot's required format"** on every numeric-as-text field. (P2, copy/renderer)
4. **FieldShell renders descriptions as plain text** — `features/workflow-builder/config-modal/fields/FieldShell.tsx` outputs `{description}` verbatim; pervasive backticks/`**bold**`/`{{...}}` display literally. Strip markdown from metas or teach the shell minimal inline formatting. (P1, renderer + copy)

### Provider verdict
Structurally best of the three — no P0s; pickers, cascades, advanced-flags, destructive gating all correct. But language is engineer-to-engineer nearly everywhere. Systematic copy rewrite + FieldShell markdown fix moves it from "usable despite the words" to ordinary-user-ready.

## github

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Create Issue | `milestone` | Raw number box demanding "numeric milestone id (NOT title)" — no picker, Setup tab, not advanced. (Meta docstring notes `optionsSource` forbidden on `number` fields.) | P1 | resolver (milestone picker committing the number) or advanced-flag until then |
| Add Comment | `issueNumber` | Required raw number, no picker; realistic path is upstream mapping; by-hand user must find the number in GitHub. | P1 | resolver (recent issues/PRs picker, dependsOn repository) |
| Create Repository | node description | "Does NOT default to private — set `private` explicitly" — field-name jargon, literal backticks. | P2 | copy |
| Create Repository | `auto_init` | "When true…" + "initial commit"/"clonable" jargon. | P2 | copy ("When on, …") |
| Create Pull Request | `draft` | "When true, opens the PR in draft state". | P2 | copy |
| Create Gist | `isPublic` | "world-readable and search-indexed" — right intent, techy phrasing. | P2 | copy |
| New Commit (trigger) | node description | "Backed by a GitHub repo webhook subscribed to the push event". | P2 | copy |

### Clean nodes
Create Branch, Create Pull Request (repository/head/base pickers + blank-base auto-default explained plainly), New Commit trigger fields (repository + branch pickers).

### Systemic
- No `advanced: true` anywhere in the provider. Candidates: milestone, homepage, gitignore_template, license_template, auto_init, draft. Polish. (P2)
- Repository copy on 6 nodes: "type an `owner/repo`" with literal backticks (FieldShell issue).

### Provider verdict
No P0s. Persona caveat is category-level — branch/PR/gist is irreducible domain vocabulary for a developer product. Within its audience: good shape; milestone raw-id box and issueNumber are the two real gaps.

## google-analytics

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Send Event | `apiSecret` (required) | User must go to GA Admin → Data Streams → Measurement Protocol API secrets, create one, paste it. Required, main-path, provider-internal by definition. | P0 | redesign (owner-level credential capture at connect time, or guided inline help) — provider constraint |
| Send Event | `clientId` (required) | "The GA4 client_id", placeholder `1234567.7654321` — no ordinary user knows what this is or where it comes from. Required, no picker, no plain-language explanation. | P0 | copy (explain source + usually mapped from earlier step) + redesign ("generate an ID for offline events" option) |
| Send Event | title/description | "via the Measurement Protocol" — intrinsically a developer node but copy doesn't help lay users self-select out. | P1 | copy |
| Create Conversion Event | `eventName` | Free-text internal event name (`purchase`), no picker of existing events; deferred per-property metadata resolver documented. Core field of the node. | P1 | resolver (event-name suggestions from Data API metadata) |
| Run Report / Run Pivot Report | `metrics`/`dimensions` labels | GA-native but abstract; curated plainly-labeled option lists largely rescue. | P2 | copy ("What to measure" / "Break down by") |

### Clean nodes
Run Report, Run Pivot Report, Get Realtime Data, Find Conversion — full Account → Property (→ event/stream) cascades, curated human-labeled metric/dimension lists, visibleWhen on custom date range, customEvent/userId correctly advanced. Best plain-language copy of the three providers.

### Systemic
None beyond shared FieldShell issue (GA metas use almost no backticks).

### Provider verdict
Read/lookup nodes are model citizens. Send Event is the outlier: two required P0 fields make it unconfigurable without provider-internal knowledge — position as advanced/developer node or give guided setup. Create Conversion Event needs the deferred event-name resolver.

## Cross-provider summary (agent's)
- P0s: 2, both `google-analytics:send_event`.
- Biggest win: copy-only pass over HubSpot's 27 nodes + FieldShell markdown rendering fix. Zero resolver work needed there.
- Resolver backlog implied: GitHub milestones + issue/PR picker; HubSpot dependent filter-value options; GA conversion-event-name suggestions.

---

# Agent 3 — eden / adp / calendly / typeform

Coverage: eden 36/36 actions (no triggers), calendly 2/2 triggers (no actions), typeform 2/2 actions + 1/1 trigger, adp 0 nodes (confirmed empty — auth/manifest/webhook-verify only). No P0s; 9 distinct P1s (8 eden, 1 typeform), rest P2.

## eden

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Search Workspace Items | `type` (Type filter) | Free-text box requiring Eden's internal type strings — description says "Eden types boards as `canvas` and notes as `markdown`", placeholder `canvas`. Small fixed vocabulary → should be a select with plain labels ("Boards", "Notes"). Optional, so not P0. | P1 | redesign (text → select) |
| List Scheduled Posts | `status` (Status filter) | Free-text box for an enumerable status ("queued, sent, draft") — should be a select. | P1 | redesign (text → select) |
| List Captures | `status` (Status filter) | Free-text status "exactly as Eden reports it in each capture's `status` output" — circular: must run the action to learn the filter values. No placeholder/examples. | P1 | redesign (text → select) or copy with concrete values |
| Create Sticky Note | `color` | Free-text "Sticky color as Eden names it (e.g. yellow)" — provider-internal color vocabulary; should be a select. | P1 | redesign (text → select) |
| List Highlights | `orderBy` (Order by) | "Sort order key as Eden accepts it" — provider-internal, zero examples. Advanced-only + optional, but unusable without Eden docs as written. | P1 | copy (list valid keys) or select |
| Schedule Post / Publish Post Now / Create Scheduling Draft / Update Scheduled Post (shared `_fields.ts`) | `media` | Attachments are public-URL-only ("No file uploads — paste a public URL"). Persona cannot produce a public URL for a photo; media required for Instagram/TikTok/YouTube per prose but field optional with no enforcement. | P1 | redesign (FileRef/upload support; conditional requirement) |
| (same shared fields) | `media[].mimeType` | "MIME type" label + `image/png` placeholder — raw jargon in a Setup-tab row cell. Should be advanced or auto-derived from URL. | P1 | advanced-flag / copy |
| (same shared fields) | `youtubeTitle`, `segments`, `media` | No `visibleWhen` scoping to platform selection — irrelevant fields show for single-platform posts; "Required when posting to YouTube" lives only in prose. | P2 | metadata (`visibleWhen` on platforms) |
| Set First Comment | `afterLikes` / `delayMinutes` | Mutual exclusivity enforced only in prose; node description has grammar break ("the auto first-comment Eden posts right after a draft/scheduled post publishes"). | P2 | copy + visibleWhen/validation |
| Read Note / Create Note / Append to Note / Rewrite Note / Export Saved Prompt | descriptions & title | "Markdown" jargon in descriptions and one title ("Export Saved Prompt (Markdown)") — say "text"/"formatted text". | P2 | copy |
| Research Creator | description | "aggregate performance (averages + outlier baselines)" — analyst jargon. | P2 | copy |
| List Boards / List Board Items / List Notes / Search Workspace Items | `cursor` | "Cursor" jargon but correctly `advanced: true`. Polish. | P2 | copy |
| ~12 board/note/prompt nodes (Read/Trash/Rename Board, Create/Read/Append/Rewrite/Rename Note, Get/Export Prompt, Save Links, List Board Items, Create Sticky Note) | `boardId` / `itemId` / `promptId` | Copy promises "or paste a board id / note id" but comboboxes do NOT set `allowManualEntry` (ComboboxField makes manual entry strictly opt-in) — advertised paste path likely doesn't exist. (Scheduled-post comboboxes DO set the flag.) | P1 | metadata (add `allowManualEntry: true`) or copy (drop the promise) |

### Clean nodes
List Workspaces · List Schedules · Create Board · Rename Board (picker path) · Trash Board (picker path) · Save Links to Board (picker path) · List Prompts · List Creator Lists · Resolve Creator · Following Overview · Read Social Post · Read Scheduled Post · Reschedule Post · Cancel Scheduled Post. (Rewrite Note's REPLACE warning and Publish Post Now's high-risk confirmation copy are notably good.)

### Provider verdict
Strong overall: pickers everywhere, dependent workspace→board/note comboboxes, honest risk copy. Gaps: four free-text fields demanding Eden's internal vocabulary (should be selects), public-URL-only media path blocking non-technical image posts, and "paste an id" promises on comboboxes without `allowManualEntry`. No P0s.

## adp
No actions/triggers — nothing to audit. Manifest honesty spot-check when actions land.

## calendly

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Meeting Scheduled | node description | Internal field name `oldInviteeId` in first-read description — say "when a meeting is rebooked, this fires for the new time". | P2 | copy |
| Meeting Canceled | node description | "the rescheduled flag identifies those" — internal flag name in user-facing copy. | P2 | copy |

### Clean nodes
Both nodes otherwise exemplary: single optional "Event type" picker (`calendly:event_types`), "All event types" empty-state, zero required fields, plain payload descriptions.

### Provider verdict
Passes persona test outright; only polish is removing internal field-name references.

## typeform

### Findings
| Node | Field | Issue | Severity | Fix type |
|---|---|---|---|---|
| Get Response | `responseToken` (Response token) | Required plain-text, no picker; "token" jargon; placeholder "Map the trigger's responseToken here" assumes variable-mapping fluency. Legitimately a dynamic upstream value, but standalone use hits a wall. Rename to "Response ID (from the New Response trigger)" + lean on variable picker. Borderline P0; graded P1 since upstream mapping is the designed main path. | P1 | copy (+ ensure variable picker renders) |
| Get Response | node description | "by its response token… Returns `found: false` (does NOT fail the run)" — token + backticked code in first-read description. | P2 | copy |
| List Responses | node description | "Returns a cursor for the next page" — cursor jargon in Setup-visible description (cursor field itself correctly advanced). | P2 | copy |

### Clean nodes
New Response in Form (trigger) — single required "Form" picker + helpful draft-form warning. List Responses otherwise excellent ("Submitted after/before", page-size/cursor advanced, plain "Search").

### Provider verdict
Trigger + List Responses pass cleanly. Get Response is the friction point: jargon-labeled required field only completable via upstream mapping — right architecture, copy must carry the user.

## Systemic (cross-provider)
- ComboboxField makes manual/variable entry strictly opt-in via `allowManualEntry` — correct design, but metadata copy advertising "paste an id" silently over-promises when the flag is absent (widespread in eden). Candidate lint/consistency check: placeholder/description saying "paste" ⇒ must set `allowManualEntry: true` or drop the claim.
- Good pattern worth spreading: optional workspace field with "Leave empty to use your default workspace".
