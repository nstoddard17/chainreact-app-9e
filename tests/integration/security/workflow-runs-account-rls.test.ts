/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-8 — workflow_runs (and the adjacent trigger_resources
 * + workflow_files) are gated by account membership ONLY after the final
 * Phase-B cutover. This proves the post-cutover RLS surface:
 *
 *   - workflow_runs: the legacy `workflow_runs_select_own` (user_id) policy is
 *     dropped; only `workflow_runs_select_account_member` remains. Member A
 *     reads their run; non-member B does not; anon does not.
 *   - trigger_resources + workflow_files: their _own (user_id) policies are
 *     dropped and replaced with account-membership policies that JOIN through
 *     workflows.account_id. A sees rows for their workflow; B does not. (Their
 *     user_id columns are KEPT as denormalized provenance — not the RLS key.)
 *   - cross-account: B cannot read A's run.
 *   - service-role bypasses RLS and sees everything.
 *   - the dropped column `workflow_runs.user_id` no longer exists.
 *   - account_id + triggered_by_user_id are populated on the run row (a manual
 *     run records the human actor; account_id = the workflow's account).
 *
 * Seeds use the post-cutover INSERT shape (workflow_runs: account_id +
 * triggered_by_user_id, NO user_id) — proof the column is gone end-to-end.
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows + runs + trigger
 * resources + files. OPT-IN.
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
    "SKIP workflow_runs account RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_runs account RLS — Slice 4.ACCOUNT-MODEL-8", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    workflowId: string;
    runId: string;
    triggerResourceId: string;
    fileId: string;
  }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `wfrun-acc-rls-${slug}@chainreact.test`;
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

  async function seedRowsFor(userId: string, accountId: string) {
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "Run RLS workflow" })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wf) throw new Error(`seed workflow: ${wfErr?.message ?? "no row"}`);

    const nowIso = new Date().toISOString();
    // Post-cutover run shape: account_id + triggered_by_user_id (manual actor),
    // NO user_id.
    const { data: run, error: runErr } = await admin
      .from("workflow_runs")
      .insert({
        workflow_id: wf.id,
        account_id: accountId,
        triggered_by_user_id: userId,
        status: "succeeded",
        trigger_node_id: "trigger-1",
        trigger_event: {
          provider: "manual",
          eventType: "manual_trigger",
          eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
          occurredAt: nowIso,
          providerAccountId: "harness",
          payload: {},
        },
        started_at: nowIso,
        finished_at: nowIso,
        is_test: false,
        triggered_by: "manual",
      })
      .select("id")
      .single<{ id: string }>();
    if (runErr || !run) throw new Error(`seed run: ${runErr?.message ?? "no row"}`);

    // trigger_resources keeps user_id (provenance); RLS now joins through the
    // workflow's account_id.
    const { data: tr, error: trErr } = await admin
      .from("trigger_resources")
      .insert({
        workflow_id: wf.id,
        user_id: userId,
        provider: "slack",
        event_type: "message_received",
        node_id: "trigger-1",
      })
      .select("id")
      .single<{ id: string }>();
    if (trErr || !tr) throw new Error(`seed trigger_resource: ${trErr?.message ?? "no row"}`);

    // workflow_files keeps user_id (provenance + storage path); RLS joins through.
    const { data: wfile, error: fErr } = await admin
      .from("workflow_files")
      .insert({
        user_id: userId,
        workflow_id: wf.id,
        run_id: run.id,
        node_id: "action-1",
        storage_path: `${userId}/${wf.id}/${run.id}/action-1/file-${Math.random().toString(36).slice(2, 8)}.txt`,
        file_name: "file.txt",
        mime_type: "text/plain",
      })
      .select("id")
      .single<{ id: string }>();
    if (fErr || !wfile) throw new Error(`seed workflow_file: ${fErr?.message ?? "no row"}`);

    return { workflowId: wf.id, runId: run.id, triggerResourceId: tr.id, fileId: wfile.id };
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, ...(await seedRowsFor(a.userId, aAccount)) });
    sessions.push({ ...b, accountId: bAccount, ...(await seedRowsFor(b.userId, bAccount)) });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      // workflow_runs / trigger_resources / workflow_files cascade from
      // workflows (ON DELETE CASCADE). Delete workflows by created_by_user_id.
      await admin.from("workflows").delete().eq("created_by_user_id", id);
      await admin.from("integrations").delete().eq("connected_by_user_id", id);
      await admin.from("user_billing").delete().eq("user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("workflow_runs: account member A sees their run; non-member B does not; anon does not", async () => {
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

  it("trigger_resources: A sees rows for their workflow (join-through RLS); B does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("trigger_resources")
      .select("id")
      .eq("id", a.triggerResourceId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("trigger_resources")
      .select("id")
      .eq("id", a.triggerResourceId);
    expect(bOnA).toHaveLength(0);
  });

  it("workflow_files: A sees rows for their workflow (join-through RLS); B does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_files")
      .select("id")
      .eq("id", a.fileId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("workflow_files")
      .select("id")
      .eq("id", a.fileId);
    expect(bOnA).toHaveLength(0);
  });

  it("service-role bypasses RLS and reads both accounts' runs", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data, error } = await admin
      .from("workflow_runs")
      .select("id")
      .in("id", [a.runId, b.runId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("workflow_runs.user_id was dropped (selecting it errors)", async () => {
    const { error } = await admin.from("workflow_runs").select("user_id").limit(0);
    expect(error).not.toBeNull();
  });

  it("workflow_runs.account_id + triggered_by_user_id are populated (account owner + manual actor)", async () => {
    const a = sessions[0]!;
    const { data, error } = await admin
      .from("workflow_runs")
      .select("account_id, triggered_by_user_id")
      .eq("id", a.runId)
      .single<{ account_id: string; triggered_by_user_id: string | null }>();
    expect(error).toBeNull();
    expect(data!.account_id).toBe(a.accountId);
    expect(data!.triggered_by_user_id).toBe(a.userId);
  });
});
