# Google Sheets 2.1 — Cell + row + spreadsheet lifecycle outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) (accepted before Commit 2 began).
**Phase 1 predecessor:** [`docs/slices/slice-5-google-sheets.md`](slice-5-google-sheets.md) + [`docs/slices/slice-5b-google-sheets-walkthrough.md`](slice-5b-google-sheets-walkthrough.md) (5-action OAuth + webhook-trigger port; established the V2 Sheets baseline + Drive-`files.watch` transport for `row_changed`).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/google-sheets/`](../../integrations/google-sheets/).

Google Sheets 2.1 closes the highest-leverage action gaps from the
parity audit: 5 new actions spanning single-cell read/write, row
deletion + finder, and spreadsheet creation. The slice introduces
**zero new platform infrastructure** — every action fits Slice 5's
OAuth + `refreshAndRetry` + per-method `values.*` wrapper stack with
two new wrappers added for endpoints Slice 5 didn't yet touch
(`spreadsheetsBatchUpdate`, `spreadsheetsCreate`).

The largest qualitative change is that V1's kitchen-sink shape —
`unifiedAction.ts` add/update/delete router, `deleteRow.ts`'s
`deleteBy: "row_number" | "range" | "column_value"` dispatcher,
`createSpreadsheet.ts`'s template/initialData/Drive-folder chrome — is
NOT ported. V2 ships 5 typed `ActionHandler` modules with strict
schemas and locked output key sets.

---

## 1. Scope shipped

### Actions (5)

| Action | Sheets endpoint(s) | What it does | V1 reference |
|---|---|---|---|
| `get_cell_value` | `GET .../values/<sheetName>!<cell>` | Single-cell read. Returns `value` or `null` for blank cells. | `getCellValue.ts` |
| `update_cell` | `PUT .../values/<sheetName>!<cell>` | Single-cell write. Q11 `valueInputOption` required (no hidden default). | `updateCell.ts` |
| `delete_row` | `GET .../v4/spreadsheets/{id}` + `POST .../v4/spreadsheets/{id}:batchUpdate` | Single-row deletion by 1-indexed row number. Resolves sheetName → sheetId via metadata GET, then sends one `deleteDimension` request. | `deleteRow.ts` (row_number path only) |
| `find_row` | `GET .../values/<sheetName>` | Full-sheet read + client-side header-resolved scan. equals-only operator. First-match or `returnAll`. | `findRow.ts` (equals path only) |
| `create_spreadsheet` | `POST /v4/spreadsheets` | Bare spreadsheet creation. `title` required + optional `initialSheetName`. | `createSpreadsheet.ts` (bare-API path only) |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Google Sheets action total after 2.1: 10** (5 Slice 5 + 5 Google Sheets 2.1).

### API wrappers (2 new modules)

| Wrapper | Module | Used by |
|---|---|---|
| `spreadsheetsBatchUpdate` | NEW [`api/spreadsheetsBatchUpdate.ts`](../../integrations/google-sheets/api/spreadsheetsBatchUpdate.ts) | `delete_row` (and future Sheets 2.2 `format_range` via `repeatCell`) |
| `spreadsheetsCreate` | NEW [`api/spreadsheetsCreate.ts`](../../integrations/google-sheets/api/spreadsheetsCreate.ts) | `create_spreadsheet` |

Existing Slice 5 wrappers reused without modification:

| Wrapper | Reused by |
|---|---|
| `valuesGet` | `get_cell_value`, `find_row` |
| `valuesUpdate` | `update_cell` |
| `spreadsheetsGet` | `delete_row` (sheetName → sheetId resolution) |

All 7 wrappers (5 existing + 2 new) follow the same shape:

- 401 → `Unauthorized401Error` (caught by `refreshAndRetry`).
- 404 → `NotFoundError(resourceLabel, detail?)`.
- 400 with `error.status === "INVALID_ARGUMENT"` → also `NotFoundError` (missing sheet tab inside a known spreadsheet; Sheets returns 400, not 404, for that case).
- Other non-2xx → tagged `Error("Google Sheets <op> failed: <surfaced message>")`.
- `GOOGLE_SHEETS_API_BASE` env override honored — every wrapper.

**Zero changes** to `_base.ts` / `errors.ts`.

### Manifest scope changes

**None.** Slice 5's full `https://www.googleapis.com/auth/spreadsheets`
scope covers every read + write surface added by Google Sheets 2.1.
No OAuth flow, no scope widening, no capability changes.

---

## 2. Durable decisions worth preserving

### 2.1 Typed actions only — no kitchen-sink router

V1 had a 123-LOC [`unifiedAction.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/unifiedAction.ts)
router that dispatched between `createGoogleSheetsRow` /
`updateGoogleSheetsRow` / `deleteGoogleSheetsRow` based on a
`config.action: "add" | "update" | "delete"` field. Same shape as
Notion's `manage_*` routers and Slack's combined dispatchers.

V2 ships every Sheets endpoint as its own typed `ActionHandler`.
One action = one Sheets endpoint = one strict schema = one locked
output key set. No `action` discriminator. No router.

### 2.2 Cell actions are single-cell only — no range smuggling

`get_cell_value` and `update_cell` validate the `cell` field against
the regex `^[A-Za-z]+[0-9]+$`. Ranges (`A1:B5`), full columns (`A:A`),
full rows (`1:1`), and bare letters/digits are rejected at parse
time. Workflows that want range reads/writes use `read_rows` /
`update_row` / `clear_range` from Slice 5; cell actions exist
precisely to avoid the array-of-arrays output (`read_rows`) when the
caller knows they want a scalar.

Schemas accept `sheetName` + `cell` separately and the handler builds
the A1 range as `<sheetName>!<cell>` — no implicit default sheet, no
range syntax leaking into the input shape.

### 2.3 `valueInputOption` is REQUIRED (Q11) — no hidden default

`update_cell` (and by extension every Sheets write handler) requires
`valueInputOption: "RAW" | "USER_ENTERED"` at the schema layer.
V1's `updateCell.ts` silently defaulted to `USER_ENTERED` which
surprised users when literal cell values containing `=` were parsed
as formulas. V2 forces the choice. Matches Slice 5's same rule for
`append_row` + `update_row`.

### 2.4 Empty-cell convention: `value: null`

`get_cell_value` maps an empty cell (Sheets returns no `values` key
or an empty array) to `value: null` — not `""`, not `undefined`.
Downstream workflows branch on `{{node.value}} == null`. Documented
in the schema comment and pinned by 2 unit tests + the e2e walkthrough's
positive path (which asserts `value: "Name"` from a populated cell to
prove the read pipe works).

### 2.5 `delete_row` is explicit single-row only

V1's `deleteRow.ts` was a router accepting:
- `deleteBy: "row_number" | "range" | "column_value"`,
- `rowSelection: "last" | "first_data"` shortcuts,
- `deleteAll: boolean` cascade for column-value matches,
- `confirmDelete` UI gate,
- `deletedData` output containing the pre-delete row contents.

V2 ships `delete_row` with just `(spreadsheetId, sheetName, rowNumber)`.
Range deletion composes via multiple `delete_row` calls in descending
order. Column-value deletion composes via `find_row` (with
`returnAll: true`) → loop of `delete_row` calls. The kitchen-sink
shape is V1 chrome the audit explicitly skipped (parity-google-sheets.md
GS-R1).

`rowNumber` is validated as `int().min(1)` — 1-indexed, no floats,
no negatives, no `0`. The handler computes the Sheets API's half-open
range as `{startIndex: rowNumber - 1, endIndex: rowNumber}`.
`sheetId === 0` (the default sheet's id) is guarded for properly — V1
had a falsy-check bug here but V2's `sheetId === undefined || sheetId === null`
guard handles `0` correctly.

### 2.6 `find_row` is equals-only, case-sensitive, header-name only

V1's `findRow.ts` shipped:
- `searchColumn` accepting header name OR single-letter shortcut OR `*` wildcard for all columns,
- `matchType: "exact" | "contains" | "starts_with"`,
- case-insensitive matching via `toLowerCase()`,
- a `normalizeBooleanValue` heuristic that mapped `yes`/`y`/`true`/`1`/`on`/`enabled` → `true` and the corresponding negatives → `false`.

V2 ships:
- `column: string` (header name only — no letter shorthand, no wildcard),
- `operator: z.literal("equals")` (forward-compat enum widening; Sheets 2.2 or follow-up can add `"contains"` / `"starts_with"` / `"greater_than"` non-breakingly),
- case-sensitive `String(cell) === String(value)` coerced equality (handles numeric stored as number vs string-passed value),
- empty cells skipped during scan (matches V1).

The `value` union is `string | number | boolean` — `null` is
intentionally excluded; "find blank cells" is a different operation
deferred to on-demand follow-up.

### 2.7 Uniform `find_row` output across single + multi modes

V1 returned different output shapes for single match vs not-found.
V2's output is uniform regardless of `returnAll`:

```ts
{
  spreadsheetId, sheetName, column,
  found: boolean,          // !!matches.length
  firstMatch: { rowNumber, rowData } | null,
  matches: Array<{ rowNumber, rowData }>,
  count: number,
}
```

Single-match workflows reference `{{node.firstMatch.rowData.Email}}`;
multi-match workflows iterate `{{node.matches}}`. `rowNumber` is
1-indexed including the header row (header at row 1, first data row
at row 2). `rowData` is a `header → value` map with missing trailing
cells backfilled to `null`.

### 2.8 `create_spreadsheet` ships the bare API surface only

V1's `createSpreadsheet.ts` (302 LOC) shipped:
- `template: "blank" | "budget" | "project" | "crm" | "inventory" | "calendar"` with hardcoded headers + sample rows per template,
- `initialData` CSV prefill (custom CSV parser → `values.update` post-create),
- `description` as a follow-up `batchUpdate` writing the description into A1's note metadata (workaround for Sheets API not supporting spreadsheet descriptions natively),
- `folder` placement via a secondary `drive.files.update` call,
- `locale` / `timeZone` overrides (with Q12 workspace/user resolution as fallbacks),
- `sheetNames: string[]` multi-sheet array + a `customSheets` config shape,
- silent `title = 'New Spreadsheet'` default,
- hardcoded `gridProperties: { rowCount: 1000, columnCount: 26 }`.

V2 ships `create_spreadsheet` with just `title` (required) +
`initialSheetName` (optional). Omitting `initialSheetName` sends NO
`sheets[]` field, letting Google create the default `Sheet1`.
Providing it sends `sheets: [{ properties: { title } }]` only — no
sheetId/index/gridProperties passthrough. Template / CSV prefill /
description / folder / locale / multi-sheet / silent default — all
NOT ported per audit GS-R10.

The handler does NOT wrap the call in Q4 idempotency: create-shaped
actions don't need session-side-effect dedup because workflow re-runs
naturally create a new spreadsheet, which is the right semantics.

### 2.9 No raw API body passthrough on any 2.1 action

Every schema is `.strict()` — V1's kitchen-sink field names fail at
design time:

| Action | Rejected V1 fields |
|---|---|
| `get_cell_value` | `cellAddress`, `valueRenderOption` |
| `update_cell` | `cellAddress`, `range`, `values` (V1-style array) |
| `delete_row` | `deleteBy`, `rowSelection`, `startRow`, `endRow`, `matchColumn`, `matchValue`, `deleteAll`, `confirmDelete` |
| `find_row` | `searchColumn`, `searchValue`, `matchType` |
| `create_spreadsheet` | `template`, `initialData`, `description`, `sheets`, `folder`, `locale`, `timeZone`, `sheetNames` |

Strict-mode rejection is pinned by tests for every action.

### 2.10 `spreadsheetsBatchUpdate` wrapper is untyped on the request shape

The Sheets `batchUpdate` umbrella covers dozens of request types
(`deleteDimension`, `insertDimension`, `repeatCell`, `updateCells`,
`addSheet`, etc.). The wrapper accepts `requests: ReadonlyArray<Record<string, unknown>>`
and trusts the caller to build typed requests inline. `delete_row` is
the first consumer (single `deleteDimension` request); Sheets 2.2's
`format_range` will be the second (single `repeatCell` request).
Locking down the request shape at the wrapper level would force a
discriminated union with every Sheets batchUpdate request type — not
worth the maintenance cost.

### 2.11 Auxiliary calls also wrapped in `refreshAndRetry`

`delete_row`'s `spreadsheetsGet` lookup (sheetName → sheetId) is
wrapped in `refreshAndRetry` alongside its principal `batchUpdate`
call — both calls get token-decryption + 401 retry mediated by the
same wrapper. Per CLAUDE.md §"OAuth 401 handling" rule that auxiliary
calls also route through `refreshAndRetry`.

---

## 3. V1 rot fixed (consolidated)

All entries from parity-google-sheets §8 are addressed:

| ID | Pattern | V2 status |
|---|---|---|
| GS-R1 | `unifiedAction.ts` 123-LOC add/update/delete router | NOT PORTED — V2 ships separate typed actions |
| GS-R2 | Hyphenated action type name (`google-sheets_action_export_sheet`) | NOT PORTED — `export_sheet` is permanently skipped |
| GS-R3 | Orphan handlers `createRow.ts` (459 LOC) + `listRows.ts` (366 LOC) | NOT PORTED — `append_row` (Slice 5) covers createRow; `export_sheet` skipped |
| GS-R4 | `parseInt(config.maxRows) \|\| 100` silent default coercion | NOT PORTED — V2 schema rejects invalid values loudly |
| GS-R5 | String-typed booleans (`config.is_inline === "true"`) | NOT PORTED — V2 schemas use `z.boolean()` |
| GS-R6 | V1 `listRows.ts` silent partial failure shape | NOT PORTED — V2 wrappers throw typed errors |
| GS-R7 | V1 trigger's `O(rows × workflows)` per-row signature snapshot | NOT IN 2.1 SCOPE — gated by P-GS1 product decision |
| GS-R8 | V1 `find_row` full-sheet read on every execution | DOCUMENTED — Sheets API has no server-side filter; V2 ships the same client-side scan with the cost called out in schema docs (audit R-1) |
| GS-R9 | No V1 unit tests for any Sheets handler | FIXED — V2 has 21 suites / 231 tests covering the 10-action surface |
| GS-R10 | V1 `createSpreadsheet` template chrome (budget/project/crm/...) + CSV prefill + folder placement + description-as-note workaround | NOT PORTED — V2 ships bare API surface only |
| GS-R11 | V1 `formatRange` schema with ~25 inputs | DEFERRED — Sheets 2.2 will ship a typed-subset (color + bold/italic + alignment + number format) |

---

## 4. Files shipped

### Source

**Actions (Commits 2-4):**
- [`integrations/google-sheets/actions/getCellValue.ts`](../../integrations/google-sheets/actions/getCellValue.ts) + `.schema.ts` (Commit 2)
- [`integrations/google-sheets/actions/updateCell.ts`](../../integrations/google-sheets/actions/updateCell.ts) + `.schema.ts` (Commit 2)
- [`integrations/google-sheets/actions/deleteRow.ts`](../../integrations/google-sheets/actions/deleteRow.ts) + `.schema.ts` (Commit 3)
- [`integrations/google-sheets/actions/findRow.ts`](../../integrations/google-sheets/actions/findRow.ts) + `.schema.ts` (Commit 3)
- [`integrations/google-sheets/actions/createSpreadsheet.ts`](../../integrations/google-sheets/actions/createSpreadsheet.ts) + `.schema.ts` (Commit 4)

**API wrappers (NEW):**
- [`integrations/google-sheets/api/spreadsheetsBatchUpdate.ts`](../../integrations/google-sheets/api/spreadsheetsBatchUpdate.ts) (Commit 3)
- [`integrations/google-sheets/api/spreadsheetsCreate.ts`](../../integrations/google-sheets/api/spreadsheetsCreate.ts) (Commit 4)

**Registry:** [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) updated three times (5 new entries total).

### Tests

| Commit | Wrapper tests | Handler tests | Schema validation tests (subset of handler suite) | Manifest/registry tests |
|---|---|---|---|---|
| 2 | n/a (reuses Slice 5 wrappers) | 16 get_cell_value + 19 update_cell | 8 + 9 | +1 manifest + 1 registry |
| 3 | 9 (spreadsheetsBatchUpdate) | 16 delete_row + 22 find_row | 5 + 7 | +1 manifest + 1 registry |
| 4 | 13 (spreadsheetsCreate) | 13 create_spreadsheet | 4 | +1 manifest + 1 registry |

**Google Sheets focused subset after Commit 4: 21 suites / 231 tests
passing** (`npx jest tests/unit/integrations/google-sheets/ tests/unit/services/execution/handlers/`).

### E2E

- [`tests/e2e/helpers/mockGoogleServer.ts`](../../tests/e2e/helpers/mockGoogleServer.ts) extended with `spreadsheets.create` + `spreadsheets.batchUpdate` mock handlers + `RecordedSheetsSpreadsheetsCreate` / `RecordedSheetsSpreadsheetsBatchUpdate` types.
- [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) extended with a single test exercising all 5 new actions as a linear chain off the existing `row_changed` trigger. **2/2 tests pass in 37.4s under `--workers=1`.**

### Docs

- [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) (Commit 0 — audit)
- This file (Commit 5)
- CLAUDE.md updates (Commit 5)

---

## 5. Commit breakdown (5)

| # | Commit hash | What landed |
|---|---|---|
| 0 | `939c78de8` | `docs: add Google Sheets parity audit` |
| 1 | `eb8e3d6d7` | `feat(google-sheets): add cell actions` (`get_cell_value`, `update_cell`) |
| 2 | `ae68ef171` | `feat(google-sheets): add row actions` (`delete_row`, `find_row` + new `spreadsheetsBatchUpdate` wrapper) |
| 3 | `40ee447e7` | `feat(google-sheets): add create spreadsheet action` (`create_spreadsheet` + new `spreadsheetsCreate` wrapper) |
| 4 | `c014f49c0` | `test(google-sheets): extend walkthrough with 2.1 actions` (mock additions + e2e chain) |
| 5 | (this commit) | `docs(google-sheets): document 2.1 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test` (Google Sheets subset green throughout; unrelated parallel-chat dirty files noted in each commit's report)
- (Commit 4 also) `npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts --workers=1`

Final unit-test totals after Commit 4: **621 suites / 5724 tests
passing.** Google Sheets focused subset: **21 suites / 231 tests
passing.** Google Sheets e2e: **2 tests / 2 passing.**

---

## 6. Acceptance criteria (post-merge)

- [x] 5 actions registered in `services/execution/handlers/_registry.ts`.
- [x] 2 new wrapper modules (`spreadsheetsBatchUpdate.ts`, `spreadsheetsCreate.ts`); 3 existing wrappers reused (`valuesGet`, `valuesUpdate`, `spreadsheetsGet`).
- [x] Every wrapper routes through `fetch` with `Authorization: Bearer ...` — no shared client object.
- [x] Every handler uses `refreshAndRetry` with `accountId = triggerEvent.accountId` when the trigger is google-sheets, `null` otherwise.
- [x] Every schema is `.strict()` — unknown fields rejected at design time. V1 field names (`deleteBy`, `searchColumn`, `template`, `initialData`, etc.) explicitly tested as rejected.
- [x] `delete_row` is single-row only — no `deleteBy` router, no range/column-value mode.
- [x] `find_row` is equals-only, header-name only, case-sensitive coerced equality. `null` value rejected at schema time.
- [x] `find_row` output uniform across single + returnAll modes — same key set.
- [x] `create_spreadsheet` ships the bare `spreadsheets.create` surface — `title` required + `initialSheetName` optional; no template, no initialData, no Drive folder, no locale/timeZone.
- [x] `get_cell_value` and `update_cell` accept A1 single-cell references only — ranges / full columns / full rows rejected at parse time.
- [x] `valueInputOption` REQUIRED on `update_cell` (Q11 rule).
- [x] All 5 Google Sheets 2.1 actions present and registered. ✓

---

## 7. What's deferred

### Deferred to Google Sheets 2.2 (batch + formatting)

| Item | Audit recommendation |
|---|---|
| `batch_update` action | PORT — multi-range update via `values.batchUpdate` (DIFFERENT endpoint from `spreadsheets.batchUpdate`). Workflow pattern: "update cells A1, B2, C3 in one call." More efficient than N `update_row` calls. New `valuesBatchUpdate` wrapper required. |
| `format_range` action | PORT (high effort) — cell formatting via `spreadsheets.batchUpdate` with `repeatCell` request. Typed-and-bounded schema covering background/text color, bold/italic, alignment, number format. Borders + conditional formatting + data validation deferred to on-demand (P-GS2). |

### Deferred to Google Sheets 2.3 (trigger expansion — CONDITIONAL)

| Item | Gating |
|---|---|
| `row_changed` `changeKind: "updated"` + `"removed"` | Gated by **P-GS1** product decision on per-row diff detection. Audit recommends bounded-window snapshot (option (b), default 1,000 rows, max 10,000) — but this requires Marcus's product call before engineering starts. |
| `new_worksheet` trigger | PORT-WHEN-NEEDED. Same Drive `files.watch` transport (the watch fires on tab additions too because they bump `modifiedTime`). Lower frequency need than row-level triggers. |

### Permanently skipped

| Item | Reason |
|---|---|
| `unifiedAction` router pattern (add/update/delete dispatch) | V1 kitchen-sink shape. Same skip as Notion's `manage_*` routers (audit GS-R1). |
| `export_sheet` action (V1 hyphenated `google-sheets_action_export_sheet`) | V1 chrome with 12-operator filter UI. Workflow authors compose `read_rows` + downstream filter logic (or `find_row` with future `contains` / `starts_with` operators). The UI niceties belong to the builder, not the runtime. |
| `createRow.ts` orphan handler | Folded into `append_row` (Slice 5). |
| `listRows.ts` orphan handler | Folded into `read_rows` (Slice 5) + composes with `find_row`. |
| V1 `unifiedAction` `action: "add" \| "update" \| "delete"` discriminator | Per audit §7 GS-R1 + §13 cross-cutting decisions. |
| V1 `deleteRow.ts` `deleteBy` router + `rowSelection` shortcuts + `deleteAll` cascade + `confirmDelete` UI gate + `deletedData` output | Per audit §7. Composition via `find_row` + multiple `delete_row` calls. |
| V1 `findRow.ts` `searchColumn: '*'` wildcard | Equals-only single-column find in 2.1; multi-column / wildcard composition is downstream work. |
| V1 `findRow.ts` single-letter column shorthand (`A`, `B`) | Header-name only in 2.1. Letter / numeric index shortcuts are non-breaking future expansions. |
| V1 `findRow.ts` case-insensitive matching + `normalizeBooleanValue` heuristic (yes/y/true/1/on → true) | V2 is case-sensitive coerced equality. Boolean inputs are typed (`z.boolean()`), not stringly. |
| V1 `createSpreadsheet.ts` template chrome (budget/project/crm/inventory/calendar with hardcoded headers + sample rows) | Builder concern, not workflow runtime. |
| V1 `createSpreadsheet.ts` `initialData` CSV prefill + custom CSV parser | Composes with `update_row` / `append_row` post-create. |
| V1 `createSpreadsheet.ts` `description` as A1-note workaround via follow-up `batchUpdate` | Too-clever-by-half; not real spreadsheet metadata. |
| V1 `createSpreadsheet.ts` `folder` placement via secondary `drive.files.update` call | Composes with a future Drive `move_file` action. |
| V1 `createSpreadsheet.ts` `locale` / `timeZone` overrides + Q12 workspace/user resolution | Google defaults to the user's account locale, which is what workflows want 99% of the time. Engine-side concern, not handler-side. |
| V1 silent `title = 'New Spreadsheet'` default | V2 schema requires `title` explicitly (Q11 spirit). |
| V1 hardcoded `gridProperties: { rowCount: 1000, columnCount: 26 }` on per-sheet body | Google's defaults are fine. |
| V1 `parseInt(rowNumber.toString())` coercion + silent fallback | V2 schema enforces `int().min(1)`. |

---

## 8. CLAUDE.md updates landed

A new "Phase 2 progress (Google Sheets)" subsection adds the
Google Sheets 2.1 entry under the existing Phase 2 progress block.
Plus a short "Deep Gotchas → Google Sheets Phase 2 patterns"
subsection records the durable rules:

- Google Sheets Phase 2 actions stay typed and narrow; do NOT recreate V1's `unifiedAction` router or `deleteRow.ts`'s `deleteBy` kitchen-sink dispatch.
- Cell actions are single-cell only — A1 regex enforced.
- `delete_row` is explicit single-row deletion by 1-indexed row number; range / column-value / cascade modes compose via `find_row` + multiple `delete_row` calls.
- `find_row` is equals-only, case-sensitive, header-name only in Sheets 2.1; `contains` / `starts_with` / column-letter shortcuts / wildcard are non-breaking future expansions.
- `create_spreadsheet` ships the bare `spreadsheets.create` surface only — no template chrome, no CSV prefill, no Drive folder placement, no locale/timeZone overrides, no silent title default.
- `valueInputOption` REQUIRED on every Sheets write handler (Q11).

---

## 9. What's next (Google Sheets roadmap)

Per parity-google-sheets §11 / §13:

- **Google Sheets 2.2** — batch + formatting (~4 commits): `batch_update` (multi-range update via `values.batchUpdate`) + `format_range` (typed-subset cell formatting via `spreadsheets.batchUpdate` + `repeatCell`). New `valuesBatchUpdate` wrapper + extends `spreadsheetsBatchUpdate` for `repeatCell` requests.
- **Google Sheets 2.3** — trigger expansion (~5–6 commits, CONDITIONAL on **P-GS1** product decision for per-row diff snapshot storage design). Extends `row_changed` to emit `changeKind: "updated"` + `"removed"`. Optionally adds `new_worksheet` trigger.

Tracking lives in [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md)
§§11–13. None of the deferred items are committed for follow-up
timing in this slice.
