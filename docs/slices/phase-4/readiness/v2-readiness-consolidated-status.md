# V2-READY-25 — Readiness Arc Consolidation + Green-Baseline Verification

**Type:** Docs-only consolidation + baseline verification record. Nothing pushed. No `db:push` / migration.
**Verification run date:** 2026-06-14.
**Repo state at verification:** branch `v2-main`, HEAD `77f268b3c` (parallel builder-AI work; the
V2-READY arc through `84602675c` is in history). Working tree clean at verification time.
**Scope note:** This slice ran the global gates and consolidated the readiness arc. No source code was
changed (the prior blocker — global typecheck/build red from in-flight parallel builder-AI work — is
resolved; Marcus confirmed, and this run reproduces a fully green baseline).

---

## 0. Verdict

**Baseline is GREEN.** typecheck, lint, lint:structure, and `next build` all pass; the full Jest run is
**18284 passed / 181 skipped / 0 failed** across **1603 passed + 39 skipped suites**. The 39 skipped
suites are the DB-gated `tests/integration/**` set (accounts / billing / migrations) that require a
Supabase test database — expected, not failures. The recent readiness arc (V2-READY-20…24) is a focused
no-leak / typed-error-response hardening of the workflow-lifecycle and OAuth-connect surfaces, all
committed with tests and now verified against a green tree.

---

## 1. Current readiness state

### Solid now
- **Workflow lifecycle error boundary** — every client-facing lifecycle failure (activate / reactivate /
  resume / disable / delete) returns a typed, identifier-free response: known `LifecycleError` codes map
  via `lifecycleErrorResponse`; `TRIGGER_REGISTRATION_FAILED` is redacted (V2-READY-20); frozen-account
  failures are a typed `403 ACCOUNT_PENDING_DELETION` (V2-READY-23) preserved end-to-end into the typed
  client (V2-READY-24); all other unexpected throws collapse to a safe static 500 with server-side-only
  diagnostics (V2-READY-22). Single boundary in [`app/api/workflows/_shared.ts`](../../../../app/api/workflows/_shared.ts).
- **OAuth connect flow error boundary** — connect / callback / ingest no longer echo raw provider /
  dispatcher / Supabase errors; a shared `redactedOAuthErrorCode` collapses unrecognized errors to a
  stable code and logs the raw cause server-side (V2-READY-21).
- **Run-detail + notification no-leak** — step errors and notification bodies are humanized / sanitized
  (V2-READY-2, V2-READY-8, V2-READY-9).
- **Metadata / option-source / trigger-activation invariants** — structure tests green
  (`discovery-meta-coverage`, `option-source-reference-integrity`, `trigger-meta-activation-invariant`);
  native meta↔handler contracts aligned (V2-READY-14/16/19); provider output contracts pinned
  (V2-READY-15/17/18).
- **Account / team surfaces** — member action-visibility, settings save-failure preservation, and
  freeze-aware active marker (V2-READY-10/11); account + teams route tests green.
- **Webhook receipt routes** — receipt-route tests across providers green (V2-READY-12/13 + existing).
- **CI** targets the active `v2-main` branch (V2-READY-4).

### Fixed (this arc)
Raw-identifier leaks closed on the lifecycle + OAuth surfaces; frozen-account semantics corrected from a
generic 500 to a typed 403; native/provider meta drift corrected; the prior global typecheck/build red
(parallel builder-AI) is resolved.

### Audited / proven safe (no code needed beyond tests/docs)
- `MISSING_PRECONDITIONS` lifecycle failures name only the provider (no identifiers).
- Webhook routes log errors server-side and do not return raw bodies to callers.
- Connection-health / reconnect failure UX audit (V2-READY-7) — behavior characterized; no full state
  machine built (intentional, see risks).

### Still blocked by credentials / infra
- **Authenticated production smoke** (areas 2–8) — blocked on `PRODUCTION_SMOKE_EMAIL` /
  `PRODUCTION_SMOKE_PASSWORD` (V2-READY-6).
- **DB-gated integration suites** (`tests/integration/**`, 39 suites) — require a Supabase test DB; skipped
  locally and not in CI.

---

## 2. V2-READY slice table

> Derived from `git log --grep=V2-READY` on `v2-main`. "Kind" inferred from the commit type/scope.
> "Result" reflects the committed state; all are in history and pass under the current green baseline.

| Slice | Commit | Area | Kind | Result / caveat |
|---|---|---|---|---|
| V2-READY | `32e9ddfad` | Readiness audit + repair/testing plan | docs | Plan of record |
| V2-READY-0B | `26cf184a3` | Skipped-test + coverage triage | docs | Classifies DB-gated skips |
| V2-READY-0D | `78e2d1f01` | Execution sad-path (no-DB) coverage | test | Missing-connection + config-validation |
| V2-READY-1 | `bf7f2628f` | Execution stale-run sweep comment/guard | behavior | Small correctness |
| V2-READY-2 | `be0f5a0cc` | Run-detail step-error sanitize | behavior+test | No-leak boundary |
| V2-READY-3 | `a1de3f6d2` | Smoke runbook + checklist | docs | Manual smoke gaps tracked (A1/A3/A4) |
| V2-READY-4 | `b20ac5e6a` | CI retarget to `v2-main` | ci | — |
| V2-READY-6 | `2997ba39b` | Production smoke results | docs | Public green; authed blocked on creds |
| V2-READY-7 | `4624e963c` | Connection-health / reconnect audit | docs | No full state machine built |
| V2-READY-8 | `dd81ecc75` | Reconnect builder parity + notif redaction | behavior+test | No-leak |
| V2-READY-9 | `bd0d60e28` | Combined output-redaction + error-sanitize test | test | Pins run-detail response |
| V2-READY-10 | `5ff3bbbe1` | Account/team visibility + settings save | test | — |
| V2-READY-11 | `109e47ef4` | Freeze-aware active marker in account list | behavior+test | Switcher ↔ SSR parity |
| V2-READY-12 | `7f08f7e17` | Webhook receipt tests (gdrive + gsheets) | test | — |
| V2-READY-13 | `4ce6fb393` | Webhook receipt test (outlook mail) | test | — |
| V2-READY-14 | `4f591a4b9` | Native delay node meta↔handler align | behavior+test | — |
| V2-READY-15 | `7d98c6e14` | Provider output-contract tests (notion/shopify) | test | — |
| V2-READY-16 | `78ca082ab` | `schedule.fired` payloadShape align | behavior+test | — |
| V2-READY-17 | `656f60f52` | Monday `download_file` fileId picker deps | behavior+test | — |
| V2-READY-18 | `460283b85` | Official-template node-registration guard | test | Live-registry guard |
| V2-READY-19 | `c8e0ab47b` | Email seed required subject/body fields | behavior+test | Builder schema pass |
| V2-READY-20 | `deb2235cc` | Lifecycle/trigger-registration error redaction | behavior+test | `TRIGGER_REGISTRATION_FAILED` redacted |
| V2-READY-21 | `5b307c805` | OAuth connect/callback/ingest error redaction | behavior+test | Shared `redactedOAuthErrorCode` |
| V2-READY-22 | `e99b6a53a` | Lifecycle unexpected-error 500 fallback sanitize | behavior+test | Generic safe 500 |
| V2-READY-23 | `8cfa97a66` | Frozen-account typed 403 | behavior+test | Reuses `ACCOUNT_PENDING_DELETION` |
| V2-READY-24 | `84602675c` | Client preserves `ACCOUNT_PENDING_DELETION` | behavior(client)+test | No UI added (none existed) |
| V2-READY-25 | _(this)_ | Consolidation + green baseline | docs | This document |

**Standing caveats from prior reports still open:** `_shared.ts` carries a non-blocking `max-lines` warning
(file was already at the 400 soft cap; splitting deferred); the typed client maps `ACCOUNT_PENDING_DELETION`
to code-preserved but no UI branches on it yet (no UI existed to wire); smoke areas 2–8 unverified pending
creds.

---

## 3. Top remaining risks

1. **Authenticated production smoke still blocked by missing creds.** Public surface is green (12/12 at
   V2-READY-6), but areas 2–8 (authenticated shell, apps, team/account, dashboard, builder, execution,
   Slack) are unverified. This is the single biggest confidence gap before launch.
2. **DB-gated integration suites not in CI.** 39 `tests/integration/**` suites (accounts / billing /
   migrations, incl. RLS/owner-transfer/ledger) self-skip without a Supabase test DB; their guarantees are
   unverified on every push.
3. **No full connection-health / proactive-reconnect system.** V2-READY-7 audited the failure UX but no
   health state machine, scheduled token-refresh, or escalation pipeline exists (V1 had one; V2 does not).
4. **No request-to-admin / proactive reconnect workflow.** Members can't yet trigger a guided reconnect or
   notify an owner/admin when an account-shared credential is broken.
5. **Last public smoke predates the latest deploy.** V2-READY-6 ran against `b20ac5e6a`; slices 20–24 are
   server-side no-leak / typed-response changes + one client type change with **no new public routes**, so
   the public verdict still holds in principle, but it has not been re-run against the current tip.
6. **Baseline-run limitation (this slice).** Full Jest, build, lint, typecheck all green locally; CI green
   on `v2-main` is assumed from V2-READY-4 but not re-confirmed in this slice.

---

## 4. Recommended next actions (in order)

1. **Authenticated production smoke with credentials.** Set `PRODUCTION_SMOKE_EMAIL` /
   `PRODUCTION_SMOKE_PASSWORD` (+ `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME`, optional `RUN_EXECUTION`) and run
   `npm run smoke:prod` against the current deploy — closes the largest confidence gap (builder smoke is the
   strongest authored authenticated path and is ready to run).
2. **DB integration CI decision / Supabase test project.** Decide whether to stand up a Supabase test DB so
   `tests/integration/**` runs in CI (RLS, owner-transfer, ledger anonymization, billing reconcile).
3. **Remaining small readiness / test gaps.** Manual-smoke gaps tracked in V2-READY-3 (A1 team-permission
   matrix, A3 execution run-detail/step-error, A4 folders/trash); optional `_shared.ts` line-count cleanup;
   optional UI copy for `ACCOUNT_PENDING_DELETION`.
4. **Broader product improvements** — only after the above.
5. **New providers / apps** — last, after baseline confidence and the above are addressed.

---

## 5. Explicit "do not work on yet" list

- **New providers / apps** (e.g. Asana, Linear) — not until baseline confidence + smoke are in place.
- **Full connection-health state machine** — large; design first, don't build piecemeal.
- **New notification system** — out of scope; do not start.
- **Broad e2e authenticated harness** — beyond the existing smoke specs — only with explicit approval.
- **Source-code work overlapping another active chat** — the builder-AI workstream
  (`features/workflow-builder/ai/*`, `panels/_BuilderAiPanel*`) is actively edited in a parallel chat; do
  not touch those files.
- **AI / MCP / billing behavior changes** — out of scope for the readiness arc.

---

## 6. Verification status

**Commands run this slice (2026-06-14, HEAD `77f268b3c`):**

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ pass (clean) |
| `npm run lint` | ✅ pass — 0 errors, 20 warnings (pre-existing baseline; none in readiness files) |
| `npm run lint:structure` | ✅ pass — every leaf folder ≤ 50 files |
| `npm run build` (after `rm -rf .next`) | ✅ pass |
| Targeted readiness suites¹ | ✅ 53 suites / 484 tests pass |
| Full `npx jest` | ✅ **18284 passed, 181 skipped, 0 failed** (1603 passed + 39 skipped suites; ~56s) |

¹ workflows `_shared`, OAuth no-leak, accounts, account + teams routes, webhook receipt routes,
`discovery-meta-coverage`, `option-source-reference-integrity`, `trigger-meta-activation-invariant`.

- **Last full Jest count:** 18284 passed / 181 skipped / 0 failed (this slice — fresh run).
- **Skipped suites:** 39 DB-gated `tests/integration/**` (accounts / billing / migrations) — require a
  Supabase test DB; expected, not failures.
- **Public production smoke:** PASSED at V2-READY-6 (12/12 vs `b20ac5e6a`); **not re-run this slice** (no new
  public routes since). 
- **Authenticated smoke:** BLOCKED — credentials not supplied.
- **`.next` note:** a stale `.next` webpack/type artifact intermittently fails the first `next build` on this
  Windows worktree; `rm -rf .next` then rebuild is reliably green (cosmetic build-cache issue, not a code
  defect).

---

## Cross-references
- Audit / plan of record: V2-READY (`32e9ddfad`).
- Skipped-test triage: [`v2-ready-0b-skipped-test-triage.md`](./v2-ready-0b-skipped-test-triage.md).
- Smoke runbook + checklist: [`v2-ready-3-smoke-checklist.md`](./v2-ready-3-smoke-checklist.md),
  [`docs/runbooks/v2-smoke-testing.md`](../../../runbooks/v2-smoke-testing.md).
- CI branch gate: [`v2-ready-4-ci-branch-gate.md`](./v2-ready-4-ci-branch-gate.md).
- Production smoke results: [`v2-ready-6-production-smoke-results.md`](./v2-ready-6-production-smoke-results.md).
- Connection-health / reconnect audit: [`v2-ready-7-connection-health-reconnect-audit.md`](./v2-ready-7-connection-health-reconnect-audit.md).
