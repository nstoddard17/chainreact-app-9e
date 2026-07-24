# 5.DUAL-BUILDER-1 CS-7C — Live application acceptance & beta gate

> Governing rule unchanged: **two editors, one workflow — not two workflow types.**
> This slice does not expand the design; it attempts to prove the real, running,
> authenticated application works end to end, and to make an evidence-based beta call.

## 1. Plain-language result — **BLOCKED (not beta-ready)**

CS-7C **cannot be completed as a pass** because the load-bearing deliverable — the
real authenticated browser journey against the running Next.js app — **has no safe
database to run against**. This repository has exactly **one** Supabase project: the
**live production** project the app runs on. There is no local Supabase, no dedicated
test project, and no `.env.test`. The e2e harness creates and **deletes** real users,
accounts, workflows and runs through the service-role key, targeting whatever
`NEXT_PUBLIC_SUPABASE_URL` in `.env.local` points at — which is production.

Per the CS-7C contract, pointing the journey at production is forbidden and faking a
pass is forbidden. So the journey was **not executed**; instead this slice:

1. Proved, from configuration and code, that the only available Supabase is
   production (no inference from "credentials exist").
2. Ran every **non-destructive** local check that is possible without a database.
3. Added the **destructive-test-setup safety guard** the CS-7C brief explicitly
   requested, so the harness can never silently run against production once a safe
   env is (or isn't) supplied — with unit tests.
4. Documented the exact missing infrastructure and the minimum owner action.

This is the **same blocker CS-7B already flagged** ("Live browser journey — BLOCKED …
blocked by missing local test infrastructure … not yet beta-ready"). CS-7C confirms it
is still present and hardens against the specific accident it creates.

Production is unaffected: `ENABLE_DOCUMENT_BUILDER` remains **default-OFF** in
checked-in configuration, so the Document Builder is not exposed to any user.

## 2. Worktree, branch, base, HEAD

| Item | Value |
| --- | --- |
| Worktree path | `C:/tmp/cs7c-wt` (registered `git worktree`) |
| Branch | `dual-builder-cs7c-live-acceptance` |
| Base commit | `f6be45bc8` (CS-7B — Document Builder visual fidelity & acceptance) |
| HEAD at start | `f6be45bc8` |
| HEAD after this slice | see the single local commit on this branch |
| `node_modules` | **Resolved from another tree** — a Windows junction to the parent
repo's `node_modules` (`C:/Users/marcu/source/repos/ChainReactV2/node_modules`). Valid
because there is **zero** `package.json` / `package-lock.json` drift between `f6be45bc8`
and the parent tree, so the shared install matches this base exactly. tsc / jest /
eslint / playwright all resolve from it. |

The primary tree (`C:/Users/marcu/source/repos/ChainReactV2`, `v2-main`) was **not
modified**. (An initial worktree was created under `.claude/worktrees/` but jest's
`<rootDir>` glob mis-handles the `\.claude` dot-directory path on Windows; the worktree
was relocated to `C:/tmp/cs7c-wt`, matching this repo's established worktree
convention, and the old registration pruned.)

## 3. Safe Supabase environment — NONE (proof it would be production)

The determination is **BLOCKED**, established from configuration and code, not from a
runtime probe against production:

- **No local Supabase.** No `supabase/config.toml` exists (no `supabase init` project);
  there is no `supabase start` / db-reset / seed npm script; no `.env.test` /
  `.env.test.local` convention. The Supabase CLI (2.109.x) and Docker are installed on
  the machine, but the **repository does not support** a local test database — standing
  one up (init + apply 40+ production-authored migrations + reconfigure app env) would
  be inventing infrastructure, which the CS-7C brief scopes out ("Local Supabase
  migrations may run only through the repository's established local test bootstrap if
  that is already the intended setup").
- **One-project-only invariant.** `scripts/lib/db-target.mjs` +
  `scripts/check-db-target.mjs` enforce that every migration target must match the
  single app project ref in `NEXT_PUBLIC_SUPABASE_URL`; the comments name the live app
  project and reject known-foreign refs. The repo is designed around exactly one
  Supabase project — the live one.
- **`.env.local` targets a cloud project.** `NEXT_PUBLIC_SUPABASE_URL`'s host category
  is `<ref>.supabase.co` (cloud, not loopback) — the project the app serves in
  production. (Verified as a host *category* only; no URL, ref, or key value is printed
  here or in logs.)
- **The harness writes to that project, unguarded.** `tests/e2e/helpers/supabaseAdmin.ts`
  builds a service-role client from `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` and **creates/deletes users, accounts, workflows, runs,
  integrations and storage objects**. Its own comments describe CAPTCHA "protecting the
  live site" and stray users accumulating in "the shared project" — i.e. production.
  `tests/e2e/global-setup.ts` lifts those two vars from `.env.local` into the spec
  process; `playwright.config.ts`'s `webServer` runs `npm run dev` inheriting the same
  `.env.local` Supabase. No test-environment guard existed before this slice.
- **Both journey cases need writes.** In `dual-builder-document-journey.spec.ts`,
  **both** the flag-on and flag-off tests run `createTestUser()` + stamp
  `account_billing` Pro + `signInViaEmailLink()` in `beforeEach`. Neither case can run
  without creating/deleting rows in the target (production) project.

Conclusion: no safe environment exists and a local one cannot be started through
existing repository-supported infrastructure → **the journey must not run**.

## 4. Exact app & Playwright commands (as they WOULD run, once a safe env exists)

```bash
# Flag-ON journey (runs the cross-builder journey, skips the flag-off case):
ENABLE_DOCUMENT_BUILDER=true npx playwright test dual-builder-document-journey

# Flag-OFF case (runs the toggle-hidden case, skips the journey):
npx playwright test dual-builder-document-journey
```

Non-destructive discovery (does NOT start the webServer or create users), which **was**
run and passed:

```bash
npx playwright test dual-builder-document-journey --list
#  → [chromium] …:70  flag OFF hides the Visual/Document toggle (Visual only)
#  → [chromium] …:85  build in Visual, edit in Document, save/reload/persist, run — one workflow
#  Total: 2 tests in 1 file
```

Both cases are discoverable and self-skip only on the wrong flag state (`test.skip(FLAG_ON…)`
/ `test.skip(!FLAG_ON…)`) — so run in two explicit processes, neither is silently lost.

## 5. Proof the server ran from the CS-7C worktree

Not applicable — **the app server was deliberately not started** for the authenticated
journey, because starting it (`npm run dev`) inherits `.env.local` and would point the
authenticated journey at production. Starting it would provide no safe value and risks
exactly the destructive writes CS-7C forbids. The worktree identity itself is proven:

```
git rev-parse --show-toplevel → C:/tmp/cs7c-wt
git branch --show-current     → dual-builder-cs7c-live-acceptance
git rev-parse HEAD            → f6be45bc8… (pre-commit)
```

## 6. Flag-ON journey result

**Did not execute** (blocked by §3). It did not "skip" for the wrong reason — it is
valid and discoverable (§4) and would run with `ENABLE_DOCUMENT_BUILDER=true` against a
safe database. It was **not run** to avoid destructive production writes.

## 7. Flag-OFF journey result

**Did not execute** — same blocker. The flag-off case *also* calls `createTestUser()` +
`signInViaEmailLink()` in `beforeEach`, so it too requires writing to the target
project and cannot run safely against production.

## 8. Test-user / fixture creation & cleanup behaviour

No test users or fixtures were created or deleted **anywhere** — the whole point of the
block. The harness's cleanup path (`deleteTestUser`) is sound in code (children →
account → auth user, error-checked) but was not exercised because no user was created.

## 9. Live defects found & fixed

None found via the live journey (it did not run). One **safety defect in the harness
itself** was addressed (the missing test-environment guard the CS-7C brief requested):

- **Defect:** the e2e service-role admin client had no guard — any e2e spec would
  create/delete rows against whatever `.env.local` targets, i.e. production.
- **Fix (smallest authoritative layer):** a new pure guard
  `tests/e2e/helpers/assertSafeTestEnvironment.ts`, wired into `adminClient()` in
  `tests/e2e/helpers/supabaseAdmin.ts` — the single seam every destructive create/delete
  passes through. It **refuses** to build the client unless the target proves safe:
  loopback/local host, OR `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true`, OR the ref is in
  `E2E_TEST_SUPABASE_REFS`. It does **not** trust `NODE_ENV=test` alone, and only ever
  surfaces host/ref in errors — never keys. Regression test:
  `tests/unit/e2e-helpers/assertSafeTestEnvironment.test.ts` (16 cases: safe loopback,
  opt-in, allow-list; fail-closed for unproven cloud / unset URL / invalid URL; no
  NODE_ENV reliance; no secret leakage).
- **Behaviour change to flag for Marcus:** this makes **all** e2e specs refuse to run
  against the cloud production project unless he explicitly sets
  `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true`. That is intentional hardening (it removes the
  ability to accidentally run destructive e2e against prod), but it is a shared-harness
  change — committed **locally only**, not pushed, pending review.

## 10–15. Live behaviours (Guided Stop, Finish Setup / map, insertion / branches / sections, Ask React preview/apply, Save/reload/parity/undo-redo/execution, Free-plan entitlement)

**Unverified in the real browser** — all gated behind the same blocker. What *is*
established (non-destructively) is that the **Document unit/integration layer that backs
these behaviours is green** (§18): projection, commands, navigation, sections,
telemetry, a11y, preview render. That is not a substitute for the live journey; it is
the pre-condition the journey would exercise.

## 16. Live screenshots & mock comparison

**Not captured** — capturing them requires the authenticated running app (blocked). The
CS-7B harness screenshots (`owner-review/*.png`, regenerable per the CS-7B report)
remain the only visual evidence and are explicitly component-harness, not live-app,
renders. No live-vs-mock comparison is possible until §22's owner action lands.

## 17. Responsive & larger-workflow observations

**Not gathered from the live app** (blocked). The CS-7B slice recorded a 430px narrow
pass and `projectionPerf` unit coverage; true phone-width (<400px) and 100-node live
behaviour remain uncertified in a real browser.

## 18. Tests & checks with counts (all in `C:/tmp/cs7c-wt`, base `f6be45bc8` + this slice's guard)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | **clean** (0 errors) |
| `lint:structure` (`check-leaf-folder-counts.mjs`) | **OK** — every leaf ≤ 50 files |
| `lint:migrations` (`check-migration-rls.mjs`) | **OK** — RLS + GRANTs present |
| eslint (touched files) | **0 errors / 0 warnings** |
| Document builder folder (`tests/unit/features/workflow-builder/document` + `document-builder-no-react-flow`) | **32 suites / 351 tests green** (isolation) — matches CS-7B baseline |
| New guard unit test (`assertSafeTestEnvironment`) | **16 / 16 green** |
| Playwright journey `--list` | **2 tests discoverable**, both self-skip only on wrong flag |
| Broad `features/workflow-builder` folder | 271 suites / ~2662 tests pass; pre-existing failures — see §19 |

## 19. Pre-existing failures verified at `f6be45bc8`

All failures below occur at the **base commit with zero CS-7C product-source changes**
(the guard files are new test-only files under `tests/`, and the guard lives under
`tests/e2e/` which jest ignores):

- **Deterministic (2), matching CS-7B's own note:** `WorkflowCanvas.test.tsx`
  (action-bar tabs) and `NodeInspectorPanel.test.tsx` (delete-dialog) — reproduced in
  isolation (`--runInBand`): 2 failed / 44 passed.
- **Flaky under parallel load (provider-config integration suites):** the count varied
  between runs (6 failing in one full-folder run, ~16 in another) and every sampled
  suite **passes in isolation** (e.g. `gmail-send-email-config` → 1/1). These are
  `waitFor`-timeout flakes when the whole folder runs fully parallel — **not** CS-7C
  regressions, and **none** are in the Document folder.

None of these are introduced or worsened by CS-7C.

## 20. Exact changed files (this slice)

- `tests/e2e/helpers/assertSafeTestEnvironment.ts` — **new**, pure guard + assert.
- `tests/e2e/helpers/supabaseAdmin.ts` — wired `assertSafeTestEnvironment()` into
  `adminClient()` (the destructive seam).
- `tests/unit/e2e-helpers/assertSafeTestEnvironment.test.ts` — **new**, 16 tests.
- `docs/slices/phase-5/dual-builder-cs7c-live-acceptance.md` — **new**, this report.

No product source, engine, workflow schema, AI system, save path, migration, or
entitlement model was added or changed.

## 21. Safety confirmation

Nothing was **pushed, deployed, migrated against production, PR'd, or enabled in shared
configuration**. No production data or credentials were used; no test users/workflows
were created anywhere. `ENABLE_DOCUMENT_BUILDER` remains **default-OFF** in checked-in
config. Only host/ref categories were ever surfaced — never URLs, refs, or keys.

## 22. Minimum owner action to unblock CS-7C

Provide a **safe, non-production Supabase** and wire the harness to it. Either:

**Option A — local Supabase (preferred, fully offline):**
1. `supabase init` (creates `supabase/config.toml`); `supabase start` (Docker).
2. Apply the repo migrations to the local DB (`supabase db reset`) and confirm the
   40+ `supabase/migrations/*` apply cleanly + the `workflow-files` storage bucket
   exists. (This is new bootstrap infrastructure and needs owner sign-off — it was out
   of scope to invent here.)
3. Put the **local** `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`), local anon
   key, and local service-role key into a **gitignored** `.env.test.local`, and make
   `playwright.config.ts`'s `webServer` + `global-setup.ts` load that file instead of
   `.env.local`. The new guard then passes automatically (loopback host).

**Option B — dedicated cloud test project:**
1. Create a **separate** Supabase project (distinct ref from prod), apply migrations,
   disable CAPTCHA, obtain its service-role key.
2. Supply its values via a gitignored env, and either set
   `E2E_ALLOW_DESTRUCTIVE_TEST_SETUP=true` or add the ref to `E2E_TEST_SUPABASE_REFS`
   so the guard admits it.

Then re-run CS-7C's flag-on and flag-off journeys and the Free-plan entitlement case.

## 23–24. Recommendations

- **GO/NO-GO for owner testing:** **NO-GO** for owner testing *of the live authenticated
  journey* — there is no safe app instance to test against yet (§22 unblocks it). Owner
  review of the **CS-7B component-harness screenshots** remains available.
- **GO/NO-GO for a small opt-in beta:** **NO-GO.** The load-bearing acceptance (real
  Document/Visual pending-state parity, Guided Stop editing, Finish Setup, map,
  insertion/branches/sections, non-mutating React preview → Apply, undo/redo, explicit
  Save, reload persistence, execution, and the Free-plan branching backstop) has **never
  been exercised in a real browser**. Until it is, beta readiness is unproven.
- **Remaining blockers before broader exposure:**
  1. A safe test Supabase + harness wiring (§22) — the single hard blocker.
  2. Then: a green flag-on journey, a green flag-off case, live screenshots + mock
     comparison, the Free-plan entitlement UI + server-backstop proof, and the
     responsive / large-fixture live smoke.
  3. Keep `ENABLE_DOCUMENT_BUILDER` default-OFF until all of the above pass.
