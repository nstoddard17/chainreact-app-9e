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
