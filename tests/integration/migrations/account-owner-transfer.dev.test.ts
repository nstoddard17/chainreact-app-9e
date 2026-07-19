/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-2 / TL-1 — team/org owner invariants +
 * transfer RPC, live DB. DESTRUCTIVE: creates + tears down throwaway auth users
 * + their accounts. OPT-IN, triple-guarded.
 *
 * Proves:
 *   - an ACTIVE team/org account cannot drop its last owner (direct DELETE or
 *     demotion UPDATE) — the >=1-owner trigger blocks it;
 *   - accounts.owner_user_id cannot be repointed to a non-owner member;
 *   - transfer_account_ownership atomically promotes the target to owner,
 *     demotes the old owner to admin, and repoints owner_user_id;
 *   - the RPC rejects a non-member target;
 *   - the personal-account invariant is unchanged;
 *   - an authenticated (Data API) session cannot execute the transfer RPC.
 *
 * Requires this migration to be applied (npm run db:push) before running.
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/account-owner-transfer.dev.test.ts
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
    "SKIP TL-1 owner transfer — set ALLOW_DB_INTEGRATION_TESTS=true with URL + SERVICE_ROLE + ANON keys (DESTRUCTIVE; migration must be pushed).",
  );
}

describeDb("TL-1 — owner invariants + transfer RPC (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  // createTrackedUser mints a per-user password; sessionFor looks it up by email.
  const passwords = new Map<string, string>();

  async function createUser(): Promise<{ userId: string; email: string }> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, "owner-transfer");
    passwords.set(email, password);
    return { userId, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Transfer test", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  async function addMember(teamId: string, userId: string, role: "admin" | "member"): Promise<void> {
    const { error } = await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: userId, role });
    if (error) throw new Error(`addMember: ${error.message}`);
  }

  async function roleOf(teamId: string, userId: string): Promise<string | null> {
    const { data } = await admin
      .from("account_memberships")
      .select("role")
      .eq("account_id", teamId)
      .eq("user_id", userId)
      .maybeSingle<{ role: string }>();
    return data?.role ?? null;
  }

  async function ownerOf(teamId: string): Promise<string | null> {
    const { data } = await admin
      .from("accounts")
      .select("owner_user_id")
      .eq("id", teamId)
      .maybeSingle<{ owner_user_id: string }>();
    return data?.owner_user_id ?? null;
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

  it("cannot DELETE the last owner membership of an active team", async () => {
    const owner = await createUser();
    const teamId = await createTeam(owner.userId);
    const res = await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", teamId)
      .eq("user_id", owner.userId);
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/team_owner_invariant_violation/);
    // Still present.
    expect(await roleOf(teamId, owner.userId)).toBe("owner");
  });

  it("cannot demote the last owner away from owner", async () => {
    const owner = await createUser();
    const teamId = await createTeam(owner.userId);
    const res = await admin
      .from("account_memberships")
      .update({ role: "admin" })
      .eq("account_id", teamId)
      .eq("user_id", owner.userId);
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/team_owner_invariant_violation/);
    expect(await roleOf(teamId, owner.userId)).toBe("owner");
  });

  it("cannot repoint owner_user_id to a non-owner member", async () => {
    const owner = await createUser();
    const member = await createUser();
    const teamId = await createTeam(owner.userId);
    await addMember(teamId, member.userId, "member");
    const res = await admin
      .from("accounts")
      .update({ owner_user_id: member.userId })
      .eq("id", teamId);
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/owner_consistency_violation/);
    expect(await ownerOf(teamId)).toBe(owner.userId);
  });

  it("transfer RPC promotes the target to owner, demotes the old owner to admin, repoints owner_user_id", async () => {
    const owner = await createUser();
    const member = await createUser();
    const teamId = await createTeam(owner.userId);
    await addMember(teamId, member.userId, "member");

    const res = await admin.rpc("transfer_account_ownership", {
      p_account_id: teamId,
      p_current_owner_user_id: owner.userId,
      p_target_user_id: member.userId,
    });
    expect(res.error).toBeNull();
    expect(await roleOf(teamId, member.userId)).toBe("owner");
    expect(await roleOf(teamId, owner.userId)).toBe("admin");
    expect(await ownerOf(teamId)).toBe(member.userId);
  });

  it("transfer RPC rejects a non-member target", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const teamId = await createTeam(owner.userId);
    const res = await admin.rpc("transfer_account_ownership", {
      p_account_id: teamId,
      p_current_owner_user_id: owner.userId,
      p_target_user_id: stranger.userId,
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/transfer_account_ownership_error/);
    expect(await ownerOf(teamId)).toBe(owner.userId);
  });

  it("transfer RPC rejects a current-owner mismatch", async () => {
    const owner = await createUser();
    const member = await createUser();
    const teamId = await createTeam(owner.userId);
    await addMember(teamId, member.userId, "member");
    const res = await admin.rpc("transfer_account_ownership", {
      p_account_id: teamId,
      p_current_owner_user_id: member.userId, // not the real owner
      p_target_user_id: member.userId,
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/current owner mismatch/i);
  });

  it("the personal-account invariant is unchanged (still rejects a second / non-owner membership)", async () => {
    const owner = await createUser();
    const other = await createUser();
    const { data: personal } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", owner.userId)
      .eq("type", "personal")
      .single<{ id: string }>();
    const res = await admin
      .from("account_memberships")
      .insert({ account_id: personal!.id, user_id: other.userId, role: "member" });
    expect(res.error).not.toBeNull();
    expect(res.error?.message ?? "").toMatch(/personal_invariant_violation/);
  });

  it("an authenticated (Data API) session cannot execute the transfer RPC", async () => {
    const owner = await createUser();
    const member = await createUser();
    const teamId = await createTeam(owner.userId);
    await addMember(teamId, member.userId, "member");

    const ownerSession = await sessionFor(owner.email);
    const res = await ownerSession.rpc("transfer_account_ownership", {
      p_account_id: teamId,
      p_current_owner_user_id: owner.userId,
      p_target_user_id: member.userId,
    });
    // service_role-only grant → PostgREST denies the authenticated caller.
    expect(res.error).not.toBeNull();
    // And nothing changed.
    expect(await ownerOf(teamId)).toBe(owner.userId);
  });

  it("account teardown still cascades the last owner membership (cascade-safe trigger)", async () => {
    const owner = await createUser();
    const teamId = await createTeam(owner.userId);
    // Direct account delete (active, not frozen) must succeed and cascade the
    // owner membership — the trigger allows it because the parent is gone.
    const res = await admin.from("accounts").delete().eq("id", teamId);
    expect(res.error).toBeNull();
    const { data } = await admin
      .from("account_memberships")
      .select("user_id")
      .eq("account_id", teamId);
    expect((data ?? []).length).toBe(0);
  });
});
