# 4.CONFIG-FIELD-UX-MODERNIZATION — Config Menu / Field UX Modernization Audit

**Type:** Planning / audit only. **No source, migrations, tests, UI, or behavior changes in
this slice. Nothing pushed.**
**Date:** 2026-06-22
**Branch:** `v2-main`
**Parent:** builder-shell launch polish is closed out in
[builder-shell-launch-polish-closeout.md](./builder-shell-launch-polish-closeout.md) §7 named
this arc as next.

**Source of truth (verified current state — files actually read for this audit):**
[contracts/actionMeta.ts](../../../contracts/actionMeta.ts) (FieldMeta + FieldType contract) ·
[config-modal/fields/_registry.ts](../../../features/workflow-builder/config-modal/fields/_registry.ts) (renderer registry) ·
[config-modal/fields/types.ts](../../../features/workflow-builder/config-modal/fields/types.ts) (renderer props + cascade) ·
[services/options/resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) (live option resolution) ·
[services/options/_registry.ts](../../../services/options/_registry.ts) (resolver coverage) ·
[integrations/google-calendar/actions/createEvent.meta.ts](../../../integrations/google-calendar/actions/createEvent.meta.ts) ·
[integrations/trello/actions/createCard.meta.ts](../../../integrations/trello/actions/createCard.meta.ts) ·
[integrations/slack/actions/sendChannelMessage.meta.ts](../../../integrations/slack/actions/sendChannelMessage.meta.ts) ·
plus grep sweeps across `integrations/**/*.meta.ts`.

> **This document implements nothing.** It is an audit + phased plan. Every "today it works
> like X" is tied to a file above; every "we should do Y" is labeled a recommendation. No
> backend endpoint, migration, or live provider call was made. Boundaries from the closeout
> doc (no push; shell unchanged; no secrets rendered) remain intact.

---

## 1. Executive summary

ChainReact's config-field system is **more mature than the arc framing assumed**. Searchable,
credential-aware, cascading resource selectors already exist and are widely deployed; variable
insertion already works on text fields; sensitivity classification already exists. The
modernization arc is therefore **mostly coverage + two genuinely new control families**, not a
ground-up rebuild.

**What already exists (verified):**
- A `combobox` field type backed by `optionsSource` tokens (e.g. `slack:channels`,
  `trello:lists`, `airtable:tables`) resolved through one credential-policy-aware path
  ([resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts)) with **50+
  registered resolvers** ([_registry.ts](../../../services/options/_registry.ts)).
- Multi-parent cascades (`dependsOn: ["baseId", "tableIdOrName"]`), value-vs-label separation
  (resolvers return `{value, label}` — value is the stored ID/name), and a free-text paste
  fallback pattern (callers keep "paste an id" placeholders).
- Variable insertion (`{{node.field}}`) on text-like fields via `VariablePickerButton` +
  `_insertAtCursor.ts`, with output metadata + a "Sensitive" redaction chip.

**The real gaps:**
1. **No date / time / datetime / timezone control family at all.** `FieldTypeSchema`
   ([actionMeta.ts:67](../../../contracts/actionMeta.ts)) has 12 types; none is temporal. Every
   date/time field across Calendar, Outlook Calendar, Trello, HubSpot meetings, Mailchimp, Excel
   is a raw `text` input with a format instruction (e.g. Google Calendar `startDateTime` →
   `type: "text"`, placeholder `2026-06-01T09:00:00`). **Highest-leverage, fully client-side.**
2. **No location/address control.** Calendar `location` is free `text`. Google Places is a
   feasibility-gated decision (key/billing/privacy) — audit only, do not build (§6, §8).
3. **Coverage gaps where a resolver already exists but the meta wasn't wired** — most notably
   **Slack trigger** channel fields are still `type: "text"` even though `slack:channels` is
   registered and used by Slack *actions*. These are quick wins (no new backend).
4. **A few resolver gaps** (Google Calendar `calendarId` is scope-blocked; no Slack/Google/MS
   *contact-or-user* resolver) — medium, needs scope/API/PII review.
5. **Small enum polish** (e.g. Calendar `colorId` "1–11" as text → static `select`).

**Top recommendation:** start with the **date/time/datetime field-type family** (client-only,
no backend, no migration, no provider call) using Google Calendar create/update event as the
first adopter, then sweep the temporal fields provider-by-provider. Run the Slack-trigger
combobox wiring as an even-smaller warm-up quick win.

---

## 2. Current architecture map (verified)

| Layer | File | What it does |
|---|---|---|
| Field type enum | [actionMeta.ts:67-81](../../../contracts/actionMeta.ts) | `FieldTypeSchema` = `text, textarea, select, combobox, keyvalue, number, boolean, file, cron, router-routes, string-array, file-array`. **No temporal / location type.** |
| Field metadata | [actionMeta.ts:155-332](../../../contracts/actionMeta.ts) | `FieldMeta`: `type`, `optionsSource`, `options`, `multiple`, `dependsOn` (string \| string[]), `sensitivity` (`secret\|connection\|recipient`), numeric bounds, caps. `.strict()` — **no `hidden`/`visibleWhen`, so no conditional field visibility exists.** |
| Renderer registry | [fields/_registry.ts](../../../features/workflow-builder/config-modal/fields/_registry.ts) | One renderer per `FieldType`, exhaustive by TS construction. Adding a type forces a renderer. |
| Renderer props | [fields/types.ts](../../../features/workflow-builder/config-modal/fields/types.ts) | Controlled `value/onChange/error`, plus cascade plumbing: `deps`, `enabled` (gates picker until parents set), `parentLabel` ("Select Base, Table first"). |
| Async selector | `fields/ComboboxField.tsx` (registry entry) | Searchable dropdown; reads `optionsSource` via `useOptionsSource`. Static lists use `options[]` instead. |
| Options resolution | [services/options/resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) | Single authoritative path: source → resolver → V2 credential-sharing policy → sanitized `{items:[{value,label}], hasMore}`. Never leaks token/scope/connectedBy. Shared by `GET /api/options/[source]` and the diagnostics route. |
| Resolver registry | [services/options/_registry.ts](../../../services/options/_registry.ts) | 50+ resolvers across Slack, Google (Sheets/Docs/Drive/Calendar-blocked/Analytics), Microsoft (Excel/OneDrive/OneNote/Teams/Outlook), Airtable, Trello, Notion, HubSpot, Mailchimp, Discord, Monday, Dropbox, Facebook, GitHub, Gmail. Server-only. |
| Variable insertion | `fields/VariablePickerButton.tsx`, `VariablePickerPopover.tsx`, `_insertAtCursor.ts`, `_variableValidator.ts` | Insert `{{node.output}}` at cursor; wired into `TextField`, `TextareaField`, `RouterRoutesField`, `FileField`, `FileRefArrayField` (verified via grep). **Not** on combobox/number/string-array. |

**Stored-value convention (verified):** resolvers return `value = the ID/name the runtime
schema expects`, `label = human name`. The builder stores `value`; `label` is display only. So
"choose by name, store the ID" is already the established contract — new selectors must follow
it. Free-text paste fallback (power-user manual ID) is already idiomatic (placeholders like
"…or paste a list id").

---

## 3. Field UX categories

| # | Category | Exists today? | New work |
|---|---|---|---|
| A | Searchable provider-resource selector | **Yes** (`combobox` + `optionsSource`) | Coverage only — wire unwired metas; add a few resolvers |
| B | Name-or-ID selector (searchable + manual paste) | **Yes** (combobox + paste placeholder) | Formalize a consistent "paste exact ID" affordance |
| C | Date picker | **No** | New `date` type + renderer |
| D | Time picker | **No** | New `time` type + renderer |
| E | Datetime + timezone | **No** | New `datetime` type + renderer; timezone select; tz-aware display |
| F | Location / address | **No** | New `location` type; Google Places feasibility-gated (§6) |
| G | Contact / user selector | **Partial** (some `*:members`/`*:users` resolvers exist; many recipients are text/`string-array`) | New per-provider contact resolvers + PII review |
| H | File / folder selector | **Yes** (Drive/OneDrive/Dropbox folders+files resolvers; `file`/`file-array` types) | Coverage only |
| I | Enum / radio / switch polish | **Yes** (`select`, `boolean`) | Convert a few text-as-enum fields (e.g. `colorId`) to `select` |
| J | Text / textarea variable insertion | **Yes** (5 renderers) | Decide + extend parity to other text-like fields |
| K | Secret / masked fields | **Partial** (`sensitivity: "secret"` metadata + apply-safety) | No dedicated masked renderer — recommend a `password`-style display for secret-typed inputs |

---

## 4. Provider / action candidate matrix (launch-impact first)

Legend — **Current**: control rendered today. **Desired**: target control. **Resolver?**:
does an option source already exist. **Store**: value persisted. **Manual ID?**: keep paste
fallback. **Risk**: implementation risk. **Pri**: P0 launch / P1 / P2.

### Slack
| Action/Trigger | Field | Current | Desired | Resolver? | New backend? | Store | Manual ID? | Risk | Pri |
|---|---|---|---|---|---|---|---|---|---|
| `send_channel_message`, `delete_message`, `list_scheduled_messages` | `channel` | **combobox** (`slack:channels`) ✅ | (already good) | yes | no | channel id | yes | — | done |
| Triggers: `new_message_channel`, `reaction_added/removed`, `member_joined/left`, `file_uploaded`, `new_message_private_channel`, `new_group_direct_message` | `channelId`/`channel` | **text** ❌ | combobox | **yes** (`slack:channels`) | **no** | channel id | yes | Low | **P0** |
| DM / mention recipients | user fields | text | user selector | **no** (`slack:users` missing) | yes (new resolver) | user id | yes | Med | P1 |

> Verified: `sendChannelMessage.meta.ts` uses `type: "combobox", optionsSource:"slack:channels"`;
> the trigger metas above use `type: "text"` for the channel (grep of `integrations/slack/**`).
> The resolver is registered — **wiring the triggers is a no-backend quick win.**

### Google Calendar (`create_event`, `update_event` — verified createEvent.meta.ts)
| Field | Current | Desired | Resolver? | New backend? | Store | Manual ID? | Risk | Pri |
|---|---|---|---|---|---|---|---|---|
| `calendarId` | text (default "primary") | calendar picker | **no — scope-blocked** (see google-calendar-metadata-coverage-plan §3) | yes (resolver + scope) | calendar id | yes | Med | P1 |
| `startDateTime` / `endDateTime` | text (ISO 8601) | **datetime + tz** | n/a | **no** | ISO string | yes | Low | **P0** |
| `startDate` / `endDate` | text (YYYY-MM-DD) | **date** | n/a | no | date string | yes | Low | **P0** |
| `timezone` | text (IANA) | **timezone select** | n/a (static IANA list) | no | IANA id | yes | Low | **P0** |
| `location` | text | location autocomplete | n/a (Google Places — §6) | **feasibility-gated** | TBD (§6) | yes | High | P2 |
| `attendees` | `string-array` (chips) | contact selector (optional) | no (no Google contacts resolver) | yes | emails | yes | Med | P2 |
| `colorId` | text ("1–11") | `select` (static) | n/a | no | id | n/a | Low | P1 |
| `allDay` toggling which date fields apply | boolean + 4 separate date fields | conditional visibility | **needs `visibleWhen` (does not exist)** | no | — | — | Med | P1 |

### Microsoft Outlook Calendar (`create_event`, `update_event`, `list_events`, trigger)
| Field | Current | Desired | Resolver? | Store | Risk | Pri |
|---|---|---|---|---|---|---|
| start/end datetimes | text | datetime + tz | n/a | ISO | Low | **P0** |
| `calendarId` (optional) | text/combobox | calendar picker | **yes** (`microsoft-outlook-calendar:calendars`) | id | Low | P1 |
| location | text | location (§6) | n/a | TBD | High | P2 |

### Gmail / Outlook (mail)
| Field | Current | Desired | Resolver? | Store | Risk | Pri |
|---|---|---|---|---|---|---|
| `to`/`cc`/`bcc` recipients | text / `string-array` | keep text + variable insertion; optional contact selector later | no contacts resolver | emails | recipients are `sensitivity:"recipient"` — Med | P1 (insertion) / P2 (contacts) |
| Gmail `labelIds` | `string-array`/combobox | label picker | **yes** (`gmail:labels`) | label id | Low | P1 |

### Drive / OneDrive
| Field | Current | Desired | Resolver? | Pri |
|---|---|---|---|---|
| folder/file targets | `file`/combobox | (already covered) | yes (`google-drive:folders`, `microsoft-onedrive:folders/items/files`) | done/coverage |

### Trello (`create_card` — verified)
| Field | Current | Desired | Resolver? | Store | Pri |
|---|---|---|---|---|---|
| `boardId`/`listId`/`idMembers`/`idLabels` | **combobox** ✅ | (good) | yes | ids | done |
| `due` / `start` | text (ISO-8601) | **datetime** | n/a | ISO | **P0** |

### Airtable / Notion / Sheets / Excel / Teams
| Provider | Resource fields | Current | Notes | Pri |
|---|---|---|---|---|
| Airtable | base/table/view/field | combobox (`airtable:*`) ✅ | record picker intentionally absent | coverage |
| Notion | database/page/user | combobox (`notion:pages/users`) ✅ + property fields | date-typed Notion properties → datetime (P1) | coverage / P1 |
| Google Sheets | spreadsheet/sheet | combobox (`google-sheets:*`) ✅ | — | done |
| Excel | workbook/worksheet/table | combobox (`microsoft-excel:*`) ✅ | `columns` hand-typed (accepted) | done |
| Teams | team/channel | combobox (`microsoft-teams:*`) ✅ | — | done |

---

## 5. Quick wins (no new backend, low risk)

1. **Wire `slack:channels` into Slack trigger channel fields** (text → combobox). Resolver
   already exists. Pure metadata change. **P0.**
2. **Convert text-as-enum fields to static `select`** — e.g. Google Calendar `colorId` (1–11).
   Pure metadata. **P1.**
3. **Audit + wire already-registered resolvers that aren't on their metas yet** (e.g. confirm
   every `*:calendars`, `gmail:labels`, `outlook:folders` consumer uses combobox). Metadata-only.
4. **Consistent "paste exact ID" helper text** across all combobox fields (formalize the
   power-user fallback already present ad hoc).

These ship as metadata edits validated by the existing meta tests — no renderer, no resolver,
no route.

---

## 6. Location / address — feasibility audit only (DO NOT BUILD)

Target: Google Calendar / Outlook `location` autocomplete via Google Places/Maps.

- **API key / env:** needs a Google Maps Platform key (Places Autocomplete + Place Details).
  No such key/env exists in the repo today (unverified beyond "not found in option resolvers");
  would be a new server-proxied secret — **never expose the key to the browser**; proxy through
  a server route (consistent with the options pattern).
- **Privacy:** Places queries send user-typed location fragments to Google. This is a new
  third-party data egress from the builder; must be disclosed and ideally gated.
- **Billing / cost:** Places Autocomplete is **per-keystroke-session billable**. Needs
  session-token batching + debounce + a hard rate limit or it is a cost-runaway risk.
- **Fallback if key missing:** the field MUST degrade to plain free-text (today's behavior) —
  never a dead control. Feature-flagged, default OFF.
- **Storage shape — open decision:** options are (a) display text only (simplest; matches what
  Calendar APIs accept), (b) `place_id`, (c) `lat/lng`, (d) provider-specific structured
  address. **Recommendation:** store **display text by default** (what the Calendar API wants),
  optionally capture `place_id` in a sidecar field for future structured use. Do not store
  lat/lng unless a consumer needs it.
- **Verdict:** **defer to a dedicated, flag-gated slice after the date/time family lands.**
  Audit only here.

---

## 7. Required option-source / resolver gaps

| Gap | Needed for | Exists? | Effort | Blocker |
|---|---|---|---|---|
| `google-calendar:calendars` | Calendar picker on every GCal action | **No** | Resolver + manifest scope | OAuth scope (`calendar.readonly`/list) — see google-calendar-metadata-coverage-plan §3 |
| `slack:users` | Slack DM/user fields | **No** | Resolver | Scope review; PII (emails) — return id+name only |
| Google / Microsoft contacts | Calendar attendees, mail recipients | **No** | Resolver(s) + scope | PII-heavy; recipient-sensitivity; defer |
| (none) for date/time | temporal fields | n/a | **Client renderer only** | none |

**Important:** the date/time/datetime/timezone family needs **no resolver and no backend** —
it is a pure client renderer that reads/writes the same string the handler schema already
expects. That is precisely why it is the recommended first slice.

---

## 8. Safety / privacy rules (carry into every implementation slice)

- **No new secrets in the browser.** Any Places/Maps key is server-proxied; default OFF behind
  a flag; degrade to free text if absent.
- **Selectors store IDs, display labels** — never invert. Keep the manual-ID paste fallback so a
  power user is never trapped by a slow/incomplete picker.
- **Resolvers stay on the credential-aware path** ([resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts)) — editor's-own-credential only, no co-member personal-credential enumeration, sanitized `{value,label}` only (no token/scope/email-beyond-label/raw payload). New contact/user resolvers must return **id + display name only**, never raw email/phone unless that IS the stored value and is the editor's own connection.
- **Recipient/secret/connection sensitivity is already modeled** (`FieldMeta.sensitivity`) — new
  recipient selectors must set `sensitivity: "recipient"`; secret inputs `"secret"`.
- **No live provider calls and no schema changes from a picker** — a selector only changes how a
  value is *entered*, never what the handler validates. The runtime Zod schema stays the
  authority.
- **No date/time silent coercion** beyond formatting to the exact string the schema expects;
  preserve the user's explicit timezone choice (the Q12 tz-resolution contract stays server-side
  for unset values).

---

## 9. Proposed implementation phases

- **Phase 0 — Quick wins (metadata-only).** Wire `slack:channels` into Slack triggers; convert
  text-as-enum fields (`colorId`) to `select`; sweep unwired-but-registered resolvers. Validated
  by existing meta tests. No renderer/backend.
- **Phase 1 — Temporal field family (client-only, highest leverage).** Add `date`, `time`,
  `datetime` field types + renderers + a timezone select; timezone-aware display; store the exact
  string the schema expects. First adopters: Google Calendar create/update event, Outlook
  Calendar, Trello `due`/`start`. No backend, no migration, no provider call.
- **Phase 2 — Conditional visibility + enum polish.** Add a `visibleWhen` mechanism to `FieldMeta`
  + SchemaForm (e.g. `allDay` shows date vs datetime fields) — additive, optional, default-visible.
  Finish enum conversions.
- **Phase 3 — Resolver coverage gaps.** `google-calendar:calendars` (scope work), then evaluate
  `slack:users`. Each its own slice with scope + PII review.
- **Phase 4 — Location/address (flag-gated).** Google Places proxy + autocomplete renderer,
  default OFF, free-text fallback, cost controls (§6).
- **Phase 5 — Contact/user selectors + variable-insertion parity review.** PII-reviewed contact
  resolvers; decide which additional field types should carry the variable picker.

Risky/public behavior (Places, any new scope) ships behind `ENABLE_<NAME>` default OFF, per the
repo flag rule.

---

## 10. Recommended first coding slice

**CS-1 — `datetime` / `date` / `time` field types + renderers (timezone-aware), with Google
Calendar create/update event as the first adopter.**

Why this first:
- **Highest leverage:** every calendar/date field across multiple providers is currently raw
  text; one renderer family fixes all of them.
- **Zero backend risk:** no resolver, no route, no migration, no provider call. The renderer
  reads/writes the same ISO/date string the handler schema already validates.
- **Self-contained + testable:** new renderers + registry entries + meta-type changes on two
  actions, proven by renderer unit tests + the existing meta validation tests.
- **Unblocks the rest:** Outlook Calendar, Trello `due`/`start`, Notion date properties all reuse
  the same renderers in follow-up slices.

Optional **CS-0 warm-up (even smaller):** wire `slack:channels` into the Slack trigger metas
(text → combobox) — pure metadata, no new code paths, validates the "coverage sweep" mechanics
before CS-1.

Defer Google Places (CS-Phase-4) and contact resolvers (CS-Phase-5) until after the temporal
family lands.

---

## 11. Acceptance criteria

**For this planning slice (met):** the audit doc exists, every current-state claim is tied to a
file read, recommendations are labeled, no product code changed, nothing pushed.

**For the implementation arc (future):** new temporal renderers store exactly the
schema-expected string; selectors store IDs / show labels with a manual-paste fallback; resolvers
stay on the credential-aware sanitized path; Places (if built) is server-proxied + flag-gated +
free-text fallback; every changed meta passes the meta-validation tests; no new co-member
credential exposure.

---

## 12. Hard boundaries (what this slice did NOT do)

- No source, test, migration, schema, or UI changes — **docs only**.
- No backend endpoint added; no live provider API call made.
- No Google Places integration built (feasibility audit only).
- Builder shell, tabs, rail, top bar, and Settings (closed out in
  [builder-shell-launch-polish-closeout.md](./builder-shell-launch-polish-closeout.md)) untouched.
- Nothing pushed.

---

## 13. Recommended next step

Pick up **CS-1** (temporal field-type family + Google Calendar adopter), optionally preceded by
the **CS-0** Slack-trigger combobox quick win. Both are client/metadata-only and carry no
backend, migration, or provider-call risk.

---

## 14. Sweep execution status (live)

This section is the running ledger for the "sweep-and-clean" execution. **Every remaining gap
has an explicit reason + recommended action — no vague "future" notes.**

### 14.1 Completed (shipped, local commits)

| Slice | What shipped |
|---|---|
| **CS-1** | `date` / `time` / `datetime` / `timezone` field types + renderers; Google Calendar create/update event adopted (start/end datetime, start/end date, timezone). |
| **CS-2** | 7 Slack **trigger** channel fields → `slack:channels` combobox + `allowManualEntry`. |
| **CS-2b** | 24 Slack **action** channel comboboxes → `allowManualEntry` (paste parity). |
| **SWEEP-1** | **Outlook Calendar** create/update event: `startDateTime`/`endDateTime` → `datetime`, `startTimeZone`/`endTimeZone` → `timezone` (offset-less local + separate IANA tz — same model the Outlook schema's flat-shim + `resolveTimezone` already expect; format preserved). **Google Analytics** `run_report`: `startDate`/`endDate` → `date` (custom range). **Google Calendar** create/update event: `colorId` text → static `select` of the 11 documented event colors (stores `"1".."11"`). |
| **SWEEP-1 (slack:users)** | **Built** the `slack:users` option resolver (read-only `users.list`, **already-granted** `users:read` scope, returns id + `@displayName` only — **no email**: V2 omits `users:read.email`). **Wired** the 4 single-value Slack user-id fields → `combobox` + `slack:users` + `allowManualEntry`: `send_direct_message.userId`, `get_user_info.user`, `remove_user_from_channel.user`, and the `new_direct_message.withUserId` sender filter (trigger). Stored value stays the `U…` id; `invite_users_to_channel.users` (multi-value) deliberately untouched (combobox has no multi-select). |
| **SWEEP-2** | **(A)** `ComboboxField` gained the shared `VariablePickerButton` (shown when `allowManualEntry` + upstream variables exist) — one-click `{{node.field}}` insertion restored on the converted Slack user/channel + Drive pickers; option selection + manual entry unaffected. **(B)** `StringArrayField` gained a per-chip `optionsSource` picker (stores stable id array, shows friendly labels, `allowManualEntry` for raw ids; free-text path unchanged) + contract now allows `optionsSource`/`allowManualEntry` on `string-array`; wired `gmail:add_label.labelIds` → `gmail:labels` (selection only — no auto-create). **(C)** Built `google-drive:files` resolver (reuses `filesList` + already-granted Drive scope; **metadata only** — id + name, folders excluded, no content); wired `get_file_metadata` / `delete_file` / `move_file` `fileId` → `combobox` + `google-drive:files` + `allowManualEntry`. |

**Why these were safe:** each provider stores the SAME string the handler/schema already accepts
(Outlook: naive `dateTime` + separate `timeZone`; GA: `YYYY-MM-DD`; GCal colorId: a `"1".."11"`
string). No handler/schema/scope/wrapper/route/DB change. Existing offset-bearing or
`{{variable}}` values hydrate via the temporal renderer's safe text fallback (never silently
reinterpreted). `colorId` stays optional (no hidden default); `select` retains an out-of-options
saved value rather than clobbering it.

### 14.2 Blocked — needs a Marcus decision (do NOT build silently)

1. **Instant (`...Z` / offset) temporal fields** — Outlook Cal `list_events` start/end window,
   Google Cal `list_events` `timeMin`/`timeMax`, Trello `create_card`/`update_card` `due`/`start`,
   Mailchimp `create_custom_event` `occurred_at`.
   - **Reason:** these store a true UTC **instant** (`2026-06-01T00:00:00Z`), and the providers'
     query/date APIs require the offset/`Z`. The CS-1 `datetime` renderer stores **offset-less**
     local wall-clock and (correctly) has no companion timezone field on these actions —
     converting them would either emit a naive string the API rejects (GCal/Outlook list windows)
     or silently shift the instant by the local offset (Trello/Mailchimp), violating "no silent
     timezone conversion."
   - **Recommended action:** add a `datetime-utc` (instant) renderer that treats the picked
     wall-clock as **UTC** and emits `…Z`, clearly labeled "UTC". **Decision needed:** is the
     "enter the time in UTC" model acceptable, or do we want a picked-offset control? Either is a
     small renderer add once the input model is chosen.
   - **Marcus decision required: YES.**

2. **Dual-format timestamp fields** — Slack `schedule_message` `postAt` (ISO-with-offset **or**
   Unix-seconds int), HubSpot `create_meeting`/`create_call`/`create_task` `hs_timestamp` +
   meeting start/end (ISO **or** epoch-ms).
   - **Reason:** the handlers accept two value shapes; no single temporal renderer maps cleanly,
     and these also carry offset/instant semantics (see #1).
   - **Recommended action:** decide on a single canonical input (datetime-UTC per #1) and have the
     handler keep accepting the legacy int form for back-compat. Bundle with #1's renderer.
   - **Marcus decision required: YES** (tied to #1).

3. **HubSpot portal-configurable enums** — `lifecyclestage`, `hs_lead_status`,
   `hs_ticket_category`, `source_type`, `dealtype` on the create/update contact/company/ticket/deal
   metas.
   - **Reason:** these are **per-portal customizable** enums (the "typical values" in the meta
     descriptions are best-effort, not authoritative). A static `select` would impose a fake
     constraint and reject valid custom portal values — a regression.
   - **Recommended action:** build a `hubspot:property_options` resolver (deps: object type +
     property name) that reads the portal's real enum options via HubSpot's CRM **properties API**.
     **Blocker:** needs verification that the properties read endpoint is covered by the **already-
     granted** HubSpot scopes (the manifest has 18 scopes — likely yes, but unverified). If in
     scope → buildable now as a normal resolver; if not → scope change required.
   - **Marcus decision required: only if a scope add is needed** (pending the scope check).

### 14.3 Blocked — backend/scope/product (unchanged from the original audit)

- **Google Calendar `calendarId` picker** — `google-calendar:calendars` resolver is **scope-blocked**
  (documented in the GCAL-META plan); needs a broader Calendar scope. **Marcus decision: YES** (OAuth scope).
- **Location/address fields** (GCal/Outlook Cal `location`, HubSpot `hs_meeting_location`) — **Google
  Places blocked**: needs API key + billing + server proxy + privacy/PII-egress decision + storage-format
  choice (§6). Kept as honest free-text; help copy already states "address or place". **Marcus decision: YES.**

### 14.4 Buildable resolver candidates

- **`google-drive:files`** — ✅ **DONE (SWEEP-2).** Built reusing `filesList` + the already-granted Drive
  read scope; bounded 200-file `name contains` search, folders excluded, metadata only (id + name). Wired to
  `get_file_metadata` / `delete_file` / `move_file`.
- **Slack group-DM (mpim) picker — ❌ BLOCKED on an OAuth scope.** `new_group_direct_message.channelId`
  (mpim) can't use `slack:channels`. Listing group DMs needs `conversations.list types=mpim`, which requires
  the **`mpim:read`** scope. The Slack manifest grants **`mpim:history`** (read message history) but **NOT
  `mpim:read`** (list the conversations). The `conversationsList` wrapper already supports `types: "mpim"`, so
  the resolver is ~20 lines once the scope exists. **Recommended action:** add `mpim:read` to the Slack
  manifest required scopes (forces a one-time re-OAuth for existing Slack connections), then ship
  `slack:group_dms`. **Marcus decision required: YES (OAuth scope add + re-consent).** Until then the field
  stays honest free-text.

### 14.5 Confirmed already-complete (no action — verified this sweep)

- **Resource-ID selectors** are otherwise fully wired: Slack channels, Google Sheets/Docs/Drive folders,
  OneDrive items/files, Excel workbook/worksheet/table, Trello board/list/card/member/label, Airtable
  base/table/view/field, Notion page/user, HubSpot owner/pipeline/stage/list, Mailchimp audience/campaign/
  segment/member, Monday board/group/column/item, Discord guild/channel/member/role, Teams team/channel,
  OneNote notebook/section/page, Dropbox folder/file, Facebook page/post/album, GitHub repos, Gmail labels.
  The remaining raw-ID text fields are **intentional**: trigger/upstream-fed ids (`eventId`, `messageId`,
  `fileId`), opaque Stripe ids, and Airtable `recordId` (record pickers explicitly rejected for v1).
- **Variable insertion** covers the primary text surfaces: `TextField`, `TextareaField`, `FileField`,
  `FileRefArrayField`, `RouterRoutesField`, and now **`ComboboxField`** (SWEEP-2 Scope A — shown when
  `allowManualEntry` + upstream variables exist) all mount `VariablePickerButton`. The 3 Slack action user
  fields therefore regained one-click `{{trigger.user}}` insertion. **Remaining `StringArrayField` free-text
  gap:** free-text chip lists with NO `optionsSource` (e.g. Gmail `from[]`, Calendar `attendees`) still have no
  per-chip variable picker. **Recommended action:** add an opt-in `supportsVariables` flag + per-chip picker to
  the free-text `StringArrayField` body (renderer-only, no backend). Not blocking.
- **`gmail:add_label.labelIds`** — ✅ **DONE (SWEEP-2 Scope B):** `string-array` now supports `optionsSource`,
  so `labelIds` is a per-chip `gmail:labels` picker (stores ids, shows names, manual-entry for raw ids). The
  earlier "arrays can't use optionsSource" limitation is resolved.

### 14.6 Sweep coverage summary

Swept all audit categories: **temporal** (Outlook Cal + GA done; instant fields blocked #1), **Slack
selectors** (channels done CS-2/2b; **single-value users/DM-sender done this sweep via the new `slack:users`
resolver**; the multi-value `invite_users_to_channel.users` needs a multi-select combobox; **group-DM (mpim)**
has no resolver — Slack `users.list` doesn't enumerate mpim channels, so `new_group_direct_message.channelId`
stays text pending a `conversations.list types=mpim` resolver, a buildable follow-up on the existing
`conversationsList` wrapper), **Google/Microsoft selectors** (already wired; `google-drive:files` recommended),
**Trello/Airtable/Notion** (already wired; record pickers rejected), **enum polish** (GCal colorId done;
HubSpot portal enums blocked #3), **location** (Places blocked), **variable insertion** (text/textarea
done; StringArrayField + ComboboxField-button follow-ups).
