/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-5 — dual RLS: existing user_id policies + new
 * account-membership policies BOTH work simultaneously.
 *
 * SCOPE NOTE — only `workflow_runs` is still in the dual-RLS state. The
 * workflows dual-RLS coexistence ended in Slice 4.ACCOUNT-MODEL-7 (the
 * workflows `_own` policies were dropped + workflows.user_id removed) and the
 * integrations one ended in Slice 4.ACCOUNT-MODEL-6. Their post-cutover RLS is
 * proven by `workflows-account-rls.test.ts` /
 * `integrations-account-rls.test.ts`. workflow_runs keeps both predicate sets
 * until its slice -8 cutover, so it's the remaining dual-RLS surface here.
 *
 * Per docs/slices/phase-4/account-id-cutover-plan.md §"RLS migration":
 * Postgres OR-combines same-op policies, so a query satisfying EITHER the
 * legacy `auth.uid() = user_id` predicate OR the account-membership predicate
 * succeeds. This proves: user A reads their own run (visible under both
 * predicates), user B does not, anon does not, and service-role bypasses RLS.
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows + workflow_runs.
 * OPT-IN.
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

describeDb("account_id foundation dual RLS (workflow_runs) — Slice 4.ACCOUNT-MODEL-5", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    workflowId: string;
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

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  async function seedRowsFor(userId: string, accountId: string): Promise<{
    workflowId: string;
    runId: string;
  }> {
    // Post-cutover workflow INSERT shape (account_id + created_by_user_id).
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "Dual RLS run-host" })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wf) throw new Error(`seed workflow: ${wfErr?.message ?? "no row"}`);

    // workflow_runs is still user_id-owned (slice -8). The foundation compat
    // trigger derives account_id from the owning workflow.
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
          providerAccountId: "harness",
          payload: {},
        },
        started_at: nowIso,
        finished_at: nowIso,
      })
      .select("id")
      .single<{ id: string }>();
    if (runErr || !run) throw new Error(`seed run: ${runErr?.message ?? "no row"}`);

    return { workflowId: wf.id, runId: run.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    sessions.push({ ...a, ...(await seedRowsFor(a.userId, await personalAccountId(a.userId))) });
    sessions.push({ ...b, ...(await seedRowsFor(b.userId, await personalAccountId(b.userId))) });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      // workflows.user_id + workflow_revisions.user_id were dropped in -7;
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

  it("workflow_runs: user A sees their own run; user B does not; anon does not", async () => {
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

    const { data: bOnA } = await supaB.from("workflow_runs").select("id").eq("id", a.runId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonOnA } = await anon.from("workflow_runs").select("id").eq("id", a.runId);
    expect(anonOnA).toHaveLength(0);
  });

  it("service-role bypasses RLS and reads every run regardless of caller", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data: runs, error } = await admin
      .from("workflow_runs")
      .select("id")
      .in("id", [a.runId, b.runId]);
    expect(error).toBeNull();
    expect(runs).toHaveLength(2);
  });

  it("trigger_resources.account_id was NOT renamed (column still selectable by that name)", async () => {
    // Behavioral check: if the column had been renamed (e.g. to
    // provider_account_id), this SELECT would fail with a column-not-found
    // error. Probe by reading the column with LIMIT 0 (no rows; existence only).
    const { error } = await admin.from("trigger_resources").select("account_id").limit(0);
    expect(error).toBeNull();
  });
});
