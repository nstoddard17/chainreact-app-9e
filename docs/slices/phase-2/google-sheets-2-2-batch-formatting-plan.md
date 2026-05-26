# Google Sheets 2.2 — Batch + formatting plan

**Status:** Plan / not yet implementing runtime code. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) (accepted before Google Sheets 2.1).
**Predecessor outcomes:** [`docs/slices/google-sheets-2-1-outcomes.md`](google-sheets-2-1-outcomes.md) (5-action cell + row + spreadsheet lifecycle port — established the 2.2 baseline).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/google-sheets/`](../../integrations/google-sheets/).

Google Sheets 2.2 ports the two Sheets 2.2 audit items from §7:
`batch_update` (multi-range values write) and `format_range` (typed
cell formatting subset). The slice introduces **one new wrapper**
(`valuesBatchUpdate`) and **one new helper** (`a1ToGridRange`); both
existing wrappers (`spreadsheetsBatchUpdate` for the `repeatCell`
request type, `spreadsheetsGet` for sheetName → sheetId resolution)
are reused unchanged. No new platform infrastructure.

The biggest qualitative challenge in this slice is the surface
budget on `format_range`: V1 ships ~12 formatting fields with a
`rangeSelection` UI chrome and parses-coerces-defaults everywhere,
and Sheets' `CellFormat` API has dozens more sub-fields (borders,
conditional formatting, data validation, etc.). V2 ships a **typed
subset** covering the dominant cases and rejects unknown options at
schema time — borders / conditional formatting / data validation /
strikethrough / underline / vertical alignment / fontSize / wrap
strategy all defer to on-demand follow-up.

---

## 1. Scope

### Actions (2)

- **`batch_update`** — multi-range values write via the
  `spreadsheets.values.batchUpdate` endpoint. Typed `updates:
  Array<{range, values}>` input; no V1 simple-mode `cellN`/`valueN`
  chrome, no raw arbitrary requests passthrough.
- **`format_range`** — typed cell-formatting subset via the
  `spreadsheets.batchUpdate` endpoint with a single `repeatCell`
  request. Background color + text color + bold + italic +
  horizontal alignment + (provisional) number format.

### Out of scope

- No trigger expansion (Sheets 2.3 work, gated by P-GS1).
- No P-GS1 per-row diff detection design or implementation.
- No borders / conditional formatting / data validation /
  protected ranges / merge-unmerge.
- No raw `spreadsheets.batchUpdate` request-array passthrough at the
  action layer (the wrapper accepts arbitrary requests, but the
  action's typed schema is the only allowed entry — per CLAUDE.md
  durable rule § "spreadsheetsBatchUpdate wrapper is intentionally
  untyped at the wrapper layer; handlers build typed requests").
- No range-selection UI chrome (`entire_sheet` / `header_row` /
  `first_data_row` / `last_row` — all V1 builder concerns).
- No Stripe work (owned by another chat).
- No unrelated provider file edits.

---

## 2. V1 source audit

### `lib/workflows/actions/google-sheets/batchUpdate.ts` (184 LOC)

**What it does:** Multi-range cell update via Sheets'
`values:batchUpdate` endpoint
(`POST /v4/spreadsheets/{id}/values:batchUpdate`). Two input
modes:

- **Simple mode (default):** 10 paired `cellN` + `valueN` fields
  (cell1+value1 through cell10+value10). The handler builds
  `[{ range: <sheetName>!<cell>, values: [[value]] }, ...]` from
  whichever pairs are non-empty.
- **JSON mode:** raw `updates: Array<{ range, values }>` (or
  stringified JSON of that shape). The handler validates each entry
  has `range` + `values`, that `values` is a 2D array, and that
  `range` contains a `!` (sheet name prefix).

**V1 rot:**
- `valueInputOption = "USER_ENTERED"` hardcoded in the request body
  — Q11 violation (silent default the workflow author never sees).
- `inputMode === 'simple'` with 10-pair UI chrome — 20-field schema
  burden that doesn't survive variable resolution cleanly.
- `updates` accepts either a string (parsed via `JSON.parse`) or an
  array — V2 schemas don't accept the union; the resolver pre-resolves
  to typed values.
- Range-must-include-`!` check is post-hoc; V2 schemas validate
  upfront via Zod.
- Output spreads `result.responses` raw — leaks Google's response
  shape (`updatedRange`, `updatedRows`, etc. straight passthrough).

### `lib/workflows/actions/google-sheets/formatRange.ts` (301 LOC)

**What it does:** Cell formatting via Sheets'
`spreadsheets.batchUpdate` endpoint with a single `repeatCell`
request. Resolves sheetName → sheetId (via
`/v4/spreadsheets/{id}?includeGridData=false`), parses A1 range to
`GridRange`, builds `CellFormat` from input fields, sends
`requests: [{ repeatCell: { range, cell: { userEnteredFormat }, fields: <mask> } }]`.

**Formatting options V1 supports:**
- `backgroundColor` (hex string → RGB)
- `textColor` (hex string → `textFormat.foregroundColor`)
- `bold`, `italic`, `strikethrough`, `underline` (under `textFormat`)
- `fontSize` (under `textFormat`)
- `horizontalAlignment` (`LEFT` / `CENTER` / `RIGHT`)
- `verticalAlignment` (`TOP` / `MIDDLE` / `BOTTOM`)
- `textWrapping` / `wrapStrategy` (`OVERFLOW_CELL` / `WRAP` / `CLIP`)

**Formatting options V1 does NOT support** (must be planned as
2.2 surface or deferred):
- Number format. V1's `formatRange.ts` ships NO `numberFormat`
  field. Audit §7 listed it as a Sheets 2.2 candidate; if we ship
  it, V2 is **extending** V1's surface rather than porting it.
- Borders. Audit defers to on-demand.
- Conditional formatting / data validation. Audit defers.

**V1 rot:**
- `rangeSelection: 'custom' | 'entire_sheet' | 'header_row' | 'first_data_row' | 'last_row'` UI chrome — V2 will accept a single A1 `range` field.
- `last_row` does an EXTRA `values.get` call to find the row count — extra API call inside a format-only action.
- `bold === true || bold === 'true'` stringly-typed boolean coercion (V1 UI emits booleans-as-strings).
- `parseInt(fontSize.toString())` coercion — V2 will use `z.number()`.
- `hexToRgb()` no input validation — `parseInt(hex, 16)` accepts garbage like `"hello"` and produces nonsense RGB values.
- Alignment / wrap / number format values silent-passthrough — V1 sends whatever string the caller provides; V2 will enum-validate.
- `cellFormat` empty → V1 returns `success: false`. V2 will reject "no formatting options" at schema time via `.refine`.
- Auxiliary `spreadsheets.get` call is NOT wrapped in `refreshAndRetry` (V1 predates the pattern); V2 will wrap both calls.

### `lib/workflows/actions/google-sheets/utils.ts` (38 LOC)

`parseSheetName` (handles JSON-string / object / plain string sheet
name from V1's dynamic UI loader). V2 doesn't need this — the
resolver pre-resolves to a plain string and schemas enforce
`z.string()`. **NOT PORTED.**

### `lib/workflows/nodes/providers/google-sheets/actions/{batchUpdate,formatRange}.schema.ts`

Manifest-side schemas with the UI chrome (`cellN`/`valueN` pairs,
`rangeSelection` shortcuts, hex-string select options, etc.).
**Not relevant to V2** — V2 builds Zod schemas from scratch with the
narrow surface decided in §4 + §5.

### V1 tests / docs

- 0 V1 unit tests for either handler.
- No V1 docs specific to batch or format range.

---

## 3. V2 current audit

### `integrations/google-sheets/api/spreadsheetsBatchUpdate.ts`

Already shipped in Sheets 2.1 Commit 2. Wrapper for
`POST /v4/spreadsheets/{id}:batchUpdate`. Accepts
`requests: ReadonlyArray<Record<string, unknown>>` — deliberately
untyped per CLAUDE.md durable rule. Error mapping matches values.*
wrappers (401 → `Unauthorized401Error`, 404 / 400-INVALID_ARGUMENT
→ `NotFoundError`). **Will be reused by `format_range` for the
`repeatCell` request.**

### `integrations/google-sheets/api/spreadsheetsGet.ts`

Already shipped in Slice 5. Wrapper for
`GET /v4/spreadsheets/{id}?fields=...`. Used by Sheets 2.1's
`delete_row` to resolve sheetName → sheetId. **Will be reused by
`format_range` for the same lookup.**

### No existing `valuesBatchUpdate` wrapper

`POST /v4/spreadsheets/{id}/values:batchUpdate` is a DIFFERENT
endpoint from `spreadsheets.batchUpdate`. Slice 5 + Sheets 2.1
together never touched it. **`batch_update` requires a NEW
`valuesBatchUpdate` wrapper.** Same `_base.ts` + same error mapping
shape as the other `values.*` wrappers.

### No A1 → GridRange helper exists

`format_range` needs to convert an A1 range like `"A1:D10"` into
`{ sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex }`
(half-open, 0-indexed, the shape Sheets' `repeatCell` requests
expect). V1 inlines the conversion in `formatRange.ts:66-80`. V2 will
extract this into a small helper (e.g.
`integrations/google-sheets/api/a1ToGridRange.ts` or
`integrations/google-sheets/actions/gridRange.ts`) so the logic is
unit-testable independently of the action handler.

### Sheets 2.1 outcomes durable rules to honor

- Typed actions only — no router, no kitchen-sink, no `inputMode` discriminator.
- A1 references validated up front; no post-hoc range checking.
- `valueInputOption` REQUIRED on every Sheets write handler (Q11).
- No raw API body passthrough at the action layer.
- `spreadsheetsBatchUpdate` wrapper is untyped; handlers build typed requests.
- Auxiliary calls also wrap in `refreshAndRetry`.

### Registry + manifest

`services/execution/handlers/_registry.ts` will gain 2 entries
(`google-sheets:batch_update`, `google-sheets:format_range`).
[`tests/unit/integrations/google-sheets/manifest.test.ts`](../../tests/unit/integrations/google-sheets/manifest.test.ts)
will expand the 9 → 11 action surface.
[`tests/unit/services/execution/handlers/registry.test.ts`](../../tests/unit/services/execution/handlers/registry.test.ts)
will gain a new `it()` block for the 2 new handlers.

---

## 4. `batch_update` design

### Recommended shape — typed-and-narrow

**Reject** V1's simple-mode `cellN`/`valueN` chrome. **Reject** raw
arbitrary request arrays. Ship a single typed input shape:

```ts
const BatchUpdateConfigSchema = z.object({
  spreadsheetId: z.string().min(1),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]),  // Q11 required
  updates: z.array(
    z.object({
      range: z.string().min(1),  // A1 with sheet prefix, e.g. "Sheet1!A1:B2"
      values: z.array(
        z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      ).min(1),
    }).strict()
  ).min(1, "updates must be a non-empty array.").max(BATCH_UPDATE_MAX_RANGES),
}).strict();
```

### Key decisions

1. **Q11 `valueInputOption` required.** Matches `update_cell` /
   `update_row` / `append_row`. No hidden default.
2. **`updates[]` length cap.** Recommend `BATCH_UPDATE_MAX_RANGES =
   100`. Bigger batches risk request size limits, Google's
   per-request quota, and runs-table jsonb size. Open decision —
   could be 50 or 200; 100 is a sane default.
3. **Range MUST include sheet prefix.** Schema enforces
   `z.string().regex(/^[^!]+!.+$/)` on each update's `range` field.
   V1 checks this post-hoc; V2 fails at parse time.
4. **`values` is a 2D array of `string | number | boolean | null`.**
   Matches `update_row` / `update_cell` cell value union. Inner
   array length is NOT validated (Sheets pads short rows; long rows
   spill into adjacent columns — caller's choice).
5. **NO raw request passthrough.** V2 ships typed input only. Raw
   batchUpdate request arrays are V1's escape hatch (analogous to
   Notion's rejected `make_api_call`); workflow authors that need a
   non-supported request type wait for a typed port.
6. **Reuses existing `_base.ts` / `errors.ts`.** New
   `valuesBatchUpdate` wrapper goes in
   `integrations/google-sheets/api/valuesBatchUpdate.ts` and follows
   the same error mapping shape as `valuesUpdate`.

### Output shape

```ts
{
  spreadsheetId: string,
  totalUpdatedRanges: number,
  totalUpdatedCells: number,
  totalUpdatedRows: number,
  totalUpdatedColumns: number,
  responses: ReadonlyArray<{
    updatedRange: string | null,
    updatedRows: number,
    updatedColumns: number,
    updatedCells: number,
  }>,
}
```

Bounded shape — no spread of Google's raw `responses` (V1 rot
GS-OUT). Each response is explicitly projected to the 4 numeric
counters + the canonical updated range string.

### V1 rot fixed

- Hardcoded `valueInputOption: "USER_ENTERED"` → Q11 required.
- 10-pair `cellN`/`valueN` UI chrome → single typed `updates[]` array.
- JSON-string mode (`JSON.parse` of stringified updates) → resolver pre-resolves typed values.
- Post-hoc `range.includes('!')` validation → Zod regex at parse time.
- Output `responses: result.responses` raw spread → bounded projection.

### Test plan

- Wrapper tests (`tests/unit/integrations/google-sheets/api/valuesBatchUpdate.test.ts`): POST shape, multi-update body, `valueInputOption` query param, GOOGLE_SHEETS_API_BASE override, 401/404/400-INVALID_ARGUMENT/500/non-JSON error mapping.
- Handler tests (`tests/unit/integrations/google-sheets/actions/batchUpdate.test.ts`): forwards `updates` + `valueInputOption` verbatim, output projection, totals sum across responses, accountId routing, propagates wrapper errors.
- Schema tests (subset of handler suite): missing `valueInputOption` rejected (Q11), missing range prefix rejected, empty `updates[]` rejected, max-length cap rejected, unknown fields rejected (V1 `inputMode`, `cell1`, `value1`, `sheetName`).
- Registry + manifest tests: new entry assertion + 11-action surface update.

---

## 5. `format_range` design

### Recommended surface — typed subset

```ts
const FormatRangeConfigSchema = z.object({
  spreadsheetId: z.string().min(1),
  sheetName: z.string().min(1),
  range: z.string().regex(/^[A-Z]+\d+(:[A-Z]+\d+)?$/i),  // A1 or A1:B5 only; no sheet prefix (sheetName separate)
  // At least ONE format option required (refined below).
  backgroundColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/).optional(),
  textColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  horizontalAlignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
  // Provisional — open decision §10. Recommended for 2.2:
  numberFormat: z.object({
    type: z.enum([
      "TEXT", "NUMBER", "PERCENT", "CURRENCY", "DATE", "TIME", "DATE_TIME", "SCIENTIFIC",
    ]),
    pattern: z.string().min(1).optional(),  // Sheets' optional format pattern, e.g. "#,##0.00"
  }).strict().optional(),
}).strict().refine(
  (c) => c.backgroundColor || c.textColor || c.bold !== undefined
      || c.italic !== undefined || c.horizontalAlignment || c.numberFormat,
  { message: "format_range requires at least one formatting option." },
);
```

### Key decisions

1. **Bare `range` field — no `rangeSelection` UI chrome.** Accepts
   single cell (`A1`), range (`A1:B5`). NO `entire_sheet` /
   `header_row` / `first_data_row` / `last_row` shortcuts (V1 chrome).
   Sheet identification is via the separate `sheetName` field; the
   handler resolves to `sheetId` via `spreadsheetsGet`.
2. **Hex colors validated up front.** `z.regex(/^#?[0-9A-Fa-f]{6}$/)`
   rejects garbage at parse time. V1's `parseInt(hex, 16)` accepted
   anything and produced nonsense RGB.
3. **Booleans are booleans.** `z.boolean()` rejects V1's stringly
   `"true"` / `"false"`. The resolver pre-resolves to real booleans.
4. **Alignment is an enum.** `LEFT` / `CENTER` / `RIGHT` only —
   no silent passthrough of arbitrary strings. (V1 silent-passthroughs.)
5. **Number format is a typed sub-object.** Sheets'
   `NumberFormat: { type, pattern? }` is small enough to encode as
   `z.object({ type: enum, pattern?: string })`. V1 doesn't ship
   number format at all; the audit §7 listed it as a 2.2 candidate.
   See §10 for the open decision on whether to include it.
6. **At least one format option required.** Zod `.refine` rejects
   the no-op case at design time. V1 returned `success: false` at
   runtime for the same case — V2 fails earlier.
7. **No fontSize / verticalAlignment / wrapStrategy / strikethrough /
   underline in 2.2.** V1 ships them but they're rarely high-value
   in real workflows. Deferred to on-demand follow-up; non-breaking
   to add later.
8. **Reuses `spreadsheetsBatchUpdate` wrapper.** No new wrapper.
   Handler constructs the typed `repeatCell` request inline (per
   CLAUDE.md "handlers build typed requests" rule).
9. **Reuses `spreadsheetsGet` for sheetName → sheetId.** Same
   pattern as `delete_row`. BOTH calls (`spreadsheetsGet` +
   `spreadsheetsBatchUpdate`) wrap in `refreshAndRetry`.
10. **A1 → GridRange conversion in a unit-testable helper.** New
    file `integrations/google-sheets/api/a1ToGridRange.ts` exporting
    a pure function. Edge cases: single-cell A1 (`A1` → start/end
    span 1×1), full-column refs (`A:A` — REJECTED at schema time, not
    supported in 2.2), invalid A1 (REJECTED at schema time via the
    `range` regex).

### Output shape

```ts
{
  spreadsheetId: string,
  sheetName: string,
  sheetId: number,
  formattedRange: string,    // <sheetName>!<range> (echoed)
  appliedFormat: {           // bounded V2 projection — NOT raw Google CellFormat
    backgroundColor: string | null,        // hex echo
    textColor: string | null,
    bold: boolean | null,
    italic: boolean | null,
    horizontalAlignment: "LEFT" | "CENTER" | "RIGHT" | null,
    numberFormat: { type, pattern } | null,
  },
}
```

Output omits the `userEnteredFormat` raw Google wire-format; the
echo is V2-shaped so downstream nodes can reference
`{{node.appliedFormat.bold}}` cleanly.

### V1 rot fixed

- `rangeSelection` UI chrome (entire_sheet / header_row / first_data_row / last_row) → bare A1 `range` only.
- `last_row` extra `values.get` call → no extra call; workflows compute their range explicitly.
- `parseInt(hex, 16)` accepting garbage → regex-validated hex at schema time.
- `bold === true || bold === 'true'` stringly-typed → `z.boolean()`.
- Silent enum passthrough → typed enums for alignment + (provisional) numberFormat type.
- Silent "no formatting" success: false → `.refine` rejects at schema time.
- Auxiliary `spreadsheets.get` call un-wrapped → V2 wraps both calls in `refreshAndRetry`.
- `cellFormat` output spread → bounded `appliedFormat` projection.

### Test plan

- A1 → GridRange helper unit tests: single cell, range, lower-case letters, multi-letter columns (`AA1:AB10`), invalid strings.
- Handler tests (`tests/unit/integrations/google-sheets/actions/formatRange.test.ts`): sheetName → sheetId resolution, request body shape (`repeatCell` with correct `fields` mask), `userEnteredFormat` construction per option, accountId routing, NotFoundError on missing sheetName, propagates wrapper errors from both calls, output projection.
- Schema tests (subset): missing range / sheetName / spreadsheetId rejected, empty range rejected, multi-letter A1 accepted, range with sheet prefix rejected (sheet name lives in `sheetName`), invalid hex rejected (`"#GGGGGG"`, `"red"`, `"123"`), no-options config rejected at refine, alignment enum mismatch rejected, numberFormat type enum mismatch rejected, unknown fields rejected (`fontSize`, `verticalAlignment`, `strikethrough`, `underline`, `wrapStrategy`, `borders`, `rangeSelection`).
- Registry + manifest tests: new entry assertion + 11-action surface update.

---

## 6. P-GS2 formatting wrapper decision

**Recommendation: NO platform slice. Provider-local typed action
implementation only.**

The parity audit §10 listed P-GS2 as "Formatting API typed wrapper"
because Sheets' `CellFormat` API has dozens of sub-fields and Marcus
wanted a flag to revisit if a fuller surface is asked for.

The Sheets 2.1 outcomes pinned the durable rule that
`spreadsheetsBatchUpdate` is intentionally **untyped at the wrapper
layer** — handlers build typed requests inline. That rule applies
equally to `format_range`: the wrapper accepts arbitrary
`requests[]`, the handler builds the typed `repeatCell` request from
V2's bounded `CellFormat` projection.

A platform-level "formatting DSL" would only be useful if MULTIPLE
providers needed a unified format-cell abstraction. Excel's format
surface (the only other provider with cells) is Graph-side
table-formatting work, not Sheets' `CellFormat` shape. They don't
share enough surface to justify a shared abstraction.

**Outcome:** P-GS2 collapses into Sheets 2.2's `format_range` action.
The audit entry can be marked DONE-IN-2.2 once Sheets 2.2 ships.
Future expansion (borders, conditional formatting, data validation,
fontSize, etc.) lands as additional optional fields on the same
schema — non-breaking, no separate wrapper, no platform-tier
abstraction.

---

## 7. V1 rot to avoid

Consolidated from §2 + Sheets 2.1 outcomes §3:

| ID | Pattern | V2 stance |
|---|---|---|
| GS-R1 | `unifiedAction` add/update/delete router | NOT PORTED — typed actions only |
| GS-R12 (new) | V1 `batchUpdate` simple-mode 10-pair `cellN`/`valueN` UI chrome | NOT PORTED — typed `updates[]` array only |
| GS-R13 (new) | V1 `batchUpdate` JSON-string mode (caller passes stringified JSON) | NOT PORTED — resolver pre-resolves typed values; schema accepts only structured arrays |
| GS-R14 (new) | V1 `batchUpdate` hardcoded `valueInputOption: "USER_ENTERED"` | NOT PORTED — Q11 required explicit |
| GS-R15 (new) | V1 `formatRange` `rangeSelection` UI chrome with `last_row` extra `values.get` call | NOT PORTED — bare A1 `range` only |
| GS-R16 (new) | V1 `formatRange` `bold === true \|\| bold === 'true'` stringly-typed boolean coercion | NOT PORTED — `z.boolean()` |
| GS-R17 (new) | V1 `parseInt(hex, 16)` no input validation | NOT PORTED — hex regex at schema time |
| GS-R18 (new) | V1 silent enum passthrough (alignment / wrap strategy / number format type) | NOT PORTED — typed enums |
| GS-R19 (new) | V1 `appliedFormatting: cellFormat` raw output spread | NOT PORTED — bounded V2 projection |
| GS-R20 (new) | V1 `formatRange` auxiliary `spreadsheets.get` un-wrapped in retry | NOT PORTED — V2 wraps both calls in `refreshAndRetry` |
| GS-R3 / GS-R10 | Orphan handlers / template chrome / Drive folder placement (pre-existing) | NOT PORTED — already pinned by Sheets 2.1 outcomes |

The `inputMode` discriminator pattern is the same shape as V1's
`unifiedAction` router (GS-R1) and Notion's `manage_*` routers
(N-R7) — same skip.

Raw arbitrary request arrays at the action layer are an escape
hatch in the spirit of Notion's `make_api_call` (N-R5) — same skip.

---

## 8. Implementation batch plan

Five commits total (this plan doc + 2 action implementation commits +
1 e2e + 1 outcomes):

| # | Commit | What lands |
|---|---|---|
| 1 | (this) | `docs(google-sheets): plan 2.2 batch and formatting` |
| 2 | impl | `feat(google-sheets): add batch update action` — `valuesBatchUpdate` wrapper + `batch_update` action + schema + tests + registry entry + manifest test update |
| 3 | impl | `feat(google-sheets): add format range action` — `a1ToGridRange` helper + `format_range` action + schema + tests + registry entry + manifest test update |
| 4 | e2e | `test(google-sheets): extend walkthrough with 2.2 actions` — mock additions (values.batchUpdate handler + RecordedSheetsValuesBatchUpdate type; spreadsheetsBatchUpdate already records repeatCell shape) + new test.describe block exercising both actions end-to-end |
| 5 | docs | `docs(google-sheets): document 2.2 outcomes` — `docs/slices/google-sheets-2-2-outcomes.md` + CLAUDE.md progress entry update |

Each implementation commit individually gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/google-sheets/ tests/unit/services/execution/handlers/`
- `npm test`

E2E commit also gates:
- `npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts --workers=1`

Explicit path staging only — no `git add .`. Microsoft Excel WIP +
Stripe WIP (in another chat) + unrelated parallel-work files
(`docs/rules/database-security.md`, `PACKAGES.md`) untouched at
every commit.

---

## 9. E2E plan

Extend [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts)
with a third `test.describe` block: **"Sheets 2.2 — batch update +
format range actions e2e"**.

### Single chained test (matches Sheets 2.1 e2e pattern)

```
row_changed
  → batch_update (multi-range write)
  → format_range (apply formatting)
```

ONE workflow, ONE webhook fire, both actions. Pre-populate the sheet
with the 3-row baseline used by Sheets 2.1's chain; inject one
trigger row; assert per-step outputs + mock call shapes.

### Per-step assertions

**`batch_update`:**
- Step output `totalUpdatedRanges`, `totalUpdatedCells`, `responses[]` match expectations.
- Mock `values.batchUpdate` receives ONE POST with body `{valueInputOption: "USER_ENTERED", data: [{range, values}, ...]}`.

**`format_range`:**
- Step output `sheetId`, `formattedRange`, `appliedFormat: {bold: true, backgroundColor: "#ea4335"}`.
- Mock `spreadsheets.get` receives ONE call (sheetName → sheetId resolution).
- Mock `spreadsheets.batchUpdate` receives ONE POST with body containing a `repeatCell` request with the correct `userEnteredFormat` + `fields` mask + `GridRange`.

### Mock additions

1. **`POST /v4/spreadsheets/{id}/values:batchUpdate`** — new mock
   handler. Echoes a synthetic response (per-range
   `{updatedRange, updatedRows, updatedColumns, updatedCells}`).
   New `RecordedSheetsValuesBatchUpdate` type. Reset wiring +
   `__inspect` exposure.
2. **`spreadsheetsBatchUpdate` already records every request** — the
   existing `RecordedSheetsSpreadsheetsBatchUpdate.body.requests[]`
   field captures the `repeatCell` request shape verbatim. The e2e
   asserts on this nested shape; optional enhancement: extract a
   `firstRepeatCellRequest` convenience field on the recorded type
   (analogous to the existing `firstDeleteDimensionRange`) to keep
   assertions readable.

### Validation outcome

- 3 tests / 3 passing in [`slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) under `--workers=1`.
- No regression in the existing 2 tests.

---

## 10. Open decisions for Marcus

Three real decision points; the recommended option is the first item
in each list.

### Decision 1 — `batch_update` raw vs typed input

- **(a) Typed `updates: Array<{range, values}>` only. (RECOMMENDED.)** No raw `requests[]` passthrough. Workflow authors that need a non-supported request type wait for a typed port (or compose other actions).
- (b) Allow raw `requests[]` arrays for advanced users, with a `mode: "typed" | "raw"` discriminator and Zod validation per arm.

(a) matches Sheets 2.1 outcomes §2.1 and CLAUDE.md durable rule "no
raw API body passthrough". (b) is an escape hatch in the spirit of
Notion's rejected `make_api_call`.

### Decision 2 — `format_range` subset for 2.2

- **(a) Background color + text color + bold + italic + horizontal alignment + number format (typed sub-object). (RECOMMENDED.)** Number format is the only field that EXTENDS V1's surface (V1 doesn't ship it); the audit §7 listed it as a 2.2 candidate and Sheets has a small enough `NumberFormat` shape to validate cleanly.
- (b) Same as (a) but excluding `numberFormat` to stay strictly-parity. Add `numberFormat` in a later commit if/when a workflow needs it.
- (c) Broader subset including `fontSize`, `verticalAlignment`, `wrapStrategy`, `strikethrough`, `underline` (V1 supports all of them but they're low-leverage in real workflows).

(a) ships 6 typed options vs V1's ~12 — covers the dominant cases
without surface bloat. (b) is the safer parity-only choice. (c) is
the V1-completeness choice and is rejected.

### Decision 3 — borders / conditional formatting / data validation

- **(a) Defer all three to on-demand follow-up. (RECOMMENDED.)** Each has a non-trivial sub-schema (borders has 4-side × {style, width, color}, conditional formatting has rule-builder shapes, data validation has condition-builder shapes). Marcus's prompt explicitly recommends defer.
- (b) Borders only in 2.2 (typed-and-narrow `borders: { top, bottom, left, right }` with `style: "SOLID" | "DASHED" | "DOTTED" | "NONE"` enum only); conditional formatting + data validation defer.

(a) is consistent with audit §11 R-2 risk mitigation ("dominant
typed subset only; defer rare formatting to P-GS2"). P-GS2 is now
collapsed into Sheets 2.2's `format_range` per §6 — but
"P-GS2-expansion" remains the right home for borders / conditional
formatting / data validation when a real workflow asks for them.

---

## 11. Acceptance gates (per implementation commit)

- Schemas `.strict()` — V1 field names from §2 audit fail at parse time.
- `valueInputOption` required on `batch_update` (Q11 rule).
- `format_range` `.refine` rejects no-option config at design time.
- Hex colors validated via regex at schema time; nonsense input fails.
- Booleans are `z.boolean()`; alignment + number format type are enums.
- Output projections are bounded — no raw Google response spread.
- All handlers wrap principal + auxiliary calls in `refreshAndRetry`.
- A1 → GridRange helper covered by direct unit tests in `tests/unit/integrations/google-sheets/api/a1ToGridRange.test.ts`.
- New `valuesBatchUpdate` wrapper covered by direct unit tests matching the `spreadsheetsBatchUpdate.test.ts` shape (request shape, GOOGLE_SHEETS_API_BASE override, 401/404/400/500/non-JSON error mapping).
- Registry + manifest tests pinned to the 11-action surface.
- E2E walkthrough: 3 tests / 3 passing under `--workers=1`.
- Full jest suite green. tsc clean. lint clean. lint:structure + lint:migrations clean.

---

## 12. Risk estimate

### R-2.2-1 — `format_range` surface budget creep

- **Likelihood:** medium. Each new format option is small in isolation but the schema gains breadth fast (borders alone is 4-side × 3-property = 12 sub-fields).
- **Impact:** medium. Schema complexity creates maintenance burden + reviewer fatigue + makes deferral decisions harder.
- **Mitigation:** Decision 2 + Decision 3 cap the 2.2 surface explicitly. Future expansion lands as additional optional fields on the same schema — non-breaking. Audit § "P-GS2" entry collapses into 2.2 + tracked as "expansion landing zone".

### R-2.2-2 — A1 → GridRange edge cases

- **Likelihood:** medium. V1's inline conversion handles `A1:D10` cleanly but breaks on `A:D` (full columns), `1:10` (full rows), single-cell `A1` (V1's regex requires the colon).
- **Impact:** low. V2's `range` regex `^[A-Z]+\d+(:[A-Z]+\d+)?$` rejects the broken cases at schema time. Workflow authors that need full-column / full-row formatting compose multiple `format_range` calls or wait for an expansion.
- **Mitigation:** Extract conversion into a unit-testable helper with explicit tests for: single-cell A1, two-letter columns (AA1:AB10), case-insensitive letters (lowercase rejected for consistency or accepted?), `A:A` / `1:1` rejected via the regex.

### R-2.2-3 — Mock-server values.batchUpdate handler coverage gap

- **Likelihood:** low. Adding the new endpoint mirrors the existing pattern (`POST /v4/spreadsheets/{id}/values/{range}:append` shape).
- **Impact:** low. E2E test would surface any mismatch immediately.
- **Mitigation:** Mirror the existing `valuesAppend` mock handler in shape — same path-prefix regex pattern, same body parsing, same recorded fields.

---

## 13. Exit checklist (post Sheets 2.2 ship)

- [ ] `valuesBatchUpdate` wrapper landed with full error-mapping parity to existing wrappers.
- [ ] `batch_update` action registered + typed-only + Q11 required.
- [ ] `format_range` action registered + typed-subset of `CellFormat`.
- [ ] `a1ToGridRange` helper extracted + unit-tested.
- [ ] Hex color regex validated at schema time (no `parseInt(hex, 16)` garbage acceptance).
- [ ] Output projections bounded — no raw Google response spread.
- [ ] All schemas `.strict()` rejecting V1 field names from §2.
- [ ] Mock `values.batchUpdate` handler + RecordedSheetsValuesBatchUpdate type.
- [ ] E2E walkthrough extended; 3/3 passing.
- [ ] Outcomes doc + CLAUDE.md update.
- [ ] V2 Google Sheets action total: **12** (5 Slice 5 + 5 Google Sheets 2.1 + 2 Google Sheets 2.2).

**Implementation does NOT begin before Marcus accepts this plan.**
