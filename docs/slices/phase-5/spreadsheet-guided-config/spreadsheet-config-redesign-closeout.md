# Spreadsheet Config Redesign, Slice 1 (SPREADSHEET-CONFIG-REDESIGN-1)

Closeout for the Excel-style spreadsheet config redesign inside the V2
node config panel, plus the shared node-config readiness banner Marcus
scoped mid-slice as a global (all providers/actions/triggers) feature.

- Code commit: `2aee428af` (local, v2-main, NOT pushed)
- Docs commit: this file, committed separately after the code commit
- Builds on CONFIG-UX-AUDIT-1 (`0cb7c101c`) and CONFIG-UX-AUDIT-2
  (`60529e050`); neither commit was rewritten

## Design source

The visual/product spec was the claude.ai/design project
`3c6250cb-eea4-43e4-b28e-76fd497ba49b` (file `Excel Config Redesign.html`)
via the claude_design MCP. **The import was blocked:** DesignSync
requires a claude.ai design authorization that was not present in this
session (`/design-login` is user-run; both `list_files` and
`get_project` returned the auth 400 on retry). The slice was implemented
from the detailed textual spec in the task brief instead: setup status
banner ("One thing left to fill in" / "Ready to run"), step sections,
destination picker, one-row vs several-rows toggle, column-based inputs
from real sheet columns, per-cell variable picker, row preview, save
only when ready. If a later session runs `/design-login`, a follow-up
can diff the shipped UI against the actual HTML.

Adaptations to the current builder shell (per the brief): the design's
modal/card layout was implemented inside the existing right-side config
panel (`ConfigModalShell`); the workbook/worksheet comboboxes remain the
destination picker (no separate SpreadsheetDestinationPicker component;
the panel is a narrow rail and the two comboboxes already are that
picker); explicit numbered section headers were not added because
`SchemaForm` has no field-grouping concept. The banner checklist plus
the editor's own "What are you adding?" heading carry the step
structure instead.

## What shipped

### 1. Column-aware spreadsheet row editor (Excel Add Row)

New `spreadsheet-rows` field type (contract + renderer). One composite
editor owns BOTH halves of add_row's either-or save contract:

- "One row" mode renders one input per detected column (real header
  name + column letter hint) and commits the field's own `values` key
  as a positional array. Blanks between filled cells are preserved as
  empty strings so later columns stay aligned; trailing blanks are
  trimmed (the handler pads the tail).
- "Several rows" mode renders row cards (one input per column per row,
  Add row / Remove row, capped at the schema's 1000) and commits the
  sibling `rows` key as header-keyed records via the new
  `onChangeField` renderer prop. Blank cells are omitted per record;
  all-blank rows are skipped so the runtime schema's non-empty-record
  refine can never be violated from the UI.
- Switching modes clears the other key, so exactly one shape is ever
  present (matches the schema's XOR refine).
- Every cell input has the standard variable picker; tokens insert at
  the cursor and persist verbatim into the saved config.
- A preview block shows how the row will look (column name to value
  list); batch mode shows the row count plus up to 3 sample rows.
  `{{...}}` tokens render verbatim, never fake-resolved.
- Changing workbook/worksheet clears the row data (new `dependsOn` on
  both row fields) and remounts the editor, because different sheets
  have different columns.

### 2. Real column detection (never invented)

New options resolver `microsoft-excel:worksheet_columns`
(`integrations/microsoft-excel/options/worksheetColumns.ts`, registered
in `services/options/_registry.ts`): reads the worksheet's REAL
first-row headers through the same `worksheetUsedRange(valuesOnly=true)`
read the add_row batch handler validates batch keys against, through the
existing credential path (`refreshAndRetry`, integration row from the
options route). Item value/label = header text; description = absolute
column letter (honors used ranges that do not start at column A). Blank
headers skipped; duplicate headers keep the first occurrence. Empty
sheet or all-blank row 1 returns empty items.

Honest fallback when no columns are detected: the editor says "We
couldn't detect any column names in this sheet..." and offers manual
entry (positional cells with ordinal labels for one row; the
CONFIG-UX-AUDIT-1 column-name/value row builder, reused as
`KeyValueListField`, for several rows). No hardcoded Date/Customer/
Amount/Status style fake columns anywhere; a test pins that.

Known limitation (documented in the resolver): one-row positional
alignment assumes contiguous headers; the handler itself anchors
positional writes at column A, so this inherits the existing runtime
posture rather than adding a new one.

### 3. Shared readiness banner (ALL node config menus)

Per Marcus's mid-slice clarification, the banner is a config-shell
feature, not an Excel component:

- `NodeConfigReadinessBanner` renders at the top of the Setup tab for
  every node with metadata (all providers, actions, and triggers).
- Pure helper `computeConfigReadiness` derives status from the
  metadata's `required` flags (via the shared `isRequiredValueMissing`
  ruleset; required fields with a metadata `defaultValue` never count),
  the draft's inline field errors, and the shell's existing structural
  Save blockers (advanced JSON / router validators) passed in as a
  count. No validation rules are duplicated in the UI.
- States: missing count ("2 things left to fill in" / "One thing left
  to fill in" + checklist), invalid ("Fix one field before saving",
  wins over missing), ready ("Ready to run" for actions, "Ready to
  activate" for triggers).
- Per-action checklist adapters (`readiness/adapters.ts`) allow richer
  copy; Excel add_row ships the first: "Pick a workbook and worksheet"
  plus "Fill in at least one row value" (spanning the values XOR rows
  either-or that `required` flags cannot express).
- Dirty/unsaved state stays with the existing footer; the banner is
  about config completeness only.

Deferred from Marcus's generic rules: a "connect this app" checklist
item for missing integrations. The config shell has no client-side
integration-status signal today (per-field pickers surface disconnected
states individually); adding one is a small follow-up (thread an
integration-status lookup into the shell and append an adapter-level
item). The helper's input shape accommodates it without breaking
callers.

### 4. Contract + form plumbing (reusable boundaries)

- `contracts/actionMeta.ts`: new `spreadsheet-rows` FieldType;
  `optionsSource` now valid on it (columns resolver); new optional
  `batchRowsField` (spreadsheet-rows only, must name a known sibling)
  and `renderedBy` (any field; must name a known sibling that is not
  itself rendered-by). Field-level and meta-level superRefine
  validation added.
- `SchemaForm`: fields whose `renderedBy` names a known sibling are not
  rendered standalone (unknown target falls back to standalone render
  so a mis-authored meta stays visible); they remain full citizens for
  dependsOn clearing. All renderers now receive optional `formValues` +
  `onChangeField` (cascade-preserving sibling writes); single-field
  renderers ignore both.

### 5. Copy cleanup

Excel Add Row meta copy is now product language: action description
"Add one or more rows to the bottom of an Excel worksheet, filling in
each column by name."; no more "single positional row", "header-keyed
row objects", "aligned to the worksheet's column order" in any
builder-visible surface. Editor copy: "What are you adding?", "One
row" / "Several rows", "Columns come from the first row of your
selected worksheet. Leave a field blank to keep that cell empty.", and
a variables hint. The existing copy-guard structure test passes over
the new surfaces.

## Save-shape mapping (unchanged runtime contracts)

| Mode | Config key | Shape | Notes |
|---|---|---|---|
| One row | `values` | `string[]` positional | In-between blanks kept as `""`; trailing blanks trimmed; all blank commits `undefined` |
| Several rows | `rows` | `Array<Record<header, string>>` | Blank cells omitted; empty rows skipped; `undefined` when none |

Exactly one key is present at save; both proven against the untouched
`AddRowConfigSchema` in unit + integration tests. No handler or schema
changes; no validation weakened. Outputs, riskLevel, and idempotency
behavior untouched.

## Files changed (commit 2aee428af, 25 files)

Contract + form:
- `contracts/actionMeta.ts`
- `features/workflow-builder/config-modal/SchemaForm.tsx`
- `features/workflow-builder/config-modal/fields/types.ts`
- `features/workflow-builder/config-modal/fields/_registry.ts`
- `features/workflow-builder/config-modal/ConfigModalShell.tsx`

Readiness (new):
- `features/workflow-builder/config-modal/NodeConfigReadinessBanner.tsx`
- `features/workflow-builder/config-modal/readiness/computeConfigReadiness.ts`
- `features/workflow-builder/config-modal/readiness/adapters.ts`

Spreadsheet editor (new):
- `features/workflow-builder/config-modal/fields/spreadsheet/SpreadsheetRowsField.tsx`
- `.../SpreadsheetSingleRowEditor.tsx`, `.../SpreadsheetBatchRowsEditor.tsx`
- `.../SpreadsheetCellInput.tsx`, `.../SpreadsheetRowModeToggle.tsx`
- `.../SpreadsheetPreview.tsx`, `.../_serialize.ts`

Provider:
- `integrations/microsoft-excel/actions/addRow.meta.ts`
- `integrations/microsoft-excel/options/worksheetColumns.ts` (new)
- `services/options/_registry.ts`

Tests (5 new files, 2 updated):
- `tests/unit/features/workflow-builder/config-modal/readiness/computeConfigReadiness.test.ts` (12)
- `tests/unit/features/workflow-builder/config-modal/fields/spreadsheet/SpreadsheetRowsField.test.tsx` (10)
- `tests/unit/features/workflow-builder/config-modal/fields/spreadsheet/_serialize.test.ts` (12)
- `tests/unit/features/workflow-builder/config-modal/NodeConfigReadinessBanner.test.tsx` (4)
- `tests/unit/integrations/microsoft-excel/options/worksheetColumns.test.ts` (13)
- `tests/integration/features/workflow-builder/microsoft-excel-add-row-config.test.tsx` (rewritten for the new UI: banner walk 2-left / 1-left / Ready to run, resolver-driven column inputs, both save shapes through Modal Save + Toolbar Save)
- `tests/unit/features/workflow-builder/config-modal/fields/_registry.test.ts` (21 -> 22 FieldType variants)

## Providers/actions updated

- Microsoft Excel Add Row (`microsoft-excel:add_row`): full redesign.
- Everything else: gains the generic readiness banner automatically
  (proven on `native:http_request` in the shell test); config editors
  unchanged.

## Secondary targets: audited, deferred (component boundaries ready)

- **Excel Add Table Row**: positional `values` only (no batch). The
  editor already supports a batch-less consumer (mode toggle hides when
  `batchRowsField` is absent). Needs a `microsoft-excel:table_columns`
  resolver; the Graph helper (`tableColumnsList.ts`) already exists, so
  this is a small follow-up (resolver + meta wiring + tests).
- **Excel Update Row**: `values` is a `Record<header, value>` (keyvalue
  record shape), plus `rowNumber`. Needs a record-commit mode on the
  editor (or a sibling `spreadsheet-record` type). Deferred to keep the
  save-shape surface of this slice to add_row only.
- **Google Sheets Append/Update Row**: the `range` field is free-text
  A1 notation (may or may not embed a sheet name), so there is no
  reliable dependsOn parent for a columns resolver today. The right fix
  is a product decision (sheet picker + derived range) before a columns
  editor makes sense. Deferred with that dependency noted.

## Verification (commands actually run, all in ChainReactV2)

- `npm run typecheck`: PASSED clean at slice completion. A later re-run
  surfaced `services/oauth/dispatcher.ts: Cannot find module
  '@/integrations/quickbooks/oauth'`, which is the parallel session's
  in-flight QuickBooks work (file not part of this slice; untouched).
- `npm run lint`: 0 errors, 13 max-lines warnings, none in new files.
  One warning (`contracts/actionMeta.ts`) is inherited: HEAD was
  already over the 400-line threshold (405) before this slice; the
  slice deepened it (457). Splitting the contract file is a candidate
  follow-up, not done here.
- `npm run lint:structure`: PASSED (every leaf folder <= 50 files).
- Focused jest: 5 new suites 51/51; shell + SchemaForm + integration +
  copy-guard + option-source-integrity 100/100; CONFIG-UX-AUDIT
  regression sweep (JsonField, KeyValueListField, ObjectListField,
  MultiOptionsField, google-sheets-append-row, hubspot webhook trigger,
  excel + registry discovery guards) 772/772.

## Inherited failures / parallel-session state

- The QuickBooks typecheck error above is the only red state observed,
  introduced by the parallel session mid-slice and reproduced outside
  this slice's file set. Nothing else failing was observed in the
  suites run.
- Pre-existing repo-wide baseline issues noted in project memory (e.g.
  no-literal-slack-token-fixtures) were not re-measured in this slice.

## Push status

Nothing pushed. Local commits only (`2aee428af` + this docs commit).
Commits `0cb7c101c` and `60529e050` untouched.
