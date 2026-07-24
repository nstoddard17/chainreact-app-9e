/**
 * @jest-environment node
 *
 * Slice ANALYTICS-SOURCES-CACHE-1 — gated DB proof of analytics_source_snapshots
 * isolation:
 *   - an account-shared snapshot (source_user_id NULL) is readable by any member,
 *   - a PERSONAL snapshot (source_user_id = A) is readable by A but NOT by a
 *     co-member B (personal-credential cache never leaks account-wide),
 *   - a non-member sees nothing,
 *   - authenticated has NO write grant (direct INSERT denied).
 *
 * DESTRUCTIVE / OPT-IN — ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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
    "SKIP analytics_source_snapshots isolation — set ALLOW_DB_INTEGRATION_TESTS=true with URL + ANON + SERVICE keys.",
  );
}

describeDb("analytics_source_snapshots isolation — ANALYTICS-SOURCES-CACHE-1", () => {
  let admin: SupabaseClient;
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();
  const users: { id: string; email: string; password: string }[] = [];
  let teamId = "";

  async function makeUser(tag: string) {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `snap-${tag}`);
    const u = { id: userId, email, password };
    users.push(u);
    return u;
  }

  async function session(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  async function insertSnapshot(cacheKey: string, sourceUserId: string | null) {
    const now = Date.now();
    const { error } = await admin.from("analytics_source_snapshots").insert({
      account_id: teamId,
      source_user_id: sourceUserId,
      provider_key: "github",
      metric_key: "open_issues",
      range_key: "2026-06-01..2026-06-08",
      group_by: null,
      filters_hash: "h",
      cache_key: cacheKey,
      result: { shape: "scalar", dimensions: [], measures: ["x"], rows: [{ x: 1 }], generatedAt: new Date(now).toISOString(), freshness: { cached: false, ageSeconds: 0, ttlSeconds: 600 }, warnings: [], truncated: false },
      generated_at: new Date(now).toISOString(),
      expires_at: new Date(now + 3_600_000).toISOString(),
    });
    if (error) throw new Error(`insertSnapshot: ${error.message}`);
  }

  const SHARED_KEY = `shared-${Date.now()}`;
  const PERSONAL_A_KEY = `personalA-${Date.now()}`;

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["analytics_source_snapshots"]);
    const a = await makeUser("owner");
    const b = await makeUser("member");
    await makeUser("outsider");
    const { data: team } = await admin
      .from("accounts").insert({ type: "team", name: `Snap Team ${Date.now()}`, owner_user_id: a.id })
      .select("id").single<{ id: string }>();
    teamId = team!.id;
    fixtures.trackAccount(teamId);
    await admin.from("account_memberships").insert([
      { account_id: teamId, user_id: a.id, role: "owner" },
      { account_id: teamId, user_id: b.id, role: "member" },
    ]);
    await insertSnapshot(SHARED_KEY, null);
    await insertSnapshot(PERSONAL_A_KEY, a.id);
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("a member reads the account-shared snapshot", async () => {
    const supa = await session(users[1]!.email, users[1]!.password); // member B
    const r = await supa.from("analytics_source_snapshots").select("cache_key").eq("cache_key", SHARED_KEY);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBe(1);
  });

  it("a co-member CANNOT read another member's personal snapshot (isolation)", async () => {
    const supa = await session(users[1]!.email, users[1]!.password); // member B
    const r = await supa.from("analytics_source_snapshots").select("cache_key").eq("cache_key", PERSONAL_A_KEY);
    expect(r.error).toBeNull();
    expect(r.data ?? []).toHaveLength(0);
  });

  it("the owner reads their own personal snapshot", async () => {
    const supa = await session(users[0]!.email, users[0]!.password); // owner A
    const r = await supa.from("analytics_source_snapshots").select("cache_key").eq("cache_key", PERSONAL_A_KEY);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBe(1);
  });

  it("a non-member sees nothing", async () => {
    const supa = await session(users[2]!.email, users[2]!.password); // outsider C
    const r = await supa.from("analytics_source_snapshots").select("cache_key").in("cache_key", [SHARED_KEY, PERSONAL_A_KEY]);
    expect(r.error).toBeNull();
    expect(r.data ?? []).toHaveLength(0);
  });

  it("authenticated has NO write grant — direct INSERT denied", async () => {
    const supa = await session(users[0]!.email, users[0]!.password);
    const r = await supa.from("analytics_source_snapshots").insert({
      account_id: teamId, provider_key: "github", metric_key: "open_issues",
      range_key: "r", filters_hash: "h", cache_key: `hack-${Date.now()}`,
      result: {}, generated_at: new Date().toISOString(), expires_at: new Date().toISOString(),
    });
    expect(r.error).not.toBeNull();
    expect(r.error!.code === "42501" || r.status === 401 || r.status === 403).toBe(true);
  });
});
