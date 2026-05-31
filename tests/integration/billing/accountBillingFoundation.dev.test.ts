/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-9c2 — canonical account billing RPCs, live DB behavior.
 *
 * Account-ONLY behavioral suite (replaces the 9b user-vs-account parity suite,
 * now that 9c2 dropped the user-keyed RPCs + user_billing and promoted the
 * account-keyed `_v2` RPCs to the canonical names). Proves the canonical RPCs
 * preserve the atomic guarantees on account_billing: deduct + exhaustion
 * boundary, reserve/reconcile/refund, release, and concurrent-overspend
 * protection. Live billing is exercised on the SAME path production uses.
 *
 * DESTRUCTIVE: creates + deletes throwaway auth users + workflows + runs.
 * OPT-IN, triple-guarded. account_billing is seeded by handle_new_user on
 * signup; setAccountBilling upserts the test values.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/billing/accountBillingFoundation.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    "SKIP 4.ACCOUNT-MODEL-9c2 canonical account billing RPCs — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

interface Counters {
  tasks_used: number;
  tasks_reserved: number;
  tasks_limit: number;
}

describeDb("4.ACCOUNT-MODEL-9c2 — canonical account billing RPCs (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createUser(): Promise<string> {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `acct-billing-9c2-${slug}@chainreact-9c2.invalid`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
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

  async function setAccountBilling(accountId: string, c: Counters): Promise<void> {
    const { error } = await admin
      .from("account_billing")
      .upsert(
        { account_id: accountId, tasks_limit: c.tasks_limit, tasks_used: c.tasks_used, tasks_reserved: c.tasks_reserved },
        { onConflict: "account_id" },
      );
    if (error) throw new Error(`setAccountBilling: ${error.message}`);
  }
  async function getAccountBilling(accountId: string): Promise<Counters> {
    const { data, error } = await admin
      .from("account_billing")
      .select("tasks_used, tasks_reserved, tasks_limit")
      .eq("account_id", accountId)
      .single<Counters>();
    if (error) throw new Error(`getAccountBilling: ${error.message}`);
    return data;
  }

  async function seedWorkflow(userId: string, accountId: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "9c2 canonical wf" })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }
  async function createRun(workflowId: string, userId: string, accountId: string): Promise<string> {
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: workflowId,
        account_id: accountId,
        triggered_by_user_id: userId,
        status: "succeeded",
        trigger_node_id: "trigger-1",
        trigger_event: {},
        started_at: nowIso,
        finished_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`createRun: ${error?.message ?? "no row"}`);
    return data.id;
  }

  const rpc = (fn: string, params: Record<string, unknown>) => admin.rpc(fn, params);

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      await admin.from("task_usage_events").delete().eq("user_id", id);
      if (accountIds.length > 0) {
        await admin.from("workflow_runs").delete().in("account_id", accountIds);
        await admin.from("workflows").delete().in("account_id", accountIds);
        await admin.from("account_billing").delete().in("account_id", accountIds);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("signup seeds an account_billing row with the default quota", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const ab = await getAccountBilling(accountId);
    expect(ab).toEqual({ tasks_limit: 100, tasks_used: 0, tasks_reserved: 0 });
  });

  it("deduct: charges account_billing atomically", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    await setAccountBilling(accountId, { tasks_limit: 10, tasks_used: 2, tasks_reserved: 0 });

    const { data } = await rpc("deduct_tasks_if_available", { p_account_id: accountId, p_amount: 3 });
    expect(data.ok).toBe(true);
    expect(data.used).toBe(5);
    expect((await getAccountBilling(accountId)).tasks_used).toBe(5);
  });

  it("exhaustion boundary: the last task succeeds, one past the limit is refused (no mutation)", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    await setAccountBilling(accountId, { tasks_limit: 5, tasks_used: 4, tasks_reserved: 0 }); // exactly 1 left

    const { data: ok } = await rpc("deduct_tasks_if_available", { p_account_id: accountId, p_amount: 1 });
    expect(ok.ok).toBe(true);
    expect(ok.used).toBe(5);

    const { data: refused } = await rpc("deduct_tasks_if_available", { p_account_id: accountId, p_amount: 1 });
    expect(refused.ok).toBe(false);
    expect(refused.used).toBe(5);
    expect((await getAccountBilling(accountId)).tasks_used).toBe(5);
  });

  it("reserve + reconcile (under-reserve): charges actual, refunds the remainder", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, accountId);
    await setAccountBilling(accountId, { tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 });
    const runId = await createRun(wf, userId, accountId);

    const { data: res } = await rpc("reserve_tasks_if_available", { p_account_id: accountId, p_amount: 5, p_run_id: runId, p_expires_at: null });
    expect(res.ok).toBe(true);
    expect(res.reason).toBe("reserved");
    expect((await getAccountBilling(accountId)).tasks_reserved).toBe(5);

    const { data: rec } = await rpc("reconcile_task_reservation", { p_account_id: accountId, p_run_id: runId, p_actual: 2 });
    expect(rec.ok).toBe(true);
    expect(rec.charged).toBe(2);
    expect(rec.refunded).toBe(3);
    expect(await getAccountBilling(accountId)).toEqual({ tasks_limit: 20, tasks_used: 2, tasks_reserved: 0 });
  });

  it("reserve insufficient: refused (status failed), no balance mutation", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, accountId);
    await setAccountBilling(accountId, { tasks_limit: 5, tasks_used: 4, tasks_reserved: 1 }); // available 0
    const runId = await createRun(wf, userId, accountId);

    const { data } = await rpc("reserve_tasks_if_available", { p_account_id: accountId, p_amount: 3, p_run_id: runId, p_expires_at: null });
    expect(data.ok).toBe(false);
    expect(data.reason).toBe("insufficient_tasks");
    expect((await getAccountBilling(accountId)).tasks_reserved).toBe(1); // unchanged
  });

  it("release: returns a held reservation without charging", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, accountId);
    await setAccountBilling(accountId, { tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 });
    const runId = await createRun(wf, userId, accountId);

    await rpc("reserve_tasks_if_available", { p_account_id: accountId, p_amount: 4, p_run_id: runId, p_expires_at: null });
    const { data: rel } = await rpc("release_task_reservation", { p_account_id: accountId, p_run_id: runId });
    expect(rel.ok).toBe(true);
    expect(rel.released).toBe(4);
    expect(await getAccountBilling(accountId)).toEqual({ tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 });
  });

  it("concurrency: prevents overspend (exactly capacity succeeds under concurrent deducts)", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    await setAccountBilling(accountId, { tasks_limit: 5, tasks_used: 0, tasks_reserved: 0 });

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        rpc("deduct_tasks_if_available", { p_account_id: accountId, p_amount: 1 }),
      ),
    );
    const okCount = results.filter((r) => (r.data as { ok: boolean })?.ok === true).length;
    expect(okCount).toBe(5);

    const ab = await getAccountBilling(accountId);
    expect(ab.tasks_used).toBe(5);
    expect(ab.tasks_used).toBeLessThanOrEqual(ab.tasks_limit);
  });
});
