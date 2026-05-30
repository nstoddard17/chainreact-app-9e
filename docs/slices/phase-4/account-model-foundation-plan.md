# 4.ACCOUNT-MODEL-2 — Accounts + Memberships Foundation Plan

## Source of truth

The V2 account ownership model was ratified at [`docs/rules/account-ownership-model.md`](../../rules/account-ownership-model.md) — commit `893ccee1`. This slice plans Phase A of that doc's §19 (Migration and implementation phases): introduce `accounts` + `account_memberships`, backfill one personal account per existing user, extend signup provisioning. **No table other than `accounts` and `account_memberships` is created or altered in the implementation slice this doc plans.**

This document is the binding implementation contract for slice **4.ACCOUNT-MODEL-3** (the next slice). Producing this doc is itself a planning-only slice; no migrations, no source code, no tests ship from 4.ACCOUNT-MODEL-2.

## Current state

V2 today is pure single-user. The relevant tables are:

- `auth.users` — Supabase-managed.
- `public.user_profiles` — one row per user; created by the [`handle_new_user()`](../../../supabase/migrations/20260505000001_user_profiles.sql) `SECURITY DEFINER` trigger on `auth.users AFTER INSERT`.
- `public.user_billing` — one row per user; created by the same trigger ([`user_billing.sql`](../../../supabase/migrations/20260507000002_user_billing.sql) extended `handle_new_user()`).
- `public.workflows`, `public.integrations`, `public.workflow_runs` — all `user_id`-owned with `REFERENCES auth.users(id) ON DELETE CASCADE`. RLS is `auth.uid() = user_id` on each.
- No `accounts` table. No membership concept. No account-aware code paths.

## Target state for this slice

After the implementation slice (4.ACCOUNT-MODEL-3) lands:

- `public.accounts` exists with one `type='personal'` row per existing user.
- `public.account_memberships` exists with one `role='owner'` row per personal account, where `user_id = accounts.owner_user_id`.
- DB invariants enforce all of:
  - **One personal account per user** — unique partial index on `accounts(owner_user_id) WHERE type='personal'`.
  - **`accounts.owner_user_id NOT NULL`** plus `REFERENCES auth.users(id) ON DELETE RESTRICT` — the account root never disappears implicitly when an auth user is deleted.
  - **Personal accounts have exactly one membership, and that membership is the owner membership belonging to `accounts.owner_user_id`** — BEFORE INSERT/UPDATE trigger on `account_memberships` joining to `accounts`.
- `handle_new_user()` is extended so new signups atomically create their personal account + owner membership in the same transaction as the existing `user_profiles` + `user_billing` inserts.
- `repositories/accounts.ts` + `repositories/accountMemberships.ts` + `services/accounts/ensurePersonalAccount.ts` + `contracts/accounts.ts` ship with the read + ensure helpers needed to answer "what is this user's personal account?"
- **Everything else is unchanged.** No existing table is altered. No existing RLS policy is modified. `workflows.user_id`, `integrations.user_id`, `workflow_runs.user_id`, `user_billing.user_id` are untouched. No application code starts reading `account_id` anywhere.

## Non-goals

- No `workflows.account_id` migration.
- No `integrations.account_id` migration.
- No `workflow_runs.account_id` migration.
- No `account_billing` table.
- No team or organization account types — `accounts.type` CHECK locks the value to `'personal'` in this slice (relaxed in Phase D).
- No roles beyond `'owner'` — `account_memberships.role` CHECK locks the value to `'owner'` in this slice (relaxed in Phase D).
- No `user_profiles.active_account_id` column — deferred to the future switcher slice.
- No account switcher UI, no invitations, no accept flow, no role-management UI.
- No RLS changes to any pre-existing table.
- No commits to or staging of unrelated dirty working-tree state.

## Schema design

Intended migration file path: `supabase/migrations/<timestamp>_accounts_and_memberships.sql`.

### Tables

```sql
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('personal')),         -- relaxed in Phase D
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX accounts_one_personal_per_user
  ON public.accounts (owner_user_id)
  WHERE type = 'personal';

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

```sql
CREATE TABLE public.account_memberships (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner')),            -- relaxed in Phase D
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);
```

The shared `set_updated_at()` trigger function lives in [`20260505000000_initial_helpers.sql`](../../../supabase/migrations/20260505000000_initial_helpers.sql) and is reused.

### FK on-delete behavior — load-bearing decisions

- **`accounts.owner_user_id` → `ON DELETE RESTRICT`.** `accounts` is the permanent ownership root, not a temporary personal-only table. Deleting an auth user must not implicitly delete their account, because the account carries (now or later) workflows, integrations, runs, billing artifacts, retention obligations, legal holds, and — in Phase D — team/org ownership-transfer requirements. The user / account deletion flow is the only path that may remove an account, and it does so explicitly after checking those conditions. Attempting to delete an `auth.users` row without first running the deletion flow raises a FK violation by design.
- **`account_memberships.user_id` → `ON DELETE CASCADE`.** When the user / account deletion flow eventually deletes an auth user (after the user's accounts have been handled), any stale membership rows on team/org accounts clean up automatically. For personal accounts the account root remains under RESTRICT until the deletion flow explicitly removes it.
- **`account_memberships.account_id` → `ON DELETE CASCADE`.** When an account is deleted (via the deletion flow), its membership rows go with it.
- **`account_memberships.invited_by_user_id` → `ON DELETE SET NULL`.** A deleted user's name on an old invitation should null out rather than block the membership row from existing.

### Trigger — `account_memberships_enforce_personal_invariants()`

`BEFORE INSERT OR UPDATE ON public.account_memberships FOR EACH ROW`. The function rejects the operation if the target account has `type = 'personal'` *unless* every one of the following is true:

- `NEW.user_id = accounts.owner_user_id` — the membership belongs to the personal-account owner. Prevents the bad state where a personal account has the right *number* of memberships but the wrong member.
- `NEW.role = 'owner'` — the lone membership on a personal account is always the owner role.
- No row already exists in `account_memberships` for `NEW.account_id` (single-membership invariant).

For accounts of any other type the trigger is a no-op in this slice — no other types exist yet, since the CHECK constraint on `accounts.type` enforces that. When team/org types land in Phase D, the trigger is **extended** (not replaced) so its personal-account branch stays intact while team/org gets its own (looser) rule set.

Errors raised by the trigger use a stable message prefix `account_memberships_personal_invariant_violation: <reason>` so tests can match on it cleanly.

The CHECK constraints on `accounts.type` and `account_memberships.role` are intentionally narrow. Phase D relaxes them via `ALTER TABLE … DROP CONSTRAINT / ADD CONSTRAINT` migrations rather than leaving the columns wide-open today.

## Backfill strategy

Single migration, two inserts in this order:

```sql
-- one personal account per existing user
INSERT INTO public.accounts (type, name, owner_user_id)
SELECT 'personal', 'Personal', id FROM auth.users
ON CONFLICT DO NOTHING;

-- owner membership for each personal account
INSERT INTO public.account_memberships (account_id, user_id, role)
SELECT a.id, a.owner_user_id, 'owner'
FROM public.accounts a
WHERE a.type = 'personal'
ON CONFLICT DO NOTHING;
```

- **Idempotent.** Re-running produces zero new rows: `ON CONFLICT DO NOTHING` plus the unique partial index on `accounts(owner_user_id) WHERE type='personal'` plus the composite PK on `account_memberships(account_id, user_id)` together guarantee at-most-once.
- **Order matters.** The membership trigger from §5 is created **before** these inserts in the same migration so the backfill itself exercises the invariant. Any pre-existing inconsistency in `auth.users` that would violate the trigger is caught by the migration, not in production.
- **Transactional.** The migration runs in a single transaction; partial failure rolls back cleanly.

## Signup / provisioning strategy

Extend `handle_new_user()` in the same migration. The function continues to be `SECURITY DEFINER` (the only privilege model that can insert into `public.*` from an `auth.users` trigger):

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.user_billing (user_id) VALUES (NEW.id);
  INSERT INTO public.accounts (type, name, owner_user_id)
    VALUES ('personal', 'Personal', NEW.id)
    RETURNING id INTO v_account_id;
  INSERT INTO public.account_memberships (account_id, user_id, role)
    VALUES (v_account_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$;
```

- **Atomic** with the `auth.users` INSERT (single transaction via the trigger).
- **Idempotent** for a given new user — AFTER INSERT trigger fires once per row.
- **`SECURITY DEFINER` bypasses RLS** for the four inserts, matching the existing pattern for `user_profiles` and `user_billing`.
- **Passes the new personal-invariants trigger by construction.** The membership insert uses `NEW.id` as `user_id` (which equals the `owner_user_id` of the just-inserted account) and `'owner'` as the role; no other membership row exists yet for the new account.

### Service-layer defense-in-depth

Ship a service helper at `services/accounts/ensurePersonalAccount.ts`:

```ts
export async function ensurePersonalAccount(userId: string): Promise<AccountRecord>
```

The helper checks via `repositories/accounts.ts:getPersonalAccountForUser(userId)`, and falls through to `repositories/accounts.ts:ensurePersonalAccountServiceRole(userId)` if missing. The service-role write uses `getServiceRoleClient('ensure personal account for user <id>')` and inserts the account + owner membership in one transactional pair. Idempotent.

Not wired into any production code path in this slice. It exists as:

1. A safety net for any future code that needs the personal account before the trigger has a chance to fire (e.g., race conditions in test harnesses).
2. The primitive the future switcher slice and the user / account deletion-recovery flow will build on.

## RLS / security strategy

Applied to the two new tables only. **No changes to any existing table's RLS.**

### `accounts`

- **SELECT** — membership-based, the canonical predicate from rule doc §16:
  ```sql
  CREATE POLICY accounts_select_member ON public.accounts
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.account_memberships am
        WHERE am.user_id = auth.uid()
          AND am.account_id = accounts.id
      )
    );
  ```
- **INSERT / UPDATE / DELETE** — no policies. All writes in this slice go through the `SECURITY DEFINER` trigger or the service-role backfill / `ensurePersonalAccountServiceRole`. Without policies, the session client (anon key) cannot write — fail-closed.

### `account_memberships`

- **SELECT** — restricted to the caller's own row:
  ```sql
  CREATE POLICY account_memberships_select_self ON public.account_memberships
    FOR SELECT
    USING (auth.uid() = user_id);
  ```
  Phase D will broaden this to "members of the same account can see each other" by changing the predicate to `EXISTS (SELECT 1 FROM account_memberships my WHERE my.user_id = auth.uid() AND my.account_id = account_memberships.account_id)`.
- **INSERT / UPDATE / DELETE** — no policies. All writes go through the trigger or backfill.

### GRANTs

Per the [`database-security.md`](../../rules/database-security.md) migration template:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_memberships TO service_role;
```

GRANTs let the role TOUCH the table; RLS still gates row visibility. The migration lint at [`scripts/check-migration-rls.mjs`](../../../scripts/check-migration-rls.mjs) is satisfied by the SELECT policy on each table.

### Service-role boundary unchanged

Every backfill, trigger, and `ensurePersonalAccountServiceRole` call goes through `getServiceRoleClient('<non-empty reason>')` from [`repositories/supabase/serviceRoleClient.ts`](../../../repositories/supabase/serviceRoleClient.ts). Per `database-security.md`, the reason string ends up in audit logs.

## Repository / service helper strategy

Minimal surface. No leakage into other domains.

### `repositories/accounts.ts`

```ts
export async function getById(accountId: string): Promise<AccountRecord | null>
export async function getPersonalAccountForUser(userId: string): Promise<AccountRecord | null>
export async function listForUser(userId: string): Promise<readonly AccountRecord[]>
export async function ensurePersonalAccountServiceRole(userId: string): Promise<AccountRecord>
```

- `getById`, `getPersonalAccountForUser`, `listForUser` use the session client — RLS enforces visibility.
- `ensurePersonalAccountServiceRole` uses `getServiceRoleClient('ensurePersonalAccount: <userId>')` and inserts the account + owner membership atomically when missing. Returns the existing row if present.

`getPersonalAccountForUser` is the canonical default-account resolver. It returns the user's personal account or `null` if (for some reason) it's missing. The service helper above is the fix-it primitive when null is observed.

### `repositories/accountMemberships.ts`

```ts
export async function listByAccount(accountId: string): Promise<readonly AccountMembershipRecord[]>
export async function listByUser(userId: string): Promise<readonly AccountMembershipRecord[]>
export async function getRole(accountId: string, userId: string): Promise<MembershipRole | null>
```

All session-client. `getRole` is the primitive that future authorization wiring will use (`role !== null` → caller is a member of the account).

### `services/accounts/ensurePersonalAccount.ts`

```ts
export async function ensurePersonalAccount(userId: string): Promise<AccountRecord>
```

Single entry point. Calls `getPersonalAccountForUser` first, falls through to `ensurePersonalAccountServiceRole` when null. Not wired into any production code in this slice.

### `contracts/accounts.ts`

Zod schemas + TypeScript types:

```ts
export const AccountType = z.enum(["personal"])              // Phase D: add "team" | "organization"
export const MembershipRole = z.enum(["owner"])              // Phase D: add "admin" | "member"

export const AccountRecord = z.object({
  id: z.string().uuid(),
  type: AccountType,
  name: z.string(),
  owner_user_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const AccountMembershipRecord = z.object({
  account_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: MembershipRole,
  invited_by_user_id: z.string().uuid().nullable(),
  joined_at: z.string(),
})
```

Future slices broaden the literals in lockstep with the corresponding CHECK constraint relaxations.

### Scope discipline

In this slice, **no existing repository, service, or route imports anything from these new files**. The only consumers are the new tests. This keeps the foundation isolated and provable in its own right; rewiring the rest of the app onto `account_id` is Phase B.

## Test plan

Six test files. All assertions reference the invariants and predicates defined above.

### `tests/integration/security/accounts-rls.test.ts`

RLS smoke per `database-security.md`:

- User A creates a personal account via the service-role helper; A reads it via the session client (1 row); user B reads via session client (0 rows); anon reads (0 rows).
- User B cannot update or delete A's account row (0 rows affected — no policies).
- Service-role can read every row.

### `tests/integration/security/account-memberships-rls.test.ts`

Same shape for `account_memberships`. User A sees their own membership row; user B does not.

### `tests/integration/migrations/accounts-backfill.test.ts`

Backfill correctness:

- After the migration applies: `count(accounts WHERE type='personal') == count(auth.users)`.
- Every personal account has exactly one membership with `role='owner'` and `user_id = owner_user_id`.
- Re-running the backfill SQL is a no-op (zero new rows, no errors).

### `tests/integration/migrations/accounts-invariants.test.ts`

Invariant enforcement:

- Inserting a second personal account for a user violates the unique partial index → rejected.
- Inserting a second `account_memberships` row for a personal account fires the trigger → rejected with `account_memberships_personal_invariant_violation` error.
- Inserting a membership on a personal account where `user_id ≠ accounts.owner_user_id` (the "wrong user" case the strengthened trigger now catches) → rejected with `account_memberships_personal_invariant_violation` error. This is the test that proves the trigger enforces *who* the lone membership belongs to, not just *that* there is only one.
- Inserting a membership on a personal account where `role ≠ 'owner'` → rejected by the trigger before the CHECK constraint fires (asserts the trigger evaluates this branch). The `role` CHECK already restricts to `'owner'` in this slice, so this insertion fails either way; the test asserts the trigger reason wins, which matters when Phase D relaxes the CHECK.
- Inserting an account with `owner_user_id IS NULL` → NOT NULL violation.
- Inserting an account with `type='team'` → CHECK violation (slice fence).
- Inserting a membership with `role='admin'` → CHECK violation (slice fence).
- **FK-on-delete behavior:** attempting `DELETE FROM auth.users WHERE id = <user_with_personal_account>` via service-role raises a FK RESTRICT violation on `accounts.owner_user_id`. The user row is preserved; the personal account is preserved. Documents the contract that the user / account deletion flow is the only legitimate path to remove an account.
- **Membership cascade behavior:** insert a synthetic second user, attach them as a stale membership on an account row created via service-role bypass (since the `type` CHECK blocks a real team-type row, the implementation slice picks the cleanest harness — temporary CHECK relaxation in test setup, or direct trigger-firing suppression). Delete the second user. Assert their membership rows cascade-delete while the account row remains. Captures the asymmetric on-delete behavior so Phase D doesn't accidentally regress it.

### `tests/integration/migrations/handle-new-user-extension.test.ts`

Signup trigger:

- Drive `supabase.auth.admin.createUser` (the realistic path; avoids RLS-on-auth oddities of a direct `INSERT INTO auth.users`).
- Assert: exactly one personal account exists for the new user, with one owner membership where `user_id = accounts.owner_user_id`.
- Regression check: the pre-existing `user_profiles` and `user_billing` rows are still created. The trigger extension didn't break the existing inserts.

### `tests/unit/repositories/accounts.test.ts`

Repository helper unit tests:

- `getPersonalAccountForUser` returns the row for an existing user.
- `getPersonalAccountForUser` returns `null` when the row is absent (test setup deletes the auto-created membership + account manually, since RESTRICT blocks a direct user-cascade approach).
- `ensurePersonalAccountServiceRole` creates a row when missing; returns the existing one when present; calling twice produces exactly one row.
- `listForUser` returns memberships joined to accounts.

### Acceptance for the test suite

- All 6 new test files pass.
- All pre-existing test files pass (non-regression — workflow CRUD, OAuth callback, run history, etc.).
- `npm run lint:migrations` passes on the new migration.
- `npm run typecheck` passes.
- `npm run lint` passes.

## Rollout order

Inside slice 4.ACCOUNT-MODEL-3:

1. Write `contracts/accounts.ts` — Zod + TS types for the records and literal unions.
2. Write the migration: tables, indexes, trigger function, RLS, GRANTs, backfill, `handle_new_user()` extension — all in one file. Run `npm run lint:migrations` locally before push.
3. Apply migration to the V2 Supabase project via `npm run db:push`.
4. Write `repositories/accounts.ts`, `repositories/accountMemberships.ts`, `services/accounts/ensurePersonalAccount.ts`.
5. Write the 6 test files. Run them. Iterate on the migration + repositories until they pass.
6. Run the full suite + `npm run typecheck` + `npm run lint`.
7. Commit. No push without explicit approval.

## Risks and open questions

Flagged for resolution in the implementation slice or in a later phase. Not blockers for this planning slice.

- **User / account deletion flow is now a hard prerequisite for `auth.users` deletion.** Because `accounts.owner_user_id` is `ON DELETE RESTRICT`, any code path that deletes a user without first running the deletion flow will fail with a FK violation. This is intentional: the deletion flow is the only legitimate path to remove a personal account (it handles retention grace, legal holds, billing wind-down, and — in Phase D — team/org ownership-transfer checks). Implication: if today there is any admin tooling, test harness, or cron job that directly deletes `auth.users` rows, that path either (a) calls the deletion flow first, or (b) gets updated to do so as part of the implementation slice. **Audit existing direct `auth.users` deletion call sites in the implementation slice's prep step.** If any are found, name them in the implementation-slice PR description and decide per-site whether to route through the deletion flow or whether the call site itself needs to be removed.
- **The deletion flow itself does not exist yet.** Rule doc §14 describes its intended semantics; no code implements it. For this slice's lifetime, a personal account effectively cannot be removed except via a manual service-role DELETE that explicitly clears the membership row first, then the account. Acceptable because no production code path deletes users today (auth deletion is admin-only). A proper deletion flow ships in a future slice (likely paired with Phase D when team/org transfer-then-delete semantics are needed).
- **`account_memberships` SELECT broadening for team/org.** This slice restricts visibility to `auth.uid() = user_id`. Phase D broadens to the membership-join predicate so members can see their teammates. Captured here; no change needed yet.
- **Test setup that bypasses the signup trigger.** Some unit tests need a user without a personal account to test the resolver's null branch. Pattern options: manually delete the auto-created membership + account in test setup (manual because RESTRICT blocks a direct user-cascade), or temporarily disable the trigger for a single service-role-inserted synthetic `auth.users` row. The implementation slice picks one.
- **Active-account default deferred.** No `user_profiles.active_account_id` column in this slice. The repository helper `getPersonalAccountForUser` returns the personal account unconditionally. The future switcher slice adds the column with backfill defaulting to the user's personal account, plus a resolver that prefers the column over the default.
- **Test against actual `auth.users` inserts.** The signup-trigger test drives through `supabase.auth.admin.createUser` rather than a direct `INSERT INTO auth.users`.
- **Trigger extension order in Phase D.** The strengthened personal-invariants trigger gates inserts to memberships on personal accounts. Phase D introduces team/org account types and roles beyond `owner`. The Phase D migration must **extend** (not replace) the trigger so its personal-account branch stays intact while team/org gets its own (looser) rule set. Document this so the Phase D author doesn't accidentally drop the personal-account guard.

## Acceptance criteria

For the **implementation** slice (4.ACCOUNT-MODEL-3):

- Migration applies cleanly to a fresh V2 Supabase project.
- Migration is idempotent against re-runs of the backfill (no duplicate rows, no errors).
- `npm run lint:migrations` passes.
- `npm run typecheck` passes.
- `npm run lint` passes.
- All 6 new test files pass.
- All pre-existing test files pass (non-regression).
- Every user in `auth.users` has exactly one personal account + one owner membership.
- Creating a new user via `supabase.auth.admin.createUser` produces exactly one personal account + one owner membership atomically.
- Attempting (via service-role) to insert: a second personal account for a user, a second membership on a personal account, a non-personal account type, a non-owner role, or a "wrong user" membership on a personal account, is rejected with a recognizable error.
- Attempting to delete an `auth.users` row that owns a personal account raises a FK RESTRICT violation; the user row and account both remain.
- No existing user-scoped flow regresses (workflows, integrations, runs, billing, auth).
- Git diff for the implementation slice's commit contains exactly: 1 new migration file, 1 new contracts file, 2 new repository files, 1 new service helper file, 6 new test files. No changes to `workflows.ts` / `integrations.ts` / `workflowRuns.ts` / `userBilling.ts` / any existing route or component.

For **this** planning slice (4.ACCOUNT-MODEL-2):

- The doc at `docs/slices/phase-4/account-model-foundation-plan.md` exists, is well-formed Markdown, and contains all 14 sections.
- No other repo files are touched. `git diff --name-only` shows exactly one new path under `docs/slices/phase-4/`.
- No commits made until explicit user approval.

## Boundaries (confirmed)

This slice does **not** change:

- Any pre-existing migration file.
- Any pre-existing RLS policy on any pre-existing table.
- `workflows`, `integrations`, `workflow_runs`, `user_billing`, `user_profiles`, `notifications` schemas.
- Any repository, service, route, or component file outside the four new files listed in §9.
- The README, the roadmap (already updated in commit `893ccee1`), the rule doc, `database-security.md`, or any other existing doc.
- The pre-existing dirty working-tree state on branch `builder-ui-v1-audit-1` — those files are unrelated to this slice and are not touched, staged, reformatted, or included.

## Follow-up slices

Ordered, with the dependencies each unblocks:

- **4.ACCOUNT-MODEL-3 — Implementation** of this plan. Migration + repository + service + tests. Gated by user approval of this doc.
- **User / account deletion flow.** Implements the explicit deletion path that satisfies the `ON DELETE RESTRICT` contract on `accounts.owner_user_id`. Handles retention grace, legal holds, billing wind-down, and (later) team/org ownership-transfer checks per rule doc §14. May land any time after 4.ACCOUNT-MODEL-3; required before Phase D ships its user-facing "delete account" surface.
- **Phase B (rule doc §19) — Re-scope `workflows` / `integrations` / `workflow_runs` to `account_id`.** Adds the columns, backfills from each row's `user_id` via the user's personal account, flips RLS to membership-based, drops the old `user_id` ownership semantics. Likely 1–2 slices per table.
- **Phase C — `account_billing` table.** Backfill from `user_billing`. Re-point the billing gate, cost preview, task-deduction RPC, and Stripe customer attachment from user-scoped to account-scoped.
- **Phase D — Team / organization accounts.** Relax `accounts.type` CHECK to include `'team'` and `'organization'`. Add `role` literals beyond `'owner'`. **Extend** the personal-invariants trigger so its personal-account branch stays intact while team/org gets its own (looser) rule set — do not replace it. Add the `accounts` INSERT/UPDATE/DELETE policies needed for user-facing account creation and management. Add invitations + accept flow.
- **Phase E — Ownership transfer + leave.** Implements rule doc §14.
- **Switcher UI slice (between Phase D and "polish").** Adds `user_profiles.active_account_id` with backfill defaulting to each user's personal account, the resolver-precedence change, and the top-bar account switcher.
