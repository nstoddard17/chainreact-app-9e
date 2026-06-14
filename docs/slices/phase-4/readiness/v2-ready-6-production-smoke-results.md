# 4.V2-READY-6 — Production Smoke Run + Results

**Type:** Production smoke execution + result record (docs-only). Nothing pushed. `db:push` NOT run.
**Run date/time:** 2026-06-14, **10:14–10:15 CDT (15:14 UTC)**.
**Deployed commit tested:** **`b20ac5e6a`** (`origin/v2-main` tip, confirmed via `git fetch`; Marcus confirmed this deployed correctly).
**Target origin:** `https://chainreact.app` (default; `PRODUCTION_SMOKE_BASE_URL` unset).
**Method:** [`npm run smoke:prod`](../../../runbooks/v2-smoke-testing.md) (Playwright, [`playwright.smoke.config.ts`](../../../../playwright.smoke.config.ts)) — **read-only**, `PRODUCTION_SMOKE_RUN_EXECUTION` OFF — plus `curl` reachability probes.
**Runbook:** [`docs/runbooks/v2-smoke-testing.md`](../../../runbooks/v2-smoke-testing.md).

> **Verdict — PUBLIC SURFACE PRODUCTION-SMOKE GREEN; authenticated areas BLOCKED on
> credentials.** The creds-less `public` project passed **12/12** against the live
> deploy (all public pages load with no 500/RSC marker; all six protected routes —
> including the V2-READY-3 `/team` addition — redirect to sign-in). The authenticated
> projects **self-skipped** because `PRODUCTION_SMOKE_EMAIL` / `PRODUCTION_SMOKE_PASSWORD`
> are not set in this environment, so smoke areas 2–8 are **not yet verified this run**
> (recorded as BLOCKED, not pass/fail). **No failures and no app-code bug surfaced.**

---

## 1. Commands / steps run

- `git fetch origin v2-main` → confirmed deployed tip `b20ac5e6a`.
- `curl` probes against production:
  - `GET /` → **HTTP 200** (~0.42s).
  - `GET /auth/sign-in` → **HTTP 200**.
  - `GET /workflows` (signed-out) → **HTTP 307 → /auth/sign-in** (protected redirect at the edge).
- `npm run smoke:prod` → 32 collected: **12 passed, 20 skipped, 0 failed** (11.8s). Reporter `OVERALL: PASSED`.
- Inspected `artifacts/mcp/smoke-latest.json` (sanitized no-leak artifact).
- Credential probe: `PRODUCTION_SMOKE_EMAIL` / `PRODUCTION_SMOKE_PASSWORD` → **both unset**;
  `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME` unset; `RUN_EXECUTION` off.

---

## 2. Pass / fail / blocked by smoke area

| # | Area | Result | Evidence / why |
|---|---|---|---|
| 1 | **Public / protected routes** | ✅ **PASS** | `public` project 12/12. Home, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/confirmed` all load + no server-error marker; `/auth/reset-password` (no recovery session) redirects safely to forgot-password; protected `/workflows /runs /templates /apps /account /team` all redirect to `/auth/sign-in`. Curl confirms 200s + 307 redirect independently. |
| 2 | **Authenticated shell** (sign-in, dashboard, app shell, account switcher) | ⛔ **BLOCKED** | 6 specs skipped — no `PRODUCTION_SMOKE_EMAIL`/`PASSWORD`. `auth.setup` wrote an empty storage state and skipped (by design). Not exercised this run. |
| 3 | **Apps** (page, provider cards, connected rows expand, owner/admin vs member visibility, no-leak) | ⛔ **BLOCKED** | Covered by the authenticated `authenticated-shell` apps tests (incl. the V2-READY-3 provider-cards render) + `slack-action` connected-card check — all skipped without creds. |
| 4 | **Team / account** (team page, roster/roles, owner/admin/member permissions) | ⛔ **BLOCKED** | Needs creds **and** a seeded multi-user team fixture for the permission matrix (no automated team-permission smoke exists yet — runbook §5 manual; tracked as A1 in [V2-READY-3](./v2-ready-3-smoke-checklist.md)). |
| 5 | **Workflow dashboard** (list/grid, folders/trash, run stats, account scoping) | ⛔ **BLOCKED** | `authenticated-shell` dashboard test skipped; folders/trash have no automated smoke (runbook §manual; A4). |
| 6 | **Builder** (open/create, add/configure nodes, save/reload, option loading, variable picker) | ⛔ **BLOCKED** | `builder.smoke` 4 specs skipped without creds. (This is the strongest authored authenticated smoke — fully ready to run once creds exist.) |
| 7 | **Execution** (manual run → terminal status, run detail/logs, sanitized step errors) | ⛔ **BLOCKED** | `builder.smoke` manual-run step skipped; also gated behind `RUN_EXECUTION=true` (opt-in, off). Run-detail/log + step-error no-leak is manual (runbook §4/§6; A3). |
| 8 | **Existing provider — Slack** | ⛔ **BLOCKED** | `slack-action` 7 specs skipped — needs creds + `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME`, and the real post additionally needs `RUN_EXECUTION=true`. No new providers connected. |

**Skip ledger (from the run):** Auth setup 1 skipped; Authenticated shell 6; Builder 4; Manual run 1; Cleanup 1; Slack action 7 = **20 skipped**, all credential-gated by design.

---

## 3. No-leak spot-check (partial — unauthenticated surface only)

- **Sanitized MCP artifact** (`artifacts/mcp/smoke-latest.json`) verified: titles carry only
  coarse labels (path-shaped strings redacted to `[redacted-path]`), `errorClass: null`,
  no URLs / emails / tokens / raw error messages / absolute paths. The no-leak artifact
  guarantee holds.
- **Public pages**: every public route passed `assertNoServerError` (no 500 / RSC-crash
  marker, no stack/identifier surfaced on the unauthenticated surface).
- **Authenticated no-leak** (raw provider ids / emails / tokens / scopes in Apps UI &
  errors; sanitized run-detail step errors — the V2-READY-2 guarantee) is **NOT verified
  this run** (auth-gated). Carried as blocked under areas 3 & 7.

---

## 4. Blockers found

1. **[BLOCKER — env] No smoke credentials in this environment.** `PRODUCTION_SMOKE_EMAIL`
   / `PRODUCTION_SMOKE_PASSWORD` unset → all authenticated smoke (areas 2–8) skipped.
   This is the single blocker for areas 2–3 and 5–7. **Not an app defect** — the harness
   skip-without-creds behavior is by design.
2. **[BLOCKER — fixture] Team permission matrix (area 4) needs a two-user team fixture**
   even with creds (owner/admin/member visibility). No automated team-permission smoke
   exists (A1). Manual two-account walkthrough (runbook §5) is the only path today.
3. **[GATE — opt-in] Execution + Slack send (areas 7–8) additionally need
   `RUN_EXECUTION=true`** (and area 8 a channel name). Intentional safety gate, not a bug.

**No failures. No app-code bug surfaced.** Nothing requires a code change.

---

## 5. Recommended next

- **No fix slice recommended** — nothing failed; no defect found. (The "change app code
  only if a smoke failure reveals a tiny obvious bug" condition was not triggered.)
- **To complete areas 2–8 (no code change):** provide `PRODUCTION_SMOKE_EMAIL` +
  `PRODUCTION_SMOKE_PASSWORD` (a low-privilege production test account) in the shell, then
  re-run `npm run smoke:prod`. Builder + authenticated-shell + apps-cards areas (2, 3, 5,
  6) will run immediately. For area 7/8 add `PRODUCTION_SMOKE_RUN_EXECUTION=true` (+
  `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME` for Slack) when a real side effect is acceptable.
  This doc will be updated in place with the authenticated results.
- **Area 4 permission matrix** stays manual until the A1 two-user fixture lands.

---

## 6. Files changed

- `docs/slices/phase-4/readiness/v2-ready-6-production-smoke-results.md` (new) — this record.

(No app/source/test/migration files changed. `artifacts/mcp/smoke-latest.json` is a
gitignored run artifact, not committed.)

---

## 7. Closeout confirmation

One new readiness doc. No source/test/migration/UI changed. No `db:push`, no
push/deploy. No AI / MCP / billing behavior touched. No providers connected. The smoke
run was **read-only** (`RUN_EXECUTION` off) — it created no workflows, sent no provider
messages, and spent no task quota. Authenticated areas honestly recorded as **blocked on
credentials**, not fabricated as passing.
