# EXCEL-UPDATE-ROW-CONCURRENCY-AUDIT-4 — Audit & Plan

**Status:** Plan only. No product code, tests, or migrations changed. Awaiting
Marcus's approval.

**Target:** `microsoft-excel:update_row`

**Predecessors:** [S3 plan](./s3-update-row-plan.md) ·
[S3 outcomes](./s3-outcomes.md) · [S2 outcomes](./s2-outcomes.md) ·
[S1 outcomes](./s1-outcomes.md) ·
[Excel parity audit](../../parity/parity-microsoft-excel.md)

Everything labelled **VERIFIED (repo)** was read from the working tree at the
SHA in §2. Everything labelled **VERIFIED (Microsoft)** is quoted from current
official Microsoft Learn documentation, cited inline. **INFERENCE** and
**RECOMMENDATION** are my engineering judgement and are marked as such. No
Microsoft Graph endpoint was contacted during this audit.

---

## 1. Plain-language problem

Update Row changes some columns of a row that already exists. To do that, it
reads the row, works out what the new row should look like, and writes the row
back.

Between the read and the write there is a gap of one network round trip. If a
colleague edits any cell of that same row inside that gap, ChainReact's write —
built from what the row looked like *before* their edit — puts the old value
back. Their change is gone, silently, with no error and nothing in the run
history to suggest anything happened.

S3 could not fix this, so it did the next best thing: it told the truth. Step 3
of the guided configuration currently says a simultaneous edit can be
overwritten. This audit is about whether that sentence can be retired.

---

## 2. Preflight state

**VERIFIED (repo).** Branch `v2-main`, HEAD `1a8b2dfc5`, working tree clean,
`origin/v2-main` and `origin/v2-dev` both at `1a8b2dfc5` (0 ahead / 0 behind).

The S3 arc (`ca3f9e992`, `405e46ef6`, `5daef1717`, `5d9a9da2c`) has been pushed
since the S3 Owner Report. Two commits landed after it:

- `c9671012b` — repinned `tests/unit/services/discovery/microsoft-excel-discovery.test.ts`,
  which still asserted `update_row.values` was a `keyvalue` field after S3
  changed the widget to `spreadsheet-rows`. Test-only; the persisted config
  shape was not changed, and the repin strengthened the assertion to
  `valueShape: "record"`.
- `1a8b2dfc5` — unrelated builder test-performance work.

Neither touches any file this audit is about.

---

## 3. Current read/merge/write sequence

**VERIFIED (repo)** — [`integrations/microsoft-excel/actions/updateRow.ts`](../../../../integrations/microsoft-excel/actions/updateRow.ts),
read line by line.

1. Parse config against `UpdateRowConfigSchema` (`.strict()`).
2. `worksheetUsedRange({ valuesOnly: true })` through `refreshAndRetry` — **one
   Graph GET**. This single read serves four purposes: the header row, the
   target row's existing values, the used range's start row, and the
   row-existence check.
3. Build `headerIndex` from row 1 of the used range; throw on any configured
   column not present (fail-loud, no PATCH).
4. Guard: `rowNumber <= headingRowNumber` → throw, no PATCH.
5. Guard: `rowIndex < 0 || rowIndex >= rows.length` → throw, no PATCH.
6. Merge — the line that matters for this audit:

   ```ts
   merged.push(i < existingRow.length ? (existingRow[i] ?? null) : null);
   ```

   Every untouched column is populated with **the value read in step 2**.
   Configured columns are then overlaid at their resolved indices.
7. `worksheetRangePatch` through `refreshAndRetry` — **one Graph PATCH** of
   `A{row}:{lastCol}{row}` with the full merged row.
8. Return `{ workbookId, worksheetName, rowNumber, address, columnsUpdated,
   updatedColumns }` — names only, no cell values.

**The lost update is step 6, not step 7.** The write is a faithful transmission
of a snapshot that may already be stale. Nothing about the PATCH is wrong; the
payload is what carries the staleness.

---

## 4. Verified current Graph wrapper behavior

**VERIFIED (repo).**

| Concern | Current state |
| --- | --- |
| Response headers | **Never read.** [`worksheetUsedRange.ts`](../../../../integrations/microsoft-excel/api/worksheetUsedRange.ts), [`worksheetRangeGet.ts`](../../../../integrations/microsoft-excel/api/worksheetRangeGet.ts) and [`worksheetRangePatch.ts`](../../../../integrations/microsoft-excel/api/worksheetRangePatch.ts) all return `await res.json()` and discard `res.headers` entirely. |
| Conditional request headers | **None sent.** The PATCH sends only `Authorization` and `Content-Type`. |
| ETag / version token | **Nothing anywhere.** A repo-wide grep for `If-Match` / `etag` across `integrations/` and `services/` returns no Excel hit. The only mention in the codebase is a comment in [`integrations/microsoft-outlook-calendar/actions/addAttendees.ts`](../../../../integrations/microsoft-outlook-calendar/actions/addAttendees.ts) noting the identical read-merge-write race and deferring "optimistic concurrency via Graph's `If-Match` ETags" as a follow-up. |
| Workbook sessions | **Not implemented.** No `workbook-session-id` header, no `createSession` / `closeSession` wrapper. The parity audit deferred it explicitly as a *latency* item (R-3), never as a concurrency control — see [`parity-microsoft-excel.md`](../../parity/parity-microsoft-excel.md). |
| Error normalization | [`_shared/microsoft/api/errors.ts`](../../../../integrations/_shared/microsoft/api/errors.ts): 401 → `Unauthorized401Error`, 404 → `NotFoundError`, everything else → a generic `Error` carrying `surfaceGraphError(text, status)`. **409 and 412 have no distinct handling and would arrive as generic errors.** |
| Graph error body parsing | `surfaceGraphError` reads only `error.message` then `error.code` — the **top level only**. Graph's second-level `innerError.code` (which is where the conflict codes live) is never parsed. |
| Retry | `refreshAndRetry` handles 401-refresh only. The execution engine performs **no** automatic handler retry — a grep of [`services/execution/engine.ts`](../../../../services/execution/engine.ts) finds no retry loop. |
| Request identifiers | Graph's `request-id` / `client-request-id` are never captured. |

---

## 5. Official Microsoft Graph capability findings

### 5.1 ETag / `If-Match` on workbook range writes — NOT AVAILABLE

**VERIFIED (Microsoft).** [Update range](https://learn.microsoft.com/en-us/graph/api/range-update)
documents exactly three request headers:

| Name | Description |
| --- | --- |
| Authorization | Bearer {token}. Required. |
| Content-Type | application/json. Required. |
| Workbook-Session-Id | Workbook session Id that determines if changes are persisted or not. Optional. |

There is no `If-Match`, no `If-Unmodified-Since`, and no other conditional
header. The documented success response is `200 OK` with the updated
[Range](https://learn.microsoft.com/en-us/graph/api/resources/range) object;
**no ETag or version token appears in the request or the response.**

The [Range resource](https://learn.microsoft.com/en-us/graph/api/resources/range)
has no `eTag` property, and the full range GET response shown in
[Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel)
returns `address`, `values`, `formulas`, `numberFormat`, `text`, `valueTypes`
and friends — **no version token of any kind**.

This is not an accident of documentation. **VERIFIED (Microsoft):**
[Update DriveItem](https://learn.microsoft.com/en-us/graph/api/driveitem-update)
*does* document the header, on the same service, in the same reference set:

> **if-match** — String. If this request header is included and the eTag (or
> cTag) provided doesn't match the current eTag on the folder, a
> `412 Precondition Failed` response is returned.

**INFERENCE.** Graph clearly knows how to offer optimistic concurrency and
documents it where it exists. Its absence from the workbook range surface is a
deliberate capability boundary, not an omission.

### 5.2 The driveItem eTag cannot protect a range write

**VERIFIED (Microsoft).** [driveItem](https://learn.microsoft.com/en-us/graph/api/resources/driveitem)
defines `eTag` ("eTag for the entire item (metadata + content)") and `cTag`
("An eTag for the content of the item"). Both exist for the workbook **file**.

**INFERENCE.** They are unusable here for two independent reasons:

1. **Wrong scope.** They cover the entire `.xlsx` file. Any edit anywhere in the
   workbook — a different worksheet, an unrelated row, a recalculated formula —
   changes the content tag. Conditioning a single-row write on the whole file
   would fail constantly on changes that cannot possibly conflict. Too broad to
   be useful.
2. **No endpoint accepts it.** Even with a tag in hand, the range PATCH has
   nowhere to put it (§5.1). Sending `If-Match` to an endpoint that does not
   document it is exactly the "generic HTTP clients can send the header"
   assumption the audit brief forbids relying on.

### 5.3 Workbook sessions — persistence and performance, NOT locking

**VERIFIED (Microsoft).** [Manage sessions and persistence in Excel](https://learn.microsoft.com/en-us/graph/excel-manage-sessions)
defines exactly three modes:

> - **Persistent session:** All changes made to the workbook are persisted
>   (saved) to the workbook. This is the most efficient and best-performing way
>   to use the Excel API.
> - **Non-persistent session:** Changes made by the API are not saved to the
>   source location. Instead, the Excel backend server keeps a temporary copy of
>   the file that reflects the changes made during that particular API session.
>   When the Excel session expires, the changes are lost.
> - **Sessionless:** The API calls do not pass a session ID. […] This is not an
>   efficient way to call the Excel API, but it is suitable for making certain
>   types of isolated requests.

> **Note:** The session header is not required for an Excel API to work.
> However, we recommend that you use the session header **to improve
> performance**.

Neither that page nor
[Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel)
nor [Best practices for working with the Excel API](https://learn.microsoft.com/en-us/graph/workbook-best-practice)
uses the words *lock*, *isolation*, *transaction*, or *optimistic concurrency*
in relation to sessions. Every stated benefit is persistence semantics or
efficiency.

Sessions in fact make concurrency **worse**, per Microsoft's own guidance
(§5.5): merge conflict is listed as a failure mode "**when concurrent sessions
are involved**".

The one place Microsoft describes an actual lock, it is something *another
client* holds and ChainReact merely observes — the `accessConflict` error code
(§5.6), "for example, another client has locked the workbook for edit". That is
Excel Online taking a lock, not an API affordance we can request.

### 5.4 JSON batching — NOT atomic

**VERIFIED (Microsoft).** [Combine multiple HTTP requests using JSON batching](https://learn.microsoft.com/en-us/graph/json-batching):

> A `200` status code on the batch response headers doesn't indicate that the
> individual requests inside the batch succeeded. This is why each individual
> response in the **responses** property has a status code.

The documented example shows requests 1 and 5 succeeding while 2, 3 and 4 fail
with 403/403/405 — in one batch, with no rollback of the successes. `dependsOn`
provides **ordering only**; a failed dependency yields `424 Failed Dependency`
for downstream requests, and again does not undo what already ran. Batches are
capped at 20 requests, and each request is throttled individually ("if any
request exceeds the limits, it fails with a status of `429`").

**INFERENCE.** Batching is a latency optimization. It provides no transactional
guarantee, so it cannot convert N cell writes into one atomic row write. Using
it would introduce partial-write states while solving nothing.

### 5.5 Microsoft's own concurrency guidance

**VERIFIED (Microsoft).** [Best practices for working with the Excel API](https://learn.microsoft.com/en-us/graph/workbook-best-practice),
§"Throttling and concurrency":

> We don't recommend increasing concurrency when using Excel APIs (for example,
> parallelizing the requests to the same workbook), especially for write
> requests. Instead […] we recommend sequential usage in the most common case:
> for each workbook, only send the next request after receiving a successful
> response to the current request.

> Concurrent write requests to the same workbook don't usually run in parallel
> (although in some cases they do); rather, they are often the cause of
> throttling, timeout (when requests are queued on servers), merge conflict
> (when concurrent sessions are involved) and other types of failures. They also
> complicate error handling; for example, when you receive a failure response,
> **there is no way to confirm the status of other pending requests**, which
> makes it difficult to determine or to recover the state of the workbook.

**INFERENCE.** That last sentence is decisive against any multi-request write
strategy. If a second write fails, we cannot determine whether the first landed,
which means we cannot report the run's outcome honestly. Any option that turns
one row update into several requests trades a *narrow, disclosed* race for a
*wide, undiagnosable* partial-write.

### 5.6 The conflict primitives that DO exist

**VERIFIED (Microsoft).** [Error handling for Excel APIs](https://learn.microsoft.com/en-us/graph/workbook-error-handling)
defines required **second-level** error codes, including:

| Code | Documented instruction (abridged) |
| --- | --- |
| `accessConflict` | "The failed request conflicts with other clients accessing the workbook (for example, another client has locked the workbook for edit). The Microsoft Graph client is **not expected to resend** the failed request until the conflict is resolved." |
| `conflictUncategorized` | "The failed request conflicts with certain server state. […] **not expected to resend** […] until the conflict is resolved." |
| `invalidSessionAccessConflict` | Session invalidated by conflicts with other clients accessing the workbook. |
| `insertDeleteConflict` (optional) | "The insert or delete operation attempted resulted in a conflict." |
| `filteredRangeConflict` (optional) | "The operation failed because it conflicts with a filtered range." |

Crucially, Microsoft instructs clients to **parse the second-level code first**:

> For both the long-running operation pattern and the regular pattern, the
> client should first parse required second-level error codes […] Optionally,
> the client can also handle other second-level error codes, or choose to fall
> back to top-level error codes or status codes.

**VERIFIED (repo).** ChainReact does not do this. `surfaceGraphError` reads only
the top level, so an `accessConflict` today becomes a generic `Error` and is
classified `HANDLER_FAILED` — "This step failed for an unexpected reason."

**INFERENCE.** These codes detect a conflict *Excel already noticed* (someone
holding the file open for edit). They do **not** detect the read-modify-write
race this audit is about, because from Graph's perspective our PATCH is a
perfectly valid, uncontended write of the values we sent. They are still worth
handling — see §15 — but they are not the fix.

### 5.7 The decisive finding — `null` means "do not touch this cell"

**VERIFIED (Microsoft).** [Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel),
§"Work with nulls":

> `null` input inside a two-dimensional array (for values, number-format,
> formula) **is ignored** in the Range and Table resources. **No update takes
> place to the intended target (cell)** when `null` input is sent in values or
> number-format or formula grid of values.
>
> For example, to only update specific parts of the Range, such as a cell's
> Number Format, and to retain the existing number-format on other parts of the
> Range, set the Number Format where needed and send `null` for the other cells.

Confirmed independently on the API reference page itself,
[Update range](https://learn.microsoft.com/en-us/graph/api/range-update), in the
annotation on its worked example:

> The `null` input is to instruct the API to **ignore the cell** for that
> particular input.

And the complementary rule, same section:

> Blank values in update requests are treated as an instruction to **clear or
> reset** the respective property. A blank value is represented by two double
> quotation marks with no space in-between: `""` […] For `values`, the range
> value is cleared out. This is the same as clearing the contents in the
> application.

The reference page also states the intent plainly under "Request body":

> Existing properties that aren't included in the request body maintain their
> previous values […] **For best performance, you shouldn't include existing
> values that haven't changed.**

**This is a per-cell sparse-write primitive, and it maps exactly onto the
three-state model S3 already ships:**

| ChainReact state (S3) | Saved config | Send in the PATCH array | Documented Graph behavior |
| --- | --- | --- | --- |
| Leave unchanged | key absent | `null` | cell is ignored — **not written at all** |
| Set to blank | key = `""` | `""` | cell is cleared |
| Set to a value | key = value | the value | cell is written |

### 5.8 A repository claim this contradicts

**VERIFIED (Microsoft) vs VERIFIED (repo) — these disagree.**

S3 documented, and the guided editor implements, "a legacy `null` […] which the
handler writes through to clear the cell" (see [S3 outcomes](./s3-outcomes.md)
§2), and the editor hydrates a saved `null` into the **"Set to blank"** state.

Per §5.7, a `null` in a `values` array is **ignored** — the cell is left exactly
as it is. So for a saved config carrying `values: { Notes: null }`:

- the UI tells the user the Notes cell **will be emptied**;
- Graph, as documented, **leaves it untouched**.

The existing handler test is not wrong — it asserts the PATCH *body* contains
`null`, which it does. It is the test's *name* and the S3 prose that assert a
clearing effect the documentation contradicts. This audit does not change
either; §17 and §25 carry it as a decision.

**INFERENCE.** This also means the current handler is *already* accidentally
partially protected: any column whose existing value is empty is sent as `null`
and therefore never written. The lost update is confined to columns that
*already held a value* at read time — which is, unfortunately, exactly the
population a colleague is likely to be editing.

---

## 6. Option A — Conditional full-row write

**Not viable. Recommend rejecting.**

| Question | Finding |
| --- | --- |
| Does a valid version token exist for the row or range? | **No** (§5.1). No ETag on the Range resource or its GET response. |
| Does a token exist at a broader scope? | Yes — driveItem `eTag` / `cTag` (§5.2). |
| Does the range PATCH accept it? | **No** (§5.1). The documented header set has no conditional header. |
| Would unrelated workbook edits trigger conflicts? | Yes, constantly — the tag covers the whole file (§5.2). |
| Too broad or too narrow? | Far too broad, *and* unusable regardless. |
| How would 409/412 surface? | Moot — nothing would produce a 412, because no condition is evaluated. |

The audit brief is explicit: do not recommend this unless Graph actually honors
the condition for this write. It does not, and there is no way to prove it does
without sending a header the service does not document — which would be
indistinguishable from a silently-ignored no-op.

---

## 7. Option B — Write only the selected cells

**This is the recommendation, but not in the shape the brief anticipated.**

The brief framed Option B as "one request per cell, or grouped adjacent ranges,
possibly batched". §5.7 makes that unnecessary: **Graph already supports sparse
writes inside a single range PATCH.** A `null` in the values array is a
documented instruction to skip that cell.

So the option splits into two implementations:

### B1 — Sparse single-range PATCH (RECOMMENDED)

Keep exactly the request shape that ships today — one PATCH of
`A{row}:{lastCol}{row}` — and change only what goes in the array. Untouched
columns become `null` instead of the value read from the sheet.

| Criterion | B1 |
| --- | --- |
| Graph support | Documented, two independent citations (§5.7) |
| Request count | **Unchanged** — 1 GET + 1 PATCH |
| Non-contiguous selected columns | Handled natively; the array is sparse |
| Partial-success risk | **None** — still exactly one write request |
| Latency | Unchanged |
| Rate limits | Unchanged; payload is smaller |
| Batching needed | No |
| Retry duplication | Writes are absolute values, so a repeat is idempotent (§16) |
| Removes the need for the initial read? | **No, and it must not** — the read still supplies the header map, the used-range start row, the row-existence guard and the heading-row guard. But the read no longer feeds the *payload*, so its staleness stops mattering. |
| Stale/unknown columns still fail before any write? | Yes — the fail-loud check in step 3 is untouched |
| Follows Microsoft's own guidance? | Yes: "you shouldn't include existing values that haven't changed" (§5.7) |

### B2 — Multiple narrow PATCHes / batching (REJECTED)

| Criterion | B2 |
| --- | --- |
| Request count | 1 GET + N writes (or 1 batch of ≤20) |
| Partial-success risk | **High** — batches are not atomic (§5.4) |
| Diagnosability on failure | **Microsoft says it is not possible**: "there is no way to confirm the status of other pending requests" (§5.5) |
| Concurrency posture | Directly contradicts Microsoft's "don't parallelize writes to the same workbook" (§5.5) |
| Benefit over B1 | **None.** B1 already achieves per-cell selectivity. |

B2 buys nothing B1 does not already provide, and pays for it with partial
updates ChainReact could not describe honestly in run history.

### Value-semantics check for B1

**VERIFIED (Microsoft) + INFERENCE.** B1 changes only which array slots carry
`null`; it does not change how any *written* value is transmitted, so:

- **Fixed values, variable-resolved values** — unchanged; same slot, same JSON.
- **Blanks** — unchanged; `""` still clears, per §5.7.
- **Booleans / numbers** — unchanged.
- **Dates** — unchanged. (Note the pre-existing behavior: `values` writes a raw
  value; the `numberFormat` property is not sent, so date *formatting* is
  whatever the cell already has. B1 makes this strictly better, because
  untouched cells now keep their format by not being written at all.)
- **Formulas** — improved. Today, a formula cell that the user did **not**
  select is read back as its *calculated value* (`valuesOnly: true`) and
  rewritten as a literal, **destroying the formula**. Under B1 that cell is sent
  as `null` and left alone. This is a real, separate data-loss bug that B1 fixes
  as a side effect. **INFERENCE**, from `valuesOnly: true` in
  [`updateRow.ts`](../../../../integrations/microsoft-excel/actions/updateRow.ts)
  plus the documented `values`-vs-`formulas` distinction in
  [Update range](https://learn.microsoft.com/en-us/graph/api/range-update); it
  should be confirmed in live certification (§20).

---

## 8. Option C — Re-read and compare before PATCH

**Reject as the primary strategy. Not needed if B1 lands.**

| Question | Finding |
| --- | --- |
| How much does it narrow the window? | From one round trip to a fraction of one — it does not close it. |
| Remaining TOCTOU gap | Real and unbounded in principle; the compare and the write are still two requests. |
| Extra Graph calls | +1 GET per execution, on every run, for a check that is wrong some of the time. |
| Is normalized comparison reliable? | **No.** `valuesOnly: true` returns calculated values, so a volatile formula (`=TODAY()`, `=RAND()`, `=NOW()`) changes between two reads with nobody editing anything — producing phantom conflicts on a workbook with no contention at all. |
| Formulas vs displayed values | Not distinguishable under `valuesOnly: true`. |
| Dates / number formatting | Graph returns date serials; comparison is on raw values, so formatting differences do not show — but that also means a format-only change is invisible. |
| Meaningful improvement? | Against B1, **no**: B1 does not write those cells at all, so there is nothing for a re-read to protect. |
| Suitable as a fallback? | Only if B1 were unavailable. It is not. |

Microsoft's guidance against extra requests to the same workbook (§5.5) applies
here too. This buys a probabilistic improvement at the cost of a guaranteed
extra call and a new class of false failure.

**It also must not be described as atomic**, and this plan does not.

---

## 9. Option D — Re-read and automatically re-merge

**Reject.**

| Question | Finding |
| --- | --- |
| Preserves unrelated concurrent edits? | Yes — but so does B1, without a second round of anything. |
| Concurrent edit on a column ChainReact is also changing? | ChainReact wins silently. |
| Does silently winning match expectations? | On the *selected* columns, arguably yes — the user said "set Status to Paid". But doing it after *detecting* a conflict and choosing to proceed is a different act from never noticing. Detecting and then overwriting anyway is the worst of both: we knew, and we did it anyway, invisibly. |
| Unbounded retry loop risk | Real on a hot row. |
| Is one bounded retry defensible? | Only on top of a strategy that *detects* conflicts. B1 does not detect them, because it does not need to. |
| Automatic retry without user visibility? | **No.** A silent retry that overwrites a human's edit is precisely the behavior the S3 disclosure warned about, re-implemented deliberately. |

This option exists to rescue Option A. With A rejected and B1 available, it has
nothing to do.

---

## 10. Option E — Workbook session strategy

**Reject as a concurrency control. Consider separately as a performance item.**

| Claim | Verdict |
| --- | --- |
| Connection / request efficiency | **True** and documented (§5.3). |
| Workbook calculation context | True — the server keeps the workbook loaded. |
| Persistent vs non-persistent | A *persistence* distinction, not an isolation one (§5.3). Non-persistent would discard our write entirely — actively wrong for this action. |
| Exclusive locking | **Not documented anywhere.** No such affordance. |
| Optimistic concurrency | **Not documented.** No token, no condition. |
| Transaction isolation | **Not documented.** |

Microsoft lists merge conflict as a failure mode "when concurrent sessions are
involved" (§5.5) — sessions are a source of conflict here, not a remedy.

The parity audit already tracks `workbook-session-id` as a deferred **latency**
item ([R-3](../../parity/parity-microsoft-excel.md)). That framing was correct
and should stay. If sessions are ever adopted it must be for round-trip cost,
and the plan must not describe them as protection.

---

## 11. Option F — Fail closed without technical conflict detection

**Reject.** This is the last-resort comparison, and B1 makes it unnecessary.

Retaining the full-row write and escalating the disclosure (or the action's risk
level) would leave a real data-loss path open and compensate with a warning.
S3 already carries that warning. Doing nothing but shouting louder is a
regression in product terms: the user is told about a risk we now know how to
remove.

Worth recording: `update_row` is currently `riskLevel: "medium"`,
`isDestructive: false` (**VERIFIED (repo)**,
[`updateRow.meta.ts`](../../../../integrations/microsoft-excel/actions/updateRow.meta.ts)).
Under B1 that stays correct — arguably it becomes *more* correct, since the
action's blast radius shrinks to the columns the user selected.

---

## 12. Conflict-policy comparison

The policy question changes shape once B1 is the write strategy, because **the
class of conflict that policies 1–3 exist to arbitrate no longer occurs.**
ChainReact stops writing unrelated columns, so there is nothing to lose.

What remains is a *selected-column* conflict: someone edits Status while
ChainReact is setting Status. No Graph primitive can detect that (§5.1, §5.6),
and no policy can be conditioned on it.

| Policy | Applicability under B1 | Assessment |
| --- | --- | --- |
| **1 — Fail and ask the user to retry** | Applies only to conflicts Graph *reports* (`accessConflict`, `conflictUncategorized`). | **Recommended for that case.** Safe, honest, and matches Microsoft's explicit instruction: "not expected to resend the failed request until the conflict is resolved" (§5.6). User burden is low because it is genuinely rare — it means a human has the file open for editing. A recurring workflow will conflict again while the lock is held, which is the correct outcome, not a defect. |
| **2 — Automatically retry against the latest row** | Not applicable. | Contradicts Microsoft's documented instruction not to resend on these codes. Would hammer a locked workbook. |
| **3 — Preserve unrelated edits, fail on selected-column conflicts** | The *first half is what B1 does*, structurally and always. The second half is undetectable. | The desirable half is achieved without comparison. The undetectable half would require comparing read-time values against write-time values — unreliable for the reasons in §8 (volatile formulas, calculated values, format-blind comparison). **Recommend not attempting it.** |
| **4 — User-configurable conflict behavior** | No meaningful choice remains to expose. | Rejected. There is one safe behavior and it needs no opinion from the user. Exposing a setting would advertise a hazard we have removed, in vocabulary ("conflict policy") that means nothing to a business user. |

---

## 13. Primary recommendation

**RECOMMENDATION.**

1. **Write strategy: B1 — sparse single-range PATCH.** Send `null` for every
   column the user chose to leave unchanged; keep exactly one GET and one PATCH.
2. **Conflict policy: Policy 1, scoped to Graph-reported conflicts.** Parse
   Graph's second-level error codes, surface `accessConflict` /
   `conflictUncategorized` / `insertDeleteConflict` / `filteredRangeConflict` as
   a typed, non-retryable conflict failure with plain-language copy. No
   automatic retry, no re-merge.

### Why this is safer than the alternatives

- It removes the lost update for unrelated columns **entirely**, rather than
  narrowing a window. ChainReact cannot overwrite a cell it never writes.
- It does so **without adding a single request**, so it introduces no
  partial-success state, no new rate-limit pressure, and no new failure mode.
  Every rejected alternative adds at least one.
- It is **documented behavior on the exact endpoint we call** (§5.7), cited
  twice, not an inference about header handling.
- It moves ChainReact **into** alignment with Microsoft's stated best practice
  ("you shouldn't include existing values that haven't changed"), rather than
  further from it.
- It fixes a second, unrelated data-loss bug for free: unselected formula cells
  currently get flattened to literals (§7).
- The saved config, the three-state semantics and every S3 guard are untouched.

### Remaining risks (§14 expands)

Selected-column contention still resolves last-writer-wins, undetectably. This
is irreducible with the current Graph surface.

### Disclosure

The Step 3 warning can be **replaced, not merely softened** — see §18.

### Config key

**None.** No new field, no schema change, no migration.

### Live certification

**Required before release.** The whole recommendation rests on Graph honoring
`null`-as-skip for this endpoint. It is documented twice, but documented is not
observed, and the failure mode if it were wrong is silent data loss. See §20.

### Slicing

**Two slices, not three** — see §22.

---

## 14. Remaining risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| **Selected-column contention.** A human edits Status while ChainReact sets Status. | Low likelihood, low harm | Irreducible; no Graph primitive detects it. The user explicitly asked for that column to be set. Step 3 should say so in one plain sentence (§18). |
| **`null`-as-skip does not behave as documented** for this endpoint or tenant. | Catastrophic if true (silent no-op writes) | Live development certification with a controlled concurrent edit (§20) is a **release gate**, not a nicety. |
| **Legacy configs carrying `null`** mean "leave unchanged", not "clear" (§5.8) | Medium — a live workflow may not be doing what its UI claims | Decision D3 (§25). Whatever is decided, B1 does not make it worse: the runtime behavior is identical before and after. |
| **A row's used-range width changes** between read and write (someone adds a column) | Low | Pre-existing. The PATCH address is computed from the read; a widened sheet means the last column is not written. Not introduced here; worth a note in the outcome doc. |
| **Graph-reported conflict during a recurring workflow** re-fails each run while a human holds the file open | Low | Correct behavior. Run history explains it; the user closes Excel or the schedule catches up. |
| **Column-anchored writes** (content starting at column B is written one column left) | Pre-existing, unchanged | Documented in [S3 outcomes](./s3-outcomes.md) §7. Still out of scope; still its own slice. |

---

## 15. Error contract

**RECOMMENDATION**, designed against the existing taxonomy
(**VERIFIED (repo)**: [`engineTypes.ts`](../../../../services/execution/engineTypes.ts),
[`classifyHandlerError.ts`](../../../../services/execution/classifyHandlerError.ts),
[`humanizeActionError.ts`](../../../../core/errors/humanizeActionError.ts),
[`failedRunCta.ts`](../../../../core/errors/failedRunCta.ts)).

### New typed error

A `ProviderConflictError` in `integrations/_shared/microsoft/api/errors.ts`,
with a **stable `name`** — `classifyHandlerError` matches on `err.name`, not
`instanceof`, to avoid import cycles, and the file's own doc comment requires a
test that throws the real class.

### New run-failure code

`PROVIDER_CONFLICT`, added to `RunFailureCode`.

| Field | Value |
| --- | --- |
| Internal code | `PROVIDER_CONFLICT` |
| Provider trigger | Graph second-level `innerError.code` ∈ {`accessConflict`, `conflictUncategorized`, `invalidSessionAccessConflict`, `insertDeleteConflict`, `filteredRangeConflict`}; HTTP 409 / 412 as a fallback when no second-level code is present |
| Retryable by the platform | **No.** Microsoft: "not expected to resend the failed request until the conflict is resolved" (§5.6) |
| Run outcome | **Failed**, not paused. ChainReact has no paused-run state, and inventing one for this is disproportionate. |
| CTA action | `retry_later` → "Try again later", `href: null` (guidance only, per [`failedRunCta.ts`](../../../../core/errors/failedRunCta.ts)) |
| Severity | `error` |

### Copy

**Run history title:** `Someone else was editing that file`

**Run history description:**
> Excel wouldn't let ChainReact save this change because the workbook was in
> use — usually because someone had it open for editing. Nothing was changed.
> This step will work once the file is free.

**Builder / live test:**
> That workbook is in use right now, so this step didn't save anything. Close it
> in Excel, or try again in a moment.

Both state the outcome ("nothing was changed"), which is what the user actually
needs to know, and neither uses *conflict*, *concurrency*, *lock*, or *ETag*.

### What it must never be reported as

Not `TRANSIENT_PROVIDER_ERROR` (a retry will not help while the lock is held),
not `INTEGRATION_REAUTH_REQUIRED`, not `WORKFLOW_NOT_READY`, not
`HANDLER_FAILED`, and not a rate limit. Each has a different, wrong next step.

### Logging and redaction

Log `{ code, secondLevelCode, httpStatus, provider, requestId, clientRequestId,
workbookIdHash, worksheetNameHash, rowNumber, columnCount }`.

**Never log:** cell values, header text, the workbook name, the file path, the
access token, or the provider account id. This matches the existing posture in
`classifyHandlerError`, whose doc comment notes that raw handler messages "can
carry tokens, emails, provider account ids, or raw provider bodies" and are kept
server-side only.

### Provider request identifiers

**VERIFIED (Microsoft):** Graph returns `request-id` and `client-request-id`
inside `error.innerError`
([Error handling for Excel APIs](https://learn.microsoft.com/en-us/graph/workbook-error-handling)).
**VERIFIED (repo):** `surfaceGraphError` discards them. Slice A should capture
them into the typed error for server-side diagnostics — they are opaque
correlation ids, not customer data.

---

## 16. Billing and retry implications

**VERIFIED (repo).**

1. **Is a detected conflict billable?** Under the ledger, **no**.
   [`taskUsageRecorder.ts`](../../../../services/billing/taskUsageRecorder.ts)
   filters to succeeded steps (`if (!succeededIds.has(node.id)) continue; //
   only successful nodes count`) and
   [`taskCostPolicy.ts`](../../../../services/billing/taskCostPolicy.ts) sets
   `chargeOn: "success"`. A failed step records no `node_task_charged` event.
   The **run-level** flat gate (Slice 1N) and the reserve/reconcile path still
   apply per run, unchanged. **No new billing rule is proposed**; if Marcus wants
   a conflicted run to be free at the run level too, that is a separate product
   decision and is flagged as D5 (§25).
2. **Partial multi-PATCH success representation.** Not applicable — B1 issues
   one write. This is a direct argument for B1 over B2.
3. **Can the engine safely retry the action?** **VERIFIED (repo):** the engine
   performs no automatic handler retry today. A user-initiated re-run is safe
   under B1 (see 4–5).
4. **Does a retry apply the same values twice?** Yes, and harmlessly. The write
   is *absolute* — "set Status to Paid" — not relative. Applying it twice yields
   the same cell state.
5. **Are writes naturally idempotent?** Yes for fixed values. **Not** for a
   variable that resolves differently on the second run (`{{trigger.timestamp}}`
   would land a new value) — but that is the workflow author's intent, not a
   concurrency defect, and it is unchanged by this slice.
6. **Formulas / volatile values.** Under B1, unselected formula cells are no
   longer touched at all, so the flattening bug in §7 disappears. A user who
   *selects* a column and writes a literal into a formula cell is doing so
   deliberately.
7. **Is blanking idempotent?** Yes. `""` clears; clearing an already-clear cell
   is a no-op.
8. **Request ids.** Captured per §15, logged, never surfaced to the user.

---

## 17. Compatibility plan

**RECOMMENDATION.** Everything below is preserved with **no migration, no schema
change, and no config rewrite**.

| Contract | Under B1 |
| --- | --- |
| `microsoft-excel:update_row` config shape | Unchanged |
| Record-only `values` | Unchanged |
| Three-state semantics | Unchanged — and now transmitted *more* faithfully (§5.7) |
| Row-number validation (min 2) | Unchanged |
| Header-row protection | Unchanged |
| Out-of-range protection | Unchanged |
| Raw-header alignment | Unchanged |
| Duplicate-header rejection | Unchanged |
| Output contract | Unchanged — `{ workbookId, worksheetName, rowNumber, address, columnsUpdated, updatedColumns }`. `address` still describes the range addressed. **INFERENCE:** it no longer describes every cell *written*; §25 D4 asks whether to add a bounded `columnsSkipped` count. |
| Generic renderer compatibility | Unchanged (no metadata change) |
| Saved workflows | Run identically except that untouched columns are no longer rewritten — which is the fix |
| New optional config field | **None proposed** |

The one behavioral delta a customer could observe: a cell ChainReact used to
rewrite with an identical value is no longer written. The observable effects are
(a) a concurrent edit survives, (b) a formula survives, (c) `lastModifiedBy` /
cell-level change history no longer records a no-op touch. All three are
improvements.

---

## 18. UX and disclosure changes

**VERIFIED (repo)** — current Step 3 copy, from
[`guidedSpreadsheetAdapters.ts`](../../../../features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters.ts):

> ChainReact reads the row first, applies the changes you chose, and writes the
> whole row back to Excel. Columns you left unchanged are written back exactly
> as they were found, so the rest of the row is kept. One thing to know: if
> somebody edits that same row in Excel during the moment between the read and
> the write, their change can be overwritten. There is nothing else to decide
> for this step.

Under B1 that becomes **factually wrong in two places** — it no longer writes
the whole row back, and it no longer rewrites untouched columns.

**RECOMMENDATION — proposed replacement:**

> ChainReact changes only the columns you chose. Every other cell in that row is
> left exactly as it is — it isn't part of the update at all, so anything
> somebody else changes there is safe. If two people set the *same* column at the
> same moment, the last change wins. There is nothing else to decide for this
> step.

It drops the warning that no longer applies, keeps one honest sentence about the
risk that does, and uses no technical vocabulary. The existing guard test
asserting that *atomic / transaction / isolat / conflict / lock / guarantee*
never appear in this copy stays green.

**Conflict setting in Step 3: no.** Per §12 Policy 4 there is no meaningful
choice left to offer.

---

## 19. Test matrix

Mocks stay at the Graph/network boundary throughout, per
[`testing-strategy.md`](../../../rules/testing-strategy.md).

### Good paths (handler unit)

- Row unchanged between read and write → PATCH body carries `null` in every
  unselected slot.
- One selected column → exactly one non-`null` slot.
- Several non-contiguous selected columns → correct slots, `null` between them.
- Blanking a cell → `""` in that slot, `null` elsewhere.
- A formula cell that is NOT selected → sent as `null` (the §7 regression guard).
- A variable-resolved value → committed verbatim.
- A selected column whose existing value is identical → still written (the user
  chose it).
- Output contract unchanged for all of the above.

### Sparse-write contract (the headline assertions)

- **No unselected column ever appears as a non-`null` value in the PATCH body.**
- The PATCH is still **exactly one** request.
- The address span still matches the header count.
- A row where *every* column is selected produces no `null`s (upper bound).
- A row where only one column is selected produces `columnCount - 1` `null`s.

### Conflict paths

- `accessConflict` → `PROVIDER_CONFLICT`, no retry, typed copy.
- `conflictUncategorized`, `invalidSessionAccessConflict`,
  `insertDeleteConflict`, `filteredRangeConflict` → same.
- HTTP 409 with no second-level code → `PROVIDER_CONFLICT` via status fallback.
- HTTP 412 → same.
- A second-level code Graph adds later and we do not know → falls back to status,
  then to `HANDLER_FAILED`; asserted so an unknown code cannot be silently
  mapped to "conflict".
- Row deleted between read and write → whatever Graph returns, surfaced typed,
  never as success.
- Worksheet renamed / workbook moved mid-run → `NotFoundError` path unchanged.

### Provider failures

401 → reauth · 403 → scope · 404 → not found · 409 → conflict · 412 → conflict ·
429 → transient, `Retry-After` respected · 500 → transient · timeout → transient
· connection drop after the server accepted the write (no response) → reported
as failure with the run history stating the write **may** have landed ·
malformed provider response body → handled without throwing an unclassified
parse error.

### State and safety

- No customer cell values, header text, workbook names or tokens in any log line.
- `request-id` / `client-request-id` captured when present.
- No automatic retry on `PROVIDER_CONFLICT`.
- **Not one PATCH per cell** — asserted, so B2 cannot creep in later.
- No write at all when an unknown/stale column is configured (existing guard).
- Row-1 and out-of-range guards unchanged (existing suites must stay green).
- Legacy configs (including a saved `null`) produce the same PATCH body they do
  today, so the compatibility claim in §17 is proven rather than asserted.
- Opening a saved node still rewrites nothing (existing S3 integration suite).

### What unit mocks cannot prove

**Explicit gap.** Every assertion above is about the request ChainReact *sends*.
No mock can prove Microsoft *honors* `null`-as-skip. That is precisely what §20
exists for, and the outcome document must not claim the risk is closed on unit
evidence alone.

---

## 20. Development certification plan

**Do not run during this audit.** Executed only after Marcus authorizes a
specific SHA.

**Environment:** `v2-dev` only → `https://dev.chainreact.app`. Development
Supabase `syvnzqzctnywakgyykmz`. Development Microsoft credentials only. A
dedicated, disposable development workbook containing synthetic data. Production
Supabase `qcepijemjlkssfkvzlio` and production Microsoft credentials are never
contacted.

**Procedure:**

1. Seed a worksheet with known synthetic values, including at least one formula
   cell and one date-formatted cell, in columns the test will *not* select.
2. Run Update Row selecting one column. Confirm via a read-back that the
   selected cell changed and **every other cell is byte-identical**, formula and
   number format intact.
3. **The controlled concurrency test.** Open the workbook in Excel Online, edit
   an unselected column in the target row, and — while that edit is live — run
   the workflow. Confirm the human's edit **survives**. This is the assertion
   the whole slice exists for.
4. Repeat step 3 editing a *selected* column; confirm last-writer-wins and that
   the run reports success (documented behavior, not a bug).
5. Provoke a Graph-reported conflict (hold the workbook locked for edit) and
   confirm the run fails as `PROVIDER_CONFLICT` with the §15 copy, with no
   retry and no partial write.
6. Confirm the blank (`""`) path clears a cell and the `null` path does not,
   settling §5.8 empirically.
7. Restore or delete the test workbook.

**Artifact:** a certification record naming the exact SHA, the run ids, the
observed HTTP statuses and second-level error codes, and pass/fail per step.
**It must contain no workbook contents, no cell values, no file path, and no
tokens** — assertions about cells are recorded as "unchanged / changed as
expected", never as data.

---

## 21. Expected implementation files

**Slice A**
`integrations/_shared/microsoft/api/errors.ts` (typed conflict error, second-level
code parsing, request-id capture) ·
`integrations/microsoft-excel/api/worksheetRangePatch.ts` (classify 409/412 and
second-level codes) ·
`services/execution/engineTypes.ts` (`PROVIDER_CONFLICT`) ·
`services/execution/classifyHandlerError.ts` ·
`core/errors/humanizeActionError.ts` ·
tests under `tests/unit/integrations/_shared/microsoft/`,
`tests/unit/integrations/microsoft-excel/api/`,
`tests/unit/services/execution/`, `tests/unit/core/errors/`

**Slice B**
`integrations/microsoft-excel/actions/updateRow.ts` (the merge → sparse array) ·
`features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters.ts`
(Step 3 copy) ·
`tests/unit/integrations/microsoft-excel/actions/updateRow.test.ts` ·
`tests/unit/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters.test.ts` ·
`tests/integration/features/workflow-builder/microsoft-excel/update-row-config.test.tsx` ·
`docs/slices/phase-5/spreadsheet-guided-config/s4-outcomes.md`

**No** migration, **no** `contracts/actionMeta.ts` change, **no** metadata
change, **no** provider-registry change.

---

## 22. Implementation slices and commit boundaries

**RECOMMENDATION: two slices, not the three the brief sketched.** The brief's
Slice A ("conditional request support") is empty — there is no conditional
request to build (§6) — and its Slice C is small enough to ride with the
behavior change it describes.

### Slice A — Typed conflict plumbing

`fix(excel): classify Graph workbook conflicts as their own failure`

Second-level error-code parsing, `ProviderConflictError`, `PROVIDER_CONFLICT`,
humanizer + CTA, request-id capture, wrapper and classifier tests. **No change
to what any handler writes.** Independently valuable: it also improves every
other Excel action's error reporting. Green on its own.

### Slice B — Sparse write, disclosure, certification

`fix(excel): update only the columns the user selected`

The merge change, the Step 3 copy, the full test matrix from §19, the outcome
document. Then — on Marcus's authorization of that exact SHA — the §20
development certification, with its artifact recorded in the outcome doc before
any production promotion.

**Order matters:** A before B, so that the first run of the new write path
already reports conflicts correctly.

---

## 23. Rollback strategy

- **Slice B** is a one-line-shaped change in the merge loop. Reverting the
  commit restores the read-back-full-row behavior exactly, along with its Step 3
  copy. No data migration, no config change, nothing persisted differs.
- **Slice A** is additive: a new error class and a new enum member. Reverting
  returns those failures to `HANDLER_FAILED` — worse reporting, no behavior
  change.
- Neither slice writes to the database, changes a contract, or alters saved
  workflow configuration, so rollback is `git revert` and nothing else.

---

## 24. Migration and database posture

**No migration. No schema change. No `db:push`. No database contact.**

`UpdateRowConfigSchema` is untouched, so every saved configuration keeps parsing
and running. `RunFailureCode` is a TypeScript union, not a database enum —
**VERIFIED (repo)**, [`engineTypes.ts`](../../../../services/execution/engineTypes.ts);
`error_classification` is derived at read time from the persisted code, and
`humanizeActionError` already has a default arm for unknown/legacy values, so
adding a member cannot break an existing persisted row.

Nothing in this audit contacted `syvnzqzctnywakgyykmz` or
`qcepijemjlkssfkvzlio`, and no Microsoft Graph endpoint was called.

---

## 25. Decisions requiring Marcus's approval

1. **Write strategy — adopt B1 (sparse single-range PATCH).** Send `null` for
   unchanged columns; keep one GET and one PATCH. Rejects Options A, C, D, E, F
   and B2 for the reasons in §6–§11.
2. **Conflict policy — Policy 1, scoped to Graph-reported conflicts only.** Fail
   with a typed error, never auto-retry, never auto-re-merge. No user-facing
   conflict setting.
3. **Legacy `null` semantics (§5.8).** Microsoft documents `null` as
   *ignore this cell*; S3's UI and prose describe it as *clear this cell*. The
   runtime behavior does not change either way under B1. Options: (a) correct
   the S3 documentation and the misleading test name, and hydrate a saved `null`
   as **"Leave unchanged"** in the editor — truthful, but silently changes what
   an existing node's UI claims; (b) correct the documentation only, and leave
   the UI mapping until the certification in §20 settles it empirically.
   **My recommendation: (b)** — do not change a live UI mapping on documentation
   alone when a controlled experiment is already scheduled.
4. **Output contract.** Add a bounded `columnsSkipped` count to the output so a
   workflow author can see that unselected columns were not written? **My
   recommendation: no** — `columnsUpdated` and `updatedColumns` already answer
   the useful question, and a new output key is a contract addition for little
   gain.
5. **Billing on a conflicted run.** Per-node charging already excludes failed
   steps (§16). Should a run that fails *only* on `PROVIDER_CONFLICT` also be
   exempt from the run-level flat task? This is a product/billing decision, not
   a technical one, and this plan does not assume an answer.
6. **Slice count — two, not three** (§22), because the brief's Slice A has no
   conditional-write work left in it.
7. **Live development certification is a release gate** (§20). The
   recommendation rests on documented behavior that has not been observed in
   this tenant, and the failure mode is silent. Confirm that B1 does not ship to
   production without it.
8. **Workbook sessions stay deferred** as a latency item only (§10), and are
   never described as concurrency protection.

---

## Appendix — Official sources cited

- [Update range](https://learn.microsoft.com/en-us/graph/api/range-update) — request headers, `null`-ignores-cell annotation
- [Working with Excel in Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/resources/excel) — sessions, "Work with nulls", "Blank input and output", range GET response
- [Manage sessions and persistence in Excel](https://learn.microsoft.com/en-us/graph/excel-manage-sessions) — the three session modes
- [Best practices for working with the Excel API](https://learn.microsoft.com/en-us/graph/workbook-best-practice) — throttling and concurrency, merge conflicts
- [Error handling for Excel APIs](https://learn.microsoft.com/en-us/graph/workbook-error-handling) — second-level error codes, `Retry-After`
- [Combine multiple HTTP requests using JSON batching](https://learn.microsoft.com/en-us/graph/json-batching) — non-atomicity, `dependsOn`, limits
- [Update DriveItem](https://learn.microsoft.com/en-us/graph/api/driveitem-update) — `if-match` documented where it exists
- [driveItem resource type](https://learn.microsoft.com/en-us/graph/api/resources/driveitem) — `eTag` / `cTag` scope
- [Range resource type](https://learn.microsoft.com/en-us/graph/api/resources/range) — no version token
