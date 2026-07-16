# Audit — Group G: google-calendar, google-drive, google-analytics, facebook, discord, dropbox, github

All 56 nodes audited against the inventory JSON AND the real meta/schema files under `integrations/<provider>/`. Google Calendar / Drive picker+temporal modernization (config-field-ux-modernization-closeout.md) was **verified, not re-proposed** — calendars picker on all 5 gcal actions + trigger, datetime/timezone/datetime-utc/location adoption, gdrive files/folders pickers all confirmed present in the metas.

## Systemic patterns

1. **Runtime-broken text fields vs array schemas (2 fields, HIGH).** `github:create_issue` `labels`/`assignees` are `type: text` ("comma-separated") but `createIssue.schema.ts` requires `z.array(z.string())`. The meta comment says "the v1 renderer does the CSV split at submit time" — **no such split exists anywhere** (grepped `features/workflow-builder/config-modal`, `services/`, handler). A typed value commits a string and fails zod at run time.
2. **ISO-timestamp free-text where temporal field types exist (5 fields, MEDIUM).** facebook `scheduledPublishTime`, `since`, `until` (all validate `z.string().datetime({offset:true})`, which accepts the `…Z` string `datetime-utc` commits) and GA `run_pivot_report` `startDate`/`endDate` (plain text while sibling `run_report` already uses `type: date`, identical schema). Straight conversions, zero shape change.
3. **Stale "no picker possible" limitations (2 fields, MEDIUM).** `discord:delete_message` `messageIds`/`userIds` descriptions and the meta comment claim string-array can't carry `optionsSource` — the contract (contracts/actionMeta.ts:592-608) now explicitly allows it (SWEEP-2), and registered resolvers `discord:messages` / `discord:members` already exist. Buildable today with meta-only edits.
4. **Provider-internal names required as free text (4 fields, 1 HIGH + 3 MEDIUM).** facebook `metric` (Graph metric names, catalog invisible, deprecation traps), gdrive `mimeType`, github `gitignore_template`/`license_template`. All are runtime strings → convertible to combobox with static options + `allowManualEntry` without shape change.
5. **`visibleWhen` candidates now that the infra exists (11 fields, MEDIUM).** GA custom-range dates (×2 nodes), gcal create_event allDay date/datetime pairs (4 fields), discord fetch_messages filter trio, discord delete_message `keywordMatchType`.
6. **Pagination cursors in the normal path (4 fields, MEDIUM).** `pageToken` (gcal list_events, gdrive list_files, gdrive search_files) and dropbox `cursor` are pure power-user loop plumbing → `advanced: true`.
7. **Implementation jargon in setup descriptions (~14 fields, mostly discord, MEDIUM).** Descriptions cite resolver ids (`discord:guilds`, `discord:members`), HTTP codes ("403 + code 50005"), wire behavior ("over-fetches up to 3×"). Brief allows JSON-flavored copy only on advanced fields; these are setup-path.
8. **Schema defaults not surfaced in meta (4 fields, LOW-MEDIUM).** facebook upload photo/video `published` (schema `.default(true)` — recipient-visible!), dropbox upload `mode`/`autorename` (`.default("add")`/`false`). Adding `defaultValue` to meta makes the honest default visible and satisfies readiness.
9. **Dropbox `folderPath` helper-cascade (6 nodes).** The "Folder (for file picker)" + gated file picker pattern is honest and works, but the label leaks mechanism; consistent LOW polish opportunity.

---

## google-calendar (6 nodes)

### google-calendar:create_event (action) — Create Event
| Field | Current | Why fails/succeeds | Power-user value | Class | Proposed Setup | Proposed Advanced | Default/derivation | Runtime preservation | Compat risk |
|---|---|---|---|---|---|---|---|---|---|
| startDateTime / endDateTime | datetime, always visible | Shown even when All Day is on → user fills wrong pair | — | conditional-option | `visibleWhen: {field: allDay, valueIn: [false]}` (also when unset — confirm falsy semantics) | — | — | keys/shapes untouched | low |
| startDate / endDate | date, always visible | Shown even when All Day is off | — | conditional-option | `visibleWhen: {field: allDay, valueIn: [true]}` | — | — | untouched | low |
| colorId | select, desc "Google Calendar color id (1–11)" | Jargon ("color id") in desc | — | core-user-decision | desc: "Event color shown on the calendar." | — | — | untouched | none |
| sendNotifications, guestsCanInviteOthers, guestsCanSeeOtherGuests | required select/booleans, no default | Q11-locked (verified in schema comments) — correct as-is | — | core-user-decision | keep | — | Q11: no default allowed | — | — |
| calendarId, summary, description, location, allDay, timezone, attendees, googleMeet, guestsCanModify, visibility, transparency | OK | Picker (SWEEP-4 verified), temporal family (CS-1 verified), location field, plain labels | — | mixed OK | — | — | — | — | — |

### google-calendar:list_events (action) — List Events
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| pageToken | text, normal path | Loop-composition plumbing; meaningless to first-time user | cursor loops | advanced-user-control | — | `advanced: true` | — | untouched | none |
| orderBy | select, desc references Expand Recurring coupling | Mild coupling but honest | — | conditional-option | optional `visibleWhen singleEvents=true` — LOW | — | — | untouched | low |
| calendarId, timeMin, timeMax, maxResults, query, singleEvents, showDeleted | OK | picker + datetime-utc (SWEEP-3/4 verified), sane defaults (250, true, false) | — | OK | — | — | — | — | — |

### google-calendar:update_event (action) — Update Event
No findings beyond create_event's shared polish — fields OK as-is: calendars picker + temporal family verified; "leave empty to keep" partial-update wording is exemplary; Attendees (Replace) explicitly warns and points to Add Attendees; sendNotifications Q11-required correctly. (`eventId` text with `{{trigger.eventId}}` placeholder = upstream-data-mapping, appropriate.)

### google-calendar:delete_event (action) — Delete Event
No findings — fields OK as-is: 3 fields; calendar picker, eventId upstream-mapping, Send Cancellations Q11-required with plain outcome label. Risk copy present in node description.

### google-calendar:add_attendees (action) — Add Attendees
No findings — fields OK as-is: 4 fields; "Already-invited addresses are skipped" is exactly the outcome language wanted; Q11 sendNotifications kept required.

### google-calendar:event_changed (trigger) — Event Changed
No findings — fields OK as-is: single calendar picker with primary default (SWEEP-4 verified).

---

## google-drive (8 nodes)

### google-drive:upload_file (action) — Upload File
| Field | Current | Why | Power-user value | Class | Proposed Setup | Proposed Advanced | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|---|---|
| mimeType | required text, "application/pdf" placeholder | Requires knowing MIME strings; required, no picker | arbitrary types | provider-resource-selection | combobox, static options (~12 common: PDF, plain text, CSV, JSON, PNG, JPEG, HTML, DOCX, XLSX…), `allowManualEntry: true`; desc: "What kind of file this is. Pick a common type or type any MIME type." | — | could derive from filename ext (handler change — out of scope, noted) | commits same string | low |
| contentEncoding | select, default utf8 | Technical but defaulted + honest | base64 binary | safe-default | — | `advanced: true` (default keeps readiness satisfied) | utf8 | untouched | low |
| filename, content, parentFolderId | OK | folder picker verified; content textarea is the documented direct-content design (25 MB, base64 via encoding field) | — | OK | — | — | — | — | — |

### google-drive:create_folder (action) — Create Folder
No findings — fields OK as-is: name + parent folder picker. Clean.

### google-drive:list_files (action) — List Files
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| pageToken | text, normal path | cursor plumbing | advanced-user-control | `advanced: true` | untouched | none |
| folderId, pageSize, includeTrashed | OK | picker verified, default 100, plain toggle | OK | — | — | — |

### google-drive:move_file (action) — Move File
No findings — fields OK as-is: file picker + folder picker (SWEEP-2 verified), manual-id fallback, `{{trigger.fileId}}` guidance.

### google-drive:delete_file (action) — Delete File
No findings — fields OK as-is: file picker; `permanent` REQUIRED boolean with explicit trash-vs-destroy outcome copy (Q11-correct for a destructive switch).

### google-drive:get_file_metadata (action) — Get File Metadata
No findings — fields OK as-is: single file picker, read-only framing.

### google-drive:search_files (action) — Search Files
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| pageToken | text, normal path | cursor plumbing | advanced-user-control | `advanced: true` | untouched | none |
| query, folderId, pageSize | OK | "title only, not contents" honesty is good | OK | — | — | — |

### google-drive:file_changed (trigger) — File Changed
| Field | Current | Why | Class | Proposed Setup | Proposed Advanced | Runtime | Risk |
|---|---|---|---|---|---|---|---|
| folderId "Restrict To Folder" | combobox, normal path | Two folder pickers on one trigger confuses a first-time user; this one is a post-fetch DIRECT-child filter — power-user refinement | watch-all-filter-one flows | advanced-user-control | desc: "Only run when the changed file sits directly inside this folder. Leave empty to run for every change in the watched location." | `advanced: true` | untouched | low |
| fileId "Folder To Watch" | OK | root default + honest push-model wording (field NAME fileId is internal but label is right; never rename keys) | provider-resource-selection | — | — | — | — |

---

## google-analytics (6 nodes)

### google-analytics:run_report (action) — Run Report
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| startDate / endDate | date type, always visible, "Only for a Custom range" | Should hide unless Custom picked (infra now exists) | conditional-option | `visibleWhen: {field: dateRange, valueIn: ["custom"]}` on both | untouched (schema superRefine already enforces custom-requires-dates) | none |
| dateRange | select, NO description | Missing outcome copy | core-user-decision | desc: "The period the report covers. Pick Custom to set exact dates." | untouched | none |
| accountId, propertyId, metrics, dimensions, limit | OK | account→property cascade verified (temporal adoption per closeout SWEEP), curated metric/dimension selects | OK | — | — | — |

### google-analytics:run_pivot_report (action) — Run Pivot Report
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| startDate / endDate | **type: text** with ISO placeholder | Sibling run_report already uses `date`; identical `z.string()` schema — missed in the temporal sweep | derived-value→core | convert `text`→`date`; add `visibleWhen: {field: dateRange, valueIn: ["custom"]}` | date field commits same YYYY-MM-DD string | none |
| dateRange, metrics | selects, NO descriptions | Missing copy (run_report's metrics has one) | core-user-decision | dateRange: as run_report; metrics: "One or more GA4 metrics to report." | untouched | none |
| limit | number, no desc | minor | safe-default | desc: "Maximum rows to return." | untouched | none |
| accountId, propertyId, dimensions, pivotDimensions | OK | cascade + curated selects | OK | — | — | — |

### google-analytics:get_realtime_data (action) — Get Realtime Data
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| limit | number, no desc | minor | safe-default | desc: "Maximum rows to return." | untouched | none |
| accountId, propertyId, metrics, dimensions | OK | realtime metric/dimension curated selects | OK | — | — | — |

### google-analytics:find_conversion (action) — Find Conversion
No findings — fields OK as-is: full account→property→conversion_events picker cascade; a nontechnical user can finish with three picks.

### google-analytics:send_event (action) — Send Event
| Field | Current | Why | Class | Proposed Setup | Proposed Advanced | Runtime | Risk |
|---|---|---|---|---|---|---|---|
| apiSecret | required text, sensitivity: secret | Inherent to Measurement Protocol (created in GA Admin); wording already walks the user there. Cannot be derived — GA offers no API to read MP secrets | required | core-user-decision | keep; ensure secret-style masking rendering | — | untouched | — |
| clientId | required text | Technical (GA4 client_id) but genuinely required and usually wired from upstream ({{...}}) | attribution | upstream-data-mapping | desc add: "Usually inserted from upstream data ({{...}}); identifies the visitor the event belongs to." | — | untouched | none |
| userId | optional text | cross-device attribution — power-user | yes | advanced-user-control | — | `advanced: true` | untouched | none |
| accountId, propertyId, measurementId, eventName, eventParams | OK | data-stream picker resolves the G-XXXX id — excellent; keyvalue for params | OK | — | — | — | — |

### google-analytics:create_conversion_event (action) — Create Conversion Event
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| customEvent | boolean "Mark this as a custom (non-default) event" | Implementation-flavored; user can't tell outcome | advanced-user-control | `advanced: true`; desc: "Turn on if this event is one you defined yourself rather than a built-in GA4 event." | untouched | low |
| countingMethod | select, "How conversions are counted." | OK-ish; option labels carry the meaning | core-user-decision | — | — | — |
| accountId, propertyId, eventName | OK | cascade + plain example | OK | — | — | — |

---

## facebook (10 nodes)

### facebook:create_post (action) — Create Post
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| scheduledPublishTime | **type: text**, ISO placeholder | Normal user must hand-type ISO-8601; `datetime-utc` exists and schema (`z.string().datetime({offset:true})`) accepts its `…Z` output | core-user-decision | convert `text`→`datetime-utc`; desc: "Publish at this future time (UTC) instead of immediately. Leave empty to publish now." | commits valid ISO string | none (existing offset values still validate; renderer preserves non-matching strings verbatim) |
| pageId, message, link | OK | Page picker, plain copy | OK | — | — | — |

### facebook:update_post (action) — Update Post
No findings — fields OK as-is: Page→Post picker cascade; isPublished optional toggle with clear scheduled-draft use case.

### facebook:comment_on_post (action) — Comment on Post
No findings — fields OK as-is: cascade + plain fields; attachmentUrl has example placeholder.

### facebook:upload_photo (action) — Upload Photo
| Field | Current | Why | Class | Proposed | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|
| published | optional boolean, meta has NO default; schema `.default(true)` | **Silent recipient-visible default**: omitting it posts to the Page timeline. Q11-adjacent | safe-default (make explicit) | add `defaultValue: true` to meta so the UI shows the real behavior | true (matches schema — no behavior change) | untouched | none |
| pageId, photo, caption | OK | FileRef file field with token guidance | OK | — | — | — | — |

### facebook:upload_video (action) — Upload Video
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| published | same as upload_photo | same silent default(true) | safe-default | `defaultValue: true` in meta | untouched | none |
| pageId, video, title, description | OK | — | OK | — | — | — |

### facebook:get_page_insights (action) — Get Page Insights
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| metric | **required free text**, comma-separated Graph metric names | HIGH: normal user cannot know valid metric names; deprecation minefield is documented in the desc itself ("#100 invalid-metric error"). Meta comment says catalog is "large and version-dependent" — but a curated static list of currently-valid common metrics + manual entry solves 90% | structured-composition | convert `text`→`combobox` with static `options` (~8 currently-valid metrics: page_post_engagements, page_views_total, page_daily_follows, page_video_views…), `allowManualEntry: true`; desc: "The Page statistics to read. Pick one, or type comma-separated metric names for several." | combobox commits the same string; typed CSV still valid | low (single-pick UI nudges away from CSV; manual entry keeps parity) |
| since / until | text, ISO placeholder | hand-typed ISO; schema accepts `…Z` | core-user-decision | convert `text`→`datetime-utc` both | valid shape preserved | none |
| pageId, period | OK | picker + select | OK | — | — | — |

### facebook:send_message (action) — Send Message
No findings — fields OK as-is: Page→Conversation picker (marked recipient-sensitive), plain message textarea. Nontechnical-complete.

### facebook:delete_post (action) — Delete Post
No findings — fields OK as-is: cascade pickers; permanence warned in node + field copy; riskLevel high set.

### facebook:new_post (trigger) — New Post
No findings — fields OK as-is: single Page picker. (Owner webhook setup note lives in node description, correctly not a field.)

### facebook:new_comment (trigger) — New Comment
No findings — fields OK as-is: Page picker + optional post filter with "All posts" empty state — model conditional design.

---

## discord (7 nodes)

### discord:send_message (action) — Send Message
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| guildId | desc cites "Picker sourced from `discord:guilds`" | Resolver id is internal implementation detail in setup copy | provider-resource-selection | desc: "Server to post in. Only servers where the ChainReact bot has been added appear." | untouched | none |
| channelId | desc cites resolver + re-fetch mechanics | same | provider-resource-selection | desc: "Text channel to post in. Pick a server first. Voice and thread channels can't receive bot posts." | untouched | none |
| message | OK | markdown/mention syntax guidance is genuinely useful here | core-user-decision | — | — | — |

### discord:edit_message (action) — Edit Message
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| messageId | desc cites "403 + code 50005" | HTTP jargon in setup copy | provider-resource-selection | desc: "Message to edit. Only messages the ChainReact bot itself posted can be edited — Discord blocks editing anyone else's." | untouched | none |
| guildId, channelId, content | OK (minus resolver-id copy, covered systemically) | full picker cascade incl. bot-authored message picker — excellent | OK | — | — | — |

### discord:delete_message (action) — Delete Message(s)
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| messageIds | string-array, no picker; desc claims field type "does not support a picker" | **Stale**: contract now allows `optionsSource` on string-array (actionMeta.ts:592) and `discord:messages` resolver (deps channelId) is registered | provider-resource-selection | add `optionsSource: "discord:messages"`, `dependsOn: "channelId"`, `allowManualEntry: true`; desc: "Specific messages to delete. Pick from the channel's recent messages or paste ids. When set, the other filters are ignored." | still commits string[] of ids | low |
| userIds | same stale limitation | `discord:members` resolver registered | provider-resource-selection | add `optionsSource: "discord:members"`, `dependsOn: "guildId"`, `allowManualEntry: true`; desc: "Only delete messages from these members (checks the last 100 messages). Combines with keywords." | string[] preserved | low |
| keywordMatchType | select w/ default partial, always visible | Only meaningful when keywords set | conditional-option | `visibleWhen: {field: keywords, truthy}`; keep bold default warning (widest match radius on a destructive action) | untouched | none |
| keywords | OK | plain, honest AND/OR semantics | core-user-decision | — | — | — |
| guildId, channelId | OK (resolver-id copy systemic) | riskLevel high + empty-filters-safe default is good defensive design | OK | — | — | — |

### discord:fetch_messages (action) — Fetch Messages
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| filterAuthor | combobox, always visible, "Only used when Filter is `By specific author`" | Textual gating where `visibleWhen` now exists | conditional-option | `visibleWhen: {field: filterType, valueIn: ["author"]}` (confirm exact option value in meta) | untouched | none |
| filterContent | text, always visible | same | conditional-option | `visibleWhen: {field: filterType, valueIn: ["content"]}` | untouched | none |
| caseSensitive | boolean, always visible | same | conditional-option | `visibleWhen: {field: filterType, valueIn: ["content"]}` | untouched | none |
| limit | desc: "over-fetches up to 3×" | wire mechanics in setup copy | safe-default | desc: "How many matching messages to return (up to 100). Default 20." | untouched | none |
| guildId, channelId, sortOrder, filterType | OK | defaults surfaced properly | OK | — | — | — |

### discord:assign_role (action) — Assign Role
No findings beyond systemic copy — fields OK as-is: full guild→member/role picker cascade; hierarchy + managed-role exclusions honestly explained; elevated-permission warning present. (Resolver-id mentions in descs covered by systemic change list.)

### discord:slash_command (trigger) — Slash Command Used
No findings — fields OK as-is: commandName has exact format rules + rename/cleanup lifecycle explained; commandDescription explains WHY it's required. `applications.commands` scope note is legitimately needed setup info.

### discord:new_message (trigger) — New Message Posted
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| contentFilter | OK but desc is 60+ words w/ intent jargon | MESSAGE_CONTENT intent is real owner setup info but belongs in node desc (where it already is) | conditional-option | trim: "Only run when the message contains any of these words (case-insensitive). Leave empty to run for every message." | untouched | none |
| guildId, channelId, authorFilter | OK (resolver-id copy systemic) | member picker for author filter — good | OK | — | — | — |

---

## dropbox (12 nodes)

### dropbox:upload_file (action) — Upload File
| Field | Current | Why | Class | Proposed | Default | Runtime | Risk |
|---|---|---|---|---|---|---|---|
| mode | select, meta no default; schema `.default("add")`; desc says "Defaults to Add" | Default exists but invisible to readiness/UI | safe-default | add `defaultValue: "add"` to meta | add (matches schema) | untouched | none |
| autorename | boolean, schema `.default(false)` | same | safe-default | add `defaultValue: false` | false | untouched | none |
| file, path, filename | OK | FileRef + folder picker + name-override with honest placeholder | OK | — | — | — | — |

### dropbox:download_file (action) — Download File
No findings — fields OK as-is: folderPath→files picker cascade with typed-path fallback; root-level caveat honestly stated. (folderPath label polish = systemic LOW.)

### dropbox:list_folder (action) — List Folder
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| cursor | text, normal path | loop plumbing; desc even warns other fields get ignored when set | advanced-user-control | `advanced: true` | untouched | none |
| path, recursive, limit | OK | Root empty-state, plain toggle | OK | — | — | — |

### dropbox:search_files (action) — Search Files
No findings — fields OK as-is: query + optional folder scope ("Everywhere" placeholder) + bounded maxResults.

### dropbox:get_file_metadata (action) — Get File Metadata
No findings — fields OK as-is: standard folder→file cascade.

### dropbox:create_folder (action) — Create Folder
No findings — fields OK as-is: full-path text is correct here (creating something that doesn't exist yet — nothing to pick); node desc explains exactly that. autorename could surface `defaultValue: false` (LOW, grouped in change list).

### dropbox:move_file (action) — Move File
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| toPath | required text "full destination path, including the new name" | Works, but compound (folder + rename in one string) is the hardest field on the node; splitting would change runtime shape — NOT proposed | core-user-decision | keep; placeholder already models it | untouched | — |
| folderPath, fromPath, autorename | OK | cascade + fallback | OK | — | — | — |

### dropbox:copy_file (action) — Copy File
No findings — same shape as move_file; same toPath note applies; fields OK as-is.

### dropbox:create_shared_link (action) — Create Shared Link
No findings — fields OK as-is: cascade; link-reuse + exposure caveat in node desc where it belongs.

### dropbox:get_temporary_link (action) — Get Temporary Link
No findings — fields OK as-is: cascade; 4-hour expiry + sensitivity framing in node desc.

### dropbox:delete_file (action) — Delete File
No findings — fields OK as-is: cascade + "confirm it carefully" copy; trash-vs-permanent honesty in node desc; riskLevel high.

### dropbox:new_file (trigger) — New File
No findings — fields OK as-is: folder picker w/ Root default behavior + recursive toggle. Webhook-URL owner setup correctly lives in node desc, not a field.

---

## github (7 nodes)

### github:create_issue (action) — Create Issue
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| labels | **type: text** "comma-separated"; schema `z.array(z.string())` | **RUNTIME-BROKEN**: no CSV split exists anywhere in submit/execution path (verified by grep; meta comment references a v1 renderer split that was never built). Typed value commits a string → zod rejects at run | unsupported-raw-config | convert `text`→`string-array` (chips commit `string[]`, exactly what schema wants); desc: "Labels to put on the issue. Press Enter after each one."; optional later: new-resolver `github:labels` (GET /repos/{o}/{r}/labels, existing repo scope) per-chip | FIXES shape to match schema | configs saved as comma-string were already broken; string-array renderer must tolerate legacy string value (falls back gracefully) |
| assignees | same | same break | unsupported-raw-config | convert `text`→`string-array`; desc: "GitHub usernames to assign. Press Enter after each one." | fixes shape | same |
| milestone | number "numeric milestone id (NOT title)" | Provider-internal id, no picker; optional so not blocking | targeting sprints | provider-resource-selection | new-resolver `github:milestones` (GET /repos/{o}/{r}/milestones, existing scope) → combobox `dependsOn: repository`, `allowManualEntry: true`; value stays the number-as-selected | combobox must commit number (or schema gains coerce — flag: check before build) | medium (type coercion detail) |
| repository, title, body | OK | repos picker verified (`github:repos`), owner/repo manual fallback | OK | — | — | — |

### github:create_repository (action) — Create Repository
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| private | optional boolean, no default; schema deliberately default-free (GitHub defaults public) | Visibility-critical omission risk: node desc warns but field itself lets a novice skip it and publish publicly. Q11 spirit: behavior-switching + world-visible | core-user-decision | make `required: true` (meta only; schema stays optional) — forces explicit choice, exactly like gcal sendNotifications | untouched (still boolean) | medium: existing saved configs w/o `private` flip to "needs setup" in readiness |
| gitignore_template | text, case-sensitive template names | Provider-internal catalog; typo = API error | scaffolding | provider-resource-selection | combobox, static options (Node, Python, Go, Java, Rails…), `allowManualEntry: true` | same string | none |
| license_template | text, SPDX keywords | same | scaffolding | combobox, static options (mit, apache-2.0, gpl-3.0, bsd-3-clause…), `allowManualEntry: true` | same string | none |
| name, description, auto_init, homepage | OK | format rules on name are needed (GitHub enforces) | OK | — | — | — |

### github:create_pull_request (action) — Create Pull Request
| Field | Current | Why | Class | Proposed Setup | Runtime | Risk |
|---|---|---|---|---|---|---|
| head | required text | Branch names typo-prone; a picker is possible | cross-repo `fork:branch` notation | provider-resource-selection | new-resolver `github:branches` (GET /repos/{o}/{r}/branches, existing scope) → combobox `dependsOn: repository`, `allowManualEntry: true` (manual entry keeps fork notation) | same string | low |
| base | optional text, blank = default branch | same; auto-default already good | targeting non-default | provider-resource-selection | same `github:branches` combobox, keep blank-=-default behavior | same string | low |
| repository, title, body, draft | OK | — | OK | — | — | — |

### github:create_branch (action) — Create Branch
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| sourceBranch | optional text | same as PR base | provider-resource-selection | `github:branches` combobox (shared new-resolver), `allowManualEntry: true` | same string | low |
| repository, branchName | OK | branchName format rules are GitHub's real constraints — keep | OK | — | — | — |

### github:create_gist (action) — Create Gist
No findings — fields OK as-is: `isPublic` REQUIRED boolean with world-readable/search-indexed consequence copy — the Q11 model done right. filename/content/description plain.

### github:add_comment (action) — Add Comment
No findings — fields OK as-is: issueNumber is normally wired from upstream (trigger/create_issue outputs expose issueNumber); "the integer shown in the URL" makes manual entry findable. A `github:issues` picker is possible but low value vs. upstream mapping.

### github:new_commit (trigger) — New Commit
| Field | Current | Why | Class | Proposed | Runtime | Risk |
|---|---|---|---|---|---|---|
| branch | optional text, blank = all pushes | fine; would benefit from the same `github:branches` picker once built | provider-resource-selection | combobox `github:branches` + `allowManualEntry` (piggyback on new-resolver) | same string | low |
| repository | OK | picker + manual | OK | — | — | — |

---

## Change list

### HIGH (normal user blocked/misled or runtime-broken)
1. `integrations/github/actions/createIssue.meta.ts` — `labels`: `type: "text"` → `type: "string-array"`; new desc: "Labels to put on the issue. Press Enter after each one." (Schema already expects `string[]`; today's text field commits a string that fails validation — runtime-broken. Also delete the stale "renderer does the CSV split" meta comment.)
2. `integrations/github/actions/createIssue.meta.ts` — `assignees`: `type: "text"` → `type: "string-array"`; new desc: "GitHub usernames to assign to the issue. Press Enter after each one." (Same runtime break.)
3. `integrations/facebook/actions/getPageInsights.meta.ts` — `metric`: `type: "text"` → `type: "combobox"` with static `options` of currently-valid metrics (page_post_engagements, page_views_total, page_daily_follows, page_video_views, …) + `allowManualEntry: true`; new desc: "The Page statistic to read. Pick a metric, or type comma-separated metric names to read several at once." (Required field demanding provider-internal enum names with an active deprecation minefield.)

### MEDIUM
4. `integrations/facebook/actions/createPost.meta.ts` — `scheduledPublishTime`: `type: "text"` → `"datetime-utc"`; desc: "Publish at this future time (UTC) instead of immediately. Leave empty to publish now." (Schema accepts the `…Z` string verbatim.)
5. `integrations/facebook/actions/getPageInsights.meta.ts` — `since` and `until`: `type: "text"` → `"datetime-utc"`; descs: "Start of the reporting window (UTC). Leave empty for the default range." / "End of the reporting window (UTC)."
6. `integrations/google-analytics/actions/runPivotReport.meta.ts` — `startDate`/`endDate`: `type: "text"` → `"date"` (parity with runReport, same schema) + `visibleWhen: {field: "dateRange", valueIn: ["custom"]}` on both.
7. `integrations/google-analytics/actions/runReport.meta.ts` — `startDate`/`endDate`: add `visibleWhen: {field: "dateRange", valueIn: ["custom"]}`.
8. `integrations/discord/actions/deleteMessage.meta.ts` — `messageIds`: add `optionsSource: "discord:messages"`, `dependsOn: "channelId"`, `allowManualEntry: true`; new desc: "Specific messages to delete. Pick from the channel's recent messages or paste message ids. When set, the author/keyword filters are ignored." Same file `userIds`: add `optionsSource: "discord:members"`, `dependsOn: "guildId"`, `allowManualEntry: true`; new desc: "Only delete messages posted by these members (checks the channel's last 100 messages). Combines with keywords." (Contract + resolvers already exist; the in-file "not supported" comment is stale — remove it.)
9. `integrations/discord/actions/fetchMessages.meta.ts` — `filterAuthor`: add `visibleWhen: {field: "filterType", valueIn: ["author"]}`; `filterContent` + `caseSensitive`: add `visibleWhen: {field: "filterType", valueIn: ["content"]}` (confirm option values in meta before applying).
10. `integrations/github/actions/createRepository.meta.ts` — `private`: `required: false` → `required: true` (explicit public/private choice; Q11 spirit — world-visibility switch must not ride GitHub's silent public default). Compat: pre-existing configs without it become "needs setup" — acceptable for a visibility decision, but flag to Marcus.
11. `integrations/github/actions/createRepository.meta.ts` — `gitignore_template` / `license_template`: `text` → `combobox` with static options (Node, Python, Go, Java, Rails, … / mit, apache-2.0, gpl-3.0, bsd-3-clause, unlicense) + `allowManualEntry: true`.
12. NEW-RESOLVER `github:branches` (GET /repos/{owner}/{repo}/branches; existing repo scope; dependsOn repository) — then: `createPullRequest.meta.ts` `head`+`base`, `createBranch.meta.ts` `sourceBranch`, `newCommit` trigger `branch` → `combobox` + `allowManualEntry: true`. Values stay plain branch-name strings.
13. NEW-RESOLVER `github:milestones` (GET /repos/{owner}/{repo}/milestones; existing scope) — `createIssue.meta.ts` `milestone` → combobox `dependsOn: repository`. CAUTION: schema wants `z.number()`; verify combobox numeric commit path before building.
14. `integrations/google-drive/actions/uploadFile.meta.ts` — `mimeType`: `text` → `combobox`, static options of ~12 common MIME types, `allowManualEntry: true`; desc: "What kind of file this is. Pick a common type, or type any MIME type." Also `contentEncoding`: add `advanced: true` (default utf8 keeps readiness satisfied).
15. `integrations/google-drive/triggers/…fileChanged` meta — `folderId` ("Restrict To Folder"): add `advanced: true`; desc: "Only run when the changed file sits directly inside this folder. Leave empty to run for every change in the watched location."
16. Pagination plumbing → `advanced: true`: `googleCalendar listEvents.meta` `pageToken`; `google-drive listFiles.meta` `pageToken`; `google-drive searchFiles.meta` `pageToken`; `dropbox listFolder.meta` `cursor`.
17. `integrations/facebook/actions/uploadPhoto.meta.ts` + `uploadVideo.meta.ts` — `published`: add `defaultValue: true` (surfaces the schema's silent `.default(true)` — recipient-visible behavior must be explicit in the UI).
18. Discord copy sweep (send_message, edit_message, delete_message, assign_role, new_message, fetch_messages metas): remove resolver ids (`discord:guilds` etc.), HTTP codes, and wire mechanics from setup-field descriptions; replacement strings per node tables above (e.g. guildId: "Server to post in. Only servers where the ChainReact bot has been added appear."; edit_message messageId: "Message to edit. Only messages the ChainReact bot itself posted can be edited — Discord blocks editing anyone else's."). ~12 fields.
19. `integrations/google-calendar/actions/createEvent.meta.ts` — `startDateTime`/`endDateTime`: `visibleWhen: {field: "allDay", valueIn: [false]}`; `startDate`/`endDate`: `visibleWhen: {field: "allDay", valueIn: [true]}`. Verify falsy/unset semantics render the timed pair by default before applying.
20. `integrations/google-analytics/actions/sendEvent.meta.ts` — `userId`: add `advanced: true`. `runPivotReport.meta.ts`/`runReport.meta.ts` — add missing `dateRange` desc: "The period the report covers. Pick Custom to set exact dates."

### LOW
21. `googleCalendar createEvent.meta` — `colorId` desc → "Event color shown on the calendar."
22. `dropbox uploadFile.meta` — `mode`: add `defaultValue: "add"`; `autorename`: add `defaultValue: false` (mirrors schema; also `createFolder`/`moveFile`/`copyFile` `autorename`).
23. `google-analytics runPivotReport.meta` — `metrics` desc: "One or more GA4 metrics to report."; `limit` desc: "Maximum rows to return." (also `getRealtimeData` `limit`).
24. `google-analytics createConversionEvent.meta` — `customEvent`: `advanced: true` + desc "Turn on if this event is one you defined yourself rather than a built-in GA4 event."
25. Dropbox `folderPath` label polish across 6 nodes: "Folder (for file picker)" → "Browse folder (optional)".
26. `discord newMessage` trigger — `contentFilter` desc trim: "Only run when the message contains any of these words (case-insensitive). Leave empty to run for every message."
27. `discord fetchMessages` — `limit` desc: "How many matching messages to return (up to 100). Default 20."

## Counts

- **Nodes audited:** 56 (google-calendar 6, google-drive 8, google-analytics 6, facebook 10, discord 7, dropbox 12, github 7) — every node in the slice appears above.
- **Fields audited:** 243.
- **Fields OK as-is:** ~195 (incl. all verified gcal/gdrive modernization fields).
- **Findings:** HIGH 3 (2 runtime-broken + 1 required provider-enum free-text) · MEDIUM 30 (across 17 change-list entries: temporal conversions 5, visibleWhen 11, stale-picker 2, advanced moves 8, required/private 1, static-option comboboxes 3+2, copy sweep ~12 grouped) · LOW ~15 (polish/desc/defaults).
- **New resolvers proposed:** `github:branches`, `github:milestones` (both real GitHub REST endpoints on existing repo scope); optional future `github:labels`.
- **Verified, no re-proposal:** Google Calendar/Drive picker + temporal modernization confirmed live in metas (calendars picker ×6 surfaces, files/folders pickers, datetime/timezone/datetime-utc/location adoption).
