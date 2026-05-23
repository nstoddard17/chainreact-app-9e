# Google Sheets Metadata Outcomes — Slice 3.GSHEETS-5

**Status:** Doc-only checkpoint. Closes the Google Sheets builder-metadata arc.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Companion docs:**
[`./google-sheets-action-metadata-plan.md`](./google-sheets-action-metadata-plan.md),
[`./builder-metadata-coverage-checkpoint.md`](./builder-metadata-coverage-checkpoint.md),
[`./options-source-plan.md`](./options-source-plan.md).

Every count and field-shape claim in this doc was verified by reading live files (`services/discovery/_registry.ts`, `services/execution/handlers/_registry.ts`, `tests/structure/discovery-meta-coverage.test.ts`, `integrations/google-sheets/**`) — not from memory.

---

## 1. Commit chain

| Slice | Commit | Scope |
| --- | --- | --- |
| GSHEETS-1 | `58f7a8c88` | Doc-only plan ([`./google-sheets-action-metadata-plan.md`](./google-sheets-action-metadata-plan.md)). Mapped 12 actions + 2 triggers, locked the resolver-first sequence, accepted the `drive.metadata.readonly` scope cost. |
| GSHEETS-2 | `0455b7c0e` | OptionsSource resolvers. `google-sheets:spreadsheets` + `google-sheets:sheets` (`dependsOn: spreadsheetId`), Drive `listSpreadsheets` API wrapper, manifest scope add, registry entry, 60 / 60 unit + cascade integration tests. |
| GSHEETS-3 | `9ff28372e` | First 8 action metas (read + simple-write). Registry + provider-route surface tests; 2 integration tests (read_rows + append_row). Google Sheets intentionally OUT of `COVERED_PROVIDERS`. |
| GSHEETS-4 | `0a5c621df` | Final 4 actions (clear_range, delete_row, batch_update, format_range) + 2 trigger metas (new_worksheet, row_changed) + COVERED_PROVIDERS flip. Destructive-confirmation guards on the 2 high-risk actions; full sensitive-field pinning on `row_changed`. |
| GSHEETS-5 | (this commit) | Doc-only outcomes + coverage refresh. |

---

## 2. Scope shipped

### Infrastructure

- **2 optionsSource resolvers** under `integrations/google-sheets/options/`:
  - `google-sheets:spreadsheets` — lists user spreadsheets via Drive `files.list` (mimeType filter, orderBy modifiedTime desc, pageSize 200, client-side `q` substring filter).
  - `google-sheets:sheets` — lists worksheet tabs via `spreadsheets.get?includeGridData=false`; `dependsOn: spreadsheetId`.
- **Drive scope** added to the Google Sheets manifest: `https://www.googleapis.com/auth/drive.metadata.readonly`. Sheets API has no enumerate-spreadsheets endpoint; this is the narrowest practical scope for id / name / modifiedTime.
- **Drive API wrapper** at [`integrations/google-sheets/api/listSpreadsheets.ts`](../../../integrations/google-sheets/api/listSpreadsheets.ts) — returns `Unauthorized401Error` → `refreshAndRetry` semantics; sanitizes other provider errors before surface.
- **Provider route exposure** — `GET /api/providers/google-sheets/{actions,triggers}` returns the full surface in `displayOrder`.

### Metadata

- **12 action metas** (one per registered handler) — see §5 table.
- **2 trigger metas** — see §5 table.
- **`google-sheets` added to `COVERED_PROVIDERS`** in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts). 1:1 handler↔meta drift is now structurally enforced.

---

## 3. Important product / UX decisions

### Resolver-first sequencing was correct

11 of 12 actions (every action except `create_spreadsheet`) take `spreadsheetId` as the primary config. Landing the resolvers in GSHEETS-2 ahead of any action meta gave us:

- Zero metadata-vs-resolver drift (every meta could declare `optionsSource: "google-sheets:spreadsheets"` from day one).
- The dependsOn cascade was proven against synthetic fields before any real meta consumed it — when GSHEETS-3 landed the sheet picker on `get_cell_value`, the cascade Just Worked.

### Existing Google Sheets users must reconnect

The new `drive.metadata.readonly` scope is additive; previously-connected accounts do NOT silently re-grant it. **Release notes MUST call this out.** Without reconnection, the spreadsheet picker returns an empty list and the user sees no clear error.

The OAuth consent flow handles the upgrade — users see the new scope on next reconnect. No DB migration required.

### Spreadsheet → sheet cascade is proven production-ready

The GSHEETS-2 cascade integration test ([`tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx)) pins three behaviors that every GSHEETS-3 / GSHEETS-4 action that uses both pickers inherits for free:

1. **Happy path** — pick spreadsheet → sheet picker fetches with `deps.spreadsheetId` → both values save.
2. **Gated empty state** — sheet picker does NOT fetch before spreadsheetId is set; renders "Select Spreadsheet first" passive trigger.
3. **Change clears dependent** — switching spreadsheet clears stale `sheetName` AND re-fetches sheets for the new id.

5 of the 12 actions and 1 of the 2 triggers exercise this cascade: `get_cell_value`, `find_row`, `update_cell`, `delete_row`, `format_range`, and `row_changed`.

### Column picker deferred

A `google-sheets:columns` resolver (`dependsOn: spreadsheetId + sheetName`) would polish `find_row.column`, `row_changed.keyColumn`, and a future column-aware variant of `update_row`. **Not shipped in this arc**, because the GSHEETS-2 cascade already proves the pattern and the column picker would require a 3-hop fetch chain (spreadsheet → sheet → values.get → headers row 0). Tracked as a follow-up (§8).

### `append_row` / `update_row` / `clear_range` / `batch_update` use `range`, not `sheetName`

Their live schemas accept only `range` (an A1 fragment that typically carries its own sheet-name prefix — e.g. `Sheet1!A:Z`). The plan memo asked for a sheet picker on these; the slice rule "use exact runtime field names, do not infer from plan memory if live schema differs" took precedence. Pinned by a registry test that asserts these four actions do NOT carry a `sheetName` field.

### Automated Test Workflow remains stubbed for non-manual workflows

The Run-now interception harness covers actions with manual triggers; the GSHEETS-4 triggers (`new_worksheet`, `row_changed`) are webhook-activated and validate end-to-end only via real source events (creating a tab / editing a row in the connected sheet). A trigger-replay harness is tracked as a follow-up (§8).

### Google Sheets trigger validation currently relies on activation + real source events

Activation creates the Drive `files.watch` channel; deactivation tears it down; renewal runs through the existing `runRenewals` cron via `subscriptionRegistry`. The trigger-meta-activation-invariant structural test confirms both triggers register their hooks. End-to-end validation against a real Drive watch is currently manual.

---

## 4. Security decisions

### Destructive actions

| Action | `isDestructive` | `requiresConfirmation` | `riskLevel` |
| --- | --- | --- | --- |
| `clear_range` | true | true | high |
| `delete_row` | true | true | high |

Both surface the existing destructive-confirmation modal at activation / Run-now time (covered by [`tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx`](../../../tests/integration/features/workflow-builder/destructive-action-confirmation-modal.test.tsx) — Google Sheets did not need a duplicate of that test). The clear_range integration test pins the meta flags; the modal flow inherits.

### testMode interception

Google Sheets actions are all external-action shapes (Sheets API writes). The v2 engine-level pre-call gate in [`services/execution/nodeExecutionService.ts`](../../../services/execution/nodeExecutionService.ts) refuses to dispatch any external-action handler when `context.testMode === true && actionMode !== EXECUTE_ALL`. No extra per-handler guard needed for the Google Sheets surface — it's covered by the cross-provider gate.

### Sensitive output flags

Cell / row content is marked sensitive on every meta that surfaces it. The structural sensitive-output-coverage test was green WITHOUT any allowlist additions — the Google Sheets output names (`values`, `value`, `firstMatch`, `matches`, `rowValues`, `keyValue`, `previousValues`) are not in the SUSPICIOUS_NAMES set, so they bypass it; we marked them sensitive proactively rather than by structural compulsion.

| Surface | Sensitive outputs |
| --- | --- |
| `read_rows` | `values` |
| `get_cell_value` | `value` |
| `find_row` | `firstMatch`, `matches` |
| `row_changed` trigger payload | `rowValues`, `keyValue`, `previousValues` |

Structural counters / IDs / ranges / sheet metadata / `spreadsheetUrl` / `appliedFormat` are NOT sensitive. `headers` on the `row_changed` payload stays non-sensitive because column labels are field-name-shaped, not user data.

### No secret-shaped outputs

No `token` / `accessToken` / `refreshToken` / `clientSecret` / `secret` / `apiKey` / `webhookSecret` output anywhere on the Google Sheets surface. Pinned by the cross-action structural test in [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts) (defense-in-depth check covering all providers).

### No FileRef surface

No action `producesFileRef` or `consumesFileRef`. Spreadsheets are not workflow files in V2's data model; downstream nodes that want to send a sheet should pipe `spreadsheetUrl` through a sharing action or compose with a Drive `export` action (out of scope for this arc).

### Provider route serializes all risk + sensitive fields

`GET /api/providers/google-sheets/actions` serializes `riskLevel`, `isDestructive`, `requiresConfirmation`, `riskDescription`, and per-output `sensitive` flags. `GET /api/providers/google-sheets/triggers` serializes the trigger payload sensitive flags. Both are pinned in [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts).

---

## 5. Final Google Sheets action / trigger surface

### Actions (12 / 12 — all in COVERED_PROVIDERS)

| Key | `riskLevel` | `isDestructive` | `requiresConfirmation` | Sensitive outputs | `displayOrder` |
| --- | --- | --- | --- | --- | --- |
| `google-sheets:read_rows` | low | false | false | `values` | 10 |
| `google-sheets:get_cell_value` | low | false | false | `value` | 20 |
| `google-sheets:get_sheet_metadata` | low | false | false | — | 30 |
| `google-sheets:find_row` | low | false | false | `firstMatch`, `matches` | 40 |
| `google-sheets:create_spreadsheet` | medium | false | false | — | 50 |
| `google-sheets:append_row` | medium | false | false | — | 60 |
| `google-sheets:update_row` | medium | false | false | — | 70 |
| `google-sheets:update_cell` | medium | false | false | — | 80 |
| `google-sheets:clear_range` | **high** | **true** | **true** | — | 90 |
| `google-sheets:delete_row` | **high** | **true** | **true** | — | 100 |
| `google-sheets:batch_update` | medium | false | false | — | 110 |
| `google-sheets:format_range` | low | false | false | — | 120 |

### Triggers (2 / 2)

| Key | Activation | Sensitive payload fields | `displayOrder` |
| --- | --- | --- | --- |
| `google-sheets:new_worksheet` | webhook (Drive `files.watch`) | — | 10 |
| `google-sheets:row_changed` | webhook (Drive `files.watch`) | `rowValues`, `keyValue`, `previousValues` | 20 |

Both triggers register a per-workflow activation function via [`registerActivation("google-sheets", <type>, ...)`](../../../integrations/google-sheets/triggers/) — no `SHARED_INFRA_EXEMPT_KEYS` entry needed.

---

## 6. Test coverage

| Surface | Path | What it pins |
| --- | --- | --- |
| Resolver — spreadsheets | [`tests/unit/integrations/google-sheets/options/spreadsheets.test.ts`](../../../tests/unit/integrations/google-sheets/options/spreadsheets.test.ts) | Drive `files.list` mapping; `q` filtering; `hasMore`; error sanitization. |
| Resolver — sheets | [`tests/unit/integrations/google-sheets/options/sheets.test.ts`](../../../tests/unit/integrations/google-sheets/options/sheets.test.ts) | `spreadsheets.get` mapping; missing-dep failure; tab order preservation. |
| Options registry | [`tests/unit/services/options/_registry.test.ts`](../../../tests/unit/services/options/_registry.test.ts) | `google-sheets:spreadsheets` + `google-sheets:sheets` registered; `requiresIntegration: true`; dep declarations. |
| Drive API wrapper | [`tests/unit/integrations/google-sheets/api/listSpreadsheets.test.ts`](../../../tests/unit/integrations/google-sheets/api/listSpreadsheets.test.ts) | Drive query construction; 401 → `Unauthorized401Error`; error sanitization. |
| Manifest scope | [`tests/unit/integrations/google-sheets/manifest.test.ts`](../../../tests/unit/integrations/google-sheets/manifest.test.ts) | `drive.metadata.readonly` present. |
| Two-hop cascade | [`tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-options-cascade.test.tsx) | Happy-path; gated-when-empty; change-clears-dependent. |
| Registry — Google Sheets surface | [`tests/unit/services/discovery/_registry.test.ts`](../../../tests/unit/services/discovery/_registry.test.ts) | 12-action displayOrder; risk matrix; spreadsheetId/sheetName resolver wiring; sensitive flags; destructive flags; trigger field shape; payload sensitive pins. |
| Provider routes | [`tests/unit/app/api/providers/providers-route.test.ts`](../../../tests/unit/app/api/providers/providers-route.test.ts) | `hasMetadata: true`; `GET /api/providers/google-sheets/actions` (12 in displayOrder); `GET /api/providers/google-sheets/triggers` (2 in displayOrder); risk + sensitive fields round-trip JSON. |
| Integration — read | [`tests/integration/features/workflow-builder/google-sheets-read-rows-config.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-read-rows-config.test.tsx) | Combobox spreadsheet pick → range text → Modal Save flushes draft → Toolbar Save persists once with `{spreadsheetId, range}`. |
| Integration — append | [`tests/integration/features/workflow-builder/google-sheets-append-row-config.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-append-row-config.test.tsx) | Spreadsheet pick → range → values JSON paste (typeof === "string") → `valueInputOption` no-default → Toolbar Save persists once. |
| Integration — destructive | [`tests/integration/features/workflow-builder/google-sheets-clear-range-config.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-clear-range-config.test.tsx) | Meta flag pins (`isDestructive`, `requiresConfirmation`, `riskLevel: high`); `{spreadsheetId, range}` field shape pin; Toolbar Save persists once. Modal flow re-use of existing `destructive-action-confirmation-modal.test.tsx`. |
| Integration — trigger | [`tests/integration/features/workflow-builder/google-sheets-row-changed-trigger-config.test.tsx`](../../../tests/integration/features/workflow-builder/google-sheets-row-changed-trigger-config.test.tsx) | Full cascade through trigger picker; chip-mode `changeKinds` persists as `string[]`; activation-managed fields stay untouched on Save. |
| Structural — meta coverage | [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) | `google-sheets` in COVERED_PROVIDERS; no missing metas; no orphan metas. |
| Structural — sensitive | [`tests/structure/sensitive-output-coverage.test.ts`](../../../tests/structure/sensitive-output-coverage.test.ts) | Cross-provider drift guard. Green with no allowlist changes for Google Sheets. |
| Structural — activation invariant | [`tests/structure/trigger-meta-activation-invariant.test.ts`](../../../tests/structure/trigger-meta-activation-invariant.test.ts) | Both Google Sheets triggers register their per-workflow activation hooks. |

**Aggregate suite at GSHEETS-4:** 823 suites, 9477 / 9477 tests passing.

---

## 7. Provider coverage after Google Sheets

All counts below were read live (`npx jest` introspection of `services/discovery/_registry.ts` + `services/execution/handlers/_registry.ts` on commit `0a5c621df`).

### Covered providers (8) — 1:1 handler↔meta enforced

| Provider | Action metas | Trigger metas | Action handlers | Coverage |
| --- | --- | --- | --- | --- |
| `native` | 5 | 2 | 5 | full |
| `github` | 6 | 1 | 6 | full |
| `gmail` | 13 | 3 | 13 | full |
| `microsoft-outlook` | 9 | 3 | 9 | full |
| `slack` | 31 | 10 | 31 | full |
| `notion` | 16 | 0 | 16 | full |
| `stripe` | 16 | 0 | 16 | full |
| `google-sheets` | **12** | **2** | 12 | **full (new)** |
| **Total covered** | **108** | **21** | **108** | |

### Uncovered providers (11) — handlers shipped but no metas yet

| Provider | Action handlers | Trigger metas | Notes |
| --- | --- | --- | --- |
| `hubspot` | 26 | 0 | Largest single-provider gap. Major CRM. |
| `mailchimp` | 14 | 0 | Read + write subscriber / audience / campaign. |
| `airtable` | 11 | 0 | Records + schema + multi-record batch. Will need a base/table resolver pair (parallel to Google Sheets spreadsheet/sheet). |
| `shopify` | 11 | 0 | Orders + customers + products + variants + inventory + fulfillment. |
| `microsoft-excel` | 10 | 0 | Workbooks + worksheets + rows. Will need a workbook/worksheet resolver pair (parallel to Google Sheets). |
| `trello` | 8 | 0 | Boards + lists + cards. |
| `microsoft-onedrive` | 7 | 0 | File ops; FileRef-producing where Sheets had none. |
| `google-calendar` | 5 | 0 | Calendar events. |
| `google-drive` | 5 | 0 | File ops; FileRef-producing. |
| `microsoft-outlook-calendar` | 5 | 0 | Calendar events; structurally parallel to `google-calendar`. |
| `microsoft-teams` | 5 | 0 | Channel + chat messages. |
| **Total uncovered** | **107** | **0** | |

**Across-board view:** 215 action handlers total. 108 covered (50.2 %); 107 uncovered (49.8 %). 21 trigger metas total (all on covered providers).

---

## 8. Remaining Google Sheets follow-ups

- **Column picker resolver** — `google-sheets:columns` (`dependsOn: spreadsheetId + sheetName`) to polish `find_row.column`, `row_changed.keyColumn`, and a future column-aware `update_row` variant. Adds a 3-hop fetch chain (Drive → sheets → row 0 values). Non-breaking — defaults to today's plain-text behavior if not adopted.
- **Automated Test Workflow data support for provider / scheduled triggers** — current Run-now harness validates only manual triggers. Adding fixture-payload replay for `new_worksheet` + `row_changed` would let CI catch regressions without manual Drive watch setup.
- **Possible future escalation of `update_row` / `update_cell` / `batch_update` to `requiresConfirmation: true`** — they are currently `medium / non-destructive` because overwrites are technically recoverable by re-writing the old values. If user-reported incidents show accidental overwrites cause real harm, escalate the affected actions to `high + requiresConfirmation` in a follow-up slice. The schema flip is backwards-compatible (existing workflows keep running; only the modal gate is new).
- **Release note about reconnecting Google Sheets due to the new Drive metadata scope** — must ship in the PR body and the user-facing changelog. Without reconnection, the spreadsheet picker silently shows an empty list.
- **Optional trigger testing harness / latest-event replay** — capture a real `new_worksheet` / `row_changed` Drive notification in fixtures and replay through the activate → pull → normalize → dispatch pipeline in a unit test. Would close the activation-but-real-source-event gap noted in §3.

---

## 9. Recommended next build direction

Three viable next slices, ranked by leverage:

1. **HubSpot planning (highest leverage).** 26 registered action handlers — the single largest uncovered surface — and the next major CRM. Google Sheets proved both the resolver-first pattern and the dependsOn cascade; HubSpot will need a list / pipeline / object-type resolver triad that follows the same shape. Closing HubSpot moves Phase-3 coverage from 50.2 % to 62.3 % (108 + 26 = 134 of 215).
2. **Notion `notion:databases` resolver (smaller polish).** Notion shipped at 16 / 16 metas with ZERO resolvers — every Notion id field today renders as plain text. Adding `notion:databases` (and follow-ups `notion:pages` / `notion:users`) polishes the existing surface without expanding it. Smaller scope; good "breather slice" if larger context-loading is undesirable.
3. **Airtable / Microsoft Excel (deferred).** Both need a parent/child resolver pair structurally identical to Google Sheets' spreadsheet/sheet. Either is a 4-slice arc (plan → resolvers → first metas → final metas + COVERED_PROVIDERS flip) with no novel decisions. Worth deferring until at least one of HubSpot or Notion-polish is in.

**Default recommendation:** HubSpot planning next. Google Sheets proved the resolver/cascade machinery is production-ready; HubSpot is the highest-leverage place to spend that proven infrastructure. If a smaller polish slice is preferred before another large provider, `notion:databases` is the right breather.

The Google Sheets column-picker follow-up (§8) can land in parallel with either choice — it does not block the next provider.

---

## 10. Push / PR readiness reminder

**Do not push yet.** Pre-push triage checklist for the Google Sheets arc (GSHEETS-1 → GSHEETS-5):

- **Dirty parallel-work files** in the working tree must be triaged before a clean push:
  - `docs/rules/database-security.md` (modified, unrelated)
  - `PACKAGES.md` (untracked)
  - `scripts/list-users.mjs` (untracked)
  - `scripts/reset-user-password.mjs` (untracked, pre-existing lint warning)
- **Branch strategy** must be confirmed. The arc shipped on `v2-provider-port-local` (5 local commits ahead of upstream); the actual push target (feature branch vs PR-per-slice vs squash-and-PR) is open.
- **Final gates** must run on the push commit: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. Last green snapshot: GSHEETS-4 (`0a5c621df`) — 823 suites, 9477 / 9477.
- **PR body must include:**
  - **Google Sheets new Drive scope** — `drive.metadata.readonly` added to the manifest. Existing connected users MUST reconnect before the spreadsheet picker works; release notes / changelog must call this out.
  - **Security controls** — `clear_range` + `delete_row` are `isDestructive: true` + `requiresConfirmation: true` + `riskLevel: high`; surface inherits the existing destructive-confirmation modal at activation / Run-now. testMode interception is enforced at the engine layer for all external Sheets writes.
  - **Migrations** — none. (No new tables; no schema changes. The arc is purely metadata + resolver + scope additions.)
  - **Deferred risks** — column picker is plain text in v1 (§8). `row_changed` + `new_worksheet` triggers validated by activation registry + lifecycle but lack a real-source-event replay harness (§8). `update_row` / `update_cell` / `batch_update` are medium-risk; an escalation path to `requiresConfirmation` exists if user reports show accidental overwrites cause real harm (§8).
  - **Stripe rollout posture** — unchanged from the pre-arc state. Google Sheets does not touch Stripe; the GSHEETS arc is independent of any in-flight Stripe rollout.
  - **Rollback notes** — single-revert safe at GSHEETS-5 (this commit) or GSHEETS-4. Reverting GSHEETS-4 alone removes Google Sheets from COVERED_PROVIDERS + drops the 4 destructive/bulk/formatting metas + drops the 2 trigger metas, but leaves the 8 GSHEETS-3 metas + the 2 resolvers in place — degrading to "partial coverage" without breaking anything. Reverting GSHEETS-2 additionally removes the Drive scope; users who reconnected during the rollout window keep their broader grant until the next reconnect.
