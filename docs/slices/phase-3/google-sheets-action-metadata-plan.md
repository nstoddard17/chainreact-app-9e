# Slice 3.GSHEETS-1 — Google Sheets Action Metadata Plan

**Status:** Planning / documentation. No runtime code in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Date:** 2026-05-24.
**Pairs with:**
- [`./build-resume-provider-coverage-checkpoint.md`](./build-resume-provider-coverage-checkpoint.md) — BUILD-RESUME-1 picked Google Sheets as the next provider.
- [`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md) — prior provider-coverage checkpoint.
- [`./stripe-action-metadata-plan.md`](./stripe-action-metadata-plan.md) — most recent provider metadata plan (Stripe — closest precedent for the 12-handler shape).
- [`./notion-action-metadata-plan.md`](./notion-action-metadata-plan.md) — Notion plan (paste-JSON precedent for nested-object fields).
- [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md) — Slack plan (precedent for the `optionsSource` resolver pattern).
- [`../security/completed-metadata-security-compliance-audit.md`](../security/completed-metadata-security-compliance-audit.md) — POSTSEC-1 audit rules every new meta inherits.
- [`../parity/parity-google-sheets.md`](../parity/parity-google-sheets.md) — parity audit (every action is already PORTed; meta is the remaining surface).

This is the planning slice for Google Sheets metadata coverage. Every count + handler signature + schema field below was verified live against the source tree at `7420f6b9f`. No metas / resolvers / handler changes ship in this slice.

---

## 1. Current Google Sheets Inventory

### 1.1 Action handlers (12 registered, 0 metas — fully uncovered today)

Read live from `services/execution/handlers/_registry.ts:307-341` and `integrations/google-sheets/actions/`.

| # | Action key | Handler file | Schema file | Notes |
| --- | --- | --- | --- | --- |
| 1 | `google-sheets:read_rows` | `readRows.ts` | `readRows.schema.ts` | Read — values.get with majorDimension |
| 2 | `google-sheets:append_row` | `appendRow.ts` | `appendRow.schema.ts` | Write — values.append; single row only |
| 3 | `google-sheets:update_row` | `updateRow.ts` | `updateRow.schema.ts` | Write — values.update at explicit range |
| 4 | `google-sheets:clear_range` | `clearRange.ts` | `clearRange.schema.ts` | Destructive — clears values; preserves formatting |
| 5 | `google-sheets:get_sheet_metadata` | `getSheetMetadata.ts` | `getSheetMetadata.schema.ts` | Read — spreadsheets.get; spreadsheet structure |
| 6 | `google-sheets:get_cell_value` | `getCellValue.ts` | `getCellValue.schema.ts` | Read — single-cell read |
| 7 | `google-sheets:update_cell` | `updateCell.ts` | `updateCell.schema.ts` | Write — single-cell write |
| 8 | `google-sheets:delete_row` | `deleteRow.ts` | `deleteRow.schema.ts` | Destructive — batchUpdate deleteDimension; single row |
| 9 | `google-sheets:find_row` | `findRow.ts` | `findRow.schema.ts` | Read — client-side scan, equals-only operator |
| 10 | `google-sheets:create_spreadsheet` | `createSpreadsheet.ts` | `createSpreadsheet.schema.ts` | Create — spreadsheets.create |
| 11 | `google-sheets:batch_update` | `batchUpdate.ts` | `batchUpdate.schema.ts` | Write — values.batchUpdate; up to 100 ranges |
| 12 | `google-sheets:format_range` | `formatRange.ts` | `formatRange.schema.ts` | Write — repeatCell; typed-subset cell formatting |

### 1.2 Trigger handlers (2 registered, 0 metas)

Read live from `integrations/google-sheets/triggers/`.

| Trigger key | Activation | Schema | Notes |
| --- | --- | --- | --- |
| `google-sheets:new_worksheet` | Webhook (Drive `files.watch`) | `triggers/newWorksheet/schema.ts` — `NewWorksheetInputConfigSchema` | Fires when a new tab appears. Single config field: `spreadsheetId`. |
| `google-sheets:row_changed` | Webhook (Drive `files.watch`) | `triggers/rowChanged/schema.ts` — `RowChangedInputConfigSchema` | Fires per-row diff. Five config fields: `spreadsheetId`, `sheetName`, `headerRow`, `changeKinds[]`, `snapshotRowLimit`, `keyColumn`. |

`_shared/snapshot.ts` is a snapshot helper, not a trigger.

### 1.3 Missing metadata count

- **12 action metas missing** (every registered handler).
- **2 trigger metas missing** (every registered trigger).
- **Total: 14 metas to add across the arc.**
- Google Sheets is **fully uncovered** today — not partial. No prior meta exists.

### 1.4 Net comparison vs. BUILD-RESUME-1 checkpoint

The checkpoint said "12 action handlers." Confirmed live at 12. The checkpoint did not separately count trigger sub-dirs (`newWorksheet` + `rowChanged` + `_shared` = 3 dirs; 2 real triggers). Confirmed live at 2 triggers.

---

## 2. Per-Action Inventory

For each registered action: configurable fields, output shape, recommended risk classification, sensitive-output recommendations, optionsSource needs, blockers.

### 2.1 `google-sheets:read_rows`

- **Fields** (from `ReadRowsConfigSchema`):
  - `spreadsheetId` — required, string.
  - `range` — required, A1 string (e.g. `"Sheet1!A:Z"`).
  - `majorDimension` — `"ROWS" | "COLUMNS"`, default `"ROWS"`.
  - `valueRenderOption` — optional, `"FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA"`.
- **Output** (from handler): `range` (string), `majorDimension` (string), `values` (2D array of cell values), `count` (number).
- **Risk:** `low` (read-only). `isDestructive: false`. `requiresConfirmation: false`.
- **Sensitive outputs:** `values` MUST be `sensitive: true` (user-typed cell content is the dominant case). `range`, `majorDimension`, `count` non-sensitive scalars.
- **Resolver needs:** `spreadsheetId` benefits from an async picker (`google-sheets:spreadsheets`). `range` stays text — A1 syntax doesn't map cleanly to a picker.
- **Concerns:** None — clean read action.

### 2.2 `google-sheets:append_row`

- **Fields**:
  - `spreadsheetId` — required.
  - `range` — required, A1 string.
  - `values` — required, 1D array `(string | number | boolean | null)[]`. Single row.
  - `valueInputOption` — required Q11, `"RAW" | "USER_ENTERED"`. **No default.**
  - `insertDataOption` — `"INSERT_ROWS" | "OVERWRITE"`, default `"INSERT_ROWS"`.
- **Output:** `spreadsheetId`, `tableRange` (string | null), `updatedRange`, `updatedRows`, `updatedColumns`, `updatedCells` (numbers).
- **Risk:** `medium`. External write; reversible by `delete_row` but not trivially. `isDestructive: false` (the row is additive). `requiresConfirmation: false`.
- **Sensitive outputs:** The output is structural scalars + ranges — `sensitive: false` across the board. Note: the INPUT `values` may carry sensitive data; meta cannot mark inputs sensitive — that's a runtime/redaction concern handled separately (sensitive outputs only).
- **Resolver needs:** `spreadsheetId` → async picker. `range` stays text.
- **Field type for `values`:** `textarea` with paste-JSON guidance OR a new field type. **Recommendation: `textarea` paste-JSON** — same precedent as Stripe `lineItems`, Notion `properties`, Slack `post_interactive_blocks.blocks`. Each element of `values` is a primitive, so `paste a JSON array` works well.
- **Field type for `valueInputOption`:** `select` with options `RAW` / `USER_ENTERED`. **Q11 no default** (matches schema).
- **Concerns:** Q11 absence-of-default needs explicit copy explaining the choice (V1 silently defaulted to RAW).

### 2.3 `google-sheets:update_row`

- **Fields**:
  - `spreadsheetId` — required.
  - `range` — required, A1 string (caller passes the exact target like `"Sheet1!A5:Z5"`).
  - `values` — required, 1D array.
  - `valueInputOption` — required Q11.
- **Output:** `spreadsheetId`, `updatedRange`, `updatedRows`, `updatedColumns`, `updatedCells`.
- **Risk:** `medium`. External write; overwrites existing cells. **Borderline `high`** — overwriting a range without backup is hard to reverse (the prior values are gone unless the workflow snapshotted them). POSTSEC-3 precedent (5 Stripe actions promoted to `requires_confirmation_text` while staying `riskLevel: "high"`) is the template. **Recommend `medium` for V1; revisit if user reports a misfire** — POSTSEC-3 was a reaction to live misfires, not a prophylactic.
- **Sensitive outputs:** non-sensitive (range + counts).
- **Resolver needs:** same as append_row.
- **Concerns:** Q11 + overwrite semantics. Description should explicitly warn "this OVERWRITES cells in `range` — undo requires having saved the prior values."

### 2.4 `google-sheets:clear_range`

- **Fields**:
  - `spreadsheetId` — required.
  - `range` — required, A1 string.
- **Output:** `spreadsheetId`, `clearedRange`.
- **Risk:** **`high` + `isDestructive: true` + `requiresConfirmation: true`.** Clearing cells removes user data; recoverable only via Sheets version history (out of workflow scope). Same shape as `notion:archive_page`, `slack:delete_message`, `gmail:delete_email`.
- **Sensitive outputs:** non-sensitive.
- **Resolver needs:** spreadsheet picker.
- **Concerns:** **This is the first destructive Google Sheets action.** Inherits the SEC-4B confirmation gate + POSTSEC-5 modal + POSTSEC-8 audit notification automatically once the meta is correctly classified. `riskDescription` should explicitly call out "preserves formatting / data validation; only the VALUES are removed."

### 2.5 `google-sheets:get_sheet_metadata`

- **Fields**: `spreadsheetId` only.
- **Output:** `spreadsheetId`, `title`, `locale`, `timeZone`, `sheets[]` (each: `sheetId`, `title`, `index`, `sheetType`, `rowCount`, `columnCount`).
- **Risk:** `low` (read-only).
- **Sensitive outputs:** `title` MAY be sensitive (workbook name can be PII-adjacent like a project / customer name) but defaulting to `sensitive: false` matches Notion's approach to titles. `sheets[].title` similar. Recommend non-sensitive for V1.
- **Resolver needs:** spreadsheet picker.
- **Concerns:** None — clean.

### 2.6 `google-sheets:get_cell_value`

- **Fields**:
  - `spreadsheetId` — required.
  - `sheetName` — required.
  - `cell` — required, A1 single-cell (e.g. `"A1"`).
- **Output:** `spreadsheetId`, `sheetName`, `cell`, `value` (string | number | boolean | null).
- **Risk:** `low` (read-only).
- **Sensitive outputs:** `value` MUST be `sensitive: true` (arbitrary user-typed content). Other fields non-sensitive.
- **Resolver needs:** spreadsheet picker + sheet picker (`google-sheets:sheets` with `dependsOn: spreadsheetId`). The `cell` field stays text — A1 cell typing doesn't benefit from a picker.
- **Concerns:** First action that uses `sheetName` separately. Validates the two-hop cascade.

### 2.7 `google-sheets:update_cell`

- **Fields**:
  - `spreadsheetId`, `sheetName`, `cell` — same shape as `get_cell_value`.
  - `value` — required, primitive union (`string | number | boolean | null`).
  - `valueInputOption` — required Q11.
- **Output:** `spreadsheetId`, `sheetName`, `cell`, `updated` (true), `updatedRange`, `updatedCells`.
- **Risk:** `medium`. Single-cell overwrite. Same reasoning as `update_row` — borderline `high`, recommend `medium` for V1.
- **Sensitive outputs:** non-sensitive.
- **Resolver needs:** spreadsheet + sheet picker.
- **Field type for `value`:** `text` — primitive union; the meta `text` type accepts strings + the engine coerces. **Alternative: `select` between a small "type" + text input** but adds friction for V1.

### 2.8 `google-sheets:delete_row`

- **Fields**:
  - `spreadsheetId` — required.
  - `sheetName` — required.
  - `rowNumber` — required, positive integer (1-indexed).
- **Output:** `spreadsheetId`, `sheetName`, `sheetId` (numeric), `rowNumber`, `deleted: true`.
- **Risk:** **`high` + `isDestructive: true` + `requiresConfirmation: true`.** Same precedent as `clear_range`. Recoverable only via Sheets version history.
- **Sensitive outputs:** non-sensitive.
- **Resolver needs:** spreadsheet + sheet picker.
- **Concerns:** **Second destructive Google Sheets action.** Both `clear_range` and `delete_row` trip the SEC-4B gate. `rowNumber` field benefits from a `number` type with `minimum: 1`.

### 2.9 `google-sheets:find_row`

- **Fields**:
  - `spreadsheetId`, `sheetName` — required.
  - `column` — required, header name.
  - `value` — required, `string | number | boolean`.
  - `operator` — literal `"equals"` only in V1.
  - `returnAll` — boolean, default `false`.
- **Output:** `spreadsheetId`, `sheetName`, `column`, `found` (boolean), `firstMatch` (object | null), `matches[]` (array), `count` (number). Each match contains `{ rowNumber, rowValues, ... }`.
- **Risk:** `low` (read-only, though it can pull large amounts of data).
- **Sensitive outputs:** `firstMatch` MUST be `sensitive: true` (contains row values). `matches` MUST be `sensitive: true`. `column`, `found`, `count` non-sensitive.
- **Resolver needs:** spreadsheet + sheet picker. **Column picker (`google-sheets:columns` with `dependsOn: spreadsheetId + sheetName`)** would be ideal but adds a third-hop resolver. **Recommend keeping `column` as text for V1** — defer column picker to a follow-up; column names are typically known to the workflow author.
- **Field type for `operator`:** `select` with single option `"equals"` (anticipates future expansion).
- **Concerns:** Three-hop cascade if column picker is built. V1 keeps it two-hop.

### 2.10 `google-sheets:create_spreadsheet`

- **Fields**:
  - `title` — required.
  - `initialSheetName` — optional.
- **Output:** `spreadsheetId`, `spreadsheetUrl`, `title`, `sheets[]`, `firstSheet`.
- **Risk:** `medium`. Creates a new spreadsheet in the user's Drive. Reversible (user can delete from Drive) but persists.
- **Sensitive outputs:** `spreadsheetUrl` — **debatable**. Per the POSTSEC-1 rubric, signed URLs / payment URLs are sensitive; spreadsheet URLs are public-ish (anyone with the URL + Drive permissions can access). **Recommend `sensitive: false`** — same precedent as Stripe `create_checkout_session.url`. `title` non-sensitive. `spreadsheetId` non-sensitive (object id, not a secret).
- **Resolver needs:** None — `title` is free-text.
- **Concerns:** Doesn't take a `spreadsheetId` input, so this action's first field is `title`, not the spreadsheet picker. Don't accidentally inject a picker.

### 2.11 `google-sheets:batch_update`

- **Fields**:
  - `spreadsheetId` — required.
  - `valueInputOption` — required Q11.
  - `updates[]` — required, `Array<{ range: string, values: CellValue[][] }>`. Max 100 entries.
- **Output:** `spreadsheetId`, `totalUpdatedRanges`, `totalUpdatedCells`, `totalUpdatedRows`, `totalUpdatedColumns`, `responses[]` (per-range counts).
- **Risk:** `medium`. Multi-range overwrite. Same risk profile as `update_row` × N.
- **Sensitive outputs:** non-sensitive.
- **Resolver needs:** spreadsheet picker.
- **Field type for `updates`:** **`textarea` paste-JSON.** Nested array-of-objects with nested 2D arrays — no simpler field type fits. Same precedent as Slack `post_interactive_blocks.blocks` (paste JSON BlockSpec[]) and Stripe `lineItems` (paste JSON object array).
- **Concerns:** Largest schema in the set. Description should call out the 100-range cap and the mandatory `Sheet1!A1:B2` prefix in `updates[].range`.

### 2.12 `google-sheets:format_range`

- **Fields**:
  - `spreadsheetId` — required.
  - `sheetName` — required.
  - `range` — required, bare A1 (no sheet prefix; `sheetName` carries it separately).
  - `backgroundColor` — optional, hex color (`#RRGGBB` or `RRGGBB`).
  - `textColor` — optional, hex color.
  - `bold` — optional, boolean.
  - `italic` — optional, boolean.
  - `horizontalAlignment` — optional, `"LEFT" | "CENTER" | "RIGHT"`.
  - `numberFormat` — optional, `{ type, pattern? }` with type enum (`TEXT|NUMBER|PERCENT|CURRENCY|DATE|TIME|DATE_TIME|SCIENTIFIC`).
- **Output:** `spreadsheetId`, `sheetName`, `sheetId`, `formattedRange`, `appliedFormat` (object).
- **Risk:** `low`. Format-only; doesn't change cell values.
- **Sensitive outputs:** non-sensitive.
- **Resolver needs:** spreadsheet + sheet picker.
- **Field type for `numberFormat`:** `textarea` paste-JSON (it's an object). **Alternative:** flatten to `numberFormatType` (`select`) + `numberFormatPattern` (`text`) — two fields. **Recommend the flattened pair** — small enough to be ergonomic. Decide during implementation.
- **Concerns:** Subtle UX — the schema requires "at least one format option" via `.refine`. The meta should mirror this with a description note; the engine catches the runtime error.

---

## 3. Trigger Inventory

### 3.1 `google-sheets:new_worksheet`

- **Activation:** Drive `files.watch` webhook subscription, scoped per spreadsheet. Activation hook seeds the worksheet-list baseline via `spreadsheets.get`.
- **Config fields** (from `NewWorksheetInputConfigSchema`):
  - `spreadsheetId` — required.
- **Payload** (from `normalize.ts`): `spreadsheetId`, `sheetId` (numeric), `worksheetName`, `index` (number | null), `sheetType` (string | null), `occurredAt` (ISO string).
- **Sensitive payload fields:** `worksheetName` MAY be sensitive (user-typed tab title can be project / customer name). **Recommend `sensitive: false`** for V1 — same precedent as `get_sheet_metadata.sheets[].title`.
- **Include in arc?** **Yes** — only one config field, minimal complexity.

### 3.2 `google-sheets:row_changed`

- **Activation:** Drive `files.watch` webhook, scoped per spreadsheet + sheet.
- **Config fields** (from `RowChangedInputConfigSchema`):
  - `spreadsheetId` — required.
  - `sheetName` — required.
  - `headerRow` — boolean, default `false`.
  - `changeKinds[]` — array of `"added" | "updated" | "removed"`, default `["added"]`, no duplicates.
  - `snapshotRowLimit` — integer [100, 10000], default 1000. Only used when changeKinds includes `updated` / `removed`.
  - `keyColumn` — optional string, requires `headerRow: true`.
- **Payload** (from `normalize.ts`): `spreadsheetId`, `sheetName`, `changeKind`, `rowIndex` (number | null), `rowKey` (string), `rowValues` (cell value array | null), `previousValues` (always null in V1), `headers[]` (optional), `keyColumn`, `keyValue`, `occurredAt`.
- **Sensitive payload fields:** `rowValues` MUST be `sensitive: true`. `headers[]` non-sensitive (column names). `keyValue` MAY be sensitive (it's a row cell value). **Recommend `keyValue` sensitive: true** for safety.
- **Include in arc?** **Yes, but more complex.** Six config fields; one inter-field constraint (`keyColumn` requires `headerRow: true`). May want to split:
  - **GSHEETS-4a**: `new_worksheet` trigger meta (single field).
  - **GSHEETS-4b**: `row_changed` trigger meta + COVERED_PROVIDERS flip.

  Or land both together in the final slice.

### 3.3 Trigger meta — include in this arc

**Recommendation: yes, include both triggers in the final slice.** Trigger meta is one of the "small but important" wins — without it, `row_changed` and `new_worksheet` won't surface in the trigger picker even though their runtime handlers ship. Sheets is one of the two providers (with Microsoft Excel) where row-change triggers are a core automation pattern.

Note: `tests/structure/discovery-meta-coverage.test.ts` does NOT enforce trigger coverage today (Stripe's trigger meta is deferred at the same provider's structural test). The COVERED_PROVIDERS flip CAN happen with just action coverage. **But the spirit of the BUILD-RESUME-1 decision was "broad provider expansion"** — leaving Sheets triggers out leaves a meaningful workflow surface inaccessible from the builder. Include them.

---

## 4. Resolver / `optionsSource` Strategy

### 4.1 What the schemas need

Across the 12 actions, three resource-id field types recur:

| Field | Actions | Total occurrences |
| --- | --- | --- |
| `spreadsheetId` | All 12 actions (except `create_spreadsheet` which RETURNS one) | 11 |
| `sheetName` (string, not numeric `sheetId`) | `clear_range` (via range), `get_cell_value`, `update_cell`, `delete_row`, `find_row`, `format_range`, `row_changed` trigger | 7 |
| `column` (header name within a chosen sheet) | `find_row`, `row_changed.keyColumn` | 2 |

### 4.2 Proposed resolvers

**Two new resolvers in GSHEETS-2 (the second slice).** This validates the two-hop `dependsOn` cascade infrastructure built in Slice 3.33 on its first production user beyond Slack.

| Resolver key | Backing API | Depends on | Used by |
| --- | --- | --- | --- |
| `google-sheets:spreadsheets` | Drive `files.list?q=mimeType='application/vnd.google-apps.spreadsheet'` | nothing (top-level picker) | 11 actions + 2 triggers' `spreadsheetId` fields |
| `google-sheets:sheets` | Sheets `spreadsheets.get?includeGridData=false` (returns `sheets[].properties.title`) | `dependsOn: spreadsheetId` | 7 actions + 1 trigger's `sheetName` fields |

**Deferred resolver (NOT in this arc):**

| Resolver key | Backing | Depends on | Why deferred |
| --- | --- | --- | --- |
| `google-sheets:columns` | values.get row 0 + parse headers | `dependsOn: spreadsheetId + sheetName` | Three-hop cascade; only used by `find_row.column` + `row_changed.keyColumn`. Adds complexity without strong demand. Defer to a follow-up if user friction surfaces. |

### 4.3 dependsOn cascade behavior

Slice 3.33 `SchemaForm.tsx` already supports `dependsOn`:
- Changing `spreadsheetId` clears the dependent `sheetName` field automatically.
- Until `spreadsheetId` is set, the `sheetName` combobox shows the passive "Select Spreadsheet first" trigger.
- The cascade is single-hop only by contract — the column picker (if ever built) would need an extension to multi-hop, which is out of scope.

### 4.4 Decision: resolver-first or text-field-first?

**Recommendation: resolver-first.** Reasoning:
- 11 of 12 actions take `spreadsheetId`. Shipping a text field for the most common field in the most common Google provider is a UX regression even for an MVP. Users would have to copy the spreadsheet ID from the URL for every action.
- The cascade infrastructure exists and tested (Slack channels). The two-hop pattern is the obvious next validation.
- Slack precedent: build the resolver once (`slack:channels` shipped in 3.32), then land action metas over multiple slices that all consume the same resolver. Same pattern works here.

If resolver work blocks for any reason (Drive API scope drift, etc.), fall back to text-field-first for the first action batch and add resolvers in a follow-up.

---

## 5. Field Metadata Strategy

Use existing `FieldType` variants. No new field types proposed.

| Schema field shape | Recommended FieldType | Notes |
| --- | --- | --- |
| `spreadsheetId` (required string) | `combobox` (async, `optionsSource: "google-sheets:spreadsheets"`) | Required everywhere. |
| `sheetName` (required string) | `combobox` (async, `optionsSource: "google-sheets:sheets"`, `dependsOn: "spreadsheetId"`) | Where used. |
| `range` (A1 string) | `text` | Examples in description: `"Sheet1!A:Z"`, `"Sheet1!A1:Z100"`. |
| `cell` (A1 single-cell) | `text` | Description: `"A1"`, `"B5"`. |
| `column` (header name) | `text` | V1 — no resolver. |
| `rowNumber` (positive integer) | `number` | `minimum: 1`. |
| `value` (cell primitive — string \| number \| boolean \| null) | `text` | Engine coerces. |
| `values` (1D primitive array) | `textarea` paste-JSON | Description: `["Alice", 42, true, null]`. |
| `updates[]` (nested array of `{range, values}`) | `textarea` paste-JSON | Description with sample object array. |
| `title` (free string) | `text` | |
| `initialSheetName` (free string, optional) | `text` | |
| `valueInputOption` (enum) | `select` with `RAW` / `USER_ENTERED` — **no default** (Q11) | Required. Description explains the choice. |
| `insertDataOption` (enum) | `select` with `INSERT_ROWS` / `OVERWRITE`, default `INSERT_ROWS` | |
| `majorDimension` (enum) | `select` with `ROWS` / `COLUMNS`, default `ROWS` | |
| `valueRenderOption` (enum, optional) | `select` | |
| `operator` (literal `"equals"`) | `select` with single option, anticipates future expansion | |
| `returnAll` (boolean) | `boolean` | |
| `headerRow` (boolean) | `boolean` | |
| `changeKinds[]` (string array with enum members) | `string-array` for V1; multi-select combobox is Slice 3.7 deferral | Same precedent as `slack:invite_users_to_channel.users`. |
| `snapshotRowLimit` (integer with bounds) | `number` with `minimum: 100, maximum: 10000`, default 1000 | |
| `keyColumn` (optional string, null sentinel) | `text` | Description notes "requires headerRow: true." |
| `backgroundColor` / `textColor` (hex color) | `text` with placeholder `#RRGGBB` | Schema regex enforces. **Future:** `color` FieldType — out of scope. |
| `bold` / `italic` | `boolean` | |
| `horizontalAlignment` (enum) | `select` | |
| `numberFormat` (`{ type, pattern? }`) | **Two flat fields:** `numberFormatType` (`select`), `numberFormatPattern` (`text`, optional). **Alternative:** `textarea` paste-JSON. | Recommend flat-pair for ergonomics. |

### 5.1 No new FieldType proposed

The audit doesn't surface a gap. `color` would be nice for `backgroundColor` / `textColor` but the hex-string + placeholder pattern is acceptable for V1. `range` could benefit from an A1-aware picker someday but no UX evidence justifies the cost.

---

## 6. Output Metadata Strategy

### 6.1 Bounded outputs (mirror handler returns exactly)

Every action's `OutputMeta` declares only the fields the handler actually returns. No raw provider response is spread into output (POSTSEC-2 precedent).

### 6.2 `sensitive: true` flags

Based on the per-action audit in §2:

| Action | Sensitive output fields |
| --- | --- |
| `read_rows` | `values` |
| `get_cell_value` | `value` |
| `find_row` | `firstMatch`, `matches` |
| `get_sheet_metadata` | none (titles default non-sensitive; revisit if POSTSEC-1-style audit flags) |
| `create_spreadsheet` | none (spreadsheetUrl is shareable-by-design; matches Stripe URL precedent) |
| `append_row` / `update_row` / `update_cell` / `batch_update` / `clear_range` / `delete_row` / `format_range` | none (all outputs are structural counts + range strings; the user-typed data went INTO the action, not OUT) |

**Sensitive trigger payload fields:**
- `row_changed`: `rowValues`, `keyValue`
- `new_worksheet`: none (worksheetName is structural)

### 6.3 No FileRef outputs

Sheets handlers do not produce FileRef. No bytes / base64 / content / data fields. Confirmed by handler return inspection.

### 6.4 No secrets / tokens

Sheets API doesn't return secrets in handler responses. No `clientSecret`-equivalent concerns.

### 6.5 Suspicious-output structural test

POSTSEC-2 added a structural test that fails the build if output names matching `password|secret|token|key|content|body|bytes|raw|email|phone|address` are NOT flagged sensitive or explicitly allow-listed. The Sheets outputs above MUST be checked against this list:
- `values` — flagged sensitive ✓
- `value` — flagged sensitive ✓
- `firstMatch` / `matches` — flagged sensitive ✓
- `range`, `updatedRange`, `clearedRange`, `formattedRange`, `tableRange` — likely match the test pattern; verify and allow-list as structural metadata if test flags them.
- `title` — doesn't match the test pattern.
- `headers` (trigger) — doesn't match.

---

## 7. Risk Metadata Strategy

| Action | `riskLevel` | `isDestructive` | `requiresConfirmation` | Notes |
| --- | --- | :---: | :---: | --- |
| `read_rows` | `low` | false | false | Read-only |
| `get_cell_value` | `low` | false | false | Read-only |
| `find_row` | `low` | false | false | Read-only, but data-pulling |
| `get_sheet_metadata` | `low` | false | false | Read-only |
| `create_spreadsheet` | `medium` | false | false | External write, additive |
| `append_row` | `medium` | false | false | External write, additive |
| `update_row` | `medium` | false | false | Overwrite — borderline `high`; V1 keeps `medium` |
| `update_cell` | `medium` | false | false | Single-cell overwrite — same as above |
| `batch_update` | `medium` | false | false | Multi-range overwrite — same risk profile |
| `format_range` | `low` | false | false | Format-only, no cell value change |
| `clear_range` | **`high`** | **true** | **true** | Removes user data; SEC-4B gate fires |
| `delete_row` | **`high`** | **true** | **true** | Removes user data; SEC-4B gate fires |

### 7.1 `riskDescription` for the destructive actions

Both `clear_range` and `delete_row` need `riskDescription`. Suggested copy:

- `clear_range`: *"Clears the cell values in the given range. Formatting and data validation are preserved, but the values are unrecoverable from the workflow — recovery requires the spreadsheet's Sheets-side version history. Confirm before activating to acknowledge data loss."*
- `delete_row`: *"Deletes the entire row at the given position. Rows below shift up. Unrecoverable from the workflow — recovery requires the spreadsheet's Sheets-side version history. Confirm before activating to acknowledge data loss."*

### 7.2 Decision: how conservative on overwrite-shaped actions?

Three options for `update_row` / `update_cell` / `batch_update`:

1. **Default V1 — `medium`, no confirmation.** Recoverable in principle (the user saw the prior value somewhere; they can write it back). Matches the pre-POSTSEC-3 Stripe shape.
2. **Conservative — `high`, no confirmation.** Acknowledges the overwrite is hard to reverse but doesn't gate. POSTSEC-3 precedent on 5 Stripe actions.
3. **Maximum — `high` + `requiresConfirmation: true`.** Forces typed CONFIRM on every overwrite. Highest friction.

**Recommend Option 1 (medium, no confirmation) for V1.** Reasoning:
- Sheets overwrites are visible — the workflow author specified the exact range.
- POSTSEC-3 was a reaction to live misfires on money-moving Stripe actions; Sheets has no such live evidence.
- Confirmation gate on every cell update would make Sheets workflows tedious.
- The substrate exists (POSTSEC-5 modal + POSTSEC-8 audit notifications); we can escalate later without code changes — just meta updates.

If Marcus prefers Option 2 or 3 explicitly, change at meta-add time before the COVERED_PROVIDERS flip — no downstream cost.

---

## 8. Security Constraints Inherited from Post-Security Work

Documented per BUILD-RESUME-1 §5. Each new Sheets meta MUST satisfy:

- **riskLevel required** on every action — declared above per §7.
- **Destructive / requires-confirmation classification** — `clear_range` + `delete_row` are the two destructive actions. Both will inherit SEC-4B gate + POSTSEC-5 modal + POSTSEC-8 audit notification automatically once the meta declares `isDestructive: true` + `requiresConfirmation: true`.
- **testMode blocks** — every Sheets handler has `requiresIntegration: true` (they all hit the Sheets API). SEC-2 engine gate refuses to invoke them in `testMode`. Mock outputs serialize via the existing pattern.
- **Sensitive outputs marked** — `values`, `value`, `firstMatch`, `matches`, `rowValues`, `keyValue` flagged per §6.2.
- **Suspicious-output structural test must stay green** — anticipate that `values`, `value`, `body`-like names will be flagged; the build will fail unless they carry `sensitive: true` or the allow-list is extended with rationale.
- **Provider route serializes risk/sensitive fields** — `/api/providers/google-sheets/actions` will return these automatically once the metas are registered. Widening `tests/unit/app/api/providers/providers-route.test.ts` to include one Google Sheets entry MUST happen alongside the COVERED_PROVIDERS flip.
- **No secrets/tokens output** — confirmed in handler audit (§6.4).
- **High-risk audit notifications (POSTSEC-8)** — fire automatically on `workflow_high_risk_activated` / `workflow_high_risk_run` once destructive metas exist.
- **OAuth scope review** — the existing Google Sheets manifest's scope set already covers all 12 handlers (they all ship + work today). No new scopes required by the metadata work.

---

## 9. Implementation Grouping

### Recommended 3-slice arc

| Slice | Scope | Approximate size |
| --- | --- | --- |
| **GSHEETS-2** | Resolvers — `google-sheets:spreadsheets` + `google-sheets:sheets`. Includes typed schemas, integration tests (one cascade test asserting `spreadsheets → sheets` flow), and the providers-route assertion if it surfaces resolvers. | 1 medium slice |
| **GSHEETS-3** | Read action metas (5): `read_rows`, `get_cell_value`, `get_sheet_metadata`, `find_row`, `create_spreadsheet`. Plus the simplest writes (3): `append_row`, `update_cell`, `update_row`. | 1 medium-to-large slice |
| **GSHEETS-4** | Remaining writes (4): `clear_range` (destructive), `delete_row` (destructive), `batch_update`, `format_range`. Plus both trigger metas. Plus COVERED_PROVIDERS flip. Plus widening the providers-route + risk-classification + sensitive-output structural tests to include Google Sheets entries. | 1 large slice |

**Variant — 4 slices if GSHEETS-4 feels too heavy:**
- GSHEETS-4a: destructive actions + trigger metas (~6 metas).
- GSHEETS-4b: `batch_update` + `format_range` + COVERED_PROVIDERS flip (the structural-test gate fires only when every handler has a meta, so the flip MUST be the final commit).

### Why not group differently

- **Resolvers in their own slice (GSHEETS-2)** — risk-bearing infrastructure work. Keep it separate so a resolver bug doesn't get conflated with meta drift.
- **Read-first action batch (GSHEETS-3)** — reads are lower-risk and validate the resolver+meta integration. Includes the simplest writes so the slice has substance.
- **Destructive actions in the final slice (GSHEETS-4)** — gives the destructive metas the full security stack on day one (modal + confirmation gate + audit notification all live by the time these ship).

### COVERED_PROVIDERS flip placement

The flip happens in the LAST slice that lands a meta for any handler still missing one. Structural test `discovery meta coverage` fails the build the moment Google Sheets joins COVERED_PROVIDERS with a missing meta — so the flip MUST be the last operation in the final slice. Documented in `tests/structure/discovery-meta-coverage.test.ts:27-48` precedent (Slack flipped in 3.38, Notion in 3.42, Stripe in 3.46).

### Trigger inclusion

Both triggers are included in the arc (GSHEETS-4). Trigger coverage is not gated by the structural test, but excluding them from this arc leaves a meaningful workflow surface inaccessible. Counter-argument: trigger metas can ship as a separate follow-up (`google-sheets:triggers`) without delaying the action coverage flip. **Recommend including them in GSHEETS-4** — the cost is small (~2 metas) and the user-facing impact is large.

---

## 10. Integration Tests Plan

Small, focused set — one test per major UX pattern, not one per meta. Follows the Slack / Notion / Stripe precedent.

| Test | Slice | What it asserts |
| --- | --- | --- |
| `google-sheets-spreadsheet-picker-cascade-config.test.tsx` | GSHEETS-2 | Cascade: select spreadsheet → sheet picker populates → switch spreadsheet → sheet picker clears + repopulates. Validates `dependsOn` + `optionsSource` together. |
| `google-sheets-read-rows-config.test.tsx` | GSHEETS-3 | Read action: spreadsheet picker + range text + valueRenderOption select. Asserts the simplest workflow shape. |
| `google-sheets-append-row-config.test.tsx` | GSHEETS-3 | Write action: spreadsheet picker + range text + values paste-JSON + valueInputOption Q11 (no default). Validates the paste-JSON pattern for primitive arrays. |
| `google-sheets-clear-range-config.test.tsx` | GSHEETS-4 | Destructive action: SEC-4B `CONFIRMATION_REQUIRED` 409 surfaces in the modal; CONFIRM retry succeeds; POSTSEC-8 audit emission asserted. Validates that destructive Google Sheets meta inherits the full security stack. |
| `google-sheets-row-changed-trigger-config.test.tsx` | GSHEETS-4 | Trigger meta: spreadsheet + sheet pickers + changeKinds string-array + headerRow boolean + keyColumn dependency. Validates the full trigger config surface. |

Note: do NOT write one integration test per action. Per the Stripe precedent, 4-5 integration tests cover the meaningful UX patterns; structural tests (provider route + discovery-coverage + risk-classification + sensitive-output) cover the per-action invariants.

---

## 11. Open Decisions for Marcus

1. **Resolver-first vs text-field-first for GSHEETS-2.** Recommendation: **resolver-first** (§4.4). 11/12 actions take `spreadsheetId`; shipping text-only would be a UX regression. Counter-argument: text-only first ships GSHEETS-3 + GSHEETS-4 faster, with resolvers retro-fitted in a follow-up. **Decide before starting GSHEETS-2.**

2. **Include trigger metas in this arc?** Recommendation: **yes, in GSHEETS-4** (§3.3). Trigger metas are small but high-value; excluding them leaves a meaningful workflow surface inaccessible. Counter-argument: separate `gsheets-triggers` slice keeps GSHEETS-4 smaller. **Decide during GSHEETS-3 planning.**

3. **How conservative on overwrite-shaped actions?** Recommendation: **Option 1 (medium, no confirmation)** for `update_row` / `update_cell` / `batch_update` (§7.2). Counter-arguments documented; can escalate later via meta-only changes. **Decide before GSHEETS-3.**

4. **Should Google Sheets stay ahead of HubSpot in priority?** BUILD-RESUME-1 said yes. After seeing the live complexity (resolver work + paste-JSON `updates` + 2 destructive actions + 2 triggers + 14 total metas), is the ranking still correct? **My read: yes** — HubSpot would carry 26 metas + 3 resolvers + per-action PII review + larger slice queue. Sheets is the cleaner re-entry. **Confirm or pivot at the GSHEETS-2 entry point.**

5. **Column picker now or defer?** Recommendation: **defer** (§4.2). Three-hop cascade is heavier; only two fields use it (`find_row.column`, `row_changed.keyColumn`). **Decide after GSHEETS-3 ships** — if user friction surfaces, add `google-sheets:columns` as a small follow-up slice.

6. **`numberFormat` field shape — paste-JSON or flat-pair?** Recommendation: **flat pair** (`numberFormatType` select + `numberFormatPattern` text) per §5. Counter-argument: paste-JSON is more consistent with `updates[]` and `values`. **Decide during the GSHEETS-4 meta authoring.**

---

## 12. Proposed Next Slice

**Recommended next slice: GSHEETS-2 — Google Sheets `optionsSource` resolvers.**

Scope:
- Build `google-sheets:spreadsheets` resolver (Drive `files.list` filtered by spreadsheet MIME type).
- Build `google-sheets:sheets` resolver (Sheets `spreadsheets.get?includeGridData=false`, `dependsOn: spreadsheetId`).
- Register both in `services/options/_registry.ts`.
- Add the integration test from §10 (one cascade test).
- No action metas yet; no COVERED_PROVIDERS flip yet.

Why this first:
- Resolver risk is isolated. A bug in `dependsOn` cascade behavior, OAuth scope handling, or Drive API result mapping surfaces in one slice — not entangled with meta authoring.
- All subsequent action metas reference the resolvers by key string; no chicken-and-egg.
- Validates the two-hop cascade infra on its first non-Slack production user.
- Single small slice — 1-2 days of focused work.

After GSHEETS-2:
- **GSHEETS-3** — read action metas + simple writes (~7-8 metas, 2-3 integration tests).
- **GSHEETS-4** — remaining writes + destructive actions + trigger metas + COVERED_PROVIDERS flip + structural-test extensions.

If GSHEETS-2 surfaces complexity that wasn't anticipated (Drive API scope drift, dependsOn cascade edge cases on async load), pause and re-evaluate before GSHEETS-3.

If after GSHEETS-2 the complexity bias is "actually heavier than HubSpot would have been," that's the moment to pivot — but the current audit doesn't suggest that. The Sheets schemas are simpler than Stripe's (no money / no nested receipts) and simpler than Notion's (no schema-driven property editors needed for V1).

---

**End of GSHEETS-1 plan.**
