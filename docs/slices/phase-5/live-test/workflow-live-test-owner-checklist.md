# WORKFLOW-LIVE-TEST-4 — Owner Live-Test Checklist (Gmail `new_email`)

**Status:** implemented + unit/integration verified locally · **live owner pass: NOT yet run**
**Branch:** `workflow-live-test-1` (local worktree, not pushed)
**Continues:** WORKFLOW-LIVE-TEST-2/3 (readiness, sessions, disclosure, authorization — commits
`5a022c695…d9af0e5f0`, all preserved unchanged).

## What this batch shipped

The first complete user-facing live-test journey, for `gmail:new_email`:

- **Gmail live-capture adapter** — `integrations/gmail/triggers/newEmail/liveCapture.ts`,
  registered in the trigger's `index.ts` beside its polling/activation registrations. Reuses the
  production trigger's schema/filters/hydration so the captured event is byte-identical to a real
  dispatch; touches **no** production state (no `trigger_resources`, no `webhook_event_dedup`).
- **Serverless capture loop** — the session **status poll is the loop**
  (`services/workflows/liveTest/orchestrationService.ts`). Each authenticated owner poll of
  `GET /api/workflows/[id]/live-test/[sessionId]` performs ONE bounded advancement tick
  server-side: a capture attempt while listening, then execution authorization once captured,
  then an `after()` kick of the canonical queue drain. The `process-run-queue` cron remains the
  durability net. No resident worker, no new cron.
- **Builder UI** — `Run Live Test` button on automated workflows (`HeaderRunControls`), the
  disclosure/consent modal, waiting UI with countdown + cancel, safe capture preview, terminal
  outcomes (`features/workflow-builder/live-test/`). Validation-first: a blocked pre-flight opens
  the setup summary and calls no live-test API.
- **Runs labeling** — a run authorized by a consumed live-test session shows a distinct
  **Live test** badge (builder Runs tab, run detail, and the account `/runs` page) instead of the
  plain **Test** badge, because a live test made real external calls.

## Prerequisites for the live pass

1. A signed-in account with an **active Gmail connection** (Apps → Gmail).
2. An **inactive** workflow whose trigger is `gmail:new_email` (filters optional — remember the
   default label filter is `INBOX`) with at least one configured action, fully passing readiness
   (no setup-needed badges).
3. The app running (prod deploy or `npm run dev`). No cron is required for capture; the
   `process-run-queue` cron (or the status route's inline drain) executes the run.
4. A second mailbox (or any sender) able to send a matching email to the connected inbox.

## The journey to verify (check every step)

- [ ] 1. Open the configured automated workflow in the builder. The header shows
        **Test Workflow** and **Run Live Test**; the workflow shows as inactive.
- [ ] 2. Select **Run Live Test**. The disclosure modal lists the trigger read + every real
        external effect (send-like steps flagged "May not be reversible"), plus the four fixed
        consent statements. Nothing has executed yet (check the Runs tab — no new run).
- [ ] 3. Close the modal once (nothing should happen server-side beyond an abandoned
        awaiting-consent session), then reopen — prepare should reuse/replace cleanly.
- [ ] 4. Select **Start listening** (the explicit consent). The waiting state shows a ~5:00
        countdown and a **Cancel live test** button.
- [ ] 5. **Cancel** once, and confirm the honest "nothing was executed" outcome. Start a new
        live test for the real pass.
- [ ] 6. Send a **matching** Gmail message to the connected inbox. Within ~10–20 s the modal
        should show "Event captured" with ONLY sender / subject / received time, then
        "Workflow is running…".
- [ ] 7. The workflow executes ONCE through the real runtime: verify the action's real external
        effect happened (e.g. the email actually sent) exactly once.
- [ ] 8. Open the resulting run (builder Runs tab): it is labeled **Live test** (not "Test"),
        steps show real statuses, and the run also appears on `/runs` with the same label.
- [ ] 9. Confirm the workflow is **still inactive** afterwards, and that sending a second
        matching email does nothing (session consumed; no trigger resources exist).

## Also worth checking during the pass

- [ ] A non-matching email (wrong subject/sender if filters are set) is ignored — the modal
      keeps waiting.
- [ ] Letting the 5-minute window lapse ends with the honest "No matching event arrived in
      time" outcome, no run, and no task usage.
- [ ] Editing the workflow between the disclosure and Start is refused with "review again"
      (stale definition).
- [ ] On a task-limited account the modal shows the usage-limit advisory and the captured event
      runs after upgrading, without re-capturing.

## Known limitations (deliberate scope)

- Only `gmail:new_email` has a capture adapter; every other trigger gets the typed
  "Live trigger capture is not yet supported" refusal at prepare.
- Capture advances only while the owner's builder tab is polling the session status (each poll
  = one bounded Gmail read on the owner's own quota). Closing the tab pauses progress; the
  session TTL still expires it honestly.
- The listening window is 5 minutes (`LISTENING_WINDOW_MS`); the consent window is 10 minutes.
- A stale Gmail history cursor mid-listen degrades to waiting (bounded by the TTL) rather than
  re-snapshotting, because the waiting contract cannot persist a new baseline.

## Verification actually run (2026-07-31, this worktree)

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors (33 pre-existing warnings; `workflowLiveTestSessions.ts` crossed the
  400-line max-lines warning with the new batch lookup).
- `npm run lint:structure` — 1 violation: `docs/slices/phase-5` at 51 files, **pre-existing at
  the base commit**; this doc deliberately lives in a `live-test/` subfolder to avoid worsening it.
- `npm run lint:migrations` — OK (no migrations in this batch).
- Focused Jest suites, all passing:
  - `tests/unit/integrations/gmail/triggers/newEmail/liveCapture.test.ts` (11 tests)
  - `tests/unit/services/workflows/liveTest/` + `tests/unit/app/api/workflows/live-test-routes.test.ts` (85 tests incl. the new advancement-loop block)
  - `tests/unit/features/workflow-builder/live-test/liveTestJourney.test.tsx` (8 tests)
  - `tests/unit/app/api/workflows/ + services/execution/ + repositories/workflowLiveTestSessions + workflow-builder/layout` (856 tests)
  - `canvas/ + features/runs/ + app/runs/ + gmail/ + services/triggers/` (1163 tests)
- **No live provider pass has been run** — that is exactly what this checklist is for.
