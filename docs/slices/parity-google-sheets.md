# Parity audit — Google Sheets

**Status:** Audit / not yet accepted. **Doc-only commit.**
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`
**V2 baseline:** [`integrations/google-sheets/`](../../integrations/google-sheets/) (Slice 5 Phase 1 + Slice 5b walkthrough)
**Phase 1 surface shipped:** 5 actions (`read_rows`, `append_row`, `update_row`, `clear_range`, `get_sheet_metadata`), 1 webhook-based trigger (`row_changed`, rides Drive's `files.watch` transport per Slice 5 §"Why Sheets after Drive").
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md). Audit follows the 14-section template defined there.
**Predecessor:** [`docs/slices/slice-5-google-sheets.md`](slice-5-google-sheets.md) (Phase 1 port — establishes the manifest + 5-action surface + watch-rides-Drive lifecycle + decision to emit only `changeKind: "added"` in Batch 1).

**Recommendation up front.** V1 ships **11 active actions** (9 per-domain + 2 inline-declared in the manifest) and **3 polling-based triggers**. V2 ships **5 actions** and **1 webhook-based trigger**. The action gap is **~6–8 actions** — cell-level reads/writes (`get_cell_value`, `update_cell`), row queries (`find_row`, `delete_row`), batch operations (`batch_update`), formatting (`format_range`), spreadsheet lifecycle (`create_spreadsheet`), and V1's complex filter-style export (`export_sheet`). Plus 2 trigger gaps (`updated_row` true-diff detection, `new_worksheet`). Audit recommends **5 actions PORT** (Sheets 2.1 — small high-value increments), **2 actions PORT-WHEN-NEEDED** (Sheets 2.2 — formatting + batch), **1 action SKIP** (V1 `export_sheet` chrome — replaceable by `read_rows` + downstream workflow filtering), **1 action SKIP** (V1 `unifiedAction.ts` router pattern). On triggers: **1 trigger expansion** (extend existing `row_changed` to emit `changeKind: "updated"` + `"removed"` per the Slice 5 §decision-#2 deferral, gated by P-GS1 per-row snapshot design) and **1 trigger PORT-WHEN-NEEDED** (`new_worksheet`). Two platform gaps surface (P-GS1 per-row diff detection for true update/remove triggers; P-GS2 formatting-API typed wrapper). Recommended split: **2–3 parity slices** (Google Sheets 2.1 cell/row/lifecycle / Google Sheets 2.2 batch + formatting / Google Sheets 2.3 trigger expansion, conditional) totaling ~14–18 commits.

---

## 1. V1 source paths audited

### Manifest / node definitions

- [`lib/workflows/nodes/providers/google-sheets/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-sheets/index.ts) (760 lines) — assembles `googleSheetsNodes` from per-action schemas + 3 inline trigger schemas + 2 inline action schemas (`export_sheet`, `create_spreadsheet`).
- [`lib/workflows/nodes/providers/google-sheets/actions/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-sheets/actions/) — 9 per-action schema files: `appendRow.schema.ts`, `batchUpdate.schema.ts`, `clearRange.schema.ts`, `deleteRow.schema.ts`, `findRow.schema.ts`, `formatRange.schema.ts`, `getCellValue.schema.ts`, `updateCell.schema.ts`, `updateRow.schema.ts`.
- 3 trigger schemas inline at `index.ts:62-326` (`new_row`, `new_worksheet`, `updated_row`), all `triggerType: "polling"`.
- 2 action schemas inline at `index.ts:328` (`google-sheets_action_export_sheet` — **hyphenated `google-sheets_` prefix**, inconsistent with the underscore convention used everywhere else) and `index.ts:666` (`google_sheets_action_create_spreadsheet`).

### Action handlers

- [`lib/workflows/actions/google-sheets/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/) — 11 handler files + index barrel + utils:
  - `appendRow.ts` (via `createRow.ts` actually) — append row
  - `batchUpdate.ts` (184 LOC) — multi-cell update via `values.batchUpdate`
  - `clearRange.ts` (270 LOC) — clear cells via `values.clear`
  - `createRow.ts` (459 LOC) — implementation of the "add" mode of `unifiedAction.ts`; also reachable via `appendRow` per V1 routing
  - `deleteRow.ts` (228 LOC) — delete row via `batchUpdate` with `deleteDimension`
  - `findRow.ts` (249 LOC) — find row by column/value match (composes `values.get` + client-side filter)
  - `formatRange.ts` (301 LOC) — cell formatting via `batchUpdate` with `repeatCell` request
  - `getCellValue.ts` (110 LOC) — single-cell read via `values.get`
  - `listRows.ts` (366 LOC) — implementation of `export_sheet` (UI-side filtering; rich options for keyword search / column filter / sort / date filter / output format)
  - `updateCell.ts` (98 LOC) — single-cell write via `values.update`
  - `updateRow.ts` (311 LOC) — row update via `values.update` with full-row range
  - `unifiedAction.ts` (123 LOC) — **kitchen-sink router** dispatching between `createRow` / `updateRow` / `deleteRow` based on `config.action: "add" | "update" | "delete"` field
  - `utils.ts` (38 LOC) — helpers (`parseSheetName`, etc.)
  - `index.ts` (10 lines) — re-export barrel
- Total V1 source: **~3,517 LOC** across 14 files.

### Triggers / polling lifecycle

- 3 trigger schemas inline in `index.ts` (`triggerType: "polling"` declared in each).
- V1 polling implementation: lives in shared polling infrastructure (one trigger lifecycle per provider via the `pollingRegistry`). Each trigger keeps per-workflow cursor state in `trigger_resources.config`.
- `updated_row` trigger maintains a per-row signature map (`rowSignatures` keyed by row index → hash of cell values) so V1 detects true row updates rather than just count-deltas. **Slice 5 §confirmed-decisions #2 deliberately did NOT port this** to V2's `row_changed` trigger because of storage cost (one config blob per workflow with ~1 entry per row).
- Webhook lifecycle: none in V1 (Sheets has no native push). V1's polling rides the polling registry; V2's webhook approach (Drive's `files.watch` against the spreadsheet's fileId) is a V2-only architecture.

### OAuth + integration config

- [`lib/integrations/oauthConfig.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts) — Google Sheets OAuth config (full `spreadsheets` scope + `userinfo.email` for account identification). Standard Google OAuth 2.0 with refresh tokens.
- Generic dynamic-route callback at `/api/integrations/[id]/callback/route.ts`.
- [`app/api/integrations/google-sheets/data/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/google-sheets/data/) — 7 data-loader handlers for the UI's dynamic combobox/select fields: `spreadsheets.ts`, `sheets.ts`, `columns.ts`, `column-values.ts`, `records.ts`, `route.ts`, `types.ts`, `utils.ts`. Not action handlers — UX support.

### Tests / docs / learning notes

- V1: 0 unit tests under `__tests__/google-sheets/`.
- V1: scattered learning notes under `learning/docs/` — relevant: nothing specific to Sheets parity.
- V1: `components/workflows/configuration/providers/google-sheets/GoogleSheetsOptionsLoader.ts` — UI-side dynamic option loader.

---

## 2. V1 actions inventory

**11 active actions** in V1's `googleSheetsNodes` manifest.

### Cell-level (2)

| V1 type | Backing handler | Notes |
|---|---|---|
| `google_sheets_action_get_cell_value` | `getCellValue.ts` | Read a single cell via `values.get`. Returns the value + the cell address. |
| `google_sheets_action_update_cell` | `updateCell.ts` | Write a single cell via `values.update`. |

### Row-level reads + writes (5)

| V1 type | Backing handler | Notes |
|---|---|---|
| `google_sheets_action_append_row` | `createRow.ts` + `appendRow.schema.ts` | Append a row at the end of a sheet via `values.append`. **Functionally overlaps with V2's `append_row`.** |
| `google_sheets_action_update_row` | `updateRow.ts` | Update an entire row by row number via `values.update` over the row's range. |
| `google_sheets_action_delete_row` | `deleteRow.ts` | Delete a row by row number via `batchUpdate` with `deleteDimension`. |
| `google_sheets_action_find_row` | `findRow.ts` | Find a row by column/value match. Composes `values.get` (full sheet) + client-side filter. |
| `google-sheets_action_export_sheet` (note: hyphenated prefix — V1 bug-name) | `listRows.ts` | UI-driven filter-and-export. Rich options: keyword search, column filter with 12 operators, sort, date filter, custom date range, output format (objects vs arrays vs CSV). |

### Range operations (3)

| V1 type | Backing handler | Notes |
|---|---|---|
| `google_sheets_action_clear_range` | `clearRange.ts` | Clear a range via `values.clear`. **Functionally overlaps with V2's `clear_range`.** |
| `google_sheets_action_batch_update` | `batchUpdate.ts` | Multi-range update via `values.batchUpdate` (multiple `data: [{ range, values }]` entries in one API call). |
| `google_sheets_action_format_range` | `formatRange.ts` | Cell formatting (color, font, alignment, borders) via `batchUpdate` with `repeatCell` request. |

### Spreadsheet lifecycle (1)

| V1 type | Backing handler | Notes |
|---|---|---|
| `google_sheets_action_create_spreadsheet` | inline in `index.ts:666` | Create a new spreadsheet via `spreadsheets.create`. Supports title, description, template selection (V1 chrome: "budget" / "project" / "crm" / etc.), initial CSV-format data prefill. |

### Plus `unifiedAction.ts` router

123-LOC dispatcher routing between `createGoogleSheetsRow` / `updateGoogleSheetsRow` / `deleteGoogleSheetsRow` based on `config.action: "add" | "update" | "delete"` field. Not a separate node; consumed by V1's builder UI for a "manage rows" combo action. This is V1's kitchen-sink router pattern — same shape as Notion's `manage_*` routers (NOT PORTED per parity-notion N-R7).

---

## 3. V1 triggers inventory

**3 active triggers** — all polling-based in V1.

| V1 type | Polling cursor | Notes |
|---|---|---|
| `google_sheets_trigger_new_row` | `lastRowCount` per (spreadsheet, sheet) in `trigger_resources.config` | Polls the sheet's row count; emits when a new row appears. Most-used Sheets trigger. |
| `google_sheets_trigger_updated_row` | Per-row signature map (`rowSignatures: Record<rowIndex, hash>`) in `trigger_resources.config` | Polls + diffs per-row hashes against the previous snapshot. True update detection (any cell change within a row). **Storage cost is per-row × per-workflow** — Slice 5 §decision-#2 deliberately did NOT port this snapshot model. |
| `google_sheets_trigger_new_worksheet` | List of seen `sheetId` values per spreadsheet | Polls `spreadsheets.get` for the list of sheets/tabs; emits when a new tab is added. |

### Polling vs webhook (V1 polling, V2 webhook)

V1: all 3 triggers ride V1's polling registry. **Sheets has no native push API** — Google does not expose webhooks for Sheets value changes.

V2: Slice 5 introduced a hybrid — `row_changed` rides **Drive's `files.watch`** on the spreadsheet's fileId. The webhook fires when Drive notices the file changed; the trigger pull-handler then diffs the new row count against `lastRowCount` and emits `changeKind: "added"`. This is faster (~seconds-to-minutes) than polling and doesn't burn polling-job slots, but Drive's watch only signals "file changed" — it doesn't tell us whether a row was added vs updated vs removed. V1's per-row signature map would still be required for true update/remove detection.

---

## 4. V2 current surface

### Actions (5 — shipped in Slice 5)

| V2 type | Source file | V1 equivalent |
|---|---|---|
| `read_rows` | [`integrations/google-sheets/actions/readRows.ts`](../../integrations/google-sheets/actions/readRows.ts) | V1 `findRow` (partial) + `export_sheet` (subset; without the filter UI) — generic range-read action |
| `append_row` | [`integrations/google-sheets/actions/appendRow.ts`](../../integrations/google-sheets/actions/appendRow.ts) | V1 `append_row` + `createRow` |
| `update_row` | [`integrations/google-sheets/actions/updateRow.ts`](../../integrations/google-sheets/actions/updateRow.ts) | V1 `update_row` |
| `clear_range` | [`integrations/google-sheets/actions/clearRange.ts`](../../integrations/google-sheets/actions/clearRange.ts) | V1 `clear_range` |
| `get_sheet_metadata` | [`integrations/google-sheets/actions/getSheetMetadata.ts`](../../integrations/google-sheets/actions/getSheetMetadata.ts) | V2-only — no direct V1 equivalent (V1's manifest data-loaders expose this internally via `spreadsheets.get`; V2 surfaces it as a workflow action) |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts).

### Triggers (1)

| V2 type | Lifecycle | Notes |
|---|---|---|
| `row_changed` | webhook (rides Drive's `files.watch` on spreadsheet's fileId) | Only emits `changeKind: "added"` per Slice 5 §decision-#2. `updated` and `removed` are deferred pending per-row snapshot design. The trigger payload's `changeKind` field is the forward-compat seam — when V2.3 lands per-row diffing, the same trigger expands to emit the other kinds without a manifest break. |

### Manifest + OAuth

[`integrations/google-sheets/manifest.ts`](../../integrations/google-sheets/manifest.ts):
- `tokenScope: "user"` (one Sheets integration per `(user, email)`).
- `accountIdField: "email"` (from OIDC userinfo).
- `apiVersion: "v4"`.
- `refreshable: true` (Google OAuth 2.0 refresh tokens).
- `healthCheckIntervalMs: 6h` (Google tier).
- Required scopes: `spreadsheets` (full read/write) + `userinfo.email` (account id).
- Capabilities: `oauth: true`, `actions: true`, `webhookTrigger: true`, `pollingTrigger: false`.

### API wrappers

[`integrations/google-sheets/api/`](../../integrations/google-sheets/api/) — 6 files:
- `_base.ts` — shared Google API helper (URL, headers, error mapping)
- `errors.ts` — Google API error shaping
- `spreadsheetsGet.ts` — `spreadsheets.get` wrapper (used by `get_sheet_metadata`)
- `valuesGet.ts` — `values.get` wrapper (used by `read_rows`)
- `valuesAppend.ts` — `values.append` wrapper
- `valuesUpdate.ts` — `values.update` wrapper
- `valuesClear.ts` — `values.clear` wrapper

### Tests

- **13 unit test files** at [`tests/unit/integrations/google-sheets/`](../../tests/unit/integrations/google-sheets/).
- **1 e2e walkthrough** at [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](../../tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts).

### Shared infrastructure reused

V2 Sheets reuses (no new infrastructure added by Slice 5):
- `integrations/_shared/google/oauth.ts` — Google OAuth helper
- `integrations/_shared/google/channelToken.ts` — HMAC channel token for watch subscriptions
- `integrations/google-drive/api/{filesWatch,changesGetStartPageToken,changesList,channelsStop}.ts` — direct imports per Slice 5 §confirmed-decisions #4
- `services/triggers/{activationRegistry,deactivationRegistry,subscriptionRegistry}.ts` — watch lifecycle
- `app/api/cron/renew-watch-subscriptions/route.ts` — subscription renewal
- `webhook_event_dedup` DB-backed dedup
- Per-provider webhook route at [`app/api/webhooks/google-sheets/route.ts`](../../app/api/webhooks/google-sheets/route.ts)

---

## 5. Missing actions

V2 has 5 of V1's 11 actions. **6 V1 actions are missing**, plus 2 that overlap or fold cleanly.

### High-value gaps (recommend Google Sheets 2.1)

| V1 type | V2 proposed type | Why it's high-value |
|---|---|---|
| `google_sheets_action_get_cell_value` | `get_cell_value` | Single-cell read with cleaner output than `read_rows` (which returns a 2D array). Common workflow pattern: "look up value at A1, branch on it." |
| `google_sheets_action_update_cell` | `update_cell` | Single-cell write convenience over `update_row`. Workflow pattern: "set cell B5 to '{{trigger.amount}}'." |
| `google_sheets_action_delete_row` | `delete_row` | Row deletion by index — high-leverage cleanup workflows. Uses `batchUpdate` with `deleteDimension` (no native single-row delete in Sheets API). |
| `google_sheets_action_find_row` | `find_row` | Find a row by column/value match. Common: "find the row where column 'Email' = '{{user.email}}' and return its values." V1 composes `values.get` + client-side filter; V2 can ship the same composition cleanly. |
| `google_sheets_action_create_spreadsheet` | `create_spreadsheet` | New spreadsheet creation via `spreadsheets.create`. Useful for templated workflow setup. Low-frequency, high-leverage. |

### Medium-value gaps (recommend Google Sheets 2.2)

| V1 type | V2 proposed type | Why it's medium-value |
|---|---|---|
| `google_sheets_action_batch_update` | `batch_update` | Multi-range update via `values.batchUpdate`. Workflow pattern: "update cells A1, B2, C3 in one call." More efficient than N `update_row` calls. |
| `google_sheets_action_format_range` | `format_range` | Cell formatting via `batchUpdate` with `repeatCell` request. Color, font, alignment, borders. V1 ships a structured options schema; V2 can mirror with typed-and-bounded fields. **Larger surface** — Sheets' formatting API has dozens of options. |

### Skip / consolidate candidates

| V1 type | Audit recommendation |
|---|---|
| `google-sheets_action_export_sheet` (V1 hyphenated bug-name) | **SKIP** — V1 chrome with a 12-operator filter UI that compounds into a complex search-and-export shape. V2's `read_rows` returns the raw range; workflow authors compose downstream filter logic (or use a future `find_row` that handles the common "filter by column value" case). The full V1 export UI is a builder-side feature, not a workflow-runtime action. |
| `unifiedAction.ts` router | **SKIP** (per V2 convention) — V1 dispatched `add` / `update` / `delete` via a single combo action. V2 ships separate `append_row` / `update_row` / `delete_row` typed actions. Matches the Notion `manage_*` and Slack `manage_*` skip patterns. |
| `createRow.ts` (orphan handler) | **SKIP** — V2's `append_row` already covers this. |
| `listRows.ts` (orphan handler for export_sheet) | **SKIP** — see `export_sheet` decision. |

### V2 actions with no direct V1 equivalent

| V2 type | Notes |
|---|---|
| `get_sheet_metadata` | V2-only convenience. Exposes `spreadsheets.get` as a workflow action — V1 only used this internally for the manifest data-loaders. **No V1 port required — V2's surface is cleaner.** |

---

## 6. Missing triggers

V2 has 1 of V1's 3 triggers (replaced with a webhook-based variant that emits a subset of the change kinds). **2 trigger gaps** plus **1 expansion opportunity** on the existing trigger.

### Existing trigger expansion (highest impact)

| V2 trigger | V1 equivalent | Gap |
|---|---|---|
| `row_changed` (currently `changeKind: "added"` only) | `new_row` + `updated_row` | Currently covers `added` only. Slice 5 §decision-#2 deferred `updated` and `removed` because per-row signature tracking adds storage cost (one config blob per workflow with ~1 entry per row). **Gated by P-GS1 below.** Expansion would NOT require a manifest change — the trigger schema already declares `changeKind` as a forward-compat field. |

### Trigger gaps

| V1 type | V2 proposed eventType | Notes |
|---|---|---|
| `google_sheets_trigger_new_worksheet` | `google-sheets.new_worksheet` | Fires when a new sheet/tab is added inside a spreadsheet. V1 polled `spreadsheets.get` for the sheet list. V2 could ride the existing `files.watch` infrastructure too — Drive's watch emits on tab additions because they bump the file's `modifiedTime`. The trigger lifecycle would store the seen `sheetId` set in `trigger_resources.config`. |
| `google_sheets_trigger_updated_row` (true updates) | Folded into `row_changed` (via P-GS1) | NOT shipped as a separate trigger. V2's `row_changed` is the right shape — extend it. |

### Polling vs webhook decision (verified)

V1 was polling-only. V2's Slice 5 introduced Drive's `files.watch` as a transport, which is qualitatively better (~seconds latency vs polling intervals; doesn't burn polling-job slots). The audit recommends V2 stay on the webhook path for any new Sheets trigger — going back to polling would be a regression.

---

## 7. Port / skip / defer table

Decisions per item from §5 + §6. Reasoning cites master-plan rot IDs (R1..R14) where applicable.

### Actions

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `getCellValue` | action | **port** (Sheets 2.1) | Single-cell read; cleaner output than `read_rows`. `values.get` wrapper already exists. |
| `updateCell` | action | **port** (Sheets 2.1) | Single-cell write; `values.update` wrapper already exists. |
| `deleteRow` | action | **port** (Sheets 2.1) | Row deletion via `batchUpdate` + `deleteDimension`. New wrapper required (`spreadsheetsBatchUpdate`). |
| `findRow` | action | **port** (Sheets 2.1) | Common workflow pattern. Composes existing `values.get` + V2 server-side filter logic. |
| `createSpreadsheet` | action | **port** (Sheets 2.1) | `spreadsheets.create`. New wrapper required (`spreadsheetsCreate`). V1's template chrome (budget/project/crm/etc.) is V1 builder UI, NOT ported. |
| `batchUpdate` | action | **port** (Sheets 2.2) | Multi-range update via `values.batchUpdate`. New wrapper required (`valuesBatchUpdate`). |
| `formatRange` | action | **port** (Sheets 2.2 — high effort) | Cell formatting via `batchUpdate` + `repeatCell`. Notion-2.2-shaped: typed-and-bounded schema covering common formatting options (background color, text color, bold/italic, alignment, number format). Full V1 surface is large; **ship Batch 1 with the dominant options and defer rare formatting (borders, conditional formatting, data validation) per audit decisions.** |
| `exportSheet` (V1 hyphenated name) | action | **skip — recipe only** | V1 chrome with 12-operator filter UI. Workflow authors compose `read_rows` + downstream filter logic (or `find_row` for column-value match). The V1 UI niceties belong to the builder, not the runtime. |
| `unifiedAction` (router) | action | **skip — V2 ships typed-only** | Same V2 convention as Notion's `manage_*` skip + Slack 2.3's per-action split. |
| `createRow.ts` (orphan) | handler | **skip** | Folded into V2's `append_row`. |
| `listRows.ts` (orphan) | handler | **skip** | Same fate as `exportSheet`. |

**Action totals: 5 PORT (Sheets 2.1), 2 PORT (Sheets 2.2 — one high-effort), 1 SKIP-recipe (`exportSheet`), 1 SKIP-pattern (`unifiedAction`), 2 SKIP-orphans (`createRow`, `listRows`).**

### Triggers

| V1 item | Type | Recommendation | Reasoning |
|---|---|---|---|
| `new_row` polling (V1) → `row_changed` webhook with `changeKind: "added"` (V2) | trigger | **ALREADY SHIPPED** — Slice 5 covers the `added` case. |
| `updated_row` polling (V1) → folded into `row_changed` `changeKind: "updated"` (V2) | trigger expansion | **PORT — gated by P-GS1** | Per-row snapshot design needed. Storage cost + design careful tracking lives in P-GS1 below. |
| Same → `changeKind: "removed"` | trigger expansion | **PORT — gated by P-GS1** | Same gate; cheaper than `updated` (just diff row counts + which row indices) but needs the same snapshot infrastructure for accuracy. |
| `new_worksheet` polling (V1) | trigger | **port-when-needed** | New webhook lifecycle entry. Lower-frequency need than row-level triggers. |

**Trigger totals: 1 ALREADY-SHIPPED (`added`), 2 PORT-EXPANSION (`updated`/`removed`, gated by P-GS1), 1 PORT-WHEN-NEEDED (`new_worksheet`).**

### Summary counts

- **Port (Sheets 2.1):** 5 actions
- **Port (Sheets 2.2):** 2 actions
- **Port (Sheets 2.3 — conditional):** 2 trigger expansions + 1 new worksheet trigger
- **Skip / consolidate:** 4 entries (`exportSheet` recipe, `unifiedAction` router, 2 orphan handlers)
- **Total new V2 surface if all PORT decisions accepted:** **~7 actions + trigger expansion + 1 new trigger + 1 platform slice (P-GS1).**

---

## 8. V1 rot / bugs / dead code inventory

Provider-specific rot beyond the master-plan §5 catalog.

| ID | Finding | V1 location | V2 mitigation |
|---|---|---|---|
| **GS-R1** (cites R1) | **`unifiedAction.ts` 123-LOC router** dispatching add/update/delete via single `config.action` field. Same kitchen-sink pattern as Notion's `manage_*`. | `lib/workflows/actions/google-sheets/unifiedAction.ts` | V2 ships typed-only — `append_row` / `update_row` / `delete_row` separately. NOT PORTED. |
| **GS-R2** (cites R5) | **Hyphenated action type name** `google-sheets_action_export_sheet` (uses `google-sheets_` prefix) while every other Sheets action uses `google_sheets_action_` (underscore prefix). V1 bug; inconsistent naming. | `lib/workflows/nodes/providers/google-sheets/index.ts:328` | V2 doesn't ship this action (skip-recipe per §7). If a future V2 action needs export, the V2 name is `export_sheet` with the standard registry key. |
| **GS-R3** (cites R5) | **Orphan handlers** `createRow.ts` (459 LOC) and `listRows.ts` (366 LOC) — not directly reachable via any manifest schema as primary handlers. `createRow` is reachable via `unifiedAction` "add" mode; `listRows` is the implementation of `export_sheet`. | `lib/workflows/actions/google-sheets/{createRow,listRows}.ts` | NOT PORTED — V2's `append_row` covers `createRow`; `exportSheet` is skipped. |
| **GS-R4** (cites R10) | **`parseInt(config.maxRows) \|\| 100` silent default coercion** in `listRows.ts`. Same shape: `parseInt(config.page_size) \|\| 100` was Notion's same pattern (N-R7's parseInt rot). | `lib/workflows/actions/google-sheets/listRows.ts:30` (and likely others) | V2 schema enforces `int().positive().max(...)` and rejects invalid values loudly. |
| **GS-R5** (cites R10) | **String-typed booleans** — `config.is_inline === "true"` pattern in some V1 handlers. Caused by V1's UI emitting boolean inputs as strings. | Likely in multiple V1 handler files; not enumerated | V2 schema uses `z.boolean()` — actual booleans, not stringly-typed. |
| **GS-R6** (cites R10) | **V1 `listRows.ts` returns silent partial failures** via `{ success: false, message }` shape without distinguishing 401 / 404 / validation. | `lib/workflows/actions/google-sheets/listRows.ts:50-53` | V2 wrappers route 401 → `Unauthorized401Error`, 404 → `NotFoundError`, other → tagged Error. |
| **GS-R7** | **V1 trigger's per-row signature snapshot** for `updated_row` detection — storage cost is `O(rows × workflows)`. Could become a real problem at scale. | V1 polling implementation for `updated_row` | Slice 5 §decision-#2 deliberately skipped this. P-GS1 below revisits with a bounded-storage design. |
| **GS-R8** | **V1 `find_row` does full-sheet read** even when a known column is being filtered. V1 has no server-side filter — every find is a `values.get` of the entire sheet plus client-side scan. | `lib/workflows/actions/google-sheets/findRow.ts` | V2's `find_row` port keeps the same client-side filter approach (Sheets API has no server-side per-row filter; the API supports A1 ranges only). The audit pins this as expected behavior, not a bug — but the V1 implementation should be cleaned up: stream-style row iteration if the API allows, otherwise document the cost. |
| **GS-R9** | **No V1 unit tests** for any Sheets handler. | absent | V2 has 13 unit test files for the 5 shipped actions; pattern continues for new ports. |
| **GS-R10** | **V1 `createSpreadsheet` template chrome** — drop-down with "budget" / "project" / "crm" / "inventory" / "calendar" preset options, each materializing different sheet shapes. UI builder feature, not API behavior. | `lib/workflows/nodes/providers/google-sheets/index.ts:699` | V2 `create_spreadsheet` ships the bare `spreadsheets.create` surface (title, description, initial sheets array). Template UX is a Phase 3 builder concern, not a parity concern. |
| **GS-R11** | **V1 `formatRange` schema has ~25 inputs** covering every formatting option Sheets supports. Most are rarely used. | `lib/workflows/nodes/providers/google-sheets/actions/formatRange.schema.ts` | V2 ships the dominant subset in Sheets 2.2: background/text color, bold/italic, alignment, number format. Borders + conditional formatting + data validation defer to on-demand. |

---

## 9. V2 dependency map

Every ported action depends on (existing V2 contracts):

- [`contracts/integration.ts`](../../contracts/integration.ts) — `ProviderManifest`, `ProviderOAuth`, `ActionResult`.
- [`contracts/triggerEvent.ts`](../../contracts/triggerEvent.ts) — `TriggerEvent`, `TriggerEventSchema` (for trigger expansion).
- [`services/execution/handlers/types.ts`](../../services/execution/handlers/types.ts) — `ActionHandler` shape.
- [`repositories/integrations.ts`](../../repositories/integrations.ts) — `getActiveForExecution(userId, provider, accountId)`.
- [`core/encryption/tokens.ts`](../../core/encryption/tokens.ts) — `decryptToken`.
- [`services/oauth/refreshAndRetry.ts`](../../services/oauth/refreshAndRetry.ts) — wraps Sheets API calls; surfaces refresh on 401 (Google refresh flow).
- [`integrations/google-sheets/api/_base.ts`](../../integrations/google-sheets/api/_base.ts) + [`api/errors.ts`](../../integrations/google-sheets/api/errors.ts) — shared Google API helper + error shapes.
- Existing wrappers: `valuesGet`, `valuesUpdate`, `valuesClear`, `valuesAppend`, `spreadsheetsGet`.

### Per-handler additional dependencies

- **`get_cell_value`** — reuses `valuesGet` with A1-cell range. No new deps.
- **`update_cell`** — reuses `valuesUpdate` with single-cell range. No new deps.
- **`delete_row`** — NEW wrapper `spreadsheetsBatchUpdate` (POST `/v4/spreadsheets/{id}:batchUpdate` with `deleteDimension` request).
- **`find_row`** — reuses `valuesGet` (full sheet range) + V2-side filter logic. Filter shape: `{ column: string | number, operator: enum, value: string | number }`. No new wrapper.
- **`create_spreadsheet`** — NEW wrapper `spreadsheetsCreate` (POST `/v4/spreadsheets`).
- **`batch_update`** (Sheets 2.2) — NEW wrapper `valuesBatchUpdate` (POST `/v4/spreadsheets/{id}/values:batchUpdate`). Different endpoint from `spreadsheetsBatchUpdate`.
- **`format_range`** (Sheets 2.2) — reuses `spreadsheetsBatchUpdate` (extended for the `repeatCell` request type).

### Trigger expansion dependencies (Sheets 2.3 — conditional)

- **P-GS1** (per-row snapshot for `updated` + `removed` change kinds) — new platform slice. See §10.
- Reuses existing `row_changed` filter, normalizer, and webhook receive paths.
- Reuses Drive's `files.watch` lifecycle (already wired).

### New worksheet trigger dependencies (PORT-WHEN-NEEDED)

- Same Drive `files.watch` transport (the watch already fires on tab additions because they bump the file's `modifiedTime`).
- New trigger filter at `integrations/google-sheets/triggers/newWorksheet/`.
- Snapshot of seen `sheetId[]` in `trigger_resources.config`.

---

## 10. Required platform gaps

Two gaps surfaced by this audit. P-GS1 is essential for `updated_row` parity; P-GS2 is optional / on-demand.

### P-GS1 — Per-row diff detection for `updated` and `removed` change kinds

**What:** V1's `updated_row` trigger maintains a per-row hash signature map in `trigger_resources.config` so that any cell change within a row produces an `updated` event. V2's Slice 5 deferred this (§decision-#2) because storing one config blob per workflow with ~1 entry per row scales as `O(rows × workflows)` and a 10,000-row sheet × 20 workflows watching it = 200,000 hash entries in a single Postgres jsonb column.

**Options:**

- **(a) Per-row hash map in `trigger_resources.config`** — same as V1. Simple implementation; storage cost compounds quickly.
- **(b) Bounded snapshot window — last N rows only** — only track signatures for the last 1,000 rows (configurable). Older rows are not diff-tracked; updates to them silently miss. Reduces storage cost to `O(N × workflows)` (bounded).
- **(c) Diff at fetch time — re-read the entire sheet on every webhook fire** — no snapshot table at all; recompute hashes from the current sheet contents and compare against the last known state. **Re-introduces V1's storage cost in memory** but doesn't persist it. Network cost: one full-sheet read per webhook fire.
- **(d) Skip permanently** — document the limitation; V2 only emits `added`. Workflow authors that need true update detection compose `row_changed` + `read_rows` downstream.

**Recommendation:** **(b) bounded window** with a configurable `snapshotRowLimit` (default 1,000, max 10,000). Workflows that need to track larger sheets opt in explicitly. Update events for older rows are silently missed; the trigger config schema documents this limitation. Compromise between fidelity and storage cost.

**Slice:** Independent design slice gated by Marcus's product decision. NOT bundled into Sheets 2.1.

### P-GS2 — Formatting API typed wrapper

**What:** Sheets' `repeatCell` request type (used for cell formatting) is the largest single Sheets API surface — `CellFormat` alone has 12+ sub-fields covering background color, text format (font family, font size, bold, italic, underline, strikethrough, color), alignment (horizontal, vertical), wrap strategy, number format, borders, padding. V1's `format_range` schema has ~25 inputs covering most of these.

**Trade-off:** Typed wrapper means V2 declares which formatting fields it supports; unsupported fields fail at schema parse. The alternative is raw passthrough of Notion's `CellFormat` object, which is the V1-rot pattern V2 audits reject.

**Recommendation:** V2's `format_range` ships a typed subset in Sheets 2.2 covering the dominant formatting cases: background color (RGB), text color, bold/italic, horizontal alignment, number format string. Borders + conditional formatting + data validation defer to on-demand follow-ups. Audit pins this as Sheets 2.2 §scope.

**Slice:** Sheets 2.2 covers the dominant subset. P-GS2 is the future expansion slice when borders / conditional formatting / data validation get product asks.

---

## 11. Effort estimate

Per master plan §6 sizing matrix. Sheets is "Sheets-sized" — V1's 3,517 LOC across 14 files is substantial but most actions are straightforward `values.*` wrappers around bounded Sheets API endpoints.

### Google Sheets 2.1 — Cell + row + spreadsheet lifecycle

**Scope:** 5 actions (`get_cell_value`, `update_cell`, `delete_row`, `find_row`, `create_spreadsheet`). 2 new API wrappers (`spreadsheetsBatchUpdate`, `spreadsheetsCreate`). No new platform infrastructure.

| Commits | Content |
|---|---|
| 1 | This audit. |
| 2 | feat(google-sheets): port cell actions (`get_cell_value`, `update_cell`) |
| 3 | feat(google-sheets): port row deletion + finder (`delete_row`, `find_row`) — includes new `spreadsheetsBatchUpdate` wrapper |
| 4 | feat(google-sheets): port spreadsheet lifecycle (`create_spreadsheet`) — includes new `spreadsheetsCreate` wrapper |
| 5 | test(e2e): extend Google Sheets walkthrough with 2.1 surface |
| 6 | docs(google-sheets): document Google Sheets 2.1 outcomes |

**Estimate: 5 implementation commits + 1 audit + 1 outcomes = 7 commits.** Smaller than Notion 2.1 (9 commits) because fewer per-domain wrapper modules; shape closer to Slack 2.3 lifecycle batches.

### Google Sheets 2.2 — Batch + formatting

**Scope:** 2 actions (`batch_update`, `format_range`). New `valuesBatchUpdate` wrapper. Extended `spreadsheetsBatchUpdate` wrapper for the `repeatCell` request shape.

| Commits | Content |
|---|---|
| 1 | (audit ref — this doc) |
| 2 | feat(google-sheets): port multi-range batch update (`batch_update`) |
| 3 | feat(google-sheets): port cell formatting (`format_range`) — typed subset (color + bold/italic + alignment + number format) |
| 4 | test(e2e): extend Google Sheets walkthrough with 2.2 surface |
| 5 | docs(google-sheets): document Google Sheets 2.2 outcomes |

**Estimate: 4 commits.** Smaller than 2.1; `format_range` is the larger of the two.

### Google Sheets 2.3 — Trigger expansion (CONDITIONAL on P-GS1 product decision)

**Scope:** Extend `row_changed` to emit `changeKind: "updated"` + `"removed"` via P-GS1 per-row snapshot. Optionally add `new_worksheet` trigger.

| Commits | Content |
|---|---|
| 1 | P-GS1 plan doc (per-row snapshot design — options enumerated in §10) |
| 2 | feat(google-sheets): per-row snapshot infrastructure for `row_changed` |
| 3 | feat(google-sheets): emit `changeKind: "updated"` + `"removed"` |
| 4 | (optional) feat(google-sheets): add `new_worksheet` trigger |
| 5 | test(e2e): extend Google Sheets walkthrough with trigger expansion |
| 6 | docs(google-sheets): document Google Sheets 2.3 outcomes |

**Estimate: 5–6 commits + 1 P-GS1 plan.** Largest slice; ships ONLY if Marcus confirms trigger demand AND chooses a P-GS1 option.

### Cross-slice totals

- **Total commits across 2 baseline parity slices (Sheets 2.1 + 2.2):** ~11.
- **Total commits if Sheets 2.3 + P-GS1 ship:** +6 = ~17.
- **New V2 surface (baseline):** 7 actions + 1 new wrapper module (`spreadsheetsBatchUpdate` plus `valuesBatchUpdate` plus `spreadsheetsCreate`).
- **New V2 surface (with 2.3):** + 2 trigger change-kind expansions + 1 platform slice (P-GS1).
- **Calendar effort:** Sheets 2.1 is ~1× a typical Phase 2 slice; Sheets 2.2 is ~0.7×; Sheets 2.3 (if green-lit) is ~1.5×.

---

## 12. Risk estimate

Top 3 risks with likelihood × impact × mitigation.

### R-1 — `find_row` performance on large sheets

- **Likelihood:** medium. V1's `find_row` does a full-sheet `values.get` plus client-side scan because Sheets' API has no server-side filter. A workflow searching a 10,000-row sheet downloads 10,000 rows per execution.
- **Impact:** medium. Workflow latency spikes for large sheets; cost-sensitive in Sheets API quota (one read per execution).
- **Mitigation:** V2 ships the same client-side filter approach (no alternative — Sheets API doesn't support it). Document the cost in the action's schema description ("performance scales with sheet size"). Encourage workflow authors to compose `read_rows` + a narrower range when they know roughly where the row lives. Consider a future server-side query via Apps Script or BigQuery export if a real workflow hits the limit.

### R-2 — `format_range` schema surface explosion

- **Likelihood:** high IF Sheets 2.2 ships the full V1 formatting surface. V1's schema has ~25 inputs; Sheets' `CellFormat` API has 12+ structured sub-fields with their own nested options (e.g., `borders: { top, bottom, left, right }`, each with `style` + `width` + `color`).
- **Impact:** medium. Schema complexity creates a maintenance burden; users who want a rare option (e.g., diagonal borders) end up disappointed.
- **Mitigation:** Sheets 2.2 ships ONLY the dominant typed subset (background color, text color, bold/italic, alignment, number format). Audit recommends explicit deferral of borders / conditional formatting / data validation to on-demand follow-ups (P-GS2). Schema is `.strict()` — unsupported options fail at design time with a clear error pointing to the deferred set.

### R-3 — P-GS1 per-row snapshot storage cost at scale

- **Likelihood:** high IF Sheets 2.3 ships option (a) unbounded snapshot. Per-row hash maps scale as `O(rows × workflows)` and a 10,000-row sheet × 20 workflows watching it = 200,000 hash entries in a single `trigger_resources.config` jsonb column per workflow.
- **Impact:** high. Postgres jsonb columns are not optimized for ~200K entries; queries get slow; storage grows; the watch lifecycle's reactivation cost balloons.
- **Mitigation:** Recommend P-GS1 option (b) — bounded snapshot window (default 1,000 rows, max 10,000) configurable per trigger. Workflows that need to track larger sheets opt in explicitly. Older rows silently miss updates; documented limitation. Compromise between fidelity and cost.

---

## 13. Recommended parity batch plan

Sequence of slices and the order they ship in. Each slice is its own audit-accepted unit; this plan is the recommendation, not the commitment.

1. **Google Sheets 2.1 — Cell + row + spreadsheet lifecycle** (7 commits) — closes the highest-leverage action gaps. No new platform infrastructure. Mirrors Notion 2.1 in shape and effort.
2. **Google Sheets 2.2 — Batch + formatting** (4 commits) — multi-range update + typed-subset formatting. Adds `valuesBatchUpdate` wrapper + extends `spreadsheetsBatchUpdate` for `repeatCell`.
3. **Google Sheets 2.3 — Trigger expansion** (5–6 commits, CONDITIONAL) — extends `row_changed` to emit `updated` + `removed` via P-GS1 per-row snapshot. Optionally adds `new_worksheet` trigger. Gated by product decision on snapshot storage design.

**Across all 2–3 slices:**
- Update master plan §3 priority table: Sheets drops out as priority 5 once 2.1 lands; subsequent providers (Stripe at priority 6 — though Excel was the prior priority 4 ahead of Sheets) proceed.
- Append to master plan §5 rot catalog: any new patterns surfaced during port (GS-R-prefixed entries above are candidates).

**Cross-cutting decisions Marcus must make before 2.1 starts:**
- Confirm the action names (`get_cell_value`, `update_cell`, `delete_row`, `find_row`, `create_spreadsheet`) are the right shape — these match V1's naming.
- Confirm `find_row` schema shape: `{ spreadsheetId, sheetName, column: string | number, operator: enum, value: string | number, returnAll?: boolean }`. **Recommend:** ship the `equals` operator only in Batch 1; `contains` / `starts_with` / etc. on demand.
- Confirm `create_spreadsheet` ships the bare `spreadsheets.create` surface (title + description + initial sheets array). V1's template UX (budget/project/crm chrome) is NOT ported.
- Confirm `exportSheet` is permanently SKIPPED in favor of `read_rows` + downstream filter composition. **Recommend:** SKIP per §7 + GS-R2.
- Confirm `unifiedAction.ts` router pattern is permanently SKIPPED. **Recommend:** SKIP per §7 + GS-R1.

**Cross-cutting decisions Marcus must make before 2.3 starts (if 2.3 ships):**
- Decide P-GS1 option (a / b / c / d per §10): unbounded snapshot vs bounded window vs in-memory diff vs permanent skip.
- Decide whether `new_worksheet` trigger ships in 2.3 or is deferred to on-demand.

---

## 14. Exit checklist

This audit is complete when Marcus has:

- [ ] Read sections 1–13.
- [ ] Confirmed the action port / skip / defer table (§7) — especially the **SKIP** decisions (`exportSheet` recipe, `unifiedAction` router pattern, `createRow` / `listRows` orphans).
- [ ] Confirmed the trigger table (§7) — 1 ALREADY-SHIPPED, 2 PORT-EXPANSION gated by P-GS1, 1 PORT-WHEN-NEEDED.
- [ ] Confirmed the 2 platform gaps (§10): **P-GS1** per-row snapshot (conditional), **P-GS2** formatting wrapper expansion (optional).
- [ ] Confirmed the recommended split into **2–3 parity slices** (§11) with an estimated **~11 commits baseline / ~17 commits with 2.3**.
- [ ] Decided whether to:
  - **(a)** start Sheets 2.1 immediately after acceptance, defer 2.3 product decision until 2.1 ships; OR
  - **(b)** make the P-GS1 product decision before 2.1 starts so the trigger timeline is locked; OR
  - **(c)** modify the slice boundary (e.g. fold `format_range` into 2.1 if a workflow template needs it sooner).
- [ ] Confirmed name decisions (§13 "Cross-cutting decisions"): `get_cell_value` / `update_cell` / `delete_row` / `find_row` / `create_spreadsheet` mirror V1 names; `exportSheet` permanently skipped; `unifiedAction` pattern permanently skipped.
- [ ] Confirmed `find_row` ships `equals`-only operator in Batch 1; other 11 V1 operators on demand.
- [ ] Confirmed `create_spreadsheet` ships the bare API surface; V1 template chrome (budget/project/crm/inventory/calendar) NOT ported.
- [ ] Confirmed `format_range` (Sheets 2.2) ships a typed subset (background/text color, bold/italic, alignment, number format) and explicitly defers borders / conditional formatting / data validation.

**Implementation does NOT begin before Marcus checks every box above.**
