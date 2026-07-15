/**
 * @jest-environment node
 *
 * Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-6 / CS-XT-8A — gated DB proof of the official template
 * seed: the rows exist, are platform-owned (source='official', account_id NULL, no author),
 * public, carry safe 'ChainReact' attribution, surface through the service-role marketplace
 * projection WITHOUT account_id / created_by_user_id, are readable by an authenticated user
 * (marketplace RLS), and are NOT readable by anon.
 *
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (seed migration applied).
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
  console.log("SKIP official-templates seed — set ALLOW_DB_INTEGRATION_TESTS=true with the Supabase keys.");
}

describeDb("official template seed — CS-XT-8A", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createTestUser() {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `official-seed-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { email, password };
  }
  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn: ${error.message}`);
    return c;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  });
  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.from("account_memberships").delete().eq("user_id", id);
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      for (const a of (accts ?? []) as Array<{ id: string }>) await admin.from("account_billing").delete().eq("account_id", a.id);
      await admin.from("accounts").delete().eq("owner_user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("seeded ≥5 official rows: platform-owned, public, safe attribution, no author", async () => {
    const { data, error } = await admin
      .from("workflow_templates")
      .select("id, account_id, created_by_user_id, source, visibility, creator_display_name_snapshot")
      .eq("source", "official");
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows as Array<Record<string, unknown>>) {
      expect(r.account_id).toBeNull();
      expect(r.created_by_user_id).toBeNull();
      expect(r.visibility).toBe("public");
      expect(r.creator_display_name_snapshot).toBe("ChainReact");
    }
  });

  it("an authenticated user can read an official template via marketplace RLS; anon cannot", async () => {
    const u = await createTestUser();
    const supa = await sessionClient(u.email, u.password);
    // a KEPT batch-4 template (batches 1–3 were retired by 20260715000000 / TEMPLATE-QUALITY-1).
    const id = "c0ffee00-0000-4000-8000-00000000004c";

    const { data: seen } = await supa.from("workflow_templates").select("id, source").eq("id", id);
    expect(seen).toHaveLength(1);
    expect((seen![0] as { source: string }).source).toBe("official");

    const anon = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: anonSeen } = await anon.from("workflow_templates").select("id").eq("id", id);
    expect(anonSeen ?? []).toHaveLength(0);
  });

  it("retired ≤4-node officials are gone (TEMPLATE-QUALITY-1 retirement applied)", async () => {
    // Spot-check the first/last retired ids (batch 1 …0001, batch 3 …004b): the retirement
    // migration deletes them, so no surface (marketplace, search, AI matcher) can list them.
    const retired = [
      "c0ffee00-0000-4000-8000-000000000001",
      "c0ffee00-0000-4000-8000-00000000004b",
    ];
    const { data, error } = await admin
      .from("workflow_templates")
      .select("id")
      .in("id", retired);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
