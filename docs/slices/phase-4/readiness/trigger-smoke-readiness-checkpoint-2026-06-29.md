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
