# Runbook: Action smoke testing (CLI + harness)

A CLI-driven way to smoke test registered provider **actions** through real V2
internals instead of clicking every action in the builder UI. This is the
**first slice** — it proves the harness architecture with a small, representative
fixture set. It does **not** yet cover every provider/action.

Two cooperating pieces, split by runtime:

| Piece | Where | What it does | Runtime |
|---|---|---|---|
| **Dry-run inventory** | `chainreact smoke actions` | Lists which registered actions have fixtures, which are missing, which are skipped (and why). Offline, no execution. | Operator CLI (no app imports) |
| **Execution harness** | `tests/smoke-actions/` + `tests/integration/smoke-actions/run-all.smoke.test.ts` | Runs fixture-backed actions through the real strict resolver → real handler registry → real handler. | Jest (V2 server runtime) |

The split is deliberate: the offline CLI can't import the handler registry
(server-only + every provider client), so it reads the inventory as text; the
Jest harness imports the real registry and executes. A parity test
(`tests/unit/smoke-actions/registry-parity.test.ts`) guarantees the two never
drift.

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

### Execute fixture-backed actions (real V2 internals)

```bash
npm run smoke:actions:run        # jest tests/integration/smoke-actions tests/unit/smoke-actions
# or just the run-all smoke spec:
npm test -- tests/integration/smoke-actions
```

The run-all spec runs **every** fixture through the real path and **fails only on
a FAIL result** — `PASS` and `SKIP` are both acceptable (`SKIP` = "couldn't
safely run here", not "broken").

Safety model in an environment with no connected providers:

- The native `format_transformer` fixture has no `requiredEnv` → it **actually
  executes** (real resolver + real handler) and **passes**. This proves the
  execution path is real, not all skips.
- The Slack fixtures declare `requiredEnv` → they **SKIP** until you set the env
  for a throwaway smoke workspace:
  ```bash
  SMOKE_SLACK_CONNECTED=1 SMOKE_SLACK_CHANNEL=C0SMOKE npm test -- tests/integration/smoke-actions
  ```
  Only set these against a smoke account + throwaway channel — `write`/
  `destructive` fixtures post / mutate real Slack state.
- Destructive fixtures additionally need `includeDestructive` (wired into the
  harness API; the run-all spec leaves it off by default).

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

It deliberately does **not** stand up a full `WorkflowEngine.runWorkflow` (which
needs a persisted workflow row, billing, and run persistence). Driving a real
manual-run workflow + reading a terminal run state via the run readers is the
documented next increment (see Limitations).

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

## Limitations (first slice — honest scope)

- **Coverage is tiny by design:** 3 fixtures (native transform, Slack
  `list_channels`, Slack `send_channel_message`) + 1 destructive
  (`delete_message`). `npm run smoke:actions` shows the full gap (282 of 286
  registered actions have no fixture yet). This harness is the foundation for
  growing that, not a claim of broad coverage.
- **No full-engine run / run-status read yet.** Execution is the resolver +
  handler-dispatch core, not `WorkflowEngine.runWorkflow` + the `workflow_runs`
  readers. That integration is the next increment.
- **No live provider creds in CI.** Connected-provider fixtures SKIP unless their
  `SMOKE_*` env is set; only the native fixture executes by default.
- **Destructive fixtures never run by default** and require both
  `--include-destructive`/`includeDestructive` and their env.
