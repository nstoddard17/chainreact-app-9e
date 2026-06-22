# Runbook: Action smoke testing (CLI + harness)

A CLI-driven way to smoke test registered provider **actions** through real V2
internals instead of clicking every action in the builder UI. This is the
**first slice** — it proves the harness architecture with a small, representative
fixture set. It does **not** yet cover every provider/action.

Four modes, split by runtime and fidelity:

| Mode | `mode` tag | Where | What it does | Runtime |
|---|---|---|---|---|
| **1. Dry-run inventory** | — | `chainreact smoke actions` | Lists which registered actions have fixtures, which are missing, which are skipped (and why). Offline, no execution. | Operator CLI (no app imports) |
| **2. Handler-dispatch smoke** | `handler` | `tests/smoke-actions/` + `run-all.smoke.test.ts` | Real strict resolver → real handler registry → real handler. Fast; no workflow / DB. | Jest |
| **3. Workflow-run (test mode)** | `workflow-test` | `workflowRun*.ts` + `run-all.workflow.dev.test.ts` | Persists a `{native:manual.run → action}` workflow, runs it via the same `enqueueRun` the run-now route uses, asserts the persisted `workflow_runs` row is terminal. Engine **test mode**: external/destructive handlers blocked → no real provider calls. | Jest + dev DB (gated) |
| **4. Workflow-run (live)** | `workflow-live` | `workflowRun*.ts` + `run-all.workflow-live.dev.test.ts` | Same as mode 3 but engine **real mode** — the provider handler actually calls the provider. `liveSafe` fixtures only; double-gated. | Jest + dev DB + real providers (double-gated) |

Each executed result carries a `providerBoundary`: `blocked` (mode 3 — testMode
short-circuited the external handler), `mocked` (a fake boundary, unit tests), or
`live` (mode 4 — real provider call).

The split is deliberate: the offline CLI can't import the handler registry
(server-only + every provider client), so it reads the inventory as text; the
Jest harness imports the real registry and executes. A parity test
(`tests/unit/smoke-actions/registry-parity.test.ts`) guarantees the two never
drift.

**When to use which:**
- **Inventory** — see the coverage gap; CI/pre-push gate on fixture validity. Always safe, always offline.
- **Handler-dispatch** — cheapest contract smoke. Proves resolve→handler→classify without a workflow or DB.
- **Workflow-run test** — proves the action runs through the real manual run-now path + terminal persisted run, with **no** provider calls. Use for native/logic actions and to validate the engine path.
- **Workflow-run live** — the only mode that hits a real provider. Use sparingly, for `liveSafe` read-only actions against a throwaway smoke account, to confirm credentials + the real provider call actually work end-to-end.

## Env vars (by mode)

| Var | Required by | Purpose |
|---|---|---|
| `ALLOW_DB_INTEGRATION_TESTS=true` | modes 3, 4 | Master gate for any dev-DB run. |
| `ALLOW_LIVE_PROVIDER_SMOKE=true` | mode 4 | Second gate — enables real provider calls (read/baseline live fixtures). |
| `ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` | mode 4, `write` fixtures | Third gate — enables live fixtures classified `liveRisk: "write"` (they post/mutate). |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | modes 3, 4 | Dev DB service-role access (auto-loaded from `.env.local`). |
| `SMOKE_ACCOUNT_ID`, `SMOKE_USER_ID` | modes 3, 4 | The dev account + member user the throwaway workflow is created under. |
| `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true` | mode 4, destructive only | Second half of the destructive opt-in (with `includeDestructive`). No shipped fixture is both `liveSafe` and destructive. |
| `SMOKE_SLACK_CONNECTED=1` | Slack fixtures (modes 2–4) | Signals the smoke account has Slack connected. Unset → Slack fixtures SKIP. |
| `SMOKE_SLACK_CHANNEL_ID=<channel id>` | Slack `send_channel_message` (write), `get_channel_info`, `get_messages`, `get_thread_messages` | Target channel id (overlaid onto config). Unset → those fixtures SKIP **before** any workflow is created. |
| `SMOKE_SLACK_USER_ID=<U…>` | Slack `get_user_info` | A Slack user id to look up. Unset → SKIP. |
| `SMOKE_SLACK_THREAD_TS=<ts>` | Slack `get_thread_messages` | A parent thread ts in the smoke channel. Unset → SKIP. |
| `SMOKE_SLACK_FILE_ID=<F…>` | Slack `get_file_info` | A Slack file id to look up. Unset → SKIP. |
| `SMOKE_AIRTABLE_CONNECTED=1` | Airtable fixtures | Signals the smoke account has Airtable connected. Unset → Airtable fixtures SKIP. |
| `SMOKE_AIRTABLE_BASE_ID=<app…>` | Airtable fixtures | The base id. Unset → SKIP. |
| `SMOKE_AIRTABLE_TABLE_ID=<tbl… or name>` | Airtable `get_table_schema`, `list_records`, `find_record`, `get_record` | The table id or name (`tableIdOrName`). Unset → SKIP. |
| `SMOKE_AIRTABLE_RECORD_ID=<rec…>` | Airtable `get_record` | A record id to fetch. Unset → SKIP. |
| `SMOKE_GOOGLE_SHEETS_CONNECTED=1` | Google Sheets fixtures | Signals the smoke account has Google Sheets connected. Unset → Sheets fixtures SKIP. |
| `SMOKE_GSHEETS_SPREADSHEET_ID=<id>` | all Google Sheets fixtures | The spreadsheet id (overlaid onto `spreadsheetId`). Unset → SKIP. |
| `SMOKE_GSHEETS_RANGE=<A1 range>` | Google Sheets `read_rows` | A1-notation range, e.g. `Sheet1!A1:D5` (overlaid onto `range`). Unset → SKIP. |
| `SMOKE_GSHEETS_SHEET_NAME=<tab name>` | Google Sheets `get_cell_value`, `find_row` | Sheet/tab title (overlaid onto `sheetName`). Unset → SKIP. |
| `SMOKE_GSHEETS_LOOKUP_COLUMN=<header>` | Google Sheets `find_row` | An existing header name to search (overlaid onto `column`). Unset → SKIP. |
| `SMOKE_GSHEETS_LOOKUP_VALUE=<value>` | Google Sheets `find_row` | The value to match in that column (overlaid onto `value`). Unset → SKIP. |
| `SMOKE_GOOGLE_DRIVE_CONNECTED=1` | Google Drive fixtures | Signals the smoke account has Google Drive connected. Unset → Drive fixtures SKIP. |
| `SMOKE_GDRIVE_FILE_ID=<id>` | Google Drive `get_file_metadata` | A file id to read metadata for (overlaid onto `fileId`). Unset → SKIP. |
| `SMOKE_GDRIVE_QUERY=<text>` | Google Drive `search_files` | Name-search text (overlaid onto `query`). Unset → SKIP. |
| `SMOKE_GDRIVE_FOLDER_ID=<id>` | Google Drive `search_files` (optional) | Optional folder to scope the search (overlaid onto `folderId`). Unset → searches across My Drive. |
| `SMOKE_GMAIL_CONNECTED=1` | Gmail fixtures | Signals the smoke account has Gmail connected. Unset → Gmail fixtures SKIP. |
| `SMOKE_GMAIL_QUERY=<q-syntax>` | Gmail `search_emails` | Gmail q-syntax search string (overlaid onto `query`). Unset → SKIP. |
| `SMOKE_MICROSOFT_OUTLOOK_CONNECTED=1` | Outlook fixtures | Signals the smoke account has Microsoft Outlook connected. Unset → Outlook fixtures SKIP. |
| `SMOKE_OUTLOOK_QUERY=<$search>` | Outlook `fetch_emails` (optional) | Optional Graph `$search` string (overlaid onto `query`). Unset → fetches recent messages. |
| `SMOKE_NOTION_CONNECTED=1` | Notion fixtures | Signals the smoke account has Notion connected. Unset → Notion fixtures SKIP. |
| `SMOKE_NOTION_QUERY=<text>` | Notion `search` (optional) | Optional search text (overlaid onto `query`). Unset → searches all accessible objects. |
| `SMOKE_NOTION_DATABASE_ID=<id>` | Notion `query_database` | A database id to query (overlaid onto `databaseId`). Unset → SKIP. |
| `SMOKE_NOTION_PAGE_ID=<id>` | Notion `get_page` | A page id to read (overlaid onto `pageId`). Unset → SKIP. |
| `SMOKE_MICROSOFT_EXCEL_CONNECTED=1` | Excel fixtures | Signals the smoke account has Microsoft Excel connected. Unset → Excel fixtures SKIP. |
| `SMOKE_EXCEL_WORKBOOK_ID=<id>` | Excel `get_worksheets`, `read_range`, `read_table_rows`, `find_row` | A workbook (drive item) id (overlaid onto `workbookId`). Unset → SKIP. |
| `SMOKE_EXCEL_WORKSHEET_NAME=<name>` | Excel `read_range` | Worksheet/tab name (overlaid onto `worksheetName`). Unset → SKIP. |
| `SMOKE_EXCEL_RANGE=<A1 range>` | Excel `read_range` | Bounded A1 range, e.g. `A1:D10` (overlaid onto `address`). Unset → SKIP. |
| `SMOKE_EXCEL_TABLE_NAME=<name>` | Excel `read_table_rows`, `find_row` | Excel table name (overlaid onto `tableName`). Unset → SKIP. |
| `SMOKE_EXCEL_LOOKUP_COLUMN=<header>` | Excel `find_row` | An existing table column header (overlaid onto `lookupColumn`). Unset → SKIP. |
| `SMOKE_EXCEL_LOOKUP_VALUE=<value>` | Excel `find_row` | Value to match in that column (overlaid onto `lookupValue`). Unset → SKIP. |
| `SMOKE_MICROSOFT_TEAMS_CONNECTED=1` | Teams fixtures | Signals the smoke account has Microsoft Teams connected. Unset → Teams fixtures SKIP. |
| `SMOKE_TEAMS_TEAM_ID=<id>` | Teams `get_channel_details`, `get_team_members`, `list_channels`, `list_channel_messages` | A team id (overlaid onto `teamId`). Unset → SKIP. |
| `SMOKE_TEAMS_CHANNEL_ID=<id>` | Teams `get_channel_details`, `list_channel_messages` | A channel id (overlaid onto `channelId`). Unset → SKIP. |
| `SMOKE_NATIVE_HTTP_URL=<https url>` | native `http_request` | A public **https** URL to GET (overlaid onto `url`). Unset → SKIP. The only native fixture that makes a real network call; the egress guard blocks private/loopback/metadata hosts. |
| `SMOKE_MONDAY_CONNECTED=1` (+ `SMOKE_MONDAY_BOARD_ID`, `SMOKE_MONDAY_ITEM_ID`, `SMOKE_MONDAY_PARENT_ITEM_ID`, `SMOKE_MONDAY_USER_ID`, `SMOKE_MONDAY_QUERY`) | Monday read fixtures | Connection + per-action selectors (board/item/parent-item/user ids, search value). Any missing required one → SKIP. |
| `SMOKE_HUBSPOT_CONNECTED=1` | HubSpot read fixtures | All 7 HubSpot reads are list/search-style — connection only, no selector. |
| `SMOKE_MICROSOFT_ONENOTE_CONNECTED=1` (+ `SMOKE_ONENOTE_NOTEBOOK_ID`, `SMOKE_ONENOTE_SECTION_ID`, `SMOKE_ONENOTE_PAGE_ID`) | OneNote read fixtures | Connection + notebook/section/page id selectors. |
| `SMOKE_GOOGLE_ANALYTICS_CONNECTED=1` (+ `SMOKE_GA_PROPERTY_ID`) | Google Analytics read fixtures | Connection + GA4 property id (all four reporting reads need it). |
| `SMOKE_DROPBOX_CONNECTED=1` (+ `SMOKE_DROPBOX_QUERY`, `SMOKE_DROPBOX_FILE_PATH`) | Dropbox read fixtures | `list_folder` needs only a connection (root path); `search_files` needs a query; `get_file_metadata` needs a file path. |
| `SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1` (+ `SMOKE_ONEDRIVE_FILE_ID`) | OneDrive read fixtures | `list_items` needs only a connection (root); `get_file` (metadata only, no bytes) needs an item id. |
| `SMOKE_MAILCHIMP_CONNECTED=1` (+ `SMOKE_MAILCHIMP_AUDIENCE_ID`, `SMOKE_MAILCHIMP_SUBSCRIBER_EMAIL`, `SMOKE_MAILCHIMP_CAMPAIGN_ID`) | Mailchimp read fixtures | Connection + audience/subscriber/campaign selectors. |
| `SMOKE_STRIPE_CONNECTED=1` (+ `SMOKE_STRIPE_CUSTOMER_EMAIL`, `SMOKE_STRIPE_PAYMENT_INTENT_ID`, `SMOKE_STRIPE_SUBSCRIPTION_ID`) | Stripe read fixtures | `get_payments` needs only a connection; the find_* reads need their id/email. |
| `SMOKE_DISCORD_CONNECTED=1` (+ `SMOKE_DISCORD_GUILD_ID`, `SMOKE_DISCORD_CHANNEL_ID`) | Discord `fetch_messages` | Connection + guild + channel ids (guildId is schema-required). |
| `SMOKE_FACEBOOK_CONNECTED=1` (+ `SMOKE_FACEBOOK_PAGE_ID`) | Facebook `get_page_insights` | Connection + page id (pageId also auto-discovers; metric defaults to `page_post_engagements`). |
| `SMOKE_GOOGLE_CALENDAR_CONNECTED=1` | Google Calendar `list_events` | Connection only (`calendarId` hardcoded `primary`). |
| `SMOKE_GOOGLE_DOCS_CONNECTED=1` (+ `SMOKE_GDOCS_DOCUMENT_ID`) | Google Docs `get_document` | Connection + document id. |
| `SMOKE_MICROSOFT_OUTLOOK_CALENDAR_CONNECTED=1` | Outlook Calendar `list_events` | Connection only (uses the default calendar). |
| `SMOKE_NOTION_USER_ID`, `SMOKE_NOTION_BLOCK_ID` | Notion `get_user`, `list_comments` | Selector ids for the two leftover Notion reads (connection via existing `SMOKE_NOTION_CONNECTED`). |
| other per-fixture `requiredEnv` | modes 2–4 | Each fixture declares the env it needs; any missing one SKIPs **before** workflow creation. |

If any required env/connection is missing, the fixture **SKIPs** (never FAILs),
before any workflow is created — **except** in live mode, where selector env is
now mostly OPTIONAL thanks to auto-discovery (see **Selector auto-discovery**
below): a connected provider's selectors are discovered from its own safe
list/search APIs, so you only set `SMOKE_<PROVIDER>_*` selector env to PIN a
specific resource or when a selector has no safe auto-discovery.

## Selector auto-discovery (live mode)

In LIVE mode the harness no longer needs a hand-set `SMOKE_<PROVIDER>_*` selector
id for every read. It:

1. **Checks real connection** — `repositories/integrations.getActiveForExecution(account, provider)`,
   NOT the `SMOKE_<PROVIDER>_CONNECTED` env. A connected provider is treated as
   connected even when its selector env is unset. (`SMOKE_<PROVIDER>_CONNECTED`
   still works as an explicit override.)
2. **Auto-discovers selectors** — for each REQUIRED selector field of the action
   (from its `ActionMeta`), it runs that field's `optionsSource` cascade (the same
   builder dropdown resolvers — boards, customers, campaigns, files, properties,
   notebooks→sections→pages, …) against the connected account and takes the first
   item. Cascade PARENTS are discovered + overlaid too (so a OneNote
   `notebookId`→`sectionId`→`pageId` chain is fully satisfied, not just the leaf).
3. **Manual env always overrides** — a present `SMOKE_<PROVIDER>_*` value pins that
   field (and seeds the cascade) instead of discovering it. Set one only to pin a
   known fixture.
4. **Falls back to env** only when auto-discovery is impossible: a required
   selector with no `optionsSource` (free-text search/email/range/record-id) →
   "unavailable", set its env to run.

Discovery is **READ-ONLY** (only list/search option resolvers run — never a
mutation) and runs only in live mode, only after the liveSafe/write/destructive
gates pass. Engine + types: [`tests/smoke-actions/selectorDiscovery.ts`](../../tests/smoke-actions/selectorDiscovery.ts)
(pure), wired to the real account-scoped resolvers in
[`tests/smoke-actions/workflowRunDeps.ts`](../../tests/smoke-actions/workflowRunDeps.ts).

**Reported states** (per result; the live human report groups them under
"Selector auto-discovery"):

| State | Meaning |
|---|---|
| `not connected in app` | provider has no active integration on the smoke account → SKIP (never a FAIL, never an env problem) |
| `connected + auto-discovered selector` | ≥1 selector discovered from the provider's APIs → the fixture ran (field NAMES shown, never values) |
| `connected + selectors from env / none needed` | connected; every selector came from a literal/env or the action needs none → ran |
| `connected but auto-discovery unavailable` | a required selector has no safe auto-discovery → SKIP; set its `SMOKE_<PROVIDER>_*` env |
| `connected but auto-discovery found no usable object` | the account has zero of that resource → SKIP |

To live-verify connected providers with ZERO manual selector env:

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  npm run smoke:actions:run:workflow:live
```

Every connected provider's reads run + auto-discover; unconnected providers report
`not connected in app`; already-`LIVE_PASS` actions CERT-SKIP.

## Where fixtures live

```
tests/fixtures/action-smoke/<provider>/<action>.ts
```

Each default-exports an `ActionSmokeFixture` (`tests/smoke-actions/contract.ts`):

```ts
import { defineActionSmokeFixture } from "@/tests/smoke-actions/contract";

export default defineActionSmokeFixture({
  provider: "slack",
  action: "list_channels",        // must match a registered handler `type`
  risk: "read",                   // read | write | destructive
  config: { kind: "public", limit: 50 },
  requiredEnv: ["SMOKE_SLACK_CONNECTED"],  // absent → SKIP (never FAIL)
  liveSafe: true,                          // may run in LIVE mode (read-only/low-risk only)
  expect: { outcome: "success" },          // or { outcome: "failure", errorIncludes: "..." }
});
```

After adding a fixture file, also add it to the explicit inventory
`tests/smoke-actions/fixtures.ts` (same convention as the handler inventory — a
reviewer sees coverage in the diff).

### Risk classes + the destructive guard

- `read` — no external mutation.
- `write` — creates/updates external state.
- `destructive` — irreversible data loss; **never runs without `--include-destructive`**.

A fixture whose action verb is obviously destructive (`delete_*`, `purge_*`,
`drop_*`, `destroy_*`, `wipe_*`, `revoke_*`) **must** be classified
`destructive`. The validation hook
(`tests/unit/smoke-actions/fixtures-valid.test.ts` + the CLI inventory) rejects a
`delete_message` fixture marked `read`/`write`, and rejects any fixture targeting
an action with no registered handler.

### `liveSafe` + `liveRisk` — live-connected runs

Live mode (mode 4) calls real providers, so it runs **only** fixtures marked
`liveSafe: true`. Everything else SKIPs in live mode. Each `liveSafe` fixture also
declares a `liveRisk` (defaults to `risk`) that decides which opt-ins live mode
requires:

| `liveRisk` | Runs in live mode when… | Example |
|---|---|---|
| `read` | `ALLOW_LIVE_PROVIDER_SMOKE=true` (the live gate) | `slack:list_channels`, `native:format_transformer` |
| `write` | live gate **+** `ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` | `slack:send_channel_message` |
| `destructive` | live gate **+** `includeDestructive` **+** `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true` | (none shipped) |

Rules:

- Reserve `liveSafe` for read-only actions, pure local actions, or a **write** that
  targets a dedicated throwaway resource (with `liveRisk: "write"`).
- A **destructive** action must **never** be `liveSafe` — enforced by the
  `fixtures-valid` test (destructive ⇒ not liveSafe). `slack:delete_message` stays
  non-`liveSafe`.
- `liveRisk` defaults to `risk` (fail-safe: a write fixture can't be treated as a
  read by forgetting to set it).
- Channel ids / base ids come from env via `configFromEnv` (config field → env var
  name), never a hardcoded literal. The mapped env var must also be in
  `requiredEnv` so a missing one SKIPs before any workflow is created.

> **Coverage update (SMOKE-ACTIONS-17/18).** The fixture set grew from 43 → **94**
> (93 fixture-backed runnable + 1 destructive-skipped) across **23 providers**.
> SMOKE-ACTIONS-17 added the **4 native logic actions** (`delay`,
> `if_then_condition`, `router`, `http_request`); SMOKE-ACTIONS-18 added **47
> read-only fixtures** across 12 previously-zero-coverage providers (monday,
> hubspot, microsoft-onenote, google-analytics, dropbox, microsoft-onedrive,
> mailchimp, stripe, discord, facebook, google-calendar, google-docs,
> microsoft-outlook-calendar) plus 2 Notion leftover reads. See the
> **SMOKE-ACTIONS-17/18 batch** section below. The table immediately following is
> the original 43-fixture set.

### Original fixtures (43)

| Fixture | risk / liveRisk | liveSafe | Required env | Notes |
|---|---|---|---|---|
| `native:format_transformer` | read | ✅ | — | Pure local baseline; runs anywhere. |
| `slack:list_channels` | read | ✅ | `SMOKE_SLACK_CONNECTED` | conversations.list. |
| `slack:list_users` | read | ✅ | `SMOKE_SLACK_CONNECTED` | users.list (no selector). |
| `slack:list_scheduled_messages` | read | ✅ | `SMOKE_SLACK_CONNECTED` | scheduledMessages.list (no selector). |
| `slack:get_channel_info` | read | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_CHANNEL_ID` | conversations.info. |
| `slack:get_messages` | read | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_CHANNEL_ID` | conversations.history. |
| `slack:get_user_info` | read | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_USER_ID` | users.info. |
| `slack:get_thread_messages` | read | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_CHANNEL_ID`, `SMOKE_SLACK_THREAD_TS` | conversations.replies. |
| `slack:get_file_info` | read | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_FILE_ID` | files.info. |
| `airtable:get_base_schema` | read | ✅ | `SMOKE_AIRTABLE_CONNECTED`, `SMOKE_AIRTABLE_BASE_ID` | Schema metadata (not records). |
| `airtable:get_table_schema` | read | ✅ | `SMOKE_AIRTABLE_CONNECTED`, `SMOKE_AIRTABLE_BASE_ID`, `SMOKE_AIRTABLE_TABLE_ID` | One table's field metadata. |
| `airtable:list_records` | read | ✅ | `SMOKE_AIRTABLE_CONNECTED`, `SMOKE_AIRTABLE_BASE_ID`, `SMOKE_AIRTABLE_TABLE_ID` | One small page of records. |
| `airtable:find_record` | read | ✅ | `SMOKE_AIRTABLE_CONNECTED`, `SMOKE_AIRTABLE_BASE_ID`, `SMOKE_AIRTABLE_TABLE_ID` | First record (`TRUE()` formula). |
| `airtable:get_record` | read | ✅ | `SMOKE_AIRTABLE_CONNECTED`, `SMOKE_AIRTABLE_BASE_ID`, `SMOKE_AIRTABLE_TABLE_ID`, `SMOKE_AIRTABLE_RECORD_ID` | Single record by id. |
| `google-sheets:get_sheet_metadata` | read | ✅ | `SMOKE_GOOGLE_SHEETS_CONNECTED`, `SMOKE_GSHEETS_SPREADSHEET_ID` | Sheet structure (not cells). |
| `google-sheets:read_rows` | read | ✅ | `SMOKE_GOOGLE_SHEETS_CONNECTED`, `SMOKE_GSHEETS_SPREADSHEET_ID`, `SMOKE_GSHEETS_RANGE` | A1-range read; empty range still succeeds. |
| `google-sheets:get_cell_value` | read | ✅ | `SMOKE_GOOGLE_SHEETS_CONNECTED`, `SMOKE_GSHEETS_SPREADSHEET_ID`, `SMOKE_GSHEETS_SHEET_NAME` | Single cell `A1`; blank cell → `value:null`. |
| `google-sheets:find_row` | read | ✅ | `SMOKE_GOOGLE_SHEETS_CONNECTED`, `SMOKE_GSHEETS_SPREADSHEET_ID`, `SMOKE_GSHEETS_SHEET_NAME`, `SMOKE_GSHEETS_LOOKUP_COLUMN`, `SMOKE_GSHEETS_LOOKUP_VALUE` | Header-column lookup; no-match still succeeds. |
| `google-drive:list_files` | read | ✅ | `SMOKE_GOOGLE_DRIVE_CONNECTED` | File list (metadata only). |
| `google-drive:get_file_metadata` | read | ✅ | `SMOKE_GOOGLE_DRIVE_CONNECTED`, `SMOKE_GDRIVE_FILE_ID` | Single file's bounded metadata (no content). |
| `google-drive:search_files` | read | ✅ | `SMOKE_GOOGLE_DRIVE_CONNECTED`, `SMOKE_GDRIVE_QUERY` | Name search, one page (metadata only). |
| `gmail:list_labels` | read | ✅ | `SMOKE_GMAIL_CONNECTED` | Label list (metadata only, no content). |
| `gmail:get_profile` | read | ✅ | `SMOKE_GMAIL_CONNECTED` | Mailbox counts + own email (no content). |
| `gmail:search_emails` | read | ✅ | `SMOKE_GMAIL_CONNECTED`, `SMOKE_GMAIL_QUERY` | Message search, one page, max 3 (status-only). |
| `microsoft-outlook:list_folders` | read | ✅ | `SMOKE_MICROSOFT_OUTLOOK_CONNECTED` | Mail folder list (metadata only, no content). |
| `microsoft-outlook:get_profile` | read | ✅ | `SMOKE_MICROSOFT_OUTLOOK_CONNECTED` | Mailbox identity (no content). |
| `microsoft-outlook:fetch_emails` | read | ✅ | `SMOKE_MICROSOFT_OUTLOOK_CONNECTED` | Message fetch, one page, max 5 (status-only). |
| `notion:search` | read | ✅ | `SMOKE_NOTION_CONNECTED` | Search pages/databases, one page, max 5. |
| `notion:list_users` | read | ✅ | `SMOKE_NOTION_CONNECTED` | Workspace user list, one page, max 5. |
| `notion:query_database` | read | ✅ | `SMOKE_NOTION_CONNECTED`, `SMOKE_NOTION_DATABASE_ID` | DB query, one page, max 5 (status-only). |
| `notion:get_page` | read | ✅ | `SMOKE_NOTION_CONNECTED`, `SMOKE_NOTION_PAGE_ID` | Page metadata/properties (status-only). |
| `microsoft-excel:get_workbooks` | read | ✅ | `SMOKE_MICROSOFT_EXCEL_CONNECTED` | Workbook list (metadata, one page max 5). |
| `microsoft-excel:get_worksheets` | read | ✅ | `SMOKE_MICROSOFT_EXCEL_CONNECTED`, `SMOKE_EXCEL_WORKBOOK_ID` | Worksheet list (metadata only). |
| `microsoft-excel:read_range` | read | ✅ | `SMOKE_MICROSOFT_EXCEL_CONNECTED`, `SMOKE_EXCEL_WORKBOOK_ID`, `SMOKE_EXCEL_WORKSHEET_NAME`, `SMOKE_EXCEL_RANGE` | Bounded A1 range read (status-only). |
| `microsoft-excel:read_table_rows` | read | ✅ | `SMOKE_MICROSOFT_EXCEL_CONNECTED`, `SMOKE_EXCEL_WORKBOOK_ID`, `SMOKE_EXCEL_TABLE_NAME` | Table rows, one page max 5 (status-only). |
| `microsoft-excel:find_row` | read | ✅ | `SMOKE_MICROSOFT_EXCEL_CONNECTED`, `SMOKE_EXCEL_WORKBOOK_ID`, `SMOKE_EXCEL_TABLE_NAME`, `SMOKE_EXCEL_LOOKUP_COLUMN`, `SMOKE_EXCEL_LOOKUP_VALUE` | Table lookup, first match (status-only). |
| `microsoft-teams:get_channel_details` | read | ✅ | `SMOKE_MICROSOFT_TEAMS_CONNECTED`, `SMOKE_TEAMS_TEAM_ID`, `SMOKE_TEAMS_CHANNEL_ID` | Channel metadata (no content). |
| `microsoft-teams:get_team_members` | read | ✅ | `SMOKE_MICROSOFT_TEAMS_CONNECTED`, `SMOKE_TEAMS_TEAM_ID` | Member list, one page max 5 (status-only). |
| `microsoft-teams:list_teams` | read | ✅ | `SMOKE_MICROSOFT_TEAMS_CONNECTED` | Joined-teams list (metadata only). |
| `microsoft-teams:list_channels` | read | ✅ | `SMOKE_MICROSOFT_TEAMS_CONNECTED`, `SMOKE_TEAMS_TEAM_ID` | Channel list (metadata only). |
| `microsoft-teams:list_channel_messages` | read | ✅ | `SMOKE_MICROSOFT_TEAMS_CONNECTED`, `SMOKE_TEAMS_TEAM_ID`, `SMOKE_TEAMS_CHANNEL_ID` | Message metadata, one page max 5 (header-level, no body). |
| `slack:send_channel_message` | **write** | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_CHANNEL_ID` | Posts a real message; needs the write gate. |
| `slack:delete_message` | **destructive** | ❌ | — | Non-liveSafe; never runs live. |

Coverage: **43 fixtures** (41 read / 1 write / 1 destructive), 42 `liveSafe`, across
10 providers (native, slack, airtable, google-sheets, google-drive, gmail,
microsoft-outlook, notion, microsoft-excel, microsoft-teams). **Slack: 10 fixtures** (8
read / 1 write / 1 destructive); **Airtable: 5 fixtures** (all read); **Google Sheets: 4
fixtures** (all read); **Google Drive: 3 fixtures** (all read); **Gmail: 3 fixtures** (all
read); **Microsoft Outlook: 3 fixtures** (all read); **Notion: 4 fixtures** (all read);
**Microsoft Excel: 5 fixtures** (all read); **Microsoft Teams: 5 fixtures** (all read).
The CLI prints a `Coverage:` line; `--json` exposes it as `coverage`.

**Slack-only inventory:** `npm run smoke:actions -- --provider slack`.

**Slack live read run** (the no-selector reads run with just a connection; the
selector reads need their id env, else SKIP):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_SLACK_CONNECTED=1 \
  SMOKE_SLACK_CHANNEL_ID=<C…> SMOKE_SLACK_USER_ID=<U…> \
  npm run smoke:actions:run:workflow:live
```

**Slack actions still uncovered / deferred (10 covered of 31 registered):**

- **Writes needing an existing target message ts** — `add_reaction`,
  `remove_reaction`, `pin_message`, `unpin_message`, `update_message`. Deferred:
  they need a posted message to act on (a post→act→cleanup chain the harness
  doesn't model yet).
- **Channel/workspace admin writes** — `create_channel`, `archive_channel`,
  `unarchive_channel`, `rename_channel`, `join_channel`, `leave_channel`,
  `invite_users_to_channel`, `remove_user_from_channel`, `set_channel_topic`,
  `set_channel_purpose`. Deferred: durable side effects without a safe cleanup.
- **Other writes** — `send_direct_message` (DMs a user), `schedule_message` /
  `cancel_scheduled_message` (scheduling side effect), `upload_file` /
  `download_file` (file side effects), `post_interactive_blocks`. Deferred for the
  same reason.
- **Destructive** — `delete_message` stays inventory/handler-only (non-`liveSafe`).

**Airtable-only inventory:** `npm run smoke:actions -- --provider airtable`.

**Airtable live read run** (`get_base_schema` needs only the base; the others also
need a table id; `get_record` also needs a record id, else SKIP):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_AIRTABLE_CONNECTED=1 \
  SMOKE_AIRTABLE_BASE_ID=<app…> SMOKE_AIRTABLE_TABLE_ID=<tbl… or name> \
  npm run smoke:actions:run:workflow:live
```

**Airtable actions still uncovered / deferred (5 covered of 11 registered):**

- All remaining Airtable actions are **writes / destructive** and are deferred (they
  mutate a base without a safe cleanup pattern): `create_record`, `update_record`,
  `delete_record` (destructive), `add_attachment`, `create_multiple_records`,
  `update_multiple_records`. The 5 covered are all read-only (`get_base_schema`,
  `get_table_schema`, `list_records`, `find_record`, `get_record`).

**Google Sheets-only inventory:** `npm run smoke:actions -- --provider google-sheets`.

**Google Sheets live read run** (`get_sheet_metadata` + `read_rows` need a spreadsheet
id; `read_rows` also needs an A1 range; `get_cell_value` + `find_row` also need a sheet
name; `find_row` also needs a lookup column + value — any missing one SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_GOOGLE_SHEETS_CONNECTED=1 \
  SMOKE_GSHEETS_SPREADSHEET_ID=<spreadsheet id> \
  SMOKE_GSHEETS_RANGE='Sheet1!A1:D5' SMOKE_GSHEETS_SHEET_NAME=Sheet1 \
  SMOKE_GSHEETS_LOOKUP_COLUMN=<header> SMOKE_GSHEETS_LOOKUP_VALUE=<value> \
  npm run smoke:actions:run:workflow:live
```

Point these at a **dedicated smoke spreadsheet** you control — all four fixtures are
read-only, but they read whatever rows/cells the ids resolve to.

**Google Sheets actions still uncovered / deferred (4 covered of 12 registered):**

- All remaining Google Sheets actions are **writes / destructive** and are deferred
  (they create/mutate spreadsheet state without a safe cleanup pattern):
  `append_row`, `update_row`, `update_cell`, `batch_update`, `format_range`,
  `create_spreadsheet`, `clear_range`, `delete_row` (destructive). The 4 covered are all
  read-only (`get_sheet_metadata`, `read_rows`, `get_cell_value`, `find_row`).

**Google Drive-only inventory:** `npm run smoke:actions -- --provider google-drive`.

**Google Drive live read run** (`list_files` needs only a connected Drive;
`get_file_metadata` also needs a file id; `search_files` also needs a query and may take
an optional folder — any missing required one SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_GOOGLE_DRIVE_CONNECTED=1 \
  SMOKE_GDRIVE_FILE_ID=<file id> SMOKE_GDRIVE_QUERY=<text> \
  npm run smoke:actions:run:workflow:live
```

All three Drive fixtures are read-only and metadata-only (no content download, no FileRef,
no bytes). Point the ids at a **dedicated smoke Drive** you control.

**Google Drive actions still uncovered / deferred (3 covered of 7 registered):**

- The 3 covered actions are all read-only (`list_files`, `get_file_metadata`,
  `search_files`). `get_file_metadata` + `search_files` were added in Slice
  4.GDRIVE-READ-2 (reuse the existing `filesGet` / `filesList` wrappers; metadata-only,
  bounded/projected output — no raw provider response, owners, bytes, base64, or signed
  URLs; `webViewLink` is an auth-gated deeplink, not a signed URL).
- The remaining 4 registered actions are **writes / destructive** and are out of scope
  for read-only batches: `upload_file`, `create_folder`, `move_file` (writes) and
  `delete_file` (destructive — never `liveSafe`). They are deferred for the same
  no-safe-cleanup reason as the Slack / Airtable / Sheets writes.
- Not yet built (would need their own provider-action slice): a `list_folder_contents`
  variant beyond `list_files`'s folder filter, and a read-only permissions/sharing list.

**Gmail-only inventory:** `npm run smoke:actions -- --provider gmail`.

**Gmail live read run** (`list_labels` + `get_profile` need only a connected Gmail;
`search_emails` also needs a q-syntax query — missing required env SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_GMAIL_CONNECTED=1 SMOKE_GMAIL_QUERY='newer_than:7d' \
  npm run smoke:actions:run:workflow:live
```

`search_emails` reads real message metadata (it hydrates each match) — point
`SMOKE_GMAIL_QUERY` at a narrow query (e.g. `newer_than:7d`) against a **throwaway /
smoke mailbox**; the fixture caps `maxResults` at 3 and the report stays status-only.

**Gmail audit + actions still uncovered / deferred (3 covered of 15 registered):**

- **Audit:** of Gmail's registered actions, only `search_emails` was a usable read; the
  rest were writes (`send_email`, `create_draft`, `create_draft_reply`, `reply_to_email`,
  `add_label`, `remove_label`, `create_label`, `mark_as_read`, `mark_as_unread`,
  `archive_email`), destructive (`delete_email`), or file-content (`get_attachment` —
  excluded as it returns attachment bytes). Slice 4.GMAIL-READ-1 added two small
  metadata-only read actions — `list_labels` (reuses `usersLabelsList`) and `get_profile`
  (reuses `usersGetProfile`) — so the read batch is `search_emails` + `list_labels` +
  `get_profile`. Both new actions are bounded/projected (no raw response spread, no body /
  MIME / attachment / base64); `get_profile.emailAddress` is marked sensitive.
- **Deferred:** the 10 write actions + `delete_email` (destructive) are out of scope for
  read-only batches (no safe cleanup pattern). `get_attachment` is intentionally excluded
  — it returns attachment content (FileRef / bytes), which this read-only slice avoids.

**Microsoft Outlook-only inventory:** `npm run smoke:actions -- --provider microsoft-outlook`.

**Outlook live read run** (`list_folders` + `get_profile` + `fetch_emails` need only a
connected Outlook; `fetch_emails` optionally narrows via `SMOKE_OUTLOOK_QUERY`):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_MICROSOFT_OUTLOOK_CONNECTED=1 \
  npm run smoke:actions:run:workflow:live
```

`fetch_emails` reads real message metadata (one page, max 5). Point the connected
Outlook at a **throwaway / smoke mailbox**; the report stays status-only.

**Outlook mail audit + actions still uncovered / deferred (3 covered of 11 registered):**

- **Audit:** of Outlook's registered actions, only `fetch_emails` was a usable read; the
  rest were writes (`send_email`, `reply_to_email`, `forward_email`, `create_draft_email`,
  `move_email`, `add_categories`), destructive (`delete_email`), or file-content
  (`get_attachment` — excluded as it returns attachment bytes). Slice 4.OUTLOOK-READ-1
  added two small metadata-only read actions — `list_folders` (reuses the existing
  `listMailFolders` wrapper) and `get_profile` (adds a provider-local `/me` wrapper that
  throws `Unauthorized401Error` on 401 so the refresh path works, unlike the
  OAuth-callback `getMe`). The read batch is `fetch_emails` + `list_folders` +
  `get_profile`. Both new actions are bounded/projected (no raw Graph response spread, no
  body / MIME / attachment / base64); `get_profile`'s `mail` / `userPrincipalName` /
  `displayName` are marked sensitive.
- **Deferred:** the 6 write actions + `delete_email` (destructive) are out of scope for
  read-only batches (no safe cleanup pattern). `get_attachment` is intentionally excluded
  — it returns attachment content (FileRef / bytes).

**Notion-only inventory:** `npm run smoke:actions -- --provider notion`.

**Notion live read run** (`search` + `list_users` need only a connected Notion;
`query_database` also needs a database id; `get_page` also needs a page id — missing
required env SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_NOTION_CONNECTED=1 \
  SMOKE_NOTION_DATABASE_ID=<id> SMOKE_NOTION_PAGE_ID=<id> \
  npm run smoke:actions:run:workflow:live
```

All four Notion fixtures are read-only and capped at one small page; the report stays
status-only (never page/database titles, properties, or block content).

**Notion audit + actions still uncovered / deferred (4 covered of 16 registered):**

- **Audit:** Notion already registered a rich read surface, so this slice is
  **fixture-only** — no new actions. Fixtured 4 of the registered reads:
  `search` (pages/databases), `list_users` (workspace users), `query_database` (one page),
  `get_page` (page metadata/properties). All `liveSafe` read fixtures, capped at one small
  page; reports stay status-only (the actions' own outputs carry properties, but the smoke
  harness never surfaces them).
- **Other registered reads not fixtured this slice** (kept the batch to the 4 most
  representative metadata reads): `get_user`, `list_comments`, `get_block`,
  `get_block_children` (`get_block_children` deliberately left out — it returns block
  content, which this read-only batch avoids surfacing even though the report is
  status-only).
- **Deferred (writes / destructive):** `create_page`, `update_page`,
  `create_database_entry`, `append_block_children`, `restore_page`, `create_comment`,
  `create_database` (writes) and `archive_page` (destructive) — out of scope for
  read-only batches (no safe cleanup pattern).

**Microsoft Excel-only inventory:** `npm run smoke:actions -- --provider microsoft-excel`.

**Excel live read run** (`get_workbooks` needs only a connected Excel; the others also
need a workbook id; `read_range` also needs a worksheet name + range; `read_table_rows` /
`find_row` also need a table name; `find_row` also needs a lookup column + value —
missing required env SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_MICROSOFT_EXCEL_CONNECTED=1 SMOKE_EXCEL_WORKBOOK_ID=<drive item id> \
  SMOKE_EXCEL_WORKSHEET_NAME=Sheet1 SMOKE_EXCEL_RANGE='A1:D10' \
  SMOKE_EXCEL_TABLE_NAME=Table1 \
  SMOKE_EXCEL_LOOKUP_COLUMN=<header> SMOKE_EXCEL_LOOKUP_VALUE=<value> \
  npm run smoke:actions:run:workflow:live
```

All five Excel fixtures are read-only; `read_range` / `read_table_rows` / `find_row`
return bounded/capped cell values (the action's purpose), but the smoke report stays
status-only (never workbook/worksheet names or cell content).

> **Excel live verification — VERIFIED (2026-06-21).** All five Excel reads pass live.
> Earlier they failed with Graph **"Operation not supported"** on
> `me/drive/root/children`; the cause was a **bug**, not a missing drive: `workbooksList`
> sent `?$filter=file/mimeType eq '…'`, and OneDrive does **not** support `$filter` on the
> `children` collection (HTTP 400 `notSupported`). Fixed by listing the root page and
> filtering `.xlsx` **client-side** (`workbooksList.ts`). To verify Excel you need a
> connected Microsoft account with a normal **OneDrive** containing at least one `.xlsx`
> workbook; `read_table_rows` + `find_row` additionally need a workbook that has an Excel
> **Table** object (Insert → Table). Discovery prefers a table-bearing workbook
> automatically. (Still reads the user's default drive only — no SharePoint-site fallback.)

**Microsoft Excel audit + actions still uncovered / deferred (5 covered of 13 registered):**

- **Audit:** the prior fixture-only slice covered the two pre-existing reads
  (`get_workbooks`, `get_worksheets`). Slice 4.EXCEL-READ-2 added three read actions —
  `read_range` (caller-specified bounded A1 range via a new `worksheetRangeGet` wrapper),
  `read_table_rows` (one page via `tableRowsList` + a new `$top` cap), and `find_row`
  (reuses `tableColumnsList` + `tableRowsList`, scans one bounded page client-side). All
  three are bounded/projected (no raw Graph spread, no file content / bytes / base64).
- **Deferred (writes / destructive / file-content):** `add_row`, `add_table_row`,
  `create_worksheet`, `update_row`, `rename_worksheet` (writes), `delete_row` +
  `delete_worksheet` (destructive), and `export_sheet` (returns workbook file content) —
  all out of scope for read-only batches.

**Microsoft Teams-only inventory:** `npm run smoke:actions -- --provider microsoft-teams`.

**Teams live read run** (`list_teams` needs only a connection; `list_channels` /
`get_team_members` also need a team id; `get_channel_details` / `list_channel_messages`
also need a channel id — missing required env SKIPs):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_MICROSOFT_TEAMS_CONNECTED=1 \
  SMOKE_TEAMS_TEAM_ID=<team id> SMOKE_TEAMS_CHANNEL_ID=<channel id> \
  npm run smoke:actions:run:workflow:live
```

All five Teams fixtures are read-only; the report stays status-only (never channel/team
names, member identities, or message bodies — `get_team_members` carries member PII and
`list_channel_messages` returns header-level metadata only, none surfaced).

## SMOKE-ACTIONS-17/18 batch — native logic + Tier-2 read coverage

Added 51 fixtures in two slices. **All read-only, all `liveSafe` / `liveRisk: "read"`**,
all env-gated so they SKIP cleanly (clear "missing env" reason) when the provider
is not connected on the smoke account.

**SMOKE-ACTIONS-17 — native logic actions (4):**

| Fixture | Executes offline? | Notes |
|---|---|---|
| `native:delay` | ✅ yes (PASS) | Pure 1s in-process sleep. No creds, no provider call. Genuinely runs in CI + workflow modes. |
| `native:if_then_condition` | ✅ yes (PASS) | Pure boolean eval. Authored to land on the **null branch** (false + `onFalse:"skip"`) so it is terminal-node-safe in workflow modes (a non-null `branchTaken` on a single terminal node fails the engine with `INVALID_BRANCH`). |
| `native:router` | ✅ yes (PASS) | Pure route eval. Authored to land on the **null branch** (no route matches, no `defaultRoute`) for the same terminal-node-safety reason. |
| `native:http_request` | ⏭ SKIP unless env | The one native action that makes a real outbound **network** call. Env-gated on `SMOKE_NATIVE_HTTP_URL` (a public https URL) so it never fires a live fetch in offline CI. Egress guard blocks private/loopback/metadata hosts. |

The three pure natives execute end-to-end (verified in mode 2 handler-dispatch AND
mode 3 workflow-test on the dev DB — terminal `succeeded` runs). `http_request`
SKIPs without `SMOKE_NATIVE_HTTP_URL`.

**SMOKE-ACTIONS-18 — Tier-2 read coverage (47 fixtures, 12 new providers + Notion leftovers):**

| Provider | Fixtures | Reads covered |
|---|---|---|
| `monday` | 10 | list_boards, list_groups, list_items, list_subitems, list_updates, list_users, get_board, get_item, get_user, search_items |
| `hubspot` | 7 | get_companies, get_contacts, get_deals, get_line_items, get_owners, get_products, get_tickets (all connection-only, no selector) |
| `microsoft-onenote` | 6 | list_notebooks, list_sections, list_pages, get_notebook_details, get_section_details, get_page_content |
| `google-analytics` | 4 | run_report, run_pivot_report, get_realtime_data, find_conversion |
| `dropbox` | 3 | list_folder, search_files, get_file_metadata |
| `microsoft-onedrive` | 2 | list_items, get_file (metadata only — no bytes) |
| `mailchimp` | 4 | get_subscribers, get_subscriber, get_campaign, get_campaign_stats |
| `stripe` | 4 | get_payments, find_customer, find_payment_intent, find_subscription |
| `discord` | 1 | fetch_messages |
| `facebook` | 1 | get_page_insights |
| `google-calendar` | 1 | list_events |
| `google-docs` | 1 | get_document (structured JSON content — not file bytes; `export_document` excluded) |
| `microsoft-outlook-calendar` | 1 | list_events |
| `notion` (leftover) | 2 | get_user, list_comments |

**Deliberate read exclusions** (consistent with the prior batches' "no raw
bytes / signed URLs" rule): `monday:download_file`, `dropbox:download_file` /
`get_temporary_link` (signed URL) / `create_shared_link` (write),
`google-docs:export_document`, `*:get_attachment` — all return raw file bytes /
FileRefs / signed URLs and are out of scope for status-only read smokes.
`google-analytics:create_conversion_event` / `send_event` are writes.

**Gmail / Outlook reads are already fully covered** — their only remaining
non-write actions are `get_attachment` (raw bytes, intentionally excluded), so no
leftover read fixtures were added there. Notion was the only already-covered
provider with leftover metadata reads to add.

**Verification status for this batch (updated after the auto-discovery slice).**
The 47 provider read fixtures were authored from each action's resolved-config
**Zod schema** and pass the structural gates. After selector auto-discovery landed
(see **Selector auto-discovery** above), a live sweep against the connected smoke
account **live-verified 22 of them with ZERO manual selector env** — selectors
auto-discovered from each provider's own APIs:

- **LIVE_PASS (auto-discovered):** hubspot (all 7), microsoft-onenote (all 6, incl.
  the `notebookId→sectionId→pageId` cascade), mailchimp (`get_campaign`,
  `get_campaign_stats`, `get_subscribers`), dropbox (`list_folder`,
  `get_file_metadata`), google-calendar (`list_events`), google-docs
  (`get_document`), microsoft-onedrive (`list_items`), microsoft-outlook-calendar
  (`list_events`), and **facebook `get_page_insights`** (after the metric fix
  below).
- **Not connected on the smoke account** (cleanly reported, not a failure): monday
  (10), stripe (4), discord (1).
- **Connected but selector not auto-discoverable** (set env to run): dropbox
  `search_files` (free-text query — see the Tier-1 cleanup note below).
- **Connected but no usable object on the account:** google-analytics (4 — the GA
  account exposes no property), microsoft-onedrive `get_file` (see cleanup note).

**Tier-1 selector edge-case cleanup (after the Facebook fix).** Three of the
previously "selector not auto-discoverable" reads were resolved by adding the
missing builder option sources (they reuse existing read wrappers — no new
transport — and are genuine builder pickers, not smoke-only hacks):

- **mailchimp `get_subscriber` → LIVE_PASS.** New `mailchimp:members` option
  source (deps `audience_id`, reuses `membersList`) backs the subscriber/email
  picker. Discovery now cascades audience → first member email. (No more
  "provide an email" requirement.)
- **notion `get_user` → LIVE_PASS.** New `notion:users` option source (reuses
  `usersList`) backs the user picker; discovery selects a workspace user id.
- **notion `list_comments` → LIVE_PASS.** New `notion:pages` option source
  (reuses the `search` wrapper, `object=page` filter) backs the block/page
  picker; discovery selects an accessible page. Comments may be empty — still a
  successful read.

Still SKIP (honest classification, not bugs):

- **dropbox `search_files` — env-required.** A search query is operator INTENT,
  not a discoverable resource selector; there is no safe, non-arbitrary value to
  auto-derive. Set `SMOKE_DROPBOX_QUERY` to run it. (Dropbox's `list_folder` /
  `get_file_metadata` reads ARE LIVE_PASS via auto-discovery.)
- **microsoft-onedrive `get_file` — FIXED → LIVE_PASS.** Was SKIP because
  `itemId` cascaded folder → items and the first root folder was empty (the
  items resolver only lists one folder's children, never root-level files). New
  flat `microsoft-onedrive:files` resolver lists **root files first**, then
  descends a **bounded one level** into root folders only when root has none —
  so a file at root or one level down is found. `itemId` now points at it (no
  parent dep); `SMOKE_ONEDRIVE_FILE_ID` still pins a specific file. Live-verified
  (auto-discovers a real file). All READ-ONLY (`driveItemsList` only).
- **google-analytics (4 reads) — genuinely no usable object.** Verified via the
  `google-analytics:accounts` resolver against the smoke account: it returns
  **0 accounts** (the connected Google account has no accessible GA4 property),
  so `propertyId` cannot be discovered. NOT faked — confirmed empty, not an
  error. Connect a Google account with a GA4 property (or set the property env)
  to run these.
- **Fixed — facebook `get_page_insights` (was a live BUG, now LIVE_PASS).** The
  `pageId` auto-discovered fine; the failure was the fixture's default **metric**.
  Graph returned `(#100) The value must be a valid insights metric` because Meta's
  2024 Page Insights deprecation removed the `page_impressions*` / `page_fans` /
  `page_engaged_users` family (invalid on v23.0). Root cause was the metric, not a
  selector, permission, or period issue (`read_insights` is granted; `period` is a
  validated enum). Fixed by switching the fixture + action-meta example to the
  still-valid, universally-available `page_post_engagements` (live-verified on the
  smoke page, day window). The metric stays free-text by design (the catalog is
  large + version-dependent — no static enum); the `insightsGet` wrapper has a unit
  test pinning the produced Graph path/query. The live gate's known-FAIL/BUG
  surfacing path (`isCertifiedFailing`) stays as infrastructure for future cases.

**Microsoft Teams audit + actions still uncovered / deferred (5 covered of 8 registered):**

- **Audit:** the prior fixture-only slice covered the two pre-existing reads
  (`get_channel_details`, `get_team_members`). Slice 4.TEAMS-READ-2 added three read
  actions — `list_teams` (reuses the `teamsList` wrapper), `list_channels` (reuses
  `channelsList`), and `list_channel_messages` (new `channelMessagesList` wrapper). All use
  **already-granted scopes** (`Team.ReadBasic.All` / `Channel.ReadBasic.All` /
  `ChannelMessage.Read.All`) — no scope change. `list_channel_messages` is metadata-only by
  construction: the handler projects header-level fields (`id`, timestamps, importance,
  type, sender AAD id, deeplink) and NEVER surfaces message body / subject / sender name /
  attachments even though Graph returns them (asserted by test).
- **Deferred (writes):** `send_channel_message`, `reply_to_channel_message`,
  `send_chat_message` — out of scope for read-only batches (no safe cleanup pattern).
  Teams registers no destructive action.

## Commands

### Dry-run inventory

```bash
npm run smoke:actions                              # all providers
npm run smoke:actions -- --provider slack          # only Slack
npm run smoke:actions -- --provider airtable       # only Airtable
npm run smoke:actions -- --provider google-sheets  # only Google Sheets
npm run smoke:actions -- --provider google-drive   # only Google Drive
npm run smoke:actions -- --json                    # machine-readable JSON (+ coverage)
npm run smoke:actions -- --changed                 # scope to the local git diff
npm run smoke:actions -- --include-destructive     # show destructive fixtures as runnable

# equivalent direct form
npm run chainreact -- smoke actions [--provider <id>] [--all] [--json] [--changed] [--include-destructive]
```

- The footer prints a `Totals:` line (registered / fixture-backed / missing /
  skipped) and a `Coverage:` line (liveSafe count + read/write/destructive
  breakdown), so coverage growth is visible at a glance. `--json` exposes both as
  `totals` + `coverage`.
- Exit `0` when every fixture is well-formed; exit `1` when any fixture is
  malformed or mis-classified (suitable for a pre-push hook / CI gate).
- `--changed` maps a changed fixture file to its exact action and a changed
  handler file (`integrations/<provider>/actions/...`) to that whole provider.
  Falls back to the full inventory if git is unavailable.
- The CLI **never executes** anything (its standing charter).

> **Per-provider execution:** the `npm run smoke:actions:run*` test runners execute
> the **whole** fixture set; fixtures for providers you haven't connected simply
> SKIP (missing env). To narrow *inventory* to one provider use `--provider`;
> per-provider *execution* selection (the harness `providerFilter`) isn't wired to
> an npm flag yet — connect only the provider you want and the rest self-skip.

### Mode 2 — handler-dispatch smoke (no DB)

```bash
npm run smoke:actions:run        # jest tests/integration/smoke-actions tests/unit/smoke-actions
# or just the run-all spec:
npm test -- tests/integration/smoke-actions/run-all.smoke.test.ts
```

The run-all spec runs **every** fixture through the real resolver→handler path and
**fails only on a FAIL result** — `PASS` and `SKIP` are both acceptable (`SKIP` =
"couldn't safely run here", not "broken").

Safety model in an environment with no connected providers:

- The native `format_transformer` fixture has no `requiredEnv` → it **actually
  executes** (real resolver + real handler) and **passes**. This proves the
  execution path is real, not all skips.
- The Slack fixtures declare `requiredEnv` → they **SKIP** until you set the env
  for a throwaway smoke workspace:
  ```bash
  SMOKE_SLACK_CONNECTED=1 SMOKE_SLACK_CHANNEL=C0SMOKE npm test -- tests/integration/smoke-actions/run-all.smoke.test.ts
  ```
  Only set these against a smoke account + throwaway channel — `write`/
  `destructive` fixtures post / mutate real Slack state.
- Destructive fixtures additionally need `includeDestructive` (off by default).

### Mode 3 — full workflow-run smoke (gated, needs a dev DB)

Runs each fixture through the **same manual run-now path the app uses**: persist a
minimal `{native:manual.run → action}` draft workflow → `enqueueRun` → wait for the
engine → read the persisted `workflow_runs` row → PASS/FAIL/SKIP from the terminal
status.

```bash
ALLOW_DB_INTEGRATION_TESTS=true \
  SMOKE_ACCOUNT_ID=<dev account uuid> SMOKE_USER_ID=<dev user uuid> \
  npm run smoke:actions:run:workflow
```

Requirements (else the suite **SKIPs**, never fails): `ALLOW_DB_INTEGRATION_TESTS=true`,
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (auto-loaded from
`.env.local`), and `SMOKE_ACCOUNT_ID` + `SMOKE_USER_ID` (a real dev account + a
member user the throwaway workflow is created under).

Safety model:

- Runs in engine **test mode** by default. The `testModeGate` executes native
  logic/transform handlers for real but **blocks every external/destructive
  handler** — so there are **no real provider calls**. The native fixture
  genuinely runs end-to-end and produces a terminal `succeeded` run.
- Connected-provider fixtures **SKIP before any workflow is created** (their env
  is unset).
- Destructive fixtures still need `includeDestructive`.
- Manual-trigger workflows register **no `trigger_resources`** (lifecycle rule).
- Temporary workflows are **soft-deleted** (`state='deleted'`, named `smoke:…`) —
  hidden from the UI, run history retained. They are not hard-purged.
- Reports/logs carry only safe fields — the failure reason is the **humanized
  error title or the engine fatal-error code**, never raw provider output,
  tokens, file bytes, or step blobs.

JSON output (`renderExecutionJson`) carries `kind`, `mode`
(`handler`|`workflow-test`|`workflow-live`), `ok`, totals, and per-result
`provider`/`action`/`outcome`/`reason`/`runId`/`workflowId`/`providerBoundary`.

### Mode 4 — live-connected workflow smoke (double-gated, real providers)

The only mode that calls a real provider. Same path as mode 3 but engine **real
mode**, so the provider handler actually runs. **Only `liveSafe` fixtures run.**

**Read-only live run** (Slack `list_channels` + native baseline):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<dev account uuid> SMOKE_USER_ID=<dev user uuid> \
  SMOKE_SLACK_CONNECTED=1 \
  npm run smoke:actions:run:workflow:live
```

**Live WRITE run** (⚠️ posts a **real Slack message** to `SMOKE_SLACK_CHANNEL_ID`):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true \
  SMOKE_ACCOUNT_ID=<dev account uuid> SMOKE_USER_ID=<dev user uuid> \
  SMOKE_SLACK_CONNECTED=1 SMOKE_SLACK_CHANNEL_ID=<channel id> \
  npm run smoke:actions:run:workflow:live
```

> ⚠️ **Write smoke posts a real, persistent Slack message** (a clearly-marked
> "safe to ignore" message with a per-run marker). It is **not** deleted afterward.
> Point `SMOKE_SLACK_CHANNEL_ID` at a **dedicated private smoke channel** you
> control — never a real team channel.

Requirements (else the suite **SKIPs**): the mode-3 set **plus**
`ALLOW_LIVE_PROVIDER_SMOKE=true`, plus each fixture's provider-connection env
(`SMOKE_SLACK_CONNECTED=1` needs a real Slack connection on `SMOKE_ACCOUNT_ID`);
the write fixture additionally needs `ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true` +
`SMOKE_SLACK_CHANNEL_ID`.

Safety model (additions over mode 3):

- **`liveSafe: true` required** — non-`liveSafe` fixtures SKIP before any workflow
  is created.
- **Per-class opt-in via `liveRisk`** — `read` runs on the live gate; `write` also
  needs `ALLOW_LIVE_PROVIDER_WRITE_SMOKE`; `destructive` needs the destructive
  double-opt-in. The write fixture SKIPs (before workflow creation) without its
  write gate or `SMOKE_SLACK_CHANNEL_ID`.
- **Destructive double-opt-in** — a destructive fixture runs live ONLY with **both**
  `includeDestructive` **and** `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true`. No shipped
  fixture is both `liveSafe` and destructive.
- **Real runs consume one task** from `SMOKE_ACCOUNT_ID`'s balance.
- **No data leak** — the report asserts only the terminal run status; it never
  contains the channel list / provider output. Failure reasons are humanized
  titles / engine codes, then run through `sanitizeFailureReason` (redacts
  token/`Bearer`/long-blob/URL shapes, caps length) as belt-and-braces.
- Every result is tagged `providerBoundary: "live"`.

### Certification matrix — don't re-run already-passed actions

Live runs cost a task per fixture and a real provider API call, so the live runner
does **not** re-verify actions that already passed. A durable **certification
matrix** ([`scripts/chainreact/smoke/certification.ts`](../../scripts/chainreact/smoke/certification.ts))
records a safe status per provider/action — **safe facts only** (provider/action key,
status, date, short note; never secrets, selector values, account/run/workflow ids, or
provider payloads). Statuses:

| Status | Meaning | Default live run |
|---|---|---|
| `LIVE_PASS` | already passed live verification | **CERT-SKIP (not re-run)** |
| `LIVE_NOT_RUN` | fixtured, never live-verified | runs |
| `MISSING_FIXTURE` | registered action with no fixture (a gap) | n/a (no fixture) |
| `BLOCKED_ENV` | couldn't run (account/resource/env missing, e.g. Excel) | runs once env appears |
| `FAIL` / `BUG` | last run failed / known bug | runs (re-verify after a fix) |

**Default behavior (budget-conserving).** The live runner (`npm run
smoke:actions:run:workflow:live`) turns the certification **planner** on: any
`liveSafe` action certified `LIVE_PASS` is reported `certified-skip` (a.k.a. `CERT-SKIP`)
and **never reaches the engine** — no task spent, no provider call, no re-posted write.
`CERT-SKIP` is reported **separately** from a missing-env skip (it is not a gap — it is
"already green"). Per-provider totals are `pass / fail / skip / cert-skip`; the JSON adds
`totals.certifiedSkip` + a top-level `rerunPassed` flag (additive). The
`native:format_transformer` baseline is intentionally **not** certified, so it runs every
sweep to prove the live path is real.

**Full regression sweep (re-verify everything).** Set `SMOKE_RERUN_PASSED=1` to re-run
`LIVE_PASS` actions too — for a release candidate or after a broad change. The report
prints a `RERUN-PASSED MODE` banner so an intentional full sweep is obvious. (Write/
destructive gates still apply — a rerun write only posts with `ALLOW_LIVE_PROVIDER_WRITE_SMOKE`,
a destructive only with the destructive double-opt-in.)

```bash
# Default — skips already-certified LIVE_PASS actions (conserves task budget):
… SMOKE_PROVIDER=airtable SMOKE_AIRTABLE_CONNECTED=1 … npm run smoke:actions:run:workflow:live

# Full regression sweep — re-runs passed actions too:
… SMOKE_RERUN_PASSED=1 SMOKE_PROVIDER=airtable SMOKE_AIRTABLE_CONNECTED=1 … npm run smoke:actions:run:workflow:live
```

**View the matrix (offline, no execution):**

```bash
npm run smoke:actions -- --cert                     # all providers
npm run smoke:actions -- --cert --provider airtable  # one provider
npm run smoke:actions -- --cert --json               # machine-readable
```

The planner only ever **skips** a certified read/write — it never makes an uncertified or
destructive action run, so it cannot loosen any live gate. When an action is fixed or a
new pass is observed, update its record in `certification.ts` (a unit test guards that the
matrix enumerates every registered action and that no selector-like value lands in it).

### Per-provider live verification (`SMOKE_PROVIDER`)

Live mode runs **all** fixtures by default; unconfigured providers self-skip. To verify
**one provider at a time** (recommended for working through the non-Slack reads), set
`SMOKE_PROVIDER=<id>` — it mirrors the inventory `--provider` flag and narrows *which*
fixtures run. It never bypasses any fixture-level env, write, or destructive gate.

**Base env (every live run needs all of these):**

```bash
ALLOW_DB_INTEGRATION_TESTS=true      # master dev-DB gate
ALLOW_LIVE_PROVIDER_SMOKE=true       # live-read gate
NEXT_PUBLIC_SUPABASE_URL=…           # auto-loaded from .env.local
SUPABASE_SERVICE_ROLE_KEY=…          # auto-loaded from .env.local
SMOKE_ACCOUNT_ID=<dev account uuid>
SMOKE_USER_ID=<dev member user uuid>
```

**One provider at a time** (set the provider connection + any selector env it needs):

```bash
# Slack (Marcus-verified read + write)
… SMOKE_PROVIDER=slack SMOKE_SLACK_CONNECTED=1 \
  SMOKE_SLACK_CHANNEL_ID=<C…> SMOKE_SLACK_USER_ID=<U…> \
  npm run smoke:actions:run:workflow:live

# Google Drive
… SMOKE_PROVIDER=google-drive SMOKE_GOOGLE_DRIVE_CONNECTED=1 \
  SMOKE_GDRIVE_FILE_ID=<id> SMOKE_GDRIVE_QUERY=<text> npm run smoke:actions:run:workflow:live

# Gmail
… SMOKE_PROVIDER=gmail SMOKE_GMAIL_CONNECTED=1 SMOKE_GMAIL_QUERY='newer_than:7d' \
  npm run smoke:actions:run:workflow:live

# Microsoft Outlook
… SMOKE_PROVIDER=microsoft-outlook SMOKE_MICROSOFT_OUTLOOK_CONNECTED=1 \
  npm run smoke:actions:run:workflow:live

# Airtable
… SMOKE_PROVIDER=airtable SMOKE_AIRTABLE_CONNECTED=1 \
  SMOKE_AIRTABLE_BASE_ID=<app…> SMOKE_AIRTABLE_TABLE_ID=<tbl…> SMOKE_AIRTABLE_RECORD_ID=<rec…> \
  npm run smoke:actions:run:workflow:live

# Google Sheets
… SMOKE_PROVIDER=google-sheets SMOKE_GOOGLE_SHEETS_CONNECTED=1 \
  SMOKE_GSHEETS_SPREADSHEET_ID=<id> SMOKE_GSHEETS_RANGE='Sheet1!A1:D5' \
  SMOKE_GSHEETS_SHEET_NAME=Sheet1 SMOKE_GSHEETS_LOOKUP_COLUMN=<header> SMOKE_GSHEETS_LOOKUP_VALUE=<value> \
  npm run smoke:actions:run:workflow:live

# Notion
… SMOKE_PROVIDER=notion SMOKE_NOTION_CONNECTED=1 \
  SMOKE_NOTION_DATABASE_ID=<id> SMOKE_NOTION_PAGE_ID=<id> npm run smoke:actions:run:workflow:live

# Microsoft Excel
… SMOKE_PROVIDER=microsoft-excel SMOKE_MICROSOFT_EXCEL_CONNECTED=1 \
  SMOKE_EXCEL_WORKBOOK_ID=<id> SMOKE_EXCEL_WORKSHEET_NAME=Sheet1 SMOKE_EXCEL_RANGE='A1:D10' \
  SMOKE_EXCEL_TABLE_NAME=Table1 SMOKE_EXCEL_LOOKUP_COLUMN=<header> SMOKE_EXCEL_LOOKUP_VALUE=<value> \
  npm run smoke:actions:run:workflow:live

# Microsoft Teams
… SMOKE_PROVIDER=microsoft-teams SMOKE_MICROSOFT_TEAMS_CONNECTED=1 \
  SMOKE_TEAMS_TEAM_ID=<id> SMOKE_TEAMS_CHANNEL_ID=<id> npm run smoke:actions:run:workflow:live
```

(`…` = the base env block above. The full per-provider env var list is in the **Env vars**
table near the top.)

**Reading the result.** The run prints a human report ending in per-provider totals plus,
when fixtures skipped for unset env, a grouped **Missing env** summary:

- **PASS** — the fixture ran live and the persisted run was terminal as expected.
- **FAIL** — it ran but the run was not the expected terminal state (gate: the suite fails
  on any FAIL).
- **SKIP** — it did not run: not `liveSafe`, a gate was off (write/destructive), or required
  env was unset. SKIP is never a failure.
- **Missing env** — lists each env-skipped fixture as `provider:action — ENV_NAME, …` and a
  `Set: …` shortlist of every distinct missing var. **Only env var NAMES are printed, never
  values.** Set the listed vars and re-run to convert SKIPs into live PASSes. The same data
  is in the JSON output under an additive `missingEnv` key.

**Verification status (2026-06-21).** **Live-verified reads — ALL nine providers:** Slack
(read + write), Gmail, Google Drive, Microsoft Outlook, Airtable, Notion (incl. empty-query
"search all"), Google Sheets, Microsoft Teams, and **Microsoft Excel** (5/5, after fixing the
`get_workbooks` OneDrive `$filter` bug — see the Excel note above). Every fixtured `liveSafe`
read that can run has passed; the remaining non-passes are the always-run `native` baseline and
the non-liveSafe destructive `slack:delete_message`, both by design. Selector ids are discovered
from a connected smoke account into gitignored `.env.local` and are never committed (only env-var
NAMES appear in reports — never values, account ids, run/workflow ids, or raw provider output).

## How execution maps to the real engine

The harness runs the same per-node core the engine
(`services/execution/engine.ts`) uses, scoped to one action:

1. **Strict pre-resolution** of `config` via the canonical
   `resolveStrict` (`workflow-engine/variables/resolveValue.ts`) — a missing
   `{{...}}` reference is a fixture bug → FAIL, never passed to the handler (the
   Q2 contract).
2. **Real handler lookup** via `getActionHandler` (the registry the engine
   dispatches through).
3. **Handler dispatch** behind an injected boundary. The default boundary calls
   the real handler; tests inject a fake to drive deterministic pass/fail/skip
   (mocking ONLY the external provider boundary, per the testing-strategy rule).

Modes 3 + 4 (workflow-run) go the rest of the way: they stand up a real persisted
workflow and drive `enqueueRun` (the service the run-now route calls), so the
**full** `WorkflowEngine.runWorkflow` path runs and writes a `workflow_runs` row.
Mode 3 runs in engine test mode (no provider call); mode 4 runs in real mode (the
provider handler actually runs). The harness orchestrator
(`tests/smoke-actions/workflowRun.ts`) is pure over injected seams
(`createSmokeWorkflow`/`runManualAndAwait`/`readRun`/`cleanupSmokeWorkflow`), so it
unit-tests with fakes; the real wiring lives in `workflowRunDeps.ts` and runs only
in the gated dev tests.

## Adding the next fixtures

Next recommended **read-only** batches (all `liveRisk: "read"`, `liveSafe: true`):

- **More Slack reads:** `get_user_info` (needs a user id), `get_messages` /
  `get_thread_messages` (need a channel + ts).
- **Notion reads:** `get_user`, `list_users`, `search` (need a connected Notion).
- **Gmail reads:** `search_emails` (reads real mail — report stays status-only, but
  prefer a throwaway mailbox).

For each: add the fixture file, register it in `fixtures.ts`, run
`npm run smoke:actions` to confirm it shows as fixture-backed (and the `Coverage:`
count grew), and `npm run smoke:actions:run` to confirm PASS/SKIP. Add
`liveSafe: true` only after confirming the action is read-only / side-effect-free,
and source any ids from env via `configFromEnv`.

## Write / destructive harness (foundation — design + pilot)

The read harness above covers reads + native logic. Mutating actions (the 201
remaining create/update/delete/send actions) run through a separate **write
harness** with a setup -> execute -> verify -> cleanup phase model so a smoke run
never leaves provider junk, sends to a real destination, charges a customer, or
deletes a pre-existing record. Full contract:
[`../slices/phase-4/readiness/write-smoke-harness-design.md`](../slices/phase-4/readiness/write-smoke-harness-design.md).

**Status (operational):** the contract + pure orchestrator + the real
account-scoped `runActionStep` wiring + `{{env.*}}` sub-step resolution + a
batch runner + a quadruple-gated live dev test are all landed. The 3 pilots are
registered in a SEPARATE `WRITE_SMOKE_FIXTURES` list (kept out of the read
runner). The harness has been exercised LIVE end-to-end (the create call reached
the real provider). A clean pilot `LIVE_PASS` is **blocked pending a confirmed
DEDICATED smoke target** — see below.

**Run the pilot live** (quadruple-gated; `SMOKE_PROVIDER` picks exactly one so the
others can never run live by accident):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_PROVIDER=airtable SMOKE_AIRTABLE_CONNECTED=1 \
  SMOKE_AIRTABLE_BASE_ID=<dedicated smoke base> SMOKE_AIRTABLE_TABLE_ID=<smoke table> \
  SMOKE_AIRTABLE_TEXT_FIELD='<the table primary text field, e.g. Name>' \
  npm run smoke:writes:live
```

The harness creates one `crsmoke-<token>-pilot` record, confirms the marker
round-tripped, then deletes exactly that record. **Point it at a DEDICATED
throwaway base/table** — `SMOKE_AIRTABLE_TEXT_FIELD` must name that table's
primary single-line-text field. (For Trello: `SMOKE_PROVIDER=trello`
`SMOKE_TRELLO_CONNECTED=1` `SMOKE_TRELLO_LIST_ID=<dedicated smoke list>`.)

> **First live attempt (2026-06-22):** run against the read-smoke Airtable base
> with field `Name` — Airtable rejected it (`Unknown field name: "Name"`; that
> base's primary field is different), so the create made **NO** record, cleanup
> correctly skipped (nothing in the ledger), and the run reported `FAIL` with zero
> leaked resources. The wiring + no-junk-on-failure guarantee are confirmed; that
> base is a real working base, not a dedicated throwaway, so the pilot is
> certified `BLOCKED_ENV` until a dedicated smoke base/table is provided.

**Phase model.** A mutating fixture adds a `writeHarness` spec
([`tests/smoke-actions/contract.ts`](../../tests/smoke-actions/contract.ts)):

```ts
import { defineWriteSmokeFixture } from "@/tests/smoke-actions/contract";

export default defineWriteSmokeFixture({
  provider: "airtable", action: "create_record", risk: "write", liveRisk: "write",
  config: { typecast: false, fields: { Name: { type: "singleLineText", value: "{{smokeMarker}}pilot" } } },
  configFromEnv: { baseId: "SMOKE_AIRTABLE_BASE_ID", tableIdOrName: "SMOKE_AIRTABLE_TABLE_ID" },
  requiredEnv: ["SMOKE_AIRTABLE_CONNECTED", "SMOKE_AIRTABLE_BASE_ID", "SMOKE_AIRTABLE_TABLE_ID"],
  expect: { outcome: "success" },
  writeHarness: {
    liveClass: "destructiveSafe",              // safety class (see below)
    smokeMarker: "crsmoke-",                   // unique prefix stamped on created names
    captureResource: { resourceKey: "record", idPath: "id", kind: "record" },
    verify:  { provider: "airtable", action: "get_record",    config: { /* ... */ recordId: "{{ledger.record.id}}" } },
    cleanup: { provider: "airtable", action: "delete_record", config: { /* ... */ recordId: "{{ledger.record.id}}" } },
  },
});
```

- `setup` / `verify` / `cleanup` are themselves **registered actions** (no bespoke
  provider code). Step configs resolve `{{smokeMarker}}` (the per-run unique
  prefix) and `{{ledger.<key>.id}}` (a prior step's captured id).
- **Resource ledger** is the cleanup authority: a cleanup may only target a
  smoke-owned ledger id. A cleanup with a literal/foreign id is **refused** (so
  deleting an arbitrary existing record is impossible).
- **Cleanup is always attempted** (even after execute/verify failure) and reported
  **separately**. A cleanup failure surfaces as `CLEANUP_FAILED` and is never a PASS.

**Safety classes (`liveClass`) + gates:**

| `liveClass` | Runs live only when... | Default |
|---|---|---|
| `writeSafe` | live + `ALLOW_LIVE_PROVIDER_WRITE_SMOKE` | SKIP |
| `sendSafe` | write gate + the fixture's env-pinned smoke destination is set | SKIP |
| `destructiveSafe` | write gate + `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE` + a smoke-owned ledger resource | SKIP |
| `billingSensitive` | all the above + `requiresSandboxEnv` confirms a test-mode account | **SANDBOX_REQUIRED** |
| `neverLive` | never | **UNSAFE_NO_HARNESS** |

**Statuses:** `PASS` / `FAIL` / `VERIFY_FAILED` / `CLEANUP_FAILED` / `SKIP` /
`SANDBOX_REQUIRED` / `UNSAFE_NO_HARNESS`. `VERIFY_FAILED` + `CLEANUP_FAILED` fold to
the existing `ExecutionReport` gate's `fail`, so the suite gate fails and
certification never records `LIVE_PASS` when cleanup failed. `SANDBOX_REQUIRED` +
`UNSAFE_NO_HARNESS` are also durable **certification** statuses.

**Pilots (authored, NOT run live this slice):** `airtable:create_record`,
`notion:create_page` (archive is reversible), `trello:create_card` — all
`destructiveSafe` create+cleanup pairs against a DEDICATED smoke base/page/board.
A future slice wires the real step deps, runs one pilot live with Marcus, then
rolls out per-provider write batches.

**Self-tests:** [`tests/unit/smoke-actions/write-harness.test.ts`](../../tests/unit/smoke-actions/write-harness.test.ts)
(14 tests — cleanup-after-execute/verify-failure, cleanup-failure-surfaced,
smoke-owned guard, dry-run-never-mutates, every gate, PASS path, pure helpers).

## Limitations (honest scope)

- **Coverage is growing but partial:** **94 fixtures** (92 read / 1 write / 1
  destructive) across 23 providers after SMOKE-ACTIONS-17/18 — `npm run smoke:actions`
  shows the remaining gap (**204 of 298** registered actions still have no fixture).
  The uncovered 204 are overwhelmingly **writes / destructive** actions (create /
  update / delete / send), which are intentionally deferred to a separate
  create→verify→cleanup write-harness slice — not yet built. This read + native-logic
  harness is the safe-by-default foundation.
- **Workflow-run modes are dev-DB-gated.** They require `ALLOW_DB_INTEGRATION_TESTS`
  + Supabase service-role env + `SMOKE_ACCOUNT_ID`/`SMOKE_USER_ID` (mode 4 also
  needs `ALLOW_LIVE_PROVIDER_SMOKE`). Without them they SKIP — so CI exercises
  modes 1–2, not 3–4.
- **Live mode (4) is intentionally narrow.** Only `liveSafe` fixtures run — 42 today
  (41 read + 1 write). No `liveSafe` destructive fixture exists (and the validation
  test forbids one). Selector-dependent reads (`get_user_info`, `get_thread_messages`,
  `get_file_info`, `get_file_metadata`, `search_files`, `search_emails`, `query_database`,
  `get_page`, `get_worksheets`, `read_range`, `read_table_rows`, `find_row`,
  `get_channel_details`, `get_team_members`, `list_channels`, `list_channel_messages`, and
  the other connection/selector-gated reads) only run when their id/connection/query env is
  set; otherwise they SKIP.
- **The write fixture is not cleaned up.** It posts a persistent Slack message and
  does not delete it (no destructive cleanup step this slice). Use a throwaway
  channel.
- **Live write has not been run in this environment.** It self-skips without a dev
  DB + a connected smoke Slack workspace + the write gate + a channel id; the path,
  gating, and fixture are ready for Marcus to run locally. (Live *read* was
  verified by Marcus on a prior slice.)
- **Workflow-mode fixtures must be self-contained.** The manual trigger payload is
  `{ inputs: {…} }`, so workflow mode sends empty inputs; fixtures that reference
  `{{trigger.payload.*}}` are authored for handler mode. The native fixture (literal
  config) is mode-agnostic and is the one that genuinely runs in mode 3 today.
- **Temporary smoke workflows are soft-deleted, not purged.** They accumulate as
  `state='deleted'` rows named `smoke:…` on the dev DB; periodic purge is manual.
- **Destructive fixtures never run by default** and require both
  `--include-destructive`/`includeDestructive` and their env.
