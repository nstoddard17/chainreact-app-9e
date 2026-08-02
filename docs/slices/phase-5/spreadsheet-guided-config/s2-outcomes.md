# EXCEL-GUIDED-CONFIG-2 — Outcomes

Implementation outcome for slice S2 of [the approved plan](./plan.md):
adopting the guided spreadsheet experience shipped by
[S1](./s1-outcomes.md) for Microsoft Excel.

Scope: `microsoft-excel:add_row` and `microsoft-excel:add_table_row`.
Excel `update_row` remains S3 and was not started.

---

## What changed for Excel users

**Add Row** already had workbook/worksheet pickers and a column-aware
editor. It now presents them as the same three guided questions Sheets
uses, so the two providers no longer feel like different products.

**Add Table Row** changed materially. It used to ask for a bare list of
cell values "in the table's column order" — the user had to know that
order from memory, with nothing on screen to check it against. It now
reads the Excel table's **own columns** and labels one input per column.
An Excel table publishes its column schema, which is a stronger source of
truth than the first-row heuristic a plain worksheet needs.

The resolver that makes this possible (`microsoft-excel:table_columns`)
already existed — built for `find_row.lookupColumn` — and had simply
never been wired to this field.

---

## What was reused, not rebuilt

Everything structural came from S1 unchanged: the guided accordion and
step model, the destination step, the column-mapping editor, the
conservative suggestion matcher, the honest preview, the variable picker,
the readiness banner, resolver-failure recovery, and the accessibility
and one-DOM responsive behavior.

Excel's differences are expressed as **adapter data only** — which fields
answer which question, plus step copy. No provider-id branch was added to
any shared component; the structure guard that forbids one still passes.
No new field type, no second resolver, no framework redesign.

---

## Add Row

| Step | Behavior |
|---|---|
| 1 · Pick the worksheet | Workbook and worksheet pickers, dependent-clearing intact |
| 2 · Map columns | Existing editor: **single-row and batch modes both preserved**, real worksheet columns, variable picker, suggestions, honest preview |
| 3 · Confirm | Factual statement, no controls |

Nothing about the save shape, schema, handler, or Graph request changed.
Batch mode was not removed and no one is forced into single-row mode.

---

## Add Table Row

| Step | Behavior |
|---|---|
| 1 · Pick the table | Workbook picker, then table picker (`dependsOn workbookId`) |
| 2 · Map columns | One input per **real table column**, from `microsoft-excel:table_columns` with both dependencies |
| 3 · Confirm | Factual statement, no controls |

The action has no batch branch, so the editor's mode toggle stays hidden
(it hides automatically without `batchRowsField` — no Excel-specific code).

---

## Compatibility — the load-bearing decision

`AddTableRowConfigSchema` accepts **two** `values` shapes, and
`addTableRow.ts` treats them **differently**:

- a **positional array** is sent to Graph **verbatim**, assumed aligned;
- a **column-keyed record** is aligned **by name** against
  `/tables/{name}/columns`, sorted by Graph `index`, with `null` for
  columns it does not mention.

Critically, the `table_columns` **resolver does not apply that sort**. So
converting a saved record into positional cells using resolver order
could place a value in the wrong column — silently, on every run.

**Therefore the editor never converts between representations.** It
round-trips whichever one it was given:

| Saved shape | Hydration | Commit |
|---|---|---|
| positional array | by position | positional array |
| column-keyed record | by column **name** | column-keyed record |
| nothing yet (new node) | — | positional array (this action's long-standing default) |

Consequences, all covered by tests:

- Opening a legacy node of **either** shape leaves the stored config
  byte-identical and the draft not dirty.
- Editing a keyed row keeps it keyed, so it stays immune to column
  reordering — the safer property, preserved rather than downgraded.
- A new configuration still looks exactly like today's.
- If the saved value is a **record and the columns cannot load**, the
  editor refuses to render blank inputs over real data. Blank inputs
  there would be a trap: the next keystroke would commit over values the
  user cannot see. It says so and edits nothing.

No runtime schema was weakened, no handler changed, and no shape was
migrated.

---

## Why step 3 has no choices

Google Sheets exposes `valueInputOption` (RAW vs USER_ENTERED) and
`insertDataOption` (INSERT_ROWS vs OVERWRITE). **Excel has no analogue
for these actions** — `addRow.ts` issues a range `PATCH` and
`addTableRow.ts` POSTs one row; neither has a parse mode or an insert
mode. Rendering radios would offer a decision that changes nothing and
imply a capability Excel does not have.

So step 3 states what the handler actually does, verified against the
code:

- Add Row — "ChainReact adds the values below the worksheet's last used
  row. A single row follows the worksheet's column order, and several
  rows are matched to the column names shown above."
- Add Table Row — "ChainReact adds the values as a new row in the
  selected Excel table, following that table's column order."

The step stays keyboard-reachable, carries a collapsed summary, creates
no readiness requirement, and saves no value.

---

## Readiness and failure recovery

A checklist adapter was added for `add_table_row` ("Pick a workbook and
table" / "Fill in at least one column"). It accepts **either** valid row
representation as filled in, and a column left deliberately blank does
**not** block — only "nothing at all" does, which is the one case the
runtime schema rejects. `add_row`'s existing adapter was left alone and
is regression-tested.

Failure states are the shared ones, verified for Excel: a revoked
connection reads as reconnect-required, a provider error reads as an
error with retry, and **neither is ever shown as a table that genuinely
has no columns**. A resolver failure does not erase saved or pending
mappings. Changing the workbook clears only the now-stale table.

---

## Shared changes made (and why they are generic)

Two additions to shared code, neither Excel-specific:

1. `_serialize.ts` gained `isRecordRowValue`, `recordValuesToCells` and
   `cellsToRecordValues` — the lossless record round-trip. Any provider
   whose action accepts a column-keyed row benefits.
2. `SpreadsheetRowsField` now round-trips whichever representation the
   value holds, and guards the "record without columns" case.

Google Sheets is unaffected: its `values` is always an array, so it takes
the positional path exactly as before. Its full regression set is green.

---

## Tests actually run

| Command | Result |
|---|---|
| Focused: config-modal, guided, Excel add_row + add_table_row integration, Sheets guided + append-row + cascade, structure guard, Excel & Sheets provider units, discovery + options registries | **152 suites / 2710 tests passed**, 1 failed |
| `npx tsc --noEmit` | **clean (exit 0)** |
| `npm run lint` | **0 errors**, no warning in any file this slice touched |
| `npm run lint:structure` | **OK — every leaf folder ≤ 50 files** |
| `npm run lint:migrations` | **OK** |

The single failure is `SchemaFieldsField.test.tsx`, which **passes 13/13
in isolation** and is untouched by this slice — a parallel-load timeout
flake, the same one observed during S1.

`npm test` (full suite) was **not** run; repository rules make it
opt-in and it was not requested. No responsive geometric sweep was run —
see below.

---

## Honest limitation: no builder-panel geometric fixture

The guided panel still has **no `*Screens.harness.test.tsx` emitter**, so
`npm run verify:responsive` does not measure it. That was true after S1
and is still true. This slice therefore makes **no geometric
certification claim** for Excel.

What is guarded instead is the property geometry cannot see: the panel
renders **one element tree at every width** with no breakpoint-scoped
visibility, enforced by
`tests/structure/guided-spreadsheet-config-source.test.ts` (proven
non-vacuous during S1 by hiding a step and watching the guard fail). Excel
inherits that guarantee because it renders through the same components.

---

## Rollback

Delete the two Excel entries from `guidedSpreadsheetAdapters.ts`. Both
actions revert to the generic form with **no data change**, because
nothing about a guided-authored configuration is guided-specific.

The `add_table_row` metadata change (column-aware editor + resolver) is
independently revertable by restoring `values` to `string-array`; saved
configurations of either shape remain valid either way.

---

## Remaining S3 — Excel Update Row

Not started. `microsoft-excel:update_row` takes `values` as a
`Record<string, unknown>` **only** (plus an explicit `rowNumber`), and its
metadata still uses a `keyvalue` editor with hand-typed column names and
no resolver.

S3 needs:

1. `values` wired to `microsoft-excel:worksheet_columns` with
   `dependsOn: ["workbookId", "worksheetName"]`.
2. A **record-only** mode for the composite editor. The record round-trip
   built in this slice is the foundation, but `update_row` has no
   positional branch at all, so the editor must commit a record
   unconditionally rather than mirroring the saved shape.
3. A guided adapter whose destination includes `rowNumber` — the first
   destination field that is not a provider-resource picker, which the
   step model has not yet had to present.
4. A readiness adapter, and a decision on whether the guided flow should
   surface the handler's merge-then-PATCH-full-row behavior (it reads the
   existing row and overlays, so partial writes cannot blank cells —
   worth stating in step 3).

Google Sheets `update_row` remains deferred for the reason recorded in
S1: its `range` is free-text and it has no tab field to hang a resolver
on, exactly the problem `append_row` solved here.
