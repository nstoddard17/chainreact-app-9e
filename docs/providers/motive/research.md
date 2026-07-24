# Motive (gomotive.com) — Provider Research

> Researched 2026-07-17 against Motive's official developer docs
> (`developer-docs.gomotive.com`, `developer.gomotive.com`). Motive was
> formerly **KeepTruckin**; legacy `keeptruckin.com` hosts and `X-KT-…`
> header prefixes persist and are load-bearing — do not "modernize" them.
> Items that could not be confirmed from public docs (partner-portal-gated)
> are marked **UNVERIFIED** and carried into the live-certification (Phase 13)
> plan.

## 1. Authentication

- **Type:** OAuth 2.0 **authorization-code** flow, confidential client
  (`client_secret`). **No PKCE** — Motive's docs document no
  `code_challenge`/`code_verifier`. (QuickBooks/Slack non-PKCE posture.)
- **Authorize URL:** `https://account.gomotive.com/oauth/authorize`
  (**LIVE-CORRECTED 2026-07-24:** the docs say `gomotive.com`, which only works
  in the browser because it redirects to `account.gomotive.com` — the real
  OAuth host. A server-side `POST gomotive.com/oauth/token` returns 404; this
  broke the first prod connect.)
  `?client_id=…&redirect_uri=…&response_type=code&scope=<space-joined>&state=…`
- **Token URL:** `https://account.gomotive.com/oauth/token` (**LIVE-VERIFIED
  2026-07-24:** `gomotive.com/oauth/token` returns **404** — the "dual-supported
  hosts" claim is wrong for server-side calls; `account.gomotive.com` responds
  with proper Doorkeeper JSON. Legacy `keeptruckin.com` untested/unused).
  Overridable via `MOTIVE_TOKEN_BASE` / `MOTIVE_AUTHORIZE_BASE` for e2e.
- **Token exchange:** POST form body `grant_type=authorization_code`, `code`,
  `redirect_uri`, `client_id`, `client_secret` (body-auth; **verify whether
  Basic-auth is also accepted** — implemented as body-auth, the documented shape).
  Response `{ access_token, token_type: "Bearer", expires_in: 7200,
  refresh_token }`.
- **Access token TTL:** 2 hours (`expires_in: 7200`). Reactive refresh via
  `refreshAndRetry` on 401.
- **Refresh token:** issued alongside the access token, **single-use / rotating**
  — "the refresh token expires as soon as it is used." Every
  `grant_type=refresh_token` returns a NEW access token AND a NEW refresh token;
  the store MUST persist the rotated refresh token atomically or the connection
  locks out (→ reconnect). `oauth.ts` persists `json.refresh_token` on every
  refresh (Calendly/QuickBooks rotation-persist shape). A dead grant returns
  `invalid_grant` → `RefreshAuthRequiredError`.
- **Redirect URI:** registered per app in the developer portal. Canonical V2
  callback: `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/motive/callback`.
- **Account discriminator (`accountIdField`): `companyId`.** A Motive OAuth
  grant authorizes ONE company's data. The company id is read from
  `GET /v1/companies` at connect time (**LIVE-CORRECTED 2026-07-24:**
  `/v1/users/me` requires `users.read`, which the manage-only Drivers portal
  row does not grant — it 403'd the first live connect; manage does NOT imply
  read) and stored as the
  `providerAccountId` — it is the webhook fan-out scope and the multi-company
  discriminator (one authorization = one company; two companies = two rows).
- **Base API host:** `https://api.gomotive.com` (dual-supports
  `api.keeptruckin.com`). Overridable via `MOTIVE_API_BASE`.
- **Versioning:** per-resource path versioning; fuel/vehicles/users/webhooks
  are all `/v1/`.
- **Sandbox:** a "test mode" is referenced for API keys; a full seeded sandbox
  is **UNVERIFIED**. Plan live cert against a real (demo) fleet.

Sources: `developer-docs.gomotive.com/docs/oauth-20`,
`/docs/generate-an-oauth-token`, `/docs/authentication`.

## 2. Scopes / permissions

Docs model: **every GET needs a `*.read` scope; every write (POST/PUT/PATCH/
DELETE) needs the matching `*.manage` scope.** Motive recommends always enabling
`companies.read` so a token can be attributed to its organization.

> **CORRECTION (2026-07-24, live-verified against the real developer app via
> single-scope authorize bisect):** the portal does NOT grant `.read` and
> `.manage` together. Each portal permission row has ONE checkbox + ONE
> Read-only / Read-and-write dropdown, and the app is granted EXACTLY ONE scope
> per row — "Read and write" REPLACES `.read` with `.manage`. Requesting a
> `.read` for a row set to Read-and-write rejects the ENTIRE authorize request
> with Doorkeeper's "The requested scope is invalid, unknown, or malformed."
> The earlier claim of 14 grantable identifiers (read+manage pairs) was wrong.
> Motive labels `.manage` as "Read and write", implying manage tokens can also
> GET — Phase 13 must verify GETs (fuel list/get, pickers, fuel polling) work
> under manage-only scopes. Also live-verified: `company_webhooks.manage` IS a
> valid identifier even though `developer-docs.gomotive.com` scope docs omit it
> entirely.

Exact Doorkeeper scope identifiers requested (11 — one per portal row; portal
row level in parentheses):

| Scope | Portal row (level) | Used by |
|---|---|---|
| `companies.read` | Company Details (Read only) | connect-time company identity + attribution |
| `fuel_purchases.manage` | Fuel Purchases (Read and write) | fuel CRUD + bulk CSV import; list/get + polling ride manage |
| `vehicles.manage` | Vehicles (Read and write) | `create_vehicle`, `update_vehicle`; vehicle picker + `new_vehicle` ride manage |
| `users.manage` | Drivers and Fleet Managers (Read and write) | `update_driver`; driver picker + `new_driver` ride manage |
| `messages.manage` | Messages (Read and write) | `send_message` |
| `company_webhooks.manage` | Company Webhooks (Read and write) | **all 7 webhook triggers** — `POST /v1/company_webhooks` |
| `inspection_reports.read` | Inspection Reports (Read only) | `new_inspection_report` |
| `hos_logs.hos_violation` | HOS Violations (Read only) | `new_hos_violation` |
| `driver_performance_events.read` | Driver Performance (Read only) | `new_safety_event` |
| `speeding_events.read` | Speeding Events (Read only) | `new_speeding_event` |
| `fault_codes.read` | Fault Codes (Read only) | `new_fault_code` |

> **CORRECTION (2026-07-17):** an earlier draft mapped inspections to
> `forms.read` / `form_entries.read` — those are **Dispatch Forms** permissions
> and do NOT authorize Inspection Reports. The correct scope is
> `inspection_reports.read`. `company_webhooks.manage` (mandatory for webhook
> creation) and the four safety-event read scopes were also added. Aligned in
> `manifest.ts` + owner-setup-report.md (forward commit on top of 85cf7a59c).

Deliberately excluded (no shipped node needs them): `dispatches.*`,
`documents.*`, `assets.*`, `locations.*`, `ifta_reports.*`, `geofences.*`,
`forms.*` / `form_entries.*` (Dispatch Forms). Add later only when a node that
needs them ships.

Source: `developer-docs.gomotive.com/docs/oauth-scopes`.

## 3. Rate limits & pagination

- **Rate limits: undocumented** (Motive publishes no req/min numbers). On
  breach: HTTP **429 + `Retry-After`**. Build conservative throttling; honor
  `Retry-After`; `RateLimitedError` carries the parsed value.
- **Pagination: offset/page.** `per_page` (default 25, **max 100**), `page_no`
  (default 1). Responses carry `{ pagination: { per_page, page_no, total } }`.
  V2 returns ONE bounded page and surfaces `hasMore` (never provider host URLs).

Source: `developer-docs.gomotive.com/docs/pagination`.

## 4. Fuel (HIGH PRIORITY)

### Individual fuel purchases — `/v1/fuel_purchases` (VERIFIED)

- **List** `GET /v1/fuel_purchases` — filters `start_date` (default today−7d),
  `end_date`, `fuel_type`, `vehicle_ids`, `vehicle_type` (`ifta`|`all`),
  `jurisdictions`, `source`, `per_page`, `page_no`.
- **Create** `POST /v1/fuel_purchases` — body:
  - **Required:** `vehicle_id` (int), `driver_id` (int), `purchased_at`
    (ISO-8601), `jurisdiction` (US state / CA province code), `fuel_type`
    (enum: `diesel|gasoline|propane|lng|cng|ethanol|methanol|e85|m85|a55|biodiesel|other`),
    `fuel` (amount, string/number), `fuel_unit` (`gal`|`ltr`).
  - **Optional:** `total_cost`, `currency` (`USD`|`CAD`), `ref_no`, `vendor`,
    `odometer` (int), `odometer_unit` (`KM`|`MI`), `location`, `receipt` (array
    of receipt URL strings).
- **Get** `GET /v1/fuel_purchases/{id}` · **Update** `PUT /v1/fuel_purchases/{id}`
  · **Delete** `DELETE /v1/fuel_purchases/{id}` (by-id path pattern inferred
  from the standard REST index — confirm live).
- **Response fields (fixed key set for projection):** `id`, `offline_id`,
  `purchased_at`, `jurisdiction`, `fuel_type`, `ref_no`, `vendor`, `total_cost`,
  `currency`, `fuel`, `fuel_unit`, `odometer`, `odometer_unit`,
  `receipt_upload_url`, `receipt_filename`, and nested `uploader`, `vehicle`
  (`id, number, year, make, model, vin`), `driver` (`id, first_name,
  last_name, email, status`). `receipt_upload_url` is a URL reference (FileRef
  territory) — never surfaced as raw bytes.

### Bulk CSV fuel import — POST, contract **UNVERIFIED**

- Motive's API index lists an **"Import fuel purchases via CSV upload"** POST
  operation under Fuel Purchases; the Fleet-Dashboard UI redirects to a "Fuel
  Imports" status page (implies an async import job). So this is **not UI-only —
  an API exists.**
- **CSV column format (documented in Help Center, UI import):** headers must
  match Motive's template exactly; `purchased_at` ISO-8601; valid **Vehicle
  ID**; valid **driver email/username**; valid **jurisdiction**; exactly one of
  Volume(gal)/Volume(ltr); exactly one of Cost(USD)/Cost(CAD).
- **UNVERIFIED (behind partner portal):** exact endpoint path, multipart vs
  base64 body, size limit, async job-status polling contract. → `import_fuel_purchases_csv`
  is implemented against the best-available spec and the exact wire contract is
  a **live-certification (Phase 13) gate** — see implementation-plan.md.

Sources: `developer-docs.gomotive.com/reference/fetch-all-the-fuel-purchases-of-your-company`,
`/reference/create-a-new-fuel-purchase-transaction`,
`helpcenter.gomotive.com/hc/en-us/articles/9352083027101`.

## 5. Other resources used by shipped nodes

| Resource | Endpoints | Picker fields |
|---|---|---|
| Vehicles | `GET /v1/vehicles` (list), `GET /v1/vehicles/{id}`, `POST /v1/vehicles`, `PUT /v1/vehicles/{id}` | `id` + `number` (label), `year/make/model/vin` |
| Users/Drivers | `GET /v1/users` (list, `role=driver` filter), `GET /v1/users/{id}`, `PUT /v1/users/{id}` | `id` + `first_name last_name` / `email` |
| Messages | `POST /v1/messages` (send to driver) | driver_id target |

## 6. Webhooks / triggers (HIGH PRIORITY)

- **Webhooks v1 are API-registerable per company:**
  - **Create** `POST /v1/company_webhooks` — body `url` (required), `secret`
    (**must be 20 chars**; if blank Motive auto-generates), `format` (`json`
    only), `actions` (array of event-type strings), `enabled` (bool). Optional
    `X-Time-Zone`/`X-Metric-Units`/`X-User-Id` headers. Returns **201** with the
    webhook `id`.
  - **List** `GET /v1/company_webhooks` · **Update** `PUT /v1/company_webhooks/{id}`
    · **Delete** `DELETE /v1/company_webhooks/{id}`.
  - **V2 design:** each trigger node creates its OWN company webhook whose `url`
    carries `?workflowId=&nodeId=` (Asana/Stripe strict-direct-lookup). We
    **generate the 20-char secret ourselves** (`crypto.randomBytes`), pass it to
    Motive, and store it encrypted on the trigger row — so **no mid-creation
    handshake** (simpler than Asana). Deactivation `DELETE`s the webhook.
- **Signature:** header **`X-KT-Webhook-Signature`** = **HMAC-SHA1 hex** of the
  raw JSON body keyed with the 20-char secret. (SHA1 is dated but mandatory.)
  Verified over the raw bytes after row resolution; mismatch → 401.
- **Delivery:** ack **within 3 s**; retries at ~1 min / 1 h / 6 h on
  4xx/5xx/timeout. Receiver acks fast + dedups (upserts redeliver).
- **Event types (exact `actions` strings) used by shipped triggers:**
  `inspection_report_upserted`, `hos_violation_upserted`,
  `driver_performance_event_created`, `speeding_event_created`,
  `fault_code_opened`, `vehicle_upserted`, `user_upserted`.
- **`*_upserted` = create OR update.** For "new vehicle"/"new driver" we
  first-seen dedup on the entity id (`webhook_event_dedup`), so an update to an
  existing entity does not re-fire a "new" workflow.
- **Payload shape (per-event, UNVERIFIED in exact detail):** JSON with an
  `action` field (the event type) + event-specific attributes. Per-event field
  lists are confirmed at live cert; normalizers project a bounded, defensive key
  set and thread `companyId` from the trigger row.
- **NO fuel-purchase webhook and NO dispatch webhook exist** → "new fuel
  purchase" is a **polling** trigger (§7).

Sources: `developer-docs.gomotive.com/reference/overview-company-webhooks`,
`/reference/create-a-new-company-webhook`.

## 7. Polling — new fuel purchase

No fuel webhook exists. `new_fuel_purchase` polls
`GET /v1/fuel_purchases?start_date=<recent window>` each interval, dedups on
`id`, and is **baseline-first** (activation seeds the highest-seen id set; the
first post-activation poll fires zero events). Ordering/`created_since`
semantics are **UNVERIFIED** — the poller uses a recent-window scan + id dedup
rather than trusting sort order, and confirms at live cert.

## 8. Marketplace / partner requirements

- Motive has an **App Marketplace** (`marketplace.gomotive.com`) + **Technology
  Partner Program**. Publishing a listing requires Motive review (technical +
  security + business submission: endpoints used, auth method, scopes, data
  flows).
- **For development:** a self-serve developer account at
  `developer.gomotive.com` → "+Create App" issues Client ID/Secret and lets you
  set the redirect URI + scopes. Whether OAuth against arbitrary customer
  companies is gated behind partner approval is **UNVERIFIED** → owner report
  flags it.

## 9. Known limitations / gotchas (carried to owner report + Phase 13)

- Bulk CSV import wire contract UNVERIFIED (§4).
- Rate limits undocumented (§3).
- Refresh-token single-use rotation — atomic persist mandatory (§1).
- Legacy `keeptruckin.com` token host + `X-KT-Webhook-Signature` header + HMAC-**SHA1**.
- `*_upserted` webhook semantics require first-seen dedup for "new" triggers.
- Forms/inspections & companies are read-only; no create/update via API.
- Fuel receipts are URL references (`receipt_upload_url`) — FileRef, not bytes.
- Per-event webhook payload field lists confirmed at live cert.

## Live event-shape review (Phase 13 — to be filled during live cert)

_Reserved: sanitized observed webhook payloads, duplicate-delivery behavior,
fuel-purchase list ordering, bulk-CSV job contract._
