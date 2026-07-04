# Calendly V2 pattern audit

Slice 5.CALENDLY-1, audited 2026-07-04. Calendly is the third net-new V2
provider (no V1 code existed; Asana was first, Typeform second). Registry
presence, not file presence, defines what ships.

## V2 providers inspected as implementation references

| Provider | What was reused from it |
|---|---|
| **typeform** (Slice 5.TYPEFORM-1, the freshest net-new template) | Actions-less first slice (self-contained webhook payload → zero actions, `capabilities.actions: false`, NOT in `COVERED_PROVIDERS`); caller-minted per-subscription secret encrypted on the trigger row (no creation handshake); rotation-first refresh-token persistence (Calendly documents single-use rotation exactly like Typeform); manifest shape; `_shared/<provider>/api/_request.ts` error mapping; options `_shared` sanitized error mapping; Apps catalog category/description/icon + connect-flow test; direct-seed trigger-smoke harness + gated dev test; docs set |
| **asana** (Slice 5.ASANA-1) | TWO-trigger anatomy: `triggers/_shared/` (eventMap, activate, deactivate, notificationUrl, receive) + thin per-trigger folders (schema, filter, normalize, meta, index); shared receive classifying inbound provider events against the row's eventType (defense-in-depth); the timestamp-free semantic dedup-key lesson (task+added double-fire); PKCE S256 OAuth shape (`generatePkce`) |
| **stripe** | Strict-direct-lookup notification URL (`?workflowId=&nodeId=`) for a provider whose inbound body carries no endpoint identifier — Calendly deliveries identify the subscription only by which URL they hit |
| **monday / trello / github** | Per-(workflow, node) webhook lifecycle generally; deactivate best-effort semantics |

## Auth pattern selected

`ProviderOAuth` registered in `services/oauth/dispatcher.ts`, combining:

- **PKCE S256** (`generatePkce`, Asana shape) — Calendly directs PKCE for
  ALL app types including confidential web apps.
- **HTTP Basic token-call auth** (`Authorization: Basic
  base64(client_id:client_secret)`) — Calendly's documented web-client
  shape. Divergence from Typeform/HubSpot/Monday's body-auth, driven by
  the provider's docs.
- **Rotation-first refresh persistence** (Typeform precedent, and here it
  is not optional: Calendly enforces single-use rotating refresh tokens
  for all integrations by 2026-08-31; reuse → `invalid_grant`). The
  rotated token is persisted every refresh; `invalid_grant` →
  `RefreshAuthRequiredError`.
- Identity: the token response embeds `owner` (user URI) + `organization`
  (org URI), but display identity (name/email) comes from a follow-up
  `GET /users/me` (`users:read`). Connect persists `calendlyUserUri` +
  `organizationUri` in `account.metadata` so trigger activation and the
  option source don't need a second identity round-trip (with a
  `/users/me` fallback when metadata is absent).
- Missing `refresh_token` at connect fails the connect (2-hour access
  tokens would strand the row; Asana/Typeform fail-fast rationale).

## Trigger lifecycle pattern

Per-(workflow, node) **webhook subscription**, one per trigger node, via
`POST /webhook_subscriptions` — Typeform's caller-minted-secret lifecycle
with Asana's two-trigger `_shared` layout:

- `activate()` (shared factory, parameterized by provider event):
  resolves the user/org URIs (integration `accountMetadata`, `/users/me`
  fallback), mints a 32-byte `signing_key`, POSTs the subscription with
  `scope: "user"`, `events: [<one provider event>]`, and the per-node
  strict-direct-lookup URL. Returns the config patch (`webhookEnabled`,
  `eventTypeId` passthrough, `subscriptionUri`, `hookSecretEncrypted`,
  `notificationUrl`, `calendlyUserId`, `calendlyUserUri`,
  `organizationUri`). Secret encrypted at rest via `encryptToken`.
- **No pre-upsert, no handshake** — Calendly has no creation challenge
  (Typeform posture). A POST failure aborts activation with nothing to
  clean up provider-side.
- One subscription per trigger node (not one shared subscription with
  both events): keeps activation/deactivation per-node symmetric with
  every other V2 per-node webhook provider, and each row verifies its own
  secret.
- `deactivate()` best-effort DELETEs `subscriptionUri`; swallows
  `NotFoundError` + `IntegrationActionRequiredError`, propagates the rest
  (exact Asana/Typeform semantics). Skips when no `subscriptionUri`
  (activation never completed).
- No `renew`, no subscription-watch marker: Calendly subscriptions don't
  expire on a schedule (they disable only after 24h of failed
  deliveries; recovery is deactivate/reactivate).
- Plan-gate handling: a 403 on the subscription POST surfaces a humanized
  "Calendly webhooks require a paid Calendly plan (or the app is missing
  the webhooks:write scope)" activation error instead of the generic
  insufficient-scope message.

## Receive / signature pattern

Single route `app/api/webhooks/calendly/route.ts` + shared
`triggers/_shared/receive.ts` (Asana two-trigger shape, minus the
handshake branch):

- Row resolution via `?workflowId=&nodeId=` strict-direct-lookup.
- Unknown/foreign row → 200 quiet ack; secretless row → 200 quiet ack
  (`unverifiable`); signature failure → 401 `InvalidSignatureError`;
  unsupported/mismatched provider events → 200 quiet ack
  (`ignored_event`); dispatch failure → 500 so Calendly retries
  (exponential backoff ≤24h).
- Signature helper (new wire format, same helper shape/result union as
  Asana/Typeform): `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`, HMAC-
  SHA256 hex over `<t>.<raw body>`, keyed with the row's decrypted
  per-subscription secret; constant-time compare with length guard; a
  GENEROUS 24h timestamp tolerance (see research.md — retry re-signing is
  unverified, dedup is the effective replay guard; tighten post-Phase 13).
- Inbound classification: envelope `event` maps `invitee.created` →
  `event_scheduled`, `invitee.canceled` → `event_canceled` (eventMap.ts,
  Asana shape). Events that don't match the resolved row's eventType are
  quiet-acked (each subscription carries exactly one event, so this is
  defense-in-depth).

## Normalize / dedup pattern

Pure per-trigger `normalize.ts` over a shared bounded projection helper
(enforced by `tests/structure/webhook-normalize-purity`), deterministic
timestamp-free dedup key:

`event_scheduled:{subscriberUserId}:{inviteeUuid}` (and `event_canceled:…`)

- `inviteeUuid` comes from the invitee `uri` path (stable per booking; a
  reschedule mints a NEW invitee, so the created/canceled halves never
  collide).
- **`subscriberUserId` (the row-attributed connected user's UUID) is part
  of the key** — deliberately NOT just the invitee id: collective events
  have multiple hosts, so one booking can legitimately deliver to two
  different users' subscriptions; a key without user attribution would
  dedup the second user's delivery away and silently drop their workflow
  run. Same-user multi-workflow fan-out still collapses correctly
  (N subscriptions → N deliveries → one key → one dispatch round → P-S2
  filter re-narrows). This is the Asana double-fire lesson applied with
  the resource scope = subscription owner.
- Fallbacks when the invitee URI is absent: `old_invitee`/`new_invitee`
  discriminators, then envelope `created_at` (payload data, not a clock).
- `occurredAt`: envelope `created_at` → payload `created_at` →
  `new Date()` (informational only, allowed by the purity test).

Payload is a bounded projection, never a raw spread: ids as UUIDs
(inviteeId, eventId, eventTypeId, oldInviteeId, newInviteeId,
subscriberUserId), invitee name/email/timezone/status, meeting
name/start/end, bounded location `{type, location, joinUrl}`, hosts
`[{name, email}]`, `questionsAndAnswers[]`, bounded `tracking`,
`rescheduled`, `cancelUrl`/`rescheduleUrl`, and (canceled only)
`cancellation {canceledBy, reason, cancelerType}`. Raw API URIs are
reduced to UUIDs (provider URLs never become workflow variables);
`cancel_url`/`reschedule_url` ARE projected — they are invitee-facing
action links whose entire purpose is downstream use — but marked
`sensitive: true` (capability URLs: anyone holding them can cancel/
rebook). Invitee PII (email, hosts, Q&A) marked `sensitive: true`
(Typeform answers/hidden precedent). `payment`, `no_show`,
`reconfirmation`, `text_reminder_number` are deliberately NOT projected.

## Dispatcher filter (P-S2)

Both triggers register a filter narrowing the global fan-out:

- `calendlyUserId` (activation-written, required): event
  `payload.subscriberUserId` must equal the row's connected-user UUID —
  this is the cross-account isolation (the Typeform formId / Asana
  projectId analog; Calendly's "resource" is the subscription owner).
- `eventTypeId` (user-chosen, OPTIONAL): when configured, the event's
  `eventTypeId` must match; absent filter = all event types. An event
  missing `eventTypeId` while the row filters on one → no-match (fails
  closed; old-shape payloads without the embedded `scheduled_event`).
  First V2 filter with an optional user-facing dimension — parseConfig
  still throws on rows missing the activation-written `calendlyUserId`,
  so unarmed rows fail closed.

## Option source pattern

`calendly:event_types` mirrors `typeform:forms` (`_shared.ts` +
`refreshAndRetry` + sanitized `OptionsResolverError` mapping): resolves
the user URI from integration `accountMetadata` (`/users/me` fallback),
one `GET /event_types?user=…&active=true&count=100` page, `value` =
event-type UUID, `label` = event-type name, `hasMore` from
`pagination.next_page_token`, local `filterAndSortByLabel` (Calendly
documents no server-side name search). Personal-credential gating is
central (`services/options/resolveOptionsSource.ts` via the
`calendly: "personal"` classification).

## Apps / Builder / AI visibility patterns reused

- Apps page: automatic from the manifest; `calendly: "Productivity"`
  category (where google-calendar / microsoft-outlook-calendar live — no
  new category needed) + description in `lib/apps/providerCategories.ts`;
  icon at `public/integrations/calendly.svg`; connect-flow test mirrors
  typeform-connect-flow.
- Builder: 2 trigger metas in `services/discovery/providers/calendly.ts`,
  aggregated by `_metaInventory.ts`; activation/deactivation registration
  in each trigger's `index.ts` satisfies
  `trigger-meta-activation-invariant` with no exemption.
- AI visibility: automatic through the existing safe discovery/capability
  projections; no provider-specific AI surface.

## Deliberate divergences from existing V2 patterns

1. **Basic-auth token exchange + PKCE together** — provider-directed
   (web clients use Basic; PKCE directed for all apps). First V2 provider
   combining both; helper shape otherwise unchanged.
2. **Timestamped signature with a deliberately generous (24h) tolerance**
   — the wire format is Stripe-style `t=,v1=` but whether Calendly
   re-signs retries is unverified; a tight window could 401 legitimate
   24h-backoff retries and get the subscription disabled. Dedup is the
   effective replay guard (exactly as for Asana/Typeform, which have no
   timestamp at all). Revisit post-Phase 13.
3. **Subscriber-scoped dedup key** — the dedup key includes the
   row-attributed connected-user UUID because one provider event can
   legitimately target multiple users' subscriptions (collective-event
   co-hosts). Typeform/Asana keys use the watched resource id; Calendly's
   watched "resource" IS the user.
4. **Optional user-facing filter dimension** (`eventTypeId`) on the P-S2
   filter — previous filters were all required-field. Fails closed on
   missing activation-written attribution, open (match-all) only on the
   deliberately optional event-type dimension.
5. **Zero actions** (Typeform precedent): the embedded `scheduled_event`
   makes the payload self-contained; no read action is invented.
   `calendly` stays OUT of `COVERED_PROVIDERS` until its first action
   slice.
6. **Paid-plan activation gate** — first V2 provider whose trigger
   activation is plan-gated provider-side; surfaced as a humanized
   activation error, not a connect-time block (the OAuth connect itself
   works on free plans).

## New reusable pattern introduced

"Subscriber-scoped webhook subscription" lifecycle: for providers whose
webhook registration is account/user-scoped rather than resource-scoped
(one subscription covers a whole user, filtered by event kind), the
watched-user attribution rides the trigger config, joins the dedup key,
and anchors the P-S2 filter. Reference for future user-scoped webhook
providers (e.g. Cal.com, Savvycal-style products).

## Smoke pattern reused

Direct-seed trigger-smoke harness (Typeform shape, parameterized over the
two triggers): seeds the post-activation row (no Calendly API), signs a
synthetic delivery with the per-row secret (`t=,v1=` over `<t>.<body>`),
POSTs through the REAL route, and certifies
receive → verify → classify → normalize → dispatch → P-S2 filter → dedup
→ enqueue → drain → terminal run, plus dedup-hold on redelivery. The
provider-side lifecycle (POST/DELETE subscription) is unit-tested and
deferred to Phase 13 live certification. Identical honesty boundary to
Asana/Typeform.
