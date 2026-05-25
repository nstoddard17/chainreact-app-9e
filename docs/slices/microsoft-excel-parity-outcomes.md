# Microsoft Excel parity — outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro. Feature-complete.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-microsoft-excel.md`](parity-microsoft-excel.md) (accepted 2026-05-14 before Commit 1 began).
**Phase 1 predecessor:** [`docs/slices/slice-15-microsoft-excel.md`](slice-15-microsoft-excel.md) (6-action OAuth + 2-trigger polling baseline; established the V2 Excel surface + `Files.ReadWrite` scope choice + shared `microsoftExcelPollingHandler` lifecycle).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/microsoft-excel/`](../../integrations/microsoft-excel/).

Microsoft Excel parity closes the largest remaining Excel gap from
Slice 15: 4 new actions, one fold of V1's `addMultipleRows` into
`add_row`'s `rows[]` batch mode, and 3 new polling triggers that
reuse the shared `microsoftExcelPollingHandler` with per-event diff
helpers. The slice introduces **zero new platform infrastructure** —
every action fits the Slice 15 OAuth + `Files.ReadWrite` + Graph
workbook resource surface, and every trigger fits the existing
PollingHandler + activation-snapshot pattern.

The largest qualitative shift is that V1's 444-LOC `addMultipleRows.ts`
is NOT ported as a separate action — its functionality is folded into
`add_row` as the `rows[]` batch mode. The audit's NPD-A
acceptance (Marcus 2026-05-14) locked this fold: one
`microsoft-excel:add_row` registry entry, two execution modes inside
the handler, no `add_multiple_rows` action.

The Phase 2 dynamic-field renderer that would have given the builder
UI auto-completing column headers for `update_row` + `add_row` is
**not** in this slice — every header-aware action reads headers
**handler-internal** (P-X1 acceptance). UI work remains Phase 3.

---

## 1. Scope shipped

### Actions (4 net-new + 1 batch-mode fold)

| Action | Graph endpoint | What it does | V1 reference |
|---|---|---|---|
| `update_row` | `GET .../usedRange` then `PATCH .../range(address='...')` | Updates a known row's named columns by header. Reads headers + existing row in one usedRange GET, merges, full-row PATCH. | `lib/workflows/actions/microsoft-excel/updateRow.ts` (238 LOC) |
| `delete_row` | `POST .../range(address='{N}:{N}')/delete` with `shift: "Up"` | Removes one explicit row, shifts rows below up. Single Graph round-trip; no usedRange / header read needed. | `lib/workflows/actions/microsoft-excel/deleteRow.ts` |
| `rename_worksheet` | `PATCH .../workbook/worksheets('{name}')` with `{ name: <new> }` | Renames a worksheet. Single Graph round-trip; returns the updated worksheet resource. | `lib/workflows/actions/microsoft-excel/renameWorksheet.ts` |
| `delete_worksheet` | `DELETE .../workbook/worksheets('{name}')` | Removes one explicit worksheet. Single Graph round-trip. | `lib/workflows/actions/microsoft-excel/deleteWorksheet.ts` |
| `add_row` (existing — `rows[]` batch mode added) | `GET .../usedRange` then `PATCH .../range(address='...')` covering the whole batch | 1..1000 rows in a single range PATCH. Header-validated. No silent chunking. | folds V1's `addMultipleRows.ts` (444 LOC) |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Excel action total after parity: 10** (6 Slice 15 + 4 net-new from Commits 1–2; `add_row` batch mode does not add a registry entry).

### Triggers (3 net-new polling triggers)

| Trigger | Graph endpoint | Snapshot shape | Diff helper |
|---|---|---|---|
| `new_worksheet` | `GET .../workbook/worksheets` | `{ names: string[], updatedAt }` | `findNewWorksheets` |
| `updated_row` | `GET .../worksheets('{name}')/usedRange` | `{ rowHashes: Record<key, hash>, rowCount, updatedAt }` keyed by 1-based row index (string) | `findChangedKeys` |
| `updated_table_row` | `GET .../tables/{name}/rows` | Same `rowHashes` shape keyed by Graph's stable `index` | `findChangedKeys` |

Activation hooks registered in [`integrations/microsoft-excel/triggers/{newWorksheet,updatedRow,updatedTableRow}/index.ts`](../../integrations/microsoft-excel/triggers/).
**V2 Excel trigger total after parity: 5** (2 Slice 15 + 3 parity).

### API wrappers (no net-new modules — extensions to existing files)

All 5 new actions / triggers reuse the Slice 15 wrappers under
[`integrations/microsoft-excel/api/`](../../integrations/microsoft-excel/api/):

| Wrapper | Used by |
|---|---|
| `worksheetUsedRange` | `update_row`, `add_row` (both modes), `updated_row` trigger |
| `worksheetRangePatch` | `update_row`, `add_row` (both modes) |
| `worksheetRangeDelete` | `delete_row` |
| `worksheetPatch` | `rename_worksheet` |
| `worksheetDelete` | `delete_worksheet` |
| `worksheetsList` | `new_worksheet` trigger |
| `tableRowsList` | `updated_table_row` trigger |

All wrappers continue to route through `_shared/microsoft/oauth.ts` +
`refreshAndRetry` with the Slice 15 401 / 404 / generic-error
contract. **Zero changes** to `_request.ts` / `_base.ts` / `errors.ts`.

### Snapshot helpers (extensions to `_shared/snapshot.ts`)

Excel Commit 4 added two helpers + one new snapshot shape on top of
the Slice 15 baseline:

| Helper | Purpose |
|---|---|
| `findChangedKeys(previous, current)` | Returns entries whose key exists in BOTH snapshots but whose hash differs — used by `updated_row` + `updated_table_row`. |
| `buildWorksheetListSnapshot(names)` | Build a name-list snapshot — used by `new_worksheet`. |
| `findNewWorksheets(previous, current)` | Returns names in `current` but absent from `previous` — used by `new_worksheet`. |
| `ExcelWorksheetListSnapshot` interface | `{ names: string[], updatedAt: string }`. Replaces the previous "rowHashes everywhere" assumption with a typed second snapshot shape. |

The original `buildSnapshot` / `findNewKeys` / `hashRow` /
`ExcelRowSnapshot` from Slice 15 remain unchanged — `new_row` +
`new_table_row` keep using them. The shared polling handler dispatches
on `eventType` and picks the right diff helper.

### Manifest scope changes

**None.** Slice 15's `Files.ReadWrite` covers every parity action and
trigger (reads via `usedRange` / `worksheets` / `tables/{name}/rows`;
writes via `range(address)` PATCH / DELETE and `worksheets('{name}')`
PATCH / DELETE). The manifest comment was updated from "2 polling
triggers" to "5 polling triggers" to reflect the new capability surface.

---

## 2. Durable decisions worth preserving

### 2.1 `add_multiple_rows` folded into `add_row` `rows[]` mode — no second registry entry

V1's `addMultipleRows.ts` (444 LOC) is **permanently** absorbed into
`add_row`. The handler has two execution modes selected at runtime by
the schema's XOR refine:

- **Single-row** (`config.values: unknown[]`): backwards-compatible Slice 15 behavior.
- **Batch** (`config.rows: Array<Record<columnHeader, cellValue>>`): 1..1000 rows in one PATCH.

There is **no** `microsoft-excel:add_multiple_rows` handler, no
registry alias, no schema redirect. Workflows that referenced V1's
`add_multiple_rows` migrate to `add_row` with `rows[]`.

Audit decision: NPD-A (Marcus 2026-05-14). Pattern mirrors Gmail 2.2's
`advancedSearch → searchEmails` fold and Notion 2.1's `list_page_content
→ get_block_children` fold.

### 2.2 Batch is fail-loud: 1..1000 rows, parse-time cap, no silent chunking

Schema enforces:

- `rows.min(1).max(1000)` — over 1000 rejected at parse time **before any Graph call**. No silent chunking into 200-row batches (V1's behavior).
- Empty row objects (`{}`) rejected at parse time.
- Exactly one of `values` xor `rows` — both/neither rejected.

Handler enforces:

- All unknown column names across all rows reported in **one** error (workflow authors see every offender, not just the first).
- No partial success. One PATCH covers the whole batch — Graph either accepts all or rejects all.

### 2.3 `update_row` uses handler-internal header reads + fails loudly on unknown columns

V1's `update_row` exposed a dynamic header-completion field in the
builder UI. V2's Phase 2 deliberately keeps the UI surface flat (P-X1
acceptance): the handler reads `usedRange` once at execution time,
extracts headers from row 1, and resolves the supplied `values` map
against them.

- Unknown column → handler **throws** listing the offender + available headers. No silent skip (V1's behavior in some code paths).
- Unknown column reported with **all** offenders, not just the first.
- Missing usedRange (empty worksheet, headers missing) → handler throws with a clear error message.

The dynamic-field renderer that would let the builder auto-complete
column names from a live workbook stays a Phase 3 UI concern; the
runtime contract is complete without it.

### 2.4 `delete_row` is explicit-rowNumber-only — no search-and-delete

V1 supported delete-by-row-number AND delete-by-column-value-match.
V2 ships only the explicit `rowNumber` mode:

- One row per action execution. Loops are composed upstream.
- No `findRowBy<column>=<value>` — workflow authors compose `read_rows` + a filter + `delete_row` if they need search-and-delete semantics.
- Graph address form `"{N}:{N}"` with `shift: "Up"`. Out-of-range rows yield Graph 400 → `Error("Microsoft Graph workbook/.../range/delete failed: …")` (no silent no-op).

Audit decision: §7 + Marcus acceptance.

### 2.5 Worksheet actions are explicit-name-only — no "first sheet" fallback, no silent no-op

`rename_worksheet` and `delete_worksheet` both require an explicit
`worksheetName` config field:

- No fallback to "first worksheet" / "active worksheet" / "default sheet".
- No silent no-op when the worksheet is missing — Graph 404 surfaces as `NotFoundError`.
- Trying to delete the workbook's last visible worksheet yields Graph 400 → generic `Error`. The handler does **not** guard against this in the schema — Graph's own validation is authoritative.

### 2.6 `new_worksheet` snapshot = worksheet-name list, rename = remove old + add new

`new_worksheet` snapshots `{ names: string[], updatedAt }`. The diff
helper `findNewWorksheets` returns names present in `current` but
absent from `previous` — set-difference, order-insensitive.

**Renames fire the trigger.** Graph's `/worksheets` endpoint reports
renames as `{ remove "Old", add "New" }`, so a rename surfaces one
`new_worksheet` event with `payload.worksheetName === "New"`. This
matches V1.

Authors who want "actually new sheet, not renamed" semantics compose
a downstream filter on the trigger payload — V2 does not invent a
separate `renamed_worksheet` trigger.

### 2.7 `updated_row` uses position-keyed hash diff — positional limitation accepted

`updated_row` keys the snapshot on **1-based row index as a string**.
The diff helper `findChangedKeys` returns entries whose key exists in
BOTH snapshots but whose hash differs.

**Accepted limitation:** mid-sheet inserts or deletes shift subsequent
rows. Their position-keyed hashes change, so every shifted row appears
as "updated" on the next poll. This matches V1's behavior.

Workflow authors that need stable row identity use
**`updated_table_row`** instead. The audit's NPD-T acceptance (Marcus
2026-05-14) opted for ship-with-doc rather than blocking the trigger
or guarding inside the handler — the limitation is real and
documented, but the trigger is still useful for append-only or
edit-only worksheets where shifts don't happen.

### 2.8 `updated_table_row` uses Graph's stable `index` — clean update semantics

`updated_table_row` keys the snapshot on Graph's `index` field
(per-table-row stable id). The `index` stays pinned across mid-table
inserts/deletes, so neighbor mutations do NOT spuriously fire the
trigger. Only true content changes at the same `index` fire.

This is the recommended trigger for workflows that need stable row
identity for "row updated" semantics.

### 2.9 Activation seeds the baseline, throws on failure (closes V1 first-poll-miss)

All three new triggers' activation hooks fetch their baseline state
from Graph **before** the polling row is persisted. Failure at
activation **throws**, which the orchestrator wraps as
`TRIGGER_REGISTRATION_FAILED` and surfaces to the workflow author.

V1's `MicrosoftGraphTriggerLifecycle.ts:175-212` swallowed snapshot-seed
errors in a try/catch — if the seed failed, the poll handler's
`if (!previousSnapshot) return` silently dropped events forever.
**Not ported.** This is the durable Slice 15 invariant per CLAUDE.md
§4 "Polling Trigger Snapshot Initialization", extended to all five
Excel triggers.

### 2.10 Single shared `microsoftExcelPollingHandler` covers all 5 event types

One `PollingHandler` instance is registered (via
[`triggers/newRow/index.ts`](../../integrations/microsoft-excel/triggers/newRow/index.ts))
and its `canHandle` predicate matches `new_row`, `new_table_row`,
`new_worksheet`, `updated_row`, `updated_table_row`. The four
satellite trigger directories register **activation only** — they
share the handler.

This keeps the polling registry size O(providers) rather than
O(eventTypes), and ensures the dispatch logic stays in one place
where the diff-helper selection is obvious.

### 2.11 `update_row` PATCHes the FULL row, not just the changed cells

`update_row` builds `address = "A{rowNumber}:{lastHeaderCol}{rowNumber}"`
and PATCHes the merged values: existing row values overlaid with the
supplied updates. **Untouched cells stay populated.**

V1's behavior issued one PATCH per cell — N HTTP calls per row update.
V2 does exactly 2 Graph round-trips per `update_row` (usedRange GET +
range PATCH) regardless of how many columns are updated.

### 2.12 No raw API escape hatch

Excel parity does NOT ship a `microsoft-excel:make_api_call`. Action
gaps are filled by targeted typed ports tracked in
[`docs/slices/parity-microsoft-excel.md`](parity-microsoft-excel.md) §7
+ §11.

---

## 3. V1 rot fixed / skipped

All entries from parity-microsoft-excel §8 and the Slice 15 doc are
addressed:

| ID | Pattern | V2 status |
|---|---|---|
| R-Excel-1 | Mixed `microsoft_excel_<kind>_*` underscore vs `microsoft-excel_action_*` hyphen naming | NOT REINTRODUCED — V2 uses consistent hyphen + underscore split per the registry convention |
| R-Excel-2 | Orphan `unifiedAction.ts` (127 LOC, not exported from `index.ts`) | NOT PORTED |
| R-Excel-3 | `createWorkbook.ts` `require('exceljs')` CJS inside `.ts` + heavy binary dep | DEFERRED — `create_workbook` not shipped; see §6 |
| R-Excel-4 | Per-cell PATCH loop in V1 `updateRow` | NOT PORTED — V2 issues exactly 2 Graph calls per `update_row` |
| R-Excel-5 | Silent unknown-column skip in some V1 `updateRow` paths | NOT PORTED — V2 fails loudly listing all offenders |
| R-Excel-6 | Separate Azure AD app via `EXCEL_CLIENT_ID` / `EXCEL_CLIENT_SECRET` | NOT REINTRODUCED — Slice 15 already settled on shared `MICROSOFT_CLIENT_ID` via `_shared/microsoft/oauth.ts`; parity inherits |
| R-Excel-7 | Role-based polling intervals (`free → 15min`, `pro → 2min`, `enterprise → 1min`) | NOT REINTRODUCED — V2 uses `DEFAULT_INTERVAL_MS` uniformly; tier-aware polling is deferred to a billing slice when justified |
| R-Excel-8 | Snapshot-seed errors swallowed in try/catch (first-poll-miss bug) | NOT REINTRODUCED — activation throws; orchestrator wraps as `TRIGGER_REGISTRATION_FAILED` |
| R-Excel-9 | Inline token decrypt in V1 lifecycle / poller | NOT PORTED — every V2 action + trigger routes through `refreshAndRetry` |
| R-Excel-10 | V1 `addMultipleRows` chunked upload + silent partial success | NOT PORTED — V2 batch is fail-loud, exactly one PATCH for 1..1000 rows |
| R-Excel-11 | Separate `add_multiple_rows` registry entry | NOT PORTED — folded into `add_row` |

`create_workbook` rot (CJS `require` in `.ts` + ExcelJS bundle weight)
is the one V1 pattern that survives by **not** being ported — deferring
the action keeps V2's bundle clean. See §6.

---

## 4. Files shipped

### Source

**Actions (Commits 1–3):**
- [`integrations/microsoft-excel/actions/updateRow.ts`](../../integrations/microsoft-excel/actions/updateRow.ts) + `.schema.ts` (Commit 1)
- [`integrations/microsoft-excel/actions/deleteRow.ts`](../../integrations/microsoft-excel/actions/deleteRow.ts) + `.schema.ts` (Commit 1)
- [`integrations/microsoft-excel/actions/renameWorksheet.ts`](../../integrations/microsoft-excel/actions/renameWorksheet.ts) + `.schema.ts` (Commit 2)
- [`integrations/microsoft-excel/actions/deleteWorksheet.ts`](../../integrations/microsoft-excel/actions/deleteWorksheet.ts) + `.schema.ts` (Commit 2)
- [`integrations/microsoft-excel/actions/addRow.ts`](../../integrations/microsoft-excel/actions/addRow.ts) + `.schema.ts` (Commit 3 — added `rows[]` batch mode)

**Triggers (Commit 4):**
- [`integrations/microsoft-excel/triggers/newWorksheet/`](../../integrations/microsoft-excel/triggers/newWorksheet/) (`schema.ts`, `activate.ts`, `index.ts`)
- [`integrations/microsoft-excel/triggers/updatedRow/`](../../integrations/microsoft-excel/triggers/updatedRow/) (`schema.ts`, `activate.ts`, `index.ts`)
- [`integrations/microsoft-excel/triggers/updatedTableRow/`](../../integrations/microsoft-excel/triggers/updatedTableRow/) (`schema.ts`, `activate.ts`, `index.ts`)

**Shared (Commit 4):**
- [`integrations/microsoft-excel/triggers/_shared/snapshot.ts`](../../integrations/microsoft-excel/triggers/_shared/snapshot.ts) — extended with `findChangedKeys`, `buildWorksheetListSnapshot`, `findNewWorksheets`, `ExcelWorksheetListSnapshot`
- [`integrations/microsoft-excel/triggers/_shared/pollingHandler.ts`](../../integrations/microsoft-excel/triggers/_shared/pollingHandler.ts) — `canHandle` extended to 5 event types; `pollWorksheet` + `pollTable` parameterized by `mode: "new" | "updated"`; new `pollWorksheetList` for `new_worksheet`

**API wrappers (Commits 1–2):**
- [`integrations/microsoft-excel/api/worksheetRangeDelete.ts`](../../integrations/microsoft-excel/api/worksheetRangeDelete.ts) (NEW — Commit 1)
- [`integrations/microsoft-excel/api/worksheetPatch.ts`](../../integrations/microsoft-excel/api/worksheetPatch.ts) (NEW — Commit 2)
- [`integrations/microsoft-excel/api/worksheetDelete.ts`](../../integrations/microsoft-excel/api/worksheetDelete.ts) (NEW — Commit 2)

**Manifest (Commit 4):**
- [`integrations/microsoft-excel/manifest.ts`](../../integrations/microsoft-excel/manifest.ts) — comment updated to "5 polling triggers" (capability flag was already `pollingTrigger: true`).

**Registry:** `services/execution/handlers/_registry.ts` updated once per actions commit (4 new entries across Commits 1–2). `add_row` batch mode does NOT add a new entry (Commit 3 extends the existing entry's handler in place). `integrations/_registry.ts` updated with 3 new trigger side-effect imports (Commit 4).

### Tests

| Commit | Schema/handler tests | Wrapper tests | E2E |
|---|---|---|---|
| 1 (`update_row` + `delete_row`) | 28 update + 11 delete + 16 update.schema + 12 delete.schema | 14 worksheetRangeDelete | n/a |
| 2 (`rename_worksheet` + `delete_worksheet`) | 11 rename + 11 delete + 9 rename.schema + 10 delete.schema | 11 worksheetPatch + 11 worksheetDelete | n/a |
| 3 (`add_row` batch) | +16 batch tests on existing `addRow.test.ts` | reuses existing | n/a |
| 4 (3 triggers) | 5 newWorksheet activate + 5 updatedRow activate + 4 updatedTableRow activate + extended snapshot.test.ts + extended pollingHandler.test.ts | n/a (no new wrapper) | n/a |
| 5 (e2e walkthrough extension) | n/a | n/a | 8 new scenarios in `slice-15-microsoft-excel-walkthrough.spec.ts`; **9/9 passing with `--workers=1`** |

**Excel focused subset after Commit 5:** 37 suites / 312 tests passing.
**Full Jest suite after Commit 5:** 621 suites / 5724 tests passing.

### Docs

- [`docs/slices/parity-microsoft-excel.md`](parity-microsoft-excel.md) (Commit 0 — audit; Commit 0b — accepted decisions)
- This file (Commit 6)
- CLAUDE.md updates (Commit 6 — Phase 2 progress entry + Deep Gotchas Excel patterns block)

---

## 5. Commit breakdown

| # | Commit hash | What landed |
|---|---|---|
| 0 | `1152624ab` | `docs(microsoft-excel): parity audit` |
| 0b | `4bc47aed4` | `docs(microsoft-excel): record accepted parity audit decisions` |
| 1 | `258018343` | `feat(microsoft-excel): add row update and delete actions` (`update_row` + `delete_row` + new `worksheetRangeDelete` wrapper) |
| 2 | `a2f0f19ac` | `feat(microsoft-excel): add worksheet rename and delete actions` (`rename_worksheet` + `delete_worksheet` + new `worksheetPatch` + `worksheetDelete` wrappers) |
| 3 | `02c3786f5` | `feat(microsoft-excel): add batch row insert mode` (existing `add_row` extended with XOR `values` / `rows[]` modes; `add_multiple_rows` folded; max 1000) |
| 4 | `9980b5775` | `feat(microsoft-excel): add new_worksheet, updated_row, updated_table_row triggers` (3 trigger directories + extended `_shared/{snapshot,pollingHandler}.ts` + 3 side-effect imports in `integrations/_registry.ts`) |
| 5 | `cd67a11ae` | `test(microsoft-excel): extend walkthrough with parity coverage` (8 new e2e scenarios + extended mockMicrosoftServer with range delete / worksheet patch / worksheet delete / table rows endpoints + 3 new control-plane endpoints) |
| 6 | (this commit) | `docs(microsoft-excel): document parity outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`
- Commit 5 additionally passed `npx playwright test tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts --workers=1` with **9/9 green**.

---

## 6. What's deferred

### Deferred indefinitely (open until product/infra change unblocks)

| Item | Why | What unblocks |
|---|---|---|
| `create_workbook` action | V1's implementation requires `require('exceljs')` CJS inside `.ts` to generate an empty XLSX in-process, plus a heavy binary dependency. Microsoft Graph has no native workbook-create endpoint that ships an empty XLSX file. The audit deferred per R-Excel-3 + Marcus acceptance (2026-05-14). | Either (a) ExcelJS is acceptable in V2's bundle (ops decision: bundle weight, license review), or (b) a Graph-native workbook-create path is found, or (c) a server-side template-file pattern lands (upload pre-built template via `/me/drive/root:/path:/content`, then operate on it). |
| Dynamic-field renderer for header-aware actions (`update_row`, `add_row` batch) | P-X1 acceptance defers this to Phase 3 UI work. Runtime handler-internal header reads are sufficient. | Phase 3 builder-UI work that introduces a per-provider dynamic-field protocol. |
| Workbook-session optimization (`/workbook/createSession`) | Graph supports session-scoped workbook operations that batch reads / writes inside a session for lower latency. V2 issues one Graph round-trip per call. Only relevant if profiling shows latency is a problem. | Profiling evidence + a perf budget that justifies the additional session-lifecycle complexity. |
| Role-based polling intervals | V1 had `free → 15min`, `pro → 2min`, `enterprise → 1min`. V2 uses `DEFAULT_INTERVAL_MS` uniformly. | A billing slice that justifies tier-aware polling cadence. Not Excel-specific. |
| `Files.ReadWrite.All` scope (SharePoint / shared-with-me workbooks) | Slice 15 used the narrower `Files.ReadWrite` deliberately — covers workbooks in the user's own OneDrive. | A workflow request that hits SharePoint-hosted workbooks. Scope upgrade is per-provider, not per-action. |

### Permanently skipped

| Item | Reason |
|---|---|
| `add_multiple_rows` registry entry | Folded into `add_row.rows[]`. No second handler, no alias, no schema redirect. |
| V1 `unifiedAction.ts` orphan | Not exported from V1's registry barrel — dead code. NOT PORTED. |
| V1 per-cell PATCH loop in `update_row` | Slow + Graph-rate-limit-hostile. V2 does one full-row PATCH. |
| V1 silent unknown-column skip in `update_row` | Hides workflow bugs. V2 fails loudly with all offenders listed. |
| V1 `addMultipleRows` silent chunking (200-row batches) + partial success | Breaks the all-or-nothing contract workflow authors expect. V2 rejects > 1000 at parse time. |
| Separate `EXCEL_CLIENT_ID` / `EXCEL_CLIENT_SECRET` Azure app | Slice 15 settled on shared Microsoft app via `_shared/microsoft/oauth.ts`. NOT REINTRODUCED. |
| Mixed `microsoft_excel_*` vs `microsoft-excel_*` registry naming | Inconsistency in V1's registry. V2 uses one convention. |
| `make_api_call` escape hatch | Same reasoning as Notion 2.1 — generic passthrough invites undocumented endpoint use without versioning safety. Gaps filled by targeted typed ports. |
| "First worksheet" / "active worksheet" silent fallback | Hides workflow bugs. V2 requires explicit `worksheetName`. |
| Snapshot-seed try/catch swallowing | Causes first-poll-miss bug. V2 throws and surfaces to the workflow author. |
| Tier-aware Excel polling intervals | See above — billing slice concern. |

---

## 7. E2E validation summary

Single Playwright spec covers the whole post-Slice-15 surface:
[`tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts`](../../tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts).

**9/9 passing with `--workers=1`** as of Commit 5.

| # | Scenario | What it asserts |
|---|---|---|
| 1 | (pre-existing happy path) `new_row` + `get_worksheets` | OAuth, encryption, dispatcher redirect URL, scope set, integration-row writeback, activation snapshot seeding, poll cycle, quiet-tick no-fire, no notifications on success |
| 2 | `update_row` action | usedRange GET (×3: activation + poll + action header-read), range PATCH (×1) at `A2:C2` with full merged values, output `{rowNumber, columnsUpdated, updatedColumns, address}` |
| 3 | `delete_row` action | range-delete POST at `"2:2"` with `shift: "Up"`, zero PATCH calls, output `deleted: true` |
| 4 | `rename_worksheet` action | worksheet PATCH with `{ name: <new> }`, output `renamed: true` + `newWorksheetName` + `oldWorksheetName` |
| 5 | `delete_worksheet` action | worksheet DELETE on the unrelated target sheet, trigger sheet untouched, output `deleted: true` |
| 6 | `add_row` batch mode | Exactly **1 usedRange GET** + **1 range PATCH** for the data sheet (no per-row loop), address `A2:C4`, output `{rowCount: 3, rowsAdded: 3, firstRowNumber: 2, lastRowNumber: 4, address}` |
| 7 | `new_worksheet` trigger | Baseline `[Sheet1, Sheet2]` → inject `Q4-Sales` → exactly 1 run; payload `{worksheetName, worksheetId, position}`; quiet baseline tick produces no additional run |
| 8 | `updated_row` trigger | Baseline 3 rows seeded → in-place value change at row 2 → exactly 1 run; payload `{rowIndex: 2, values, workbookId, worksheetName}`; quiet baseline; **positional-shift noise documented as accepted limitation, owned by unit tests + this doc — not exercised in e2e** |
| 9 | `updated_table_row` trigger | Baseline 3 stable-id rows → update at `index=1` → exactly 1 run; payload `{rowIndex: 1, values, tableName}`; assert `excelTableRowsList` called ≥2 (activation + poll); stable-id semantics verified |

### Mock Microsoft Graph extensions

[`tests/e2e/helpers/mockMicrosoftServer.ts`](../../tests/e2e/helpers/mockMicrosoftServer.ts) gained:

**Graph endpoints:**
- `POST .../range(address='...')/delete` — applies the deletion to in-memory state, records call.
- `PATCH .../worksheets('{name}')` — renames in place preserving position (rebuilds the Map preserving insertion order), returns updated resource.
- `DELETE .../worksheets('{name}')` — removes worksheet, returns 204.
- `GET .../tables/{tableName}/rows` — returns stable-id rows.

**State:**
- `excelTables: Map<workbookId, Map<tableName, ExcelTableRowState[]>>`.

**Control plane:**
- `POST /__updateExcelRow {workbookId, worksheetName, rowIndex, values}`.
- `POST /__injectExcelTable {workbookId, tableName, rows: [{index, values}]}`.
- `POST /__updateExcelTableRow {workbookId, tableName, index, values}`.

**Recorded-call types:**
- `RecordedWorksheetRangeDelete`, `RecordedWorksheetPatch`, `RecordedWorksheetDelete`, `RecordedTableRowsList`.

**`/__inspect` extended** to dump `excelTables` alongside `excelWorksheets`.

### Bugs found by e2e

**One e2e test expectation was wrong; no production bug.** Initial run
failed 3/9 — the 3 trigger tests probed for `output.payload`, but the
engine records the trigger step's output as `{ event: TriggerEvent }`
(see [`services/execution/engine.ts:193`](../../services/execution/engine.ts#L193)).
Fixed by reading the payload at `output.event.payload`. Re-run: 9/9.
No production code changed.

---

## 8. Acceptance criteria (post-merge)

- [x] 4 net-new actions registered in `services/execution/handlers/_registry.ts` (`update_row`, `delete_row`, `rename_worksheet`, `delete_worksheet`).
- [x] `add_row` extended with `rows[]` batch mode; no separate `add_multiple_rows` registry entry.
- [x] 3 net-new polling triggers registered via side-effect imports in `integrations/_registry.ts` (`new_worksheet`, `updated_row`, `updated_table_row`).
- [x] Single shared `microsoftExcelPollingHandler` covers all 5 Excel event types via `canHandle` predicate.
- [x] Every action handler routes through `refreshAndRetry`; no inline token decrypt.
- [x] Every wrapper routes through `_shared/microsoft/oauth.ts` + `surfaceGraphError`; no inline `fetch` calls bypass.
- [x] Every schema is `.strict()` — unknown fields rejected at design time.
- [x] `update_row` fails loudly on unknown columns; reports all offenders.
- [x] `update_row` PATCHes the full row (merged); does not issue per-cell PATCHes.
- [x] `delete_row` is single-row, explicit-rowNumber only; no search-and-delete.
- [x] `rename_worksheet` and `delete_worksheet` require explicit `worksheetName`; no "first sheet" fallback.
- [x] `add_row` batch mode: exactly one usedRange GET + one range PATCH; no silent chunking; rejects > 1000 rows at parse time.
- [x] `add_row` batch mode: `values` xor `rows`, never both, never neither.
- [x] All 3 new triggers seed their baseline snapshot at activation; failure throws (no first-poll-miss).
- [x] `updated_row` positional limitation accepted + documented (this file §2.7 + CLAUDE.md Deep Gotchas).
- [x] `updated_table_row` uses Graph's stable `index` — neighbor mutations do NOT fire.
- [x] `new_worksheet` rename fires the trigger (remove old + add new).
- [x] Manifest comment reflects 5 triggers; capability flag `pollingTrigger: true`.
- [x] No new ExcelJS / binary workbook-generation dependency.
- [x] No separate Azure AD app reintroduced; `MICROSOFT_CLIENT_ID` continues to serve every Microsoft provider.
- [x] No role-based polling intervals reintroduced; `DEFAULT_INTERVAL_MS` uniformly.
- [x] 9/9 e2e scenarios passing in `slice-15-microsoft-excel-walkthrough.spec.ts` with `--workers=1`.
- [x] Full Jest suite green (621 suites / 5724 tests passing).
- [x] Excel focused subset green (37 suites / 312 tests passing).

---

## 9. What's next (Excel roadmap)

Per parity-microsoft-excel §11 / §14:

- **Microsoft Excel parity is feature-complete.** No follow-up slice is scheduled.
- **`create_workbook`** remains deferred until ExcelJS or a Graph-native workbook-create path is explicitly accepted (see §6). No backlog ticket — re-opens only if a workflow specifically needs it.
- **SharePoint / shared-workbook support** would require widening the scope to `Files.ReadWrite.All`. Deferred until requested.
- **Workbook-session perf optimization** (`/workbook/createSession`) deferred until profiling justifies it.
- **Dynamic-field renderer** for header-aware actions remains Phase 3 UI work — not an Excel-specific concern.

Tracking lives in [`docs/slices/parity-microsoft-excel.md`](parity-microsoft-excel.md)
§§11–14. None of the deferred items have committed follow-up timing.
