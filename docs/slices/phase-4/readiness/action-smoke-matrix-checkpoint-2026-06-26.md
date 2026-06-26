# Action smoke matrix checkpoint — 2026-06-26

**Lane:** provider action testing/greening only (no triggers, no Connected Apps /
Builder / React Agent / Hermes / templates / UI polish).
**Source of truth:** `npm run chainreact -- smoke actions --cert` (offline certification
inventory; no DB, no provider calls). Cert seed:
[scripts/chainreact/smoke/certificationSeed.ts](../../../../scripts/chainreact/smoke/certificationSeed.ts).
**Branch:** `v2-main`. **Nothing pushed.**

## 1. Current matrix (this checkpoint)

```
Totals: 298 registered, 119 LIVE_PASS, 26 not-run, 153 missing-fixture,
        0 blocked-env, 0 fail, 0 bug, 0 sandbox-required, 0 unsafe-no-harness.
```

No drift from the 2026-06-25 snapshot in `docs/PROJECT_MEMORY.md` (119 LIVE_PASS).

**Per-provider (registered / LIVE_PASS / NOT_RUN / MISSING / BLOCKED / FAIL / BUG):**

| Provider | reg | LIVE_PASS | not-run | missing |
|---|---|---|---|---|
| airtable | 11 | **11** | 0 | 0 |
| google-drive | 7 | **7** | 0 | 0 |
| google-sheets | 12 | **12** | 0 | 0 |
| microsoft-onedrive | 7 | **7** | 0 | 0 |
| notion | 16 | 13 | 0 | 3 |
| microsoft-onenote | 12 | 9 | 0 | 3 |
| slack | 31 | 9 | 1 | 21 |
| trello | 8 | 6 | 0 | 2 |
| hubspot | 26 | 7 | 0 | 19 |
| microsoft-teams | 8 | 5 | 0 | 3 |
| microsoft-excel | 13 | 5 | 0 | 8 |
| google-calendar | 5 | 4 | 0 | 1 |
| microsoft-outlook-calendar | 5 | 4 | 0 | 1 |
| gmail | 15 | 3 | 0 | 12 |
| microsoft-outlook | 11 | 3 | 0 | 8 |
| google-docs | 5 | 2 | 0 | 3 |
| facebook | 8 | 1 | 0 | 7 |
| mailchimp | 14 | 4 | 0 | 10 |
| dropbox | 11 | 7 | 1 | 3 |
| google-analytics | 6 | 0 | 4 | 2 |
| monday | 24 | 0 | 10 | 14 |
| stripe | 16 | 0 | 4 | 12 |
| discord | 5 | 0 | 1 | 4 |
| github | 6 | 0 | 0 | 6 |
| shopify | 11 | 0 | 0 | 11 |
| native | 5 | 0 | 5 | 0 |

**Write-COMPLETE providers (every registered action LIVE_PASS):** airtable, google-drive,
google-sheets, microsoft-onedrive.

## 2. Read-fixture frontier is exhausted

The only remaining read-style (`get_/list_/fetch_/search_/find_/read_`) MISSING actions
are all **policy-excluded** (raw bytes / signed URL / block content), consistent with the
prior batches' "no raw bytes / signed URLs" rule:

- `gmail:get_attachment`, `microsoft-outlook:get_attachment` — attachment bytes.
- `dropbox:get_temporary_link` — signed URL.
- `notion:get_block`, `notion:get_block_children` — block content.

So the next greenable batches are **write** batches (create → independent read-back →
cleanup), or remaining unconnected-provider reads (monday / stripe / discord / github /
shopify) that depend on a connected smoke account.

## 3. Next batch SELECTED — `google-docs:update_document` (smallest safe write)

**Why this is the smallest safe batch:**
- **1 action.** Brings google-docs 2/5 → 3/5; after it, the only google-docs MISSING are
  policy-excluded (see §4), so google-docs becomes "write-complete modulo policy."
- **Fully precedented, safe cleanup.** It reuses the exact certified pattern from
  SMOKE-WRITE-23 (`google-docs:create_document`, `LIVE_PASS_CLEANED`) + SMOKE-WRITE-27
  (Sheets create → mutate → **independent** read-back → cross-provider
  `google-drive:delete_file` permanent hard-delete): setup creates a marker-titled
  smoke-owned Doc → `update_document` edits it → **independent** `get_document`
  (already `LIVE_PASS`) read-back confirms the marker+suffix on the persisted content
  (handler echo never trusted) → whole Doc hard-deleted via cross-provider Drive delete
  (a documentId IS a Drive file id). Smoke-owned throughout; true erase.
- **No forbidden category:** not a send/broadcast, not billing, not a sharing link, not
  destructive-without-cleanup.

**LIVE cert is a gated operator run, not done in this checkpoint.** Greening to LIVE_PASS
requires `ALLOW_DB_INTEGRATION_TESTS=true` + `ALLOW_LIVE_PROVIDER_SMOKE=true` +
`ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` against a connected Google smoke account
(`SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID`) via `npm run smoke:writes:live`. Per the
certification charter, **no `LIVE_PASS` cert row is added without a real live run** —
this checkpoint does not add one.

## 4. Classification of the remaining MISSING (so nothing is silently skipped)

**Forbidden by this lane (classify, never live-run):**
- `microsoft-teams:send_channel_message`, `:reply_to_channel_message`, `:send_chat_message`
  — send/broadcast.
- `google-docs:share_document` — sharing-permission/link mutation.
- All `stripe:*` create/update/cancel + `shopify:*` — billing/commerce mutations.
- `slack` sends/DMs (`send_direct_message`, `schedule_message`, …) — send/broadcast.

**Policy-excluded (raw bytes / signed URL / content):**
- `google-docs:export_document`, `gmail:get_attachment`, `microsoft-outlook:get_attachment`,
  `dropbox:get_temporary_link`, `notion:get_block(_children)`.

**Deferred — no safe cleanup / no independent verify (needs design before greening):**
- `microsoft-onenote:create_notebook`, `:create_section` — Graph exposes no API delete for
  notebooks/sections → would leave an un-cleanable artifact.
- `notion:create_database` — no archive-database action + no independent read-back
  (already documented deferred in the runbook).
- `trello:create_board`, `:create_list` — need a confirmed reversible cleanup
  (archive/delete) action before write-smoking.
- `microsoft-onenote:copy_page` — async (needs the `completeAsync` monitor-poll primitive,
  like `onedrive:copy_item`); medium effort, safe-but-not-smallest.

**Connected-account reads (greenable once the smoke account connects the provider):**
- `monday` (10 not-run), `stripe` reads (4 not-run, read-only finds — distinct from the
  forbidden billing mutations), `discord` (1 not-run), `google-analytics` (4 not-run —
  account exposes no GA property), plus `github` / `shopify` read surfaces.

## 5. Verification (this checkpoint, offline only)

- `npm run chainreact -- smoke actions --cert` → matrix above (offline inventory).
- `npx jest tests/unit/smoke-actions` → **33 suites / 381 tests pass** (incl.
  `fixtures-valid`, `certification`, registry-parity) — confirms the harness + matrix are
  internally consistent.
- No live provider calls, no DB writes, no cert rows added. **Nothing pushed.**

## 6. Next step (operator, gated)

Author the `google-docs:update_document` WRITE fixture (mirroring the Sheets
create→mutate→independent-read-back→Drive-delete fixtures) and live-cert it via
`npm run smoke:writes:live` with the three live gates + a connected Google smoke account.
On a green run (0 leaked), add its `LIVE_PASS_CLEANED` row to `certificationSeed.ts`.
