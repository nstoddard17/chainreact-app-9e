/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-9b — account_billing foundation, live DB verification.
 *
 * Proves the account-keyed `_v2` RPCs match the user-keyed originals byte-for-
 * byte, the backfill is correct + idempotent, and the atomic capacity guarantees
 * (exhaustion boundary + concurrent-overspend protection) hold under account
 * keying. Live billing is UNTOUCHED (no production caller exercised).
 *
 * DESTRUCTIVE: creates + deletes throwaway auth users + workflows + runs.
 * OPT-IN, triple-guarded (never runs in CI / against an unintended DB).
 *
 * Requirements (else SKIP): ALLOW_DB_INTEGRATION_TESTS=true + the 9b migration
 * (20260531000001) applied. URL + SERVICE_KEY auto-loaded from .env.local.
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
    "SKIP 4.ACCOUNT-MODEL-9b account_billing foundation — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE: creates/deletes auth users).",
  );
}

interface Counters {
  tasks_used: number;
  tasks_reserved: number;
  tasks_limit: number;
}

describeDb("4.ACCOUNT-MODEL-9b — account_billing foundation (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createUser(): Promise<string> {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `acct-billing-9b-${slug}@chainreact-9b.invalid`,
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

  // user_billing (user-scoped) — the live system, untouched by 9b.
  async function setUserBilling(userId: string, c: Counters): Promise<void> {
    const { error } = await admin
      .from("user_billing")
      .upsert(
        { user_id: userId, tasks_limit: c.tasks_limit, tasks_used: c.tasks_used, tasks_reserved: c.tasks_reserved },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(`setUserBilling: ${error.message}`);
  }
  async function getUserBilling(userId: string): Promise<Counters> {
    const { data, error } = await admin
      .from("user_billing")
      .select("tasks_used, tasks_reserved, tasks_limit")
      .eq("user_id", userId)
      .single<Counters>();
    if (error) throw new Error(`getUserBilling: ${error.message}`);
    return data;
  }

  // account_billing (account-scoped) — the 9b foundation.
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
      .insert({ account_id: accountId, created_by_user_id: userId, name: "9b parity wf" })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }
  async function createRun(workflowId: string, userId: string, accountId: string, extra: Record<string, unknown> = {}): Promise<string> {
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
        ...extra,
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
      await admin.from("user_billing").delete().eq("user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  // ── Backfill ────────────────────────────────────────────────────────────
  it("backfill creates one account_billing row per personal account, matching user_billing", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    // handle_new_user seeds user_billing but NOT account_billing (9b doesn't
    // dual-seed). Give user_billing known values, then run the real backfill.
    await setUserBilling(userId, { tasks_limit: 250, tasks_used: 37, tasks_reserved: 4 });
    // remove any pre-existing account_billing row so we observe the backfill insert
    await admin.from("account_billing").delete().eq("account_id", accountId);

    // scoped to THIS account so the test doesn't materialize rows for other
    // concurrent tests' throwaway accounts (which would block their teardown).
    const { data: inserted, error } = await rpc("backfill_account_billing", { p_account_id: accountId });
    expect(error).toBeNull();
    expect(typeof inserted).toBe("number");
    expect(inserted).toBe(1);

    const ab = await getAccountBilling(accountId);
    const ub = await getUserBilling(userId);
    expect(ab.tasks_limit).toBe(ub.tasks_limit);
    expect(ab.tasks_used).toBe(ub.tasks_used);
    expect(ab.tasks_reserved).toBe(ub.tasks_reserved);
    expect(ab).toEqual({ tasks_limit: 250, tasks_used: 37, tasks_reserved: 4 });
  });

  it("re-running the backfill is idempotent (no duplicate, values unchanged)", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    await setUserBilling(userId, { tasks_limit: 100, tasks_used: 5, tasks_reserved: 0 });
    await admin.from("account_billing").delete().eq("account_id", accountId);

    await rpc("backfill_account_billing", { p_account_id: accountId });
    const first = await getAccountBilling(accountId);
    // mutate user_billing, re-run backfill — ON CONFLICT DO NOTHING must NOT overwrite
    await setUserBilling(userId, { tasks_limit: 999, tasks_used: 999, tasks_reserved: 0 });
    await rpc("backfill_account_billing", { p_account_id: accountId });
    const second = await getAccountBilling(accountId);
    expect(second).toEqual(first);

    const { count } = await admin
      .from("account_billing")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);
    expect(count).toBe(1);
  });

  // ── Deduct parity + exhaustion boundary ───────────────────────────────────
  it("deduct parity: account-keyed _v2 matches user-keyed result exactly", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const start: Counters = { tasks_limit: 10, tasks_used: 2, tasks_reserved: 0 };
    await setUserBilling(userId, start);
    await setAccountBilling(accountId, start);

    const { data: u } = await rpc("deduct_tasks_if_available", { p_user_id: userId, p_amount: 3 });
    const { data: a } = await rpc("deduct_tasks_if_available_v2", { p_account_id: accountId, p_amount: 3 });
    expect(a).toEqual(u);
    expect(a.ok).toBe(true);
    expect(a.used).toBe(5);
    expect((await getAccountBilling(accountId)).tasks_used).toBe((await getUserBilling(userId)).tasks_used);
  });

  it("exhaustion boundary parity: account _v2 refuses exactly when user RPC refuses", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const start: Counters = { tasks_limit: 5, tasks_used: 4, tasks_reserved: 0 }; // exactly 1 left
    await setUserBilling(userId, start);
    await setAccountBilling(accountId, start);

    // the last task: both succeed
    const { data: u1 } = await rpc("deduct_tasks_if_available", { p_user_id: userId, p_amount: 1 });
    const { data: a1 } = await rpc("deduct_tasks_if_available_v2", { p_account_id: accountId, p_amount: 1 });
    expect(a1).toEqual(u1);
    expect(a1.ok).toBe(true);
    expect(a1.used).toBe(5);

    // one past the limit: both refuse, no mutation
    const { data: u2 } = await rpc("deduct_tasks_if_available", { p_user_id: userId, p_amount: 1 });
    const { data: a2 } = await rpc("deduct_tasks_if_available_v2", { p_account_id: accountId, p_amount: 1 });
    expect(a2).toEqual(u2);
    expect(a2.ok).toBe(false);
    expect(a2.used).toBe(5);
    expect((await getAccountBilling(accountId)).tasks_used).toBe(5);
  });

  // ── Reserve / reconcile / release parity (needs a run row) ─────────────────
  it("reserve+reconcile parity: account _v2 matches user RPC (under-reserve refund)", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, accountId);
    const start: Counters = { tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 };
    await setUserBilling(userId, start);
    await setAccountBilling(accountId, start);

    // user-keyed path on its own run
    const uRun = await createRun(wf, userId, accountId);
    const { data: uRes } = await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 5, p_run_id: uRun, p_expires_at: null });
    const { data: uRec } = await rpc("reconcile_task_reservation", { p_user_id: userId, p_run_id: uRun, p_actual: 2 });

    // account-keyed path on a separate run
    const aRun = await createRun(wf, userId, accountId);
    const { data: aRes } = await rpc("reserve_tasks_if_available_v2", { p_account_id: accountId, p_amount: 5, p_run_id: aRun, p_expires_at: null });
    const { data: aRec } = await rpc("reconcile_task_reservation_v2", { p_account_id: accountId, p_run_id: aRun, p_actual: 2 });

    expect(aRes.ok).toBe(uRes.ok);
    expect(aRes.reason).toBe(uRes.reason);
    expect(aRec.charged).toBe(uRec.charged);
    expect(aRec.refunded).toBe(uRec.refunded);
    expect(aRec.charged).toBe(2);
    expect(aRec.refunded).toBe(3);

    expect(await getAccountBilling(accountId)).toEqual(await getUserBilling(userId));
  });

  it("reserve insufficient + release parity: account _v2 matches user RPC", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, accountId);

    // insufficient: limit 5, used 4, reserved 1 → available 0, ask 3 → refused
    await setUserBilling(userId, { tasks_limit: 5, tasks_used: 4, tasks_reserved: 1 });
    await setAccountBilling(accountId, { tasks_limit: 5, tasks_used: 4, tasks_reserved: 1 });
    const uRun = await createRun(wf, userId, accountId);
    const aRun = await createRun(wf, userId, accountId);
    const { data: uIns } = await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 3, p_run_id: uRun, p_expires_at: null });
    const { data: aIns } = await rpc("reserve_tasks_if_available_v2", { p_account_id: accountId, p_amount: 3, p_run_id: aRun, p_expires_at: null });
    expect(aIns.ok).toBe(false);
    expect(aIns.reason).toBe(uIns.reason);
    expect(aIns.reason).toBe("insufficient_tasks");

    // release a held reservation
    await setUserBilling(userId, { tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 });
    await setAccountBilling(accountId, { tasks_limit: 20, tasks_used: 0, tasks_reserved: 0 });
    const uHold = await createRun(wf, userId, accountId);
    const aHold = await createRun(wf, userId, accountId);
    await rpc("reserve_tasks_if_available", { p_user_id: userId, p_amount: 4, p_run_id: uHold, p_expires_at: null });
    await rpc("reserve_tasks_if_available_v2", { p_account_id: accountId, p_amount: 4, p_run_id: aHold, p_expires_at: null });
    const { data: uRel } = await rpc("release_task_reservation", { p_user_id: userId, p_run_id: uHold });
    const { data: aRel } = await rpc("release_task_reservation_v2", { p_account_id: accountId, p_run_id: aHold });
    expect(aRel.released).toBe(uRel.released);
    expect(aRel.released).toBe(4);
    expect((await getAccountBilling(accountId)).tasks_reserved).toBe(0);
  });

  // ── Concurrency: atomic overspend protection under account keying ──────────
  it("concurrency: account _v2 deduct prevents overspend (exactly capacity succeeds)", async () => {
    const userId = await createUser();
    const accountId = await personalAccountId(userId);
    await setAccountBilling(accountId, { tasks_limit: 5, tasks_used: 0, tasks_reserved: 0 });

    // 12 concurrent single-task deducts against a capacity of 5.
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        rpc("deduct_tasks_if_available_v2", { p_account_id: accountId, p_amount: 1 }),
      ),
    );
    const okCount = results.filter((r) => (r.data as { ok: boolean })?.ok === true).length;
    expect(okCount).toBe(5);

    const ab = await getAccountBilling(accountId);
    expect(ab.tasks_used).toBe(5); // never exceeds the limit
    expect(ab.tasks_used).toBeLessThanOrEqual(ab.tasks_limit);
  });
});
