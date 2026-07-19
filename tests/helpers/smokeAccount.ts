import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrackedUser, type FixtureTracker } from "./dbFixtureCleanup";

/**
 * Disposable account provisioning for DB-backed smoke harnesses.
 *
 * WHY THIS EXISTS: the action-smoke and trigger-smoke harnesses used to read
 * `SMOKE_ACCOUNT_ID` / `SMOKE_USER_ID` straight from `.env.local`, and those
 * pointed at the OWNER'S REAL ACCOUNT. Every smoke run therefore wrote
 * `smoke:<provider>:<action>` workflows into a live production account, and the
 * harness only ever SOFT-deleted them (`state='deleted'`), so the rows stayed
 * forever. 9,320 debris workflows and 9,300 runs accumulated there before this
 * was caught.
 *
 * A smoke run must own its data end to end: provision a throwaway user, use the
 * personal account the DB trigger creates for it, and hard-delete the whole
 * thing afterwards via `cleanupFixtures`. Nothing the harness creates should
 * outlive the run, and none of it should land in a real user's account.
 */

export interface DisposableSmokeAccount {
  readonly accountId: string;
  readonly userId: string;
}

/**
 * Create a throwaway smoke user and return its trigger-created personal
 * account. The user is registered with `tracker`, so the suite's
 * `cleanupFixtures(admin, tracker)` in `afterAll` removes the account, every
 * workflow/run/integration under it, and the auth user itself.
 */
export async function provisionDisposableSmokeAccount(
  admin: SupabaseClient,
  tracker: FixtureTracker,
): Promise<DisposableSmokeAccount> {
  const { userId } = await createTrackedUser(admin, tracker, "smoke-run");

  const { data, error } = await admin
    .from("accounts")
    .select("id")
    .eq("type", "personal")
    .eq("owner_user_id", userId)
    .single<{ id: string }>();
  if (error || !data) {
    throw new Error(
      `provisionDisposableSmokeAccount: personal account for ${userId} not found: ` +
        `${error?.message ?? "no row"}`,
    );
  }
  return { accountId: data.id, userId };
}

/**
 * Guard for smoke paths that legitimately need a REAL account — live provider
 * certification, which can only run where real OAuth connections exist.
 *
 * Those runs still must not scribble into an account by accident, so the
 * account id has to be named explicitly by `SMOKE_LIVE_ACCOUNT_ID` rather than
 * inherited from the general-purpose `SMOKE_ACCOUNT_ID`. Returns null when live
 * mode is not explicitly configured, and the caller is expected to SKIP.
 */
export function resolveLiveSmokeAccount(): DisposableSmokeAccount | null {
  const accountId = process.env.SMOKE_LIVE_ACCOUNT_ID;
  const userId = process.env.SMOKE_LIVE_USER_ID;
  if (!accountId || !userId) return null;
  return { accountId, userId };
}
