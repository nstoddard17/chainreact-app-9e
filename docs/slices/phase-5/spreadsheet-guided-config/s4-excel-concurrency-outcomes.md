# EXCEL-UPDATE-ROW-CONCURRENCY-4 — Outcome

**Status:** Implemented locally. Not pushed, not deployed, no database contact,
no Microsoft Graph contact. **Not release-certified** — the development-only
workbook certification in §11 is a release gate and has not been run.

**Target:** `microsoft-excel:update_row`

**Plan:** [s4-excel-concurrency-plan.md](./s4-excel-concurrency-plan.md)
**Predecessors:** [S3 outcomes](./s3-outcomes.md) ·
[S3 plan](./s3-update-row-plan.md) · [S2 outcomes](./s2-outcomes.md) ·
[S1 outcomes](./s1-outcomes.md)

---

## 1. The risk this closes

Update Row used to read the row, merge the chosen changes over the values it
had just read, and write the **whole row** back. The row it wrote was a
faithful copy of a snapshot that could already be stale, so if a colleague
edited any cell of that row in the gap between the read and the write,
ChainReact put the old value back — silently, with no error and nothing in run
history to suggest it had happened.

S3 could not fix it and said so honestly in step 3. That disclosure can now be
retired for every column the user did not select.

---

## 2. The documented behavior this relies on

**Verified against Microsoft Learn**, cited twice because the whole slice rests
on it.

[Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel),
§"Work with nulls":

> `null` input inside a two-dimensional array (for values, number-format,
> formula) is ignored in the Range and Table resources. **No update takes place
> to the intended target (cell)** when `null` input is sent.

[Update range](https://learn.microsoft.com/en-us/graph/api/range-update), in the
annotation on its worked example:

> The `null` input is to instruct the API to **ignore the cell** for that
> particular input.

And the complementary rule, same section as the first:

> Blank values in update requests are treated as an instruction to **clear or
> reset** the respective property […] For `values`, the range value is cleared
> out.

The audit also confirmed what is *not* available: no ETag on the Range resource
or its GET response, no `If-Match` in the Update range request-header table
(which lists only Authorization, Content-Type and Workbook-Session-Id), sessions
documented purely as persistence and performance, and JSON batching explicitly
non-atomic. Full citations in [the plan](./s4-excel-concurrency-plan.md) §5.

---

## 3. The new payload

The high-level shape is unchanged — **one GET, one PATCH** — and the PATCH still
addresses the full row span so array indices line up with header indices. Only
the array contents changed:

| User intent | Saved config | Sent in the PATCH | What Excel does |
| --- | --- | --- | --- |
| Leave unchanged | key absent | `null` | cell is not written |
| Set to blank | key = `""` | `""` | cell is cleared |
| Set to a value | key = value | the value | cell is written |

ChainReact no longer copies a single value out of the GET response into the
write. A concurrent edit to a column the user did not select **cannot** be
overwritten, because that cell is not in the request at all. The read is still
required — for the header map, the heading-row guard and the row-existence
guard — but it no longer feeds the payload, so its staleness stopped mattering.

Non-contiguous selections need no extra request: the sparse array addresses them
in the same single PATCH. No per-cell requests, no batching, no second
comparison read, no re-merge, no workbook session, no conditional header.

---

## 4. Formula preservation

A second, unrelated data-loss bug closed as a side effect.

`worksheetUsedRange` is called with `valuesOnly: true`, which returns
**calculated** values. The old merge therefore read a formula cell back as its
result and rewrote it as a literal — **destroying a formula in any column the
user had not selected**. `=B2*C2` came back as `1250` and was written as `1250`.

Under the sparse write that cell is sent as `null` and left alone. Pinned by a
regression test that asserts the calculated value never appears in the PATCH
body.

---

## 5. Conflict classification

`surfaceGraphError` read only the **top-level** Graph error code, which is the
HTTP-shaped one. Microsoft puts the code that says what actually happened one
level down and instructs clients to read that first
([Error handling for Excel APIs](https://learn.microsoft.com/en-us/graph/workbook-error-handling)).
A genuine workbook conflict therefore arrived as "This step failed for an
unexpected reason".

Now: `parseGraphErrorDetail` walks the `innerError` chain (Microsoft documents
that it "might recursively contain more innerError objects with additional, more
specific error codes"), keeps the deepest code, and captures the `request-id` /
`client-request-id` correlation handles.

`WorkbookConflictError` is thrown for the five documented conflict codes —
`accessConflict`, `conflictUncategorized`, `invalidSessionAccessConflict`,
`insertDeleteConflict`, `filteredRangeConflict` — compared case-insensitively,
as that page specifies. Deliberately an explicit list rather than a substring
match on "conflict": the classification means *do not retry*, and a code
Microsoft adds later must not silently inherit that instruction.

A 409 is **not** automatically this failure. If the body names a different cause
(`itemAlreadyExists`, say) it keeps its generic handling — telling a user to
wait for an edit that never happened is its own kind of wrong. Only a 409/412
with no stated cause falls back to the status.

Classified on the **read** as well as the write: Microsoft's own illustration of
`accessConflict` is "another client has locked the workbook for edit", and a
lock like that stops the first request an action makes.

---

## 6. No automatic retry

`PROVIDER_CONFLICT` joins `RunFailureCode`, mapped from `WorkbookConflictError`
in `classifyHandlerError`.

It is deliberately **not** `TRANSIENT_PROVIDER_ERROR`, whose whole meaning is
"retrying usually succeeds". Microsoft's instruction for every conflict code is
that the client "is not expected to resend the failed request until the conflict
is resolved", and a resend loop against a locked workbook is how a client earns
throttling. It is also not `INTEGRATION_REAUTH_REQUIRED` (the connection is
fine) and not `WORKFLOW_NOT_READY` (the configuration is fine).

The engine performs no automatic handler retry today, so nothing needed
disabling — but the classification makes the intent explicit and testable.

**Run-history copy:**

> **The file was in use** — A connected app wouldn't save this change because
> the document was being used somewhere else — usually because somebody had it
> open for editing. Nothing was changed.
>
> *Close the file, or wait a moment, then run the workflow again.*

It states that nothing was changed (true — the refusal happens before the change
lands), names a fix in terms of the world, promises no automatic retry, and
contains no protocol vocabulary. All four are asserted.

**Logging:** the typed error carries HTTP status, the top-level and nested Graph
codes, and both correlation ids. It carries no workbook content — pinned by a
test that feeds it a provider message naming a file and an email and asserts
neither reaches the thrown message.

---

## 7. Remaining limitation

Two writers changing **the same column** still resolve last-writer-wins, and
ChainReact cannot detect it. Graph exposes no conditional token for this
endpoint, so there is nothing to condition the write on. This is irreducible
with the current API surface, and step 3 says so rather than implying otherwise.

Also unchanged and still out of scope: the column-anchor limitation from
[S3](./s3-outcomes.md) §7 — a worksheet whose content starts at column B is
written one or more columns to the left.

---

## 8. Legacy `null` — a correction to S3

**S3 stated, and the editor implemented, that a saved explicit `null` cleared
the cell. That was wrong.** The S4 audit checked it against Microsoft's
documentation and found the opposite: a `null` in a values array is an
instruction to skip the cell (§2). So a node saved with `null` has never cleared
anything — and the editor was telling its author it would.

What changed, and what deliberately did not:

| | Before S4 | After S4 |
| --- | --- | --- |
| What Excel actually did | left the cell alone | left the cell alone (unchanged) |
| What the UI said | "Set to blank" | "Leave unchanged", with a note |
| The saved key | preserved | preserved |
| Opening the node | writes nothing | writes nothing |
| Draft dirty on open | no | no |

The **runtime behavior is identical before and after** — only the label was
wrong. The key is preserved rather than normalized: deleting a key the user was
never asked about would edit their saved node just for opening it. Converting it
is a deliberate act — choosing "Set to blank" writes `""`, choosing "Set to a
value" writes a value.

The correction is explained in the UI rather than silently applied:

> This column was set up before we corrected how "empty" was saved. It has
> always left the cell as it is, and it still does. Choose one of the options
> above if you want it to change.

The builder still never **authors** `null`; `""` remains its one clearing
representation. Tests distinguish all four cases: omitted key, explicit legacy
`null`, empty string, and a fixed or variable value.

[S3 outcomes](./s3-outcomes.md) has been annotated in place rather than
rewritten, so the earlier reasoning stays readable alongside the correction.

---

## 9. Compatibility

No migration. No schema change. No database contact.

- **Config shape unchanged** — `values` is and stays `Record<string, unknown>`.
- **Output contract unchanged** — `{ workbookId, worksheetName, rowNumber,
  address, columnsUpdated, updatedColumns }`. No `columnsSkipped` was added.
- **`UpdateRowConfigSchema` untouched** — every saved configuration keeps
  parsing and running.
- **All S3 guards intact** — row number ≥ 2, heading-row protection against the
  used range's real first row, out-of-range rejection, raw-header alignment,
  duplicate-header refusal, unknown-column rejection, no PATCH on any validation
  failure.
- **`PROVIDER_CONFLICT` needs no migration** — `RunFailureCode` is a TypeScript
  union, no migration references any failure code, and `humanizeActionError`
  already has a default arm for unknown or legacy persisted values.
- **Billing unchanged** — no change to node charging, task charging, the
  run-level flat task, retry billing or the usage ledger. Failed steps already
  record no `node_task_charged` event (`chargeOn: "success"`; only succeeded
  nodes count). Whether a conflict-only run should be exempt from the run-level
  flat task remains a separate billing-policy decision, out of scope here.

**The one observable behavior change** for an existing workflow: a cell
ChainReact used to rewrite with an identical value is no longer written. The
effects are that a concurrent edit survives, a formula survives, and cell-level
change history no longer records a no-op touch. All three are improvements.

---

## 10. Step 3 copy

Before:

> ChainReact reads the row first, applies the changes you chose, and writes the
> whole row back to Excel. Columns you left unchanged are written back exactly
> as they were found […] if somebody edits that same row in Excel during the
> moment between the read and the write, their change can be overwritten.

After:

> ChainReact changes only the columns you chose. Every other cell in that row is
> left out of the update entirely, so changes somebody else makes to those cells
> are kept. If two people change the same column at the same moment, the last
> change saved wins. There is nothing else to decide for this step.

The second sentence is deliberately scoped. It would be easy — and wrong — to
write "anything somebody else changes is safe": an edit to a column this step
*is* setting can still be overwritten. The claim covers only the cells actually
left out, and the same-column case is stated rather than buried.

No checkbox, no acknowledgement, no conflict setting, no new saved field. Tests
assert the stale full-row language is gone and that *atomic*, *transaction*,
*isolat*, *conflict*, *lock* and *guarantee* still never appear.

---

## 11. Development certification — a release gate

**Not run.** This must not ship to production until it passes. The whole slice
rests on documented behavior that has not been observed in this tenant, and the
failure mode if the documentation were wrong is silent: writes that quietly do
nothing.

**Environment.** An explicitly authorized local commit SHA, pushed only to
`refs/heads/v2-dev` through the existing exact-SHA hosted-development workflow,
tested at `https://dev.chainreact.app`, using development credentials and a
disposable synthetic Microsoft Excel workbook. No production Supabase, no
production Microsoft account.

**Test 1 — an unselected concurrent edit survives.**
Seed a row with one column ChainReact will update and one it will not. Edit the
unselected column as a human in Excel Online. Run Update Row against the
selected column. Verify: the selected column changed, the human's edit survived,
no other cell changed. *This is the assertion the slice exists for.*

**Test 2 — a formula survives.**
Put a formula in an unselected column. Run Update Row against another column.
Verify: the selected column changed, and the formula is still a formula — not
replaced by its calculated value.

**Test 3 — blank semantics.**
Verify `""` clears a selected cell, and that an unselected cell (sent as `null`)
is unchanged. This also settles §8 empirically.

**Test 4 — conflict classification.**
Using a safe, reproducible development-only conflict (hold the workbook open for
edit): verify the nested Graph code, the typed `PROVIDER_CONFLICT`, that no
resend occurred, the user-facing copy, and that the request id was captured.
**If a deterministic conflict cannot be produced safely, record that limitation
rather than fabricating a pass.**

**Artifact** records: commit SHA, environment, a workbook fixture identifier
carrying no customer data, test names, pass/fail, and the Graph status and
normalized error code where relevant. It records **no** cell contents, OAuth
tokens, access URLs or customer identifiers.

---

## 12. Tests actually run

Every command below was run and its result is reported as it occurred.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors, 34 warnings (all pre-existing, none in S4 files) |
| `npm run lint:structure` | OK |
| `npm run lint:migrations` | OK |
| `npm run verify:responsive` | CERTIFIED |
| Focused suites (see the Owner Report for exact totals) | all green |

Per-area: shared Graph error helpers 34 · `worksheetRangePatch` 17 (a wrapper
that had no test at all before this slice) · `worksheetUsedRange` extended ·
`classifyHandlerError` 8 · humanizer `PROVIDER_CONFLICT` 6 · Update Row handler
31 · three-state model 33 · rendered update editor 38 · guided adapter registry
36 · Excel Update Row builder integration 19.

The full repository suite was **not** run — it is not the owner-approved
default, and nothing in this slice needed it. No Microsoft Graph endpoint was
contacted; every provider interaction is mocked at the wrapper boundary.

---

## 13. Rollback

- **Slice B** (`fix(excel): update only selected row columns`) — reverting
  restores the read-back-full-row merge along with its Step 3 copy and the S3
  legacy-`null` label. Nothing persisted differs; no data migration.
- **Slice A** (`fix(excel): classify workbook conflicts`) — additive. Reverting
  returns those failures to `HANDLER_FAILED`: worse reporting, no behavior
  change.

Neither slice writes to the database, changes a contract, or alters saved
workflow configuration, so rollback is `git revert` and nothing else. The guided
experience's own rollback lever is unchanged: removing the
`microsoft-excel:update_row` adapter registration restores the generic form.
