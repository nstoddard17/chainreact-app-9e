/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-SWITCHER-1 — gated DB proof that workflow_run_stats is
 * account-scoped (the run-stats fix):
 *   - querying the view with .eq("account_id", A) returns A's workflow stats and
 *     NOT B's (no cross-account leak between a user's Personal + Team accounts),
 *   - test-mode runs (is_test = true) are excluded from the aggregates.
 *
 * Mirrors what repositories/workflowRunStats.getStatsForAccount does. DESTRUCTIVE
 * / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with URL + SERVICE key.
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
    "SKIP workflow_run_stats account scope — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_run_stats account scoping — 4.ACCOUNT-SWITCHER-1", () => {
  let admin: SupabaseClient;
  let userId = "";
  let personalId = "";
  let teamId = "";
  let wfPersonal = "";
  let wfTeam = "";

  async function seedWorkflow(accountId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function seedRun(workflowId: string, accountId: string, isTest: boolean) {
    const now = new Date().toISOString();
    const { error } = await admin.from("workflow_runs").insert({
      workflow_id: workflowId,
      account_id: accountId,
      status: "succeeded",
      trigger_node_id: "t1",
      trigger_event: {},
      started_at: now,
      finished_at: now,
      is_test: isTest,
      triggered_by: "manual",
    });
    if (error) throw new Error(`seedRun: ${error.message}`);
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `wf-runstats-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    userId = data.user.id;
    const { data: pa } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    personalId = pa!.id;
    // Team account + owner membership (personal-invariants trigger is a no-op for teams).
    const { data: team } = await admin
      .from("accounts").insert({ type: "team", name: `RS Team ${slug}`, owner_user_id: userId })
      .select("id").single<{ id: string }>();
    teamId = team!.id;
    await admin.from("account_memberships").insert({ account_id: teamId, user_id: userId, role: "owner" });

    wfPersonal = await seedWorkflow(personalId, "Personal WF");
    wfTeam = await seedWorkflow(teamId, "Team WF");
    await seedRun(wfPersonal, personalId, false); // counts for personal
    await seedRun(wfPersonal, personalId, true); // test-mode → excluded
    await seedRun(wfTeam, teamId, false); // counts for team
    await seedRun(wfTeam, teamId, false); // team has 2 real runs
  });

  afterAll(async () => {
    if (!admin || !userId) return;
    await admin.from("workflow_runs").delete().in("account_id", [personalId, teamId]);
    await admin.from("workflows").delete().eq("created_by_user_id", userId);
    await admin.from("account_billing").delete().in("account_id", [personalId, teamId]);
    await admin.from("account_memberships").delete().eq("user_id", userId);
    await admin.from("accounts").delete().eq("owner_user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  it("scoping to the personal account returns ONLY the personal workflow's real-run stats", async () => {
    const { data, error } = await admin
      .from("workflow_run_stats")
      .select("workflow_id, total, account_id")
      .eq("account_id", personalId);
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ workflow_id: string; total: number; account_id: string }>;
    const ids = rows.map((r) => r.workflow_id);
    expect(ids).toContain(wfPersonal);
    expect(ids).not.toContain(wfTeam); // no cross-account leak
    const personalRow = rows.find((r) => r.workflow_id === wfPersonal)!;
    expect(Number(personalRow.total)).toBe(1); // the test-mode run is excluded
  });

  it("scoping to the team account returns ONLY the team workflow's stats", async () => {
    const { data, error } = await admin
      .from("workflow_run_stats")
      .select("workflow_id, total, account_id")
      .eq("account_id", teamId);
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ workflow_id: string; total: number }>;
    const ids = rows.map((r) => r.workflow_id);
    expect(ids).toContain(wfTeam);
    expect(ids).not.toContain(wfPersonal);
    expect(Number(rows.find((r) => r.workflow_id === wfTeam)!.total)).toBe(2);
  });
});
