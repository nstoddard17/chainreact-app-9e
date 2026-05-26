# Google Sheets 2.3 — Trigger expansion outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) — §10 enumerated P-GS1 options.
**Slice plan:** [`docs/slices/google-sheets-2-3-triggers-plan.md`](google-sheets-2-3-triggers-plan.md) (accepted before Commit 2 began).
**Predecessor outcomes:** [`docs/slices/google-sheets-2-1-outcomes.md`](google-sheets-2-1-outcomes.md), [`docs/slices/google-sheets-2-2-outcomes.md`](google-sheets-2-2-outcomes.md).
**Cross-provider reference:** [`docs/slices/microsoft-excel-parity-outcomes.md`](microsoft-excel-parity-outcomes.md) §§2.7–2.9 — accepted positional-shift limitation on `updated_row` + stable-identity `updated_table_row` alternative.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/google-sheets/`](../../integrations/google-sheets/).

Google Sheets 2.3 closes the remaining trigger gap from the parity
audit §7. The existing `row_changed` Drive-watch trigger now emits
three change kinds (`added` / `updated` / `removed`) via a bounded
per-row snapshot diff, plus an optional `keyColumn` for stable
identity across mid-sheet inserts/deletes. A new `new_worksheet`
trigger rides the same Drive `files.watch` channel and fires once
per truly-new worksheet tab. **No new platform infrastructure** —
every change lives inside `integrations/google-sheets/triggers/`.

The qualitative shift continues Sheets 2.1 + 2.2: V1's polling +
unbounded per-row hash map (`googleSheetsRowSnapshot.rowHashes` —
audit R-3) is NOT ported. V2 ships a **bounded last-N-rows snapshot
window** (default 1,000, max 10,000) with explicit overflow
rejection at activate time, positional row keys by default
(mirrors Excel's accepted `updated_row` limitation), and an opt-in
`keyColumn` mode (mirrors Excel's cleaner-identity
`updated_table_row` alternative). V1's `skipEmptyRows` /
`requiredColumns` filter chrome stays NOT ported — both are
downstream-filter concerns.

P-GS1 collapses entirely into Sheets 2.3 itself. No second consumer
exists (Excel's worksheet diff lives on Graph's `tables` API, not on
cell-range hashing) so no shared platform helper carved out.

---

## 1. Scope shipped

### Triggers (1 extended + 1 new)

| Trigger | Transport | Change kinds | Identity | V1 reference |
|---|---|---|---|---|
| `row_changed` (extended) | Drive `files.watch` push (unchanged from Slice 5) | `added` / `updated` / `removed` per the workflow's `changeKinds` array | Positional (default — 1-indexed sheet row number, header-inclusive) OR `keyColumn` (named header column value coerced to string) | `googleSheetsRowSnapshot` poller + `google_sheets_trigger_updated_row` poller, unbounded |
| `new_worksheet` (NEW) | Drive `files.watch` push (same channel transport as `row_changed`) | One `added`-equivalent event per new worksheet name | Set-difference on workbook worksheet-name list | `google_sheets_trigger_new_worksheet` poller |

`row_changed` registered in
[`integrations/google-sheets/triggers/rowChanged/index.ts`](../../integrations/google-sheets/triggers/rowChanged/index.ts);
`new_worksheet` registered in
[`integrations/google-sheets/triggers/newWorksheet/index.ts`](../../integrations/google-sheets/triggers/newWorksheet/index.ts).
**V2 Google Sheets trigger total after 2.3: 2** (1 Slice 5 extended
+ 1 Sheets 2.3 new).

### Modules shipped (per-commit summary)

| Commit | What landed | Source line-count delta |
|---|---|---|
| 1 (`0481028bc`) | Plan doc only | — |
| 2 (`cd76cf03d`) | `_shared/snapshot.ts` (bounded-snapshot builder + key-mode + window metadata), `rowChanged/schema.ts` Zod input config, `rowChanged/activate.ts` seeds snapshot when `changeKinds` is extended | +320 source / +470 tests |
| 3 (`d454d3015`) | `_shared/snapshot.ts` (`findAdded` / `findUpdated` / `findRemoved` diff helpers + window-slide guard), `rowChanged/normalize.ts` (`updated` / `removed` event variants + `:changeKind:` infix eventId), `rowChanged/pull.ts` (extended snapshot-diff path branch) | +618 source / +1064 tests |
| 4 (`720d90180`) | New `triggers/newWorksheet/` directory (`activate`, `pull`, `normalize`, `deactivate`, `renew`, `index`, `schema`); `_shared/snapshot.ts` `WorksheetListSnapshot` + `findNewWorksheets`; `webhooks/receive.ts` dispatch by `eventType` | +732 source / +1097 tests |
| 5 (`618b63788`) | Mock Google server: `currentWorksheets` state, `__updateSheetRow` / `__deleteSheetRow` / `__insertSheetRow` / `__injectWorksheet` / `__renameWorksheet` control endpoints, `spreadsheets.get` reads `currentWorksheets`. E2E spec extended with 3 new tests across 2 new `test.describe` blocks. | +1046 e2e |
| 6 (this commit) | Outcomes retro + CLAUDE.md update | — |

### API wrappers + helpers

**Zero new wrappers.** `valuesGet` (Slice 5) covers the `row_changed`
pull path; `spreadsheetsGet` (Slice 5) covers the `new_worksheet`
activate + pull path; `changesGetStartPageToken` + `filesWatch` (Drive,
Slice 4) cover the watch transport. Every wrapper continues to honor
`GOOGLE_SHEETS_API_BASE` + canonical error mapping (401 →
`Unauthorized401Error`, 404 → `NotFoundError`, other non-2xx → tagged
`Error`).

### Manifest scope changes

**None.** Slice 5's existing
`https://www.googleapis.com/auth/spreadsheets` scope covers
`spreadsheets.get` (used by both pull paths). Drive's
`https://www.googleapis.com/auth/drive.readonly` scope (already
granted for `files.watch` + `changes.getStartPageToken` in Slice 5)
covers the watch transport. No OAuth flow, no scope widening, no
capability changes.

---

## 2. Durable decisions worth preserving

### 2.1 Bounded snapshot window — `snapshotRowLimit` capped at 10,000

V1's `googleSheetsRowSnapshot.rowHashes` was unbounded `O(rows ×
workflows)` — a 10,000-row CRM sheet × 20 workflows watching it ≈
16 MB of jsonb scattered across `trigger_resources.config` columns,
re-read on every webhook fire. Audit R-3.

V2's [`_shared/snapshot.ts:buildBoundedSnapshot`](../../integrations/google-sheets/triggers/_shared/snapshot.ts)
tracks at most `snapshotRowLimit` data rows — the LAST N (most
recent in sheet order). Schema enforces
`z.number().int().min(100).max(10000).default(1000)`. Hard maximum
above 10,000 requires a code change — no schema escape hatch. The
audit's R-3 risk is closed by the cap.

Workflow authors that need to track older rows raise the cap up to
10,000 explicitly. Beyond that, the limitation is documented (R-2
in the plan): updates to rows BEFORE the window start are silently
un-tracked. The bounded-window design accepts this trade for the
storage-cost ceiling.

### 2.2 Strict overflow rejection at activate time (D-OverflowAtActivate)

[`buildBoundedSnapshot`](../../integrations/google-sheets/triggers/_shared/snapshot.ts)
throws `SnapshotOverflowError` when the sheet's data-row count
exceeds `snapshotRowLimit × 2`. Activation propagates the throw → the
lifecycle surfaces `TRIGGER_REGISTRATION_FAILED` → the workflow
author sees a clear error in the builder and raises the cap
explicitly. Mirrors V2's general "fail loud, don't silently truncate"
stance + Excel's accepted activation-time rejection. NOT silent
truncation, NOT auto-raise.

Sheets with `currentRowCount ∈ (snapshotRowLimit, snapshotRowLimit × 2]`
are accepted at activate time but only the last `snapshotRowLimit`
rows enter the snapshot. The `× 2` slack absorbs natural row-count
oscillation between activation and the first webhook fire without
adding complex re-activation logic. Beyond `× 2`, the author must
explicitly raise the cap.

### 2.3 Positional default + opt-in `keyColumn` (D-PGS1 option e)

`keyColumn` is optional (`null` default). When unset, snapshot keys
are 1-indexed SHEET row numbers as strings (header-inclusive
numbering — sheet row 1 stays row 1 regardless of `headerRow`).
Mid-sheet inserts/deletes shift positional keys, so they look like
`updated` + `added` / `removed` from the diff. **Accepted limitation
— same as Excel `updated_row`** and V1's poller behavior.

When set, the column NAME (string) is matched in the header row,
its CELL VALUE per row becomes the snapshot key (coerced to
string). Stable identity across mid-sheet shifts. `keyColumn`
requires `headerRow: true` enforced at schema time via `.refine`.
Mirrors Excel's `updated_table_row` cleaner-identity alternative.

The 2.3 e2e at
[`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts)
test 2 pins the contrast: insert a row above existing alice + bob
rows, then update bob's row → keyColumn mode fires exactly 2 events
(added carol + updated bob), positional mode would fire 3+ events
(added carol + updated alice + updated bob from the shift). The
load-bearing assertion: `keyValues` does NOT contain alice's email.

### 2.4 `keyColumn` duplicate values — last-write-wins + structured warn

`keyColumn` cell values are NOT enforced unique. Real-world sheets
often have duplicate emails / ids / names. The snapshot builder
applies **last-write-wins** within a single snapshot — a later row
with the same key overwrites the earlier hash + entry. The diff's
`updated` check looks at the surviving entry only. The
`duplicateKeyCount` field surfaces to the pull layer which emits a
structured `sheets.pull.keycolumn_duplicate` warning log. The
trigger does NOT abort.

This is a pragmatic choice: alerting on every duplicate would block
workflows for sheets with intentional duplicates (multi-row records,
mailing-list dupes). The structured log gives operators observability
without breaking the runtime. Documented in the schema doc-comment
and plan §R-6.

### 2.5 `keyColumn` empty values are skipped, not zero-keyed

Rows whose `keyColumn` cell is `undefined`, `null`, or `""` are
EXCLUDED from the snapshot entirely (NOT keyed as the empty
string). The `emptyKeyCount` field is surfaced for diagnostic
purposes only. Workflow authors who care about empty-key rows
either switch to positional mode or fill the keyColumn upstream.

### 2.6 Window-slide vs genuine removal (D-RemovedWindowSlide)

In POSITIONAL mode, a previous key absent from the current snapshot
is EITHER genuinely deleted (key past the current sheet's end) OR
slid out of the front of the window (sheet grew past the cap; the
row still exists but isn't tracked anymore). Only genuine deletion
fires `removed`. Slide artifacts are silently un-tracked.

[`_shared/snapshot.ts:findRemoved`](../../integrations/google-sheets/triggers/_shared/snapshot.ts)
delegates to `isWindowSlideArtifact` which checks the previous key
against `current.windowStart` and `current.windowEnd`:
- `keyNum > current.windowEnd` → past the sheet's new end → genuine.
- `keyNum < current.windowStart` AND windowStart > 1 → slide artifact → suppress.
- `keyNum ∈ [windowStart, windowEnd]` AND missing from current → genuine in-window removal.

In KEYCOLUMN mode, there's no window concept — every previous key
absent from current is a genuine removal (the row was deleted OR
the keyColumn cell value changed; both effectively destroy the
identity). `isWindowSlideArtifact` returns `false` unconditionally.

The window-slide e2e coverage was deferred to unit-only
([`tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts`](../../tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts))
because reproducing it from e2e requires pre-populating 200+ rows
to push the sheet past `snapshotRowLimit × 2`. The unit tests cover
the diff helper branching; the e2e covers the engine plumbing.

### 2.7 `previousValues: null` placeholder (D-PreviousValues)

`updated` events ship `previousValues: null` per accepted
D-PreviousValues. The snapshot stores hashes only — preserving
prior values would roughly double the per-trigger jsonb size (~160 KB
at default cap). Workflow authors who need previous values raise a
follow-up; the field is reserved in the payload for forward compat.
Honest about what's stored; V1's outputSchema documented
`previousValues` aspirationally but the poller never actually
preserved them. V2 surfaces the placeholder explicitly so workflow
code can branch on `payload.previousValues == null` (always true
today).

### 2.8 Event ID format — backwards-compat for legacy + new for extended (D-EventId)

Two formats, branched on the workflow's `changeKinds`:

| Workflow shape | EventId format |
|---|---|
| `changeKinds = ["added"]` (default, Slice 5 legacy) | `${spreadsheetId}:${sheetName}:${rowIndex}:${sha256(values).slice(0,12)}` — Slice 5 byte-for-byte |
| `changeKinds` includes `updated` or `removed` (Sheets 2.3) | `${spreadsheetId}:${sheetName}:${changeKind}:${key}:${sha256(values).slice(0,12)}` — adds the `:changeKind:` infix |

The legacy added-only format stays unchanged so existing dedup
rows in `webhook_event_dedup` continue to match. The infix
prevents an `added` event for row N colliding with a hypothetical
later `updated` for that row (different rows, same key, different
content → distinct eventIds). For `removed` events, the hash
component is the LAST-KNOWN pre-removal hash so the same removal
fired twice dedupes naturally.

`useLegacyEventId` is selected by the pull path:
- Count-delta fast path (legacy added-only): `useLegacyEventId: true`.
- Snapshot-diff path (extended changeKinds): `useLegacyEventId: false`.

[`rowChanged/normalize.ts`](../../integrations/google-sheets/triggers/rowChanged/normalize.ts)
documents both formats.

### 2.9 Snapshot persistence + retry semantics

`rowChanged/pull.ts` updates `trigger_resources.config.snapshot` and
`config.lastRowCount` after EACH successful pull. Failure
propagates — the receive route returns 5xx and Google retries; the
next attempt re-builds the snapshot and re-emits events.
`webhook_event_dedup` catches the retries via the snapshot-keyed
eventId. `lastRowCount` is kept in sync alongside `snapshot` so any
downstream code reading the legacy field still sees a sane value
during the rollout.

### 2.10 Backwards-compatible fast path for legacy added-only rows

[`rowChanged/pull.ts`](../../integrations/google-sheets/triggers/rowChanged/pull.ts)
branches on `changeKinds`:
- Default `["added"]` (or undefined, for pre-2.3 trigger rows that
  were activated before this slice landed) → count-delta fast path,
  no snapshot read, no diff helper invocation.
- Any other value → snapshot-diff path with all three diff helpers.

[`rowChanged/activate.ts`](../../integrations/google-sheets/triggers/rowChanged/activate.ts)
seeds the snapshot ONLY when
`requiresExtendedSnapshot(config)` is true. The persisted config
shape stays byte-for-byte Slice 5 when `changeKinds = ["added"]`
(no `snapshot` field at all, NOT `snapshot: null`) so existing rows
are indistinguishable from new ones using the default. Zero
migration required.

### 2.11 `new_worksheet` rides the same Drive watch (D-NewWorksheetTransport)

Sheets has no native push notifications for worksheet additions.
The accepted transport is Drive `files.watch` against the
spreadsheet's fileId — the same channel `row_changed` uses. The
watch fires on tab additions because tab additions bump the
spreadsheet's `modifiedTime`. Each `new_worksheet` trigger node
gets its own channel (channelId = `chainreact-${node.id}-${uuid}`)
so the receive route's `triggerResourcesRepo.listByConfigContains`
lookup uniquely resolves the receiving trigger. Renewal cron
handles both trigger types via the shared
`type: "subscription-watch"` tag (no per-eventType cron paths).

`new_worksheet` does NOT polling-fall-back. The polling registry
is untouched.

### 2.12 `new_worksheet` baseline + rename behavior

[`newWorksheet/activate.ts`](../../integrations/google-sheets/triggers/newWorksheet/activate.ts)
seeds `worksheetSnapshot.names` via `spreadsheets.get(includeGridData=false)`
with `fields=sheets(properties(sheetId,title,index,sheetType))`.
Existing worksheets at activate time become the "do not fire for
these" set — only worksheets created AFTER activation generate
events. Closes V1's "first poll miss" lesson.

Rename appears as `{remove old name, add new name}` from
`spreadsheets.get`'s perspective and fires ONE event for the NEW
name. Matches V1 poller + Excel `new_worksheet` documented
behavior. Documented in
[`newWorksheet/pull.ts`](../../integrations/google-sheets/triggers/newWorksheet/pull.ts)
+ [`newWorksheet/schema.ts`](../../integrations/google-sheets/triggers/newWorksheet/schema.ts).

The rename scenario is unit-tested at
[`tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts`](../../tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts)
(`findNewWorksheets` with renamed pairs). The mock control endpoint
`__renameWorksheet` exists for future e2e expansion but the e2e
focuses on the baseline + add cycle per the plan §8.

### 2.13 `new_worksheet` eventId distinguishes sheetId + name

[`newWorksheet/normalize.ts`](../../integrations/google-sheets/triggers/newWorksheet/normalize.ts):
`eventId = ${spreadsheetId}:new_worksheet:${sheetId}:${nameHash}`

- The `sheetId` participation makes the eventId stable across
  notifications for the same logical worksheet — Sheets fires
  multiple watch notifications per workbook change and the
  dispatcher dedups via `(provider, eventId)`.
- The `nameHash` (12 chars of SHA-256 over the JSON-encoded name)
  distinguishes a true rename (sheetId unchanged, name changed)
  from a re-fire of the same name. Delete-then-recreate of a sheet
  with the same name fires fresh because Sheets assigns a new
  sheetId per creation.

### 2.14 Bounded `new_worksheet` payload — no raw `sheets[]` spread

[`newWorksheet/normalize.ts`](../../integrations/google-sheets/triggers/newWorksheet/normalize.ts)
emits exactly:

```ts
{
  changeKind: "added",
  spreadsheetId: string,
  worksheetId: number,    // numeric sheetId from spreadsheets.get
  worksheetName: string,  // sheet title at the moment of pull
  index: number | null,   // workbook position (0-indexed)
  sheetType: string | null,
}
```

NO raw `properties` spread, NO `gridProperties` leak, NO `dataSourceSheet`
or `chartId` Google-internal fields. The bounded projection mirrors
the Sheets 2.2 §2.14 rule (`format_range` `appliedFormat`) and the
Sheets 2.2 §2.5 rule (`batch_update` `responses`).

### 2.15 Webhook receive route routes by `event_type`

[`integrations/google-sheets/webhooks/receive.ts`](../../integrations/google-sheets/webhooks/receive.ts)
looks up the trigger row via the channelId, then dispatches by
`trigger.eventType` to the right pull function:
- `row_changed` → `rowChangedPull`
- `new_worksheet` → `newWorksheetPull`
- unknown → structured `sheets.receive.unknown_event_type` warn log
  + 200 ack (avoids Google retries during transient mismatch).

Resource-state (`add` / `change` / `remove` / `update`) is NOT used
to discriminate because each pull function handles all relevant
change kinds via its own snapshot comparison — Sheets' notification
doesn't tell us WHAT inside the spreadsheet changed, just THAT it
did. Pull figures it out.

### 2.16 Per-run randomized e2e values (continues Sheets 2.2 §2.16 rule)

Sheets 2.2 §2.16 pinned the rule: chained e2e tests MUST use per-run
randomized trigger row values to avoid `webhook_event_dedup`
cross-run collisions. Sheets 2.3 extends this to ALL e2e additions:
- `row_changed` extended test: row values carry `runId = randomUUID()`
  suffixes (`a-${runId}`, `b-${runId}`, `c-${runId}`).
- `keyColumn` test: email values carry `runId` suffixes
  (`alice-${runId}@e2e.test` etc).
- `new_worksheet` test: both the spreadsheetId
  (`ss-2.3-newws-${runId}`) AND the injected worksheet name
  (`Reports-${runId}`) carry `runId` suffixes — the worksheet
  eventId hash component is the name, so without randomization the
  second e2e run hits dedup and the dispatcher drops the event
  silently.

### 2.17 `lastRowCount` kept in sync alongside `snapshot`

Pull persists BOTH `snapshot` and `lastRowCount` after the
snapshot-diff path, even though the snapshot-diff path's diff
helpers don't consume `lastRowCount`. Reason: future
operator-tooling or migration scripts that read the legacy field
should see a sane value, not a stale one frozen at activate time.
The two fields drift apart only when the sheet is read between
two diff cycles AND the dispatcher fails — both pull paths
re-persist on success. Cheap insurance.

### 2.18 Pull's structured logs for diagnostic signals

[`rowChanged/pull.ts`](../../integrations/google-sheets/triggers/rowChanged/pull.ts)
emits structured logs (JSON-stringified single-line) for diagnostic
events that don't block dispatch:
- `sheets.pull.row_count_decreased` (count-delta fast path only —
  the legacy added-only path can't tell deletions from inserts).
- `sheets.pull.no_snapshot` (snapshot-diff path — activate didn't
  seed; `resyncRequired: true`).
- `sheets.pull.keycolumn_duplicate` (snapshot-diff path —
  `duplicateKeyCount > 0`, includes the count + keyColumn value).

These are operator signals, not workflow-author signals — they
don't surface in run history. `payload.changeKind` and friends
are the workflow-author surface.

---

## 3. V1 rot fixed (consolidated)

All entries from plan §3 + §9 D-PGS1 are addressed:

| ID | Pattern | V2 status |
|---|---|---|
| GS-R7 (audit) | V1 unbounded `googleSheetsRowSnapshot.rowHashes` — `O(rows × workflows)` storage cost | FIXED — bounded `snapshotRowLimit` (default 1,000, max 10,000) with strict overflow rejection at activate time. |
| GS-R22 (new this slice) | V1 polling-based Sheets triggers (registered only under the polling branch of `GoogleApisTriggerLifecycle`) | NOT PORTED — V2 stays on Drive `files.watch` push transport (lower latency, shared channel per spreadsheet). |
| GS-R23 (new this slice) | V1 `hasHeaders` / `skipEmptyRows` / `requiredColumns` filter chrome on `googleSheetsRowSnapshot` poller | NOT PORTED — V2 `RowChangedInputConfigSchema` is `.strict()` and rejects all three field names. Downstream filter-step composability instead. |
| GS-R24 (new this slice) | V1 separate `google_sheets_trigger_new_row` / `google_sheets_trigger_updated_row` trigger types | NOT PORTED — folded into one `row_changed` trigger with `changeKinds` array (audit §7 §13 explicitly recommends this). |
| GS-R25 (new this slice) | V1 `googleSheetsRowSnapshot` first-poll-establishes-baseline (no activation hook → "first poll miss" bug) | NOT PORTED — V2 activate seeds the snapshot strictly. Matches Slice 2f (Gmail) Phase 1 lesson. |
| GS-R26 (new this slice) | V1 `previousValues` documented in outputSchema but never actually computed (aspirational) | NOT PORTED — V2 `previousValues: null` placeholder per D-PreviousValues. Honest about what's stored. |
| GS-R27 (new this slice) | V1 `changedColumns` documented in outputSchema but never computed (aspirational) | NOT PORTED — V2 doesn't ship the field at all. Forward-compat extension if a workflow needs it. |
| GS-R28 (new this slice) | V1 unbounded `googleSheetsWorksheetSnapshot` with per-sheetId entries | NOT PORTED — V2 ships name-list-only snapshot (`{names: string[], updatedAt}`). Worksheet count maxes in the low hundreds in practice; unbounded name list is acceptable here unlike row count. |
| GS-R29 (new this slice) | V1 `google_sheets_trigger_new_worksheet` separate trigger type with V1 polling chrome | NOT PORTED — V2 ships as a separate trigger but on the Drive watch transport, not polling. Same `subscription-watch` renewal cron handles both Sheets triggers. |

---

## 4. Files shipped

### Source

**Shared snapshot infrastructure (Commits 2 + 3 + 4):**
- [`integrations/google-sheets/triggers/_shared/snapshot.ts`](../../integrations/google-sheets/triggers/_shared/snapshot.ts) — `BoundedSnapshot` + `buildBoundedSnapshot` + `findAdded` / `findUpdated` / `findRemoved` + `WorksheetListSnapshot` + `buildWorksheetListSnapshot` + `findNewWorksheets` + sentinel error types.

**`row_changed` extension (Commits 2 + 3):**
- [`integrations/google-sheets/triggers/rowChanged/schema.ts`](../../integrations/google-sheets/triggers/rowChanged/schema.ts) — strict Zod schema, `RowChangedInputConfig`, `requiresExtendedSnapshot` predicate.
- [`integrations/google-sheets/triggers/rowChanged/activate.ts`](../../integrations/google-sheets/triggers/rowChanged/activate.ts) — extended with conditional snapshot seeding.
- [`integrations/google-sheets/triggers/rowChanged/pull.ts`](../../integrations/google-sheets/triggers/rowChanged/pull.ts) — two-branch dispatch (legacy fast path vs snapshot-diff).
- [`integrations/google-sheets/triggers/rowChanged/normalize.ts`](../../integrations/google-sheets/triggers/rowChanged/normalize.ts) — extended with `updated` / `removed` variants + `useLegacyEventId` option.

**`new_worksheet` (Commit 4 — NEW directory):**
- [`integrations/google-sheets/triggers/newWorksheet/schema.ts`](../../integrations/google-sheets/triggers/newWorksheet/schema.ts)
- [`integrations/google-sheets/triggers/newWorksheet/activate.ts`](../../integrations/google-sheets/triggers/newWorksheet/activate.ts)
- [`integrations/google-sheets/triggers/newWorksheet/pull.ts`](../../integrations/google-sheets/triggers/newWorksheet/pull.ts)
- [`integrations/google-sheets/triggers/newWorksheet/normalize.ts`](../../integrations/google-sheets/triggers/newWorksheet/normalize.ts)
- [`integrations/google-sheets/triggers/newWorksheet/deactivate.ts`](../../integrations/google-sheets/triggers/newWorksheet/deactivate.ts)
- [`integrations/google-sheets/triggers/newWorksheet/renew.ts`](../../integrations/google-sheets/triggers/newWorksheet/renew.ts)
- [`integrations/google-sheets/triggers/newWorksheet/index.ts`](../../integrations/google-sheets/triggers/newWorksheet/index.ts) — module-init registration.

**Receive route (Commit 4):**
- [`integrations/google-sheets/webhooks/receive.ts`](../../integrations/google-sheets/webhooks/receive.ts) — dispatch by `trigger.eventType`.

**Registry (Commit 4):**
- [`integrations/_registry.ts`](../../integrations/_registry.ts) — added side-effect import for `newWorksheet/index.ts`.

### Tests

**Unit (Commits 2 + 3 + 4):**

| Suite | Tests |
|---|---|
| `triggers/_shared/snapshot.test.ts` | 60+ (positional + keyColumn + window-slide + worksheet-list helpers) |
| `triggers/rowChanged/schema.test.ts` | 30+ (default values + strict-rejection + `keyColumn-requires-headerRow` refine) |
| `triggers/rowChanged/activate.test.ts` | 20+ (conditional snapshot seeding + overflow throw + Drive watch creation) |
| `triggers/rowChanged/pull.test.ts` | 30+ (legacy fast path + snapshot-diff path + persistence + structured logs) |
| `triggers/rowChanged/normalize.test.ts` | 15+ (legacy + extended eventId formats; both `useLegacyEventId` settings) |
| `triggers/newWorksheet/{schema,activate,pull,normalize,deactivate,renew}.test.ts` | 80+ across 6 files |
| `webhooks/receive.test.ts` | extended with `event_type` dispatch coverage |

**Google Sheets focused subset after Commit 4: 40 suites / 545 tests passing**
(`npx jest tests/unit/integrations/google-sheets/ tests/unit/services/triggers/`).

**Full jest suite after Commit 5: 658 suites / 6404 tests passing**
(`npm test`).

### E2E (Commit 5)

- [`tests/e2e/helpers/mockGoogleServer.ts`](../../tests/e2e/helpers/mockGoogleServer.ts) extended with:
  - `MockWorksheet` interface + `currentWorksheets` state (seeded with `[{sheetId:0,title:"Sheet1",index:0,sheetType:"GRID"}]` so existing Sheets 2.1 + 2.2 tests keep their canonical mapping).
  - `spreadsheets.get` builds `sheets[]` from `currentWorksheets`.
  - `__updateSheetRow` / `__deleteSheetRow` / `__insertSheetRow` / `__injectWorksheet` / `__renameWorksheet` control endpoints.
  - `currentWorksheets` + `currentWorksheetCount` in `__inspect`.
- [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) extended with TWO new `test.describe` blocks:
  - **"Sheets 2.3 — row_changed extended changeKinds e2e"** — 2 tests:
    - `added/updated/removed` walkthrough (pre-populate 2 rows, activate, inject row → fire `added`, update row → fire `updated`, delete row → fire `removed`). Asserts 3 workflow_runs with matching changeKinds, distinct eventIds carrying `:<kind>:` infix, full payload shape (rowIndex, rowKey, keyColumn=null, keyValue=null, rowValues for added/updated, null rowValues for removed, previousValues always null). 3 action calls total.
    - keyColumn stable identity walkthrough (pre-populate header + alice + bob, activate with `keyColumn: "Email"`, insert carol at row 2 shifting alice/bob → fire 1 event for carol only, update bob → fire 1 event for bob only; load-bearing assertion: no event with alice's email keyValue). 2 action calls total.
  - **"Sheets 2.3 — new_worksheet trigger e2e"** — 1 test:
    - Activate with default Sheet1 baseline, baseline webhook → 0 runs, inject `Reports-${runId}` → 1 run with full payload (`changeKind:"added"`, `worksheetId`, `worksheetName`, `index`, `sheetType`), `worksheetSnapshot.names` updates, second webhook with unchanged state → no new run.

**Google Sheets e2e total after Sheets 2.3: 6 tests / 6 passing**
under `--workers=1` in ~1.1m
(3 existing 2.1/2.2 + 3 new 2.3).

### Docs

- [`docs/slices/google-sheets-2-3-triggers-plan.md`](google-sheets-2-3-triggers-plan.md) (Commit 1 — plan)
- This file (Commit 6)
- CLAUDE.md updates (Commit 6)

---

## 5. Commit breakdown (6)

| # | Commit hash | What landed |
|---|---|---|
| 1 | `0481028bc` | `docs(google-sheets): plan 2.3 trigger expansion` |
| 2 | `cd76cf03d` | `feat(google-sheets): add bounded trigger snapshots` (`_shared/snapshot.ts` builder + schema + activate snapshot seed) |
| 3 | `d454d3015` | `feat(google-sheets): add row update and removal diffs` (`_shared/snapshot.ts` diff helpers + window-slide guard + `normalize.ts` variants + `pull.ts` two-branch dispatch) |
| 4 | `720d90180` | `feat(google-sheets): add new worksheet trigger` (`triggers/newWorksheet/` directory + `worksheetListSnapshot` helpers + `webhooks/receive.ts` event_type dispatch) |
| 5 | `618b63788` | `test(google-sheets): extend walkthrough with 2.3 triggers` (mock additions + 3 new e2e scenarios with per-run randomized values) |
| 6 | (this commit) | `docs(google-sheets): document 2.3 outcomes` |

Each implementation commit individually passed gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/google-sheets/ tests/unit/services/triggers/`
- `npm test`
- (Commit 5 also) `CI=1 npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts --workers=1` — twice for cross-run stability

Final test totals after Commit 5: **658 suites / 6404 tests passing**
(jest). Google Sheets focused subset: **40 suites / 545 tests passing**.
Sheets trigger subset: **12 suites / 243 tests passing**. Google Sheets
e2e: **6 tests / 6 passing**.

---

## 6. Acceptance criteria (post-merge)

- [x] `row_changed` emits `changeKind: "added" | "updated" | "removed"` per the workflow's `changeKinds` array.
- [x] Default `changeKinds = ["added"]` preserves Slice 5 legacy behavior + eventId format byte-for-byte.
- [x] Bounded `snapshotRowLimit` (default 1,000, max 10,000) enforced at schema time.
- [x] Activation throws `SnapshotOverflowError` when sheet exceeds `snapshotRowLimit × 2` (D-OverflowAtActivate).
- [x] `keyColumn` opt-in for stable identity; `.refine` enforces `headerRow: true` precondition.
- [x] Positional mode default + documented R-1 shift limitation.
- [x] `keyColumn` duplicates: last-write-wins + structured `sheets.pull.keycolumn_duplicate` warn log.
- [x] `keyColumn` empty cells excluded from snapshot entirely.
- [x] Window-slide vs genuine-removal distinguished in `findRemoved` (D-RemovedWindowSlide).
- [x] `previousValues: null` placeholder (D-PreviousValues).
- [x] Extended `changeKinds` eventId carries `:changeKind:` infix (D-EventId).
- [x] Snapshot helpers (`buildBoundedSnapshot`, `findAdded`, `findUpdated`, `findRemoved`, `buildWorksheetListSnapshot`, `findNewWorksheets`) extracted + unit-tested as pure functions.
- [x] Backwards-compat fast path for legacy added-only rows — `lastRowCount` count-delta path preserved when `changeKinds` is default or absent.
- [x] `new_worksheet` trigger shipped with Drive `files.watch` reuse (D-NewWorksheetTransport).
- [x] `new_worksheet` activation seeds `worksheetSnapshot.names` baseline so existing tabs don't fire.
- [x] `new_worksheet` rename treated as `{remove old, add new}` and fires ONE event for new name.
- [x] `new_worksheet` eventId distinguishes sheetId + name via `${spreadsheetId}:new_worksheet:${sheetId}:${nameHash}`.
- [x] `new_worksheet` payload is bounded — `{changeKind, spreadsheetId, worksheetId, worksheetName, index, sheetType}` only, no raw `sheets[]` spread.
- [x] Receive route routes by `trigger.eventType` (`row_changed` → `rowChangedPull`, `new_worksheet` → `newWorksheetPull`).
- [x] Renewal cron handles both trigger types via shared `type: "subscription-watch"` tag.
- [x] E2E walkthrough extended: 6 tests / 6 passing under `--workers=1` (3 existing + 3 new).
- [x] Every chained e2e test uses per-run randomized trigger values (continues Sheets 2.2 §2.16 rule).
- [x] V1 rot fixed: GS-R7 (unbounded snapshot) closed by bounded window; GS-R22 / R23 / R24 / R25 / R26 / R27 / R28 / R29 explicitly NOT ported.
- [x] tsc clean. lint clean (only pre-existing warning). lint:structure + lint:migrations clean.

---

## 7. What's deferred

### Carried forward from Sheets 2.2 (untouched in 2.3)

| Item | Why |
|---|---|
| `format_range` additional options (borders, conditional formatting, data validation, fontSize, verticalAlignment, wrapStrategy, strikethrough, underline) | Same on-demand follow-up rule. Non-breaking to add as optional fields on `FormatRangeConfigSchema`. |
| `find_row` operator expansion (`contains` / `starts_with` / `greater_than` / etc) | Same on-demand rule. `operator: z.literal("equals")` forward-compat enum. |

### Permanently skipped (Sheets 2.3 specific)

| Item | Reason |
|---|---|
| V1 unbounded `googleSheetsRowSnapshot.rowHashes` shape | Audit R-3. Bounded window is the load-bearing decision of this slice. |
| V1 polling-only Sheets triggers | V2 shipped webhook in Slice 5 (lower latency, shared channel). |
| V1 `skipEmptyRows` filter | UI chrome. Downstream filter step composable. |
| V1 `requiredColumns` filter | UI chrome. Downstream filter step composable. |
| V1 separate `google_sheets_trigger_new_row` + `google_sheets_trigger_updated_row` trigger types | Folded into one `row_changed` trigger with `changeKinds` array per audit §7 §13. |
| V1 first-poll-establishes-baseline (no activation hook) | "First poll miss" bug. V2 activate seeds snapshot strictly. |
| V1 `previousValues` outputSchema field (aspirational, never actually computed) | V2 ships `previousValues: null` placeholder honestly. |
| V1 `changedColumns` outputSchema field (aspirational, never actually computed) | V2 doesn't ship the field. Forward-compat extension if a workflow needs it. |
| Sheets 2.3 `previousValues` real storage (D-PreviousValues option b) | Storage cost doubles (~160 KB per trigger at default cap). Defer to follow-up when a real workflow needs it. |
| Sheets 2.3 `keyColumn` collision-handling expansion (alert on duplicates, abort on collision, etc) | Last-write-wins + structured warn log is sufficient for the V2 baseline. Workflow-author-facing collision UI deferred to on-demand follow-up. |
| `new_worksheet` polling fallback | D-NewWorksheetTransport accepted (a) Drive watch. No second path. |
| Window-slide e2e coverage | Requires pre-populating 200+ rows to exceed `snapshotRowLimit × 2`. Unit tests cover the diff helper branching ([`_shared/snapshot.test.ts`](../../tests/unit/integrations/google-sheets/triggers/_shared/snapshot.test.ts)); e2e covers the engine plumbing. |
| `new_worksheet` rename e2e coverage | The mock `__renameWorksheet` endpoint exists for future expansion. Unit-tested at `findNewWorksheets` level. Real-world rename behavior is identical to "add new name" from the diff's perspective; e2e covers the more-common new-tab path. |
| `row_changed` Q4 session-side-effect idempotency for trigger events | Deferred at the V2 engine level pending a broader slice — matches Sheets 2.1 + 2.2 stance. |

### Carried forward from prior slices (untouched in 2.3)

| Item | Why |
|---|---|
| Sheets 2.1 + 2.2 actions (12 total) | Already shipped at the durable-rule baseline; this slice did not regress them. |
| Slice 5 baseline (`row_changed` count-delta fast path for `changeKinds = ["added"]`) | Preserved byte-for-byte for backwards compat. |
| V1 rot entries GS-R1 through GS-R21 | Already addressed in Sheets 2.1 + 2.2 outcomes. |
| Drive watch transport + channel renewal cron + `webhook_event_dedup` | Reused unchanged. |

---

## 8. CLAUDE.md updates landed

The existing "Phase 2 progress (Google Sheets)" bullet is extended
with a Google Sheets 2.3 entry (trigger expansion + new_worksheet,
bounded snapshot infrastructure, V2 Google Sheets trigger total now
2). The existing "Google Sheets Phase 2 patterns" Deep Gotchas
section gains a new short subsection documenting:

- Bounded `snapshotRowLimit` is the load-bearing decision; V1's
  unbounded shape is rejected (GS-R7 closed).
- Default `changeKinds = ["added"]` preserves Slice 5 byte-for-byte;
  any other value enters the snapshot-diff path.
- `keyColumn` opt-in for stable identity; requires `headerRow: true`
  enforced by `.refine`.
- `previousValues: null` is the honest placeholder; real prior-value
  storage deferred.
- Receive route dispatches by `trigger.eventType`; the same Drive
  watch channel handles both Sheets triggers.
- Window-slide vs genuine-removal distinguished in `findRemoved` —
  positional mode only; keyColumn mode treats every absent key as
  genuine removal.

---

## 9. What's next (Google Sheets roadmap)

Per parity-google-sheets §13 (still current after Sheets 2.3):

- **On-demand follow-ups** when real workflows ask:
  - `format_range` borders / conditional formatting / data validation / fontSize / verticalAlignment / wrapStrategy / strikethrough / underline (Sheets 2.2 deferred list).
  - `find_row` operator expansion (`contains` / `starts_with` / `greater_than`).
  - `previousValues` real storage on `row_changed` `updated` events (D-PreviousValues option b).
- **No Sheets-side platform tier remains.** P-GS1 collapsed into
  Sheets 2.3 itself. P-GS2 collapsed into Sheets 2.2. The Google
  Sheets parity arc closes once this outcomes commit lands.

**Google Sheets 2.3 is complete pending Marcus's acceptance of this
outcomes commit.**
