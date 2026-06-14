# 4.V2-READY-0B — Skipped-Test + Missing-Coverage Triage

**Type:** Audit + triage (docs-only). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Companion:** [../v2-existing-app-readiness-audit.md](../v2-existing-app-readiness-audit.md) (parent readiness audit).

> **Verdict.** All **181 skipped Jest tests / 39 fully-skipped suites are
> intentionally DB-gated integration tests** — they self-skip unless a real
> Supabase test database is provided. **None are stale, forgotten, flaky, obsolete,
> or hiding broken work, and there are ZERO ad-hoc `it.skip`/`xit`/`xdescribe`/
> `.todo` in the Jest suite.** So there is **nothing to unskip or delete**. The
> real signal is a *coverage* gap, not a *skip* gap: these DB suites **do not run
> in CI** (no test Supabase project), so RLS / migration / account-model
> invariants are only verified when a developer manually opts in.

---

## 1. Mechanism (verified)

- **Jest config** ([jest.config.mjs](../../../../jest.config.mjs)): `testMatch` collects
  `tests/{unit,integration,parity,structure}/**/*.test.{ts,tsx}` (this includes
  `*.dev.test.ts`); `tests/e2e/` (Playwright) is ignored.
- **The skip gate** (every integration DB suite, e.g.
  [tests/integration/security/accounts-rls.test.ts:40-51](../../../../tests/integration/security/accounts-rls.test.ts)):
  ```ts
  const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
  const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;   // Supabase env
  const describeDb = RUN ? describe : describe.skip;
  if (!RUN) console.log("SKIP … set ALLOW_DB_INTEGRATION_TESTS=true … (DESTRUCTIVE: creates/deletes auth users).");
  ```
  Default `npx jest` (no flag, no DB) → `describeDb === describe.skip` → the suite's
  tests report skipped. With the flag + Supabase creds they run against a real DB.
- **Grep proof of no ad-hoc skips:** the only `.skip(` *calls* outside Playwright
  `.spec.ts` live in `tests/smoke/auth.setup.ts` (a Playwright setup). No
  `it.skip`/`test.skip`/`xit`/`xdescribe`/`.todo` exist in any Jest `*.test.ts`.
- **Playwright smoke (`tests/smoke/*.spec.ts`)** use runtime `test.skip(cond, …)`
  guards (skip when a precondition like "Slack already connected" or "authenticated"
  is unmet). These run under Playwright, **not** Jest, so they are NOT part of the
  181 Jest skips and are conditional-by-design, not triage candidates.

---

## 2. Skipped-suite inventory (by product area)

~46 integration files use the `describeDb` gate (39 skip wholesale; the rest are
mixed files contributing skipped tests). Grouped:

| Area | DB-gated suites (representative) |
|---|---|
| Accounts / team / settings | `accounts-rls`, `account-memberships-rls`, `account-memberships-co-member-rls`, `account-api-keys-rls`, `accounts-backfill`, `accounts-invariants`, `account-id-foundation-backfill`, `handle-new-user-extension`, `account-member-identities-rpc`, `account-invitations`, `team-org-account-types`, `user-profiles-active-account-id`, `account-owner-transfer`, `accountPurge`, `accountDeletionFreeze`, `ledgerAnonymization`, `ledger-account-rls`, `api-key-audit-notifications` |
| Apps / integrations | `integrations-rls` |
| Workflow dashboard | `workflows-account-rls`, `workflow-runs-account-rls`, `workflow-run-stats-account`, `workflow-folders-rls`, `workflow-folders-trash`, `workflow-folders-unique-name`, `workflow-trash-purge` |
| Builder | `workflow-node-credentials-rls`, `workflow-templates-rls` |
| Providers / templates | `official-templates-seed` |
| Billing *(present — behavior NOT touched)* | `account-billing-rls`, `account-billing-plan-metadata`, `account-billing-stripe-attachment`, `stripe-billing-events`, `apply-business-upgrade`, `apply-business-downgrade`, `accountBillingFoundation`, `reserveReconcileShadowCollection`, `reserveReconcileEngine.dev` |
| AI / credits *(present — behavior NOT touched)* | `aiCreditGate.dev` |

Execution/runs and native-nodes have **no** skipped suites (their unit + e2e cover
them; run-lifecycle terminal status was verified in V2-READY-1).

---

## 3. Classification

| Class | Count | Items |
|---|---|---|
| **Intentionally skipped — depends on unavailable infra/env (real Supabase DB; opt-in + DESTRUCTIVE)** | **all 181 tests / 39 suites** | every `describeDb` integration suite above |
| Stale / forgotten skip | 0 | — |
| Flaky-quarantine | 0 | — |
| Obsolete (delete/rewrite) | 0 | — |
| Needs implementation fix before enabling | 0 | — |
| Ad-hoc `it.skip`/`xit`/`.todo` | 0 | none exist in Jest |

Uniform classification: the skips are a deliberate, well-engineered gate (destructive
DB tests must be explicitly opted into), not technical debt.

---

## 4. Actions taken

- **Enabled: 0.** Every skipped test requires a real Supabase test database, which is
  not available locally and is **out of scope** to provision in this slice (and the
  suites are explicitly DESTRUCTIVE — they create/delete `auth.users`). Enabling them
  without a DB would just fail at connection, not prove anything.
- **Deleted: 0.** All are valid, current tests.
- **Left skipped: 181 (correctly).** Documented reason above.
- **Source/test files changed: 0.** No skip markers to flip; no stale skips found.

---

## 5. Top missing-coverage gaps (the real findings)

1. **[HIGH] The DB-integration suites never run in CI.** [.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)
   runs typecheck + lint + lint:structure + lint:migrations + `npm test`, but does
   **not** set `ALLOW_DB_INTEGRATION_TESTS` and has no test Supabase project — so all
   ~46 RLS/migration/account-model/billing-foundation suites are skipped in CI.
   These are exactly the suites that guard cross-account isolation + RLS; they're only
   exercised when a developer manually opts in. **This is the highest-value follow-up.**
   (The ci.yml header already names the plan + the secrets a future DB/e2e job needs.)
2. **[MED] CI branch mismatch.** `ci.yml` triggers on `v2-foundation` (PRs + pushes),
   but active work is on `v2-main`. Verify CI actually gates `v2-main`; if not, even the
   non-DB checks may not run on the working branch. (Config observation — not changed here.)
3. **[MED] No e2e for interactive flows + no sad-path e2e** (carried from the parent
   readiness audit): account switch, apps connect-UI, team mgmt, builder authoring loop,
   and failure paths (missing-connection, handler-timeout) have no browser-level test.
   Playwright e2e is also CI-gated out for the same "no test Supabase project" reason.

---

## 6. Recommended order — there is no unskip/delete/fix list

Because every skip is infra-gated and valid, the next action is **infrastructure +
CI**, not test edits:

1. **V2-READY-0C (infra, needs Marcus):** stand up a throwaway/test Supabase project
   and add a CI job that runs the DB-integration suites with
   `ALLOW_DB_INTEGRATION_TESTS=true` + the secrets enumerated in `ci.yml`. This turns
   ~46 manual-only suites into continuous RLS/isolation coverage. Same project unblocks
   the Playwright e2e job. **Blocked on the test-project decision — do not build infra
   speculatively.**
2. **V2-READY-0D (in-repo, no infra):** add the sad-path / interactive-flow coverage the
   parent audit flagged at the unit/integration-with-mocks level (engine timeout bound,
   missing-connection run → terminal failed, apps connect→callback→row with a mocked
   token endpoint). These run in the existing no-DB Jest lane.
3. Confirm/fix the CI branch trigger (#2 above) — tiny config change, separate.

**Recommended next concrete slice:** **V2-READY-0D** (in-repo sad-path/flow tests) — it
needs no infra decision and directly raises the safety net. **V2-READY-0C** (test DB +
CI job) is higher-leverage but gated on Marcus's infra go-ahead.

---

## 7. Checks run / not run

- **Investigation only** (grep + config reads). **No tests enabled, no source/test files
  changed**, so: full Jest not re-run (no skips changed); `typecheck`/`lint`/`build` not
  run (no code touched). `lint:structure` — the parallel phase-4 docs reorg has landed
  (root back to 50); this report lives in a new `phase-4/readiness/` subfolder leaf, so
  it does not affect the root cap.

---

## 8. Closeout confirmation

Docs-only (one new report under `phase-4/readiness/`). No source/test/migration/UI
changed. No skip flipped. Nothing pushed. No `db:push`. No AI/MCP/billing behavior
changed. The parallel chat's docs reorg + AI-REPAIR files were not touched.
