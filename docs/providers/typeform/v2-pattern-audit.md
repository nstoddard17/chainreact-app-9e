# Typeform V2 pattern audit

Slice 5.TYPEFORM-1, audited 2026-07-04. Typeform is the second net-new V2
provider (no V1 code existed; Asana was the first). Registry presence, not
file presence, defines what ships.

## V2 providers inspected as implementation references

| Provider | What was reused from it |
|---|---|
| **asana** (Slice 5.ASANA-1, the net-new template) | Manifest shape + honest capabilities; folder anatomy; `_shared/<provider>/api/_request.ts` HTTP helper with 401/403/404/429 error mapping; per-resource webhook trigger lifecycle (activate/deactivate registered in `triggers/<event>/index.ts`); strict-direct-lookup receive (`?workflowId=&nodeId=`); per-webhook encrypted secret on the trigger row; normalize purity + deterministic timestamp-free dedup key (the task+added double-fire lesson); P-S2 dispatcher filter; options `_shared` error mapping; discovery sub-registry; direct-seed trigger-smoke harness; docs set |
| **monday / trello / github** | The per-resource webhook pattern generally (one webhook per (workflow, node, resource)); deactivate best-effort semantics |
| **hubspot / monday** | Non-PKCE confidential-client OAuth (client_id + client_secret in the form body, no `generatePkce`) |
| **airtable** | (contrast only) PKCE shape - NOT used; Typeform documents no PKCE |

## Auth pattern selected

`ProviderOAuth` registered in `services/oauth/dispatcher.ts`, following the
HubSpot/Monday confidential-client shape: **no `generatePkce`** (Typeform
documents none), body-auth token exchange, identity via a follow-up
`GET /me` call (Typeform's token response embeds no identity, unlike
Asana's `data` object).

One deliberate divergence from Asana's refresh policy: Typeform DOCUMENTS
refresh-token rotation ("the refresh procedure will invalidate the old
refresh token"), so `refreshToken()` persists the rotated token, with a
defensive fall-back to the old token only if a response ever omits it.
Missing `refresh_token` at connect time fails the connect (same fail-fast
rationale as Asana: a week-expiring access token without refresh would
strand the row; `offline` scope is always requested).

## Trigger lifecycle pattern

Per-form webhook, one per (workflow, node), same lifecycle skeleton as
Asana with one structural simplification: **no creation handshake**.
Typeform's `PUT /forms/{form_id}/webhooks/{tag}` accepts OUR minted secret
in the request body, so:

- No pre-upsert of the trigger row before the provider call (Asana needed
  it only so the mid-creation handshake had a row to write to).
- `activate()` mints a 32-byte secret, PUTs the webhook, and returns the
  config patch (`webhookEnabled`, `formId`, `webhookTag`, `webhookId`,
  `hookSecretEncrypted`, `notificationUrl`) for the lifecycle's final
  upsert. Secret encrypted at rest via `encryptToken` (Asana precedent,
  stronger than Airtable's plaintext precedent).
- The webhook `tag` is deterministic (`chainreact-` + sha256 hash prefix of
  `workflowId:nodeId`), so re-activation PUTs update the same provider-side
  webhook in place instead of accumulating orphans, and deactivation can
  reconstruct the tag from config.
- `deactivate()` best-effort DELETEs by (formId, tag); swallows
  `NotFoundError` + `IntegrationActionRequiredError`, propagates the rest
  (exact Asana semantics).
- No `renew` and no subscription-watch marker: Typeform webhooks do not
  expire on a schedule.

## Receive / signature pattern

Single route `app/api/webhooks/typeform/route.ts`, raw body captured before
parse, mirroring the Asana route minus the handshake branch:

- Row resolution via `?workflowId=&nodeId=` strict-direct-lookup.
- Unknown/foreign row -> 200 quiet ack; secretless row -> 200 quiet ack
  (`unverifiable`); signature failure -> 401 `InvalidSignatureError`;
  non-`form_response` event types -> 200 quiet ack (`ignored_event`);
  dispatch failure -> 500 so Typeform retries.
- **Never 404/410** on transient states: Typeform disables the webhook
  immediately on those statuses (documented retry policy).
- Signature helper diverges from Asana's on wire format only:
  `Typeform-Signature: sha256=<base64>` (base64 HMAC-SHA256, not bare hex),
  constant-time compare via `timingSafeEqual` with length guard.

## Normalize / dedup pattern

Pure `normalize.ts` (enforced by `tests/structure/webhook-normalize-purity`),
deterministic dedup key with NO clock/RNG derivation:

`new_response_in_form:{formId}:{responseToken}` - `form_response.token` is
Typeform's stable unique response id, so redeliveries (retry-until-2XX) and
cross-workflow fan-out collapse correctly. Fallback discriminators when
`token` is absent: the provider `event_id`, then `submitted_at` (payload
data, not a clock read). `occurredAt` falls back to `new Date()` only as
the informational timestamp (allowed by the purity test).

Payload is a bounded projection, not a raw spread: form/response ids,
timestamps, form title, a flattened `answers[]` array (field id/ref/title/
type + stringified value), `hidden{}`, and `score`. `answers` and `hidden`
are marked `sensitive: true` in `payloadShape` (free-form respondent
content, mirrors the Outlook-Calendar `body` precedent). `response_url` is
deliberately excluded (provider console URL; provider URLs never become
workflow variables).

## Dispatcher filter (P-S2)

`filter.ts` narrows the global (typeform, new_response_in_form) fan-out to
rows whose configured `formId` matches the event payload's `formId` - the
exact Asana projectId filter shape.

## Option source pattern

`typeform:forms` resolver mirrors `asana:projects` (`_shared.ts` +
`refreshAndRetry` + sanitized `OptionsResolverError` mapping), with no
`requiredDeps` (forms list is top-level) and Typeform's server-side
`search` param wired to `ctx.q` in addition to the local
`filterAndSortByLabel`. Personal-credential gating is central
(`services/options/resolveOptionsSource.ts` via the classification entry),
same as every provider.

## Apps / Builder / AI visibility patterns reused

- Apps page: automatic from the manifest (`isEnabled && capabilities.oauth`
  drives connectable in `app/apps/_shared.ts`); explicit category +
  description added to `lib/apps/providerCategories.ts` (the ASANA-1 gap
  fix made these mandatory via `providerCategories.test.ts`); icon at
  `public/integrations/typeform.svg`.
- Builder: trigger meta in `services/discovery/providers/typeform.ts`,
  aggregated by `_metaInventory.ts`. Activation/deactivation registration
  in the trigger's `index.ts` satisfies
  `trigger-meta-activation-invariant` with no exemption.
- AI visibility: automatic through the existing safe discovery/capability
  projections; no provider-specific AI surface is added.

## Deliberate divergences from existing V2 patterns

1. **Zero actions in this slice** (`capabilities.actions: false`, a V2
   first). The webhook payload carries the full response content, so no
   read action is needed for safe normalization, and no action is invented
   to match a count. Consequence: `typeform` is NOT added to
   `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`
   (that gate requires at least one ActionMeta and enforces handler<->meta
   parity; with zero handlers and zero action metas there is nothing to
   enforce). This is the same staged-arc posture as Monday/Dropbox/Facebook
   triggers, mirrored: the flip happens in the slice that ships the first
   Typeform action. Trigger coverage IS enforced today by
   `trigger-meta-activation-invariant.test.ts`.
2. **No handshake branch in receive** (provider capability difference, not
   a pattern change).
3. **Rotation-first refresh persistence** (documented provider behavior;
   Asana et al. use preserve-old because rotation is undocumented there).
4. **Base64 signature wire format** (provider-defined; helper shape,
   result union, and timing-safe compare are unchanged).

## New reusable pattern introduced

"Caller-minted webhook secret" activation (no handshake, no pre-upsert):
simpler default for future providers whose webhook-create API accepts a
client-supplied signing secret (e.g. many REST products). Asana's
pre-upsert+handshake variant remains the reference for providers that
deliver the secret themselves.

## Smoke pattern reused

Direct-seed trigger-smoke harness (`tests/trigger-smoke/typeformWebhookSmoke.ts`
+ real-deps + gated dev integration test), certifying
receive -> per-row HMAC verify -> normalize -> dispatch -> P-S2 filter ->
dedup -> enqueue -> drain -> terminal run, with the provider-side lifecycle
(PUT/DELETE webhook) covered by unit tests and deferred to Phase 13 live
certification. Identical honesty boundary to the Asana smoke.
