/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — backfill correctness.
 *
 * Per docs/slices/phase-4/account-model-foundation-plan.md §10:
 *   1. Every auth.users row has a personal account.
 *   2. Every personal account has exactly one owner membership where
 *      user_id == accounts.owner_user_id.
 *   3. Re-running the backfill INSERT statements is a no-op.
 *
 * DESTRUCTIVE: creates and deletes a fresh user inside the test to make
 * the assertions independent of the surrounding DB state. OPT-IN via
 * ALLOW_DB_INTEGRATION_TESTS=true + service role key.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupFixtures, createFixtureTracker, createTrackedUser } from "@/tests/helpers/dbFixtureCleanup";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    let v = m[2]!.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}
loadEnvLocal();

const ALLOW = process.env.ALLOW_DB_INTEGRATION_TESTS === "true";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP accounts backfill — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("accounts backfill — Slice 4.ACCOUNT-MODEL-3", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  async function createTestUser(): Promise<string> {
    const { userId } = await createTrackedUser(admin, fixtures, "acct-backfill");
    return userId;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("a fresh user has exactly one personal account + one owner membership", async () => {
    const userId = await createTestUser();
    const { data: accounts, error: aErr } = await admin
      .from("accounts")
      .select("id, type, owner_user_id, name")
      .eq("owner_user_id", userId);
    expect(aErr).toBeNull();
    expect(accounts).toHaveLength(1);
    expect(accounts![0]!.type).toBe("personal");
    expect(accounts![0]!.name).toBe("Personal");
    const accountId = accounts![0]!.id;

    const { data: members, error: mErr } = await admin
      .from("account_memberships")
      .select("account_id, user_id, role")
      .eq("account_id", accountId);
    expect(mErr).toBeNull();
    expect(members).toHaveLength(1);
    expect(members![0]!.user_id).toBe(userId);
    expect(members![0]!.role).toBe("owner");
  });

  it("every personal account is owned + has exactly one owner membership (population-wide invariant)", async () => {
    // Ensure at least one user exists so the population check is non-vacuous.
    await createTestUser();

    const { count: personalCount, error: pErr } = await admin
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("type", "personal");
    expect(pErr).toBeNull();
    expect(personalCount).not.toBeNull();
    expect(personalCount!).toBeGreaterThan(0);

    // Look for any personal account that's missing its owner membership.
    // We page through; tests run against a dev DB so the row count is small.
    const { data: personalAccounts, error: paErr } = await admin
      .from("accounts")
      .select("id, owner_user_id")
      .eq("type", "personal");
    expect(paErr).toBeNull();

    for (const a of personalAccounts ?? []) {
      const { data: m, error: mErr } = await admin
        .from("account_memberships")
        .select("user_id, role")
        .eq("account_id", a.id);
      expect(mErr).toBeNull();
      expect(m).toHaveLength(1);
      expect(m![0]!.user_id).toBe(a.owner_user_id);
      expect(m![0]!.role).toBe("owner");
    }
  });

  it("re-running the backfill INSERTs is a no-op (idempotent)", async () => {
    // Use service-role to run the same backfill statements the migration ran.
    // Both INSERTs are gated by ON CONFLICT DO NOTHING + unique index / PK.
    // Capture row counts before / after.
    const { count: accountsBefore } = await admin
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("type", "personal");
    const { count: membersBefore } = await admin
      .from("account_memberships")
      .select("*", { count: "exact", head: true });

    // Re-run the personal-accounts backfill via an RPC-less raw SQL path.
    // supabase-js can't run arbitrary SQL via the JS client; instead, mirror
    // the migration's intent via the JS client: insert (with conflict-ignore)
    // a personal account row for every auth.users row. We approximate by
    // attempting to re-insert each currently-present personal account's
    // shape; conflicts on the unique partial index produce no rows.
    const { data: personal, error: pErr } = await admin
      .from("accounts")
      .select("owner_user_id")
      .eq("type", "personal");
    expect(pErr).toBeNull();

    for (const row of personal ?? []) {
      const { error } = await admin
        .from("accounts")
        .insert({
          type: "personal",
          name: "Personal",
          owner_user_id: row.owner_user_id,
        })
        .select();
      // Expect a unique-constraint violation on the partial index, which
      // surfaces as a non-null error. The row count must not change.
      expect(error).not.toBeNull();
      expect(error!.message.toLowerCase()).toMatch(/duplicate|unique|conflict/);
    }

    const { count: accountsAfter } = await admin
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("type", "personal");
    const { count: membersAfter } = await admin
      .from("account_memberships")
      .select("*", { count: "exact", head: true });
    expect(accountsAfter).toBe(accountsBefore);
    expect(membersAfter).toBe(membersBefore);
  });
});
