---
name: chainreactv2-local-slice-executor
description: Default skill for implementing a bounded local coding slice in ChainReactV2 (feature, fix, or small refactor). Use whenever Marcus asks to build, change, or fix something in the ChainReactV2 repo and it is not a planning-only, closeout, security-audit, or new-provider task. Enforces local-only work (never push), inspect-before-change, small/medium scope, no fake UI / no invented backend, reuse of existing services/repositories/contracts/routes, correct V2 account-scoped model, verification, a local commit, and a structured slice report.
---

# ChainReactV2 Local Slice Executor

Default workflow for implementing a bounded, local "slice" of work. A slice is a
small-to-medium, clearly-bounded change you can describe, verify, and commit in one
pass.

## Operating rules

1. **Local only. Never push.** No `git push`, no PRs, no remote triggers unless Marcus
   explicitly asks in this conversation. Approval to push one time does not carry over.
   **`db:push` is the exception, not git push:** if the slice creates a migration, apply
   it to the V2 dev DB with `npm run db:push` by default unless Marcus explicitly says not
   to. This is separate from git push, which remains forbidden unless explicitly requested.
2. **Inspect before you change.** Read the actual current code paths before editing.
   Trace the real call chain — don't assume. Compare working vs. broken when debugging.
3. **Small/medium scope, clear boundaries.** Prefer the smallest change that fully does
   the job. **Avoid broad rewrites.** If the job genuinely needs a large change, stop and
   say so before doing it.
4. **Reuse before you add.** Search for an existing service, repository, contract, route,
   helper, or option-source that already does this. Modify/extend it instead of creating a
   parallel one. New files are a last resort, justified in the report.
5. **No fake UI / no unsupported controls.** Never add a button, field, or toggle the
   backend can't honor. If the UI implies behavior, the behavior must be wired.
6. **No invented backend behavior.** Don't fabricate API responses, statuses, or data
   shapes. If a provider/API doesn't support something, surface that — don't fake it.
7. **Respect repo boundaries.** Follow the existing layering
   (`app/` → `services/` → `repositories/` → `core/` / `contracts/` / `integrations/`).
   Don't reach across layers in new ways without reason. Leaf folders cap at 50 files
   (`npm run lint:structure`) — don't dump files into an already-full directory.
8. **Challenge only on real risk.** If the ask has a genuine architectural, security, or
   product-correctness problem, raise it concisely before implementing. Otherwise, build.

## V2 account-scoped model (get this right)

The account is the ownership spine. Internalize these before touching workflows,
integrations, billing, folders, or API keys:

- **`account_id` owns** workflows, integrations, runs, billing, folders/trash, and API
  keys. Scope queries and writes by account, not by user, for these resources.
- **`account.type`** is `personal | team | organization` in code. **User-facing labels
  are Personal / Team / Business / Enterprise.** Internal `organization` == user-facing
  **"Business"** — never show the word "Organization" in UI.
- **Member caps (inclusive of owner):** Team = **5**, Business = **25**. Source of truth:
  [`services/accounts/memberLimits.ts`](../../../services/accounts/memberLimits.ts)
  (`TEAM_MAX_MEMBERS`, `BUSINESS_MAX_MEMBERS`). Enterprise = future
  departments/divisions; don't build it speculatively.
- **Team/Business members do NOT need personal Pro.** Membership grants access.
- **Billing is account-level, not per-seat** at launch. Don't add per-seat logic.
- **Folders / trash are account-scoped organization only** — not a permissions or
  sharing mechanism.

## Credential-sharing baseline (don't violate it)

- Provider credential class is decided centrally in
  [`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts)
  (`personal | account`). **Account/service providers** (slack, notion, stripe, shopify,
  hubspot, mailchimp) are account-shared. **Everything else is personal** (fail-safe:
  unknown → personal).
- **Account/service providers can be shared. Personal providers must NOT silently
  share.** Personal-provider steps resolve to the workflow creator via the single seam
  (`runWithCredentialResolutionContext` in
  [`services/execution/engine.ts`](../../../services/execution/engine.ts), read by
  [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts)).
  Don't add a co-member fallback. If your slice touches credentials, OAuth, or
  membership, switch to the **security-review** skill.

## Feature flags

Risky or public-facing behavior ships behind `process.env.ENABLE_<NAME> === "true"`,
**default OFF**, wrapped in a `services/*/flags.ts`-style accessor. Don't default a risky
flag ON, and don't read `process.env` inline scattered across files.

## Verification (run what's appropriate — not everything reflexively)

Pick the lightest set that actually proves the slice:

- Type safety: `npm run typecheck`
- Lint: `npm run lint` (and `npm run lint:structure` if you added/moved files)
- Migrations: `npm run lint:migrations` if you touched `supabase/migrations/`, then apply
  the migration to the V2 dev DB with `npm run db:push` by default (unless Marcus says not
  to). `db:push` ≠ git push — only git push stays forbidden.
- Tests: `npm test` (Jest, under `tests/`) — run the focused suite for what you changed,
  not the whole tree unless warranted. Add/extend tests for new behavior.

State clearly which commands you actually ran and their result. **Never claim a command
passed if you didn't run it.**

## Commit (local)

When the slice is done and verified, make one local commit on the current branch with a
clear message (follow the repo's `type(scope): summary (SLICE-MARKER)` style). Do not
push.

## Slice report (always end with this)

```
**Commit:** <hash> (local, not pushed)
**Files changed:** <list, grouped by area>
**Behavior shipped:** <what now works that didn't before>
**Tests / verification:** <exact commands run + results; tests added/changed>
**Scope / unchanged boundaries:** <what you deliberately did NOT touch>
**Caveats:** <flags + default state, follow-ups, anything not real yet>
**Push status:** Nothing pushed.
```

See [`checklist.md`](./checklist.md) for the pre-commit gate.
