# Fleetio — Configuration Design (Rule 17 matrix)

**Status:** authored at Slice 0/1 (auth + connection shell). The CONNECTION experience below is
implemented; every node matrix is the binding design for Slices 2–5 and must be re-verified against
live schema evidence when each node ships. Field classes per CLAUDE.md rule 17: **core user
decision** · **static provider resource** · **dynamic upstream value** · **fixed repeated value** ·
**derived/defaulted value** · **conditional option** · **advanced control** · **internal
implementation detail**.

## 0. Connection experience (implemented — Slice 1)

| Field | Class | UI |
|---|---|---|
| API key | core user decision (secret) | password input + reveal, per-field "where to find it" help (Manage API Keys path) |
| Account token | core user decision (secret) | password input + reveal, help (bottom of same page / URL slug) |
| Fleetio account identity | derived | resolved server-side from `GET /accounts` (numeric id + name); user never types an id |
| API version | internal implementation detail | pinned `2025-05-05` in the wrapper; never surfaced |
| Role/plan caveats | guidance | credentialGuide note: least-privilege integration user; Professional/Premium required |

Readiness: connected ⇔ both fields verified against `GET /accounts` (key valid AND token matches).
Failure states: invalid key · role-restricted key · token mismatch · provider unreachable (retryable)
— each a distinct, humanized message; no fake healthy state (verification failure persists nothing).
Reconnect: same form via the standard per-account Reconnect flow; refuses a different Fleetio account
than the intended row (identity-match guard).

## Option resolvers to build (Slices 2–3, before the nodes that need them)

| Resolver id | Backs | Source | Notes |
|---|---|---|---|
| `fleetio:vehicles` | every vehicle picker | `GET /vehicles` (+`filter[name_or_vin][like]` search — VERIFY exact filter at impl) | label: name + license plate; `allowManualEntry: true` |
| `fleetio:vehicle_statuses` | Update Vehicle Status | `GET /vehicle_statuses` | static provider resource |
| `fleetio:issue_labels` | Create/Update Issue | labels endpoint | |
| `fleetio:contacts` | assignee/reporter | `GET /contacts` | |
| `fleetio:service_tasks` | Service Entry rows | `GET /service_tasks` | row-cell resolver (RESOLVERS-3/4) |
| `fleetio:vendors` | Fuel/Service Entry | `GET /vendors` | |
| `fleetio:work_order_statuses` | WO trigger filter | `GET /work_order_statuses` | names are the filterable value |
| meter units / fuel types | Meter/Fuel Entry | static enums | conditional options |

## Node matrices (binding design — Slices 2–5)

### Create Meter Entry (Must)
| Field | Class | Setup/Advanced | UI |
|---|---|---|---|
| Vehicle | static provider resource | Setup, required | `fleetio:vehicles` combobox, manual entry retained |
| Meter value | dynamic upstream value | Setup, required | number; typically `{{trigger.odometer}}` |
| Unit | conditional option | Setup, required (Q11 — no silent default) | static enum (mi/km/hr) |
| Date | derived/defaulted | Setup, `defaultValue: now` (visible) | date picker |
| Void flag | advanced control | Advanced | boolean |
| Vehicle id manual | advanced control | Advanced | text |
Outputs (bounded): `meterEntryId, vehicleId, value, unit, meterDate, createdAt`.

### Create Issue (Must)
| Field | Class | Setup/Advanced |
|---|---|---|
| Vehicle | static provider resource | Setup, required (`fleetio:vehicles`) |
| Summary | core user decision / dynamic upstream | Setup, required |
| Description | dynamic upstream value | Setup, optional textarea |
| Labels | static provider resource | Setup (`fleetio:issue_labels`, multi) |
| Assignee | static provider resource | Setup (`fleetio:contacts`) |
| Reporter contact id | advanced control | Advanced |
| Custom fields | advanced control | Advanced — flat `object` editor, NOT raw json |
Outputs: `issueId, vehicleId, number, state, summary, assignedContactId, createdAt`.

### Create Fuel Entry (Must)
Vehicle (resource, req) · Fuel type (conditional enum, req — Q11) · Volume (upstream, req) ·
Volume unit (conditional, req — Q11) · Total cost (upstream) · Fueled-at date (defaulted, visible) ·
Vendor (resource) — Setup. Reference no., partial-fuel/personal flags, meter-capture toggle — Advanced.
Outputs: `fuelEntryId, vehicleId, volume, unit, costTotal, fueledAt, vendorId`.

### Create Service Entry (Must)
Vehicle (resource, req) · Completed date (req) · Service tasks (`object-list`, per-row
`fleetio:service_tasks` — a row cell gets a picker, RESOLVERS-3/4) · Vendor (resource) · Total cost —
Setup. Labor/parts breakdown rows, notes, meter-at-service — Advanced.
Outputs: `serviceEntryId, vehicleId, completedAt, totalCost, taskCount`.

### Update Vehicle Status (Must) — ✅ IMPLEMENTED (FLEETIO-3)
Vehicle (`fleetio:vehicles`, req, `allowManualEntry`) · New status (`fleetio:vehicle_statuses`, req,
`allowManualEntry`) — Setup, in that order. **No Advanced fields** (comment/effective-date were in the
original sketch but Fleetio's `PATCH /vehicles/{id}` needs only `vehicle_status_id`, so none are sent).
Readiness: connected + both ids present (direct, manual, or mapped `{{...}}` all satisfy; resolver need
not load). Meta risk `medium` (recoverable), non-destructive, no confirmation.
- **Wire:** `PATCH /vehicles/{id}`, flat body `{ vehicle_status_id: <int ≥1> }` (no wrapper); returns
  the updated Vehicle. Input `vehicleStatusId` is a positive-integer STRING at the CR boundary,
  converted to number in the API layer only after strict validation.
- **Bounded output (real, from the updated Vehicle):** `{ vehicleId, vehicleName, vehicleStatusId,
  statusName, archived, updatedAt }`. **`updatedAt`, NOT `changedAt`** — Fleetio has no status-change
  timestamp, so the original sketch's `changedAt` was corrected to the real field. No before/after
  status pair (only the post-update value is known).
- **Write-safety:** no Fleetio idempotency key for vehicle updates; engine invokes once; the shared
  wrapper's 429 retry is now method-aware (writes never auto-replay); timeout = unknown outcome, never
  auto-replayed. Full detail: plan §"Slice 3".

### Get Vehicle (Must — enrichment read) — ✅ IMPLEMENTED (FLEETIO-2)
Vehicle (resource with manual entry — commonly `{{trigger.vehicleId}}`) — Setup, required
(`fleetio:vehicles` combobox, `allowManualEntry`). Readiness: connected + non-empty vehicleId
(a mapped `{{...}}` satisfies it; the resolver need not load).
Bounded output (implemented): `vehicleId, name, vin, licensePlate, make, model, year, statusId,
statusName, primaryMeterValue, primaryMeterUnit, archived, createdAt, updatedAt`.
**Schema discrepancy (resolved honestly):** Fleetio has NO vehicle `number` field — the human
identifier IS `name` (e.g. "Truck 104"), so the plan's `number` output was OMITTED, not invented.
`primaryMeterValue`/`primaryMeterUnit` map to `current_meter_value` + `meter_unit`; `statusId` is the
numeric `vehicle_status_id`; `archived` is derived from `archived_at`. Q5 explicit `0`/`false`/`""`
preserved via typed presence checks. No bytes; vehicle photos deferred to a later FileRef action.

### `fleetio:vehicles` resolver — ✅ IMPLEMENTED (FLEETIO-2)
`GET /vehicles`, one keyset page (per_page 100), archived excluded by the endpoint default, search
passed server-side as `filter[name][like]`. Values = stable numeric vehicle ids (as strings). Label =
vehicle `name` (fallback `Vehicle <id>` — never "undefined"), optional `description` = status name.
`hasMore` mirrors the opaque `next_cursor` (the provider cursor/link is never surfaced). Account-scoped
via `ctx.integration` (Fleetio is an ACCOUNT credential; the shared route resolves the workflow-account
row). NOTE: the list `VehicleSummary` carries no plate/VIN, so the plan's "name · plate" label
degrades to name-only on the list — full plate/VIN are available on the single-vehicle read.

### `fleetio:vehicle_statuses` resolver — ✅ IMPLEMENTED (FLEETIO-2, ahead of its consumer)
`GET /vehicle_statuses`, one bounded page. Values = status ids; labels = status names; deterministic
order by provider `position` then id. Registered + tested now as platform surface; its first consumer,
**Update Vehicle Status**, ships in Slice 3 (NOT this slice).

### Triggers (Must set — polling; mirror Motive's `newFuelPurchase` shape)
| Field | Class | Notes |
|---|---|---|
| Vehicle filter | static provider resource, optional | `fleetio:vehicles`, empty = all vehicles |
| Status filter (WO / reminder triggers) | conditional option | `fleetio:work_order_statuses` names / reminder-status enum |
| Poll cadence | internal implementation detail | never surfaced |
| Include-archived | advanced control | default false, visible as defaultValue |
payloadShape: thin handles only (ids + display fields + `changeKind`), driver email flagged
`sensitive: true`, no enrichment I/O in filters (rule 12), short-form `eventType` (rule 10),
baseline-first + DB dedup on stable numeric ids (rules 11/13).

## Rule-17 verdict at this slice
The connection path is complete for an ordinary fleet manager: no Fleetio API docs needed (the form
tells them exactly where both values live), no opaque identifiers typed (account identity is
derived), role/plan caveats stated inline. Node-level completion will be judged per node when
Slices 2–5 ship against this matrix.
