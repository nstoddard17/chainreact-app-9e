# Google Sheets 2.3 — Trigger expansion + P-GS1 plan

**Status:** Plan / not yet implementing runtime code. **Doc-only commit.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-google-sheets.md`](parity-google-sheets.md) (accepted before Sheets 2.1; §10 enumerated P-GS1 options).
**Predecessor outcomes:** [`docs/slices/google-sheets-2-1-outcomes.md`](google-sheets-2-1-outcomes.md), [`docs/slices/google-sheets-2-2-outcomes.md`](google-sheets-2-2-outcomes.md).
**Phase 1 predecessor:** [`docs/slices/slice-5-google-sheets.md`](slice-5-google-sheets.md) — `row_changed` baseline (`changeKind: "added"` only).
**Cross-provider reference:** [`docs/slices/microsoft-excel-parity-outcomes.md`](microsoft-excel-parity-outcomes.md) §§2.7–2.9 — accepted positional-shift limitation on `updated_row` + stable-identity `updated_table_row` alternative.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/google-sheets/`](../../integrations/google-sheets/).

Google Sheets 2.3 closes the remaining trigger gap from the parity
audit §7: extend the existing `row_changed` webhook-based trigger to
emit `changeKind: "updated"` + `"removed"` (gated by **P-GS1**
per-row diff detection design) and add `new_worksheet` as a
separate trigger. The slice is **bounded by design** — the audit's
R-3 risk (unbounded `O(rows × workflows)` snapshot cost) is the
single biggest reason this work was deferred behind Sheets 2.1 and
2.2.

The recommended path keeps trigger infrastructure on the existing
**Drive `files.watch` webhook transport** — no polling. Adds a
bounded **last-N-rows snapshot window** (default 1,000, max 10,000)
keyed positionally (mirrors Excel's `updated_row` accepted
limitation) with an optional explicit `keyColumn` for workflows that
need stable row identity across mid-sheet inserts/deletes (mirrors
Excel's `updated_table_row` cleaner-identity alternative). Removed
rows fire on positional gap detection. `new_worksheet` rides the
same Drive watch channel — when the spreadsheet's `modifiedTime`
bumps for any reason, the receive route re-polls the worksheet list
and diffs against the prior snapshot.

The slice ships **no new platform infrastructure** beyond a small
extension to `triggers/rowChanged/` (snapshot helpers, expanded
normalize) and a new `triggers/newWorksheet/` directory. No new
wrappers — existing `valuesGet` + `spreadsheetsGet` cover both pull
paths. The existing webhook receive route at
`/api/webhooks/google-sheets` continues to dispatch all Sheets
events.

---

## 1. Current V2 Google Sheets trigger surface

### What's shipped

| Trigger | Transport | Activation | Pull | Normalize | Event IDs |
|---|---|---|---|---|---|
| `row_changed` (`changeKind: "added"` only) | Drive `files.watch` push notifications on the spreadsheet's `fileId` ([`integrations/google-sheets/triggers/rowChanged/activate.ts`](../../integrations/google-sheets/triggers/rowChanged/activate.ts)) | Snapshots `lastRowCount` via `values.get` on `<sheetName>!A:Z` + Drive `startPageToken` + creates the `files.watch` channel | Reads `values.get` on the same range; emits events for `rowIndex ∈ [lastRowCount, currentRowCount)`. Persists new `lastRowCount` regardless of direction (delete-then-readd correctness). | `${spreadsheetId}:${sheetName}:${rowIndex}:${sha256(JSON.stringify(values)).slice(0,12)}` per row | dedup-keyed via `webhook_event_dedup` |

### Snapshot storage shape today

`trigger_resources.config` for an active `row_changed` row:

```ts
{
  type: "subscription-watch",        // Renewal cron picks up rows with this tag
  webhookEnabled: true,
  spreadsheetId: string,
  sheetName: string,
  headerRow: boolean,                // Optional — sheet-row 1 surfaced in payload when true
  channelId: string,                 // chainreact-{nodeId}-{uuid}
  resourceId: string,                // Returned by files.watch
  pageToken: string,                 // Drive cursor; currently unused by pull
  lastRowCount: number,              // 0 at activate; increments as pull emits
  expiresAt: string,                 // ISO 8601 — drives the renewal cron
}
```

**Storage cost today: O(1) per workflow.** Just a row count. The
single biggest constraint Sheets 2.3 must respect when expanding
the snapshot shape.

### What `row_changed` already does correctly

- Activation seeds `lastRowCount` from the live sheet so the FIRST
  push notification doesn't backfill all pre-existing rows as new
  (closes V1's "first poll miss" bug; same invariant Excel pinned).
- Pull persists `lastRowCount` even when the count decreased — a
  delete-then-readd cycle correctly fires when the count comes back
  up.
- The `pageToken` Drive cursor is captured for future polling-mode
  parity but unused by the webhook pull path (pull reads `values.get`
  directly, which is cheaper than walking `changes.list`).
- `webhook_event_dedup` row written under
  `(provider='google-sheets', event_id='<spreadsheetId>:<sheetName>:<rowIndex>:<hash>')`
  guards against duplicate Google notifications for the same row.

### What `row_changed` does NOT do

- No `changeKind: "updated"` — value changes at an existing rowIndex
  are invisible to the pull (the row-count baseline doesn't shift).
- No `changeKind: "removed"` — row deletions just update
  `lastRowCount` downward; no event is emitted for the removed row.
- No `new_worksheet` trigger — Google Sheets users adding a tab
  generate a Drive `files.watch` notification (tab creation bumps
  `modifiedTime`), but V2 has no trigger registered for it.
- No per-row signature snapshot — pull only compares the row COUNT,
  not individual row contents.

---

## 2. V1 Google Sheets trigger surface

V1's three Sheets triggers live at [`lib/triggers/pollers/google-sheets.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/google-sheets.ts)
(394 LOC). All three are **polling-based** (no webhook transport
even though V1 had Drive watch infrastructure for other triggers
— V1's Sheets specifically chose polling, presumably because the
row-diff logic was easier to reason about as a polling cycle).

### The three V1 triggers

| V1 type | What it detects | Snapshot shape | Cadence | Filter chrome |
|---|---|---|---|---|
| `google_sheets_trigger_new_row` | First missing `row-N` key in the snapshot OR `currentRowCount > previousRowCount` | `googleSheetsRowSnapshot: { rowHashes: Record<string, string>, rowCount: number, updatedAt: string }` keyed by `row-${index}` (1-indexed, header-row skipped when `hasHeaders=true`) | 15 min (free) / 2 min (pro / beta-pro) / 1 min (business / enterprise / admin) | `skipEmptyRows` (default true), `requiredColumns` (multi-select header names — only fire when these columns are populated) |
| `google_sheets_trigger_updated_row` | Any `rowHashes[key]` whose hash differs from the previous snapshot | Same shape as new_row | Same | Same filter chrome |
| `google_sheets_trigger_new_worksheet` | Sheet titles present in the current `spreadsheets.get(includeGridData=false)` response but missing from the prior snapshot | `googleSheetsWorksheetSnapshot: { sheets: Array<{sheetId, title}>, sheetCount, updatedAt }` | Same | None |

### V1 design decisions worth noting

- **Polling, not webhook.** V1's `GoogleApisTriggerLifecycle.ts`
  registers `google-sheets` triggers exclusively under the polling
  branch. V2 deliberately chose webhook for Slice 5 (Drive's
  `files.watch` transport against the spreadsheet's fileId) because
  it's lower latency and one shared channel covers the spreadsheet.
- **Hash-per-row, unbounded.** Every row in the sheet gets a
  SHA-256 hash entry in `rowHashes`. A 10,000-row sheet × 20
  workflows watching it = 200,000 hash entries scattered across
  `trigger_resources.config` jsonb columns. The audit §10 R-3 risk
  was specifically about this design.
- **Header-row skip is convention.** When `hasHeaders=true` (V1
  default), row 1's hash is computed but the trigger never fires
  for it. V1's diff loop has explicit `rowId !== 'row-1'` guards.
- **First poll establishes baseline.** No activation hook — the
  first poll's snapshot becomes the baseline; events for that poll
  are dropped. V1's "first poll miss" bug is well-known and was
  explicitly closed in V2's Slice 2f (Gmail) by requiring activation
  to seed the snapshot.
- **`new_row` uses positional `row-N` keys.** Mid-sheet inserts
  shift all subsequent positional keys → the diff sees them as new
  rows → spurious "new row" events. V1 silently accepts this; Excel
  V2 ships the same accepted limitation for `updated_row` (NPD-T,
  Marcus 2026-05-14).
- **`updated_row` reports `previousValues: null` in the payload.**
  V1's outputSchema documents a `previousValues` field but the
  poller doesn't actually preserve it — it stores hashes only. The
  schema is aspirational, not real. V2 should NOT port this unless
  we ALSO store the prior row values (storage cost doubles).
- **`changedColumns` is in V1's outputSchema but never computed.**
  Same aspirational-but-not-implemented pattern.
- **No `removed_row` trigger.** V1 doesn't expose deletion as a
  trigger. The audit §7 calls this a port candidate; the
  recommendation below ships it.

### V1 row identity strategy

- **Positional only.** V1 keys hashes by 1-indexed `row-N`. No
  key-column option. Stable identity across mid-sheet inserts is
  not supported at all in V1.

### V1 filter chrome the audit deprioritizes

- `skipEmptyRows` — V1 default `true`. Adds a check on every diff
  iteration: skip when the row's values are all null/empty.
- `requiredColumns` — V1 multi-select against the header row.
  Only fire when these named columns have non-empty values after
  the change.

Both filters are **UI chrome that belongs to the workflow author's
downstream filter step**, not the trigger itself. Same skip pattern
the audit applied to V1's row-filter chrome on
`google_sheets_trigger_new_row`. Slice 2.3 ships neither.

---

## 3. Missing triggers (the 2.3 gap)

Per parity audit §7 trigger table:

| Gap | Type | Recommendation |
|---|---|---|
| `row_changed` `changeKind: "updated"` (in-place row value change) | Trigger expansion (same trigger type, new payload variant) | PORT — gated by P-GS1 design (this doc). |
| `row_changed` `changeKind: "removed"` (row deletion) | Trigger expansion (same trigger type, new payload variant) | PORT — gated by P-GS1. |
| `new_worksheet` (sheet tab added to spreadsheet) | New separate trigger type | PORT-WHEN-NEEDED. Cheap to add once the watch transport is reused. |
| `google_sheets_trigger_updated_row` V1 surface (separate trigger node) | V1 chrome | NOT PORTED — folded into `row_changed` per audit §7 §13 |
| `skipEmptyRows` / `requiredColumns` filter chrome | V1 UI chrome | NOT PORTED — composable downstream |

**Trigger surface after Sheets 2.3 ships:**
- `row_changed` with `changeKind: "added" | "updated" | "removed"` (one trigger, three event variants).
- `new_worksheet` (one separate trigger).

Webhook transport stays at the existing
`/api/webhooks/google-sheets` route. Both triggers ride the Drive
`files.watch` channel (one per trigger node, scoped to a
`spreadsheetId`).

---

## 4. P-GS1 design options

The audit §10 originally enumerated four options. This plan
re-evaluates each against the constraint "trigger expansion is
worth shipping only if it works at scale."

### (a) Per-row hash map in `trigger_resources.config` — unbounded V1 shape

**Storage cost:** `O(rows × workflows)`. Each `trigger_resources`
row's `config.snapshot.rowHashes` is a jsonb object with one entry
per data row. 10,000-row sheet × 20 workflows × ~80 bytes/hash
entry ≈ 16 MB scattered across rows. Realistic at small scale;
problematic at "10k-row CRM sheet watched by 50 workflows" scale.

**Failure modes:**
- Postgres `jsonb` column doesn't have a hard size limit but row
  size limits exist (~8 KB toast threshold).
- `trigger_resources` reads on every webhook fire — bigger jsonb
  means more I/O per dispatch.
- No natural upper bound forces growth review.

**Verdict:** REJECTED. The audit's R-3 risk is exactly this design.
We can't ship the trigger expansion on an architecture where the
storage cost is unbounded.

### (b) Bounded snapshot window — last N rows only

**Storage cost:** `O(N × workflows)` where N is a configurable cap
(default 1,000, max 10,000). 1,000 rows × 80 bytes ≈ 80 KB per
workflow trigger row. 20 workflows × 80 KB = 1.6 MB total across
all workflows watching that sheet.

**Failure modes:**
- Updates to rows BEFORE the window's start row are silently missed.
  The trigger config schema documents this; workflow authors that
  need to track older rows raise the cap (max 10,000) or use a
  different strategy (downstream filter on `read_rows`).
- A sheet that grows beyond the cap loses old-row tracking
  gradually — by design.
- Initial activation rejects loudly if the sheet exceeds the cap
  AT THAT MOMENT, so the workflow author makes the choice
  explicitly. (Alternative: silently track only the last N at
  activation; less honest.)

**Verdict:** RECOMMENDED. Audit §10 already recommends this. The
limitation is documentable and the storage cost is bounded.

### (c) In-memory diff — re-read full sheet on every webhook fire

**Storage cost:** 0 in `trigger_resources`. Each webhook fire reads
the full sheet, hashes every row, compares to the LAST_SEEN snapshot
in memory.

**Failure modes:**
- "Last seen" snapshot doesn't survive process restarts. After
  any deploy, the first webhook fire backfills nothing because
  there's no prior state.
- Or we store the snapshot in `trigger_resources.config` BUT
  re-read the entire sheet on every fire — that's option (b) with
  unbounded-N. Same cost.
- Re-reading a 10,000-row sheet on every webhook fire is
  `O(rows)` per dispatch. Sheets `values.get` is fast but not
  free; cron-renewal cost adds up.

**Verdict:** REJECTED. Doesn't actually solve the storage problem
(if persisted) and breaks across deploys (if in-memory).

### (d) Skip permanently — `row_changed` stays added-only forever

**Storage cost:** 0 (current state).

**Failure modes:** Workflow authors that want "fire when this row
gets updated" or "fire when this row gets deleted" have no
provider-native mechanism. They'd build a polling workflow on top
of `read_rows` + `find_row` and downstream filter steps.

**Verdict:** REJECTED unless Marcus decides trigger demand isn't
strong enough. The point of this slice is to close the gap.

### (e) NEW: Position-keyed bounded snapshot — option (b) plus shape mirroring Excel

Same as (b) but with an explicit identity-strategy decision:

- **Default:** positional keys (1-based row index as a string).
  Matches Excel's `updated_row` accepted-limitation pattern. Mid-
  sheet inserts/deletes shift all subsequent rows → all shifted
  rows fire as `updated`. Documented limitation.
- **Opt-in:** `keyColumn: string` — name of a header column whose
  values are used as the snapshot key instead of positional. When
  set: shifted rows do NOT fire spuriously (the key value stays
  the same as the row moves). Mirrors Excel's `updated_table_row`
  cleaner-identity pattern, adapted for Sheets which doesn't have a
  native "table" abstraction. Workflow authors who need stable
  identity opt in by configuring `keyColumn` (`headerRow: true` is
  a precondition because the column lookup needs a header).

**Verdict:** RECOMMENDED. Combines bounded storage (from option b)
with the parity-with-Excel identity-strategy pattern. The
positional default is the parity floor (matches V1 + Excel);
`keyColumn` opt-in is a clean upgrade path for workflows that need
it.

---

## 5. Recommended design

### Trigger surface

| Trigger | Transport | Event variants | Webhook channel sharing |
|---|---|---|---|
| `row_changed` (extended) | Drive `files.watch` (existing) | `changeKind: "added" \| "updated" \| "removed"` | One channel per trigger node, scoped to `(workflowId, nodeId, spreadsheetId)` — same as today |
| `new_worksheet` (new) | Drive `files.watch` (reused transport) | (no `changeKind`; payload carries `worksheetId`, `worksheetName`, `index`, `rowCount`, `columnCount`, `timestamp`) | Same — one channel per trigger node, scoped to `spreadsheetId` |

Both triggers reuse the existing
[`/api/webhooks/google-sheets`](../../app/api/webhooks/google-sheets/route.ts)
route. The receive function looks up the channel → finds the
`trigger_resources` row → routes to the trigger's `pull(...)`
function based on `event_type`.

### `row_changed` extended config (new fields highlighted)

```ts
{
  type: "subscription-watch",
  webhookEnabled: true,
  spreadsheetId: string,
  sheetName: string,
  headerRow: boolean,
  channelId: string,
  resourceId: string,
  pageToken: string,
  expiresAt: string,

  // NEW (P-GS1):
  changeKinds: readonly ("added" | "updated" | "removed")[],
  snapshotRowLimit: number,              // default 1000, max 10000
  keyColumn: string | null,              // null = positional; string = header-name keyed
  snapshot: {                            // bounded — at most `snapshotRowLimit` entries
    rowHashes: Record<string, string>,   // keyed by rowIndex (positional) OR column value (keyColumn)
    rowCount: number,                    // total data rows (excludes header when headerRow=true)
    windowStart: number,                 // 1-indexed first row in the window (for positional mode)
    windowEnd: number,                   // 1-indexed last row in the window (for positional mode)
    updatedAt: string,
  },

  // RETAINED (Slice 5 baseline — `added`-only fast path):
  lastRowCount: number,                  // kept for backwards-compat; equals snapshot.rowCount when changeKinds includes "added"
}
```

**Backwards compatibility:** existing `row_changed` rows have
`lastRowCount` but no `snapshot`. The pull function checks for
`snapshot` presence; absent → falls through to the existing
added-only path (count delta + emit added events). Workflow authors
who want updated/removed events save the workflow again to
re-activate with the new shape, OR Sheets 2.3 ships a one-time
backfill that seeds `snapshot` for active rows that opted into
`changeKinds` containing `"updated"` or `"removed"`.

### `new_worksheet` config

```ts
{
  type: "subscription-watch",
  webhookEnabled: true,
  spreadsheetId: string,
  channelId: string,
  resourceId: string,
  pageToken: string,
  expiresAt: string,

  // NEW:
  worksheetSnapshot: {
    names: readonly string[],            // worksheet titles, workbook order
    updatedAt: string,
  },
}
```

Same shape Excel uses for `new_worksheet` (`ExcelWorksheetListSnapshot`).

### Snapshot strategy specifics

#### Positional mode (default, `keyColumn === null`)

- **Key:** 1-based row index as a string (`"1"`, `"2"`, ...). Header
  row excluded if `headerRow=true`.
- **Window:** last `snapshotRowLimit` rows of the sheet. If
  `currentRowCount <= snapshotRowLimit`, snapshot covers every row;
  otherwise snapshot covers `[currentRowCount - snapshotRowLimit + 1,
  currentRowCount]`. `windowStart` and `windowEnd` recorded so the
  pull knows what the snapshot represents.
- **Update detection:** for each rowIndex in the new snapshot's
  window, if a key exists in BOTH old and new snapshots and hashes
  differ → emit `updated` event for that rowIndex with the new
  values.
- **Removed detection:** for each rowIndex in the OLD snapshot's
  window that's missing from the new snapshot's window → emit
  `removed` event. Two distinct removal scenarios:
  - Row count decreased AND a tail rowIndex is missing → genuine
    removal (right edge).
  - Row count stayed the same but a window rowIndex is now empty
    (e.g., `currentRowCount` decreased + window shifted) → also
    fires removed. Edge case: window-shift events fire on tail-clear
    operations.
- **Added detection:** for each rowIndex in the NEW snapshot's
  window that's missing from the OLD snapshot's window → emit
  `added` event. Note this is keyed differently from the baseline
  `lastRowCount` mechanism: when both `added` and `updated` are in
  `changeKinds`, the snapshot is authoritative and `lastRowCount` is
  derived. When `changeKinds = ["added"]` only, the pull may use
  the cheaper count-delta path and skip snapshot diffing entirely
  (preserve Slice 5 baseline performance).
- **Accepted limitation (documented in trigger schema):** mid-sheet
  inserts and deletes shift positional keys → every shifted row
  fires as `updated`. Matches Excel `updated_row` exactly.

#### Stable-identity mode (`keyColumn: string`)

- **Precondition:** `headerRow: true` (the column lookup needs a
  header). Schema `.refine` rejects `keyColumn` when `headerRow` is
  false.
- **Key:** the value of the column whose header name matches
  `keyColumn`, coerced to a string. The pull resolves the column
  index from the header row at every poll (column names can be
  reordered without breaking the lookup).
- **Empty-key rows:** rows where the keyColumn cell is empty are
  excluded from the snapshot entirely. They don't participate in
  diff detection. Workflow authors that need to track such rows use
  positional mode.
- **Duplicate keys:** the audit doesn't pre-decide this. Recommended:
  log a structured warning + keep the LAST row's hash (latest in
  workbook order). Documented limitation; the same limitation Excel
  exhibits when row identity collides.
- **Window vs unbounded with keyColumn:** still bounded by
  `snapshotRowLimit` for storage parity. The window is "last N rows
  in workbook order whose keyColumn is non-empty."
- **Update detection:** key exists in both snapshots, hash differs.
- **Removed detection:** key in old snapshot, absent from new
  snapshot (genuine deletion OR key cleared).
- **Added detection:** key in new snapshot, absent from old.
- **No shift noise.** This is the entire point of the mode.

### Event ID design

The current `added` eventId format is
`${spreadsheetId}:${sheetName}:${rowIndex}:${valuesHash}`. For
`updated` + `removed`, the format extends:

| changeKind | eventId format | Why |
|---|---|---|
| `added` | `${spreadsheetId}:${sheetName}:added:${key}:${valuesHash}` | Positional or keyColumn-based key included |
| `updated` | `${spreadsheetId}:${sheetName}:updated:${key}:${newValuesHash}` | Hash is the POST-UPDATE values — repeated update notifications for the same change have the same hash → dedup catches them |
| `removed` | `${spreadsheetId}:${sheetName}:removed:${key}:${priorValuesHash}` | Hash is the LAST-KNOWN values (pre-removal) — preserves natural dedup if the same removal fires multiple times |

**Breaking change vs Slice 5's added-only:** the Slice 5 eventId
omitted the `:added:` infix. Existing webhook_event_dedup rows
written under the old format are NOT compatible with the new
format. Mitigation: the legacy format stays valid for
backwards-compat through Sheets 2.3 — added-only triggers retain the
old format until the workflow is re-saved with the extended
`changeKinds` config. The infix is added only for workflows that
opt into the extended trigger surface.

Alternative: keep `added` format unchanged and only add the infix
for `updated` / `removed`. Simpler migration. **RECOMMENDED.** See
§9 Open Decision D-EventId.

### Snapshot storage shape in `trigger_resources.config`

The bounded window means each snapshot is at most
`snapshotRowLimit` entries:

| `snapshotRowLimit` | Approximate jsonb size per trigger row |
|---|---|
| 100 | ~10 KB |
| 1,000 (default) | ~80 KB |
| 10,000 (max) | ~800 KB |

At default 1,000 and 20 workflows watching the same sheet:
20 × 80 KB = 1.6 MB total across `trigger_resources` rows.
**Bounded.**

For comparison, Excel's `updated_row` ships with no explicit cap
(Graph's `usedRange` returns the actual data range). Sheets 2.3
opts for explicit caps because Sheets' "data range" can be
arbitrarily large (no Excel-like usedRange constraint) and
workflows watching CRM-sized sheets are realistic.

### Row identity strategy: positional vs keyColumn

Cross-provider parity:

| Provider/trigger | Identity strategy | Shift behavior |
|---|---|---|
| Excel `updated_row` | Positional (1-based row index) | Shifts fire spuriously — accepted limitation |
| Excel `updated_table_row` | Stable `index` from Graph's tableRowsList | Pinned across shifts — clean |
| Sheets 2.3 `row_changed` default | Positional | Shifts fire — matches Excel + V1; documented |
| Sheets 2.3 `row_changed` with `keyColumn` | Header-name keyed | Pinned across shifts — clean |

Sheets has no native "table" abstraction so V2 can't ship a
Sheets equivalent of `updated_table_row`. `keyColumn` is the
opt-in stable-identity mechanism. Workflow authors who configure
`keyColumn` accept the precondition (`headerRow: true`) and the
duplicate-keys/empty-keys limitations.

### Webhook channel scoping

One Drive `files.watch` channel per `(workflowId, nodeId,
spreadsheetId)` tuple. Same as today. The receive route looks up
the channel id → finds the `trigger_resources` row → reads
`event_type` to decide which `pull(...)` to call.

Both triggers (`row_changed` and `new_worksheet`) can be active on
the same spreadsheet in different workflows — each gets its own
channel. Within a single workflow with BOTH triggers, each trigger
node gets its own channel (V2's existing channel-per-node
convention).

### Activation seeding

Both extended `row_changed` (with `updated` or `removed` in
`changeKinds`) and new `new_worksheet` triggers seed their
snapshots at activation time. **Throws on failure** —
`TRIGGER_REGISTRATION_FAILED` surfaces to the workflow author.
Mirrors Excel's invariant.

For `row_changed` with extended `changeKinds`:
1. Call `values.get` on `<sheetName>!A:Z` (existing call).
2. Compute the window (last `snapshotRowLimit` data rows, header
   excluded when `headerRow: true`).
3. Reject loudly if `currentRowCount > snapshotRowLimit × 2` —
   the workflow author should pick a higher cap explicitly rather
   than have V2 silently truncate. (Loose check: workflows with
   sheets within 2× of the cap are accepted; workflows
   significantly over are flagged.) See §9 Open Decision
   D-OverflowAtActivate.
4. Build the snapshot keyed positionally or by `keyColumn`.
5. Persist via the existing `triggerResourcesRepo.upsert` flow.

For `new_worksheet`:
1. Call `spreadsheets.get(includeGridData=false)` to list worksheets.
2. Store the names array in `worksheetSnapshot`.
3. Create the `files.watch` channel.

### Cap enforcement at runtime

At pull time, the snapshot's window slides as the sheet grows:

- Sheet grows from 500 to 1,500 rows with `snapshotRowLimit = 1000`:
  the snapshot's window becomes `[501, 1500]`. Rows 1–500 are no
  longer tracked. Future updates to those rows are silently missed.
  Documented.
- Sheet shrinks from 1,500 to 500 rows: the snapshot's window
  becomes `[1, 500]`. Any rows previously in the snapshot above
  500 are checked for `removed` (genuine deletions emit removed
  events); rows previously below 501 that are now within the
  window are checked for `updated` (in case they changed while
  outside the window).

### Pull function shape (sketch)

```ts
export async function pull(trigger: TriggerResourceRecord): Promise<PullResult> {
  const config = trigger.config as RowChangedConfig;

  if (!hasExtendedChangeKinds(config)) {
    return pullAddedOnly(trigger, config);  // Slice 5 fast path — count delta
  }

  const integration = await getActiveForExecution(...);
  if (!integration) return { events: [], resyncRequired: false };

  const result = await refreshAndRetry({ ..., apiCall: valuesGet, ... });
  const values = result.values ?? [];

  // 1. Header resolution.
  const dataRows = config.headerRow ? values.slice(1) : values;
  const headers = config.headerRow && values.length > 0 ? values[0] : null;

  // 2. Window computation.
  const windowEnd = dataRows.length;
  const windowStart = Math.max(1, windowEnd - config.snapshotRowLimit + 1);
  const windowRows = dataRows.slice(windowStart - 1, windowEnd);

  // 3. Build new snapshot, keyed positionally or by keyColumn.
  const newSnapshot = config.keyColumn
    ? buildKeyColumnSnapshot(windowRows, headers, config.keyColumn, windowStart)
    : buildPositionalSnapshot(windowRows, windowStart, windowEnd);

  // 4. Diff.
  const events: TriggerEvent[] = [];
  const oldSnapshot = config.snapshot;
  if (oldSnapshot) {
    for (const [key, hash] of Object.entries(newSnapshot.rowHashes)) {
      if (oldSnapshot.rowHashes[key] === undefined && config.changeKinds.includes("added")) {
        events.push(normalize("added", ...));
      } else if (oldSnapshot.rowHashes[key] !== hash && config.changeKinds.includes("updated")) {
        events.push(normalize("updated", ...));
      }
    }
    if (config.changeKinds.includes("removed")) {
      for (const key of Object.keys(oldSnapshot.rowHashes)) {
        if (newSnapshot.rowHashes[key] === undefined) {
          events.push(normalize("removed", ...));
        }
      }
    }
  } else {
    // Activation seeding bug — re-seed defensively.
    return { events: [], resyncRequired: true };
  }

  // 5. Persist snapshot.
  await triggerResourcesRepo.updateConfig(trigger.id, { ...config, snapshot: newSnapshot });
  return { events, resyncRequired: false };
}
```

### Normalize function changes

The existing `normalize.ts` builds an eventId of
`${spreadsheetId}:${sheetName}:${rowIndex}:${hash}` and emits
payload with `changeKind: "added"`. Sheets 2.3 extends it:

```ts
export function normalize(
  changeKind: "added" | "updated" | "removed",
  row: NormalizeRowInput,
  context: NormalizeContext,
): TriggerEvent {
  const eventId = context.useLegacyEventId  // backwards-compat for added-only Slice 5 rows
    ? `${context.spreadsheetId}:${context.sheetName}:${row.key}:${valuesHash}`
    : `${context.spreadsheetId}:${context.sheetName}:${changeKind}:${row.key}:${valuesHash}`;

  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId,
    occurredAt: row.occurredAt,
    accountId: context.accountId,
    payload: {
      changeKind,
      spreadsheetId: context.spreadsheetId,
      sheetName: context.sheetName,
      rowIndex: row.rowIndex,          // 1-indexed including header row
      rowKey: row.key,                  // positional rowIndex as string OR keyColumn value
      rowValues: row.rowValues,
      headers: context.headers,
      previousValues: row.previousValues,  // OPTIONAL — only when changeKind === "updated" AND we stored previous values
    },
  };
}
```

**`previousValues` decision:** V1's `updated_row` documented but
never implemented `previousValues`. To ship it honestly, V2 would
need to double the snapshot size (store values, not just hashes).
Recommended: ship `previousValues: null` for v0; raise to actual
previous-values storage as a follow-up if workflow authors ask.
See §9 Open Decision D-PreviousValues.

---

## 6. Risks and limitations

### R-1 — Positional shift noise (accepted, documented)

- **Likelihood:** high in append-only sheets that occasionally see
  mid-sheet inserts (forms, CRM with re-sorting).
- **Impact:** medium. Spurious `updated` events for every shifted
  row. Workflow authors that need stable identity opt into
  `keyColumn`.
- **Mitigation:** explicit `keyColumn` option + documented
  limitation on positional mode. Mirrors Excel's accepted
  limitation pattern (Marcus 2026-05-14).

### R-2 — Bounded window misses updates to rows outside the window

- **Likelihood:** medium. Workflows watching sheets that grow past
  the cap and continue to receive updates to old rows will silently
  miss those events.
- **Impact:** medium. Workflow author with a 5,000-row sheet whose
  rows 1–4,000 keep getting updated would see only rows 4,001–5,000
  in the snapshot at `snapshotRowLimit = 1000`.
- **Mitigation:** raise the cap (up to 10,000) or restructure the
  workflow (e.g., a separate trigger per logical chunk). Schema
  documents the limitation in field-level descriptions.

### R-3 — Storage cost at extreme scale

- **Likelihood:** low at max-cap defaults. 10,000-row × 80 bytes ≈
  800 KB per `trigger_resources` row. 100 workflows watching the
  same sheet at max cap = 80 MB total. Postgres jsonb handles this
  but it's a real ops concern.
- **Impact:** medium. Reads on every webhook fire amplify the cost.
- **Mitigation:** default cap 1,000 — most workflows don't need
  more. Raising the max cap above 10,000 requires a code change
  (no schema escape hatch).

### R-4 — Activation rejection on overflow at activate time

- **Likelihood:** low. Activating a `row_changed` trigger against a
  sheet that already has > 2× the cap is the "I want to watch a
  huge sheet" case.
- **Impact:** low. Workflow author sees a clear error message;
  raises `snapshotRowLimit` and re-activates. Better than silent
  truncation.
- **Mitigation:** D-OverflowAtActivate decision (§9). Recommend
  strict reject at activate time.

### R-5 — `removed` events fire on window slide, not just deletion

- **Likelihood:** medium. A sheet that grows past the cap slides the
  window forward; rows that fell out of the window appear as
  "removed" because they're absent from the new snapshot.
- **Impact:** medium. False-positive removal events confuse workflow
  authors.
- **Mitigation:** the pull function distinguishes "row in old
  window's range but absent from new window's range" (window slide
  — DON'T fire removed) from "row in BOTH windows' overlapping
  range but absent from new snapshot" (genuine removal — DO fire
  removed). Documented; tested.

### R-6 — `keyColumn` value collisions

- **Likelihood:** medium. Workflows that key on a non-unique column
  (e.g. `Status` with `"open"` / `"closed"` values) collapse all
  rows with the same value to one snapshot entry.
- **Impact:** medium. Updates to one collapsing row aren't
  distinguishable from updates to another.
- **Mitigation:** schema docs strongly recommend a unique column;
  duplicate-keys behavior keeps the LAST row's hash and logs a
  structured warning at pull time. Workflow authors that need
  multi-row tracking under non-unique keys use positional mode.

### R-7 — `new_worksheet` baseline drift

- **Likelihood:** low. Worksheets aren't renamed often; rename looks
  like `{remove old, add new}` to the diff, firing a spurious
  "added" event for the new name.
- **Impact:** low. Same behavior Excel's `new_worksheet` exhibits;
  documented.
- **Mitigation:** doc-only.

### R-8 — Backwards compatibility for existing `row_changed` rows

- **Likelihood:** medium. Existing `row_changed` triggers in
  production have only `lastRowCount`, no `snapshot`. Sheets 2.3
  must not break them.
- **Impact:** low if handled. The pull function's
  `hasExtendedChangeKinds(config)` predicate routes legacy rows
  through the added-only fast path; only workflows that opt into
  `updated` or `removed` in `changeKinds` get the new snapshot
  path. Re-saving the workflow re-runs activation which seeds the
  snapshot.
- **Mitigation:** RECOMMENDED — the slice ships with the
  backwards-compat fast path. Existing added-only workflows are
  untouched.

### R-9 — Webhook receive-route routing

- **Likelihood:** low. The current receive route handles only the
  single `row_changed` event type. Adding `new_worksheet` requires
  the route to look up `trigger_resources.event_type` and route to
  the correct `pull(...)`.
- **Impact:** low. Trivial extension.
- **Mitigation:** receive route looks up the trigger's `event_type`
  and dispatches accordingly.

---

## 7. Batch plan

Recommended six-commit batch (matches the audit §11 estimate):

| # | Commit | What lands |
|---|---|---|
| 1 | (this) | `docs(google-sheets): plan 2.3 trigger expansion` — plan doc only |
| 2 | impl | `feat(google-sheets): bounded snapshot infrastructure for row_changed` — adds `_shared/snapshot.ts` (hash + diff helpers, mirrors Excel's `_shared/snapshot.ts` but with windowed support), extends `rowChanged/activate.ts` to seed `snapshot` when `changeKinds` includes `"updated"` or `"removed"`, persists the extended config. **Backwards-compat: existing added-only rows untouched.** Adds `RowChangedConfigSchema` Zod schema covering `changeKinds`, `snapshotRowLimit`, `keyColumn`. Unit tests for snapshot helpers (positional + keyColumn modes, window slide, duplicate keys, empty-key skip). |
| 3 | impl | `feat(google-sheets): emit row_changed updated and removed change kinds` — extends `rowChanged/pull.ts` to diff snapshots when extended `changeKinds` is set; extends `rowChanged/normalize.ts` with `updated` + `removed` event variants; extends `previousValues: null` in payload (no actual prior-values storage — see §9 D-PreviousValues). Adds eventId infix `:added:` / `:updated:` / `:removed:` for extended workflows; legacy added-only format preserved for backwards-compat. Unit tests covering all three changeKind paths, window slide, positional shift noise, keyColumn unique vs duplicate, removed-on-window-slide vs genuine-removed distinction. |
| 4 | impl | `feat(google-sheets): add new_worksheet trigger` — new `triggers/newWorksheet/` directory (`activate.ts`, `deactivate.ts`, `index.ts`, `pull.ts`, `normalize.ts`, `renew.ts`). Activation seeds `worksheetSnapshot.names` via `spreadsheets.get(includeGridData=false)` + creates `files.watch` channel. Pull diffs name list, emits one event per new worksheet. Receive route extended to look up `trigger_resources.event_type` and route to the correct `pull(...)`. Unit tests for activate/pull/normalize. |
| 5 | e2e | `test(google-sheets): extend walkthrough with 2.3 triggers` — extends `tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts` with two new `test.describe` blocks: **"Sheets 2.3 — row_changed extended changeKinds e2e"** (one workflow with `changeKinds = ["added", "updated", "removed"]`; inject row → fire `added`; modify row in-place → fire `updated`; delete row → fire `removed`; assert one workflow run per event with correct payload) and **"Sheets 2.3 — new_worksheet e2e"** (one workflow watching a spreadsheet; mock injects a new sheet tab → fire `new_worksheet` event with worksheetName + worksheetId). Mock additions: `__injectWorksheet(name)` + `__updateSheetRow(rowIndex, values)` + `__deleteSheetRow(rowIndex)` control endpoints. Per-run randomized values to avoid `webhook_event_dedup` collisions (per the Sheets 2.2 closure rule). |
| 6 | docs | `docs(google-sheets): document 2.3 outcomes` — outcomes retro covering trigger expansion, P-GS1 design choice, accepted limitations, V1 rot fixed (GS-R7 unbounded snapshot — closed by bounded window), CLAUDE.md durable additions, deferred items (`fontSize` / borders / conditional formatting remain deferred from 2.2; `previousValues` storage deferred to follow-up; `keyColumn` collision-handling expansion deferred). |

Each implementation commit individually gates:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npx jest tests/unit/integrations/google-sheets/ tests/unit/services/triggers/`
- `npm test`

E2E commit also gates:
- `CI=1 npx playwright test tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts --workers=1` — run twice for cross-run stability.

Explicit path staging only — no `git add .`. Unrelated parallel-work
files (`docs/rules/database-security.md`, `PACKAGES.md`) untouched at
every commit.

---

## 8. E2E plan

### `row_changed` extended changeKinds — one test, three event variants

ONE workflow chain off `row_changed` with
`changeKinds = ["added", "updated", "removed"]` + `headerRow: true` +
default `snapshotRowLimit = 1000` + positional mode (no
`keyColumn`):

```
row_changed (added | updated | removed)
  → append_row (records the event into a separate sheet for visibility)
```

Three webhook fires, three workflow runs:

1. **Added.** Pre-populate header + 2 data rows. Activate.
   Inject 1 new row. POST webhook. Assert:
   - One workflow_run with `succeeded` status.
   - `run.steps[0].nodeId === "trigger-node"`, payload has
     `changeKind: "added"`, `rowKey === "3"`, `rowValues === [newRow]`.
   - Mock `values.get` called twice (activate snapshot + pull).
2. **Updated.** Mock-update row 2 in place (different values).
   POST webhook. Assert:
   - Total 2 workflow_runs.
   - Second run payload `changeKind: "updated"`, `rowKey === "2"`,
     `rowValues === [updatedRow]`, `previousValues === null` (per
     D-PreviousValues default).
3. **Removed.** Mock-delete row 2. POST webhook. Assert:
   - Total 3 workflow_runs.
   - Third run payload `changeKind: "removed"`, `rowKey === "2"`.

Per-run randomized values for the added + updated rows so cross-run
dedup doesn't collide. The removed row's `priorValuesHash` is also
randomized via the source values.

### `row_changed` with `keyColumn` — assert stable-identity behavior

Smaller test:

1. Pre-populate header + 3 data rows with a `id` column. Activate
   with `keyColumn: "id"`.
2. Mock inserts a row at the MIDDLE of the sheet (row 2 becomes a
   new row, old row 2 + 3 shift down). POST webhook. Assert:
   - Exactly ONE workflow_run.
   - Payload `changeKind: "added"`, `rowKey` equals the new row's
     id value (not "2").
   - Critically: NO `updated` events for the shifted rows (their
     keyColumn values are unchanged, so their snapshot keys stay
     pinned).

Compare to the positional-mode equivalent which would fire 2
spurious `updated` events for the shifted rows — that contrast
documents R-1.

### `new_worksheet` — one test, one event

ONE workflow:

```
new_worksheet
  → append_row (records the event)
```

1. Pre-populate 1 worksheet ("Sheet1"). Activate.
2. Mock `__injectWorksheet("Sheet2")`. POST webhook. Assert:
   - One workflow_run with `succeeded` status.
   - Payload `worksheetName === "Sheet2"`, `worksheetId`,
     `spreadsheetId`.
   - Subsequent POSTs without injection do NOT fire (quiet
     baseline).

### Mock additions

| Mock endpoint | Purpose |
|---|---|
| `POST __injectWorksheet { name }` | Append a worksheet to the mock spreadsheet's worksheet list — `spreadsheets.get(includeGridData=false)` returns it on next call. |
| `POST __updateSheetRow { rowIndex, values }` | Replace `currentSheetsRows[rowIndex - 1]` with the new values. Enables `updated` testing. |
| `POST __deleteSheetRow { rowIndex }` | Remove `currentSheetsRows[rowIndex - 1]`. Enables `removed` testing. |

All three new control endpoints follow the existing
`__injectSheetRow` shape. No new recorder types needed — the existing
`sheetsValuesGet` recorder + `sheetsSpreadsheetsGet` recorder cover
the read-side. The `__inspect` endpoint exposes the worksheet list
state for direct assertion.

### Validation outcome

- 5 tests / 5 passing in [`slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) under `--workers=1`. (3 existing 2.1/2.2 tests + 2 new 2.3 tests covering changeKinds variants + keyColumn + new_worksheet; the new_worksheet test is folded into the same describe block as `row_changed extended`.)
- No regression in the existing 3 tests.

---

## 9. Open decisions for Marcus

Six real decision points. Recommended option is the first item in each list.

### D-PGS1 — P-GS1 design option

- **(a) Position-keyed bounded snapshot — option (b) + Excel parity. (RECOMMENDED.)** Bounded `snapshotRowLimit` (default 1,000, max 10,000) with positional 1-based row index keying by default + optional `keyColumn` for stable identity. Matches Excel's pattern + audit recommendation + bounds the storage cost.
- (b) Bounded positional-only (no `keyColumn` option). Simpler shape but loses the stable-identity escape hatch for workflows that need it.
- (c) Unbounded V1 shape. Rejected per audit R-3.
- (d) Re-read full sheet at every fire. Rejected per audit R-3 + breaks across deploys.
- (e) Skip permanently. Defeats the slice.

### D-EventId — eventId format for extended changeKinds

- **(a) Add `:added:` / `:updated:` / `:removed:` infix for workflows with extended `changeKinds`; keep legacy format for added-only Slice 5 rows. (RECOMMENDED.)** Surgical change, backwards-compat preserved.
- (b) Always include the infix; migrate existing dedup rows (or accept brief dedup gap during rollout).
- (c) Keep the existing format and use a separate dedup namespace for updated/removed. Cleaner conceptually but doubles the dedup-table read load.

### D-PreviousValues — preserve prior values in `updated` payload?

- **(a) `previousValues: null` placeholder; document as deferred. (RECOMMENDED.)** Honest about what's stored. Workflow authors that need prior values raise a follow-up. Avoids doubling snapshot storage.
- (b) Store row values (not just hashes) in the snapshot. `previousValues` carries real data. Storage cost roughly doubles (~160 KB per trigger row at default cap).
- (c) Store ONLY the hash and the columns the workflow asked for. Hybrid; complicates the snapshot schema.

### D-OverflowAtActivate — behavior when sheet exceeds cap at activate time

- **(a) Strict reject — activate throws if `currentRowCount > snapshotRowLimit × 2`. (RECOMMENDED.)** Forces explicit configuration choice. Mirrors V2's general "fail loud" stance.
- (b) Silently truncate — snapshot the last N rows; older rows are silently un-tracked from the start.
- (c) Auto-raise the cap to the smallest power of 2 above the sheet's current size, up to the hard max. Magic; surprising.

### D-NewWorksheetTransport — Drive watch or polling for `new_worksheet`?

- **(a) Reuse Drive `files.watch` transport. (RECOMMENDED.)** One channel per trigger node scoped to `spreadsheetId`. Same `webhook_event_dedup` table. Same renewal cron. Consistent with `row_changed`.
- (b) Use the polling registry instead. Simpler diff logic (no webhook race conditions), but requires a separate cron path + costs poll frequency.

### D-RemovedWindowSlide — fire `removed` on window slide?

- **(a) Distinguish genuine removal from window slide. (RECOMMENDED.)** Only fire `removed` for rows present in the OLD-window AND OLD-snapshot but absent from the NEW-snapshot WITHIN the new window's range. Rows that fell out of the window due to growth are silently un-tracked (matches D-PGS1 limitation).
- (b) Fire `removed` for any row absent from the new snapshot regardless of window position. Simpler but adds noise.

---

## 10. Acceptance gates (per implementation commit)

- Schemas `.strict()` — V1 field names (`hasHeaders`, `skipEmptyRows`, `requiredColumns`, `googleSheetsRowSnapshot`, `googleSheetsWorksheetSnapshot`) fail at parse time.
- `snapshotRowLimit` capped at 10,000 (`z.number().int().min(100).max(10000).default(1000)`).
- `keyColumn` requires `headerRow: true` (`.refine` rejects the combination at parse time).
- Snapshot helpers (`buildPositionalSnapshot`, `buildKeyColumnSnapshot`, `findAdded`, `findUpdated`, `findRemoved`) unit-tested independently — pure functions.
- Activation throws on overflow (per D-OverflowAtActivate); `TRIGGER_REGISTRATION_FAILED` surfaces to the workflow author.
- Activation throws on snapshot seed failure; matches Excel + V2 baseline rule.
- Backwards-compat: existing `row_changed` rows without `snapshot` continue to use the added-only count-delta fast path. No regression in Slice 5 baseline behavior.
- Receive route routes by `trigger_resources.event_type` — new_worksheet and row_changed dispatch to distinct `pull(...)` functions.
- Webhook channel cleanup at deactivate — both triggers' `deactivate.ts` call `channelsStop`.
- Renewal cron picks up both trigger types (same `type: "subscription-watch"` tag).
- E2E walkthrough: 5 tests / 5 passing under `--workers=1`. Per-run randomized values per the Sheets 2.2 closure rule.
- Full jest suite green. tsc clean. lint clean. lint:structure + lint:migrations clean.

---

## 11. Risk estimate summary

| Risk | Severity | Mitigation |
|---|---|---|
| R-1 positional shift noise | medium | `keyColumn` opt-in + documented limitation |
| R-2 bounded window misses old-row updates | medium | configurable cap up to 10,000 + doc |
| R-3 storage cost at extreme scale | low at defaults | bounded cap |
| R-4 activation rejection on overflow | low | clear error + raise-cap escape |
| R-5 removed-on-window-slide false positives | medium | distinguished in pull logic (D-RemovedWindowSlide) |
| R-6 keyColumn value collisions | medium | last-write-wins + structured warn log + doc |
| R-7 new_worksheet rename drift | low | doc-only (matches Excel) |
| R-8 backwards-compat for legacy added-only rows | low if handled | predicate-routed fast path |
| R-9 webhook receive-route routing | low | event_type-based dispatch |

No single risk blocks the slice. R-3 was the historical blocker; the
bounded-window design (option e in §4) addresses it directly.

---

## 12. Exit checklist (post Sheets 2.3 ship)

- [ ] `row_changed` emits `changeKind: "added" | "updated" | "removed"` per the workflow's `changeKinds` array.
- [ ] `keyColumn` opt-in for stable identity; positional mode default + documented shift limitation.
- [ ] Bounded `snapshotRowLimit` (default 1,000, max 10,000).
- [ ] Snapshot helpers extracted + unit-tested (mirrors Excel `_shared/snapshot.ts`).
- [ ] Activation seeds snapshot + throws on overflow (per D-OverflowAtActivate).
- [ ] Backwards-compat fast path for legacy added-only rows.
- [ ] `new_worksheet` trigger ships with Drive `files.watch` reuse.
- [ ] Receive route routes by `event_type`.
- [ ] Renewal cron handles both trigger types (`type: "subscription-watch"` shared).
- [ ] E2E walkthrough extended; 5/5 passing (3 existing + 2 new).
- [ ] V1 rot fixed: GS-R7 (unbounded snapshot) — closed by bounded window.
- [ ] CLAUDE.md updates: Phase 2 progress (Google Sheets) extended; Deep Gotchas extended with Sheets 2.3 durable rules.
- [ ] Outcomes doc + CLAUDE.md update.
- [ ] V2 Google Sheets trigger total: **2** (`row_changed` extended + `new_worksheet`).

**Implementation does NOT begin before Marcus accepts this plan AND
resolves the §9 open decisions (or accepts the recommended defaults).**

---

## 13. What's next after 2.3

Per parity-google-sheets §13:

- **Sheets 2.2 expansion** (on-demand) — additional `format_range` options (borders, conditional formatting, data validation, fontSize, verticalAlignment, wrapStrategy, strikethrough, underline) land as non-breaking optional fields when a real workflow asks. Same handler, same wrapper.
- **`find_row` operator expansion** (on-demand) — schema currently has `operator: z.literal("equals")` as a forward-compat enum. Adding `"contains"` / `"starts_with"` / `"greater_than"` is a non-breaking schema extension when asked.
- **Sheets-side platform infrastructure** — none currently identified. P-GS1 collapses into Sheets 2.3. P-GS2 collapsed into Sheets 2.2. No active platform-tier candidates remain for Sheets.

The Google Sheets parity arc closes once Sheets 2.3 ships (or
Marcus accepts the deferral as permanent). After that, Sheets has
feature parity with V1's accepted surface plus the V2 quality
improvements documented across the 2.1, 2.2, and 2.3 outcomes
docs.
