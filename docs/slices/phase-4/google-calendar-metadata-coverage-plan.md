# Google Calendar — Builder Metadata Coverage Plan (GCAL-META-1)

**Slice:** 4.GCAL-META-1 (this plan) → GCAL-META-2 (metas + trigger + COVERED flip — single implementation slice; **no resolver slice needed**, see §3/§6).
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch (verified at authoring):** `ai-12b-planner-patch-shape-hardening` (shared worktree — provider + AI commits interleaved; verify topology before push, see header note).
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Sibling precedents:** [`teams-metadata-coverage-plan.md`](./providers/teams-metadata-coverage-plan.md) (no-UI-scope-additions, parents already real fields), [`onedrive-metadata-coverage-plan.md`](./providers/onedrive-metadata-coverage-plan.md) + [`excel-metadata-coverage-plan.md`](./providers/excel-metadata-coverage-plan.md) (Google/Graph resolver + destructive-delete patterns), [`trello-metadata-coverage-plan.md`](./providers/trello-metadata-coverage-plan.md) (resolver-first, opaque ids).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Google Calendar is the **7th** provider in the pending-metadata launch-gap arc (after Shopify, Excel, Airtable, Trello, OneDrive, Teams) and the **1st of the 3 remaining** launch-scope providers (`google-calendar`, `google-drive`, `microsoft-outlook-calendar`). **Current state (code-verified):** **5 runtime actions + 1 webhook (watch-based push) trigger** registered and real; **0 ActionMeta, 0 TriggerMeta, 0 options resolvers**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Calendar renders as **"coming soon"**. It is the current canonical "still-pending" example in [`providers-route.test.ts:201`](../../../tests/unit/app/api/providers/providers-route.test.ts).

**Five facts drive the slice plan:**

1. **Google Calendar needs ZERO options resolvers for v1.** Both id-bearing fields ship as typeable text with sensible defaults: `calendarId` defaults to `"primary"` on every handler schema, and `eventId` is almost always trigger-fed (`{{trigger.eventId}}`) or upstream-fed (`{{list_events.firstEventId}}`). This is the **first** pending provider with no required resolver work (contrast Teams/Excel/Airtable/Trello/OneDrive, which were all resolver-first).
2. **The `calendars` picker is hard-blocked by an OAuth scope gap.** The manifest grants only `calendar.events` + `userinfo.email` — **NOT** `calendarList.list`/`calendar.readonly` ([`manifest.ts:45-52`](../../../integrations/google-calendar/manifest.ts), and the manifest's own comment says so explicitly). A `google-calendar:calendars` resolver would require a **scope addition (→ every connected user must RECONNECT)** *and* a new `calendarList` API helper (none exists — `api/` is events-only). So a calendar picker is a **product decision + future scope-gated slice**, not part of the launch-critical metadata.
3. **NO UI-scope schema additions** — `calendarId` and `eventId` are ALREADY real fields on every consuming schema (like Teams `teamId`/`channelId`; unlike Trello `boardId` / OneDrive `parentItemId`). So GCAL-META-2 touches **no runtime schema** — pure additive metadata.
4. **There IS a destructive action.** `delete_event` irreversibly removes an event and (per `sendNotifications`) emails cancellations to attendees → **high / isDestructive / requiresConfirmation** (matching Airtable `delete_record`, Excel `delete_row`, OneDrive `delete_item`). The other 4 are writes (medium) or a read (low).
5. **The PII is in array outputs whose NAMES aren't in the suspicious set.** Attendee emails live inside `attendees[]` / `events[]`, and neither name is in `sensitive-output-coverage`'s `SUSPICIOUS_NAMES`. The structural test will **not** force them — so the plan marks them sensitive **deliberately**, and must avoid naming any nested output field literally `email` unless it is marked.

---

## 1. Current Google Calendar runtime inventory

**Manifest** ([`integrations/google-calendar/manifest.ts`](../../../integrations/google-calendar/manifest.ts)): id `google-calendar`, displayName "Google Calendar". `apiVersion:"v3"`, `tokenScope:"user"` (one integration per (user, email), mirrors Gmail), `oauthFlows:["v2"]`, `accountIdField:"email"`, `refreshable:true`, `healthCheckIntervalMs:6h`. Capabilities `oauth/webhookTrigger/actions:true`, `pollingTrigger:false`. **Scopes (verified):** `calendar.events` + `userinfo.email` ONLY. **No `calendarList`/`calendar.readonly` scope** → see §3 (the `calendars` resolver blocker).

**OAuth** ([`oauth.ts`](../../../integrations/google-calendar/oauth.ts)): shared Google PKCE flow (`integrations/_shared/google/oauth.ts`); accountId resolved via OIDC userinfo. **Auth is refreshable** (access_type=offline) → all reads/writes go through `refreshAndRetry({provider:"google-calendar", accountId})`.

**API helpers** ([`api/`](../../../integrations/google-calendar/api/)): `eventsInsert`, `eventsList`, `eventsGet`, `eventsPatch`, `eventsDelete`, `eventsWatch`, `channelsStop`, `_base` (`calendarApiBase()`), `errors` (`NotFoundError`, `SyncTokenExpiredError`). **There is NO `calendarList` helper and NO `colors` helper** — the surface is events-only (relevant to the deferred `calendars`/`colors` resolvers, §3).

### 1.1 Registered action handlers (5)

Source of truth: [`services/execution/handlers/_registry.ts:384-388`](../../../services/execution/handlers/_registry.ts). Keys verified verbatim. `*` = required at the schema layer (no default). "Picker?" = whether a field would want an options resolver.

| # | Action key | Handler / schema | Key config fields | Output keys | Risk | Sensitive outputs | Picker? |
|---|---|---|---|---|---|---|---|
| 1 | `create_event` | createEvent.ts / `CreateEventConfigSchema` | calendarId(default `primary`), summary*, description?, location?, allDay(def false), startDateTime?/endDateTime? (req when !allDay), startDate?/endDate? (req when allDay), timezone?, attendees?, googleMeet(def false), **sendNotifications*** (all\|externalOnly\|none), **guestsCanInviteOthers*** (bool), **guestsCanSeeOtherGuests*** (bool), guestsCanModify?, visibility?, transparency?, colorId? | `{eventId, htmlLink, summary, start, end, attendees, meetLink, status}` | create → **medium** | `attendees`, `meetLink` (plan-marked) | calendarId→**text/primary (defer)**; attendees=typed |
| 2 | `list_events` | listEvents.ts / `ListEventsConfigSchema` | calendarId(default `primary`), timeMin?, timeMax?, maxResults(1–2500, def 250), query?, orderBy?(startTime\|updated), singleEvents(def true), showDeleted(def false), pageToken? | `{events, count, firstEventId, lastEventId, nextPageToken, nextSyncToken, calendarId, timeMin, timeMax}` | read → **low** | `events` (plan-marked) | calendarId→**text/primary (defer)** |
| 3 | `update_event` | updateEvent.ts / `UpdateEventConfigSchema` | calendarId(default `primary`), eventId*, summary?, description?, location?, startDateTime?/endDateTime? (both-or-neither), timezone?, attendees? (**replaces**), googleMeet?, **sendNotifications***, guestsCanInviteOthers?, guestsCanSeeOtherGuests?, guestsCanModify?, visibility?, transparency?, colorId? | `{eventId, htmlLink, summary, description, location, start, end, attendees, status, updated}` | update → **medium** | `attendees` (plan-marked) | calendarId→text/primary; eventId→**text (defer)** |
| 4 | `delete_event` | deleteEvent.ts / `DeleteEventConfigSchema` | calendarId(default `primary`), eventId*, **sendNotifications*** | `{eventId, deleted, alreadyDeleted, deletedAt, eventTitle, eventStart, eventEnd, calendarId}` | delete → **high / DESTRUCTIVE / confirm** | none forced (eventTitle/dates not PII-named) | calendarId→text/primary; eventId→**text (defer)** |
| 5 | `add_attendees` | addAttendees.ts / `AddAttendeesConfigSchema` | calendarId(default `primary`), eventId*, attendees*, **sendNotifications*** | `{eventId, actuallyAdded, addedAttendees, alreadyInvited, attendees, totalAttendees}` | update → **medium** | `attendees` (+`addedAttendees`/`alreadyInvited`, plan-marked) | calendarId→text/primary; eventId→**text (defer)** |

**Notable runtime facts (V2 already fixed V1 bugs — see schema JSDocs):**
- **Q11 (no hidden defaults):** `create_event` requires `sendNotifications` + `guestsCanInviteOthers` + `guestsCanSeeOtherGuests`; `update_event`/`delete_event`/`add_attendees` require `sendNotifications`. The metas must mark these `required:true`.
- **Time encoding** on `create_event` is mutually exclusive (`allDay` toggles dateTime vs date pairs, enforced by `superRefine`); `update_event` time edits require BOTH `startDateTime`+`endDateTime` (the V1 `'09:00'` synthesis bug is fixed by failing fast).
- **Google Meet is boolean-only** (V1's mixed boolean/object shape fixed); requestId is `meet-{runId}:{nodeId}` (Q4-stable).
- **`update_event.attendees` REPLACES** the list; **`add_attendees` MERGES** (fetches existing, case-insensitive diff, short-circuits if nothing new). Help text must make this distinction clear.
- **`delete_event` is idempotent at the API layer** (`alreadyDeleted` short-circuit on 404) — but it is still destructive (removes the event + emails cancellations). Idempotency ≠ non-destructive.

### 1.2 Registered trigger (1 — webhook watch-based push)

[`triggers/eventChanged/`](../../../integrations/google-calendar/triggers/eventChanged/). **Registered key = `event_changed`** (note: directory is `eventChanged`, runtime key is snake_case `event_changed`). `index.ts` does `registerActivation("google-calendar","event_changed",activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(calendarEventChangedSubscriptionHandler)`. Imported at [`integrations/_registry.ts:40`](../../../integrations/_registry.ts) (`import "./google-calendar/triggers/eventChanged";`) → loads at module init, so the **trigger-meta-activation-invariant will pass with no `_registry` change and no exemption** once TriggerMeta lands.

| Trigger key | Normalized type | Model | Lifecycle | User config | Ship now? |
|---|---|---|---|---|---|
| `event_changed` | google-calendar.event_changed | **webhook** (Google `events.watch` push channel → `/api/webhooks/google-calendar`) | `activate`: (1) initial sync — paginate `events.list` to capture baseline `nextSyncToken` (the "first-poll-miss" guard, applied to push); (2) `events.watch` registers a signed channel, persists `{channelId, resourceId, syncToken, expiresAt, type:"subscription-watch"}`. `pull` fetches the delta via `events.list?syncToken=…` (410 Gone → re-baseline, dispatch 0). **renewal** via `subscriptionRegistry` before the ~7-day expiry. `deactivate` stops the channel. | `calendarId` (default `primary`) | ✅ yes |

Payload (from [`normalize.ts`](../../../integrations/google-calendar/triggers/eventChanged/normalize.ts)): `changeKind` (`created`\|`updated`\|`cancelled` — heuristic on `status` + `created===updated`), `calendarId`, `eventId`, `summary`, `description`, `location`, `start`, `end`, `attendees`, `htmlLink`, `status`, `updated` — **12 fields**. Ships TriggerMeta; config = the single `calendarId` field (the watch anchor).

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts`. **Field names camelCase**, verbatim to the runtime schemas.

**Common defaults:** `requiresIntegration:true`; **`category:"calendar"`** (the contract has a dedicated `calendar` ActionCategory — use it, unlike Teams' `messaging`); sequential `displayOrder` (10..50); `producesFileRef:false`, `consumesFileRef:false` for all (no FileRef surface). _(Reminder: every `: ActionMeta` literal must set `producesFileRef`/`consumesFileRef`/`isDestructive`/`requiresConfirmation`/`riskLevel` explicitly — Zod `.default()` applies only at `.parse()`, per the AIRTABLE-META-3 learning.)_

**Risk classification:**
- **low** — `list_events` (pure read).
- **medium** — `create_event`, `update_event`, `add_attendees` (recoverable external mutations; recoverable via delete/patch).
- **high / `isDestructive:true` / `requiresConfirmation:true`** — `delete_event` (irreversible event removal + attendee cancellation emails). Must pair `riskLevel:"high"` (contract `superRefine` requires it). `riskDescription`: "Permanently deletes the event; attendees may receive cancellation emails."

**Field-type mapping** (every type from [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `calendarId` → **text**, default `"primary"`, optional. Picker (`google-calendar:calendars`) **deferred** (§3 — scope blocker). Placeholder: `"primary (or a calendar id like you@gmail.com)"`. _Not a combobox in v1 — a combobox requires `optionsSource` or static `options`, and we have neither yet._
- `eventId` → **text**, required (update/delete/add_attendees). Picker **deferred** (§3 — trigger/upstream-fed). Placeholder: `"Event id (e.g. {{trigger.eventId}} or from List Events)."`
- `summary` → **text**. Required on `create_event`; optional on `update_event`.
- `description` → **textarea**, optional.
- `location` → **text**, optional.
- `allDay` → **boolean** (create only), `defaultValue:false`.
- `startDateTime` / `endDateTime` / `startDate` / `endDate` → **text** (ISO 8601 / `YYYY-MM-DD`). Help text mirrors the schema's allDay/timed split. (No dedicated datetime FieldType exists — text is the correct v1 renderer.)
- `timezone` → **text**, optional. Picker **rejected** (§3 — IANA list > 256-option cap + no API; `resolveTimezone` falls back to UTC). Placeholder: `"IANA tz (e.g. America/New_York); defaults to UTC."`
- `attendees` → **string-array** (free-text email list; routed through Q7 `parseRecipients` at runtime), optional on create/update, required on add_attendees. (`string-array`, not `combobox+multiple` — there is no attendee options source.)
- `googleMeet` → **boolean**, `defaultValue:false`.
- `sendNotifications` → **select** (`all` / `externalOnly` / `none`), **required** (Q11).
- `guestsCanInviteOthers` / `guestsCanSeeOtherGuests` → **boolean**, **required on create** (Q11), optional on update.
- `guestsCanModify` → **boolean**, optional.
- `visibility` → **select** (`default`/`public`/`private`/`confidential`), optional.
- `transparency` → **select** (`opaque`/`transparent`), optional.
- `colorId` → **text**, optional. Picker **deferred** (§3 — niche; no helper). Placeholder: `"Google color id 1–11 (optional)."`
- `maxResults` → **number**, optional, `numeric:{min:1,max:2500,integer:true}`, `defaultValue:250`.
- `query` → **text**, optional.
- `orderBy` → **select** (`startTime`/`updated`), optional.
- `singleEvents` → **boolean**, `defaultValue:true`.
- `showDeleted` → **boolean**, `defaultValue:false`.
- `pageToken` → **text**, optional.

**Sensitive outputs** (see §nuance in header fact 5 — the structural test forces almost nothing here; these are deliberate plan marks):
- **Plan-marked sensitive (attendee PII / bulk read content):**
  - `attendees` on `create_event` / `update_event` / `add_attendees` outputs **and** the trigger payload — array of `{email,…}` = attendee email PII (fresh provider-side data on read paths).
  - `events` on `list_events` — bulk array of full event resources carrying per-event content + attendee emails (mirrors Notion `results` / Gmail `messages`).
  - `addedAttendees` / `alreadyInvited` on `add_attendees` — email lists. _(These are caller-supplied echoes, like the Gmail `to` allowlist, so marking is optional; recommend marking — it's cheap and correct.)_
  - `meetLink` on `create_event` — **decision (lean: mark sensitive).** A Google Meet join URL is access-bearing. Counter-precedent: Teams `webUrl` is NOT marked (it's a deeplink, not a join token), and Meet links are routinely embedded in invites and gated by the meeting lobby. Recommend **mark sensitive** (conservative) and flag for sign-off (§Appendix risk 6).
- **NOT marked** (ids / titles / urls / dates / counts / cursors — consistent with the "ids & names not over-marked" precedent): `eventId`, `htmlLink`, `calendarId`, `status`, `summary`, `description`, `location`, `start`, `end`, `count`, `firstEventId`, `lastEventId`, `nextPageToken`, `nextSyncToken`, `deleted`, `alreadyDeleted`, `deletedAt`, `eventTitle`, `eventStart`, `eventEnd`, `actuallyAdded`, `totalAttendees`, `updated`, `changeKind`.
  - **`summary`/`description`/`location` decision:** event *content*, but treated like Teams `subject` (a title, not a message body) and not in the suspicious set → **not marked**. Flag for sign-off if product wants event content redacted in run-details.
  - **Secret-name guard:** `nextSyncToken`/`nextPageToken` are pagination cursors, **not** the exact name `token` — they pass the `sensitive-output-coverage` "no secret output" test (which is exact-match). No output is literally named `token`/`secret`/`email` etc.
  - **Avoid nested `email` fields:** keep `attendees`/`events` as `type:"array"` **without** nested `fields[]` in v1 (the picker renders them as array chips). If a future slice exposes nested attendee sub-fields, any child named `email` is FORCED sensitive by the structural test — name + mark deliberately then.

**Task cost:** per the central policy ([`lib/workflows/cost-calculator.ts`](../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`), each Calendar action bills **1 task on success** (the read included). No per-meta override. Today these 5 are `unknown_node` (0 + warning) because they have no meta; adding metas makes them billable at the default 1-task category cost **automatically via grounding** — no billing code edit (per `task-cost-billing-foundation-closeout.md`). **This track changes no billing code.**

---

## 3. Options resolver audit

**Headline: Google Calendar needs ZERO resolvers for v1.** All id-bearing fields ship as typeable text with sensible defaults (`calendarId="primary"`) or upstream-fed values (`eventId` from the trigger / `list_events`). Auth is refreshable, so IF a resolver were built it would use `refreshAndRetry({provider:"google-calendar", accountId})` (Gmail/Drive pattern).

| Resolver | Serves | Endpoint / helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `google-calendar:calendars` | `calendarId` on all 5 actions + the trigger | **MISSING** — needs new `calendarList` helper (`GET /calendar/v3/users/me/calendarList`) **AND** a new OAuth scope | none | **DEFER (v1) — SCOPE-BLOCKED** | Yes — defaults `primary`, typeable |
| `google-calendar:events` | `eventId` on update/delete/add_attendees | (reuse `eventsList`) | `["calendarId"]` | **DEFER (v1)** — event lists are large, time-unbounded, ordering-ambiguous; `eventId` overwhelmingly flows from the `event_changed` trigger or `list_events.firstEventId`. Don't overbuild an expensive event picker (explicit task guidance). | Yes — typeable / `{{trigger.eventId}}` |
| `google-calendar:timezones` | `timezone` | (none — static IANA db) | none | **REJECT (v1)** — not a provider resolver (no API). A static `select` is **infeasible**: the IANA list (~400 entries) exceeds `FieldOptionSchema`'s 256-option cap. `resolveTimezone` already falls back to UTC. | Yes — typeable |
| `google-calendar:colors` | `colorId` | (would need new `colors.get` helper — `GET /calendar/v3/colors`) | none | **DEFER/REJECT (v1)** — niche optional field; no helper exists; colors endpoint may need `calendar.readonly`. A future static `select` of the 11 fixed event-color ids (fits the cap) is a possible nicety. | Yes — typeable |

**The `calendars` blocker (the main UX gap — open product decision):** every `calendarId` field would benefit from a picker, but it is **hard-blocked**:
1. **Scope.** The manifest grants `calendar.events` only; listing calendars needs `calendarList.list` (i.e. `calendar.readonly` or `calendar.calendarlist.readonly`). Adding it is a **scope change** → **every already-connected Google Calendar user must RECONNECT** to grant the new scope (and the health/reconnect UX must drive that). The manifest's own comment ([`manifest.ts:20-23`](../../../integrations/google-calendar/manifest.ts)) anticipates exactly this: _"It does NOT grant calendarList.list … the Calendar dropdown UI (deferred) will need a separate scope OR continue to require a manually-supplied calendarId. For Batch 1 the action's calendarId field defaults to 'primary'."_
2. **Helper.** No `calendarList` API helper exists (`api/` is events-only) — a new wrapper would be needed.

**Recommendation:** ship `calendarId` as a **typeable text field defaulting to `"primary"`** for v1 (covers the overwhelmingly common single-calendar case with zero friction), and treat the `calendars` picker as a **separate, scope-gated, product-approved follow-up** (`GCAL-CALENDARS-RESOLVER`, §6) — NOT part of launch-critical metadata. _Marcus decision: add the `calendarList` scope + reconnect prompt now, or accept typeable `calendarId` for v1?_

**No UI-scope schema additions:** `calendarId` and `eventId` are already real fields on every consumer (like Teams), so even when the `calendars`/`events` resolvers eventually land, the parent fields already exist — META-2 touches no runtime schema.

---

## 4. Trigger metadata audit

The single `event_changed` trigger is runtime-real, webhook (Google `events.watch` push with syncToken delta + ~7-day renewal), activation-registered + loaded → **ships TriggerMeta in this arc.**

`TriggerMeta` (`activation:"webhook"`, `category:"calendar"`, `requiresIntegration:true`):
- **Fields:** `calendarId` (**text**, default `"primary"`, optional — the watch anchor; same `calendars`-resolver deferral as the actions, §3). No other config (`activate` reads only `node.config?.calendarId`).
- **payloadShape (12 fields):** `changeKind`, `calendarId`, `eventId`, `summary`, `description`, `location`, `start`, `end`, `attendees`, `htmlLink`, `status`, `updated`. **Sensitive:** `attendees` (attendee email PII). Not marked: `changeKind`/`calendarId`/`eventId`/`summary`/`description`/`location`/`start`/`end`/`htmlLink`/`status`/`updated` (ids / titles / deeplink / dates — same calls as the action outputs).
- **Activation invariant:** satisfied — `registerActivation("google-calendar","event_changed",…)` loaded via [`integrations/_registry.ts:40`](../../../integrations/_registry.ts). No `SHARED_INFRA_EXEMPT_KEYS` entry (real per-calendar push channel).
- Trigger coverage is **not** gated by `discovery-meta-coverage` (precedent: all Phase-4 providers) — `trigger-meta-activation-invariant` is the gate, and it passes.

**Single-trigger model note:** `changeKind` distinguishes created/updated/cancelled in one trigger (per the runtime design). Workflow authors branch on `payload.changeKind` downstream. No need to split into 3 trigger types for v1 (and doing so would be a runtime change, out of scope).

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is settled (Calendar Batch 1 shipped 5 actions + 1 watch trigger; the V2 schemas already FIXED the V1 bugs — Meet boolean-vs-object, `'09:00'` time synthesis, `Date.now()` requestId). Metadata-only decisions:

- **All 5 actions + the `event_changed` trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime behavior change. **No UI-scope schema additions** (parents are real fields). Metadata documents the **V2** surface, not V1.
- **`calendarId` → text/default `"primary"`** (resolver DEFERRED, scope-blocked). ADAPT to a `combobox` only in the future scope-gated `GCAL-CALENDARS-RESOLVER` slice.
- **`eventId` → text** (events resolver DEFERRED — trigger/upstream-fed).
- **`google-calendar:calendars` → DEFER (v1):** scope + helper blocker; open Marcus decision.
- **`google-calendar:events` → DEFER (v1):** large/ambiguous list; eventId upstream-fed.
- **`google-calendar:timezones` → REJECT (v1):** static list, no API, exceeds the 256-option cap; `resolveTimezone` covers fallback.
- **`google-calendar:colors` → DEFER/REJECT (v1):** niche; no helper.
- **`attendees` → string-array; `description` → textarea; enums → select; `maxResults` → number; booleans → boolean.** No FieldType mismatch.
- **`delete_event` → high / isDestructive / requiresConfirmation** (the destructive trio — matches Airtable/Excel/OneDrive delete precedents). `create_event`/`update_event`/`add_attendees` → medium; `list_events` → low.
- **`meetLink` → mark sensitive** (lean conservative; §2 + Appendix risk 6 — sign-off).
- **REJECT (runtime, already decided — not re-litigated):** calendar create/delete, ACL/sharing actions, free/busy queries, separate created/updated/cancelled trigger split, the `calendarList`/`calendar.readonly` scope (until the product decision in §3).

---

## 6. Implementation slices

**Recommended: a 2-slice arc (audit + ONE implementation slice).** Google Calendar is the first pending provider that needs **no resolver slice** and **no UI-scope schema slice**, so the resolver-first 3-slice cadence used for Teams/Excel/Airtable/Trello/OneDrive collapses.

| Slice | Scope | Files (implementation slice — NOT this slice) |
|---|---|---|
| **GCAL-META-1** (this) | Audit + plan (doc-only) | this doc |
| **GCAL-META-2** | 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | new `integrations/google-calendar/actions/*.meta.ts` (5); new `integrations/google-calendar/triggers/eventChanged/eventChanged.meta.ts` (1); new `services/discovery/providers/google-calendar.ts`; wire into `services/discovery/_registry.ts`; add `"google-calendar"` to `COVERED_PROVIDERS` (`tests/structure/discovery-meta-coverage.test.ts`); update [`providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) (move the "still-pending" example off `google-calendar` → `google-drive`); tests (§7). **No schema files, no resolver files, no billing files touched.** |
| **GCAL-CALENDARS-RESOLVER** (OPTIONAL, future, product-gated) | `calendars` picker — only if product approves the scope add | manifest scope add (`calendar.readonly`/`calendarList.readonly`) + **reconnect UX for existing users** + new `integrations/google-calendar/api/calendarList.ts` helper + `integrations/google-calendar/options/calendars.ts` resolver + register in `services/options/_registry.ts` + flip `calendarId` fields to `combobox`+`optionsSource:"google-calendar:calendars"` + resolver tests. **Out of the launch-critical path.** |

**Why one implementation slice (not the sibling resolver-first 3):** there are **no resolvers to ship** (calendarId=primary/typeable; eventId trigger/upstream-fed; timezone rejected; colors deferred) and **no UI-scope schema additions** (calendarId/eventId already real fields). GCAL-META-2 is therefore a self-contained metadata-only slice: 5 ActionMeta + 1 TriggerMeta + sub-registry + COVERED flip. The `calendars` resolver is intentionally carved out into its own scope-gated, product-approved follow-up rather than blocking launch-visibility on a reconnect-forcing scope change.

---

## 7. Tests required

- **ActionMeta shape (GCAL-META-2):** 5 metas parse; `key==="google-calendar:<type>"`; `category:"calendar"`; outputs mirror handler returns (verbatim key set per §1.1); `calendarId` text w/ default `"primary"` + **no** `optionsSource`; `eventId` text + no `optionsSource`; `sendNotifications` select required; create's `guestsCanInviteOthers`/`guestsCanSeeOtherGuests` required; `attendees` string-array; `maxResults` number(1–2500); `delete_event` `riskLevel:"high"` + `isDestructive:true` + `requiresConfirmation:true`; `create_event`/`update_event`/`add_attendees` medium; `list_events` low; `attendees`/`events`/`meetLink` sensitive; all `producesFileRef`/`consumesFileRef:false`.
- **TriggerMeta shape (GCAL-META-2):** 1 meta parses; `activation:"webhook"`; `category:"calendar"`; single `calendarId` field (text, default primary); payloadShape = the 12 fields; `attendees` sensitive.
- **Discovery + provider route:** `listActionMetasForProvider("google-calendar")`→5, `listTriggerMetasForProvider("google-calendar")`→1, `listProvidersWithMetadata()` includes it; `/api/providers`→`hasMetadata:true`; `/api/providers/google-calendar/actions`→5; `/triggers`→1 (new `google-calendar-provider-route.test.ts` + `google-calendar-discovery.test.ts` + `google-calendar-triggers-discovery.test.ts`).
- **Update existing test:** [`providers-route.test.ts:201`](../../../tests/unit/app/api/providers/providers-route.test.ts) — the "still-pending example" must move off `google-calendar` (→ `google-drive`), and add a positive "Google Calendar hasMetadata=true" assertion.
- **Structural invariants:** `discovery-meta-coverage` passes with `google-calendar` in `COVERED_PROVIDERS` (1:1 handler↔meta, all 5); `trigger-meta-activation-invariant` passes (no exemption — already wired at `_registry.ts:40`); `sensitive-output-coverage` passes (verify no nested output named `email` is left unmarked; `attendees`/`events`/`meetLink` carry `sensitive:true`).
- **Guards:** no secret-shaped output names (`nextSyncToken`/`nextPageToken` ≠ exact `token` — safe); no provider API calls in metadata tests; `google-calendar:calendars`/`:events`/`:timezones`/`:colors` never referenced by any shipped field.
- **No resolver tests** — no resolvers ship in this arc (would appear only in the optional `GCAL-CALENDARS-RESOLVER` follow-up).
- **No builder config-rendering test** beyond the discovery/route shape unless an existing per-provider rendering harness already covers calendar fields (none does today) — render coverage rides the generic field-renderer tests.

---

## 8. Acceptance criteria

Google Calendar is metadata/builder-complete only when:

- [ ] all 5 runtime actions have `ActionMeta` (1:1 with the handler registry; `delete_event` = high/destructive/confirm);
- [ ] the `event_changed` webhook trigger has `TriggerMeta` (single `calendarId` field) with a passing activation invariant;
- [ ] required options resolvers exist OR are explicitly deferred with rationale — here **all are deferred/rejected** (`calendars` scope-blocked, `events` upstream-fed, `timezones` rejected, `colors` deferred); `calendarId` defaults `"primary"`/typeable, `eventId` typeable/upstream-fed;
- [ ] `/api/providers` reports Calendar `hasMetadata:true` (no longer "coming soon"); actions render with typeable fields;
- [ ] `google-calendar` is in `COVERED_PROVIDERS`; the `providers-route.test.ts` pending example is moved off it;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Calendar tests (§7) pass;
- [ ] **no Calendar runtime handler behavior changed** (metadata-only — no schema additions, no resolver, no billing);
- [ ] the `calendars`-resolver decision (§3) and the `meetLink`-sensitive decision (§2) are signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Calendar → covered; **24/26 covered, 2 pending**).

---

## Appendix — risks / blockers summary

1. **`calendars` resolver SCOPE-BLOCKED — the main UX gap (open Marcus decision).** Manifest grants `calendar.events` only; a calendar picker needs `calendarList.list` (a new scope → **forced reconnect for every connected user**) + a new `calendarList` helper. Recommend typeable `calendarId="primary"` for v1; carve the picker into the optional, product-gated `GCAL-CALENDARS-RESOLVER` follow-up. _Marcus: add the scope + reconnect now, or typeable for v1?_
2. **`events` resolver deferred** — event lists are large/time-unbounded/ordering-ambiguous; `eventId` is trigger/upstream-fed. Typeable for v1 (don't overbuild — explicit task guidance).
3. **`timezones` resolver rejected** — static IANA list (~400) exceeds the 256-option `FieldOptionSchema` cap and has no API; `resolveTimezone` covers the UTC fallback. `timezone` stays text.
4. **`delete_event` is destructive** — high / isDestructive / requiresConfirmation; also emits attendee cancellation emails per `sendNotifications`. The `alreadyDeleted` idempotent short-circuit does NOT make it non-destructive.
5. **PII lives in array outputs whose NAMES aren't suspicious** — `attendees[]` / `events[]` carry attendee emails but are not in `sensitive-output-coverage`'s `SUSPICIOUS_NAMES`, so the structural test won't force them. They are **plan-marked** sensitive deliberately. Keep them `type:"array"` without nested `fields[]` in v1 to avoid the forced-`email` nested-name question.
6. **`meetLink` sensitivity — judgment call (sign-off).** A Meet join URL is access-bearing → recommend `sensitive:true` (conservative). Counter-precedent: Teams `webUrl` not marked, and Meet links are gated by the meeting lobby. Documented; defaulting to marked.
7. **No resolvers + no UI-scope additions → single implementation slice** (GCAL-META-2) — differs from the sibling resolver-first 3-slice cadence; justified in §6.
8. **Trigger key is `event_changed`** (snake_case), not `eventChanged` (the directory name). Metas/tests must use `event_changed`. Activation already wired at `integrations/_registry.ts:40` → invariant passes with no exemption.
9. **`providers-route.test.ts` currently uses `google-calendar` as the canonical "pending" example** (line 201) — GCAL-META-2 must move it to `google-drive` (or `microsoft-outlook-calendar`) to avoid a self-contradicting test.
10. **Branch/worktree caution.** Authored on the shared `ai-12b-planner-patch-shape-hardening` branch with interleaved AI + provider commits; explicit-path staging only; verify branch topology before any push/PR.

---

## 9. GCAL-META-2 outcomes (shipped 2026-05-25)

**Scope delivered:** 5 ActionMeta + 1 TriggerMeta + discovery sub-registry + `COVERED_PROVIDERS` flip + tests. **Google Calendar is now builder-visible — `/api/providers` reports `hasMetadata:true`.** Covered providers **23/26 → 24/26**; pending **3 → 2**. **No runtime/schema files touched** (calendarId/eventId are already real fields — pure additive metadata). **No resolvers, no scope change, no reconnect, no billing change.** Single implementation slice (no resolver slice), as planned in §6.

### 9.1 ActionMeta (5, displayOrder 10..50) — `integrations/google-calendar/actions/<action>.meta.ts`

`create_event` (10), `list_events` (20), `update_event` (30), `delete_event` (40), `add_attendees` (50). All `category:"calendar"`, `requiresIntegration:true`, all `producesFileRef:false`/`consumesFileRef:false`.

- **Risk:** `create_event` / `update_event` / `add_attendees` **medium**; `list_events` **low**; **`delete_event` high + `isDestructive:true` + `requiresConfirmation:true`** (irreversible delete + attendee cancellation emails — Marcus decision; mirrors Airtable/Excel/OneDrive deletes).
- **Q11 required fields wired:** `sendNotifications` (select all/externalOnly/none) required on all 4 writes; `guestsCanInviteOthers` / `guestsCanSeeOtherGuests` required on `create_event`.
- **Field types:** `calendarId`/`eventId` → text; `attendees` → string-array; `description` → textarea; enums → select; `maxResults` → number(1–2500); `allDay`/`googleMeet`/guests-* → boolean; date/time fields → text (ISO / YYYY-MM-DD).

### 9.2 No optionsSource / no UI-scope additions (resolvers deferred per §3)

`calendarId` → **typeable text, `defaultValue:"primary"`, no `optionsSource`** on all 5 actions + the trigger (the `calendars` picker stays scope-blocked — no `calendarList` scope, no reconnect). `eventId` → **typeable text, no `optionsSource`** (trigger/upstream-fed). No field references `google-calendar:calendars` / `:events` / `:timezones` / `:colors` (asserted by tests). **NO UI-scope schema additions** — calendarId/eventId are already real fields.

### 9.3 TriggerMeta (1 webhook) — `triggers/eventChanged/eventChanged.meta.ts`

`event_changed`: `activation:"webhook"`, `requiresIntegration:true`, `category:"calendar"`, single config field `calendarId` (text, default `"primary"`, no resolver — the watch anchor). **Reconciliation note:** the slice instruction said "calendarId required" but the runtime `activate` treats it as optional (falls back to `"primary"`); the meta follows the runtime (`required:false`) — honest to behavior, matching the accepted GCAL-META-1 plan. Payload = the 12 normalized fields. Activation already registered at `integrations/_registry.ts:40` → `trigger-meta-activation-invariant` passes with no exemption.

### 9.4 Discovery + COVERED

New `services/discovery/providers/google-calendar.ts` (`GOOGLE_CALENDAR_ACTION_METAS` ×5 + `GOOGLE_CALENDAR_TRIGGER_METAS` ×1), spread into `services/discovery/_registry.ts`. `google-calendar` added to `COVERED_PROVIDERS`. `providers-route.test.ts` "still-pending" example moved `google-calendar` → `google-drive` (+ added a positive Google Calendar `hasMetadata:true` assertion).

### 9.5 Sensitive-output handling

**Deliberate plan-marks** (none forced by the structural test — gcal's PII names aren't in `SUSPICIOUS_NAMES`): attendee email arrays `attendees` (create/update/add_attendees outputs + trigger) + `addedAttendees` + `alreadyInvited`; the `events` bulk read (list_events); the `meetLink` Meet URL (create_event); event `description` bodies (update_event output + trigger payload — **upgraded to sensitive per the GCAL-META-2 slice instruction**, refining GCAL-META-1's lean). NOT marked: ids / `summary` titles / `location` / `htmlLink` / dates / counts / pagination cursors. Arrays kept as plain `type:"array"` (no nested `email` field) — so nothing is force-failed and nothing is over-marked.

### 9.6 Tests

`google-calendar-discovery.test.ts` (action surface), `google-calendar-triggers-discovery.test.ts` (trigger surface), `google-calendar-provider-route.test.ts` (route `hasMetadata`/actions/triggers wire shape). Structure invariants pass: `discovery-meta-coverage` (google-calendar in COVERED, 1:1 handler↔meta), `trigger-meta-activation-invariant` (no exemption), `sensitive-output-coverage`. `providers-route.test.ts` updated. Targeted + broad regression: **1498/1498 across 68 suites** (calendar + discovery + providers + contracts + structure).

### 9.7 Acceptance criteria (§8) — met

All 5 actions have ActionMeta; `event_changed` has TriggerMeta (calendarId field) + passing activation invariant; all resolvers explicitly deferred/rejected (none referenced); `/api/providers` Calendar `hasMetadata:true`; `google-calendar` in `COVERED_PROVIDERS`; providers-route pending example moved to google-drive; structure invariants pass; targeted tests pass; **no runtime handler behavior changed** (no schema/resolver/billing touch); `calendars` deferral + `meetLink`-sensitive + `delete_event`-destructive decisions all signed off by Marcus.

### 9.8 Follow-ups

- **`_registry.ts` is at 450 lines** (max-lines warning, pre-existing — was 444 before this slice). Every provider addition bumps it via the import+spread; the metas themselves live in the sub-registry. A future refactor could group the sub-registry imports/spreads into an array-of-arrays to drop back under 400.
- **`GCAL-CALENDARS-RESOLVER`** (optional, product-gated) — the `calendarList` scope + reconnect + `calendars` picker, only if product approves. Out of launch-critical path.
