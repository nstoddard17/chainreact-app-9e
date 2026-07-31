# Guided Spreadsheet Configuration — Audit & Plan (SHEETS-EXCEL-GUIDED-CONFIG-AUDIT-1)

**Status:** Plan only — Mode A audit. Nothing implemented. Awaiting Marcus's approval.
**Design source:** claude.ai/design project `3c6250cb-eea4-43e4-b28e-76fd497ba49b`
(`ChainV2Builder`), file **`Sheets Config - Guided.html`** (read in full via DesignSync,
including CSS/JS/interaction logic), plus the four `public/integrations/*.svg` assets it
imports (standard official provider logos — production already ships provider icons, no
asset work needed).
**Predecessor:** [`spreadsheet-config-redesign-closeout.md`](./spreadsheet-config-redesign-closeout.md)
(SPREADSHEET-CONFIG-REDESIGN-1) — shipped the `spreadsheet-rows` column-aware editor for
Excel Add Row, the `microsoft-excel:worksheet_columns` resolver, and the global readiness
banner; **explicitly deferred Google Sheets pending "a product decision (sheet picker +
derived range)"**. This plan makes that decision.

---

## 1. Plain-language product problem

Adding a row to a spreadsheet is the single most common "normal business user" workflow
step, and today ChainReact makes it feel like programming:

- **Google Sheets Append Row** asks for an A1-notation **Range** (`Sheet1!A:Z`) in a raw
  text box and a positional **Row values** chip list with no column names. The user must
  know A1 notation, must know their column order by heart, and gets no preview of what
  the row will look like.
- **Microsoft Excel Add Row** is materially better (workbook/worksheet pickers + a
  column-aware editor showing real header names), but it is still a flat form: no step
  structure, no name-matched suggestions from earlier steps, no row preview against real
  data, and its sibling actions (Add Table Row, Update Row) still ask for hand-typed
  column names or positional chips.

The design reframes setup as three questions a non-technical user already understands:
**(1) Which sheet? (2) What goes in each column? (3) How is it written?** — with real
provider data (spreadsheet list, tabs, header row), name-matched mapping suggestions,
an honest row preview, and plain-language write-behavior choices.

## 2. Claude Design behavior inventory (`Sheets Config - Guided.html`)

Read in full — layout, CSS states, and the interaction script. The file is a
**design specification**; none of its HTML/JS is production code.

### Shell

- Two-pane stage: faint canvas context (workflow nodes 1–4, active node highlighted)
  + a 560px right panel. At ≤1100px the canvas hides and the panel goes full-width —
  i.e. the guided UI must work as the sole surface at narrow widths.
- Panel header: provider mark, eyebrow "Step 3 · Google Sheets", plain-language title
  ("Add a row to a spreadsheet"), one-sentence explanation of what the step does each
  run, close button.
- Body: a **three-step accordion**. Each step header = number/check bubble + title +
  a live one-line summary ("Workflow activity log · tab 'Email log'", "4 of 5 columns
  filled in") + chevron. Completed steps show a green check bubble and tinted
  background; the open step gets an accent ring. Exactly one step open at a time via
  the "Next:" buttons, but headers toggle freely (a user can reopen any step).
- Footer (always visible): status line ("**1 column** left to fill in" amber /
  "**Ready.** Nothing left to fill in" green), quiet "Add a test row" button, solid
  "Save step" button.

### Step 1 — Pick the sheet

- **Connected account row**: avatar initials, "Google Sheets connected", account email,
  green "connected" dot. (Health state display; no switching UI in the design.)
- **Spreadsheet picker**: search input + list rows (file icon, name, "edited 2 hours
  ago · you" recency/ownership caption), selected row marked `aria-selected` + check.
  Copy: "Most recently edited files first." Link: **"Paste a link instead"** (manual
  URL/id entry escape hatch).
- **Tab picker**: pill chips per worksheet tab with row counts ("Email log · 412 rows"),
  single-select `aria-pressed`. Help copy: *"We read the header row of this tab to work
  out the columns — no cell ranges to type."*
- Selecting a different spreadsheet re-renders the tab chips (dependent reload);
  step summary updates live.
- "Next: match the columns" advances and marks step 1 done.
- States that production must add (the mock is happy-path only): loading, empty
  account, disconnected/reconnect, permission-denied, provider error, stale list.

### Step 2 — Say what goes in each column

- Banner: "**We matched 4 columns by name.** Check them, then fill the one that's
  still empty. Click any value to change it." (suggestion transparency).
- **Mapping table**: one row per destination column — column-letter chip (`A`) +
  header name (`Timestamp`) on the left; a **value slot** on the right. Slot states:
  - *filled*: token chip = source eyebrow ("STEP 1", "WORKFLOW", "FIXED") + field name
    ("Sender email"), with an inline clear (×) affordance;
  - *empty*: amber dashed "Choose a value".
- Clicking a slot opens a **data-picker popover**: values grouped by source (Workflow
  meta, Step 1 · Gmail, Step 2 · Drive) with per-item sample values, plus a "type a
  fixed value" text input ("Use" commits it as a literal). Scrim closes it.
- **Optional-blank policy** (explicit in the mock's footer): *"Columns you leave empty
  stay blank in the sheet — nothing breaks."* Empty columns do not block saving; the
  footer counts them ("1 column left to fill in") but Save stays enabled.
- **Row preview**: "The row we'd add" table — header row, the sheet's real last row
  (grey, row 126), and the new row (green, row 127) built from mapped values; unmapped
  cells render amber "empty". Tag: **"using last test data"** — the preview claims
  real captured data, and flips to "added as row 127 ✓" after a test write. The table
  scrolls horizontally inside its own container.
- "Next: check the details" advances.

### Step 3 — Confirm how it's written

- Radio group 1 (plain-language `valueInputOption`):
  - "Like something you typed in" *(recommended badge)* — `USER_ENTERED`
    ("'7/31/2026' becomes a real date, '=SUM(A1:A9)' becomes a working formula").
  - "Exactly as plain text" — `RAW`.
- Radio group 2 (plain-language `insertDataOption`):
  - "Push them down and slot the new row in" *(recommended)* — `INSERT_ROWS`
    ("Nothing in your sheet is lost.").
  - "Write over whatever is there" — `OVERWRITE`; selecting it reveals a red danger
    note: "This can permanently erase data on a sheet that already has content below
    the table."
- **Advanced** disclosure: single "Cell range" input (`Email log!A:F`) with Reset,
  help copy "Set from your tab automatically. Only change this if your table doesn't
  start at the top-left of the sheet." — i.e. range becomes a derived, advanced-only
  power field.
- Note: the mock ships both radios **pre-checked**. Production must NOT pre-check
  `valueInputOption` (Q11 — required, no hidden default); see §10/§23.

### Footer actions

- "Add a test row" fakes a write in the mock ("Adding… → added as row 127 ✓"). A real
  implementation is a genuine external side effect — see §14.
- "Save step" — the mock has no validation gating; production keeps the existing
  local-commit semantics and readiness rules.

## 3. Current Google Sheets config architecture (verified in-repo)

Provider root: [`integrations/google-sheets/`](../../../integrations/google-sheets/) —
12 actions, 3 option resolvers, 2 triggers.

**`google-sheets:append_row`** (the design's target):

- Schema [`appendRow.schema.ts`](../../../integrations/google-sheets/actions/appendRow.schema.ts)
  (`.strict()`): `spreadsheetId` (required) · `range` (required free-text A1) ·
  `values` (required **positional** `(string|number|boolean|null)[]`, min 1) ·
  `valueInputOption` (**required enum, no default — Q11**) · `insertDataOption`
  (enum, default `INSERT_ROWS`).
- Meta [`appendRow.meta.ts`](../../../integrations/google-sheets/actions/appendRow.meta.ts):
  `spreadsheetId` combobox (`google-sheets:spreadsheets`) · `range` **plain text** ·
  `values` **string-array chips** · two selects. No `advanced`, no `visibleWhen`, no
  `dependsOn` anywhere. The meta header comment records that a sheet combobox was
  requested and deliberately not added because the live schema has no `sheetName`.
- Handler [`appendRow.ts`](../../../integrations/google-sheets/actions/appendRow.ts)
  wraps `values` into `[[...]]` and calls `valuesAppend` (POST
  `/values/{range}:append`), passing `range` through verbatim.
- Resolvers:
  - `google-sheets:spreadsheets` — Drive file list (mimeType filter), client-side `q`
    substring, `hasMore` hint, **no recency ordering plumbed** (Drive default order).
  - `google-sheets:sheets` (`requiredDeps: ["spreadsheetId"]`) — tab titles (value =
    **title**, not numeric sheetId) with "n rows × m columns" descriptions.
  - `google-sheets:columns` (`requiredDeps: ["spreadsheetId","sheetName"]`) — reads
    literal row 1 via `valuesGet` on `'<tab>'!1:1`; value/label = header text,
    description = absolute column letter; blank cells skipped, duplicates keep first;
    `NotFoundError` → empty items (honest no-columns), never a throw.
  - **`columns` is wired only to `find_row.column` and the `row_changed` trigger's
    `keyColumn`** — not to any append/update field, because free-text `range` provides
    no `dependsOn` parent.
- Row-writing siblings: `update_row` (`range` + positional `values` +
  `valueInputOption`), `update_cell` (has a real `sheetName` combobox + `cell`),
  `batch_update` (advanced JSON), `find_row` (header-name column combobox),
  `delete_row` (`sheetName` + `rowNumber`). **No multi-row append action exists**
  (documented deliberate non-goal; schema comment says expanding later is
  non-breaking).
- Pinned decisions that this plan proposes to reverse deliberately:
  - `tests/unit/integrations/google-sheets/configUxSweep.meta.test.ts` pins free-text
    `range` + positional `values` as *"Deliberately NOT changed (deferred product
    decision per …spreadsheet-config-redesign-closeout.md)"*.
  - `tests/integration/features/workflow-builder/google-sheets-append-row-config.test.tsx`
    pins exact field order and `names).not.toContain("sheetName")`.
  - `tests/unit/integrations/metaRuntimeRequiredDrift.test.ts` asserts runtime-required
    keys are `required` in the meta (any schema change must keep this green).

## 4. Current Microsoft Excel config architecture (verified in-repo)

Provider root: [`integrations/microsoft-excel/`](../../../integrations/microsoft-excel/) —
13 actions, 5 resolvers, 5 polling triggers. Two distinct surfaces, never mixed:
**worksheet-range actions** (`add_row`, `update_row`, `delete_row`, `read_range`,
`export_sheet`…) keyed by `workbookId + worksheetName`, and **table (ListObject)
actions** (`add_table_row`, `read_table_rows`, `find_row`) keyed by
`workbookId + tableName`. No session handling (one Graph round-trip per call;
documented deferral).

Row-writing configuration state:

| Action | Destination | Row values today | Column picker? |
|---|---|---|---|
| `add_row` | workbook + worksheet comboboxes | `spreadsheet-rows` composite: one-row **positional** `values[]` XOR batch `rows[]` header-keyed records (≤1000) | ✅ `microsoft-excel:worksheet_columns` |
| `add_table_row` | workbook + table comboboxes | `string-array` positional chips (schema also accepts a keyed record, but the meta exposes only the positional branch) | ❌ (resolver `microsoft-excel:table_columns` exists but is wired only to `find_row.lookupColumn`) |
| `update_row` | workbook + worksheet + `rowNumber` | `keyvalue` record with **hand-typed header names** | ❌ (deferred in meta comment) |

Handler semantics that the guided UI must respect: `add_row` single mode anchors at
`lastUsedRow+1` and pads/truncates to the used range's column count; batch mode
validates record keys against real row-1 headers and fails loudly listing unknown
columns; `update_row` merges onto the existing row and PATCHes the full row so partial
writes cannot blank cells; `add_table_row` records are aligned to Graph column order
with `null` for missing keys. **Excel has no `valueInputOption`/`insertDataOption`
equivalents — a range PATCH always writes literal values** (Graph parses them
sheet-side; there is no RAW/USER_ENTERED switch and no push-down insert option on this
surface).

Prior art shipped by SPREADSHEET-CONFIG-REDESIGN-1 and reusable as-is:

- `spreadsheet-rows` FieldType + composite editor
  ([`fields/spreadsheet/`](../../../features/workflow-builder/config-modal/fields/spreadsheet/)):
  real-column loading via `useOptionsSource`, honest "We couldn't detect any column
  names…" fallback with manual entry, per-cell variable picker, preview block,
  serialize helpers (`cellsToPositionalValues` keeps in-between blanks as `""`, trims
  trailing; `gridToBatchRows` omits blank cells).
- `NodeConfigReadinessBanner` + `computeConfigReadiness` + per-action checklist
  adapters (`readiness/adapters.ts` — Excel `add_row` is the only adapter today).

## 5. Current data/resource resolver flow (shared infrastructure)

```
Field renderer (ComboboxField / SpreadsheetRowsField / …)
  → useOptionsSource (features/workflow-builder/hooks/useOptionsSource.ts; 250ms debounce,
    AbortController, states idle|loading|ready|empty|error|disconnected|owner-gated|
    owner-must-connect|needs-reconnect, no cross-mount cache)
  → fetchOptionsSource (lib/api/options.ts, typed client)
  → GET /api/options/[source] (app/api/options/[source]/route.ts — thin; auth; deps[<parent>] query params)
  → resolveOptionsSource (services/options/resolveOptionsSource.ts — registry lookup,
    requiredDeps check, credential policy / per-node owner, refreshAndRetry,
    clearNeedsReconnect on success / markNeedsReconnect on reauth)
  → provider resolver (integrations/<p>/options/*.ts) → provider API wrapper
```

- Failure classification is shared and provider-agnostic:
  [`core/workflows/options/optionsRecovery.ts`](../../../core/workflows/options/optionsRecovery.ts)
  (`classifyOptionsRecovery`, `reconnectHrefForProvider`, `validateManualOptionId`) —
  rule doc [`option-source-recovery.md`](../../rules/option-source-recovery.md). Every
  non-ready state must say what happened and offer only recoveries that state supports.
- Pagination: none — `hasMore` is a UI hint ("Refine search to narrow"). Search is
  passed as `q` (Sheets/Excel resolvers filter client-side today).
- Connection readiness: `useConnectionReadiness` → POST
  `/api/workflows/[id]/connection-readiness`; statuses feed `computeConfigReadiness`
  (priority: blocking errors > connection > missing fields > ready) and the
  Connect/Reconnect CTA (`/apps`, `/apps?provider=<slug>`).
- Variables: canonical `{{nodeId.path}}` (+ `{{trigger.…}}` alias) via
  `core/workflows/variables/*`; upstream enumeration via `useUpstreamVariables`
  (OutputMeta catalogs + dynamic outputs + latest-run values); builder previews use
  `core/workflows/resolveValueAtPath.ts` + `formatLatestValuePreview.ts` (client code
  never imports `workflow-engine/`); insertion always emits the token, never preview
  text; `sensitive` outputs masked.
- Config edits: `configSlice` drafts (pending) vs `graphSlice` node config (saved,
  local); "Save step" = `commitNodeConfigDraft` — **local only**; the workflow save is
  a separate action. The guided UI must preserve exactly this separation.

## 6. Current saved-config shapes (the compatibility contract)

| Action | Saved shape (unchanged by this plan unless noted) |
|---|---|
| `google-sheets:append_row` | `{ spreadsheetId, range, values: primitive[], valueInputOption, insertDataOption? }` — row values identified by **array position**; nothing binds a value to a header |
| `microsoft-excel:add_row` | `{ workbookId, worksheetName, values?: unknown[] }` XOR `{ …, rows?: Record<header, unknown>[] }` |
| `microsoft-excel:add_table_row` | `{ workbookId, tableName, values: unknown[] \| Record<column, unknown> }` |
| `microsoft-excel:update_row` | `{ workbookId, worksheetName, rowNumber, values: Record<header, unknown> }` |

How today's shapes handle schema drift (and what the guided UI inherits):

- **Column reorder / renamed headers:** positional shapes (`Sheets append_row`,
  Excel single-row) silently write into the new order — the saved config knows
  nothing about headers. Header-keyed shapes (Excel batch/update) fail loudly at run
  time listing unknown columns. The guided UI cannot fix this retroactively, but it
  must *surface* it at design time: reopening a node re-fetches columns and compares
  against the mapped cells (see §12 stale-schema state).
- **Duplicate headers:** both column resolvers keep the first occurrence (pinned by
  tests). Guided UI shows the same first-wins list; a duplicate can only be targeted
  positionally (Advanced manual path).
- **Blank headers:** skipped by resolvers → honest "no columns detected" fallback with
  manual entry (already shipped for Excel; Sheets reuses it).

## 7. Shared vs provider-specific decision table

| Concern | Shared (provider-agnostic) | Provider-specific |
|---|---|---|
| Three-step guided shell, step completion, accordion, summaries | ✅ new `config-modal/guided/` components + pure step model | step *titles/copy* come from the adapter |
| Destination step (account row, resource pickers) | ✅ renders the adapter-declared destination fields through existing `SchemaForm only=` / ComboboxField | which fields (spreadsheet+tab vs workbook+worksheet vs workbook+table), resolver ids |
| Column mapping table + slot picker | ✅ evolves the existing `spreadsheet-rows` composite (one editor, no second mapping system) | columns resolver id, save shape (positional vs keyed), batch availability |
| Suggested mappings ("matched by name") | ✅ pure helper over upstream OutputMeta + column names | — |
| Row preview | ✅ one preview component fed by latest-run values + mapped cells | destination row-number caption (Sheets can say "appends below row N" only approximately; Excel single knows `lastUsedRow+1` only at run time — preview never claims an exact row number it cannot know) |
| Unmapped-column notice / footer status | ✅ `computeConfigReadiness` + per-action adapters (existing) | adapter checklist copy |
| Write-behavior step | ✅ step frame + radio rendering of existing select fields with `recommendedValue` styling | which fields exist (Sheets: `valueInputOption`, `insertDataOption`; Excel add_row: none → step renders as a short confirmation note; Excel has no fake options) |
| Advanced section | ✅ existing Advanced tab / `advanced: true` fields | Sheets: derived `range`; Excel: none today |
| Loading / error / stale / reconnect states | ✅ `useOptionsSource` states + `optionsRecovery` + `SetupFieldRecovery` | — |
| Variable picker | ✅ existing `VariablePickerPopover` (grouped by source, sample values) — the design's popover is a restyle, not a new system | — |
| "Paste a link instead" | ✅ manual-entry path (`allowManualEntry` + `validateManualOptionId`) + a pure URL→id parser helper | per-provider URL patterns (Sheets `docs.google.com/spreadsheets/d/<id>`; Excel share links are not stable item-id carriers — Excel gets manual **id** entry only, no link parsing, unless a Graph shares-URL lookup is added later) |
| Test-row write | ❌ deferred (see §14) | — |

The dispatch is **capability/adapter-driven, never `if (providerId === …)`**: a guided
adapter registry keyed by action key. No frozen provider-registry mutation; adapters
live in the builder feature, importing only `contracts/` types.

## 8. Recommended guided configuration component structure

All new files under `features/workflow-builder/config-modal/guided/`, each < 300 lines
target (hard cap 500), presentational components + one pure model module:

```
config-modal/guided/
├── guidedSpreadsheetAdapters.ts   # adapter registry (pure data + tiny lookup)
├── guidedStepModel.ts             # pure: derive step list, completion, summaries
│                                  #   from (adapter, meta, draft values, readiness)
├── GuidedConfigLayout.tsx         # accordion shell (native disclosure semantics,
│                                  #   one-open-at-a-time, step headers + summaries)
├── GuidedDestinationStep.tsx      # account row + destination fields (SchemaForm only=)
├── GuidedMappingStep.tsx          # wraps the spreadsheet-rows composite + suggestion
│                                  #   banner + preview
├── GuidedWriteStep.tsx            # write-behavior fields as radio groups + danger note
│                                  #   + Advanced disclosure (advanced fields)
├── mappingSuggestions.ts          # pure: exact-normalized-name matcher (see §23-D3)
└── RowPreviewTable.tsx            # honest preview table (see §13)
```

Integration point: `ConfigModalShell` renders `GuidedConfigLayout` **instead of the
flat `SchemaForm section="setup"` body** when
`getGuidedSpreadsheetAdapter(meta.key)` returns an adapter; everything else
(header, tabs, Advanced tab, readiness banner, save/discard footer, credential
sections) is unchanged. The guided layout renders the **same meta fields through the
same renderers and the same `configSlice` draft** — it is a presentation
reorganization, not a second form system. Removing an adapter registration reverts
that action to the generic renderer with zero data changes (this is the rollback
lever, §20).

State: no new Zustand slice. Step open/closed is component-local `useState`
(component-local UI state per the state-store rule); completion/summaries are pure
derivations from existing draft state via `guidedStepModel.ts`.

## 9. Proposed capability/adapter contract

```ts
// guidedSpreadsheetAdapters.ts — typed data, validated at module load
export interface GuidedSpreadsheetAdapter {
  /** ActionMeta.key this adapter guides, e.g. "google-sheets:append_row". */
  actionKey: string;
  /** Step 1 — destination field names, in render order (must exist in the meta). */
  destinationFields: string[];        // e.g. ["spreadsheetId", "sheetName"]
  /** Step 2 — the mapping field (must be the spreadsheet-rows field). */
  mappingField: string;               // e.g. "values"
  /** Step 3 — write-behavior field names (may be empty → step renders as confirmation). */
  writeBehaviorFields: string[];      // e.g. ["valueInputOption", "insertDataOption"]
  /** Optional per-option UI hints for step 3 radios. */
  recommendedValues?: Record<string, string>;  // field → recommended option value
  dangerValues?: Record<string, string>;       // field → option value that reveals riskDescription copy
  /** Manual-link parsing for "Paste a link instead" (step 1), when supported. */
  parseResourceLink?: (url: string) => { field: string; value: string } | null;
  /** Step copy overrides (titles/help), defaulting to shared copy. */
  copy?: Partial<GuidedStepCopy>;
}
```

Rules:

- Every named field is validated against the action's meta at module load (mirror of
  the `dependsOn`/`renderedBy` throw-at-load pattern in `contracts/actionMeta.ts`) —
  a typo fails tests, not users.
- Adapters carry **no behavior beyond data + the pure link parser**; all rendering
  decisions flow through the shared components. No provider imports in the registry
  (link parsers are pure string functions colocated in the adapter file).
- Registration is the feature switch: `add_row`-family actions without an adapter keep
  the generic form. This is deliberately NOT stored in the provider manifest/registry
  (frozen; runtime UI state does not belong there).

## 10. Google Sheets behavior mapping (design → production)

The one product decision this plan makes (reversing the recorded deferral):
**introduce a `sheetName` picker and derive `range` from it.**

- **Schema (additive, no migration):** add `sheetName: z.string().min(1).optional()`
  to `AppendRowConfigSchema`. `range` stays required. Handler behavior unchanged
  (`range` remains what is sent to the API); `sheetName` is carried config used by the
  builder as the `dependsOn` parent for columns and to derive `range`. Old configs
  (no `sheetName`) still validate; new configs carry both. `.strict()` retained.
  - Rejected alternative A (UI-only, parse `sheetName` back out of `range`): fragile —
    `range` may omit the sheet name entirely, and quoting rules make round-tripping
    error-prone. Rejected alternative B (make `sheetName` required + `range` optional/
    derived server-side): breaks every existing saved config → not acceptable.
- **Meta:** `spreadsheetId` combobox (unchanged) · new `sheetName` combobox
  (`google-sheets:sheets`, `dependsOn: ["spreadsheetId"]`, required in the meta —
  see compatibility note §12 for legacy opens) · `range` becomes `advanced: true`
  with a derived default (`'<tab>'!A:<lastColLetter>` from the columns resolver
  result, falling back to `'<tab>'` when no columns detected) and the design's help
  copy · `values` switches `string-array` → **`spreadsheet-rows`** with
  `optionsSource: "google-sheets:columns"`, `dependsOn: ["spreadsheetId","sheetName"]`,
  **no `batchRowsField`** (Sheets has no multi-row append; the mode toggle already
  hides when `batchRowsField` is absent — proven by the Excel closeout) ·
  `valueInputOption` keeps `required`, **no `defaultValue`** (Q11), gains
  plain-language option labels per the design ("Like something you typed in" /
  "Exactly as plain text") · `insertDataOption` keeps `defaultValue: "INSERT_ROWS"`
  and gains the design's labels + OVERWRITE danger copy.
  - The mock pre-checks `USER_ENTERED`; production renders the radio group
    **unselected** with a "recommended" badge on `USER_ENTERED`, and readiness counts
    the unanswered choice. Q11 is not weakened.
- **Saved values shape:** unchanged positional `primitive[]` — `spreadsheet-rows`
  one-row mode already commits exactly that (in-between blanks `""`, trailing
  trimmed). No new mapping representation is introduced; header names are a
  *rendering* of position, not a storage change (same posture the Excel closeout
  documented, same contiguity caveat).
- **Range/derivation caveat (documented, not hidden):** columns come from row 1 of the
  tab; positional alignment assumes the table starts at column A (the handler's
  existing posture). A used range not starting at A is the Advanced-range power case.
- **Recency ordering:** plumb Drive `orderBy=modifiedByMeTime desc` through
  `listSpreadsheets` so the picker genuinely lists most-recently-edited first (the
  meta copy already promises this; today it isn't ordered). Small, isolated wrapper +
  resolver change with tests.
- **"Paste a link instead":** adapter `parseResourceLink` extracts the id from
  `https://docs.google.com/spreadsheets/d/<id>/…`; commits via the existing manual
  path (`validateManualOptionId`); label resolution falls back to the id until the
  picker confirms it.

## 11. Microsoft Excel behavior mapping (design → production)

- **`microsoft-excel:add_row`** — already has destination pickers + the mapping
  editor + a readiness adapter. Gains only the guided shell (adapter registration:
  destination `["workbookId","worksheetName"]`, mapping `values`,
  `writeBehaviorFields: []`). Step 3 renders as a short factual confirmation
  ("Values are written exactly as provided, appended below the last used row; batch
  rows are matched to column names") — **no fake Sheets-style options are invented**.
  Save shapes (positional XOR keyed batch) unchanged.
- **`microsoft-excel:add_table_row`** — the design's step 2 maps naturally onto
  tables (Graph table columns are the *authoritative* schema — better than row-1
  heuristics). Change: wire `values` to the existing-but-unwired
  `microsoft-excel:table_columns` resolver by switching it to `spreadsheet-rows`
  (single-row positional; the schema's record branch stays runtime-only as today),
  `dependsOn: ["workbookId","tableName"]`, no batch field. This was already scoped as
  a "small follow-up" in the predecessor closeout.
- **`microsoft-excel:update_row`** — deferred (needs a record-commit mode on the
  composite editor, per the closeout). Not in the first slices; listed in §19.
- **Not forced onto Excel:** `valueInputOption`/`insertDataOption` radios, "Paste a
  link" URL parsing (manual id entry only), Sheets-style range Advanced field.
- **Which Excel action first:** `add_table_row` (small, resolver already exists,
  authoritative columns); `add_row` shell adoption rides in the same slice since it
  requires no data changes.

## 12. Legacy-config compatibility plan

Goal: **zero DB migration, zero workflow-schema migration, no silent meaning change.**

- **Sheets legacy open** (`{spreadsheetId, range, values[], valueInputOption,
  insertDataOption}`): the guided UI derives UI-state — `sheetName` prefilled by
  parsing `range` when it unambiguously embeds a tab name (`'Tab'!A:Z` / `Tab!A:Z`);
  otherwise step 1 shows the tab picker as *unanswered* while `range` (Advanced)
  retains the saved value and a notice explains the sheet couldn't be identified from
  the saved range. Positional `values` render as cells aligned to detected columns
  (or the ordinal manual fallback when columns don't load). **Nothing is rewritten
  until the user saves** — reopening and closing without saving leaves config
  byte-identical (existing draft/commit semantics already guarantee this; a test pins
  it).
  - Meta-required `sheetName` vs legacy configs: readiness will show "Pick the tab"
    on legacy nodes when opened — acceptable and honest (the runtime schema keeps
    `sheetName` optional, so **existing saved workflows keep validating and running
    untouched**; `metaRuntimeRequiredDrift` only checks runtime-required ⇒
    meta-required, not the converse — verified in its harness).
- **Excel:** no shape changes at all; `add_table_row` positional `values` reopen as
  cells under the table's columns.
- **Generic-renderer compatibility:** the guided UI writes only fields that exist in
  the meta, so any config it produces renders in the generic `SchemaForm` (and in the
  React Agent rail's field controls) without adapters. Guided ⇄ generic is lossless.
- **Rollback:** unregister the adapter (guided shell off; generic form back), and for
  Sheets optionally revert the meta while keeping the schema's optional `sheetName`
  accepted (configs saved with `sheetName` must keep validating after a UI rollback —
  this is why the schema change, once shipped, is one-way until a deliberate cleanup;
  called out in §20).

## 13. Preview / test-data plan (honesty rules)

Data source: existing latest-run plumbing only — `runSlice` detail →
`buildLatestValuesBySource` (`core/workflows/latestRunValues.ts`) →
`resolveValueAtPath` + `formatLatestValuePreview`, exactly what the variable picker's
inline previews use. `sensitive` outputs stay masked. **No fabricated
customer-looking values, ever** (the mock's `row 126/127` neighbor-row realism is NOT
reproduced; we do not fetch sheet data to render neighbors in slice 1 — the preview
shows only the row we'd write).

Preview states (all explicit, tag text in the corner like the design's `tagm`):

| State | Condition | Rendering |
|---|---|---|
| Real data | latest run detail has values for every referenced upstream node | resolved values, tag "using data from your last test" |
| Partial | some referenced nodes have latest values, others don't | resolved cells + literal `{{token}}` chips for the rest, tag "some values not tested yet" |
| No test yet | no latest run detail | all mapped cells show token chips, tag "run a test to see real values" — never example data |
| Unresolved/invalid | a mapping references a deleted node/unknown output (`_variableValidator`) | cell flagged as broken with the specific reference, counts as a readiness problem (distinct from optional-blank) |
| Stale destination | columns re-fetch after reopen differs from the columns the cells were authored against (Sheets positional: count/name drift; Excel keyed: key no longer in list) | banner "Your sheet's columns changed" + per-cell flags; existing mappings are **not** auto-cleared (deliberate invalidation only — user confirms) |
| Unmapped column | column intentionally blank | amber "empty" cell + footer note "Columns you leave empty stay blank — nothing breaks"; **never blocks Save** |

Distinctions the footer/readiness must keep separate (per the brief): node config
missing (destination/valueInputOption unanswered — blocks readiness) · optional blank
column (never blocks) · required mapping content (`values` min-1: at least one cell —
readiness adapter copy "Fill in at least one column") · invalid upstream reference
(blocks readiness with a specific fix) · stale schema (warns, prompts refresh, doesn't
auto-destroy work).

## 14. Test-row safety plan

**Recommendation: defer the real "Add a test row" write out of the first slices.**

Verified infrastructure reality: there is **no per-node test-action execution path**
today. The config panel's Test tab is an honest stub; workflow-level **Safe Test**
(`testMode`) deliberately *mocks* side-effectful handlers (deterministic outputs — it
will never write a row), and **Run Live Test** is a whole-workflow, consent-gated,
disclosure-first session system (`services/workflows/liveTest/*`). A real
single-node write is therefore *new execution surface area* — new route + service +
billing/idempotency/risk decisions — not a UI affordance. Bolting it onto slice 1
would violate the "do not invent a new execution path" instruction in reverse: there
is no existing safe path to reuse for one node.

What slice 1 ships instead: the preview table (§13) + the existing header Test / Live
Test entry points. The panel's footer keeps "Save step" only; no dead "Add a test
row" button.

If Marcus wants the real test-row (proposed follow-up slice, §19 S4), its contract —
reusing existing primitives, not a parallel engine:

- Explicit disclosure before the write: destination (file, tab/table), the exact
  values, and "this writes a real row to your spreadsheet" — modeled on the Live Test
  disclosure/consent pattern (`disclosure.ts`, `LiveTestModal`), plus
  `riskConfirmation` typed-confirmation if classified as requiring it.
- Gated on valid required config (readiness must be `ready` except optional blanks);
  strict-resolved values only (no unresolved tokens written).
- Single-flight + idempotency: client disables on submit; the request carries a
  client-generated idempotency key so a UI retry cannot double-write.
- Executes through the real handler + `refreshAndRetry` with typed error mapping to
  the humanized error surface; success reports the provider's own reference
  (`updatedRange` / table row index) — a link only where the provider gives a safe
  URL (Sheets: constructed spreadsheet URL is acceptable; it's the user's own file).
- Failure never marks the node complete; cancel performs no write.

## 15. Accessibility / responsive plan

Follows [`responsive-layout-and-validation.md`](../../rules/responsive-layout-and-validation.md)
(360→1600px sweep, containment · legibility · panning policy, non-vacuous proof) and
the builder tiers (`builderLayoutPolicy.ts`: config is an in-flow ~24rem panel only at
`wide` ≥1280, an overlay sheet below that — so the guided UI's primary width is the
**narrow panel**, not the design's 560px).

- **Accordion semantics:** step headers are `<button aria-expanded aria-controls>`
  controlling `role="region"`-labelled bodies (no `Accordion` primitive exists in
  `components/ui/`; native disclosure pattern per existing `<details>` precedent, but
  buttons+regions so summaries stay clickable text). Advancing via "Next:" moves focus
  to the next step's header; collapsing returns focus to that step's header
  (`useBuilderOverlaySurface` stays the overlay-focus owner; the accordion manages
  only its own focus).
- **Pickers:** spreadsheet/tab/table selection through the existing `ComboboxField`
  (combobox/listbox semantics already shipped) — the design's list+chips are styling
  variants, evaluated against reusing ComboboxField first; a new listbox is written
  only if the chip presentation can't be a ComboboxField skin, and then with full
  `role="listbox"/"option"`, arrow-key + type-ahead support.
- **Mapping table:** semantic table (or `role="grid"`), each slot a real button whose
  accessible name includes the column ("Value for Status — empty"); clear affordances
  are buttons, not nested click targets inside buttons (the mock nests a clear span
  inside a button — fixed in production).
- **Radios:** `role="radiogroup"` + labelled radios; the OVERWRITE danger note is
  `aria-live="polite"` and tied via `aria-describedby`; "recommended" is text, not
  color.
- **Status:** footer completion/error status announced (`aria-live="polite"`), with
  icon+text (never color-only); async option loading and provider failures announced
  through the existing recovery components.
- **Preview table:** horizontal scrolling inside its own `overflow-x-auto` container
  (declared pan exemption like the runs JSON block); scroll container is keyboard
  scrollable (`tabindex="0"` + label) and never traps focus; the page body never pans.
- **Touch:** slots/chips ≥ 40px targets; popovers dismissible by scrim tap and Escape.
- **Themes:** existing builder tokens (`var(--builder-*)`) only — light+dark for free;
  no hardcoded design-mock hex values.
- **Widths to certify** (behavior, not just no-overflow): 1440 (wide, in-flow panel),
  1024 (medium, overlay), 820 (overlay), 360–414 (phone). At every width: all three
  steps reachable and expandable, search/selection keyboard-operable, footer actions
  never cover content (footer is in-flow, not floating), Advanced reachable.

## 16. Test matrix (behavior-focused; mocks only at provider/HTTP boundaries)

Placement follows existing conventions: pure model/unit under
`tests/unit/features/workflow-builder/config-modal/guided/`, provider-config
integration under `tests/integration/features/workflow-builder/`, resolver units under
`tests/unit/integrations/<p>/options/`, structure guards under `tests/structure/`.

**Good paths**

1. Select spreadsheet → tab chips load via `google-sheets:sheets`; step summary shows
   "file · tab" (integration, Sheets).
2. Tab selected → columns load via `google-sheets:columns`; mapping rows show real
   header names + letters (integration).
3. Suggestions: upstream output "Subject" + column "Subject" → suggestion offered,
   marked suggested; accepted → committed token; never auto-committed (unit
   `mappingSuggestions` + integration).
4. User changes a mapping via the picker → token replaces old value; clear empties it.
5. Optional column left blank → Save enabled; committed `values` keeps `""` alignment
   (serialize unit already exists — extend for Sheets wiring).
6. Preview shows resolved last-run values with the honest tag; token chips when no
   run exists (integration with seeded `runSlice` detail).
7. Step 3 explicit choice: Save with `valueInputOption` unanswered → readiness blocks
   with the checklist item; answering commits the enum value (Q11 pinned).
8. Existing saved node (legacy `range`-only) opens: values render, nothing rewritten
   until save; save from guided UI commits `sheetName` + derived `range` + unchanged
   positional `values` validated against the real `AppendRowConfigSchema`.
9. Excel `add_table_row`: table columns from `microsoft-excel:table_columns`; commit
   stays positional and schema-valid.
10. Excel `add_row`: guided shell renders, both save shapes still commit (existing
    integration test extended, not weakened).

**Bad paths**

11. No integration connected → step 1 shows connect CTA (existing
    `connection-missing` classification); no resolver call spam.
12. Integration `needs-reconnect` → reconnect deep-link `/apps?provider=google-sheets`.
13. Spreadsheet deleted / permission revoked (resolver `NotFoundError` → empty; 403 →
    PROVIDER_ERROR) → honest copy + retry; saved mappings NOT erased.
14. Tab/table no longer exists → dependent picker shows honest empty; mapping step
    gated with "Pick the tab first" (parent-required state).
15. Blank header row → "We couldn't detect any column names" + manual fallback
    (existing pinned copy reused).
16. Duplicate headers → first-wins list renders; no crash; advanced manual path
    available.
17. Destination schema changed after mapping (recount/rename) → stale banner +
    flagged cells; mappings preserved until user confirms.
18. Upstream referenced node deleted → invalid-reference flag + readiness block
    (`_variableValidator` path).
19. Ambiguous suggestion (two upstream outputs normalize to the same column name) →
    no suggestion offered (unit).
20. Required config missing (no spreadsheet / no tab / zero mapped cells /
    unanswered `valueInputOption`) → readiness lists each specifically; Save-step
    commit allowed only per existing shell rules (blocking errors gate).

**Provider failures** (resolver-level, mocked at HTTP boundary)

21. 401 → INTEGRATION_DISCONNECTED state + reconnect CTA (and `markNeedsReconnect`
    server test exists — reuse).
22. 429 / 500 → PROVIDER_ERROR → `provider-unavailable` recovery copy + retry that
    can actually help.
23. Timeout/abort → no state corruption; refetch works.
24. (S4 only) test-row write failure → typed humanized error; config not marked
    complete; no duplicate write on retry (idempotency key).

**State integrity**

25. Failed columns load does not erase saved mappings (draft untouched).
26. Changing spreadsheet clears `sheetName` + dependent state only (existing
    dependsOn cascade test pattern); changing tab remounts the mapping editor
    (destinationKey) without touching other fields.
27. Reopening the node preserves saved vs pending separation; discard restores.
28. Legacy config unchanged unless saved (byte-identical reopen test).
29. (S4 only) cancel test-row → zero writes; repeated submit → one write.

**Responsive / a11y**

30. Steps reachable + expandable at 360/820/1024/1440 (behavior assertions:
    controls present and operable, not merely "nothing overflows").
31. Full keyboard journey: search → select spreadsheet → select tab → map a column →
    choose write behavior → save, no pointer events.
32. Mapping slots have accessible names including the column; completion/status
    changes are announced (aria-live assertions).
33. Preview scroll container is keyboard-scrollable and does not trap focus.
34. Structure guard: guided components contain no `fetch(`, no `services/` import,
    no provider-id branches (`if (provider === "google-sheets")` forbidden — grep
    guard in `tests/structure/`).
35. Non-vacuity: the responsive/behavior harness is shown to fail against a mutation
    (e.g. hiding step 3 at narrow width) before being accepted.

Updated (not weakened) existing pins: `configUxSweep.meta.test.ts` (Sheets fields),
`google-sheets-append-row-config.test.tsx` (rewritten for the new meta — its current
`not.toContain("sheetName")` assertion is deliberately reversed with a comment citing
this plan), `metaRuntimeRequiredDrift` (still green: runtime-required ⊆ meta-required),
`fields/_registry.test.ts` variant count (unchanged — no new FieldType needed).

## 17. Exact files expected to change (implementation slices, for scoping)

**Slice S1 — Sheets Add Row guided (first slice, ~detail in §19):**

- `integrations/google-sheets/actions/appendRow.schema.ts` — add optional `sheetName`
- `integrations/google-sheets/actions/appendRow.meta.ts` — field rework (§10)
- `integrations/google-sheets/api/listSpreadsheets.ts` — `orderBy` support
- `integrations/google-sheets/options/spreadsheets.ts` — recency ordering
- `features/workflow-builder/config-modal/guided/*` — new (8 files, §8)
- `features/workflow-builder/config-modal/ConfigModalShell.tsx` — adapter branch
  (small; file is already at 635 lines — the branch must be a one-line delegation,
  and S1 budgets a mechanical extraction of the Setup-tab body into
  `ConfigSetupTabBody.tsx` to move toward the cap, not away from it)
- `features/workflow-builder/config-modal/fields/spreadsheet/SpreadsheetRowsField.tsx`
  (+ possibly `SpreadsheetSingleRowEditor/CellInput`) — suggestion + preview hooks,
  batch-less Sheets consumer polish
- `features/workflow-builder/config-modal/readiness/adapters.ts` — Sheets adapter
- Tests: new `guided/` units + `google-sheets-append-row-config.test.tsx` rewrite +
  `configUxSweep.meta.test.ts` update + resolver ordering test + structure guard

**Slice S2 — Excel adoption:** `integrations/microsoft-excel/actions/addTableRow.meta.ts`,
adapter registrations, `microsoft-excel-add-row-config.test.tsx` extension, new
`microsoft-excel-add-table-row-config.test.tsx`.

**Slice S3+ (later):** `updateRow` metas/editor record-mode, suggestion/preview
refinements, harness coverage.

## 18. Explicitly out of scope (this arc)

- Runtime handlers and API wrappers' write behavior (`appendRow.ts`, `addRow.ts`,
  `valuesAppend.ts`, Graph wrappers) — **no execution semantics change**.
- All non-row-writing Sheets/Excel actions and every other provider (Airtable etc. —
  candidate later only if the adapter model genuinely fits).
- Multi-row append for Sheets (would be a schema/action expansion — separate product
  decision).
- The React Agent rail, document builder guided stops, Run Live Test system, Safe
  Test engine gating (consumed, not modified).
- Provider manifests/registry, OAuth scopes, DB schema, migrations, flags.
- The design's canvas-context pane (already exists as the real canvas).

## 19. Implementation slices and commit boundaries

- **S1 — `SHEETS-GUIDED-CONFIG-1` (recommended first): Google Sheets Add Row guided.**
  Commit 1: schema `sheetName` + resolver recency ordering + meta rework + updated
  meta/schema tests (form still generic but already usable — sheet picker + columns
  editor live here). Commit 2: guided shell (`guided/` components + adapter registry +
  shell integration + model units). Commit 3: suggestions + preview + readiness
  adapter + integration matrix + structure/a11y/responsive tests. (3 local commits,
  each gate-green.)
- **S2 — `EXCEL-GUIDED-CONFIG-2`:** `add_table_row` columns wiring + adapter
  registrations for both Excel add actions + tests. (1–2 commits.)
- **S3 — `SPREADSHEET-UPDATE-ROW-3`:** record-commit mode on the composite editor;
  Excel `update_row` (+ Sheets `update_row` sheet-picker alignment) — its own plan
  addendum since the editor grows a third commit shape.
- **S4 — `SPREADSHEET-TEST-ROW-4` (only if approved):** real per-node test-row write
  per §14 contract — route + service + disclosure/confirm UI + idempotency + tests.
- **S5 (optional later):** find-and-update flow, batch/multi-row product decision,
  other spreadsheet-like providers.

## 20. Risks, blockers, rollback

- **Concurrent sessions on `v2-main`:** this audit found a parallel session actively
  committing (responsive arc). S1 touches high-traffic builder files
  (`ConfigModalShell`, `SchemaForm` vicinity) — implementation should re-check for
  collisions at start and keep the shell delta minimal.
- **Schema addition is one-way in practice:** once nodes save `sheetName`, a UI
  rollback must keep the schema accepting it. Mitigation: rollback = unregister
  adapter + optionally revert meta, never revert the schema line.
- **Positional alignment vs non-A tables (Sheets):** inherited handler posture;
  mitigated by Advanced range + documented caveat + stale-schema surfacing. Not a
  regression (today is strictly worse).
- **`google-sheets:sheets` values are tab titles:** a renamed tab orphans
  `sheetName` (and the derived range). Same failure mode exists today inside raw
  `range` strings; the guided UI at least surfaces it as a picker-miss with recovery.
  Migrating to numeric sheetIds would be a real contract change — explicitly not
  proposed now, noted for the future.
- **File-size pressure:** `ConfigModalShell.tsx` (635) and `ComboboxField.tsx` (634)
  are already over cap; S1 must not deepen them (delegation + planned extraction).
- **Design/mock divergences deliberately not shipped:** pre-checked
  `valueInputOption` (Q11), fabricated neighbor-row preview data, dead test-row
  button, nested-button clear affordance.
- **No blockers found**: DesignSync auth worked this session (the predecessor slice's
  blocked import is resolved); all needed resolvers/infra exist.

## 21. Migration posture

**Zero database migration. Zero workflow-schema migration. No flags.** The only
contract delta in the whole arc is one additive optional Zod key
(`sheetName`) on `google-sheets:append_row` config — old configs validate, run, and
open unchanged. No `db:push`, nothing applied in this audit.

## 22. Recommended first implementation slice

**S1 — Google Sheets Add Row guided config** (§19), because: it is the weakest
current experience (raw A1 + blind positional chips), it is the surface the design
was authored for, it unblocks the recorded deferral with a small additive schema
change, and it forces the shared shell/adapter/suggestions/preview components into
existence in provider-agnostic form — which S2 then proves cheap by adopting them for
Excel with zero data changes.

## 23. Decisions requiring Marcus's approval

1. **D1 — Sheets `sheetName` (the deferral reversal):** add optional `sheetName` to
   `AppendRowConfigSchema`, sheet picker in the UI, `range` derived + demoted to
   Advanced. (Reverses pinned tests deliberately; keeps every legacy config valid.)
2. **D2 — Q11 presentation:** `valueInputOption` renders unselected with a
   "recommended" badge (mock pre-checks it — we don't). Confirm this is the intended
   product behavior.
3. **D3 — Suggestion policy:** exact-normalized-name match only (case/whitespace/
   punctuation-insensitive), no alias table, no fuzzy matching, no suggestion when
   ambiguous, suggestions require explicit accept (per-column or "Accept all") and
   are visually distinct until accepted. Aliases/fuzziness only as a later, evidenced
   slice.
4. **D4 — Test-row deferral:** S1/S2 ship without "Add a test row"; the real write
   is its own slice (S4) with the §14 safety contract, or is dropped.
5. **D5 — Slice order:** S1 Sheets first, S2 Excel adoption, S3 update-row, S4
   test-row.
6. **D6 — Preview scope:** preview renders only the row-to-be-written (no live fetch
   of the sheet's neighbor rows in S1). A later slice could add a real "last row of
   your sheet" fetch through a read resolver if wanted.
