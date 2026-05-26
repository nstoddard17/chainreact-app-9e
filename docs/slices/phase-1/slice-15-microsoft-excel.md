# Slice 15 — **Microsoft Excel** provider port

**Branch:** `v2-provider-port-local` (local-only continuation; no separate slice branch).
**Reference codebase:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e` (V1).
**Goal:** Port Microsoft Excel from V1 as the next Phase 1 provider after GitHub. Reuses the existing V2 Microsoft OAuth foundation (`_shared/microsoft/oauth.ts`) already proven by Outlook Mail, Outlook Calendar, and OneDrive. Ships **6 typed action handlers** covering core spreadsheet primitives (worksheet row CRUD + table append + worksheet create + range read), and **2 polling triggers** (`new_row` for worksheets, `new_table_row` for tables) on top of V2's existing polling registry. Closes a real V1 OAuth duplication bug (separate `EXCEL_CLIENT_ID/SECRET` Azure AD app for what should be the same Microsoft tenant) and a real V1 polling-baseline bug (first poll silently drops events on snapshot-seed failure).

Excel is the next Phase 1 provider because it is **useful, smaller than Teams, and structurally a duplicate of OneDrive + Sheets** — same Microsoft OAuth, same Graph base wrapper, same driveItem-shaped resource path. It validates a clean polling/hash-diff pattern over Microsoft Graph workbooks without taking on Teams' tenant-admin / app-only auth setup friction. It is also the **first V2 provider with polling triggers** — the polling registry exists and is exercised by the Gmail historyId-cursor pattern, but no provider has used it for snapshot-diff polling yet. Slice 15 proves that path.

---

## V1 audit — paths and findings

### Manifest / node definitions

- Single manifest file: [`lib/workflows/nodes/providers/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/microsoft-excel/index.ts) (1637 lines). Declares **5 triggers + 11 actions** inline.
- Triggers (all polling): `microsoft_excel_trigger_new_row` (worksheet), `microsoft_excel_trigger_updated_row` (worksheet, position-based), `microsoft_excel_trigger_new_worksheet`, `microsoft_excel_trigger_new_table_row` (table, stable row ids), `microsoft_excel_trigger_updated_table_row` (table, stable row ids).
- Actions: `microsoft_excel_action_create_workbook`, `_action_add_row`, `_action_update_row`, `_action_delete_row`, `_action_add_table_row`, `_action_add_multiple_rows`, `_action_create_worksheet`, `_action_rename_worksheet`, `_action_delete_worksheet`, `microsoft-excel_action_export_sheet` (Get Rows; note hyphenated provider prefix vs underscore — V1 inconsistency), and one orphaned `unifiedAction`.

### Action handlers

- Handler directory: [`lib/workflows/actions/microsoft-excel/`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/). 11 handler files + index.
- Index export list: [`lib/workflows/actions/microsoft-excel/index.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/index.ts) — `unifiedAction.ts` is **NOT exported**, confirming dead code.
- All handlers use `Authorization: Bearer ${accessToken}` against `https://graph.microsoft.com/v1.0/me/drive/items/{workbookId}/workbook/...`.
- Endpoints used:
  - **Worksheet row append**: `GET /worksheets('{name}')/usedRange` to find tail, then `PATCH /worksheets('{name}')/range(address='A{row}:Z{row}')` ([`createRow.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/createRow.ts) lines 1-322).
  - **Table row append**: `GET /tables/{tableName}/columns` then `POST /tables/{tableName}/rows` body `{ values: [rowValues] }` ([`addTableRow.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/addTableRow.ts) lines 1-143).
  - **Worksheet create**: `POST /worksheets/add` body `{ name }`.
  - **Workbook create**: `PUT /me/drive/root:/{folderPath}/{name}.xlsx:/content` with `ExcelJS`-generated XLSX binary, then per-worksheet `/worksheets/add` with a 2s sleep for filesystem lock release ([`createWorkbook.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/createWorkbook.ts)).
  - **Export sheet** (Get Rows): `GET /worksheets('{name}')/usedRange` or custom A1 range, then in-memory keyword/filter/sort/limit ([`exportSheet.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-excel/exportSheet.ts)).
- **No workbook-session-id headers anywhere** — every Graph call is stateless. Workbook-session headers are a Graph performance optimization (batches changes to a persistent edit session); skipping them costs latency on multi-step writes but is functionally correct.
- **No idempotency keys.** Graph workbook endpoints don't expose one. V2's session-side-effects layer (Q4 contract) covers this — every handler will call `checkReplay`/`recordFired` keyed on `(executionSessionId, nodeId, actionType)` from the engine's `HandlerExecutionMeta`.
- 401 handling — ad-hoc per handler (calls `getDecryptedAccessToken` once, no retry). V2 wraps every action's principal call in `refreshAndRetry` with the shared Microsoft refresh policy from `_shared/microsoft/oauth.ts:refreshMicrosoftToken` (preserve-old refresh-token policy, mirrors Outlook Mail / Calendar).

### Triggers / polling

**Lifecycle (mixed responsibilities, two files):**

- [`lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts) (838 lines). Unified Graph subscription + Excel-snapshot lifecycle. Excel-specific `onActivate` ([lines 175-212](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts#L175)) calls `fetchExcelTableSnapshot()` / `fetchExcelWorksheetSnapshot()` to seed `excelRowSnapshot`. **If snapshot seeding fails (any error), the catch swallows + logs** ([`line 190`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts#L190)) — no retry, no flag, no degraded-state surfacing.
- [`lib/triggers/pollers/microsoft-excel.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts) (418 lines). Dedicated Excel polling handler. Role-based intervals ([lines 9-16](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L9)): free 15min, pro/beta 2min, business/enterprise 60s.
- Snapshot shapes ([lines 25-34](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L25)):
  - `ExcelRowSnapshot = { rowHashes: Record<string, string>; rowCount: number; updatedAt: string }` for row-add/update triggers (worksheet + table).
  - `WorksheetSnapshot = { names: string[]; updatedAt: string }` for new-worksheet trigger.
- Diff strategy: SHA-256 hash per row (`crypto.createHash('sha256').update(JSON.stringify(values))`, [line 826](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L826)) compared against `previousSnapshot.rowHashes`. New keys → fire `new_row`/`new_table_row`. Same key with different hash → fire `updated_row`/`updated_table_row`.
- **Pure pull-and-diff. No Microsoft Graph delta queries.** The `MicrosoftGraphTriggerLifecycle.ts:690` comment about delta queries is misleading — that comment is about OneDrive delta, not Excel. Excel has no delta API on workbook ranges.
- Trigger registry: [`lib/triggers/index.ts:201`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/index.ts#L201) registers `microsoftExcelPollingHandler` alongside `MicrosoftGraphTriggerLifecycle`.

### OAuth flow — V1 has its own Azure AD app row (the bug to fix)

- Config: [`lib/integrations/oauthConfig.ts:338-353`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L338).
  - **Separate `EXCEL_CLIENT_ID` / `EXCEL_CLIENT_SECRET` env vars** — distinct from `MICROSOFT_CLIENT_ID/SECRET` used by Outlook Mail / Calendar.
  - Dedicated callback path `/api/integrations/excel/callback`.
  - Scopes: `offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Files.ReadWrite.All`.
  - Same `/common/oauth2/v2.0/{authorize,token}` endpoints as every other Microsoft provider — the only thing actually different is the client_id/secret pair.
- **This is V1 rot.** Microsoft Graph treats one Azure AD app as the auth principal regardless of which Graph API surface (Excel / OneDrive / Outlook) the resulting token hits — the API surface is determined by the **scopes granted at consent**, not by the app id. V1 ended up with two separate Azure AD apps doing the same thing because Excel was added later and copied the OAuth scaffolding instead of reusing it. **V2 fixes this** by reusing `_shared/microsoft/oauth.ts` (the same module Outlook Mail + Calendar + OneDrive already use) with `MICROSOFT_CLIENT_ID/SECRET`.
- Token-exchange response: standard Microsoft v2 `{ access_token, refresh_token, expires_in, scope, token_type }`. Refreshable.
- Missing scope-validation entry: [`lib/integrations/integrationScopes.ts:1-286`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/integrationScopes.ts) does NOT list `microsoft-excel` (Outlook Mail / Calendar / OneDrive / OneNote / Teams are listed). V2 does not replicate this gap — the manifest's `scopes` block is the source of truth.

### Data loaders (dynamic dropdowns)

- Handlers: [`app/api/integrations/microsoft-excel/data/handlers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/app/api/integrations/microsoft-excel/data/handlers.ts) (653 lines). 8 dropdown loaders: `workbooks`, `worksheets`, `columns`, `tables`, `table_columns`, `folders`, `column_values`, `data_preview`.
- Multi-strategy fetch (root + common folders parallel → search API fallback → /recent fallback) — useful UX, not on Slice 15 critical path.
- **Out of scope for Batch 1.** V2's data-loader registry is not part of Phase 1 provider ports (Outlook Mail / Calendar / OneDrive shipped without one). Defer entirely.

### Shared between V1 Excel handlers + lifecycle

- [`lib/integrations/microsoftGraphAuth.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/microsoftGraphAuth.ts) — `getDecryptedAccessToken(userId, providerKey)` and a `microsoftGraphFetch` wrapper. V2's equivalent is `_shared/microsoft/api/_base.ts` + `refreshAndRetry`, both already shipped.

---

## V2 reusable infrastructure

| # | Helper | V2 file | Purpose for Excel |
|---|--------|---------|-------------------|
| 1 | Shared Microsoft OAuth (PKCE, exchange, refresh) | [`integrations/_shared/microsoft/oauth.ts`](c:/Users/marcu/source/repos/ChainReactV2/integrations/_shared/microsoft/oauth.ts) | Authorize URL, token exchange, refresh — all via `MICROSOFT_CLIENT_ID/SECRET`. **Replaces V1's separate `EXCEL_CLIENT_ID/SECRET`.** |
| 2 | Graph fetch+retry wrapper | `integrations/_shared/microsoft/api/_base.ts` | Reuse for every workbook API call. |
| 3 | Account-id resolver | `integrations/_shared/microsoft/api/me.ts` | Resolves `email` for `accountIdField`. |
| 4 | Graph error parser | `integrations/_shared/microsoft/api/errors.ts` | Surfaces Graph error envelopes for action failures. |
| 5 | Polling registry + handler interface | [`services/triggers/pollingRegistry.ts:48-56`](c:/Users/marcu/source/repos/ChainReactV2/services/triggers/pollingRegistry.ts) | Excel registers its `PollingHandler` alongside Gmail's. |
| 6 | Polling cron entry | [`app/api/cron/poll-triggers/route.ts:25-36`](c:/Users/marcu/source/repos/ChainReactV2/app/api/cron/poll-triggers/route.ts) | Already wired — picks up Excel automatically once registered. |
| 7 | `trigger_resources.config.snapshot.*` persistence | [`repositories/triggerResources.ts:15-29`](c:/Users/marcu/source/repos/ChainReactV2/repositories/triggerResources.ts) | Stores `{ rowHashes, rowCount, updatedAt }` per active trigger. |
| 8 | OneDrive provider as template | [`integrations/microsoft-onedrive/`](c:/Users/marcu/source/repos/ChainReactV2/integrations/microsoft-onedrive/) | Closest analog: same Microsoft OAuth, same Graph driveItem path, separate provider id. Manifest + actions structure copies cleanly. |

**Not needed for Excel:**
- `_shared/microsoft/api/subscriptions.ts` (Excel polls; no Graph subscriptions).
- `_shared/microsoft/webhooks/validation.ts` (no webhook handshake).
- `services/triggers/runRenewals.ts` (no subscription-watch renewal — polling triggers do not expire).

---

## Confirmed scope decisions

1. **Provider id:** `microsoft-excel` (separate provider row, matching the OneDrive / Outlook-Mail / Outlook-Calendar pattern — one Azure AD app, three separate `integrations` rows because the user's connected-state per-API-surface is independent).
2. **OAuth model:** refreshable, PKCE S256, `/common/` multi-tenant endpoint — entirely via the shared `_shared/microsoft/oauth.ts` helpers. **Single Azure AD app via `MICROSOFT_CLIENT_ID/SECRET`** (closes V1's `EXCEL_CLIENT_ID/SECRET` duplication).
3. **Scopes (required):** `offline_access`, `User.Read`, `Files.ReadWrite`. **Conservative choice** — V1 used `Files.ReadWrite.All` (covers shared-with-me workbooks). V2 starts narrower; can widen in a follow-up if a real user needs cross-drive access. Workbooks live in the user's OneDrive root for the common case.
4. **Token shape:** access + refresh, `expires_in` populated. Refresh uses preserve-old policy from `refreshMicrosoftToken`.
5. **`accountIdField`:** `email` (mail ?? userPrincipalName fallback via shared `getMe()`). Same as OneDrive.
6. **`tokenScope`:** `"user"` — one Excel integration per (user, email).
7. **Health-check interval:** Microsoft tier (6h) per CLAUDE.md §4 health-check intervals table.
8. **Action surface (Batch 1 — 6 actions):** see "Batch 1 action list" below.
9. **Action surface deferred (Batch 2 candidates — 5 actions):** `create_workbook` (heavy `ExcelJS` dep), `update_row` (V1 position-based tracking is fragile), `delete_row` (range/match-column logic complex), `add_multiple_rows` (batch optimization, not core), `rename_worksheet`, `delete_worksheet`.
10. **Trigger surface (Batch 1 — 2 triggers):** `microsoft_excel_trigger_new_row` (worksheet) + `microsoft_excel_trigger_new_table_row` (table). Both polling.
11. **Trigger surface deferred:** `microsoft_excel_trigger_updated_row`, `microsoft_excel_trigger_updated_table_row`, `microsoft_excel_trigger_new_worksheet`. Updated-row triggers carry V1 fragility (worksheet uses position-based row ids that shift on insert/delete); ship after the new-row variant lands and is exercised in production.
12. **Polling architecture:** plug into V2's existing polling registry. **No new polling infrastructure.** Single `PollingHandler` covering both Excel triggers via `canHandle(trigger) → trigger.type.startsWith("microsoft_excel_trigger_")`.
13. **Polling interval:** fixed at **60 seconds** for Batch 1. Match Gmail's polling cadence. Defer V1's role-based ladder (free 15m / pro 2m / business 60s) to a later optimization — it adds product surface (plan tiers) that the slice doesn't need to validate.
14. **Snapshot baseline-on-activate (closes V1 bug):** `onActivate()` MUST establish the snapshot before returning success. If snapshot fetch fails, the activation FAILS — never silently degrade to "no baseline → first poll skip." This is the V1 polling bug per CLAUDE.md §4 "Polling Trigger Snapshot Initialization."
15. **Snapshot persistence:** `trigger_resources.config.snapshot = { rowHashes: Record<string, string>; rowCount: number; updatedAt: string }`. Identical shape to V1's `ExcelRowSnapshot` so the diff algorithm ports directly.
16. **Hash key per row:** for worksheets — `${rowIndex}` (position-keyed, since worksheets have no stable row id). For tables — table row id (Graph returns one per row).
17. **Workbook-session headers:** **NOT used in Batch 1.** Match V1. Adding session optimization is a follow-up if real-world latency complaints surface.
18. **401 handling:** every action wraps its principal Graph call in `refreshAndRetry` per CLAUDE.md §6 OAuth 401 handling rule. Refresh on first 401 → retry once → permanent failure → `token_revoked` health signal.
19. **Idempotency:** every action wraps with `checkReplay`/`recordFired` from `lib/workflows/actions/core/sessionSideEffects.ts` per CLAUDE.md §6 Q4. Hash uses canonical-form `hashPayload` over the resolved input.
20. **Q11 (no hidden defaults):** the "First row contains headers" boolean is a behavior switch, not a high-risk default — defaults to `true` in the manifest is acceptable. No high-risk fields (auto-notify / visibility / consent / AI behavior) in any of the 6 Batch 1 actions, so no `requireExplicitField` calls needed.
21. **No new Supabase migrations.** `trigger_resources.config jsonb` already accepts the snapshot shape.

---

## Batch 1 action list (final)

| # | Action type | Title | Graph endpoint(s) | Notes |
|---|-------------|-------|-------------------|-------|
| 1 | `microsoft_excel_action_add_row` | Add New Row | `GET /worksheets('{name}')/usedRange` then `PATCH /worksheets('{name}')/range(address='A{tail}:...')` | Append-tail mode only in Batch 1; V1's `prepend` + `specific_row` deferred. |
| 2 | `microsoft_excel_action_add_table_row` | Add Row to Table | `GET /tables/{name}/columns` then `POST /tables/{name}/rows` | Stable row-id append. Cleanest of the 11 V1 actions. |
| 3 | `microsoft_excel_action_create_worksheet` | Create Worksheet | `POST /worksheets/add` body `{ name }` | One-call action, low risk. |
| 4 | `microsoft_excel_action_export_sheet` | Get Rows | `GET /worksheets('{name}')/usedRange` (or custom range) | Read-only. Excluded from Q8d testMode interception by virtue of being a fetch (per CLAUDE.md §10 testMode safety: read-only operations still execute in test mode). |
| 5 | `microsoft_excel_action_get_worksheets` | List Worksheets | `GET /worksheets` | New action — V1 has it as a data loader only. Useful as an action for chaining. Read-only. |
| 6 | `microsoft_excel_action_get_workbooks` | List Workbooks | `GET /me/drive/root/children?$filter=file/mimeType eq 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'` | New action — V1 has it as a data loader only. Read-only. |

Actions 5 and 6 are added as actions (not just data loaders) because workflows that fan-out across workbooks/worksheets need them as runtime primitives, and V2 has not yet ported the data-loader registry pattern. Both are read-only, so risk is bounded.

---

## Batch 1 trigger list (final)

| # | Trigger type | Worksheet vs Table | Snapshot shape | Diff strategy |
|---|--------------|---------------------|----------------|---------------|
| 1 | `microsoft_excel_trigger_new_row` | Worksheet (positional) | `{ rowHashes: { "<rowIndex>": "<sha256>" }, rowCount, updatedAt }` | New `rowIndex` keys → fire. Same key with different hash → ignored in Batch 1 (updated-row trigger is deferred). |
| 2 | `microsoft_excel_trigger_new_table_row` | Table (stable row id) | `{ rowHashes: { "<tableRowId>": "<sha256>" }, rowCount, updatedAt }` | New `tableRowId` keys → fire. Stable id means no false positives on row insert/delete in the middle of the table. |

Both share one `PollingHandler` registered at module load via the established V2 pattern (mirrors `services/triggers/pollingRegistry.ts` + the Gmail handler).

---

## V1 rot to fix during port

1. **Separate Azure AD app for Excel.** V1 uses `EXCEL_CLIENT_ID/SECRET` distinct from `MICROSOFT_CLIENT_ID/SECRET`. V2 uses one app via `_shared/microsoft/oauth.ts`. Closes a real ops gap (two app registrations to maintain, two secrets to rotate, two consent screens for users connecting both Excel and OneDrive).
2. **Polling baseline can silently fail.** V1's `onActivate` swallows snapshot-fetch errors ([`MicrosoftGraphTriggerLifecycle.ts:190`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts#L190)). The poll handler then guards with `if (!previousSnapshot) return` ([`pollers/microsoft-excel.ts:201-202`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/triggers/pollers/microsoft-excel.ts#L201)) and never establishes a baseline on subsequent polls — the trigger silently never fires. V2 fails activation when snapshot seed throws.
3. **Inconsistent provider-prefix in trigger types.** V1 has `microsoft-excel_action_export_sheet` (hyphen) alongside `microsoft_excel_action_*` (underscore). V2 uses underscore consistently for every Excel type.
4. **`unifiedAction.ts` orphan handler.** Not exported from `index.ts`. V2 does not port it.
5. **`createWorkbook.ts` uses CommonJS `require('exceljs')` in TypeScript.** Not on the Batch 1 critical path (action deferred), but flag for whenever it does land.
6. **No scope-validation entry for `microsoft-excel`.** V2's manifest declares scopes — no separate scope-validator file to keep in sync.
7. **Bearer-token convention drift in V1's lifecycle vs handlers.** Same shape as the GitHub `Bearer` vs `token` slip, but not actually ambiguous for Microsoft (Graph requires `Bearer`). Just noting V2 uses `Bearer` consistently because the shared `_base.ts` wrapper enforces it.

---

## V1 patterns to skip

- **Role-based polling intervals** (free 15m / pro 2m / business 60s). Adds plan-tier coupling that V2 doesn't need to validate. Fixed 60s interval for Batch 1.
- **Workbook-session headers** (`workbook-session-id`). Performance optimization, not correctness. Defer.
- **Multi-strategy data-loader fetch** (root + folders parallel + search fallback). Out of Phase 1 scope.
- **`unifiedAction.ts`** orphan.
- **`updated_row` / `updated_table_row` / `new_worksheet` triggers.** Defer to Batch 2 — updated-row in particular needs careful treatment of the position-vs-stable-id distinction.
- **Microsoft Graph delta queries.** Excel workbook ranges have no delta API. The V1 comment about delta is misleading (refers to OneDrive driveItem delta, not Excel).
- **`create_workbook` action with `ExcelJS` binary generation.** Heavy dependency added for a single action that could be replaced with `POST /me/drive/root/children` + minimal XLSX template. Defer entirely.

---

## Open questions / decisions to flag

1. **Workbook scope choice.** `Files.ReadWrite` covers the user's own OneDrive but NOT shared-with-me workbooks. V1's `Files.ReadWrite.All` is broader. Recommend starting with `Files.ReadWrite` and widening only if a real workflow needs it. **Not blocking Commit 1.**
2. **`tokenScope: "user"` vs upgrading to a workspace-scoped Excel later.** Keep `"user"` for now — matches every other Microsoft provider. **Not blocking.**
3. **Polling cadence floor.** V2 polls every 60s; Microsoft Graph throttles workbook reads aggressively. May need to back off if 429s appear during e2e. **Will surface during Commit 4.**
4. **Header-detection in `add_row`.** When `hasHeaders: true`, the `rowFields` schema is rendered against parsed column headers. V1 uses a custom dynamic-field type; V2's manifest doesn't have an equivalent dynamic-field renderer yet. **Decision deferred to Commit 3** — likely ship `add_row` accepting a flat `Record<string, unknown>` and resolving column letters from a fresh header read at execute time.
5. **`createWorkbook` long-term home.** Skip in Batch 1; revisit whether the `ExcelJS` dependency is acceptable when the action lands. **Not blocking.**

---

## Local batch plan (5 commits)

| Commit | Scope | New files | Edits to shared files |
|--------|-------|-----------|------------------------|
| **1 (this)** | Plan doc only. | `docs/slices/slice-15-microsoft-excel.md` | None. |
| **2** | Manifest + OAuth registration via shared `_shared/microsoft/oauth.ts`. Provider folder skeleton: `integrations/microsoft-excel/{manifest.ts,oauth.ts,actions/,triggers/,api/}`. Dispatcher + registry append-only entries. | `integrations/microsoft-excel/manifest.ts`, `oauth.ts`, `api/_base.ts` (workbook-resource Graph wrappers). | `integrations/_registry.ts` (one-line append after Mailchimp settles), dispatcher entry append. |
| **3** | 6 Batch 1 actions + Graph workbook API wrappers. All wrapped in `refreshAndRetry` + `checkReplay`/`recordFired`. Zod schemas. Unit tests colocated under `tests/unit/integrations/microsoft-excel/actions/`. | 6 action files + 6 schema files + 6 unit-test files; `integrations/microsoft-excel/api/workbooks.ts`, `worksheets.ts`, `tables.ts`. | Action handler-registry append-only entries. |
| **4** | 2 polling triggers with snapshot-baseline-on-activate behavior (closes V1 bug). One `PollingHandler` covering both. Unit tests for activation, deactivation, baseline-seed, diff-emit. | `integrations/microsoft-excel/triggers/{newRow,newTableRow}/index.ts`, snapshot helpers, `triggers/_pollingHandler.ts`. | Module imports added at provider barrel for registration side-effect. |
| **5** | Mocked Microsoft Graph Excel e2e walkthrough — full provider lifecycle: OAuth → activate trigger → seed snapshot → poll baseline tick → poll change tick (emit) → run action → deactivate. Mirrors GitHub's mocked walkthrough shape. | `tests/e2e/walkthroughs/microsoft-excel.spec.ts`, mock fixtures under `tests/e2e/fixtures/microsoft-excel/`. | None. |

Each commit lands locally, gates green, no push.

---

## Validation gates (per commit)

```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

Commit 1 only adds a markdown file under `docs/`, so all five gates should pass without code-affecting changes. Commit 5 adds an e2e walkthrough that should also pass `npm test` (e2e suites run separately via Playwright, not Jest).

---

## External setup (not blocking Commit 1)

- Reuse the existing Microsoft Azure AD app already configured for Outlook Mail / Calendar / OneDrive. The app already has `Files.ReadWrite` consented for OneDrive — no new consent UI for users who've already connected OneDrive.
- No new env vars (the same `MICROSOFT_CLIENT_ID/SECRET` are reused).
- No new public webhook URL (polling, no inbound webhooks).
- No new database migrations.

---

## Constraints

- No push.
- No PR.
- Do NOT touch any Mailchimp file (`integrations/mailchimp/**`, `integrations/_shared/mailchimp/**`, `app/api/webhooks/mailchimp/**`, `tests/unit/**/mailchimp/**`, `tests/unit/**/mailchimp.*`). Mailchimp is in flight in another chat.
- Do NOT touch `integrations/_registry.ts` in Commit 1 (it is dirty from Mailchimp work).
- No new Supabase migrations.
- No Teams / app-only / tenant-admin auth.
- Do not start Commit 2 until Commit 1 is accepted.
