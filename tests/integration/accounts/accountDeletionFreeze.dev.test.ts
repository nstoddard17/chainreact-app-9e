/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-10b — account deletion freeze, live DB / RLS behavior.
 * DESTRUCTIVE: creates + deletes throwaway auth users + workflows.
 * OPT-IN, triple-guarded.
 *
 * Proves the RLS-level freeze: a workflow owned by a `pending_deletion` account
 * is invisible to the owner's SESSION (anon, RLS-gated) client, and becomes
 * visible again after cancel. Also exercises the service-layer request/cancel
 * transitions against the real schema + the account_deletions audit table.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/accounts/accountDeletionFreeze.dev.test.ts
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ANON_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP 4.ACCOUNT-MODEL-10b account deletion freeze — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-10b — account deletion freeze (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  /** email -> password, so sessionClientFor can sign the created user in. */
  const passwords = new Map<string, string>();

  async function createUser(): Promise<{ userId: string; email: string }> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, "acct-del-10b");
    passwords.set(email, password);
    return { userId, email };
  }

  async function personalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function createWorkflow(accountId: string, userId: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: userId,
        name: "Freeze test workflow",
        draft_definition: { nodes: [], edges: [] },
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`createWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  /** Anon (RLS-gated) client signed in as the given user. */
  async function sessionClientFor(email: string): Promise<SupabaseClient> {
    const client = createClient(URL as string, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const password = passwords.get(email);
    if (!password) throw new Error(`sessionClientFor: no password for ${email}`);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn: ${error.message}`);
    return client;
  }

  async function setDeletionStatus(
    accountId: string,
    status: "active" | "pending_deletion",
  ): Promise<void> {
    const { error } = await admin
      .from("accounts")
      .update({ deletion_status: status })
      .eq("id", accountId);
    if (error) throw new Error(`setDeletionStatus: ${error.message}`);
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    // account_deletions has NO FK to accounts (durable audit) — it neither
    // cascades nor blocks, so cleanupFixtures cannot reach it.
    if (admin && fixtures.userIds.length > 0) {
      await admin.from("account_deletions").delete().in("owner_user_id", [...fixtures.userIds]);
    }
    await cleanupFixtures(admin, fixtures);
  });

  it("RLS hides workflows from the owner's session client while pending_deletion, and restores on cancel", async () => {
    const { userId, email } = await createUser();
    const accountId = await personalAccountId(userId);
    const workflowId = await createWorkflow(accountId, userId);
    const session = await sessionClientFor(email);

    // Active: the owner sees their workflow.
    const active = await session.from("workflows").select("id").eq("id", workflowId);
    expect(active.error).toBeNull();
    expect((active.data ?? []).length).toBe(1);

    // Frozen: pending_deletion → RLS membership join fails → zero rows.
    await setDeletionStatus(accountId, "pending_deletion");
    const frozen = await session.from("workflows").select("id").eq("id", workflowId);
    expect(frozen.error).toBeNull();
    expect((frozen.data ?? []).length).toBe(0);

    // The owner can STILL read the account row itself (cancel UI must work).
    const acctRow = await session
      .from("accounts")
      .select("id, deletion_status")
      .eq("id", accountId)
      .maybeSingle<{ id: string; deletion_status: string }>();
    expect(acctRow.error).toBeNull();
    expect(acctRow.data?.deletion_status).toBe("pending_deletion");

    // Cancel: back to active → workflow visible again, data intact.
    await setDeletionStatus(accountId, "active");
    const restored = await session.from("workflows").select("id").eq("id", workflowId);
    expect(restored.error).toBeNull();
    expect((restored.data ?? []).length).toBe(1);
  });

  it("service requestAccountDeletion freezes and cancelAccountDeletion restores (+ audit rows)", async () => {
    const { userId } = await createUser();
    const accountId = await personalAccountId(userId);

    const { requestAccountDeletion, cancelAccountDeletion } = await import(
      "@/services/accounts/accountDeletion"
    );

    const pending = await requestAccountDeletion({
      accountId,
      requestedByUserId: userId,
    });
    expect(pending.deletionStatus).toBe("pending_deletion");
    expect(pending.purgeAfter).not.toBeNull();

    const afterReq = await admin
      .from("accounts")
      .select("deletion_status, purge_after")
      .eq("id", accountId)
      .single<{ deletion_status: string; purge_after: string | null }>();
    expect(afterReq.data?.deletion_status).toBe("pending_deletion");
    expect(afterReq.data?.purge_after).not.toBeNull();

    const audit = await admin
      .from("account_deletions")
      .select("status")
      .eq("account_id", accountId);
    expect((audit.data ?? []).some((r: { status: string }) => r.status === "pending")).toBe(true);

    const restored = await cancelAccountDeletion({ accountId });
    expect(restored.deletionStatus).toBe("active");
    expect(restored.purgeAfter).toBeNull();

    const afterCancel = await admin
      .from("accounts")
      .select("deletion_status, purge_after")
      .eq("id", accountId)
      .single<{ deletion_status: string; purge_after: string | null }>();
    expect(afterCancel.data?.deletion_status).toBe("active");
    expect(afterCancel.data?.purge_after).toBeNull();

    const auditAfter = await admin
      .from("account_deletions")
      .select("status")
      .eq("account_id", accountId);
    expect(
      (auditAfter.data ?? []).every((r: { status: string }) => r.status === "cancelled"),
    ).toBe(true);
  });
});
