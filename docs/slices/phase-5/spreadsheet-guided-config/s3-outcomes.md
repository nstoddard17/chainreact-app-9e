# EXCEL-UPDATE-ROW-GUIDED-3 — Outcome

**Status:** Implemented locally. Not pushed, not deployed, no database contact.

**Target:** `microsoft-excel:update_row`

**Plan:** [s3-update-row-plan.md](./s3-update-row-plan.md) (`5496349ff`)
**Predecessors:** [plan.md](./plan.md) · [S1 outcomes](./s1-outcomes.md) ·
[S2 outcomes](./s2-outcomes.md) ·
[closeout](./spreadsheet-config-redesign-closeout.md)

**Commits:** `ca3f9e992` · `405e46ef6` · `5daef1717` · this document.

---

## 1. What changed for users

Before this slice, configuring Update Row meant typing column headings by
hand — character for character, capitals included — with no picker. A typo
was discovered when the workflow failed on a live spreadsheet. There was
also no way to say *empty this cell* as distinct from *leave this cell
alone*, and two of the action's runtime behaviours were quietly wrong.

Now the node asks three questions in order:

1. **Pick the row** — workbook, worksheet, row number.
2. **Choose what to update** — every detected column, each with three
   explicit choices.
3. **Confirm how it's saved** — a factual account of the read, the merge
   and the write, including what it cannot promise.

Nobody has to know how the handler addresses a column, and nobody can
configure a column that does not exist.

---

## 2. Three-state semantics

The runtime treats three outcomes differently, so the UI does too.

| Choice | Saved config | What the run does |
| --- | --- | --- |
| Leave unchanged | key **absent** | the existing cell is preserved |
| Set to blank | key present, `""` | the cell is cleared |
| Set to a value | key present, the value | the cell is written |

The omission is the mechanism, not an absence of one: it is what tells the
handler to leave that cell alone.

**A half-finished choice is never resolved for the user.** "Set to a value"
with nothing typed has no representation in the saved record, deliberately
— writing `""` would be a silent downgrade to "set to blank" that erases a
cell because somebody stopped mid-thought, and inventing a fourth
representation would author a shape the runtime schema does not define. So
the intent is held in transient component state: the config keeps meaning
*leave this column alone* (the non-destructive reading), the value input
stays on screen, and an inline `role="alert"` names the column and offers
both real choices. Closing the panel without answering changes nothing.

**Verified deviation from the brief.** The brief asked for readiness to
block this state. The node-level readiness banner derives entirely from the
saved config, and this state is by design absent from it, so the block is
delivered at the point of the decision (inline, announced, naming the
column) rather than in the banner. Making the banner see it would require
persisting a state that has no runtime meaning. Recorded here rather than
quietly dropped.

**The builder never authors `null`.** `""` is its one clearing
representation. A legacy `null` — which an API or AI author may
legitimately have written, and which the handler writes through to clear
the cell — is displayed as "Set to blank" and round-tripped untouched.

> **Correction (EXCEL-UPDATE-ROW-CONCURRENCY-4, 2026-08-03).** The claim
> above that a `null` "writes through to clear the cell" is **wrong**, and
> the "Set to blank" label that followed from it was wrong with it. The S4
> audit checked it against Microsoft's documentation, which states the
> opposite: "No update takes place to the intended target (cell) when
> `null` input is sent"
> ([Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel)).
> A saved `null` has therefore never cleared anything — it is a *skip*.
>
> S4 corrects the label to "Leave unchanged" and explains the change in the
> editor. The runtime behavior is identical before and after; only the claim
> was wrong. The key is still preserved and still round-tripped untouched,
> so nothing about a saved node changes. See
> [s4-excel-concurrency-outcomes.md](./s4-excel-concurrency-outcomes.md) §8.
>
> The paragraph above is left as written rather than edited away, so the
> reasoning that produced the error stays readable next to the correction.

---

## 3. Compatibility

No migration. No schema-shape change. `values` is and stays
`Record<string, unknown>`.

- **Opening rewrites nothing and does not dirty the draft.** Pinned by an
  integration test on a saved config carrying both a `null` and a stale
  key.
- **An untouched cell is re-emitted verbatim.** `UpdateCell.saved` keeps
  the exact hydrated value, so editing one column cannot silently rewrite
  the others through the editor's string round-trip: a saved `26` stays
  `26`, a `null` stays `null`.
- **Key order carries no meaning** — the handler resolves each key
  independently, and hydration is by name, so a resolver returning columns
  in a different order changes nothing.
- **A stale key is preserved and shown**, never deleted. Removing one is an
  explicit user action.
- **Rollback:** delete the adapter registration in
  `guidedSpreadsheetAdapters.ts`. The node reverts to the generic form with
  no data change. `valueShape` is additive and inert when unset.

**The one saved configuration that stops being accepted** is `rowNumber:
1`. It could only ever have overwritten the worksheet's headings. See §6.

---

## 4. Row-number behaviour

The field is labelled "Row number" and says: it is the number as it appears
in Excel; row 1 holds the column headings and cannot be updated; the row
has to exist already. It does **not** claim the builder reads the row — no
resolver fetches an arbitrary worksheet row, and implying otherwise would
make the step look like it had checked something it never looked at.

A `{{...}}` variable is supported and is the intended way to wire Find Row's
output. A generic check (any number field, any provider) covers the sharp
edge: the config resolver preserves the type of a single-reference
template, so a variable from an output declared `string` arrives as `"5"`
and `z.number()` rejects it mid-run.

| Wired value | Outcome |
| --- | --- |
| Literal integer ≥ 2 | accepted |
| Output declared `number` | accepted |
| Output declared `string` / `boolean` / `array` / `object` / `fileRef` | **blocked**, naming the step |
| A variable concatenated with text | **blocked** — always produces text |
| No declared type, untested | **warning** only |
| No declared type, last test produced a number | accepted |
| No declared type, last test produced text | **blocked** |
| Reference to a deleted step | reported as a broken reference |

Missing metadata warns rather than blocks: refusing a configuration for
want of a declaration punishes the user for a gap that is ours. Runtime
validation stays authoritative. This is not a general cross-field
type-analysis framework — one question, one field type, no action key.

---

## 5. Header alignment and duplicate headings

**Raw value, trimmed label.** The `microsoft-excel:worksheet_columns`
resolver's option **value** is now the raw heading exactly as Excel holds
it; the **label** is the trimmed text. They used to be the same trimmed
string, which was a silent trap: a heading typed as `"Name "` was offered as
`"Name"`, and picking it produced a key the handler threw on at run time —
the exact failure a column picker exists to remove. `SpreadsheetColumn`
gained the same split (`name` = identity, `label` = display). Where a
heading carries stray spacing, the editor says so.

**Duplicates are surfaced, never resolved.** The resolver no longer keeps
only the first occurrence — that hid one of the customer's real columns and
disagreed with the handler, whose header map last-wins, so the picker's
column letter could point at a different column than the one written. Every
header column is now emitted and marked `duplicate heading`.

A record is keyed by name, so a duplicated heading cannot be targeted
uniquely. The editor therefore:

- shows both columns (hiding one would be its own lie);
- offers neither as a selectable update target;
- explains that the headings must be made different in Excel;
- blocks nothing else — an unambiguous column beside a duplicate stays
  fully usable.

Headings that differ only by whitespace (`"Name"` and `"Name "`) get the
same treatment: each is individually targetable, but a user cannot tell
them apart on screen, so choosing one would be a coin flip they do not know
they are making.

---

## 6. Header-row protection

Row 1 of the used range is what every column name is resolved against.
Updating it renames the user's columns and breaks every workflow pointed at
that sheet.

- `UpdateRowConfigSchema.rowNumber` minimum moves **1 → 2**, with an
  actionable message. This rejects during config parsing, before any Graph
  call is made at all.
- The metadata declares `numeric: { min: 2, integer: true }`.
- The handler repeats the check against the used range's **real** first row,
  which need not be row 1. This is the guard that covers a used range
  starting further down, and it is exercised by a test that reaches it.

Tests assert no PATCH — and for the schema path, not even the used-range
read — occurs. `0`, `-1` and `2.5` are rejected through the same path.

---

## 7. Out-of-range protection

The handler's own comment claimed it threw for a row beyond the used range.
**It did not.** `existingRow` fell back to `[]`, every unconfigured column
became `null`, and the PATCH wrote that — so "update row 500" on a four-row
sheet silently **created** a null-filled row 500. A test pinned that
behaviour.

Update Row is not Add Row. The handler now verifies the target row exists
inside the range it just read and, when it does not, fails with an error
naming the last row that does exist and stating that it never creates one.
No PATCH is issued. The old test is replaced by one asserting exactly that.

**Row indexing** now derives the offset from the used range's absolute
address rather than assuming `rowNumber - 1`. For a worksheet starting at
row 1 the arithmetic is identical; for one starting lower, the old
assumption read a *different* row's values into the merge and wrote them to
the target.

**Known limitation, unchanged and deliberately out of scope.** The merged
row is written from column A, while the header indices come from the used
range, which may start at a later column. A worksheet whose content starts
at column B is therefore still written one or more columns to the left.
Fixing it changes where live workflows write, so it needs its own slice and
its own migration question rather than being half-fixed here.

---

## 8. Concurrency disclosure

Verified line by line against `updateRow.ts`: two Graph round-trips — read
the used range, then PATCH the full row — and `worksheetRangePatch` sends
**no `If-Match` / ETag**. The write is unconditional, so a lost update is
genuinely possible, not theoretical.

Step 3 says so, in plain language: ChainReact reads the row first, applies
the chosen changes, writes the whole row back, and columns left unchanged
are written back exactly as they were found — and if somebody edits that
same row in Excel in the moment between the read and the write, their
change can be overwritten.

It claims no atomicity, isolation, conflict detection or guaranteed
preservation of simultaneous edits. A test asserts the words *atomic*,
*transaction*, *isolat*, *conflict*, *lock*, *safely preserv* and
*guarantee* never appear in that copy. No checkbox, no acknowledgement, no
new config field — a limitation is not a decision the user gets to make.

Conditional writes (ETag or a Graph workbook session) remain a separate
technical slice.

---

## 9. Responsive fixture and certification

S1 and S2 both recorded the same honest limitation: the guided panel had no
`*Screens.harness.test.tsx` emitter, so `npm run verify:responsive` had
never measured it. Update Row is what made that untenable — twenty columns
become twenty three-radio groups with revealed inputs inside a surface that
is an **overlay sheet below 1280px**, 331px wide at 360px.

`tests/tools/builderConfigScreens.harness.test.tsx` renders the real
`GuidedConfigLayout`, step sections, `SchemaForm` and every field renderer
inside a host mirroring `BuilderRightDrawer`'s two presentations exactly.
Only `fetchOptionsSource` and the upstream-variables hook are stubbed —
both already external boundaries. Eleven states: empty step 1, a
four-column mapping with a real preview, a twenty-column worksheet with
sentence-length names, the write-behaviour choice with its destructive
warning, the nothing-to-decide variant, a resolver failure, a headerless
sheet, and four Update Row states covering step 1 with a row number, twenty
columns in all three states with a revealed input plus a stale key plus the
preview, duplicate headings alongside an unfinished choice, and step 3.

`GuidedConfigLayout` declares `data-no-pan-below="1600"`. Configuration is a
form, and a form is on the rule's panning-is-disallowed list. 1600 rather
than a viewport breakpoint because the panel lives inside the canvas, and
declared explicitly because the drawer hosting it scrolls — an unannotated
region inside a scroller is exempt from the containment check.

### Defects the fixture found, all real and all shipped

The first sweep failed with 18 (state × defect) groups:

- the combobox trigger had `flex-1` with no `min-w-0`, so a long workbook
  name refused to shrink and pushed the variable-picker button clean out of
  its row, at every width from 360 to 1600;
- the honest preview's column name was `shrink-0`, so a sentence-length
  heading burst out of the preview card;
- the guided step body had no `min-w-0`, and the section above it carries
  `overflow-hidden` for its rounded corners — so the burst was **clipped**
  rather than shown, which is how a broken panel looks merely "cut off";
- (after the Update Row states landed) the stale-key Remove button carried a
  sentence-length heading and was `shrink-0`, bursting out of its row at
  every swept width. Its label is now short, with the column in the
  accessible name.

All fixed at the source. One measurement correction:
`[data-testid^="guided-step-"]` also matched each header's collapsed
**summary**, a `truncate` span whose `scrollWidth > clientWidth` is
precisely what truncation *means*. That reported 344 false failures on a
panel rendering correctly; the three sections and headers are now named
individually, and the summary stays under assertion through the
escapes-its-parent walk.

### Non-vacuity proof

Both assertion classes, proven separately, both mutations reverted:

| Mutation | Result |
| --- | --- |
| Renamed step 3's `stepId` (a promised control stops existing) | **7 of 7** fixture states failed the behaviour guard |
| Reverted the combobox `min-w-0` (a required control forced outside its row) | **6 of 7** states failed geometry at **all 158 swept widths, 360–1600px** |

The geometry proof needed a second attempt: the first mutation (removing
`min-w-0` from `SpreadsheetCellInput`'s row) did **not** fail, which
revealed that those particular declarations are defensive rather than
load-bearing — `Input` already carries `w-full`. That is recorded rather
than glossed over; the combobox declaration is the load-bearing one.

### Final result

```
verify:responsive → CERTIFIED
  app shell  PASS   112 fixture states, 158 widths (360→1600 step 8)
  auth       PASS
  marketing  PASS
```

---

## 10. Accessibility

- Each column is a real `<fieldset>` / `<legend>` with three real radios, so
  arrow keys move within a column and Tab moves between columns.
- Every radio's accessible name carries the **column** as well as the choice
  ("Notes — Set to blank"). Without it, twenty columns would present twenty
  identical "Set to blank" controls and a screen-reader user could not tell
  which cell they were about to erase. The visible label text is contained
  in the accessible name (WCAG 2.5.3).
- Every state is stated in **words**, with its consequence spelled out
  ("Keep whatever is already in this cell", "Empty this cell"). Nothing
  distinguishes unchanged from blank by colour or position.
- The legend wraps rather than truncating — the column name is the only
  thing identifying which cell the control writes to.
- The unfinished-choice alert is `role="alert"`; the number-field notices
  use `aria-live="polite"`.
- No interactive control is nested inside another (asserted).

---

## 11. Tests actually run

Every command below was run and its result is reported as it occurred.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | 0 errors, 34 warnings (all pre-existing, none in S3 files) |
| `npm run lint:structure` | OK — every leaf folder ≤ 50 files |
| `npm run lint:migrations` | OK |
| `npm run verify:responsive` | CERTIFIED — 3/3 passes, 112 fixture states |
| `npm test -- tests/unit/features/workflow-builder/ tests/integration/features/workflow-builder/ tests/unit/integrations/microsoft-excel/ tests/unit/integrations/google-sheets/ tests/structure/ tests/unit/contracts` | **487 suites / 5,266 tests passed** |

Per-area totals from the same run: the three-state model 31 tests; the
rendered update editor 30; the update preview model 9; `valueShape` 8; the
guided step model (record) 12; number-field compatibility 17; the Excel
Update Row builder integration 19; Excel unit suites 40 suites / 346 tests.

The full repository suite was **not** run — it is not the owner-approved
default, and no part of this slice needed it.

A pre-change baseline was captured before any edit: `npx tsc --noEmit` exit
0 and `lint:structure` OK, so nothing above is inherited breakage.

---

## 12. Verified deviations from the plan

1. **Row 1 blocks rather than warns.** The plan (§10, §24.4) recommended an
   inline warning and no schema change. The task brief overrode it, and the
   override is right: the schema minimum is now 2 and the handler guards it
   too.
2. **Out-of-range rows fail closed.** The plan (§19) put runtime handler
   changes out of scope. The brief brought them in, which is what turned a
   silently-creating Add Row into an honest error.
3. **The row-number type check shipped.** The plan (§24.7) offered it as
   optional.
4. **`OptionItem` has no metadata field** (`{value, label, description?}`),
   so duplicate and whitespace signalling is carried by an honest
   `description` plus structural detection in the editor, not a new contract
   field as §14 assumed.
5. **The unfinished "set to a value" state blocks inline, not in the
   readiness banner.** See §2.
6. **The destination summary shows the stored workbook id**, not
   "Invoices.xlsx" — the summary model is pure and has no access to the
   resolver's option labels. Pre-existing, shared with the Sheets and Excel
   append steps, unchanged here, and worth its own fix later.

---

## 13. Rollback

Remove the `microsoft-excel:update_row` entry from
`guidedSpreadsheetAdapters.ts`. The node returns to the generic form with no
data change and no migration.

Reverting further, in order: `5daef1717` restores the previous metadata,
resolver and handler behaviour (including the out-of-range write and the
row-1 minimum — both undesirable); `405e46ef6` removes the shared record
mode, which nothing else uses; `ca3f9e992` removes the responsive fixture
and its layout fixes. Each is independently revertable.

---

## 14. Remaining work

**Google Sheets `update_row`** is deliberately untouched. Its `range` is
still free-text with no tab field — the same blocker `append_row` had to
solve in S1 — and its `values` is a positional array, the opposite
representation to Excel's record. Guiding it means solving the range
problem first, then deciding whether a positional update deserves the same
three-state model or a different one. It is a slice, not a follow-up.

**Conditional Excel writes.** The lost-update window described in §8 closes
only with an `If-Match` ETag or a Graph workbook session. That brings its
own runtime-behaviour and error-handling decisions (what does the run do
when the row changed underneath it — fail, retry, or re-merge?), which is
why it is a separate slice rather than a patch here.

**Column-anchored writes.** The pre-existing limitation in §7: a worksheet
whose content starts at column B is written one or more columns to the
left. It changes where live workflows write, so it needs its own slice.

**Summary labels.** The collapsed step-1 summary shows stored ids rather
than resolved option labels, across all four guided actions.
