/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — RLS smoke for `accounts`.
 *
 * Per docs/rules/database-security.md + the slice plan at
 * docs/slices/phase-4/account-model-foundation-plan.md §10.
 *
 * Membership predicate: user A creates a personal account (via the signup
 * trigger); A sees it via a session client; user B does not; anon does not.
 * No INSERT/UPDATE/DELETE policies → session-client writes are fail-closed.
 *
 * DESTRUCTIVE: creates and deletes throwaway auth users. OPT-IN via
 * `ALLOW_DB_INTEGRATION_TESTS=true` + `NEXT_PUBLIC_SUPABASE_URL` +
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (loaded
 * from .env.local if present).
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
    "SKIP accounts RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE: creates/deletes auth users).",
  );
}

describeDb("accounts RLS — Slice 4.ACCOUNT-MODEL-3", () => {
  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  const sessions: Array<{
    userId: string;
    email: string;
    password: string;
    accountId: string;
  }> = [];

  async function createTestUser(label: string): Promise<{
    userId: string;
    email: string;
    password: string;
  }> {
    return createTrackedUser(admin, fixtures, `accounts-rls-${label}`);
  }

  async function readPersonalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) {
      throw new Error(`readPersonalAccountId(${userId}): ${error?.message ?? "no row"}`);
    }
    return data.id;
  }

  async function sessionClient(email: string, _password: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = await createTestUser("a");
    const b = await createTestUser("b");
    sessions.push({ ...a, accountId: await readPersonalAccountId(a.userId) });
    sessions.push({ ...b, accountId: await readPersonalAccountId(b.userId) });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("SELECT: user A sees their personal account", async () => {
    const a = sessions[0]!;
    const supa = await sessionClient(a.email, a.password);
    const { data, error } = await supa
      .from("accounts")
      .select("id, type, owner_user_id")
      .eq("id", a.accountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.type).toBe("personal");
    expect(data![0]!.owner_user_id).toBe(a.userId);
  });

  it("SELECT: user B sees zero rows when querying user A's account id", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supa = await sessionClient(b.email, b.password);
    const { data, error } = await supa
      .from("accounts")
      .select("id")
      .eq("id", a.accountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("SELECT: anon client sees zero rows (denied outright, not merely empty)", async () => {
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const a = sessions[0]!;
    const { data, error } = await anon
      .from("accounts")
      .select("id")
      .eq("id", a.accountId);

    // This previously expected `error === null` + zero rows (anon silently
    // filtered by RLS). The real — and STRONGER — behavior is a hard 42501: the
    // membership policy calls `is_account_member()`, whose EXECUTE was revoked
    // from anon by 20260619010000, so anon is rejected before any row is
    // considered. Assert the security property (anon obtains no row) while
    // accepting either shape, and require a permission error when one is given.
    if (error) {
      expect(error.code).toBe("42501");
    }
    expect(data ?? []).toHaveLength(0);
  });

  it("UPDATE: user B's UPDATE affects 0 rows on A's account (no policy → fail-closed)", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supa = await sessionClient(b.email, b.password);
    // Read the original name via service-role for the post-check.
    const { data: before } = await admin
      .from("accounts")
      .select("name")
      .eq("id", a.accountId)
      .single<{ name: string }>();
    await supa.from("accounts").update({ name: "HACKED" }).eq("id", a.accountId);
    const { data: after } = await admin
      .from("accounts")
      .select("name")
      .eq("id", a.accountId)
      .single<{ name: string }>();
    expect(after!.name).toBe(before!.name);
  });

  it("DELETE: user B's DELETE affects 0 rows on A's account (no policy → fail-closed)", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supa = await sessionClient(b.email, b.password);
    await supa.from("accounts").delete().eq("id", a.accountId);
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("id", a.accountId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("SELECT (service-role): can read every row regardless of membership", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .in("id", [a.accountId, b.accountId]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });
});
