# Motive Owner Setup Report

## Status
- **Code status:** code-complete — owner setup required.
- **Commit:** local, not pushed (MOTIVE-1 batch).
- **Push status:** Nothing pushed. Awaiting Marcus's explicit approval.
- **Smoke status:** 2 read fuel fixtures registered (SKIP until `SMOKE_MOTIVE_CONNECTED`
  is set); all write actions + all 8 triggers are exercised at live certification
  (Phase 13). 38 Motive unit tests pass; typecheck 0 errors; structure/discovery/
  option-source/activation gates green.
- **Remaining owner action:** create the Motive developer app, add the redirect URI,
  add the OAuth scopes, add the Vercel env vars, redeploy, connect from Apps, then
  run the Phase 13 live certification (webhooks are created via API — no portal
  webhook config needed).

## Provider developer portal setup

### App / basic settings
- Portal: **developer.gomotive.com** → create a developer account → **+Create App**.
- App name: ChainReact (or your chosen listing name). App type: OAuth 2.0 web app.
- Website URL / Privacy policy / Terms / Support email / Logo: per Motive's listing
  form (required only for Marketplace publication, not for development).
- Note the **Client ID** and **Client Secret**.
- **Marketplace publication** (marketplace.gomotive.com / Technology Partner Program)
  requires Motive review — a submission of endpoints used, auth method, scopes, and
  data flows. Development OAuth works from the self-serve developer app; whether OAuth
  against arbitrary customer companies needs partner approval is **UNVERIFIED** —
  confirm with Motive before external rollout.

### Redirect URIs
- Local:      `http://localhost:3000/api/integrations/oauth/motive/callback`
- Preview:    `https://<preview-domain>/api/integrations/oauth/motive/callback`
- Production: `https://chainreact.app/api/integrations/oauth/motive/callback`
- Exact callback path: `/api/integrations/oauth/motive/callback`

### Webhook URLs
- **No portal webhook config needed.** V2 creates a per-workflow-trigger webhook via
  `POST /v1/company_webhooks` at activation, pointing at
  `https://<app>/api/webhooks/motive?workflowId=…&nodeId=…`.
- Signature: `X-KT-Webhook-Signature` = HMAC-SHA1 of the raw body, keyed with the
  20-char secret V2 generates and stores (encrypted) per webhook. No shared env secret.
- Events subscribed (per trigger): `inspection_report_upserted`, `hos_violation_upserted`,
  `driver_performance_event_created`, `speeding_event_created`, `fault_code_opened`,
  `vehicle_upserted`, `user_upserted`.
- For live webhook testing the app must be reachable over HTTPS from Motive (use a
  tunnel + set `MOTIVE_WEBHOOK_URL`/`NEXT_PUBLIC_APP_URL` to the tunnel origin, or test
  against the deployed environment).

### OAuth scopes (exact Doorkeeper identifiers — all 11 required)

**Portal semantics (live-verified 2026-07-24, single-scope authorize bisect):**
each portal permission row grants EXACTLY ONE scope, chosen by its Read-only /
Read-and-write dropdown — **"Read and write" REPLACES `.read` with `.manage`**
(they are never granted together). Requesting any scope the app doesn't hold
rejects the ENTIRE authorize request with "The requested scope is invalid,
unknown, or malformed." The manifest therefore requests exactly one scope per
row, mirrored 1:1 in `integrations/motive/manifest.ts`. Motive labels `.manage`
as "Read and write", so GETs under a manage-only row are expected to work —
**verify at Phase 13** (fuel list/get, driver/vehicle pickers, fuel polling,
`GET /v1/users/me` at connect).

Required portal configuration (checkbox ✓ + dropdown level):

| Portal row | Level | Scope granted | Used by |
|---|---|---|---|
| Company Details | Read only | `companies.read` | connect identity (companyId) |
| Fuel Purchases | **Read and write** | `fuel_purchases.manage` | fuel CRUD, bulk import; list/get + new_fuel_purchase ride manage |
| Vehicles | **Read and write** | `vehicles.manage` | create/update vehicle; picker + new_vehicle ride manage |
| Drivers and Fleet Managers | **Read and write** | `users.manage` | update_driver; picker + new_driver ride manage |
| Messages | **Read and write** | `messages.manage` | send_message |
| Company Webhooks | **Read and write** | `company_webhooks.manage` | **all 7 webhook triggers** (POST /v1/company_webhooks) — valid identifier despite being absent from Motive's public scope docs |
| Inspection Reports | **Read only** | `inspection_reports.read` | new_inspection_report — do NOT set Read and write (that swaps in `inspections_reports.manage` and breaks the request) |
| HOS Violations | Read only | `hos_logs.hos_violation` | new_hos_violation |
| Driver Performance | Read only | `driver_performance_events.read` | new_safety_event |
| Speeding Events | Read only | `speeding_events.read` | new_speeding_event |
| Fault Codes | Read only | `fault_codes.read` | new_fault_code |

> **Do NOT enable Dispatch Forms / Dispatch Form Entries** for inspections —
> `forms.read` / `form_entries.read` authorize Dispatch Forms, NOT Inspection
> Reports. `inspection_reports.read` is the correct scope and is requested above.

### Provider-specific settings
- Token rotation: **refresh tokens are single-use / rotating** — V2 persists the rotated
  token on every refresh. No action needed beyond connecting.
- PKCE: not used (confidential client with client secret).
- Webhook signing: HMAC-SHA1, per-webhook 20-char secret (V2-managed).
- Rate limits: undocumented; V2 honors `Retry-After` on 429.

## Vercel environment variables
| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `MOTIVE_CLIENT_ID` | yes | ✓ | ✓ | ✓ | oauth.ts | Motive developer app client id |
| `MOTIVE_CLIENT_SECRET` | yes | ✓ | ✓ | ✓ | oauth.ts | Motive developer app client secret |
| `NEXT_PUBLIC_APP_URL` | yes | ✓ | ✓ | ✓ | oauth + webhook URL | already set for the app |
| `MOTIVE_AUTHORIZE_BASE` | no | opt | opt | — | oauth.ts | e2e override (default `https://account.gomotive.com` — live-corrected 2026-07-24; bare `gomotive.com` 404s the token POST) |
| `MOTIVE_TOKEN_BASE` | no | opt | opt | — | oauth.ts | e2e override (default `https://account.gomotive.com`) |
| `MOTIVE_API_BASE` | no | opt | opt | — | api/_request | e2e override (default `https://api.gomotive.com`) |
| `MOTIVE_WEBHOOK_URL` | no | opt (tunnel) | opt | — | notificationUrl | tunnel origin for local webhook testing |
| `MOTIVE_FUEL_IMPORT_PATH` | no | opt | opt | opt | fuelPurchases.ts | override the bulk-CSV import path once its exact contract is confirmed live |
| `SMOKE_MOTIVE_CONNECTED` | no | opt | — | — | smoke gate | set to run the read smoke fixtures |
| `SMOKE_MOTIVE_FUEL_PURCHASE_ID` | no | opt | — | — | get smoke | a real fuel-purchase id for the get read-back |

No secret values belong in this doc — env var **names** only.

## Supabase / database setup
- **No migrations added.** Webhook secrets + polling snapshots live in the existing
  `trigger_resources.config`; dedup uses the existing `webhook_event_dedup` table.
- No RLS/storage/cron changes (the existing poll-triggers cron picks up the new polling
  handler via the registry).

## Actions shipped
| Action | Handler | Schema | Metadata | Setup fields | Advanced | Resolvers | Summary | Unit tests | Smoke |
|---|---|---|---|---|---|---|---|---|---|
| create_fuel_purchase | ✓ | ✓ | ✓ | vehicle/driver pickers, purchasedAt, jurisdiction, fuelType, fuel, unit, cost, currency, vendor, refNo, location | odometer, odometerUnit | motive:vehicles, motive:drivers | derived | ✓ | Phase 13 |
| import_fuel_purchases_csv | ✓ | ✓ | ✓ | csvFile OR rows (row pickers) | dryRun | motive:vehicles, motive:drivers (row) | derived | (schema) | Phase 13 (contract UNVERIFIED) |
| list_fuel_purchases | ✓ | ✓ | ✓ | dates, fuelType, vehicle | perPage, pageNo | motive:vehicles | derived | ✓ | ✓ read fixture |
| get_fuel_purchase | ✓ | ✓ | ✓ | fuelPurchaseId | — | — (upstream id) | derived | ✓ | ✓ read fixture |
| update_fuel_purchase | ✓ | ✓ | ✓ | fuelPurchaseId + optional create fields | — | motive:vehicles, motive:drivers | derived | (via sweep) | Phase 13 |
| delete_fuel_purchase | ✓ | ✓ | ✓ | fuelPurchaseId (destructive+confirm) | — | — (upstream id) | derived | (via sweep) | Phase 13 |
| send_message | ✓ | ✓ | ✓ | driver picker, message | — | motive:drivers | derived | (via sweep) | Phase 13 |
| create_vehicle | ✓ | ✓ | ✓ | number, make/model/year/vin/plate | — | — | derived | (via sweep) | Phase 13 |
| update_vehicle | ✓ | ✓ | ✓ | vehicle picker + optional fields, status | — | motive:vehicles | derived | (via sweep) | Phase 13 |
| update_driver | ✓ | ✓ | ✓ | driver picker + name/phone/email/status | — | motive:drivers | derived | (via sweep) | Phase 13 |

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Setup fields | Summary | Unit tests | Smoke |
|---|---|---|---|---|---|---|
| new_inspection_report | webhook | activate/deactivate | none (company-scoped) | derived | receive ✓ | Phase 13 |
| new_hos_violation | webhook | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_safety_event | webhook | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_speeding_event | webhook | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_fault_code | webhook | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_vehicle | webhook (first-seen dedup) | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_driver | webhook (first-seen dedup) | activate/deactivate | none | derived | receive ✓ | Phase 13 |
| new_fuel_purchase | polling (baseline-first) | activate/poll | optional vehicle | derived | activate ✓ | Phase 13 |

## Option resolvers shipped
| Source key | Resource | Provider endpoint | Search | Cascade deps | Tests |
|---|---|---|---|---|---|
| motive:vehicles | Vehicles | GET /v1/vehicles | local q | none | ✓ |
| motive:drivers | Drivers/Users | GET /v1/users?role=driver | local q | none | ✓ |

## Manual verification checklist for Marcus
- [ ] Create the Motive developer app (developer.gomotive.com → +Create App).
- [ ] Add the redirect URI(s) above.
- [ ] Add the OAuth scopes above.
- [ ] Add `MOTIVE_CLIENT_ID` / `MOTIVE_CLIENT_SECRET` to Vercel (all scopes tested).
- [ ] Redeploy after env changes.
- [ ] Connect Motive from the Apps page (owner/admin, account credential class).
- [ ] Run the Phase 13 live certification. **Marcus requires captured evidence for each
      of the following** (record artifacts in the live-completion closeout; then replace
      every `UNVERIFIED` marker in `research.md` / `implementation-plan.md` with the
      captured evidence):
  1. [ ] **OAuth connect + identity persistence** — connect from the intended environment;
         integration row created; `providerAccountId` = the real companyId from `/v1/users/me`;
         display name persisted.
  2. [ ] **Two SEQUENTIAL token refreshes** — prove single-use rotation: refresh #1 returns a
         new access + new refresh token (persisted); refresh #2 uses the rotated token and
         succeeds; reusing the FIRST (spent) refresh token fails (`invalid_grant`).
  3. [ ] **Full individual fuel-purchase cycle** — one real `create_fuel_purchase` →
         `list_fuel_purchases` (shows it) → `get_fuel_purchase` (read-back) →
         `update_fuel_purchase` (change verified) → `delete_fuel_purchase` (gone; a second
         get returns not-found).
  4. [ ] **One REAL bulk CSV import** — capture the ACTUAL endpoint path, request body/format,
         and any asynchronous job-status polling contract. If it differs from the built spec,
         **correct the wrapper with a FORWARD commit** — do NOT silently rely on the
         `MOTIVE_FUEL_IMPORT_PATH` override. Record the observed contract in `research.md`.
  5. [ ] **Every webhook trigger** — for each of the 7: activation creates the Motive webhook;
         a real delivery's `X-KT-Webhook-Signature` verifies; the observed payload maps
         correctly to the normalized event (capture sanitized real payloads into `research.md`
         and confirm per-event field mapping); deactivation deletes the webhook.
  6. [ ] **Baseline-first fuel polling** — activate `new_fuel_purchase` against a company with
         existing purchases; confirm the first poll emits ZERO historical events; a newly
         created purchase then fires exactly once.
  7. [ ] **One real end-to-end workflow** — a Motive trigger firing through to a downstream
         action, proven live (e.g. `new_fuel_purchase` → a notification/record action).

## Known blockers / limitations
- **Bulk CSV import wire contract is UNVERIFIED** (partner-portal-gated): endpoint path,
  request body, and async job-status are best-effort; confirmed/corrected at Phase 13.
  Owner: Marcus (portal reference) + Claude (adjust wrapper). The Setup UX is complete.
- **Per-event webhook payload field lists are confirmed at live cert** — normalizers
  extract defensively meanwhile.
- **Motive ids assumed monotonic** for the fuel polling high-water — dedup stays correct
  regardless; only backlog suppression depends on it. Confirm at live cert.
- **Marketplace/partner approval** may gate OAuth against arbitrary customer companies —
  confirm with Motive before broad rollout.
