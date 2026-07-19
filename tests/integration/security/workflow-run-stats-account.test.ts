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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ANON_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow_run_stats account scope — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_run_stats account scoping — 4.ACCOUNT-SWITCHER-1", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let userId = "";
  let email = "";
  let password = "";
  let personalId = "";
  let teamId = "";
  let wfPersonal = "";
  let wfTeam = "";

  // Authenticated (anon-key + password) session for the seeded user — used to
  // prove the V2-READY-51 lockdown + the security_invoker-view regression.
  async function sessionClient(): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

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
    const user = await createTrackedUser(admin, fixtures, "wf-runstats");
    userId = user.userId;
    email = user.email;
    password = user.password;
    const slug = userId.slice(0, 8);
    const { data: pa } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    personalId = pa!.id;
    // Team account + owner membership (personal-invariants trigger is a no-op for teams).
    const { data: team } = await admin
      .from("accounts").insert({ type: "team", name: `RS Team ${slug}`, owner_user_id: userId })
      .select("id").single<{ id: string }>();
    teamId = team!.id;
    fixtures.trackAccount(teamId);
    await admin.from("account_memberships").insert({ account_id: teamId, user_id: userId, role: "owner" });

    wfPersonal = await seedWorkflow(personalId, "Personal WF");
    wfTeam = await seedWorkflow(teamId, "Team WF");
    await seedRun(wfPersonal, personalId, false); // counts for personal
    await seedRun(wfPersonal, personalId, true); // test-mode → excluded
    await seedRun(wfTeam, teamId, false); // counts for team
    await seedRun(wfTeam, teamId, false); // team has 2 real runs
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
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

  // ── V2-READY-51-HOTFIX — security_invoker view ↔ revoked base-table regression ──
  //
  // `workflow_run_stats` is a `security_invoker=true` view over `workflow_runs`.
  // V2-READY-51 revoked `authenticated` SELECT on `workflow_runs`, so an
  // authenticated read of the view fails 42501 ("permission denied for table
  // workflow_runs") — which 500'd the authenticated /workflows shell + GET
  // /api/workflows until the stats repo was moved to service-role. These pin the
  // regression so re-introducing an authenticated read of the view (or re-granting
  // the base table) fails loudly.
  it("authenticated direct SELECT on workflow_runs is denied (42501) — V2-READY-51 lockdown intact", async () => {
    const supa = await sessionClient();
    const r = await supa.from("workflow_runs").select("id").eq("account_id", personalId);
    expect(r.error).not.toBeNull();
    expect(r.error!.code).toBe("42501");
  });

  it("authenticated direct SELECT on the security_invoker view workflow_run_stats FAILS (42501 on underlying workflow_runs) — the shell-500 condition", async () => {
    const supa = await sessionClient();
    const r = await supa
      .from("workflow_run_stats")
      .select("workflow_id, total")
      .eq("account_id", personalId);
    expect(r.error).not.toBeNull();
    expect(r.error!.code).toBe("42501");
  });

  it("service-role reads workflow_run_stats successfully (the repository hotfix path) — and exposes only safe aggregates", async () => {
    const { data, error } = await admin
      .from("workflow_run_stats")
      .select("workflow_id, total, succeeded, last_run_at, last_run_status, account_id")
      .eq("account_id", personalId);
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.some((r) => r.workflow_id === wfPersonal)).toBe(true);
    // The view is a safe aggregate projection — no raw run-payload columns leak.
    for (const row of rows) {
      for (const banned of ["trigger_event", "steps", "fatal_error"]) {
        expect(banned in row).toBe(false);
      }
    }
  });
});
