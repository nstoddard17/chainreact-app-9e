/**
 * @jest-environment node
 *
 * Slice 4.BILLING-PLAN-METADATA-2 / CS-1 — gated DB proof that the plan-metadata
 * migration (20260611000000) is applied and behaves:
 *   - a freshly-created personal account's billing row defaults to plan='free',
 *     plan_status='active' (trigger-seeded + column defaults),
 *   - valid plan/status values are accepted,
 *   - invalid plan/status values are rejected by the CHECK constraints.
 *
 * DESTRUCTIVE: creates a throwaway auth user + account. OPT-IN — set
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
    "SKIP account_billing plan metadata — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

describeDb("account_billing plan metadata — CS-1", () => {
  let admin: SupabaseClient;
  let userId = "";
  let accountId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `plan-meta-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    userId = data.user.id;
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (acctErr || !acct) throw new Error(`personalAccount: ${acctErr?.message ?? "no row"}`);
    accountId = acct.id;
  });

  afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("account_billing").delete().eq("account_id", accountId);
    await admin.from("account_memberships").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("owner_user_id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup: failed to delete user ${userId}: ${error.message}`);
  });

  it("a new personal account billing row defaults to free / active", async () => {
    const { data, error } = await admin
      .from("account_billing")
      .select("plan, plan_status, current_period_end")
      .eq("account_id", accountId)
      .single<{ plan: string; plan_status: string; current_period_end: string | null }>();
    expect(error).toBeNull();
    expect(data!.plan).toBe("free");
    expect(data!.plan_status).toBe("active");
    expect(data!.current_period_end).toBeNull();
  });

  it("accepts valid plan + status values", async () => {
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "pro", plan_status: "trialing" })
      .eq("account_id", accountId);
    expect(error).toBeNull();
  });

  it("rejects an invalid plan value (CHECK)", async () => {
    const { error } = await admin
      .from("account_billing")
      .update({ plan: "gold" })
      .eq("account_id", accountId);
    expect(error).not.toBeNull();
  });

  it("rejects an invalid plan_status value (CHECK)", async () => {
    const { error } = await admin
      .from("account_billing")
      .update({ plan_status: "pending" })
      .eq("account_id", accountId);
    expect(error).not.toBeNull();
  });
});
