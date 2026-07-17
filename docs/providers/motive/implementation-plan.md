# Motive — Implementation Plan (catalog + configuration design)

- **Provider id:** `motive` · **Display name:** Motive · **Credential class:**
  `account` · **Auth:** OAuth 2.0 auth-code (non-PKCE, rotating refresh) ·
  **accountIdField:** `companyId` · **apiVersion:** `v1`.

## Action / trigger catalog decision table

### Actions

| Action | Decision | Business task | Notes |
|---|---|---|---|
| `create_fuel_purchase` | **Ship** | Log a single fuel purchase (IFTA/expense) | `POST /v1/fuel_purchases`. Top priority. |
| `import_fuel_purchases_csv` | **Ship (live-cert-gated)** | Bulk-import a fuel-card export | POST CSV. Wire contract UNVERIFIED → Phase 13. Setup UX complete. |
| `list_fuel_purchases` | **Ship** | Pull recent fuel for reconciliation | `GET /v1/fuel_purchases`, one bounded page. |
| `get_fuel_purchase` | **Ship** | Fetch one purchase by id | `GET /v1/fuel_purchases/{id}`; friendly `found:false` on 404. |
| `update_fuel_purchase` | **Ship** | Correct a logged purchase | `PUT /v1/fuel_purchases/{id}`. |
| `delete_fuel_purchase` | **Ship** (destructive) | Remove a mis-entered purchase | `DELETE`; `isDestructive`, `requiresConfirmation`. |
| `send_message` | **Ship** | Message a driver in-app | `POST /v1/messages`, `messages.manage`. |
| `create_vehicle` | **Ship** | Onboard a vehicle | `POST /v1/vehicles`. |
| `update_vehicle` | **Ship** | Update vehicle details | `PUT /v1/vehicles/{id}`. |
| `update_driver` | **Ship** | Update a driver/user record | `PUT /v1/users/{id}`. |
| create_driver | **Skip** | — | Driver onboarding requires HR/DOT fields + activation email; out of scope for a first release. Defer until demanded. |
| dispatch/document/asset/location actions | **Skip** | — | No priority use case; would broaden scope + scopes. Add per-demand. |
| generic `make_api_call` | **Not appropriate** | — | Escape-hatch banned by rule 2. |

### Triggers

| Trigger | Decision | eventType (short) | Motive `actions` | Model |
|---|---|---|---|---|
| `new_inspection_report` | **Ship** | `new_inspection_report` | `inspection_report_upserted` | webhook |
| `new_hos_violation` | **Ship** | `new_hos_violation` | `hos_violation_upserted` | webhook |
| `new_safety_event` | **Ship** | `new_safety_event` | `driver_performance_event_created` | webhook |
| `new_speeding_event` | **Ship** | `new_speeding_event` | `speeding_event_created` | webhook |
| `new_fault_code` | **Ship** | `new_fault_code` | `fault_code_opened` | webhook |
| `new_vehicle` | **Ship** | `new_vehicle` | `vehicle_upserted` | webhook, first-seen dedup |
| `new_driver` | **Ship** | `new_driver` | `user_upserted` | webhook, first-seen dedup |
| `new_fuel_purchase` | **Ship** | `new_fuel_purchase` | — (no webhook) | polling, baseline-first |
| new_dispatch | **Skip** | — | — | No webhook; low priority; polling deferred until demanded. |

`TriggerEvent.eventType` equals the short form (left column) passed to
`registerActivation`; the Motive `actions` string is provider wire only.

## Resolvers / resource types

| Source key | Type (1–5) | Endpoint | Search | Cascade | Manual entry (Advanced) |
|---|---|---|---|---|---|
| `motive:vehicles` | 1 static discoverable | `GET /v1/vehicles` | local `ctx.q` | none | yes (`vehicleIdManual`) |
| `motive:drivers` | 1 static discoverable | `GET /v1/users?role=driver` | local `ctx.q` | none | yes (`driverIdManual`) |

Static option sets (fixed enumerable, `options: [...]`, NOT resolvers):
`fuel_type`, `fuel_unit`, `currency`, `odometer_unit`, `jurisdiction`
(US states + CA provinces).

## Per-node configuration design (field classification — CLAUDE.md rule 17)

Classes: **core** = core user decision · **static** = static provider resource
(picker) · **dynamic** = dynamic upstream value · **fixed** = fixed repeated
value · **derived** = derived/defaulted · **cond** = conditional option ·
**adv** = advanced control · **internal** = hidden/derived.

### `create_fuel_purchase`

| Field | Class | UI |
|---|---|---|
| `vehicleId` | static | `motive:vehicles` picker (+ `vehicleIdManual` adv) |
| `driverId` | static | `motive:drivers` picker (+ `driverIdManual` adv) |
| `purchasedAt` | core | datetime, required |
| `jurisdiction` | core | select (states/provinces), required |
| `fuelType` | core | select (fuel enum), required |
| `fuel` | core | number, required |
| `fuelUnit` | derived | select, required, `defaultValue:"gal"` |
| `totalCost` | fixed/dynamic | number, optional |
| `currency` | derived | select, `defaultValue:"USD"` |
| `vendor` | fixed/dynamic | text, optional |
| `refNo` | dynamic | text, optional |
| `odometer` | dynamic | number, optional |
| `odometerUnit` | derived | select, `defaultValue:"MI"`, `visibleWhen odometer` |
| `location` | dynamic | text, optional |

`vehicleId`/`driverId` map from upstream trigger values (e.g. `new_fuel_purchase`)
via the variable selector; the picker is the discovery path. No provider docs
or raw ids required on the Setup path.

### `import_fuel_purchases_csv`

| Field | Class | UI |
|---|---|---|
| `csvFile` | dynamic | file (FileRef) — a CSV from an earlier step |
| `rows` | core | `object-list` editor (per-row fuel fields) — structured, not JSON |
| `dryRun` | adv | boolean, `defaultValue:false` |

Exactly one of `csvFile` / `rows` (`superRefine`). Raw JSON entry is never a
Setup path.

### fuel `list` / `get` / `update` / `delete`

- `list`: `startDate`/`endDate` (core dates), `fuelType`/`vehicleId` filters
  (static/cond), `perPage` (adv, `defaultValue:25`), `pageNo` (adv).
- `get`/`update`/`delete`: `fuelPurchaseId` (core — usually mapped from an
  upstream `new_fuel_purchase`/`list` output; manual entry allowed). `update`
  reuses the create fields as optional. `delete` is destructive+confirm.

### `send_message`

| Field | Class | UI |
|---|---|---|
| `driverId` | static | `motive:drivers` picker (+ manual adv) |
| `message` | core/dynamic | textarea, required |

### `create_vehicle` / `update_vehicle`

`number` (core, required on create), `make`/`model`/`year`/`vin` (fixed/dynamic),
`vehicleId` (update: core, `motive:vehicles` picker). No raw ids on Setup.

### `update_driver`

`driverId` (static picker, required), `firstName`/`lastName`/`phone`/`status`
(optional; `status` is a select `cond`).

### Triggers

- All webhook triggers: **no required Setup fields** (the webhook is
  company-scoped; the connected Motive company is the scope). `payloadShape`
  emits the bounded normalized event; downstream chains a fetch/get action for
  detail. `new_vehicle`/`new_driver` first-seen dedup is internal.
- `new_fuel_purchase` (polling): `pollIntervalSeconds` (adv, informational),
  optional `vehicleId` filter (static picker). Baseline-first.

## Webhook / polling model

Per-node `company_webhook` (create/delete), self-generated 20-char secret,
`X-KT-Webhook-Signature` HMAC-SHA1 verify, strict-direct `?workflowId=&nodeId=`
routing, company P-S2 filter, DB dedup on entity id (first-seen for upserts).
Polling baseline-first with id dedup.

## Owner setup requirements (summarized; full report at owner-setup-report.md)

Env: `MOTIVE_CLIENT_ID`, `MOTIVE_CLIENT_SECRET` (+ e2e overrides
`MOTIVE_AUTHORIZE_BASE`/`MOTIVE_TOKEN_BASE`/`MOTIVE_API_BASE`/`MOTIVE_WEBHOOK_URL`).
Portal: create app, redirect URI `…/api/integrations/oauth/motive/callback`,
scopes per research §2, (webhooks are created via API — no portal webhook config).

## Known blockers / limitations

- Bulk CSV import wire contract UNVERIFIED → live-cert-gated.
- Per-event webhook payload field lists confirmed at live cert.
- Live OAuth/webhooks require Marcus's portal app + env vars → status at
  implementation time is **code-complete owner setup required**.
