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

**Airtable coverage (11 covered of 11 registered — COMPLETE):**

- **Reads (5, live-certified):** `get_base_schema`, `get_table_schema`,
  `list_records`, `find_record`, `get_record`.
- **Writes (6, live-certified via the WRITE harness):** `create_record` +
  `update_record` + `create_multiple_records` + `update_multiple_records` +
  `add_attachment` (`LIVE_PASS_CLEANED`), `delete_record` (`LIVE_PASS`, verified
  gone via an independent `recordsList` read-back). See the write-smoke section below.

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

**Google Sheets actions — COMPLETE (12 of 12 registered covered).**

- **Read (4):** `get_sheet_metadata`, `read_rows`, `get_cell_value`, `find_row`.
- **Write certified (8):** `create_spreadsheet` (SMOKE-WRITE-23) + `update_cell` /
  `append_row` / `update_row` (SMOKE-WRITE-27) + `clear_range` (SMOKE-WRITE-28) +
  `format_range` (SMOKE-WRITE-29) + `batch_update` (SMOKE-WRITE-30) + `delete_row`
  (SMOKE-WRITE-31). The mutators each create a WHOLE smoke-owned spreadsheet (pinned sheet
  "Data"), mutate ONLY that sheet, then permanently delete the whole spreadsheet via
  cross-provider `google-drive:delete_file`. Verification is INDEPENDENT: `update_cell` /
  `append_row` / `update_row` / `batch_update` read the live cell value via
  `get_cell_value` (marker+suffix; `batch_update` uses a single one-cell update entry — it
  is a TYPED value write, not a raw `requests[]` passthrough); `clear_range` seeds A1 then
  proves present-and-empty via `expectEmpty`; `format_range` seeds A1 then proves
  `bold == true` via the bounded smoke-only `cell_format` read-back; `delete_row` seeds
  A1/A2/A3 then proves the row shift via the `verifyAll` primitive (three independent
  `get_cell_value` reads: A1 kept, A2 == the row shifted up, A3 empty — together they pin
  exactly which row was deleted). See the Google Sheets write-coverage note below. No
  Sheets action is deferred.

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

**Google Drive coverage — COMPLETE (7 of 7 registered actions live-certified):**

- The 3 read-only actions (`list_files`, `get_file_metadata`, `search_files`) are
  `LIVE_PASS`. `get_file_metadata` + `search_files` were added in Slice 4.GDRIVE-READ-2
  (reuse the existing `filesGet` / `filesList` wrappers; metadata-only, bounded/projected
  output — no raw provider response, owners, bytes, base64, or signed URLs;
  `webViewLink` is an auth-gated deeplink, not a signed URL).
- The 4 write/destructive actions (`create_folder`, `upload_file`, `move_file`,
  `delete_file`) are `LIVE_PASS_CLEANED` via the WRITE harness (SMOKE-WRITE-17/18; durable
  cert rows reconciled in SMOKE-WRITE-AUDIT). Each is smoke-owned (My Drive root, no target
  discovery), verified by an INDEPENDENT `get_file_metadata` read-back, and the created
  object(s) are PERMANENTLY deleted (true erase via `permanent:true`). See the write-cert
  table below.
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
- **Writes — now LIVE-CERTIFIED via the WRITE harness** (not this read-only batch):
  `create_page`, `update_page`, `create_database_entry`, `append_block_children`,
  `restore_page`, `create_comment`, `archive_page`. See the write-smoke section's
  certification matrix. **Still deferred:** `create_database` (no archive-database
  action + no independent read — see the write-smoke "DEFERRED (exact blockers)" list).

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

**Status (write harness landed; matrix grows per batch).** The contract + pure
orchestrator + real `runActionStep` wiring + `{{env.*}}` sub-step + key resolution
+ a batch runner + a quadruple-gated live dev test are landed. Pilots live in a
SEPARATE `WRITE_SMOKE_FIXTURES` list (kept out of the read runner). Each is
live-verified end to end (create one `crsmoke-`marked resource -> confirm the
marker via an INDEPENDENT read-back -> run cleanup). The matrix below is the
running certification record; rows are added as each provider batch lands.

### Write-smoke certification checkpoint (SMOKE-WRITE-33 / arc boundary, 2026-06-25)

Authoritative source: `npm run chainreact -- smoke actions --cert` (exit 0 = no stale
certs), cross-checked against `--json`. At this checkpoint: **298 registered actions,
119 LIVE_PASS, 0 stale, 0 FAIL, 0 BUG, 0 SANDBOX_REQUIRED, 0 UNSAFE_NO_HARNESS, and
every LIVE_PASS row has a fixture** (verified against the `certification.test.ts` /
`registry-parity.test.ts` / `fixtures-valid.test.ts` guards). The 26 fixtured-but-not-
yet-run rows are all expected READS / native non-mutating actions (discord
`fetch_messages`; dropbox `search_files`; google-analytics `run_report` /
`run_pivot_report` / `get_realtime_data` / `find_conversion`; all Monday reads;
`native:*`; stripe `find_*` / `get_payments`), PLUS the one intentional mutation
exception `slack:delete_message` (destructive, non-`liveSafe` by design — inventory /
handler-only, never runs live). **Write-COMPLETE providers (every registered action
LIVE_PASS):** `airtable` (11/11), `google-drive` (7/7), `google-sheets` (12/12),
`microsoft-onedrive` (7/7 — `copy_item` certified this arc via the async monitor-poll
mechanism, SMOKE-WRITE-33). Remaining uncertified mutations are catalogued by blocker
in the write-coverage summary + per-provider deferred notes below; NONE is a
harness-classified hard block (0 sandbox / 0 unsafe) — each is either an unbuilt fixture
(coverage gap) or a policy / capability deferral with its blocker named below.

### Write-smoke certification checkpoint (SMOKE-WRITE-24, 2026-06-23)

Authoritative source: `npm run chainreact -- smoke actions --cert` (exit 0 = no stale
certs). At this checkpoint: **298 registered actions, 102 LIVE_PASS, 0 stale, 0 cert
rows without a fixture** (verified against `--json` + the `certification.test.ts` /
`registry-parity.test.ts` / `fixtures-valid.test.ts` guards). Drift fixed this checkpoint:
**10 write actions** (airtable `delete_record` / `create_multiple_records` /
`update_multiple_records` / `add_attachment`; notion `create_database_entry` /
`archive_page` / `restore_page`; trello `add_label_to_card` / `move_card` /
`archive_card`) were live-certified in SMOKE-WRITE-4..16 + listed in the table below, but
their durable `certification.ts` rows were missing (matrix showed `NOT_RUN`). All 10 were
re-run LIVE and recorded — same drift class as the earlier Google Drive audit.

- **Write-COMPLETE providers (every registered action certified):** `airtable` (11/11),
  `google-drive` (7/7), `google-sheets` (12/12 — all 8 write actions certified, SMOKE-WRITE-23/27/28/29/30/31),
  `microsoft-onedrive` (7/7 — `copy_item` certified SMOKE-WRITE-33 via the async monitor-poll mechanism).
- **Partially covered (certified core writes; rest deferred/blocked, see notes below):**
  `google-calendar` (4/5 — `add_attendees` deferred), `google-docs` (create_document via
  cross-provider Drive delete), `dropbox` (create_folder/delete_file/upload_file +
  copy_file/move_file; sharing/link/download deferred),
  `microsoft-onenote` (create/update/delete_page; create_section/create_notebook blocked — no
  delete; copy_page deferred), `notion` (create/update/archive/restore page,
  append_block_children, create_comment, create_database_entry), `trello` (create/update
  card, add_comment, add_label_to_card, move_card, archive_card),
  `microsoft-outlook-calendar` (4/5 — create/update/delete_event certified, `add_attendees`
  deferred as send-like).
- **Intentionally deferred / hard-blocked categories (NOT smoked, by policy or capability):**
  email/message SENDS (gmail, microsoft-outlook, slack, discord) — no-send policy;
  billing/customer/order/product (stripe, shopify) — out of scope; SHARING / public-link
  actions (e.g. dropbox `create_shared_link`, google-docs `share_document`) — out of scope;
  google-calendar `add_attendees` (generates invites = send-like); HubSpot CRM
  creates — no delete/archive action for cleanup; Monday — not connected on the smoke
  account; Mailchimp writes — real subscriber/audience contact risk; trello `create_board` /
  `create_list`, notion `create_database` — no registered cleanup (would leave heavy
  artifacts). See the per-provider deferred-inventory notes after the table.

| Action | Flow | Disposition | Cert |
|---|---|---|---|
| `airtable:create_record` | create -> get_record -> **delete** | object deleted | `LIVE_PASS_CLEANED` |
| `airtable:update_record` | create -> update -> echo -> **delete** | object deleted | `LIVE_PASS_CLEANED` |
| `airtable:delete_record` | create -> **delete (action under test)** -> recordsList read-back (gone) | object deleted | `LIVE_PASS_CLEANED` |
| `airtable:create_multiple_records` | create 2 -> verifyEach (recordsList marker per id) -> delete each | both deleted | `LIVE_PASS_CLEANED` |
| `airtable:update_multiple_records` | create 2 -> update both -> verifyEach (marker-"updated" per id) -> delete each | both deleted | `LIVE_PASS_CLEANED` |
| `airtable:add_attachment` | create record -> attach staged PNG (v2_storage) -> read-back attachment field non-empty (each {id}) -> delete record | record deleted | `LIVE_PASS_CLEANED` |
| `trello:create_card` | create -> echo -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `trello:update_card` | create -> update -> echo -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `trello:add_comment` | create card -> comment -> card_comments read-back (marker) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:create_page` | create -> get_page (marker on title) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:update_page` | create -> update title -> get_page (marker on title) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:append_block_children` | create -> append paragraph -> get_block_children (marker in blocks) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:create_comment` | create -> comment -> list_comments (marker in comments) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `trello:add_label_to_card` | create card -> add label -> cardsGet (idLabels contains label, + marker on name) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `trello:move_card` | create card -> move to 2nd smoke list -> cardsGet (idList == target, + marker on name) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `trello:archive_card` | create card -> archive -> cardsGet (closed == true, + marker on name) -> no cleanup | archived (left) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:create_database_entry` | create entry -> query_database filtered to marker -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:archive_page` | create -> archive -> get_page (archived == true, + marker on title) -> no cleanup | archived (left) | `LIVE_PASS_LEFT_ARTIFACT` |
| `notion:restore_page` | create -> archive -> restore -> get_page (archived == false, + marker on title) -> **archive** | archived (persists) | `LIVE_PASS_LEFT_ARTIFACT` |
| `google-drive:create_folder` | create folder (root) -> get_file_metadata (marker on name) -> **permanent delete** | object deleted | `LIVE_PASS_CLEANED` |
| `google-drive:upload_file` | upload inline file (root) -> get_file_metadata (marker on name) -> **permanent delete** | object deleted | `LIVE_PASS_CLEANED` |
| `google-drive:delete_file` | create folder -> **delete (trash)** -> get_file_metadata (trashed == true) -> **permanent delete** | object deleted | `LIVE_PASS_CLEANED` |
| `google-drive:move_file` | create target folder + upload movable file -> move file into target -> get_file_metadata (marker on name + parents contains target) -> **permanent-delete both** | both deleted | `LIVE_PASS_CLEANED` |
| `dropbox:create_folder` | create folder (root) -> get_file_metadata (marker on name + isFolder) -> **delete** | deleted to trash (recoverable ~30d) | `LIVE_PASS_CLEANED` |
| `dropbox:delete_file` | create folder -> **delete (action under test)** -> path_metadata existence probe (exists == false) | deleted to trash (recoverable ~30d) | `LIVE_PASS_CLEANED` |
| `dropbox:upload_file` | upload staged file (v2_storage FileRef) -> get_file_metadata (marker on name + isFolder == false) -> **delete** | deleted to trash (recoverable ~30d) | `LIVE_PASS_CLEANED` |
| `dropbox:copy_file` | upload smoke source -> copy to distinct marker path -> get_file_metadata (marker+suffix "copy" on name + isFolder == false) -> **delete both (source + copy)** | both deleted to trash (recoverable ~30d) | `LIVE_PASS_CLEANED` |
| `dropbox:move_file` | upload smoke source -> move to distinct marker path (re-capture same ledger key) -> get_file_metadata (marker+suffix "moved" on name + isFolder == false) -> **delete** | deleted to trash (recoverable ~30d) | `LIVE_PASS_CLEANED` |
| `microsoft-onedrive:create_folder` | create folder (root) -> get_file (marker on name + kind == folder) -> **delete** | deleted to recycle bin (recoverable) | `LIVE_PASS_CLEANED` |
| `microsoft-onedrive:delete_item` | create folder -> **delete (action under test)** -> item_metadata existence probe (exists == false) | deleted to recycle bin (recoverable) | `LIVE_PASS_CLEANED` |
| `microsoft-onedrive:upload_file` | upload inline file (root) -> get_file (marker on name + kind == file) -> **delete** | deleted to recycle bin (recoverable) | `LIVE_PASS_CLEANED` |
| `microsoft-onedrive:move_item` | upload smoke source + create smoke dest folder (file captured before folder) -> atomic move+rename into folder -> get_file (marker+suffix "moved" on name + kind == file + parentReference.id == smoke folder) -> **delete both (file then folder)** | both deleted to recycle bin (recoverable) | `LIVE_PASS_CLEANED` |
| `microsoft-onedrive:copy_item` | create smoke folder + upload smoke source into it -> copy into the same folder (async: returns `status:"pending"` + monitorUrl) -> **completeAsync** polls the trusted Graph monitor URL to terminal completion + captures the copied item's real `resourceId` -> get_file (marker+suffix "copy" on name + kind == file + parentReference.id == smoke folder) -> **delete all three (folder cascade + idempotent-404 reconcile)** | all three deleted to recycle bin (recoverable) | `LIVE_PASS_CLEANED` |
| `microsoft-onenote:create_page` | create marker-titled page in a smoke/test-named section -> get_page_content (marker on title) -> **delete_page** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `microsoft-onenote:update_page` | create smoke page -> append `<marker>updated` -> get_page_content (marker+suffix "updated" on content) -> **delete_page** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `microsoft-onenote:delete_page` | create smoke page -> **delete_page (action under test)** -> smoke `page_metadata` existence probe (exists == false) | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-calendar:create_event` | create event (primary, no attendees, no-notify) -> events.get (marker on summary) -> **delete_event** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-calendar:update_event` | create event -> update summary to marker+"updated" -> events.get (marker+"updated" on summary) -> **delete_event** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-calendar:delete_event` | create event -> **delete_event (action under test)** -> events.get existence probe (exists == false) | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-docs:create_document` | create doc (marker title) -> get_document (marker on title) -> **google-drive:delete_file (cross-provider, permanent)** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:create_spreadsheet` | create whole spreadsheet (marker title) -> get_sheet_metadata (marker on title) -> **google-drive:delete_file (cross-provider, permanent)** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:update_cell` | create smoke spreadsheet (pinned 'Data') -> update Data!A1=marker (RAW) -> get_cell_value A1 (marker+suffix on value) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:append_row` | create smoke spreadsheet (pinned 'Data') -> append [marker,…] to empty sheet (row 1) -> get_cell_value A1 (marker+suffix on value) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:update_row` | create smoke spreadsheet + seed A1=marker-seed -> update A1:B1=marker-updated -> get_cell_value A1 (marker+suffix "updated", seed would fail) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:clear_range` | create smoke spreadsheet + seed A1=marker-seed -> clear Data!A1 -> get_cell_value A1 (`expectEmpty` value present-and-empty/null) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:format_range` | create smoke spreadsheet + seed A1 -> format A1 bold:true -> smoke `cell_format` read-back (bounded userEnteredFormat; `bold == true`) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:batch_update` | create smoke spreadsheet -> ONE-entry batch write Data!A1=marker (RAW) -> get_cell_value A1 (marker+suffix "batch" on value) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `google-sheets:delete_row` | create smoke spreadsheet + seed A1/A2/A3 markers -> delete row 2 -> `verifyAll` 3 reads (A1==keep-before, A2==keep-after shifted up, A3 empty -> pins row 2) -> **google-drive:delete_file (cross-provider, permanent)** | whole sheet hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `microsoft-outlook-calendar:create_event` | create event (default cal, no attendees, no-RSVP) -> events.get (marker on subject) -> **delete_event** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `microsoft-outlook-calendar:update_event` | create event -> update subject to marker+"updated" -> events.get (marker+"updated" on subject) -> **delete_event** | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |
| `microsoft-outlook-calendar:delete_event` | create event -> **delete_event (action under test)** -> events.get existence probe (exists == false) | hard-deleted (true erase) | `LIVE_PASS_CLEANED` |

**Google Drive write coverage (SMOKE-WRITE-17/18) — COMPLETE (4 of 4 write actions).**
`create_folder`, `upload_file`, `delete_file`, `move_file` all certified. Smoke-owned
(My Drive root, no target discovery), verified by INDEPENDENT `get_file_metadata`
read-back (marker on `name`; `trashed == true` for the trash side effect;
`parents` contains the captured target for a move — never the handler echo, whose
`name`/`trashed` fall back to input), permanently deleted on cleanup. `upload_file`
uses inline `content` (no FileRef/staging). SMOKE-WRITE-18 added `parents` to
`get_file_metadata` output (bounded, non-sensitive folder ids) + ledger-token
resolution in verify assertions (so an assertion can compare against a captured id,
e.g. the move target), and used `cleanupEach` to delete both smoke resources.

**Dropbox write coverage (SMOKE-WRITE-19/20) — folder/upload/delete batch.**
`create_folder`, `delete_file`, `upload_file` all `LIVE_PASS_CLEANED` (copy/move added later in
SMOKE-WRITE-25, below; sharing/link/download still deferred). Smoke-owned at the
Dropbox root, verified by INDEPENDENT read-back (`get_file_metadata` marker on `name` +
`isFolder`; for `delete_file` a smoke-only `path_metadata` existence probe asserting
`exists == false`, mapping a TYPED `NotFoundError` so a permission error never reads as
deleted). `upload_file` consumes a FileRef, so bytes are staged in OUR `workflow-files`
bucket as a `v2_storage` FileRef (self-contained — never an invented URL). HONESTY: Dropbox
`delete` moves to TRASH (recoverable ~30d); the object leaves the active namespace so it is
reported `cleaned`, with reversibility disclosed.

**Dropbox copy/move (SMOKE-WRITE-25) — `copy_file` + `move_file` certified `LIVE_PASS_CLEANED`.**
Each SETS UP its own smoke-owned source via `dropbox:upload_file` (staged `v2_storage` FileRef),
then relocates it. `copy_file` copies to a DISTINCT marker path and verifies the COPY via an
INDEPENDENT `get_file_metadata` read-back (marker + suffix `"copy"` on the persisted `name`, so it
cannot pass on the source name; `isFolder == false`), then deletes BOTH files via `cleanupEach`
(created 2 / cleaned 2). `move_file` moves to a DISTINCT marker path, re-capturing the new path
into the SAME ledger key (one physical file, current address — never a stale path), verifies via an
INDEPENDENT read-back (marker + suffix `"moved"`; `isFolder == false`), then deletes the one file.
Still deferred: `download_file`, `get_temporary_link`, `create_shared_link` (sharing/link/download
actions are out of scope for the no-send harness).

**OneDrive write coverage (SMOKE-WRITE-19/20) — folder/upload/delete batch.**
`create_folder`, `delete_item`, `upload_file` all `LIVE_PASS_CLEANED` (`move_item` added later in
SMOKE-WRITE-26, below; `copy_item` blocked async). Smoke-owned at the
drive root, verified by INDEPENDENT read-back (`get_file` marker on `name` + `kind`; for
`delete_item` a smoke-only `item_metadata` probe asserting `exists == false` via a typed 404
`NotFoundError`). `upload_file` takes INLINE content (utf8/base64) — no FileRef, no staging.
HONESTY: OneDrive `delete_item` moves to the RECYCLE BIN (recoverable); reported `cleaned`
with reversibility disclosed.

**OneDrive move/copy (SMOKE-WRITE-26/33) — `move_item` AND `copy_item` both `LIVE_PASS_CLEANED`.**
`move_item` is `LIVE_PASS_CLEANED`: setup uploads a smoke-owned source file (INLINE content, no
FileRef) AND creates a smoke-owned destination folder — the FILE is captured BEFORE the FOLDER so
`cleanupEach` deletes the moved child before its parent (deleting the folder first would recursively
remove the file inside, and the follow-up delete would 404 -> CLEANUP_FAILED). Execute performs an
ATOMIC move + rename into the smoke folder in one Graph PATCH (the driveItem id is STABLE across a
move, so the moved id re-captures into the same key). Verified by an INDEPENDENT `get_file` read-back
proving THREE things the handler echo cannot: marker + suffix `"moved"` on the persisted `name`
(rename landed), `kind == "file"`, and `parentReference.id == {{ledger.folder.id}}` (the move landed
in OUR smoke folder, compared against the captured folder id — never an input echo). Both items are
deleted (file then folder). **`copy_item` — async blocker RESOLVED + LIVE-VERIFIED (SMOKE-WRITE-33)
via unblock option (b): a harness extension that captures a seam-discovered id into the cleanup
ledger.** The production handler is UNCHANGED — it still returns `{status:"pending", monitorUrl}` and
does NOT poll (Slice 8 V1-rot fix; `status:"pending"` is the honest "copy initiated" contract). The
write harness gained a `completeAsync` phase: after execute it reads the TRUSTED monitor URL from the
execute output (`monitorUrlPath`), polls it to TERMINAL completion via a bounded, smoke-only read-back
seam (`microsoft-onedrive:copy_monitor` — capped attempts + total duration + capped backoff;
unauthenticated status read), and captures the completed copy's Graph `resourceId` into the ledger as
the smoke-owned `copy`. **Trusted-URL gate (live-corrected):** the real OneDrive copy monitor URL is
NOT on `graph.microsoft.com` but on a Microsoft operation host (consumer OneDrive observed live on
`*.svc.ms`; OneDrive for Business on `*.sharepoint.com`). The gate accepts the exact Graph base host OR
an HTTPS URL on a NARROW, evidence-justified operation host — only `*.svc.ms` (observed live) and
`*.sharepoint.com` (OneDrive-for-Business copy-monitor contract). Provenance (the URL came from Graph's
own authenticated 202 `Location` header) is the primary trust; the host allow-list is defense-in-depth
so a non-Microsoft URL is never fetched. Broad `*.microsoft.com` / `*.onedrive.com` / `*.live.com`
grants were deliberately NOT included (no concrete evidence they are used — add a suffix only with a
live observation or a documented contract). A refused URL surfaces its HOST (a public domain, never
path/token) for diagnosability. So the copy is identifiable (real id, not marker-discovery), independently VERIFIABLE
(an authenticated `get_file` read-back proving name marker+suffix `"copy"`, `kind == "file"`, and
`parentReference.id == {{ledger.folder.id}}`), and CLEANABLE: `cleanupEach` deletes folder + source +
copy. The folder is captured first (it must exist before the source uploads into it / the copy targets
it), so it is deleted first and cascades its children to the recycle bin; the per-child deletes then
hit 404 and OneDrive `delete_item` is IDEMPOTENT on 404 (`alreadyMissing:true`), so all three reconcile
as cleaned (0 leaked). A missing monitor URL / poll failure / timeout / no resulting id is
`VERIFY_FAILED` — the run never proceeds with an uncaptured resource, and because any copy that DID land
sits inside the smoke folder, the folder-delete cascade still removes it (no leak). **Live results:**
the success run was `created 3 / cleaned 3 / 0 leaked`; an earlier run with the too-strict gate
exercised the failure path live (`copy_monitor: refused untrusted monitor URL` -> VERIFY_FAILED) and
still cleaned folder+source with `0 leaked`. Now `LIVE_PASS_CLEANED`. Tests:
`tests/unit/smoke-actions/async-copy-poll.test.ts` (pure poller + URL gate) +
`tests/unit/smoke-actions/onedrive-copy-item.test.ts` (orchestration, all failure paths assert 0 leaked).

**OneNote write coverage (SMOKE-WRITE-32) — page lifecycle (`create_page` / `update_page` /
`delete_page` certified).** The smoke-owned resource is the PAGE (created + HARD-deleted; Graph
DELETE is a true erase); the SECTION is a borrowed container. The live test's
`discoverOneNoteSmokeSection` returns a section ONLY when its section OR notebook name is
smoke/test-named (`/smoke|test/i`), so the harness never writes into the user's real notebook —
absent one, the fixtures are BLOCKED_ENV. `create_page` verifies the marker on the persisted
`title` via INDEPENDENT `get_page_content`; `update_page` appends `<marker>updated` and verifies it
on the rendered `content` (the seeded body lacks "updated", so a no-op fails); `delete_page` is
`executeIsCleanup` with absence proven by the bounded smoke-only `page_metadata` probe
(`exists == false` via a typed 404 NotFoundError; any other error re-throws). Every engine step
threads the required `notebookId` + `sectionId` cascade parents (the metas mark them required for
readiness even though the handlers ignore them). **Still BLOCKED:** `create_section` /
`create_notebook` (no registered delete-section/delete-notebook action -> a created section/notebook
would persist as a heavy visible artifact); `copy_page` (creates a second page — certifiable later
via the same delete_page cleanup, deferred from this batch).

**Google Calendar write coverage (SMOKE-WRITE-21) — 3 of 4 write actions certified.**
`create_event`, `update_event`, `delete_event` all `LIVE_PASS_CLEANED`. Each is smoke-owned on
the user's PRIMARY calendar with NO attendees and `sendNotifications: "none"` (zero
invites/notifications leave the account) and no Google Meet. Verified by INDEPENDENT read-back
via the bounded, refresh-safe `google-calendar:events_get` smoke reader (returns only
`exists`/`summary`/`status`): create/update prove the marker on the persisted `summary` (update
requires the `"updated"` suffix, so a no-op patch fails); `delete_event` asserts `exists == false`,
mapping a typed 404 `NotFoundError` OR `status == "cancelled"` to gone while RE-THROWING any
other error (a permission/API failure can never read as deleted). The handler `summary` outputs
fall back to config, so they are never used for verification. Calendar `events.delete` is a TRUE
hard erase (gone, not trash/recycle). **Deferred: `add_attendees`** — it generates guest
invitations (send-like / invite-generating), so it is out of scope for the no-send smoke harness.

**Cross-provider cleanup policy (SMOKE-WRITE-23).** Some providers create a resource that
genuinely lives in a SIBLING provider's namespace within the SAME account family and have NO
own delete action. The canonical case: a Google Doc / Google Sheet IS a Google Drive file, so
its `documentId` / `spreadsheetId` is a Drive file id and the certified
`google-drive:delete_file` is the correct teardown. The write harness ALLOWS a `cleanup` /
`cleanupEach` step whose `provider` differs from the fixture's provider ONLY when the fixture
declares `crossProviderCleanup: true` in its `writeHarness` spec — otherwise the harness REFUSES
the cleanup (so a typo'd provider can never silently fire a destructive call at the wrong API).
The smoke-owned guard is unchanged: cleanup may only target a `{{ledger.<key>.id}}` this run
created, so cross-provider cleanup can NEVER touch a pre-existing foreign file. The ledger records
the CREATING provider per entry; the cleanup step records the cleanup provider, keeping the
disposition honest. Enforced in `runWriteSmoke` (both cleanup branches) and covered by
`write-harness.test.ts` ("cross-provider cleanup must be explicitly declared"). This is an
EXPLICIT, opt-in mechanism — not an implicit "it happens to work because the harness doesn't
check provider" hack.

**Google Docs write coverage (SMOKE-WRITE-23) — `create_document` certified.**
`create_document` is `LIVE_PASS_CLEANED`: create a marker-titled doc in My Drive root -> verify
the marker on the PERSISTED `title` via an INDEPENDENT `get_document` read-back (the create
`title` output falls back to config, so it is never used for verification) -> tear down via
cross-provider `google-drive:delete_file` (permanent). Smoke-owned, hard-deleted. Google Docs has
no own delete action; the cross-provider policy above is what makes this safe. Deferred:
`update_document` (same pattern, follow-up), `export_document` (read-ish, no artifact),
`share_document` (sharing — out of scope).

**Google Sheets write coverage — COMPLETE (8 of 8 write actions, SMOKE-WRITE-23/27/28/29/30/31).**
`create_spreadsheet` is `LIVE_PASS_CLEANED`: create a WHOLE marker-titled spreadsheet -> verify
the marker on the PERSISTED spreadsheet `title` via an INDEPENDENT `get_sheet_metadata` read-back
-> tear down via cross-provider `google-drive:delete_file` (permanent). Creating + deleting a
whole smoke-owned spreadsheet is the key — it makes the "shared sheet / positional row" worry moot,
because every mutator now runs inside its OWN freshly-created smoke spreadsheet (pinned sheet
"Data") and the whole artifact is deleted afterwards. On that foundation the row/range mutators
were all certified: `update_cell` / `append_row` / `update_row` / `batch_update` (independent
`get_cell_value` read-back of the live cell, marker+suffix; `batch_update` is a TYPED value write,
not a raw `requests[]` passthrough), `clear_range` (seed then `expectEmpty`), `format_range` (seed
then bounded smoke-only `cell_format` read-back proving `bold == true`), and `delete_row` (seed
A1/A2/A3 then the `verifyAll` row-shift proof: A1 kept, A2 == old A3 shifted up, A3 empty — pins
exactly which row was deleted). No Google Sheets action is deferred.

**Microsoft Outlook Calendar write coverage (SMOKE-WRITE-24) — 3 of 4 write actions certified.**
`create_event`, `update_event`, `delete_event` all `LIVE_PASS_CLEANED` — a direct mirror of the
google-calendar set. Each is smoke-owned on the user's DEFAULT calendar with NO attendees and
`responseRequested: false` (zero invitations leave the account). Verified by INDEPENDENT read-back
via the bounded, refresh-safe `microsoft-outlook-calendar:events_get` smoke reader (returns only
`exists`/`subject`): create/update prove the marker on the persisted `subject` (update requires the
`"updated"` suffix, so a no-op patch fails); `delete_event` asserts `exists == false` via a typed
404 `NotFoundError` while re-throwing any other error. The handler `subject` outputs fall back to
config, so they are never used for verification. Graph `delete_event` is a TRUE erase. **Fixtures
use the FLAT builder field names** (`startDateTime`/`endDateTime`/`startTimeZone`/`endTimeZone`),
not the nested `{start,end}` API shape — the engine readiness gate checks the meta's required
field names, so a nested-shape config fails `WORKFLOW_NOT_READY / MISSING_REQUIRED_FIELDS` even
though the Zod schema would accept it (the schema preprocess normalizes flat→nested for the
handler). **Deferred: `add_attendees`** — generates guest invitations (send-like).

**Next-cluster safe-write inventory (SMOKE-WRITE-22 audit — no safe cluster this slice).**
After the file-provider + Calendar batches, the remaining non-send/non-billing candidates
were each evaluated for a clean create -> independent read-back -> smoke-owned cleanup loop;
none is currently certifiable:
- **HubSpot — BLOCKED (no cleanup).** `create_contact`/`company`/`deal`/`ticket`/`note`/
  `task`/`call`/`meeting`/`product`/`line_item` exist, but there is NO registered
  delete/archive action for any created CRM object (`remove_line_item` / `remove_from_list`
  are association removals, not object deletion). A created object would persist -> not
  smoke-safe. Needs a delete/archive action first.
- **Monday — BLOCKED (not connected).** 24 registered actions, 0 `LIVE_PASS`, all reads
  `NOT_RUN` (the Tier-1 auto-discovery sweep certified other Tier-2 providers' reads but
  none for Monday) -> the smoke account has no usable Monday connection. Also needs a
  smoke/test board target. Revisit once Monday is connected.
- **Google Sheets — `create_spreadsheet` (SMOKE-WRITE-23) + `update_cell`/`append_row`/
  `update_row` (SMOKE-WRITE-27) + `clear_range` (SMOKE-WRITE-28) + `format_range`
  (SMOKE-WRITE-29) + `batch_update` (SMOKE-WRITE-30) certified.** The whole-spreadsheet create + cross-provider Drive delete
  makes the "mutate a SHARED sheet" worry moot: each mutator creates its OWN smoke
  spreadsheet (pinned sheet "Data"), mutates only that sheet at a FIXED address, verifies
  INDEPENDENTLY, then deletes the whole sheet. `update_row` seeds a distinct prior value to
  prove the overwrite landed; `clear_range` seeds A1 then proves it is present-and-empty
  (the `expectEmpty` primitive: null/undefined/""/[]; a MISSING path never vacuously passes;
  a read-back error fails the step); `format_range` seeds A1 then proves `bold == true` via a
  NEW bounded smoke-only `cell_format` read-back (`cellFormatGet`: a `spreadsheets.get` with
  `includeGridData` on the SINGLE smoke cell + a tight `fields` mask returning ONLY
  `userEnteredFormat` sub-fields — no cell values/payload/PII — sanitized to scalars, run
  through `refreshAndRetry`; a fresh cell reads `bold:null`, so only a real format passes).
  `batch_update` (SMOKE-WRITE-30) is NOT a raw `requests[]` passthrough (V1's raw mode is
  rejected at parse time) — it is a TYPED multi-range value write, so a single one-cell update
  entry is an `update_cell` through the batch path, proven by the same `get_cell_value`
  read-back. `delete_row` (SMOKE-WRITE-31) closes Sheets: positional deletion is only
  ambiguous on a SHARED sheet — inside a same-run spreadsheet we seed (A1/A2/A3 markers),
  deleting row 2 produces a DETERMINISTIC shift, proven by the new `verifyAll` primitive
  (three independent `get_cell_value` reads: A1 kept, A2 == old A3 shifted up, A3 empty,
  which together pin exactly which row was removed). **Google Sheets is now fully covered —
  no deferred actions.** See the Google Sheets write-coverage note above.
- **Google Docs — RESOLVED in SMOKE-WRITE-23 (`create_document` certified).** The cross-provider
  cleanup policy was adopted (a Doc's `documentId` IS its Drive file id, torn down via the
  certified `google-drive:delete_file`). See the cross-provider cleanup policy + Google Docs
  write-coverage notes above. `share_document` stays out of scope (sharing).
- **Mailchimp — BLOCKED (contacting/heavy-artifact risk).** `add_subscriber` touches a real
  audience member; `create_audience`/`create_segment` create heavy artifacts with no safe
  registered cleanup. No create -> verify -> delete loop without subscriber-contact or
  un-deletable-artifact risk.

**Remaining Trello / Notion write actions — DEFERRED (exact blockers, SMOKE-WRITE-16).**
Every registered Trello/Notion write action NOT in the matrix above is blocked by a
missing cleanup path or missing independent verification — not by connection health.
Inventory (action · blocker):
- `trello:create_board` — no registered archive/delete-board action exists (only
  `create_board`). The harness cleanup runs a REGISTERED action against a ledger
  resource; with none, a created board persists VISIBLY (heavy artifact, accumulates
  per run). Deferred until a board-archive action exists (or a justified smoke-only
  mutation-cleanup seam).
- `trello:create_list` — same shape: `integrations/trello/api/lists.ts` exposes only
  `listsCreate` (no list-update/archive wrapper) and no registered list-archive
  action, so a created list persists visibly on the smoke board. Deferred.
- `notion:create_database` — DOUBLY blocked: (1) **cleanup** — `archive_page`
  (`pages.update archived:true`) CANNOT archive a database id (Notion returns
  "Could not find page"), and there is no registered archive-database action, so a
  created database persists visibly under the parent page (heavy artifact); (2)
  **verification** — Notion `POST /v1/search` is eventually-consistent (a probe found
  a freshly-created database is NOT returned immediately), and there is no
  `get_database` read action, so the only available proof would be the handler echo
  (disallowed). Deferred until both a database-archive action and an independent
  database read exist.

These are coverage limits of the registered action set, not smoke gaps: forcing them
would require echo-only verification and/or leave heavy visible artifacts.

**Cleaned vs artifact (cleanup posture).** A fixture's `cleanupKind` decides both
whether cleanup is required and how a leftover reads:
- `"delete"` — REQUIRED. Success -> `artifact: "cleaned"` (object gone) ->
  `LIVE_PASS_CLEANED`. Failure -> `CLEANUP_FAILED` (gate FAIL).
- `"archive"` — BEST-EFFORT (provider has no hard delete). Success ->
  `artifact: "archived"` (object persists, reversible). Failure -> `artifact:
  "left"`, still PASS. Both -> `LIVE_PASS_LEFT_ARTIFACT`.
- no cleanup -> `artifact: "left"` (intentional). On a throwaway smoke account a
  harmless marked leftover is NOT a "leak"; the report says `artifact: left`, and
  the `remaining` count only flags a cleanup-REQUIRED failure.

Smoke targets auto-discover per provider: Trello picks a list whose board AND list
are both explicitly smoke/test-named (`pickSmokeSafeTarget`); Notion picks a
smoke-named parent page (else the first accessible page on the throwaway account);
Airtable uses the env-pinned smoke base/table and AUTO-DISCOVERS the table's
primary text field (`discoverAirtableSmokeTextField`, via `refreshAndRetry`), with
`SMOKE_AIRTABLE_TEXT_FIELD` as an optional override.

**Marker verification (not existence-only).** Every pilot proves the unique
`crsmoke-<runToken>` marker is actually on the persisted resource:
- Airtable / Trello — `markerEchoPath` reads the create/update **response** (the
  provider echoes the stored field/name), confirming the marker round-tripped.
- Notion — `create_page`'s response omits the title, so the verify step reads the
  page back with `get_page` and a `markerPath: "title"` check (the harness's
  read-back marker verification). `get_page` gained a bounded top-level `title`
  output (the value of the title-type property) so this never spreads a raw Notion
  property blob. A verify step's `markerPath` is the general way to confirm a
  marker from a READ response rather than the write response.
- A verify `markerPath` is **array-aware**: it confirms the marker in a scalar
  (`get_page.title`) OR a collection (`get_block_children.blocks`,
  `list_comments.comments`) by checking the JSON-serialized value at the path. The
  unique `crsmoke-<runToken>-` marker can't collide with a provider id, so a
  substring hit is a true match. This is how the Notion content batch
  (`update_page`, `append_block_children`, `create_comment`) proves the marker on
  the persisted page / block / comment, not just that the id exists.
- **Smoke-only read-back seam** (`smokeRead: true` on a verify step) — for a
  provider with NO user-facing read action to verify against, the harness routes
  the verify to `WriteHarnessDeps.smokeReadBack` (a bounded, READ-ONLY provider
  call, never the engine/write path), then applies `markerPath`. `trello:add_comment`
  uses it: Trello has no comment-read action, so verification does an independent
  `GET /1/cards/{id}/actions?filter=commentCard` (`cardsListComments`) and confirms
  the marker in the PROVIDER-persisted comment text. This is what closed the
  add_comment weak-verification gap — its own response echoed the input, so the
  smoke must read the comment back independently. A missing seam fails the verify
  loud; it never silently routes an unknown action to the engine.
- **Seam refresh invariant (SMOKE-WRITE-13).** Every smoke-only discovery /
  read-back seam that hits a provider HTTP API MUST wrap the call in
  `refreshAndRetry` (same path as the action handlers + option resolvers) — never
  a raw `decryptToken(...)` + direct wrapper call. A raw call against a refreshable
  provider's short-lived token 401s and falsely reports `BLOCKED_ENV` (the
  Airtable SMOKE-WRITE-11/12 bug). All seams (Airtable record/schema, Trello
  card/comments, Notion database search) are on the refresh path; the resolver-based
  Trello/Notion discovery seams inherit it from the resolvers. Enforced by
  [`tests/unit/smoke-actions/seam-refresh-guard.test.ts`](../../tests/unit/smoke-actions/seam-refresh-guard.test.ts)
  (fails if a seam decrypts a token or calls a provider wrapper outside `refreshAndRetry`).

**Connection diagnosis (4-way, never conflate target with connection).** A provider
is classified `NOT_CONNECTED` (only when the DB proves it) / `CONNECTED_NOT_EXECUTABLE`
(a PERSONAL credential connected by a co-member, not the smoke user) /
`BLOCKED_NO_TARGET` (connected + executable but no safe smoke target) / `READY`.
`probeWriteConnection` is credential-class-aware: PERSONAL providers (trello,
airtable, gmail, …) require the smoke user to be the connector; ACCOUNT providers
(notion, slack, …) are account-shared. A missing smoke target is `BLOCKED_ENV`,
**never** "not connected" (the SMOKE-WRITE-2 Trello bug). Safe-target discovery
(`pickSmokeSafeTarget`) only chooses a list whose board AND list are explicitly
smoke/test-named — never an arbitrary first board/list.

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

> **Live verification (2026-06-22):** first attempt with field `Name` was rejected
> by Airtable (`Unknown field name`), which safely created NO record and skipped
> cleanup (empty ledger) — confirming the no-junk-on-failure guarantee. After
> setting `SMOKE_AIRTABLE_TEXT_FIELD='Draft Name'` (the base's primary field), the
> pilot passed end to end: created one `crsmoke-` record, confirmed the marker
> echoed + the record existed, deleted exactly that record. Ledger created 1 /
> cleaned 1 / leaked 0. Now certified `LIVE_PASS`.
>
> **Reconciliation (SMOKE-WRITE-12, current):** a later slice briefly reported
> Airtable as `BLOCKED_ENV` / "never live-run" — that was a HARNESS DISCOVERY bug,
> not a connection problem. Airtable OAuth tokens are short-lived; the new
> text-field auto-discovery (`discoverAirtableSmokeTextField`) and the
> `airtable:record` existence seam called the raw API wrappers WITHOUT
> `refreshAndRetry`, so they 401'd on a stale token and falsely read as blocked.
> The engine path (the actual create/update/delete handlers) always refreshes, so
> create/update genuinely passed in SMOKE-WRITE-4. Fix: both discovery + seam now
> wrap their reads in `refreshAndRetry` (mirroring the handlers). The
> `airtable:record` seam also switched from get-by-id to `recordsList` +
> `RECORD_ID()` because Airtable returns a CONFLATED 403 ("invalid permissions, or
> the requested model was not found") for a deleted record — get-by-id can't tell
> "deleted" from "no access", but a successful list proves access and the record's
> absence proves deletion. All three Airtable writes re-verified `LIVE_PASS` against
> base/table `Design Drafts` (primary text field "Draft Name", auto-discovered).

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

**Multi-resource fixtures (SMOKE-WRITE-14).** An action that creates MANY resources
(e.g. `create_multiple_records`) uses array capture + per-id fan-out:
- `captureResource: { resourceKey: "record", idsPath: "records", idField: "id" }`
  records EACH created id under a derived key `record0` / `record1` / … (referenced
  later by index, e.g. `{{ledger.record0.id}}`).
- `verifyEach` runs a verify template ONCE PER captured id, binding `{{each.id}}` to
  each id; every record's INDEPENDENT read-back must satisfy the assertions or the
  run is `VERIFY_FAILED`. `markerSuffix` lets it prove a SPECIFIC value (e.g. an
  update writes `…-updated`, so `markerSuffix: "updated"` rejects a still-"seed" record).
- `cleanupEach` deletes EVERY captured id. **Partial cleanup is never PASS_CLEANED** —
  any failed delete leaves a leaked record and (delete-kind) flips to `CLEANUP_FAILED`.
  Single-resource (`idPath` / `verify` / `cleanup`) fixtures are unchanged.

**Attachment / transformed-side-effect verification (SMOKE-WRITE-15).** Some writes
produce content the provider TRANSFORMS, so the smoke marker can't survive — e.g.
`airtable:add_attachment` uploads a file and Airtable REHOSTS it (the URL/filename
we sent are replaced). The honest proof is `expectNonEmptyArray`: assert the read-back
field is a populated array whose every element carries a stable provider id
(`elementHasKey: "id"`), via the independent record seam — never the action's echo.
The file source is SELF-CONTAINED: the dev test stages a tiny PNG in OUR
`workflow-files` bucket and the fixture references it as a `v2_storage` FileRef (the
handler mints a short-lived signed URL Airtable fetches) — NO invented external URL.
The attachment field is auto-discovered (`discoverAirtableSmokeAttachmentField`, via
`refreshAndRetry`); `SMOKE_AIRTABLE_ATTACHMENT_FIELD` overrides it, and a missing
attachment field / unstaged file is `BLOCKED_ENV` (never a fake URL). The staged file
is removed in the dev test's `finally`; the smoke record is deleted by the fixture.

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

**Live status:** the real step deps are wired and per-provider write batches have
been run live under the four write gates. Airtable (`create_record`,
`update_record`, `delete_record`), Trello, and Notion write pilots are
live-certified (see the matrix + reconciliation note above). Airtable's primary
text field is auto-discovered (`discoverAirtableSmokeTextField`, via
`refreshAndRetry`); a `SMOKE_AIRTABLE_TEXT_FIELD` env pin still overrides it.

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
