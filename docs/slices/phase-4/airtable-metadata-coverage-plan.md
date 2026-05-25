# Airtable — Builder Metadata Coverage Plan (AIRTABLE-META-1)

**Slice:** 4.AIRTABLE-META-1 (this plan) → AIRTABLE-META-2 (resolvers) → AIRTABLE-META-3 (metas + COVERED flip)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Sibling precedent:** [`excel-metadata-coverage-plan.md`](./excel-metadata-coverage-plan.md) (the closest analog — resolver-first, opaque root id, combined metas+trigger+flip in META-3).
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Airtable is the **3rd** of the (now) 7 pending-metadata providers (after Shopify + Excel). **Current state (code-verified):** **11 runtime actions + 1 webhook trigger** registered and real; **0 ActionMeta, 0 TriggerMeta**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Airtable renders as **"coming soon"**.

**Two facts drive the whole slice plan:**

1. **`baseId` is an opaque id** (`appXXXXXXXXXXXXXX`) a human cannot reasonably hand-type → Airtable is **resolvers-first** (like Excel, unlike Shopify). A `bases` picker (and `tables` cascade) is required for a usable builder, not optional polish. **No `basesList` API helper exists yet** — one must be added.
2. **The field-level cascade (`base → table → field`) needs two parents.** A `fields` / `views` / `attachment_fields` resolver needs **two** deps (`baseId` + `tableIdOrName`). This was originally a builder blocker (the cascade was single-parent only). **RESOLVED by Slice 4.BUILDER-OPTIONS-1** (shipped 2026-05-25 — [`builder-options-multi-parent-dependencies.md`](./builder-options-multi-parent-dependencies.md)): `FieldMeta.dependsOn` now accepts `string[]` and the Builder collects + gates on all parents. So field-level pickers are **now shippable in AIRTABLE-META-2** (no longer deferred). See §3.

---

## 1. Current Airtable runtime inventory

**Manifest** ([`integrations/airtable/manifest.ts`](../../../integrations/airtable/manifest.ts)): id `airtable`, displayName "Airtable". OAuth v2 + PKCE, **refreshable with rotated refresh tokens** (`tokenScope: "user"`, `accountIdField: "userId"`, `apiVersion: "v0"`, `refreshable: true`, `healthCheckIntervalMs: 12h`). Scopes: `data.records:read`, `data.records:write`, `schema.bases:read`, `webhook:manage`. Capabilities `oauth/webhookTrigger/actions: true`, `pollingTrigger: false`. _(A manifest comment still says "8 action handlers" — **stale**; 11 are registered. Out of scope here; the capability flag `actions:true` is correct.)_

**API helpers** ([`integrations/airtable/api/`](../../../integrations/airtable/api/)): `_request` (shared `airtableRequest` — 401→`Unauthorized401Error`, 404→`NotFoundError`), `bases` (`basesGetSchema` → `GET /v0/meta/bases/{baseId}/tables`), `tables` (`tablesGet` — fetches base schema, filters one table client-side), `records` (CRUD + batch). Shared: [`_shared/airtable/fields.ts`](../../../integrations/_shared/airtable/fields.ts) (typed field polymorphism), `_shared/airtable/api/webhooks.ts`, `_shared/airtable/webhooks/signature.ts`. **No `basesList` ("list all bases") helper exists** — needed for the `bases` resolver (§3).

**The typed-field-map shape** (load-bearing for builder metadata): `create_record` / `update_record` / the two batch actions take `fields: z.record(z.string(), TypedFieldInputSchema)` — a map keyed by **field name** whose values are a 15-arm discriminated union (`{type, value}`) over the supported Airtable field types (`singleLineText, longText, number, currency, percent, singleSelect, multipleSelects, checkbox, date, dateTime, email, url, phoneNumber, multipleRecordLinks, attachment`; 17 other types are deferred and fail Zod). **There is no `FieldType` in [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) that renders a typed-field-map** (`keyvalue` is `Record<string,string>` only — it cannot carry typed numbers/booleans/arrays/attachment objects). → these fields map to **`textarea` paste-JSON** (the Notion `properties` / Stripe `lineItems` bridge). See §2.

### 1.1 Registered action handlers (11)

Source of truth: [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) lines 591–609. `*` = required at the schema layer. "Picker" = field that wants an options resolver.

| # | Action key | File | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `list_records` | listRecords.ts | baseId*, tableIdOrName*, filterByFormula?, pageSize?(1..100), maxRecords?, offset?, fields?(string[]), view?, sort?([{field,direction?}]) | `{records:[{id,fields,createdTime}], offset, count}` | read → **low** | `records[].fields` (cell content) | base, table, (fields, view) |
| 2 | `get_record` | getRecord.ts | baseId*, tableIdOrName*, recordId* | `{id, fields, createdTime}` | read → **low** | `fields` | base, table |
| 3 | `find_record` | findRecord.ts | baseId*, tableIdOrName*, filterByFormula* | `{found:bool, record:{id,fields,createdTime}\|null}` | read → **low** | `record.fields` | base, table |
| 4 | `create_record` | createRecord.ts | baseId*, tableIdOrName*, **fields*** (typed map), typecast* | `{id, fields, createdTime}` | create → **medium** | `fields` (echo of written cells) | base, table, (fields) |
| 5 | `update_record` | updateRecord.ts | baseId*, tableIdOrName*, recordId*, **fields*** (typed map), typecast* | `{id, fields, createdTime}` | update → **medium** | `fields` | base, table, (fields) |
| 6 | `delete_record` | deleteRecord.ts | baseId*, tableIdOrName*, recordId* | `{id, deleted:true}` | **destructive → high** | — | base, table |
| 7 | `get_base_schema` | getBaseSchema.ts | baseId*, includeViews* (bool) | `{baseId, tables:[{id,name,primaryFieldId,fields,views?}], tableCount, totalFieldCount}` | read → **low** | — (schema metadata, NOT record content) | base |
| 8 | `get_table_schema` | getTableSchema.ts | baseId*, tableIdOrName*, includeViews* (bool) | `{baseId, table:{id,name,primaryFieldId,fields,views?}, fieldCount}` | read → **low** | — (schema metadata) | base, table |
| 9 | `add_attachment` | addAttachment.ts | baseId*, tableIdOrName*, recordId*, fieldName*, **file*** (FileRef), filename? | `{baseId, tableIdOrName, recordId, fieldName, attachmentCount, attachments:ParsedAttachment[]}` | create/write → **medium** | `attachments` (Airtable file URLs) | base, table, (attachment field) — **consumesFileRef** |
| 10 | `create_multiple_records` | createMultipleRecords.ts | baseId*, tableIdOrName*, **records*** (1..10 of `{fields}`), typecast* | `{baseId, tableIdOrName, createdCount, records:[{id,fields,createdTime}]}` | create → **medium** | `records[].fields` | base, table, (fields) |
| 11 | `update_multiple_records` | updateMultipleRecords.ts | baseId*, tableIdOrName*, **records*** (1..10 of `{recordId,fields}`), typecast* | `{baseId, tableIdOrName, updatedCount, records:[{id,fields,createdTime}]}` | update → **medium** | `records[].fields` | base, table, (fields) |

**Discrepancy vs the META-1 brief's hypothetical list:** there is **no** `batch_delete_records` action, and "batch create/update" exist as `create_multiple_records` / `update_multiple_records` (not `batch_*_records`). `get_record` AND `find_record` both exist (find returns `{found:false}` instead of throwing). `get_base_schema` + `get_table_schema` are the "schema/metadata" actions. **Verified against code — the brief's list was directionally right but the exact keys above are authoritative.**

### 1.2 Registered trigger (1) — webhook

[`integrations/airtable/triggers/recordChanged/`](../../../integrations/airtable/triggers/recordChanged/). Registered via [`index.ts`](../../../integrations/airtable/triggers/recordChanged/index.ts): `registerActivation("airtable", "record_changed", activate)` + `registerDeactivation(...)` + `registerSubscriptionHandler(...)`. Already imported at [`integrations/_registry.ts:71`](../../../integrations/_registry.ts) (`import "./airtable/triggers/recordChanged"`) → **activation is registered at module load today** (so META-3 only adds the meta, no `_registry` wiring change).

| Trigger key | Model | Lifecycle | User config | Payload (consolidated; branch on `eventType`) | Sensitive |
|---|---|---|---|---|---|
| `record_changed` | **webhook** (per-base subscription) | `activate` → `POST /v0/bases/{baseId}/webhooks` (`dataTypes:["tableData"]`, optional `recordChangeScope`); persists `webhookId / macSecretBase64 / baseId / tableIdOrName / expiresAt / lastCursor` to `trigger_resources.config`. `deactivate` → delete webhook (best-effort). `renew` → `subscriptionRegistry`, 6-day threshold vs Airtable's 7-day TTL. | baseId* ; tableIdOrName? (omitted = watch all tables in base) | `{eventType: created\|updated\|deleted\|table_deleted\|unknown, baseId, tableId, recordId, createdTime?, fields, parsedFields?, skippedFields?, changedFieldsById?, previousValues?, destroyedTableIds?, baseTransactionNumber, deleted?}` | `fields`, `parsedFields`, `previousValues`, `changedFieldsById` (cell content) |

V1's three separate triggers (`new_record`, `record_updated`, `table_deleted`) are **already consolidated** into this one `record_changed` trigger in the V2 runtime; workflows branch on `payload.eventType` ([`normalize.ts`](../../../integrations/airtable/triggers/recordChanged/normalize.ts)). It registers an activation hook → satisfies `trigger-meta-activation-invariant` with **no exemption** → **TriggerMeta can ship now**.

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts` mirroring each `.schema.ts` 1:1. **Field names are camelCase**, pinned verbatim to the runtime Zod schemas: `baseId`, `tableIdOrName`, `recordId`, `fieldName`, `filterByFormula`, `includeViews`, `typecast`, `pageSize`, `maxRecords`, `view`, `sort`, `fields`, `records`, `file`, `filename`. Outputs mirror handler returns exactly.

**Common defaults:** `requiresIntegration: true`; `category: "data"`; sequential `displayOrder` (10..110); `producesFileRef: false` for all (no Airtable action emits a `FileRef` contract object); `consumesFileRef: true` only for `add_attachment`.

**Risk classification:**
- **low** — `list_records`, `get_record`, `find_record`, `get_base_schema`, `get_table_schema` (pure reads; dropbox/excel precedent: reads = low).
- **medium** — `create_record`, `update_record`, `add_attachment`, `create_multiple_records`, `update_multiple_records` (recoverable external mutations / writes).
- **high + isDestructive + requiresConfirmation** — `delete_record` only (irreversible — Airtable's REST `DELETE` has no trash/restore; the schema explicitly documents non-idempotent fail-loud-on-404). Mirrors the Excel `delete_row` destructive-trio precedent. **Open decision for Marcus:** confirm `delete_record` carries `requiresConfirmation` (recommended). _(Note: there is no `delete_worksheet`-equivalent action — `table_deleted` is a trigger **event**, not an action. So Airtable has exactly one destructive action, vs Excel's two.)_

**Field-type mapping** (every field grounded in a real renderer from [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) `FieldTypeSchema`):
- `baseId` → **combobox + `optionsSource: "airtable:bases"`**, required (opaque id; picker essential). Text only if the resolver is somehow deferred (NOT recommended — see §3).
- `tableIdOrName` → **combobox + `optionsSource: "airtable:tables"`, `dependsOn: "baseId"`**, required (optional on the trigger).
- `recordId` → **text**, required. **No record picker** — record lists are large/ambiguous/expensive and `recordId` typically flows from an upstream trigger/`list_records` variable. (Brief guidance: "do not overbuild record pickers.")
- `fields` (typed map, create/update) → **textarea paste-JSON**, required. Help text documents the shape `{"Field Name": {"type": "...", "value": ...}}` + the 15 supported types + "deferred types (formula/lookup/rollup/…) fail validation." Same bridge as Notion `properties`.
- `records` (batch array) → **textarea paste-JSON**, required. Document `[{"fields": {…}}]` (create, max 10) / `[{"recordId":"rec…","fields":{…}}]` (update, max 10), all-or-nothing on 422.
- `typecast` → **boolean**, required (UI `defaultValue: false` — safe; handler still receives an explicit boolean per Q11).
- `filterByFormula` → **textarea** (Airtable formula expression). Required for `find_record`, optional for `list_records`.
- `includeViews` (`get_base_schema`, `get_table_schema`) → **boolean**, required (UI `defaultValue: false`).
- `list_records.pageSize` / `maxRecords` → **number** (`numeric: {min:1, max:100, integer:true}` for pageSize; `{min:1, integer:true}` for maxRecords). `offset` → **text**. `view` → **text** (view picker is 2-dep-blocked — §3). `fields` → **string-array** (user-typed field-name list; a `combobox+multiple` picker is 2-dep-blocked — §3). `sort` → **textarea paste-JSON** (`[{"field":"…","direction":"asc|desc"}]`; no array-of-object FieldType).
- `add_attachment.fieldName` → **text** (attachment-field picker is 2-dep-blocked — §3; hand-typed acceptable). `file` → **`file`** FieldType (`consumesFileRef: true`). `filename` → **text**, optional.

**Sensitive outputs** (`OutputMeta.sensitive: true` — read-side redaction + builder "Sensitive" chip; the token stays insertable):
- Record **cell content** is sensitive: `create_record.fields`, `update_record.fields`, `get_record.fields`, `find_record.record.fields`, and the per-row `fields` inside `list_records.records` / `create_multiple_records.records` / `update_multiple_records.records`.
- `add_attachment.attachments` (carries Airtable's own file URLs).
- **Modeling nuance for META-3:** the record-bearing arrays (`records[]`) carry `id` (NOT sensitive) alongside `fields` (sensitive). Prefer modeling each as `array` with a nested `fields[]` `OutputMeta` where only the `fields` child is `sensitive: true`, so the record `id` is not over-redacted. Verify the redaction helper descends into array element shapes; if it only descends into `object` outputs, fall back to marking the whole `records` array sensitive (accepting `id` over-marking) and note it. **Do NOT mark** ids / `createdTime` / `count` / `offset` / `createdCount` / `updatedCount` / `attachmentCount` / `deleted` / `found`.
- **Schema reads are NOT sensitive:** `get_base_schema.tables` and `get_table_schema.table` are structural metadata (table/field names, ids, types) — not user record content. Per the brief: "identifiers/names/counts are not over-marked."

**Task cost:** per the current central policy ([`lib/workflows/cost-calculator.ts`](../../../lib/workflows/cost-calculator.ts) — `provider_action = 1`, no read carve-out), each Airtable action bills **1 task on success** once meta'd — including the five reads. No per-meta override. _(A reads-are-free carve-out is a central policy decision, out of scope for this metadata arc; flagged only.)_

---

## 3. Options resolver audit

Airtable **needs resolvers** for a usable builder (opaque `baseId`). The dependency chain is **base → table → field/view**. The decisive constraint: the builder cascade is **single-parent** today, so only the first two levels (no-dep root + single-dep) are wireable.

| Resolver | Serves | Endpoint / helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `airtable:bases` | every action + the trigger (the `baseId` field) | **MISSING — needs a new `basesList` helper** (`GET /v0/meta/bases` → `{bases:[{id,name,permissionLevel}], offset}`; scope `schema.bases:read` **already in manifest**) | none | **REQUIRED (META-2)** | No — opaque `appXXX` id; picker essential |
| `airtable:tables` | every action except `get_base_schema`; the trigger's optional `tableIdOrName` | **exists** — reuse `basesGetSchema` (`GET /v0/meta/bases/{baseId}/tables`); project `{value: table.id, label: table.name}` | `["baseId"]` | **REQUIRED (META-2)** | Names are typeable, but the picker prevents typos + drives the cascade |
| `airtable:fields` | `list_records.fields` (multiselect), `create/update_record.fields` keys (paste-JSON; no direct consumer), `add_attachment.fieldName` | reuse `basesGetSchema` → find table by `tableIdOrName` → return `table.fields` as `{value: field.name, label: field.name, description: field.type}` | `["baseId", "tableIdOrName"]` | **SHIP (META-2)** — unblocked by BUILDER-OPTIONS-1 | **Yes** — field names are human-readable; `string-array` / paste-JSON / text work as fallback |
| `airtable:views` | `list_records.view` | reuse `basesGetSchema(includeViews:true)` → table.views | `["baseId", "tableIdOrName"]` | **SHIP (META-2)** — unblocked | Yes — view name is typeable |
| `airtable:attachment_fields` | `add_attachment.fieldName` (filtered to attachment-type fields) | reuse `basesGetSchema` → table.fields filtered to `type === "multipleAttachments"` | `["baseId", "tableIdOrName"]` | **SHIP (META-2)** — unblocked | Yes — `fieldName` text acceptable |
| `airtable:records` | a hypothetical `recordId` picker | `recordsList` | `["baseId","tableIdOrName"]` | **REJECT for v1** | Yes — recordId flows from upstream/variable; record pickers are large/ambiguous |

**The original blocker (now resolved):** every field-level resolver (`fields` / `views` / `attachment_fields` / `records`) needs **two** deps (`baseId` + `tableIdOrName`). The route + client always supported multi-dep, but the builder's `SchemaForm` cascade only populated the single `dependsOn` parent. **Slice 4.BUILDER-OPTIONS-1** (shipped 2026-05-25) fixed exactly this: `FieldMeta.dependsOn` now accepts `string[]`, and `SchemaForm` collects all parents, gates until every parent is present, and passes the full dep set. So a field declaring `dependsOn: ["baseId", "tableIdOrName"]` now sends both → the resolver's `requiredDeps` check passes. → **These resolvers are now buildable in AIRTABLE-META-2.**

**`add_attachment` special-case (brief asked to call this out):** the ideal UX is a `fieldName` combobox backed by `airtable:attachment_fields` (dep `["baseId", "tableIdOrName"]`). With BUILDER-OPTIONS-1 this **now works** — ship it in META-2. The hand-typed `text` fallback remains valid if a slice wants to defer the dedicated attachment-field resolver, but it is no longer forced.

**Resolver mechanics** (per [`services/options/types.ts`](../../../services/options/types.ts), mirroring the Excel `workbooks`/`worksheets` templates): each is `OptionsResolver { source, provider:"airtable", requiresIntegration:true, requiredDeps?, resolve(ctx) }`; `resolve` calls `refreshAndRetry({provider:"airtable", accountId: ctx.integration.providerAccountId})` around the helper, reads `ctx.deps.baseId` + optional `ctx.q` (client-side name filter), returns `{items:[{value,label,description?}], hasMore}`; classify `IntegrationActionRequiredError` / `Unauthorized401Error` → `OptionsResolverError("INTEGRATION_DISCONNECTED")`, `NotFoundError` (stale parent base) → empty items (cascade fallback), anything else → `OptionsResolverError("PROVIDER_ERROR", "Couldn't load Airtable …")` — **never leak tokens/raw bodies**.

**`airtable:tables` value = `table.id` (NOT name) — important.** The trigger's `activate` passes `recordChangeScope: tableIdOrName` to Airtable's webhook create; Airtable's `recordChangeScope` expects a **table id** (`tblXXX`). Returning ids keeps the trigger correct AND is rename-safe; the action handlers accept id-or-name so ids work everywhere. **Verify the `recordChangeScope` id requirement in META-2** before finalizing (high confidence, but confirm against Airtable's webhook spec).

**Recommendation:** build `airtable:bases` + `airtable:tables` + `airtable:fields` in META-2 (`bases` = one new `basesList` helper; `tables`/`fields` reuse `basesGetSchema`). `airtable:views` + `airtable:attachment_fields` are also unblocked and cheap (same `basesGetSchema` source) — ship them in META-2 if their consumer fields are wired, else fast-follow. Reject `records` for v1. All resolvers are read-only against scopes **already in the manifest** (`schema.bases:read`) → **no manifest/scope change, no reconnect.**

---

## 4. Trigger metadata audit

`record_changed` is runtime-real, webhook-based, activation-registered, deactivation + renewal wired → **ships TriggerMeta in this arc.** No hard blockers.

TriggerMeta (`activation: "webhook"`, `category: "data"`, `requiresIntegration: true`, `key: "airtable:record_changed"`):
- **Fields** (user-config only): `baseId` (combobox → `airtable:bases`, required); `tableIdOrName` (combobox → `airtable:tables`, `dependsOn: "baseId"`, **optional** — omitted = watch all tables in the base). Both are root/single-dep → wireable. Internal `trigger_resources.config` state (`webhookId`, `macSecretBase64`, `expiresAt`, `lastCursor`) is server-managed and **NOT** surfaced as `fields[]`.
- **payloadShape:** model the consolidated event as a flat superset of the §1.2 payload. `eventType` (string), `baseId` / `tableId` / `recordId` (string), `createdTime` (string), `baseTransactionNumber` (number), `deleted` (boolean), `destroyedTableIds` (array), `skippedFields` (array). Mark **sensitive**: `fields` (object), `parsedFields` (object), `previousValues` (object), `changedFieldsById` (object) — all carry cell content. ids / eventType / counts / timestamps / `destroyedTableIds` are structural (not sensitive).
- **Activation invariant:** satisfied — `registerActivation("airtable","record_changed",activate)` is already loaded via `integrations/_registry.ts`. **No `SHARED_INFRA_EXEMPT_KEYS` entry needed** (Airtable creates a real per-base subscription, unlike Slack's shared URL).
- Trigger coverage is **not** enforced by `discovery-meta-coverage` (precedent: Stripe/Discord/Excel) — `trigger-meta-activation-invariant` is the gate, and it passes.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is already settled (the Airtable 2.1 arc: 11 actions + the consolidated `record_changed` trigger; V1's sequential batch loops, `continueOnError` partial-success, heuristic attachment-by-field-name detection, and `duplicate_record` were all **NOT PORTED** per the parity audit). This slice's decisions are metadata-only:

- **All 11 actions + the `record_changed` trigger → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime change.
- **`baseId` → ADAPT to a resolver-backed combobox (REQUIRED).** Opaque id; text-only would make the builder effectively unusable. The core reason Airtable is resolvers-first.
- **`tableIdOrName` → ADAPT to a resolver-backed combobox with `dependsOn: baseId`** (value = table id; rename-safe + trigger-correct).
- **`airtable:bases` resolver → ADAPT (add one new `basesList` Graph helper).** The only net-new runtime code in the arc; small + additive + uses an existing scope.
- **`fields` / `records` typed maps → ADAPT via `textarea` paste-JSON.** No typed-field-map FieldType; same bridge as Notion `properties` / Stripe `lineItems`. `update/list` extras (`sort`) also paste-JSON; `list_records.fields` → `string-array`.
- **`delete_record` → COPY but classify high + isDestructive + requiresConfirmation** (irreversible; Excel `delete_row` precedent). Open Marcus decision on `requiresConfirmation`.
- **`add_attachment` → COPY; `file` field is a FileRef consumer (`consumesFileRef: true`); `fieldName` is text** (attachment-field picker deferred — 2-dep blocked).
- **Field-level resolvers (`fields` / `views` / `attachment_fields`) → SHIP (META-2).** Unblocked by Slice 4.BUILDER-OPTIONS-1's multi-parent `dependsOn`; declare `dependsOn: ["baseId", "tableIdOrName"]`. Hand-typed names remain a valid fallback but are no longer forced.
- **`records` recordId picker → REJECT for v1.** Record lists are large/ambiguous/expensive; `recordId` flows from upstream/variables.
- **REJECT (runtime, already decided — not re-litigated here):** `duplicate_record`, `continueOnError` partial-success, V1 keyword/dateFilter convenience builders. **DEFER:** the three field-level resolvers; reads-are-free billing carve-out (central policy, not metadata).

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slices — NOT this slice) |
|---|---|---|
| **AIRTABLE-META-1** (this slice) | Audit + plan (doc-only) | this doc |
| **AIRTABLE-META-2** | resolvers (`bases`, `tables`, `fields`; optionally `views`/`attachment_fields`) + the new `basesList` helper + resolver tests | new `integrations/airtable/api/bases.ts` export `basesList` (or new `integrations/_shared/airtable/api/` helper) for `GET /v0/meta/bases`; `integrations/airtable/options/{bases,tables,fields,…}.ts`; register in `services/options/_registry.ts`; resolver unit tests (mock the Airtable boundary). Field-level resolvers declare `requiredDeps: ["baseId", "tableIdOrName"]` (multi-parent — unblocked by BUILDER-OPTIONS-1) |
| **AIRTABLE-META-3** | 11 ActionMeta + 1 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/airtable/actions/*.meta.ts` (11); `integrations/airtable/triggers/recordChanged/recordChanged.meta.ts` (1); new `services/discovery/providers/airtable.ts` sub-registry; wire into `services/discovery/_registry.ts`; add `"airtable"` to `COVERED_PROVIDERS`; tests (§7) |

**Why 3 slices (same shape as Excel), not the brief's hypothetical 5:** with multi-parent `dependsOn` now landed (BUILDER-OPTIONS-1), META-2 ships the full resolver set (`bases` + `tables` + `fields`, plus `views`/`attachment_fields`) + the one new `basesList` helper. With those in place, META-3 combines all 11 ActionMeta + the single TriggerMeta + the sub-registry + the COVERED flip in one slice (Excel proved the combined actions+triggers+flip shape with 10 actions + 5 triggers; Airtable's 11 actions + 1 trigger is comparable). No separate "META-4 trigger" or "META-5 flip" is warranted because there's exactly one trigger and the flip is one line. _(The earlier plan reserved a META-4 for deferred field-level resolvers; that deferral is now moot — they ship in META-2.)_

---

## 7. Tests required

- **Resolver tests (META-2):** `airtable:bases` / `airtable:tables` / `airtable:fields` return mapped `{value,label}` items (`tables` value = table id; `fields` value = field name); `tables` `requiredDeps:["baseId"]` and `fields` `requiredDeps:["baseId","tableIdOrName"]` short-circuit (`MISSING_DEPENDENCY`) when a dep is absent (the multi-parent path validated generically in BUILDER-OPTIONS-1's route test); stale parent → empty items (cascade fallback, not error); provider 4xx → `OptionsResolverError("PROVIDER_ERROR")`; 401 → `INTEGRATION_DISCONNECTED`; **no token/raw-body leakage**; **Airtable boundary mocked — no real API calls**.
- **ActionMeta shape (META-3):** each of 11 metas parses against `ActionMetaSchema`; `key === "airtable:<type>"`; outputs mirror handler returns; cell-content outputs flagged sensitive (and schema-read outputs NOT flagged); `baseId`/`tableIdOrName` carry the right `optionsSource` + `dependsOn`; `delete_record` carries the destructive trio; `add_attachment` has `consumesFileRef: true`.
- **TriggerMeta shape (META-3):** `record_changed` meta parses; `activation: "webhook"`; cell-content payload fields sensitive; fields exclude internal `trigger_resources` state; `tableIdOrName` optional.
- **Discovery registry:** Airtable metas load (no duplicate keys); `listActionMetasForProvider("airtable")` → 11; `listTriggerMetasForProvider("airtable")` → 1; `listProvidersWithMetadata()` includes `airtable`.
- **Provider route:** `/api/providers` → `airtable` `hasMetadata:true`; `/actions` → 11; `/triggers` → 1 (new `tests/unit/app/api/providers/airtable-provider-route.test.ts`, mirroring the Excel/Monday route tests).
- **Structure invariants:** `discovery-meta-coverage` passes with `airtable` in `COVERED_PROVIDERS` (1:1 handler↔meta — all 11); `trigger-meta-activation-invariant` passes for `record_changed` (no exemption); `sensitive-output-coverage` passes.
- **Guards:** no secret-shaped output names; no provider API calls in unit tests; builder config-rendering test for the resolver-backed `baseId`/`tableIdOrName` cascade if the existing field-rendering test harness supports it.

---

## 8. Acceptance criteria

Airtable is metadata/builder-complete only when:

- [ ] all 11 runtime actions have `ActionMeta` (1:1 with `services/execution/handlers/_registry.ts`);
- [ ] the `record_changed` trigger has `TriggerMeta` with a passing activation invariant;
- [ ] `airtable:bases` + `airtable:tables` + `airtable:fields` resolvers exist (`basesList` helper added; field-level resolvers use multi-parent `dependsOn`, unblocked by BUILDER-OPTIONS-1); `views` / `attachment_fields` shipped or fast-followed; `records` is **rejected** for v1;
- [ ] `/api/providers` reports Airtable `hasMetadata:true` (no longer "coming soon"); actions + trigger render in the builder with working `base`/`table` pickers;
- [ ] `airtable` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Airtable tests (§7) pass;
- [ ] **no Airtable runtime handler behavior changed** (metadata + the additive `basesList` resolver helper only);
- [ ] the `delete_record` confirmation decision (§2) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Airtable → covered; **20/26 covered, 6 pending**).

---

## Appendix — risks / blockers summary

1. ~~**Single-parent builder cascade (HARD BLOCKER for field-level pickers).**~~ **RESOLVED 2026-05-25 by Slice 4.BUILDER-OPTIONS-1** ([`builder-options-multi-parent-dependencies.md`](./builder-options-multi-parent-dependencies.md)). `FieldMeta.dependsOn` now accepts `string[]` and `SchemaForm` collects + gates on all parents. The `fields`/`views`/`attachment_fields` resolvers (2-dep) are now buildable in META-2. Hand-typed field/view names + paste-JSON record fields remain valid fallbacks.
2. **No `basesList` helper today.** META-2 adds `GET /v0/meta/bases`. Uses the existing `schema.bases:read` scope → no manifest change / reconnect.
3. **Typed-field-map has no native renderer.** `create/update_record.fields` + batch `records` → `textarea` paste-JSON. UX is power-user-ish but consistent with Notion/Stripe; a structured field-map editor is a future builder-infra slice.
4. **`airtable:tables` value must be a table id** (for the trigger's `recordChangeScope`). Verify Airtable's `recordChangeScope` id requirement in META-2.
5. **Record-array sensitivity modeling.** Confirm the redaction helper descends into array element shapes so `records[].fields` can be marked sensitive without over-redacting `records[].id`; otherwise mark the whole array and note the `id` over-mark.
6. **Reads bill 1 task.** Five read actions bill a task each under the current central policy (no carve-out). Flagged, not changed.
