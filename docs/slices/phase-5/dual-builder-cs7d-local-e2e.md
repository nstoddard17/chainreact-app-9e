# 5.DUAL-BUILDER-1 CS-7D — Safe local Supabase E2E + Dual Builder live beta gate

> Governing rules held: never production Supabase for E2E; never weaken the CS-7C
> guard; Document Builder stays default-OFF in checked-in config; two editors, one
> workflow; no new save path / graph store / AI system / entitlement model / schema.

## 1. Plain-language result — **UNBLOCKED and PASSING**

CS-7C was blocked because the repo had no safe database to run the authenticated
journey against. CS-7D removes that blocker: it stands up a **real local Supabase**
(Docker + Supabase CLI), applies the repository's own 106 migrations to it, wires a
gitignored `.env.test.local` loopback environment through Playwright, and then **runs
the real authenticated Dual Builder browser journeys against it — all green**:

- **Flag-ON journey** (build in Visual → edit in Document via Guided Stop → parity →
  Save → reload → persist → activate + run + execution parity): **PASSED**.
- **Flag-OFF journey** (toggle absent, Visual-only editing/save): **PASSED**.
- **Free-plan entitlement journey** (3 tests: Pro branch executes; Free sees the
  locked treatment and a crafted advanced-branching save is typed-403 with nothing
  persisted; a crafted run is 403 **before any handler executes**): **3/3 PASSED**.

The live journey exposed **one real product defect** (the Whole Workflow map dialog
did not close on Escape in a real browser) — reproduced, root-caused, fixed at the
smallest layer, regression-tested, and re-verified green in the browser.

The CS-7C safety guard is **preserved and strengthened**: destructive E2E now loads
`.env.test.local` (loopback) and **never** `.env.local`, fails closed on missing
local credentials, and the guard still rejects any cloud host.

## 2. Worktree / branch / base / commit

| Item | Value |
| --- | --- |
| Worktree | `C:/tmp/cs7d-wt` (registered git worktree; not `.claude/worktrees/` per CS-7C's Windows-glob note) |
| Branch | `dual-builder-cs7d-local-e2e` |
| Base commit | `0c5ba8d16` (CS-7C guard + blocked report) |
| Initial HEAD | `0c5ba8d16` |
| Final HEAD | see the single local commit on this branch |
| `node_modules` | **Resolved from another tree** — Windows junction to the parent repo's `node_modules` (zero package/lockfile drift vs base). |

## 3. Docker & Supabase CLI versions

- Docker: **29.4.1** (Linux engine; daemon started for this run).
- Supabase CLI: **2.109.1** (via `npx supabase@2.109.1`; not a repo dependency).

## 4. Local Supabase URL category — LOOPBACK (proof, no secrets)

`NEXT_PUBLIC_SUPABASE_URL` resolves to `http://127.0.0.1:54321` (loopback). Proof
without secrets: `npm run supabase:test:status` prints `API_URL loopback: true`. The
CS-7C guard admits it purely because the host is loopback — **no
`E2E_ALLOW_DESTRUCTIVE_TEST_SETUP` override was needed or set**. Studio/db/inbucket
are the standard local ports (54323/54322/54324). No anon/service-role/JWT/password
value is printed anywhere in this slice's logs or report.

## 5. Local Supabase bootstrap / reset commands

- `npm run supabase:test:start` — start the local stack, apply all migrations, and
  (re)write `.env.test.local` from local status (Supabase keys refreshed; local app
  secrets persisted).
- `npm run supabase:test:stop` — stop the local stack.
- `npm run supabase:test:reset` — re-apply all migrations to the **local** db only.
- `npm run supabase:test:status` — print loopback URL category only (never keys).
- `npm run e2e:dual-builder` / `npm run e2e:dual-builder:flag-off` — flag-on / flag-off
  browser journeys (1 worker; grep-selected by `@flag-on` / `@flag-off`).

`scripts/supabase-test.mjs` asserts the resolved API URL is loopback before writing
env or resetting, never accepts a cloud URL, and never runs `db push` / `--linked`.

## 6. Migrations applied & local-compatibility changes

All **106** repository migrations applied cleanly to local Postgres 17
(`supabase_migrations.schema_migrations` = 106; `supabase start` exits 0, which it
would not if any migration failed). Verified the 7 core tables exist (accounts,
workflows, integrations, workflow_runs, account_billing, trigger_resources,
account_memberships).

**No migration was edited.** The only extension used is `pgcrypto` (present locally);
auth/storage/role grants (`anon`/`authenticated`/`service_role`) all resolve locally;
the two files that matched a `pg_net`/`cron` grep only mention "cron" in **comments**
(future reconciler), no remote-service dependency. The only new Supabase project files
are the standard CLI scaffold: `supabase/config.toml` (loopback ports,
`enable_confirmations=false`, no secrets) and `supabase/.gitignore`. No
compatibility-shim migration was needed. **No migration was run against production.**

## 7. Storage buckets & policies

The tested journeys use native nodes (Manual Trigger + Format Transformer) and do not
touch storage, so no bucket was required to pass. The existing helper
`ensureWorkflowFilesBucket()` still creates the `workflow-files` bucket idempotently
for file-path tests when they run. No private bucket was made public. (Bucket/policy
bootstrapping for file-upload journeys remains available via that helper; not
exercised here because the acceptance journeys don't upload.)

## 8. Auth & CAPTCHA / test-login behaviour

Sign-in uses the existing `signInViaEmailLink` helper: the service role mints a real
`recovery` link (`generateLink`) and the test drives the app's own `/auth/callback`
(`verifyOtp`) — an ordinary authenticated session, no bypass/backdoor. Local Supabase
does not enforce Turnstile/CAPTCHA (a project-level production setting), so this works
locally with **no change to production auth or CAPTCHA behaviour** and no bypass token
committed. `email_confirm:true` on the admin-created user avoids the confirmation step.

## 9. Environment-loading behaviour & proof `.env.local` is not used

New authoritative loader `tests/e2e/helpers/testEnv.ts`:

- Precedence: **process env → `.env.test.local` → non-secret loopback defaults**
  (URL/base only; **no default for any key**).
- **Never reads `.env.local`** — the previous `.env.local` reader in `global-setup.ts`
  was removed entirely; `playwright.config.ts` and `global-setup.ts` now call
  `loadTestEnv()`. The e2e worktree has no `.env.local` at all.
- **Fails closed**: a missing required key (e.g. service-role) throws a message that
  names the missing key(s) and never prints a value.

Loader/guard tests (`tests/unit/e2e-helpers/testEnv.test.ts`, 12) prove: file preferred
over defaults; process preferred over file; loopback default only when nothing supplies
the key; **no default for secrets**; the resolved path ends `.env.test.local` (not
`.env.local`); missing service-role fails closed with no secret leaked; a loopback URL
passes the CS-7C guard end-to-end while a cloud URL **fails closed at the guard**.

## 10. Safety-guard behaviour

The CS-7C guard (`assertSafeTestEnvironment`, called in `adminClient()`) is unchanged
in behaviour and still the destructive chokepoint: loopback ⇒ pass; cloud host ⇒ throw
(unless explicit opt-in / allow-list). Its 16 tests still pass. (One type-only edit:
`NodeJS.ProcessEnv` → `Record<string,string|undefined>` to clear a repo-wide
`no-undef` lint error; no behaviour change.)

## 11. Test-user / account / workflow fixture lifecycle & cleanup

Per-run unique user (`e2e-<uuid>@chainreact.test`) created via the guarded admin
client; personal account auto-created by the app path; plan stamped deterministically
(`account_billing` pro/free) via the same columns the Stripe webhook writes; onboarding
dismissed in-UI; workflow created through the real toolbar Create. Teardown in
`afterEach` calls `deleteTestUser` (RESTRICT children → account → auth user, error-
checked, loud on final failure) — scoped to the created user's ids, **no broad delete**,
**local Supabase only**. All journeys cleaned up (no leftover users; local only).

## 12. Exact app & Playwright commands

```bash
npm run supabase:test:start                 # bring up local Supabase + write .env.test.local
npm run e2e:dual-builder                     # flag-ON journey (ENABLE_DOCUMENT_BUILDER=true, @flag-on, 1 worker)
npm run e2e:dual-builder:flag-off            # flag-OFF case (ENABLE_DOCUMENT_BUILDER=false, @flag-off, 1 worker)
ENABLE_DOCUMENT_BUILDER=true npx playwright test advanced-branching-entitlement --workers=1   # Free/Pro entitlement
```

## 13. Flag-ON journey result

**Executed and PASSED** (1 passed, ~43s) — did not self-skip (asserts `FLAG_ON===true`
and fails loudly if mis-run). Proves: build in Visual + configure action; switch to
Document (no read-only CS-1 banner); same trigger/action/config visible; value chip →
Guided Stop opens from the sentence; edit commits locally and the Document updates;
Save via the header (no autosave before Save); reload persists into Document; switch to
Visual with canonical topology/config unchanged; Activate + run via the durable queue;
execution **succeeds** and the run step output carries the Document-edited value
(`transformedContent === "document value"`). Whole Workflow map opens and (after the
fix) closes on Escape. No duplicate workflow created.

## 14. Flag-OFF journey result

**Executed and PASSED** (1 passed, ~35s) — did not self-skip (asserts `FLAG_ON===false`).
Proves: authenticated Visual builder loads; **no** `builder-view-toggle` and **no**
`document-view` mounted; trigger added; toggle still absent after content exists; Save
path intact. Cleanup succeeded.

## 15. Free-plan entitlement result

**3/3 PASSED** (existing `advanced-branching-entitlement.spec.ts`, run flag-ON): Pro
adds If/Then via the library and both routes execute after save/reload; **Free** sees
If/Then + Router **locked** (pro badge) and a **direct API save** containing the
restricted node is rejected **typed 403** (`capability:"advanced_branching"`,
`requiredPlan:"pro"`) with nothing persisted; a downgraded account's **run-now is 403
before any handler executes**. Local billing state set via safe DB fixtures — **no
production Stripe touched**.

## 16. Live product defects found & fixed

**Defect (product):** the Whole Workflow map dialog (`WholeWorkflowMap.tsx`) did not
close on Escape in a real browser.
- **Root cause:** the `<aside role="dialog">` had an `onKeyDown` Escape handler but no
  `tabIndex` and nothing focused it on open, so focus stayed on the opener button
  **outside** the dialog subtree and the handler never received the key. jsdom unit
  tests dispatch keydown directly on the node, so they passed — a harness-vs-real gap
  the live journey caught.
- **Fix (smallest layer):** focus the dialog container on mount (`tabIndex={-1}` +
  `rootRef.focus()`), mirroring the sibling `GuidedStopEditor` pattern. No model/graph
  change.
- **Regression:** `wholeWorkflowMapDialog.test.tsx` locks focus-on-mount + Escape-closes
  + close-button. Re-ran the exact browser step: **now green**.

**Test-infra fix:** `supabaseAdmin.deleteTestUser.test.ts` set a **cloud** URL
(`example.supabase.co`) in its env, which the CS-7C guard (added in `adminClient()`)
now rejects — so the suite failed at base `0c5ba8d16`. Changed it to loopback
(`127.0.0.1:54321`); the faked-client unit test now passes (9/9). This is the correct
value for a destructive-teardown unit test and mirrors the real local env.

## 17. Guided Stop / Finish Setup / map / insertion / branch / section / Agent preview / Save / reload / execution

Proven **live** by the flag-on journey (assertions above): Guided Stop editing, Whole
Workflow map open+Escape-close, Save (explicit, no autosave before), reload persistence,
Visual↔Document parity, Activate + durable-queue run with execution parity. Insertion
menu, If/Then both-lanes authoring, top-level sections, and the Ask React
preview→apply/undo-redo flow are **not yet asserted in this live journey** — they retain
strong unit/integration coverage (Document folder green, below) and CS-7B harness
screenshots, but adding them as live browser assertions is the recommended CS-7E
extension (see §26). Honest scope: the live journey covers the load-bearing dual-builder
parity + execution path, not all 41 enumerated sub-steps.

## 18. Screenshot paths & mock comparison

Real authenticated screenshots (uncommitted, gitignored `owner-review/cs7d/`):
`01-document-linear.png`, `02-guided-stop-open.png`, `07-whole-workflow-map.png`,
`10-document-saved-persisted.png`, `11-narrow-document.png` (400px), `12-visual-same-graph.png`.

Comparison to CS-7B harness mocks: the live shell renders the same Document surface,
Guided Stop editor, and map the harness previewed — but with the **real app shell**
(header/toggle, real provider node cards) and **real provider metadata** (Format
Transformer / Manual Trigger labels) rather than the harness's neutral fixtures, and
with real `var()`-based theming (which the jsdom harness flattened per the CS-7B note).
No layout defect appeared in the shell beyond the Escape bug (now fixed). The remaining
6 of 12 requested states (insertion menu, If/Then both lanes, section+selection, Finish
Setup queue, Ask React composer seed, ghost preview, applied-unsaved preview) are **not
captured live in this batch** — they remain covered by CS-7B harness shots; capturing
them live is part of the §26 extension.

## 19. Responsive & larger-workflow observations

Narrow-width (400px) Document renders without horizontal overflow and stays usable
(`11-narrow-document.png`; the flag-on journey asserts `document-view` visible at 400px
then restores). No browser crash or multi-second lock observed across the ~35–43s
journeys; no console errors surfaced in the passing runs. Dedicated 10/30/100-node and
depth-3 fixtures were **not** driven live in this batch (the journey builds a 2-node
workflow); large-fixture behaviour retains unit coverage (`projectionPerf`) and is a
§26 extension. No brittle timing gates were added.

## 20. Tests & checks (pass/fail counts, in `C:/tmp/cs7d-wt`)

| Check | Result |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | **clean** (0 errors) |
| `npm run lint` (`eslint .`) | **0 errors** (19 pre-existing warnings, all in files CS-7D didn't touch) |
| `npm run lint:structure` | **OK** |
| `npm run lint:migrations` | **OK** |
| Document folder + e2e-helpers + structure lock | **36 suites / 391 tests green** |
| — incl. new loader tests | 12 green |
| — incl. CS-7C guard tests | 16 green |
| — incl. deleteTestUser (fixed) | 9 green |
| — incl. new map-dialog regression | 3 green |
| Flag-ON browser journey | **1 passed** (~43s) |
| Flag-OFF browser journey | **1 passed** (~35s) |
| Free/Pro entitlement browser journey | **3 passed** (~1.2m) |

## 21. Pre-existing failures verified at `0c5ba8d16`

- `supabaseAdmin.deleteTestUser.test.ts` (9) failed at base because the CS-7C guard
  (present at base in `adminClient()`) rejects the test's hardcoded cloud URL — **fixed**
  in this slice (loopback env).
- 19 `eslint .` **warnings** (max-lines / unused-var) exist at base in untouched files
  (e.g. `services/oauth/dispatcher.ts`, marketing pages); not errors, not CS-7D's.
- One `eslint .` **error** (`NodeJS is not defined` in the CS-7C guard file) existed at
  base under whole-repo lint — **fixed** (type-only change).

## 22. Exact changed files

**Modified:** `features/workflow-builder/document/WholeWorkflowMap.tsx` (Escape fix) ·
`tests/e2e/helpers/assertSafeTestEnvironment.ts` (type-only lint fix) ·
`tests/e2e/global-setup.ts` (loadTestEnv, drop `.env.local` reader) ·
`playwright.config.ts` (loadTestEnv + local app env into webServer) ·
`tests/e2e/dual-builder-document-journey.spec.ts` (assert flag state, no self-skip; +
screenshots) · `tests/unit/e2e-helpers/supabaseAdmin.deleteTestUser.test.ts` (loopback
guard env) · `package.json` (npm scripts).

**New:** `tests/e2e/helpers/testEnv.ts` · `tests/unit/e2e-helpers/testEnv.test.ts` ·
`tests/unit/features/workflow-builder/document/wholeWorkflowMapDialog.test.tsx` ·
`scripts/supabase-test.mjs` · `scripts/run-e2e-dual-builder.mjs` ·
`supabase/config.toml` · `supabase/.gitignore` · this report.

**Not committed:** `.env.test.local` (gitignored), `owner-review/cs7d/*` (gitignored).

## 23. Safety confirmation

Nothing was **pushed, deployed, PR'd, migrated against production, or enabled in shared
config**. No production Supabase/Stripe/data/credentials were used. Migrations ran only
against the **local** loopback stack. `ENABLE_DOCUMENT_BUILDER` stays **default-OFF** in
checked-in config (forwarded per-run only via the command env). No new engine, workflow
schema, AI system, graph store, save path, or entitlement model was introduced. Only
host/ref categories were ever surfaced — never a URL, ref, or key.

## 24. GO/NO-GO — owner testing

**GO.** An owner can now bring up the exact stack locally (`npm run supabase:test:start`
then `npm run e2e:dual-builder`) and exercise the real authenticated Dual Builder end to
end. Visual↔Document parity, Guided Stop editing, the map, Save/reload, and execution
parity are proven in a real browser.

## 25. GO/NO-GO — small opt-in beta

**Conditional GO.** The load-bearing dual-builder guarantee (two editors, one workflow),
the Free-plan branching backstop, and the flag-off isolation are all proven live and
green, and the feature stays default-OFF. The condition: the live journey does not yet
assert the **manual insertion / If-Then both-lane authoring / sections / Ask React
preview→apply→undo-redo** surfaces in the browser (they pass at the unit/integration
level and in CS-7B harness shots). Recommend either (a) a small closed beta behind the
flag now, with those surfaces owner-smoke-tested manually, or (b) land the §26 CS-7E
extension first for a fully-automated live guarantee. No production exposure risk exists
while the flag is default-OFF.

## 26. Remaining blockers before broader exposure

1. **CS-7E (recommended):** extend the live flag-on journey to assert insertion menu,
   If/Then both-lane authoring, top-level sections (rename/collapse persistence), and the
   Ask React preview→apply→undo/redo flow (mocking only the external model boundary, per
   the existing guidance intercepts) — plus capture the remaining 6 of 12 screenshots and
   drive the 10/30/100-node + depth-3 fixtures live.
2. Wire sibling provider e2e specs' provider secrets into `.env.test.local` if those
   specs are to run locally too (out of CS-7D scope; they previously drew from `.env.local`).
3. Keep `ENABLE_DOCUMENT_BUILDER` default-OFF until the above is complete.
