# 4.V2-READY — Existing App Readiness Audit

**Type:** Audit + prioritized repair/testing plan (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Scope:** assess what ALREADY exists and whether it works. No new features, no new providers.

> **Verdict — READY with caveats (yellow-green).** The app is strong at the
> unit/integration layer: **full `npx jest` = 17,939 passed / 181 skipped / 0
> failed (1,577 suites; 39 suites skipped), measured this session.** The
> consistent pattern across every area is **deep unit/component coverage, thin
> true end-to-end coverage of interactive flows**, plus **one real reliability
> risk** (orphaned `running` runs) and **one real UX gap** (no connection
> health/expiry surfacing). No high-severity security gap found; the recent
> APPS-PERM + no-leak work holds.

> **CORRECTION (V2-READY-1, 2026-06-14).** Follow-up investigation **disproved two
> claims below** — recorded here for honesty (the inline §2/§3 rows are superseded
> by this note):
> 1. **Orphaned `running` runs is NOT an open risk.** The stale-run sweep IS
>    auto-scheduled: `app/api/cron/sweep-stale-runs` runs **every 10 min** via
>    `vercel.json` crons (COST-15K), cron-secret guarded, idempotent, no-leak, and
>    tested at service/route/repo layers. The "appears NOT auto-scheduled" reading
>    came from a single **stale code comment** (since corrected). A schedule-guard
>    test was added so dropping the cron now fails CI. The engine also always
>    finalizes to a terminal status (succeeded/failed) on every path — proven in
>    `tests/unit/services/execution/engine.test.ts`.
> 2. **The execution engine DOES have dedicated unit tests** — the 2,810-line
>    `engine.test.ts` covers success, handler-throw, missing-variable/handler,
>    structural fatals, billing-exhaustion, and persist-failure-swallowed terminal
>    behavior. Treat the §2/§3 "no engine unit tests" notes as superseded.
>
> Net: backlog #1 is **closed** (verified + guarded, not a fix); the next live risk
> is now **#2 connection health/expiry**.

---

## 1. Files / surfaces inspected

Four parallel read-only sweeps + a full test run. Key paths:
- **Auth/account/team/settings:** [`services/accounts/activeAccount.ts`](../../../services/accounts/activeAccount.ts), [`accountAuthz.ts`](../../../services/accounts/accountAuthz.ts), [`accountFreeze.ts`](../../../services/accounts/accountFreeze.ts), [`leaveAccount.ts`](../../../services/accounts/leaveAccount.ts), [`membership.ts`](../../../services/accounts/membership.ts), [`invitations.ts`](../../../services/accounts/invitations.ts), `components/app-shell/useAccountSwitcher.ts`, `app/account/page.tsx`, `app/team/page.tsx`, `components/app-shell/NotificationBell.tsx`.
- **Apps/integrations:** `features/apps/AppCard.tsx` + `AppsDashboard.tsx`, `app/apps/_shared.ts`, connect/callback/reconnect/disconnect routes + services, `core/integrations/credentialSharing.ts`.
- **Dashboard/builder:** `app/workflows/page.tsx`, `features/workflows/WorkflowsDashboard.tsx`, `features/workflow-builder/**` (graph/config/run slices, ConfigModalShell, SchemaForm, variable picker), `services/workflowFolders/*`, `services/workflows/{saveDraftDefinition,lifecycleOrchestrator}.ts`.
- **Execution/runs/native:** `app/api/workflows/[id]/run-now/route.ts`, `services/execution/{engine,enqueue,runPersistence,staleWorkflowRunSweep}.ts`, `services/triggers/dispatch.ts`, `integrations/native/**`, `services/execution/handlers/_handlerInventory.ts`.
- **Tests:** `tests/{unit,integration,e2e,structure}/**` (1,616 files) + full-suite run.

Providers (areas 2/7) reuse the [provider-inventory-and-next-app.md](./provider-inventory-and-next-app.md) finding: all 25 providers enabled, classified, registered, Apps-visible, STRONG unit-tested.

---

## 2. Readiness by area

Legend — **Solid** (works + well-tested), **Smoke** (works; needs manual/e2e verification), **Tests** (needs automated coverage), **Fix** (likely needs a code change).

| # | Area | State | Notes |
|---|---|---|---|
| 1 | Auth / account / workspace switching | **Solid** (logic) / **Smoke + Tests** (UI) | Resolver, role gate, frozen-account behavior STRONG unit-tested. Switch is reload-based; **no e2e of the switch path**. `explicitAccountId` plumbed but not yet route-wired (forward-compat). |
| 2 | Apps / integrations | **Solid** (logic) / **Tests** (real flow) | All states + no-leak pinned at component/unit level. **No integration/e2e for connect→callback→DB-row→UI**; reconnect/disconnect tested unit-only. |
| 3 | Workflow dashboard | **Solid** (logic) / **Smoke** (UI) | List/grid/folders/trash/filters/bulk/run-stats fully wired, STRONG unit+integration. Account-scoped. **No e2e** of folder/trash/bulk interactions. Minor: trash 7-day window constant lives in TS not schema. |
| 4 | Workflow builder | **Solid** (logic) / **Smoke + Fix(minor)** | Graph/config/lifecycle/variable-picker STRONG unit+integration. **No e2e** of create→configure→activate. Gaps: no graph undo; opaque option-resolver "disconnected" error; single-level `dependsOn` cascade only. |
| 5 | Execution / runs | **Solid** (happy path) / **Fix(reliability) + Tests** | Single V2 engine (`services/execution/engine.ts`), terminal-status via `after()` keepAlive. **RISK: in-process fire-and-forget queue; stale-running sweep appears NOT auto-scheduled** → orphaned `running` rows on instance restart. Engine/dispatch have **no dedicated unit tests** (e2e-only). |
| 6 | Native triggers/actions | **Solid** | manual + scheduled triggers; http_request / format_transformer / delay / if_then / router. Variable threading verified by Playwright e2e. delay capped ≤30s (deferred). |
| 7 | Provider actions/triggers | **Solid** | 25 providers STRONG unit-tested; 30+ Playwright provider slices (mocked backends). Real-OAuth round-trip not exercised. |
| 8 | Team / collaboration | **Solid** (logic) / **Tests** | CONN-SHARE gate, duplicate/use-own-connection path, creator-only, member offboarding (revoke→unbind→disconnect→remove) STRONG unit-tested. **No e2e** of share→non-creator-run, or duplicate-reassigns-connection. |
| 9 | Notifications / settings / team pages | **Solid** (logic) / **Smoke** | Bell, account settings, team page, invite/member mgmt wired + unit-tested. Bell is **page-load snapshot (no realtime)**; only mark-all-read; invites have **no email delivery** (token returned once, by design). |
| 10 | Testing / deployment readiness | **Mixed** | Strong unit + a real Playwright e2e layer for execution/providers. **Gaps:** no e2e for account-switch / apps-connect-UI / team-mgmt / dashboard / builder interactions; **no sad-path e2e**; **no production smoke checklist**; **39 skipped suites / 181 skipped tests untriaged**. |

### Already solid (do not re-litigate)
Account resolver + role/owner-admin gating; frozen-account safety across routes/services; member offboarding ordering; no-leak DTO + error posture (pinned); APPS-PERM permission model; dashboard list/folder/trash logic; builder graph/config/lifecycle logic; native nodes + runtime variable resolution; provider action/trigger unit + e2e happy paths. 17,939 passing tests.

### Needs manual smoke (works in code; unverified end-to-end)
Account switch (select team → reload → scoped correctly); apps connect→callback→row appears (real OAuth); team invite/remove/role-change; builder create→add nodes→configure→activate→run; account deletion request/cancel; notification bell interaction.

### Needs automated tests
e2e for all of the above interactive flows; **sad-path e2e** (billing exhaustion, token expiry mid-run, handler timeout, stale-run recovery, missing-connection); **engine + dispatch unit tests** (cyclic graph, malformed `branchTaken`, credential-lookup failure); missing webhook **route** tests for `google-drive` + `google-sheets`; triage of the 39 skipped suites.

### Likely needs fixes
1. **Auto-schedule the stale-running sweep** (or confirm it's wired) so runs always reach a terminal state. 2. **Surface connection health/expiry** so a stale token prompts reconnect instead of failing silently (scope carefully — see §6 do-not list). 3. Minor builder UX (graph undo, option-resolver reconnect link).

---

## 3. Top risks

1. **[HIGH — reliability] Orphaned `running` runs.** Execution is in-process fire-and-forget; the terminal-status safety net (`staleWorkflowRunSweep.ts`, 60-min) is **not auto-scheduled per its own code comment**. A serverless restart between enqueue and finalize leaves a `running` row hidden from the UI (history filters `status != running`). `after()` keepAlive covers the normal case only. → A run can silently never reach terminal status.
2. **[HIGH — UX/correctness] No connection health/expiry signal.** Reconnect is purely manual; expired tokens fail workflows at runtime with opaque errors. The V2 Apps surface explicitly deferred health (`AppStatusPill`/`AppsStatCards`/`AppsToolbar` comments). For teams with many connections this is real TOIL.
3. **[MEDIUM — test integrity] No e2e for interactive flows + no sad-path e2e.** Account switch, apps connect UI, team management, dashboard, builder, and all failure paths can break without a failing test. Coverage is unit/component-deep but interaction-shallow.
4. **[MEDIUM — test integrity] Engine/dispatch have no dedicated unit tests.** The riskiest core logic is validated only via e2e happy paths; edge cases are unguarded.
5. **[MEDIUM — deploy] No production smoke checklist.** No documented pre-launch verification (OAuth connect→run, webhook dispatch, scheduled cron, terminal-status, error notifications).
6. **[LOW — hygiene] 39 skipped suites / 181 skipped tests untriaged.** Could hide real coverage holes or known-broken flows.

---

## 4. Top 10 prioritized repair/testing backlog

Ordered by (reliability/correctness impact × confidence) ÷ effort.

1. **Guarantee terminal run status.** Verify whether `staleWorkflowRunSweep` is scheduled; if not, wire it as a cron + emit a metric. Add a unit test that a stuck `running` row past the window is swept to failed. *(Fix + test; small; HIGH value.)*
2. **Engine terminal-status + error-path unit tests.** Direct tests for `engine.ts`: handler failure → failed terminal; MissingVariable → halt+failed; missing handler; cyclic-graph guard; malformed `branchTaken`. *(Test; medium.)*
3. **Triage the 39 skipped suites / 181 skipped tests.** Classify each as obsolete / env-gated / known-broken; un-skip or document. *(Test/hygiene; small-medium.)*
4. **Apps connect→callback→row integration test.** One integration test with a mocked token endpoint asserting `upsertActive` writes the row to the **state-bound account** (closes the biggest real-flow gap). *(Test; medium.)*
5. **Production smoke checklist doc + minimal Playwright smoke** for: connect a provider, build → activate → manual run reaches terminal, scheduled cron fires, error notification path. *(Test/docs; medium.)*
6. **Sad-path e2e/integration:** billing-exhaustion run marks failed + persists usage; missing-connection run fails cleanly; handler-timeout bound. *(Test; medium.)*
7. **Account-switch + team-management e2e** (select account → scoped list; invite/remove/role). *(Test; medium.)*
8. **Builder create→configure→activate→run e2e** (the core authoring loop). *(Test; medium-large.)*
9. **Missing webhook route tests** for `google-drive` + `google-sheets` (receive modules exist, route tests don't). *(Test; small.)*
10. **Connection health/expiry — minimal version (needs Marcus decision).** At minimum, on a runtime auth failure, flag the integration so the Apps card shows a "Reconnect needed" state. Scope tightly; the full proactive health-check system is explicitly **out of scope** (§6). *(Fix; medium; gated on decision.)*

---

## 5. Recommended next implementation slice

**V2-READY-1 — Guarantee terminal run status (reliability fix + tests).**
- **Why:** #1 risk, in-scope (core execution, not AI/MCP/billing), small, and a correctness guarantee users feel ("my run is stuck forever").
- **Do:** (a) verify the stale-running sweep's scheduling (cron registry / `vercel.json` / cron route). If unscheduled, wire it to run on an interval and emit a structured metric. (b) Add unit tests: a `running` row older than the window is swept to a terminal failed status with the right code; a fresh `running` row is left alone. (c) Add the engine terminal-status unit tests from backlog #2 in the same slice (they share fixtures).
- **Guardrails:** no migration; no new product feature; no AI/MCP/billing; if wiring the cron turns out to need infra that doesn't exist, **stop and report** — fall back to a test-only + doc slice that pins current behavior and documents the manual ops step.
- **If Marcus prefers zero behavior change first:** start with **V2-READY-0 (pure test hardening)** = backlog #2 + #3 + #9 (engine/dispatch unit tests, skip-triage, missing webhook route tests). Zero risk, raises the safety net before any fix.

---

## 6. "Do NOT work on yet" (prevent drift)

- **No new providers** (Asana/Linear/etc. — APP-ADD direction is paused).
- **No new product features.** No realtime notifications, no per-notification read UI, no invite-email delivery, no team/org deletion UI, no graph undo stack, no fuzzy search — all noted as gaps, none are readiness blockers.
- **No durable-queue migration** (BullMQ/Inngest). The terminal-status fix (V2-READY-1) is the bounded reliability win; replacing the execution queue is a large architecture project, separate.
- **No full proactive health-check system.** Backlog #10 is a *minimal* reconnect-flag only, and only with Marcus's go-ahead; the V1-style health state machine is out of scope here.
- **No AI / MCP / billing work** (Check-workflow/Explain/Repair, MCP, overage/packs). The parallel chat owns the AI-REPAIR files in the tree — do not touch.
- **No push / deploy / db:push / migration.**

---

## 7. Closeout confirmation

Docs-only. No source/test/migration/UI changed. Nothing pushed. No `db:push`. No
AI/MCP/billing change. The parallel chat's in-flight AI-REPAIR files were not
touched. Test baseline (17,939 pass / 181 skip / 0 fail) was **measured this
session** via full `npx jest`. Doc path:
`docs/slices/phase-4/v2-existing-app-readiness-audit.md`.
