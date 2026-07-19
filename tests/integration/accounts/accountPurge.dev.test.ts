/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-10c — account purge, live DB behavior.
 * DESTRUCTIVE: creates + purges throwaway auth users + their full account graph.
 * OPT-IN, triple-guarded.
 *
 * Proves the real teardown leaves NO orphaned operational records: after
 * purgeAccount, the account / memberships / workflows / runs / billing /
 * integrations / ledgers and the auth.users row are all gone, and the audit row
 * is marked 'purged'. Also proves the eligibility guard refuses an account
 * still inside its grace window (cancel/restore territory stays intact).
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/accounts/accountPurge.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

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
    "SKIP 4.ACCOUNT-MODEL-10c account purge — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-10c — account purge (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  async function createUser(): Promise<{ userId: string; accountId: string }> {
    const { userId } = await createTrackedUser(admin, fixtures, "acct-purge");
    const { data: acct, error: aerr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (aerr || !acct) throw new Error(`personalAccountId: ${aerr?.message ?? "no row"}`);
    return { userId, accountId: acct.id };
  }

  async function seedGraph(accountId: string, userId: string): Promise<{ workflowId: string }> {
    const { data: wf, error: werr } = await admin
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: "Purge test workflow",
        draft_definition: { nodes: [], edges: [] },
      })
      .select("id")
      .single<{ id: string }>();
    if (werr || !wf) throw new Error(`seed workflow: ${werr?.message ?? "no row"}`);

    const { error: rerr } = await admin.from("workflow_runs").insert({
      workflow_id: wf.id,
      account_id: accountId,
      status: "succeeded",
      trigger_node_id: "trigger-1",
      trigger_event: { provider: "manual", eventType: "manual" },
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    if (rerr) throw new Error(`seed run: ${rerr.message}`);

    // An integration row with a deliberately non-decryptable token — exercises
    // the revoke-failed-but-still-deleted path without needing real creds.
    const { error: ierr } = await admin.from("integrations").insert({
      account_id: accountId,
      connected_by_user_id: userId,
      provider: "slack",
      provider_account_id: `T-${Math.random().toString(36).slice(2, 8)}`,
      access_token_encrypted: "not-a-real-encrypted-token",
      refresh_token_encrypted: null,
      scopes: [],
      account_metadata: {},
    });
    if (ierr) throw new Error(`seed integration: ${ierr.message}`);

    return { workflowId: wf.id };
  }

  async function count(table: string, col: string, val: string): Promise<number> {
    const { count: c, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(col, val);
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return c ?? 0;
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    // account_deletions has NO FK to accounts (durable audit) — it neither
    // cascades nor blocks, so cleanupFixtures cannot reach it.
    if (fixtures.userIds.length > 0) {
      await admin.from("account_deletions").delete().in("owner_user_id", [...fixtures.userIds]);
    }
    // The purge UNDER TEST deletes its own auth user; cleanupFixtures throws on a
    // missing user, so hand it only the fixtures the tests left behind.
    const survivors = createFixtureTracker();
    for (const id of fixtures.userIds) {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user) survivors.trackUser(id);
    }
    await cleanupFixtures(admin, survivors);
  });

  it("purges an elapsed-grace account leaving NO orphaned operational records", async () => {
    const { userId, accountId } = await createUser();
    await seedGraph(accountId, userId);

    const { requestAccountDeletion } = await import("@/services/accounts/accountDeletion");
    const { purgeAccount } = await import("@/services/accounts/accountPurge");

    await requestAccountDeletion({ accountId, requestedByUserId: userId });

    // now = far future so the 30-day grace has elapsed.
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const result = await purgeAccount({ accountId, now: farFuture });

    expect(result.status).toBe("purged");

    // Zero orphans across every account-owned + user-owned table.
    expect(await count("accounts", "id", accountId)).toBe(0);
    expect(await count("account_memberships", "account_id", accountId)).toBe(0);
    expect(await count("account_billing", "account_id", accountId)).toBe(0);
    expect(await count("workflows", "account_id", accountId)).toBe(0);
    expect(await count("workflow_runs", "account_id", accountId)).toBe(0);
    expect(await count("integrations", "account_id", accountId)).toBe(0);
    expect(await count("task_usage_events", "account_id", accountId)).toBe(0);
    expect(await count("user_profiles", "id", userId)).toBe(0);

    // auth.users row is gone (deleted last).
    const { data: gone } = await admin.auth.admin.getUserById(userId);
    expect(gone.user).toBeNull();

    // Durable audit row survives, marked purged.
    const { data: audit } = await admin
      .from("account_deletions")
      .select("status, purged_at, purge_counts")
      .eq("account_id", accountId)
      .single<{ status: string; purged_at: string | null; purge_counts: unknown }>();
    expect(audit?.status).toBe("purged");
    expect(audit?.purged_at).not.toBeNull();
    expect(audit?.purge_counts).not.toBeNull();
  });

  it("refuses to purge an account still inside its grace window (eligibility guard)", async () => {
    const { userId, accountId } = await createUser();
    await seedGraph(accountId, userId);

    const { requestAccountDeletion } = await import("@/services/accounts/accountDeletion");
    const { purgeAccount } = await import("@/services/accounts/accountPurge");

    await requestAccountDeletion({ accountId, requestedByUserId: userId });

    // now = present → 30-day grace NOT elapsed.
    const result = await purgeAccount({ accountId, now: new Date() });
    expect(result).toEqual({ status: "skipped", reason: "grace_not_elapsed" });

    // Nothing was torn down.
    expect(await count("accounts", "id", accountId)).toBe(1);
    expect(await count("workflows", "account_id", accountId)).toBe(1);
    const { data: still } = await admin.auth.admin.getUserById(userId);
    expect(still.user?.id).toBe(userId);
  });
});
