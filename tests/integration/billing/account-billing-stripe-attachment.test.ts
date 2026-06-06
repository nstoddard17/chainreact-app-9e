/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-3 / CS-2 — gated DB proof that the Stripe-attachment
 * migration (20260612000000) is applied and behaves:
 *   - new billing rows accept NULL Stripe ids and default cancel_at_period_end=false;
 *   - a non-null stripe_customer_id / stripe_subscription_id is unique across accounts
 *     (duplicate rejected by the partial unique index);
 *   - NULL duplicates are allowed (two accounts may both have NULL ids);
 *   - a member CANNOT write the Stripe ids (no client write policy → 0 rows affected),
 *     so the ids stay service-role only.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts. OPT-IN — set
 * ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
    "SKIP account_billing Stripe attachment — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

describeDb("account_billing Stripe attachment — CS-2", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const accounts: Array<{ userId: string; email: string; password: string; accountId: string }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `stripe-attach-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", data.user.id)
      .single<{ id: string }>();
    if (acctErr || !acct) throw new Error(`personalAccount: ${acctErr?.message ?? "no row"}`);
    return { userId: data.user.id, email, password, accountId: acct.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    accounts.push(await createTestUser("a"));
    accounts.push(await createTestUser("b"));
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (accountIds.length > 0) {
        await admin.from("account_billing").delete().in("account_id", accountIds);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("new billing rows have NULL Stripe ids + cancel_at_period_end=false (both accounts)", async () => {
    const ids = accounts.map((a) => a.accountId);
    const { data, error } = await admin
      .from("account_billing")
      .select("account_id, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
      .in("account_id", ids);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    for (const row of data as Array<Record<string, unknown>>) {
      expect(row.stripe_customer_id).toBeNull();
      expect(row.stripe_subscription_id).toBeNull();
      expect(row.cancel_at_period_end).toBe(false);
    }
  });

  it("accepts setting non-null Stripe ids on an account (service-role)", async () => {
    const a = accounts[0]!;
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await admin
      .from("account_billing")
      .update({
        stripe_customer_id: `cus_${slug}`,
        stripe_subscription_id: `sub_${slug}`,
        cancel_at_period_end: true,
      })
      .eq("account_id", a.accountId);
    expect(error).toBeNull();
  });

  it("rejects a DUPLICATE non-null stripe_customer_id across accounts (unique index)", async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const { data: aRow } = await admin
      .from("account_billing")
      .select("stripe_customer_id")
      .eq("account_id", a.accountId)
      .single<{ stripe_customer_id: string }>();
    const { error } = await admin
      .from("account_billing")
      .update({ stripe_customer_id: aRow!.stripe_customer_id })
      .eq("account_id", b.accountId);
    expect(error).not.toBeNull(); // 23505 unique_violation
  });

  it("rejects a DUPLICATE non-null stripe_subscription_id across accounts (unique index)", async () => {
    const a = accounts[0]!;
    const b = accounts[1]!;
    const { data: aRow } = await admin
      .from("account_billing")
      .select("stripe_subscription_id")
      .eq("account_id", a.accountId)
      .single<{ stripe_subscription_id: string }>();
    const { error } = await admin
      .from("account_billing")
      .update({ stripe_subscription_id: aRow!.stripe_subscription_id })
      .eq("account_id", b.accountId);
    expect(error).not.toBeNull();
  });

  it("allows NULL duplicates — account B keeps NULL ids while A is set", async () => {
    const b = accounts[1]!;
    const { data, error } = await admin
      .from("account_billing")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("account_id", b.accountId)
      .single<{ stripe_customer_id: string | null; stripe_subscription_id: string | null }>();
    expect(error).toBeNull();
    expect(data!.stripe_customer_id).toBeNull();
    expect(data!.stripe_subscription_id).toBeNull();
  });

  it("a member CANNOT write the Stripe ids (no client write policy → 0 rows)", async () => {
    const b = accounts[1]!;
    const supaB = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInErr } = await supaB.auth.signInWithPassword({ email: b.email, password: b.password });
    expect(signInErr).toBeNull();

    const { data, error } = await supaB
      .from("account_billing")
      .update({ stripe_customer_id: "cus_member_forged" })
      .eq("account_id", b.accountId)
      .select("account_id");
    // RLS allows SELECT only; UPDATE matches no writable row → no error, 0 rows.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Confirm service-role still sees NULL — the member write did not land.
    const { data: srv } = await admin
      .from("account_billing")
      .select("stripe_customer_id")
      .eq("account_id", b.accountId)
      .single<{ stripe_customer_id: string | null }>();
    expect(srv!.stripe_customer_id).toBeNull();
  });
});
