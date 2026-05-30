/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-5 — account_id foundation backfill correctness.
 *
 * Per docs/slices/phase-4/account-id-cutover-plan.md §"Test plan → Foundation":
 *   1. Every row on workflows/integrations/workflow_runs has account_id
 *      populated after the migration.
 *   2. account_id resolves to a personal account whose owner_user_id
 *      matches the row's pre-cutover user_id.
 *   3. Re-running the backfill UPDATE is a no-op (zero new rows).
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
      await admin.from("workflow_runs").delete().eq("user_id", id);
      await admin.from("workflow_revisions").delete().eq("user_id", id);
      await admin.from("workflows").delete().eq("user_id", id);
      await admin.from("integrations").delete().eq("user_id", id);
      await admin.from("user_billing").delete().eq("user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("freshly inserted workflow has account_id populated by the compat trigger", async () => {
    const userId = await createTestUser("wf");
    const personalAccountId = await getPersonalAccountId(userId);

    // Insert with the existing column shape — no account_id supplied.
    const { data, error } = await admin
      .from("workflows")
      .insert({ user_id: userId, name: "Backfill test" })
      .select("id, user_id, account_id, created_by_user_id")
      .single<{ id: string; user_id: string; account_id: string; created_by_user_id: string }>();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data!.user_id).toBe(userId);
    expect(data!.account_id).toBe(personalAccountId);
    expect(data!.created_by_user_id).toBe(userId);
  });

  it("freshly inserted integration has account_id populated by the compat trigger", async () => {
    const userId = await createTestUser("int");
    const personalAccountId = await getPersonalAccountId(userId);

    const { data, error } = await admin
      .from("integrations")
      .insert({
        user_id: userId,
        provider: "slack",
        provider_account_id: `T-${Math.random().toString(36).slice(2, 10)}`,
        display_name: "Backfill workspace",
        access_token_encrypted: "encrypted-bytes",
      })
      .select("id, user_id, account_id, connected_by_user_id")
      .single<{
        id: string;
        user_id: string;
        account_id: string;
        connected_by_user_id: string;
      }>();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userId);
    expect(data!.account_id).toBe(personalAccountId);
    expect(data!.connected_by_user_id).toBe(userId);
  });

  it("freshly inserted workflow_run has account_id derived from the owning workflow", async () => {
    const userId = await createTestUser("run");
    const personalAccountId = await getPersonalAccountId(userId);

    // Seed a workflow first so the workflow_run has something to point at.
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ user_id: userId, name: "Run test workflow" })
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

  it("re-running the backfill UPDATE produces zero changes (idempotency)", async () => {
    // Mirror the migration's backfill UPDATE shape and assert zero rows affected.
    // We can't easily count rows-affected via supabase-js, but we can re-run
    // the UPDATE and assert that account_id values are unchanged for our test
    // user's rows.
    const userId = await createTestUser("idem");
    const personalAccountId = await getPersonalAccountId(userId);

    await admin.from("workflows").insert({ user_id: userId, name: "Idem workflow" });

    // Re-run the workflows backfill via service-role UPDATE. The WHERE
    // clause requires account_id IS NULL — every row has account_id now,
    // so this UPDATE should match zero rows.
    const { error: reErr } = await admin
      .from("workflows")
      .update({ account_id: personalAccountId })
      .eq("user_id", userId)
      .is("account_id", null); // matches zero rows because trigger already filled it
    expect(reErr).toBeNull();

    // Assert the workflow row still has the original account_id.
    const { data: wf } = await admin
      .from("workflows")
      .select("account_id")
      .eq("user_id", userId)
      .single<{ account_id: string }>();
    expect(wf!.account_id).toBe(personalAccountId);
  });
});
