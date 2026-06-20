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
| other per-fixture `requiredEnv` | modes 2–4 | Each fixture declares the env it needs; any missing one SKIPs **before** workflow creation. |

If any required env/connection is missing, the fixture **SKIPs** (never FAILs),
before any workflow is created.

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

### Current fixtures (21)

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
| `slack:send_channel_message` | **write** | ✅ | `SMOKE_SLACK_CONNECTED`, `SMOKE_SLACK_CHANNEL_ID` | Posts a real message; needs the write gate. |
| `slack:delete_message` | **destructive** | ❌ | — | Non-liveSafe; never runs live. |

Coverage: **21 fixtures** (19 read / 1 write / 1 destructive), 20 `liveSafe`, across
5 providers (native, slack, airtable, google-sheets, google-drive). **Slack: 10
fixtures** (8 read / 1 write / 1 destructive); **Airtable: 5 fixtures** (all read);
**Google Sheets: 4 fixtures** (all read). The CLI prints a `Coverage:` line; `--json`
exposes it as `coverage`.

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

**Google Drive live read run** (`list_files` needs only a connected Drive — it lists
across My Drive, metadata only):

```bash
ALLOW_DB_INTEGRATION_TESTS=true ALLOW_LIVE_PROVIDER_SMOKE=true \
  SMOKE_ACCOUNT_ID=<uuid> SMOKE_USER_ID=<uuid> \
  SMOKE_GOOGLE_DRIVE_CONNECTED=1 \
  npm run smoke:actions:run:workflow:live
```

**Google Drive actions still uncovered / deferred (1 covered of 5 registered):**

- **The read surface is already fully covered.** `list_files` is the *only* registered
  read-only Google Drive action, and it has a fixture. V2 does not (yet) register a
  get-file-metadata, search-files, list-folder-contents, or permissions-list action — so
  there is nothing further to fixture in a read-only batch. Adding more Drive read
  coverage would first require **building** those read actions (a provider-action slice,
  not a smoke-fixture slice); the reserved selector env vars for that future work are
  `SMOKE_GDRIVE_FILE_ID` / `SMOKE_GDRIVE_FOLDER_ID` / `SMOKE_GDRIVE_QUERY`.
- The remaining 4 registered actions are **writes / destructive** and are out of scope
  for read-only batches: `upload_file`, `create_folder`, `move_file` (writes) and
  `delete_file` (destructive — never `liveSafe`). They are deferred for the same
  no-safe-cleanup reason as the Slack / Airtable / Sheets writes.

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

## Limitations (honest scope)

- **Coverage is still small:** **21 fixtures** (19 read / 1 write / 1 destructive)
  across 5 providers (Slack: 10, Airtable: 5, Google Sheets: 4) — `npm run smoke:actions`
  shows the full gap (265 of 286 registered actions have no fixture yet). This harness is
  the foundation for growing that, not a claim of broad coverage.
- **Workflow-run modes are dev-DB-gated.** They require `ALLOW_DB_INTEGRATION_TESTS`
  + Supabase service-role env + `SMOKE_ACCOUNT_ID`/`SMOKE_USER_ID` (mode 4 also
  needs `ALLOW_LIVE_PROVIDER_SMOKE`). Without them they SKIP — so CI exercises
  modes 1–2, not 3–4.
- **Live mode (4) is intentionally narrow.** Only `liveSafe` fixtures run — 20 today
  (19 read + 1 write). No `liveSafe` destructive fixture exists (and the validation
  test forbids one). Selector-dependent reads (`get_user_info`, `get_thread_messages`,
  `get_file_info`, and the non-Slack reads) only run when their id/connection env is
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
