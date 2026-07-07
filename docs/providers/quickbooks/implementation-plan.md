# QuickBooks Online — Implementation Plan (QUICKBOOKS-1)

Date: 2026-07-07. Companion docs: [research.md](./research.md) ·
[v2-pattern-audit.md](./v2-pattern-audit.md).

## Identity

- **Provider ID:** `quickbooks`
- **Display name:** QuickBooks Online
- **Credential class:** `account` (company accounting file — Stripe/Shopify posture)
- **Auth flow:** OAuth 2.0 authorization code, confidential client, Basic-auth
  token exchange, NO PKCE, rotating refresh tokens (persist every returned one)
- **accountIdField / providerAccountId:** `realmId` (delivered as a callback
  query param — requires the generic callback-params dispatcher extension)
- **Scope:** `com.intuit.quickbooks.accounting` (single scope; true minimum)
- **API base:** `https://quickbooks.api.intuit.com` (prod) /
  `https://sandbox-quickbooks.api.intuit.com` (sandbox) — env-selected via
  `QUICKBOOKS_API_BASE` override; `minorversion=75` on every call

## Slice scope

### Actions (7) — category `commerce`, all `requiresIntegration: true`

| Key | Behavior | Risk |
|---|---|---|
| `quickbooks:create_customer` | POST /customer. Fields: displayName (required), companyName, givenName, familyName, email (recipient-sensitive), phone, billing address (line1/city/state/postalCode/country), notes (PrivateNote... QBO field `Notes`). Bounded customer projection out. Duplicate DisplayName surfaces the provider's validation error. | medium (external write) |
| `quickbooks:find_customer` | Query by exactly ONE of email / display name / company name (`searchBy` select + `value`; no OR in QBO query language). ≤10 bounded matches; `found:false` when none. | low (read) |
| `quickbooks:get_customer` | GET /customer/{id}. `found:false` on 404. Bounded projection. | low |
| `quickbooks:create_invoice` | POST /invoice — DRAFT only, never sends. customerId (combobox `quickbooks:customers`), lineItems (object-list rows: itemId required (paste id; per-row dynamic option sources are not supported by object-list sub-fields — documented limitation), amount required, quantity optional, description optional, taxCodeId optional), plus optional txnDate, dueDate, termId (`quickbooks:terms`), customerEmail (BillEmail; recipient-sensitive), customerMemo, privateNote, globalTaxCalculation (select, non-US only), defaultTaxCodeId (`quickbooks:tax_codes`, applied only to lines without their own). NO hidden defaults; NO auto item creation; NO tax guessing — omitted tax fields defer to QBO's own behavior. | medium |
| `quickbooks:send_invoice` | POST /invoice/{id}/send[?sendTo] — separate, explicitly labeled customer-facing email action. invoiceId (combobox `quickbooks:invoices`), sendTo optional (recipient-sensitive). riskLevel medium + riskDescription. | medium |
| `quickbooks:get_invoice` | GET /invoice/{id}. `found:false` on 404. Bounded projection incl. balance/paid state + line projections. | low |
| `quickbooks:list_invoices` | Query with optional customerId + txnDate range, pageSize 1..100 (default 25), startPosition (1-based offset; QBO has no cursors). Returns `{ invoices[], count, hasMore, nextStartPosition }`. NO open/paid server-side filter (Balance filterability unverified — research §Unverified 7); callers branch on the projected `balance`. NO generic query input. | low |

Output projections (bounded, never raw spreads):
- **Customer:** id, displayName, companyName, givenName, familyName, email,
  phone, billingAddress{line1,line2,city,state,postalCode,country}, notes,
  active, balance, currency, createdAt, updatedAt. PII + balance marked
  sensitive in metas.
- **Invoice:** id, docNumber, customerId, customerName, txnDate, dueDate,
  totalAmount, balance, paid (balance===0 && total>0), emailStatus, currency,
  customerMemo, privateNote, lines[{lineId, description, amount, quantity,
  unitPrice, itemId, itemName}], createdAt, updatedAt. Names/memos/amounts
  sensitive.
- **Payment:** id, customerId, customerName, totalAmount, unappliedAmount,
  currency, txnDate, referenceNumber, linkedInvoiceIds[], createdAt,
  updatedAt. Names/amounts sensitive.

### Triggers (4) — webhook activation, `requiresIntegration: true`, zero config fields

| Key | Source event(s) | Dedup key |
|---|---|---|
| `quickbooks:customer_created` | Customer+Create → fetch customer | `customer_created:{realmId}:{customerId}` |
| `quickbooks:invoice_created` | Invoice+Create → fetch invoice | `invoice_created:{realmId}:{invoiceId}` |
| `quickbooks:payment_received` | Payment+Create → fetch payment | `payment_received:{realmId}:{paymentId}` |
| `quickbooks:invoice_paid` | Payment+Create/Update → fetch payment → linked invoices → fire per invoice with Balance===0 && TotalAmt>0 | `invoice_paid:{realmId}:{invoiceId}` |

Lifecycle: activation validates the integration and returns
`{ appLevelWebhook: true, realmId }` (interest row only — NO provider webhook
creation); deactivation is a no-op (interest removed with the row). No
renewal. Per-trigger P-S2 filter fail-closed on `realmId`.

### Option sources (5)

`quickbooks:customers` (active, ORDERBY DisplayName, ≤100 + local q filter) ·
`quickbooks:items` (active Service/Inventory/NonInventory) ·
`quickbooks:terms` (active) · `quickbooks:tax_codes` (active) ·
`quickbooks:invoices` (newest 50 by MetaData.CreateTime; label
`#DocNumber · CustomerName` — no amounts/emails in labels).

Internal helper reads (NOT user-facing): CompanyInfo (connect-time display
name). Preferences: not needed this slice.

### Webhook model

`POST /api/webhooks/quickbooks` (app-level, portal-configured, per
environment). Route → `receive` (verify `intuit-signature` base64
HMAC-SHA256(raw body, `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`); parse
`eventNotifications[]`) → `enrich` (resolve one active integration per
realmId via new `getAnyActiveByProviderAccountServiceRole`; typed-wrapper
fetches under `refreshAndRetry`; invoice_paid derivation) → `normalize`
(pure; TriggerEvent with `providerAccountId = realmId`) →
`dispatchTriggerEvent` (dedup + state gates + realm filter). Missing verifier
env → 503; bad signature → 401; enrich/dispatch failure → 5xx (Intuit
retries); no-interest / unknown-realm events → 200 quiet ack with count-only
logs.

## Explicit exclusions (QUICKBOOKS-1)

record/create payment · sales receipts · estimates · update/void/delete
invoice · delete customer · bills/vendors/expenses/purchases · reports (P&L /
balance sheet / cash flow) · journal entries · refunds/credit memos · item
creation · tax setup · account create/update · class/location/department
dimensions · generic query action · generic API-call action · CDC (not even
as internal backup this slice — documented future backstop) · polling
triggers.

## Files to create/update

New (all under `integrations/quickbooks/`, `integrations/_shared/quickbooks/`,
`app/api/webhooks/quickbooks/`, `services/discovery/providers/quickbooks.ts`,
`tests/**/quickbooks/**`, `docs/providers/quickbooks/`,
`public/integrations/quickbooks.svg`).

Shared-file updates: `contracts/integration.ts` (callbackParams param) ·
`services/oauth/dispatcher.ts` (OAUTH_BY_PROVIDER + callbackParams) ·
`app/api/integrations/oauth/[provider]/callback/route.ts` (param collection) ·
`integrations/_registry.ts` · `core/integrations/credentialSharing.ts` ·
`services/execution/handlers/_handlerInventory.ts` ·
`services/discovery/_metaInventory.ts` · `services/options/_registry.ts` ·
`lib/apps/providerCategories.ts` (+ `Accounting` category) ·
`repositories/integrations.ts` (getAnyActiveByProviderAccountServiceRole) ·
`tests/structure/discovery-meta-coverage.test.ts` (COVERED_PROVIDERS) ·
`tests/smoke-actions/fixtures.ts` ·
`tests/trigger-smoke/triggerCertificationSeed.ts`.

## Env vars

| Var | Purpose |
|---|---|
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | OAuth app keys (Development keys for sandbox, Production keys for prod) |
| `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | Portal verifier token (per environment) |
| `QUICKBOOKS_API_BASE` | Optional override; default `https://quickbooks.api.intuit.com`; set to the sandbox base when using Development keys |
| `QUICKBOOKS_AUTHORIZE_BASE` / `QUICKBOOKS_TOKEN_BASE` | e2e-mock overrides only; defaults `https://appcenter.intuit.com` / `https://oauth.platform.intuit.com` |

No DB migrations (trigger_resources / webhook_event_dedup / integrations
already carry everything needed).

## Test plan

Unit: manifest registration + credential class · oauth (auth URL, callback
realmId required/persisted, refresh rotation, invalid_grant) · dispatcher
callbackParams passthrough · api `_request` error mapping + query escaping ·
7 action suites (success / schema rejection / found:false / bounded output /
no token leak) · 5 option resolvers · webhooks receive (signature
valid/forged/missing; env missing; batch parse) · normalize (purity, shapes,
dedup keys) · enrich (mapping table, invoice_paid derivation incl.
partial-payment no-fire, unknown-realm drop) · per-trigger filters
(fail-closed) · route (401/503/5xx/200 taxonomy) · discovery
(quickbooks-discovery) · apps connect-flow. Structure suites must stay green
(COVERED_PROVIDERS, field-sensitivity, normalize purity, trigger-meta
activation invariant).

Smoke: 7 action fixtures (mocked provider boundary) + trigger certification
seed entries.

Commands: `npm run typecheck` · `npm run lint:structure` · focused
`npx jest <quickbooks suites>` · `npm run smoke:actions:run` (quickbooks
scope) · full `npm test` if time permits.

## Owner setup requirements (summarized — full detail in owner-setup-report.md)

Intuit app (Development + Production keys), redirect URIs, webhook endpoint +
entity checklist (Customer/Invoice/Payment) + verifier token per environment,
App Assessment Questionnaire for production keys, Vercel env vars above.

## Known blockers

None for code-complete. Live certification requires owner setup (sandbox
company + Development keys first; production keys gated on Intuit's
assessment). Status target: **code-complete owner setup required**.
