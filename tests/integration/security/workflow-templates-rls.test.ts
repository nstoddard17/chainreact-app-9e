/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-4 / CS-XT-4 — gated DB proof of the
 * workflow_templates foundation:
 *   - service-role can create a template;
 *   - account-membership RLS: member A reads their account's template; non-member B and
 *     anon do not (no existence leak);
 *   - authenticated has NO write grant (a session-client INSERT is rejected);
 *   - deleting the owning account CASCADE-removes its templates.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + templates. OPT-IN — set
 * ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
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
    "SKIP workflow_templates RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const DEF = { nodes: [], edges: [] };

describeDb("workflow_templates foundation RLS + cascade — CS-XT-4", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    templateId: string;
  }> = [];

  async function createTestUser(label: string) {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `wf-tpl-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  async function seedTemplate(accountId: string, userId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflow_templates")
      .insert({ account_id: accountId, created_by_user_id: userId, name, definition: DEF, schema_version: 1 })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedTemplate: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, templateId: await seedTemplate(aAccount, a.userId, "A Template") });
    sessions.push({ ...b, accountId: bAccount, templateId: await seedTemplate(bAccount, b.userId, "B Template") });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) {
        await admin.from("workflow_templates").delete().eq("account_id", a.id);
        await admin.from("account_billing").delete().eq("account_id", a.id);
      }
      await admin.from("workflow_templates").delete().eq("created_by_user_id", id);
      await admin.from("account_memberships").delete().eq("user_id", id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("service-role created the seed template (sanity)", () => {
    expect(sessions[0]!.templateId).toBeTruthy();
  });

  it("RLS: member A sees their template; non-member B does not; anon does not", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const { data: aOwn, error: aErr } = await supaA
      .from("workflow_templates")
      .select("id")
      .eq("id", a.templateId);
    expect(aErr).toBeNull();
    expect(aOwn).toHaveLength(1);

    const { data: bOnA } = await supaB.from("workflow_templates").select("id").eq("id", a.templateId);
    expect(bOnA ?? []).toHaveLength(0);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonOnA } = await anon.from("workflow_templates").select("id").eq("id", a.templateId);
    expect(anonOnA ?? []).toHaveLength(0);
  });

  it("authenticated has NO write grant — a session-client INSERT is rejected", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { error } = await supaA
      .from("workflow_templates")
      .insert({ account_id: a.accountId, created_by_user_id: a.userId, name: "client write", definition: DEF, schema_version: 1 });
    expect(error).not.toBeNull(); // 42501 / RLS — clients cannot author templates directly
  });

  it("deleting the owning account CASCADE-removes its templates", async () => {
    const tmp = await createTestUser("c");
    const tmpAccount = await personalAccountId(tmp.userId);
    const tplId = await seedTemplate(tmpAccount, tmp.userId, "Doomed Template");

    await admin.from("account_billing").delete().eq("account_id", tmpAccount);
    await admin.from("account_memberships").delete().eq("account_id", tmpAccount);
    const { error: delErr } = await admin.from("accounts").delete().eq("id", tmpAccount);
    expect(delErr).toBeNull();

    const { data: gone } = await admin.from("workflow_templates").select("id").eq("id", tplId);
    expect(gone ?? []).toHaveLength(0);
  });
});
