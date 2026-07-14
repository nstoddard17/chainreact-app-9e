# QuickBooks Online — Provider Research (QUICKBOOKS-1)

Date researched: 2026-07-07.
Method: official Intuit sources (developer.intuit.com, help.developer.intuit.com,
blogs.intuit.com) plus Intuit's machine-readable OpenID discovery documents
(`https://developer.api.intuit.com/.well-known/openid_configuration/` and the
sandbox variant, fetched directly). Facts that could not be confirmed from an
official Intuit source are tagged UNVERIFIED and listed at the end.

## Auth type

OAuth 2.0 authorization code flow, confidential client. NO PKCE — the discovery
documents contain no `code_challenge_methods_supported` entry and Intuit's OAuth
docs do not document PKCE parameters. `response_types_supported: ["code"]` only.

| Item | Value |
|---|---|
| Authorization endpoint | `https://appcenter.intuit.com/connect/oauth2` |
| Token endpoint | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Revocation endpoint | `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` |
| Token endpoint auth | `client_secret_basic` or `client_secret_post` (V2 uses Basic) |

Authorization request params: `client_id`, `response_type=code`, `scope`
(space-separated), `redirect_uri`, `state` (required — CSRF).

**Callback carries `realmId`.** Intuit redirects to the registered redirect URI
with `code`, `state`, AND `realmId` query params. `realmId` is the QuickBooks
company id; every Accounting API call is scoped by it in the path
(`/v3/company/{realmId}/...`). It is delivered ONLY at callback time — it is not
in the token response and there is no reliable API to discover it from the token
alone — so the callback MUST persist it. One authorization = one company; a user
connecting two companies produces two realmIds (two integration rows).

**Token lifetimes / refresh semantics** (help.developer.intuit.com "Validity of
Refresh Token", "Handling OAuth token expiration"):
- Access token: 60 minutes (`expires_in: 3600`).
- Refresh token: rolling 100-day expiry (`x_refresh_token_expires_in`).
- The refresh-token VALUE changes roughly every 24–26 hours even though the old
  window is 100 days. Contract: **always persist the refresh token returned by
  every token/refresh response and use the latest one** (same rotation-persist
  shape as Calendly/Typeform). 100 days without use → re-authorize.
- Refresh: POST token endpoint, Basic auth, form body
  `grant_type=refresh_token&refresh_token=...`. `invalid_grant` → the grant is
  dead → needs-reconnect.

## Scopes

Exact names (developer.intuit.com/app/developer/qbo/docs/learn/scopes):

- `com.intuit.quickbooks.accounting` — the ENTIRE QBO Accounting API,
  read+write. Covers Customer, Invoice, Payment, Item, Term, TaxCode,
  CompanyInfo, Preferences. There are NO per-entity or read-only accounting
  scopes, so this single scope is the true minimum for this slice.

Considered and rejected:
- `com.intuit.quickbooks.payment` — QuickBooks Payments (card processing), a
  separate product; NOT needed for the accounting Payment entity.
- `openid` / `profile` / `email` — user identity via OIDC; not needed (V2
  resolves display identity from CompanyInfo, which the accounting scope
  already covers).
- `com.intuit.quickbooks.payroll` — separate payroll program; out of scope.

## Redirect URI format

`{NEXT_PUBLIC_APP_URL}/api/integrations/oauth/quickbooks/callback`

Portal rules: registered per environment; development allows
`http://localhost:<port>`; production requires HTTPS, no localhost, no raw IPs;
exact-match against the `redirect_uri` parameter.

## Environments

- Sandbox API base: `https://sandbox-quickbooks.api.intuit.com`
- Production API base: `https://quickbooks.api.intuit.com`
- OAuth endpoints are IDENTICAL for both; the client_id (Development keys vs
  Production keys — two separate key sets per app) determines the environment.
- Production keys are gated behind the App Assessment Questionnaire
  (security/compliance; mandatory since 2022) plus app-details checklist
  (EULA/privacy URLs, host domain). App Store publication is a separate,
  heavier review — NOT required for private/production use.
- Sandbox companies are created free from the portal, pre-populated with demo
  data. Webhooks work in sandbox (separate Development webhook config +
  verifier token).
- 2025: Intuit launched an App Partner Program with usage-based tiers (writes
  described as free, read tiers priced). Exact tiers UNVERIFIED — check the
  portal at go-live.

## Accounting API (entities used this slice)

All calls: `Authorization: Bearer <token>`, `Accept: application/json`; JSON
bodies `Content-Type: application/json`. **`minorversion=75` sent explicitly on
every call** — as of 2025-08-01 minor versions 1–74 are deprecated and 75 is
the served base.

- **Customer** — create `POST /v3/company/{realmId}/customer`; required:
  `DisplayName` OR at least one of Title/GivenName/MiddleName/FamilyName/Suffix.
  `DisplayName` must be unique across Customer/Vendor/Employee (duplicate →
  ValidationFault 6240). Read `GET .../customer/{id}`. Query by
  `PrimaryEmailAddr` / `DisplayName` / `CompanyName` via the query endpoint.
- **Invoice** — create `POST /v3/company/{realmId}/invoice`; minimal payload:
  `CustomerRef.value` + at least one `Line` with
  `DetailType: "SalesItemLineDetail"`, `Amount`, and
  `SalesItemLineDetail.ItemRef.value`. Optional: `DocNumber` (auto-assigned when
  omitted), `TxnDate` (defaults today), `DueDate` (derived from `SalesTermRef`
  when omitted), `SalesTermRef`, `CustomerMemo.value`, `PrivateNote`,
  `BillEmail.Address`. Read `GET .../invoice/{id}`. `Balance` = unpaid
  remainder; `Balance: 0` = fully paid. Updates need current `SyncToken`
  (stale → error 5010) — no updates ship this slice.
- **Invoice send** — `POST /v3/company/{realmId}/invoice/{id}/send` with
  optional `?sendTo=<email>`; request `Content-Type: application/octet-stream`;
  response invoice carries `EmailStatus: "EmailSent"` + `DeliveryInfo`.
  `sendTo` overrides AND updates `BillEmail`. Without `sendTo`, the invoice's
  `BillEmail` must be set.
- **Payment** — read `GET .../payment/{id}`. `Line[].LinkedTxn[]` links the
  payment to invoices: `{ TxnId: "<invoiceId>", TxnType: "Invoice" }`. The link
  is created payment-side; invoice-side `LinkedTxn` is read-only. To get
  invoice details from a payment, fetch each linked invoice by `TxnId`.
- **Item / Term / TaxCode** — via query: `select * from Item` (filter
  `Type IN ('Service','Inventory','NonInventory')` + `Active = true` for
  invoice-able items), `select * from Term where Active = true`,
  `select * from TaxCode where Active = true`.
- **CompanyInfo** — `GET /v3/company/{realmId}/companyinfo/{realmId}` (realmId
  appears twice). Used at connect time for the display name; NOT a user-facing
  action.
- **Preferences** — `GET .../preferences` (available as an internal helper if
  needed; not user-facing, not shipped this slice).

### Query endpoint

`GET /v3/company/{realmId}/query?query=<url-encoded SELECT>&minorversion=75`.
Grammar: `SELECT ... FROM <Entity> [WHERE ...] [ORDERBY ...]
[STARTPOSITION n] [MAXRESULTS n]`.

- Pagination: offset-based only — `STARTPOSITION` (1-based) + `MAXRESULTS`
  (max 1000, default 100). No cursors.
- Limitations: **no `OR`** (AND only), no JOIN/GROUP BY; operators
  `=, <, >, <=, >=, IN, LIKE` (`%` wildcard); escape single quotes with a
  backslash (`Adam\'s`).
- V2 never exposes this as a generic query action — only fixed, parameterized
  wrappers with server-side escaping.

### Errors

Body shape: `{ "Fault": { "Error": [{ "Message", "Detail", "code" }], "type":
"ValidationFault" | "AuthenticationFault" | "AuthorizationFault" |
"SystemFault" }, "time" }`. HTTP 401 = expired/invalid token (refresh+retry).
429 = `errorCode 003001 ThrottleExceeded`. 5010 = stale SyncToken (not hit this
slice — no updates).

## Webhooks

**App-level, portal-configured.** One endpoint URL per app per environment
(Development and Production sections separately), plus a checklist of entities.
There is NO per-company or per-workflow webhook API — webhooks fire for ALL
companies connected to the app, and the payload carries `realmId` to
demultiplex. HTTPS required; endpoint URL max 255 chars.

- **Verifier token**: displayed in the portal after saving the endpoint;
  separate token per environment.
- **Signature**: header `intuit-signature` = base64-encoded HMAC-SHA256 of the
  raw request body, keyed with the verifier token. No timestamp component
  (contrast Calendly's `t=..,v1=..`), so no tolerance-window check applies —
  replay protection comes from idempotency dedup.
- **No creation/validation handshake** — no challenge GET/POST; the portal has
  its own send-test-notification verification.
- **Payload** (compact by design — no entity data; fetch after receipt):

```json
{
  "eventNotifications": [
    {
      "realmId": "1185883450",
      "dataChangeEvent": {
        "entities": [
          { "name": "Invoice", "id": "145", "operation": "Create",
            "lastUpdated": "2026-07-07T12:00:00.000Z" }
        ]
      }
    }
  ]
}
```

  Events are aggregated/batched: multiple entities per notification, multiple
  realms per POST possible.
- **Entities/operations used this slice**: Customer (Create; also
  Update/Delete/Merge exist), Invoice (Create; also Update/Delete/Void),
  Payment (Create/Update; also Delete/Void). An "Emailed" operation for
  Invoice: UNVERIFIED — not relied on.
- **Delivery**: retries on non-2xx exist (schedule UNVERIFIED); duplicates and
  out-of-order delivery are explicitly possible → idempotent handling keyed on
  stable semantic identity is required. Ack fast, process async.

### invoice_paid derivation (no native event)

There is **no native "invoice paid" webhook event**. The safest verified model,
implemented this slice:

1. Subscribe to **Payment Create + Update**.
2. On event: `GET /payment/{id}` → walk `Line[].LinkedTxn` for
   `TxnType == "Invoice"` → collect invoice ids.
3. `GET /invoice/{TxnId}` for each; treat `Balance == 0` (with `TotalAmt > 0`)
   as paid. `0 < Balance < TotalAmt` = partial → NOT paid → no fire.
4. Dedup key is durable semantic identity `invoice_paid:{realmId}:{invoiceId}`
   — NOT timestamp-bearing — so Payment Create + Payment Update for the same
   payment, or multiple payments finishing the same invoice, collapse to one
   fire. Invoice Update events are deliberately NOT used as a paid signal
   (their firing on payment application is not officially guaranteed, and
   using both signals would double-derive).
5. Known limitation: `webhook_event_dedup` rows expire (daily cleanup cron), so
   an invoice that is paid, later un-paid (payment voided), and paid again
   after the dedup TTL will fire again. That refire is semantically correct
   (the invoice genuinely became paid again).

## Rate limits

- 500 requests/min per realmId per app (official help article).
- Concurrency: historically 10 concurrent per realm per app (some sources say
  40 — UNVERIFIED; V2 stays well under 10 by design: webhook enrichment is
  sequential per event).
- 429 → `ThrottleExceeded`; no documented Retry-After (parse defensively).
- Batch endpoint (`POST .../batch`, ≤30 ops) exists — NOT used this slice.

## CDC (Change Data Capture)

`GET /v3/company/{realmId}/cdc?entities=...&changedSince=<ISO>` returns full
payloads of changed entities (30-day lookback, 1000 objects/entity cap).
Intended as webhook-gap backfill. NOT shipped in QUICKBOOKS-1 (neither as a
user-facing trigger nor as internal backup); documented here as the sanctioned
future backstop if live certification shows webhook gaps.

## Regional / data limitations

- Region editions (US, CA, UK, AU, …) share the API but split on tax:
  - US + Automated Sales Tax: QBO computes `TxnTaxDetail` itself and IGNORES
    submitted tax amounts; line `TaxCodeRef` uses `TAX`/`NON`.
  - Non-US: global tax model; `GlobalTaxCalculation`
    (`TaxExcluded`/`TaxInclusive`/`NotApplicable`) applies; line `TaxCodeRef`
    must reference real region TaxCodes.
- V2 posture this slice: tax fields are OPTIONAL and explicit-only (per-line
  tax code from the `quickbooks:tax_codes` option source, optional
  invoice-level `globalTaxCalculation` select). V2 never invents or defaults
  tax values; when omitted, QBO's own defaulting applies.
- Multicurrency: `CurrencyRef` must match the customer's currency in
  multicurrency companies. V2 does not set `CurrencyRef` (QBO derives it from
  the customer) — documented limitation.

## File/download behavior

None this slice (no attachments/PDF endpoints shipped).

## Cleanup / live-smoke feasibility

Sandbox companies are free and disposable — live certification runs against a
sandbox company first. Test artifacts (customers/invoices/payments) created
during certification can be voided/deleted manually in the sandbox UI; the API
delete operations are deliberately NOT shipped, so smoke cleanup is manual and
documented in the owner report. Production certification only after the
Intuit app assessment unlocks production keys.

**Live-cert attempt 2026-07-13:** BLOCKED (owner-interactive / env-gated) — no
live run performed. The local environment lacks the sandbox live gate
(`QUICKBOOKS_API_BASE`, `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`,
`SMOKE_QUICKBOOKS_*`) and cannot receive real Intuit webhook deliveries, so
neither the action live smoke nor trigger certification could run. Mocked
suites re-verified green (113 tests), typecheck clean. Full attempt log in
[`owner-setup-report.md`](./owner-setup-report.md) → "Phase 13
live-certification attempt — 2026-07-13". Observed live webhook event shapes
remain TO-BE-CAPTURED at owner-run time.

## Known API limitations (summary)

- realmId only at callback → needs callback-param passthrough (see pattern
  audit — generic dispatcher extension).
- Compact webhook payloads → post-fetch enrichment required before dispatch.
- No native invoice-paid event → derived (see above).
- No OR in query language → find_customer searches ONE field per run.
- Offset pagination only (STARTPOSITION), no cursors.
- Refresh token value rotates ~daily → persist every returned token.
- DisplayName uniqueness across Customer/Vendor/Employee → create_customer
  surfaces the provider's duplicate-name error; V2 does not auto-dedupe.

## Unverified / unclear

1. PKCE behavior if sent (assumed unsupported; not sent).
2. Exact concurrent-request limit (10 vs 40) — designed for ≤10.
3. Webhook retry schedule + auto-disable-after-failure policy.
4. Webhook response timeout.
5. "Emailed" webhook operation for Invoice — not relied on.
6. Invoice Update firing when payment applied — not relied on.
7. Whether `Balance` is filterable in the query language — NOT relied on
   (list_invoices ships without an open/paid server-side filter; see
   implementation plan).
8. Retry-After header on 429 — parsed defensively.
9. App Partner Program pricing tiers (2025+) — owner checks at go-live.

## Official doc links

- OAuth: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- Scopes: https://developer.intuit.com/app/developer/qbo/docs/learn/scopes
- Refresh validity: https://help.developer.intuit.com/s/article/Validity-of-Refresh-Token
- Minor versions: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions
- Customer: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer
- Invoice: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice
- Payment / linked txns: https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-linked-transactions
- Query: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries
- Webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
- Webhooks help: https://help.developer.intuit.com/s/article/Webhooks-for-QuickBooks-Online-REST-APIs
- Rate limits: https://help.developer.intuit.com/s/article/API-call-limits-and-throttling
- CDC: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture
- App assessment: https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ
- Redirect URIs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/set-redirect-uri
- Automated sales tax: https://help.developer.intuit.com/s/article/Using-QuickBooks-Online-API-for-automated-sales-tax
