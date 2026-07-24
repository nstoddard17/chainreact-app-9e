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
    "SKIP workflow_templates RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const DEF = { nodes: [], edges: [] };

describeDb("workflow_templates foundation RLS + cascade — CS-XT-4", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  let publicTemplateId = "";
  let officialTemplateId = "";
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
    templateId: string;
  }> = [];

  async function createTestUser(label: string) {
    return createTrackedUser(admin, fixtures, `wf-tmpl-${label}`);
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
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["account_billing", "workflow_template_usage_events", "workflow_templates"]);
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    const aAccount = await personalAccountId(a.userId);
    const bAccount = await personalAccountId(b.userId);
    sessions.push({ ...a, accountId: aAccount, templateId: await seedTemplate(aAccount, a.userId, "A Template") });
    sessions.push({ ...b, accountId: bAccount, templateId: await seedTemplate(bAccount, b.userId, "B Template") });

    // A PUBLIC template owned by A's account (visible to any authenticated user).
    {
      const { data, error } = await admin
        .from("workflow_templates")
        .insert({ account_id: aAccount, created_by_user_id: a.userId, name: "A Public", definition: DEF, schema_version: 1, visibility: "public", published_at: new Date().toISOString() })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) throw new Error(`seed public: ${error?.message ?? "no row"}`);
      publicTemplateId = data.id;
    }
    // An OFFICIAL template (platform-owned: account_id NULL, source 'official').
    {
      const { data, error } = await admin
        .from("workflow_templates")
        .insert({ account_id: null, created_by_user_id: a.userId, name: "Official Starter", definition: DEF, schema_version: 1, source: "official", visibility: "public", creator_display_name_snapshot: "ChainReact" })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) throw new Error(`seed official: ${error?.message ?? "no row"}`);
      officialTemplateId = data.id;
    }
  });

  afterAll(async () => {
    // The OFFICIAL template is platform-owned (account_id NULL), so it neither
    // cascades from an account nor is reachable by the shared account-scoped
    // teardown. Remove templates by author first; the rest is account-scoped.
    if (admin && fixtures.userIds.length > 0) {
      await admin.from("workflow_templates").delete().in("created_by_user_id", [...fixtures.userIds]);
    }
    await cleanupFixtures(admin, fixtures);
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

  // ── marketplace visibility (CS-XT-4B) ──────────────────────────────────────
  it("marketplace: a non-member authenticated user SEES a PUBLIC template; anon does not", async () => {
    const b = sessions[1]!; // B is not a member of A's account
    const supaB = await sessionClient(b.email, b.password);
    const { data: bOnPublic } = await supaB.from("workflow_templates").select("id").eq("id", publicTemplateId);
    expect(bOnPublic).toHaveLength(1);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonOnPublic } = await anon.from("workflow_templates").select("id").eq("id", publicTemplateId);
    expect(anonOnPublic ?? []).toHaveLength(0);
  });

  it("marketplace: a non-member authenticated user SEES an OFFICIAL template; anon does not", async () => {
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);
    const { data: bOnOfficial } = await supaB.from("workflow_templates").select("id").eq("id", officialTemplateId);
    expect(bOnOfficial).toHaveLength(1);

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonOnOfficial } = await anon.from("workflow_templates").select("id").eq("id", officialTemplateId);
    expect(anonOnOfficial ?? []).toHaveLength(0);
  });

  it("marketplace: B's own PRIVATE template stays invisible to A (private not exposed)", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data: aOnBprivate } = await supaA.from("workflow_templates").select("id").eq("id", b.templateId);
    expect(aOnBprivate ?? []).toHaveLength(0);
  });

  // ── usage ledger (CS-XT-4B) ────────────────────────────────────────────────
  it("authenticated cannot read or write the usage ledger (service-role only)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data: readRows } = await supaA.from("workflow_template_usage_events").select("id");
    expect(readRows ?? []).toHaveLength(0); // no grant → empty/denied
    const { error: writeErr } = await supaA
      .from("workflow_template_usage_events")
      .insert({ template_id: publicTemplateId, event_type: "used_to_create_workflow" });
    expect(writeErr).not.toBeNull();
  });

  it("service-role records a usage event and the counter trigger bumps usage_count", async () => {
    const a = sessions[0]!;
    const before = await admin.from("workflow_templates").select("usage_count").eq("id", publicTemplateId).single<{ usage_count: number }>();
    const { error } = await admin.from("workflow_template_usage_events").insert({
      template_id: publicTemplateId,
      actor_user_id: a.userId,
      target_account_id: a.accountId,
      event_type: "used_to_create_workflow",
    });
    expect(error).toBeNull();
    const after = await admin.from("workflow_templates").select("usage_count").eq("id", publicTemplateId).single<{ usage_count: number }>();
    expect(after.data!.usage_count).toBe(before.data!.usage_count + 1);
  });

  it("service-role 'forked' event bumps fork_count (not usage_count)", async () => {
    const before = await admin.from("workflow_templates").select("usage_count, fork_count").eq("id", officialTemplateId).single<{ usage_count: number; fork_count: number }>();
    const { error } = await admin.from("workflow_template_usage_events").insert({
      template_id: officialTemplateId,
      event_type: "forked",
    });
    expect(error).toBeNull();
    const after = await admin.from("workflow_templates").select("usage_count, fork_count").eq("id", officialTemplateId).single<{ usage_count: number; fork_count: number }>();
    expect(after.data!.fork_count).toBe(before.data!.fork_count + 1);
    expect(after.data!.usage_count).toBe(before.data!.usage_count); // unchanged
  });
});
