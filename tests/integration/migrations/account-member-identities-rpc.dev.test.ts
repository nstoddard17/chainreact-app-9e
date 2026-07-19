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

  /**
   * FIXTURE LIFECYCLE (deliberate — this suite used to leak).
   *
   * Every user and account is created in `beforeAll` and fully awaited there,
   * so no creation is ever in flight while a test runs. Previously each `it`
   * created its own users; when a test failed or timed out, jest moved on while
   * a `createUser` request was still outstanding, and the user landed in the DB
   * AFTER `afterAll` had already run — untracked, and only removable by the
   * global safety net.
   *
   * `teardownBegun` makes that failure mode impossible to reintroduce: any
   * attempt to mint a fixture once teardown has started throws immediately
   * rather than racing the cleanup.
   */
  let teardownBegun = false;

  async function createUser(
    userMetadata?: Record<string, unknown>,
  ): Promise<{ userId: string; email: string }> {
    if (teardownBegun) {
      throw new Error("createUser called after teardown began — fixtures must be built in beforeAll");
    }
    // createTrackedUser registers the id before it can throw, so even a
    // partially-created user is torn down.
    const { userId, email } = await createTrackedUser(admin, fixtures, "member-identities");
    if (userMetadata) {
      const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: userMetadata });
      if (error) throw new Error(`createUser metadata: ${error.message}`);
    }
    return { userId, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    if (teardownBegun) {
      throw new Error("createTeam called after teardown began — fixtures must be built in beforeAll");
    }
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Identity test", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  /**
   * Authenticated session WITHOUT `signInWithPassword`.
   *
   * The project enforces CAPTCHA on password sign-in, so the old helper failed
   * every test here — and those failures are what made the fixture race fire.
   * `signedInClient` redeems a service-role-minted email link instead, which is
   * not CAPTCHA-gated. The resulting session is an ordinary authenticated
   * session: RLS and the RPC's SECURITY DEFINER member check still apply in
   * full, so the authorization coverage below is unchanged.
   */
  async function sessionFor(email: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL as string, anonKey: ANON_KEY as string, admin, email });
  }

  // Fixtures for all three cases, built once. Sessions are established here too,
  // so the tests themselves perform no fixture I/O at all.
  let team1 = "";
  let owner1 = { userId: "", email: "" };
  let member1 = { userId: "", email: "" };
  let owner1Session: SupabaseClient;

  let team2 = "";
  let owner2 = { userId: "", email: "" };
  let owner2Session: SupabaseClient;

  let team3 = "";
  let strangerSession: SupabaseClient;

  beforeAll(async () => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Case 1 — co-member visibility. Owner has a profile display_name; the
    // member deliberately does not, so its display_name stays null.
    owner1 = await createUser();
    member1 = await createUser();
    team1 = await createTeam(owner1.userId);
    await admin
      .from("account_memberships")
      .insert({ account_id: team1, user_id: member1.userId, role: "member" });
    await admin.from("user_profiles").update({ display_name: "Ada Owner" }).eq("id", owner1.userId);
    owner1Session = await sessionFor(owner1.email);

    // Case 2 — metadata fallback. No profile display_name, but an OAuth-style
    // full_name in auth metadata.
    owner2 = await createUser({ full_name: "Dana Metadata" });
    team2 = await createTeam(owner2.userId);
    owner2Session = await sessionFor(owner2.email);

    // Case 3 — non-member probe against an account they do not belong to.
    const owner3 = await createUser();
    const stranger = await createUser();
    team3 = await createTeam(owner3.userId);
    strangerSession = await sessionFor(stranger.email);
  });

  afterAll(async () => {
    // Set FIRST: from here on, any stray fixture call fails loudly instead of
    // creating a row that teardown has already walked past.
    teardownBegun = true;
    await cleanupFixtures(admin, fixtures);
  });

  it("a co-member sees every member's email + display_name", async () => {
    const { data, error } = await owner1Session.rpc("get_account_member_identities", {
      p_account_id: team1,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as IdentityRow[];
    expect(rows.length).toBe(2);

    const ownerRow = rows.find((r) => r.user_id === owner1.userId)!;
    const memberRow = rows.find((r) => r.user_id === member1.userId)!;
    expect(ownerRow.email).toBe(owner1.email);
    expect(ownerRow.display_name).toBe("Ada Owner");
    expect(memberRow.email).toBe(member1.email);
    expect(memberRow.display_name).toBeNull();
  });

  it("falls back to auth metadata full_name/name when display_name is unset", async () => {
    const { data, error } = await owner2Session.rpc("get_account_member_identities", {
      p_account_id: team2,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as IdentityRow[];
    const ownerRow = rows.find((r) => r.user_id === owner2.userId)!;
    expect(ownerRow.display_name).toBe("Dana Metadata");
  });

  it("a NON-member gets an error and zero rows (no email leak)", async () => {
    const { data, error } = await strangerSession.rpc("get_account_member_identities", {
      p_account_id: team3,
    });
    // SECURITY DEFINER raises 42501 for a non-member; supabase surfaces it as error.
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it("fixture minting is refused once teardown has begun", async () => {
    // Guards the exact race that made this suite leak: a creation call that
    // outlives teardown must fail, not quietly insert an untracked row.
    const wasBegun = teardownBegun;
    teardownBegun = true;
    try {
      await expect(createUser()).rejects.toThrow(/after teardown began/);
      await expect(createTeam(owner1.userId)).rejects.toThrow(/after teardown began/);
    } finally {
      teardownBegun = wasBegun;
    }
  });
});
