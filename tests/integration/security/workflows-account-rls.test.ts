/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-7 — workflows + workflow_revisions are owned by
 * account membership ONLY after the cutover. This proves the post-cutover
 * RLS surface:
 *
 *   - workflows: the legacy `_own` (user_id) policies are dropped; only the
 *     account-membership policies remain. User A (a member of the owning
 *     account) reads their workflow; user B (a different account) does not;
 *     anon does not.
 *   - workflow_revisions: it has NO account_id column — its RLS joins through
 *     workflows.account_id. A sees revisions of their workflow; B does not.
 *   - cross-account writes: B cannot UPDATE or DELETE A's workflow (the write
 *     policies are account-membership too) — zero rows affected, no error
 *     leaked.
 *   - service-role bypasses RLS and sees everything.
 *   - the dropped columns `workflows.user_id` + `workflow_revisions.user_id`
 *     no longer exist (selecting them errors).
 *
 * Consolidates the cutover plan's "workflows-account-rls" +
 * "workflow-revisions-account-rls" intents into one file (mirrors the
 * foundation slice's single dual-RLS file).
 *
 * Seeds use the post-cutover INSERT shape (account_id + created_by_user_id;
 * revisions get workflow_id + definition only) — proof the user_id columns
 * are gone end-to-end.
 *
 * DESTRUCTIVE: creates throwaway auth users + workflows + revisions. OPT-IN.
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
    "SKIP workflows account RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflows account RLS — Slice 4.ACCOUNT-MODEL-7", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    workflowId: string;
    revisionId: string;
  }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `wf-acc-rls-${slug}@chainreact.test`;
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
    revisionId: string;
  }> {
    // Post-cutover INSERT shape: account_id + created_by_user_id, NO user_id.
    const { data: wf, error: wfErr } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name: "Account RLS workflow" })
      .select("id")
      .single<{ id: string }>();
    if (wfErr || !wf) throw new Error(`seed workflow: ${wfErr?.message ?? "no row"}`);

    // Revision INSERT shape: workflow_id + definition, NO user_id.
    const { data: rev, error: revErr } = await admin
      .from("workflow_revisions")
      .insert({ workflow_id: wf.id, definition: { nodes: [], edges: [] } })
      .select("id")
      .single<{ id: string }>();
    if (revErr || !rev) throw new Error(`seed revision: ${revErr?.message ?? "no row"}`);

    return { workflowId: wf.id, revisionId: rev.id };
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
      // user_id is gone on workflows/workflow_revisions post-cutover. Delete
      // workflows by created_by_user_id (revisions cascade), then accounts.
      await admin.from("workflows").delete().eq("created_by_user_id", id);
      await admin.from("integrations").delete().eq("connected_by_user_id", id);
      // 4.ACCOUNT-MODEL-9c2: handle_new_user seeds account_billing (ON DELETE
      // RESTRICT to accounts) — clear it before accounts. user_billing is gone;
      // workflow_runs cascade from workflows (no user_id column anymore).
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) {
        await admin.from("account_billing").delete().eq("account_id", a.id);
      }
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("workflows: account member A sees their row; non-member B does not; anon does not", async () => {
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

    const { data: bOnA } = await supaB.from("workflows").select("id").eq("id", a.workflowId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonOnA } = await anon.from("workflows").select("id").eq("id", a.workflowId);
    expect(anonOnA).toHaveLength(0);
  });

  it("workflow_revisions: A sees revisions of their workflow (join-through RLS); B does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_revisions")
      .select("id")
      .eq("id", a.revisionId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("workflow_revisions")
      .select("id")
      .eq("id", a.revisionId);
    expect(bOnA).toHaveLength(0);
  });

  it("cross-account write: B cannot UPDATE or DELETE A's workflow (RLS write policies)", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);

    // UPDATE: RLS makes the row invisible to B → zero rows match → no error,
    // no mutation.
    await supaB.from("workflows").update({ name: "hijacked" }).eq("id", a.workflowId);
    // DELETE: same — zero rows affected.
    await supaB.from("workflows").delete().eq("id", a.workflowId);

    // Service-role confirms the row is untouched.
    const { data: after, error } = await admin
      .from("workflows")
      .select("name")
      .eq("id", a.workflowId)
      .single<{ name: string }>();
    expect(error).toBeNull();
    expect(after!.name).toBe("Account RLS workflow");
  });

  it("service-role bypasses RLS and reads both accounts' workflows", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data: wfs, error } = await admin
      .from("workflows")
      .select("id")
      .in("id", [a.workflowId, b.workflowId]);
    expect(error).toBeNull();
    expect(wfs).toHaveLength(2);
  });

  it("workflows.user_id was dropped (selecting it errors)", async () => {
    const { error } = await admin.from("workflows").select("user_id").limit(0);
    expect(error).not.toBeNull();
  });

  it("workflow_revisions.user_id was dropped (selecting it errors)", async () => {
    const { error } = await admin.from("workflow_revisions").select("user_id").limit(0);
    expect(error).not.toBeNull();
  });

  it("workflows.account_id + created_by_user_id are present and populated", async () => {
    const a = sessions[0]!;
    const { data, error } = await admin
      .from("workflows")
      .select("account_id, created_by_user_id")
      .eq("id", a.workflowId)
      .single<{ account_id: string; created_by_user_id: string }>();
    expect(error).toBeNull();
    expect(data!.account_id).toBe(a.accountId);
    expect(data!.created_by_user_id).toBe(a.userId);
  });
});
