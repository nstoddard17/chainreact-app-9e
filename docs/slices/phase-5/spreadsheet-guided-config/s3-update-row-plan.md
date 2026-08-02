# EXCEL-UPDATE-ROW-GUIDED-AUDIT-3 — Audit & Plan

**Status:** Plan only. No product code, tests, or migrations changed.
Awaiting Marcus's approval.

**Predecessors:** [plan.md](./plan.md) · [S1 outcomes](./s1-outcomes.md) ·
[S2 outcomes](./s2-outcomes.md) ·
[predecessor closeout](./spreadsheet-config-redesign-closeout.md)

**Target:** `microsoft-excel:update_row`

Everything below was verified against the live source at `fc0b02ec8`, not
from prior reports. Where the current code contradicts its own comments
or a previous summary, this document says so.

---

## 1. Plain-language product problem

Update Row asks a business user for four things: a workbook, a worksheet,
a **row number**, and a set of column-name → new-value pairs typed by
hand. The column names must match the worksheet's header row *exactly,
including capitalisation*, and there is no picker — a typo is only
discovered when the workflow fails at run time.

It also differs from everything the guided system has handled so far.
Add Row and Add Table Row **create** a row: every column starts empty and
"leave it blank" simply means "write nothing". Update Row **edits** an
existing row, so a blank cell is genuinely ambiguous — did the user mean
*leave this column alone* or *erase what is in it*? Those two intentions
write different things to the customer's spreadsheet, and the current UI
cannot express the difference.

---

## 2. Current schema — `updateRow.schema.ts` (verified)

`.strict()`, four fields, no optional fields, no defaults:

| Field | Type | Required | Notes |
|---|---|---|---|
| `workbookId` | `z.string().min(1)` | yes | DriveItem id |
| `worksheetName` | `z.string().min(1)` | yes | worksheet name |
| `rowNumber` | `z.number().int().min(1)` | yes | **1-based Excel row number** |
| `values` | `z.record(z.string().min(1), z.unknown())` + `.refine(keys.length > 0)` | yes | column-header → cell-value |

Answers to the audit's schema questions:

- **Exact `values` shape:** a record only. There is no positional branch —
  unlike `add_table_row`, which accepts both. This is the first guided
  action whose row value is record-*only*.
- **Empty records:** rejected by the `.refine` — "update zero columns" is
  deliberately not a valid configuration.
- **Unknown column names:** accepted by the schema (`z.unknown()` values,
  any non-empty string key) and **rejected at run time** by the handler,
  loudly. So a typo is a runtime failure, never a config-parse failure.
- **Variable references:** the engine resolves config *before* the handler
  parses it, so by parse time `values` holds resolved values. A variable
  may therefore appear in a **value**. A variable in a **key** would have
  to resolve to a non-empty string; nothing forbids it, but no UI offers
  it and it is not recommended.
- **`rowNumber` and variables:** the resolver preserves the underlying
  type for a single-reference template, so `{{find_row.rowNumber}}`
  resolving to a **number** parses. If an upstream output is a **string**
  (`"5"`), `z.number()` rejects it and the run fails with a config error.
  This is a real sharp edge (see §10).
- **Strictness:** V1 fields (`matchColumn`, `matchValue`, `updateMultiple`,
  `updateMapping`, `column_*`) are rejected at parse time.

---

## 3. Current metadata and UI — `updateRow.meta.ts` (verified)

| # | Field | Type | Resolver | dependsOn |
|---|---|---|---|---|
| 1 | `workbookId` | `combobox` | `microsoft-excel:workbooks` | — |
| 2 | `worksheetName` | `combobox` | `microsoft-excel:worksheets` | `workbookId` |
| 3 | `rowNumber` | `number` (`numeric: {min:1, integer:true}`) | — | — |
| 4 | `values` | `keyvalue` (`keyValueShape: "record"`) | **none** | **none** |

No `advanced` fields. No `visibleWhen`. No readiness adapter — it falls
back to the generic per-required-field checklist. The meta's own header
comment records the deferral: *"column headers are typed (the `columns`
resolver is deferred)"*.

**Architecture-forcing constraint.** `contracts/actionMeta.ts` permits
`optionsSource` on **`select` · `combobox` · `string-array` ·
`spreadsheet-rows` only**. A `keyvalue` field therefore *cannot* carry the
columns resolver. Giving Update Row a column picker requires either
moving `values` to `spreadsheet-rows` or widening that contract. Moving
the field is the smaller, already-proven change.

---

## 4. Current handler behavior — `updateRow.ts` (verified line by line)

1. **One** `worksheetUsedRange({valuesOnly:true})` read supplies both the
   header row and the target row's existing values.
2. Throws when there is **no** used range at all.
3. Builds `headerIndex` from row 1: `typeof h === "string" && h.length > 0`
   → `headerIndex.set(h, i)`.
4. **Fails loudly** on any `values` key absent from `headerIndex`, listing
   every unknown column and every available column.
5. `existingRow = rows[rowNumber - 1] ?? []` — confirming `rowNumber` is
   the **Excel row number**, where **row 1 is the header row**.
6. Merge: `merged[i]` starts as `existingRow[i] ?? null` for
   `i < headerRow.length`, then each configured column is overlaid at its
   resolved index.
7. **PATCHes the full row**, `A{row}:{lastHeaderCol}{row}`, in one call.

### Answers to the handler questions

- **Omitted keys preserve existing values.** Yes — untouched indices keep
  `existingRow[i]`.
- **Blank configured values clear cells.** Yes. `merged[idx] = value`
  unconditionally. `""` writes an empty string; `null` writes null.
  The existing test named *"preserves the existing value when overlay is
  null"* actually asserts `[["alice", null]]` — the Notes cell **is
  cleared**; what is preserved is the *other* column. **The test name is
  misleading and should be corrected** in the implementation slice.
- **Full row or selected cells?** Always the full row, deliberately, so a
  partial-range PATCH can never blank neighbouring cells.
- **Row does not exist:** the doc comment claims the handler throws for a
  row beyond the used range. **It does not.** `existingRow` becomes `[]`,
  every unconfigured column becomes `null`, and the PATCH writes that row.
  A test pins this ("writes the supplied columns at the target row,
  padding others with null"). The comment overstates; the code is the
  truth.
- **No headers:** throws (`has no usedRange`).
- **Provider calls / errors:** `worksheetUsedRange` then
  `worksheetRangePatch`, both through `refreshAndRetry`; the wrappers
  raise `Unauthorized401Error` on 401 and `NotFoundError` on 404.
- **Output:** `{ workbookId, worksheetName, rowNumber, address,
  columnsUpdated, updatedColumns }` — names only, no cell values.

---

## 5. Current resolver behavior — `microsoft-excel:worksheet_columns`

`requiredDeps: ["workbookId","worksheetName"]`; reads row 1 of the used
range; `value = label = trimmed header`; `description = "Column <letter>"`
using the used range's real start column; blank/non-string headers
skipped; `hasMore: false`; `NotFoundError` → empty items (not an error);
401/action-required → `INTEGRATION_DISCONNECTED`; anything else →
`PROVIDER_ERROR`.

### Two verified divergences between resolver and handler

These matter because the guided UI would let a user *pick* a column and
then have the handler *reject* it.

| Case | Resolver | Handler | Consequence |
|---|---|---|---|
| Header with surrounding whitespace (`"Name "`) | offers **trimmed** `"Name"` | key is the **raw** `"Name "` | Picking it produces a config the handler **throws** on |
| Duplicate headers | keeps the **first** occurrence | `Map.set` → **last** occurrence wins | The picker's column letter can point at a different column than the one written |

Neither is caused by this slice, and neither is reachable today because
no picker is wired. Wiring one makes the first case **user-visible**, so
S3 must address it. Recommendation in §8.

Column **identity** is the header **name** (what the handler matches);
the column **letter** is display-only metadata.

---

## 6. Saved-config compatibility contract

Every currently valid configuration must keep parsing, running and
opening unchanged, with no migration:

- `values` is and stays a `Record<string, unknown>` — **the guided editor
  must never convert it to an array**, since the schema has no positional
  branch and `z.record` would reject one.
- Key order carries no meaning (the handler resolves each key
  independently), so re-serialising in a different order is harmless —
  but re-serialising at all on *open* is not, because it would dirty the
  draft. Opening must not write.
- `rowNumber` stays a number.
- Rollback = remove the adapter registration; the generic renderer
  returns with no data change.

---

## 7. Decision A — Step structure → **Option 1, adapted**

**Recommendation: Step 1 "Pick the row" holds workbook + worksheet +
row number.**

| Step | Title | Contents |
|---|---|---|
| 1 | **Pick the row** | workbook · worksheet · row number |
| 2 | **Choose what to update** | per-column three-state mapping |
| 3 | **Confirm how it's saved** | merge-and-write explanation |

Rationale, weighed against the alternatives:

- **Option 2** (row number in step 2) splits one idea — *which row* —
  across two steps, and makes step 2 answer two unrelated questions.
- **Option 3** (row number in step 1, but keep the title "Pick the
  sheet") is the smallest change but the title then lies: after step 1
  the user has chosen a *row*, not a *sheet*. The summary would read
  "Sales.xlsx · Sheet1 · 42" under a heading that never mentions rows.
- **Option 1** keeps "everything needed to locate the destination" in one
  step, which is exactly what steps 1 of Add Row and Add Table Row
  already mean. The shared model needs no structural change — only
  adapter copy, which is already a supported capability
  (`copy.destinationTitle`, used by both Excel adapters in S2).

**Is the row number a destination resource or an action parameter?** It
is a **destination coordinate**. Workbook + worksheet + row number
together name the cells that will be written. Grouping it with the
mapping would imply it is part of *what changes*, which it is not.

**One shared gap this exposes.** `guidedStepModel.readString()` returns
`""` for anything that is not a string, so a `number` destination field
contributes **nothing** to the collapsed step-1 summary — it would read
"Sales.xlsx · Sheet1" and silently omit the row. Fix generically: format
numbers and booleans for the summary rather than dropping them. This is a
small, provider-agnostic change to a pure module (§14).

**Future Find-and-Update.** A future `find_row`-driven update would
replace the row-number input with match criteria while keeping the same
step-1 meaning ("which row"), so this structure extends rather than
blocks it.

---

## 8. Decision B — Record-only editor mode

**Recommendation: add a typed `valueShape` capability to the field
metadata and default it to today's behavior.**

```ts
// contracts/actionMeta.ts — FieldMeta, additive and optional
valueShape?: "positional" | "record" | "preserve";
```

- `"preserve"` (**default when omitted**) — exactly what S2 shipped:
  arrays stay arrays, records stay records. Sheets `append_row`, Excel
  `add_row` and `add_table_row` keep their behavior with **zero meta
  changes**.
- `"record"` — always hydrate and commit a `Record<string, unknown>`,
  even when the value is absent. This is Update Row.
- `"positional"` — reserved; not needed by any shipped action, and I
  recommend **not** adding it until one needs it.

This keeps the decision in metadata (validated at module load, like every
other field capability) rather than in the editor, so no action key is
ever named inside `SpreadsheetRowsField`.

### Which display model? → **show every detected column**

Three models were considered:

1. **Every detected column, each with a three-state control** —
   recommended.
2. Only configured keys plus an "add a column" control.
3. Hybrid: configured keys expanded, the rest behind a disclosure.

Model 1 wins because Update Row's central question is *"which columns
change and which stay as they are?"* — and that question cannot be
answered by a list that only shows the columns already chosen. It also
matches what steps 2 of Add Row and Add Table Row already look like, so
the three guided actions stay visually consistent. Model 2 hides the
answer; model 3 adds a disclosure whose only job is hiding it.

For a **wide** worksheet the list is long, which the narrow builder panel
must handle — see §15.

### Behavior table

| Situation | Behavior |
|---|---|
| Initialization | Hydrate cells from the record by **column name** (`recordValuesToCells`, shipped in S2) |
| Serialization | Commit via `cellsToRecordValues`, extended for the three-state model (§9) |
| Omitted field | Key absent from the record — column untouched |
| Clearing a value | Explicit "Set to blank" state (§9) |
| Column reorder | Harmless — keys are names, not positions |
| Renamed column | The saved key no longer matches a detected column → surfaced as a **stale key**, never silently deleted |
| Removed column | Same as renamed |
| Columns fail to load | Reuse the S2 guard: refuse to render blank inputs over a saved record, say so, edit nothing |
| Legacy record values | Round-trip unchanged; open never writes |
| Manual key not in the resolver | Kept and shown as stale-but-preserved, with the handler's fail-loud consequence explained |
| Variable tokens | Ordinary cell content, inserted by the canonical picker |
| Dirty state | Only a user edit dirties the draft; hydration and stale-key display never do |

---

## 9. Decision C — Omitted versus blank (**the critical decision**)

The handler makes these three outcomes genuinely different, so the UI
must too:

| User intent | Saved config | Handler result |
|---|---|---|
| **Leave unchanged** | key **absent** | existing cell preserved |
| **Clear the cell** | key present, value `""` | cell written as empty string |
| **Set a value** | key present, value | cell written |

**Recommendation: one explicit three-state control per column**, not a
text box whose emptiness has to be interpreted.

Proposed interaction — a small `radiogroup` per column (three real radios,
keyboard-operable, each with an accessible name including the column):

- **Leave unchanged** — default for every column with no saved key.
- **Set to blank** — writes `""`.
- **Set to…** — reveals the ordinary cell input (with variable picker).

Serialization rules:

- *Leave unchanged* → key omitted entirely.
- *Set to blank* → `{ "Column": "" }`.
- *Set to…* with content → `{ "Column": "<content>" }`.
- *Set to…* left empty → **not** silently downgraded to blank. It is an
  incomplete choice and blocks readiness with "Choose a value for
  Column, or set it to blank." Collapsing it into `""` would erase a
  customer's cell because a user stopped half-way.
- All columns *Leave unchanged* → `values` would be `{}`, which the
  schema rejects; readiness blocks first with "Choose at least one column
  to update."

**On `null`:** the handler writes it and it clears the cell, but nothing
in the UI should produce `null` — `""` is the one clearing representation
the builder emits. `null` remains valid for API/AI-authored configs and
round-trips untouched; a saved `null` displays as *Set to blank* with a
note that it was authored elsewhere. Recommendation: **do not** offer a
separate "null" state; two clearing representations with no visible
difference would be a UI that teaches nothing.

**Stale keys** (saved column no longer in the worksheet) are shown in
their own group, preserved, with a warning that the run will fail until
the column is restored or the key removed — because that is exactly what
the handler does.

---

## 10. Decision E — Row-number safety

Verified facts: 1-based; **row 1 is the header row**; the schema's
minimum is **1**, so `rowNumber: 1` is accepted and would **overwrite the
headers**; a row beyond the used range does **not** throw but writes a
row of nulls plus the configured columns; the value is an Excel row
number, not a data-row index.

Recommendations:

- **Label:** "Which row?" · **help:** "The row number as it appears in
  Excel. Row 1 is usually your column headings, so data normally starts
  at row 2."
- **Warn, do not block, at `rowNumber === 1`:** an inline warning —
  "Row 1 is usually your heading row. Updating it will change your column
  names." A hard block would be wrong: a sheet without headings is
  legal, and the schema permits it. **No schema change is proposed.**
- **Variables are supported** and genuinely useful (`{{find_row.rowNumber}}`).
  Because a *string* row number fails schema parse at run time, the field
  should accept a variable and state the requirement: "must produce a
  whole number". Whether to add a builder-side warning when the wired
  upstream output is declared `type: "string"` is a **judgement call for
  Marcus** (§24, decision 7) — the metadata to detect it exists
  (`OutputMeta.type`).
- **No row preview.** The builder has no resolver that reads an arbitrary
  worksheet row, so the target row's current contents cannot be shown
  honestly. **Do not fabricate one.** A read-the-row resolver is possible
  later but is out of scope here.

---

## 11. Decision D — Step 3 copy and the concurrency question

**Verified:** two Graph round-trips (read used range → PATCH full row),
and `worksheetRangePatch` sends **no `If-Match`/ETag** — an unconditional
PATCH. Between the read and the write, another writer's change to any
*other* column of that row would be overwritten by the merged row built
from the stale read. **The lost-update risk is real, not theoretical.**

How large is it? The window is one HTTP round-trip, the collision needs a
concurrent writer on the *same row*, and the practical customer scenario
(a workflow updating a row a human is editing at that moment) is
uncommon but not absurd.

**Recommendation — disclose plainly, do not overstate, and do not fix it
here.** Proposed step 3 copy:

> ChainReact keeps the rest of the row as it is. It reads the row first,
> applies the changes you chose, and writes the whole row back. If
> someone edits the same row in Excel at that exact moment, their change
> can be overwritten.

That is accurate about the mechanism and honest about the limit, and it
claims **no** transactional or concurrency guarantee. Making the write
conditional (ETag / Graph workbook session) is a **separate slice** with
its own runtime-behavior and error-handling decisions; it is explicitly
out of scope here (§19), and it must not be described in step 3 as if it
existed.

---

## 12. Preview model

The builder can honestly show, from saved/pending config, real latest-run
values and resolver metadata **only**:

- target workbook, worksheet, and the resolved row number;
- each column that **will change**, with its resolved value (reusing the
  S1 provenance states: real / partial / untested / broken / literal-only);
- each column explicitly marked **"will be cleared"**;
- a count of columns that **will be left unchanged**.

It must **not** show the target row's current contents, the resulting
complete row, or any invented cell value — the builder never reads that
row.

**Recommended title: "Changes we'll make"** — accurate for an edit, where
"The row we'd add" (S1/S2) would be plainly wrong.

---

## 13. Readiness model

| State | Blocks? | Copy |
|---|---|---|
| Missing workbook / worksheet | yes | "Pick a workbook and worksheet" |
| Missing row number | yes | "Say which row to update" |
| Row number < 1 | yes | field-level validation |
| Row number = 1 | **no** | warning only (§10) |
| No column set to change | yes | "Choose at least one column to update" |
| A column set to *Set to…* with no value | yes | "Choose a value for X, or set it to blank" |
| Column deliberately *Set to blank* | no | counted as a change |
| Column *Leave unchanged* | no | the default; never a gap |
| Invalid upstream reference | yes | shared broken-reference state |
| Stale / deleted saved column | **yes** | the run would fail loudly, so readiness should too |
| Disconnected · reconnect required | yes | shared recovery states |
| Resolver / provider error | no (warn) | must never read as "no columns" |
| Genuinely empty header row | no (warn) | honest "couldn't detect any column names" |
| Columns unavailable with a saved record | no (warn) | S2 guard: preserve, explain, edit nothing |

A resolver failure must never erase a saved record, and blank inputs must
never render over keyed data.

---

## 14. Shared architecture changes (additive only)

| Change | File | Why |
|---|---|---|
| `valueShape?: "positional" \| "record" \| "preserve"` on `FieldMeta` | `contracts/actionMeta.ts` | Typed capability instead of an action-key branch |
| Honour `valueShape` in hydration/commit | `fields/spreadsheet/SpreadsheetRowsField.tsx` | Record-unconditional mode |
| Three-state cell model + serializers | `fields/spreadsheet/_serialize.ts` (+ a new small `SpreadsheetUpdateCell` component) | §9 |
| Format numbers/booleans in the destination summary | `guided/guidedStepModel.ts` | Row number currently vanishes from the step-1 summary |
| `mappingTitle` / preview title override | `guided/guidedSpreadsheetAdapters.ts` (`GuidedStepCopy`) | "Changes we'll make" |
| Update Row adapter + readiness adapter | `guided/guidedSpreadsheetAdapters.ts`, `readiness/adapters.ts` | Registration |
| `values` → `spreadsheet-rows` + resolver; row-number copy | `integrations/microsoft-excel/actions/updateRow.meta.ts` | The only provider change |

No provider-registry mutation. No action-key branch in a shared
component. `SpreadsheetRowsField.tsx` is already sizeable, so the
three-state control ships as its own component rather than growing it.

**Header-matching divergence (§5).** Recommendation: make the resolver
emit the **raw** header as the option `value` while displaying the
trimmed text as the `label`, so a picked column always matches the
handler's key. Duplicate headers should be surfaced rather than silently
first-won. Both are small resolver-level changes with tests, and both are
**generic** — the same class of bug exists in `google-sheets:columns`
versus `find_row`, which S3 should note but not fix.

---

## 15. Accessibility plan

- Three-state control = a real `radiogroup` per column, with an
  accessible name containing the column ("Notes — what should happen to
  this column?") and three real radios. Arrow keys move within a column's
  group; Tab moves between columns.
- The revealed value input is labelled by its column and described by the
  chosen state, so a screen reader announces *"Notes, Set to a value"*
  rather than an unlabelled text box.
- The unchanged/blank distinction is stated **in words** on every control
  — never by styling alone.
- Row-number validation errors and the row-1 warning use
  `aria-live="polite"` and are tied to the input with `aria-describedby`.
- Stale-key warnings are in a labelled group, announced, not colour-only.
- Step semantics, focus movement and the collapsed summaries reuse the S1
  accordion unchanged.
- Long worksheet and column names truncate with `min-w-0` chains; the
  preview scrolls inside its own container and never pans the panel.

---

## 16. Responsive / geometric-fixture decision

**Recommendation: add the builder-configuration geometric fixture in S3,
as its own commit, before the Update Row UI lands.**

Reasoning — the honest limitation recorded in S1 and S2 is that the
guided panel has no `*Screens.harness.test.tsx` emitter, so
`npm run verify:responsive` has never measured it. Until now the guided
panel's content has been short and uniform. Update Row changes that: a
worksheet with 20 columns produces 20 three-state groups plus revealed
inputs in a panel that is an **overlay sheet below 1280px**. That is the
first guided surface with genuinely unbounded vertical and horizontal
content, which is exactly the condition the sweep exists to measure.

Scope of that commit: a `builderConfigScreens.harness.test.tsx` emitter
with representative states (narrow/wide worksheet, long column names,
stale keys, error and loading states), registration in `EMITTERS`, region
selectors added to the app-shell pass, and a non-vacuity proof. Deferring
it would mean shipping the widest guided surface with the least
measurement.

---

## 17. Test matrix

Mocks stay at the provider/network boundary throughout.

**Good paths** — select workbook and worksheet; enter a fixed row number;
wire a variable row number; load real worksheet columns; set one column
to a value; set several; leave the rest unchanged and confirm the keys
are **absent**; explicitly blank a column and confirm `""` is **present**;
map real latest-run values; honest change preview; save and reopen a
keyed configuration; legacy open/close byte-identical.

**Bad paths** — no workbook; no worksheet; no row number; row `0`/
negative; row `1` warns but does not block; a variable row number that
resolves to a string (documented runtime failure); no column selected;
*Set to…* left empty; saved key no longer in the worksheet; renamed
column; deleted upstream node; ambiguous suggestion; duplicate headers;
blank header row.

**Provider failures** — 401, 403, 429, 500, timeout, worksheet deleted,
row beyond the used range (documented as *not* an error), resolver
failure while a saved keyed record exists.

**State integrity** — resolver failure preserves the record; workbook
change clears only worksheet/column state; worksheet change preserves
workbook and row number; opening never dirties; cancel leaves saved
config untouched; **blank and omitted serialize differently** (the
headline assertion); key order does not change meaning; a stale-column
warning never deletes the key; the generic renderer still renders a
guided-authored config; removing the adapter restores the generic UI.

**Accessibility / responsive** — three-state controls fully
keyboard-operable; accessible names include the column and its state; row
errors announced; all three steps reachable at 360/414/820/1024/1440;
preview scrolling contained; no breakpoint-hidden controls; the new
geometric fixture green and proven non-vacuous.

---

## 18. Expected implementation files

`contracts/actionMeta.ts` · `features/workflow-builder/config-modal/fields/spreadsheet/{SpreadsheetRowsField.tsx,_serialize.ts,+SpreadsheetUpdateCell.tsx}` ·
`features/workflow-builder/config-modal/guided/{guidedSpreadsheetAdapters.ts,guidedStepModel.ts}` ·
`features/workflow-builder/config-modal/readiness/adapters.ts` ·
`integrations/microsoft-excel/actions/updateRow.meta.ts` ·
`integrations/microsoft-excel/options/worksheetColumns.ts` (raw-value fix) ·
`tests/tools/builderConfigScreens.harness.test.tsx` (new) ·
`scripts/responsive/verify.mjs` + `measure-app-shell.mjs` (registration) ·
tests under `tests/unit/features/workflow-builder/config-modal/**` and
`tests/integration/features/workflow-builder/microsoft-excel/`.

---

## 19. Explicitly out of scope

Runtime handler and Graph request changes; ETag / workbook-session
conditional writes; Google Sheets `update_row`; `find_row`-driven
updates; a row-reading resolver or row preview; test-row writes; Safe
Test / Live Test; database, migration, provider-registry, OAuth, Vercel,
environment and deployment changes; the concurrent Supabase-pipeline and
mobile-companion workstreams.

---

## 20. Implementation slices and commit boundaries

1. **`S3-C1` — geometric fixture** (§16). Harness emitter, runner
   registration, region selectors, non-vacuity proof. Independent and
   revertable; lands first so the following commits are measured.
2. **`S3-C2` — shared record mode.** `valueShape` contract, editor
   honouring it, three-state serializers, step-summary number formatting,
   resolver raw-value fix. No provider adopts it yet; Sheets/Excel
   regression green.
3. **`S3-C3` — Update Row adoption.** Meta rework, guided + readiness
   adapters, step-3 copy, preview title, full test matrix.
4. **`S3-C4` — outcome doc**, and correcting the misleading handler test
   name (§4).

---

## 21. Risks and rollback

| Risk | Evidence | Mitigation |
|---|---|---|
| Lost update on concurrent edit | No `If-Match` in `worksheetRangePatch` | Disclosed in step 3; conditional write is a later slice |
| Picked column rejected at run time | Resolver trims, handler does not | Emit the raw header as the option value (§14) |
| Duplicate headers write to the wrong column | Resolver first-wins vs handler last-wins | Surface duplicates; do not silently pick |
| Updating row 1 destroys headings | Schema allows `rowNumber: 1` | Inline warning, no block, no schema change |
| Wide worksheet overwhelms a narrow panel | 20+ three-state groups in an overlay sheet | Why the fixture lands first (§16) |
| `valueShape` regressing shipped actions | Three actions depend on `"preserve"` | Default when omitted; existing metas untouched; regression suites |

**Rollback:** remove the Update Row adapter registration — the action
reverts to the generic form with no data change. `valueShape` is additive
and inert when unset. The fixture commit is independently revertable.

---

## 22. Migration and database posture

**No migration. No schema change. No `db:push`. No database contact.**
The only contract delta is an **optional** `FieldMeta` key that is inert
when omitted. `UpdateRowConfigSchema` is untouched, so every saved
configuration keeps parsing and running. Nothing in this audit contacted
`syvnzqzctnywakgyykmz` or `qcepijemjlkssfkvzlio`.

---

## 23. Recommended implementation order

`S3-C1` (fixture) → `S3-C2` (shared record mode) → `S3-C3` (Update Row
adoption) → `S3-C4` (docs). Each is gate-green on its own; the first two
carry no user-visible change, so a problem found late can be rolled back
without stranding a half-built experience.

---

## 24. Decisions requiring Marcus's approval

1. **Step structure** — Option 1: step 1 becomes "Pick the row" and holds
   workbook + worksheet + row number.
2. **Editor model** — show **every** detected column with a three-state
   control (not only configured keys).
3. **Three-state semantics** — *Leave unchanged* omits the key, *Set to
   blank* writes `""`, *Set to…* with no value **blocks** rather than
   silently blanking. No UI-authored `null`.
4. **Row 1** — warn, do not block; no schema change.
5. **Concurrency** — disclose the read-then-write limit in step 3 now;
   conditional writes deferred to a separate slice.
6. **Resolver raw-value fix** — option `value` becomes the raw header
   (label stays trimmed) so a picked column always matches the handler;
   duplicates surfaced rather than first-won.
7. **Optional** — warn in the builder when a variable wired to
   `rowNumber` comes from an output declared `type: "string"`. Useful but
   the first cross-field type check of its kind; happy to drop it.
8. **Scope** — **Excel Update Row only.** Google Sheets `update_row` is
   deferred: its `range` is still free-text with no tab field, the same
   blocker `append_row` had to solve in S1, and its `values` is a
   positional array — the opposite representation. Mixing them would put
   two incompatible provider models in one slice.
9. **Geometric fixture in S3** (§16), as the first commit.
