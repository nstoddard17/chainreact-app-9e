# Slice 5 — Google Sheets provider port

**Branch:** `slice-5-google-sheets` (off `slice-4-google-drive` @ `e449d5b69`).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Google Sheets from V1 with five actions (`read_rows`, `append_row`, `update_row`, `clear_range`, `get_sheet_metadata`) plus a watch-based push trigger (`row_changed`). Sheets rides Calendar/Drive's Google watch infrastructure — there is no Sheets-specific watch API.

Batches:
- **Batch 1** (this slice) — provider port + unit tests + gates green.
- **Batch 2** — `slice-5b-google-sheets-walkthrough` — Playwright e2e with mocked Sheets boundary. Defer until Batch 1 is green.

---

## Why Sheets after Drive

V1's Sheets watch lifecycle ([`lib/webhooks/google-sheets-watch-setup.ts:51-54`](../../../nstoddard17/chainreact-app-9e/lib/webhooks/google-sheets-watch-setup.ts#L51)) explicitly comments:

> *"Since Sheets doesn't have native webhooks, we use Drive API to watch the spreadsheet file."*

V1 calls `drive.files.watch` on the spreadsheet's fileId and `drive.changes.getStartPageToken` for the cursor — exact same wire-format V2 already ships in `integrations/google-drive/api/{filesWatch,changesGetStartPageToken,changesList,channelsStop}.ts`.

So Sheets reuses:
- shared Google OAuth helper (`integrations/_shared/google/oauth.ts`)
- shared HMAC channel-token helper (`integrations/_shared/google/channelToken.ts`)
- subscription-watch lifecycle (`activationRegistry` / `deactivationRegistry` / `subscriptionRegistry` / `runRenewals` + `app/api/cron/renew-watch-subscriptions/route.ts`)
- per-provider webhook route convention
- DB-backed dedup (`webhook_event_dedup`)
- Drive's watch + changes wrappers (decision below — direct import for Batch 1)

Net new code: Sheets manifest, Sheets OAuth (different scope + redirect URL), Sheets API wrappers (values.get/append/update/clear, spreadsheets.get), 5 action handlers, 1 trigger lifecycle that snapshots row count + diffs on each notification.

Zero new platform machinery. Zero new external setup (same `GOOGLE_CLIENT_ID` already in `.env.local`).

---

## Confirmed scope decisions

1. **Single trigger** — `row_changed`. Payload includes `changeKind: "added"` (Batch 1 only emits added; updated/removed deferred per below), `spreadsheetId`, `sheetName`, `sheetId` if available, `rowIndex` (1-indexed for the first new row), `rowValues` (the appended row's values), `headers` (first-row values when `headerRow=true`), and the raw Drive change metadata for debugging.
2. **`changeKind` honesty.** V1 maintains a per-row hash signature map (`rowSignatures` keyed by row index) to detect updated/removed rows. **V2 Batch 1 does NOT do this** — the storage cost (one config blob per workflow with ~1 entry per row) violates the "no large snapshot table" rule. Instead Batch 1 stores only `lastRowCount` in `trigger_resources.config` and emits `changeKind: "added"` for any row whose index > previous lastRowCount. Updates and removes are silently invisible to the trigger; flagged as a follow-up in §"Out of scope". The trigger field shape includes `changeKind` so the future expansion is non-breaking.
3. **Scope** — `https://www.googleapis.com/auth/spreadsheets` (full read/write) + `https://www.googleapis.com/auth/userinfo.email`. Drive's narrower `drive` scope does NOT grant Sheets API access; Sheets needs its own scope. `spreadsheets.readonly` is too narrow for the Batch 1 write actions.
4. **Watch wrappers — direct import from Drive for Batch 1.** Sheets' trigger imports `filesWatch`, `changesGetStartPageToken`, `changesList`, `channelsStop`, and `errors.{NotFoundError,PageTokenExpiredError}` directly from `@/integrations/google-drive/api/`. Cross-provider import is mildly odd but matches reality — Sheets ride Drive's watch APIs. Extraction to `_shared/google/driveApi/` is **deferred** to a follow-up commit if a third Google product ever needs the same wrappers (Docs would). Premature extraction is its own complexity. The plan doc records this decision so a future reader understands why Sheets imports from Drive's namespace.
5. **Action subset** — `read_rows`, `append_row`, `update_row`, `clear_range`, `get_sheet_metadata`. Defer: `format_range`, `batch_update`, `delete_row`, `find_row`, `create_spreadsheet`, charts/pivots/tables.
6. **Q11 explicit fields.** `valueInputOption` (`"RAW"` | `"USER_ENTERED"`) is required on all write actions — V1 silently defaulted to `RAW`, which surprises users who paste formulas.

---

## V1 reference paths

OAuth + scopes:
- [`lib/integrations/oauthConfig.ts:104-118`](../../../nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L104) — `"google-sheets"` entry. V1 leaves scope blank (relies on consent screen). V2 sets explicit scope.

Node manifest:
- [`lib/workflows/nodes/providers/google-sheets/index.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-sheets/index.ts) — schemas, fields, output shapes, dynamic loaders.
- [`lib/workflows/nodes/providers/google-sheets/actions/{appendRow,batchUpdate,clearRange,deleteRow,findRow,formatRange,getCellValue,updateCell,updateRow}.schema.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/google-sheets/actions/) — V2 ports schemas for the 5 approved verbs only.

Action handlers (V1):
- [`lib/workflows/actions/google-sheets/createRow.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/createRow.ts) → V2 `append_row`.
- [`lib/workflows/actions/google-sheets/listRows.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/listRows.ts) → V2 `read_rows`.
- [`lib/workflows/actions/google-sheets/updateRow.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/updateRow.ts) → V2 `update_row`.
- [`lib/workflows/actions/google-sheets/clearRange.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/clearRange.ts) → V2 `clear_range`.
- [`lib/workflows/actions/google-sheets/utils.ts`](../../../nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/utils.ts) — `parseSheetName`, range-building helpers. V2 ports the small bits inline.

V2 has NO direct V1 source for `get_sheet_metadata`; it's a thin wrapper over `spreadsheets.get?fields=sheets.properties`.

Watch lifecycle:
- [`lib/triggers/providers/GoogleApisTriggerLifecycle.ts:32-211`](../../../nstoddard17/chainreact-app-9e/lib/triggers/providers/GoogleApisTriggerLifecycle.ts#L32) — Sheets-specific branches (lines 113-211) + multi-provider deactivate (line 480+).
- [`lib/webhooks/google-sheets-watch-setup.ts`](../../../nstoddard17/chainreact-app-9e/lib/webhooks/google-sheets-watch-setup.ts) — confirms Drive `files.watch` is the underlying mechanic; captures `lastRowCount` + `rowSignatures` snapshot at activate.
- [`lib/triggers/pollers/google-sheets.ts`](../../../nstoddard17/chainreact-app-9e/lib/triggers/pollers/google-sheets.ts) — V1 has BOTH watch and polling. V2 ships watch only for Batch 1; polling is a deliberate non-goal.

Webhook receiver:
- [`app/api/webhooks/google/route.ts:153-182`](../../../nstoddard17/chainreact-app-9e/app/api/webhooks/google/route.ts#L153) — V1 multiplexer. V2 ships per-provider route at `app/api/webhooks/google-sheets/route.ts`.

Tests (style reference):
- `__tests__/nodes/sheets-create-row.test.ts` — V1 has only this one. V2 builds a richer test set per Drive's example.

DEPRECATED — DO NOT COPY:
- V1's polling fallback for Sheets (`lib/triggers/pollers/google-sheets.ts`) — V2 only ships the watch path. If real users need polling later, add it as a separate trigger type.
- V1's row-hash snapshot (`rowSignatures` map) — heavy and not needed for Batch 1's added-only changeKind.

---

## V2 → V1 file-by-file map

**Created in Commit 1 (this commit):**
- `docs/slices/slice-5-google-sheets.md` (this file)

**Created in Commit 2 (manifest + OAuth):**
- `integrations/google-sheets/manifest.ts`
- `integrations/google-sheets/oauth.ts`
- `tests/unit/integrations/google-sheets/manifest.test.ts`
- `tests/unit/integrations/google-sheets/oauth.test.ts`

**Modified in Commit 2:**
- `integrations/_registry.ts` — add `googleSheetsManifest`
- `services/oauth/dispatcher.ts` — add `"google-sheets": googleSheetsOAuth`

**Created in Commit 3 (5 actions + API wrappers):**
- `integrations/google-sheets/api/_base.ts` (env-driven base URL with `GOOGLE_SHEETS_API_BASE` override)
- `integrations/google-sheets/api/{spreadsheetsGet,valuesGet,valuesAppend,valuesUpdate,valuesClear}.ts`
- `integrations/google-sheets/api/errors.ts` (NotFoundError mirroring Calendar/Drive)
- `integrations/google-sheets/utils/parseSheetName.ts` (small helper from V1's utils.ts)
- `integrations/google-sheets/actions/{readRows,appendRow,updateRow,clearRange,getSheetMetadata}.ts`
- `integrations/google-sheets/actions/{readRows,appendRow,updateRow,clearRange,getSheetMetadata}.schema.ts`
- `tests/unit/integrations/google-sheets/actions/*.test.ts` (5 tests)

**Modified in Commit 3:**
- `services/execution/handlers/_registry.ts` — add 5 Sheets handler entries
- `integrations/google-sheets/manifest.ts` — flip `actions: true`

**Created in Commit 4 (row_changed trigger):**
- `integrations/google-sheets/triggers/rowChanged/{index,activate,deactivate,renew,pull,normalize}.ts`
- `integrations/google-sheets/webhooks/receive.ts`
- `app/api/webhooks/google-sheets/route.ts`
- `tests/unit/integrations/google-sheets/triggers/rowChanged/{activate,deactivate,renew,pull,normalize}.test.ts`
- `tests/unit/integrations/google-sheets/webhooks/receive.test.ts`

**Modified in Commit 4:**
- `integrations/_registry.ts` — add `import "./google-sheets/triggers/rowChanged";`
- `integrations/google-sheets/manifest.ts` — flip `webhookTrigger: true`

**Imports from existing V2 (Drive) — NOT moved/copied for Batch 1:**
- `@/integrations/google-drive/api/filesWatch`
- `@/integrations/google-drive/api/changesGetStartPageToken`
- `@/integrations/google-drive/api/changesList`
- `@/integrations/google-drive/api/channelsStop`
- `@/integrations/google-drive/api/errors` — `NotFoundError`, `PageTokenExpiredError`

When/if a third Google product needs these (e.g., Docs), promote to `integrations/_shared/google/driveApi/` in a single dedicated commit before the third provider's Batch 1.

---

## Trigger algorithm (Batch 1 — added-only)

**activate:**
1. Validate `config.spreadsheetId` (required) and `config.sheetName` (required for Batch 1; V1 supports omitting it for "watch all sheets" but V2 Batch 1 narrows scope).
2. Fetch initial state via `spreadsheets.values.get?range={sheet}!A:Z&majorDimension=ROWS`. Snapshot `lastRowCount = response.values?.length ?? 0`.
3. Capture `pageToken` via Drive `changes.getStartPageToken` (reused from Drive — Sheets watches via Drive).
4. Generate `chainreact-{nodeId}-{uuid}` channelId, sign with HMAC, call Drive `files.watch` with `fileId = config.spreadsheetId`.
5. Store config patch: `{type: "subscription-watch", webhookEnabled: true, spreadsheetId, sheetName, channelId, resourceId, pageToken, lastRowCount, headerRow, expiresAt}`.

**pull (on each notification):**
1. Read stored `lastRowCount`. If undefined, treat as resyncRequired.
2. Read current values via `spreadsheets.values.get?range={sheet}!A:Z`.
3. If currentRowCount > lastRowCount: emit `changeKind: "added"` events for rows `[lastRowCount, currentRowCount)`. Each event's payload includes the row's values, the rowIndex (1-indexed), and headers if `headerRow=true`.
4. If currentRowCount === lastRowCount or smaller: emit zero events. Updates/removes are not detected in Batch 1 (documented limitation).
5. Update `lastRowCount` in `trigger_resources.config` regardless of whether events were emitted (so the next notification baselines off the latest count).
6. Drive's `changes.list` is NOT called on each notification — Sheets uses the file-level watch's notification AS the trigger; we don't need Drive's per-file change feed because the spreadsheet's identity hasn't changed (just its contents). Calling `values.get` directly is the cheaper path.

**deactivate:**
1. Drive `channels.stop` on stored channelId/resourceId. Best-effort (404 → swallow).

**renew:**
1. Same algorithm as Drive's renew (register-new-then-stop-old). `lastRowCount` survives rotation.

---

## Dedup key shape

`(provider, eventId)`:
- `provider` = `"google-sheets"`.
- `eventId` = `${spreadsheetId}:${sheetName}:${rowIndex}:${rowValuesHash}` — the row's identity. The rowValuesHash is a SHA-256 of the row values (joined). This catches duplicate notifications from Google for the same row addition (same rowIndex+values → same hash). If the same rowIndex is overwritten with different values, the hash differs, and a fresh dedup key is emitted (treated as a separate "added" event in Batch 1's added-only model — acceptable trade-off).

---

## Risk callouts

1. **No native Sheets webhooks.** Drive `files.watch` fires when ANY change happens to the spreadsheet — including non-row edits (rename, formatting, comments). The pull algorithm reads `values.get` and only emits when `lastRowCount` advances, so non-row changes are silently swallowed. Acceptable for Batch 1.
2. **Watch TTL.** Same as Drive (V1 implicitly assumes 7d). Renewal cron handles rotation; no Sheets-specific concern.
3. **`changes.list` page-token expiration.** Sheets pull does NOT use `changes.list` (see trigger algorithm step 6) — it reads `values.get` directly. So the 410 / `PageTokenExpiredError` path doesn't fire from this trigger. The `pageToken` we store is unused in pull but gets persisted at activate so a future polling-mode reuses it. (Minor wasted bytes; not worth removing now.)
4. **Sheet name vs sheet id.** V1 uses `sheetName`. Renaming the sheet between activate and notification breaks the watch — pull tries to read a now-missing range. V2 surfaces this as a normal API error (`spreadsheets.values.get` 400) and lets it propagate; the workflow author sees "sheet 'Foo' not found". Future-proofing via sheetId is a follow-up.
5. **Row-count drift.** If a user adds rows directly while the watch is being set up, the activate snapshot might miss those rows (race). Acceptable — the next notification after activate emits whatever's `> lastRowCount`.
6. **`values.get` quota.** Sheets API quota is 60 reads/minute/user by default. A noisy spreadsheet could hit quota. Out of scope for Batch 1; revisit if a real workflow trips it.

---

## V1 bugs / legacy patterns NOT carried into V2

1. **Polling-as-backup.** V1's activate sets `pollingEnabled: true` even when the watch is registered. V2 ships watch-only for Batch 1; polling is a deliberate non-goal.
2. **Heavy `rowSignatures` snapshot.** V1 stores per-row hashes for update/remove detection. V2 stores only `lastRowCount` and emits added-only.
3. **Per-sheet `sheetData` map.** V1 stores rowCount/columnCount for every sheet in the spreadsheet. V2 stores only the single watched sheet's metadata.
4. **JSON-blob channel token.** V1 stores JSON metadata as the watch token (Drive lesson). V2 uses the shared HMAC helper.
5. **Webhook multiplexer.** V1's `/api/webhooks/google` switches on resource. V2 uses per-provider `/api/webhooks/google-sheets`.
6. **Blank OAuth scope.** V1's `oauthConfig.ts` has empty scope for Sheets. V2 sets explicit `spreadsheets` + `userinfo.email`.
7. **`createRow.ts` accepts `newRow_*` UI-injected fields.** V2 takes a clean `values: string[]` array OR `valuesByColumn: Record<string, string>`. Whichever the schema settles on; the V1 multi-mode pattern is replaced.

---

## Out-of-scope (echoed from approved scope)

- `format_range`, `batch_update`, `delete_row`, `find_row`, `create_spreadsheet`
- Advanced formatting, charts, pivots, named-range table operations
- `new_worksheet` trigger (V1 has it; V2 defers)
- Updated/removed `changeKind` detection — requires per-row snapshot storage; flagged as follow-up. **If users complain that "added-only" isn't enough, stop and report before adding a snapshot table.**
- Polling fallback (V1 has it; V2 watch-only)
- Multi-sheet watch (V1 supports omitting sheetName; V2 Batch 1 requires it)
- E2e Batch 2 until Batch 1 is green
- Any push / PR / merge
- Unrelated cleanup
- Cross-provider helper extraction (defer until a third Google product needs it)
