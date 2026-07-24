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
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();
  const users: { id: string; email: string; password: string; personalId: string }[] = [];

  async function makeUser(tag: string) {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `analytics-${tag}`);
    const { data: pa } = await admin
      .from("accounts").select("id").eq("type", "personal").eq("owner_user_id", userId).single<{ id: string }>();
    const u = { id: userId, email, password, personalId: pa!.id };
    users.push(u);
    return u;
  }

  async function sessionClient(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  let ownerDashId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["analytics_dashboards"]);
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
    await cleanupFixtures(admin, fixtures);
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
