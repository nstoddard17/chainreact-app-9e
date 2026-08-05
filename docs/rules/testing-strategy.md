# Rule: Testing Strategy

## Purpose

Define how ChainReactV2 tests are designed so they catch real issues, validate expected behavior, cover both good and bad paths, verify error handling, and protect against known regressions.

Known production regressions that shaped ChainReactV2 behavior have regression tests. Each test describes the business rule it protects.

This doc is the **central testing philosophy** for ChainReactV2. The other rule docs each list specific required tests for their subsystem; this doc defines what makes any test acceptable. Every test must justify its existence against the principles below — both at PR-review time and during periodic test-suite audits.

Tests must validate **business behavior and expected system outcomes**, not implementation details, file structure, or the bare fact that a function was called.

## Resolved Decisions

**Locked for Slice 1:**
- Tests prove business behavior, not implementation. Every test answers: *"What real failure would this catch?"*
- The good-path / bad-path / error-handling matrix (§5) is required for every important feature.
- Mocks are restricted to external boundaries only (§7). Mocking the function under test or the rule being tested is forbidden.
- Regression tests for known regressions are mandatory (§8) and live in `tests/parity/`. The list seeds with: resolver drift, auth refresh deadlock, auto-resume after reconnect, duplicate webhook delivery, billing RPC reconciliation (ledger sums equal counters), session-side-effects idempotency.
- Test naming follows the convention in §9 — names describe business behavior, not surface action.
- Every PR answers the test-acceptance checklist (§10) before merge.
- Slice 1's minimum test set (§11) is the floor; no slice-1 work merges without it.
- The anti-patterns in §12 are grounds for blocking a PR or removing a test.

**Deferred decisions:**
- Whether to add mutation testing (e.g. Stryker) once the suite stabilizes. Slice 1: not required.
- Whether to enforce the test-acceptance checklist via a PR-template bot or a manual reviewer pass. Slice 1: manual reviewer pass.

**Decisions requiring product-owner input:**
- None for Slice 1.

## Anti-patterns this strategy prevents

These test-suite patterns pass without proving anything useful and are rejected:

- Generated tests that prove only that a mocked function returns what the mock told it to return.
- Happy-path-only tests that silently miss error and edge-case behavior.
- Tautological tests — flipping the assertion still passes, or removing the function under test still passes.
- Tests that validate file structure or implementation details (`expect(file).toContain('useState')`) instead of product behavior.
- Systematically under-covered error handling, bad inputs, disconnected integrations, billing failures, missing variables, webhook replay, and lifecycle edge cases. Historically, most production incidents came from these paths.
- Test names like "works", "handles error", "renders" that don't tell you what business rule is at risk if the test fails.

The result to avoid: a suite that is green most of the time but doesn't prevent the bugs that matter.

## ChainReactV2 testing principles

1. **Every test answers: "What real failure would this catch?"** If the answer is "none" or "implementation moved", delete the test.
2. **Test the business rule first, implementation second.** The rule lives in the rule doc; the test cites it.
3. **Every major feature needs good-path, bad-path, and error-handling coverage.** Not "we'll add bad-path tests later." All three at the same PR.
4. **Tests prove the system behaves correctly when dependencies fail.** Disconnected integrations, expired tokens, 5xx responses, missing variables, billing exhaustion — these are first-class test targets, not afterthoughts.
5. **Tests protect known regressions.** Each named in `tests/parity/` with a comment naming the incident and the business rule it protects.
6. **Prefer testing through public boundaries:** service APIs, route handlers, engine entrypoints, provider adapters, UI flows. Avoid testing private implementation details.
7. **Do not mock the function under test.** Ever.
8. **Do not write tests that only assert "truthy" or "called once"** unless that is part of a meaningful behavior. "called once" is meaningful when "called twice" would be a duplicate side effect; otherwise it is noise.
9. **Do not write tests that pass even when the core logic is removed.** A useful sanity check during review: comment out the body of the function under test and see if the test still passes. If it does, the test is wrong.
10. **A test should fail for the right reason** if the expected business rule is broken. The failure message should point a reader at the rule, not at a stack trace deep in test plumbing.
11. **Tests must cover user-facing error behavior**, not just thrown exceptions. "Throws on bad input" is rarely enough; the user-visible error code, message, and CTA matter.

## Required test categories

### A. Unit tests — pure business rules

Lives in `tests/unit/core/`, `tests/unit/workflow-engine/`. Examples:
- Lifecycle transition rules (allowed transitions, preconditions, rollback)
- Variable resolver behavior (strict / soft, missing, AI_FIELD classification)
- Cost calculation
- Error humanizer (category → title, description, hint, action)
- Provider manifest validation (each manifest validates against the contract)
- Scope validation (granted scopes vs `manifest.scopes.required`)

### B. Service / domain tests — orchestration rules

Lives in `tests/unit/services/`. Examples:
- Activation runs preconditions before persisting state.
- Disabled workflow does not execute.
- Billing gate blocks execution.
- OAuth refresh lock prevents duplicate refresh calls.
- Lifecycle orchestrator rolls back trigger registration on failure.

### C. Integration tests — real subsystem interaction

Lives in `tests/integration/`. Examples:
- API route → service → repository (real Supabase test schema).
- Webhook receive → normalize → dispatch → run enqueued.
- OAuth callback → token storage → connection status.
- Workflow save → revision created → builder reloads saved state.

### D. Provider contract tests

Lives in `tests/unit/integrations/<p>/`. Examples:
- Slack `send_channel_message`: success, provider error, 401, missing channel, rate limit (each as a separate test).
- Provider manifests expose required scopes and capabilities.
- Webhook signatures validate; forged requests rejected.

### E. Engine tests

Lives in `tests/unit/workflow-engine/`. Examples:
- Execution order (topological).
- Variable pre-resolution before handler invocation (Q2).
- Missing variables produce the standardized config-failure shape (handler not invoked).
- Handler failures classify correctly (Q1 categories).
- Retry behavior is explicit; no implicit retry.

### F. UI / component tests

Lives in `tests/unit/features/`. Examples:
- Builder renders state correctly.
- Config save calls the typed client API (not the service or repository directly).
- Disabled fields render disabled based on the lifecycle projection helper.
- Error banner displays the humanized error from the classifier.

#### Responsive work

Responsive layout follows [responsive-layout-and-validation.md](./responsive-layout-and-validation.md),
which adds requirements a normal component test does not cover:

- **Continuous-width browser measurement** — 360→1600px in ≤8px increments across the
  surface's representative fixture states, not a handful of named breakpoints.
- **Three assertion classes, all required** — *containment* (nothing escapes the box that
  lays it out, walking descendants and not just document width), *legibility* (a contained
  region still has enough width to be readable), and *panning policy* (ordinary management
  data must not require sideways dragging on a phone). Each of the three catches defects
  the other two pass.
- **Non-vacuous proof** — a green harness does not count until it has been shown to fail
  against the pre-fix source, a reverted fix, a mutation, or a controlled fixture defect,
  reported with failure counts and width ranges. Never weaken an assertion to make the
  final source pass.

Plus a `tests/structure/*-responsive-source.test.ts` guard for the surface, and rendered
tests proving one control set per entity across the presentation switch.

### G. E2E tests

Lives in `tests/e2e/playwright/`. Reserved for **critical user journeys only**:
- Sign up.
- Connect Slack.
- Create workflow.
- Configure trigger / action.
- Activate.
- Receive event.
- Run succeeds.
- Run failure displays a useful, humanized error.

E2E is not for edge cases. Edge cases live in unit / integration layers.

**Shared-mock e2e execution.** Shared provider-mock e2e specs that mutate shared workflow/provider fixtures must run serially with `--workers=1`; apply required workflow/provider migrations, including `workflow_files` where file-output flows are involved, before running those specs. (Slice-specific history: [`../slices/phase-2/slack-2-4-outcomes.md`](../slices/phase-2/slack-2-4-outcomes.md).)

### H. Regression tests

Lives in `tests/parity/`. Regression tests created from known bugs. Each named after the incident and documents the business rule it protects. Initial seed list:
- `auth-refresh-deadlock` — `getSession()` lock contention scenario from PR-AUTH-1.
- `scope-drift` — dual-scope-source bug.
- `resolver-drift-missing-value` — multi-path resolver returning different values for the same template.
- `auto-resume-after-reconnect` — workflow auto-becoming-active after integration reconnect (must NOT happen).
- `duplicate-webhook-delivery` — same provider event causing two runs.
- `billing-rpc-reconciliation` — ledger sum drifting from profile counters (ledger sums must equal counters).
- `session-side-effects-idempotency` — replay producing duplicate side effects.

## Good-path / bad-path / error-handling matrix

For every important feature, require at least these six cases:

| Case | What it covers |
|---|---|
| **Good path** | Valid input produces the expected result. |
| **Bad path** | Invalid input is rejected with the documented error. |
| **Missing dependency** | Disconnected integration, missing token, missing variable, missing billing entitlement → typed failure. |
| **Provider failure** | 401, 403, 429, 500, timeout from the upstream provider → handled per Q3 / Q9 contract. |
| **User-facing error** | Correct user-visible error code, message, and CTA. (Throwing the right exception is not enough.) |
| **State integrity** | After failure, no partial writes, no invalid lifecycle transitions, no duplicate side effects, no leaked locks. |

A feature with only good-path tests is not done.

## Error handling requirements

Every feature that can fail must test:
- The **typed error code** returned.
- The **user-facing message** or **CTA** rendered.
- Whether a **log or metric** is emitted (and at what level).
- The **system state after failure** (was anything persisted? Did locks release? Did the integration row stay healthy?).
- **Rollback behavior** if applicable (failed activation does not leave a half-registered trigger).
- **Retry behavior** if applicable (refreshable provider 401 → refresh once; non-refreshable → no retry).
- That **no secrets / tokens leak** into the error message, log, or response body.

Examples:
- OAuth callback fails → integration row not created; user sees a humanized message; log records the failure category but not the token.
- Trigger registration fails → workflow remains `draft`; user sees the registration error; trigger_resources stays clean.
- Webhook dedup store fails → fail-**closed** policy applies (LAUNCH-DEDUP-FAILSAFE): enqueue is skipped, a `webhook_dedup_unavailable_skip_enqueue` metric emits, no duplicate run is created. (The Q4 within-session side-effect backstop that fail-open assumed is not implemented, so the dispatcher never proceeds past an unconfirmed dedup check.)
- Slack action returns 401 → non-refreshable provider emits `action_required`; no refresh attempt; health engine updates.
- Missing variable in handler config → standardized config-failure shape; handler is not invoked; user sees the missing-reference path in the run history.

## Mocking rules

**Allowed:**
- Mock external provider APIs (Slack, Gmail, Stripe, OpenAI HTTP calls).
- Mock network failures, timeouts, latency.
- Mock time / clock for time-sensitive logic.
- Mock queues when testing service behavior (queue-write side effects can be asserted directly).
- Mock the typed client API in UI tests (the UI test verifies the component → hook → API contract; the API contract is verified separately).

**Not allowed:**
- Mock the function under test.
- Mock the business rule being tested. Lifecycle transitions, billing decisions, variable resolution, error classification — these are tested against the real implementation.
- Mock so deeply that the test only proves the mock was called (e.g. mocking the resolver inside a handler test that claims to verify resolution).
- Replace the actual resolver / lifecycle / billing logic with stubs in tests that claim to verify those rules.

When in doubt, mock at the **HTTP boundary** or the **provider SDK call**. Mock as little as possible and as far out as possible.

## DB-backed fixture teardown (REQUIRED)

Any suite that creates real rows on the shared Supabase project — auth users,
accounts, workflows, integrations — **must** tear them down with the shared
helper. Do not hand-roll an `afterAll`.

```ts
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

const fixtures = createFixtureTracker();

// Mint users through the helper so the id is tracked before anything can throw.
const user = await createTrackedUser(admin, fixtures, "my-suite");
// Track any account the suite creates EXPLICITLY (team/org). Personal accounts
// are created by a DB trigger and resolved automatically from owner_user_id.
fixtures.trackAccount(teamId);

afterAll(async () => {
  await cleanupFixtures(admin, fixtures);
});
```

**Why this is a rule, not a suggestion.** Every suite used to write its own
teardown, and they repeated the same three mistakes: deleting
`account_memberships` before `accounts` (which trips the
`account_memberships_team_owner_invariant_violation` trigger), leaving an
`ON DELETE RESTRICT` child behind so the account delete fails, and never
checking `error` — so a green run silently leaked. ~320 synthetic
`@chainreact.test` users accumulated in the shared project that way, alongside
9,320 debris workflows. `cleanupFixtures` deletes in the production purge order
(`services/accounts/accountPurge.ts`): RESTRICT children → account rows
(cascading memberships) → `auth.users` last. It collects every failure and
throws one aggregate at the end, so teardown never stops early and never passes
silently.

**Build fixtures in `beforeAll`, not in `it()` bodies.** A creation started
inside a test that then fails or times out can complete *after* `afterAll` has
run, leaving an untracked row nothing can clean. Fully await every fixture in
`beforeAll`.

**Tables the helper deliberately does NOT touch.** These FK `accounts` with
`ON DELETE SET NULL`, or have no FK at all, so they neither cascade nor block —
and in production they are meant to outlive the account:
`task_usage_events`, `ai_cost_events`, `billing_shadow_comparisons`,
`react_agent_audit_events`, `account_deletions`, and platform-owned
`workflow_templates` (`account_id NULL`). A suite that writes to any of them
clears its own rows **before** calling `cleanupFixtures`.

**Smoke suites never use a real account.** Throwaway runs call
`provisionDisposableSmokeAccount` (`@/tests/helpers/smokeAccount`); live-provider
runs must name their target explicitly via `SMOKE_LIVE_ACCOUNT_ID` /
`SMOKE_LIVE_USER_ID` and skip when unset. The general-purpose
`SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID` vars pointed at a real production account
and are no longer read by any suite; a structure test
(`tests/structure/no-shared-smoke-account.test.ts`) fails the build if they
come back.

**`tests/globalTeardown.ts` is a safety net, not the cleanup path.** It sweeps
leftover `@chainreact.test` fixtures once per run and names the offending suite
in a warning. If it reports anything, fix that suite's teardown — do not rely on
the net.

## Regression test process

Any known bug that influenced ChainReactV2 architecture gets a regression test in `tests/parity/` before the related subsystem is considered done.

Each regression test must include:
- **Short name** of the bug (matches the file name, e.g. `auto-resume-after-reconnect.test.ts`).
- **Expected V2 behavior** stated up front in the test description.
- **Why the test exists** — a one-paragraph comment at the top of the file naming the incident.
- **The business rule it protects** — link or reference to the rule doc.

When a new incident is discovered, it gets a regression test in `tests/parity/` before the bug fix lands.

## Test naming convention

Test names describe the **business behavior** the test protects.

**Good names:**
- `keeps workflow disabled after integration reconnect until user explicitly resumes`
- `does not invoke action handler when required variable is missing`
- `rolls back activation when trigger registration fails`
- `drops webhook for disabled workflow even if provider registration lags`
- `Slack 401 emits action_required without attempting refresh`
- `mixed-string template with missing reference preserves the literal token in soft mode`

**Bad names** (will be rejected in review):
- `returns true`
- `calls function`
- `renders component`
- `works`
- `handles error`
- `test 1` / `it should work`

If you cannot describe what the test protects in a sentence, the test should not exist.

## PR test acceptance checklist

Every PR with test changes answers, in the description or in PR comments:

- [ ] What business rule is being tested?
- [ ] What good path is covered?
- [ ] What bad path is covered?
- [ ] What error path is covered?
- [ ] What state-integrity condition is verified?
- [ ] What known regression does this protect, if any?
- [ ] Would this test fail if the real logic broke? (If you commented out the function body, would the test detect it?)
- [ ] Are mocks limited to external boundaries?
- [ ] Are user-facing errors tested where relevant?

A PR that adds tests but cannot answer these is not ready.

## Slice 1 minimum test requirements

Slice 1 (Slack vertical slice) does not merge without:

- **Slack manifest validation** — manifest passes Zod against `contracts/integration.ts`.
- **OAuth flow:** connect → callback → encrypted token storage; failed callback handled.
- **Slack non-refreshable 401 behavior** → dispatcher throws `RefreshNotSupported`, emits `action_required`, no refresh attempt.
- **Refreshable mock provider Q3** → connect → 401 → refresh → retry → success cycle (since Slack default v2 cannot prove this; covered in oauth-dispatcher.md tests #14 + #15).
- **Slack webhook signature verification** — valid accepted, forged rejected, expired-timestamp rejected.
- **Slack webhook normalization** — Slack event → canonical `triggerEvent` shape (table-driven across event types).
- **Webhook dedup** — duplicate `(provider, event_id)` is dropped.
- **Disabled workflow webhook drop** — provider delivers webhook for a disabled workflow, dispatcher drops, no run enqueued (shared invariant from workflow-lifecycle and webhook-receipt-routes rules).
- **Workflow lifecycle** — activate, pause, disable, eligible_to_resume, resume; per-integration cascade; multi-integration cascade matrix (4 cases).
- **Canonical variable resolver** — strict raises `MissingVariableError`; soft preserves literal in mixed-string and returns undefined for single-ref; AI_FIELD classified to sentinel without AI call.
- **Slack `send_channel_message`** — success, provider error, 401, missing channel, rate limit (Q3, Q9 paths verified).
- **Billing gate** — RPC deduction succeeds; cap-exhausted refuses; ledger row written.
- **Run history** — execution_steps written on success; humanized error written on failure.
- **Builder save flow through typed client API** — component → hook → `apiClient.workflows.saveNodeConfig()` → server route → service → repository (split into client test + server-side integration test per workflow-builder-ui rule).
- **E2E happy path** (Playwright): sign up → connect Slack → create workflow → activate → trigger event → run succeeds.
- **E2E failure visibility:** force a run failure → user sees a humanized error with the right CTA.

## Anti-patterns

The following are explicitly rejected. PRs containing them will be blocked, and existing tests matching these patterns are removal candidates during audits:

- **Tautology tests** — assert truthy on a value that the production code can never produce as falsy.
- **Mock-callcount-only tests** — only assert that a mock was called N times, with no behavior verification.
- **Implementation-mirror tests** — duplicate the production code's logic in the assertion (the test breaks any time you refactor, but doesn't catch behavior changes).
- **Structure-only tests** — assert "this file exists" or "this function is exported" without exercising it.
- **Hide-the-failure tests** — wrap the system under test in a broad `try/catch` that swallows real errors.
- **Happy-path-only tests for high-risk features** — billing, OAuth, lifecycle, webhook receipt, variable resolution, execution all need bad-path and error coverage.
- **No-business-purpose tests** — tests that exist to satisfy coverage tooling but cannot be tied to a business rule.

When in doubt during review: ask "if I delete this test, what will break?" If the answer is "nothing real", the test is the problem.

## Test runner invocation

`npm test` runs Jest as `node --experimental-vm-modules node_modules/jest/bin/jest.js`
(AI-PROVIDER-1 CS-1). The flag lets Jest's VM honor dynamic `import()` inside
dependencies — required by the document-parsing layer, where `unpdf` lazily imports its
ESM PDF.js bundle (without it, PDF suites fail with
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`). Existing CJS suites are unaffected.
When running ad-hoc suites, prefer `npm test -- <path>` over bare `npx jest <path>`;
the bare form lacks the flag and fails any suite that parses PDFs.

## Scope of a verification run (owner policy)

**The full repository suite is NOT the default gate.** A bare `npm test` executes the
entire inventory; its time and machine cost is out of proportion to the signal for a
normal batch. The approved default after a meaningful batch is:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test -- <the paths your change actually touches>
```

Rules that go with it:

- **Report exact suite and test totals** for every command run — and never claim a
  command ran unless it actually ran. If something was skipped, say why.
- **`lint:structure`:** separate pre-existing baseline failures from new ones by
  comparing against the base commit. Do not modify unrelated baseline offenders to
  make the check green.
- **Docker / Supabase are not started for ordinary verification.** No `supabase start`
  / `supabase:test:start`, no container repair, no substitute database — unless Marcus
  explicitly approves it for that batch. This is why some browser certification is
  legitimately reported as environment-blocked.
- **Browser (Playwright) tests** run only when the required environment is *already*
  available without expensive infrastructure recovery, and then only the targeted spec
  — not the full Playwright suite. **A blocked browser scenario is reported as
  blocked, never as passed.**
- **A full-suite run happens only when Marcus explicitly authorizes it for that batch.**

## Environment-gated database suites must be ACTIVATED by CI (DB-CI-COVERAGE-GAP-1)

A suite that reads `ALLOW_DB_INTEGRATION_TESTS` resolves to `describe.skip` when the
variable is absent — and **jest still exits 0**. So for these suites a green CI job is
not evidence of anything. `tests/integration/billing` (9 suites) and
`tests/integration/accounts` (5 suites) sat in exactly that state: they existed, they
were correct in intent, and no workflow activated them, so they protected nothing. Two
of them had silently rotted against a later migration that changed an RPC signature —
the failure mode this rule exists to prevent.

Durable rules:

- **Every environment-gated database suite must be wired into `db-ci.yml`'s suite
  groups** (`scripts/ci/db-suite-gate.mjs` → `GROUPS`). A new `tests/integration/<group>`
  directory that needs the database is a workflow change, not a "run it locally
  sometimes" suite.
- **Groups are discovered, not listed.** The gate resolves a group's files with jest's
  own `--listTests`, so a suite added to a wired directory is covered automatically.
- **Absence is never success.** The gate fails closed when the activation variables are
  missing, when discovery collapses below the group's minimum, when a discovered suite
  did not execute, when zero tests passed, when the group resolved entirely to skipped
  tests, or when **any single suite** contributed zero passing tests (so one suite
  silently de-activating cannot hide behind its passing siblings).
- **Never `--passWithNoTests`, `continue-on-error`, retries, or a `.skip` added to make
  db-ci green.** A suite that cannot run in CI is a blocker to report, not to mute.
- **db-ci is loopback-only.** The groups run against the one ephemeral local Supabase
  stack, sequentially (`--runInBand`), with the RLS/migration group first on the
  untouched post-reset state. No hosted project is ever contacted, and the workflow
  holds no secrets.
- **db-ci's path filters are directory-scoped** (`repositories/`, `services/`, `core/`,
  `workflow-engine/`, `utils/`, `lib/`) rather than a hand-picked file list, so new
  database-touching code triggers the gate without anyone remembering to extend a list.
  Documentation-only changes do not trigger it.

## RPC signatures may never drift from their callers (RPC-SIGNATURE-DRIFT-GUARD-1)

Migration `20260808000000` added `p_ai_credits_limit` to `apply_business_upgrade` /
`apply_business_downgrade` and dropped the old overloads. The repository callers were
updated; the integration tests were not — and **nothing failed**, because
`types/database.types.ts` was generated and drift-checked but **imported by no file in
the repository**. Every Supabase client was untyped, so `.rpc(name, args)` accepted any
string and any object. The stale suites compiled, ran, and asserted only PostgREST's
"could not find the function" response instead of atomicity or idempotency.

Three sources must agree, and only one of them is authoritative:

1. **The migrated local database (`pg_proc`) — authoritative.** Read from the catalog,
   never by parsing migration SQL text.
2. **`types/database.types.ts`** — the generated bridge. `db:types:check` proves
   schema → types; the guard additionally proves types → database on names, argument
   names, required/optional, and mapped argument types.
3. **TypeScript `.rpc()` call sites** — extracted with the TypeScript AST, never a
   regex, and compared to (1).

Durable rules:

- **Annotate every RPC argument object** with `satisfies RpcArgs<"fn">` from
  [`types/rpc.ts`](../../types/rpc.ts). It costs one line, changes nothing at runtime,
  and turns a renamed / removed / misnamed / missing / wrong-typed argument into a
  compile error. `RpcArgs` is a projection of the generated `Database` type — **never
  hand-write a function signature**, and never introduce a second RPC type system.
- **Layer responsibilities:** `tsc` catches argument *value types*; the guard catches
  function existence, argument names, required-argument omissions, stale arguments,
  overload ambiguity, removed functions, and generated-types-vs-database drift. Neither
  replaces the other.
- **Overloading a PostgREST-reachable function is a defect.** Named-argument resolution
  becomes ambiguous, so the guard fails on any called function with more than one
  overload. Ship a distinctly named function instead.
- **An unresolvable `.rpc()` call site must be declared** in
  [`scripts/ci/rpc-dynamic-callers.json`](../../scripts/ci/rpc-dynamic-callers.json)
  with its reason, the exact count for that file, the functions it can dispatch, and how
  its arguments *are* covered. An undeclared unresolved caller fails the guard, and a
  stale declaration fails it too. Prefer making the call site statically resolvable — a
  literal name plus a literal (or file-local const) argument object is checked for free.
- **The guard runs in db-ci after the reset and before the suite groups**, so a
  signature mismatch is a fast, unambiguous failure rather than a confusing PostgREST
  error deep inside the billing suites. It is loopback-only: no connection string, no
  hosted project, no secret.

## Open questions

No open questions remain that block Slice 1.
