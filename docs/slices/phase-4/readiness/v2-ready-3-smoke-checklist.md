# 4.V2-READY-3 — Smoke Checklist + Minimal Smoke Harness Audit

**Type:** Audit + runbook + minimal test addition. Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Companion runbook:** [`docs/runbooks/v2-smoke-testing.md`](../../../runbooks/v2-smoke-testing.md) (the reusable operational contract).
**Parent:** [../v2-existing-app-readiness-audit.md](../v2-existing-app-readiness-audit.md) backlog #5 ("Production smoke checklist doc + minimal Playwright smoke").

> **Verdict.** V2 already has a **mature production smoke harness** —
> `playwright.smoke.config.ts` + `tests/smoke/` with public / auth-setup /
> authenticated projects, a sanitized MCP artifact, prefix-guarded cleanup, and a
> two-key execution opt-in. Backlog #5's "minimal Playwright smoke" is **largely
> already built**, not missing. The real deliverable here is a **documented contract**
> (the runbook) plus closing two small, low-risk automation gaps. Anything needing
> multi-user/team or real-OAuth fixtures is **documented as a follow-up, not built**
> in this slice.

---

## 1. Existing smoke / e2e tooling found

| Surface | Where | Notes |
|---|---|---|
| Production smoke config | [`playwright.smoke.config.ts`](../../../../playwright.smoke.config.ts) | Targets a deployed origin; no webServer, no provider mocks; `workers:1`. Projects: `public`, `auth-setup`, `authenticated`. |
| Smoke specs | [`tests/smoke/`](../../../../tests/smoke) | `public.smoke.spec.ts`, `auth.setup.ts`, `authenticated-shell.smoke.spec.ts`, `builder.smoke.spec.ts`, `slack-action.smoke.spec.ts`. |
| Smoke helpers | `tests/smoke/helpers/` | `env.ts` (all config via env, no hardcoded secrets), `assertions.ts` (`gotoOk`, `assertNoServerError`, `clickToReveal`), `sanitizeSmokeArtifact.ts`. |
| Smoke reporters | `tests/smoke/` | `smokeReporter.ts`, `mcpSmokeArtifactReporter.ts` → sanitized `artifacts/mcp/smoke-latest.json`. |
| npm scripts | [`package.json`](../../../../package.json) | `smoke:prod` (prod smoke), `test:e2e` (local mocked e2e), `mcp:smoke` / `mcp:http:smoke` (MCP server smoke). |
| Local e2e | [`playwright.config.ts`](../../../../playwright.config.ts) + `tests/e2e/` | Local dev server + 11 mocked provider servers; 30+ provider walkthrough specs. Separate purpose from prod smoke. |
| CI | [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) | typecheck + lint + structure + migrations + `npm test`. **No smoke, no e2e** (no test Supabase project). Triggered on `v2-foundation` at the time of this slice — **retargeted to `v2-main` in [V2-READY-4](./v2-ready-4-ci-branch-gate.md)**. |
| Runbooks | [`docs/runbooks/`](../../../runbooks) | Operational runbooks existed (stripe, MCP, adding-a-provider); **no smoke runbook** until this slice. |

**Auth/session pattern:** `auth.setup.ts` signs in once with
`PRODUCTION_SMOKE_EMAIL`/`PASSWORD`, caches storage state; the `authenticated` project
reuses it. Creds absent → empty state written + clean skip (never a hard fail).

**Provider smoke pattern:** `slack-action.smoke.spec.ts` is the one provider-action
prod smoke — build → pick channel by **visible name** → readiness → (opt-in) real
post → Succeeded → cleanup. Two-key gating (`SLACK_CHANNEL_NAME` configures target;
`RUN_EXECUTION=true` permits the send).

---

## 2. Smoke coverage vs. the critical-flow list

Legend — **Auto** (covered by a smoke spec), **Auto-partial**, **Manual** (runbook
only — needs fixtures the harness deliberately lacks).

| Critical flow | State | Where / gap |
|---|---|---|
| Sign in (password) | **Auto** | `auth.setup.ts`. |
| Sign in (Google / social) | **Manual** | Real OAuth; runbook §3. |
| Account switch | **Manual** | No spec selects a different account + asserts re-scope. Runbook §3; follow-up A2. |
| Team account view (`/team`) | **Auto-partial** | Protected-route redirect now covered (this slice). Authed roster render = Manual (needs team fixture). |
| Apps page | **Auto** | Loads + **now** asserts provider cards render (this slice). |
| Connect / reconnect / disconnect UI | **Manual** | Real OAuth + state mutation; runbook §3. |
| Workflow dashboard | **Auto** | `authenticated-shell` (dashboard + switcher visible). |
| Create workflow | **Auto** | `builder.smoke` step 1. |
| Builder loads | **Auto** | `builder.smoke` step 1. |
| Add / configure nodes | **Auto** | `builder.smoke` steps 2–3 (needs-setup → Ready). |
| Save draft | **Auto** | `builder.smoke` step 4 (save → reload → persist). |
| Manual run | **Auto (opt-in)** | `builder.smoke` + `slack-action` (RUN_EXECUTION-gated). |
| Run detail / logs | **Auto-partial / Manual** | Run **appears on `/runs`** is auto; opening run-detail per-step + sanitized error is Manual (runbook §4/§6); follow-up A3. |
| Folders / trash | **Manual** | No spec exercises folder/trash UI; follow-up A4. |
| Team / member permissions | **Manual** | Needs 2-user team fixture; runbook §5; follow-up A1. |
| Shared / private connection behavior | **Manual** | Needs team + multi-credential fixture; runbook §5; follow-up A1. |

---

## 3. Checklist created

The reusable runbook ([`docs/runbooks/v2-smoke-testing.md`](../../../runbooks/v2-smoke-testing.md))
documents, with explicit pass/fail and capture-what guidance:

- §0 what's already automated (don't redo by hand) + the full env contract.
- §1 **local smoke** (typecheck/lint/test + manual surface check + optional mocked e2e).
- §2 **production smoke** (`smoke:prod`, read-only default).
- §3 **after-auth / OAuth smoke** (manual: social sign-in, connect/reconnect/disconnect, account switch).
- §4 **workflow execution smoke** (opt-in `RUN_EXECUTION`, real side effects, terminal-status check).
- §5 **team permissions & connection-sharing smoke** (manual, 2-user).
- §6 **no-leak smoke** (sanitized artifact + run-detail error spot-check).
- §7 **what to capture** per run (reports, artifact, screenshots, base URL / flags).
- CI note (smoke/e2e not in CI; branch-trigger caveat).

---

## 4. Automation added

Two low-risk additions that fit the existing harness with **no new auth/session
infrastructure** (the task's guardrail):

1. **`public.smoke.spec.ts`** — added `/team` to the protected-route redirect loop.
   `/team` is middleware-matched and server-redirects unauthenticated users to
   `/auth/sign-in` ([`app/team/page.tsx:50`](../../../../app/team/page.tsx)), but was
   the one protected app route missing from the loop. Runs in the always-on `public`
   project; needs no credentials.
2. **`authenticated-shell.smoke.spec.ts`** — added an apps-page **provider-cards
   render** test. The pre-existing apps test only asserted the dashboard container +
   heading; this asserts the catalog actually populated (`app-card` count > 0) and that
   a known always-enabled provider (Slack, by stable `data-provider-id`) renders.
   Read-only — never connects, disconnects, or mutates any integration. Reuses the
   existing `authenticated` project's cached session; no new fixture.

**Not built (correctly deferred — needs fixtures the harness intentionally lacks):**
account-switch, team-roster/permissions, shared-vs-private credential behavior, real
OAuth connect/reconnect/disconnect, and run-detail/log assertions. See §5.

---

## 5. Prioritized "next automation" list

Ordered by (coverage value × confidence) ÷ harness cost.

1. **A3 — Run-detail / logs smoke (in existing authed harness).** Extend
   `builder.smoke` (or a new authed spec) to open the run-detail view after a manual
   run and assert per-step status + the sanitized (no-raw-identifier) error surface.
   Low cost — reuses the cached session; closes the V2-READY-2 guarantee's e2e gap.
2. **A4 — Folders/trash smoke (authed harness).** Create a smoke-prefixed workflow →
   move to a folder → trash → confirm it leaves the active list → restore/purge. Reuses
   the prefix-guarded cleanup contract; no new fixture.
3. **A2 — Account-switch smoke.** Requires a smoke account that belongs to ≥1 Team.
   Select a team in the switcher → reload → assert the workflows/apps list re-scopes.
   Needs a seeded multi-account smoke user (env/fixture decision) — small harness add.
4. **A1 — Team permissions + connection-sharing smoke.** Highest value, highest cost:
   needs a **two-user team fixture** (owner + member) and seeded account-vs-personal
   connections. This is the "do not build a large auth harness in this slice"
   boundary — design the fixture first.
5. **A5 — CI smoke job.** Once a test Supabase project exists (the V2-READY-0C gate),
   add a CI job running `public` (creds-less, always safe) on every `v2-main` push, and
   the authenticated projects with secrets. (The `v2-foundation`→`v2-main` trigger
   mismatch this list flagged was fixed in [V2-READY-4](./v2-ready-4-ci-branch-gate.md).)

> Items A1/A2 need a fixture/infra decision and are **explicitly not built here** —
> documented per the slice's "if automation requires new auth/session infrastructure,
> do not build it yet" instruction.

---

## 6. Files changed

- `docs/runbooks/v2-smoke-testing.md` (new) — operational runbook.
- `docs/slices/phase-4/readiness/v2-ready-3-smoke-checklist.md` (new) — this record.
- `tests/smoke/public.smoke.spec.ts` — `/team` added to protected-route loop.
- `tests/smoke/authenticated-shell.smoke.spec.ts` — apps provider-cards render test.

---

## 7. Checks run

- `npm run typecheck` — see slice report.
- `npm run lint` — see slice report.
- `npm run lint:structure` — see slice report (two new docs in non-full leaves; smoke
  specs unchanged in count).
- The two changed smoke specs are **production-targeted Playwright** (need a deployed
  origin + creds) — not run from here; they are syntactically validated by lint +
  typecheck. No `npm run build` (no runtime/source files changed). No Jest re-run (no
  Jest test utilities changed).

---

## 8. Closeout confirmation

Two new docs + two minimal additive smoke-spec edits. No migration, no `db:push`, no
push/deploy. No AI / MCP / billing behavior changed (the parallel chat's in-flight
AI-REPAIR files in the working tree were not touched). No new providers. No new
auth/session harness built — fixture-dependent automation is documented as A1/A2
follow-ups.
