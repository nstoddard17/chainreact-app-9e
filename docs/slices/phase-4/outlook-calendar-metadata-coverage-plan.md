# Microsoft Outlook Calendar — Builder Metadata Coverage Plan (OUTLOOK-CAL-META-1)

**Slice:** 4.OUTLOOK-CAL-META-1 (this plan) → OUTLOOK-CAL-META-2 (metas + trigger + COVERED flip — single implementation slice; **no resolver slice needed** — see §3/§7).
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch (verified at authoring):** `ai-12c-planner-json-only-hardening` (shared worktree — provider + AI commits interleaved; verify topology before push).
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`google-calendar-metadata-coverage-plan.md`](./google-calendar-metadata-coverage-plan.md) (Google twin — no-resolver / no-UI-scope, destructive delete; **main comparison template, but Outlook differs in 12+ concrete ways — see §5**), [`teams-metadata-coverage-plan.md`](./teams-metadata-coverage-plan.md) (Graph helper patterns, refreshAndRetry), [`onedrive-metadata-coverage-plan.md`](./onedrive-metadata-coverage-plan.md) (destructive Graph delete precedent).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy, **never blind GCal copy**.

Microsoft Outlook Calendar is the **9th and final** provider in the pending-metadata launch-gap arc (after Shopify, Excel, Airtable, Trello, OneDrive, Teams, GCal, GDrive). **Current state (code-verified):** **5 runtime actions + 1 webhook (Graph subscription) trigger** registered and real; **0 ActionMeta, 0 TriggerMeta, 0 options resolvers**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Outlook Calendar renders as **"coming soon"**. It is the current canonical "still-pending" example in `providers-route.test.ts` after the GDRIVE-META-2 swap.

**Five facts drive the slice plan:**

1. **ZERO `calendarId` field on any schema.** Every action targets `/me/events` (the user's primary calendar) hardcoded in the runtime. `eventsCreate`/`eventsList`/`eventsGet`/`eventsUpdate`/`eventsDelete` take no calendarId argument. This is a major divergence from GCal (which exposes `calendarId` defaulting to "primary"). → No `microsoft-outlook-calendar:calendars` resolver is needed because **there is no field to wire it to**.
2. **The trigger has ZERO config fields.** `activate` reads nothing from `node.config` — it always subscribes to `/me/events` with `changeType:"created,updated,deleted"`. The activation file's docstring is explicit: _"Slice 7 has no required config fields — emits one event per notification, no per-trigger filtering."_ This matches the OneDrive `file_changed` `fields:[]` precedent.
3. **NO `sendNotifications` Q11 anywhere.** Microsoft Graph doesn't expose this knob — cancellation/invitation emails are tenant-policy-driven. Instead `create_event.responseRequested` is the Q11 boolean (controls whether the invitation email shows RSVP buttons). `delete_event` has NO field beyond `eventId`.
4. **DIFFERENT Q11 fields than GCal.** `create_event` requires `isAllDay` + `responseRequested` + `bodyContentType-when-body-present`. `add_attendees` requires `attendeeType` (`required`/`optional`) — Graph differentiates required vs optional attendees with user-visible grid behavior. (GCal has no `attendeeType`.)
5. **Online meeting is READ-ONLY in v1.** Outputs and the trigger payload include `isOnlineMeeting` + `onlineMeetingUrl` (the Teams join URL — surfaced when Graph auto-creates one per tenant policy), but `create_event` has **no toggle to attach a Teams meeting** (contrast GCal's `googleMeet` boolean → `meetLink`). Documented runtime gap; runtime expansion (a future OUTLOOK-CAL-MEETINGS slice) — out of this metadata arc.

---

## 1. Current Outlook Calendar runtime inventory

**Manifest** ([`integrations/microsoft-outlook-calendar/manifest.ts`](../../../integrations/microsoft-outlook-calendar/manifest.ts)): id `microsoft-outlook-calendar`, displayName "Microsoft Outlook Calendar". `apiVersion:"v1.0"` (Graph), `tokenScope:"user"`, `oauthFlows:["v2"]`, `accountIdField:"email"`, `refreshable:true`, `healthCheckIntervalMs:6h`. Capabilities `oauth/webhookTrigger/actions:true`, `pollingTrigger:false`. **Scopes (verified):** `offline_access` + `Calendars.ReadWrite` (covers every action + the subscription trigger; Graph's hierarchical permission model means `Calendars.ReadWrite` includes `/me/calendars` read access — but **no field consumes calendarId** today, so we don't exercise that path).

**OAuth** ([`oauth.ts`](../../../integrations/microsoft-outlook-calendar/oauth.ts)): shared Microsoft v2 OAuth (preserve-old rotation policy). Sibling to `microsoft-outlook` (mail) under one Azure AD app — distinct provider id, distinct integration row per surface (matches Slice 6 precedent + V2's per-surface Google split).

**API helpers** ([`api/`](../../../integrations/microsoft-outlook-calendar/api/)): `eventsCreate`, `eventsList` (smart endpoint switch: `/me/events` vs `/me/calendarView` when both `startDateTime`+`endDateTime` are present — auto-expands recurring), `eventsGet`, `eventsUpdate`, `eventsDelete`. **NO `pull.ts`** in the trigger (Graph subscriptions are notify-only — receive handler does the GET to hydrate, with a 404 fallback via `normalizeDeleted`). **NO `calendarsList` helper** (no consumer).

### 1.1 Registered action handlers (5)

Source of truth: [`services/execution/handlers/_registry.ts:467-471`](../../../services/execution/handlers/_registry.ts). Keys verified verbatim. `*` = required at the schema layer. **No action takes a `calendarId` field.**

| # | Action key | Handler / schema | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `create_event` | createEvent.ts / `CreateEventConfigSchema` | subject*, start*({dateTime*, timeZone?}), end*, **isAllDay*** (Q11), **responseRequested*** (Q11), body?, **bodyContentType*** (Q11 when body), location?, attendees?, reminderMinutesBeforeStart?, showAs?, sensitivity?, importance? | `{id, subject, start, end, isAllDay, webLink, organizer{name,address}, attendees[{name,address,type,status}]}` | create → **medium** | `attendees`, `organizer` (plan-marked — email PII) | none (no resolvers; attendees=typed) |
| 2 | `list_events` | listEvents.ts / `ListEventsConfigSchema` | startDateTime?, endDateTime? (both-or-neither), top(1–100, def 25), orderBy(start\|subject, def start), subjectFilter? | `{events, count, hasMore, nextLink}` — each event has `{id, subject, start, end, isAllDay, location, attendees, organizer, isOnlineMeeting, onlineMeetingUrl, importance, sensitivity, showAs, webLink, createdDateTime, lastModifiedDateTime}` | read → **low** | `events` (plan-marked — bulk carries attendee/organizer email PII + onlineMeetingUrl) | none |
| 3 | `update_event` | updateEvent.ts / `UpdateEventConfigSchema` | eventId*, ≥1 mutable field (refine), subject?, start?, end?, isAllDay?, responseRequested?, body?, bodyContentType? (Q11 when body), location?, attendees? (**replaces**), reminderMinutesBeforeStart?, showAs?, sensitivity?, importance? | same shape as `create_event` | update → **medium** | `attendees`, `organizer` (plan-marked) | eventId → text (defer) |
| 4 | `delete_event` | deleteEvent.ts / `DeleteEventConfigSchema` | eventId* (only field) | `{eventId, deleted, alreadyMissing}` | delete → **high / DESTRUCTIVE / confirm** | none (output is structural) | eventId → text (defer) |
| 5 | `add_attendees` | addAttendees.ts / `AddAttendeesConfigSchema` | eventId*, attendees*, **attendeeType*** (`required`/`optional`, Q11) | `{id, attendeesAdded, attendeesTotal, attendeesAlreadyPresent}` | update → **medium** | `attendeesAdded`, `attendeesAlreadyPresent` (plan-marked — emails) | eventId → text (defer) |

**Notable runtime facts (V2 schema JSDocs — V1 rot fixes):**
- **Q11 (no hidden defaults):** `create_event.{isAllDay,responseRequested,bodyContentType}` required; `add_attendees.attendeeType` required (Graph differentiates `required` vs `optional` attendees in the calendar grid).
- **`update_event.attendees` REPLACES** the full list (Graph PATCH semantic); `add_attendees` is the read-modify-write merge action with case-insensitive email dedup. Plan must call this out in help text.
- **`delete_event` is idempotent on 404** (`alreadyMissing:true` short-circuit). Still destructive — Graph notifies attendees of cancellation by its own tenant-policy logic; there is no caller knob.
- **`update_event` refine: at least one mutable field beyond `eventId`** — fail-fast on no-op PATCH.
- **`list_events` endpoint switch:** both `startDateTime`+`endDateTime` set → `/me/calendarView` (auto-expands recurring); else → `/me/events` (master events). `top` is bounded 1–100 (Graph's `$top` cap on `/me/events` — much tighter than GCal's 2500).
- **`add_attendees` race window:** documented (read-modify-write; single-actor assumption); ETag/If-Match optimistic concurrency deferred — runtime acceptance, not a metadata concern.
- **NO `googleMeet`-equivalent toggle** on `create_event`. The runtime cannot attach a Teams meeting via this action; `isOnlineMeeting`/`onlineMeetingUrl` are read-only outputs.

### 1.2 Registered trigger (1 — webhook Graph subscription)

[`triggers/eventChanged/`](../../../integrations/microsoft-outlook-calendar/triggers/eventChanged/). **Registered key = `event_changed`** (directory `eventChanged`, runtime key snake_case `event_changed`). `index.ts` does `registerActivation("microsoft-outlook-calendar","event_changed",activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(...)`. Imported at `integrations/_registry.ts` → loads at module init, so the **trigger-meta-activation-invariant will pass with no `_registry` change and no exemption** once TriggerMeta lands.

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `event_changed` | microsoft-outlook-calendar.event_changed | **webhook** (Graph subscription on `/me/events`, `changeType:"created,updated,deleted"`) | `activate`: generate 64-hex clientState, POST `/v1.0/subscriptions` with `expirationDateTime = now + 4230 min` (~70.5h max), `lifecycleNotificationUrl` set. Receive handler GETs `/me/events/{id}` on notification to hydrate (`normalizeDeleted` falls back on 404 → stable shape, `subject:null`). **renewal** via `subscriptionRegistry` cron before expiry. `deactivate` deletes the subscription (404/403 swallowed). | **NONE** (zero config fields — emits one event per notification, no per-trigger filtering — explicit runtime decision) | ✅ yes |

Payload (from [`normalize.ts`](../../../integrations/microsoft-outlook-calendar/triggers/eventChanged/normalize.ts)): `eventId`, `changeType` (`created`/`updated`/`deleted`), `subject`, `start`, `end`, `isAllDay`, `location` (string — flattened `displayName`), `body` (`{contentType,content}` or null), `attendees`, `organizer` (`{name,address}` or null), `isOnlineMeeting`, `onlineMeetingUrl`, `webLink`, `importance`, `sensitivity`, `createdDateTime`, `lastModifiedDateTime` — **17 fields**. Dedup key shape: `${subscriptionId}:${eventId}:${changeType}` so created→updated→deleted on the same event emits three distinct dispatcher events. Ships TriggerMeta; **config = empty `fields:[]`** (mirror OneDrive `file_changed`).

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts`. **Field names camelCase**, verbatim to the runtime schemas. Note: **field-name drift from GCal** because Outlook uses Graph terminology — `subject` (not `summary`), `body` (not `description`), `responseRequested`/`attendeeType` (Graph-specific), and the nested `start`/`end` object shape `{dateTime, timeZone?}` (vs GCal's flat `startDateTime`/`endDateTime` strings).

**Common defaults:** `requiresIntegration:true`; **`category:"calendar"`** (mirror GCal); sequential `displayOrder` (10..50); `producesFileRef:false`, `consumesFileRef:false` for all. _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation`/`riskLevel` explicitly — Zod `.default()` applies only at `.parse()`.)_

**Risk classification:**
- **low** — `list_events` (pure read).
- **medium** — `create_event`, `update_event`, `add_attendees` (recoverable external mutations).
- **high / `isDestructive:true` / `requiresConfirmation:true`** — `delete_event` (irreversible removal; Graph notifies attendees automatically per tenant policy — there is no caller knob to suppress). Must pair `riskLevel:"high"` (contract `superRefine` requires it). `riskDescription`: "Permanently deletes the event. Attendees may receive a cancellation email per your Outlook tenant's notification policy. There is no restore path through this action."

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) `FieldTypeSchema`). Note: `create_event`/`update_event` use **NESTED object fields** (`start.dateTime`, `start.timeZone`, `end.dateTime`, `end.timeZone`). Since `FieldMetaSchema` does NOT support nested object configuration, the v1 metadata exposes these as **separate flat fields** with explicit names that mirror the runtime nesting:
- **Approach A (recommended, V2-native):** expose `startDateTime`/`startTimeZone`/`endDateTime`/`endTimeZone` as flat text fields in the meta. The handler/schema STAYS nested (runtime owns the shape); the builder UI sends the nested object after the schema accepts it. ⚠️ This requires a tiny resolved-config-vs-builder-config translation in the meta consumer OR a thin runtime helper.
- **Approach B (no translation):** require workflow authors to pass nested JSON. Worse UX, no builder support.
- **Decision (Marcus sign-off in OUTLOOK-CAL-META-1):** ship Approach A by giving the builder shell the smarts to wrap two flat fields into one nested object. **OR — simpler v1 compromise** — ship the meta with two flat fields (`startDateTime`, `startTimeZone`, `endDateTime`, `endTimeZone`) AND make a small runtime schema change to accept BOTH the nested and flat shapes (Q11-style additive). The flat shape is the builder default; the nested shape stays for API consumers / current tests. _Recommendation:_ **defer the decision into META-2** and ship a tiny `superRefine`-based shim if necessary; capture the spec here so the implementation slice carries it. The flat-field UX is non-negotiable for the builder — a workflow author cannot reasonably hand-type `{"dateTime":"…","timeZone":"…"}` JSON in a text field.

For ALL other fields the V1 schema-to-meta shape is 1:1:
- `eventId` (update/delete/add_attendees) → **text**, required. Picker DEFERRED. Placeholder: `"{{trigger.eventId}} or from List Events"`.
- `subject` (create) → **text**, required (the schema accepts empty string per Graph; meta keeps `required:true` with help text).
- `subject` (update) → **text**, optional.
- `body` → **textarea**, optional.
- `bodyContentType` → **select** (`Text`/`HTML`), required-when-body-present (the meta marks it `required:false` because field-level `required` doesn't model cross-field rules — schema enforces; meta documents via help text).
- `location` → **text**, optional (flattened to `displayName` by the handler).
- `attendees` → **string-array**, optional on create/update, required on add_attendees.
- `attendeeType` (add_attendees) → **select** (`required`/`optional`), required (Q11).
- `isAllDay` (create) → **boolean**, required (Q11).
- `responseRequested` (create) → **boolean**, required (Q11). Update: optional.
- `reminderMinutesBeforeStart` → **number**, optional, `numeric:{min:0,integer:true}`.
- `showAs` → **select** (`free`/`tentative`/`busy`/`oof`/`workingElsewhere`), optional.
- `sensitivity` → **select** (`normal`/`personal`/`private`/`confidential`), optional.
- `importance` → **select** (`low`/`normal`/`high`), optional.
- `top` (list) → **number**, optional, `numeric:{min:1,max:100,integer:true}`, `defaultValue:25`.
- `orderBy` (list) → **select** (`start`/`subject`), `defaultValue:"start"`.
- `subjectFilter` (list) → **text**, optional.
- `startDateTime`/`endDateTime` (list) → **text**, optional (both-or-neither — schema enforces; meta documents).

**Sensitive outputs** — all deliberate plan-marks (the only `body` name IS in `SUSPICIOUS_NAMES` and is force-marked):
- **`body` (trigger payload)** — **FORCED sensitive** by `sensitive-output-coverage` (`body` ∈ suspicious set). Plan complies.
- **Plan-marked sensitive (PII / access-bearing):**
  - `attendees` arrays on `create_event` / `update_event` outputs + the trigger payload (email PII; mirror GCal — keep as plain `type:"array"` without nested `fields[]` to avoid the forced-`email` nested question, marked at the array level).
  - `organizer` object on `create_event` / `update_event` outputs + the trigger payload (organizer email PII — `address` is NOT in suspicious set but the field is genuinely email PII; mark the whole object sensitive).
  - `events` array on `list_events` (bulk carries attendee + organizer emails + onlineMeetingUrl — mirror Notion `results` / Gmail `messages` / GCal `events`).
  - `attendeesAdded` / `attendeesAlreadyPresent` on `add_attendees` (email-string arrays).
  - `onlineMeetingUrl` (Teams join URL — access-bearing capability URL; mirror GCal `meetLink` Marcus decision). Output appears in `list_events.events[]` (nested) and the trigger payload; mark on the trigger payload.
- **NOT marked** (mirror precedent — ids / titles / location / dates / enums / `webLink` deeplink): `id`/`eventId`, `subject` (title-like — mirror Teams subject / GCal summary), `start`/`end` (date objects), `isAllDay`, `location` (string `displayName`), `webLink` (auth-gated deeplink — mirror OneDrive `webUrl` / Teams `webUrl` / GCal `htmlLink`), `count`, `hasMore`, `nextLink`, `deleted`, `alreadyMissing`, `attendeesTotal`, `importance`, `sensitivity` (the field, not the action-meta concept), `showAs`, `createdDateTime`, `lastModifiedDateTime`, `changeType`, `isOnlineMeeting`.

**Task cost:** per central policy ([`lib/workflows/cost-calculator.ts`](../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each action bills **1 task on success**. No per-meta override. Today these 5 are `unknown_node` (0 + warning); adding metas makes them billable at 1 task **automatically via grounding**. **This track changes no billing code.**

---

## 3. Existing resolver / helper audit

**Headline: Outlook Calendar needs ZERO resolvers for v1 — even simpler than GCal.** No existing options resolvers (verified — grep on `services/options/_registry.ts` returns no Outlook Calendar entries). The required surface is shippable with **only typeable text** for the one id-bearing field (`eventId`).

| Resolver | Serves | Endpoint / helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `microsoft-outlook-calendar:calendars` | (nothing — no `calendarId` field exists on any schema) | (would need new `calendarsList` helper — `GET /me/calendars`; manifest already grants the scope via `Calendars.ReadWrite`) | none | **REJECT (v1)** — **NO RUNTIME CONSUMER.** Unlike GCal where the field exists with a `"primary"` default, Outlook's runtime is hardcoded to `/me/events`. Without a field, building a picker is pure cost with zero UX benefit. (Different blocker than GCal's scope blocker — Outlook's blocker is the missing field, not the scope.) | n/a |
| `microsoft-outlook-calendar:events` | `eventId` on update/delete/add_attendees | (would reuse `eventsList`) | none (no `calendarId` parent — would just default to `/me/events`) | **DEFER (v1)** — event lists are large/ambiguous; `eventId` overwhelmingly flows from the `event_changed` trigger or `list_events.events`. Mirror GCal/Drive deferral. | Yes — typeable / `{{trigger.eventId}}` |
| `microsoft-outlook-calendar:timezones` | `startTimeZone` / `endTimeZone` | (none — static IANA db) | none | **REJECT (v1)** — IANA list (~400) exceeds the 256-option `FieldOptionSchema` cap; no API; `resolveTimezone` falls back to UTC. Mirror GCal rejection. | Yes — typeable |
| `microsoft-outlook-calendar:categories` | (nothing — no categoryId field exists on any schema) | (would need new `categoriesList` helper) | none | **REJECT (v1)** — no runtime consumer (Outlook event "categories" / color labels aren't exposed on the V2 surface; `showAs`/`sensitivity`/`importance` are the closest analogs and they're static selects). | n/a |

**No UI-scope schema additions:** the only id-bearing field (`eventId`) is already real on every consumer; no new runtime fields are introduced. META-2 touches no runtime schema (modulo the optional Approach-A flat-time-fields decision documented in §2 — that's a **builder UX shim**, not a UI-scope schema field addition).

**Recommendation: ship ZERO resolvers in this arc.** Defer `events` (mirror precedent); reject `calendars`/`categories` (no consumer); reject `timezones` (cap blocker). All explicitly captured in §5/§6 and asserted by tests in §8.

---

## 4. Trigger metadata audit

The single `event_changed` trigger is runtime-real, webhook (Graph subscription on `/me/events`), activation-registered + loaded → **ships TriggerMeta in this arc.**

`TriggerMeta` (`activation:"webhook"`, `category:"calendar"`, `requiresIntegration:true`):
- **Fields:** **`fields:[]` — empty, no user config.** The runtime activation reads nothing from `node.config`; every workflow's Outlook Calendar trigger watches the same `/me/events` resource with `changeType:"created,updated,deleted"`. (Mirror the OneDrive `file_changed` precedent — also `fields:[]`.) This is honest: the trigger has no per-workflow knobs and the meta says so.
- **payloadShape (17 fields):** `eventId`, `changeType`, `subject`, `start`, `end`, `isAllDay`, `location`, `body`, `attendees`, `organizer`, `isOnlineMeeting`, `onlineMeetingUrl`, `webLink`, `importance`, `sensitivity`, `createdDateTime`, `lastModifiedDateTime`.
- **Sensitive payload fields:** `body` (FORCED — suspicious name + Marcus precedent for event-body content), `attendees` (PII array, plan-marked), `organizer` (PII object, plan-marked), `onlineMeetingUrl` (access-bearing Teams URL, plan-marked — mirror GCal `meetLink`). NOT marked: `eventId`, `changeType` (literal), `subject` (title-like), `start`/`end`/dates, `isAllDay`, `location` (string displayName), `webLink` (auth-gated), `isOnlineMeeting` (boolean), `importance`, `sensitivity` (enum, not the body content), `createdDateTime`, `lastModifiedDateTime`.
- **Activation invariant:** satisfied — `registerActivation("microsoft-outlook-calendar","event_changed",…)` loaded via `integrations/_registry.ts`. No `SHARED_INFRA_EXEMPT_KEYS` entry.
- Trigger coverage is **not** gated by `discovery-meta-coverage` — `trigger-meta-activation-invariant` is the gate, and it passes.

**Single-trigger model note:** `changeType` distinguishes created/updated/deleted in one trigger (per runtime design). Workflow authors branch on `payload.changeType`. The `normalizeDeleted` minimal-payload variant (for deleted events that 404 on the post-notification GET) emits the same shape with `subject:null` and empty/null subfields — workflow authors don't need a special-case branch.

---

## 5. Google Calendar comparison

**Outlook Calendar mirrors GCal at a high level — 5 actions + 1 webhook trigger, same category, same delete-destructive precedent — but differs in 12+ concrete ways that the meta must respect.** Blind GCal copy would be wrong.

| Aspect | GCal (shipped) | Outlook Calendar (this arc) |
|---|---|---|
| **`calendarId` field** | yes (default `"primary"`, typeable text) | **NO field — actions hardcoded to `/me/events`.** ⇒ no `calendars` resolver needed (no consumer). |
| **Calendars-list scope** | NOT granted (`calendar.events` only) — calendars picker scope-blocked | Already granted (`Calendars.ReadWrite` includes `/me/calendars`) — but **no field**, so moot. |
| **Trigger config** | `calendarId` (default `"primary"`) | **`fields:[]`** — no per-workflow knobs. Mirror OneDrive `file_changed`. |
| **Q11 sendNotifications** | Required on every write (`all`/`externalOnly`/`none`) | **NOT a field anywhere** — Graph decides cancellation/invitation emails per tenant policy. |
| **Q11 guest perms** | `guestsCanInviteOthers` + `guestsCanSeeOtherGuests` required on create | **NOT a field** — Graph has no equivalent per-event toggles. |
| **Q11 `responseRequested`** | NOT a field | **Required on create_event** (controls whether attendees see RSVP buttons). |
| **Q11 `attendeeType`** | NOT a field | **Required on add_attendees** (`required`/`optional` — Graph differentiates in the calendar grid). |
| **`bodyContentType`** | NOT a field (description is free text) | **Required when body present** (`Text`/`HTML`). |
| **Title field name** | `summary` | **`subject`** (verbatim Graph). |
| **Description field name** | `description` (textarea) | **`body` + `bodyContentType`** (structured). The `body` output name in the trigger payload is FORCED sensitive (suspicious-name set). |
| **Time encoding** | flat `startDateTime`/`endDateTime` + `startDate`/`endDate` + `timezone` (top-level) | **Nested `start:{dateTime,timeZone?}` / `end:{dateTime,timeZone?}`** in the runtime schemas. Meta-level decision (Approach A vs B in §2). |
| **Time list constraint** | `maxResults` 1–2500 (default 250) | **`top` 1–100 (default 25)** — Graph cap. |
| **List query/filter** | `query` (free-text) + `orderBy:startTime|updated` | **`subjectFilter` + `orderBy:start|subject`** (Graph $filter substring on subject only). |
| **List endpoint switch** | Always `events.list` (`singleEvents` controls expansion) | **`/me/events` vs `/me/calendarView`** based on time-range presence (handler picks the path). |
| **Online meeting toggle** | `googleMeet` boolean (write) → `meetLink` output | **No write toggle** (V2 gap — runtime can only READ `isOnlineMeeting`/`onlineMeetingUrl`). Future OUTLOOK-CAL-MEETINGS runtime arc. |
| **Color/category** | `colorId` (optional text) | **NOT a field** (no category id field; `showAs`/`sensitivity`/`importance` are the closest analogs). |
| **Reminder field** | NOT a field | **`reminderMinutesBeforeStart`** (optional number). |
| **Rich event metadata fields** | `visibility`/`transparency`/`colorId` | **`showAs`/`sensitivity`/`importance`** (different Graph enums). |
| **`attendees` update semantic** | REPLACES | **REPLACES (same)** — `add_attendees` is the merge action (Graph PATCH on `attendees` replaces; the handler reads → merges → PATCHes). |
| **`delete_event` schema** | `calendarId` + `eventId` + Q11 `sendNotifications` | **`eventId` only** (no other fields). |
| **Delete destructive risk** | high + destructive + requiresConfirmation | **Same — high + destructive + requiresConfirmation.** Graph notifies attendees automatically per tenant policy. |
| **Trigger model** | `events.watch` push + `events.list?syncToken` delta pull (separate `pull.ts`) | **Graph subscription** with notify-only — **NO `pull.ts`**; receive handler GETs `/me/events/{id}` to hydrate, with `normalizeDeleted` 404 fallback. |
| **Trigger dedup key** | `${eventId}:${updated}` | **`${subscriptionId}:${eventId}:${changeType}`** — so created→updated→deleted on the same event fires three distinct dispatcher events. |
| **Trigger expiry** | ~7 days (Google watch) | **~70.5h (4230 min)** — Outlook /me/events cap. Renewed via the same `subscriptionRegistry` cron. |
| **Trigger payload fields** | 12 (`changeKind`, `calendarId`, `eventId`, `summary`, `description`, `location`, `start`, `end`, `attendees`, `htmlLink`, `status`, `updated`) | **17** (the GCal set plus `body`, `organizer`, `isOnlineMeeting`, `onlineMeetingUrl`, `importance`, `sensitivity`, `createdDateTime`, `lastModifiedDateTime`, `webLink`, `changeType` — without `status`/`changeKind`/`calendarId`). |
| **Sensitive-name force** | None forced (PII in array names not in suspicious set) | **`body` FORCED** (suspicious-set). Plan complies. |
| **OOSO / OOF** | not on this surface | `showAs:"oof"` enum value (read/write) — that's it for v1. |

**Mirror decisions (where Outlook copies GCal's pattern):**
- `category:"calendar"` for every action and the trigger.
- `delete_event` = high/destructive/requiresConfirmation.
- `attendees` arrays sensitive (plan-marked; kept as flat `array` no nested `fields[]`).
- `onlineMeetingUrl` sensitive (mirror GCal `meetLink` Marcus decision).
- `webLink` NOT marked (auth-gated deeplink — mirror GCal `htmlLink`).
- `subject` NOT marked (title-like — mirror GCal `summary`).
- Single-slice implementation (no resolver slice).

**Different decisions (Outlook-specific):**
- Trigger `fields:[]` (no calendarId — there's no field).
- `body` (trigger payload) is FORCED sensitive (suspicious-name).
- `organizer` object plan-marked (organizer email PII; GCal didn't expose an organizer field).
- Update-event refine: "at least one mutable field" — schema enforces; meta documents via help text.
- Approach-A flat-time-fields shim for the nested `start`/`end` schema shape (the most non-trivial META-2 design call).

---

## 6. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is settled (Slice 7 shipped 5 actions + 1 trigger; V1's silent `isAllDay`/`responseRequested` defaults, `Intl.DateTimeFormat()` timezone fallback, sentinel `eventDate:'today'`/`eventTime:'current'` were deliberately not ported). Metadata-only decisions:

- **All 5 actions + the `event_changed` trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change. _Caveat:_ the nested `start`/`end` builder UX may require a tiny additive schema acceptance of the flat shape — Approach A in §2; **defer the call into META-2** with the spec captured here.
- **No resolver wiring needed** anywhere on actions or trigger (zero `optionsSource` references in the entire surface).
- **`eventId` on update/delete/add_attendees → text** (events resolver DEFERRED).
- **`microsoft-outlook-calendar:calendars` → REJECT (v1)** — no field consumer (different blocker than GCal's scope blocker).
- **`microsoft-outlook-calendar:events` → DEFER (v1)** — trigger/upstream-fed.
- **`microsoft-outlook-calendar:timezones` → REJECT (v1)** — IANA cap blocker.
- **`microsoft-outlook-calendar:categories` → REJECT (v1)** — no field consumer.
- **`attendees` → string-array; `body` → textarea; `bodyContentType` → select(Text/HTML); enums → select; `top`/`reminderMinutesBeforeStart` → number; booleans → boolean.**
- **`delete_event` → high / isDestructive / requiresConfirmation** (mirror GCal/OneDrive/Airtable destructive trio).
- **Trigger `fields:[]`** (mirror OneDrive `file_changed`).
- **Sensitive marks per §2 / §4** (plan-marked: attendees/organizer/events/attendeesAdded/attendeesAlreadyPresent/onlineMeetingUrl; FORCED: `body`).
- **REJECT (runtime, already decided — not re-litigated):** calendar create/delete, ACL/sharing actions, free/busy queries, `isOnlineMeeting` write toggle (future OUTLOOK-CAL-MEETINGS runtime arc), category/color CRUD, OOSO/auto-reply (mail-side, different surface), separate created/updated/deleted trigger split (the single `changeType` discriminator covers it).

---

## 7. Implementation slices

**Recommended: a 2-slice arc (audit + ONE implementation slice).** Outlook Calendar is the **third** pending provider that needs no resolver slice (after GCal and GDrive) — the surface has no resolvers, no UI-scope schema additions (modulo the Approach-A builder shim — a small additive runtime tweak if Marcus approves; meta-only otherwise). Same 2-slice compression as GCAL-META / GDRIVE-META.

| Slice | Scope | Files (implementation slice — NOT this slice) |
|---|---|---|
| **OUTLOOK-CAL-META-1** (this) | Audit + plan (doc-only) | this doc |
| **OUTLOOK-CAL-META-2** | 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | new `integrations/microsoft-outlook-calendar/actions/*.meta.ts` (5); new `integrations/microsoft-outlook-calendar/triggers/eventChanged/eventChanged.meta.ts` (1); new `services/discovery/providers/microsoft-outlook-calendar.ts`; wire into `services/discovery/_registry.ts`; add `"microsoft-outlook-calendar"` to `COVERED_PROVIDERS`; update `providers-route.test.ts` (the pending example moves OFF `microsoft-outlook-calendar` — to what? **see §10** — the test should pivot from "pending provider example" to a "no pending provider remains" assertion, OR pick a known-deferred-trigger provider like Stripe as the new example); tests (§8). **No new resolver files, no billing files touched.** Approach-A flat-time-fields shim TBD in META-2 — if needed, the runtime schema gets a small additive `union(nested | flat)` accept, NOT a behavior change. |
| **OUTLOOK-CAL-MEETINGS** (OPTIONAL, future) | `create_event` `isOnlineMeeting` write toggle | Runtime + meta. Out of v1. |

**Why one implementation slice (not the sibling resolver-first 3):** zero resolvers needed (no consumers / cap blocker / deferral); zero UI-scope schema additions (no new fields); the Approach-A builder shim is a *meta-presentation* concern, not a resolver. Same justification as GCAL-META / GDRIVE-META.

---

## 8. Tests required

- **ActionMeta shape (OUTLOOK-CAL-META-2):** 5 metas parse; `key==="microsoft-outlook-calendar:<type>"`; `category:"calendar"`; outputs mirror handler returns (verbatim key set per §1.1); NO field has `optionsSource` (zero resolvers); Q11 booleans required (create `isAllDay`, `responseRequested`; add_attendees `attendeeType` select); `top` number(1–100) default 25; `body` textarea; `bodyContentType` static select(Text/HTML); `attendees` string-array; `delete_event` `riskLevel:"high"` + `isDestructive:true` + `requiresConfirmation:true`; `create_event`/`update_event`/`add_attendees` medium; `list_events` low; `attendees`/`organizer`/`events`/`attendeesAdded`/`attendeesAlreadyPresent` sensitive; all `producesFileRef`/`consumesFileRef:false`.
- **TriggerMeta shape (OUTLOOK-CAL-META-2):** 1 meta parses; `activation:"webhook"`; `category:"calendar"`; `fields:[]` (empty); payloadShape = the 17 fields; `body` (FORCED) + `attendees` + `organizer` + `onlineMeetingUrl` sensitive; others not.
- **Discovery + provider route:** `listActionMetasForProvider("microsoft-outlook-calendar")`→5, `listTriggerMetasForProvider("microsoft-outlook-calendar")`→1, `listProvidersWithMetadata()` includes it; `/api/providers`→`hasMetadata:true`; `/api/providers/microsoft-outlook-calendar/actions`→5; `/triggers`→1 (new `microsoft-outlook-calendar-provider-route.test.ts` + `microsoft-outlook-calendar-discovery.test.ts` + `microsoft-outlook-calendar-triggers-discovery.test.ts`).
- **Update existing test:** `providers-route.test.ts` — the "still-pending example" must move OFF `microsoft-outlook-calendar`. With 26/26 covered there is no more pending launch-scope provider; the test should pivot to assert "no launch-scope provider remains pending" (a positive shape, not the previous "name a still-pending one" shape) **or** retire that block entirely (preferred). Add positive `microsoft-outlook-calendar hasMetadata:true` assertion.
- **Structural invariants:** `discovery-meta-coverage` passes with `microsoft-outlook-calendar` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 5); `trigger-meta-activation-invariant` passes (no exemption — already wired); `sensitive-output-coverage` passes (`body` FORCED + plan-marks present; no nested `email` exposed).
- **Guards:** no secret-shaped output names; no provider API calls in metadata tests; `microsoft-outlook-calendar:calendars` / `:events` / `:timezones` / `:categories` never referenced by any shipped field.
- **No new resolver tests** — no resolvers ship.

---

## 9. Acceptance criteria

Microsoft Outlook Calendar is metadata/builder-complete only when:

- [ ] all 5 runtime actions have `ActionMeta` (1:1 with the handler registry; `delete_event` = high/destructive/confirm);
- [ ] the `event_changed` webhook trigger has `TriggerMeta` (`fields:[]`) with a passing activation invariant;
- [ ] required options resolvers exist OR are explicitly deferred with rationale — here **all are rejected or deferred** (`calendars`/`categories` rejected — no consumers; `events` deferred — trigger/upstream-fed; `timezones` rejected — cap/no-API);
- [ ] `/api/providers` reports Outlook Calendar `hasMetadata:true` (no longer "coming soon"); actions render with typeable fields;
- [ ] `microsoft-outlook-calendar` is in `COVERED_PROVIDERS`; the `providers-route.test.ts` "still-pending example" block is retired or pivoted (26/26 reached);
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Outlook Calendar tests (§8) pass;
- [ ] **no Outlook Calendar runtime handler behavior changed** (metadata-only — except possibly an additive `union(nested|flat)` time-field shape in `create_event`/`update_event` if Approach A is approved in META-2; this would be a tiny non-behavior-changing schema relaxation);
- [ ] the Approach-A flat-time-fields decision (§2) is signed off in META-2.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Outlook Calendar → covered; **26/26 covered, 0 pending — launch-gap tracker closes**).

---

## 10. Post-26/26 closeout reminder

**"26/26 metadata coverage" ≠ "provider foundation fully complete."** The launch-gap tracker closes when this slice ships, but several known follow-ups remain that are deliberately out of this track's scope. They should be triaged in their own arcs, NOT silently treated as resolved.

**Known deferred items captured across previous slice plans (NOT to forget):**

- **Stripe `event_received` TriggerMeta** — Stripe is COVERED for actions (16 metas) but its single webhook trigger has NO TriggerMeta. The COVERED test deliberately doesn't enforce trigger coverage (precedent set in Slice 3.46), so Stripe sits in COVERED with a known trigger gap. A future STRIPE-TRIGGER-META slice should ship it.
- **Discord triggers** (DISCORD-5) — actions COVERED, triggers deferred per D-DC1.
- **Google Docs triggers** (GDOCS-5) — actions COVERED, no triggers shipped (deliberate staged provider arc).
- **Microsoft OneNote triggers** (ONENOTE-5) — actions COVERED; Graph deprecated OneNote subscriptions May 2023 — polling triggers planned via shared Excel-style infra.
- **Monday triggers** (MONDAY-7) — actions COVERED, 5 webhook triggers (`new_item`, `column_changed`, `item_moved`, `new_subitem`, `new_update`) pending via Monday's `create_webhook` lifecycle.
- **Dropbox `new_file` trigger** (DROPBOX-5) — pending via Dropbox's app-level webhook + per-account cursor reconciliation.
- **Facebook `new_post` / `new_comment` triggers** (FACEBOOK-5) — pending via app-level webhook + per-page `subscribed_apps`.
- **Google Analytics triggers** — REJECTED per D-GA3 (no clean push/webhook; polling fragile). Actions-only is the accepted final state — distinct from "deferred."
- **Shopify resolvers** (optional SHOPIFY-META-3) — actions+1 trigger COVERED; resolvers deferred for the v1 ship.
- **Excel `columns` resolver** — deferred.
- **Airtable `records` resolver** — REJECTED (no consumer).
- **Trello `checklists` / `check_items` resolvers** — REJECTED (no consumer).
- **OneDrive FileRef** — deferred to a future ONEDRIVE-FILEREF runtime slice; the `:drives` resolver REJECTED.
- **Teams `chats` / `messages` resolvers** — deferred (chatId / messageId typeable / trigger-fed); `members` REJECTED.
- **GCal `calendars` resolver** — DEFERRED (scope-blocked; would force reconnect — optional GCAL-CALENDARS-RESOLVER follow-up).
- **GCal `events` / `colors` resolvers** — deferred; `timezones` REJECTED (cap blocker).
- **GDrive `files` resolver** — DEFERRED (trigger/upstream-fed; optional GDRIVE-FILES-RESOLVER).
- **GDrive FileRef** — deferred to a future GDRIVE-FILEREF runtime slice.
- **GDrive share / export actions** — `permissionsCreate` / `filesExport` API helpers exist (tested) but no action wires them; future GDRIVE-SHARE / GDRIVE-EXPORT runtime arcs.
- **Outlook Calendar online-meeting write toggle** — deferred to a future OUTLOOK-CAL-MEETINGS runtime arc.

**Rule going forward:** "Provider foundation launch-ready" requires a separate post-26/26 audit pass that walks the runtime handler registry, the trigger registrations, and every deferred item above — not just `COVERED_PROVIDERS.size === 26`. **Deferred ≠ deleted.** Each deferred item still owns the same definition-of-done as the original track; closing the tracker is a milestone, not a finish line.

---

## Appendix — risks / blockers summary

1. **`calendarId` field doesn't exist on any schema → `calendars` resolver REJECTED (no consumer)** — different blocker than GCal's scope blocker, equivalent outcome (no picker in v1). All actions are pinned to `/me/events`.
2. **Trigger `fields:[]`** — runtime emits one event per notification with no per-workflow filtering. Mirror OneDrive `file_changed` precedent.
3. **Nested `start`/`end` schema shape vs flat builder UX (Approach A)** — workflow authors cannot reasonably hand-type nested JSON. META-2 needs to either (a) split into flat `startDateTime`/`startTimeZone`/`endDateTime`/`endTimeZone` meta fields with builder-side wrapping into the nested object, OR (b) ship an additive `union(nested | flat)` runtime accept. Doc captures the spec; decision lands in META-2. **The current 5-test-files runtime tests should pass either way** because they all use the nested shape today.
4. **Online-meeting write is V1-incomplete** — `create_event` cannot attach a Teams meeting (`isOnlineMeeting` is read-only). Future OUTLOOK-CAL-MEETINGS runtime slice. Not a metadata blocker, but the meta should document the read-only nature in help text on the `isOnlineMeeting` payload field.
5. **`delete_event` destructive — no caller suppression knob** — Graph notifies attendees automatically per tenant policy; meta's `riskDescription` must call this out (workflow authors can't opt out of cancellation emails through this action).
6. **`body` (trigger payload) FORCED sensitive** — name in `SUSPICIOUS_NAMES`. Plan complies; META-2 must mark it.
7. **`organizer` is genuinely PII but the name isn't in the suspicious set** — plan-marked sensitive. Keep as `type:"object"` without nested `fields[]` (same approach as `attendees:array` — avoids the forced-`address` question if I exposed nested fields). _Note:_ `address` is NOT in suspicious-set, but marking the whole organizer object sensitive is the safer move.
8. **`onlineMeetingUrl` sensitivity is the GCal `meetLink` decision again** — access-bearing Teams join URL; mark sensitive (mirror Marcus's GCal sign-off).
9. **`providers-route.test.ts` after 26/26** — there is no remaining "still-pending example" to point at. META-2 should retire the assertion block OR pivot it to a known-deferred-trigger provider (e.g., assert "Stripe is COVERED but has no shipped trigger meta"). Plan suggests: retire the block, add a positive `microsoft-outlook-calendar hasMetadata:true` assertion.
10. **`_registry.ts` will likely cross 462 lines** (pre-existing pattern: ~6 lines per provider via import + 2 spreads — was 456 after GDRIVE-META-2). Same pre-existing max-lines warning; refactor opportunity documented across all sibling closeouts.
11. **Branch/worktree caution.** Authored on the shared `ai-12c-planner-json-only-hardening` branch with interleaved AI + provider commits; explicit-path staging only; verify branch topology before any push/PR.

---

## 11. OUTLOOK-CAL-META-2 outcomes (shipped 2026-05-25)

**Scope delivered:** 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + `COVERED_PROVIDERS` flip + Approach-A flat-time-fields schema shim + tests + docs. **Microsoft Outlook Calendar is now builder-visible — `/api/providers` reports `hasMetadata:true`.** Covered providers **25/26 → 26/26 — launch-gap tracker CLOSES.** **No new resolvers, no billing change, no FileRef runtime.** Single implementation slice — same 2-slice compression as GCAL-META / GDRIVE-META. **The Approach-A schema relaxation is the only runtime touch — narrow, additive, behavior-preserving** (existing direct-handler tests passing nested input continue to work unchanged; 161 existing Outlook Calendar tests + 295 targeted-slice tests + 10,119 broad-regression tests all pass).

### 11.1 ActionMeta (5, displayOrder 10..50) — `integrations/microsoft-outlook-calendar/actions/<action>.meta.ts`

`create_event` (10), `list_events` (20), `update_event` (30), `delete_event` (40), `add_attendees` (50). All `category:"calendar"`, `requiresIntegration:true`, all `producesFileRef:false`/`consumesFileRef:false`.

- **Risk:** `create_event` / `update_event` / `add_attendees` **medium**; `list_events` **low**; **`delete_event` high + `isDestructive:true` + `requiresConfirmation:true`** (Microsoft Graph auto-notifies attendees per tenant mail-flow policy — no caller suppress knob; mirrors GCal/OneDrive/Airtable destructive trio). `riskDescription` explicitly says "no caller-side knob to suppress."
- **Q11 required wired:** `create_event.{isAllDay, responseRequested}` required booleans; `add_attendees.attendeeType` required select(`required`/`optional`); `bodyContentType` lives as field-level optional with help text (cross-field rule enforced by schema refine).

### 11.2 Approach-A flat-time-fields schema shim (the only runtime touch)

`createEvent.schema.ts` and `updateEvent.schema.ts` now wrap their canonical strict schemas in `z.preprocess(normalizeFlatStartEnd, …)`. The normalizer:
- Passes input through unchanged when only the nested `start`/`end` shape is present (zero behavior change for direct-handler callers / API consumers).
- When flat fields are present (`startDateTime` / `startTimeZone` / `endDateTime` / `endTimeZone`), translates them into the nested shape before strict validation.
- Empty / whitespace-only flat strings are treated as absent (the Q11 "both required" invariant still fires on create_event).
- Mixed input prefers nested.
- Strips the flat keys before strict validation, so the `.strict()` rejection of unknown fields is preserved.

The meta exposes only the 4 flat fields (no nested `start`/`end` field) — the builder UX is honest text inputs; the handler receives the canonical nested shape after parse.

### 11.3 No resolver wiring

Zero `optionsSource` references anywhere on the 5 actions or the trigger (asserted by tests). `eventId` on update/delete/add_attendees is typeable text. `microsoft-outlook-calendar:calendars` / `:events` / `:timezones` / `:categories` all rejected-or-deferred per §3 — none referenced.

### 11.4 TriggerMeta (1 Graph subscription webhook) — `triggers/eventChanged/eventChanged.meta.ts`

`event_changed`: `activation:"webhook"`, `requiresIntegration:true`, `category:"calendar"`, **`fields:[]`** (runtime has no per-workflow filtering — mirrors OneDrive `file_changed`). 17-field payload (matches `normalize.ts` exactly).

### 11.5 Discovery + COVERED + retired pending-example block

New `services/discovery/providers/microsoft-outlook-calendar.ts` (`MICROSOFT_OUTLOOK_CALENDAR_ACTION_METAS` ×5 + `MICROSOFT_OUTLOOK_CALENDAR_TRIGGER_METAS` ×1), spread into `services/discovery/_registry.ts`. `microsoft-outlook-calendar` added to `COVERED_PROVIDERS` with an inline-comment §10 closeout reminder. **`providers-route.test.ts` "still-pending example" block RETIRED** (per slice instruction "prefer retiring") — replaced with a positive `microsoft-outlook-calendar hasMetadata:true` assertion that mirrors the Google Drive / Calendar / Teams positive assertions. The retired block's comment explains why (deferred items live in distinct arc plans, not inlined as a single example).

### 11.6 Sensitive-output handling

**`body` (trigger payload) FORCED sensitive by `sensitive-output-coverage` (name in SUSPICIOUS_NAMES)** — plan complies. **Plan-marked (deliberate, not blanket):**
- `attendees` arrays on `create_event` / `update_event` outputs + the trigger payload (email PII; kept as flat `array` without nested `fields[]`).
- `organizer` objects on `create_event` / `update_event` outputs + the trigger payload (organizer email PII; kept as flat `object` without nested `fields[]`).
- `events` array on `list_events` (bulk read carrying attendee + organizer emails + onlineMeetingUrl).
- `attendeesAdded` / `attendeesAlreadyPresent` arrays on `add_attendees`.
- `onlineMeetingUrl` (trigger payload — Teams meeting join URL is access-bearing; mirror GCal `meetLink` Marcus decision).

**NOT marked** (mirror precedent — ids / titles / location / dates / enums / `webLink` deeplink): `id` / `eventId`, `subject` (title-like — mirror Teams subject / GCal summary), `start`/`end` (date objects), `isAllDay`, `location` (string `displayName`), `webLink` (auth-gated deeplink — mirror OneDrive `webUrl` / GCal `htmlLink`), `count`, `hasMore`, `nextLink`, `deleted`, `alreadyMissing`, `attendeesTotal`, `importance`, `sensitivity` (the field, not the action-meta concept), `showAs`, `createdDateTime`, `lastModifiedDateTime`, `changeType`, `isOnlineMeeting`.

### 11.7 Tests

- `microsoft-outlook-calendar-discovery.test.ts` (action surface — 17 assertions across 5 describes).
- `microsoft-outlook-calendar-triggers-discovery.test.ts` (trigger surface — 7 assertions including the `fields:[]` invariant + FORCED-`body` + plan-marked sensitive set).
- `microsoft-outlook-calendar-provider-route.test.ts` (route — hasMetadata, action/trigger wire shape, Approach-A flat-time-fields visibility, NO-resolver-anywhere, destructive delete, sensitive marks).
- **Schema-level Approach-A tests:** `createEvent.schema.test.ts` + `updateEvent.schema.test.ts` (8 + 8 assertions each: nested-passthrough regression guard, flat-normalization, omit-timeZone-when-absent, empty/whitespace-fails-required-pair, nested-wins-on-mixed, strict-mode-preserved, Q11-bodyContentType-refine-preserved, etc.).
- `providers-route.test.ts` updated (pending-example block retired + positive Outlook Calendar assertion added).
- Structure invariants: `discovery-meta-coverage` passes with `microsoft-outlook-calendar` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 5); `trigger-meta-activation-invariant` passes (no exemption — already wired); `sensitive-output-coverage` passes (`body` FORCED, no nested `email` exposed).
- **Targeted-slice: 295/295 across 27 suites. Broad regression: 10,119/10,119 across 896 suites** (full integrations/discovery/providers/contracts/structure).

### 11.8 Acceptance criteria (§9) — met

All 5 actions have ActionMeta; `event_changed` has TriggerMeta (`fields:[]`) + passing activation invariant; all resolvers explicitly deferred-or-rejected (none referenced); `/api/providers` Outlook Calendar `hasMetadata:true`; `microsoft-outlook-calendar` in `COVERED_PROVIDERS`; providers-route pending-example block retired (26/26 reached); structure invariants pass; targeted tests pass; **runtime handler behavior unchanged** — the Approach-A `z.preprocess` is narrow + additive (nested input → unchanged behavior); the Approach-A flat-time-fields decision + Marcus's destructive-delete / FileRef-deferred / `body`-FORCED-sensitive / `name`-not-sensitive / `onlineMeetingUrl`-sensitive decisions all signed off.

### 11.9 Post-26/26 closeout reminder — the launch-gap tracker closes here BUT...

**Per the OUTLOOK-CAL-META-1 plan §10, "26/26 covered" ≠ "provider foundation fully complete."** The launch-gap tracker closes with this slice, but several known follow-ups remain — captured in §10 of the plan doc + the tracker's status snapshot — and they are **deferred, not deleted**. A subsequent post-26/26 audit pass should walk the runtime handler registry, the trigger registrations, and every deferred item before declaring the provider foundation launch-ready. Known backlog:

- **Stripe `event_received` TriggerMeta** — Stripe is COVERED for actions (16 metas) but its single webhook trigger has NO TriggerMeta. Future STRIPE-TRIGGER-META slice.
- **Discord / Google Docs / OneNote / Monday / Dropbox / Facebook triggers** — actions COVERED, triggers in their own deferred arcs (DISCORD-5, GDOCS-5, ONENOTE-5, MONDAY-7, DROPBOX-5, FACEBOOK-5).
- **Google Analytics triggers** — REJECTED per D-GA3 (no clean push/webhook; polling fragile). Actions-only is the accepted final state — distinct from "deferred."
- **Shopify optional SHOPIFY-META-3 resolvers** — deferred.
- **Excel `columns` resolver** — deferred.
- **GCal `calendars` resolver** — deferred (scope-blocked; would force reconnect — optional GCAL-CALENDARS-RESOLVER follow-up).
- **GCal `events` / `colors` resolvers** — deferred.
- **GDrive `files` resolver** — deferred (optional GDRIVE-FILES-RESOLVER).
- **GDrive FileRef** — deferred to future GDRIVE-FILEREF runtime slice.
- **GDrive share / export actions** — `permissionsCreate` / `filesExport` API helpers exist (tested) but no action wires them; future GDRIVE-SHARE / GDRIVE-EXPORT.
- **OneDrive FileRef** — deferred to future ONEDRIVE-FILEREF.
- **Teams `chats` / `messages` resolvers** — deferred (chatId / messageId typeable / trigger-fed).
- **Outlook Calendar online-meeting write toggle** — deferred to future OUTLOOK-CAL-MEETINGS runtime arc.

**Rule going forward:** "Provider foundation launch-ready" requires a separate post-26/26 audit pass — not just `COVERED_PROVIDERS.size === 26`. Each deferred item still owns its definition-of-done; closing the tracker is a milestone, not a finish line.
