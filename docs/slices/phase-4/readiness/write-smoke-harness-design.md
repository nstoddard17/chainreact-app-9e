# Write / Destructive Action Smoke Harness — Design + Foundation

> **Status (2026-06-21):** Foundation landed (local, unpushed). Design contract +
> a pure, fully-unit-tested phase orchestrator (`tests/smoke-actions/writeHarness.ts`)
> + 3 gated pilot fixtures (authored, NOT run live) + 13 harness self-tests. No live
> provider mutation was performed by this slice. Broad write coverage (the 204
> uncovered actions) is deliberately NOT in scope here.

This is the safe-mutation companion to the read-smoke harness
([`../../../runbooks/action-smoke-cli.md`](../../../runbooks/action-smoke-cli.md)).
The read harness covers 93 read/native fixtures across 23 providers and is
live-verified. The remaining **204 registered actions have no fixture and are
overwhelmingly writes / destructive** (create / update / delete / send). This
document designs the harness that can eventually cover them **without leaving
provider junk, sending real messages unintentionally, charging customers,
deleting real data, or mutating production resources** — and lands the foundation
plus a tiny verified pilot path.

## 1. Executive summary

- **Go.** The existing harness already has the right bones: pure orchestrators
  over injected seams, env + double-gating, a certification matrix, and
  status-only reporting. Write/destructive coverage needs **three additions**:
  a per-fixture **setup -> execute -> verify -> cleanup** phase model, a
  **resource ledger** so cleanup only ever touches what the run created, and a
  **richer status taxonomy** (CLEANUP_FAILED / VERIFY_FAILED / SANDBOX_REQUIRED /
  UNSAFE_NO_HARNESS).
- **What is strong (do not regress):** the read path, the four run modes, the
  certification CERT-SKIP planner, the no-leak reporting (env NAMES only, sanitized
  reasons), and the "pure orchestrator + injected deps + fakes" test posture. The
  write harness is built the same way and folds into the same `ExecutionReport`
  gate, so none of the read path changes.
- **Real risks the design controls:** (1) orphaned provider resources on failure,
  (2) deleting a pre-existing record instead of a smoke-created one, (3) sends
  reaching a real inbox/channel, (4) billing side effects, (5) irreversible
  external actions with no cleanup.
- **What this slice does NOT do:** it does not author the 204 write fixtures, does
  not wire the real DB/engine seams for the phase model (designed + stubbed, same
  posture the read harness took before Marcus ran it live), and runs **zero** live
  mutations.

## 2. Current state (what the read harness gives us for free)

| Capability | Where | Reuse for writes |
|---|---|---|
| Pure orchestrator over injected seams + fakes | `tests/smoke-actions/workflowRun.ts` | The write orchestrator copies this shape exactly. |
| Risk + live-risk classes, double-gating | `contract.ts`, `core.ts` | The write `liveClass` taxonomy layers on top of `risk`/`liveRisk`. |
| Cleanup hook (best-effort, never flips verdict) | `WorkflowRunDeps.cleanupSmokeWorkflow` | Generalized to a per-resource ledger cleanup. |
| Certification matrix + CERT-SKIP planner | `scripts/chainreact/smoke/certification.ts` | New durable statuses `SANDBOX_REQUIRED` / `UNSAFE_NO_HARNESS`. |
| Status-only reporting, sanitized reasons | `core.ts` `sanitizeFailureReason`, `SmokeResult` | Write results fold down to the same `SmokeResult` for the gate. |
| Destructive guard (verb classifier) | `core.ts` `classifyObviouslyDestructive` | Unchanged; still forbids a `delete_*` fixture marked read/write. |

The single gap: the read harness runs **one** action node and reports the
terminal run status. A write smoke needs to **create something, confirm it,
and remove it** — a multi-step lifecycle the current single-node model does not
express.

## 3. Inventory of the remaining write/destructive surface

Source: `npm run smoke:actions -- --json` (offline CLI, no execution), classified
by leading verb. **298 registered / 93 fixture-backed / 204 missing / 1 skipped**
(`slack:delete_message`, the lone destructive fixture). Verb classification is a
heuristic; the fixture author makes the final call per action.

**By heuristic class across the 204 uncovered actions:** ~15 destructive
(`delete_*` / `revoke_*` / `purge_*`), ~28 send/notify, ~161 other writes
(create / update / append / move / format).

| Provider | Missing | dest | send | write | Notes for the write harness |
|---|---|---|---|---|---|
| slack | 21 | 0 | 8 | 13 | sends to channels/DMs (`sendSafe`); channel admin writes need cleanup pairs. |
| monday | 14 | 1 | 0 | 13 | create item/board -> delete (`destructiveSafe` cleanup). |
| gmail | 12 | 1 | 4 | 7 | `send_email` / `reply` = `sendSafe` (controlled smoke mailbox); drafts/labels = `writeSafe`. |
| stripe | 12 | 0 | 0 | 12 | **billingSensitive** — charges/customers/subscriptions. Skipped unless test-mode key confirmed. |
| shopify | 11 | 0 | 0 | 11 | orders/products/customers — partly billingSensitive. |
| hubspot | 19 | 0 | 0 | 19 | CRM create/update — `writeSafe` against a throwaway portal. |
| mailchimp | 10 | 0 | 0 | 10 | audience/campaign writes; `send`-type campaign actions reach subscribers = `sendSafe`. |
| notion | 10 | 0 | 1 | 9 | create_page -> archive_page (reversible) = good `destructiveSafe` pilot shape. |
| airtable | 6 | 1 | 0 | 5 | create_record -> delete_record = clean `destructiveSafe` pilot shape. |
| google-sheets | 8 | 1 | 0 | 7 | append_row -> delete_row; clear_range. |
| google-drive | 4 | 1 | 0 | 3 | create_folder -> delete_file; upload = file action. |
| google-docs | 4 | 0 | 0 | 4 | create/insert content. |
| google-calendar | 4 | 1 | 0 | 3 | create_event -> delete_event (invites = `sendSafe` if attendees set). |
| microsoft-excel | 8 | 2 | 0 | 6 | add_row / create_worksheet -> delete_*; export = file action. |
| microsoft-onedrive | 5 | 1 | 0 | 4 | upload/create -> delete; file actions. |
| microsoft-onenote | 6 | 1 | 0 | 5 | create_page -> delete. |
| microsoft-outlook | 8 | 1 | 5 | 2 | `send_email`/`reply`/`forward` = `sendSafe`; move/categories = `writeSafe`. |
| microsoft-outlook-calendar | 4 | 1 | 0 | 3 | create_event -> delete_event. |
| microsoft-teams | 3 | 0 | 3 | 0 | all send-type (`sendSafe`). |
| trello | 8 | 0 | 1 | 7 | create_card -> delete_card = clean `destructiveSafe` pilot shape. |
| github | 6 | 0 | 1 | 5 | create_issue/comment; external + visible. |
| discord | 4 | 1 | 2 | 1 | sends to channels. |
| facebook | 7 | 1 | 2 | 4 | posts to a Page (public, external-irreversible-ish). |
| dropbox | 8 | 1 | 0 | 7 | upload/create -> delete; file actions. |
| google-analytics | 2 | 0 | 1 | 1 | `create_conversion_event` / `send_event` — write to analytics stream. |

### Risk-class buckets (the safety taxonomy)

| Class | Definition | Coverage path |
|---|---|---|
| **writeSafe** | Creates/updates only a throwaway resource the run owns; can verify + clean up. | Full setup/execute/verify/cleanup. The bulk (~161). |
| **sendSafe** | Sends/notifies; can only target a controlled smoke destination. | Execute only, to an env-pinned smoke channel/mailbox; no provider cleanup possible (a sent message is delivered). Reported, not cleaned. |
| **destructiveSafe** | Deletes/archives only a resource created by the same run. | Execute is itself the cleanup of a setup-created resource, OR cleanup deletes the execute-created resource. |
| **billingSensitive** | Charges, customers, subscriptions, payouts, refunds. | **Skipped (`SANDBOX_REQUIRED`) unless a dedicated test-mode/sandbox account is confirmed by env.** Never against a live key. |
| **neverLive** | Cannot be safely live-smoked (irreversible external broadcast, real-world side effect, no throwaway form). | `UNSAFE_NO_HARNESS` — unit/integration only. Reported as a known gap, never run. |

## 4. Harness contract (the phase model)

A write fixture declares a **`writeHarness`** spec on top of the existing fixture.
The orchestrator runs up to four phases. Every phase is reported **separately**.

```
setup    (optional) -> create the throwaway resource(s) the test needs;
                       each created object is recorded in the resource ledger.
execute             -> run the action under test; if it creates a resource,
                       capture its external id into the ledger.
verify   (optional) -> run an already-registered READ action keyed on the
                       captured/setup id to confirm the side effect.
cleanup  (always
          attempted) -> remove every smoke-owned resource in the ledger, even
                       when execute or verify failed. Reported separately from
                       the action verdict; a cleanup failure cannot be a PASS.
```

### Design principles

1. **Reuse the action registry. No bespoke provider transport.** setup / verify /
   cleanup are themselves **registered actions** (e.g. create_record / get_record /
   delete_record), run through the same engine path as execute. The harness adds
   no new provider API code.
2. **Pure orchestrator over injected seams.** `runWriteSmoke()` is pure over a
   `WriteHarnessDeps` interface (`runActionStep`), mirroring `workflowRun.ts`. It
   unit-tests fully with fakes; the real DB/engine wiring is a separate, gated dep.
3. **Resource ledger is the cleanup authority.** Cleanup may only target an
   external id present in the ledger and marked smoke-owned. The harness can never
   be asked to delete an arbitrary pre-existing record.
4. **Cleanup always runs; its result is separate.** Like the read harness's
   best-effort `cleanupSmokeWorkflow`, cleanup runs in a `finally`-style path. But
   unlike it, a cleanup **failure is surfaced** (status `CLEANUP_FAILED`) and
   prevents a PASS, because an uncleaned resource is provider junk.
5. **Dry-run plans without mutating.** `dryRun: true` produces the full phase plan
   and the gate decision but calls **no** mutating seam — for inspecting what a
   fixture would do before ever touching a provider.

### `WriteHarnessSpec` (fixture-side)

```ts
interface WriteHarnessSpec {
  liveClass: WriteLiveClass;        // writeSafe | sendSafe | destructiveSafe | billingSensitive | neverLive
  smokeMarker: string;              // unique prefix stamped onto created names/text (e.g. "crsmoke-")
  setup?: ActionStepSpec[];         // registered actions that create prerequisites
  captureResource?: CaptureSpec;    // how to read the created id from execute output (e.g. output path "id")
  verify?: ActionStepSpec;          // a registered READ action keyed on the captured id
  cleanup?: ActionStepSpec;         // a registered destructive action keyed on the captured id
  requiresSandboxEnv?: string;      // billingSensitive: the env var that confirms a test-mode account
}
```

`ActionStepSpec` = `{ provider, action, config, captureResource? }`. Each step's
config may reference a prior step's captured id via a ledger token
(`{{ledger.<resourceKey>.id}}`), resolved by the harness, not the engine.

### Idempotency + unique markers

- Every created object carries `smokeMarker` (a per-run unique prefix:
  `crsmoke-<runToken>-`). The token varies per run (passed in by the runner, not
  generated in the pure core, so the orchestrator stays deterministic for tests).
- The marker is how a human (and a future orphan-sweeper) recognizes smoke-owned
  junk if cleanup ever fails.
- For providers that support an idempotency key on the write (Stripe), the marker
  doubles as the idempotency key so a retried run does not double-create.

### Hard gates (block by default)

| `liveClass` | Runs live only when... | Default |
|---|---|---|
| writeSafe | `ALLOW_LIVE_PROVIDER_SMOKE` + `ALLOW_LIVE_PROVIDER_WRITE_SMOKE` | SKIP |
| sendSafe | write gates + the fixture's smoke-destination env is set (env-pinned channel/mailbox) | SKIP |
| destructiveSafe | write gates + `ALLOW_DESTRUCTIVE_PROVIDER_SMOKE` + a smoke-owned ledger resource exists | SKIP |
| billingSensitive | all of the above + `requiresSandboxEnv` is set (a confirmed test-mode account) | **SANDBOX_REQUIRED** |
| neverLive | never | **UNSAFE_NO_HARNESS** |

These compose with (do not replace) the existing run-mode gates
(`ALLOW_DB_INTEGRATION_TESTS`, live mode, `SMOKE_PROVIDER`).

## 5. Resource safety

- **Mark everything.** Created objects get the `smokeMarker` prefix in their
  name/title/text. setup/execute record `{ provider, kind, externalId, marker }`
  in the ledger.
- **Cleanup only touches the ledger.** The orchestrator refuses a cleanup step
  whose target id is not a smoke-owned ledger entry (`destructive action cannot
  run without a smoke-owned resource`). This makes "delete an arbitrary existing
  record" structurally impossible.
- **No updating arbitrary business records.** `writeSafe` updates target only a
  setup-created throwaway. An action that can only update a pre-existing business
  object (no throwaway form) is `neverLive`.
- **Sandbox-gated billing.** billingSensitive actions never run against a live
  Stripe/Shopify key. They require an explicit `requiresSandboxEnv` confirming a
  test-mode account, else `SANDBOX_REQUIRED`.

## 6. Reporting + certification

### Runtime statuses (write harness result)

| Status | Meaning | Folds to gate as | PASS? |
|---|---|---|---|
| `PASS` | execute (+ verify) succeeded and cleanup succeeded | pass | yes |
| `FAIL` | execute did not reach its expected outcome | fail | no |
| `VERIFY_FAILED` | execute ran but verify could not confirm the side effect | fail | no |
| `CLEANUP_FAILED` | the action verdict was fine but a smoke resource was left behind | fail | **no** |
| `SKIP` | a gate was off or required env/connection missing | skip | n/a |
| `SANDBOX_REQUIRED` | billingSensitive without a confirmed test-mode account | skip | n/a |
| `UNSAFE_NO_HARNESS` | neverLive — cannot be safely live-smoked | skip | n/a |

- **Certification cannot be PASS when cleanup failed.** `CLEANUP_FAILED` and
  `VERIFY_FAILED` both fold to the gate's `fail`, so the suite gate fails and the
  certification matrix never records `LIVE_PASS` for that run.
- Existing read-smoke certification behavior is unchanged. Two new **durable**
  certification statuses are added for the write surface: `SANDBOX_REQUIRED`
  (needs a test-mode account) and `UNSAFE_NO_HARNESS` (neverLive). They are
  derived/eligible, never `LIVE_PASS`, so the CERT-SKIP planner never skips them.
- Reporting stays **status-only**: phase outcomes + ledger **counts** + selector
  field **names**. The ledger's external ids live in memory only to drive cleanup;
  they are never printed, logged, or committed (same no-leak rule as the read
  harness).

## 7. Pilot set (chosen after the contract)

Three very-low-risk `destructiveSafe`/`writeSafe` shapes that create a harmless
resource and delete it cleanly. **Authored + gated this slice; NOT run live here.**

| Pilot | Class | setup -> execute -> verify -> cleanup | Why it is safe |
|---|---|---|---|
| `airtable:create_record` | destructiveSafe | (none) -> create_record (capture id) -> get_record -> delete_record | Record in a throwaway base/table; create+delete is a clean reversible pair; id captured into ledger; cleanup deletes exactly that id. |
| `notion:create_page` | destructiveSafe | (none) -> create_page (capture id) -> get_page -> archive_page | Notion archive is reversible (restore_page exists); least destructive of the three. |
| `trello:create_card` | destructiveSafe | (none) -> create_card (capture id) -> (verify optional) -> delete_card | Card create+delete is a clean reversible pair on a throwaway board. |

Deliberately **excluded** from the pilot: any send/message (`sendSafe`), anything
billing (`billingSensitive`), customer/subscription changes, file upload/share,
and any delete of a pre-existing record. The pilot only ever deletes what it just
created.

## 8. Test plan (harness self-tests)

Against the pure orchestrator with fakes (no provider, no DB), per the
testing-strategy rule (mock only the external boundary, test real business logic):

1. cleanup runs after an **execute** failure (ledger has the setup resource).
2. cleanup runs after a **verify** failure (execute-created resource still cleaned).
3. cleanup **failure is surfaced** (`CLEANUP_FAILED`) and the result is not PASS.
4. a destructive/cleanup step **cannot run without a smoke-owned ledger resource**
   (refused).
5. **dry-run never calls a mutating seam** (plan only).
6. **risk gates block by default**: writeSafe without the write gate -> SKIP;
   billingSensitive without sandbox env -> SANDBOX_REQUIRED; neverLive ->
   UNSAFE_NO_HARNESS.

Plus: PASS happy path (setup/execute/verify/cleanup all ok), sandbox-confirmed
billingSensitive becomes eligible, and the fold-to-`SmokeResult` mapping (so the
write results join the existing `ExecutionReport` gate).

## 9. Implementation status (this slice)

**Landed (pure, additive, unit-tested):**
- `tests/smoke-actions/writeHarness.ts` — phase orchestrator, ledger, gates,
  status taxonomy, fold-to-`SmokeResult`. Pure over `WriteHarnessDeps`.
- `tests/smoke-actions/contract.ts` — additive optional `writeHarness?` spec +
  `defineWriteSmokeFixture` helper + the `WriteLiveClass` type.
- `scripts/chainreact/smoke/certification.ts` — `SANDBOX_REQUIRED` +
  `UNSAFE_NO_HARNESS` durable statuses (+ labels, totals, renderers).
- `tests/fixtures/action-smoke/{airtable/create_record, notion/create_page,
  trello/create_card}.ts` — 3 gated pilot fixtures (NOT registered in
  `ALL_SMOKE_FIXTURES` yet; not run live).
- `tests/unit/smoke-actions/write-harness.test.ts` — the self-tests above.

**Deferred (designed, not built):**
- The real `WriteHarnessDeps.runActionStep` wiring (account-scoped engine runs for
  setup/verify/cleanup) plus `{{env.*}}` resolution for sub-step ids. Same posture
  as the read harness's `workflow-live` path before Marcus first ran it.
- Registering pilots in the Jest `ALL_SMOKE_FIXTURES` runnable list and a
  `smoke:writes` runner — held until the real deps + one live pilot run are done
  with Marcus. (The offline fs-scan inventory DOES discover the 3 pilot files, so
  `npm run smoke:actions --cert` now shows them as `NOT_RUN` fixture-backed and the
  missing-fixture gap reads 201, not 204. They still never execute — live or test —
  because they are absent from the Jest curated list.)
- The 201-action write coverage rollout (per-provider batches, like the read arc).
