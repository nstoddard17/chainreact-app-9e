# 5.TRUCK-BRIDGE-1 — Motive ↔ Fleetio Vehicle Mapping Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-07-24
**Branch:** `v2-main`
**Parent arc:** [`fleetio-integration-plan.md`](./fleetio-integration-plan.md) — FLEETIO-1 `60b26d62b`,
FLEETIO-2 `9cd541841`, FLEETIO-3 `07ef681bb`, FLEETIO-4 `ff647f60e`.

**Source of truth (verified current state — every file below was opened and read):**
[integrations/fleetio/actions/createMeterEntry.meta.ts](../../../integrations/fleetio/actions/createMeterEntry.meta.ts) (the consumer this bridge feeds) ·
[integrations/fleetio/actions/createMeterEntry.schema.ts](../../../integrations/fleetio/actions/createMeterEntry.schema.ts) (accepts `vehicleId` as string\|number) ·
[integrations/fleetio/api/vehicles.ts](../../../integrations/fleetio/api/vehicles.ts) (`FleetioVehicleSummary` — the projection that must widen) ·
[integrations/fleetio/options/vehicles.ts](../../../integrations/fleetio/options/vehicles.ts) (`fleetio:vehicles`, 100/page, server-side name filter) ·
[integrations/fleetio/options/_shared.ts](../../../integrations/fleetio/options/_shared.ts) (account-scoped credential guard + error sanitization) ·
[integrations/fleetio/execute.ts](../../../integrations/fleetio/execute.ts) (`runFleetioApiCall` account seam) ·
[integrations/motive/options/vehicles.ts](../../../integrations/motive/options/vehicles.ts) (`motive:vehicles`) ·
[integrations/_shared/motive/projections.ts](../../../integrations/_shared/motive/projections.ts) (`ProjectedMotiveVehicle`, line 142) ·
[integrations/motive/actions/_sharedOutputs.ts](../../../integrations/motive/actions/_sharedOutputs.ts) (`odometer` lives here, line 59) ·
[integrations/motive/triggers/newFuelPurchase/newFuelPurchase.meta.ts](../../../integrations/motive/triggers/newFuelPurchase/newFuelPurchase.meta.ts) (payload has **no** odometer) ·
[services/options/types.ts](../../../services/options/types.ts) (`OptionsResolverContext` has **no** `accountId`) ·
[services/options/resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) (credential-sharing → account decision) ·
[services/execution/handlers/types.ts](../../../services/execution/handlers/types.ts) (`ActionHandlerInput.accountId`) ·
[services/execution/testModeGate.ts](../../../services/execution/testModeGate.ts) (blocks `requiresIntegration: true`) ·
[services/accounts/activeAccount.ts](../../../services/accounts/activeAccount.ts) (interactive account resolution) ·
[repositories/accountMcpTokens.ts](../../../repositories/accountMcpTokens.ts) (service-role repo + DTO projection pattern) ·
[supabase/migrations/20260722000000_account_machine_credentials.sql](../../../supabase/migrations/20260722000000_account_machine_credentials.sql) (account-scoped table template) ·
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`fleetio: "account"`, line 76) ·
[core/workflows/requiredFields.ts](../../../core/workflows/requiredFields.ts) (readiness) ·
[docs/rules/account-ownership-model.md](../../../docs/rules/account-ownership-model.md) ·
[docs/rules/database-security.md](../../../docs/rules/database-security.md) ·
[docs/rules/variable-resolver.md](../../../docs/rules/variable-resolver.md)

Plus the Fleetio OpenAPI schema `2025-05-05` (`https://developer.fleetio.com/schemas/2025-05-05.yaml`,
re-downloaded and read directly for this plan — `VehicleSummary` at line 34815).

---

## 1. Context

FLEETIO-4 shipped `fleetio:create_meter_entry` (`ff647f60e`) — the write that turns a telematics
odometer reading into Fleetio preventive-maintenance scheduling. Its Owner Report closed with one
honest gap:

> **The flagship workflow is not yet one-click.** A user must still establish the Fleetio vehicle id
> themselves. That is the highest-value remaining product gap — a Motive↔Fleetio vehicle mapping
> capability, not more actions.

That gap is real and it is visible in the shipped product: the Vehicle field's own help text in
[`createMeterEntry.meta.ts:58`](../../../integrations/fleetio/actions/createMeterEntry.meta.ts)
tells the user *"a Motive vehicle id is a different identifier and will not match."* Today the only
ways to close it are (a) hard-code one Fleetio vehicle id per workflow — which means one workflow per
truck — or (b) hand-map ids in a spreadsheet outside ChainReact. Neither scales past a handful of
vehicles, and a fleet is 5–several hundred.

This slice designs the bridge. It plans **only**; nothing here is built.

---

## 2. Current codebase findings (verified)

### 2.1 The two id namespaces are genuinely disjoint

| | Motive | Fleetio |
|---|---|---|
| Vehicle id type | opaque string (`ProjectedMotiveVehicle.vehicleId: string \| null`, [projections.ts:143](../../../integrations/_shared/motive/projections.ts)) | numeric `Id` ≥ 1, surfaced as a string (`FleetioVehicle.id: number`, [api/vehicles.ts:21](../../../integrations/fleetio/api/vehicles.ts)) |
| Human identifier | `number` (fleet unit number, e.g. "104") | `name` (e.g. "Truck 104") |
| VIN available | `vin` on `ProjectedMotiveVehicle` ([projections.ts:148](../../../integrations/_shared/motive/projections.ts)) | `vin` on the Fleetio wire `VehicleSummary` (schema line ~34995) — **but not on V2's projection today**, see 2.4 |
| Plate | `licensePlateState` + `licensePlateNumber` (two fields) | `license_plate` (one combined field) |

There is no shared key. Nothing in either API returns the other system's id. **Any bridge must be
data ChainReact stores itself** — this is not derivable at runtime.

### 2.2 Motive's odometer is on ACTIONS, not TRIGGERS — verified

`odometer` (`number`) and `odometerUnit` appear in `MOTIVE_FUEL_PURCHASE_OUTPUTS`
([_sharedOutputs.ts:59-60](../../../integrations/motive/actions/_sharedOutputs.ts)), consumed by
`get`/`list`/`create`/`update` Fuel Purchase.

I grepped every Motive trigger meta for `odometer`: **zero hits.** The
`motive:new_fuel_purchase` `payloadShape`
([newFuelPurchase.meta.ts:32-49](../../../integrations/motive/triggers/newFuelPurchase/newFuelPurchase.meta.ts))
carries `vehicleId` and `vehicleNumber` but **no odometer and no VIN**.

**Consequence for the flagship workflow:** it cannot be two nodes. The realistic shape is four:

```
motive:new_fuel_purchase  (trigger → fuelPurchaseId, vehicleId, vehicleNumber)
  → motive:get_fuel_purchase   (action → odometer, odometerUnit)   ← the reading lives here
  → <resolve the Fleetio vehicle>                                  ← THIS SLICE
  → fleetio:create_meter_entry
```

`motive:get_fuel_purchase` already exposes a `found: boolean` output described as *"Branch on this
before using the other outputs"* ([getFuelPurchase.meta.ts:32-40](../../../integrations/motive/actions/getFuelPurchase.meta.ts))
— an existing V2 precedent for a lookup action that reports absence as data rather than an error.
Noted; §4.4 explains why this bridge should *not* copy it.

> **Unverified / flagged:** whether Motive's telematics API exposes a *live* odometer or engine-hours
> feed independent of fuel purchases. V2 ships no such action or trigger today. Confirming this is
> its own research task (see §10, Q4) and is out of scope here.

### 2.3 Account scoping is solved on the execution path, and has a gap on the resolver path

- **Actions:** `ActionHandlerInput.accountId` is the account that owns the workflow
  ([types.ts:40](../../../services/execution/handlers/types.ts)). Every Fleetio handler passes it to
  `runFleetioApiCall`, which calls `getActiveForExecution(accountId, "fleetio", …)`
  ([execute.ts:65-69](../../../integrations/fleetio/execute.ts)). Cross-account use is structurally
  impossible. **A new action gets correct account scope for free.**
- **Resolvers:** `OptionsResolverContext` is `{ userId, integration, q, deps, workflowCreator? }`
  ([types.ts:191-197](../../../services/options/types.ts)) — **there is no `accountId` field.** Account
  identity is reachable only via `ctx.integration.accountId` (present only when
  `requiresIntegration: true`) or `ctx.workflowCreator.accountId` (present only when the caller passed
  a `workflowId`, which is optional). Fleetio is `credentialSharing: "account"`
  ([credentialSharing.ts:76](../../../core/integrations/credentialSharing.ts)), so
  `resolveOptionsSource` resolves its integration from the *workflow's* account
  ([resolveOptionsSource.ts:200-206](../../../services/options/resolveOptionsSource.ts)).

  **This is a real architectural constraint.** A resolver that reads the mapping table needs an
  account id that does not come from an integration row. §4.3 addresses it.

### 2.4 Fleetio's list projection is narrower than the wire — and that is the suggestion blocker

V2's `FleetioVehicleSummary` ([api/vehicles.ts:38-44](../../../integrations/fleetio/api/vehicles.ts))
is deliberately five fields: `id`, `name`, `vehicle_status_name`, `vehicle_type_name`, `archived_at`.
No VIN, no plate. So a VIN-based suggestion engine cannot be built on the current projection.

**I checked whether that forces N× detail calls. It does not.** Fleetio's `VehicleSummary` schema
(OpenAPI 2025-05-05, line 34815) includes `license_plate`, `vin`, `year`, `make`, `model`, plus
`primary_meter_value` / `primary_meter_unit` / `secondary_meter_*`. The data is already on the
one-page list response V2 already fetches — V2 simply discards it.

So the suggestion engine needs a **bounded widening of an existing projection**, not new API traffic.
That is a small, safe change.

> **Unverified:** whether `GET /vehicles` *populates* `vin` / `license_plate` in practice for a real
> account (schema presence ≠ populated data; many fleets leave VIN blank). Resolve during live
> certification — see §10, Q1. The design must degrade gracefully when they are null, which §4.5 does.

### 2.5 Test mode blocks integration-backed actions

`testModeGate` blocks any action whose meta declares `requiresIntegration: true`, *including reads*,
because they consume rate limit and bleed real provider data into test runs
([testModeGate.ts](../../../services/execution/testModeGate.ts)). Actions with
`requiresIntegration: false` **and** `riskLevel: "low"` are allowed.

**Design implication:** a mapping-lookup action that reads only ChainReact's own table — no provider
call — can honestly declare `requiresIntegration: false` and therefore **works in test mode**. A user
can test the flagship workflow end-to-end up to the Fleetio write. That is a genuine product win and
it falls out of getting the layering right.

### 2.6 Table + repository patterns are established

[`20260722000000_account_machine_credentials.sql`](../../../supabase/migrations/20260722000000_account_machine_credentials.sql)
is the closest template: `account_id` FK cascade, `connected_by_user_id` as *provenance only*
(`ON DELETE SET NULL`), a partial unique index scoped to active rows, `set_updated_at` trigger,
`ENABLE ROW LEVEL SECURITY`, explicit GRANTs, and a membership-join SELECT policy that also checks
`accounts.deletion_status = 'active'`.

[`repositories/accountMcpTokens.ts`](../../../repositories/accountMcpTokens.ts) is the repository
template: service-role client, row→DTO projection functions, and a deliberate split between a
client-facing DTO and a service-only record.

The ownership rule is unambiguous: *"A single `account_id` foreign key is the only ownership column…
`user_id` survives only as `created_by_user_id` (provenance, not authority)"*
([account-ownership-model.md](../../../docs/rules/account-ownership-model.md)).

---

## 3. Product / model decision

**What this is:** an account-owned, explicitly-confirmed **link table** between a vehicle in a
telematics system and the same physical vehicle in Fleetio, plus a workflow step that reads it, plus a
management screen that creates it.

**What this deliberately is NOT:**

- **Not automatic matching.** Nothing is ever written to the table without a human clicking Confirm.
  Suggestions are *proposals with their evidence named*, never applied.
- **Not fuzzy matching at runtime.** The execution path does exact-key lookup only. No VIN comparison,
  no normalization, no similarity scoring ever happens during a run.
- **Not a vehicle registry.** ChainReact does not become the system of record for vehicles. It stores
  the *correspondence* and non-secret display snapshots — nothing else.
- **Not a sync engine.** No background job reconciles Motive and Fleetio inventories in slice 1.
- **Not a general entity-resolution framework.** The table is provider-neutral in *shape*, but only
  `resource_kind = 'vehicle'` and only `motive → fleetio` ship in the first batch.

**Ownership:** the **account** owns mappings, per the ownership rule. Two members of the same account
share one mapping set; a user who belongs to two accounts sees each account's mappings only when that
account is active. `created_by_user_id` / `confirmed_by_user_id` are provenance for the audit
requirement — never authority. Nothing follows a user who leaves.

---

## 4. Recommended approach

**Recommendation: build both — a provider-neutral link table *and* an explicit workflow action.**
They answer different questions and neither substitutes for the other. The table is the durable,
reusable asset ("stored once, reusable across workflows"); the action is how a run consumes it.

### 4.1 Data: one provider-neutral table

`public.account_resource_links` — provider-neutral in shape, vehicle-only in practice for v1.

```sql
CREATE TABLE public.account_resource_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sole ownership column (account-ownership rule).
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- 'vehicle' is the ONLY accepted value in v1 (CHECK constraint).
  -- Widening later is a forward-only migration, not a redesign.
  resource_kind text NOT NULL,

  -- The telematics side (the id that arrives on a trigger/action output).
  source_provider    text NOT NULL,          -- 'motive'
  source_external_id text NOT NULL,          -- stable Motive vehicle id
  -- The system-of-record side (what create_meter_entry needs).
  target_provider    text NOT NULL,          -- 'fleetio'
  target_external_id text NOT NULL,          -- stable Fleetio vehicle id

  -- Non-secret DISPLAY SNAPSHOTS, so the management screen and run errors can
  -- name a vehicle without a live provider call (works while disconnected).
  -- Explicitly labeled as snapshots in the UI; refreshed when live data loads.
  source_label text,
  target_label text,

  -- How this link came to exist. Never used at runtime — audit/UX only.
  match_basis text NOT NULL,   -- 'manual' | 'suggested_vin' | 'suggested_plate'
                               -- | 'suggested_number' | 'suggested_name'

  -- Audit (the requirement). Provenance only, never authority.
  created_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz NOT NULL,

  -- Soft lifecycle: links are archived, never hard-deleted, so a historical run
  -- can still be explained ("this link was removed on the 4th").
  archived_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Uniqueness — two partial indexes, both scoped to live rows:**

```sql
-- One live target per source vehicle, per target provider.
CREATE UNIQUE INDEX account_resource_links_source_unique
  ON public.account_resource_links
     (account_id, resource_kind, source_provider, source_external_id, target_provider)
  WHERE archived_at IS NULL;

-- ...and the reverse, so two Motive trucks cannot both claim one Fleetio vehicle.
CREATE UNIQUE INDEX account_resource_links_target_unique
  ON public.account_resource_links
     (account_id, resource_kind, source_provider, target_provider, target_external_id)
  WHERE archived_at IS NULL;
```

Both are scoped **per source provider**, which keeps the genuinely valid case legal: a fleet running
Motive *and* Samsara can link both to the same Fleetio vehicle. Slice 1 ships only Motive, but the
index shape does not need to change when Samsara arrives.

**Why one row per direction rather than a generic graph:** a link is a statement about two systems,
and both unique indexes are enforceable only when both sides are columns. A generic
`(entity_a, entity_b)` edge table would push uniqueness into application code.

### 4.2 Runtime: one narrow action

**`fleetio:find_linked_vehicle`** — display name **"Find Linked Fleetio Vehicle."**

| Field | Type | Required | Notes |
|---|---|---|---|
| `sourceProvider` | `select` | yes | Static options; **v1 ships exactly one: Motive.** Honest — no other telematics provider exists in V2. |
| `sourceVehicleId` | `text` | yes | The telematics vehicle id, normally mapped: `{{trigger.vehicleId}}`. Manual entry allowed. |

Output (bounded): `{ vehicleId, vehicleName, sourceVehicleId, linkedAt }` — `vehicleId` is the Fleetio
id, shaped to drop straight into `create_meter_entry`'s Vehicle field.

**It lives in the `fleetio` namespace, not `native`,** because it always answers *"which Fleetio
vehicle?"* The `sourceProvider` field qualifies the lookup key's namespace; it does not switch which
system is queried. That distinction matters for CLAUDE.md rule 1 — see §5 for the tension and why
this is not a dispatcher.

**Declares `requiresIntegration: false`** — it reads ChainReact's own table and calls no provider API.
Per §2.5 this makes the step test-mode-runnable, and it means an *expired Fleetio connection does not
break vehicle resolution* (it breaks the write, later, with a clear reconnect error).

**Behavior when no live link exists: throw a typed error and fail the run.** See §4.4.

### 4.3 Resolving account id in the option resolver — the §2.3 gap

The management UI needs pickers, and the builder may later want a "linked vehicles" picker. Both need
account scope that `OptionsResolverContext` does not carry.

**Recommendation: do not add a mapping-backed option resolver in slice 1.** The management screen is a
normal page — server component → service → repository — where the account comes from
`resolveActiveAccount` ([activeAccount.ts:105](../../../services/accounts/activeAccount.ts)), exactly
like `/apps` does. It reuses the two *existing* provider resolvers (`motive:vehicles`,
`fleetio:vehicles`) for its two pickers, and reads links through its own route. **No change to the
options contract is needed for the first batch.**

If a builder-side "pick a linked vehicle" picker is wanted later, the clean fix is to add
`accountId` to `OptionsResolverContext`, populated by `resolveOptionsSource` for **every** resolver
(not just integration-backed ones). That is a small, additive, provider-neutral improvement — but it
touches a shared contract every resolver depends on, so it deserves its own slice with its own
regression run. Deferred deliberately (§10, Q3).

### 4.4 Unmapped / archived / inaccessible — explicit lifecycle rules

| Situation | Runtime behavior | Rationale |
|---|---|---|
| **No link exists** | Throw typed `UNMAPPED_VEHICLE`. Message names the vehicle from the trigger's own data and points at the management screen: *"'Truck 104' isn't linked to a Fleetio vehicle yet. Link it in Apps → Vehicle Links."* | Silently skipping a meter entry lets PM scheduling drift with no signal. In a maintenance system, a loud failure is correct. |
| **Link archived** | Same `UNMAPPED_VEHICLE` path (archived rows are excluded by the `archived_at IS NULL` filter). Message notes it was previously linked and when. | The user removed it on purpose; re-linking is the fix. |
| **Fleetio vehicle archived in Fleetio** | The lookup **succeeds** (ChainReact does not check Fleetio here). `create_meter_entry` surfaces Fleetio's own 404/422. | Splitting the check would mean a provider call, which would forfeit §2.5's test-mode property and duplicate a check Fleetio already does authoritatively. The management screen *does* flag archived targets at review time (§4.6). |
| **Fleetio vehicle deleted in Fleetio** | Same — the write fails with Fleetio's typed not-found. The stale link is flagged in the management screen on next load. | |
| **Motive vehicle deleted** | Nothing fires for it, so the link is simply never used. Flagged as stale in the management screen. | |
| **Fleetio disconnected** | The *lookup* still succeeds (no provider call). The *write* fails with the existing reconnect-required error. | Correct failure attribution: the missing thing is the connection, not the mapping. |
| **Account frozen / membership lost** | Existing execution infrastructure handles it, unchanged. | Not this slice's concern. |

**No `found: boolean` output in v1.** `motive:get_fuel_purchase` uses that shape (§2.2), and it is
right *there* — a fuel purchase legitimately may not exist. Here, an unmapped truck is a **setup gap,
not a data condition**, and expressing it as branchable data invites workflows that quietly do nothing
for half the fleet. If real demand appears for "skip unmapped vehicles," add it later as an explicit,
required, Q11-compliant choice — never as a silent default. Recorded as §10, Q2.

### 4.5 Suggestions: evidence-ranked, never applied

Computed **only** in the management screen, **only** on explicit user request, **never** at runtime.

Given one live page of Motive vehicles (existing `vehicleList`, 100/page) and one of Fleetio vehicles
(existing `fleetioListVehicles`, 100/page, non-archived), propose candidates in strict tiers:

| Tier | Signal | Confidence | UI treatment |
|---|---|---|---|
| 1 | VIN equal after trim + uppercase | Exact | Eligible for **bulk confirm** — but only when the VIN matches exactly **one** vehicle on each side |
| 2 | Plate equal (Motive `licensePlateNumber` vs Fleetio `license_plate`, trim + uppercase + strip spaces/hyphens) | Strong | Per-row confirm only |
| 3 | Motive `number` equals Fleetio `name` (trim, case-insensitive) | Moderate | Per-row confirm only |
| 4 | `number` appears as a whole token inside `name` (e.g. "104" in "Truck 104") | Weak | Per-row confirm only, evidence shown verbatim |

Rules that make this honest:

- **Every proposal names its evidence** — "VIN 1FUJ… matches", "Plate TX ABC-1234 matches",
  "Unit 104 appears in 'Truck 104'". No opaque scores or percentages.
- **Any signal producing more than one candidate on either side is marked ambiguous** and can only be
  resolved by picking a specific vehicle. No auto-pick, no "best match", no tie-breaking heuristic.
- **Bulk confirm is limited to tier 1 with a unique match on both sides.** Everything else is one
  click per link. This satisfies "the user must confirm ambiguous matches" without making a 200-truck
  fleet click 200 times for the unambiguous ones.
- **Null-safe:** blank VIN/plate never matches blank. Fleets that leave VIN empty simply fall to tiers
  3–4 or manual pairing; nothing breaks.
- `match_basis` records which tier produced the link, for audit.

Implementation cost is one bounded projection widening (§2.4) plus a pure comparison function in
`core/` — which is exactly where the module-boundary rule wants it (no repository/service imports).

### 4.6 Management UX — no raw ids, no JSON

**Route:** `/apps/vehicle-links` (under the existing Apps area, which already owns connections; the
path generalizes if `resource_kind` widens). Server component → auth gate → `resolveActiveAccount` →
service reads, mirroring [`app/apps/page.tsx`](../../../app/apps/page.tsx).

Three states, one screen:

1. **Linked** — a table of confirmed links. Each row shows the *human* identity on both sides
   ("Unit 104 · Freightliner Cascadia" ↔ "Truck 104"), who confirmed it and when, and a Remove action.
   Raw provider ids appear only in a collapsed "Details" disclosure for support purposes — never as
   the primary identity, never required for any task.
2. **Suggested** — proposals from §4.5, each with its evidence, a Confirm and a Dismiss. Tier-1 rows
   offer "Confirm all exact VIN matches (N)".
3. **Unlinked** — Motive vehicles with no live link, each with a Fleetio vehicle picker
   (`fleetio:vehicles`, searchable) to pair manually.

Stale/health flags are computed at page load by diffing stored links against the live lists:
*target no longer visible in Fleetio* and *source no longer visible in Motive* render as inline
warnings with a Remove/Re-link affordance. Snapshots are labeled as last-seen names, so a renamed
vehicle never looks like corruption.

**Builder-side:** the user does not configure mappings in the builder at all. They drop in **Find
Linked Fleetio Vehicle**, map `sourceVehicleId` from the trigger, and wire its `vehicleId` output into
Create Meter Entry's existing Vehicle field. If nothing is linked yet, the run fails with a message
that names the screen. No JSON, no id typing, no new field type.

### 4.7 The flagship workflow, end to end

```
motive:new_fuel_purchase        → vehicleId, vehicleNumber, fuelPurchaseId
motive:get_fuel_purchase        → odometer, odometerUnit          {{trigger.fuelPurchaseId}}
fleetio:find_linked_vehicle     → vehicleId (Fleetio)             {{trigger.vehicleId}}
fleetio:create_meter_entry      vehicle  = {{find_linked.vehicleId}}
                                reading  = {{get_fuel.odometer}}
                                meter    = Primary
                                date     = {{trigger.occurredAt}}
```

Four nodes, no raw ids, no per-truck workflows. **One workflow covers the whole fleet.**

---

## 5. Alternatives considered

| Option | Security | Migration | Builder/UX | Execution consistency | Future providers | Verdict |
|---|---|---|---|---|---|---|
| **A. Link table + explicit action (recommended)** | Account-scoped table, RLS, no secrets | One new table | Explicit node; mapping managed on its own screen | Normal handler, normal readiness, test-mode-runnable | `source_provider` column already generalizes | **Accepted** |
| **B. Table only; `create_meter_entry` auto-translates a Motive id** | Same | Same | Fewest nodes | **Rejected:** hidden magic. The action would have to guess whether an incoming id is Motive's or Fleetio's, which is exactly the silent matching the requirements forbid. Also breaks bounded-action design and the FLEETIO-4 contract. | — | **Rejected** |
| **C. Action only; mapping stored in node config** | No new table | None | Per-workflow mapping — the problem restated | Violates "stored once, reusable across workflows" | Nothing to generalize | **Rejected** |
| **D. Option resolver only (`fleetio:linked_vehicles`)** | Needs the §2.3 `accountId` gap fixed | None | Design-time only — cannot resolve a vehicle that arrives at *runtime* from a trigger | Fails the core use case outright | — | **Rejected** |
| **E. Generic `native:resolve_link` for any provider pair** | Same | Same | One action forever | Genuine multi-purpose dispatcher — target provider becomes a router field, output shape becomes untyped | Maximal | **Rejected as overbuild** — reconsider only when a third pair exists |
| **F. Match live on VIN at runtime, no table** | No new table | None | Zero setup | **Rejected:** silent fuzzy matching, two extra provider calls per run, non-deterministic as fleets change, unusable when VIN is blank | — | **Rejected** |

**Rule-1 tension, stated plainly.** CLAUDE.md rule 1 forbids "generic `operation` router fields and
multi-purpose dispatchers." Option A's `sourceProvider` field is adjacent to that line. I judge it
acceptable because: the action always returns a Fleetio vehicle (one typed output shape, one code
path); `sourceProvider` selects which *key namespace* the lookup uses, not which system is called; and
the alternative is N×M actions (`resolve_fleetio_vehicle_from_motive`,
`…_from_samsara`, …) that would each be a copy of the same query. Option E is where the line actually
is, and it is rejected. If the reviewer disagrees, the fallback is a Motive-specific action name in
slice 1 with the provider column still in the table — a rename, not a redesign.

---

## 6. Security / data model

**Threat note.** The table holds **no secrets** — provider resource ids and display names only. The
risks are (a) cross-account leakage of fleet composition, (b) a mapping written by or for the wrong
account causing a meter reading to land on another company's vehicle, and (c) label snapshots leaking
into a surface where they do not belong.

**Recommended posture — mirrors `account_machine_credentials`:**

```sql
ALTER TABLE public.account_resource_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_resource_links TO service_role;

CREATE POLICY account_resource_links_select_account_member
  ON public.account_resource_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.account_memberships am
    JOIN public.accounts a ON a.id = am.account_id
    WHERE am.account_id = account_resource_links.account_id
      AND am.user_id = auth.uid()
      AND a.deletion_status = 'active'
  ));

CREATE TRIGGER account_resource_links_set_updated_at
  BEFORE UPDATE ON public.account_resource_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- **All access through one service-role repository.** One path, no drift. Because the table carries no
  secrets, an `authenticated` SELECT grant would also be defensible — I recommend *against* it purely
  to keep a single access path (§10, Q5).
- **The membership SELECT policy is defense-in-depth**, not the primary control; the repository is.
- **`account_id` is never taken from the client.** Writes derive it from `resolveActiveAccount`; the
  execution path derives it from `input.accountId`. A client-supplied account id is never authorization.
- **Both provider ids are validated as opaque, bounded strings** before storage — no id is ever
  interpolated into SQL (parameterized Supabase client only, per the DB rule).
- **Label snapshots are non-secret by construction** — vehicle names/numbers. The repository must
  never widen to carry provider tokens, and the DTO shape should make that structurally awkward.
- **Migration lint compliance:** the migration ships `ENABLE ROW LEVEL SECURITY` + ≥1 policy + explicit
  GRANTs in the same file, satisfying `npm run lint:migrations`.
- **Account deletion:** `ON DELETE CASCADE` on `account_id` removes links with the account. User
  deletion nulls the two audit columns without destroying the link (the account still owns it) — the
  exact posture the ownership rule requires.
- **No-leak tests are mandatory** (§8): account B cannot read, write, or archive account A's links via
  any route or repository call.

---

## 7. API / service / UI expectations

**New (described, not built):**

- `repositories/accountResourceLinks.ts` — service-role CRUD + row→DTO projection.
  `listLinks(accountId, kind)`, `findActiveLink(accountId, kind, sourceProvider, sourceExternalId, targetProvider)`,
  `createConfirmedLink(...)`, `archiveLink(accountId, id)`.
- `services/resourceLinks/` — the brain: suggestion computation, staleness diffing, membership-verified
  write orchestration.
- `core/resourceLinks/matchSignals.ts` — **pure** tier comparison (§4.5). Lives in `core/` with no
  repository/service imports, per the module-boundary rule.
- `app/api/resource-links/route.ts` (+ `[id]`) — list / create / archive. Auth gate →
  `resolveActiveAccount` → service. Thin.
- `app/apps/vehicle-links/page.tsx` + `features/apps/vehicleLinks/*` — the screen in §4.6.
- `integrations/fleetio/actions/findLinkedVehicle.{ts,schema,output,meta}.ts` + one registration each
  in the handler inventory and `services/discovery/providers/fleetio.ts`.

**Changed:**

- `integrations/fleetio/api/vehicles.ts` — widen `FleetioVehicleSummary` with `vin`, `license_plate`,
  `make`, `model`, `year` (§2.4). Bounded, still explicit, still never spread.
- The Fleetio catalog-count assertions in
  [`updateVehicleStatusMeta.test.ts`](../../../tests/unit/integrations/fleetio/updateVehicleStatusMeta.test.ts)
  and [`createMeterEntryMeta.test.ts`](../../../tests/unit/integrations/fleetio/createMeterEntryMeta.test.ts)
  move from three actions to four — updated honestly, as in FLEETIO-4.

**Explicitly unchanged:** the credential-paste contract, `runFleetioApiCall`, the two existing
resolvers, `create_meter_entry`'s schema/output/metadata, the options-source contract, and the
manifest (Fleetio stays `isExperimental: true`, `actions: true`, no triggers).

---

## 8. Tests required

**Data / security (highest priority)**
- Account A creates a link; A reads it; **B cannot read, update, or archive it** — through the route
  *and* directly through the repository with B's account id.
- Anon reads return nothing; the `authenticated` role has no direct write path.
- Both partial unique indexes reject a duplicate live link and **permit** re-linking after archival.
- `resource_kind` CHECK rejects an unknown kind.
- Account cascade delete removes links; user delete nulls audit columns and keeps the link.

**Matching (pure, `core/`)**
- Each tier matches only its own signal; VIN normalization is case/whitespace-insensitive.
- Blank VIN never matches blank; blank plate never matches blank.
- Multi-candidate on either side ⇒ marked ambiguous, never auto-resolved.
- Bulk-confirm eligibility is true **only** for tier 1 with exactly one candidate on each side.
- Pure function: no I/O, no clock, no randomness (structure test already guards `core/` purity).

**Action**
- Direct and mapped `sourceVehicleId` both resolve; mapped values resolve via the real `resolveStrict`
  before the handler (Q2).
- Returns the bounded output with exactly the approved keys; no raw row fields.
- Unmapped ⇒ typed `UNMAPPED_VEHICLE`; archived link ⇒ same path; **never** `{success:false}`,
  never a fabricated vehicle id.
- Account A's link is used; account B's identical `source_external_id` resolves to **B's** target, not
  A's — the cross-account test that matters most here.
- Declares `requiresIntegration: false` and is therefore **allowed by `testModeGate`** (assert against
  the real gate, not a copy of its rules).
- Zero provider HTTP calls (assert `fetch` never invoked).

**Metadata / readiness**
- Meta validates; registered exactly once; Fleetio now lists four actions; manifest still experimental
  with no triggers.
- Both fields required; `sourceProvider` has static options and no hidden default; gaps read
  "Telematics system" / "Vehicle".
- Mapped `{{…}}` satisfies readiness without a resolver load.

**Mock-boundary flagship walkthrough** (the deliverable that proves the arc)
1. Account A owns connected Motive + Fleetio integrations.
2. A Motive-shaped trigger payload supplies `vehicleId` and `fuelPurchaseId`.
3. A confirmed link row exists for A: Motive `motive-veh-88231` → Fleetio `42`.
4. The real `resolveStrict` resolves the mapped ids.
5. The real registry dispatches **Find Linked Fleetio Vehicle** → returns `vehicleId: "42"` with
   **no** HTTP call.
6. Its output maps into **Create Meter Entry**; the mocked Fleetio boundary receives exactly
   `{ vehicle_id: 42, value: <odometer>, date: <iso> }` — one write.
7. Account B, with an identical Motive vehicle id but a different link, resolves to **its own** Fleetio
   vehicle — proving isolation on the mapping itself, not just the credential.
8. With the link archived, the run fails before any Fleetio write.
9. No secret in run data, output, errors, or captured logs.

**Regression:** all existing Fleetio suites, the catalog-enumeration/blast-radius group used in
FLEETIO-3/4, variable-resolver, credential-paste, and `lint:migrations`.

---

## 9. Implementation slice breakdown

| Slice | Scope | Flag |
|---|---|---|
| **CS-1 — Data foundation** | Migration (table + 2 partial unique indexes + RLS + GRANTs + trigger), `repositories/accountResourceLinks.ts`, RLS/isolation/constraint tests. **No UI, no action, nothing user-visible.** | n/a — inert |
| **CS-2 — Matching core** | `core/resourceLinks/matchSignals.ts` (pure tiers), widen `FleetioVehicleSummary` (§2.4), unit tests incl. null-safety and ambiguity. Still no UI. | n/a — inert |
| **CS-3 — Runtime action** | `fleetio:find_linked_vehicle` (schema/output/meta/handler), both registrations, action + metadata + readiness + isolation + test-mode tests, catalog-count updates. **The workflow becomes buildable by hand once a link row exists.** | n/a |
| **CS-4 — Management screen** | `/apps/vehicle-links`, routes, service, the three states (§4.6) with manual pairing + per-row confirm. **First user-visible surface.** | `RESOURCE_LINKS_UI` default **OFF** |
| **CS-5 — Suggestions + health** | Suggested tab wired to CS-2, evidence display, tier-1 bulk confirm, stale-link flags. | same flag |
| **CS-6 — Flagship walkthrough + docs** | The §8 mock-boundary walkthrough, plan/config-design/pattern-audit updates, flag flip decision. | flip to ON after review |

CS-1→CS-3 ship nothing a user can see, so they can land and be verified without product risk. CS-4 is
the first slice needing the flag.

---

## 10. Risks / open questions

| # | Question | Recommendation |
|---|---|---|
| **Q1** | Do real Fleetio accounts populate `vin` / `license_plate` on `GET /vehicles`? (Schema has them — §2.4 — live behavior unverified.) | Verify at Fleetio live certification **before** CS-5. Tiers 3–4 and manual pairing already cover the blank-VIN fleet, so CS-5 degrades rather than fails. |
| **Q2** | Should the action offer "continue when unmapped" for branching? | **No in v1** (§4.4). Add later only as a required, explicit Q11 choice if real demand appears. |
| **Q3** | Add `accountId` to `OptionsResolverContext`? | Not in this arc. It is the right fix and it is additive, but it touches every resolver — own slice, own regression run (§4.3). |
| **Q4** | Is there a Motive live-odometer feed, so the flagship loses the fuel-purchase dependency? | Separate research task. Today's four-node shape (§4.7) works and is honest; do not block this arc on it. |
| **Q5** | Grant `authenticated` SELECT (no secrets) or service-role only? | **Service-role only** — one access path, no drift. Revisit only if a client component genuinely needs a direct read. |
| **Q6** | Should creating a link be owner/admin-gated like Fleetio connect/disconnect? | **No** — a mapping is day-to-day fleet ops, not credential management. Any member may confirm; every write is membership-verified server-side. Flag for owner input. |
| **Q7** | What if a fleet has two Fleetio accounts on one ChainReact account? | `target_external_id` is unique per account, not per Fleetio account. Multi-Fleetio-account support is already deferred provider-wide ([execute.ts:39-42](../../../integrations/fleetio/execute.ts)); when it lands, this table needs a `target_provider_account_id` column. **Note it now, do not build it.** |
| **Q8** | Stale label snapshots misleading a user? | Labeled as last-seen in the UI and refreshed whenever live lists load (§4.6). Accepted risk — the alternative is a screen that breaks when a provider is disconnected. |

**Principal risk:** scope creep from "mapping" into "fleet master data sync." The mitigation is the
§3 not-list plus CS-1/CS-2 shipping inert.

---

## 11. Acceptance criteria

**This planning slice:**
- [x] Doc exists at this path, grounded in files actually opened and cited.
- [x] Current state separated from recommendation; unverified items flagged with the step to resolve them.
- [x] Architecture decision made with alternatives scored.
- [x] No source, tests, migrations, or UI changed. Nothing pushed. No `db:push`.

**The implementation must later meet:**
- Mappings are account-owned, confirmed by a human, stored once, reusable across workflows.
- Cross-account isolation proven by test on the mapping itself, not inherited from credentials.
- No silent fuzzy matching anywhere; every suggestion names its evidence; ambiguity always requires a
  per-row human choice.
- Unmapped / archived / deleted / inaccessible each behave per §4.4, with messages that name the fix.
- Audit shows who created and who confirmed each link.
- No raw provider id or JSON is required from a user on any normal path.
- The §8 flagship walkthrough passes against a mocked provider boundary.
- Fleetio manifest honesty preserved: experimental, no triggers, capabilities unchanged.

---

## 11b. CS-1 outcome — Data foundation (SHIPPED, inert)

**Status:** implemented, **APPLIED, and DATABASE-VALIDATED** (2026-07-24). Migration
`20260729000000` is applied to the development Supabase project (`qcepijemjlkssfkvzlio`), and the
gated live-DB suite passes **15/15** against the real schema. Nothing user-visible changed — the
table remains inert (no route, no UI, no action reads it yet).

### Final table shape — `public.account_resource_links`

[`supabase/migrations/20260729000000_account_resource_links.sql`](../../../supabase/migrations/20260729000000_account_resource_links.sql).
Columns exactly as planned in §4.1: `id`, `account_id`, `resource_kind`, `source_provider`,
`source_external_id`, `target_provider`, `target_external_id`, `source_label`, `target_label`,
`match_basis`, `created_by_user_id`, `confirmed_by_user_id`, `confirmed_at`, `archived_at`,
`created_at`, `updated_at`. No column was added or dropped versus the plan.

### Final constraints

| Constraint | Behavior |
|---|---|
| `account_id` FK | `REFERENCES public.accounts(id) ON DELETE CASCADE` — sole ownership column |
| `created_by_user_id` / `confirmed_by_user_id` FKs | `REFERENCES auth.users(id) ON DELETE SET NULL` — provenance survives as `NULL`; the link stays with the account |
| `resource_kind` CHECK | `IN ('vehicle')` — v1 only |
| `match_basis` CHECK | `IN ('manual','suggested_vin','suggested_plate','suggested_number','suggested_name')` |
| provider ids | `btrim(x) <> '' AND length(x) <= 64` (both sides) |
| external ids | `btrim(x) <> '' AND length(x) <= 256` (both sides) |
| labels | nullable, `length(x) <= 256` |
| `confirmed_at` | `NOT NULL`, **no DEFAULT** — the writer must state when confirmation happened |
| `account_resource_links_distinct_sides` | `source_provider <> target_provider OR source_external_id <> target_external_id` — blocks a self-link while keeping two providers that coincidentally issue the same id string legal |

### Final indexes

- `account_resource_links_source_unique` — UNIQUE `(account_id, resource_kind, source_provider,
  source_external_id, target_provider) WHERE archived_at IS NULL`.
- `account_resource_links_target_unique` — UNIQUE `(account_id, resource_kind, source_provider,
  target_provider, target_external_id) WHERE archived_at IS NULL`.
- `account_resource_links_account_idx` — `(account_id, resource_kind, created_at DESC)` for listing.

Both unique indexes are keyed on `source_provider`, so `Motive A → Fleetio X` **and**
`Samsara B → Fleetio X` remain legal while two Motive vehicles claiming Fleetio X is blocked. Both are
partial, so archiving frees the pair for a replacement.

### RLS / GRANT posture — and what actually protects what

`ENABLE ROW LEVEL SECURITY`; `REVOKE ALL FROM anon` **and** `FROM authenticated` before any grant;
`GRANT SELECT, INSERT, UPDATE, DELETE TO service_role` only; one membership-gated, freeze-aware
`FOR SELECT` policy; the canonical `set_updated_at` trigger.

**The REVOKEs are not boilerplate.** This project carries
`ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated, service_role`, discovered by
post-apply verification in [`20260725000000`](../../../supabase/migrations/20260725000000_revoke_default_privileges_onboarding_and_machine_credentials.sql).
A new `public` table therefore arrives with FULL anon + authenticated privileges **regardless of its
own GRANT statements** — granting narrowly does not end up narrow. Without the two REVOKEs this table
would ship world-readable and world-writable through the Data API. A static test asserts both REVOKEs
exist *and* that they precede the GRANT.

**Service role bypasses RLS.** Being precise, because it is easy to state this wrongly:

- The repository uses the service-role client, so **the RLS policy does not constrain it at all**.
- What enforces tenant isolation on every repository call is the **mandatory `account_id` predicate**
  on every read and write. That is why `accountId` is the first parameter of every exported function
  and why no function can address a link by id alone. These predicates *are* the runtime tenant
  boundary, and the cross-account tests are what prove them.
- The RLS policy constrains **authenticated/anon direct Data API access**. Today that access is
  revoked outright, so the policy is defense-in-depth — it is what keeps the table safe if a future
  slice grants `authenticated` a direct SELECT.
- Writes have **no policy at all**. RLS denies any command with no matching policy, so even a future
  authenticated grant could not INSERT/UPDATE/DELETE.

### Repository API

[`repositories/resourceLinks/accountResourceLinks.ts`](../../../repositories/resourceLinks/accountResourceLinks.ts)
— four operations, all account-scoped:

- `listLinks(accountId, resourceKind)` — newest first, **including archived** rows (history).
- `findActiveLink(accountId, resourceKind, sourceProvider, sourceExternalId, targetProvider)` — the
  CS-3 runtime lookup; excludes archived rows; `null` when unmapped.
- `createConfirmedLink(input)` — validates the strict contract first, then inserts.
- `archiveLink(accountId, linkId, archivedAt)` — soft archive; `null` when no *active* link with that
  id exists **for that account** (which deliberately collapses "already archived" and "belongs to
  another account" into one uninformative answer).

**Folder note:** it lives in `repositories/resourceLinks/` rather than at the top level because
`repositories/` sat at exactly the 50-file leaf cap; a 51st top-level file trips
`npm run lint:structure`. CS-2+ resource-link repositories belong in the same folder. (`repositories/`
is back at exactly 50 — the next top-level repository file anyone adds will trip the cap again.)

Contracts: [`contracts/resourceLinks.ts`](../../../contracts/resourceLinks.ts) — kind/basis enums,
bounded provider-id and external-id schemas, the `ResourceLinkDTO`, and a `.strict()`
`CreateConfirmedResourceLinkInputSchema` whose `.refine` mirrors the `distinct_sides` CHECK.

### Tests run

| Suite | Result |
|---|---|
| [`tests/unit/migrations/accountResourceLinks.test.ts`](../../../tests/unit/migrations/accountResourceLinks.test.ts) (new, static SQL guards) | **28 passed** |
| [`tests/unit/repositories/accountResourceLinks.test.ts`](../../../tests/unit/repositories/accountResourceLinks.test.ts) (new) | **35 passed** |
| Consolidated focused run (+ service-role-import, core-purity, grant guards, node-credentials migration, integrations cross-account isolation) | **8 suites / 106 passed** |
| [`tests/integration/security/account-resource-links-rls.test.ts`](../../../tests/integration/security/account-resource-links-rls.test.ts) (new, gated) | **15 passed** against the live DB after the migration was applied (2026-07-24) |

**Live-DB validation (2026-07-24).** Migration applied via `npm run db:push`; the suite then proved
against the real schema: `authenticated` **and** `anon` are both denied `42501` (so the REVOKE took —
an empty result would have meant the grant survived and only RLS was filtering); user deletion nulls
provenance while the link survives; account deletion cascades links away; every CHECK rejects its bad
input (unknown kind/basis, blank ids, self-link); both partial unique indexes hold; archiving frees
the pair for a replacement on **both** the source and target sides; two accounts may hold identical
provider ids; a second source provider may target one Fleetio vehicle; and account B never resolves or
archives account A's link.

Three assertions failed on the first live run and were **test defects, not migration defects** — the
schema was correct in all three cases:
1. `signInWithPassword` is captcha-blocked on this project, so the authenticated-denial assertion
   never reached the security property. Fixed by adopting the existing shared
   [`tests/helpers/dbSessionClient.ts`](../../../tests/helpers/dbSessionClient.ts) helper (service-role
   email-link → `verifyOtp`; an ordinary authenticated session, not a captcha bypass).
2. The user-deletion test deleted a user who still owned their auto-created personal account, which
   `accounts.owner_user_id ON DELETE RESTRICT` silently refused. Fixed by removing that account first
   and asserting the deletion actually succeeded.
3. The cascade test issued a bare `DELETE FROM accounts`, which the RESTRICT children silently
   refused — so it was proving nothing. Fixed with a checked, purge-ordered delete helper.

The repository suite uses two harnesses: a *recording* client that proves every query carries its
`account_id` predicate, and a small *in-memory table that actually evaluates predicates*, so
cross-account isolation, archival exclusion, and re-link-after-archive are proven as **semantics**,
not merely as recorded filter calls.

**The gated DB suite gained a migration preflight.** `ALLOW_DB_INTEGRATION_TESTS` is a standing
developer setting, so the suite ran against a database lacking the table: every table-dependent test
failed for the wrong reason, the anon test **passed vacuously** ("anon sees nothing" is trivially true
when the table doesn't exist), and throwaway fixture users had already been created. `beforeAll` now
probes for the table **before** creating any fixture and fails fast with one precise message. Fixture
residue from that run was verified to be zero.

### Deferred limitation — provider-account discriminator (stated, not implied away)

The schema carries **no** `source_provider_account_id` / `target_provider_account_id`. It identifies a
target as *"Fleetio vehicle 42 for this ChainReact account"*, **not** *"Fleetio vehicle 42 in Fleetio
account 7211"*. If one ChainReact account ever connects two Fleetio accounts, the target-uniqueness
index cannot tell those two vehicle 42s apart. This is acceptable only because multiple provider
accounts per ChainReact account are already unsupported end-to-end (the Fleetio execution seam
resolves the account's single active row). **The discriminator columns must land in the same slice
that lifts that restriction.** Documented in the migration header and asserted by a test.

### What remains for CS-2

Unchanged from §9: `core/resourceLinks/matchSignals.ts` (pure evidence tiers) plus widening
`FleetioVehicleSummary` with `vin` / `license_plate` / `make` / `model` / `year` (§2.4). Still inert —
no UI, no action, no route. CS-1 added no service, no route, no option resolver, and no workflow
metadata, exactly as scoped.

---

## 11c. CS-2 outcome — Matching core (SHIPPED, inert)

**Status:** implemented. Still no UI, no route, no action, no resolver — nothing reads this module
in production yet. It exists so CS-5's Suggested tab has a pure, tested engine to call.

### Bounded projection widening

[`integrations/fleetio/api/vehicles.ts`](../../../integrations/fleetio/api/vehicles.ts) —
`FleetioVehicleSummary` gained five IDENTITY fields: `vin`, `license_plate`, `make`, `model`, `year`.
All five are present on the wire `VehicleSummary` in the 2025-05-05 OpenAPI schema (§2.4), so the
matcher reads data `GET /vehicles` **already returns** — no extra API call, no `GET /vehicles/{id}`
fan-out. Still an explicit key set, still never a spread. Deliberately NOT added: meter values,
counts, labels, group ancestry, `is_sample` — none has a consumer, and an option projection must not
become a data dump. The `fleetio:vehicles` OPTION shape is unchanged (value + label + status), so the
picker is byte-identical; all 26 Fleetio/resource-link suites (304 tests) pass unchanged.

### `core/resourceLinks/matchSignals.ts` — pure, and pure by structure test

`proposeVehicleMatches({ sources, targets, alreadyLinkedSourceIds?, alreadyLinkedTargetIds? })` →
`MatchProposal[]`, plus `bulkConfirmableProposals()`. No I/O, no clock, no randomness, no
repository/service imports (enforced by `tests/structure/core-purity.test.ts`).

| Tier | Signal | Confidence | `match_basis` |
|---|---|---|---|
| 1 `vin` | VIN equal after trim + uppercase | exact | `suggested_vin` |
| 2 `plate` | plate equal after trim + uppercase + stripping spaces/hyphens | strong | `suggested_plate` |
| 3 `number` | Motive `number` equals Fleetio `name`, case-insensitive | moderate | `suggested_number` |
| 4 `name` | `number` appears as a WHOLE TOKEN in `name` | weak | `suggested_name` |

Decisions worth recording:

- **One proposal per pair, at its strongest tier** — never four rows for one truck. A tier-3 exact
  match never also emits a tier-4 containment duplicate.
- **Tier 4 is whole-token, not substring.** Unit `10` does **not** match `"Truck 104"`. The needle is
  regex-escaped, so a unit number containing metacharacters (`10.4`) cannot alter the pattern.
- **Ambiguity is computed WITHIN a tier.** A rival at a different tier never flags a proposal. An
  ambiguous proposal is still returned (the user may know the answer) but is flagged so the UI
  requires a per-row choice — nothing is auto-resolved and there is no tie-break heuristic.
- **`bulkConfirmable` is true only for an unambiguous tier-1 match**, which is exactly the plan's
  "Confirm all exact VIN matches" affordance and nothing more.
- **Blank never matches blank** on any tier — null/empty/whitespace simply does not participate.
- **Exclusion happens before ambiguity**, so linking one of two rivals leaves the survivor clean
  (and, for VIN, bulk-confirmable) rather than permanently flagged.
- `TIER_MATCH_BASIS` is asserted against the migration's CHECK set, so tier↔column drift fails in
  unit tests rather than as a constraint violation on a user's first confirm.

**Tests:** [`tests/unit/core/resourceLinks/matchSignals.test.ts`](../../../tests/unit/core/resourceLinks/matchSignals.test.ts)
— **31 passed**, covering tier selection and ordering determinism, cross-provider plate
normalization, whole-token and regex-escape behavior, all six null-safety cases, ambiguity in both
directions and across tiers, bulk-confirm eligibility per tier, already-linked exclusion, input
immutability, empty inputs, and a 100×100 fleet page yielding 100 clean pairings rather than a cross
product.

### What remains for CS-3

Unchanged from §9: `fleetio:find_linked_vehicle` (schema/output/meta/handler), both registrations,
and the action/metadata/readiness/isolation/test-mode tests, plus the catalog-count update from three
Fleetio actions to four. CS-2 added no service, no route, no UI, no option resolver, and no workflow
metadata.

---

## 11d. CS-3 outcome — Runtime mapping action (SHIPPED)

**Status:** implemented. `fleetio:find_linked_vehicle` is registered, test-mode-runnable, and
covered by 54 new tests. The flagship workflow is now **buildable by hand** once a link row
exists — but there is still no way for a user to CREATE a link row (that is CS-4), so nothing
user-visible changed for a user who has never inserted one directly.

### Final action contract

| | |
|---|---|
| Key | `fleetio:find_linked_vehicle` |
| Display name | **Find Linked Fleetio Vehicle** |
| Category / order | `data`, `displayOrder: 40` (appended after Create Meter Entry — existing orders untouched) |
| `requiresIntegration` | **`false`** — reads ChainReact's own table, zero provider calls |
| `riskLevel` | `low`; `isDestructive: false`; `requiresConfirmation: false` |
| Option resolvers added | **none.** `OptionsResolverContext` unchanged (Q3 still deferred) |

Files: [`findLinkedVehicle.schema.ts`](../../../integrations/fleetio/actions/findLinkedVehicle.schema.ts) ·
[`.output.ts`](../../../integrations/fleetio/actions/findLinkedVehicle.output.ts) ·
[`.meta.ts`](../../../integrations/fleetio/actions/findLinkedVehicle.meta.ts) ·
[`findLinkedVehicle.ts`](../../../integrations/fleetio/actions/findLinkedVehicle.ts).
Registered exactly once in
[`_handlerInventory.ts`](../../../services/execution/handlers/_handlerInventory.ts) and
[`services/discovery/providers/fleetio.ts`](../../../services/discovery/providers/fleetio.ts).

**Input (`.strict()`), exactly as planned in §4.2 — two fields, no more:**

| Field | Label | Widget | Required | Notes |
|---|---|---|---|---|
| `sourceProvider` | Telematics system | static `select`, one option (Motive) | yes, **no `defaultValue`** | Qualifies the id NAMESPACE. Not a dispatcher: one code path, one output shape, always a Fleetio answer |
| `sourceVehicleId` | Vehicle | `text`, mappable | yes, **no `defaultValue`** | Placeholder is literally `{{trigger.vehicleId}}`; manual entry allowed |

`sourceVehicleId` accepts a string OR a number (the canonical resolver preserves an upstream
value's real type), rejects `NaN`/`±Infinity`, trims, and rejects blanks. Its length bound is
**reused from `ResourceLinkExternalIdSchema`** (≤256) rather than restated, so the action can
never be asked to look up an id the table could not have stored. `.strict()` makes an account
id, link id, Fleetio vehicle id, integration id, resource kind, or target provider a **parse
error** — not an ignored key.

### Exact lookup key

```
findActiveLink(
  input.accountId,        // the workflow's owning account — NEVER from config
  "vehicle",              // fixed by the action's identity
  config.sourceProvider,  // "motive"
  config.sourceVehicleId, // trimmed
  "fleetio",              // fixed by the action's identity
)                         // …and the repository adds `archived_at IS NULL`
```

That is precisely the tuple `account_resource_links_source_unique` enforces. Zero provider HTTP
calls: the handler imports no API wrapper and not `runFleetioApiCall`.

### Output contract

`{ vehicleId, vehicleName, sourceVehicleId, linkedAt }` — built explicitly from four approved
DTO keys; the DTO is **never spread**. `vehicleId` ← `target_external_id` (the Fleetio id, shaped
to drop into Create Meter Entry's Vehicle field); `vehicleName` ← the stored `target_label`
snapshot (nullable, never invented, never a live Fleetio read); `linkedAt` ← `confirmed_at`.

Deliberately absent, each asserted by test: the database row `id`, `accountId`, `matchBasis`,
`archivedAt` (always `null` here by construction), `createdAt`/`updatedAt`, both provenance user
ids, and the source/target provider echoes. **No `found: boolean`** — §4.4's decision stands.

### Unmapped and archived behavior

No active link ⇒ typed `UnmappedVehicleError` (`name: "UnmappedVehicleError"`,
`code: "UNMAPPED_VEHICLE"`), message:

> `Motive vehicle "<the id the caller supplied>" isn't linked to a Fleetio vehicle yet. Link it in Apps → Vehicle Links, then run this workflow again.`

An **archived** link takes the identical path — the repository's `archived_at IS NULL` predicate
excludes it, so a removed link reads exactly like one that never existed. A test asserts the two
messages are **byte-identical**. Never `{success:false}`, never a fabricated vehicle id.

The message names only values already inside the run's own authorized context: the telematics
system the user chose and the id their own trigger supplied. No label, target, or confirmer from
any other account can appear, because no other account's row is ever read.

**Honest limitation:** the engine classifies an unrecognized handler `name` as `HANDLER_FAILED`
(CLAUDE.md rule 8), and `humanizeActionError`'s generic branch deliberately does **not** echo raw
thrown messages (CR-FAILREASON-1 — they can carry provider text). So today the *specific* "link it
in Apps → Vehicle Links" wording lives on the thrown error and in server-side step diagnostics; it
is not yet the string a user reads in run history. Surfacing it there needs a first-class run
failure code + humanizer branch, which belongs with CS-4 (when the screen it points at actually
exists). Recorded here rather than implied away.

### Test-mode behavior — verified against the real gate

`decideTestModeBlock("fleetio", "find_linked_vehicle")` returns `{ blocked: false }` — asserted
against the **real** `testModeGate`, not a restatement of its rules. The same test asserts the
other three Fleetio actions stay `TEST_MODE_EXTERNAL_ACTION_BLOCKED`. This is the §2.5 property
paying off: a user can test the flagship workflow end to end up to the Fleetio write, and a
disconnected Fleetio does not break vehicle resolution (only the later write fails, with the
existing reconnect error — correct failure attribution).

### Account-isolation evidence

The repository boundary is mocked as a **small in-memory table that actually evaluates the
account / kind / provider / external-id / archived predicates**, so isolation is proven as
semantics rather than as recorded filter calls (the CS-1 posture). With account A and account B
both holding the SAME Motive id `motive-veh-88231` mapped to different Fleetio vehicles:

- A resolves `42` / "Truck 104"; B resolves `907` / "B-Fleet Rig 7".
- Neither result contains the other's target id, label, confirmer id, or account id.
- A asking for an id **only B has mapped** produces a failure that is *identical* to asking for an
  id nobody has mapped — same class, same code, same message modulo the id the caller itself
  supplied. Existence of B's row is not inferable.
- A config-supplied `accountId` is a **parse error**, and the repository is never reached.
- An account with no links at all gets the same unmapped error — no cross-account fallback.

### Tests run (focused — full `npm test` intentionally NOT run, per owner instruction)

| Suite | Result |
|---|---|
| [`tests/unit/integrations/fleetio/actions/findLinkedVehicle.test.ts`](../../../tests/unit/integrations/fleetio/actions/findLinkedVehicle.test.ts) (new) + [`findLinkedVehicleMeta.test.ts`](../../../tests/unit/integrations/fleetio/findLinkedVehicleMeta.test.ts) (new) | **54 passed** |
| All Fleetio + resource-link + matching + discovery-coverage suites (`tests/unit/integrations/fleetio`, `accountResourceLinks` repo + migration, `core/resourceLinks`, `discovery-meta-coverage`) | **26 suites / 353 passed** |
| `testModeGate`, handler-registry, `option-source-reference-integrity`, `core-purity`, `no-service-role-imports`, `connectionless-provider-source-of-truth`, `connectionlessProviders` | **8 suites / 95 passed** |
| Credential-paste + manifest + variable-reference group (`credential-ingest-route`, `dispatcher-credential-paste`, fleetio `credentials`/`auth`, `integration-manifests`, 5 `core/workflows` variable suites) | **10 suites / 100 passed** |
| `resolveValue` + engine | **2 suites / 170 passed** |
| `npm run typecheck` · `npm run lint` · `npm run lint:structure` · `npm run lint:migrations` | clean (lint: 0 errors, 22 pre-existing max-lines warnings) |
| Direct `npx eslint` on all 12 touched files | clean |

**Three structure suites were already RED at HEAD `c1288d0b5` and remain red, unchanged:**
`field-sensitivity-coverage` (3 Linear `relatedTo` fields), `sensitive-output-coverage`
(`linear:add_comment::body`), `resource-field-discovery-coverage` (6 Linear id fields). Verified
by re-running them on a stashed tree. CS-3 added **no** new violation to any of them —
`fleetio:find_linked_vehicle.sourceVehicleId` was momentarily a 7th offender in the last one and
now carries a documented **UPSTREAM** exemption: the id arrives at runtime from the trigger, and a
`motive:vehicles` combobox was considered and rejected because it would make a
`requiresIntegration: false` Fleetio node depend on a connected *Motive* integration to configure.

Catalog counts moved honestly from three actions to four in both
[`createMeterEntryMeta.test.ts`](../../../tests/unit/integrations/fleetio/createMeterEntryMeta.test.ts)
and [`updateVehicleStatusMeta.test.ts`](../../../tests/unit/integrations/fleetio/updateVehicleStatusMeta.test.ts).
A new assertion pins that `find_linked_vehicle` is the **only** Fleetio action with
`requiresIntegration: false`.

### Focused walkthrough (not the CS-6 flagship)

One test proves the realistic chain without a provider boundary: a Motive-shaped trigger emits
`vehicleId` → the **real** `resolveStrict` resolves `{{trigger.vehicleId}}` → the **real** handler
registry dispatches `fleetio:find_linked_vehicle` → account A's Fleetio id `42` comes back with
zero `fetch` calls → the output maps into `fleetio:create_meter_entry`'s Vehicle field and passes
that action's **real** strict schema → account B's identical Motive id resolves to `907` →
archiving the link throws before Create Meter Entry's config can even be resolved → no secret or
cross-account value appears in any output. The full multi-node execution walkthrough (real engine,
mocked Fleetio HTTP, one write) remains **CS-6**.

### What remains for CS-4

Unchanged from §9: `/apps/vehicle-links`, its routes and service, and the three states of §4.6
(Linked · Suggested · Unlinked) with manual pairing and per-row confirm, behind
`RESOURCE_LINKS_UI` default **OFF**. **CS-4 is the slice that makes CS-3 usable** — until a user
can create a link, `find_linked_vehicle` will throw `UNMAPPED_VEHICLE` for every vehicle. CS-4
should also decide whether `UNMAPPED_VEHICLE` earns a first-class run-failure code + humanizer
branch (see the honest limitation above), since that is when the screen it names exists.
Owner input on **Q6** (member vs owner/admin write gating) is still outstanding and shapes the
route guard.

CS-3 added no service, no route, no UI, no option resolver, no migration, and no change to
`OptionsResolverContext`.

---

## 11e. CS-4 outcome — Vehicle Links management screen (SHIPPED, flag-gated OFF)

**Status:** implemented behind `ENABLE_RESOURCE_LINKS_UI`, **default OFF**. This is the
first user-visible surface of the arc and the slice that makes CS-3 usable: before it, a link
row could only be inserted by hand into the database.

### Feature flag

[`services/resourceLinks/flags.ts`](../../../services/resourceLinks/flags.ts) —
`RESOURCE_LINKS_UI_FLAG = "ENABLE_RESOURCE_LINKS_UI"` (the plan named the flag
`RESOURCE_LINKS_UI`; the env var follows CLAUDE.md's `ENABLE_<NAME>` convention). Read at
CALL time, so tests and rollout toggle without re-importing. Only the exact string `"true"`
enables it — `"1"`, `"TRUE"`, `"yes"` all stay OFF, asserted by test.

While OFF: the page `notFound()`s and all three routes 404 **before** the auth/role gate, so
a disabled surface cannot be used to probe membership or link existence. The `/apps` entry
link is not rendered, so nothing points at a 404.

**What the flag deliberately does NOT gate: CS-3's runtime lookup.** `fleetio:find_linked_vehicle`
keeps resolving any link row that already exists, flag or no flag. Turning the management
surface off must never break a workflow that is already running.

### Permission decision (plan Q6, answered)

| | Owner | Admin | Member | Non-member |
|---|---|---|---|---|
| View links | ✅ | ✅ | ✅ | ❌ 403 |
| Use links in a workflow (CS-3) | ✅ | ✅ | ✅ | — |
| Create / replace / archive | ✅ | ✅ | ❌ 403 `FORBIDDEN` | ❌ 403 `NOT_ACCOUNT_MEMBER` |

**Mutations are owner/admin.** A vehicle mapping changes where a meter reading LANDS, so it
belongs with the administrative acts (API keys, connect/disconnect) rather than with everyday
workflow editing. Q6 floated "any member may confirm"; CS-4 answers no *for now* — a narrower
gate widens later without breaking anyone, the reverse does not.

Authorization is **membership role + `account_id`, always**. It never consults
`created_by_user_id`, `confirmed_by_user_id`, or who connected the Motive/Fleetio integration —
asserted by a test in which one admin archives another owner's link. Mutations also refuse on a
frozen (`pending_deletion`) account while reads keep working.

### Route / service / repository boundaries

```
route  (thin: flag → auth → account role → HTTP mapping only)
  → service  (authorization re-check, freeze, conflicts, labels, row→view projection)
    → repository  (CS-1, database-only, mandatory account_id predicate)
```

| Route | Verb | Gate |
|---|---|---|
| [`/api/accounts/[id]/vehicle-links`](../../../app/api/accounts/[id]/vehicle-links/route.ts) | GET | any member |
| | POST | owner/admin |
| [`/api/accounts/[id]/vehicle-links/[linkId]`](../../../app/api/accounts/[id]/vehicle-links/[linkId]/route.ts) | DELETE | owner/admin |
| [`/api/accounts/[id]/vehicle-options`](../../../app/api/accounts/[id]/vehicle-options/route.ts) | GET | any member |

`accountId` comes from the PATH and is authorized against the verified session by
`requireAccountRole`; it is never ownership on its own, and the repository's `account_id`
predicate sits underneath. A caller-supplied `accountId` in the POST **body** is a `.strict()`
parse error (400), never a silently-honored field — asserted.

The service ([`vehicleLinkService.ts`](../../../services/resourceLinks/vehicleLinkService.ts))
re-checks the role itself, so it is safe regardless of caller. The route maps the failure to
HTTP; the service decides it.

**Vehicle options** ([`vehicleOptions.ts`](../../../services/resourceLinks/vehicleOptions.ts))
resolve the ACTIVE account's integration and dispatch the EXISTING, unmodified
`motive:vehicles` / `fleetio:vehicles` resolvers. This is why the screen does not use
`/api/options/[source]`: that endpoint's credential decision is workflow-keyed and, with no
`workflowId`, falls back to the caller's PERSONAL account. **No resolver was added or changed
and `OptionsResolverContext` is untouched** — plan Q3 stays deferred. `provider` is validated
against a two-value allow-list, so the route is not a generic resolver proxy.

### Manual pairing flow

1. **Linked** — one row per active mapping, leading with the HUMAN identity
   ("Unit 104 ↔ Truck 104"), plus match basis, who confirmed it, and the date. Raw provider ids
   live ONLY inside a collapsed `Details` disclosure. A note states the names are last-seen
   snapshots, so a rename never reads as corruption. Remove asks inline, then archives.
2. **Unlinked** — every Motive vehicle with no active link (a server-side set difference).
   Opening a row reveals the searchable `fleetio:vehicles` picker; picking a vehicle and
   pressing **Link** confirms it. **No id is ever typed and no JSON is ever edited** — both
   sides come from real account-aware lists, and both labels are captured as snapshots.
3. **Suggested** — a disabled **"Coming next"** note. No candidate rows, no counts, no
   evidence: CS-4 ships no matching, and a placeholder that looked like real suggestions would
   be fake UI. CS-2's engine exists but nothing calls it until CS-5.

`matchBasis` is always `manual` in CS-4 (the body schema has no `matchBasis` field, so a
`suggested_*` basis is unreachable until CS-5 ships the surface that earns it).

**Conflicts — two kinds, deliberately different:**

- **Source conflict** (this Motive vehicle is already linked): 409 `SOURCE_ALREADY_LINKED`,
  naming the current target. The plain "Link" button is REPLACED by an explicit
  **"Replace link"**, which is the only thing that sends `replaceExisting: true`. Nothing is
  ever silently overwritten; a replacement archives the old row first (history survives) and
  then inserts.
- **Target conflict** (this Fleetio vehicle is claimed by a DIFFERENT Motive vehicle): 409
  `TARGET_ALREADY_LINKED`, naming the other side. Refused outright — `replaceExisting` does
  NOT override it, because auto-archiving someone else's mapping would move a second truck's
  readings without being asked. Both names belong to the same account, so neither can cross a
  tenant boundary.
- Re-confirming the SAME pair is idempotent success, not an error.
- A unique-index RACE (two admins at once) surfaces as `LINK_CONFLICT` with reload guidance —
  never a raw Postgres string.

Archiving is soft, so the pair is immediately free and the vehicle returns to Unlinked;
re-linking after archival is asserted end to end.

### User-facing unmapped error (first class)

`UNMAPPED_VEHICLE` is now a real `RunFailureCode`. The chain:

```
handler throws UnmappedVehicleError (CS-3)
  → classifyHandlerError(err.name) → "UNMAPPED_VEHICLE"
    → humanizeActionError → the persisted classification
```

Users see: **"Vehicle isn't linked yet"** —
> This Motive vehicle is not linked to Fleetio yet. Link it in Apps → Vehicle Links, then run
> the workflow again.

- The typed code is preserved end to end.
- **Copy is code-derived and identifier-free.** The thrown message names the vehicle id; it is
  never echoed, because the classification is persisted on the run row and fans out to
  notifications.
- **Archived and never-linked are indistinguishable** — same code, same copy. The user's next
  step is the same, and distinguishing them would reveal that a mapping once existed.
- **No `action`, therefore no CTA.** `/apps/vehicle-links` is behind a default-OFF flag; a CTA
  linking to a 404 would be worse than none, and the taxonomy rule is "never a misleading
  action". The description names the destination in words. Adding a `link_vehicles` action is
  a clean follow-up **once the flag flips**. Instead, the `/apps` page renders a link to the
  screen — but ONLY when the flag is on — so the instruction is followable exactly when it is
  true.

**Refactor note:** the engine's handler-error ternary chain moved verbatim into
[`services/execution/classifyHandlerError.ts`](../../../services/execution/classifyHandlerError.ts).
Pure extraction, no behavior change — `engine.ts` sat exactly at its 640-line ESLint budget and
the new branch would have tipped it over. The engine test now throws the REAL
`UnmappedVehicleError` class rather than a hand-set name, so renaming it fails a test instead
of silently degrading run history.

### Account-isolation evidence

- Account A's list never contains B's links; the same Motive id may be linked in BOTH accounts
  to different targets.
- B's owner naming A's account → 403 `NOT_ACCOUNT_MEMBER`; naming their OWN account with A's
  link id → 404. **A cross-account link id is byte-identical to one that never existed** —
  asserted by comparing the two responses.
- An unknown link id, an already-archived link, and another account's link all return the SAME
  404.
- A's target-conflict check never consults B's links (B claiming Fleetio 42 does not block A
  from claiming its own Fleetio 42).
- The wire view carries no `accountId`, no raw user id, no `matchBasis`-adjacent row internals,
  and no credential — the confirmer appears as ONE resolved co-member display label (from the
  membership SECURITY DEFINER RPC, which gates on `auth.uid()`).

### Tests run (focused — full `npm test` intentionally NOT run, per owner instruction)

| Suite | Result |
|---|---|
| [`vehicleLinkService.test.ts`](../../../tests/unit/services/resourceLinks/vehicleLinkService.test.ts) (new) — permissions, manual pairing, conflicts, archive/re-link, isolation | 29 passed |
| [`vehicle-links.route.test.ts`](../../../tests/unit/app/api/accounts/vehicle-links.route.test.ts) (new) — all four route verbs, flag gating, authz, conflict→HTTP, no-leak | 25 passed |
| [`VehicleLinksDashboard.test.tsx`](../../../tests/unit/features/apps/vehicleLinks/VehicleLinksDashboard.test.tsx) (new) — UI states, pairing, replace-confirmation, member view, honest Suggested | 17 passed |
| [`vehicleLinksPage.test.tsx`](../../../tests/unit/app/apps/vehicleLinksPage.test.tsx) (new) — flag OFF/ON, auth, membership, server-derived props | 10 passed |
| [`vehicleOptions.test.ts`](../../../tests/unit/services/resourceLinks/vehicleOptions.test.ts) (new) — account scoping, disconnected vs error, no-leak | 9 passed |
| [`unmappedVehicleError.test.ts`](../../../tests/unit/core/errors/unmappedVehicleError.test.ts) (new) — the whole classification chain | 8 passed |
| Consolidated focused run (all of the above + CS-1 repo/migration, CS-2 matching, CS-3 action/meta, all Fleetio + Motive resolver suites, engine, testModeGate, runPersistence, error humanization/CTA, workflow-error-classification contract, credential-paste, `api-route-authorization`, `no-service-role-imports`, `discovery-meta-coverage`) | **44 suites / 704 passed** |
| `npm run lint` · `lint:structure` · `lint:migrations` | clean (lint: 0 errors) |
| Direct `npx eslint` on all 24 touched files | clean |

**`npm run typecheck`:** CS-4's own files are clean. Three errors remain in the tree, all in a
CONCURRENT session's uncommitted account-deletion / purge / billing test files
(`mock.invocationCallOrder[0]` typed `number | undefined`). None reference this arc; none were
touched here, and per the batch's "preserve concurrent work" rule they were left alone.
Likewise `tests/unit/services/execution/staleWorkflowRunSweep.test.ts` fails at HEAD
`1034374c6` for a pre-existing reason (an `EXECUTION_INTERRUPTED` CTA-action assertion) —
verified unchanged by this slice.

**No migration was created.** CS-4 needed none: the CS-1 table already carries every column,
constraint, and index this screen uses, and the service composes its conflict checks from the
existing `listLinks` / `createConfirmedLink` / `archiveLink` operations. `db:push` was not run.

### What remains for CS-5

Unchanged from §9: wire the Suggested tab to CS-2's `proposeVehicleMatches` — evidence display
per tier, tier-1 bulk confirm ("Confirm all exact VIN matches"), Dismiss, and stale-link health
flags (target no longer visible in Fleetio / source no longer visible in Motive), all behind
the same flag. CS-5 will also start writing the `suggested_*` match bases, which CS-4
deliberately cannot produce. Plan **Q1** (do real Fleetio accounts populate `vin` /
`license_plate`?) must be resolved at live certification **before** CS-5's tier-1 bulk confirm
is trusted. Once the flag flips (CS-6), add the `link_vehicles` CTA action so the unmapped-run
error links straight to the screen.

CS-4 added no migration, no option resolver, no change to `OptionsResolverContext`, and no
change to CS-3's action, its schema, its output, or the Fleetio manifest.

---

## 12. Hard boundaries — what this slice did NOT change

*(Scope statement for the PLANNING slice, kept as written at the time.)* No source file, test,
migration, schema, contract, registry, or UI was modified. No commit other than this document.
Nothing pushed, nothing deployed, `db:push` not run, the Fleetio credential migration
`20260727000000` still unapplied. Fleetio still ships exactly three actions
(`get_vehicle`, `update_vehicle_status`, `create_meter_entry`) and remains `isExperimental: true`.
The concurrent destructive-preview/document work was not touched.

**Superseded on 2026-07-24 (migration-application batch):** `db:push` HAS since been run against the
development Supabase project, applying `20260727000000` (Fleetio credential storage),
`20260728000000` (concurrent AI-provider CHECK widening), and `20260729000000` (this arc's table).
Both migrations named in §11b/§11c are now applied and database-validated. Still true and unchanged:
nothing pushed to the remote branch, nothing deployed, and Fleetio still ships exactly three actions
as `isExperimental: true`.

**Superseded again by CS-3 (§11d):** Fleetio now ships **four** actions — `find_linked_vehicle`
joined `get_vehicle`, `update_vehicle_status` and `create_meter_entry`. It remains
`isExperimental: true`, `actions: true`, no webhook triggers, no polling triggers, and its
credential-paste contract is untouched. CS-3 added no migration, so the applied-migration list
above is unchanged. Nothing pushed, nothing deployed.

---

## 13. Recommended next step

**CS-1 — Data foundation.** It is the true dependency for everything else, it is entirely inert (no
user-visible surface, no feature flag needed), and it front-loads the part with real security
consequence — the table, its two unique indexes, RLS/GRANTs, and the cross-account isolation tests.
Landing it alone keeps the security review small and focused.

Before CS-1, get owner input on **Q6** (member vs owner/admin write gating), since it shapes the route
guard, and note **Q7** so the column set is reviewed once with multi-Fleetio-account support in mind.
