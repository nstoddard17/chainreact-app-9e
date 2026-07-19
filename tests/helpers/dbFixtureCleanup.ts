import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared teardown for DB-backed integration suites.
 *
 * WHY THIS EXISTS: every suite used to hand-roll its own `afterAll`, and they
 * all repeated the same three bugs. The result was ~320 synthetic
 * `@chainreact.test` users accumulating in the shared Supabase project while
 * the runs reported green:
 *
 *   1. WRONG ORDER — `account_memberships` was deleted BEFORE `accounts`.
 *      Removing the owner's membership row while the account still exists trips
 *      the `account_memberships_team_owner_invariant_violation` trigger
 *      ("account must keep at least one owner"), so the delete always failed.
 *   2. RESTRICT CHILDREN LEFT BEHIND — `accounts` has ON DELETE RESTRICT FKs
 *      from workflow_runs / workflows / workflow_folders / integrations /
 *      account_billing. Any surviving child blocks the parent delete. In
 *      practice `account_billing` was the usual culprit: the billing row is
 *      created implicitly, so suites that never mentioned billing still leaked.
 *   3. SILENT FAILURE — none of the deletes checked `error`, and the final
 *      `deleteUser` failure was only `console.warn`ed. Nobody reads warnings in
 *      a green run.
 *
 * The order below mirrors the production purge path
 * (`services/accounts/accountPurge.ts`): RESTRICT children -> account rows
 * (which cascade memberships) -> `auth.users` LAST, because
 * `accounts.owner_user_id` is itself RESTRICT.
 *
 * FAILURE POLICY: every failure is collected and re-thrown as one aggregate
 * error at the END. Cleanup never stops early — a suite that died halfway
 * through `beforeAll` still gets every later step attempted — but it also never
 * passes silently. If teardown could not remove something, the suite fails.
 */

/** Accounts have these ON DELETE RESTRICT children; clear them first. */
const ACCOUNT_RESTRICT_TABLES = [
  // workflow_runs before workflows: runs reference the workflow.
  "workflow_runs",
  "workflows",
  "workflow_folders",
  "integrations",
  "account_billing",
] as const;

/**
 * Tables that FK `accounts` with ON DELETE SET NULL, or with no FK at all.
 * They neither cascade nor block, so cleanupFixtures does NOT touch them —
 * deleting them here would be wrong, because in production these rows
 * deliberately OUTLIVE the account (ledger/audit retention):
 *
 *   task_usage_events, ai_cost_events, billing_shadow_comparisons
 *     -> SET NULL, per 20260531000008_ledger_anonymization.sql
 *   react_agent_audit_events            -> SET NULL
 *   account_deletions                   -> no FK at all
 *   workflow_templates (account_id NULL) -> platform-owned, not account-scoped
 *
 * A suite that writes to any of these must clear its OWN rows explicitly,
 * BEFORE calling cleanupFixtures. Handling them here would either orphan test
 * rows silently or delete production-shaped audit history.
 */
export const NON_CASCADING_ACCOUNT_TABLES = [
  "task_usage_events",
  "ai_cost_events",
  "billing_shadow_comparisons",
  "react_agent_audit_events",
  "account_deletions",
] as const;

/** Supabase reports an already-deleted auth user as 404 / "User not found". */
function isAlreadyGone(error: { message?: string; status?: number }): boolean {
  if (error.status === 404) return true;
  return /user not found|not_found/i.test(error.message ?? "");
}

export interface FixtureTracker {
  /** Record an auth user id the suite created. Safe to call repeatedly. */
  trackUser(userId: string): void;
  /** Record an account id the suite created explicitly (e.g. a team account). */
  trackAccount(accountId: string): void;
  readonly userIds: readonly string[];
  readonly accountIds: readonly string[];
}

export function createFixtureTracker(): FixtureTracker {
  const users = new Set<string>();
  const accounts = new Set<string>();
  return {
    trackUser(userId) {
      if (userId) users.add(userId);
    },
    trackAccount(accountId) {
      if (accountId) accounts.add(accountId);
    },
    get userIds() {
      return [...users];
    },
    get accountIds() {
      return [...accounts];
    },
  };
}

export interface TrackedUser {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
}

/**
 * Create an auth user and register it with the tracker in the SAME step, so a
 * later failure can never orphan it. The id is tracked before any assertion so
 * even a partially-created fixture is cleaned up.
 *
 * Emails are always `@chainreact.test` — the marker cleanup and auditing rely
 * on that domain.
 */
export async function createTrackedUser(
  admin: SupabaseClient,
  tracker: FixtureTracker,
  prefix: string,
): Promise<TrackedUser> {
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${prefix}-${slug}@chainreact.test`;
  const password = `pw-${slug}!A1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  // Track BEFORE throwing: createUser can succeed server-side and still hand
  // back an error shape, and a half-created user must not escape teardown.
  if (data?.user?.id) tracker.trackUser(data.user.id);
  if (error || !data?.user) {
    throw new Error(`createTrackedUser(${prefix}) failed: ${error?.message ?? "no user"}`);
  }
  return { userId: data.user.id, email, password };
}

/**
 * Tear down everything the tracker knows about, in RESTRICT-safe order.
 *
 * Resolves accounts DYNAMICALLY from `owner_user_id` in addition to the
 * explicitly tracked ids. That matters because a personal account is created
 * by a DB trigger on user insert, so suites never see its id — those were a
 * major part of the historical leak.
 *
 * Safe to call when nothing was created (no-op) and safe to call twice.
 */
export async function cleanupFixtures(
  admin: SupabaseClient | null | undefined,
  tracker: FixtureTracker,
): Promise<void> {
  if (!admin) return;
  const userIds = [...tracker.userIds];
  const explicitAccountIds = [...tracker.accountIds];
  if (userIds.length === 0 && explicitAccountIds.length === 0) return;

  const failures: string[] = [];
  const record = (step: string, message: string | undefined) => {
    if (message) failures.push(`${step}: ${message}`);
  };

  // Resolve every account these users own — including trigger-created personal
  // accounts the suite never tracked.
  const accountIds = new Set(explicitAccountIds);
  if (userIds.length > 0) {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .in("owner_user_id", userIds);
    record("resolve owned accounts", error?.message);
    for (const row of data ?? []) accountIds.add((row as { id: string }).id);
  }
  const allAccountIds = [...accountIds];

  // 1. RESTRICT children, children-before-parents.
  if (allAccountIds.length > 0) {
    // workflow_folders.parent_folder_id is a SELF-referential RESTRICT FK, so a
    // bulk delete of a nested tree can fail: Postgres enforces RESTRICT per row,
    // and the parent may be deleted while a child still points at it. Detach the
    // tree first — then the bulk delete below is order-independent.
    const { error: detachError } = await admin
      .from("workflow_folders")
      .update({ parent_folder_id: null })
      .in("account_id", allAccountIds)
      .not("parent_folder_id", "is", null);
    record("detach workflow_folders.parent_folder_id", detachError?.message);

    for (const table of ACCOUNT_RESTRICT_TABLES) {
      const { error } = await admin.from(table).delete().in("account_id", allAccountIds);
      record(`delete ${table}`, error?.message);
    }
    // 2. Account rows. Cascades account_memberships (and invitations, api keys,
    //    templates, analytics, mcp tokens, ...).
    const { error } = await admin.from("accounts").delete().in("id", allAccountIds);
    record("delete accounts", error?.message);
  }

  // 3. Memberships in accounts owned by SOMEONE ELSE do not cascade above.
  //    Safe here: the users' own accounts are already gone, so this can never
  //    strip the last owner of a surviving account.
  if (userIds.length > 0) {
    const { error } = await admin.from("account_memberships").delete().in("user_id", userIds);
    record("delete account_memberships", error?.message);
  }

  // 4. auth.users LAST — accounts.owner_user_id RESTRICT is lifted by step 2.
  //
  //    A user that is ALREADY GONE is a success, not a failure: suites that
  //    exercise deletion itself (accountPurge, ledgerAnonymization) remove their
  //    own fixtures as the thing under test. Treating "not found" as an error
  //    would make those suites fail on a clean run, which would push people back
  //    toward swallowing teardown errors — the exact habit this helper exists to
  //    break. Only a REAL failure to delete is recorded.
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !isAlreadyGone(error)) record(`deleteUser ${userId}`, error.message);
  }

  if (failures.length > 0) {
    throw new Error(
      `cleanupFixtures failed (${failures.length} step(s)); synthetic rows may remain:\n  ` +
        failures.join("\n  "),
    );
  }
}

/**
 * Service-role admin client for integration suites, or null when the env is not
 * configured (the suite is expected to skip in that case).
 */
export function adminClientOrNull(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
