# QuickBooks Online — V2 Pattern Audit (QUICKBOOKS-1)

Date: 2026-07-07. Providers inspected as implementation references (real files
read, not closeout docs): **calendly** (most recent net-new OAuth provider —
manifest, oauth.ts rotation persistence, trigger folders, options `_shared`),
**typeform** (actions trio + API `_request` error-mapping + `found:false`
read-action semantics), **asana** (per the calendly files' cited precedents),
**dropbox** (app-level webhook route + shared-infra activation, no
per-workflow provider webhook), **facebook** (app-level webhook + per-trigger
filters), **stripe/shopify** (account credential class; Shopify's
`providerHint` tenant pattern), plus the shared layers:
`services/oauth/dispatcher.ts`, `services/oauth/refreshAndRetry.ts`,
`services/triggers/{dispatch,activationRegistry,deactivationRegistry}.ts`,
`core/triggers/filterRegistry.ts`, `repositories/integrations.ts`,
`lib/apps/providerCategories.ts`, `services/discovery/_metaInventory.ts`,
`services/execution/handlers/_handlerInventory.ts`,
`tests/structure/discovery-meta-coverage.test.ts`,
`tests/structure/field-sensitivity-coverage.test.ts`, and rule docs
`oauth-dispatcher.md` + `webhook-receipt-routes.md`.

## Auth pattern selected

**Calendly's oauth.ts shape minus PKCE**: confidential client, Basic-auth
token exchange (`Authorization: Basic base64(client_id:client_secret)`),
rotation-aware refresh (persist every returned refresh token; missing one in a
refresh response falls back to the old value defensively), `invalid_grant` →
`RefreshAuthRequiredError`, `revoke()` stub (uniform disconnect-UX slice,
matches every other V2 provider). No `generatePkce` (Intuit documents no PKCE;
Slack-default-v2 precedent for a non-PKCE provider).

### Intentional divergence — callback query params (NEW, generic)

QuickBooks delivers `realmId` ONLY as a callback query param. The existing
contract has no path for callback-time params: `providerHint` is a
CONNECT-time tenant hint recovered from the signed state (Shopify shop
domain), not callback data. Extension (generic, no per-provider logic in
shared files, preserving the oauth-dispatcher rule's "dispatcher contains
zero provider-specific logic"):

- `contracts/integration.ts` — `ProviderOAuth.handleCallback` gains an
  optional 5th parameter `callbackParams?: Readonly<Record<string, string>> |
  null`: the provider-redirect query params minus `code`/`state`. Existing
  3/4-param implementations remain valid via structural typing (same
  backward-compat mechanism the 4th `providerHint` param used in Slice 12).
- `services/oauth/dispatcher.ts` — `HandleCallbackInput` gains optional
  `callbackParams`; forwarded verbatim to the provider module.
- `app/api/integrations/oauth/[provider]/callback/route.ts` — collects all
  query params except `code`/`state` into a record and passes it through.
  Provider-agnostic: every provider receives its own callback's extra params;
  all existing providers ignore them.

QuickBooks' `handleCallback` throws (failing the connect) when `realmId` is
absent — never persists a row without a realm. `providerAccountId = realmId`
(stable company id; also the multi-company discriminator), and
`accountMetadata` persists `{ realmId, companyName, country }`.

## Credential class

`account` — a QuickBooks connection represents a COMPANY's accounting file,
not one person's private data; the whole team jointly operates the books.
Same posture as `stripe` (business account) / `shopify` (store) / `hubspot`
(portal) in `core/integrations/credentialSharing.ts`. Verified against the
POLICY map's own rationale comments; NOT derived from `tokenScope` (the file
explicitly warns tokenScope is a keying concern, not a sharing policy).
Consequences inherited automatically: account-shared option sources,
owner/admin completion-role check at OAuth callback (V2-READY-48
`assertCompletionRole` applies to account-shared providers), no
creator-pinning.

## Action / schema / meta patterns reused

Typeform TYPEFORM-2 trio per action (`<name>.ts` + `.schema.ts` `.strict()` +
`.meta.ts`), registered in
`services/execution/handlers/_handlerInventory.ts` and
`services/discovery/providers/quickbooks.ts` →
`_metaInventory.ts`. Conventions adopted:

- Bounded projections at the API-wrapper boundary (`_shared/quickbooks/api/`),
  never raw spreads; provider URLs/tokens never in outputs.
- `found: false` friendly semantics for `find_customer` (Stripe find_*
  precedent) AND for `get_customer` / `get_invoice` (typeform `get_response`
  precedent) — bad ids branch instead of failing the run.
- `refreshAndRetry` wraps every provider call (actions + option sources +
  webhook enrichment).
- Error mapping in a shared `_request.ts` (typeform shape): 401 →
  `Unauthorized401Error`, 403 → `InsufficientScopeError`, 404 →
  `NotFoundError`, 429 → `RateLimitedError`, else a sanitized message from
  the QBO `Fault.Error[0]` envelope (`Message` + `code` only — never the raw
  body).
- Field sensitivity: `sendTo` / `customerEmail` / customer `email` declared
  `sensitivity: "recipient"` (they are where the invoice/email goes), so the
  field-sensitivity structure guard passes with metadata rather than
  exemptions. Output PII (names, emails, phones, addresses, memos, line
  descriptions, amounts/balances) marked `sensitive: true` in metas
  (Calendly invitee-PII precedent, extended to money fields per the
  accounting-sensitivity requirement).
- `quickbooks` joins `COVERED_PROVIDERS` in
  `tests/structure/discovery-meta-coverage.test.ts` in the SAME slice because
  actions ship in the first slice (contrast Typeform/Calendly's staged
  actions-later posture).

## Trigger / webhook pattern reused + NEW app-level fan-out variant

### What is reused verbatim

- Trigger folder anatomy per trigger (`meta` / `activate` / `deactivate` /
  `filter` / `index` with `registerActivation` / `registerDeactivation` /
  `registerTriggerFilter` at module load; side-effect import from
  `integrations/_registry.ts` AND from the webhook route for cold serverless
  workers — Calendly/Typeform pattern).
- Provider-agnostic fan-out through `services/triggers/dispatch.ts`:
  `trigger_resources` rows ARE the internal "trigger-interest" rows the
  app-level model needs; dedup via `webhook_event_dedup` (fail-CLOSED outage
  policy, LAUNCH-DEDUP-FAILSAFE); paused/disabled/frozen-account drops are the
  dispatcher's existing gates.
- P-S2 per-trigger filters keyed `(provider, eventType)` scope fan-out to the
  right realm: `parseConfig` REQUIRES `realmId` (fail-closed — a row missing
  it never matches), `evaluate` matches `event.providerAccountId === config.realmId`.
- Thin route (`app/api/webhooks/quickbooks/route.ts`) → `receive` (verify +
  parse) → normalize → dispatch, with the Dropbox route's error taxonomy:
  missing secret → 503 (fail-closed), bad signature → 401, dispatch failure →
  5xx so Intuit retries, quiet 200 acks for no-interest events.

### The app-level variant (Dropbox/Facebook family, QuickBooks flavor)

QuickBooks webhooks are configured ONCE per app in the Intuit portal — there
is no per-workflow provider webhook to create or delete. Consequences,
mirroring Dropbox (`app-level, shared-infra` route header) and Facebook:

- **Activation creates NO provider resource.** The ActivationFn validates the
  integration and returns a config patch
  `{ appLevelWebhook: true, realmId: integration.providerAccountId }` — the
  `trigger_resources` row itself is the interest registration. No
  `type: "subscription-watch"` marker; the renewal cron never touches these
  rows (Intuit webhooks don't expire).
- **Deactivation deletes NO provider resource** — a no-op DeactivationFn; the
  lifecycle layer removing the `trigger_resources` row IS the interest
  removal. (Dropbox precedent: no remote create → no remote delete.)
- **The owner report instructs Marcus to configure the endpoint URL + entity
  checklist + verifier token in the Intuit portal** (Development and
  Production separately).

### Divergence from Dropbox: entity fan-out with post-fetch enrichment

Dropbox reconciles CURSORS per account; QuickBooks payloads name concrete
entities but carry no entity data, so this provider adds an
**enrich-then-normalize** step (new for V2, contained entirely inside
`integrations/quickbooks/webhooks/`):

- `webhooks/receive.ts` — verify `intuit-signature` (base64 HMAC-SHA256 over
  the raw body keyed with `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`;
  `crypto.timingSafeEqual`; missing env → `MissingSecretError` → 503) and
  parse `eventNotifications[]` into compact `(realmId, entity, operation,
  id)` tuples. No handshake path (Intuit has none).
- `webhooks/enrich.ts` — I/O layer: for each realm, resolve ONE active
  integration via a new service-role repo read
  (`getAnyActiveByProviderAccountServiceRole("quickbooks", realmId)` — the
  `listActiveByProviderServiceRole` read shape narrowed by
  `provider_account_id`, earliest-connected-wins determinism), then fetch the
  entity through the typed wrappers under `refreshAndRetry`. Realms with no
  active integration are dropped with a count-only log (no cross-tenant
  leak). invoice_paid derivation lives here: Payment Create/Update → payment
  → `LinkedTxn` invoices → each invoice with `Balance === 0` (and
  `TotalAmt > 0`) yields a candidate.
- `webhooks/normalize.ts` — PURE (webhook-normalize-purity guard): compact
  tuple + enriched bounded projection → canonical `TriggerEvent`.
  `providerAccountId = realmId`. Deterministic clock-free dedup keys on
  durable semantic identity (Asana double-fire lesson):
  - `customer_created:{realmId}:{customerId}`
  - `invoice_created:{realmId}:{invoiceId}`
  - `payment_received:{realmId}:{paymentId}`
  - `invoice_paid:{realmId}:{invoiceId}` — invoice identity, NOT payment
    identity, so Payment Create + Update (or two partial payments completing
    the invoice) collapse to one fire.

Event-type mapping (operations outside this table are ignored this slice):
`Customer+Create → customer_created`; `Invoice+Create → invoice_created`;
`Payment+Create → payment_received`; `Payment+Create|Update → invoice_paid`
candidates (post-verification). Invoice Update is deliberately NOT a paid
signal (unverified provider semantics; double-derivation risk).

### Cross-company isolation

Routing/dedup include `realmId` at every step: enrichment credentials are
resolved per event realm; the filter refuses rows whose config realm differs;
dedup keys embed the realm. Two ChainReact accounts connected to the SAME
realm both legitimately receive that company's events (they are both
authorized for those books — account-credential semantics). A row whose
account no longer holds an active integration for that realm still passes the
realm filter but its runs fail at the action layer with the standard
reconnect classification; V2's disconnect lifecycle deactivates affected
workflows — same posture as every other provider after credential loss.

## Option-source pattern reused

Calendly resolvers verbatim: `OptionsResolver` with `source:
"quickbooks:<x>"`, `requiresIntegration: true`, a provider `_shared.ts` with
`requireQuickbooksIntegration` + `mapQuickbooksOptionsError` (sanitized
INTEGRATION_DISCONNECTED / PROVIDER_REAUTH_REQUIRED / PROVIDER_ERROR) +
`filterAndSortByLabel` local-q filtering. Account-shared access is enforced
centrally by `resolveOptionsSource` via the `account` classification — no
creator pinning, no resolver-side auth logic. Labels are names-only
(customer display names, item names, term names, `#DocNumber · customer` for
invoices — no amounts, no emails in labels).

## Apps / Builder / AI visibility patterns reused

- `lib/apps/providerCategories.ts`: new `Accounting` category added to the
  `AppsCategory` union + `APPS_CATEGORY_ORDER` (the file documents this exact
  extension path), `quickbooks: "Accounting"` + description entry. The
  existing `tests/unit/lib/apps/providerCategories.test.ts` regression sweep
  then covers quickbooks automatically.
- Connect-flow test cloned from
  `tests/unit/features/apps/calendly-connect-flow.test.tsx` (generic OAuth
  connect path, visible error surfacing).
- Icon at `public/integrations/quickbooks.svg`.
- Discovery: `services/discovery/providers/quickbooks.ts` exporting
  `QUICKBOOKS_ACTION_METAS` + `QUICKBOOKS_TRIGGER_METAS`, spread into
  `_metaInventory.ts` — the AI/react-agent surface reads the same registry
  through the existing redacted capability contract; nothing provider-specific
  is exposed beyond metas (no tokens/labels/ids — enforced by existing
  central code + tests).

## Smoke / certification pattern reused

- Action smoke fixtures under `tests/fixtures/action-smoke/quickbooks/` +
  registration in `tests/smoke-actions/fixtures.ts` (typeform fixture shape).
- Trigger smoke: certification seed registration in
  `tests/trigger-smoke/triggerCertificationSeed.ts` following the Calendly
  webhook-smoke entries, plus unit/integration coverage of the receive route
  → dispatch path (mocked provider boundary; live Phase 13 after owner
  setup, sandbox-first per research).

## Divergences summary (all deliberate)

1. **Callback-params passthrough** — generic optional extension of
   `ProviderOAuth.handleCallback` / dispatcher / callback route (realmId is
   callback-only). New reusable pattern for future providers with
   callback-delivered tenancy (e.g. Xero-style tenant discovery differs, but
   the passthrough generalizes).
2. **App-level trigger lifecycle with no provider resource** — activation =
   interest row only; deactivation = no-op. Extends the Dropbox/Facebook
   family to entity-event providers.
3. **Enrich-then-normalize webhook stage** (`webhooks/enrich.ts`) — required
   because Intuit payloads are compact; normalize stays pure by taking the
   enriched projection as input.
4. **Derived trigger (`invoice_paid`)** — first V2 trigger whose event is
   COMPUTED from provider state (payment → linked invoice balance check)
   rather than mapped 1:1 from a webhook event. Guarded by semantic dedup
   keys + balance verification before dispatch; documented refire-after-TTL
   limitation in research.md.
5. **New Apps category (`Accounting`)** — first provider in it.

## Registry-presence checklist (what "shipped" means here)

`integrations/_registry.ts` (manifest + trigger side-effect imports) ·
`services/oauth/dispatcher.ts` OAUTH_BY_PROVIDER ·
`core/integrations/credentialSharing.ts` ·
`services/execution/handlers/_handlerInventory.ts` (7 handlers) ·
`services/discovery/_metaInventory.ts` (7 action + 4 trigger metas) ·
`services/options/_registry.ts` (5 resolvers) ·
`app/api/webhooks/quickbooks/route.ts` · `lib/apps/providerCategories.ts` ·
`COVERED_PROVIDERS`. Orphan files ≠ shipped.
