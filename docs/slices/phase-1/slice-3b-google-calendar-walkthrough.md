# Slice 3b — Google Calendar e2e walkthrough (Batch 2)

**Branch:** `slice-3-google-calendar` (continuation; Batch 1 already shipped 4 commits locally).
**Goal:** Add a Playwright e2e walkthrough that proves the Calendar slice end-to-end — UI sign-in, mocked Google OAuth, workflow create + activate (which creates the watch), inbound mocked Calendar push notification, sync-token delta pull, dispatch, action handler execution, run history, and dedup.

This is the third walkthrough after Slack (`slice-1-slack-walkthrough.spec.ts`) and Gmail (`slice-2f-gmail-walkthrough.spec.ts`) and follows the same structural template.

---

## Surfaces — what's real, what's mocked

**Real V2 surfaces exercised:**
- Auth (Supabase admin createUser → UI sign-in)
- OAuth dispatcher (`/api/integrations/oauth/google-calendar/connect` and `[provider]/callback`) — same dynamic route as Gmail; PKCE state row + atomic consume
- Token endpoint POST (form-urlencoded + code_verifier)
- Service-role integration insert + AES-256-GCM token encryption
- Workflow CRUD + `active` lifecycle transition
- Activation hook seam — `registerWorkflowTriggers` consults `activationRegistry`, runs Calendar's `activate()`, which paginates `events.list` for an initial `nextSyncToken` then calls `events.watch`
- Watch metadata persisted to `trigger_resources.config` (`type: "subscription-watch"`, `channelId`, `resourceId`, `syncToken`, `expiresAt`)
- Webhook receipt route at `/api/webhooks/google-calendar`
- `verifyChannelToken` HMAC check
- `pull()` calls `events.list?syncToken=…`, persists the new `nextSyncToken`
- `normalize()` produces canonical TriggerEvent with `changeKind`
- `dispatchTriggerEvent` (DB dedup via `webhook_event_dedup`, workflow-state gate, `enqueueRun`)
- Engine + canonical resolver + Calendar `create_event` action handler
- `refreshAndRetry` token decryption on the `events.insert` call

**Mocked surfaces (Google network boundary only):**
- `accounts.google.com/o/oauth2/v2/auth` → 302 to `/api/integrations/oauth/google-calendar/callback`
- `oauth2.googleapis.com/token` → canned access + refresh tokens
- `openidconnect.googleapis.com/v1/userinfo` → `{ email: "alice@e2e.test" }`
- `www.googleapis.com/calendar/v3/calendars/{cid}/events` (GET — `events.list`)
- `www.googleapis.com/calendar/v3/calendars/{cid}/events/watch` (POST — `events.watch`)
- `www.googleapis.com/calendar/v3/calendars/{cid}/events` (POST — `events.insert`, the action call)

Reuses the existing `mockGoogleServer.ts` — adds Calendar routes alongside the Gmail routes.

---

## Test flow — 13 steps mirroring slice-2f

The spec file is `tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts`.

1. **Sign in via UI.**
2. **Snapshot `oauth_states` row count** for the consumed-state assertion.
3. **Connect Google Calendar via UI** — `Connect Google Calendar` button → mocked authorize → V2 callback lands on `/?integration=connected&provider=google-calendar`.
4. **Verify integration row + scopes** — DB has Calendar row, `provider_account_id === "alice@e2e.test"`, encrypted tokens != plaintext, scopes = manifest's required pair (`calendar.events` + `userinfo.email`).
5. **Verify OAuth call counts** — exactly 1 authorize, 1 token exchange, 1 userinfo. `code_verifier` present in token-exchange body.
6. **Create workflow via UI.**
7. **Patch the draft definition via API** — same shortcut as Gmail spec (per-node config UI not yet shipped):
   - Trigger node: `provider: "google-calendar"`, `type: "event_changed"`, `config: { calendarId: "primary" }`
   - Action node: `provider: "google-calendar"`, `type: "create_event"`, hardcoded fields (summary, start/end, all-day=false, sendNotifications/guestsCan*).
8. **Activate workflow via UI.**
   - Activation hook calls `events.list` (initial sync — mock returns one page with a `nextSyncToken`) and `events.watch` (mock returns canned `id`/`resourceId`/`expiration`).
   - Assert `trigger_resources` row: `provider="google-calendar"`, `event_type="event_changed"`, `config.type="subscription-watch"`, `config.channelId` matches activate's `chainreact-…-{uuid}` pattern, `config.resourceId` matches mock canned value, `config.syncToken="sync-100000"`, `config.expiresAt` is a future ISO timestamp, `config.calendarId="primary"`.
   - Assert mock call counts — 1 `events.list` (initial sync, no `syncToken` query param), 1 `events.watch`. No insert yet.
9. **Inject a calendar event via mock control plane.**
   - Bumps `currentSyncToken` from `sync-100000` to `sync-100001`. Queues the event for the next `events.list?syncToken=sync-100000` call.
10. **POST a Google Calendar push notification to V2.**
    - Hand-crafted POST to `http://localhost:3001/api/webhooks/google-calendar` with the 5 required `X-Goog-*` headers — `Channel-Id` from the trigger row, `Channel-Token` recomputed via `buildChannelToken`, `Resource-State: exists`. Empty body (Calendar push has no body for `exists`).
11. **Wait for `workflow_runs` row → assert `succeeded`.**
    - Engine ran. `error_classification` is null.
12. **Verify mock call shape** — exactly 1 `events.list` with `syncToken=sync-100000` (the delta pull), exactly 1 `events.insert` (the action). Insert body has `summary` from action config, `start.dateTime` + `start.timeZone="UTC"` (Q12 fallback), `sendUpdates=…` from config. Insert `Authorization` header is `Bearer ya29.mock-e2e-access` (proves encrypted token round-tripped).
13. **Verify cursor advanced + dedup row.**
    - `trigger_resources.config.syncToken === "sync-100001"`.
    - `webhook_event_dedup` row exists keyed on `(google-calendar, "{eventId}:{updated}")`.
14. **Verify run history UI** shows the succeeded run.
15. **Verify no failure notification** for this user.
16. **Dedup probe — replay same push.**
    - POST the SAME webhook (same headers) to V2. The mock's pending-history queue is now empty so even if `pull()` runs, `events.list` returns no items; but more importantly, the dedup table lookup on `(google-calendar, eventId)` is set so dispatch returns `duplicate: true` before pull would even fire.
    - **Critical caveat:** dedup happens on the dispatched `eventId` (which combines `googleEventId + updated`). If we replay the literal POST, V2 hits dedup BEFORE pull runs (because `markSeen` is called first against the same event id from the previous run). But the receive route can't know the eventId until pull runs. So the realistic dedup probe is: replay the push, V2 calls `pull()` again, mock returns ZERO items (queue is drained), dispatch is never called for any event, no second run is enqueued. The dedup table catches duplicates only if pull surfaces the event again. That's still a valid e2e check — it just verifies "second push with no actual delta produces no second run."
    - **Better dedup probe:** use a `__replayLastEvent` mock control-plane knob that re-queues the same calendar event id at the SAME (un-bumped) sync token. Then `pull()` returns the event, `normalize()` produces the same `eventId` (because `updated` is the same), dispatch hits `webhook_event_dedup` and returns `duplicate: true`. This is the analog of Gmail's `__replayLastEmail` and is the correct shape.
    - Assert no second `workflow_runs` row, no second `events.insert` call.

---

## Files to create / modify

**Modify:**
- `tests/e2e/helpers/mockGoogleServer.ts` — add Calendar routes:
  - `GET  /v1/userinfo` → email + sub
  - `GET  /calendar/v3/calendars/{cid}/events` (handles both `?syncToken=…` for delta and the no-syncToken initial-baseline call). Initial baseline returns one page with `nextSyncToken: "sync-100000"`. Delta-with-syncToken returns queued events whose `historyId >= startSyncToken` (or empty).
  - `POST /calendar/v3/calendars/{cid}/events/watch` → `{ id, resourceId, expiration }` where `expiration = Date.now() + 7d` as a string.
  - `POST /calendar/v3/calendars/{cid}/events` → record body, return canned `{ id, htmlLink, status: "confirmed", … }`.
  - Control plane: `POST /__injectCalendarEvent`, `POST /__replayLastCalendarEvent`.
  - Extend recorded-call buckets for `userinfo`, `calendarEventsList`, `calendarEventsWatch`, `calendarEventsInsert`. Reset clears all of them.
- `playwright.config.ts` — add three `webServer.env` entries:
  - `GOOGLE_CALENDAR_API_BASE` → mock base
  - `GOOGLE_USERINFO_BASE` → mock base
  - (`GOOGLE_AUTHORIZE_BASE` and `GOOGLE_TOKEN_BASE` already point at the mock from Slice 2f.)
- `tests/e2e/helpers/supabaseAdmin.ts` — no changes needed; existing helpers cover what we need. (`getTriggerResourcesForUser` filters by user; we read its `config` JSONB.)

**Create:**
- `tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts`

---

## Mock state model

**State (extends Gmail mock state):**
```
calendarCurrentSyncToken: string         // "sync-100000" seed
calendarPendingDeltaEntries: Array<{     // queued by __injectCalendarEvent
  syncTokenAtInsert: string,             // sync token that was current when injected
  event: CalendarEventResource           // full event resource the delta GET returns
}>
calendarLastInjectedEventId: string | null
```

**Control plane semantics:**
- `__injectCalendarEvent` bumps `calendarCurrentSyncToken` (e.g. `sync-100000` → `sync-100001`) and pushes the event onto the queue with `syncTokenAtInsert = NEW token`. The next `events.list?syncToken=sync-100000` returns it AND `nextSyncToken = sync-100001`.
- `__replayLastCalendarEvent` re-queues the most-recent event at its ORIGINAL `syncTokenAtInsert` without bumping the cursor — exact analog of Gmail's `__replayLastEmail`.
- `events.list` semantics:
  - With no `syncToken` query param: this is the activate-time initial baseline. Return `{ items: [], nextSyncToken: calendarCurrentSyncToken }`. Drop nothing from the queue.
  - With `syncToken=X`: drain entries whose `syncTokenAtInsert >= X`, return them. Always include `nextSyncToken: calendarCurrentSyncToken` so pull persists the new cursor.

**Reset clears all Calendar state along with Gmail state.**

---

## Webhook POST shape (from spec)

The mock does NOT post the webhook to V2 — Google's real flow has the dev server post to the public webhook URL it registered, but in e2e we post directly from the spec to V2. This mirrors Slack (where the spec also posts the webhook directly).

```
POST http://localhost:3001/api/webhooks/google-calendar
Headers:
  X-Goog-Channel-Id:        {triggerRow.config.channelId}
  X-Goog-Channel-Token:     buildChannelToken({channelId})       // recomputed in spec
  X-Goog-Resource-Id:       {triggerRow.config.resourceId}
  X-Goog-Resource-State:    "exists"
  X-Goog-Message-Number:    "1"
Body: ""
```

The spec imports `buildChannelToken` from `@/integrations/google-calendar/utils/channelToken` and reads `WATCH_CHANNEL_SECRET` from the dev-server env (lifted in `global-setup.ts`).

`global-setup.ts` `SPEC_PROCESS_ENV_KEYS` needs `WATCH_CHANNEL_SECRET` added so the spec process can compute the same HMAC the receive route validates.

---

## Stability + cleanup

- Per-run unique calendar event id (`evt-e2e-${randomUUID()}`) so the `webhook_event_dedup` row from one run doesn't clash with the next (the table is system-wide; user delete doesn't cascade to it — same constraint as Gmail).
- Mock state `__reset` at the top of the test.
- `deleteTestUser` at teardown cascades through `integrations`, `workflows`, `workflow_runs`, `oauth_states`, `trigger_resources` (FK → user_id).

---

## Out of scope

- Per-node configuration UI (still patched via API `PATCH /api/workflows/{id}` like Gmail).
- Calendar list UI / `getGoogleCalendars` data loader (the spec hardcodes `calendarId: "primary"`).
- Real Google quota / 429 retry behavior.
- Watch renewal cron (covered by unit tests; e2e for renewal would require time-travel and is not worth the complexity).
- Sync-token-expired (HTTP 410) re-baseline path (unit-tested in `pull.test.ts`).
- Multiple workflows on one channel.
- Multi-user concurrent activation.

---

## Validation sequence after implementation

1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run lint:structure`
4. `npm run lint:migrations`
5. `npm test`
6. Slack e2e — confirm no regression: `npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts`
7. Gmail e2e — confirm shared mock state isolation: `npx playwright test tests/e2e/slice-2f-gmail-walkthrough.spec.ts`
8. Calendar e2e — twice back-to-back for stability: `npx playwright test tests/e2e/slice-3b-google-calendar-walkthrough.spec.ts`
