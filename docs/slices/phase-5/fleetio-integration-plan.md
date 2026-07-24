# TRUCK-PLAN-1 — Fleetio Integration Architecture & Certification Plan

**Status:** Slices 0–1 IMPLEMENTED locally (FLEETIO-1 — research artifacts + `credential_paste` auth
contract + Fleetio connection shell). Slices 2+ not started. Nothing pushed.
**Date:** 2026-07-23 (plan) · updated same day after Slice 0/1 implementation
**Author track:** TRUCK-PLAN-1 → FLEETIO-1
**Question answered:** Should Fleetio be the next native ChainReact integration, and what is the complete implementation plan?

> **Post-implementation corrections (FLEETIO-1):** the plan below originally described Fleetio's
> auth as `token_ingest`. That was wrong — `token_ingest` is specifically the browser-fragment
> transport (Trello). Fleetio shipped on a NEW, reusable **`credential_paste`** contract (user
> enters N named credentials into a V2-owned form; typed `credentialFields` in the manifest; own
> dispatcher op + route; second secret in `integrations.extra_credentials_encrypted` via migration
> `20260727000000`). Durable policy: `docs/rules/token-ingest-auth.md` §"Credential-paste variant".
> Also superseded by evidence (see `docs/providers/fleetio/research.md`): Fleetio webhooks ARE fully
> API-manageable (CRUD + `shared_key` retrieval — Slice 6 needs no owner-manual setup), the verify
> endpoint is `GET /accounts` (not a `/vehicles` probe; `per_page` min is 2), and `updated_at`
> filtering/sorting is confirmed on all five planned polling resources.

> Research basis: Fleetio developer portal (API version `2025-05-05`), Fleetio help/feature docs,
> the Fleetio↔Motive advanced integration (Aug 2025) announcement, and third-party reviews —
> cross-checked against the current V2 provider patterns (Motive, Trello token-ingest,
> QuickBooks) and the rule docs (`token-ingest-auth.md`, provider authoring rules).
> Where a fact is not publicly documented it is flagged **VERIFY**.

---

## 0. Bottom line up front

**Recommendation: YES — build Fleetio as the next NATIVE provider.** It is the highest-leverage
addition available for our launch market (SMB trucking), it is the natural maintenance-side
counterpart to the Motive telematics integration we already ship, and its API is mature enough to
support a polished native experience. **Do not use MCP** — Fleetio publishes no official MCP server,
and native is the correct path regardless. Auth is a **token-paste** flow (API key + Account-Token),
which is a small, well-scoped contract extension to the existing token-ingest infrastructure —
this is the one genuinely new piece of platform work.

---

## 1. Research — Fleetio current capabilities

API docs current as of Fleetio API version **`2025-05-05`**.

| Dimension | Finding | Impact on V2 |
|---|---|---|
| **Auth model** | API-key based. Every request needs **two** headers: `Authorization: Token <api_key>` **and** `Account-Token: <account_token>`. Per-account tokening; the API key is tied to a Fleetio **user** and inherits that user's role/permissions (RBAC). API access is **Professional/Premium plans only**. | **`authFlow: "credential_paste"`** (IMPLEMENTED — new reusable multi-field contract; NOT `token_ingest`, which is fragment-transport-specific). `refreshable: false`. `tokenScope: "user"`, `accountIdField: "id"`. |
| **OAuth** | **None public.** No OAuth authorize/token endpoint, no partner app registration in public docs. | No OAuth dispatcher work. Don't build a redirect dance. |
| **API maturity** | REST/JSON, no GraphQL. Base `https://secure.fleetio.com/api/`. Broad, fleet-complete resource set: vehicles, work orders, service entries, service reminders/tasks, issues, submitted inspection forms, fuel/meter/expense entries, purchase orders, parts, vendors, contacts, vehicle assignments, faults. | Rich native action/trigger surface available. |
| **Versioning** | **Date-based** (`2025-05-05`), pinned per key; override via `X-Api-Version`. Backwards-compatible changes ship without a new version; breaking changes get a new dated version. | Pin `X-Api-Version: 2025-05-05` on every call for determinism. |
| **Webhooks** | **Yes, outbound.** 50+ events. **HMAC-SHA256** signature in `X-Fleetio-Webhook-Signature` over raw body; per-webhook secret. Must return 200 within 30s. Retries ~29 attempts/24h; **disabled after 3 consecutive failures**. Update events debounced ~1min. Configured in the **Fleetio UI**. | Strong signal quality. **VERIFY** whether webhooks can be created/managed via API — public docs describe UI config only. Drives trigger design (see §5). |
| **Rate limits** | 429 + `Retry-After` header; exact numeric limits **undocumented / per-plan**. No `X-RateLimit-*` headers. | Honor `Retry-After` in the API wrapper's backoff; nothing to hardcode. |
| **Pagination** | Cursor-based on current versions: `start_cursor` + `per_page` (default 50, **max 100**); response envelope `{ records[], next_cursor, per_page, estimated_remaining_count, filtered_by, sorted_by }`. Cursors are opaque (no host leakage). Legacy page-number scheme on old endpoints. | Rule-9 single-page-by-default fits perfectly; surface `nextCursor`/`hasMore`. |
| **Search / filter** | `filter[<field>][<operator>]=<value>` (AND-combined), `sort` param. Custom fields filterable. | Resolvers can server-side filter (e.g. active vehicles) cheaply. |
| **Official SDKs** | **None first-party.** Community wrappers only. | Hand-write a typed wrapper from the versioned OpenAPI schema. |
| **Official MCP** | **None.** Not in Fleetio's portal nor the MCP servers registry. | MCP path is off the table; native only. |
| **Docs quality** | Strong. Interactive portal, "Try It Out", **versioned OpenAPI/Swagger schema** downloadable. | Good foundation for typed schemas + smoke fixtures. |
| **Scopes** | No granular token scopes; access = the integration user's **role/permissions**. | Owner Report must tell the owner to create a least-privilege integration user. |
| **Sandbox** | **Yes** — isolated sandbox environments (Pro: 1, Premium: 2), seeded sample data. **Caveat:** on *trial* accounts, seeded sample data isn't API-accessible — must create own records. | Live certification (Phase 13) is feasible with a Pro sandbox. |

**Net:** mature, well-documented, webhook-capable REST API with a simple (if slightly unusual, two-value)
auth model, a real sandbox, and an OpenAPI spec. Everything a polished native provider needs.

---

## 2. Business analysis

### Why trucking companies use Fleetio
Fleetio is a **fleet maintenance management system (FMMS)** — it owns the *maintenance, cost, and
compliance* side of running trucks and sits **alongside** telematics (Motive/Samsara/Geotab), which it
deliberately is not. Core jobs: preventive-maintenance (PM) scheduling by time/mileage/engine-hours,
work orders, service history & cost-per-asset, FMCSA-compliant DVIRs / inspections, issues/defects,
fuel tracking (+ IFTA inputs), parts/tire inventory, vehicle assignments, TCO, compliance/expiration
reminders, and meter/odometer tracking. It replaces "spreadsheets + paper + whiteboard + email," whose
failure modes are exactly what produce roadside breakdowns and DOT risk.

### Stakeholders
- **Fleet managers** — primary buyer/user; care about uptime, PM-compliance %, cost per mile/asset, one source of truth.
- **Dispatch** — care about vehicle *availability* ("is this truck safe/legal to roll?"); consume vehicle-status + service-due signals.
- **Maintenance / shop technicians** — live in work orders, service tasks, parts, the mobile app.
- **Safety / compliance** — DVIRs, inspection failures, expiring credentials, audit readiness; must be alerted **fast**.
- **Accounting / finance** — work-order/PO/parts costs and fuel transactions flowing into QuickBooks; pain = manual re-keying.
- **Ownership / executives** — TCO, downtime %, cost-per-mile; consume reports/BI, not day-to-day records.

### Highest-value automation opportunities (ranked by customer value)

1. **Inspection/DVIR failure → instant safety + shop alert + auto-created issue/work order.** Safety + legal-liability event; speed directly cuts out-of-service risk.
2. **Telematics odometer → Fleetio meter update → PM auto-triggers.** Automates the #1 ROI lever (preventive vs reactive). This is the Motive→Fleetio bridge we're uniquely positioned to own.
3. **Fuel-card / fuel entry → accounting (QuickBooks) sync.** High-frequency, high-toil finance re-keying; underpins IFTA and cost-per-mile.
4. **Work order created/completed → notify shop channel (Slack/Teams) + push cost to accounting.** Removes the maintenance→finance lag.
5. **Service due/overdue → dispatch + driver reminder.** Prevents missed intervals from becoming breakdowns.
6. **Vehicle status change (down / back in service) → dispatch availability.** Stops loads being assigned to shop-bound trucks.
7. **Credential/registration expiration → safety reminder + document capture.** Avoids fines / OOS events.
8. **Purchase-order approval lifecycle → approver notification + AP entry.** Speeds procurement; lower frequency.
9. **Cost/maintenance data → spreadsheet/BI for ownership.** Strategic visibility; lower operational urgency.

**Ranking logic:** (a) safety/legal exposure, (b) dollar impact of prevented downtime, (c) frequency × manual toil.
The Aug 2025 Fleetio↔Motive advanced integration productized exactly items 1–3, validating where the pain is.

---

## 3. Workflow analysis (realistic, using existing V2 providers)

All downstream providers below are **already shipped** in V2 (Motive, QuickBooks, Outlook, Slack, Teams,
Google Drive, Google Sheets, Excel, Power BI).

**W1 — Preventive-maintenance bridge (the flagship):**
`Motive (New Odometer/meter)` → `Fleetio: Create Meter Entry` → *(Fleetio internally raises service reminder)* → `Fleetio (Service Reminder Due trigger)` → `Outlook / Slack: notify fleet manager`.
*Saves:* the manual odometer-reading-and-typing that gates all preventive maintenance.

**W2 — DVIR / inspection failure escalation:**
`Fleetio (Submitted Inspection Form / Issue Created trigger)` → filter failed items → `Slack: alert #safety` → `Teams: post to maintenance channel` → `Google Drive: file the inspection PDF/FileRef`.
*Saves:* the lag between a driver flagging a defect and safety/shop seeing it.

**W3 — Maintenance cost → books:**
`Fleetio (Work Order Completed trigger)` → `QuickBooks: Create Bill/Expense` → `Outlook: email accounting the summary`.
*Saves:* double-entry of every repair cost.

**W4 — Fuel → accounting + IFTA:**
`Fleetio (Fuel Entry Created trigger)` → `Google Sheets/Excel: append row (IFTA log)` → `QuickBooks: record expense`.
*Saves:* per-fill-up re-keying; builds the IFTA dataset automatically.

**W5 — Executive maintenance dashboard:**
`Fleetio (Work Order Completed / Service Entry trigger)` → `Excel: append` → `Power BI: refresh dataset`.
*Saves:* the manual monthly TCO/downtime report.

**W6 — Dispatch availability:**
`Fleetio (Vehicle Status Changed trigger)` → `Slack: post to #dispatch` → `Google Sheets: update availability board`.
*Saves:* dispatch discovering a truck is down only when they try to assign it.

Each of W1–W6 is a concrete, time-saving flow that a real SMB fleet runs by hand today.

---

## 4. Action analysis — first release action set

Design constraint: Rule 1 (typed-and-narrow, one endpoint per action), Rule 3 (`.strict()`, V2-shaped inputs),
Rule 5/6/7 (bounded outputs, FileRef, no host leakage).

### Must Have (ship in v1)
| Action | Why |
|---|---|
| **Create Meter Entry** | The keystone of W1 — lets telematics odometer drive Fleetio PM. Highest-value single write; unlocks the Motive→Fleetio story no competitor packages well. |
| **Create Issue** | Turns any upstream signal (inspection fail, fault code, sensor alert) into a tracked Fleetio defect. Core of W2. |
| **Create Fuel Entry** | Feeds cost/IFTA data in; pairs with the fuel trigger for two-way and with accounting out. |
| **Create Service Entry** | Records completed maintenance/costs into asset history — the write behind "log this repair." |
| **Get Vehicle** | Enrichment: resolve a vehicle id from a trigger into name/plate/meter for notifications and downstream mapping. Read, low-risk, high-utility. |
| **Update Vehicle Status** | Powers dispatch flows (mark down / back in service) — the write side of W6. |

### Should Have (fast-follow)
| Action | Why |
|---|---|
| **Create Work Order** | Natural escalation from an issue; heavier schema (line items) so it follows the MVP once the object-list config UX is proven. |
| **Update Issue / Resolve Issue** | Close the loop on W2 (two-way defect state). |
| **Create Contact** | Onboarding drivers/technicians from an HR/upstream source. |
| **Update Meter Entry** | Corrections to the keystone flow. |
| **List Vehicles / List Work Orders / List Issues** | Single-page (Rule 9) list actions for composition and reporting flows (W5). |

### Future
| Action | Why deferred |
|---|---|
| **Create/Update Purchase Order** (+ line items) | Lower frequency, heavier schema; ship after work-order object-list UX is battle-tested. |
| **Parts / inventory writes** | Premium-tier feature, narrower audience. |
| **Create Vehicle** | Fleet onboarding is rare and high-stakes; better as a guided path later. |
| **Bulk / CSV import actions** | Compose loops instead for v1. |

Every action ships with `.strict()` schema, bounded outputs, and Rule-17 builder config (see §6).

---

## 5. Trigger analysis — first release trigger set

**Key architecture decision — polling-first.** Fleetio webhooks are excellent (HMAC-signed, 50+ events)
but **publicly documented as UI-configured**; whether they can be created/managed via API is **VERIFY**.
Rather than block v1 on that, mirror the **Motive pattern**: ship **polling triggers** (baseline-first,
DB-backed dedup) for v1, and add webhook-backed triggers as an enhancement slice once webhook-management
is confirmed (or via a documented owner "paste this URL into Fleetio" manual-webhook setup).
This keeps v1 shippable and honest to Rule 11/13.

### Must Have (v1, polling)
| Trigger | Why (customer value) |
|---|---|
| **New/Failed Inspection Submitted** (`submitted_inspection_form_created`) | The #1 safety flow (W2). Even polled, minutes-fresh is transformative vs email lag. |
| **Issue Created** (`issue_created`) | Feeds W2 and any "new defect" automation; broad applicability. |
| **Work Order Completed / Status Changed** (`work_order_status_changed`) | Drives cost→books (W3) and dashboards (W5). |
| **Fuel Entry Created** (`fuel_entry_created`) | Drives IFTA/accounting (W4); direct Motive-fuel parallel we already model. |
| **Service Reminder Due / Overdue** | The dispatch/PM reminder (W1 tail, W5). High operational value. |

### Should Have
| Trigger | Why |
|---|---|
| **Vehicle Status Changed** (`vehicle_status_changed`) | Dispatch availability (W6). |
| **Work Order Created** | Notify shop at creation, not just completion. |
| **Issue Resolved** | Close-the-loop notifications. |

### Future
| Trigger | Why deferred |
|---|---|
| **Purchase Order lifecycle** (`pending_approval`/`approved`/`received`) | Back-office, lower frequency. |
| **Vehicle Assigned / Meter Entry Created** | Niche; add on signal. |
| **Webhook-backed variants of all of the above** | Enhancement slice once webhook-management path is confirmed — lower latency, less polling cost. |

**Trigger rules honored:** baseline-first seeding on `onActivate` (first poll fires zero — Rule 11);
DB-backed dedup on stable Fleetio object ids (Rule 13); `eventType` = short form stored in
`trigger_resources.event_type` (Rule 10); pure filters, no enrichment I/O (Rule 12 — the trigger emits a
thin handle, `Get Vehicle`/downstream does the I/O).

---

## 6. Configuration UX (Rule 17 — builder completion = provider completion)

Principle: no node requires Fleetio docs, opaque ids, or raw JSON on the Setup path. Static provider
resources become **account-aware selectors** (option resolvers); changing values map from upstream;
manual id entry survives in **Advanced** for power users.

### Option resolvers to build (the resolver surface)
| Resolver id | Backs | Source |
|---|---|---|
| `fleetio:vehicles` | vehicle pickers everywhere | `GET /vehicles?filter[archived][eq]=false`, label = name/number + plate |
| `fleetio:vehicle_statuses` | Update Vehicle Status | `GET /vehicle_statuses` |
| `fleetio:issue_labels` | Create/Update Issue | labels endpoint |
| `fleetio:contacts` | assignee/reporter fields | `GET /contacts` |
| `fleetio:service_tasks` | Service Entry / Work Order line items | `GET /service_tasks` |
| `fleetio:vendors` | Service Entry / PO | `GET /vendors` |
| `fleetio:fuel_types` (static/conditional) | Fuel Entry | enum |
| `fleetio:meter_units` (static/conditional) | Meter Entry | enum (mi/km/hr) |

All resolvers: account-scoped, server-side filtered, `combobox` widget with `allowManualEntry: true`
(Rule 17 keeps manual entry in reach), cursor-paginated single page + search.

### Per-node config design (representative — full matrix produced in Slice 0's config-design doc)

**Create Meter Entry** (Must)
- *Setup:* Vehicle (`fleetio:vehicles`, required), Meter value (number, required), Meter unit (`fleetio:meter_units`, required — **Q11 no silent default**), Meter date (date picker, default now shown as `defaultValue`), Void? (boolean, Advanced).
- *Advanced:* Vehicle id manual entry, `X-Api-Version` override (internal), idempotency note.
- *Readiness:* integration connected + Vehicle + value + unit present.
- *Outputs (bounded):* `meterEntryId`, `vehicleId`, `value`, `unit`, `meterDate`, `void`, `createdAt`.

**Create Issue** (Must)
- *Setup:* Vehicle (`fleetio:vehicles`, required), Summary (text, required), Description (textarea), Label(s) (`fleetio:issue_labels`), Assignee (`fleetio:contacts`), Priority (enum).
- *Advanced:* Reporter contact id, custom-fields object editor (flat keys → `object` editor, not raw JSON), source note.
- *Readiness:* Vehicle + Summary.
- *Outputs:* `issueId`, `vehicleId`, `number`, `state`, `summary`, `assignedContactId`, `createdAt`.

**Update Vehicle Status** (Must)
- *Setup:* Vehicle (`fleetio:vehicles`, required), New status (`fleetio:vehicle_statuses`, required).
- *Advanced:* status-change comment, effective date.
- *Readiness:* Vehicle + status.
- *Outputs:* `vehicleId`, `vehicleStatusId`, `statusName`, `changedAt`.

**Create Fuel Entry** (Must)
- *Setup:* Vehicle (required), Fuel type (`fleetio:fuel_types`, required), Volume (number, required), Volume unit (required — Q11), Cost total (number), Fueled at (date), Vendor (`fleetio:vendors`).
- *Advanced:* reference no., odometer/meter capture toggle, personal/reimbursable flags.
- *Outputs:* `fuelEntryId`, `vehicleId`, `volume`, `unit`, `costTotal`, `fueledAt`.

**Create Service Entry** (Must)
- *Setup:* Vehicle (required), Completed date (required), Service task(s) (`fleetio:service_tasks`, `object-list` with per-row resolver — RESOLVERS-3/4), Vendor (`fleetio:vendors`), Total cost (number).
- *Advanced:* labor/parts breakdown (`object-list`), notes, meter-at-service.
- *Outputs:* `serviceEntryId`, `vehicleId`, `completedAt`, `totalCost`, `taskCount`.

**Get Vehicle** (Must — enrichment read)
- *Setup:* Vehicle (`fleetio:vehicles` with manual entry — commonly wired from `{{trigger.vehicleId}}`).
- *Outputs:* `vehicleId`, `name`, `number`, `licensePlate`, `vin`, `make`, `model`, `year`, `statusName`, `primaryMeterValue`, `primaryMeterUnit`.

**Triggers (all Must-Have)** — config shape mirrors Motive's `newFuelPurchase.meta.ts`:
- *Setup:* optional Vehicle filter (`fleetio:vehicles`, `allowManualEntry`, not required → "All vehicles"); for inspection/work-order triggers, optional status/form filter.
- *Advanced:* poll granularity note (internal), include-archived toggle.
- *payloadShape:* thin handle — ids + a few display fields + `changeKind`; **no bytes** (inspection PDFs surfaced as `FileRef` by a downstream `Get`/attachment action, per Rule 12). Sensitive fields (driver email) flagged `sensitive: true`.
- *Readiness:* integration connected (filters optional).

Everything renders Setup-first with power-user plumbing under Advanced (CONFIG-UX-SETUP-ADVANCED-1),
flat objects use the `object` editor, raw `json` stays Advanced-only.

---

## 7. ChainReact architecture fit

**Verdict: native, permanently.**

| Criterion | Assessment |
|---|---|
| **API quality** | High — REST + OpenAPI + date-versioning + cursor pagination + rich filtering. Ideal for a typed native wrapper. |
| **Resolver complexity** | Moderate and well-bounded — 6–8 account-aware resolvers, all simple list+filter. No exotic graph traversal. |
| **Webhook quality** | High (HMAC-SHA256, 50+ events) but UI-config today → polling-first v1, webhook enhancement later. Not a blocker. |
| **Long-term maintenance** | Low — date-versioned API with a stated backwards-compat policy; pin the version, watch the changelog. |
| **Customer expectations** | Trucking customers expect Fleetio to feel like a first-class, account-aware provider (pick your vehicle, not paste an id). Only native delivers Rule-17 UX. |

**Would MCP add value? No.**
1. **No official Fleetio MCP server exists** — the MCP-catalog path (Linear/Eden model) requires a
   Marcus-reviewed official/trusted vendor server. There is none to compile.
2. Even hypothetically, MCP buys us nothing here: an MCP server would still hit the same REST API, and
   we'd *lose* the typed `.strict()` schemas, account-aware resolvers, FileRef discipline, and bounded
   outputs that make the native provider feel polished. MCP shines when a vendor ships certified tools we
   don't want to hand-model; Fleetio's API is clean and we *want* the native control for the flagship
   trucking flows.

**Auth was the one novel platform piece — now IMPLEMENTED (FLEETIO-1).** Fleetio ships on the new
**`credential_paste`** contract: the manifest declares typed `credentialFields` (apiKey +
accountToken, both secret/required) + a `credentialGuide`; a shared provider-neutral form
(`features/apps/credential-paste/CredentialPasteForm.tsx`) renders them; the dispatcher's
`handleCredentialIngest` mirrors `handleTokenIngest`'s security ordering (field-set shape check →
state consume → user/provider/freeze/membership/role checks → provider verify → identity-match →
`upsertActive`). Verification uses **`GET /accounts`** (key-only auth; entered Account-Token matched
against `records[].token`; durable `providerAccountId` = numeric `Account.id`). The API key is the
primary credential in `access_token_encrypted`; the Account-Token lives encrypted in the new
provider-neutral `integrations.extra_credentials_encrypted` column (migration `20260727000000`).
This is the reusable primitive future API-key/PAT/multi-field providers inherit — durable policy in
`docs/rules/token-ingest-auth.md` §"Credential-paste variant".

---

## 8. Certification plan — implementation slices

Complexity: **S** ≈ ½–1 day, **M** ≈ 1–2 days, **L** ≈ 2–4 days (single-engineer, with tests).

### Slice 0 — Research + catalog + config-design doc · **S** — ✅ DONE (FLEETIO-1)
- Delivered: `docs/providers/fleetio/research.md` (schema-verified API facts + VERIFY resolutions),
  `v2-pattern-audit.md`, `configuration-design.md` (Rule-17 matrix incl. the implemented connection
  experience). Catalog decisions unchanged from this plan.

### Slice 1 — `credential_paste` auth (new reusable contract) + manifest + connect UI · **M/L** — ✅ DONE (FLEETIO-1)
- Delivered (corrected from the original "token_ingest" framing):
  - Contract: `authFlow: "credential_paste"` + typed `credentialFields`/`credentialGuide` +
    `ProviderCredentialPasteAuth` + `CredentialVerificationError` + schema invariants
    (`contracts/integration.ts`).
  - Persistence: `EncryptedTokens.extraCredentialsEncrypted` + migration `20260727000000`
    (`integrations.extra_credentials_encrypted`, cleared on disconnect) + repository wiring.
  - Dispatcher: `CREDENTIAL_PASTE_BY_PROVIDER` + connect branch + `handleCredentialIngest`
    (token-ingest-parity security ordering; path-separated from token flows).
  - Route `POST /api/integrations/oauth/[provider]/credential-ingest` + shared server page
    `app/integrations/credential-paste/[provider]` + provider-neutral
    `CredentialPasteForm` + `lib/api/credentialPaste.ts`.
  - Fleetio: `manifest.ts` (capabilities honest — oauth only; experimental until live cert),
    `auth.ts` (GET /accounts verify), `api/_request.ts` (two headers, pinned `X-Api-Version`,
    `Retry-After`-honoring bounded retry, typed 401/403/429), `api/accounts.ts`,
    `credentials.ts` (typed decode for Slice 2+), registry/category/sharing/icon registration.
  - Tests: 80 new (contract invariants, manifest honesty, auth verify paths, wrapper wire contract,
    dispatcher happy/guard/separation paths, route wire contract, form UI, repo wiring).
- **Certification:** live end-to-end connect against a real Fleetio sandbox remains for the
  Phase-13 pass (no credentials yet).

### Slice 2 — Must-Have read + enrichment (Get Vehicle) + `fleetio:vehicles` resolver · **M**
- **Scope:** `Get Vehicle` action + `.strict()` schema + `.meta.ts`, bounded outputs; `fleetio:vehicles`
  and `fleetio:vehicle_statuses` resolvers; discovery metadata file. Flip manifest `actions: true`.
- **Dependencies:** Slice 1.
- **Testing:** runtime handler, resolver, builder-metadata tests; smoke fixture from OpenAPI.
- **Certification:** resolve real vehicles from sandbox; read a real vehicle.

### Slice 3 — Must-Have writes (Meter, Issue, Fuel, Service, Vehicle Status) · **L**
- **Scope:** 5 typed write actions + schemas + `.meta.ts` + resolvers (`issue_labels`, `contacts`,
  `service_tasks`, `vendors`, fuel/meter enums); Setup/Advanced config per §6; Rule-11 Q-fields.
- **Dependencies:** Slice 2.
- **Testing:** per-action runtime + builder + resolver tests; `object-list` config test for Service Entry.
- **Certification:** create a real meter entry, issue, fuel entry, service entry, status change in sandbox; verify in Fleetio UI.

### Slice 4 — Must-Have polling triggers · **L**
- **Scope:** 5 polling triggers (inspection submitted, issue created, work order status changed, fuel
  entry created, service reminder due) modeled on Motive's polling pattern: `onActivate` baseline seed
  (Rule 11), DB-backed dedup on Fleetio ids (Rule 13), thin payloads (Rule 12), short-form `eventType`
  (Rule 10). Trigger `.meta.ts` with optional vehicle filter. Flip manifest `pollingTrigger: true`.
- **Dependencies:** Slice 2 (resolvers), cron orchestration (existing `services/cron/`).
- **Testing:** trigger lifecycle (seed→first-poll-zero→second-poll-fires), dedup, normalize→dispatch
  short-form match, filter purity.
- **Certification:** activate against sandbox, create records, observe events.

### Slice 5 — Should-Have actions + triggers · **M**
- **Scope:** Create Work Order (+ line items object-list), Update/Resolve Issue, Create Contact, list
  actions; Vehicle Status Changed + Work Order Created + Issue Resolved triggers.
- **Dependencies:** Slice 3–4. **Testing:** same matrix. **Certification:** sandbox exercise.

### Slice 6 — Webhook enhancement (conditional on VERIFY) · **M**
- **Scope:** if webhook-management is API-possible → webhook-backed variants (HMAC-SHA256 verify helper
  at `_shared/fleetio/webhooks/signature.ts`, per Trello precedent), else document an owner
  "paste-this-URL-into-Fleetio" manual webhook setup with signature verification on our receiver.
- **Dependencies:** Slice 4. **Testing:** signature verify (good/bad/replayed), dedup. **Certification:** live webhook delivery.

### Slice 7 — Owner Report + live certification (Phase 13) + apps/builder visibility · **M**
- **Scope:** Apps/Builder/AI visibility metadata + at-a-glance summaries; owner developer-portal &
  environment checklist (least-privilege integration user, sandbox→prod promotion, API-version pin);
  full live-certification pass on a Fleetio Pro sandbox once credentials exist.
- **Dependencies:** Slices 1–6. **Testing:** metadata consistency, no-leak scan. **Certification:** Phase 13 live pass, Owner Report verdict.

**Gates after each meaningful slice:** `npx tsc --noEmit`, `npm run lint`, `lint:structure`,
`lint:migrations`, `npm test`; relevant Playwright specs for e2e slices. No DB migration expected
(state fits `oauth_states`; tokens fit `integrations` columns; trigger watch metadata fits
`trigger_resources.config`).

---

## 9. Competitive analysis (Zapier / Make / n8n) — where ChainReact wins

| Capability | Zapier | Make | n8n | **ChainReact opportunity** |
|---|---|---|---|---|
| Fleetio coverage | Has a Fleetio app (triggers + actions), but generic field mapping | Fleetio via HTTP/community; less curated | Community/HTTP node | **Curated, account-aware Rule-17 UX** — pick a vehicle/status/vendor from a dropdown, never paste an id |
| Trucking-native bundle | General-purpose; no trucking framing | Same | Same | **Motive + Fleetio + QuickBooks in one product** tuned for SMB fleets — the PM bridge (W1) as a first-class template |
| Setup friction | Raw ids, opaque field keys common | Technical (data mapping) | Developer-oriented | **No provider docs required on Setup**; readiness checks + at-a-glance summaries |
| Safety-critical latency | Polling on lower tiers; webhooks on higher | Similar | Self-hosted effort | **DVIR-failure escalation as a shipped template**, honest baseline-first semantics |
| Cost model | Per-task pricing punishes high-frequency fuel/meter flows | Ops-based | Self-host ops cost | Position on **workflow value**, not per-task metering, for high-frequency fleet events |
| Output hygiene | Leaks raw payloads/URLs into steps | Similar | Similar | **Bounded outputs + FileRef + no host leakage** → cleaner, safer variable mapping |

**Sharpest wedge:** be the **trucking operations hub** — the one place Motive (telematics) + Fleetio
(maintenance) + QuickBooks (accounting) + Slack/Teams/Outlook (people) are pre-wired into
value-templates, with a native config UX that a fleet manager (not an integrator) can set up alone.

---

## 10. Owner Report

1. **Overall recommendation — BUILD IT, NATIVE.** Fleetio is the highest-value next integration for our
   SMB-trucking launch market and the maintenance-side complement to Motive. The API is mature,
   documented (OpenAPI), webhook-capable, and sandbox-testable. Green-light.

2. **Native vs MCP — NATIVE (permanently).** No official Fleetio MCP server exists, so the MCP-catalog
   path is unavailable; and even if one existed, native gives us the typed schemas, account-aware
   resolvers, FileRef discipline, and bounded outputs the flagship trucking flows need. MCP adds nothing.

3. **Business value — HIGH.** Fleetio owns fleet maintenance/compliance/cost for SMB truckers. The
   painful manual work is the handoff between maintenance ↔ telematics ↔ accounting ↔ people. We already
   ship every counterpart provider (Motive, QuickBooks, Outlook, Slack, Teams, Drive, Sheets, Excel,
   Power BI), so Fleetio unlocks end-to-end flows no competitor packages for this vertical.

4. **Highest-value workflows —** (W1) Motive odometer → Fleetio meter → PM reminder; (W2) DVIR/inspection
   failure → safety/shop alert + auto-issue; (W3) work-order completed → QuickBooks; (W4) fuel entry →
   IFTA/accounting; (W5) maintenance data → Excel/Power BI dashboard; (W6) vehicle-status → dispatch.

5. **Recommended actions —** *Must:* Create Meter Entry, Create Issue, Create Fuel Entry, Create Service
   Entry, Get Vehicle, Update Vehicle Status. *Should:* Create Work Order, Update/Resolve Issue, Create
   Contact, Update Meter Entry, List Vehicles/Work Orders/Issues. *Future:* Purchase Orders, Parts,
   Create Vehicle, bulk imports.

6. **Recommended triggers (polling-first) —** *Must:* Inspection Submitted, Issue Created, Work Order
   Status Changed, Fuel Entry Created, Service Reminder Due. *Should:* Vehicle Status Changed, Work Order
   Created, Issue Resolved. *Future:* PO lifecycle, Vehicle Assigned, and **webhook-backed variants** of
   all triggers once webhook-management is confirmed.

7. **Estimated implementation effort — ~9–13 working days** across 8 slices (Slice 0 S; Slice 1 M/L;
   Slice 2 M; Slice 3 L; Slice 4 L; Slice 5 M; Slice 6 M conditional; Slice 7 M). The only novel platform
   work is the **token-paste two-field auth** contract extension (Slice 1); everything else reuses
   existing V2 provider machinery. No DB migration expected.

8. **Certification plan —** Slices 0→7 (§8), each behind the standard gate suite; live certification
   (Phase 13) on a Fleetio **Professional sandbox** (1 sandbox included) once the owner provisions an API
   key + Account-Token for a least-privilege integration user. Trial accounts can't read seeded sample
   data via API, so a Pro sandbox (or self-created records) is required for the live pass.

9. **Launch recommendation —** Ship v1 = Slices 0–4 (auth + must-have actions + polling triggers), which
   already delivers W1–W6, then Slice 5 (should-haves) and Slice 6 (webhook latency upgrade) as
   fast-follows. Pair the launch with **1–2 official templates** (the Motive→Fleetio PM bridge and the
   DVIR-failure escalation) to make the trucking wedge obvious. **Push only on Marcus's explicit
   per-batch approval** (deploys to prod; no staging env yet).

10. **Model recommendation for implementation —**
    - **Slice 1 (token-paste auth contract extension)** and **Slice 4 (trigger lifecycle/dedup semantics)**
      — **Opus 4.8 (1M)**: these carry security invariants (consume-before-verify, no-token-leak,
      baseline-first, DB dedup) where a subtle error is costly.
    - **Slices 2, 3, 5 (typed actions, schemas, resolvers, config UX)** — **Sonnet 5** is well-suited for
      the high-volume, pattern-repetitive action/meta/resolver work, with Opus review at the slice gate.
    - **Slice 0 & Slice 7 (research, config-design doc, Owner Report, live cert)** — **Opus 4.8** for the
      judgment-heavy classification and certification verdict.
    - Net: **Opus for auth/triggers/design/certification, Sonnet for the mechanical action/resolver bulk.**

---

## 11. VERIFY items — RESOLVED during Slice 0/1 (details: docs/providers/fleetio/research.md §3)
1. **Webhook management via API — RESOLVED: YES, full CRUD** (`GET/POST /webhooks`,
   `PATCH/DELETE /webhooks/{id}`, `shared_key` retrievable, `GET /webhook_events` delivery log).
   Slice 6 is fully API-driven.
2. **Best verify endpoint — RESOLVED: `GET /accounts`** (key-only auth; match entered Account-Token
   against `records[].token`; durable numeric id + name + plan). Note `per_page` min is 2 —
   `?per_page=1` probes are invalid. Implemented.
3. **Exact per-plan rate limits — partially resolved:** behavior confirmed (429 + `Retry-After`,
   per-account-token; ~20 req/min guidance). Numbers unpublished → observe during Phase-13 live cert.
4. **OpenAPI schema URL — RESOLVED:** `https://developer.fleetio.com/schemas/2025-05-05.yaml`
   (downloaded + inspected).
5. **Account-Token stability — partially resolved:** structurally durable (URL slug, `Account.token`
   field); rotation undocumented → live-cert step: regenerate an API key, confirm the Account-Token
   is unchanged. Design already keys rows by numeric account id, so a rotation surfaces as
   reconnect, never a duplicate row.

---

*End of TRUCK-PLAN-1. Planning only — no code, no commit, no push.*
