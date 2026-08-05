/**
 * @jest-environment node
 *
 * Slice 4.AI-CREDITS-3b-dev-smoke — gated DB proof that the AI-credit gate
 * (`services/billing/aiCreditGate`) + `deduct_ai_credits_if_available` RPC
 * (migration 20260621000000) work against the V2 dev DB, charging the
 * workflow-owning account, with the flag set ONLY for this process.
 *
 * Proves the integration the mocked unit tests can't:
 *   - flag ON ("true") + enough credits → the gate deducts from account_billing,
 *   - flag ON + insufficient → typed refusal, NO deduction,
 *   - flag OFF → no-op (no deduction),
 *   - flag = "1" → still OFF (the accessor requires the literal "true").
 *
 * DESTRUCTIVE: creates a throwaway auth user + personal account (cleaned up in
 * afterAll). OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with
 * NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY +
 * SUPABASE_SERVICE_ROLE_KEY (migration applied). The flag is set IN-PROCESS only;
 * nothing is written to env files. NOT committed by default (verification slice).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { aiCreditGate } from "@/services/billing/aiCreditGate";
import { AI_CREDIT_ENFORCEMENT_FLAG } from "@/services/billing/billingFeatureFlags";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import type { RpcArgs } from "@/types/rpc";

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
    "SKIP ai credit gate dev smoke — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration 20260621000000 applied).",
  );
}

async function usedCredits(admin: SupabaseClient, accountId: string): Promise<number> {
  const { data, error } = await admin
    .from("account_billing")
    .select("ai_credits_used")
    .eq("account_id", accountId)
    .single<{ ai_credits_used: number }>();
  if (error) throw new Error(`read ai_credits_used: ${error.message}`);
  return data!.ai_credits_used;
}

describeDb("AI credit gate — dev DB smoke (3b-dev-smoke)", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";
  let accountId = "";
  const priorFlag = process.env[AI_CREDIT_ENFORCEMENT_FLAG];

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const created = await createTrackedUser(admin, fixtures, "ai-credit");
    userId = created.userId;
    const { data: acct, error: acctErr } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (acctErr || !acct) throw new Error(`personalAccount: ${acctErr?.message ?? "no row"}`);
    accountId = acct.id;
    // Known small AI-credit budget. This UPDATE also proves the migration's
    // columns exist on the dev DB (it errors otherwise).
    const { error: limErr } = await admin
      .from("account_billing")
      .update({ ai_credits_limit: 3, ai_credits_used: 0, ai_credits_reserved: 0 })
      .eq("account_id", accountId);
    if (limErr) throw new Error(`set ai_credits_limit: ${limErr.message}`);
  });

  afterAll(async () => {
    // Restore the in-process flag to its pre-test value (set only for the smoke).
    if (priorFlag === undefined) delete process.env[AI_CREDIT_ENFORCEMENT_FLAG];
    else process.env[AI_CREDIT_ENFORCEMENT_FLAG] = priorFlag;
    await cleanupFixtures(admin, fixtures);
  });

  it("flag ON + enough credits → the gate deducts from the workflow-owning account", async () => {
    process.env[AI_CREDIT_ENFORCEMENT_FLAG] = "true";
    const out = await aiCreditGate({
      accountId,
      feature: "workflow_creation", // charge = 2 (fast tier)
      plannedTier: "fast",
    });
    expect(out).toMatchObject({ ok: true, charged: 2, used: 2, limit: 3 });
    expect(await usedCredits(admin, accountId)).toBe(2);
  });

  it("flag ON + insufficient credits → typed refusal, NO further deduction", async () => {
    process.env[AI_CREDIT_ENFORCEMENT_FLAG] = "true";
    // used=2, limit=3; another workflow_creation (2) would be 4 > 3 → refused.
    const out = await aiCreditGate({
      accountId,
      feature: "workflow_creation",
      plannedTier: "fast",
    });
    expect(out).toMatchObject({ ok: false, reason: "insufficient_ai_credits", used: 2, limit: 3 });
    expect(await usedCredits(admin, accountId)).toBe(2); // unchanged
  });

  it("flag OFF → no-op, no deduction", async () => {
    delete process.env[AI_CREDIT_ENFORCEMENT_FLAG];
    const out = await aiCreditGate({
      accountId,
      feature: "workflow_creation",
      plannedTier: "fast",
    });
    expect(out).toMatchObject({ ok: true, skipped: true, reason: "enforcement_disabled" });
    expect(await usedCredits(admin, accountId)).toBe(2); // unchanged
  });

  it("flag = \"1\" does NOT enable enforcement (accessor requires the literal \"true\")", async () => {
    process.env[AI_CREDIT_ENFORCEMENT_FLAG] = "1";
    const out = await aiCreditGate({
      accountId,
      feature: "workflow_creation",
      plannedTier: "fast",
    });
    expect(out).toMatchObject({ ok: true, skipped: true, reason: "enforcement_disabled" });
    expect(await usedCredits(admin, accountId)).toBe(2); // unchanged
  });

  it("raw RPC deduct_ai_credits_if_available returns the documented shape", async () => {
    // One more credit fits (used=2, limit=3, +1 = 3 ≤ 3).
    const { data, error } = await admin.rpc("deduct_ai_credits_if_available", {
      p_account_id: accountId,
      p_amount: 1,
    } satisfies RpcArgs<"deduct_ai_credits_if_available">);
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, used: 3, limit: 3 });
    expect(await usedCredits(admin, accountId)).toBe(3);
    // Now full — a further 1 is refused without deducting.
    const { data: data2 } = await admin.rpc("deduct_ai_credits_if_available", {
      p_account_id: accountId,
      p_amount: 1,
    } satisfies RpcArgs<"deduct_ai_credits_if_available">);
    expect(data2).toMatchObject({ ok: false, used: 3, limit: 3 });
    expect(await usedCredits(admin, accountId)).toBe(3);
  });
});
