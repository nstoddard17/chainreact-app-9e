/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-9d — billing/usage ledger RLS.
 *
 * The three ledgers (task_usage_events, ai_cost_events, billing_shadow_comparisons)
 * are now account-owned and read-gated by account membership; writes are
 * service-role only. Proves: member A reads their account's ledger rows;
 * non-member B does not; anon does not; service-role bypasses. ai_cost_events
 * additionally keeps user_id as the ACTOR (asserted present on the seeded row).
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows/runs + ledger rows. OPT-IN.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { requireTables } from "@/tests/helpers/dbPreflight";

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
    "SKIP ledger account RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("ledger account RLS — Slice 4.ACCOUNT-MODEL-9d", () => {
  let admin: SupabaseClient;
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    workflowId: string;
    runId: string;
  }> = [];

  async function createTestUser(label: string) {
    const { userId, email, password } = await createTrackedUser(
      admin,
      fixtures,
      `ledger-acc-rls-${label}`,
    );
    return { userId, email, password };
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

  async function sessionClient(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  async function seedLedgersFor(userId: string, accountId: string) {
    const nowIso = new Date().toISOString();
    const { data: wf } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "Ledger RLS wf" })
      .select("id")
      .single<{ id: string }>();
    const workflowId = wf!.id;
    const { data: run } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: workflowId,
        account_id: accountId,
        triggered_by_user_id: userId,
        status: "succeeded",
        trigger_node_id: "t1",
        trigger_event: {},
        started_at: nowIso,
        finished_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();
    const runId = run!.id;

    // task_usage_events — account-owned (no user_id column).
    const e1 = await admin.from("task_usage_events").insert({
      account_id: accountId,
      workflow_id: workflowId,
      workflow_run_id: runId,
      event_type: "run_estimate_recorded",
      cost_policy_version: "v1",
    });
    if (e1.error) throw new Error(`seed task_usage_events: ${e1.error.message}`);

    // ai_cost_events — account-owned + user_id ACTOR retained.
    const e2 = await admin.from("ai_cost_events").insert({
      account_id: accountId,
      user_id: userId,
      workflow_id: workflowId,
      feature: "workflow_creation",
      event_type: "ai_interaction_started",
    });
    if (e2.error) throw new Error(`seed ai_cost_events: ${e2.error.message}`);

    // billing_shadow_comparisons — account-owned (no user_id column).
    const e3 = await admin.from("billing_shadow_comparisons").insert({
      account_id: accountId,
      workflow_id: workflowId,
      workflow_run_id: runId,
      flat_charged_tasks: 1,
      estimated_tasks_per_run: 2,
      actual_billable_tasks: 1,
      proposed_reserved_tasks: 2,
      proposed_reconciled_tasks: 1,
      proposed_refunded_tasks: 1,
      delta_vs_flat: 0,
      would_have_reserved: true,
      warning_codes: [],
      policy_version: "v1",
    });
    if (e3.error) throw new Error(`seed billing_shadow_comparisons: ${e3.error.message}`);

    return { workflowId, runId };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["ai_cost_events", "billing_shadow_comparisons", "task_usage_events", "workflow_runs", "workflows"]);
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, ...(await seedLedgersFor(a.userId, aAccount)) });
    sessions.push({ ...b, accountId: bAccount, workflowId: "", runId: "" });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  const LEDGERS = ["task_usage_events", "ai_cost_events", "billing_shadow_comparisons"] as const;

  it.each(LEDGERS)("%s: member A reads their account's rows; non-member B + anon do not", async (table) => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aRows, error: aErr } = await supaA.from(table).select("account_id").eq("account_id", a.accountId);
    expect(aErr).toBeNull();
    expect((aRows ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: bRows } = await supaB.from(table).select("account_id").eq("account_id", a.accountId);
    expect(bRows ?? []).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonRows } = await anon.from(table).select("account_id").eq("account_id", a.accountId);
    expect(anonRows ?? []).toHaveLength(0);
  });

  it("ai_cost_events retains user_id as the ACTOR (distinct from the owning account)", async () => {
    const a = sessions[0]!;
    const { data, error } = await admin
      .from("ai_cost_events")
      .select("account_id, user_id")
      .eq("account_id", a.accountId)
      .single<{ account_id: string; user_id: string }>();
    expect(error).toBeNull();
    expect(data!.account_id).toBe(a.accountId);
    expect(data!.user_id).toBe(a.userId); // actor preserved
  });

  it("service-role bypasses RLS and reads the seeded ledger rows", async () => {
    const a = sessions[0]!;
    for (const table of LEDGERS) {
      const { data, error } = await admin.from(table).select("account_id").eq("account_id", a.accountId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });
});
