/**
 * @jest-environment node
 *
 * Slice 4.TEAM-PAGE-2 — get_account_member_identities RPC, live DB.
 * DESTRUCTIVE: creates + tears down throwaway auth users + their accounts.
 * OPT-IN, triple-guarded (mirrors the D2b co-member RLS dev test).
 *
 * Proves:
 *   - a member sees safe display identity (userId + email + display_name) for
 *     EVERY co-member of an account they belong to.
 *   - a NON-member calling the RPC for that account gets an error and NO rows —
 *     emails never leak outside the account.
 *   - display_name comes through (when set) and is null when unset.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/account-member-identities-rpc.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupFixtures, createFixtureTracker, createTrackedUser } from "@/tests/helpers/dbFixtureCleanup";

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
    "SKIP 4.TEAM-PAGE-2 member-identities RPC — set ALLOW_DB_INTEGRATION_TESTS=true with URL + SERVICE_ROLE + ANON keys (DESTRUCTIVE).",
  );
}

interface IdentityRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

describeDb("4.TEAM-PAGE-2 — get_account_member_identities (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  // createTrackedUser mints a per-user password; sessionFor looks it up by email.
  const passwords = new Map<string, string>();

  async function createUser(
    userMetadata?: Record<string, unknown>,
  ): Promise<{ userId: string; email: string }> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, "member-identities");
    passwords.set(email, password);
    if (userMetadata) {
      const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: userMetadata });
      if (error) throw new Error(`createUser metadata: ${error.message}`);
    }
    return { userId, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Identity test", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  async function sessionFor(email: string): Promise<SupabaseClient> {
    const client = createClient(URL as string, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password: passwords.get(email) ?? "" });
    if (error) throw new Error(`signIn: ${error.message}`);
    return client;
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("a co-member sees every member's email + display_name", async () => {
    const owner = await createUser();
    const member = await createUser();
    const teamId = await createTeam(owner.userId);
    await admin.from("account_memberships").insert({ account_id: teamId, user_id: member.userId, role: "member" });
    // Owner set a display_name; member did not (stays null).
    await admin.from("user_profiles").update({ display_name: "Ada Owner" }).eq("id", owner.userId);

    const ownerSession = await sessionFor(owner.email);
    const { data, error } = await ownerSession.rpc("get_account_member_identities", { p_account_id: teamId });
    expect(error).toBeNull();
    const rows = (data ?? []) as IdentityRow[];
    expect(rows.length).toBe(2);

    const ownerRow = rows.find((r) => r.user_id === owner.userId)!;
    const memberRow = rows.find((r) => r.user_id === member.userId)!;
    expect(ownerRow.email).toBe(owner.email);
    expect(ownerRow.display_name).toBe("Ada Owner");
    expect(memberRow.email).toBe(member.email);
    expect(memberRow.display_name).toBeNull();
  });

  it("falls back to auth metadata full_name/name when display_name is unset", async () => {
    // Owner has no profile display_name but DOES carry an OAuth-style full_name.
    const owner = await createUser({ full_name: "Dana Metadata" });
    const teamId = await createTeam(owner.userId);

    const ownerSession = await sessionFor(owner.email);
    const { data, error } = await ownerSession.rpc("get_account_member_identities", { p_account_id: teamId });
    expect(error).toBeNull();
    const rows = (data ?? []) as IdentityRow[];
    const ownerRow = rows.find((r) => r.user_id === owner.userId)!;
    expect(ownerRow.display_name).toBe("Dana Metadata");
  });

  it("a NON-member gets an error and zero rows (no email leak)", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const teamId = await createTeam(owner.userId);

    const strangerSession = await sessionFor(stranger.email);
    const { data, error } = await strangerSession.rpc("get_account_member_identities", { p_account_id: teamId });
    // SECURITY DEFINER raises 42501 for a non-member; supabase surfaces it as error.
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
