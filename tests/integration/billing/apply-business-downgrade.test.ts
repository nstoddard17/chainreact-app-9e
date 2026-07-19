/**
 * @jest-environment node
 *
 * Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-2 / CS-BD-1 — gated DB proof of the
 * apply_business_downgrade RPC (20260615000000):
 *   - an organization account flips atomically to team + team plan + tasks_limit;
 *   - a replay is idempotent (already_team, no unsafe write);
 *   - a frozen account is rejected with no write;
 *   - a personal / missing account is rejected safely;
 *   - the Stripe customer attachment is left intact;
 *   - an authenticated client cannot EXECUTE the RPC (service-role only).
 *
 * DESTRUCTIVE: creates throwaway auth users + an organization account. OPT-IN — set
 * ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP apply_business_downgrade — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

const ARGS = { p_plan_status: "active", p_tasks_limit: 100 };

describeDb("apply_business_downgrade — CS-BD-1", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";
  let orgId = "";
  let personalId = "";

  async function createUser(label: string) {
    const { userId: id } = await createTrackedUser(admin, fixtures, `csbd1-${label}`);
    return id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    userId = await createUser("a");

    const { data: pers } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    personalId = pers!.id;

    // Create an ORGANIZATION (Business) account + its business billing row with a Stripe customer.
    const { data: org, error: orgErr } = await admin
      .from("accounts")
      .insert({ type: "organization", name: "CSBD1 Org", owner_user_id: userId })
      .select("id")
      .single<{ id: string }>();
    if (orgErr || !org) throw new Error(`org insert: ${orgErr?.message ?? "no row"}`);
    orgId = org.id;
    fixtures.trackAccount(orgId);
    await admin
      .from("account_billing")
      .insert({ account_id: orgId, plan: "business", tasks_limit: 100, stripe_customer_id: "cus_csbd1_keep" });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("flips an organization account to team + team plan + tasks_limit, keeping the Stripe customer", async () => {
    const { data, error } = await admin.rpc("apply_business_downgrade", { p_account_id: orgId, ...ARGS });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, applied: true, reason: "downgraded" });

    const { data: acct } = await admin.from("accounts").select("type").eq("id", orgId).single<{ type: string }>();
    expect(acct!.type).toBe("team");
    const { data: bill } = await admin
      .from("account_billing")
      .select("plan, plan_status, tasks_limit, stripe_customer_id")
      .eq("account_id", orgId)
      .single<{ plan: string; plan_status: string; tasks_limit: number; stripe_customer_id: string | null }>();
    expect(bill!.plan).toBe("team");
    expect(bill!.plan_status).toBe("active");
    expect(bill!.tasks_limit).toBe(100);
    expect(bill!.stripe_customer_id).toBe("cus_csbd1_keep"); // attachment preserved
  });

  it("is idempotent on replay — already_team, no unsafe write", async () => {
    const { data } = await admin.rpc("apply_business_downgrade", { p_account_id: orgId, ...ARGS });
    expect(data).toMatchObject({ ok: true, applied: false, reason: "already_team" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", orgId).single<{ type: string }>();
    expect(acct!.type).toBe("team");
  });

  it("rejects a personal account (not_downgradeable) with no write", async () => {
    const { data } = await admin.rpc("apply_business_downgrade", { p_account_id: personalId, ...ARGS });
    expect(data).toMatchObject({ ok: false, applied: false, reason: "not_downgradeable" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", personalId).single<{ type: string }>();
    expect(acct!.type).toBe("personal");
  });

  it("rejects a missing account safely", async () => {
    const { data } = await admin.rpc("apply_business_downgrade", {
      p_account_id: "00000000-0000-0000-0000-000000000000",
      ...ARGS,
    });
    expect(data).toMatchObject({ ok: false, reason: "account_not_found" });
  });

  it("rejects a frozen (pending_deletion) organization account with no write", async () => {
    const frozenUser = await createUser("frozen");
    const { data: t } = await admin
      .from("accounts")
      .insert({ type: "organization", name: "Frozen Org", owner_user_id: frozenUser, deletion_status: "pending_deletion" })
      .select("id")
      .single<{ id: string }>();
    await admin.from("account_billing").insert({ account_id: t!.id, plan: "business" });
    const { data } = await admin.rpc("apply_business_downgrade", { p_account_id: t!.id, ...ARGS });
    expect(data).toMatchObject({ ok: false, reason: "account_frozen" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", t!.id).single<{ type: string }>();
    expect(acct!.type).toBe("organization");
  });

  it("an authenticated client CANNOT execute the RPC (service-role only)", async () => {
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.rpc("apply_business_downgrade", { p_account_id: orgId, ...ARGS });
    expect(error).not.toBeNull(); // no EXECUTE grant for anon/authenticated
  });
});
