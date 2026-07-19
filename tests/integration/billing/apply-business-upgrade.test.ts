/**
 * @jest-environment node
 *
 * Slice 4.BILLING-BUSINESS-UPGRADE-2 / BU-1 — gated DB proof of the apply_business_upgrade
 * RPC (20260614000000):
 *   - a Team account flips atomically to organization + business + tasks_limit;
 *   - a replay is idempotent (already_upgraded, no unsafe write);
 *   - a frozen account is rejected with no write;
 *   - a personal / missing account is rejected safely;
 *   - an authenticated client cannot EXECUTE the RPC (service-role only).
 *
 * DESTRUCTIVE: creates throwaway auth users + a team account. OPT-IN — set
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
    "SKIP apply_business_upgrade — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).",
  );
}

const UPGRADE_ARGS = {
  p_plan_status: "active",
  p_current_period_end: "2026-08-01T00:00:00.000Z",
  p_cancel_at_period_end: false,
  p_stripe_subscription_id: "sub_bu1_test",
  p_stripe_customer_id: "cus_bu1_test",
  p_tasks_limit: 100,
};

describeDb("apply_business_upgrade — BU-1", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";
  let teamId = "";
  let personalId = "";

  async function createUser(label: string) {
    const { userId: id } = await createTrackedUser(admin, fixtures, `bu1-${label}`);
    return id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    userId = await createUser("a");

    // The signup trigger seeds a personal account + billing for the user.
    const { data: pers } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    personalId = pers!.id;

    // Create a TEAM account owned by the user + its team billing row.
    const { data: team, error: teamErr } = await admin
      .from("accounts")
      .insert({ type: "team", name: "BU1 Team", owner_user_id: userId })
      .select("id")
      .single<{ id: string }>();
    if (teamErr || !team) throw new Error(`team insert: ${teamErr?.message ?? "no row"}`);
    teamId = team.id;
    fixtures.trackAccount(teamId);
    await admin.from("account_billing").insert({ account_id: teamId, plan: "team" });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("flips a Team account to organization + business + tasks_limit atomically", async () => {
    const { data, error } = await admin.rpc("apply_business_upgrade", { p_account_id: teamId, ...UPGRADE_ARGS });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, applied: true, reason: "upgraded" });

    const { data: acct } = await admin.from("accounts").select("type").eq("id", teamId).single<{ type: string }>();
    expect(acct!.type).toBe("organization");
    const { data: bill } = await admin
      .from("account_billing")
      .select("plan, plan_status, tasks_limit, stripe_subscription_id, current_period_end")
      .eq("account_id", teamId)
      .single<{ plan: string; plan_status: string; tasks_limit: number; stripe_subscription_id: string; current_period_end: string }>();
    expect(bill!.plan).toBe("business");
    expect(bill!.plan_status).toBe("active");
    expect(bill!.tasks_limit).toBe(100);
    expect(bill!.stripe_subscription_id).toBe("sub_bu1_test");
  });

  it("is idempotent on replay — already_upgraded, no unsafe write", async () => {
    const { data } = await admin.rpc("apply_business_upgrade", { p_account_id: teamId, ...UPGRADE_ARGS });
    expect(data).toMatchObject({ ok: true, applied: false, reason: "already_upgraded" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", teamId).single<{ type: string }>();
    expect(acct!.type).toBe("organization");
  });

  it("rejects a personal account (not_upgradeable) with no write", async () => {
    const { data } = await admin.rpc("apply_business_upgrade", { p_account_id: personalId, ...UPGRADE_ARGS });
    expect(data).toMatchObject({ ok: false, applied: false, reason: "not_upgradeable" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", personalId).single<{ type: string }>();
    expect(acct!.type).toBe("personal");
  });

  it("rejects a missing account safely", async () => {
    const { data } = await admin.rpc("apply_business_upgrade", {
      p_account_id: "00000000-0000-0000-0000-000000000000",
      ...UPGRADE_ARGS,
    });
    expect(data).toMatchObject({ ok: false, reason: "account_not_found" });
  });

  it("rejects a frozen (pending_deletion) Team account with no write", async () => {
    const frozenUser = await createUser("frozen");
    const { data: t } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Frozen Team", owner_user_id: frozenUser, deletion_status: "pending_deletion" })
      .select("id")
      .single<{ id: string }>();
    await admin.from("account_billing").insert({ account_id: t!.id, plan: "team" });
    const { data } = await admin.rpc("apply_business_upgrade", { p_account_id: t!.id, ...UPGRADE_ARGS });
    expect(data).toMatchObject({ ok: false, reason: "account_frozen" });
    const { data: acct } = await admin.from("accounts").select("type").eq("id", t!.id).single<{ type: string }>();
    expect(acct!.type).toBe("team");
  });

  it("an authenticated client CANNOT execute the RPC (service-role only)", async () => {
    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.rpc("apply_business_upgrade", { p_account_id: teamId, ...UPGRADE_ARGS });
    expect(error).not.toBeNull(); // no EXECUTE grant for anon/authenticated
  });
});
