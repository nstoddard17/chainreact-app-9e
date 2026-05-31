/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-5 — account_id foundation backfill correctness.
 *
 * Per docs/slices/phase-4/account-id-cutover-plan.md §"Test plan → Foundation":
 *   1. Every row on workflows/integrations/workflow_runs has account_id
 *      populated (DB-wide invariant).
 *   2. A freshly inserted workflow_run derives account_id from its owning
 *      workflow via the workflow_runs compat trigger.
 *
 * SCOPE NOTE — the workflows + integrations compat-trigger insert checks were
 * removed once those tables cut over (workflows in Slice 4.ACCOUNT-MODEL-7,
 * integrations in -6): their compat triggers are dropped and their user_id
 * columns are gone, so `insert({ user_id, ... })` no longer applies. Only the
 * workflow_runs compat trigger survives (until slice -8), so it's the one
 * trigger-derivation check kept here.
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows + workflow_runs.
 * OPT-IN via ALLOW_DB_INTEGRATION_TESTS=true + service role key.
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
    "SKIP account_id foundation backfill — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_id foundation backfill — Slice 4.ACCOUNT-MODEL-5", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createTestUser(label: string): Promise<string> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `acc-foundation-backfill-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function getPersonalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`getPersonalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      // workflows.user_id + workflow_revisions.user_id dropped in -7;
      // integrations.user_id in -6. Delete workflows by created_by_user_id
      // (revisions cascade) and workflow_runs by its still-present user_id.
      await admin.from("workflow_runs").delete().eq("user_id", id);
      await admin.from("workflows").delete().eq("created_by_user_id", id);
      await admin.from("integrations").delete().eq("connected_by_user_id", id);
      await admin.from("user_billing").delete().eq("user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("freshly inserted workflow_run has account_id derived from the owning workflow", async () => {
    const userId = await createTestUser("run");
    const personalAccountId = await getPersonalAccountId(userId);

    // Seed a workflow first (post-cutover account-keyed shape) so the
    // workflow_run has something to point at.
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ account_id: personalAccountId, created_by_user_id: userId, name: "Run test workflow" })
      .select("id, account_id")
      .single<{ id: string; account_id: string }>();
    expect(wfErr).toBeNull();
    expect(wf!.account_id).toBe(personalAccountId);

    // Insert a run with the existing column shape — no account_id supplied.
    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: wf!.id,
        user_id: userId,
        status: "succeeded",
        trigger_node_id: "trigger-1",
        trigger_event: {
          provider: "manual",
          eventType: "manual_trigger",
          eventId: `evt-${Date.now()}`,
          occurredAt: nowIso,
          providerAccountId: "harness",
          payload: {},
        },
        started_at: nowIso,
        finished_at: nowIso,
      })
      .select("id, user_id, account_id, triggered_by_user_id")
      .single<{
        id: string;
        user_id: string;
        account_id: string;
        triggered_by_user_id: string | null;
      }>();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userId);
    expect(data!.account_id).toBe(personalAccountId);
    expect(data!.triggered_by_user_id).toBeNull();
  });

  it("DB-wide invariant: zero rows on workflows/integrations/workflow_runs have NULL account_id", async () => {
    const { count: wfNulls } = await admin
      .from("workflows")
      .select("*", { count: "exact", head: true })
      .is("account_id", null);
    const { count: intNulls } = await admin
      .from("integrations")
      .select("*", { count: "exact", head: true })
      .is("account_id", null);
    const { count: runNulls } = await admin
      .from("workflow_runs")
      .select("*", { count: "exact", head: true })
      .is("account_id", null);
    expect(wfNulls).toBe(0);
    expect(intNulls).toBe(0);
    expect(runNulls).toBe(0);
  });
});
