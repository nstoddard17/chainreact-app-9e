# Calendly provider research

Slice 5.CALENDLY-1. Researched 2026-07-04. Primary sources: the official
developer docs at `https://developer.calendly.com` (a Gatsby site whose
`api-docs/*` reference pages are Stoplight-embedded and only partially
machine-readable; guide pages render fully). Where a reference page would
not render, facts were cross-verified against production-grade open-source
integrations that implement the official contract (n8n's CalendlyTrigger V2
and Botpress's Calendly webhook Zod schemas — both current, both linked
below). Anything not confirmed by an official page or a converging
production implementation is flagged `UNVERIFIED`; nothing below is
invented.

## Auth type

OAuth 2.0 authorization code flow. Calendly describes its implementation
as moving to OAuth 2.1 and directs: "For all OAuth applications (web or
native) use a specific redirect_uri, a Proof Key for Code Exchange (PKCE),
and S256 for code_challenge_method" — i.e. PKCE S256 for web apps too.
Web (confidential) clients authenticate the token call with HTTP **Basic**
(`client_id:client_secret`); native clients send `client_id` in the body.
V2 ships confidential-client Basic auth PLUS PKCE S256 (both directed).

- Authorize: `GET https://auth.calendly.com/oauth/authorize` with
  `client_id`, `response_type=code`, `redirect_uri`, `code_challenge`,
  `code_challenge_method=S256`, `state`. Scopes are space-delimited in the
  `scope` param (per the scopes page). Authorization codes expire after
  10 minutes.
- Token exchange: `POST https://auth.calendly.com/oauth/token`,
  form-encoded `grant_type=authorization_code`, `code`, `redirect_uri`,
  `code_verifier`, with Basic auth.
- Token response: `{ access_token, refresh_token, token_type: "Bearer",
  expires_in: 7200, scope, owner, organization, created_at }`. `owner` is
  the connecting user's URI ("currently always a user"); `organization`
  is their org URI — both are needed later for webhook subscriptions, so
  connect persists them in account metadata.
- Access token expiry: **2 hours** (`expires_in: 7200`).
- Refresh: `POST /oauth/token` with `grant_type=refresh_token`. **Refresh
  tokens are single-use and ROTATE**: "A refresh token is revoked
  immediately after a successful POST /oauth/token call." Rollout: early
  2026 introduction, enforcement for all integrations by 2026-08-31.
  Reusing a spent token → HTTP 400/401 with `"error": "invalid_grant"`.
  The rotated token MUST be persisted on every refresh (Typeform
  precedent).
- Identity endpoint: `GET https://api.calendly.com/users/me` →
  `resource.uri` (user URI), `resource.current_organization` (org URI),
  plus `name`, `email`, `slug`, `scheduling_url`, `timezone` (field list
  beyond uri/current_organization is PARTIALLY VERIFIED — the reference
  page did not render; n8n reads exactly `resource.uri` +
  `resource.current_organization`).
- Redirect URI: registered per app. **Sandbox** apps allow
  `http://localhost` redirect URIs; **Production** apps require HTTPS.
  Exact-match semantics: UNVERIFIED (assume exact match).

Sources:
- https://developer.calendly.com/api-docs/3cefb59b832eb-calendly-o-auth-2-0
- https://developer.calendly.com/api-docs/b3A6NTkxNDA4-get-access-token
- https://developer.calendly.com/refresh-token-rotation-guide (fetched 2026-07-04)
- https://developer.calendly.com/how-to-access-calendly-data-on-behalf-of-authenticated-users

## Scopes (granular; verified against the live scopes page 2026-07-04)

Calendly introduced granular scopes; **newly created OAuth apps get NO API
access until scopes are requested**. Legacy apps/tokens keep full access
(`scope: "default"`) and migrate transparently on refresh. A `:write`
scope implicitly includes the corresponding `:read` scope in the same
domain. Full catalog (from https://developer.calendly.com/scopes):
`availability:read/write`, `event_types:read/write`, `locations:read`,
`routing_forms:read`, `shares:write`, `scheduled_events:read/write`,
`scheduling_links:write`, `groups:read`, `organizations:read/write`,
`users:read`, `webhooks:read/write`, `activity_log:read`,
`data_compliance:write`, `outgoing_communications:read`,
`contacts:read/write`.

Required for this slice (minimum set):

| Scope | Used by |
|---|---|
| `users:read` | `GET /users/me` — connect-time identity + user/org URIs for subscription creation |
| `event_types:read` | `calendly:event_types` option source (`GET /event_types`) |
| `webhooks:write` | trigger activation (`POST /webhook_subscriptions`) and deactivation (`DELETE /webhook_subscriptions/{uuid}`) |
| `scheduled_events:read` | receiving `invitee.*` webhook payloads — the scopes page: "Webhook subscriptions must be scoped by the event family you want to receive. Your app must be granted the related read scopes to receive webhook event payloads." |

Considered and REJECTED (no scope bloat): `webhooks:read` (V2 never lists
webhooks back; deactivation deletes by the stored subscription URI),
`invitees:read` (NOT in the current catalog — invitee payload access rides
on `scheduled_events:read`), `scheduled_events:write` /
`event_types:write` / `organizations:*` / `routing_forms:read` / all
others: out of slice scope.

## Webhook subscriptions API (trigger lifecycle)

- Create: `POST https://api.calendly.com/webhook_subscriptions` with JSON
  body `{ url, events, organization, user, scope, signing_key }`.
  - `scope`: `"user"` (only the token owner's scheduled events; available
    to every user) or `"organization"` (all members' events; requires org
    owner/admin). **V2 ships `scope: "user"` only** — the personal
    credential class acts as the connecting human, and org scope would
    both require an admin token and fan in co-workers' meetings.
  - `organization` (org URI) is always sent; `user` (user URI) is sent
    for user scope (n8n and Activepieces both send `organization` + `user`
    together for user scope; the official example shows org scope with
    `organization` only).
  - `signing_key`: **caller-minted** shared secret used for delivery
    signatures ("strongly advised"). V2 mints 32 random bytes per
    subscription and stores them encrypted on the trigger row (Typeform
    caller-minted-secret pattern).
  - Response: `{ resource: { uri: "https://api.calendly.com/webhook_subscriptions/{uuid}",
    callback_url, events, scope, state, ... } }`. The `uri` is persisted
    for deactivation.
  - **No creation handshake/challenge is documented or implemented by any
    production integration surveyed** — creation succeeds without the
    endpoint proving anything. The receive route still quiet-acks unknown
    deliveries defensively.
- Delete: `DELETE https://api.calendly.com/webhook_subscriptions/{uuid}`.
- List/Get exist (`GET /webhook_subscriptions?organization=…&scope=…`,
  `GET /webhook_subscriptions/{uuid}`) — NOT used this slice (would need
  `webhooks:read`).
- Expiry/renewal: **none**. Subscriptions live until deleted, or until
  Calendly disables them after sustained delivery failure. A disabled
  subscription cannot be re-enabled via API — delete + recreate
  (deactivate/reactivate in V2 terms).
- Duplicate creation: Calendly rejects a subscription duplicating an
  existing (url, events, scope) with HTTP 409 "Hook with this url already
  exists" (community-reported; UNVERIFIED exact wording). V2's per-node
  URL (`?workflowId=&nodeId=`) makes collisions impossible except when a
  crashed lifecycle left an orphan — that case surfaces a humanized
  "deactivate and reactivate" error.
- **PLAN GATE:** webhook API usage requires the connecting user's Calendly
  account to be on a **paid plan (Standard, Professional, Teams, or
  Enterprise)**. Free-plan users cannot create webhook subscriptions —
  creation fails (403-family; exact code UNVERIFIED). Surfaced as a
  humanized activation error and documented in the owner setup report.

Sources:
- https://developer.calendly.com/receive-data-from-scheduled-events-in-real-time-with-webhook-subscriptions (fetched 2026-07-04)
- https://developer.calendly.com/api-docs/b3A6NTkxNDI1-create-webhook-subscription
- https://developer.calendly.com/api-docs/565b97f62dafe-delete-webhook-subscription
- https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM5-webhook-errors
- https://calendly.com/help/webhooks-overview (paid-plan requirement)
- n8n CalendlyTriggerV2 (create body incl. signing_key + user for user scope):
  https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Calendly/v2/CalendlyTriggerV2.node.ts

## Webhook events

Officially documented subscribable events: `invitee.created` (a meeting
was booked), `invitee.canceled` (a meeting was canceled),
`routing_form_submission.created` (org scope only). Botpress's current
schema additionally handles `invitee_no_show.created` /
`invitee_no_show.deleted` (no-show marks) — present in the wild but NOT
confirmed on the official event list this slice; out of scope regardless.

V2 trigger mapping (slugs follow the prompt's spec; Calendly's own API
noun for a booking is a "scheduled event", and the product UI calls them
meetings):

| V2 trigger | Provider event | Fires when |
|---|---|---|
| `calendly:event_scheduled` | `invitee.created` | someone books a meeting |
| `calendly:event_canceled` | `invitee.canceled` | a meeting is canceled (including the cancel half of a reschedule) |

## Webhook payload shape

Envelope: `{ event: "invitee.created" | "invitee.canceled", created_at,
created_by (URI of the subscription creator), payload }`. The `payload` is
the **invitee** object:

- `uri` — `https://api.calendly.com/scheduled_events/{event_uuid}/invitees/{invitee_uuid}`
  (the stable identity pair used for dedup),
- `email`, `name`, `first_name`, `last_name`, `status`
  (`active`/`canceled`), `timezone`,
- `questions_and_answers[]` — `{ question, answer, position }`,
- `tracking` — `{ utm_campaign, utm_source, utm_medium, utm_content,
  utm_term, salesforce_uuid }` (all nullable),
- `rescheduled` (boolean), `old_invitee` / `new_invitee` (URIs, nullable),
- `cancel_url`, `reschedule_url` — invitee-facing action links,
- `cancellation` — present on canceled invitees: `{ canceled_by, reason,
  canceler_type ("host" | "invitee"), created_at }`,
- `payment`, `no_show`, `reconfirmation`, `routing_form_submission`,
  `text_reminder_number`, `scheduling_method`, `invitee_scheduled_by`
  (nullable; not projected this slice),
- **`scheduled_event` — EMBEDDED**: `{ uri, name, status, start_time,
  end_time, event_type (URI), location { type, location?, join_url? },
  invitees_counter, created_at, updated_at, event_memberships[{ user,
  user_email, user_name }], event_guests[], cancellation? }`.

Because `scheduled_event` is embedded with start/end/event-type/location/
hosts, **no follow-up API call is needed to make the trigger payload
useful, and no read action ships this slice** (Typeform actions-less
precedent). Caveat: an older (2023) Activepieces sample payload lacks the
embedded `scheduled_event`, so the normalizer treats every embedded field
as nullable and never hard-fails on its absence.

Payload shape verification: official model pages
(https://developer.calendly.com/api-docs/69c58da556b61-webhook-payload,
https://developer.calendly.com/api-docs/b92768854bc06-invitee-payload)
did not render; the shape above converges from the official tutorials
(fields quoted in prose), Botpress's current strict Zod schema
(https://github.com/botpress/botpress/blob/master/integrations/calendly/src/webhooks/schemas/index.ts)
and Activepieces' captured sample. Marked for re-verification with real
payloads at Phase 13 (live-observed section below to be appended).

## Reschedule behavior (verified on the official tutorial)

When an invitee reschedules, **two webhooks fire sequentially**:
`invitee.canceled` for the old booking with `"rescheduled": true`, then
`invitee.created` for the new booking (`status: "active"`, `old_invitee`
set). The old/new invitee URIs live on the invitee model because
rescheduling is per-invitee.

**V2 decision: a reschedule fires BOTH triggers** — `event_canceled` (with
`rescheduled: true` in the payload) and `event_scheduled` (with
`rescheduled`/`oldInviteeId` populated). One provider event = one V2
trigger firing; users who want to ignore reschedule-cancels can branch on
the `rescheduled` payload field. This is the honest mapping of what
Calendly emits; collapsing the pair into a synthetic "rescheduled" trigger
is out of scope this slice.

Source: https://developer.calendly.com/see-how-webhook-payloads-change-when-invitees-reschedule-events (fetched 2026-07-04)

## Webhook signature verification

- Header: `Calendly-Webhook-Signature`, format `t=<unix-seconds>,v1=<hex>`.
- `v1` = HMAC-SHA256, **hex**-encoded, computed over the concatenation
  `<timestamp>.<raw request body>` (the `t` value, a literal dot, the raw
  bytes), keyed with the subscription's `signing_key` (the one V2 minted
  at creation).
- Official docs describe a replay "tolerance zone" timestamp check; the
  exact documented window did not render (commonly described as ~3
  minutes; UNVERIFIED). **Whether Calendly re-signs retried deliveries
  with a fresh timestamp is UNVERIFIED** — if retries carry the original
  signature, a tight tolerance would 401 legitimate retries and
  eventually get the subscription disabled. V2 therefore enforces a
  deliberately GENEROUS tolerance (24h — the full documented retry
  horizon) as an outer bound against ancient replays, and relies on the
  `webhook_event_dedup` store as the effective replay guard (same posture
  as Asana/Typeform, whose signatures carry no timestamp at all).
  Tighten after Phase 13 observes real retry behavior.
- Verification is per-subscription (per trigger row) — no app-level
  signing env var, no missing-env failure mode.

Sources: official page https://developer.calendly.com/api-docs/4c305798a61d3-webhook-signatures
(renders only its title; its Python sample —
`hmac.new(key, payload, sha256).hexdigest()` — surfaced in search
snippets), cross-verified against n8n's parser (`t=`/`v1=` comma split,
hex HMAC over `${timestamp}.${rawBody}`):
https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Calendly/CalendlyTriggerHelpers.ts

## Delivery / retry semantics

- Success = 2xx within 10 seconds.
- On non-2xx/timeout: retries with exponential backoff for up to 24
  hours; still failing → the subscription is **disabled** (state
  `disabled`, `retry_started_at` on the resource). Recovery = delete +
  recreate. (A "up to 25 retries" figure circulates but is UNVERIFIED.)
- No exactly-once guarantee — dedup on the stable invitee identity.
- No heartbeat mechanism (contrast Asana).

Source: https://developer.calendly.com/api-docs/ZG9jOjM2MzE2MDM5-webhook-errors

## Event Types API (option source)

- `GET https://api.calendly.com/event_types?user=<user_uri>` (also accepts
  `organization=`; V2 uses `user=` — personal scope). Optional
  `active=true`, `count` (max 100), `page_token`.
- Response: `{ collection: [{ uri, name, active, slug, scheduling_url,
  duration, … }], pagination: { count, next_page, next_page_token } }`.
  Field list PARTIALLY VERIFIED (reference page did not render; `uri`,
  `name`, `active` converge across integrations). No server-side name
  search is documented — the picker filters locally.
- Pagination model (API-wide): cursor-based, default 20, max 100,
  `pagination.next_page_token`.

Sources:
- https://developer.calendly.com/api-docs/25a4ece03c1bc-list-user-s-event-types
- https://developer.calendly.com/api-docs/ZG9jOjE1MDE3NzI-api-conventions

## Rate limits

The official rate-limits page
(https://developer.calendly.com/api-docs/edca8074633f8-api-rate-limits)
did not render; third-party sources claim 60 req/min (most plans) /
120 req/min (Enterprise) with 429 + `Retry-After` — **UNVERIFIED**. The
shared `_request` helper maps 429 defensively and parses `Retry-After`
when present (Typeform posture).

## App registration / developer portal

- A **Calendly developer account** (separate from the Calendly user
  account; GitHub/Google sign-in) at https://developer.calendly.com.
- Console: https://developer.calendly.com/console/apps → "Create New App".
  Settings: app name, **environment (Sandbox / Production — separate apps
  per environment)**, client kind (web/native), redirect URI(s).
- **Client secret and an app-level "webhook signing key" are displayed
  ONLY at creation** — copy immediately. (V2 uses per-subscription
  `signing_key`s, not the app-level key, but the console shows one.)
- No dedicated sandbox Calendly tenant exists; official community
  guidance is to test with **trial accounts** (trials include paid
  features, which matters because webhooks are plan-gated). Whether the
  Sandbox app environment waives the webhook plan gate: UNVERIFIED —
  assume it does not.

Sources:
- https://developer.calendly.com/creating-an-oauth-app
- https://developer.calendly.com/create-a-developer-account
- https://community.calendly.com/api-webhook-help-61/any-support-for-a-test-or-development-environment-815

## Personal access tokens

Supported (created in the Calendly UI; same granular scopes). Not used by
the product flow; useful for owner-side live certification probes.

## API v1 discontinued

Calendly API v1 (and v1 webhooks) was discontinued starting May 2025 —
everything here is v2 (`api.calendly.com` / `auth.calendly.com`) only.

## Known limitations recap

1. **Paid-plan gate on webhooks** — free-plan Calendly users can connect
   but trigger activation fails with a humanized error. Documented in the
   owner setup report; live certification needs a paid/trial account.
2. Replay-tolerance window is generous (24h) pending Phase 13 observation
   of retry re-signing behavior; dedup is the effective replay guard.
3. Exact 409 duplicate-subscription semantics, rate-limit numbers,
   `invitee_no_show.*` availability, and the full `/users/me` +
   event-type field lists are UNVERIFIED — none are load-bearing beyond
   what unit tests pin, and all are re-checked at Phase 13.
4. Organization-scoped subscriptions (all-member events) are deliberately
   out of scope — personal credential class, user scope only.
