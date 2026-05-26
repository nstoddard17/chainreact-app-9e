# Slice 7 — Microsoft Outlook **Calendar** provider port

**Branch:** `slice-7-outlook-calendar` (off `slice-6-outlook` @ `3e4518487`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Microsoft Outlook Calendar from V1 with five actions (`create_event`, `list_events`, `update_event`, `delete_event`, `add_attendees`) plus one webhook trigger (`event_changed` covering `created` / `updated` / `deleted`). Calendar rides Microsoft Graph subscriptions on `/me/events` — same wire-format as Slice 6 mail's `/me/messages`. Slice 7 is also the first slice to extract `integrations/_shared/microsoft/` because it's the second consumer of the Microsoft OAuth + Graph subscription primitives.

This slice has no separate Batch 2. Commits 1–5 ship together when each commit's gates are green.

---

## Why Calendar after Mail

1. **Reuses Slice 6's foundation.** Same Azure AD app, same `/common/oauth2/v2.0/{authorize,token}` endpoints, same Graph subscription wire-format, same validation-handshake semantics, same `clientState` verification, same renewal cron. The provider-side wire-format is fully shared; what's different is the Graph resource (`/me/events` instead of `/me/messages`), the action surface, and the trigger normalization.
2. **First V2 slice that justifies `_shared/microsoft/`.** Slice 6 deferred extraction with the rule: "extract when a second Microsoft provider lands." Slice 7 is that moment. Mirrors V2's `_shared/google/{oauth,channelToken}.ts` layout — small, focused helpers; per-provider files stay thin.
3. **First V2 trigger with multi-changeType subscription.** Slice 6 mail subscribes only to `created`. Calendar subscribes to `created,updated,deleted` (Graph accepts comma-joined values). The dedup key shape (`${subscriptionId}:${resourceId}:${changeType}`) handles this without modification because `changeType` is already part of the key — same key shape Slice 6 documented for forward-compat. The only knock-on change is the trigger payload includes `changeType` so workflow authors can branch on it.
4. **Validates the V2 Google-style "one identity, multiple providers" pattern at the Microsoft tier.** V2 already does this for Google (`gmail`, `google-calendar`, `google-drive`, `google-sheets` — four separate provider rows under one Google identity). Slice 7 mirrors with `microsoft-outlook` (Slice 6 mail) + `microsoft-outlook-calendar` (Slice 7) under one Azure AD identity. Future Teams / OneDrive / Excel / OneNote slices follow the same pattern.

Foundation for follow-on slices: Slice 8+ Teams, OneDrive, Excel each add a sibling provider that reuses `_shared/microsoft/`. The `_shared/microsoft/api/subscriptions.ts` primitives become the shared subscription layer for every Microsoft surface that has push notifications.

---

## Confirmed scope decisions

1. **New provider id — `microsoft-outlook-calendar`.** NOT extending `microsoft-outlook`. See §"Provider-id decision" below for the full reasoning. Two integration rows per user (one for mail, one for calendar) under the same Azure AD app.
2. **Five actions — `create_event`, `list_events`, `update_event`, `delete_event`, `add_attendees`.** Defer: `find_event`, `respond_to_invitation`, `decline_event`, recurrence-pattern editing, `cancel_event` (use `delete_event`), category management.
3. **One trigger — `event_changed`** with Graph changeType = `"created,updated,deleted"`. Trigger payload includes the `changeType` so workflow authors can branch (`{{trigger.changeType}}`). NOT splitting into three separate triggers (V1 has `new_calendar_event`, `updated_calendar_event`, `deleted_calendar_event` — three subscriptions per workflow, three webhook rows, more complex lifecycle). One subscription per workflow keeps the model symmetric with Slice 6 mail.
4. **`event_start` scheduled trigger — DEFERRED.** V2 has no `workflow_schedules` infra (verified — `grep workflow_schedules` returns zero hits). V1's `event_start` uses scheduled execution (cron-style "wake N minutes before event starts"), not webhook subscriptions. This is a different infrastructure pattern and belongs to its own slice once V2 grows the scheduler.
5. **Scopes — exactly two:** `offline_access`, `Calendars.ReadWrite`. Microsoft Graph permissions are hierarchical: `Calendars.ReadWrite` includes `Calendars.Read`, so we don't request both. Mail-only scopes (`Mail.Send`, `Mail.Read`) are NOT in this manifest — Slice 6's no-scope-bloat principle holds. Users with both providers consent to mail scopes for the mail provider AND calendar scopes for the calendar provider, separately.
6. **OAuth endpoint — `/common/`.** Multi-tenant: `https://login.microsoftonline.com/common/oauth2/v2.0/{authorize,token}`. Same as Slice 6.
7. **Extract `_shared/microsoft/` in Commit 2** (alongside Calendar OAuth). Plan-doc-only Commit 1 keeps the slice cadence aligned with Slices 5 and 6. Commit 2 is large but coherent — refactor + new consumer in one atomic step, with tests proving Slice 6 mail's behavior unchanged.
8. **`accountIdField` — `email`.** Same as Slice 6. Resolved via Graph `/me?$select=mail,userPrincipalName,id` (extracted to `_shared/microsoft/api/me.ts` in Commit 2).
9. **`tokenScope` — `user`.** One Calendar integration per (user, email).
10. **`refreshable` — `true`.** Microsoft refresh-token rotation is the same policy as Slice 6 — preserve old when omitted (extracted to `_shared/microsoft/oauth.ts`).
11. **Health check interval — 6h.** Matches Slice 6 + all Google providers.
12. **Subscription expiration — 4230 minutes (Microsoft's `/me/events` max, identical to `/me/messages`).** Renewal threshold: 1h. Same constants as Slice 6.
13. **Q11 — explicit fields with no hidden defaults:**
    - `create_event` requires explicit `subject`, `start`, `end`, `isAllDay`, `responseRequested` (V1 silently sets `responseRequested: true` — V2 forces explicit choice; "send invitations or not" has user-visible behavior).
    - `create_event` does NOT require `body`, `location`, `attendees`, `reminderMinutesBeforeStart` (those default to absent / no reminder server-side — that's an honest absence, not a hidden default).
    - `update_event` requires `eventId` + at least one mutable field.
    - `delete_event` requires `eventId`.
    - `add_attendees` requires `eventId` + `attendees` (non-empty after parsing). The semantic is APPEND (read-modify-write), which is the load-bearing distinction from `update_event`'s replace-the-list semantic — see §"`add_attendees` — append, not replace" below.
14. **Q12 — timezone resolution.** `start` and `end` accept either `{ dateTime, timeZone }` (Graph's native shape) OR a single ISO-8601 string with explicit offset. The handler routes through `core/workflows/datetime.ts:resolveTimezone({explicitTz})` for the workspace→user→UTC fallback chain. V1's `Intl.DateTimeFormat().resolvedOptions().timeZone` (server runtime TZ) is the V1 rot we explicitly fix.
15. **Q7 — multi-recipient parsing.** `attendees` field accepts CSV string or array; routes through `core/integrations/parseRecipients.ts`. Each parsed address becomes a `{ emailAddress: { address }, type: "required" }` Graph attendee object. Optional / resource attendee types deferred (no V2 surface for them yet).

---

## Provider-id decision: `microsoft-outlook-calendar`

V2's prompt asked: extend `microsoft-outlook` with calendar capabilities, OR new `microsoft-outlook-calendar`?

**Decision: new `microsoft-outlook-calendar` provider.**

| Dimension | (A) Extend `microsoft-outlook` | (B) New `microsoft-outlook-calendar` (chosen) |
|---|---|---|
| Symmetry with V2 Google | ❌ Google is split (`gmail`, `google-calendar`, …) | ✅ Matches the established V2 per-surface pattern |
| Scope minimalism | ❌ Manifest accumulates Mail.Send + Mail.Read + Calendars.ReadWrite — re-introduces V1's scope bloat that Slice 6 explicitly fixed | ✅ Mail manifest stays at 3 scopes; Calendar manifest has 2 (`offline_access`, `Calendars.ReadWrite`) |
| User UX | One "Microsoft Outlook" connection covers everything | Two connections, but each can be granted/revoked independently — and the integrations page shows separate rows so the user knows what they've granted |
| Independent disconnect | ❌ Disconnect kills both surfaces | ✅ User can disconnect Calendar without losing Mail (matches Google) |
| Slice 6 backward-compat | ❌ Requires changing `microsoft-outlook` manifest scopes; existing connected users would need re-consent | ✅ Slice 6 manifest untouched. Existing Slice 6 integrations stay healthy |
| Future Teams / OneDrive / Excel | Bundling means future surfaces also pile in OR diverge from the established pattern | New providers slot in cleanly: `microsoft-teams`, `microsoft-onedrive`, `microsoft-excel`, `microsoft-onenote` |
| Azure AD app config | Single redirect URI | Two redirect URIs to register — but they're cheap and the Azure AD app is the same |

V1 evidence: V1 actually does have one `microsoft-outlook` row covering mail + calendar + contacts under one token. That worked for V1's monolithic shape but contributed to scope bloat (V1's auth.ts requests 8 scopes up-front). V2 has already chosen the per-surface split with Google; Slice 6 already chose scope minimalism. Slice 7 finishing the pattern is the consistent move.

**Naming choice:** `microsoft-outlook-calendar` over `microsoft-calendar`. Reasons:
- Microsoft's own product naming groups Mail + Calendar + Contacts under "Outlook" (e.g., "Outlook Calendar" is the SKU name).
- Future Teams stays as `microsoft-teams` — "outlook" is the family marker for Mail + Calendar + Contacts surfaces; non-Outlook surfaces drop the prefix.
- Predictable for users: when they see two "Microsoft Outlook" rows on the integrations page, the relationship is obvious.

---

## `_shared/microsoft/` extraction (Commit 2 deliverable)

V2's existing `_shared/google/` has two files (`oauth.ts`, `channelToken.ts`). Slice 7 follows the same minimal-extraction principle — only what's actually shared, no speculative scaffolding.

**Files to create in `integrations/_shared/microsoft/`:**

| File | What it owns | Shared by |
|---|---|---|
| `oauth.ts` | PKCE generator (S256, 32 random bytes), authorize URL builder against `${MICROSOFT_AUTHORIZE_BASE}/common/oauth2/v2.0/authorize`, token exchange + refresh against `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`, refresh-token rotation/preserve-old policy, `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` env helpers, error code parser. **Mirrors `_shared/google/oauth.ts` shape.** | mail + calendar (and future Teams/OneDrive/Excel/OneNote) |
| `api/_base.ts` | `graphApiBase()` reading `MICROSOFT_GRAPH_API_BASE` env override. | every Microsoft API wrapper |
| `api/errors.ts` | `NotFoundError`, `surfaceGraphError(text, status)` for the canonical `{ error: { code, message } }` Graph envelope. | every Microsoft API wrapper |
| `api/me.ts` | `getMe(accessToken)` → `{ id, mail, userPrincipalName, displayName }`. Used by every provider's OAuth callback for accountId resolution. | every Microsoft provider |
| `api/subscriptions.ts` | `createSubscription`, `renewSubscription`, `deleteSubscription` — resource-agnostic; takes `{ resource, changeType, notificationUrl, lifecycleNotificationUrl, expirationDateTime, clientState }`. | every Microsoft provider with subscription-watch triggers |
| `webhooks/validation.ts` | `extractValidationToken(request): string \| null` — checks `?validationToken=` query AND `Content-Type: text/plain` body. | every Microsoft webhook route |

**Per-provider files that stay thin:**

`integrations/microsoft-outlook/` (after Commit 2 refactor):
- `manifest.ts` — unchanged from Slice 6.
- `oauth.ts` — thin wrapper that calls `_shared/microsoft/oauth.ts` helpers + the per-provider redirect URL + the `_shared/microsoft/api/me.ts` lookup. Slice 6 callers untouched (the public `microsoftOutlookOAuth` export keeps the same `ProviderOAuth` shape).
- `api/_base.ts` — DELETED (use `_shared/microsoft/api/_base.ts:graphApiBase()` directly).
- `api/errors.ts` — DELETED (use shared).
- `api/sendMail.ts`, `api/getMessage.ts` — keep (mail-specific).
- `api/{createSubscription,renewSubscription,deleteSubscription}.ts` — DELETED (re-export from `_shared/microsoft/api/subscriptions.ts`, OR replace import sites in `triggers/newEmail/{activate,deactivate,renew}.ts`). Plan: replace import sites — fewer files, less indirection.
- `triggers/newEmail/*.ts` — keep (mail-specific resource string + normalize).
- `webhooks/receive.ts` — refactor to use `_shared/microsoft/webhooks/validation.ts:extractValidationToken()`. Mail-specific notification handling stays.

`integrations/microsoft-outlook-calendar/` (created in Commits 2-4):
- Same shape as mail. `oauth.ts` is a thin wrapper. `manifest.ts` declares the calendar-specific scopes + capabilities. Trigger / actions / webhook follow the established convention.

**Commit 2 test strategy:** every Slice 6 unit test continues to pass without modification. The extraction is pure refactoring of the OAuth + subscription + me + errors + validation layers. The Slice 6 e2e walkthrough remains green. New tests for `_shared/microsoft/` cover the shared modules directly (PKCE shape, authorize URL params, token exchange / refresh, /me lookup, subscription CRUD, validation-token extraction).

---

## V1 reference paths

OAuth (already covered in Slice 6 — same Azure AD app):
- `lib/microsoft-graph/auth.ts` — V2 already deprecated cross-provider token sharing (`getValidAccessToken(userId, preferredProvider)`). Calendar fetches its own token via `repositories/integrations.ts`.

Subscription primitives (already covered in Slice 6):
- `lib/microsoft-graph/subscriptionManager.ts` — `buildOutlookCalendarResource() → "/me/events"` (line 432–433). Uses identical create/renew/delete shape as mail.

Calendar action handlers:
- `lib/workflows/actions/microsoft-outlook/createCalendarEvent.ts` — V1 create_event handler. Q11 / Q12 rot we fix during port.
- `lib/workflows/actions/microsoft-outlook/calendarActions.ts` — list / update / delete + add-attendee semantics.

Outlook node manifest entries (field surface reference, NOT ported as-is):
- `lib/workflows/nodes/providers/outlook/index.ts` — calendar trigger configs at `microsoft-outlook_trigger_{new,updated,deleted}_calendar_event` plus `microsoft-outlook_trigger_calendar_event_start` (out of scope — no `workflow_schedules` infra).

V1 webhook handling:
- `app/api/webhooks/microsoft/route.ts` lines 99–134 — calendar trigger filter config. Slice 6 already pulled the validation handshake patterns; Slice 7 needs the calendar-specific filtering + payload normalization (deferred — Slice 7 emits one event per notification with `changeType` echoed, no per-trigger filters in this slice).

V1 calendar data handler (for date-range UI dropdowns — out of scope for Slice 7's API-only configuration):
- `app/api/integrations/microsoft-outlook/data/handlers/calendar-events.ts`.

Tests (style reference, not ported):
- `__tests__/workflows/pr-g2-calendar-required-fields.test.ts` — Google calendar Q11 patterns (`sendNotifications`, `guestsCanInviteOthers`, `guestsCanSeeOtherGuests`); informs V2's Q11 choices for Outlook Calendar.

DEPRECATED — DO NOT COPY:
- V1's `event_start` scheduled trigger — depends on `workflow_schedules` infra V2 doesn't have. Defer until V2 ships a scheduler.
- V1's three separate calendar triggers (`new_calendar_event`, `updated_calendar_event`, `deleted_calendar_event`) — V2 ships one consolidated `event_changed` trigger; workflow authors branch on `changeType`.
- V1's silent timezone default via `Intl.DateTimeFormat().resolvedOptions().timeZone` — V2 uses `core/workflows/datetime.ts:resolveTimezone`.
- V1's silent `responseRequested = true` and `isOnlineMeeting = false` defaults — V2 enforces explicit choice via Q11.
- V1's silent `sendInvitation = true` (no opt-out from Graph) — V2 doesn't introduce a fake opt-out either, but explicitly documents that creating an event with attendees ALWAYS triggers Graph's invitation send (Microsoft offers no API knob to suppress); the `responseRequested` field controls only whether attendees can RSVP.

---

## V2 → V1 file-by-file map

**Created in Commit 1 (this commit):**
- `docs/slices/slice-7-outlook-calendar.md` (this file)

**Created in Commit 2 (`_shared/microsoft/` extraction + Calendar manifest + OAuth):**
- `integrations/_shared/microsoft/oauth.ts`
- `integrations/_shared/microsoft/api/_base.ts`
- `integrations/_shared/microsoft/api/errors.ts`
- `integrations/_shared/microsoft/api/me.ts`
- `integrations/_shared/microsoft/api/subscriptions.ts`
- `integrations/_shared/microsoft/webhooks/validation.ts`
- `integrations/microsoft-outlook-calendar/manifest.ts`
- `integrations/microsoft-outlook-calendar/oauth.ts`
- `tests/unit/integrations/_shared/microsoft/{oauth,api/_base,api/errors,api/me,api/subscriptions,webhooks/validation}.test.ts`
- `tests/unit/integrations/microsoft-outlook-calendar/{manifest,oauth}.test.ts`

**Modified in Commit 2:**
- `integrations/microsoft-outlook/oauth.ts` — refactor to call shared helpers; signature unchanged.
- `integrations/microsoft-outlook/api/_base.ts` — delete OR re-export `graphApiBase` from shared; prefer delete + update import sites.
- `integrations/microsoft-outlook/api/errors.ts` — delete + update import sites.
- `integrations/microsoft-outlook/api/{createSubscription,renewSubscription,deleteSubscription}.ts` — delete + update trigger import sites to use `_shared/microsoft/api/subscriptions.ts`.
- `integrations/microsoft-outlook/webhooks/receive.ts` — replace inline validation-token extraction with `_shared/microsoft/webhooks/validation.ts` import.
- `integrations/_registry.ts` — add `microsoftOutlookCalendarManifest`.
- `services/oauth/dispatcher.ts` — add `"microsoft-outlook-calendar": microsoftOutlookCalendarOAuth`.

**Created in Commit 3 (Calendar actions + Graph API wrappers):**
- `integrations/microsoft-outlook-calendar/api/eventsCreate.ts` (POST `/v1.0/me/events`)
- `integrations/microsoft-outlook-calendar/api/eventsList.ts` (GET `/v1.0/me/events`)
- `integrations/microsoft-outlook-calendar/api/eventsGet.ts` (GET `/v1.0/me/events/{id}`)
- `integrations/microsoft-outlook-calendar/api/eventsUpdate.ts` (PATCH `/v1.0/me/events/{id}`)
- `integrations/microsoft-outlook-calendar/api/eventsDelete.ts` (DELETE `/v1.0/me/events/{id}`)
- `integrations/microsoft-outlook-calendar/actions/createEvent.{ts,schema.ts}`
- `integrations/microsoft-outlook-calendar/actions/listEvents.{ts,schema.ts}`
- `integrations/microsoft-outlook-calendar/actions/updateEvent.{ts,schema.ts}`
- `integrations/microsoft-outlook-calendar/actions/deleteEvent.{ts,schema.ts}`
- `integrations/microsoft-outlook-calendar/actions/addAttendees.{ts,schema.ts}`
- `tests/unit/integrations/microsoft-outlook-calendar/api/*.test.ts` (5 files)
- `tests/unit/integrations/microsoft-outlook-calendar/actions/*.test.ts` (5 files + schema tests)

**Modified in Commit 3:**
- `services/execution/handlers/_registry.ts` — add 5 calendar handler entries.
- `integrations/microsoft-outlook-calendar/manifest.ts` — flip `actions: true`.

**Created in Commit 4 (`event_changed` trigger + webhook receiver):**
- `integrations/microsoft-outlook-calendar/triggers/eventChanged/{index,activate,deactivate,renew,normalize}.ts`
- `integrations/microsoft-outlook-calendar/webhooks/receive.ts`
- `app/api/webhooks/microsoft-outlook-calendar/{route.ts,lifecycle/route.ts}`
- `tests/unit/integrations/microsoft-outlook-calendar/triggers/eventChanged/*.test.ts` (5 files)
- `tests/unit/integrations/microsoft-outlook-calendar/webhooks/receive.test.ts`

**Modified in Commit 4:**
- `integrations/_registry.ts` — add `import "./microsoft-outlook-calendar/triggers/eventChanged";`
- `integrations/microsoft-outlook-calendar/manifest.ts` — flip `webhookTrigger: true`.

**Created in Commit 5 (e2e walkthrough):**
- `tests/e2e/slice-7-outlook-calendar-walkthrough.spec.ts` — naming follows Slice 6 (no `b` suffix), matches all Slice-N e2e specs after Slice 1.

**Modified in Commit 5:**
- `tests/e2e/helpers/mockMicrosoftServer.ts` — extend with calendar routes (POST/GET/PATCH/DELETE `/v1.0/me/events{,/id}`) + `__injectCalendarEvent` control-plane knob. The OAuth + subscription routes already work because they're resource-agnostic; the existing `/__sendNotification` knob already takes `subscriptionId` so it can fan a notification to either provider.
- `playwright.config.ts` — no env changes needed (Microsoft env vars already wired in Slice 6).

---

## OAuth design (Calendar-side)

Reuses `_shared/microsoft/oauth.ts` for everything except the per-provider redirect URL.

**Authorize URL.** `${MICROSOFT_AUTHORIZE_BASE}/common/oauth2/v2.0/authorize` with `response_type=code`, `response_mode=query`, `client_id`, `redirect_uri=${appUrl}/api/integrations/oauth/microsoft-outlook-calendar/callback`, `scope=offline_access Calendars.ReadWrite`, `state`, PKCE `code_challenge` + `code_challenge_method=S256`.

**Token exchange.** Identical wire-format to Slice 6 — POST to `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token` with form-urlencoded body, `grant_type=authorization_code`, code + verifier + client creds + redirect URL.

**Refresh.** Same endpoint, `grant_type=refresh_token`. Preserve-old policy: if response omits `refresh_token`, re-encrypt the existing one.

**Account ID.** Extracted to `_shared/microsoft/api/me.ts:getMe(accessToken)`. Returns `{ id, mail, userPrincipalName, displayName }`. Fallback chain: `mail ?? userPrincipalName`. The `id` (Azure object id) is captured in `account.metadata.graphId` for downstream calls that need the immutable handle.

**Env vars.** All shared with Slice 6:
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (required at runtime).
- `MICROSOFT_AUTHORIZE_BASE`, `MICROSOFT_TOKEN_BASE`, `MICROSOFT_GRAPH_API_BASE` (e2e overrides).

**Azure AD app configuration delta:** the existing Azure AD app (set up for Slice 6) needs:
- A second redirect URI registered: `${appUrl}/api/integrations/oauth/microsoft-outlook-calendar/callback`. (Azure permits multiple redirect URIs per app — the dispatcher uses the one matching the provider id at request time.)
- The `Calendars.ReadWrite` delegated permission added to the API permissions list. **No admin consent required** — user-level consent at OAuth time is sufficient.

**`revoke()` is a stub** — same disconnect-UX deferral as every other V2 provider.

---

## Action algorithms

### `create_event`

**Schema (`createEvent.schema.ts` — Zod strict):**
- `subject: string` — required, may be empty.
- `start: { dateTime: string, timeZone?: string }` — required. `dateTime` is ISO-8601 (with or without offset). `timeZone` is optional; if omitted the handler resolves via `core/workflows/datetime.ts:resolveTimezone({explicitTz})`.
- `end: { dateTime: string, timeZone?: string }` — required. Same shape as `start`.
- `isAllDay: boolean` — Q11 required (Microsoft Graph's `isAllDay: true` requires start/end at midnight in the event's TZ; we forward verbatim and let Graph reject mismatches with `ErrorInvalidArgument`).
- `responseRequested: boolean` — Q11 required (controls whether attendees see RSVP buttons).
- `body: string` — optional (defaults to absent in Graph payload, not empty string).
- `bodyContentType: "Text" | "HTML"` — required IF `body` is non-empty (Q11 — V1 silently defaults to Text).
- `location: string` — optional.
- `attendees: string | string[]` — optional. Routed through `parseRecipients` (Q7).
- `reminderMinutesBeforeStart: number` — optional (omitted → no reminder). `0` is a valid choice (alert at start time).
- `showAs: "free" | "tentative" | "busy" | "oof" | "workingElsewhere"` — optional.
- `sensitivity: "normal" | "personal" | "private" | "confidential"` — optional.

**Algorithm:**
1. Schema parse.
2. `parseRecipients(config.attendees)` → `[{ emailAddress: { address }, type: "required" }, ...]`.
3. Resolve `start.timeZone` and `end.timeZone` via `resolveTimezone`. If both omitted, both default to `"UTC"`.
4. Build Graph payload `{ subject, start, end, isAllDay, body?, location?, attendees?, responseRequested, reminderMinutesBeforeStart?, showAs?, sensitivity? }`.
5. POST `${graphApiBase()}/v1.0/me/events` via `refreshAndRetry({ provider: "microsoft-outlook-calendar", userId, accountId, apiCall: ... })`.
6. Output: `{ id, subject, start, end, webLink, isAllDay, organizer, attendees }`.

### `list_events`

**Schema:**
- `startDate: string` — optional (ISO-8601). When set, uses Graph `/me/calendarView?startDateTime=…&endDateTime=…` (auto-expands recurring events).
- `endDate: string` — required IF `startDate` is set.
- `top: number` — optional, default 25, max 100.
- `orderBy: "start" | "subject"` — optional, default `"start"`.
- `subjectFilter: string` — optional substring; routed to OData `$filter=contains(subject, …)`.

**Algorithm:**
1. Schema parse.
2. Build URL with `$select=id,subject,start,end,location,attendees,organizer,isOnlineMeeting,onlineMeetingUrl,importance,sensitivity,webLink,bodyPreview` to keep payload size bounded.
3. GET `${graphApiBase()}/v1.0/me/{events|calendarView}?…` via `refreshAndRetry`.
4. Output: `{ events: [...], count }`.

### `update_event`

**Schema:**
- `eventId: string` — required.
- All `create_event` fields optional. PATCH semantics per Graph: omitted fields stay unchanged; provided fields REPLACE.

**Algorithm:** Schema parse → build PATCH payload with only provided fields → PATCH `${graphApiBase()}/v1.0/me/events/{id}` via `refreshAndRetry` → output `{ id, subject, start, end }`.

### `delete_event`

**Schema:** `eventId: string` (required).

**Algorithm:** DELETE `${graphApiBase()}/v1.0/me/events/{id}` via `refreshAndRetry`. Returns 204. Output: `{ deleted: true, eventId }`. 404 → propagates as a config-failure (event was already gone OR user lacks access).

### `add_attendees` — append, not replace

**The semantic distinction:** Graph's PATCH on `attendees` REPLACES the entire list. So a workflow that wants to "add Alice to the meeting" via `update_event` would silently REMOVE everyone else. `add_attendees` is the read-modify-write convenience.

**Schema:**
- `eventId: string` — required.
- `attendees: string | string[]` — required, non-empty after parsing (Q11).
- `attendeeType: "required" | "optional"` — Q11 required (Microsoft Graph differentiates the two; V2 forces explicit choice rather than defaulting).

**Algorithm:**
1. Schema parse, `parseRecipients(config.attendees)`.
2. GET event via `eventsGet` → read `existingAttendees`.
3. Dedupe by `emailAddress.address` (case-insensitive). Existing attendees keep their existing `type`; new ones get the configured `attendeeType`.
4. PATCH event with the merged attendee list.
5. Output: `{ id, attendeesAdded: [...], attendeesTotal: N }`.

**Race window:** between the GET and the PATCH, another client could mutate the attendee list and we'd overwrite their changes. Slice 7 accepts this (single-actor assumption). A fully-correct implementation needs Graph's ETag-based optimistic concurrency (`If-Match` header); deferred as a follow-up if real workflows trip the race.

---

## `event_changed` trigger algorithm

**Subscription resource:** `/me/events`. **changeType:** `"created,updated,deleted"`. **expirationMinutes:** 4230 (Microsoft's `/me/events` max — same as `/me/messages`). **Renewal threshold:** 1h.

**activate (lifecycle hook):**
1. No required config fields beyond standard plumbing — Slice 7 emits one event per notification, no per-trigger filtering in this slice.
2. Generate `clientState` (32-byte hex, persisted before the API call, same as Slice 6 V1-rot fix #2).
3. POST `/v1.0/subscriptions` via `_shared/microsoft/api/subscriptions.ts:createSubscription({resource: "/me/events", changeType: "created,updated,deleted", notificationUrl, lifecycleNotificationUrl, expirationDateTime, clientState})` wrapped in `refreshAndRetry`.
4. Persist `trigger_resources` row with `config: { type: "subscription-watch", resource: "/me/events", changeType: "created,updated,deleted", subscriptionId, clientState, expiresAt }`. The `type: "subscription-watch"` tag lets the renewal cron find this row via JSONB containment.

**deactivate:**
1. DELETE `/v1.0/subscriptions/{subscriptionId}` via shared deleter. 404 / 403 swallowed (best-effort, matches Slice 6).

**renew:**
1. Registered with `services/triggers/subscriptionRegistry` via `outlookCalendarEventChangedSubscriptionHandler` (same handler shape as `outlookNewEmailSubscriptionHandler`).
2. Threshold 1h, max expiration 4230 min.
3. PATCH the subscription's `expirationDateTime` via shared renewer.
4. Persist Graph's authoritative new `expiresAt` back to config (preserve `subscriptionId`, `clientState`, `resource`, `changeType`).

**Webhook receive (`app/api/webhooks/microsoft-outlook-calendar/route.ts`):**
1. **Validation handshake.** `?validationToken=…` query OR `Content-Type: text/plain` body → echo as `text/plain` 200. Uses `_shared/microsoft/webhooks/validation.ts:extractValidationToken()`.
2. **Notification.** Body `{ value: [{ subscriptionId, clientState, changeType, resource, resourceData: { id }, … }, …] }`. For each:
   - Look up `trigger_resources` by JSONB containment `{ subscriptionId }`. Skip if missing (deactivated workflow).
   - Verify `clientState` matches stored. Mismatch → log + skip (never throw).
   - Fetch the event via `eventsGet({ accessToken, eventId: notification.resourceData.id })` wrapped in `refreshAndRetry`. 404 → skip (event deleted between notification and fetch — common for cancellations followed by hard-delete).
   - Normalize → `TriggerEvent` (see "Output shape" below).
   - Dispatch via `services/triggers/dispatch.ts` (handles dedup automatically).
3. **Lifecycle path** (`/lifecycle/route.ts`) — stub, 200 + log. Slice 7 keeps the same Slice 6 stub treatment.

**Output shape** (the `event_changed` trigger event payload):
- `eventId: string`
- `changeType: "created" | "updated" | "deleted"` — surfaced from the notification envelope (NOT from the message body) so workflow authors can branch.
- `subject: string`
- `start: { dateTime, timeZone }`
- `end: { dateTime, timeZone }`
- `isAllDay: boolean`
- `location: string | null`
- `body: { contentType: "html" | "text", content: string } | null`
- `attendees: Array<{ name, address, type, status }>`
- `organizer: { name, address } | null`
- `isOnlineMeeting: boolean`
- `onlineMeetingUrl: string | null`
- `webLink: string | null`
- `importance: "low" | "normal" | "high"`
- `sensitivity: "normal" | "personal" | "private" | "confidential"`
- `createdDateTime: string`
- `lastModifiedDateTime: string`

**`changeType: "deleted"` handling:** when Graph notifies `deleted`, the event id may already be gone (Graph sometimes hard-deletes immediately for cancellations). The receive handler tries the GET — on 404, it normalizes a minimal payload `{ eventId, changeType: "deleted", subject: null, … }` so workflows can react to deletions even without the full body. The `subject: null` signals "we know it was deleted but couldn't fetch the body."

---

## Dedup key shape

`webhook_event_dedup`:
- `provider = "microsoft-outlook-calendar"`
- `eventId = "${subscriptionId}:${eventId}:${changeType}"`

Same shape as Slice 6 mail. The `changeType` is part of the key so a single event being created → updated → deleted within the dedup window emits three distinct dispatcher events (each gets its own dedup row). This matches the workflow author's intent: "I want the workflow to fire on each change," not "I want it to fire once per event lifetime."

---

## Azure AD setup checklist (for production deployment)

This slice ships entirely with mocks for tests. For real deployment, the user needs to add to the existing Azure AD app from Slice 6:

1. **Add redirect URI:** `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/microsoft-outlook-calendar/callback`. Azure → Microsoft Entra ID → App registrations → (existing app) → Authentication → Add a platform → Web → Redirect URIs.
2. **Add API permission:** Microsoft Graph → Delegated permissions → `Calendars.ReadWrite`. No admin consent required.
3. **Env vars unchanged from Slice 6:** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`. Same Azure AD app id + secret cover both providers.
4. **Public HTTPS webhook URL.** Same `MICROSOFT_GRAPH_WEBHOOK_URL` env var works (or per-provider variants if the user wants to route them to different tunnels). The activation hook for calendar appends `/api/webhooks/microsoft-outlook-calendar` to the configured base.
5. **Verify validation handshake test:** `POST /api/webhooks/microsoft-outlook-calendar?validationToken=foo` returns `foo` as `text/plain` 200 within 10s. Same handshake Microsoft does on subscription create.

None required for Slice 7's e2e — `mockMicrosoftServer` simulates the full wire-format. Real Azure setup is on the user's runway when they're ready to enable Calendar in production.

---

## V1 rot fixes carried into V2

1. **No `Intl.DateTimeFormat().resolvedOptions().timeZone` silent default** (V1 `createCalendarEvent.ts:56`). V2 uses `core/workflows/datetime.ts:resolveTimezone` for the explicit-or-UTC fallback chain.
2. **No silent `responseRequested = true` default** (V1 `createCalendarEvent.ts:258`). V2 enforces explicit choice via Q11 schema requirement.
3. **No silent `isOnlineMeeting = false` default** (V1 `createCalendarEvent.ts:165`). V2 makes it explicit-optional — defaults to absent in the Graph payload (Graph's own default is `false`); workflow authors who want online meetings opt in.
4. **No silent `bodyContentType = "Text"` default** (V1's create-event sends Text body when not specified). V2 makes it Q11-required IF body is non-empty.
5. **No cross-provider Microsoft token sharing** (V1's `getValidAccessToken(userId, "microsoft-outlook")`). V2 fetches per-provider integration row via `repositories/integrations.ts`.
6. **DB-backed dedup** via `webhookEventDedup` repo (V1 had no Microsoft dedup).
7. **Per-provider env vars** (`MICROSOFT_CLIENT_ID`/`SECRET` shared across providers, NOT `OUTLOOK_CALENDAR_CLIENT_ID` etc).
8. **Per-provider webhook route** (`/api/webhooks/microsoft-outlook-calendar`), not the V1 multiplexer.
9. **No silent attendee-list replacement in update_event.** V2 has separate `add_attendees` action that does read-modify-write; `update_event` honors the workflow author's intent that "I'm setting the new attendee list" by replacing as Graph natively does.

---

## Risk callouts

1. **10-second validation timeout.** Same as Slice 6 — the calendar webhook route MUST respond to validation within 10s. The validation extraction is shared (`_shared/microsoft/webhooks/validation.ts`) and short-circuits before any DB I/O.
2. **`/me/events` vs `/me/calendarView` for list_events.** `/me/events` returns "master" events for recurring series (one record per series). `/me/calendarView?startDateTime=…&endDateTime=…` auto-expands recurring events into individual occurrences. Slice 7 routes `list_events` to `calendarView` when both `startDate` AND `endDate` are provided; otherwise `events`. Workflow authors get sensible behavior for both "show me all my events" and "show me what's on my calendar this week."
3. **Subscription on `/me/events` includes calendar-event AND calendar-action notifications.** The notification's `resource` field looks like `Users/{id}/Events/{eventId}` for events, or `Users/{id}/Calendars/{calId}` for calendar-level changes. Slice 7's receive handler filters to event notifications only by checking `resourceData["@odata.type"] === "#Microsoft.Graph.Event"`. Calendar-level notifications (rare in practice) are silently skipped.
4. **`changeType: "deleted"` semantic.** Graph fires `deleted` for both soft-delete (event still exists in DeletedItems) and hard-delete. The `eventsGet` call may 404; handler emits a minimal payload (see trigger algorithm). Workflows that rely on the event body for `changeType: "deleted"` need to capture the body BEFORE the delete via a separate `event_changed` listener for `created`/`updated`.
5. **Recurring-event modifications.** Graph fires notifications for the master series, not for individual occurrences. Modifying a single occurrence (Graph's "exception instances") emits a notification on the master event id; the receive handler doesn't currently distinguish series vs occurrence. Acceptable for Slice 7 — workflow authors who care can fetch `event.recurrence` from the payload.
6. **Refresh-token rotation can omit a new token.** Same as Slice 6 — preserve-old policy in `_shared/microsoft/oauth.ts`.
7. **`add_attendees` race window.** Documented above; accepted limitation.

---

## Out-of-scope (echoed from approved scope)

- Outlook Contacts (separate Slice if useful).
- Microsoft Teams, OneDrive, Excel, OneNote (each their own slice later).
- Calendar `event_start` scheduled trigger — depends on `workflow_schedules` infra V2 doesn't have.
- Per-trigger filter fields (calendarId scoping, organizer / subject filters) — Slice 7 emits one event per notification.
- Recurring-event explicit handling (occurrence vs series). Forward-compat documented above.
- Optimistic concurrency (`If-Match` ETags) on `add_attendees`.
- Shared / delegated mailbox / shared-calendar support.
- Calendar permissions / sharing modifications.
- UI dropdowns for calendar selection (V1's `calendar-events.ts` data handler) — Slice 7 is API-only configuration; UI lands when V2 grows dynamic option loaders.
- Reauthorization handler for `lifecycleNotificationUrl` — stub-only in Slice 7 (matches Slice 6).
- Auto-disable workflows on persistent renewal failure — owned by proactive-health system.
- Push or PR or remote sharing of any kind.
- Unrelated cleanup.
