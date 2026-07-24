/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-8 — workflow_runs (and the adjacent trigger_resources
 * + workflow_files) are gated by account membership ONLY after the final
 * Phase-B cutover. This proves the post-cutover RLS surface:
 *
 *   - workflow_runs: V2-READY-51 revoked the `authenticated` SELECT grant, so the
 *     table is now SERVICE-ROLE-ONLY at the Data API. Member A's DIRECT PostgREST
 *     SELECT on their own run is denied (42501); non-member B is likewise denied;
 *     the row is still readable via service-role (the membership-gated repository
 *     path). The account-member RLS policy stays in place but is unreachable for
 *     `authenticated`.
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
    "SKIP workflow_runs account RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_runs account RLS — Slice 4.ACCOUNT-MODEL-8", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
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
    return createTrackedUser(admin, fixtures, `wfrun-acc-${label}`);
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
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["trigger_resources", "workflow_files", "workflow_runs", "workflows"]);
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, ...(await seedRowsFor(a.userId, aAccount)) });
    sessions.push({ ...b, accountId: bAccount, ...(await seedRowsFor(b.userId, bAccount)) });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("workflow_runs: member direct authenticated SELECT is denied (V2-READY-51; 42501) — reads flow through service-role", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    // Member A can no longer read their OWN run directly — SELECT was revoked from
    // authenticated; workflow_runs is service-role-only (trigger_event / steps /
    // fatal_error never reach a client via PostgREST, only via a sanitized DTO).
    const aRead = await supaA.from("workflow_runs").select("id").eq("id", a.runId);
    expect(aRead.error).not.toBeNull();
    expect(aRead.error!.code).toBe("42501");

    // Non-member B is likewise denied at the privilege layer.
    const bRead = await supaB.from("workflow_runs").select("id").eq("id", a.runId);
    expect(bRead.error).not.toBeNull();
    expect(bRead.error!.code).toBe("42501");

    // (anon is unchanged by this migration — it only revoked `authenticated`;
    // mirrors the trigger_resources / workflow_files sibling tests, which assert
    // the member-privilege denial, not anon.)

    // The row is intact and still readable by the service-role path.
    const svc = await admin.from("workflow_runs").select("id").eq("id", a.runId);
    expect(svc.error).toBeNull();
    expect(svc.data).toHaveLength(1);
  });

  it("trigger_resources: direct authenticated SELECT is denied (V2-READY-50; 42501) — reads flow through service-role", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    // Member A can no longer read directly — SELECT was revoked from authenticated;
    // trigger_resources is service-role-only (lifecycle/dispatch read it).
    const aRead = await supaA
      .from("trigger_resources")
      .select("id")
      .eq("id", a.triggerResourceId);
    expect(aRead.error).not.toBeNull();
    expect(aRead.error!.code).toBe("42501");

    // Non-member B is likewise denied at the privilege layer.
    const bRead = await supaB
      .from("trigger_resources")
      .select("id")
      .eq("id", a.triggerResourceId);
    expect(bRead.error).not.toBeNull();
    expect(bRead.error!.code).toBe("42501");

    // The row is intact and still readable by the service-role path.
    const svc = await admin
      .from("trigger_resources")
      .select("id")
      .eq("id", a.triggerResourceId);
    expect(svc.error).toBeNull();
    expect(svc.data).toHaveLength(1);
  });

  it("trigger_resources: member direct INSERT/UPDATE/DELETE is denied (V2-READY-50; 42501) — lifecycle is the only writer", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);

    const ins = await supaA.from("trigger_resources").insert({
      workflow_id: a.workflowId,
      user_id: a.userId,
      provider: "slack",
      event_type: "message_received",
      node_id: "injected",
    });
    expect(ins.error).not.toBeNull();
    expect(ins.error!.code).toBe("42501");

    const upd = await supaA
      .from("trigger_resources")
      .update({ event_type: "HIJACKED" })
      .eq("id", a.triggerResourceId);
    expect(upd.error).not.toBeNull();
    expect(upd.error!.code).toBe("42501");

    const del = await supaA
      .from("trigger_resources")
      .delete()
      .eq("id", a.triggerResourceId);
    expect(del.error).not.toBeNull();
    expect(del.error!.code).toBe("42501");

    // Row survived; event_type unchanged.
    const svc = await admin
      .from("trigger_resources")
      .select("event_type")
      .eq("id", a.triggerResourceId)
      .single<{ event_type: string }>();
    expect(svc.error).toBeNull();
    expect(svc.data!.event_type).toBe("message_received");
  });

  it("workflow_files: direct authenticated SELECT is denied (V2-READY-52; 42501) — reads flow through service-role", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    // Member A can no longer read directly — SELECT was revoked from authenticated.
    // workflow_files is service-role-only; storage_path / file_name never reach a
    // client via PostgREST (the future file-read path will use a gated DTO).
    const aRead = await supaA
      .from("workflow_files")
      .select("id")
      .eq("id", a.fileId);
    expect(aRead.error).not.toBeNull();
    expect(aRead.error!.code).toBe("42501");

    // Non-member B is likewise denied at the privilege layer.
    const bRead = await supaB
      .from("workflow_files")
      .select("id")
      .eq("id", a.fileId);
    expect(bRead.error).not.toBeNull();
    expect(bRead.error!.code).toBe("42501");

    // The row is intact and still readable by the service-role path.
    const svc = await admin
      .from("workflow_files")
      .select("id")
      .eq("id", a.fileId);
    expect(svc.error).toBeNull();
    expect(svc.data).toHaveLength(1);
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
