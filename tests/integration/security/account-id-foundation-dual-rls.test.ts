/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-5 — dual RLS: existing user_id policies + new
 * account-membership policies BOTH work simultaneously.
 *
 * Per docs/slices/phase-4/account-id-cutover-plan.md §"RLS migration":
 *   Postgres OR-combines same-op policies. During the foundation slice,
 *   the legacy `_own` policies AND the new `_account_member` policies
 *   coexist, and queries satisfying EITHER predicate succeed.
 *
 *   This test proves: (a) user A reads their own workflow via the
 *   session client (succeeds — both predicates would let it through),
 *   (b) user B does NOT see user A's workflow (neither predicate
 *   matches), (c) the same is true for integrations + workflow_runs,
 *   (d) service-role bypasses RLS and sees everything.
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows + integrations
 * + workflow_runs. OPT-IN.
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
    "SKIP account_id foundation dual-RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_id foundation dual RLS — Slice 4.ACCOUNT-MODEL-5", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    workflowId: string;
    integrationId: string;
    runId: string;
  }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `acc-dual-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email, password };
  }

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  async function seedRowsFor(userId: string): Promise<{
    workflowId: string;
    integrationId: string;
    runId: string;
  }> {
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ user_id: userId, name: "Dual RLS workflow" })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wf) throw new Error(`seed workflow: ${wfErr?.message ?? "no row"}`);

    const { data: integ, error: intErr } = await admin
      .from("integrations")
      .insert({
        user_id: userId,
        provider: "slack",
        provider_account_id: `T-${Math.random().toString(36).slice(2, 10)}`,
        display_name: "Dual RLS workspace",
        access_token_encrypted: "encrypted-bytes",
      })
      .select("id")
      .single<{ id: string }>();
    if (intErr || !integ) throw new Error(`seed integration: ${intErr?.message ?? "no row"}`);

    const nowIso = new Date().toISOString();
    const { data: run, error: runErr } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: wf.id,
        user_id: userId,
        status: "succeeded",
        trigger_node_id: "trigger-1",
        trigger_event: {
          provider: "manual",
          eventType: "manual_trigger",
          eventId: `evt-${Date.now()}`,
          occurredAt: nowIso,
          accountId: "harness",
          payload: {},
        },
        started_at: nowIso,
        finished_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();
    if (runErr || !run) throw new Error(`seed run: ${runErr?.message ?? "no row"}`);

    return { workflowId: wf.id, integrationId: integ.id, runId: run.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    sessions.push({ ...a, ...(await seedRowsFor(a.userId)) });
    sessions.push({ ...b, ...(await seedRowsFor(b.userId)) });
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

  it("workflows: user A sees their own row; user B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflows")
      .select("id")
      .eq("id", a.workflowId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("workflows")
      .select("id")
      .eq("id", a.workflowId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonOnA } = await anon
      .from("workflows")
      .select("id")
      .eq("id", a.workflowId);
    expect(anonOnA).toHaveLength(0);
  });

  it("integrations: user A sees their own row; user B does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("integrations")
      .select("id")
      .eq("id", a.integrationId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("integrations")
      .select("id")
      .eq("id", a.integrationId);
    expect(bOnA).toHaveLength(0);
  });

  it("workflow_runs: user A sees their own run; user B does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_runs")
      .select("id")
      .eq("id", a.runId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("workflow_runs")
      .select("id")
      .eq("id", a.runId);
    expect(bOnA).toHaveLength(0);
  });

  it("service-role bypasses RLS and reads every row regardless of caller", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data: wfs, error: wfErr } = await admin
      .from("workflows")
      .select("id")
      .in("id", [a.workflowId, b.workflowId]);
    expect(wfErr).toBeNull();
    expect(wfs).toHaveLength(2);
  });

  it("trigger_resources.account_id was NOT renamed (column still selectable by that name)", async () => {
    // Behavioral check: if the column had been renamed (e.g. to
    // provider_account_id), this SELECT would fail with a column-not-found
    // error. PostgREST doesn't expose information_schema / pg_catalog via
    // the REST API, so we probe by trying to read the column with LIMIT 0
    // (no rows fetched; just a column-existence check).
    const { error } = await admin
      .from("trigger_resources")
      .select("account_id")
      .limit(0);
    expect(error).toBeNull();
  });
});
