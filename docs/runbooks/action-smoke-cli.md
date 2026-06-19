# Runbook: Action smoke testing (CLI + harness)

A CLI-driven way to smoke test registered provider **actions** through real V2
internals instead of clicking every action in the builder UI. This is the
**first slice** — it proves the harness architecture with a small, representative
fixture set. It does **not** yet cover every provider/action.

Three modes, split by runtime:

| Mode | Where | What it does | Runtime |
|---|---|---|---|
| **1. Dry-run inventory** | `chainreact smoke actions` | Lists which registered actions have fixtures, which are missing, which are skipped (and why). Offline, no execution. | Operator CLI (no app imports) |
| **2. Handler-dispatch smoke** | `tests/smoke-actions/` + `tests/integration/smoke-actions/run-all.smoke.test.ts` | Runs fixture-backed actions through the real strict resolver → real handler registry → real handler. Fast; no workflow / DB. | Jest (V2 server runtime) |
| **3. Full workflow-run smoke** | `tests/smoke-actions/workflowRun*.ts` + `tests/integration/smoke-actions/run-all.workflow.dev.test.ts` | Persists a minimal `{native:manual.run → action}` workflow, runs it via the same `enqueueRun` the run-now route uses, and asserts the persisted `workflow_runs` row reached a terminal state. | Jest + a real dev DB (gated) |

The split is deliberate: the offline CLI can't import the handler registry
(server-only + every provider client), so it reads the inventory as text; the
Jest harness imports the real registry and executes. A parity test
(`tests/unit/smoke-actions/registry-parity.test.ts`) guarantees the two never
drift.

**When to use which:**
- **Inventory** — see the coverage gap; CI/pre-push gate on fixture validity. Always safe, always offline.
- **Handler-dispatch** — cheapest contract smoke for a provider/action. Proves resolve→handler→classify without standing up a workflow or DB. Default for "does this action's handler behave".
- **Workflow-run** — highest fidelity: proves the action runs through the real manual run-now path and produces a terminal persisted run. Needs a dev DB; use before trusting an action end-to-end.

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

## Commands

### Dry-run inventory

```bash
npm run smoke:actions                         # all providers
npm run smoke:actions -- --provider slack     # one provider
npm run smoke:actions -- --json               # machine-readable JSON
npm run smoke:actions -- --changed            # scope to the local git diff
npm run smoke:actions -- --include-destructive  # show destructive fixtures as runnable

# equivalent direct form
npm run chainreact -- smoke actions [--provider <id>] [--all] [--json] [--changed] [--include-destructive]
```

- Exit `0` when every fixture is well-formed; exit `1` when any fixture is
  malformed or mis-classified (suitable for a pre-push hook / CI gate).
- `--changed` maps a changed fixture file to its exact action and a changed
  handler file (`integrations/<provider>/actions/...`) to that whole provider.
  Falls back to the full inventory if git is unavailable.
- The CLI **never executes** anything (its standing charter).

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

JSON output (`renderExecutionJson`) carries `kind`, `mode` (`handler`|`workflow`),
`ok`, totals, and per-result `provider`/`action`/`outcome`/`reason`/`runId`/
`workflowId`.

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

Mode 3 (workflow-run) goes the rest of the way: it stands up a real persisted
workflow and drives `enqueueRun` (the service the run-now route calls), so the
**full** `WorkflowEngine.runWorkflow` path runs and writes a `workflow_runs` row.
The harness orchestrator (`tests/smoke-actions/workflowRun.ts`) is pure over
injected seams (`createSmokeWorkflow`/`runManualAndAwait`/`readRun`/`cleanupSmokeWorkflow`),
so it unit-tests with fakes; the real wiring lives in `workflowRunDeps.ts` and runs
only in the gated dev test.

## Adding the next fixtures

Good low-risk candidates already registered in V2:

- More `native` pure actions (`http_request` is read-ish but hits the network —
  gate it on a `requiredEnv` sentinel).
- Read actions on stable providers once a smoke connection exists: Airtable
  `list_records` / `get_base_schema`, Google Sheets `read_rows`, Slack
  `get_channel_info`.
- Pair each `write` fixture with a throwaway target (smoke channel, smoke base).

For each: add the fixture file, register it in `fixtures.ts`, run
`npm run smoke:actions` to confirm it shows as fixture-backed, and
`npm run smoke:actions:run` to confirm PASS/SKIP.

## Limitations (honest scope)

- **Coverage is tiny by design:** 3 fixtures (native transform, Slack
  `list_channels`, Slack `send_channel_message`) + 1 destructive
  (`delete_message`). `npm run smoke:actions` shows the full gap (282 of 286
  registered actions have no fixture yet). This harness is the foundation for
  growing that, not a claim of broad coverage.
- **Workflow-run mode is dev-DB-gated.** It requires `ALLOW_DB_INTEGRATION_TESTS`
  + Supabase service-role env + `SMOKE_ACCOUNT_ID`/`SMOKE_USER_ID`. Without them
  it SKIPs (never fails) — so CI exercises modes 1–2, not mode 3.
- **Workflow-run mode runs in engine test mode.** Native logic handlers execute
  for real; every external/destructive handler is blocked, so connected providers
  are **not** truly exercised end-to-end through a workflow yet. A `live: true`
  opt-in seam exists in the harness API but is off by default (it needs creds +
  task balance + a real provider call) — wiring a connected live workflow run is
  the next increment.
- **Workflow-mode fixtures must be self-contained.** The manual trigger payload is
  `{ inputs: {…} }`, so workflow mode sends empty inputs; fixtures that reference
  `{{trigger.payload.*}}` are authored for handler mode. The native fixture (literal
  config) is mode-agnostic and is the one that genuinely runs in mode 3 today.
- **Temporary smoke workflows are soft-deleted, not purged.** They accumulate as
  `state='deleted'` rows named `smoke:…` on the dev DB; periodic purge is manual.
- **Destructive fixtures never run by default** and require both
  `--include-destructive`/`includeDestructive` and their env.
