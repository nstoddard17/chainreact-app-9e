# SHEETS-GUIDED-CONFIG-1 — Outcomes

Implementation outcome for slice S1 of [the approved plan](./plan.md).
Google Sheets **Append Row** only; Excel adoption (S2) is not started.

- Commits (local, `v2-main`, **not pushed**):
  - `6db4454af` feat(sheets): add guided append-row destination fields
  - `fb0f1724e` feat(builder): add guided spreadsheet configuration shell
  - `9acc45a7c` feat(builder): finish guided Sheets mapping and preview
  - this document
- Owner approvals implemented: D1–D6 from plan §23.

---

## What shipped

### 1. The three guided steps

`google-sheets:append_row` now opens as an accordion of three questions
instead of a flat form:

| Step | Asks | Fields drawn |
|---|---|---|
| 1 · Pick the sheet | Which spreadsheet, which tab | `spreadsheetId`, `sheetName` |
| 2 · Say what goes in each column | One input per REAL sheet column | `values` (`spreadsheet-rows`) |
| 3 · Confirm how it's written | Two plain-language choices | `valueInputOption`, `insertDataOption` |

Removed from the normal path: **A1 notation** and **blind positional
cells**. The raw `range` is now an Advanced field (still required at
runtime — it is the only value the API receives).

Each step header carries a live summary ("Workflow activity log · Email
log", "2 of 3 columns filled in", "Like something you typed in"), so a
collapsed step hides nothing.

### 2. Destination and derived range

- `sheetName` is a real `google-sheets:sheets` picker, dependent on the
  spreadsheet — and it is what finally gives `google-sheets:columns` a
  `dependsOn` parent. That absence was the entire reason the predecessor
  slice deferred Sheets.
- Picking a tab **derives** `range` (`'Email log'!A:Z`, or `A:<lastCol>`
  once columns are known, with apostrophes doubled per Google's escape
  rule).
- A **hand-written** range (`'Data'!B2:F10`) is never overwritten by a
  tab change. It is kept, the user is told in place, and a "Use the whole
  tab instead" control makes the overwrite explicit.
- "Paste a link instead" accepts a Sheets URL or bare id. A `gid`
  fragment is deliberately **not** turned into a tab (gid is numeric; the
  picker keys on title — matching them would be a guess).

### 3. Suggestions (D3)

Exact normalized-name equality only — case, whitespace and punctuation
folded (`File link` ≡ `file_link`). No fuzzy distance, no alias table,
no AI. **Ambiguity produces nothing**: two upstream outputs matching one
column, or two destination columns matching one output, both yield no
suggestion. Already-filled columns are never touched; `sensitive`
outputs are never proposed for a spreadsheet cell. Every candidate is
listed with its source step before acceptance, per-column or
"Use all N".

### 4. Honest preview (D6)

Resolved only from latest-run data the builder already holds, through the
same helpers the variable picker uses. Provenance is always stated:

| State | Caption |
|---|---|
| all references resolved | "Using data from your last test" |
| some resolved | "Some values have not been tested yet" |
| none captured | "Run a test to preview real values" |
| no references at all | "The row as you have written it" |
| reference to a deleted step | "Some values point at a step that no longer exists" |

An untested reference renders **as the reference**. No sample values, no
neighbouring sheet rows, no predicted row number — the system cannot know
those before the write.

### 5. Readiness

A `google-sheets:append_row` checklist adapter mirroring the three steps.
A column left deliberately blank does **not** block; only "no values at
all" does, which is the one case the runtime schema rejects.
`valueInputOption` gets its own line because nothing answers it for the
user.

---

## Verified differences from the plan

1. **Drive recency ordering was already done.** Plan §10 listed
   "plumb `orderBy` … today it isn't ordered" as S1 work. In fact
   `listSpreadsheets.ts:110` already sends `orderBy=modifiedTime desc`
   and `listSpreadsheets.test.ts:48` already pins it. No change was made.
   The plan's premise was wrong; the behavior it wanted already ships.
   `modifiedByMeTime desc` (the task's expected value) was **not**
   adopted: it orders by *the user's own* last edit and leaves files they
   have never personally edited unordered — wrong for the shared
   team-sheet case this feature targets.
2. **Range derivation lives in Commit 2, not Commit 1.** It needs a UI
   hook point (reacting to a tab change), which the generic form does not
   provide. Commit 1 shipped the pure helper and the metadata; Commit 2
   wired it.
3. **`columnCount` is not threaded into the step summary** in every
   state. When columns are known the summary reads "2 of 3 columns filled
   in"; before that it reads "2 values set". Lifting the count out of the
   editor would have meant either a second columns fetch (the resolver
   hook has no cross-mount cache) or a new prop on the shared renderer
   contract. Neither was worth it for wording.
4. **No new Chromium fixture emitter** — see "Responsive" below.

---

## Compatibility

**No migration. No workflow-schema migration. No flags.** The only
contract change is one additive optional Zod key.

- `sheetName` is `.optional()` with **no default**, so every
  configuration saved before this slice still parses and runs untouched.
  Pinned by `appendRow.schema.test.ts`.
- The **saved row shape is unchanged**: `values` is still a positional
  `string[]`. Column names are how cells are *labelled*, not a new
  storage format.
- The handler is untouched and still sends `range` alone; a test asserts
  `sheetName` never reaches the API, so a guided-configured node and a
  legacy node take the identical execution path.
- **Opening a legacy node changes nothing** — not the stored config, not
  the dirty flag. When the saved range names a tab we say which one; when
  it is ambiguous (`A:Z`, `A1`) we say that instead of guessing, because
  a wrong guess would retarget a live workflow.
- Guided-authored config renders in the generic form and the React Agent
  field controls, because it is ordinary config.

### Rollback

Delete the `google-sheets:append_row` entry from
`guidedSpreadsheetAdapters.ts`. The node reverts to the generic form with
**no data change**. The metadata improvements (tab picker, column-aware
editor, Advanced range) survive independently and are themselves
revertable by restoring the meta. Do **not** revert the schema line once
nodes have saved a `sheetName` — an optional key that is already stored
must keep validating.

---

## User-safety decisions

| Decision | Behavior |
|---|---|
| Optional blank columns | Never block saving; stated as a fact in the preview and the mapping hint |
| Suggestions | Exact-match only, ambiguity → nothing, never auto-applied, never overwrite |
| Preview | Only real captured data; every other state named; nothing fabricated |
| Q11 | `valueInputOption` shows "Recommended" but is **not** preselected; readiness names it until answered |
| Destructive option | OVERWRITE warns in words, `aria-describedby`-linked, not colour-only |
| **Test row** | **Deferred (D4).** No button, no placeholder, no provider-write route, no new execution path. Safe Test and Live Test are untouched. |

---

## Accessibility & responsive

- Step headers are `<button aria-expanded aria-controls>` inside `<h3>`;
  bodies are `role="region"` labelled by their header. Enter and Space
  both toggle. Advancing moves focus to the next step's header.
- Completion is announced in words ("Done"), never by tick or tint alone.
- Write options are real radios in a labelled `radiogroup`; no
  interactive control is nested inside another.
- **The panel renders one element tree at every width** — no
  breakpoint-scoped visibility anywhere in `guided/`, pinned by
  `tests/structure/guided-spreadsheet-config-source.test.ts`. So "all
  three steps and the Advanced escape hatch are reachable at 360px" is
  true by construction. The panel's *presentation* (in-flow panel ≥1280,
  overlay sheet below) is already owned centrally by
  `builderLayoutPolicy`.

**Non-vacuity proof.** Hiding a step below `sm` (`hidden sm:block` on
`GuidedStepSection`) made the guard fail with exactly one finding —
`GuidedStepSection.tsx hides nothing at a breakpoint` (52 passed, 1
failed). The mutation was reverted and the guard returned to 53/53.

**Honest scope limit.** `npm run verify:responsive` **CERTIFIED** (3
passes, 101 fixture states, 16,654 measurements, 360→1600 at 8px) — but
that sweep does **not** cover the builder configuration panel. No
`*Screens.harness.test.tsx` emitter exists for it, and adding one needs a
page-frame decision the existing passes cannot answer (the panel renders
inside the builder canvas, not inside `AppPageContainer`). Per
responsive-layout-and-validation.md §D, geometry cannot see a missing
control anyway; the guard + rendered control-presence suite above is the
instrument that can. **A geometric sweep of the config panel is
outstanding work, not something this slice performed.**

---

## Test evidence (commands actually run)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Clean for this slice's files. **At final gate: 1 error in `tests/unit/pipeline/env-target-guards.test.ts`** — a file created by a concurrent session minutes earlier, untracked, not part of this slice |
| `npm run lint` | **0 errors**; no warning in any file this slice added or changed |
| `npm run lint:structure` | 1 violation: `docs/slices/phase-5` at 51 files — **pre-existing at `origin/v2-main`** (51 there too). This slice's docs live in a subfolder so the count was not deepened |
| `npm run lint:migrations` | PASS |
| `npm run verify:responsive` | **CERTIFIED** — app shell / auth / marketing all PASS (see scope limit above) |
| Focused: config-modal + guided + Sheets/Excel builder integration + structure + Sheets units + a1Range | **109 suites / 1560 tests passed** |

Known flake observed: `SchemaFieldsField.test.tsx` timed out once inside a
large parallel run and passed in isolation (13/13, 14.5s). It touches no
guided code.

---

## Remaining Excel follow-up (S2)

Not started. Scope, unchanged from plan §11/§19:

1. Register `microsoft-excel:add_row` in `guidedSpreadsheetAdapters.ts`
   (destination `["workbookId","worksheetName"]`, mapping `values`,
   **`writeBehaviorFields: []`** — Excel has no `valueInputOption` /
   `insertDataOption` analogue; step 3 renders the honest
   "nothing to decide" copy rather than inventing options).
2. Wire `microsoft-excel:add_table_row`'s `values` to the existing but
   unwired `microsoft-excel:table_columns` resolver, switching it to
   `spreadsheet-rows` (Graph table columns are authoritative — better
   than row-1 heuristics).
3. No `derivedRange` for either: Excel addresses a worksheet or table by
   name and has no range string to derive.
4. `microsoft-excel:update_row` stays deferred — it needs a
   record-commit mode on the composite editor (plan S3).

Excel already benefits from this slice without adoption: the honest
preview and the suggestion banner ship inside the shared
`spreadsheet-rows` editor, so `microsoft-excel:add_row` gained both.
