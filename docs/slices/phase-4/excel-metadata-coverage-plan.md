# Microsoft Excel — Builder Metadata Coverage Plan (EXCEL-META-1)

**Slice:** 4.EXCEL-META-1 (this plan) → EXCEL-META-2 (resolvers) → EXCEL-META-3 (metas + COVERED flip)
**Type:** Doc-only audit + plan. **No runtime/metadata/test files modified by this slice.**
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Parent tracker:** [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md)
**Standard:** V2-native COPY / ADAPT / REPLACE / DEFER / REJECT — never raw V1 handler-count parity, never blind V1 copy.

Microsoft Excel is the **2nd** of the 8 pending-metadata providers (after Shopify). **Current state (code-verified):** 10 runtime actions + 5 polling triggers registered and real; **0 ActionMeta, 0 TriggerMeta**; absent from the discovery registry; `/api/providers` reports `hasMetadata:false` → Excel renders as **"coming soon"**.

**Key difference from Shopify (drives the slice plan):** Shopify ids are typeable from admin URLs, so Shopify shipped resolver-free. Excel's `workbookId` is an **opaque Microsoft Graph DriveItem id** that a human cannot reasonably hand-type. So Excel is **resolvers-first** — a `workbooks` picker (and `worksheets`/`tables` cascade) is required for a usable builder, not optional polish. Helpers already exist for workbooks + worksheets + table-columns; a `tables` list helper does not yet exist and must be added.

---

> **✅ EXCEL-META-2 shipped (2026-05-25).** The 3 required resolvers are live: `microsoft-excel:workbooks` (no deps), `microsoft-excel:worksheets` + `microsoft-excel:tables` (both `dependsOn: workbookId`). New `tablesList` Graph helper added. The `columns` resolver remains deferred (hand-typed headers OK). Excel is **still NOT in `COVERED_PROVIDERS`** — ActionMeta/TriggerMeta land in **EXCEL-META-3** (next), which flips coverage. Files: `integrations/microsoft-excel/api/tablesList.ts`, `integrations/microsoft-excel/options/{workbooks,worksheets,tables}.ts`, registered in `services/options/_registry.ts`.

## 1. Current Excel runtime inventory

**Manifest** (`integrations/microsoft-excel/manifest.ts`): id `microsoft-excel`, displayName "Microsoft Excel". OAuth Microsoft v2 (shared Azure app; `tokenScope: "user"`, `accountIdField: "email"`, refreshable). Scopes: `offline_access`, `Files.ReadWrite` (own-OneDrive workbooks; SharePoint/shared deferred). Capabilities `oauth/actions/pollingTrigger: true`, `webhookTrigger: false`. _(Note: a manifest comment still says "6 action handlers" — stale; 10 are registered. Out of scope here; the capability flag `actions:true` is correct.)_

**API helpers** (`integrations/microsoft-excel/api/`): `workbooksList`, `worksheetsList`, `worksheetsAdd`, `worksheetDelete`, `worksheetPatch`, `worksheetUsedRange`, `worksheetRangePatch`, `worksheetRangeDelete`, `tableRowsList`, `tableRowsAdd`, `tableColumnsList`, `types`. **No `tablesList` helper** (needed for a `tables` resolver). All wrap Graph `…/me/drive/items/{workbookId}/workbook/…` and throw `Unauthorized401Error` on 401 (→ `refreshAndRetry`).

### 1.1 Registered action handlers (10)

`*` = required at the schema layer. "Picker" = field that wants an options resolver.

| # | Action key | File | Key config fields | Output keys | Risk | Sensitive outputs | Pickers |
|---|---|---|---|---|---|---|---|
| 1 | `add_row` | addRow.ts | workbookId*, worksheetName*, **(values[] XOR rows[])** — `values` single flat row; `rows` batch (1..1000) array of `{header: value}` | single: `{workbookId, worksheetName, address, rowIndex, columnCount, valuesWritten}` / batch: `{…, rowCount, rowsAdded, firstRowNumber, lastRowNumber, columnCount}` | create → **medium** | `valuesWritten` / `rowsAdded` (cell data) | workbook, worksheet, (columns) |
| 2 | `add_table_row` | addTableRow.ts | workbookId*, tableName*, values* (flat array OR `{column: value}`) | `{rowIndex, columnCount, valuesWritten}` | create → **medium** | `valuesWritten` | workbook, table, (columns) |
| 3 | `create_worksheet` | createWorksheet.ts | workbookId*, name* (1..31, unique) | `{worksheetId, name, position}` | create → **medium** | — | workbook |
| 4 | `delete_row` | deleteRow.ts | workbookId*, worksheetName*, rowNumber* (≥1) | `{workbookId, worksheetName, rowNumber, address, deleted}` | **destructive → high** | — | workbook, worksheet |
| 5 | `delete_worksheet` | deleteWorksheet.ts | workbookId*, worksheetName* | `{workbookId, worksheetName, deleted}` | **destructive → high** | — | workbook, worksheet |
| 6 | `export_sheet` | exportSheet.ts | workbookId*, worksheetName*, hasHeaders?(bool), limit?(1..10000) | headers-mode: `{headers[], rows[{}], rowCount, columnCount, address}` / data-mode: `{headers:null, rows[][], …}` | read → **low** | `rows` (cell data) | workbook, worksheet |
| 7 | `get_workbooks` | getWorkbooks.ts | top?(1..1000) | `{workbooks[{workbookId,name,webUrl,size,lastModifiedDateTime}], count, hasMore, nextLink}` | read → **low** | — (metadata) | — (discovery) |
| 8 | `get_worksheets` | getWorksheets.ts | workbookId* | `{worksheets[{worksheetId,name,position,visibility}], count}` | read → **low** | — | workbook |
| 9 | `rename_worksheet` | renameWorksheet.ts | workbookId*, worksheetName*, newWorksheetName* (1..31) | `{workbookId, oldWorksheetName, newWorksheetName, worksheetId, position, renamed}` | update → **medium** | — | workbook, worksheet |
| 10 | `update_row` | updateRow.ts | workbookId*, worksheetName*, rowNumber* (≥1), values* (`{header: value}`, ≥1) | `{workbookId, worksheetName, rowNumber, address, columnsUpdated, updatedColumns}` | update → **medium** | — (only column names echoed) | workbook, worksheet, (columns) |

### 1.2 Registered triggers (5) — all polling

All 5 register an activation hook (`registerActivation`) in their `triggers/<event>/index.ts` and seed a snapshot at activation (closes the first-poll-miss bug). A single shared `PollingHandler` (`triggers/_shared/`) covers all five via a `canHandle` predicate. **Internal lifecycle fields** (`pollingEnabled`, `snapshot`, `polling`) are managed by activate/poll and are NOT user-config — TriggerMeta exposes only the user fields below.

| Trigger key | File dir | Model | User config | Payload | Sensitive |
|---|---|---|---|---|---|
| `new_row` | triggers/newRow | polling | workbookId*, worksheetName* | `{workbookId, worksheetName, rowIndex (1-based), values[]}` | `values` |
| `updated_row` | triggers/updatedRow | polling | workbookId*, worksheetName* | `{workbookId, worksheetName, rowIndex (1-based), values[]}` | `values` |
| `new_table_row` | triggers/newTableRow | polling | workbookId*, tableName* | `{workbookId, tableName, rowIndex (stable Graph idx), values[]}` | `values` |
| `updated_table_row` | triggers/updatedTableRow | polling | workbookId*, tableName* | `{workbookId, tableName, rowIndex (stable Graph idx), values[]}` | `values` |
| `new_worksheet` | triggers/newWorksheet | polling | workbookId* | `{workbookId, worksheetName, worksheetId, position}` | — |

All 5 satisfy the `trigger-meta-activation-invariant` (activation registered) → all can ship TriggerMeta now. No webhook (Graph has no Excel change webhook; polling is correct).

---

## 2. Builder metadata requirements (ActionMeta per action)

Pattern: co-located `<action>.meta.ts` mirroring each `.schema.ts` 1:1. **Field names are camelCase** here (Excel runtime schemas use camelCase: `workbookId`, `worksheetName`, `rowNumber`, `newWorksheetName` — unlike Shopify's snake_case). Outputs camelCase mirror handler returns.

**Common defaults:** `requiresIntegration: true`; `category: "data"`; sequential `displayOrder` (10..100); outputs mirror handler returns exactly.

**Risk classification:**
- **low** — `get_workbooks`, `get_worksheets`, `export_sheet` (pure reads; dropbox precedent: reads = low).
- **medium** — `add_row`, `add_table_row`, `create_worksheet`, `update_row`, `rename_worksheet` (recoverable external mutations).
- **high + isDestructive + requiresConfirmation** — `delete_row`, `delete_worksheet` (irreversible data loss; mirrors the dropbox `delete_file` destructive-trio precedent). `delete_worksheet` is the more catastrophic of the two (loses an entire sheet). **Open decision for Marcus:** confirm both delete actions carry `requiresConfirmation` (recommended), or only `delete_worksheet`.

**Field-type mapping:**
- `workbookId` → **combobox + `optionsSource: "microsoft-excel:workbooks"`** (opaque id; picker essential). Text only if resolver deferred (NOT recommended — see §3).
- `worksheetName` → **combobox + `optionsSource: "microsoft-excel:worksheets"`, `dependsOn: "workbookId"`**.
- `tableName` → **combobox + `optionsSource: "microsoft-excel:tables"`, `dependsOn: "workbookId"`**.
- `name` (create_worksheet) / `newWorksheetName` (rename) → **text** (a NEW name being created — no picker; dropbox `create_folder.path` precedent).
- `rowNumber` → **number** (`numeric: {min: 1, integer: true}`).
- `update_row.values` (`Record<header, value>`) → **keyvalue** (key = column header, value = cell value — natural fit).
- `add_row.values` (flat `unknown[]`) + `add_row.rows` (batch array-of-objects) + `add_table_row.values` (array OR object) → **textarea paste-JSON** (mixed/positional types; no array-of-object FieldType). Document the `values` XOR `rows` rule for add_row in field descriptions (handler `.strict()` + refine enforces).
- `hasHeaders` → boolean; `limit` / `top` → number with bounds.
- (columns) → hand-typed for v1; an optional `microsoft-excel:columns` resolver is deferred (see §3).

**Sensitive outputs:** mark cell-data outputs sensitive even though their names aren't in the structural suspicious-set (good hygiene; cell data can be PII): `add_row.valuesWritten` / `add_row.rowsAdded`, `add_table_row.valuesWritten`, `export_sheet.rows`. Trigger `values` arrays sensitive (see §4). Column-name-only echoes (`update_row.updatedColumns`, `export_sheet.headers`) and ids/addresses/counts are NOT sensitive.

**Task cost:** grounding bills each Excel action at the default **1 task on success** once meta'd — including the three reads (`get_workbooks`, `get_worksheets`, `export_sheet`), since the current central policy has no read carve-out (`provider_action = 1`). No per-meta override. _(If reads-should-be-free is desired, that's a central `taskCostPolicy.ts` decision — out of scope for this metadata arc; flagged only.)_

---

## 3. Options resolver audit

Excel **needs resolvers** for a usable builder (opaque `workbookId`). The dependency chain is **workbook → worksheet / table → column**.

| Resolver | Serves | Graph helper | requiredDeps | Ship in arc? | Hand-type fallback? |
|---|---|---|---|---|---|
| `microsoft-excel:workbooks` | every action + trigger (the `workbookId` field) | **exists** — `workbooksList` (drive-root `.xlsx` filter; `$top`, `nextLink` → `hasMore`) | none | **REQUIRED (EXCEL-META-2)** | No — opaque DriveItem id; picker essential |
| `microsoft-excel:worksheets` | add_row, delete_row, update_row, export_sheet, rename_worksheet, delete_worksheet, get_worksheets; triggers new_row/updated_row/new_worksheet | **exists** — `worksheetsList` | `["workbookId"]` | **REQUIRED (EXCEL-META-2)** | Names are human-readable, but picker prevents typos + cascades |
| `microsoft-excel:tables` | add_table_row; triggers new_table_row/updated_table_row | **MISSING — needs a new `tablesList` helper** (`GET …/workbook/tables` or per-worksheet `…/worksheets/{id}/tables`) | `["workbookId"]` | **RECOMMENDED (EXCEL-META-2)** — one small new helper | Table names typeable; could defer if helper proves costly |
| `microsoft-excel:columns` | add_row (batch), add_table_row, update_row (header keys) | partial — `tableColumnsList` exists (table only, deps `workbookId`+`tableName`); worksheet headers need `worksheetUsedRange` row 1 | `["workbookId", "worksheetName" \| "tableName"]` | **DEFER (EXCEL-META-3b/optional)** | Yes — column headers are human-readable; keyvalue/paste-JSON works without a picker |

Resolver mechanics (per `services/options/types.ts`): each is an `OptionsResolver { source, provider:"microsoft-excel", requiresIntegration:true, requiredDeps?, resolve(ctx) }`; `resolve` reads `ctx.integration` (token), `ctx.deps.workbookId`, optional `ctx.q` (client-side name filter for v1 — Graph list endpoints don't all support `$search`), returns `{items:[{value,label}], hasMore}`; classify provider failures as `OptionsResolverError("PROVIDER_ERROR", "Couldn't load …")` — never leak tokens/raw bodies. `value` = the id/name the handler expects (workbook → DriveItem id; worksheet/table → name, matching the runtime schema fields).

**Recommendation:** build `workbooks` + `worksheets` + `tables` in EXCEL-META-2 (tables = one new `tablesList` helper). Defer `columns`. This is the deliberate divergence from Shopify (which needed none). `get_workbooks` action stays as a runtime discovery path; the resolver powers the builder picker.

---

## 4. Trigger metadata audit

All 5 triggers are runtime-real, polling, activation-registered, snapshot-seeded → **all ship TriggerMeta in this arc**. No webhook option (Graph lacks Excel change webhooks); polling is the correct V2-native model. No hard blockers.

Per trigger TriggerMeta (`activation: "polling"`, `category: "data"`, `requiresIntegration: true`):
- **Fields** (user-config only — internal `pollingEnabled`/`snapshot`/`polling` excluded): `workbookId` (combobox → `microsoft-excel:workbooks`); `worksheetName` (combobox → `microsoft-excel:worksheets`, `dependsOn workbookId`) for new_row/updated_row; `tableName` (combobox → `microsoft-excel:tables`, `dependsOn workbookId`) for new_table_row/updated_table_row; new_worksheet has only `workbookId`.
- **payloadShape:** mirror each `normalize`/poll output (§1.2). Mark `values` (row cell data) **sensitive**. `workbookId` / `worksheetName` / `tableName` / `rowIndex` / `worksheetId` / `position` structural (not sensitive).
- Activation invariant: satisfied (each `index.ts` calls `registerActivation`) → no `SHARED_INFRA_EXEMPT_KEYS` entry needed.

---

## 5. V2-native decisions (COPY / ADAPT / REPLACE / DEFER / REJECT)

Runtime parity is already settled (the Excel parity closeout: 10 actions + 5 polling triggers, with `addMultipleRows` folded into `add_row.rows[]` batch mode). This slice's decisions are metadata-only:

- **All 10 actions + 5 triggers → COPY (surface as-is).** Real handlers, authoritative schemas, accepted V2 surface. No runtime change.
- **`workbookId` → ADAPT to a resolver-backed combobox (REQUIRED).** Rationale: opaque DriveItem ids are not hand-typeable — unlike Shopify, text-only would make the builder effectively unusable. This is the core reason Excel is resolvers-first.
- **`worksheetName` / `tableName` → ADAPT to resolver-backed comboboxes with `dependsOn: workbookId`.** Natural cascade; prevents typos.
- **`microsoft-excel:tables` resolver → ADAPT (add one new `tablesList` Graph helper).** The only net-new runtime code in the arc; small and additive.
- **Row/array values → ADAPT via keyvalue (update_row) / paste-JSON (add_row, add_table_row).** No structured array-of-object FieldType yet; same bridge as Shopify/Notion.
- **`delete_row` / `delete_worksheet` → COPY but classify high + destructive + requiresConfirmation** (destructive-trio precedent). Open Marcus decision on requiresConfirmation scope.
- **`columns` resolver → DEFER.** Hand-typed headers acceptable; worksheet-vs-table branching is fiddly; low ROI for v1.
- **REJECT:** none. **DEFER:** `columns` resolver; SharePoint/shared-workbook discovery (manifest already scoped to own-OneDrive); reads-are-free billing carve-out (policy decision, not metadata).

---

## 6. Implementation slices

| Slice | Scope | Files (implementation slices — NOT this slice) |
|---|---|---|
| **EXCEL-META-1** (this slice) | Audit + plan (doc-only) | this doc + tracker |
| **EXCEL-META-2** | Options resolvers + the new `tablesList` helper + resolver tests | new `integrations/microsoft-excel/api/tablesList.ts`; `integrations/microsoft-excel/options/{workbooks,worksheets,tables}.ts`; register in `services/options/_registry.ts`; resolver unit tests (mock the Graph boundary) |
| **EXCEL-META-3** | 10 ActionMeta + 5 TriggerMeta + discovery sub-registry + COVERED flip + tests | `integrations/microsoft-excel/actions/*.meta.ts` (10); `integrations/microsoft-excel/triggers/**/*.meta.ts` (5); new `services/discovery/providers/microsoft-excel.ts`; wire into `services/discovery/_registry.ts`; add `"microsoft-excel"` to `COVERED_PROVIDERS`; tests (§7) |

**Why resolvers-first (3 slices, not Shopify's 2):** Excel's opaque `workbookId` makes a text-only first pass a bad builder experience, and the `tables` resolver needs a new helper. Landing resolvers in EXCEL-META-2 lets EXCEL-META-3's metas wire `optionsSource` directly and flip COVERED in one go. Metas + triggers + flip combine cleanly in EXCEL-META-3 (Shopify proved the combined shape) once resolvers exist. An optional **EXCEL-META-4** can add the deferred `columns` resolver later.

---

## 7. Tests required

- **Resolver tests (EXCEL-META-2):** `workbooks` / `worksheets` / `tables` resolvers return mapped `{value,label}` items; `requiredDeps` short-circuit (`MISSING_DEPENDENCY`); provider 4xx → `OptionsResolverError("PROVIDER_ERROR")`; **no token/raw-body leakage**; **Graph boundary mocked — no real API calls**.
- **ActionMeta shape (EXCEL-META-3):** each of 10 metas parses; `key === "microsoft-excel:<type>"`; outputs mirror handler returns; cell-data outputs flagged sensitive; resolver-backed fields carry the right `optionsSource` + `dependsOn`.
- **TriggerMeta shape:** 5 metas parse; `activation: "polling"`; `values` payload sensitive; fields exclude internal polling state.
- **Discovery registry:** Excel metas load (no duplicate keys); `listActionMetasForProvider("microsoft-excel")` → 10; `listTriggerMetasForProvider` → 5; `listProvidersWithMetadata()` includes `microsoft-excel`.
- **Provider route:** `/api/providers` → `microsoft-excel` `hasMetadata:true`; `/actions` → 10; `/triggers` → 5.
- **Structure invariants:** `discovery-meta-coverage` passes with `microsoft-excel` in `COVERED_PROVIDERS` (1:1 handler↔meta); `trigger-meta-activation-invariant` passes for all 5; `sensitive-output-coverage` passes.
- **Guards:** no secret-shaped output names; no provider API calls in unit tests.

---

## 8. Acceptance criteria

Excel is metadata/builder-complete only when:

- [ ] all 10 runtime actions have `ActionMeta`;
- [ ] all 5 triggers have `TriggerMeta` (none deferred — all are runtime-real polling triggers) with passing activation invariant;
- [ ] `workbooks` + `worksheets` + `tables` resolvers exist (the `columns` resolver may be deferred with rationale); `tablesList` helper added;
- [ ] `/api/providers` reports Excel `hasMetadata:true` (no longer "coming soon"); actions + triggers render in the builder with working pickers;
- [ ] `microsoft-excel` is in `COVERED_PROVIDERS`;
- [ ] `discovery-meta-coverage` + `trigger-meta-activation-invariant` + `sensitive-output-coverage` pass;
- [ ] targeted Excel tests (§7) pass;
- [ ] **no Excel runtime handler behavior changed** (metadata + additive resolver helpers only);
- [ ] the `delete_row` / `delete_worksheet` confirmation decision (§2) is signed off.

On completion, update [`provider-metadata-launch-gap-tracker.md`](./provider-metadata-launch-gap-tracker.md) (Excel → covered; 19/26 covered, 7 pending).
