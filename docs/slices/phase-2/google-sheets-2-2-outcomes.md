# Google Sheets 2.2 — Batch + formatting outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) (accepted before Sheets 2.1).
**Slice plan:** [`docs/slices/google-sheets-2-2-batch-formatting-plan.md`](google-sheets-2-2-batch-formatting-plan.md) (accepted before Commit 2 began).
**Predecessor outcomes:** [`docs/slices/google-sheets-2-1-outcomes.md`](google-sheets-2-1-outcomes.md) — Phase 2 baseline (10 actions, durable rules established).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/google-sheets/`](../../integrations/google-sheets/).

Google Sheets 2.2 closes the remaining two action items from the
parity audit §7: `batch_update` (multi-range write via the
`values.batchUpdate` endpoint) and `format_range` (typed cell
formatting subset via `spreadsheets.batchUpdate` + `repeatCell`). The
slice introduces **one new wrapper** (`valuesBatchUpdate`) and **one
new pure helper** (`a1ToGridRange`); both existing wrappers
(`spreadsheetsBatchUpdate` from Sheets 2.1 Commit 3 for the
`repeatCell` request type, `spreadsheetsGet` from Slice 5 for
sheetName → sheetId resolution) are reused unchanged. **No new
platform infrastructure.**

The qualitative shift continues the Sheets 2.1 stance: V1's
`batchUpdate.ts` 10-pair `cellN`/`valueN` simple-mode UI chrome,
JSON-string parsing, and hardcoded `valueInputOption` are NOT ported.
V1's `formatRange.ts` `rangeSelection` UI shortcuts, `parseInt(hex, 16)`
no-validation hex parsing, stringly-typed booleans, and silent enum
passthrough are NOT ported. V2 ships two typed `ActionHandler`
modules with `.strict()` Zod schemas, regex-validated A1, bounded
output projections, and dynamic per-leaf `fields` masks.

The collateral fix in Commit 4 (`fix(e2e): randomize Sheets 2.1
trigger-row inject value`) addressed a Sheets 2.1 chained-e2e
flake-after-first-run: the chained test injected a deterministic row
value, so the Google Sheets trigger eventId hash component was
constant across runs and subsequent runs hit `webhook_event_dedup`
and were silently dropped. The fix randomizes the inject value to
match the single-action test's existing pattern. Same fix applied
preemptively to the Sheets 2.2 chained e2e.

---

## 1. Scope shipped

### Actions (2)

| Action | Sheets endpoint(s) | What it does | V1 reference |
|---|---|---|---|
| `batch_update` | `POST .../v4/spreadsheets/{id}/values:batchUpdate` | Multi-range cell write in a single call. Typed `updates: Array<{range, values}>` only — no V1 simple-mode chrome, no JSON-string parsing, no raw passthrough. Q11 `valueInputOption` required. 1..100 entries; each `range` must include a sheet-name prefix. | `batchUpdate.ts` (typed-mode subset only) |
| `format_range` | `GET .../v4/spreadsheets/{id}` + `POST .../v4/spreadsheets/{id}:batchUpdate` (one `repeatCell` request) | Typed-subset cell formatting (six options per accepted plan Decision 2: backgroundColor, textColor, bold, italic, horizontalAlignment, numberFormat). Hex colors regex-validated; alignment + number format type enum-validated; at least one option required via `.refine`. Bounded `appliedFormat` output. | `formatRange.ts` (typed-subset of the V1 ~12-option surface) |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).
**V2 Google Sheets action total after 2.2: 12** (5 Slice 5 + 5 Google Sheets 2.1 + 2 Google Sheets 2.2).

### API wrappers + helpers (1 new wrapper + 1 new helper)

| Module | What it does | Used by |
|---|---|---|
| NEW [`api/valuesBatchUpdate.ts`](../../integrations/google-sheets/api/valuesBatchUpdate.ts) | `POST /v4/spreadsheets/{id}/values:batchUpdate` wrapper. Body-level `valueInputOption` + typed `data[{range, values}]`. Same error mapping as other `values.*` wrappers (401 / 404 / 400-INVALID_ARGUMENT / typed `Error`). | `batch_update` |
| NEW [`api/a1ToGridRange.ts`](../../integrations/google-sheets/api/a1ToGridRange.ts) | Pure helper: A1 → `GridRange` (0-indexed half-open). Rejects full-column (`A:A`), full-row (`1:1`), sheet-prefixed (`Sheet1!A1`), and lowercase letters via `InvalidA1RangeError`. | `format_range` |

Existing wrappers reused without modification:

| Wrapper | Reused by |
|---|---|
| `spreadsheetsBatchUpdate` (Sheets 2.1 Commit 3) | `format_range` (single `repeatCell` request) |
| `spreadsheetsGet` (Slice 5) | `format_range` (sheetName → sheetId resolution) |

All wrappers continue to honor `GOOGLE_SHEETS_API_BASE` for e2e and
follow the canonical error mapping shape Sheets 2.1 pinned (401 →
`Unauthorized401Error`, 404 / 400-INVALID_ARGUMENT → `NotFoundError`,
other non-2xx → tagged `Error("Google Sheets <op> failed: <surfaced>")`).
**Zero changes** to `_base.ts` / `errors.ts`.

### Manifest scope changes

**None.** Slice 5's existing
`https://www.googleapis.com/auth/spreadsheets` scope covers both new
endpoints. No OAuth flow, no scope widening, no capability changes.

---

## 2. Durable decisions worth preserving

### 2.1 `batch_update` is typed-only — no raw `requests[]`, no JSON string, no UI chrome

V1's [`batchUpdate.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/batchUpdate.ts)
shipped two modes via an `inputMode` discriminator:

- **Simple mode (default):** 10 paired `cellN` + `valueN` UI fields. The handler stitched non-empty pairs into `updates[]`. 20-field schema burden.
- **JSON mode:** `updates` accepts an array OR a stringified JSON of an array. The handler called `JSON.parse` if string-typed.

V2 ships a single typed shape — `updates: Array<{range, values}>`
only. No `inputMode` field. No `cellN`/`valueN` fields. No string
acceptance for `updates`. Same skip pattern as V1's
`unifiedAction.ts` add/update/delete router (audit GS-R1, Sheets 2.1
outcomes §2.1) and Notion's `manage_*` routers.

Raw `requests[]` arrays at the action layer (Sheets' wider
`batchUpdate` umbrella covers dozens of request types) are
rejected too — escape hatches in the spirit of Notion's rejected
`make_api_call`. The wrapper `spreadsheetsBatchUpdate` remains
intentionally untyped on its `requests[]` field per Sheets 2.1 §2.10;
handlers continue to build typed requests inline. `batch_update`
specifically uses the **separate** `values.batchUpdate` endpoint
(NOT `spreadsheets.batchUpdate`) and its body shape is the simpler
`{valueInputOption, data[]}` form — strictly typed at the schema and
wrapper layers.

### 2.2 Q11 `valueInputOption` is REQUIRED on `batch_update`

V1 hardcoded `valueInputOption: "USER_ENTERED"` in the request body —
classic Q11 violation (silent default the workflow author never
sees). V2's schema requires `z.enum(["RAW", "USER_ENTERED"])`. Same
rule as `update_cell` / `update_row` / `append_row`. The choice
matters: literal cell content containing `=` stays a string under
`RAW`, parses as a formula under `USER_ENTERED`. V2 forces the
choice.

### 2.3 `batch_update` range MUST include a sheet prefix — validated at parse time

V1 checked `range.includes("!")` post-hoc inside the handler. V2's
schema validates `^[^!]+!.+$` on each update's `range` field at
parse time. Workflow authors that forget the prefix get a clear
schema error before the action runs. Matches Slice 5's `update_row`
+ `clear_range` semantics — ranges are always fully-qualified A1
with sheet prefix at the runtime layer; only the cell-actions `cell`
field (`get_cell_value` / `update_cell`) carries `sheetName`
separately.

### 2.4 `batch_update` is bounded — `BATCH_UPDATE_MAX_RANGES = 100`

V1 had no length cap on `updates[]`. V2 pins the maximum at 100
entries. Bigger batches risk Sheets' per-request size limits,
quota costs, and `workflow_runs.steps` jsonb size growth. The cap
is sane-default territory (could equally be 50 or 200); 100 keeps
the door open for legitimate bulk-update workflows while protecting
the runtime.

### 2.5 `batch_update` output is bounded — no raw Google response spread

V1's output was a raw spread of Google's response (`spreadsheetId`,
`totalUpdatedRanges`, `totalUpdatedCells`, `totalUpdatedRows`,
`totalUpdatedColumns`, `responses` straight passthrough). V2 ships
an explicit projection:

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

Each per-response entry is projected to the 4 numeric counters + the
canonical updated range. No `replies` field, no `spreadsheetsRange`,
no other Google response keys leak through.

### 2.6 `format_range` ships a typed subset — six options only

V1's [`formatRange.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/formatRange.ts)
exposed roughly 12 formatting fields:
`backgroundColor`, `textColor`, `bold`, `italic`, `strikethrough`,
`underline`, `fontSize`, `horizontalAlignment`, `verticalAlignment`,
`textWrapping`/`wrapStrategy`, plus a `rangeSelection` UI chrome of
its own.

V2 ships **six** options per the accepted plan §10 Decision 2:

- `backgroundColor` (hex string → Google color object)
- `textColor` (hex string → `textFormat.foregroundColor`)
- `bold` (under `textFormat.bold`)
- `italic` (under `textFormat.italic`)
- `horizontalAlignment` (`LEFT` / `CENTER` / `RIGHT` enum)
- `numberFormat` (`{type: enum, pattern?: string}` typed sub-object)

`numberFormat` is the only field that **extends** V1's surface — V1
doesn't ship it at all. The audit §7 listed it as a 2.2 candidate
and Sheets' `NumberFormat` shape is small enough (`type` enum +
optional `pattern` string) to validate cleanly without a heavier
schema. Borders / conditional formatting / data validation /
`strikethrough` / `underline` / `fontSize` / `verticalAlignment` /
`wrapStrategy` all defer per plan §10 Decision 3 — non-breaking to
add later as additional optional fields on the same schema.

### 2.7 `format_range` is provider-local typed — no P-GS2 platform DSL

The parity audit §10 originally listed P-GS2 ("Formatting API typed
wrapper") as a candidate platform slice in case Sheets formatting
proved generalizable. The accepted plan §6 collapsed P-GS2 into
Sheets 2.2 itself: there's no second provider with a comparable
`CellFormat` shape (Excel's format surface is Graph-side
table-formatting, not Sheets' `CellFormat`), so a shared abstraction
has no second consumer. **No platform slice.** Future formatting
expansion (borders, conditional formatting, data validation, etc.)
lands as additional optional fields on `FormatRangeConfigSchema` —
provider-local typed extension, no platform DSL.

### 2.8 `format_range` uses a bare A1 range — sheetName is a separate field

V1's `range` field accepted sheet-prefixed A1 (`Sheet1!A1:B5`) or
plain A1 (`A1:B5`) interchangeably, plus a `rangeSelection: 'custom'
| 'entire_sheet' | 'header_row' | 'first_data_row' | 'last_row'`
UI chrome (with `last_row` doing an EXTRA `values.get` call inside a
format-only action to discover the row count).

V2's schema enforces a bare A1 regex `^[A-Z]+[1-9][0-9]*(:[A-Z]+[1-9][0-9]*)?$`
on `range` — no sheet prefix, no shortcuts. `sheetName` lives in its
own required schema field; the handler resolves to `sheetId` via
`spreadsheetsGet`. Single-cell (`A1`) and range (`A1:B5`) shapes
both supported via the regex's optional capture group; multi-letter
columns (`AA1:AB10`) supported. Full-column (`A:A`), full-row
(`1:1`), and lowercase (`a1`) are all rejected at schema time.
`rangeSelection` and `last_row`'s extra `values.get` call are NOT
ported.

### 2.9 `a1ToGridRange` is a pure helper with explicit rejection cases

V1's `formatRange.ts` inlined the A1 → GridRange conversion at
[`formatRange.ts:66-80`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/formatRange.ts).
V2 extracts the conversion into [`integrations/google-sheets/api/a1ToGridRange.ts`](../../integrations/google-sheets/api/a1ToGridRange.ts)
as a pure function returning `{startRowIndex, endRowIndex,
startColumnIndex, endColumnIndex}` (0-indexed half-open, the shape
Sheets' `repeatCell` expects). The helper is unit-testable
independently of the action handler. Rejection cases throw
`InvalidA1RangeError`:

- Sheet-prefixed (`Sheet1!A1`) — the schema rejects this first, but the helper guards anyway.
- Full-column (`A:A`) — the regex doesn't match.
- Full-row (`1:1`) — the regex doesn't match.
- Lowercase letters (`a1`) — strict-case A-Z only.
- Inverted ranges where `endRow < startRow` or `endCol < startCol`.

`sheetId` is added by the caller — `a1ToGridRange` does NOT depend
on any I/O.

### 2.10 Hex colors are regex-validated at schema time

V1's `hexToRgb()` called `parseInt(hex, 16)` with no input
validation; literal garbage like `"hello"` parsed to `NaN` and
produced nonsense RGB output that Sheets silently accepted. V2's
schema enforces `^#?[0-9A-Fa-f]{6}$` — exactly 6 hex digits, leading
`#` optional, case-insensitive. Three-digit shorthand (`#FFF`) is
NOT supported (Sheets' API doesn't use it; expanding is a non-
breaking future change). The handler's
`hexToGoogleColor` transform is invoked only on regex-validated
input.

### 2.11 Booleans are booleans; enums are enums; numbers are numbers

V1 emitted UI form values as strings (`bold === "true"` / `"false"`)
and the handler coerced via `bold === true || bold === 'true'`.
Alignment / wrap strategy / number format type were silent
passthroughs of arbitrary strings. V2's schema uses `z.boolean()`,
`z.enum(...)`, and `z.number()` directly — the resolver pre-resolves
template variables to their typed shapes before the action runs.
Schemas reject typos (`bold: "yes"`, `horizontalAlignment: "centre"`)
at parse time.

### 2.12 `format_range` requires at least one option — `.refine` at schema time

V1's no-options case returned `success: false` at runtime. V2's
schema applies `.refine` so the no-options config fails at parse
time with a clear message listing every accepted option. Workflow
authors get the error in the builder, not after the trigger fires.

### 2.13 Dynamic per-leaf `fields` mask on the `repeatCell` request

Sheets' `repeatCell.fields` mask determines which sub-paths of
`userEnteredFormat` Sheets OVERWRITES (paths NOT in the mask are
preserved). V1 sent broad masks like `"userEnteredFormat"` or
`"userEnteredFormat.textFormat"` — overwriting unrelated
sub-properties that the workflow never asked to change.

V2 builds the mask dynamically — one comma-separated path per option
the user supplied:

| Option set | `fields` mask path |
|---|---|
| `backgroundColor` | `userEnteredFormat.backgroundColor` |
| `textColor` | `userEnteredFormat.textFormat.foregroundColor` |
| `bold` | `userEnteredFormat.textFormat.bold` |
| `italic` | `userEnteredFormat.textFormat.italic` |
| `horizontalAlignment` | `userEnteredFormat.horizontalAlignment` |
| `numberFormat` | `userEnteredFormat.numberFormat` |

When only `bold` is supplied, the mask is exactly
`"userEnteredFormat.textFormat.bold"` — Sheets preserves any existing
italic / strikethrough / underline / fontSize values. When `bold` +
`textColor` are both supplied, the mask is
`"userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor"`
— still surgical. Insertion order is preserved (the handler appends
in a fixed iteration order); the e2e splits + sorts before
asserting so the assertion is stable regardless of source-order
shuffling.

### 2.14 `format_range` output is bounded — no raw `CellFormat` spread

V1's output spread `appliedFormatting: cellFormat` raw — leaking
Google's wire-format `red`/`green`/`blue` nested objects and the
`fields` mask string straight into workflow variables. V2 ships an
explicit projection:

```ts
{
  spreadsheetId: string,
  sheetName: string,
  sheetId: number,
  formattedRange: string,         // `<sheetName>!<range>`
  appliedFormat: {                // ONLY the options the workflow supplied — others omitted
    backgroundColor?: string,     // hex echoed verbatim (NOT Google RGB)
    textColor?: string,
    bold?: boolean,
    italic?: boolean,
    horizontalAlignment?: "LEFT" | "CENTER" | "RIGHT",
    numberFormat?: { type, pattern? },
  },
}
```

`appliedFormat` only contains keys for options the workflow supplied
— Sheets-side absence is preserved (V1 emitted `null` placeholders).
`backgroundColor` and `textColor` echo the hex string the user
supplied, NOT the Google RGB triple — downstream nodes reference
`{{node.appliedFormat.backgroundColor}}` and get back the same
`"#FFFF00"` they passed in. The `fields` mask and the raw
`userEnteredFormat` Google object NEVER leak into the output. The
e2e pins these invariants via `not.toHaveProperty("fields")`,
`not.toHaveProperty("userEnteredFormat")`, and explicit hex-echo
assertions.

### 2.15 Auxiliary calls also wrap in `refreshAndRetry`

Same rule as Sheets 2.1 §2.11. `format_range` composes
`spreadsheetsGet` (sheetName → sheetId) + `spreadsheetsBatchUpdate`
(the principal write). BOTH calls are wrapped in `refreshAndRetry`
— the metadata GET that precedes a write needs the same token-
decryption + 401 retry mediation as the write. Per CLAUDE.md
§"OAuth 401 handling" rule that auxiliary calls also route through
the refresh+retry wrapper.

### 2.16 Chained-e2e trigger rows MUST use randomized values

The collateral fix in Commit 4 surfaced a Sheets-specific cross-run
flake mode: V2's Google Sheets `row_changed` trigger normalizes
events with a deterministic `eventId` of the form
`${spreadsheetId}:${sheetName}:${rowIndex}:${sha256(JSON.stringify(values)).slice(0,12)}`
(see [`integrations/google-sheets/triggers/rowChanged/normalize.ts`](../../integrations/google-sheets/triggers/rowChanged/normalize.ts)).
The `webhook_event_dedup` table is system-wide and NOT cascaded by
`deleteTestUser`. If a chained e2e injects a deterministic row
value, the FIRST run writes the dedup row and EVERY SUBSEQUENT run
hits dedup and the dispatcher silently drops the event — the engine
never starts, no `workflow_runs` row appears, and the test times
out at `waitFor`.

The cure is to randomize the trigger-firing row value per-run:
```ts
const carolLabel = `carol-${randomUUID()}`;
await page.request.post(`${mock.baseUrl}/__injectSheetRow`, {
  data: { values: [carolLabel, "carol@e.test"] },
});
```

The slice-5b single-action test (Slice 5b commit `7b3d9e342`)
established this pattern; both the Sheets 2.1 chained test (Commit 4
of Sheets 2.1) and the Sheets 2.2 chained test (this slice's Commit 4)
were initially authored with hardcoded values and corrected via the
randomization pattern. Documented at the file level in
`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts` lines 73-76.
Future Sheets chained tests MUST follow the same pattern.

---

## 3. V1 rot fixed (consolidated)

All entries from parity-google-sheets §8 marked as 2.2 candidates +
the new entries from plan §7 are addressed:

| ID | Pattern | V2 status |
|---|---|---|
| GS-R11 | V1 `formatRange` schema with ~12 inputs + `rangeSelection` UI chrome | TYPED SUBSET — 6 typed options shipped (5 V1 + `numberFormat` extending). Borders / conditional formatting / data validation / `strikethrough` / `underline` / `fontSize` / `verticalAlignment` / `wrapStrategy` deferred to on-demand follow-up. |
| GS-R12 | V1 `batchUpdate` simple-mode 10-pair `cellN`/`valueN` UI chrome | NOT PORTED — typed `updates[]` array only. |
| GS-R13 | V1 `batchUpdate` JSON-string mode (caller passes stringified JSON of `updates`) | NOT PORTED — resolver pre-resolves typed values; schema accepts only structured arrays. |
| GS-R14 | V1 `batchUpdate` hardcoded `valueInputOption: "USER_ENTERED"` | NOT PORTED — Q11 required explicit. |
| GS-R15 | V1 `formatRange` `rangeSelection` UI chrome + `last_row` extra `values.get` call | NOT PORTED — bare A1 `range` only. |
| GS-R16 | V1 `formatRange` `bold === true \|\| bold === 'true'` stringly-typed boolean coercion | NOT PORTED — `z.boolean()`. |
| GS-R17 | V1 `parseInt(hex, 16)` no input validation | NOT PORTED — hex regex at schema time. |
| GS-R18 | V1 silent enum passthrough (alignment / wrap strategy / number format type) | NOT PORTED — typed enums. |
| GS-R19 | V1 `appliedFormatting: cellFormat` raw output spread (leaks Google wire-format) | NOT PORTED — bounded `appliedFormat` V2 projection. |
| GS-R20 | V1 `formatRange` auxiliary `spreadsheets.get` un-wrapped in retry | NOT PORTED — V2 wraps both calls in `refreshAndRetry`. |
| GS-R21 (new this slice) | Sheets chained e2e using deterministic row values across runs | FIXED — randomize per-run via `${aliceLabel}-${randomUUID()}` / `${carolLabel}-${randomUUID()}` pattern. Documented at spec-file level. |

---

## 4. Files shipped

### Source

**Actions (Commits 2-3):**
- [`integrations/google-sheets/actions/batchUpdate.ts`](../../integrations/google-sheets/actions/batchUpdate.ts) + [`.schema.ts`](../../integrations/google-sheets/actions/batchUpdate.schema.ts) (Commit 2)
- [`integrations/google-sheets/actions/formatRange.ts`](../../integrations/google-sheets/actions/formatRange.ts) + [`.schema.ts`](../../integrations/google-sheets/actions/formatRange.schema.ts) (Commit 3)

**API wrappers + helpers (NEW):**
- [`integrations/google-sheets/api/valuesBatchUpdate.ts`](../../integrations/google-sheets/api/valuesBatchUpdate.ts) (Commit 2 — NEW wrapper)
- [`integrations/google-sheets/api/a1ToGridRange.ts`](../../integrations/google-sheets/api/a1ToGridRange.ts) (Commit 3 — NEW pure helper)

**Registry:** [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts) updated twice (2 new entries: `batch_update`, `format_range`).

### Tests

| Commit | New wrapper / helper tests | Handler tests | Schema validation tests (subset of handler suite) | Manifest/registry tests |
|---|---|---|---|---|
| 2 | 14 (`valuesBatchUpdate`) | 28 `batch_update` (handler) | covered inside the 28 | +1 manifest + 1 registry |
| 3 | 19 (`a1ToGridRange`) | 36 `format_range` (handler) | covered inside the 36 | +1 manifest + 1 registry |

**Google Sheets 2.2 specific subset after Commit 3: 4 suites / 100 tests
passing** (`npx jest tests/unit/integrations/google-sheets/actions/batchUpdate.test.ts tests/unit/integrations/google-sheets/actions/formatRange.test.ts tests/unit/integrations/google-sheets/api/valuesBatchUpdate.test.ts tests/unit/integrations/google-sheets/api/a1ToGridRange.test.ts`).

**Full Google Sheets focused subset after Commit 3: 25 suites / 333
tests passing** (`npx jest tests/unit/integrations/google-sheets/ tests/unit/services/execution/handlers/`).

### E2E

- [`tests/e2e/helpers/mockGoogleServer.ts`](../../tests/e2e/helpers/mockGoogleServer.ts) extended with `POST /v4/spreadsheets/{id}/values:batchUpdate` handler + `sheetsValuesBatchUpdate` recorder + `firstRepeatCellRequest` convenience extraction on the existing `sheetsSpreadsheetsBatchUpdate` recorder (so format_range's `repeatCell` request can be asserted without walking `body.requests[0].repeatCell.*` inline).
- [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) extended with a third `test.describe` block: **"Sheets 2.2 — batch_update + format_range actions e2e"**. ONE workflow chain (`row_changed → batch_update → format_range`), one webhook fire, two action steps. Per-step assertions cover wire format (`values.batchUpdate` body shape, `spreadsheets.batchUpdate` `repeatCell` GridRange + `userEnteredFormat` + `fields` mask) and bounded output projection (`not.toHaveProperty("fields")`, hex echoed verbatim).
- Per-run unique `carolLabel = \`carol-${randomUUID()}\`` inject value applied to BOTH the Sheets 2.1 chained test (Commit 4 of this slice — collateral fix) and the Sheets 2.2 chained test (this slice's Commit 4) so cross-run dedup never blocks the chain. **3/3 tests pass in ~40s under `--workers=1`. Verified twice consecutively for cross-run stability.**

### Docs

- [`docs/slices/google-sheets-2-2-batch-formatting-plan.md`](google-sheets-2-2-batch-formatting-plan.md) (Commit 1 — plan)
- This file (Commit 5)
- CLAUDE.md updates (Commit 5)

---

## 5. Commit breakdown (5)

| # | Commit hash | What landed |
|---|---|---|
| 1 | `7325749f0` | `docs(google-sheets): plan 2.2 batch and formatting` |
| 2 | `3c2d61101` | `feat(google-sheets): add batch update action` (`batch_update` + new `valuesBatchUpdate` wrapper) |
| 3 | `1179a6dac` | `feat(google-sheets): add format range action` (`format_range` + new `a1ToGridRange` pure helper) |
| 4a | `7e0588cc2` | `fix(e2e): randomize Sheets 2.1 trigger-row inject value` (cross-run dedup-collision fix; established the pattern this slice applied preemptively to 2.2's chained test) |
| 4b | `466708ef7` | `test(google-sheets): extend walkthrough with 2.2 actions` (mock additions + new e2e chain with per-run randomized carol value) |
| 5 | (this commit) | `docs(google-sheets): document 2.2 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test` (Google Sheets focused subset green throughout; unrelated parallel-chat dirty files noted in each commit's report)
- (Commit 4b also) `CI=1 npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts --workers=1` — twice for cross-run stability

Final unit-test totals after Commit 4b: **643 suites / 6081 tests
passing.** Google Sheets focused subset: **25 suites / 333 tests
passing.** Google Sheets e2e: **3 tests / 3 passing.**

---

## 6. Acceptance criteria (post-merge)

- [x] 2 new actions registered in `services/execution/handlers/_registry.ts` (`google-sheets:batch_update`, `google-sheets:format_range`).
- [x] 1 new wrapper module (`valuesBatchUpdate.ts`); 2 existing wrappers reused unchanged (`spreadsheetsBatchUpdate`, `spreadsheetsGet`).
- [x] 1 new pure helper (`a1ToGridRange.ts`) with explicit `InvalidA1RangeError` rejection cases — unit-tested independently of the action handler.
- [x] Every wrapper routes through `fetch` with `Authorization: Bearer ...` — no shared client object.
- [x] Every handler uses `refreshAndRetry` for principal AND auxiliary calls (`format_range`'s `spreadsheetsGet` lookup + `spreadsheetsBatchUpdate` write both wrapped).
- [x] Every schema is `.strict()` — unknown fields rejected at design time. V1 field names (`inputMode`, `cell1`, `value1`, `rangeSelection`, `fontSize`, `verticalAlignment`, `wrapStrategy`, `strikethrough`, `underline`, `borders`, raw `requests`, `cellFormat`, `userEnteredFormat`) explicitly tested as rejected.
- [x] `batch_update` typed-only — no raw `requests[]` passthrough, no JSON-string `updates`, no `cellN`/`valueN` UI chrome.
- [x] `batch_update` `valueInputOption` REQUIRED at schema time (Q11 rule).
- [x] `batch_update` each update's `range` MUST include sheet prefix (regex at parse time).
- [x] `batch_update` capped at `BATCH_UPDATE_MAX_RANGES = 100` entries.
- [x] `batch_update` output is bounded — 4 numeric counters per response, NOT raw Google spread.
- [x] `format_range` ships exactly 6 typed options (backgroundColor, textColor, bold, italic, horizontalAlignment, numberFormat). Other format options (borders, conditional formatting, data validation, fontSize, verticalAlignment, wrapStrategy, strikethrough, underline) deferred.
- [x] `format_range` provider-local typed implementation — NO P-GS2 platform DSL.
- [x] `format_range` uses bare A1 `range` field — `sheetName` is a separate required field; sheet-prefixed A1 rejected.
- [x] `format_range` `a1ToGridRange` helper extracted + unit-tested with explicit rejection cases (`A:A`, `1:1`, `Sheet1!A1`, lowercase letters, inverted ranges).
- [x] `format_range` hex colors regex-validated at schema time (`^#?[0-9A-Fa-f]{6}$`); garbage input fails at parse time.
- [x] `format_range` booleans + alignment + number format type are typed (z.boolean / z.enum) — silent passthrough rejected.
- [x] `format_range` `.refine` rejects no-options config at design time with a clear option-list message.
- [x] `format_range` dynamic per-leaf `fields` mask — only paths corresponding to set options appear; Sheets preserves unspecified properties.
- [x] `format_range` output is bounded — no raw Google `CellFormat` spread; hex echoed verbatim; only supplied options appear in `appliedFormat`.
- [x] Chained e2e tests use per-run randomized trigger-row inject values to avoid `webhook_event_dedup` cross-run collisions.

---

## 7. What's deferred

### Deferred to Google Sheets 2.3 (trigger expansion — CONDITIONAL on P-GS1)

| Item | Gating |
|---|---|
| `row_changed` `changeKind: "updated"` + `"removed"` | Gated by **P-GS1** product decision on per-row diff detection. Audit recommends bounded-window snapshot (option (b), default 1,000 rows, max 10,000) — but this requires Marcus's product call before engineering starts. |
| `new_worksheet` trigger | PORT-WHEN-NEEDED. Same Drive `files.watch` transport (the watch fires on tab additions too because they bump `modifiedTime`). Lower frequency need than row-level triggers. |

### Permanently skipped (Sheets 2.2 specific)

| Item | Reason |
|---|---|
| V1 `batchUpdate.ts` `inputMode: "simple" \| "json"` discriminator | Same shape as `unifiedAction.ts` router (audit GS-R1). Typed actions only — one Sheets endpoint per V2 action. |
| V1 `batchUpdate.ts` 10-pair `cellN`/`valueN` UI fields | UI chrome belongs to the builder, not the workflow runtime. Resolver pre-resolves to typed `updates[]`. |
| V1 `batchUpdate.ts` JSON-string mode (`JSON.parse(updates)` when string-typed) | Type-coerced escape hatch. Resolver pre-resolves to typed values; schemas accept only structured arrays. |
| V1 `batchUpdate.ts` hardcoded `valueInputOption = "USER_ENTERED"` | Q11 rule — workflow author MUST choose. |
| V1 `batchUpdate.ts` post-hoc `range.includes('!')` check | Replaced with regex at parse time — fails earlier with a clearer error. |
| Raw `requests[]` arrays at the action layer (escape hatch for the wider `spreadsheets.batchUpdate` umbrella) | Same skip as Notion's `make_api_call`. Wrapper `spreadsheetsBatchUpdate` stays intentionally untyped on `requests[]`; handlers build typed requests inline. |
| V1 `formatRange.ts` `rangeSelection: 'custom' \| 'entire_sheet' \| 'header_row' \| 'first_data_row' \| 'last_row'` UI chrome | Builder concern. V2 ships bare A1 `range` only; `sheetName` separate. |
| V1 `formatRange.ts` `last_row` extra `values.get` call to discover row count | Extra API call inside a format-only action. Workflows compute their range explicitly. |
| V1 `formatRange.ts` `parseInt(hex, 16)` no-validation hex parsing | Replaced with regex-at-schema-time. Garbage input (`"hello"`, `"red"`, `"#GGGGGG"`, `"123"`) fails at parse time. |
| V1 `formatRange.ts` `bold === true \|\| bold === 'true'` stringly-typed boolean coercion | Resolver pre-resolves to real booleans; schema uses `z.boolean()`. |
| V1 `formatRange.ts` silent passthrough of arbitrary alignment / wrap strategy / number format strings | Replaced with `z.enum(...)`. Typos fail at parse time. |
| V1 `formatRange.ts` `fontSize` (under `textFormat.fontSize`) | Deferred to on-demand follow-up. Low-leverage in real workflows. |
| V1 `formatRange.ts` `verticalAlignment` (`TOP` / `MIDDLE` / `BOTTOM`) | Deferred to on-demand follow-up. |
| V1 `formatRange.ts` `textWrapping` / `wrapStrategy` (`OVERFLOW_CELL` / `WRAP` / `CLIP`) | Deferred to on-demand follow-up. |
| V1 `formatRange.ts` `strikethrough` (under `textFormat.strikethrough`) | Deferred to on-demand follow-up. |
| V1 `formatRange.ts` `underline` (under `textFormat.underline`) | Deferred to on-demand follow-up. |
| V1 `formatRange.ts` no-options `success: false` runtime branch | Replaced with `.refine` at schema time. Fails in the builder, not after the trigger fires. |
| V1 `formatRange.ts` auxiliary `spreadsheets.get` un-wrapped in retry | V2 wraps BOTH `spreadsheetsGet` + `spreadsheetsBatchUpdate` in `refreshAndRetry`. |
| V1 `formatRange.ts` `appliedFormatting: cellFormat` raw output spread (leaks Google RGB triples + `fields` mask) | V2 ships bounded `appliedFormat` projection with hex echoed verbatim and only supplied options present. |
| Sheets `Borders` API (4-side × `{style, width, color}`) | Plan §10 Decision 3. Deferred to on-demand follow-up; non-trivial sub-schema. |
| Sheets `ConditionalFormatRule` API (rule-builder shapes) | Plan §10 Decision 3. Deferred. |
| Sheets `DataValidation` API (condition-builder shapes) | Plan §10 Decision 3. Deferred. |
| P-GS2 platform-level "formatting DSL" slice | Collapsed into provider-local `format_range`. No second consumer (Excel's format surface is unrelated Graph-side table-formatting). |
| `format_range` Q4 session-side-effect idempotency | Not threaded — Sheets 2.2 follows Sheets 2.1's pattern (Q4 wiring is deferred at the V2 engine level pending a broader slice). |
| `batch_update` Q4 session-side-effect idempotency | Same — not threaded in 2.2. |

### Carried forward from prior slices (untouched in 2.2)

| Item | Why |
|---|---|
| Sheets 2.1 actions (`get_cell_value`, `update_cell`, `delete_row`, `find_row`, `create_spreadsheet`) | Already shipped at the durable-rule baseline; this slice did not regress them. |
| V1 rot entries GS-R1 through GS-R10 | Already addressed in Sheets 2.1 outcomes. |
| Slice 5 baseline (5 actions + `row_changed` trigger via Drive `files.watch` transport) | Already shipped; this slice did not touch trigger or OAuth surfaces. |

---

## 8. CLAUDE.md updates landed

The existing "Phase 2 progress (Google Sheets)" bullet is extended
with a Google Sheets 2.2 entry (Sheets 2.2's typed `batch_update` +
`format_range`, two new modules, action total now 12). The
existing "Google Sheets Phase 2 patterns" Deep Gotchas section
gains a new short subsection documenting:

- `batch_update` is typed-only; no raw `requests[]` escape hatch.
- `valueInputOption` is always explicit on every Sheets write (continues Sheets 2.1's Q11 rule).
- `format_range` is provider-local typed CellFormat subset, not a shared platform DSL — P-GS2 collapsed.
- `a1ToGridRange` expects bare A1 ranges; `sheetName` is separate; full-column / full-row / lowercase / sheet-prefixed all rejected.
- Sheets chained e2e trigger rows must use per-run randomized values to avoid `webhook_event_dedup` cross-run collisions.

---

## 9. What's next (Google Sheets roadmap)

Per parity-google-sheets §11 / §13 (still current after Sheets 2.2):

- **Google Sheets 2.3** — trigger expansion (~5–6 commits, CONDITIONAL on **P-GS1** product decision for per-row diff snapshot storage design). Extends `row_changed` to emit `changeKind: "updated"` + `"removed"`. Optionally adds `new_worksheet` trigger. **Do NOT start before Marcus accepts P-GS1.**
- **Sheets 2.2 expansion** (on-demand) — additional `format_range` options (borders, conditional formatting, data validation, fontSize, verticalAlignment, wrapStrategy, strikethrough, underline) land as non-breaking optional fields on the same schema when a workflow asks. No separate slice required; same handler, same wrapper.

Tracking lives in [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md)
§§11–13. None of the deferred items are committed for follow-up
timing in this slice.

**Google Sheets 2.2 is complete pending Marcus's acceptance of this
outcomes commit.**
