/**
 * @jest-environment node
 *
 * Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1 — gated DB proof of the
 * workflow_node_credentials foundation:
 *   - membership RLS through the workflow's account (member of the owning account
 *     sees the grant; a non-member + anon do not),
 *   - ON DELETE CASCADE: deleting the workflow removes its grants,
 *   - the partial-unique index allows at most one LIVE (pending|accepted) grant
 *     per (workflow_id, node_id) but permits a fresh grant after the prior one is
 *     revoked.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + workflows + grants.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP workflow_node_credentials RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("workflow_node_credentials foundation RLS + cascade + partial-unique — CS-1", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    workflowId: string;
  }> = [];

  async function createTestUser(label: string) {
    return createTrackedUser(admin, fixtures, `wf-nodecred-${label}`);
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

  async function seedWorkflow(accountId: string, userId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function seedGrant(
    workflowId: string,
    nodeId: string,
    ownerUserId: string,
    status = "pending",
  ): Promise<string> {
    const { data, error } = await admin
      .from("workflow_node_credentials")
      .insert({
        workflow_id: workflowId,
        node_id: nodeId,
        provider: "gmail",
        credential_owner_user_id: ownerUserId,
        status,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedGrant: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, workflowId: await seedWorkflow(aAccount, a.userId, "A WF") });
    sessions.push({ ...b, accountId: bAccount, workflowId: await seedWorkflow(bAccount, b.userId, "B WF") });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("RLS: member A sees their workflow's grant; non-member B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const grantId = await seedGrant(a.workflowId, "node-1", a.userId);

    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_node_credentials")
      .select("id")
      .eq("id", grantId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB
      .from("workflow_node_credentials")
      .select("id")
      .eq("id", grantId);
    expect(bOnA).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonOnA } = await anon
      .from("workflow_node_credentials")
      .select("id")
      .eq("id", grantId);
    expect(anonOnA).toHaveLength(0);
  });

  it("a member cannot WRITE the table (service-role only) — INSERT is denied by RLS", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { error } = await supaA.from("workflow_node_credentials").insert({
      workflow_id: a.workflowId,
      node_id: "node-write",
      provider: "gmail",
      credential_owner_user_id: a.userId,
      status: "pending",
    });
    expect(error).not.toBeNull(); // no INSERT policy → RLS rejects
  });

  it("partial-unique: a second LIVE grant for the same node is rejected; a fresh one is allowed after revoke", async () => {
    const a = sessions[0]!;
    await seedGrant(a.workflowId, "node-dup", a.userId, "pending");

    const dup = await admin.from("workflow_node_credentials").insert({
      workflow_id: a.workflowId,
      node_id: "node-dup",
      provider: "gmail",
      credential_owner_user_id: a.userId,
      status: "accepted",
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error!.code).toBe("23505");

    // Revoke the live one, then a fresh pending grant for the same node is allowed.
    await admin
      .from("workflow_node_credentials")
      .update({ status: "revoked" })
      .eq("workflow_id", a.workflowId)
      .eq("node_id", "node-dup")
      .in("status", ["pending", "accepted"]);

    const fresh = await admin.from("workflow_node_credentials").insert({
      workflow_id: a.workflowId,
      node_id: "node-dup",
      provider: "gmail",
      credential_owner_user_id: a.userId,
      status: "pending",
    });
    expect(fresh.error).toBeNull();
  });

  it("ON DELETE CASCADE: deleting the workflow removes its grants", async () => {
    const a = sessions[0]!;
    const wfId = await seedWorkflow(a.accountId, a.userId, "Cascade WF");
    await seedGrant(wfId, "node-cascade", a.userId);

    await admin.from("workflows").delete().eq("id", wfId);

    const { data } = await admin
      .from("workflow_node_credentials")
      .select("id")
      .eq("workflow_id", wfId);
    expect(data).toHaveLength(0);
  });
});
