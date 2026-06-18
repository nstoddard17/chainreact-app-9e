/**
 * @jest-environment node
 *
 * Slice ANALYTICS-1 — gated DB proof that analytics_dashboards is account-scoped
 * and write-locked:
 *   - an account MEMBER can SELECT their account's dashboards (session client),
 *   - a NON-member sees nothing (no cross-account leak / existence oracle),
 *   - authenticated has NO write grant → a direct INSERT is denied,
 *   - the one-default-per-account unique index rejects a second default.
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE key.
 * Mirrors tests/integration/security/workflow-run-stats-account.test.ts.
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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RUN = ALLOW && !!URL && !!SERVICE_KEY && !!ANON_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP analytics_dashboards account scope — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("analytics_dashboards account scoping — ANALYTICS-1", () => {
  let admin: SupabaseClient;
  const users: { id: string; email: string; password: string; personalId: string }[] = [];

  async function makeUser(tag: string) {
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `analytics-${tag}-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    const { data: pa } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", data.user.id).single<{ id: string }>();
    const u = { id: data.user.id, email, password, personalId: pa!.id };
    users.push(u);
    return u;
  }

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  let ownerDashId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const owner = await makeUser("owner");
    await makeUser("other");
    // Seed a dashboard for the owner's personal account via service-role.
    const { data, error } = await admin
      .from("analytics_dashboards")
      .insert({ account_id: owner.personalId, created_by_user_id: owner.id, name: "Overview", position: 0, is_default: true, widgets: [] })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`seed dashboard: ${error?.message ?? "no row"}`);
    ownerDashId = data.id;
  });

  afterAll(async () => {
    if (!admin || users.length === 0) return;
    const accountIds = users.map((u) => u.personalId);
    await admin.from("analytics_dashboards").delete().in("account_id", accountIds);
    await admin.from("account_billing").delete().in("account_id", accountIds);
    await admin.from("account_memberships").delete().in("user_id", users.map((u) => u.id));
    await admin.from("accounts").delete().in("owner_user_id", users.map((u) => u.id));
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  });

  it("a member SELECTs their own account's dashboards", async () => {
    const owner = users[0]!;
    const supa = await sessionClient(owner.email, owner.password);
    const r = await supa.from("analytics_dashboards").select("id,name").eq("account_id", owner.personalId);
    expect(r.error).toBeNull();
    expect((r.data ?? []).map((d) => (d as { id: string }).id)).toContain(ownerDashId);
  });

  it("a NON-member sees nothing for another account (no leak / oracle)", async () => {
    const other = users[1]!;
    const owner = users[0]!;
    const supa = await sessionClient(other.email, other.password);
    const r = await supa.from("analytics_dashboards").select("id").eq("account_id", owner.personalId);
    expect(r.error).toBeNull();
    expect(r.data ?? []).toHaveLength(0);
  });

  it("authenticated has NO write grant — a direct INSERT is denied", async () => {
    const owner = users[0]!;
    const supa = await sessionClient(owner.email, owner.password);
    const r = await supa
      .from("analytics_dashboards")
      .insert({ account_id: owner.personalId, name: "Hacked", position: 99, is_default: false, widgets: [] });
    expect(r.error).not.toBeNull();
    // Permission denied (no GRANT) — surfaced as 42501 (or PostgREST 401/403 shape).
    expect(r.error!.code === "42501" || r.status === 401 || r.status === 403).toBe(true);
  });

  it("the one-default-per-account unique index rejects a second default", async () => {
    const owner = users[0]!;
    const r = await admin
      .from("analytics_dashboards")
      .insert({ account_id: owner.personalId, created_by_user_id: owner.id, name: "Overview 2", position: 1, is_default: true, widgets: [] });
    expect(r.error).not.toBeNull();
    expect(r.error!.code).toBe("23505");
  });
});
