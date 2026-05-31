/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-9b — account_billing RLS.
 *
 * account_billing is read-gated by account membership (the canonical
 * membership-join predicate); writes are service-role / RPC only (no
 * user-facing write policy). Proves:
 *   - member A reads their account's billing row;
 *   - non-member B does not; anon does not;
 *   - service-role bypasses RLS and reads both;
 *   - a member cannot UPDATE their own counters (no write policy → 0 rows).
 *
 * DESTRUCTIVE: creates throwaway auth users. OPT-IN.
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP account_billing RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_billing RLS — Slice 4.ACCOUNT-MODEL-9b", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{ userId: string; email: string; password: string; accountId: string }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `acct-billing-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email, password };
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

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    // handle_new_user doesn't seed account_billing in 9b — backfill each new
    // personal account (scoped, so we don't materialize rows for other tests'
    // accounts and block their teardown).
    await admin.rpc("backfill_account_billing", { p_account_id: aAccount });
    await admin.rpc("backfill_account_billing", { p_account_id: bAccount });
    sessions.push({ ...a, accountId: aAccount });
    sessions.push({ ...b, accountId: bAccount });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (accountIds.length > 0) {
        await admin.from("account_billing").delete().in("account_id", accountIds);
      }
      await admin.from("user_billing").delete().eq("user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("member A reads their account_billing row; non-member B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("account_billing")
      .select("account_id")
      .eq("account_id", a.accountId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB.from("account_billing").select("account_id").eq("account_id", a.accountId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonOnA } = await anon.from("account_billing").select("account_id").eq("account_id", a.accountId);
    expect(anonOnA).toHaveLength(0);
  });

  it("a member cannot UPDATE their own counters (no write policy → 0 rows affected)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data, error } = await supaA
      .from("account_billing")
      .update({ tasks_used: 0, tasks_limit: 999999 })
      .eq("account_id", a.accountId)
      .select("account_id");
    // RLS allows SELECT only; the UPDATE matches no writable row → no error, 0 rows.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: srv } = await admin
      .from("account_billing")
      .select("tasks_limit")
      .eq("account_id", a.accountId)
      .single<{ tasks_limit: number }>();
    expect(srv!.tasks_limit).not.toBe(999999); // counters untouched by the member UPDATE
  });

  it("service-role bypasses RLS and reads both accounts' billing rows", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data, error } = await admin
      .from("account_billing")
      .select("account_id")
      .in("account_id", [a.accountId, b.accountId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
