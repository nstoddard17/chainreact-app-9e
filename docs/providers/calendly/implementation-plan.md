# Calendly implementation plan — Slice 5.CALENDLY-1

2026-07-04. Third net-new V2 provider. See research.md (provider facts)
and v2-pattern-audit.md (pattern selection) — this file is the build
manifest for the slice.

## Identity

- **Provider ID:** `calendly` (stable; folder `integrations/calendly/`)
- **Display name:** Calendly
- **Credential class:** `personal` — the OAuth token acts AS the
  connecting human over their own meetings/event types (Trello / Monday /
  Asana / Typeform posture, and the launch-safe default). Webhook
  subscriptions are created with `scope: "user"` (the token owner's own
  bookings only), matching the class.
- **Auth flow:** OAuth 2.0 authorization code, `code_callback`, PKCE S256
  + Basic-auth token exchange, refreshable with ROTATING single-use
  refresh tokens (persist-rotated-token, Typeform pattern).
- **apiVersion:** `v2` (api.calendly.com; v1 discontinued May 2025).
- **tokenScope:** `user`; **accountIdField:** `email` (fallback user UUID).

## Scopes (minimum set)

`users:read`, `event_types:read`, `scheduled_events:read`,
`webhooks:write`. Rationale + rejected scopes in research.md.

## Actions

**ZERO actions this slice.** The webhook payload embeds the
`scheduled_event` (start/end/event-type/location/hosts), so no read
action is required for a useful trigger payload and none is invented
(Typeform precedent). `capabilities.actions: false`; `calendly` stays out
of `COVERED_PROVIDERS` until the first action slice.

## Triggers (2, both webhook)

| Trigger | Provider event | Display name |
|---|---|---|
| `calendly:event_scheduled` | `invitee.created` | Meeting Scheduled |
| `calendly:event_canceled` | `invitee.canceled` | Meeting Canceled |

Builder fields (both): `eventTypeId` — OPTIONAL combobox backed by
`calendly:event_types` ("All event types" when empty).

Reschedules: a reschedule fires BOTH triggers (canceled half carries
`rescheduled: true`); documented in the trigger descriptions + payload
shape.

## Option sources

- `calendly:event_types` — user-scoped event-type list; value = event
  type UUID, label = name; one page of 100, `hasMore` from
  `next_page_token`; local q-filter.

## Webhook model

Per-(workflow, node) subscription, `scope: "user"`, one provider event
per subscription, caller-minted `signing_key` (32 bytes, encrypted at
rest), strict-direct-lookup URL `/api/webhooks/calendly?workflowId=&nodeId=`.
Signature: `Calendly-Webhook-Signature: t=,v1=` hex HMAC-SHA256 over
`<t>.<raw body>`; 24h tolerance (research.md rationale); dedup key
`<type>:{subscriberUserId}:{inviteeUuid}`. No renewal (no expiry). P-S2
filter on `calendlyUserId` (required, activation-written) +
`eventTypeId` (optional, user-chosen).

## Files to create/touch

Provider code:
- `integrations/_shared/calendly/api/_request.ts` — HTTP helper, error map
- `integrations/_shared/calendly/api/users.ts` — GET /users/me
- `integrations/_shared/calendly/api/eventTypes.ts` — GET /event_types
- `integrations/_shared/calendly/api/webhookSubscriptions.ts` — POST/DELETE
- `integrations/_shared/calendly/errors.ts`
- `integrations/_shared/calendly/webhooks/signature.ts`
- `integrations/calendly/manifest.ts`
- `integrations/calendly/oauth.ts`
- `integrations/calendly/options/_shared.ts`, `options/eventTypes.ts`
- `integrations/calendly/triggers/_shared/{eventMap,activate,deactivate,notificationUrl,receive,project}.ts`
- `integrations/calendly/triggers/eventScheduled/{index,schema,filter,normalize,eventScheduled.meta}.ts`
- `integrations/calendly/triggers/eventCanceled/{index,schema,filter,normalize,eventCanceled.meta}.ts`
- `app/api/webhooks/calendly/route.ts`

Registries / surfaces:
- `integrations/_registry.ts` (manifest + trigger side-effect imports)
- `services/oauth/dispatcher.ts`
- `services/options/_registry.ts`
- `services/discovery/providers/calendly.ts` + `_metaInventory.ts`
- `core/integrations/credentialSharing.ts` (`calendly: "personal"`)
- `lib/apps/providerCategories.ts` (`Productivity` + description)
- `public/integrations/calendly.svg`

Tests:
- `tests/unit/integrations/calendly/{manifest,oauth,signature}.test.ts`
- `tests/unit/integrations/calendly/triggers/{activate,deactivate,normalize,receive}.test.ts`
- `tests/unit/integrations/calendly/options/resolvers.test.ts`
- `tests/unit/app/api/webhooks/calendly.route.test.ts`
- `tests/unit/features/apps/calendly-connect-flow.test.tsx`
- `tests/unit/services/discovery/calendly-discovery.test.ts`
- `tests/unit/core/integrations/credentialSharing.test.ts` (+1 case)
- `tests/unit/lib/apps/providerCategories.test.ts` (+1 case)

Smoke:
- `tests/trigger-smoke/calendlyWebhookSmoke.ts` (+ Deps) — parameterized
  over both triggers, direct-seed contract
- `tests/integration/trigger-smoke/calendly-webhook.workflow.dev.test.ts`
- `package.json` `smoke:triggers:webhook` list

Docs:
- `docs/providers/calendly/{research,v2-pattern-audit,implementation-plan,owner-setup-report}.md`

## Smoke-test strategy

Direct-seed (Typeform/Asana boundary): certifies receive → per-row
`t=,v1=` verify → classify → normalize → dispatch → filter → dedup →
enqueue → drain → terminal, for BOTH triggers, plus dedup-hold on
redelivery. Provider-side lifecycle (POST/DELETE subscription) is
unit-tested; live proof is Phase 13 (needs a paid/trial Calendly
account — the plan gate).

## Owner setup requirements (preview; full detail in owner-setup-report.md)

1. Calendly developer account + app at
   https://developer.calendly.com/console/apps (Sandbox first, then a
   separate Production app).
2. Redirect URI(s): `<app-url>/api/integrations/oauth/calendly/callback`.
3. Request the 4 scopes for the app.
4. Vercel env: `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`.
5. A paid or trial Calendly account for live webhook certification.

## Known blockers / risks

- **Paid-plan webhook gate** — implementation unblocked (mocked-boundary
  tests); live certification needs a paid/trial account.
- Signature `t=,v1=` format and tolerance re-verified against real
  deliveries at Phase 13.
- Newly created Calendly apps get NO API access until scopes are
  requested — owner must select scopes at app creation or connects fail.
