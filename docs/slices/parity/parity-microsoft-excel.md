# Parity audit — Microsoft Excel

**Status:** **ACCEPTED 2026-05-14** (audit decisions only). Implementation is NOT yet authorized — Marcus has accepted the four NPDs / deferrals below but has not yet signaled "begin Commit 1." Slice begins on explicit go-ahead.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/microsoft-excel/`](../../integrations/microsoft-excel/) (slice 15)
**Phase 1 surface shipped:** 6 actions (`add_row`, `add_table_row`, `create_worksheet`, `export_sheet`, `get_workbooks`, `get_worksheets`), 2 polling triggers (`new_row`, `new_table_row`)
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.
**Predecessor slice plan:** [`docs/slices/slice-15-microsoft-excel.md`](slice-15-microsoft-excel.md) (Phase 1 — accepted + shipped).
**Rank in Phase 2 priority:** 4 (after Slack / Gmail / Notion).

## Accepted decisions (2026-05-14)

Recorded verbatim from Marcus's acceptance. These resolve every NPD / deferral row in §7, §10, and §14:

1. **NPD-A (`add_multiple_rows` fold):** ACCEPT FOLD into `add_row` batch mode. Max **1000 rows per action execution**. **Fail loudly** when over the cap. **No separate `add_multiple_rows` registry entry.** Single `microsoft-excel:add_row` handler with optional `rows: [...]` mode.
2. **NPD-T (`updated_row` positional diff):** ACCEPT ship-with-doc. Document that positional `rowIndex` hash diff can be noisy under mid-sheet inserts / deletes. Recommend `updated_table_row` for workflows that need stable row identity. No guard / block on the trigger — workflow authors opt into the table variant when they need stability.
3. **`create_workbook`:** DEFER. Do NOT introduce ExcelJS or any binary workbook-generation dependency in this slice. R-Excel-3 stays open until either ExcelJS is acceptable in V2's bundle or a Graph-native empty-XLSX path is found.
4. **P-X1 (header-detection):** ACCEPT handler-internal header read for `update_row` + `delete_row` (same pattern slice 15 adopted for `add_row`). Do NOT create a dynamic-field renderer / platform contract for Excel Phase 2. The dynamic-field renderer remains Phase 3 UI work.

These decisions LOCK the §13 slice plan (7 commits) and the §11 effort estimate. Subsequent surface counts, V1 rot inventory, and platform-dependency map remain authoritative as written below.

**Recommendation up front.** V1 registers **10 Excel actions** + **5 trigger schemas**; V2 ships **6 actions** + **2 polling triggers** (slice 15). Gap is **4 actions PORT now** (`update_row`, `delete_row`, `rename_worksheet`, `delete_worksheet`), **1 action PORT–FOLD** (`add_multiple_rows` — fold into `add_row` as a batch mode rather than a second registry entry, mirrors Gmail 2.2's `advancedSearch → searchEmails` decision), **1 action DEFER** (`create_workbook` — V1 uses CommonJS `require('exceljs')` in TypeScript with a heavy binary dependency for one action; Microsoft Graph has no native workbook-create endpoint that ships an empty XLSX file, so V1 generates one in-process and uploads via `/me/drive/root/children`; defer until either ExcelJS is acceptable in V2's bundle or a Graph-native path is found), **3 triggers PORT** (`new_worksheet`, `updated_row`, `updated_table_row`) reusing the shared `PollingHandler` from slice 15 with per-event snapshot adapters. **Two open product decisions** flagged in §6 (NPD): `updated_row`'s position-vs-hash diff strategy and `add_multiple_rows`' max-batch-size cap. **One required platform gap:** P-X1 — header-detection dynamic-field resolver for `update_row` + `delete_row` (V1's `add_row` already exposes the problem and V2 deferred it per slice-15 §"Open questions"; the new actions either re-defer or close the gap once). Estimated **1 parity slice in 4–5 commits** if accepted (Excel-sized per master plan §7). Excel parity is the fourth Phase 2 audit and closes the cleanest single-batch gap so far — the polling pattern is proven (slice 15 ships 2/5 of the triggers) and the missing actions are all per-row primitives over the same Graph workbook resource surface.

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/microsoft-excel/index.ts) (1637 lines) — 10 action exports + 5 trigger exports in one file. **No** `comingSoon: true` flags (R6 clean). Mixed type-prefix convention: 14 nodes use `microsoft_excel_<kind>_*` (underscore) and 1 uses `microsoft-excel_action_export_sheet` (hyphen) — R-Excel-1 below.

### Action handlers

- [`lib/workflows/actions/microsoft-excel/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/) — 11 .ts files: 10 registered handlers + 1 orphan (`unifiedAction.ts`, 127 lines, not exported from `index.ts` — R5/R-Excel-2). `index.ts` is the registry barrel.
- Per-action sizes:
  - `addMultipleRows.ts` (444 lines) — largest. Batch append with chunked upload.
  - `createWorkbook.ts` (370 lines) — V1's heavy action; uses CommonJS `require('exceljs')` in a TypeScript file (R-Excel-3); generates an empty XLSX in-process and uploads to OneDrive.
  - `createRow.ts` (321 lines) — add-row plus header-detection logic.
  - `exportSheet.ts` (253 lines) — Get Rows / filter rows.
  - `updateRow.ts` (238 lines) — update by row-id (table) or row-number (worksheet).
  - `deleteRow.ts` (180 lines).
  - `addTableRow.ts` (143 lines) — separate from `addMultipleRows` despite overlapping responsibility.
  - `renameWorksheet.ts` (104 lines).
  - `createWorksheet.ts` (107 lines).
  - `deleteWorksheet.ts` (96 lines).
  - `unifiedAction.ts` (127 lines, **orphan** — not exported).
- **R1 finding:** V1 Excel handlers are **per-action split** (not a monolith); `addMultipleRows.ts` is the largest at 444 lines but is a single coherent batch-append handler, not a registry monolith.

### Action registry wiring

V1 Excel manifest types (numbered in source order):

| # | Manifest type | Title |
|---|---|---|
| 1 | `microsoft_excel_action_create_workbook` | Create Workbook |
| 2 | `microsoft_excel_action_add_row` | Add Row |
| 3 | `microsoft_excel_action_update_row` | Update Row |
| 4 | `microsoft_excel_action_delete_row` | Delete Row |
| 5 | `microsoft-excel_action_export_sheet` | Get Rows (R-Excel-1 prefix slip) |
| 6 | `microsoft_excel_action_add_table_row` | Add Row to Table |
| 7 | `microsoft_excel_action_create_worksheet` | Create Worksheet |
| 8 | `microsoft_excel_action_rename_worksheet` | Rename Worksheet |
| 9 | `microsoft_excel_action_delete_worksheet` | Delete Worksheet |
| 10 | `microsoft_excel_action_add_multiple_rows` | Add Multiple Rows |

### Polling triggers (V1 single-file dispatcher)

- [`lib/triggers/pollers/microsoft-excel.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts) (418 lines) — one `PollingHandler` dispatching all 5 trigger types via switch-on-event-type. Role-based interval map (free 15m / pro 2m / business 60s) — R-Excel-4.
- [`lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts) (838 lines) — Microsoft Graph trigger lifecycle for Outlook + OneDrive + Excel sharing one provider class. Per-trigger snapshot seed at activate time; **`logger.warn` on snapshot-seed failure** (lines 190 + 209) without aborting the transition — R-Excel-5 (first-poll-miss bug).

### OAuth + lifecycle (V1 split-app rot)

- V1 uses **a separate Azure AD app** for Excel: `EXCEL_CLIENT_ID` / `EXCEL_CLIENT_SECRET`, distinct from the shared `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` used by Outlook Mail + Outlook Calendar + OneDrive + Teams. R4 + R-Excel-6 — already closed in V2 slice 15 by reusing the shared Microsoft app.

### Data loaders (dynamic dropdowns)

- [`components/workflows/configuration/providers/microsoft-excel/MicrosoftExcelOptionsLoader.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/components/workflows/configuration/providers/microsoft-excel/MicrosoftExcelOptionsLoader.ts) — V1's runtime resolver for dynamic dropdowns (workbooks, worksheets, columns). Multi-strategy fetch (root + folders parallel + search fallback). Out of Phase 2 scope (UI work is Phase 3). V2 slice 15 promoted `get_workbooks` + `get_worksheets` to runtime actions to unblock workflow fan-out without needing the data-loader pattern ported.

### Tests

- **No V1 Excel-dedicated unit tests** under `__tests__/nodes/`, `__tests__/workflows/`, or `__tests__/integrations/`. Test density signal: zero in V1.
- **V2 has 12 unit-test files** under [`tests/unit/integrations/microsoft-excel/`](../../tests/unit/integrations/microsoft-excel/) (one per V2 action + per V2 Graph API wrapper + the shared polling handler + snapshot helper) — V2 is the test-density source of truth post-slice-15.

### Walkthroughs / docs density (proxy signal)

- [`learning/docs/microsoft-excel-gap-analysis.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/docs/microsoft-excel-gap-analysis.md) — V1's own competitor analysis (Zapier vs Make.com vs ChainReact) from 2025-11-20. Confirms V1 considered itself parity-complete with the 11 actions / 5 triggers shipped. Useful as a forward-looking gap reference but the comparison is to Zapier / Make.com, not to V2.
- [`learning/logs/excel-table-support-implementation.md`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/learning/logs/excel-table-support-implementation.md) — V1 changelog entry for the November 2025 table-support push (added `add_table_row` + `new_table_row` + `updated_table_row`).
- **Doc density signal:** medium. One dedicated gap-analysis doc + one implementation log; no Excel-specific walkthroughs.

---

## 2. V1 actions inventory

Source: action exports + manifest types from [`lib/workflows/nodes/providers/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/microsoft-excel/index.ts) cross-referenced with [`lib/workflows/actions/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/index.ts). Numbered in manifest order.

| # | Manifest type | V1 handler file | LOC | Status | Notes |
|---|---|---|---|---|---|
| 1 | `microsoft_excel_action_create_workbook` | `createWorkbook.ts` | 370 | live | CJS `require('exceljs')` in TS file; generates empty XLSX in-process; uploads via OneDrive Graph endpoint. |
| 2 | `microsoft_excel_action_add_row` | `createRow.ts` | 321 | live | Append-tail + insert-at-row modes; header-detection logic via column-name dynamic field. |
| 3 | `microsoft_excel_action_update_row` | `updateRow.ts` | 238 | live | Update by row-id (table) or row-number (worksheet); column-name-or-letter accepted. |
| 4 | `microsoft_excel_action_delete_row` | `deleteRow.ts` | 180 | live | Same row-id-vs-row-number duality as update_row. |
| 5 | `microsoft-excel_action_export_sheet` | `exportSheet.ts` | 253 | live | Get Rows. **R-Excel-1**: only V1 Excel node using hyphen-prefix in type id (others use underscore). |
| 6 | `microsoft_excel_action_add_table_row` | `addTableRow.ts` | 143 | live | Stable row-id via `POST /tables/{name}/rows`. |
| 7 | `microsoft_excel_action_create_worksheet` | `createWorksheet.ts` | 107 | live | Single Graph POST; low risk. |
| 8 | `microsoft_excel_action_rename_worksheet` | `renameWorksheet.ts` | 104 | live | PATCH worksheet name. |
| 9 | `microsoft_excel_action_delete_worksheet` | `deleteWorksheet.ts` | 96 | live | DELETE worksheet. |
| 10 | `microsoft_excel_action_add_multiple_rows` | `addMultipleRows.ts` | 444 | live | Batch append with chunked upload. Largest V1 Excel handler. |

**Plus 1 orphan**, NOT manifest-registered:
- `unifiedAction.ts` — 127-line "Manage Excel Data" generic handler that branched on a `dataAction` enum. Not exported from `lib/workflows/actions/microsoft-excel/index.ts`. R5 / R-Excel-2.

---

## 3. V1 triggers inventory

Source: trigger exports in [`lib/workflows/nodes/providers/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/microsoft-excel/index.ts). Numbered in manifest order.

| # | Manifest type | Title | Source model | Snapshot diff strategy |
|---|---|---|---|---|
| 1 | `microsoft_excel_trigger_new_row` | New Row in Worksheet | polling (`/usedRange`) | positional rowIndex hash diff |
| 2 | `microsoft_excel_trigger_new_worksheet` | New Worksheet | polling (`/worksheets`) | worksheet-id set diff |
| 3 | `microsoft_excel_trigger_updated_row` | Updated Row | polling (`/usedRange`) | rowIndex hash CHANGE (vs unchanged) |
| 4 | `microsoft_excel_trigger_new_table_row` | New Row in Table | polling (`/tables/{name}/rows`) | stable tableRowId set diff |
| 5 | `microsoft_excel_trigger_updated_table_row` | Updated Row in Table | polling (`/tables/{name}/rows`) | tableRowId hash CHANGE |

All 5 dispatched by the single 418-line [`lib/triggers/pollers/microsoft-excel.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts) switching on event type. Role-based polling intervals (R-Excel-4). Snapshot seed in `MicrosoftGraphTriggerLifecycle.onActivate` swallows snapshot-fetch errors (R-Excel-5).

---

## 4. V2 current surface

Source: [`integrations/microsoft-excel/`](../../integrations/microsoft-excel/) (slice 15 — shipped locally).

### Manifest

- [`integrations/microsoft-excel/manifest.ts`](../../integrations/microsoft-excel/manifest.ts) — single Microsoft AD app (shared via `MICROSOFT_CLIENT_ID/SECRET`), `tokenScope: "user"`, `accountIdField: "email"`, scopes `["offline_access", "Files.ReadWrite"]` (narrower than V1's `Files.ReadWrite.All`). Capability flags: `oauth=true`, `actions=true`, `pollingTrigger=true`, `webhookTrigger=false`.

### Actions (6)

Registry: [`services/execution/handlers/_registry.ts:263-268`](../../services/execution/handlers/_registry.ts#L263).

| # | V2 provider key | V2 handler | V1 counterpart |
|---|---|---|---|
| 1 | `microsoft-excel:add_row` | [`actions/addRow.ts`](../../integrations/microsoft-excel/actions/addRow.ts) | `microsoft_excel_action_add_row` (append-tail mode only; insert-at-row deferred per slice 15) |
| 2 | `microsoft-excel:add_table_row` | [`actions/addTableRow.ts`](../../integrations/microsoft-excel/actions/addTableRow.ts) | `microsoft_excel_action_add_table_row` |
| 3 | `microsoft-excel:create_worksheet` | [`actions/createWorksheet.ts`](../../integrations/microsoft-excel/actions/createWorksheet.ts) | `microsoft_excel_action_create_worksheet` |
| 4 | `microsoft-excel:export_sheet` | [`actions/exportSheet.ts`](../../integrations/microsoft-excel/actions/exportSheet.ts) | `microsoft-excel_action_export_sheet` (V1 prefix slip fixed) |
| 5 | `microsoft-excel:get_workbooks` | [`actions/getWorkbooks.ts`](../../integrations/microsoft-excel/actions/getWorkbooks.ts) | **NEW IN V2** — V1 had this as a data-loader only |
| 6 | `microsoft-excel:get_worksheets` | [`actions/getWorksheets.ts`](../../integrations/microsoft-excel/actions/getWorksheets.ts) | **NEW IN V2** — V1 had this as a data-loader only |

### Triggers (2)

Both registered via module-init side-effect imports through [`integrations/_registry.ts`](../../integrations/_registry.ts) → trigger barrels.

| # | V2 event type | V2 location | V1 counterpart |
|---|---|---|---|
| 1 | `microsoft-excel:new_row` | [`triggers/newRow/`](../../integrations/microsoft-excel/triggers/newRow/) | `microsoft_excel_trigger_new_row` |
| 2 | `microsoft-excel:new_table_row` | [`triggers/newTableRow/`](../../integrations/microsoft-excel/triggers/newTableRow/) | `microsoft_excel_trigger_new_table_row` |

Both share one `PollingHandler` at [`triggers/_shared/pollingHandler.ts`](../../integrations/microsoft-excel/triggers/_shared/pollingHandler.ts) (canHandle predicate dispatches by `eventType`) + snapshot helpers at [`triggers/_shared/snapshot.ts`](../../integrations/microsoft-excel/triggers/_shared/snapshot.ts). Fixed 60s interval (no role-based tiering per slice 15 — R-Excel-4 closed).

### Graph API wrappers (9)

[`integrations/microsoft-excel/api/`](../../integrations/microsoft-excel/api/): `tableColumnsList.ts`, `tableRowsAdd.ts`, `tableRowsList.ts`, `types.ts`, `workbooksList.ts`, `worksheetRangePatch.ts`, `worksheetUsedRange.ts`, `worksheetsAdd.ts`, `worksheetsList.ts`. All wrap a single Graph endpoint with `Unauthorized401Error` on 401 (refreshAndRetry contract) and pass-through error.message/status/HTTP fallback.

### E2E

- [`tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts`](../../tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts) — full lifecycle exercised against the mock Graph server.

---

## 5. Missing actions

Set difference: V1 actions minus V2 actions.

| V1 action | V2 status | One-line note |
|---|---|---|
| `microsoft_excel_action_create_workbook` | **MISSING** | V1 generates empty XLSX in-process via `require('exceljs')` + uploads via OneDrive Graph. Heavy dependency for one action. |
| `microsoft_excel_action_update_row` | **MISSING** | Row update by row-id (table) or row-number (worksheet) with column-name-or-letter. |
| `microsoft_excel_action_delete_row` | **MISSING** | Row delete with same id-vs-number duality as update_row. |
| `microsoft_excel_action_rename_worksheet` | **MISSING** | PATCH worksheet name. |
| `microsoft_excel_action_delete_worksheet` | **MISSING** | DELETE worksheet. |
| `microsoft_excel_action_add_multiple_rows` | **MISSING** | Batch append; V1 handler is 444 lines (largest Excel handler). |

**Count:** 6 missing actions. (Phase 2 master plan §3 said "5 deferred actions"; actual delta is 6 — audit corrects.)

---

## 6. Missing triggers

Set difference: V1 triggers minus V2 triggers.

| V1 trigger | V2 status | One-line note |
|---|---|---|
| `microsoft_excel_trigger_new_worksheet` | **MISSING** | Polls `/worksheets`; snapshot is the worksheet-id set; diff = new ids. Simplest of the 3. |
| `microsoft_excel_trigger_updated_row` | **MISSING** | Polls `/usedRange`; snapshot is positional rowIndex→hash; diff = SAME rowIndex with DIFFERENT hash. **Needs product decision** — positional diffs are noisy when rows are inserted/deleted mid-sheet, see §12 R-2. |
| `microsoft_excel_trigger_updated_table_row` | **MISSING** | Polls `/tables/{name}/rows`; snapshot is stable tableRowId→hash; diff = same id, different hash. Cleaner than `updated_row` because table row ids are stable. |

**Count:** 3 missing triggers.

---

## 7. Port / skip / defer table

Every row from §5 + §6 gets a decision.

| V1 item | Type | Recommendation | One-line reasoning |
|---|---|---|---|
| `create_workbook` | Action | **DEFER** | V1 `require('exceljs')` in a `.ts` file; ~200KB dep for one action. Defer until either ExcelJS is acceptable in V2's bundle (or use a checked-in minimal XLSX template + `POST /me/drive/root/children`). Real workflows that need a fresh workbook can compose `onedrive:upload_file(<seeded XLSX>)` today. (master plan rot row R6 / R-Excel-3) |
| `update_row` | Action | **PORT** | Per-row primitive on the same Graph workbook resource surface V2 already wraps. Schema design uses `targetMode: "table" \| "worksheet"` discriminator to avoid V1's silent id-vs-number duality. **Surfaces P-X1** (header-detection — same gap V2 already deferred on `add_row` per slice 15 §"Open questions"). |
| `delete_row` | Action | **PORT** | Same shape as `update_row`. Trivial after `update_row` schema lands; share the `targetMode` discriminator. |
| `rename_worksheet` | Action | **PORT** | Single Graph PATCH; lowest risk in the batch. |
| `delete_worksheet` | Action | **PORT** | Single Graph DELETE. Schema requires explicit `worksheetId`; no silent default. |
| `add_multiple_rows` | Action | **PORT–FOLD** | Fold into `add_row` as a `rows: Array<Record<string, unknown>>` mode (mirrors Gmail 2.2 `advancedSearch → searchEmails` fold + Notion 2.1 NPD pattern). No separate registry entry. **NPD-A RESOLVED:** cap at **1000 rows per action execution**, fail loudly when exceeded (no silent truncation — R8 compliance). |
| `new_worksheet` | Trigger | **PORT** | Shared `PollingHandler` from slice 15 + a new snapshot adapter for the worksheet-id set. Cleanest of the 3 triggers. |
| `updated_row` | Trigger | **PORT** | Same shared handler. **NPD-T RESOLVED:** ship-with-doc. Positional rowIndex hash diff is noisy under mid-sheet inserts / deletes; outcomes doc + handler comment will state the limitation and recommend `updated_table_row` for stable row identity. No guard / block on the trigger. |
| `updated_table_row` | Trigger | **PORT** | Stable tableRowId means clean diff. Ship alongside `updated_row` so docs can recommend table mode when stability matters. |

### NPDs (Needs Product Decision) summary

Both NPDs RESOLVED 2026-05-14 (see "Accepted decisions" at the top of this doc):

- **NPD-A RESOLVED:** 1000 rows per action execution, fail-loud overflow, single `add_row` handler with optional `rows[]` mode.
- **NPD-T RESOLVED:** Ship `updated_row` with documented positional-diff limitation; no guard; recommend `updated_table_row` when row-identity stability matters.

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 categories. Several were already closed in V2 slice 15; restating here for the audit completeness.

| ID | Pattern | V1 evidence | Status in V2 |
|---|---|---|---|
| **R-Excel-1** | **Inconsistent provider-prefix in type ids.** `microsoft-excel_action_export_sheet` (hyphen) sits alongside `microsoft_excel_*` (underscore) for every other Excel node. | [`lib/workflows/nodes/providers/microsoft-excel/index.ts:958`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/microsoft-excel/index.ts#L958) | **CLOSED** in V2 — every V2 type uses the consistent provider-key form (`microsoft-excel:export_sheet`). |
| **R-Excel-2** | **Orphan handler `unifiedAction.ts`.** 127 lines, not exported from `actions/index.ts`, no manifest entry. | [`lib/workflows/actions/microsoft-excel/unifiedAction.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/unifiedAction.ts) | **CLOSED** in V2 — not ported. |
| **R-Excel-3** | **`createWorkbook` uses CJS `require('exceljs')` in TypeScript.** Heavy binary dep added for a single action; complicates the bundle and the build. | [`lib/workflows/actions/microsoft-excel/createWorkbook.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/createWorkbook.ts) | **DEFERRED** in V2 slice 15; this audit confirms the defer (Section 7 recommendation). |
| **R-Excel-4** | **Role-based polling intervals** (free 15m / pro 2m / business 60s). Plan-tier coupling baked into the polling layer; V2 has no plan-tier model yet (Phase 7 work). | [`lib/triggers/pollers/microsoft-excel.ts:9-17`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L9) | **CLOSED** in V2 — fixed 60s interval per slice 15. |
| **R-Excel-5** | **First-poll-miss bug.** `onActivate` swallows snapshot-fetch error via `logger.warn` and proceeds; poller then guards `if (!previousSnapshot) return` so trigger silently never fires. | [`lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts:190`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts#L190), [`pollers/microsoft-excel.ts:201-202`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L201) | **CLOSED** in V2 — slice 15 activates fail-loud on snapshot seed error. CLAUDE.md captures the pattern as "Polling Trigger Snapshot Initialization" (mirrors Gmail's same rule). |
| **R-Excel-6** | **Separate Azure AD app** (`EXCEL_CLIENT_ID/SECRET` distinct from the shared `MICROSOFT_CLIENT_ID/SECRET`). Two app registrations to maintain, two secrets to rotate, two consent screens for users connecting both Excel and OneDrive. | V1 env keys | **CLOSED** in V2 — slice 15 reuses the shared `_shared/microsoft/` OAuth. R4 (cross-cutting). |
| **R-Excel-7** | **No V1 unit tests.** Zero `__tests__/nodes/microsoft-excel*` files; zero `__tests__/workflows/microsoft-excel*` files. Bug discovery happened in production. | grep result | **CLOSED** in V2 — 12 unit-test files cover all 6 actions + 2 triggers + shared infra. |
| **R-Excel-8** | **Mixed scope sources.** V1 has `Files.ReadWrite.All` declared in `scope-validator.ts` registry but the actual OAuth-URL builder requests narrower scopes per provider. Same R3 shape as Gmail. | V1 multi-file scope drift | **CLOSED** in V2 — slice 15 manifest is single source of truth (`Files.ReadWrite` only, narrower than V1). |

**Cross-cutting rot rows applicable** (master plan §5): R1 (no monolith — V1 already per-action split), R2 (no dual-implementation), R3 (closed via manifest), R4 (closed by reusing shared Microsoft OAuth), R5 (orphan `unifiedAction.ts`), R6 (no `comingSoon`), R7 (N/A — Excel uses polling, no webhook signature surface), R8 (manifest required-fields explicit; ports apply `requireExplicitField` for high-risk operations like delete_row + delete_worksheet), R9 (V2 uses central decrypt + Bearer header via `_shared/microsoft/_base.ts`), R10 (V2 ActionResult shape is consistent), R11 (V2 per-workflow-per-trigger lifecycle), R12 + R13 + R14 (none of the porting actions surface tz/locale or multi-recipient parsing concerns).

---

## 9. V2 dependency map

Which V2 contracts each ported item depends on. Reuse-vs-new tally.

| V1 item | Reuses (no contract change) | Surfaces a gap |
|---|---|---|
| `update_row` | `_shared/microsoft/` OAuth, `refreshAndRetry`, `worksheetUsedRange` + `worksheetRangePatch` API wrappers (slice 15), `services/execution/handlers/types`, Zod schema pattern (`.strict()` + `requireExplicitField`) | **P-X1** (header-detection dynamic-field resolver — same gap V2 deferred on `add_row` per slice-15 §"Open questions"). |
| `delete_row` | Same as `update_row` | Same P-X1 dependency (column-name-or-letter resolution shares the same fresh-header-read mechanic). |
| `rename_worksheet` | OAuth, refreshAndRetry, `_shared/microsoft/_base.ts` for a new Graph wrapper (`worksheetPatch.ts`); the `worksheetsAdd.ts` shape from slice 15 is the template. | None — single Graph PATCH, no new contract. |
| `delete_worksheet` | OAuth, refreshAndRetry, new wrapper `worksheetsDelete.ts`. | None — single Graph DELETE. |
| `add_multiple_rows` (FOLD into `add_row`) | All of `add_row`'s deps + chunked PATCH coordination logic inside the handler. | None — fold is a handler-internal change. |
| `new_worksheet` trigger | Shared `triggers/_shared/pollingHandler.ts` (slice 15) — `canHandle` predicate extended for `new_worksheet`. New snapshot adapter under `_shared/snapshot.ts`. | None — proven polling pattern. |
| `updated_row` trigger | Same shared handler. Snapshot adapter is positional rowIndex hash diff. | None at the contract layer; NPD-T is product, not contract. |
| `updated_table_row` trigger | Same shared handler. Snapshot adapter is stable tableRowId hash diff. | None. |

**Net contract additions:** zero new shared contracts. **One platform gap (P-X1)** — see §10. This is the **smallest dependency footprint** of any Phase 2 audit so far (Gmail surfaced P-S3 + P-G1 + P-G2; Notion surfaces a webhook contract; Slack surfaced 2 platform gaps). Excel parity is almost entirely additive on existing V2 infrastructure.

---

## 10. Required platform gaps

| ID | Gap | Why it's needed | Recommended slice shape |
|---|---|---|---|
| **P-X1** | **Header-detection dynamic-field resolver.** When a workflow author configures `update_row({ identifyBy: { column: "Email", value: "..." } })`, the handler needs to resolve the column name to a column letter at execute time. V1 used a custom dynamic-field renderer; V2's manifest has no equivalent dynamic-field type yet. Slice 15 §"Open questions" already deferred this for `add_row` by accepting a flat `Record<string, unknown>` and resolving column letters from a fresh header read inside the handler. | **RESOLVED 2026-05-14: option (a) accepted** — apply the handler-internal header-read pattern from `add_row` to `update_row` + `delete_row`. No new manifest schema, no dynamic-field renderer for Excel Phase 2. Dynamic-field renderer remains Phase 3 UI work. |

No other platform gaps surface. P-X1 is reuse-of-an-existing-handler-pattern, not a new contract. **Zero new shared contracts** introduced by this parity slice.

---

## 11. Effort estimate

Per-batch rough-order-of-magnitude using the parity-slice shape (master plan §6 — "Excel-sized" = 5 actions + 3 triggers = 4–5 commits).

| Item | Effort | Notes |
|---|---|---|
| Commit 1: parity audit (this doc) | 1 commit (doc-only) | Zero runtime risk. |
| Commit 2: `update_row` + `delete_row` (PORT) | 1 commit | Per-action-split schemas + handlers + Graph wrapper (`worksheetRangePatch.ts` already exists for `update_row`; `worksheetRangeClear.ts` + `tableRowsDelete.ts` new for `delete_row`). Unit tests + e2e fixture extension. ~6 files. |
| Commit 3: `rename_worksheet` + `delete_worksheet` (PORT) | 1 commit | Smallest commit. Each is one Graph call. New wrappers `worksheetsPatch.ts` + `worksheetsDelete.ts`. ~4 files. |
| Commit 4: `add_row` batch-mode fold (PORT–FOLD of `add_multiple_rows`) | 1 commit | Schema gains optional `rows: [...]` array; handler branches on presence. Adds NPD-A `batchSize` config field. Updates existing `add_row` tests + adds batch-path tests. ~2-3 files. |
| Commit 5: `new_worksheet` + `updated_row` + `updated_table_row` triggers (PORT) | 1 commit | Three trigger registrations against the shared `PollingHandler`; one new snapshot adapter per trigger; `canHandle` predicate extension. Unit tests for snapshot diff semantics + the NPD-T documented limitation. ~8 files. |
| Commit 6: E2E walkthrough extension | 1 commit | Extend [`tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts`](../../tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts) with one scenario per new action + one per new trigger. Mock Graph server already covers the Graph surface; small extensions for `worksheetsDelete` + table row delete. |
| Commit 7: outcomes doc | 1 commit (doc-only) | Standard slice closure. |

**Total: 7 commits.** Per the master-plan "Excel-sized = 5 actions + 3 triggers = 4–5 commits" rule, this audit lands a slightly heavier slice because of the FOLD work (Commit 4) and the explicit e2e + outcomes commits — but it stays within the Phase 2 parity-slice shape. `create_workbook` is intentionally NOT in this slice (deferred per §7).

---

## 12. Risk estimate

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-1: NPD-A (`add_multiple_rows` cap) drags acceptance.** Marcus may want a different cap than the 1000-row recommendation, or want explicit batching (one Graph PATCH per chunk) vs single-call semantics. | Medium | Medium — could turn a 1-commit fold into 2-3 commits. | Pre-resolve in §7 by recommending a default + flagging the NPD clearly. If Marcus picks a different cap, the schema change is one line; the handler-internal chunking is one helper function. |
| **R-2: NPD-T (`updated_row` positional diff)** is technically correct but UX-fragile. Workflow authors who insert a row at the top of a sheet will see every subsequent row flagged as "updated" on the next poll. V1 shipped this without addressing it. | High | Medium — could surface as a user-visible bug if not documented. | Ship `updated_row` with a documented limitation; recommend `updated_table_row` for cases where row identity matters. Defense in depth: the trigger payload includes both the old + new hash so workflow authors can inspect the actual change. |
| **R-3: P-X1 handler-internal header-read costs an extra Graph round-trip per execute.** Slice 15 already accepted this for `add_row`; extending to `update_row` + `delete_row` doubles it (one read for headers, one PATCH for the change). Cumulative latency for workflows that fan out across many rows. | Low | Low — Microsoft Graph caching at the workbook-session-id level would close this, but slice 15 deferred session-id work too. | Accept the latency for parity-slice scope. If real workflows hit it, revisit `workbook-session-id` (slice-15 deferred item) as a separate platform slice. |

Top 3 only. Other risks (Graph throttling at 60s polling; mid-sheet hash collisions on small worksheets) are bounded by the same mitigations slice 15 already shipped.

---

## 13. Recommended parity batch plan

Ordered list of commits the parity slice would land if accepted. Follows the parity-slice shape from master plan §6.

| # | Commit | Scope |
|---|---|---|
| **1** | `docs(microsoft-excel): plan microsoft-excel parity slice` | Slice plan doc (`docs/slices/microsoft-excel-2-1-parity-plan.md` or equivalent). Resolves NPD-A + NPD-T upfront via Marcus acceptance. |
| **2** | `feat(microsoft-excel): add update_row + delete_row actions` | Schemas + handlers + Graph wrappers + unit tests. P-X1 handled via handler-internal header read. Both actions register in `services/execution/handlers/_registry.ts`. |
| **3** | `feat(microsoft-excel): add rename_worksheet + delete_worksheet actions` | Schemas + handlers + 2 new Graph wrappers + unit tests. `delete_worksheet` requires explicit `worksheetId` (R8 — no silent default). |
| **4** | `feat(microsoft-excel): fold add_multiple_rows into add_row batch mode` | Extend `add_row` schema with optional `rows[]` mode + `batchSize` cap (NPD-A resolution). Handler branches on presence. Tests cover both single-row and batch modes. `microsoft_excel_action_add_multiple_rows` is intentionally NOT a separate V2 registry entry. |
| **5** | `feat(microsoft-excel): add new_worksheet, updated_row, updated_table_row triggers` | Three new trigger registrations against the shared `PollingHandler`. New snapshot adapters. NPD-T documented limitation. Unit tests for snapshot diff semantics. |
| **6** | `test(microsoft-excel): extend walkthrough with new actions and triggers` | E2E walkthrough extension. Mock Graph fixtures for `worksheets/{id}` DELETE + PATCH; table rows DELETE; updated-row diff scenario. |
| **7** | `docs(microsoft-excel): document microsoft-excel parity outcomes` | Outcomes doc + CLAUDE.md durable note if any pattern lands (likely: NPD-T documented limitation + `add_row` batch-mode fold pattern). |

Each commit lands locally, gates green, no push. Pattern matches Gmail 2.3 (7 commits including plan + outcomes).

---

## 14. Exit checklist

Audit-decisions acceptance recorded 2026-05-14:

- [x] Confirmed the Phase 2 master-plan §3 surface count correction (audit shows **6 missing actions + 3 missing triggers**, not 5+3) — implicit acceptance via the lock on the §13 slice plan.
- [x] Resolved **NPD-A**: 1000 rows per action execution; fail loudly on overflow; single `add_row` handler with optional `rows[]` mode.
- [x] Resolved **NPD-T**: ship `updated_row` with documented positional-diff limitation; recommend `updated_table_row` for stability-sensitive workflows.
- [x] Confirmed **DEFER** for `create_workbook` (no ExcelJS / binary workbook generation in this slice; R-Excel-3 stays open).
- [x] Confirmed the **FOLD** decision for `add_multiple_rows` (no separate registry entry).
- [x] Confirmed **P-X1 handler-internal header read** is acceptable for `update_row` + `delete_row` (no dynamic-field renderer / platform contract for Excel Phase 2).
- [x] Confirmed the **7-commit slice plan** in §13 (parity slice is "Excel-sized" + 2 doc commits; stays within master-plan §6 shape).

**Still pending — explicit implementation go-ahead:**

- [ ] Marcus signals "begin Commit 1" (slice plan doc, `docs/slices/microsoft-excel-2-1-parity-plan.md` or equivalent).

Until that go-ahead lands, no V2 runtime code changes; no test changes; no further docs beyond this audit.
