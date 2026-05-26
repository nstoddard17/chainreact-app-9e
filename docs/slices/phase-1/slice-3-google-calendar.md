# Slice 3 — Google Calendar provider port

**Branch:** `slice-3-google-calendar` (off `v2-foundation` @ `6cf6ce9eb`)
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1)
**Goal:** Port Google Calendar from V1 with five actions (`createEvent`, `listEvents`, `updateEvent`, `deleteEvent`, `addAttendees`) plus a watch-based push trigger. Do it as one batch; the e2e walkthrough is Batch 2 (`slice-3b-google-calendar-walkthrough`).

This slice also fills three V2 platform gaps that Calendar exposes:

1. **Watch / subscription trigger infrastructure** — V2 has polling (Gmail) and global webhook events (Slack); it does not yet have the per-workflow subscription pattern (channel ID, expiry, renewal cron, single-receive endpoint with HMAC token). Calendar brings this and Drive/Outlook will reuse it.
2. **Q-contract helpers** — `parseRecipients` (Q7), `requireExplicitField` (Q11), `resolveTimezone` / `parseTimeOrFail` / `addMinutesToTime` (Q12). V2 has none of these yet. Calendar must.
3. **Watch-renewal cron** — V2's `vercel.json` only runs `poll-triggers`. Calendar needs a 10-minute renewal cron added.

The scope is provider work + the helpers it strictly requires. We do not extend the helpers beyond Calendar's needs (e.g., we don't pre-build `resolveLocale` because nothing in this slice uses it).

---

## V1 reference paths

OAuth + scopes:
- [lib/integrations/oauthConfig.ts](../../../nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) lines 74–88 — Calendar scope set
- Google OAuth handler is shared at the dispatcher level; per-provider config in `oauthConfig`.

Node manifest:
- [lib/workflows/nodes/providers/google-calendar/index.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-calendar/index.ts) — schemas, fields, output shapes, dynamic loaders.

Action handlers:
- [lib/workflows/actions/google-calendar/createEvent.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-calendar/createEvent.ts)
- [lib/workflows/actions/google-calendar/listEvents.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-calendar/listEvents.ts)
- [lib/workflows/actions/google-calendar/updateEvent.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-calendar/updateEvent.ts)
- [lib/workflows/actions/google-calendar/deleteEvent.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-calendar/deleteEvent.ts)
- [lib/workflows/actions/google-calendar/addAttendees.ts](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-calendar/addAttendees.ts)

Watch lifecycle (shared with Drive/Docs/Sheets in V1):
- [lib/triggers/providers/GoogleApisTriggerLifecycle.ts](../../../nstoddard17/chainreact-app-9e/lib/triggers/providers/GoogleApisTriggerLifecycle.ts) — `onActivate` / `onDeactivate` / channel storage / initial sync-token capture.

Webhook receiver:
- [app/api/webhooks/google/route.ts](../../../nstoddard17/chainreact-app-9e/app/api/webhooks/google/route.ts) — single-route multiplexer over Gmail/Calendar/Drive/Docs/Sheets.

Renewal cron:
- [app/api/cron/renew-webhook-subscriptions/route.ts](../../../nstoddard17/chainreact-app-9e/app/api/cron/renew-webhook-subscriptions/route.ts) — every 10 min; Google threshold = renew when expiry within 24h.

API wrapper + calendar list loader:
- [lib/integrations/google-calendar.ts](../../../nstoddard17/chainreact-app-9e/lib/integrations/google-calendar.ts) — `getGoogleCalendars` etc.
- [app/api/integrations/google/data/handlers/calendars.ts](../../../nstoddard17/chainreact-app-9e/app/api/integrations/google/data/handlers/calendars.ts)

Tests (style reference):
- [__tests__/nodes/google-calendar-create-event.test.ts](../../../nstoddard17/chainreact-app-9e/__tests__/nodes/google-calendar-create-event.test.ts)
- [__tests__/workflows/pr-g2-calendar-required-fields.test.ts](../../../nstoddard17/chainreact-app-9e/__tests__/workflows/pr-g2-calendar-required-fields.test.ts)

DEPRECATED — do not copy:
- [lib/webhooks/google-calendar-watch-setup.ts](../../../nstoddard17/chainreact-app-9e/lib/webhooks/google-calendar-watch-setup.ts) — old `google_watch_subscriptions` table; superseded by `GoogleApisTriggerLifecycle` + `trigger_resources`.

---

## V2 target paths

Provider:
- `integrations/google-calendar/manifest.ts`
- `integrations/google-calendar/oauth.ts`
- `integrations/google-calendar/api/eventsInsert.ts`
- `integrations/google-calendar/api/eventsList.ts`
- `integrations/google-calendar/api/eventsUpdate.ts`
- `integrations/google-calendar/api/eventsDelete.ts`
- `integrations/google-calendar/api/eventsGet.ts` (used by `addAttendees` to merge attendees + by `updateEvent` to fetch existing)
- `integrations/google-calendar/api/eventsPatch.ts` (used by `addAttendees`)
- `integrations/google-calendar/api/eventsWatch.ts`
- `integrations/google-calendar/api/channelsStop.ts`
- `integrations/google-calendar/api/calendarsList.ts` (for `getGoogleCalendars` parity)
- `integrations/google-calendar/actions/createEvent.ts` + `createEvent.schema.ts`
- `integrations/google-calendar/actions/listEvents.ts` + `listEvents.schema.ts`
- `integrations/google-calendar/actions/updateEvent.ts` + `updateEvent.schema.ts`
- `integrations/google-calendar/actions/deleteEvent.ts` + `deleteEvent.schema.ts`
- `integrations/google-calendar/actions/addAttendees.ts` + `addAttendees.schema.ts`
- `integrations/google-calendar/triggers/eventChanged/index.ts` (registration entry)
- `integrations/google-calendar/triggers/eventChanged/activate.ts`
- `integrations/google-calendar/triggers/eventChanged/deactivate.ts`
- `integrations/google-calendar/triggers/eventChanged/renew.ts`
- `integrations/google-calendar/triggers/eventChanged/pull.ts` (sync-token delta fetch)
- `integrations/google-calendar/triggers/eventChanged/dedupKey.ts`
- `integrations/google-calendar/triggers/eventChanged/schema.ts`
- `integrations/google-calendar/webhooks/receive.ts`
- `integrations/google-calendar/utils/channelToken.ts` (HMAC sign/verify)

Routes:
- `app/api/webhooks/google-calendar/route.ts`
- `app/api/cron/renew-watch-subscriptions/route.ts`

Shared (new infrastructure used by Calendar, designed to be reusable):
- `services/triggers/subscriptionRegistry.ts` — registry of subscription-watch handlers (mirrors `pollingRegistry.ts`).
- `services/triggers/runRenewals.ts` — orchestrator for the renewal cron (mirrors `runPollingTriggers.ts`).
- `core/integrations/parseRecipients.ts` — Q7 helper.
- `core/workflows/requireExplicitField.ts` — Q11 helper. Standardized config-failure shape lives here.
- `core/workflows/datetime.ts` — Q12: `resolveTimezone` (explicit-or-UTC; pure), `parseTimeOrFail` (strict HH:MM), `addMinutesToTime`.
- `core/workflows/idempotency.ts` — `hashPayload` (canonical-form SHA-256) and `buildIdempotencyKey` (`${executionSessionId}:${nodeId}:${actionType}`).

**Deferred (not in this batch):**
- `checkReplay` / `recordFired` and the `session_side_effects` table — V2 has no within-session retry mechanism today, so Q4 storage would be infrastructure with no current consumer. The stable idempotency key on its own is enough to drive provider-side dedup (Google Meet `requestId`, future Stripe `Idempotency-Key` header). Add storage in the slice that introduces same-session retries.
- `user_profiles.timezone` column and the workspace→user→UTC fallback chain — `resolveTimezone` is a pure function that takes explicit IANA-or-empty and returns the validated TZ or `'UTC'`. No DB call. Calendar's `createEvent` schema requires explicit `timezone` (or `'auto'` which we treat as UTC for now). When V2 grows a workspace/user-profile timezone preference, expand the helper signature then.

Modify:
- `integrations/_registry.ts` — add side-effect imports for Calendar manifest + trigger.
- `services/oauth/dispatcher.ts` — add `OAUTH_BY_PROVIDER["google-calendar"]` entry.
- `vercel.json` — add `/api/cron/renew-watch-subscriptions` at `*/10 * * * *`.

Migrations:
- **None for this batch.** Both originally-scoped migrations (`session_side_effects`, `user_profiles.timezone`) deferred per the bullet above.

Tests:
- `tests/unit/integrations/google-calendar/oauth.test.ts`
- `tests/unit/integrations/google-calendar/actions/createEvent.test.ts` and one per other action
- `tests/unit/integrations/google-calendar/triggers/activate.test.ts`
- `tests/unit/integrations/google-calendar/triggers/renew.test.ts`
- `tests/unit/integrations/google-calendar/triggers/pull.test.ts`
- `tests/unit/integrations/google-calendar/webhooks/receive.test.ts`
- `tests/unit/integrations/google-calendar/utils/channelToken.test.ts`
- `tests/unit/core/contracts/parseRecipients.test.ts`
- `tests/unit/core/contracts/resolveTimezone.test.ts`
- `tests/unit/core/contracts/parseTimeOrFail.test.ts`
- `tests/unit/core/contracts/requireExplicitField.test.ts`
- `tests/unit/core/contracts/sessionSideEffects.test.ts`
- `tests/unit/app/api/webhooks/google-calendar.route.test.ts`
- `tests/unit/app/api/cron/renew-watch-subscriptions.route.test.ts`
- `tests/structure/manifest.google-calendar.test.ts` — manifest validation + registry presence.

---

## V1 → V2 file-by-file map

| V1 path | What we do | V2 destination |
|---|---|---|
| `lib/workflows/actions/google-calendar/createEvent.ts` | Adapt | `integrations/google-calendar/actions/createEvent.ts` |
| `lib/workflows/actions/google-calendar/listEvents.ts` | Adapt + fix throw→return | `integrations/google-calendar/actions/listEvents.ts` |
| `lib/workflows/actions/google-calendar/updateEvent.ts` | Adapt + remove '09:00' synthetic + align Meet shape with create | `integrations/google-calendar/actions/updateEvent.ts` |
| `lib/workflows/actions/google-calendar/deleteEvent.ts` | Adapt + fix throw→return | `integrations/google-calendar/actions/deleteEvent.ts` |
| `lib/workflows/actions/google-calendar/addAttendees.ts` | Adapt | `integrations/google-calendar/actions/addAttendees.ts` |
| `lib/workflows/actions/google-calendar/getEvent.ts` etc. | **Skip for batch 1** | n/a |
| `lib/workflows/actions/google-calendar/quickAddEvent.ts` | **Skip** | n/a |
| `lib/workflows/actions/google-calendar/removeAttendees.ts` | **Skip** (port later if asked) | n/a |
| `lib/workflows/actions/google-calendar/moveEvent.ts` | **Skip** | n/a |
| `lib/workflows/actions/google-calendar/getFreeBusy.ts` | **Skip** | n/a |
| `lib/workflows/nodes/providers/google-calendar/index.ts` | Reference for schema field shapes only — V2 schema lives next to each handler as `*.schema.ts` (Zod). | per-action `*.schema.ts` |
| `lib/triggers/providers/GoogleApisTriggerLifecycle.ts` | Selective port — Calendar slice only. Drop the multi-provider switch; V2 ports cleanly per-provider. | `integrations/google-calendar/triggers/eventChanged/{activate,deactivate,renew,pull}.ts` |
| `lib/webhooks/google-calendar-watch-setup.ts` | **Do not copy** (deprecated) | n/a |
| `app/api/webhooks/google/route.ts` | Adapt — but per-provider route, not multiplexed. | `app/api/webhooks/google-calendar/route.ts` |
| `app/api/cron/renew-webhook-subscriptions/route.ts` | Adapt — V2 builds a generic subscription-renewal orchestrator, Calendar registers into it. | `app/api/cron/renew-watch-subscriptions/route.ts` + `services/triggers/runRenewals.ts` |
| `lib/integrations/google-calendar.ts` (`getGoogleCalendars`) | Adapt | `integrations/google-calendar/api/calendarsList.ts` |
| `__tests__/nodes/google-calendar-create-event.test.ts` | Reference style only. V2 mocks `fetch` (not the googleapis SDK), matching the Gmail test pattern. | `tests/unit/integrations/google-calendar/actions/createEvent.test.ts` |
| `__tests__/workflows/pr-g2-calendar-required-fields.test.ts` | Reference Q11 contract. | folded into per-action tests |

---

## What gets copied mostly as-is

- **Time-format strict validation** + end-time-from-start (`+60` minutes) logic. Lift the algorithm; rebuild on `parseTimeOrFail` / `addMinutesToTime` helpers.
- **All-day vs timed event encoding** — the two-path logic in `createEvent.ts` (use `start.date` for all-day, `start.dateTime + timeZone` for timed).
- **Notification array → Calendar reminders mapping**, including the all-day-event "1 day before at 9:00 AM" → minutes-formula transform. (V1's formula is correct but ugly; we keep the math, clean up the code.)
- **Google Meet link extraction** from `conferenceData.entryPoints` (`entryPointType === 'video'`).
- **Idempotency hash field set** — same fields V1 hashes (calendarId, summary, location, description, start, end, attendees, visibility, transparency, colorId, recurrence, reminders, guest perms, createMeetLink, sendUpdates).
- **`addAttendees` dedup logic** — case-insensitive email comparison against existing event attendees, only patch when there are new ones.

## What gets adapted for V2 boundaries

- **OAuth wiring**: V1 keeps a single OAuth dispatcher with per-provider config records; V2 has per-provider `oauth.ts`. Calendar's `oauth.ts` is a thin module that delegates to a small new shared helper at `integrations/_shared/google/oauth.ts` (extracted from Gmail's `oauth.ts`). Gmail switches to use the shared helper in the same PR — no behavior change, only deduplication. This is the only existing-Gmail file we modify.
- **Token retrieval**: V1 uses `getDecryptedAccessToken(userId, provider)`. V2 reads tokens via the integrations repo + the OAuth dispatcher. Use V2's accessor.
- **Action handler signature**: V1 is `(config, userId, input, meta?) → ActionResult`. V2's action handlers (per Gmail's `sendEmail.ts`) take a typed input + a runtime context object. Port to V2's shape; the meta fields needed (workflowId, runId, nodeId, executionSessionId, testMode) come from the V2 context.
- **`refreshAndRetry` wrapping**: V2's helper is at `services/oauth/refreshAndRetry.ts`; same function shape as V1's. Wrap the principal API call in each action.
- **Trigger lifecycle**: V1's `GoogleApisTriggerLifecycle` is a single class handling Gmail/Calendar/Drive/Docs/Sheets. V2 prefers per-provider modules with a thin shared registry (mirrors `pollingRegistry.ts`). Calendar gets its own activation / deactivation / renew / pull modules; the shared `subscriptionRegistry.ts` lets Drive register the same way later.
- **Webhook receiver**: V1 multiplexes Gmail/Calendar/Drive at one route. V2 splits per provider — `app/api/webhooks/google-calendar/route.ts`. (Trade-off discussed below.)
- **Q4 idempotency storage**: V1 has `session_side_effects`. V2 doesn't, and this batch doesn't add it — see "Deferred" note above. Calendar handlers compute the key + payload hash but don't store/lookup; storage lands when V2 grows same-session retries.
- **Q12 timezone source data**: V1 reads `workspaces.timezone` and `user_profiles.timezone`. V2 doesn't have these. Calendar takes timezone from explicit action config and falls back to `'UTC'`; the workspace/user fallback layer is deferred. Workflow authors who want events in a specific TZ pass the IANA string in the field.

## What gets rewritten because V1 is messy / wrong

- **`updateEvent` synthesized fallback**: V1 substitutes `'09:00'` + 60 min when the existing event lacks start/end (audit Q12 line 134-136). This is exactly the "hidden default" Q11/Q12 forbids. **V2: fail explicitly** with `MISSING_REQUIRED_FIELD`. If the user wanted to update without supplying times, they should pass them through.
- **Inconsistent error handling**: `listEvents.ts` and `deleteEvent.ts` throw on auth/404 errors; `createEvent.ts` and `updateEvent.ts` return `ActionResult` failure shapes. **V2: all five handlers return `ActionResult` failures**, never throw. Q3's `Unauthorized401Error` thrown inside `refreshAndRetry` is caught at the wrapper boundary; the handler returns a structured failure.
- **`updateEvent` Google Meet shape**: V1 reads `googleMeet.link` as an object property; `createEvent` reads it as a boolean. **V2: align both on a boolean** (`googleMeet: true` → create Meet on the event; `false` / unset → don't touch). Updating an existing Meet conferenceData is out of scope for batch 1.
- **`conferenceData.requestId` instability** (CLAUDE.md note): V1 uses `meet_${Date.now()}`, which (a) is non-deterministic across retries and (b) forces the field to be excluded from the idempotency hash. **V2: derive a stable seed from `meta.runId + ':' + meta.nodeId`** so the requestId is identical on retry. Google Meet creation becomes naturally idempotent (Google itself dedups by requestId server-side), and the field can stay in the hash without breaking replay detection.
- **Channel ID generation**: V1 uses `chainreact-{workflowId}-{Date.now()}`. **V2: `chainreact-{workflowId}-{nodeId}-{crypto.randomUUID()}`** — uniqueness across re-activations + no millisecond collision concerns + nodeId in the ID makes per-trigger debugging easier.
- **Channel token**: V1 stores arbitrary JSON metadata in the `token` field. **V2: store an HMAC** of `(channelId, workflowId, nodeId)` keyed on `WATCH_CHANNEL_SECRET` env var. The receive endpoint validates the HMAC; the metadata we need is recovered from `trigger_resources` keyed by `channelId`. This is a cleaner security boundary — the token isn't a metadata blob, it's a verifiable signature.

## What we intentionally skip

- **Drive, Docs, Sheets, Outlook, OneDrive watches.** Calendar only.
- **5 of V1's 10 calendar actions:** `getEvent`, `quickAddEvent`, `removeAttendees`, `moveEvent`, `getFreeBusy`. Port later if asked.
- **Calendar conferencing beyond a `googleMeet: true` boolean** on create. No Meet teardown, no provider preference, no recurring-conference setup.
- **Recurring event RRULE editing.** `recurrence` field on create is forwarded to Google as-is (Google validates the RRULE strings); we don't add a recurrence builder.
- **`event_updated` and `event_canceled` triggers.** V1 has 3 trigger types; we ship one (`event_changed`) that fires on any change and includes the change kind in the payload (`created` | `updated` | `cancelled` derived from `eventCreated/eventUpdated/eventCancelled` filters in V1). Splitting into three trigger types adds three registrations and three cron entries for marginal product gain. Doing one general-purpose trigger gets us the watch path validated; we can split later if customers need separate filters.
- **`conferenceData` Meet creation in `updateEvent`.** Skipped to avoid the legacy V1 object-vs-boolean inconsistency dragging into V2.
- **Workspace-level timezone fallback** if V2 doesn't yet have a workspace concept — scope to user-level only, document the deferral.

---

## OAuth strategy

- **Provider id:** `google-calendar` (matches V1, easy mental model alongside `gmail`).
- **Scopes:** `["https://www.googleapis.com/auth/calendar"]` — full read/write. The five chosen actions all require write access (event create/update/delete/patch); requesting only `calendar.readonly` would block them. Single broad scope is simpler than per-action scope optimization for batch 1.
- **Refreshable:** `true` (Google issues refresh tokens with `access_type=offline` + `prompt=consent` on initial connect).
- **Account ID:** the user's Google email. Resolve at callback time via the `https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1` call (the primary calendar's ID is the user's email). Do not depend on `userinfo` — that requires the `email` scope which we're not requesting.
- **Token storage:** same as Gmail — encrypted via the existing `TOKEN_ENCRYPTION_KEY` machinery.
- **Connect flow:** identical to Gmail's PKCE S256. The Google client ID/secret env vars are shared (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- **Redirect URI:** `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/google-calendar/callback`. New route mirrors `/api/integrations/oauth/gmail/callback`. (Verify the Google OAuth app in the dashboard already has this redirect URI registered — that's a manual confirmation step before connect actually works in production, but doesn't block code.)
- **Re-consent:** A user with Gmail connected who adds Calendar gets a fresh OAuth consent screen showing the new scope. V2's per-manifest scope model (audit confirmed: "manifests are independent; each integration connects independently") means there's no merging — Gmail and Calendar are separate connections under separate scope sets.

### Shared Google OAuth helper (small refactor)

Both Gmail and Calendar do the same PKCE generate / authorize URL build / token exchange / refresh dance. Extract it once into `integrations/_shared/google/oauth.ts`:

- `generatePkce()` — copied from Gmail
- `buildGoogleAuthUrl({ scopes, redirectUri, state, codeChallenge })` — generic
- `exchangeGoogleAuthCode({ code, redirectUri, codeVerifier })` — generic
- `refreshGoogleToken({ refreshToken })` — generic, preserve-old-refresh-token policy
- `getGoogleUserAccountIdForCalendar(accessToken)` — Calendar-specific accountId resolver
- (Gmail keeps its existing `usersGetProfile` accountId resolver.)

Gmail's `oauth.ts` becomes a thin wrapper that calls the shared helpers + supplies its own scopes + accountId resolver. Calendar's `oauth.ts` mirrors that. **Gmail tests must continue to pass without modification** — that's the verification the refactor didn't regress anything.

---

## Actions (Batch 1 scope)

For each action, schema in Zod next to handler. All five handlers:
- Take `(input, ctx)` where `ctx` includes `userId`, `accountId`, `workflowId`, `runId`, `nodeId`, `executionSessionId`, `testMode`.
- Q3-wrapped principal API call via `refreshAndRetry({ userId, provider: 'google-calendar', accountId, apiCall })`.
- Q4 idempotency for write actions (createEvent, updateEvent, addAttendees, deleteEvent — yes for delete too, since "delete already-deleted event" should be idempotent and not trigger 404 on retry).
- Q11 explicit-required-field check for the fields V1 declares as Q11 fields:
  - `createEvent`: `sendNotifications`, `guestsCanInviteOthers`, `guestsCanSeeOtherGuests`
  - `updateEvent`: `sendNotifications` (others optional on update)
  - `deleteEvent`: `sendNotifications`
  - `addAttendees`: `sendNotifications`
- Test-mode short-circuit (Q8d) — return synthetic success without touching Google.

### `createEvent`
- Resolve start/end timezone via Q12 chain.
- Two encoding paths: all-day (`start.date`/`end.date`, no timeZone) vs timed (`start.dateTime`/`end.dateTime` + `timeZone`).
- Attendees through `parseRecipients`; map to `[{email}]`; only set guest-permission fields if attendees > 0.
- Notifications array → Google `reminders.overrides[]` with the V1 minutes math.
- `googleMeet: true` → set `conferenceData.createRequest` with stable `requestId = "meet-${runId}-${nodeId}"` + `conferenceSolutionKey.type = 'hangoutsMeet'`.
- Output: `eventId`, `htmlLink`, `start`, `end`, `meetLink` (extracted from response), `attendees`, `status`.

### `listEvents`
- Read-only — no Q4 / Q11.
- Relative date strings ("today", "tomorrow", "next_week", "next_month") + ISO supported.
- `singleEvents: true` default; pagination via `pageToken`.
- Output identical to V1 (`events`, `count`, `firstEventId`, `lastEventId`, `firstEvent`, `lastEvent`, `nextPageToken`, `nextSyncToken`, etc.).

### `updateEvent`
- Fetch existing event first (`events.get`); merge only defined fields.
- **No '09:00' synthesis** — if the user is updating times, both must be present; if either is missing and the existing event has neither, return `MISSING_REQUIRED_FIELD`.
- `googleMeet` boolean only. Updating an existing Meet's properties is out of scope.
- `conferenceDataVersion: googleMeet ? 1 : 0` on the update call.

### `deleteEvent`
- Fetch first to capture original details for output.
- Call `events.delete`; return `{ eventId, deleted: true, deletedAt, eventTitle, eventStart, eventEnd, calendarId }`.
- 404 on retry (already deleted) → return success with `deleted: true, alreadyDeleted: true`. Q4 cache will catch most retries before this; the 404 path is a safety net.

### `addAttendees`
- Fetch existing event; compute set difference (case-insensitive email match).
- Early return if all already invited — `{ actuallyAdded: 0, ... }`.
- Otherwise `events.patch` with merged attendees; `sendUpdates` from `sendNotifications`.

---

## Trigger / watch lifecycle design

**Trigger id:** `event_changed`. Fires when any event in the watched calendar is created, updated, or cancelled. Payload includes the change kind so workflow filters can route on it.

### Activation (`triggers/eventChanged/activate.ts`)

Called when a workflow with this trigger node is activated. Receives `(workflowId, userId, nodeId, config: { calendarId })`.

1. Resolve token via OAuth dispatcher → access token.
2. **Initial sync-token capture** (per CLAUDE.md "first poll miss" lesson): paginate `events.list` with `singleEvents: true` until no `nextPageToken`; grab the final `nextSyncToken`. Without this, the first push notification arrives before we have a baseline and we can't fetch a delta.
3. Generate `channelId = chainreact-{workflowId}-{nodeId}-{crypto.randomUUID()}`.
4. Generate `channelToken = HMAC-SHA256(channelId + ':' + workflowId + ':' + nodeId, env.WATCH_CHANNEL_SECRET)`.
5. Call `calendar.events.watch` with `{ id: channelId, type: 'web_hook', address: ${NEXT_PUBLIC_APP_URL}/api/webhooks/google-calendar, token: channelToken }`. Google returns `{ resourceId, expiration }`.
6. Insert into `trigger_resources`:
   - `provider: 'google-calendar'`
   - `event_type: 'event_changed'`
   - `workflow_id`, `user_id`, `node_id`
   - `account_id` from the user's connected integration
   - `config: { channelId, resourceId, calendarId, syncToken, type: 'subscription-watch' }`
   - `expires_at` from Google's `expiration` (typically 7 days for Calendar)
   - `last_renewed_at: now()`

The `type: 'subscription-watch'` discriminator tells the renewal orchestrator how to renew this row.

### Deactivation (`triggers/eventChanged/deactivate.ts`)

Receives `(workflowId, nodeId)`.

1. Look up `trigger_resources` row.
2. Resolve token; call `channels.stop({ id: channelId, resourceId })`.
3. Delete the `trigger_resources` row.
4. 403/404 from Google → assume already-stopped, delete row anyway.

### Renew (`triggers/eventChanged/renew.ts`)

Called by the renewal orchestrator (`services/triggers/runRenewals.ts`) for any row with `type: 'subscription-watch'` and `provider: 'google-calendar'` whose expiry is within 24h.

1. Resolve token (refreshing if needed).
2. Generate a fresh channelId + channelToken.
3. Call `events.watch` with the new channelId.
4. Call `channels.stop` on the old channelId (best-effort; ignore 404).
5. Update `trigger_resources` with the new channelId/resourceId/expiration/last_renewed_at. **Do not change syncToken** — it survives channel rotation.

### Pull (`triggers/eventChanged/pull.ts`)

Called from the webhook receive path when a push notification arrives. Receives `(triggerResourceRow)`.

1. Resolve token.
2. Call `events.list` with `syncToken` from `trigger_resources.config.syncToken`. Google returns the delta — events created/updated/deleted since the last syncToken.
3. **410 Gone** (sync token expired): drop syncToken, run a full re-baseline (`singleEvents: true` + page through), capture new `nextSyncToken`, persist, return zero events for this notification (we can't reconstruct what changed).
4. For each event in the delta: classify as `created` | `updated` | `cancelled` (cancelled = `event.status === 'cancelled'`).
5. Update `trigger_resources.config.syncToken` with the new `nextSyncToken`.
6. Return the list of `TriggerEvent` objects, each with payload + a stable dedup key (see below).

The pull function does NOT enqueue runs. It returns events; the receive route hands them to `dispatchTriggerEvent` which handles dedup + workflow gating + enqueue.

### Dedup key (`triggers/eventChanged/dedupKey.ts`)

Each delta event gets `(provider: 'google-calendar', event_id: ${eventId}-${updatedTimestampISO})`. Including `updated` in the key means a real update produces a fresh dedup key (correct: it's a new event for our purposes), while a duplicate push notification for the same change re-uses the same `(eventId, updated)` pair and dedups via the existing `webhook_event_dedup` table.

---

## Webhook route design

`app/api/webhooks/google-calendar/route.ts` — POST handler.

1. Read headers: `X-Goog-Channel-Id`, `X-Goog-Channel-Token`, `X-Goog-Resource-Id`, `X-Goog-Resource-State`, `X-Goog-Message-Number`.
2. Look up `trigger_resources` by `(provider: 'google-calendar', config.channelId = X-Goog-Channel-Id)`.
3. Verify the token: recompute HMAC from `(channelId, workflowId, nodeId, secret)`; constant-time compare with header value. Mismatch → 401, no body.
4. **Sync handshake** — `X-Goog-Resource-State: sync` is Google's "this watch is now active" notification; we receive it once at activation. Return 200 immediately, no dispatch.
5. **Real change** — call `pull()` to fetch the delta.
6. For each delta event, call `dispatchTriggerEvent(triggerEvent)` (existing V2 service). It handles:
   - Dedup via `webhookEventDedup`
   - Workflow gating (must be active)
   - Enqueue via `enqueueRun`
7. Return 200 with `{ ok: true, dispatched: <n> }`. Errors during pull/dispatch return 500 so Google retries. Auth failures return 401, NOT 500 — Google interprets 5xx as transient and retries.

Tight body (similar to Slack route): the route is ~30 lines; the meat is in `webhooks/receive.ts` + `triggers/eventChanged/pull.ts`.

---

## Cron renewal design

`app/api/cron/renew-watch-subscriptions/route.ts` — POST handler, schedule `*/10 * * * *`.

1. Auth via `requireCronAuth` (same helper Gmail's poll-triggers cron uses).
2. Call `runRenewals({ provider: 'google-calendar' })` — generic orchestrator.
3. The orchestrator queries `trigger_resources` for rows matching `type: 'subscription-watch'`, `expires_at < now() + interval '24 hours'`, fans out with bounded concurrency (5 workers, 25s timeout — same shape as `runPollingTriggers`), calls each provider's `renew()` handler (looked up via `subscriptionRegistry`).
4. Returns `{ examined, renewed, errors, startedAt }` summary.

`subscriptionRegistry.ts` is the equivalent of `pollingRegistry.ts` for subscription-watch triggers. Calendar registers its renew handler at module load from `triggers/eventChanged/index.ts`.

Add to `vercel.json`:
```json
{
  "path": "/api/cron/renew-watch-subscriptions",
  "schedule": "*/10 * * * *"
}
```

---

## Dedup strategy

Two distinct dedup layers, both DB-backed:

1. **Webhook event dedup** — `webhook_event_dedup` table (already exists in V2). Keyed on `(provider, event_id)` where `event_id = ${googleEventId}-${eventUpdatedISO}`. Prevents the same Calendar change from triggering two workflow runs if Google double-delivers the push notification (which it does for at-least-once semantics). 7-day TTL.
2. **Within-session action idempotency** — `session_side_effects` table (NEW, this slice). Keyed on `(executionSessionId, nodeId, actionType)`. Prevents an action handler from firing twice if a workflow retries inside the same session. Q4 contract. 30-day TTL via cron (out of scope for this slice — schedule the cleanup cron later).

No in-memory dedup anywhere. Server processes are not assumed to be sticky.

---

## Tests

**Per-action handler tests** (5 files):
- happy path with mocked `fetch` → assert request body shape (start/end/timezone/attendees/conference)
- Q11 missing-required-field → returns `MISSING_REQUIRED_FIELD`, no fetch call
- Q12 timezone fallback chain (workspace → user → UTC) using mocked DB
- Q4 replay → cached result returned, no fetch call
- Q4 mismatch → `PAYLOAD_MISMATCH` returned
- 401 on principal call → `refreshAndRetry` triggered → retry succeeds
- testMode → synthetic result, no fetch
- (createEvent only) all-day vs timed encoding, `googleMeet: true` produces stable requestId

**Trigger lifecycle tests:**
- `activate.test.ts`: initial sync-token capture, channel registration, `trigger_resources` row written
- `deactivate.test.ts`: channels.stop called, row deleted, 404 → row still deleted
- `renew.test.ts`: new channel created, old channel stopped, syncToken preserved
- `pull.test.ts`: delta fetched, 410 Gone triggers re-baseline, classifications correct
- `channelToken.test.ts`: HMAC sign + verify symmetry, tampered token rejected, constant-time comparison

**Webhook route test:**
- valid channel + token + resource state `exists` → dispatches events
- valid channel + resource state `sync` → 200 no dispatch
- invalid token → 401
- unknown channelId → 401 (treat as auth failure, not 404)
- replayed message-number → dedup returns 200 with `dispatched: 0`
- pull throws → 500

**Cron route test:**
- auth (CRON_SECRET) — copy poll-triggers test shape
- delegates to `runRenewals` with `{ provider: 'google-calendar' }`
- returns the orchestrator summary

**Helper tests:**
- `parseRecipients`: CSV split, trim, drop empties, mixed array-of-CSV input, single-value passthrough, nullish → `[]`
- `resolveTimezone`: explicit valid IANA returned; invalid IANA → `'UTC'`; nullish → `'UTC'`
- `parseTimeOrFail`: strict HH:MM acceptance / rejection (`9:30` rejected, `24:00` rejected, `12:60` rejected); `addMinutesToTime` 60-min increment + 23:30 + 60 → 00:30 next-day wrap
- `requireExplicitField`: returns standardized failure shape on `undefined`/`null`; passes through `0` and `false` and `""` (Q11 contract)
- `hashPayload` / `buildIdempotencyKey`: canonical-form (key order) stability; array order preserved; deterministic key

**Structure test:**
- `manifest.google-calendar.test.ts`: provider registered, scopes match, manifest validates against `ProviderManifestSchema`.

---

## Known V1 bugs being fixed in this port

1. **`updateEvent` synthesizes `'09:00'`** when existing event lacks times — fixed by failing explicitly with `MISSING_REQUIRED_FIELD`.
2. **`listEvents` and `deleteEvent` throw on auth/404** — fixed by returning `ActionResult` failures consistently.
3. **`updateEvent` Google Meet object shape mismatch with `createEvent`** — fixed by aligning both on a boolean.
4. **`conferenceData.requestId` non-determinism** (CLAUDE.md note) — fixed by using `meet-{runId}-{nodeId}` stable seed; field can stay in idempotency hash.
5. **Channel ID timestamp uniqueness** — fixed by adding `crypto.randomUUID()`.
6. **Channel token as JSON metadata blob** — fixed by replacing with HMAC signature; channel metadata recovered from `trigger_resources` keyed by `channelId`.
7. **V1's deprecated `google_watch_subscriptions` table** — fixed by not copying it; V2 uses `trigger_resources` only.

---

## Out-of-scope confirmation (echoed from approved scope)

- ❌ Google Drive
- ❌ Batch 2 e2e walkthrough
- ❌ Recurring event RRULE *editing* (forwarding `recurrence` strings is fine)
- ❌ Long-tail Calendar actions (`getEvent`, `quickAddEvent`, `removeAttendees`, `moveEvent`, `getFreeBusy`)
- ❌ Calendar conferencing beyond `googleMeet: true` boolean on create
- ❌ Branch protection / e2e CI / unrelated ops cleanup
- ❌ Any provider beyond Calendar

---

## File checklist

**Create (new files):**
- `integrations/_shared/google/oauth.ts`
- `integrations/google-calendar/manifest.ts`
- `integrations/google-calendar/oauth.ts`
- `integrations/google-calendar/api/{eventsInsert,eventsList,eventsUpdate,eventsDelete,eventsGet,eventsPatch,eventsWatch,channelsStop,calendarsList}.ts` (9)
- `integrations/google-calendar/actions/{createEvent,listEvents,updateEvent,deleteEvent,addAttendees}.ts` + matching `*.schema.ts` (10)
- `integrations/google-calendar/triggers/eventChanged/{index,activate,deactivate,renew,pull,dedupKey,schema}.ts` (7)
- `integrations/google-calendar/webhooks/receive.ts`
- `integrations/google-calendar/utils/channelToken.ts`
- `services/triggers/{subscriptionRegistry,runRenewals}.ts`
- `core/integrations/parseRecipients.ts`
- `core/workflows/requireExplicitField.ts`
- `core/workflows/datetime.ts` (`resolveTimezone`, `parseTimeOrFail`, `addMinutesToTime`)
- `core/workflows/idempotency.ts` (`hashPayload`, `buildIdempotencyKey`)
- `app/api/webhooks/google-calendar/route.ts`
- `app/api/cron/renew-watch-subscriptions/route.ts`
- `app/api/integrations/oauth/google-calendar/callback/route.ts`
- All test files listed under "Tests" above (~18 files)

**Modify:**
- `integrations/_registry.ts` — add Calendar manifest + trigger imports
- `integrations/gmail/oauth.ts` — switch to shared helper (no behavior change)
- `services/oauth/dispatcher.ts` — add `OAUTH_BY_PROVIDER["google-calendar"]`
- `vercel.json` — add `renew-watch-subscriptions` cron entry
- `.env.example` — add `WATCH_CHANNEL_SECRET`

**Do not touch:**
- Existing Slack code path
- Existing Gmail tests (they must continue to pass without modification — proves the shared-helper extraction was clean)
- `app/api/cron/poll-triggers/route.ts` and its supporting code
- Anything under `app/(*)` UI

---

## Implementation order (within this single batch / single branch)

Sequenced to keep gates green at each commit boundary. Each numbered step is a meaningful local commit.

1. **Q-contract helpers** + tests. (`core/contracts/*`, no provider code yet — these are pure utilities, fast to ship and verify.)
2. **Migrations** for `session_side_effects` and `user_profiles.timezone`. Run locally to confirm shape.
3. **Shared Google OAuth helper extraction** + Gmail wrapper update. Verify Gmail tests still green.
4. **Calendar manifest + OAuth + callback route + registry registration.** Verify connect flow exists at the type level (no live OAuth test in unit suite — that's for e2e).
5. **Calendar API wrappers** (events.list/insert/update/delete/get/patch/watch + channels.stop + calendars.list). Each wrapper is tiny — they're typed `fetch` calls.
6. **Calendar actions** (5 handlers + schemas + tests). One commit per action is fine; this is the bulk of the LOC.
7. **Subscription registry + renewal orchestrator** (services/triggers/*).
8. **Calendar trigger lifecycle** (activate/deactivate/renew/pull/dedupKey + channelToken util + tests).
9. **Webhook receive route + tests.**
10. **Cron renewal route + tests + vercel.json update.**
11. **Manifest structure test.**

If any step's gates fail, fix before the next step. Local commits between steps are fine; no push until I'm explicitly told.
