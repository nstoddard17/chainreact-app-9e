# Trigger-smoke readiness checkpoint — 2026-06-29

**Lane:** provider TRIGGER testing/greening only (no Connected Apps / Builder UX / React Agent /
Hermes / templates / queue migrations / unrelated cleanup). Sibling to the action-smoke matrix
([action-smoke-matrix-checkpoint-2026-06-26.md](./action-smoke-matrix-checkpoint-2026-06-26.md),
frontier-closed at commit `3aee9ef9b`).
**Branch:** `v2-main`. **Nothing pushed.** **This is a DISCOVERY/AUDIT pass — no fixture authored,
no live trigger smoke run, no production change.**

## 1. Trigger registry (authoritative)

Source of truth: `ALL_TRIGGER_META` in
[services/discovery/_metaInventory.ts](../../../../services/discovery/_metaInventory.ts) (the
hand-maintained discovery registry; triggers self-register via side-effect imports, so this is the
canonical enumerable surface — there is no separate `_triggerInventory` like actions have). Counts
read live this turn by enumerating `ALL_TRIGGER_META`.

```
Total registered triggers: 62   (across 24 providers)
By activation:  webhook 43 | polling 17 | manual 1 | scheduled 1
```

**Per-provider (activation in brackets):**

| Provider | n | Triggers |
|---|---|---|
| airtable | 1 | record_changed [webhook] |
| discord | 2 | slash_command [webhook], new_message [polling] |
| dropbox | 1 | new_file [webhook] |
| facebook | 2 | new_post [webhook], new_comment [webhook] |
| github | 1 | new_commit [webhook] |
| gmail | 3 | new_email, new_labeled_email, new_attachment [all polling] |
| google-calendar | 1 | event_changed [webhook] |
| google-docs | 2 | new_document, document_updated [webhook] |
| google-drive | 1 | file_changed [webhook] |
| google-sheets | 2 | new_worksheet, row_changed [webhook] |
| hubspot | 1 | webhook_received [webhook] |
| mailchimp | 7 | audience_event [webhook]; campaign_created, email_opened, link_clicked, new_audience, segment_updated, subscriber_added_to_segment [polling] |
| microsoft-excel | 5 | new_row, updated_row, new_table_row, updated_table_row, new_worksheet [all polling] |
| microsoft-onedrive | 1 | file_changed [webhook] |
| microsoft-onenote | 2 | new_note, updated_note [polling] |
| microsoft-outlook | 3 | new_email, email_sent, email_flagged [webhook] |
| microsoft-outlook-calendar | 1 | event_changed [webhook] |
| microsoft-teams | 1 | new_channel_message [webhook] |
| monday | 5 | new_item, column_changed, item_moved, new_subitem, new_update [webhook] |
| native | 2 | manual.run [manual, noauth], schedule.fired [scheduled, noauth] |
| shopify | 1 | webhook_received [webhook] |
| slack | 10 | message.channel/.im/.group/.mpim, reaction_added, reaction_removed, channel_created, member_joined_channel, member_left_channel, file_shared [all webhook] |
| stripe | 1 | event_received [webhook] |
| trello | 6 | new_card, card_updated, card_moved, comment_added, member_changed, card_archived [webhook] |

## 2. Trigger-smoke matrix (starting state)

**There is NO trigger-smoke harness or certification today.** The `npm run chainreact -- smoke
actions --cert` matrix and the `tests/integration/smoke-actions/*` live runners cover ACTIONS only.
So in trigger-smoke terms every trigger starts un-harnessed:

```
Registered triggers:       62
Live-certified triggers:    0   (no trigger cert seed exists yet)
NOT_RUN (harness-ready):    0
MISSING_FIXTURE:           62   (no trigger fixtures exist)
Policy-excluded / not-live-safe: see §3 lanes D–E
```

**Partial existing coverage that is NOT a trigger cert (be honest about what's proven):**
- `native:manual.run` is already exercised end-to-end on EVERY action workflow-live smoke — the
  action harness ([tests/smoke-actions/workflowRun.ts](../../../../tests/smoke-actions/workflowRun.ts))
  builds a `{native:manual.run → fixture action}` workflow and runs it through the real
  `enqueueRun` + `processQueuedRun` durable path. BUT manual.run is the run-now path and
  deliberately bypasses `dispatchTriggerEvent`, so this does NOT exercise trigger-specific
  activation/dispatch. It proves the manual entry path is real, not the trigger dispatch surface.
- Unit tests exist under `tests/unit/integrations/*/triggers/**` (poll/dispatch/activate, mocked)
  and `tests/unit/core/triggers/**`. These are unit-level with mocked providers — they are NOT
  live smokes and do not fire through the real dispatch path to a verifiable run.

## 3. Trigger classification into live-smoke lanes

Connected-on-smoke-account set (from the action-smoke cert history): airtable, dropbox, facebook,
gmail, google-calendar, google-docs, google-drive, google-sheets, hubspot, mailchimp,
microsoft-excel, microsoft-onedrive, microsoft-onenote, microsoft-outlook,
microsoft-outlook-calendar, microsoft-teams, slack, trello. **Not connected:** discord, monday,
stripe, shopify, github. google-analytics has no triggers.

### Lane A — native (noauth, internal dispatch) — SAFEST, 2 triggers
- `native:schedule.fired` [scheduled] — armed by the activation hook
  ([integrations/native/triggers/scheduledTrigger.ts](../../../../integrations/native/triggers/scheduledTrigger.ts):
  computes the first `nextFireAt` strictly AFTER the activation instant, sets
  `schedulerState:"armed"`), fired by the cron orchestrator
  [services/cron/runScheduledTriggers.ts](../../../../services/cron/runScheduledTriggers.ts) → `enqueueRun` → run.
  No provider, no external resource, no send. Exercises a REAL trigger dispatch path distinct from
  run-now AND the scheduling baseline invariant (a "now" before `nextFireAt` must fire nothing).
- `native:manual.run` [manual] — already proven by the action harness (§2); a trigger-smoke cert
  would just formally record it.

### Lane B — polling, smoke-owned-seedable — feasible, reuses action bootstraps
Polling triggers on CONNECTED providers where a smoke-owned resource change can be seeded with an
already-certified write + cleanup, and the baseline-first invariant is checkable (activate seeds
snapshot → first poll fires nothing → post-baseline change fires exactly one event):
- **microsoft-excel (5):** new_row, updated_row, new_table_row, updated_table_row, new_worksheet —
  STRONGEST. We already own the smoke-workbook bootstrap (`minimalXlsx` upload via
  `microsoft-onedrive:upload_file`) + certified `add_row` / `add_table_row` / `create_worksheet`,
  and a whole-file `delete_item` cleanup. The poll handler is shared
  (`integrations/microsoft-excel/triggers/_shared/pollingHandler`).
- **microsoft-onenote (2):** new_note, updated_note — we own a smoke-owned `create_page` /
  `update_page` / `delete_page` (subject to the OneNote create→read lag noted in the action arc).
- gmail (3: new_email/new_labeled_email/new_attachment) — needs an INBOUND email to fire; seeding
  one means SENDING mail → excluded (Lane D). `new_labeled_email` could seed via a label add on a
  pre-existing message, but that mutates an existing user email (no smoke-owned target) → defer.
- mailchimp (6 polling) — campaign/audience/subscriber events touch contact PII / sending → defer
  (Lane D/E), and mailchimp lacks a registered safe cleanup (per the action arc).
- discord:new_message [polling] — discord not connected (Lane E).

### Lane C — webhook, synthetic/mocked receipt — needs a new harness seam, per-provider
43 webhook triggers. A safe smoke would POST a crafted payload to `/api/webhooks/[provider]`
(routes exist for 21 providers) and assert it dispatches to a verifiable run, WITHOUT touching the
real provider. Blocker: most webhook routes verify a provider signature (HMAC/secret) and/or expect
a registered subscription resource, so a synthetic receipt needs per-provider signature handling
(or a smoke-only verified-receipt seam). Feasible later; not the beachhead. Connected-provider
webhook triggers (airtable, dropbox, facebook, google-*, hubspot, mailchimp audience_event,
onedrive, outlook ×3, outlook-calendar, teams, slack ×10, trello ×6) come first within this lane;
discord/github/monday/shopify/stripe webhooks are also not-connected (Lane E).

### Lane D — excluded by safety rules (send/broadcast/inbound-content/PII)
Triggers that can only FIRE by producing an excluded side effect or by mutating real user content:
gmail new_email/new_attachment (needs inbound mail → a send to seed), microsoft-outlook
new_email/email_sent (inbound/sent mail), mailchimp subscriber/campaign/open/click events (contact
PII + sending), facebook new_post/new_comment (needs a real Page post/comment), slack message.*
(needs a posted message; reaction_added/removed (needs a reaction), member_joined/left (needs a real
join). These mirror the action-lane send/broadcast/mutate-existing exclusions.

### Lane E — provider not connected on the smoke account
discord (slash_command, new_message), github (new_commit), monday (5), shopify (webhook_received),
stripe (event_received). Unlocks only when the provider is connected (same list as the action-smoke
handoff §28.4).

## 4. First safe candidate / beachhead

**`native:schedule.fired` is the first safe trigger-smoke candidate** (with `native:manual.run`
recorded alongside, already proven). Rationale — it is the trigger analog of how action-smoke
started with the native logic actions: noauth, no external provider, no resource mutation, no
send/broadcast, and it is the smallest trigger that exercises a REAL trigger dispatch path
(activation arm → cron orchestrator fire → run) plus the baseline invariant (fire only strictly
after the armed `nextFireAt`).

**Prerequisite (one small slice before any cert):** there is no trigger-smoke harness. The beachhead
slice is to add a minimal trigger-smoke runner seam that, for a native scheduled trigger: persists a
workflow + activates the trigger (seeds `trigger_resources` with `nextFireAt`/`schedulerState`),
invokes the scheduled-trigger orchestrator with an injected "now" (a) BEFORE `nextFireAt` → asserts
zero runs (baseline-first), then (b) AFTER `nextFireAt` → asserts exactly one run reaches a terminal
verifiable result, then deactivates (deletes `trigger_resources`). No provider calls, no external
mutation — fully internal, so it needs no live-provider gates and is safe to run in CI-like mode.
Only after that harness exists and a real fire is observed does a trigger cert row get added (same
charter as actions: no cert without a real pass through the intended dispatch path).

After the native beachhead proves the harness, **Lane B microsoft-excel polling** is the next batch
(reuses the existing smoke-owned workbook bootstrap + certified writes; checks baseline-first on a
real provider), then **Lane C webhook** with a synthetic-receipt + signature seam.

## 5. Exclusions summary (so nothing is silently skipped)

- **Not connected (Lane E):** discord, github, monday, shopify, stripe triggers — connect first.
- **Send/broadcast/inbound/PII (Lane D):** gmail/outlook email triggers, mailchimp subscriber/
  campaign triggers, facebook post/comment, slack message/reaction/member triggers — firing them
  safely is blocked by the same send/mutate-existing rules as the action lane.
- **Needs a harness that doesn't exist yet:** ALL 62 — no trigger-smoke runner/cert exists. Lane A
  needs the smallest seam; Lanes B/C need progressively more (provider seed/cleanup; synthetic
  signed receipt).

## 6. Recommendation

1. **Build the minimal native trigger-smoke harness seam** and certify `native:schedule.fired`
   (+ record `native:manual.run`) — the safe, internal, no-provider beachhead. This is the next
   slice; it is small and fully offline-safe (no live-provider gates).
2. Then **Lane B: microsoft-excel polling triggers** (reuse the certified smoke-workbook bootstrap;
   prove baseline-first on a real provider).
3. Then **Lane C: webhook synthetic-receipt seam** (per-provider signature handling), connected
   providers first.
4. Defer Lane D (excluded by safety) and Lane E (not connected) exactly as in the action arc.

This pass authored **no fixture and ran no live trigger smoke** (no harness exists to support safe
setup/cleanup yet — per the task's rule). No production trigger behavior changed.

## 7. Verification (this pass, docs-only)

- Trigger registry counts: enumerated `ALL_TRIGGER_META` (62 triggers; webhook 43 / polling 17 /
  manual 1 / scheduled 1) via a throwaway jest enumerator (created, run, deleted — not committed).
- `npm run lint:structure` → OK.
- `npx tsc --noEmit` → **exit 0 (clean)**. The parallel-session workflow-checkpoint WIP that
  blocked tsc last turn has since cleared (the offending untracked `checkpoints.test.ts` is gone);
  the remaining untracked `workflowCheckpoint*` WIP no longer breaks the typecheck. This pass is
  docs-only and cannot affect tsc regardless.
- eslint: docs-only change, no lint targets.
- **No db:push, no deploy, nothing pushed.**

## 8. Slice 1 — native scheduled-trigger harness seam + `native:schedule.fired` LIVE-CERTIFIED (2026-06-29)

The beachhead from §4/§6 is built and **`native:schedule.fired` is LIVE-CERTIFIED** through its real
dispatch path. First entry in the trigger-cert matrix.

**Harness seam (new `tests/trigger-smoke/` namespace — separate from action-smoke):**
- [scheduledSmoke.ts](../../../../tests/trigger-smoke/scheduledSmoke.ts) — pure, injectable
  orchestrator + `buildScheduledSmokeDefinition()` (a `native:schedule.fired` [1-min cron] → single
  `native:if_then_condition` no-op wired workflow). The no-op is a unary `is_falsy` on a truthy
  literal with `onFalse:"skip"` → evaluates false → engine takes the NULL branch (no downstream edge
  needed) → terminal `succeeded`, zero external effect. (An `is_truthy`/`onFalse:"branch"` config was
  tried first and correctly produced `INVALID_BRANCH` — the live run caught it; fixed, not worked
  around.)
- [scheduledSmokeDeps.ts](../../../../tests/trigger-smoke/scheduledSmokeDeps.ts) — REAL deps: arms
  via the real `registerWorkflowTriggers` (runs the native scheduled activation hook → first
  `nextFireAt`), drives the real `runScheduledTriggers(nowOverride)` cron orchestrator, drains via the
  real durable-queue `processQueuedRun`, reads runs via service-role diagnostics, tears down via
  `unregisterWorkflowTriggers` + soft-delete. Workflow is inserted `state="active"` with a null
  `active_revision_id` (live runs fall back to the draft per `activeRevision.ts`); the activation
  API's preconditions/billing/revision-snapshot are NOT part of the scheduled-DISPATCH surface under
  test, so only the state flip is set directly — the trigger ARMING uses the real lifecycle.
- [triggerCertificationSeed.ts](../../../../tests/trigger-smoke/triggerCertificationSeed.ts) — minimal
  typed cert seed (reusable shape for later polling/webhook triggers; no CLI built yet).
- Tests: [unit](../../../../tests/unit/trigger-smoke/scheduledSmoke.test.ts) (8, fakes — baseline-first,
  fire-once, terminal, cleanup-always, blast-radius skip, throw-still-cleans) +
  [gated dev integration](../../../../tests/integration/trigger-smoke/scheduled.workflow.dev.test.ts)
  (`npm run smoke:triggers:scheduled`).

**Safety — global-orchestrator blast radius = 0.** `runScheduledTriggers` is global (fires every due
scheduled workflow across accounts). The harness refuses to drive it (returns SKIP, never fakes) when
any OTHER active scheduled row would be due at the injected instant (`countOtherDueScheduled`). The
live cert run found 0 others due, so only this smoke's row fired. No provider, no send, no external
resource; the run is logic-only (0 task cost).

**Live result (`ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true npm run smoke:triggers:scheduled`):**
```
{"event":"trigger-smoke.scheduled.result","outcome":"pass","baselineRunCount":0,
 "afterRunCount":1,"terminalStatus":"succeeded","cleaned":true}
```
Baseline-first held (before-tick fired 0), the at-tick fired exactly 1 via `dispatchTriggerEvent`, the
durable run reached `succeeded`, and trigger_resources + workflow were cleaned (0 leaked). **Cert row:
`native:schedule.fired` → `LIVE_PASS` (2026-06-29).**

**`native:manual.run` — NOT certified by this slice (honest classification).** It is exercised on every
action workflow-live smoke but via the manual run-now path (`enqueueRun`), which bypasses
`dispatchTriggerEvent`. Recorded as `RUN_NOW_PROVEN` (a weaker, accurate status), NOT `LIVE_PASS` — this
scheduled harness does not exercise manual.run's own semantics.

**Trigger-smoke matrix now:** 62 registered · **1 LIVE_PASS** (`native:schedule.fired`) · 1
RUN_NOW_PROVEN (`native:manual.run`) · 60 un-harnessed (Lanes B/C/D/E unchanged).

**Verification (this slice):** `tests/unit/trigger-smoke` (8) + `tests/unit/services/cron/runScheduledTriggers.test.ts`
→ 19 pass; live `smoke:triggers:scheduled` → PASS (above); `npx tsc --noEmit` → exit 0; eslint on the 5
touched files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

## 9. Slice 2 — Lane B: `microsoft-excel:new_worksheet` polling trigger LIVE-CERTIFIED (2026-06-29)

The first polling-trigger cert. **`microsoft-excel:new_worksheet` is LIVE_PASS** through its real
polling dispatch path, with baseline-first proven on a real provider.

**Selected trigger + why.** Of the 5 Excel polling triggers, `new_worksheet` is the safest/smallest:
its post-baseline change is a CERTIFIED safe write (`create_worksheet`), its diff is a simple
worksheet-name set (no table/row scaffolding), and cleanup is the certified whole-workbook
`onedrive:delete_item`. (`new_row`/`new_table_row` need row/table seeding; same harness shape, deferred.)

**Polling harness seam (extends `tests/trigger-smoke/`):**
- [excelPollingSmoke.ts](../../../../tests/trigger-smoke/excelPollingSmoke.ts) — pure injectable
  orchestrator (create workbook → active workflow → arm → baseline poll → change → re-poll → drain →
  verify payload → cleanup) + `buildExcelNewWorksheetSmokeWorkflow(workbookId)`.
- [excelPollingSmokeDeps.ts](../../../../tests/trigger-smoke/excelPollingSmokeDeps.ts) — real deps:
  workbook via the certified `onedrive:upload_file` (frozen `MINIMAL_XLSX_BASE64`), arm via the real
  `registerWorkflowTriggers` (runs the `new_worksheet` activation hook → fetch worksheets → seed
  snapshot), change via the certified `excel:create_worksheet`, **poll via the REAL
  `microsoftExcelPollingHandler.poll(...)`**, drain via `processQueuedRun`, cleanup via
  `unregisterWorkflowTriggers` + `onedrive:delete_item` + soft-delete.
- Unit tests ([excelPollingSmoke.test.ts](../../../../tests/unit/trigger-smoke/excelPollingSmoke.test.ts),
  7, fakes) + gated live integration test + `smoke:triggers:excel` script.

**Real dispatch, scoped (documented design).** The harness drives the **per-trigger poll handler**
(`microsoftExcelPollingHandler.poll`) — the exact function the cron orchestrator's `runOne` calls
(read worksheets → diff vs snapshot → `enqueueRun`). It does NOT drive the global
`runPollingTriggers()` shell, because that polls + can fire EVERY due polling workflow across all
accounts on the shared dev DB (a real multi-account side effect). Only the selection/interval/state
gating shell is bypassed; the polling DISPATCH path is 100% real. This is the safe-driving decision
the readiness doc anticipated for Lane B.

**Create→read lag.** The first attempt fired 0 after the worksheet add — Graph's workbook API has a
brief create→read propagation lag, so the new sheet wasn't visible to the immediate poll. Fixed with
a bounded re-poll (6 attempts × 1.5s, ~9s cap); the diff is idempotent (a poll that doesn't yet see
the sheet only re-persists the same snapshot; the poll that first observes it fires exactly once).
This is a harness-only concern — the dispatch path is unchanged.

**Live result (`ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true ALLOW_LIVE_PROVIDER_SMOKE=true ALLOW_LIVE_PROVIDER_WRITE_SMOKE=true ALLOW_DESTRUCTIVE_PROVIDER_SMOKE=true SMOKE_MICROSOFT_EXCEL_CONNECTED=1 SMOKE_MICROSOFT_ONEDRIVE_CONNECTED=1 npm run smoke:triggers:excel`):**
```
{"event":"trigger-smoke.excel-new-worksheet.result","outcome":"pass","baselineRunCount":0,
 "afterRunCount":1,"terminalStatus":"succeeded","firedWorksheetName":"crsmoke…ws",
 "addedWorksheetName":"crsmoke…ws","cleaned":true}
```
Baseline-first held (first poll fired 0 from the pre-existing `Sheet1`), the post-baseline worksheet
fired exactly 1 run via the handler's `enqueueRun`, the run's trigger payload carried the new sheet
name (`firedWorksheetName === addedWorksheetName`), the durable run reached `succeeded`, and the whole
workbook was deleted (OneDrive recycle bin). **created 1 / cleaned 1 / 0 leaked.** **Cert row:
`microsoft-excel:new_worksheet` → `LIVE_PASS` (2026-06-29).**

**Trigger-smoke matrix now:** 62 registered · **2 LIVE_PASS** (`native:schedule.fired`,
`microsoft-excel:new_worksheet`) · 1 RUN_NOW_PROVEN (`native:manual.run`) · 59 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke` (15) + `tests/unit/integrations/microsoft-excel/triggers`
→ 77 pass; live `smoke:triggers:excel` → PASS (above, 0 leaked); `npx tsc --noEmit` → exit 0; eslint on
the 5 touched files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

**Next Lane B candidates (same harness shape):** `new_row` / `new_table_row` (seed via certified
`add_row` / `add_table_row`, verify the row payload), then `updated_row` / `updated_table_row`. Lane C
(webhook synthetic-receipt) remains the larger follow-on.

## 10. Slice 3 — Lane B: `new_row` + `new_table_row` LIVE-CERTIFIED; harness generalized (2026-06-29)

Extended the Excel polling harness into ONE spec-driven pattern and certified the rest of the Excel
CREATE-polling family. **`microsoft-excel:new_row` and `microsoft-excel:new_table_row` are LIVE_PASS.**

**Selected triggers + why.** The two create-detection triggers — same provider, same workbook
bootstrap + cleanup as `new_worksheet`, and their post-baseline change is a CERTIFIED safe write
(`add_row` / `add_table_row`). They only detect post-baseline ADDITIONS (a new position/row key), so
they're simpler than the `updated_*` value-change triggers (deferred).

**Harness generalization (one pattern, not a second).** `excelPollingSmoke.ts` is now spec-driven:
`runExcelPollingSmoke(deps, spec, opts)` runs the shared 9-step flow; an `ExcelPollingTriggerSpec`
plugs in the workbook variant, the workflow builder, an optional pre-activation `seed`, the
post-baseline `applyChange`, and `identityMatches`. Three specs exported (`NEW_WORKSHEET_SPEC`,
`NEW_ROW_SPEC`, `NEW_TABLE_ROW_SPEC`); `runExcelNewWorksheetSmoke` stays as a thin wrapper. The deps
gained `createSmokeWorkbook(variant)` (plain vs the table-bearing `MINIMAL_XLSX_WITH_TABLE_BASE64`),
`seedRow` (add_row + confirm-visible), `addMarkedRow`, `addMarkedTableRow`, and `listRuns` now carries
the full `trigger_event.payload` so each spec verifies its own identity. The single live integration
test runs all three specs (`smoke:triggers:excel`); the old new_worksheet-only test was replaced.

**Baseline-first proof (per trigger).** All fired **0** runs on the first poll:
- `new_worksheet`: pre-existing `Sheet1` (snapshot names `["Sheet1"]`) → 0.
- `new_row`: a seeded baseline row at position 1 (snapshot `rowHashes {"1":…}`) → 0. (An empty sheet's
  `add_row` lands at A1/position 1, which would collide with the empty-sheet phantom key and never
  register as new — so the harness seeds a confirmed-visible baseline row first, and the change then
  appends at position 2, a NEW key.)
- `new_table_row`: the table workbook ships with one seed row = baseline (snapshot `rowHashes {"0":…}`) → 0.

**Live result (`… npm run smoke:triggers:excel`, all 5 write gates + Excel/OneDrive connected):**
```
new_worksheet  → pass · baseline 0 · after 1 · identity "crsmoke…ws"   matched · succeeded · cleaned
new_row        → pass · baseline 0 · after 1 · identity "crsmoke-…-row" matched · succeeded · cleaned
new_table_row  → pass · baseline 0 · after 1 · identity "crsmoke-…-trow" matched · succeeded · cleaned
```
Each: created 1 workbook / cleaned 1 (OneDrive recycle bin) / **0 leaked**; the fired run's
`trigger_event.payload` carried the added worksheet name / row marker (verifiable dispatch). Same
bounded re-poll (6×1.5s) absorbs Graph's create→read lag. **Cert rows: `new_row` + `new_table_row` →
`LIVE_PASS` (2026-06-29).**

**Trigger-smoke matrix now:** 62 registered · **4 LIVE_PASS** (`native:schedule.fired`,
`microsoft-excel:new_worksheet`, `:new_row`, `:new_table_row`) · 1 RUN_NOW_PROVEN
(`native:manual.run`) · 57 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke` (22) + `tests/unit/integrations/microsoft-excel/triggers`
→ 84 pass; live `smoke:triggers:excel` → 3/3 PASS (above, 0 leaked each); `npx tsc --noEmit` → exit 0;
eslint on the 5 touched files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Is `new_row` + `new_table_row` enough to prove the Excel create-polling family before `updated_*`?**
  Yes. The create family (`new_worksheet`, `new_row`, `new_table_row`) is now fully certified and
  exercises every distinct create-diff path: worksheet-name set, worksheet row-position keys, and table
  stable-id keys — through the real per-trigger poll → snapshot-diff → enqueue → run. `updated_row` /
  `updated_table_row` are a genuinely DIFFERENT proof (value-change via `findChangedKeys`, needing an
  `update_row` / `update_table_row`-style mutation + a re-hash assertion, with the documented
  position-key shift caveat for `updated_row`). Recommend treating the create family as DONE and
  scheduling `updated_*` as its own small follow-up slice (reuses this exact harness + a "mutate an
  existing row, assert the changed key fires" spec).
- **Scoped-handler polling vs global cron on a shared dev DB?** Keep the scoped per-trigger
  `handler.poll(...)` approach. It runs the identical dispatch code path the cron's `runOne` invokes
  (read → diff → enqueue), so dispatch fidelity is full, while avoiding the global
  `runPollingTriggers()` shell that would poll + fire every due polling workflow across ALL accounts on
  the shared DB (a real multi-account side effect we must not cause). The only thing not exercised is
  the selection/interval/state gating shell — not the trigger behavior under test. Revisit only if/when
  there's an isolated single-account test DB.

## 11. Slice 4 — Lane B: `updated_row` + `updated_table_row` LIVE-CERTIFIED; EXCEL POLLING DONE (2026-06-29)

The value-change pair. **`microsoft-excel:updated_row` and `microsoft-excel:updated_table_row` are
LIVE_PASS** — completing the entire Excel polling family (all 5 of 5 triggers certified).

**Both feasible.** There is NO `update_table_row` action, but `updated_table_row` keys on Graph's
stable table-row INDEX, and a table overlays worksheet cells — so the certified header-based
`update_row` (column "Col", the table's header) mutates the table's data cell in place, flipping its
row hash while keeping the stable key "0". `updated_row` mutates a seeded worksheet data row in place
via the same `update_row`. No new production action needed; no unsafe path.

**Spec changes (same `runExcelPollingSmoke` pattern).** Added `UPDATED_ROW_SPEC` +
`UPDATED_TABLE_ROW_SPEC` and two deps primitives: `seedRowsForUpdate` (header row + data row, each
confirmed read-back visible) and `updateRowMarked` (certified `update_row` of column "Col" at a given
row → returns the unique marker). `listRuns` already carries the payload, so identity = the mutated
marker present in `trigger_event.payload.values`. The live test runs all 5 specs.

**Baseline-first proof (each fired 0 on the first poll).**
- `updated_row`: seeded header(row1)+data(row2); activation snapshots `rowHashes {"1":…,"2":…}` → first poll 0.
- `updated_table_row`: the table workbook's shipped data row = baseline `rowHashes {"0":…}` → first poll 0.

**Value-change proof.** The change MUTATES the existing row in place (no insert/delete), so the
position/stable KEY is unchanged and only its HASH flips → `findChangedKeys` fires exactly one event
on the SAME key, payload values carry the mutated marker (`crsmoke-…-upd`).

**Live result (`… npm run smoke:triggers:excel`, all 5 write gates + Excel/OneDrive connected):**
```
new_worksheet → pass · new_row → pass · new_table_row → pass
updated_row   → pass · baseline 0 · after 1 · identity "crsmoke-…-upd" matched · succeeded · cleaned
updated_table_row → pass · baseline 0 · after 1 · identity "crsmoke-…-upd" matched · succeeded · cleaned
```
Each: created 1 workbook / cleaned 1 (OneDrive recycle bin) / **0 leaked**. **Cert rows: `updated_row`
+ `updated_table_row` → `LIVE_PASS` (2026-06-29).**

**HONEST disclosure — the one transient failure was a HARNESS limitation, not a product bug.** The
first `updated_row` live attempt FAILED at seed setup: its two sequential `add_row`s (header then data)
hit Graph's create→read lag — the second `add_row`'s usedRange read didn't see the first, so the
baseline never reached 2 visible rows. Fixed by confirming the header row is read-back visible BETWEEN
the two seed appends (so the data row appends at row 2, not colliding back at row 1). This is purely
smoke setup robustness; the `updated_row` TRIGGER fired correctly once the baseline was seeded. **The
position-key shift caveat did NOT manifest** — I mutate in place (no insert/delete), so no row
re-numbering. That caveat would only bite a workflow that INSERTS/DELETES mid-sheet rows (then shifted
rows re-hash and surface as "updated"); that is documented V1-parity behavior, not exercised here.

**Trigger-smoke matrix now:** 62 registered · **6 LIVE_PASS** (`native:schedule.fired` +
`microsoft-excel:` `new_worksheet`/`new_row`/`new_table_row`/`updated_row`/`updated_table_row`) · 1
RUN_NOW_PROVEN (`native:manual.run`) · 55 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke` (24) + `tests/unit/integrations/microsoft-excel/triggers`
→ 86 pass; live `smoke:triggers:excel` → 5/5 PASS (above, 0 leaked each); `npx tsc --noEmit` → exit 0;
eslint on the 5 touched files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Is Excel polling Lane B complete after the update pair?** YES. All 5 Excel polling triggers are
  LIVE_PASS, covering every distinct diff path: worksheet-name set (new_worksheet), worksheet
  position-key create + change (new_row / updated_row), and table stable-id create + change
  (new_table_row / updated_table_row). The remaining 17 polling triggers are: `microsoft-onenote`
  new_note / updated_note (CONNECTED — the only remaining connected polling lane), `gmail` ×3 +
  `mailchimp` ×6 (Lane D — inbound-email / subscriber-PID / send-risk, excluded), and
  `discord:new_message` (not connected). So after Excel, **OneNote polling is the only remaining
  currently-connected polling lane.**
- **Is the update-trigger instability a harness limitation or a product bug?** HARNESS limitation
  only. The single failure was smoke seed-propagation (two consecutive add_rows under Graph lag),
  fixed by an intermediate visibility confirm. The trigger's value-change detection
  (snapshot → `findChangedKeys` → enqueue) worked correctly and fired exactly once. The position-key
  shift caveat is real but is documented V1-parity behavior for mid-sheet insert/delete — NOT something
  this in-place-mutation cert hit, and NOT a regression. No product bug found.

## 12. Slice 5 — Lane B: OneNote `new_note` LIVE-CERTIFIED; `updated_note` BLOCKED (provider behavior) (2026-06-29)

The last currently-connected polling lane. **`microsoft-onenote:new_note` is LIVE_PASS.**
**`microsoft-onenote:updated_note` is NOT certified — blocked by a Microsoft Graph behavior, proven
by a live probe (not a harness bug).**

**Harness (mirrors the Excel spec-driven pattern; OneNote-specific deps).** New
[onenotePollingSmoke.ts](../../../../tests/trigger-smoke/onenotePollingSmoke.ts) (orchestrator +
`NEW_NOTE_SPEC` / `UPDATED_NOTE_SPEC`) +
[onenotePollingSmokeDeps.ts](../../../../tests/trigger-smoke/onenotePollingSmokeDeps.ts). OneNote
triggers are SECTION-SCOPED with a timestamp-cursor snapshot, and OneNote has no section DELETE — so
the smoke borrows an operator-provisioned smoke/test-named section (via the existing
`discoverOneNoteSmokeSection` guard; null ⇒ SKIP, never a real notebook) and the smoke-owned resource
is the PAGE (certified `create_page` / `update_page` / `delete_page`). Per-trigger `poll()` is driven
scoped (not global). Payload is metadata only — no body/bytes. 12 unit tests (fakes) +
gated live test + `smoke:triggers:onenote` script.

**`new_note` — LIVE_PASS.** Baseline-first: activation seeds the createdDateTime cursor from the
section's newest page → first poll fires 0. Then `create_page` (marker title) → the per-trigger poll
fires exactly 1 whose payload identifies the page (`pageId` + `changeKind:"created"` + title marker)
→ durable run `succeeded` → the smoke page is hard-deleted (0 leaked; the borrowed section is never
deleted). One transient `create_page` HTTP 503 (OneNote Graph outage) cleared on retry — disclosed,
not hidden. Result: `baseline 0 · after 1 · identity matched · succeeded · cleaned`.

**`updated_note` — BLOCKED, NOT certified (root cause PROVEN by a live probe).** It consistently
fired 0 even with a 60s bounded re-poll. A throwaway diagnostic (created a page, `update_page` append,
then polled `pagesGet` + `pagesList(orderBy lastModifiedDateTime desc)` for 90s) showed the page's
`lastModifiedDateTime` **never changed** — it stayed at the creation timestamp (`bumped=false` at
+5/+15/+30/+60/+90s, on BOTH the direct get AND the ordered list). Microsoft Graph's
`PATCH /pages/{id}/content` (what `update_page` calls) does **not** bump `lastModifiedDateTime`, and
`updated_note` fires ONLY on `lastModifiedDateTime > cursor` — so an API content edit can never fire
it. No certified action mutates a page in a way that bumps `lastModifiedDateTime`, and adding one
would be a production change (out of lane + "do not add production actions just to enable smoke").
So `updated_note` stays NOT_RUN with this blocker recorded; its spec + unit tests remain authored
(the harness logic is correct — `new_note` proves the dispatch path) and it is deliberately excluded
from the live cert list.

**Trigger-smoke matrix now:** 62 registered · **7 LIVE_PASS** (`native:schedule.fired` +
`microsoft-excel` ×5 + `microsoft-onenote:new_note`) · 1 RUN_NOW_PROVEN (`native:manual.run`) · 1
BLOCKED-documented (`microsoft-onenote:updated_note`) · 53 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke` (34) + `tests/unit/integrations/microsoft-onenote/triggers`
→ 95 pass; live `smoke:triggers:onenote` → `new_note` PASS (0 leaked); `npx tsc --noEmit` → **the only
error is in a parallel session's UNTRACKED `repositories/agentChangeHistory.ts` WIP, not in any
trigger-smoke file** (my files type-check clean; tsc was exit 0 before that WIP appeared); eslint on
the 5 touched files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Does OneNote complete the currently-connected polling lane?** YES, for what is safely certifiable.
  `new_note` is the last connected polling trigger that can be driven by a certified, cleanable
  mutation; it is LIVE_PASS. `updated_note` is connected but NOT certifiable without a production
  change, because the only certified page-mutation primitive (`update_page` = Graph content PATCH)
  doesn't bump the `lastModifiedDateTime` the trigger keys on. So the connected polling lane is
  **complete modulo the documented `updated_note` provider blocker.** All other polling triggers stay
  excluded (Gmail ×3 / Mailchimp ×6 — Lane D inbound-email / subscriber-PII / send-risk) or
  not-connected (`discord:new_message`).
- **Is the `updated_note` instability a harness limitation or a product bug?** NEITHER a harness bug
  nor strictly a product bug — it's a **Microsoft Graph OneNote behavior** with a real product
  implication. Evidence: `update_page` (PATCH content) does not change `lastModifiedDateTime` (proven,
  90s, two endpoints). The harness is correct (`new_note` certifies; the orchestrator unit tests pass).
  Product implication worth flagging: `updated_note` will NOT fire for page-content edits made via the
  Graph API; it likely DOES fire for edits made in the OneNote app (those bump `lastModifiedDateTime`
  through a different path) — but that app-edit path is unverified here and cannot be exercised by an
  automated smoke. Recommend a product note that `updated_note` detects app/structural edits, not
  API-content edits, and (optionally) a follow-up to confirm app-edit behavior manually.

## 13. Slice 6 — Lane C beachhead: `slack:channel_created` webhook trigger LIVE-CERTIFIED (2026-06-29)

The first SYNTHETIC-WEBHOOK-RECEIPT cert and the Lane C pattern-prover. **`slack:channel_created`
is LIVE_PASS** through the full real receipt → normalize → dispatch → queued run → terminal path,
with dedup proven and zero provider mutation.

**Selected trigger + why (Lane C candidate selection).** Of the 43 webhook triggers, `slack:channel_created`
is the safest synthetic-drivable one: it is a non-message workspace LIFECYCLE event (excluded from the
Lane D message/reaction/member set), the event payload IS self-contained CHANNEL METADATA (no follow-up
provider fetch in `normalize.ts`, no message body / raw bytes / PII — every value is smoke-minted), its
filter takes an empty match-all config, it has a real receive/normalize/dispatch path
(`app/api/webhooks/slack` → `integrations/slack/webhooks/{receive,normalize}` → `services/triggers/dispatch`),
and the Slack Events API carries a deterministic `event_id` → dedup is provable. Decisively, Slack
registration is a PURE `trigger_resources` upsert (one global app webhook URL, **no per-workflow
subscription and no activation hook** → no connected Slack account required to register), and the wired
action is a native no-op → **no Slack API call anywhere in the smoke**.

**Harness seam (extends `tests/trigger-smoke/`):**
- [slackWebhookSmoke.ts](../../../../tests/trigger-smoke/slackWebhookSmoke.ts) — pure injectable
  orchestrator (mint synthetic identity → active workflow → arm → assert canonical event_type →
  baseline 0 → deliver synthetic signed event → exactly-1-run → identity match → drain → terminal →
  re-send same event_id → dedup holds → cleanup) + `buildSlackChannelCreatedSmokeWorkflow()`.
- [slackWebhookSmokeDeps.ts](../../../../tests/trigger-smoke/slackWebhookSmokeDeps.ts) — real deps:
  service-role active-workflow insert, arm via the real `registerWorkflowTriggers`, **deliver via a
  synthetic `event_callback` signed with the REAL `SLACK_SIGNING_SECRET` (Slack's `v0:ts:body`
  HMAC-SHA256 contract) POSTed to the REAL `POST /api/webhooks/slack` route**, runs via service-role
  diagnostics readers, drain via `processQueuedRun`, cleanup via `unregisterWorkflowTriggers` +
  soft-delete + synthetic-dedup-row delete.
- Unit tests ([slackWebhookSmoke.test.ts](../../../../tests/unit/trigger-smoke/slackWebhookSmoke.test.ts),
  9, fakes — happy path + 8 failure branches incl. non-canonical event_type, baseline violation,
  non-200, no-run, identity mismatch, non-terminal, dedup-broken, throw-still-cleans) + gated live
  integration test + `smoke:triggers:webhook` script.

**Receipt path exercised (real, not faked).** The synthetic request flows through the production
route → `receiveSlackWebhook` (real HMAC verify + replay window + JSON parse) → `normalizeSlackEvent`
(canonical `slack.channel_created` TriggerEvent) → `dispatchTriggerEvent` (dedup → `listForDispatch` →
state gate → `enqueueRun`). **Production signature verification is UNWEAKENED** — only the payload
contents are synthetic; the signature is a genuine HMAC under the real secret. No test-only signer was
added to production code (the smoke signs in its own deps file, mirroring the documented contract). The
canonical-node-type convention (`type: "slack.channel_created"`, matching what `normalize` emits and what
`lifecycle` stores) follows the committed Slack e2e walkthrough (which builds its trigger node with
`type: "slack.message.channel"`).

**Live result (`ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true npm run smoke:triggers:webhook`):**
```
{"event":"trigger-smoke.slack-webhook.result","triggerLabel":"slack:channel_created",
 "registeredEventType":"slack.channel_created","baselineRunCount":0,"deliverHttpStatus":200,
 "afterRunCount":1,"identityMatched":true,"terminalStatus":"succeeded","afterRedeliverRunCount":1,
 "dedupProven":true,"cleaned":true,"outcome":"pass"}
```
Baseline-first held (0 before delivery), the synthetic signed event fired exactly 1 run via
`dispatchTriggerEvent` whose `trigger_event` carried the synthetic `event_id` + channel id + name
marker, the durable run reached `succeeded`, the re-sent same `event_id` was **dropped by dedup** (the
dispatcher logged `webhook.dedup.duplicate`; run count stayed 1), and the workflow + trigger_resources +
synthetic dedup row were all cleaned. **created 1 workflow / cleaned all / 0 leaked.** **Cert row:
`slack:channel_created` → `LIVE_PASS` (2026-06-29).**

**Dedup proof: YES.** Synthetic event identity proof: YES (eventId + channel id + name marker on the
fired run's `trigger_event`). Per-trigger result: PASS. Cleanup/leak count: 0 leaked. certificationSeed
update: YES (new LIVE_PASS row).

**Trigger-smoke matrix now:** 62 registered · **8 LIVE_PASS** (`native:schedule.fired` +
`microsoft-excel` ×5 + `microsoft-onenote:new_note` + `slack:channel_created`) · 1 RUN_NOW_PROVEN
(`native:manual.run`) · 1 BLOCKED-documented (`microsoft-onenote:updated_note`) · 52 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke/slackWebhookSmoke.test.ts` → 9 pass; live
`smoke:triggers:webhook` → PASS (above, 0 leaked); `npx tsc --noEmit` → **exit 0 (clean — the parallel
agent-change-history WIP no longer blocks tsc)**; eslint on the 4 touched smoke files → 0; `npm run
lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Does this first webhook smoke prove the Lane C pattern enough to batch similar webhook providers?**
  YES — it proves the reusable seam: a pure orchestrator + a real-deps file that drives the actual
  webhook route with a provider-signed synthetic payload, asserting the full receive→normalize→dispatch→
  enqueue→drain→terminal chain plus dedup and synthetic identity. The next batch is the OTHER signed,
  self-contained-payload webhook providers whose receipt route + normalize are already in place and whose
  event needs no real provider mutation: the remaining **Slack non-content lifecycle** triggers
  (`file_shared` — metadata only) come essentially free on this exact harness (swap the synthetic inner
  event + identity matcher); then per-provider HMAC/secret variants (GitHub `X-Hub-Signature-256`,
  Shopify HMAC, Stripe signed events) once those providers are connected, each reusing this orchestrator
  shape with a provider-specific signer + normalize assertion. Recommend treating webhook providers in
  tiers: (1) Slack lifecycle (no new signer), (2) HMAC-signed self-contained payloads, (3) subscription/
  resource-fetch webhooks (Graph/Drive/Calendar) which need a synthetic resource-state seam and are a
  genuinely larger step.
- **Should excluded webhook triggers remain excluded unless product-safe synthetic semantics are
  explicitly defined?** YES. Keep Lane D exclusions firm: Slack message/reaction/member, Gmail/Outlook
  inbound email, Mailchimp subscriber/campaign, Facebook post/comment all imply user-visible activity,
  message bodies, or PII — a synthetic receipt for them would either fabricate user content or risk a
  user-visible side effect. They stay excluded until a product-safe synthetic semantics is explicitly
  defined per trigger (e.g. a documented "this payload is synthetic and produces no user-visible state"
  contract), not opened by default just because the receipt route exists.

## 14. Slice 7 — Lane C: `slack:file_shared` LIVE-CERTIFIED; Slack safe-synthetic webhook lane DONE (2026-06-29)

The Slack webhook batch. **`slack:file_shared` is LIVE_PASS**, certified on the SAME synthetic
signed-route seam as `channel_created`, now generalized into one spec-driven pattern. This completes the
safe-synthetic Slack webhook lane (the only two Slack webhook triggers whose synthetic payload is
self-contained, metadata-only, and not user-content/user-visible).

**Slack triggers inspected (10 webhook, from §1).** message.channel / .im / .group / .mpim,
reaction_added, reaction_removed, channel_created, member_joined_channel, member_left_channel,
file_shared.

**Selected + why.** `slack:file_shared` (canonical `slack.file_shared`). It is a file/content LIFECYCLE
event, not a message/reaction/member trigger. Its filter takes an optional `channelId` (empty config =
match-all), `normalize.ts` passes the inner event through verbatim (no provider fetch), and — decisively —
[its meta is explicit](../../../../integrations/slack/triggers/fileUploaded/fileUploaded.meta.ts) that the
payload carries ONLY id stubs (`file_id` / `user_id` / `channel_id` + a partial `file:{id}` stub) with NO
name / mimeType / size / url / bytes and NO FileRef (workflows that want metadata or bytes compose
`slack:get_file_info` / `slack:download_file` DOWNSTREAM — out of the trigger path). Every value is
smoke-minted: no real file, user, or channel; no raw bytes; no provider fetch; no send.

**Rejected (stay Lane D, firm).** `message.channel/.im/.group/.mpim` (message bodies = user content),
`reaction_added` / `reaction_removed` (reaction on a real user message), `member_joined_channel` /
`member_left_channel` (real user membership). A synthetic receipt for any of these would fabricate user
content or model a user-visible membership/activity fact — excluded until a product-safe synthetic
semantics is explicitly defined per trigger.

**Harness changes (generalized, NOT a second pattern).** `slackWebhookSmoke.ts` is now spec-driven:
`runSlackWebhookSmoke(deps, spec, opts)` runs the shared flow; a `SlackWebhookTriggerSpec` plugs in the
canonical eventType, the workflow builder, the synthetic inner-event shape, and the identity matcher.
Two specs exported (`CHANNEL_CREATED_SPEC`, `FILE_SHARED_SPEC`) + `ALL_SLACK_WEBHOOK_SPECS`. The DEPS own
the shared envelope + signing + real-route POST (`deliverSyntheticEvent({ identity, innerEvent })`); the
SPEC owns the per-trigger inner event. `channel_created` is unchanged behaviorally (re-certified green
this run). Unit tests parametrize the happy path over both specs + add a file_shared "id-stubs-only"
payload assertion (11 tests); the gated live test loops both specs.

**Receipt path exercised (identical to §13, per spec).** synthetic signed `Request` → real
`POST /api/webhooks/slack` → `receiveSlackWebhook` (real HMAC verify + replay window + JSON parse) →
`normalizeSlackEvent` (canonical `slack.file_shared` TriggerEvent) → `dispatchTriggerEvent` (dedup →
`listForDispatch` → state gate → `enqueueRun`) → `processQueuedRun` → terminal. Production signature
verification UNWEAKENED (genuine HMAC under the real secret; no test-only signer in production code; no
production route behavior added).

**Live result (`ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true npm run smoke:triggers:webhook`):**
```
slack:channel_created → pass · baseline 0 · after 1 · identity matched · succeeded · redeliver 1 · dedup proven · cleaned
slack:file_shared     → pass · baseline 0 · after 1 · identity matched · succeeded · redeliver 1 · dedup proven · cleaned
```
Each fired exactly 1 run via `dispatchTriggerEvent` whose `trigger_event` identified the synthetic event
(channel_created: `event_id` + channel id + name marker; file_shared: `event_id` + `file_id` marker +
`channel_id`), reached terminal `succeeded`, and the re-sent same `event_id` was **dropped by dedup** (the
dispatcher logged `webhook.dedup.duplicate`; run count stayed 1). **created 1 workflow each / cleaned all /
0 leaked.** **Cert row: `slack:file_shared` → `LIVE_PASS` (2026-06-29).**

**Dedup proof:** YES (both). Synthetic identity proof: YES (both). Per-trigger result: PASS (both).
Cleanup/leak: 0 leaked (both). certificationSeed update: YES (`slack:file_shared` LIVE_PASS).

**Trigger-smoke matrix now:** 62 registered · **9 LIVE_PASS** (`native:schedule.fired` +
`microsoft-excel` ×5 + `microsoft-onenote:new_note` + `slack:channel_created` + `slack:file_shared`) · 1
RUN_NOW_PROVEN (`native:manual.run`) · 1 BLOCKED-documented (`microsoft-onenote:updated_note`) · 51
un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke/slackWebhookSmoke.test.ts` → 11 pass; live
`smoke:triggers:webhook` → 2/2 PASS (above, 0 leaked each); `npx tsc --noEmit` → **the only errors are in
a parallel session's agent-change-history WIP (`features/workflow-builder/hooks/useBuilderPreview.ts` +
its two test files) — NOT in any trigger-smoke file (my files type-check clean)**; eslint on the 4 touched
smoke files → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Is the Slack webhook lane complete after this batch?** YES, for what is safely synthetic-certifiable.
  The two Slack webhook triggers whose payload is self-contained, metadata-only, and not user-content/
  user-visible — `channel_created` and `file_shared` — are both LIVE_PASS. The remaining 8 Slack webhook
  triggers are all Lane D (message ×4 = bodies/content, reaction ×2 = on real user messages, member ×2 =
  real user membership). So the Slack webhook lane is **complete modulo the Lane D exclusions** — there is
  no additional Slack webhook trigger that can be driven by a safe synthetic receipt without fabricating
  user content or a user-visible fact.
- **Should remaining Slack triggers stay excluded unless product-safe synthetic semantics are explicitly
  defined?** YES. Keep the Lane D Slack exclusions firm (message/reaction/member). Each fires on a real
  user-content or user-membership fact; a synthetic receipt would either invent message text / a reaction
  on a fabricated message, or assert a fabricated user joined/left — none of which is safe to certify
  without an explicit per-trigger "this payload is synthetic and produces no user-visible state" contract.
  Open them only if/when such a contract is defined, not by default because the receive route exists. The
  next webhook batches should move to OTHER providers (HMAC-signed self-contained payloads like
  GitHub/Shopify/Stripe once connected; then subscription/resource-fetch webhooks which need a synthetic
  resource-state seam) rather than reaching into Slack's excluded set.

## 15. Slice 8 — Lane C frontier: non-Slack webhook classification (DOCS-ONLY, no candidate certifiable) (2026-06-29)

A classification pass over the 33 non-Slack webhook triggers to find the next safe synthetic-route
candidate. **Result: NO clearly-safe connected metadata-only candidate exists this pass — no smoke
authored, no seed change, no production touch.** The recommended unlocks are below.

**Why Slack worked and is (so far) unique.** The Slack synthetic-webhook seam succeeded because Slack
combined FIVE properties at once: (a) a synthesizable GLOBAL signing secret (`SLACK_SIGNING_SECRET`),
(b) a self-contained body (the event IS the data), (c) NO provider fetch in receive/normalize,
(d) registration is a PURE `trigger_resources` upsert — Slack has NO activation hook, so arming creates
NO provider-side subscription and needs NO connected integration, and (e) genuinely metadata-only,
non-user-content lifecycle events (`channel_created`, `file_shared`). No other provider replicates (d)+(e):
**every** non-Slack webhook provider's `registerWorkflowTriggers` runs an activation hook that calls the
provider API to CREATE a subscription/webhook (a real provider-side resource), and **every** non-Slack
webhook event is either user-content / PII / commerce / billing OR requires a provider resource-state FETCH.

**Inspected (33 non-Slack webhook triggers across 19 providers), classified by ACTUAL receipt/normalize path:**

| Provider (triggers) | Verify | Self-contained? | Resource lookup | Activation creates provider sub? | Content | Bucket / blocker |
|---|---|---|---|---|---|---|
| airtable (record_changed) | per-subscription HMAC (macSecret in config, provider-created) | NO — `webhooksListPayloads()` FETCH | yes (by webhook id) | yes (`webhooksCreate`) | metadata-in-ping, data fetched | B subscription+FETCH |
| dropbox (new_file) | global `DROPBOX_CLIENT_SECRET` HMAC | NO — `list_folder/continue` FETCH | by account id in body | yes | file paths fetched | B subscription+FETCH |
| facebook (new_post, new_comment) | global `FACEBOOK_CLIENT_SECRET` HMAC | yes | filter by pageId | yes | post/comment = user content | C/excluded |
| github (new_commit) | global `GITHUB_WEBHOOK_SECRET` HMAC | yes | `?workflowId&nodeId` strict | yes (`hooks` create) | commit msg/author = user content | A-mechanics, but E not-connected + user-content |
| google-calendar (event_changed) | per-channel token (provider-created) | NO — `events.list` FETCH | by channelId header | yes | calendar data fetched | B subscription+FETCH |
| google-docs (new_document, document_updated) | per-channel token | NO — Docs API FETCH | by channelId | yes | doc content | B subscription+FETCH + C content |
| google-drive (file_changed) | per-channel token | NO — `changes.list` FETCH | by channelId | yes | file data fetched | B subscription+FETCH |
| google-sheets (new_worksheet, row_changed) | per-channel token | NO — Sheets API FETCH | by channelId | yes | sheet data fetched | B subscription+FETCH |
| hubspot (webhook_received) | global `HUBSPOT_CLIENT_SECRET` v3 HMAC | yes | `hubspot_app_subscriptions` + refs by portalId | app-level | CRM contact/deal = PII | A-mechanics, but PII + portal-routing model |
| mailchimp (audience_event) | NONE (URL secrecy only) | yes (form body) | `?workflowId&nodeId` + audienceId | yes | subscriber email/merge = PII | excluded (PII) + no signer |
| microsoft-onedrive (file_changed) | per-subscription clientState | NO — Graph FETCH | by subscriptionId | yes | file data fetched | B subscription+FETCH |
| microsoft-outlook (new_email, email_sent, email_flagged) | per-subscription clientState | NO — `/me/messages/{id}` FETCH | by subscriptionId | yes | email body = user content | B+C (inbound email) |
| microsoft-outlook-calendar (event_changed) | per-subscription clientState | NO — Graph FETCH | by subscriptionId | yes | calendar data fetched | B subscription+FETCH |
| microsoft-teams (new_channel_message) | per-subscription clientState | NO — Graph FETCH | by subscriptionId | yes | message text = user content | B+C (message) |
| monday (new_item, column_changed, item_moved, new_subitem, new_update) | global `MONDAY_SIGNING_SECRET` HMAC | yes | `?workflowId&nodeId` strict | yes | board/item/column values = user content | A-mechanics, but E not-connected + F signer MISSING + user-content |
| shopify (webhook_received) | global `SHOPIFY_CLIENT_SECRET` HMAC | yes | `?workflowId&nodeId` strict | yes | order/customer = commerce | A-mechanics, but D commerce + E not-connected |
| stripe (event_received) | global `STRIPE_CLIENT_SECRET` HMAC | yes | `?workflowId&nodeId` strict | yes | payment/customer = billing | A-mechanics, but D billing + E not-connected |
| trello (new_card, card_updated, card_moved, comment_added, member_changed, card_archived) | global `TRELLO_CLIENT_SECRET` HMAC over `body+callbackURL` | yes | `?workflowId&nodeId` strict | yes (`webhooksCreate` on a real board) | board/card/comment = user content | A-mechanics (CONNECTED), but user-content + sig binds callbackURL |
| discord (slash_command) | global Ed25519 (`DISCORD_INTERACTIONS_PUBLIC_KEY`) | yes | by commandName | app-level | interactive command args | excluded (interactive) + E not-connected + F key MISSING |

**Env signer presence (names only, this turn):** present — `GITHUB_WEBHOOK_SECRET`, `TRELLO_CLIENT_SECRET`,
`SHOPIFY_CLIENT_SECRET`, `STRIPE_CLIENT_SECRET`, `DROPBOX_CLIENT_SECRET`, `FACEBOOK_CLIENT_SECRET`,
`HUBSPOT_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`. MISSING — `MONDAY_SIGNING_SECRET`,
`DISCORD_INTERACTIONS_PUBLIC_KEY`.

**Bucket roll-up (task taxonomy):**
- **HMAC self-contained synthetic payload (good mechanics):** github, monday, shopify, stripe, trello,
  (+ facebook, hubspot mechanically but content-excluded). These reuse the Slack orchestrator shape with a
  per-provider signer + `?workflowId&nodeId` routing.
- **Provider subscription / resource-FETCH webhook (need a synthetic resource-state seam):** airtable,
  dropbox, all Google (calendar/docs/drive/sheets), all Microsoft Graph (onedrive/outlook/
  outlook-calendar/teams). These deliver a thin notification and FETCH the change — a synthetic receipt
  would have to stub/short-circuit the provider fetch, a genuinely larger harness investment.
- **Inbound / user-content:** microsoft-outlook (email), microsoft-teams (message), facebook
  (post/comment), google-docs (doc).
- **Billing / commerce:** shopify, stripe.
- **Provider not connected on the smoke account:** discord, github, monday, shopify, stripe.
- **Missing safe synthetic signer (env):** monday, discord.
- **Missing trigger-resource / operator setup:** the Google/Microsoft channel/clientState subscriptions +
  airtable macSecret are provider-created at activation; a smoke would need them seeded.

**Selected candidate: NO.** Every non-Slack webhook trigger fails at least one HARD gate for a "clearly
safe, connected, route-level synthetic" smoke: provider-fetch/resource-state (all Google/MS + airtable +
dropbox), user-content/PII (facebook, outlook, teams, hubspot, mailchimp, trello, github, monday),
commerce/billing (shopify, stripe), not-connected (discord, github, monday, shopify, stripe), or
missing-signer (monday, discord). The closest mechanics (signed + self-contained + no fetch) are
github/monday/shopify/stripe/trello, but each additionally needs a content-safety decision and/or a
connection/signer unlock — none clears the "clearly safe" bar this pass.

**Exact unlocks required (so a future slice can proceed deterministically):**
1. **A per-trigger "synthetic-content contract"** — an explicit, documented statement that a given
   trigger's payload may be fully smoke-minted and produces no user-visible state (the same bar Slack
   `channel_created`/`file_shared` implicitly met). Without it, github/monday/shopify/stripe/trello stay
   excluded because their real payloads are user-content/commerce.
2. **A "direct-seed arm" decision** — allow the smoke to seed the `trigger_resources` row directly
   (provider + eventType + `?workflowId&nodeId` config + any signer-bound field like Trello's
   `callbackURL`) INSTEAD of running the real activation hook, so NO real provider webhook/subscription is
   created. (The Slack smoke used the real hook only because Slack has none; for these providers the real
   hook would create a real provider-side resource.) This keeps the DISPATCH surface 100% real while
   avoiding a provider mutation, mirroring how the smoke already sets `state="active"` directly.
3. **Provider connection** for github / monday / shopify / stripe IF a future slice insists on the real
   activation hook rather than direct-seed.
4. **`MONDAY_SIGNING_SECRET`** (and `DISCORD_INTERACTIONS_PUBLIC_KEY` if discord is ever in scope) in the
   smoke env.
5. **A synthetic resource-state seam** for the Google/Microsoft Graph family: a way to register a synthetic
   subscription (channelId / subscriptionId + token/clientState) AND stub the post-receipt provider FETCH,
   so the dispatch fires without a live provider read. This is the larger investment and is its own project.

**certificationSeed update:** NO. **Trigger-smoke matrix unchanged:** 62 registered · 9 LIVE_PASS · 1
RUN_NOW_PROVEN · 1 BLOCKED-documented · 51 un-harnessed.

**Verification (this pass, docs-only):** `npm run lint:structure` → OK. `npx tsc --noEmit` → **exit 0
(clean)**. EARLIER in this pass tsc was blocked by the unrelated parallel agent-change-history WIP
(`features/workflow-builder/hooks/useBuilderPreview.ts` lines 248/355/360 `ConfigDiff` not assignable to
`Record<string,unknown>`, plus `AgentChangesPanel.test.tsx` and `agentChangeHistory.test.ts`
`diff` optional-vs-nullable); that parallel session has since fixed it and tsc is now exit 0. This pass is
docs-only and could not affect tsc regardless. eslint: docs-only, no code targets. **No db:push, no
deploy, nothing pushed.**

### Owner review answers

- **Should the next real coding slice be HMAC-self-contained providers OR the Google/Microsoft
  resource-state webhook seam?** Recommend **HMAC-self-contained first** — it reuses the proven Slack
  orchestrator shape almost verbatim (swap the signer + use `?workflowId&nodeId` routing + direct-seed the
  `trigger_resources` row to avoid creating a real provider webhook), so it is the cheaper, lower-risk next
  step. But it is NOT free: it is gated on unlock #1 (a per-trigger synthetic-content contract — because
  every one of these payloads is user-content/commerce) and unlock #2 (the direct-seed-vs-real-activation
  decision). The Google/Microsoft resource-state seam (unlock #5) is a genuinely larger harness investment
  (synthetic subscription + clientState + a stubbed provider fetch) AND still terminates at user-content
  (calendar events / files / messages), so it should come later. Concrete first target once unlocks #1+#2
  land: **GitHub `new_commit`** via direct-seed (no real GitHub webhook, `GITHUB_WEBHOOK_SECRET` already in
  env, fully smoke-minted synthetic push), as the cleanest mechanics; defer commerce/billing entirely.
- **Should commerce/billing webhooks stay out of trigger-smoke unless explicitly separated?** YES. Keep
  `shopify:webhook_received` and `stripe:event_received` OUT of the general workflow-trigger matrix. Their
  events model orders / payments, and certifying them in the trigger lane risks conflating workflow-trigger
  DISPATCH proof with commerce/billing side-effect semantics (and Stripe already has a separate
  billing-webhook surface at `/api/webhooks/stripe-billing`). If trigger-dispatch for these is ever needed,
  do it as a SEPARATE, clearly-labeled commerce-webhook smoke with fully synthetic order/payment ids and an
  explicit no-real-charge/no-real-order contract — never mixed into the general trigger certification.

## 16. Slice 9 — Lane C: first DIRECT-SEEDED HMAC webhook cert, `github:new_commit` LIVE_PASS (2026-06-29)

The first non-Slack webhook cert and the proof of the **direct-seed** contract the §15 frontier pass
recommended. **`github:new_commit` is LIVE_PASS for the route/dispatch path** — receive → HMAC verify →
normalize → dispatchTriggerEvent → dedup → enqueue → drain → terminal — driven by a fully synthetic,
HMAC-signed GitHub push with NO GitHub API call and NO real webhook.

**Selected trigger + why.** `github:new_commit` (eventType `new_commit`): HMAC-signed
(`X-Hub-Signature-256` over the raw body, keyed with the global `GITHUB_WEBHOOK_SECRET` — already in env),
self-contained push payload that `normalize.ts` passes through with NO provider fetch, fully smoke-mintable
(synthetic owner / repo / sha / message), no commerce/billing, no send, no raw bytes, and a deterministic
`X-GitHub-Delivery` UUID for dedup. The cleanest mechanics among the HMAC self-contained providers.

**DIRECT-SEED contract (honest scope — what is and is NOT certified).** GitHub's real
`registerWorkflowTriggers` runs an activation hook that calls the GitHub API to CREATE a repo webhook
(needs a connected integration + a real repo). That is out of scope and unsafe for a smoke. So the harness
**direct-seeds** the minimum `trigger_resources` row the receive route + dispatcher look up
(`triggerResourcesRepo.upsert`: provider `github`, eventType `new_commit`, keyed by workflowId+nodeId,
empty config) and cleans it up with `deleteByWorkflow` — NEVER running the activation/deactivation hooks,
so ZERO GitHub API calls and NO real webhook created.
- **CERTIFIED:** receive → `X-Hub-Signature-256` HMAC verify → normalize → `dispatchTriggerEvent` → dedup →
  durable enqueue → drain → terminal run.
- **NOT certified:** GitHub provider-side subscription activation (webhook create/delete via the GitHub
  API). Recorded as a route/dispatch synthetic-webhook cert, not an activation cert.

**Harness (parallel-shaped to the Slack seam, GitHub-specific contract):**
- [githubWebhookSmoke.ts](../../../../tests/trigger-smoke/githubWebhookSmoke.ts) — pure injectable
  orchestrator (mint synthetic identity → active workflow → DIRECT-SEED row → assert canonical event_type →
  baseline 0 → deliver synthetic signed push → exactly-1-run → identity match → drain → terminal → re-send
  same delivery id → dedup holds → cleanup) + `buildGitHubNewCommitSmokeWorkflow()`.
- [githubWebhookSmokeDeps.ts](../../../../tests/trigger-smoke/githubWebhookSmokeDeps.ts) — real deps:
  service-role active-workflow insert, `triggerResourcesRepo.upsert` direct-seed, **deliver via a synthetic
  push signed with the REAL `GITHUB_WEBHOOK_SECRET` POSTed to the REAL
  `POST /api/webhooks/github?workflowId&nodeId`**, runs via service-role diagnostics readers, drain via
  `processQueuedRun`, cleanup via `deleteByWorkflow` (no deactivation hook) + soft-delete + dedup-row delete.
- Unit tests ([githubWebhookSmoke.test.ts](../../../../tests/unit/trigger-smoke/githubWebhookSmoke.test.ts),
  9, fakes — happy path + 8 failure branches) + gated live integration test; `smoke:triggers:webhook`
  extended to run slack + github.

**Receipt path exercised (real).** synthetic signed `Request` with `?workflowId&nodeId` → real
`POST /api/webhooks/github` → `receiveGitHubWebhook` (real `verifyGitHubSignature` HMAC over raw body +
`findByWorkflowAndNode` row lookup + push-event routing) → `normalizeGitHubEvent` (eventId = the
`X-GitHub-Delivery` UUID, eventType `new_commit`) → `dispatchTriggerEvent` (dedup → `listForDispatch` →
state gate → `enqueueRun`) → `processQueuedRun` → terminal. Production verification UNWEAKENED (genuine
HMAC under the real secret; no test-only signer in production code; no production route behavior added).

**One real finding, fixed honestly.** The first live attempt fired exactly 1 run with the correct synthetic
identity (dispatch proven) but the run drained to `failed` with `WORKFLOW_NOT_READY /
MISSING_REQUIRED_FIELDS`: `github:new_commit` has a REQUIRED `repository` builder field, and the smoke's
empty trigger config tripped the pre-execution readiness gate (Slack's certified triggers have no required
fields, so they never hit this). Fixed by setting a fixed synthetic `repository: "crsmoke-owner/crsmoke-repo"`
in the trigger node config — a readiness placeholder only; the receive route never reads it (it reads only
the optional `branch` filter), and the per-run synthetic repo identity rides in the push payload. This was a
real readiness-gate behavior the smoke surfaced and accommodated, not a product bug.

**Live result (`ALLOW_DB_INTEGRATION_TESTS=true ALLOW_TRIGGER_SMOKE=true npm run smoke:triggers:webhook`):**
```
github:new_commit     → pass · seed new_commit · baseline 0 · after 1 · identity matched · succeeded · redeliver 1 · dedup proven · cleaned
slack:channel_created → pass (re-cert)
slack:file_shared     → pass (re-cert)
```
The push fired exactly 1 run via `dispatchTriggerEvent` whose `trigger_event` identified the synthetic
delivery (`X-GitHub-Delivery` UUID + `repository` + `head_commit.id` sha), reached terminal `succeeded`, and
the re-sent same delivery id was **dropped by dedup** (the dispatcher logged `webhook.dedup.duplicate`; run
count stayed 1). **created 1 workflow / cleaned seeded row + workflow + dedup row / 0 leaked.** **Cert row:
`github:new_commit` → `LIVE_PASS` (2026-06-29).**

**Dedup proof:** YES. Synthetic identity proof: YES. Per-trigger result: PASS. Cleanup/leak: 0 leaked.
certificationSeed update: YES (`github:new_commit` LIVE_PASS, scoped as route/dispatch not activation).

**Trigger-smoke matrix now:** 62 registered · **10 LIVE_PASS** (`native:schedule.fired` +
`microsoft-excel` ×5 + `microsoft-onenote:new_note` + `slack:channel_created` + `slack:file_shared` +
`github:new_commit`) · 1 RUN_NOW_PROVEN (`native:manual.run`) · 1 BLOCKED-documented
(`microsoft-onenote:updated_note`) · 50 un-harnessed.

**Verification (this slice):** `tests/unit/trigger-smoke/githubWebhookSmoke.test.ts` → 9 pass; live
`smoke:triggers:webhook` → 3/3 PASS (above, 0 leaked each); `npx tsc --noEmit` → exit 0; eslint on the 4
touched smoke files + seed → 0; `npm run lint:structure` → OK. **No db:push, no deploy, nothing pushed.**

### Owner review answers

- **Is the direct-seeded webhook smoke acceptable as dispatch-path certification?** YES, with the scope
  recorded honestly. The direct-seed certifies exactly the surface it claims — receive/verify/normalize/
  dispatch/dedup/enqueue/drain/terminal — which is the workflow-trigger DISPATCH path. It deliberately does
  NOT certify provider-side subscription activation (the GitHub-API webhook create/delete), and the cert
  note + harness header + this section all state that boundary explicitly. This is the same honesty bar as
  `native:manual.run` (RUN_NOW_PROVEN, not a dispatch cert) and `microsoft-onenote:updated_note` (BLOCKED).
  The direct-seed is also strictly SAFER than running the real activation (no provider mutation, no real
  webhook to leak). Recommend keeping a per-provider "activation certified? yes/no" column in mind: for
  webhook providers with API-created subscriptions, the activation surface is a separate future smoke
  (would need a connected integration + a real, cleanable provider resource).
- **Does `github:new_commit` open the door to other HMAC self-contained providers (keeping commerce/billing
  separate)?** YES. The direct-seed + provider-signer + synthetic-payload + identity-matcher shape now
  generalizes to the other HMAC self-contained, non-commerce providers — next candidates: **Monday** (5
  triggers; needs `MONDAY_SIGNING_SECRET` in env first) and **Trello** (6 triggers; connected, secret in
  env, but its HMAC binds the stored `callbackURL`, so the seeded config must carry a known callbackURL and
  the signer must include it). Each still needs the per-trigger synthetic-content contract (their payloads
  carry board/item names). **Keep commerce/billing (`shopify:webhook_received`, `stripe:event_received`)
  OUT** of this lane — even though their mechanics fit, certifying them here would conflate trigger-dispatch
  proof with order/payment semantics; do them (if ever) as a separate commerce-webhook smoke with an
  explicit no-real-charge contract. The Google/Microsoft resource-state webhooks remain the larger,
  separate seam (synthetic subscription + clientState + stubbed provider fetch).
