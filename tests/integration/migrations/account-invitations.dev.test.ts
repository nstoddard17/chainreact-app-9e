/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-15 — account_invitations table/RLS/index, live DB.
 * DESTRUCTIVE: creates + tears down throwaway auth users + their accounts/invites.
 * OPT-IN, triple-guarded.
 *
 * Proves:
 *   - role/status CHECKs accept valid values; partial unique index blocks a 2nd
 *     pending invite for the same (account, email); ON DELETE CASCADE clears
 *     invites with the account.
 *   - owner/admin SELECT RLS: an owner sees the account's invites; a non-member
 *     session sees none.
 *   - find_user_id_by_email resolves a known email and returns null for unknown.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/account-invitations.dev.test.ts
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
    "SKIP 4.ACCOUNT-MODEL-15 account_invitations — set ALLOW_DB_INTEGRATION_TESTS=true with URL + SERVICE_ROLE + ANON keys (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-15 — account_invitations (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();
  // createTrackedUser mints a per-user password; sessionClientFor looks it up by email.
  const passwords = new Map<string, string>();

  async function createUser(): Promise<{ userId: string; email: string }> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, "account-invites");
    passwords.set(email, password);
    return { userId, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Invite test team", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  async function insertInvite(accountId: string, email: string, tokenHash: string) {
    // Non-expiring (TEAM-INVITATION-LIFECYCLE-2): expires_at stays NULL,
    // which also proves the 20260804000000 DROP NOT NULL migration applied.
    return admin.from("account_invitations").insert({
      account_id: accountId, email, role: "member", token_hash: tokenHash,
    });
  }

  async function sessionClientFor(email: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  it("blocks a 2nd pending invite for the same (account,email); CASCADE clears on account delete", async () => {
    const { userId } = await createUser();
    const teamId = await createTeam(userId);

    const first = await insertInvite(teamId, "dup@example.com", `h-${Date.now()}-1`);
    expect(first.error).toBeNull();
    const second = await insertInvite(teamId, "DUP@example.com", `h-${Date.now()}-2`);
    expect(second.error).not.toBeNull(); // partial unique index (lower(email))

    // CASCADE: deleting the account removes its invites.
    await admin.from("account_billing").delete().eq("account_id", teamId);
    await admin.from("accounts").delete().eq("id", teamId);
    const after = await admin.from("account_invitations").select("id").eq("account_id", teamId);
    expect((after.data ?? []).length).toBe(0);
  });

  it("owner sees the account's invites via RLS; a non-member sees none", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const teamId = await createTeam(owner.userId);
    await insertInvite(teamId, "see@example.com", `h-rls-${Date.now()}`);

    const ownerSession = await sessionClientFor(owner.email);
    const ownerRead = await ownerSession.from("account_invitations").select("id").eq("account_id", teamId);
    expect(ownerRead.error).toBeNull();
    expect((ownerRead.data ?? []).length).toBe(1);

    const strangerSession = await sessionClientFor(stranger.email);
    const strangerRead = await strangerSession.from("account_invitations").select("id").eq("account_id", teamId);
    expect(strangerRead.error).toBeNull();
    expect((strangerRead.data ?? []).length).toBe(0);
  });

  it("replace_account_invitation is ATOMIC: a duplicate clash rolls back the revoke (old invite stays pending + usable)", async () => {
    const { userId } = await createUser();
    const teamId = await createTeam(userId);
    const stamp = Date.now();

    // Old pending invite A (the one being replaced) + an unrelated pending
    // invite B already occupying the target address.
    await insertInvite(teamId, `olda-${stamp}@example.com`, `h-a-${stamp}`);
    await insertInvite(teamId, `target-${stamp}@example.com`, `h-b-${stamp}`);
    const { data: rows } = await admin
      .from("account_invitations")
      .select("id, email")
      .eq("account_id", teamId);
    const oldId = (rows ?? []).find((r) => (r.email as string).startsWith("olda-"))!.id as string;

    // Replacing A's email to B's address must 23505 — and the whole
    // transaction (including A's revoke) must roll back.
    const clash = await admin.rpc("replace_account_invitation", {
      p_invitation_id: oldId,
      p_account_id: teamId,
      p_new_email: `target-${stamp}@example.com`,
      p_new_token_hash: `h-clash-${stamp}`,
      p_invited_by_user_id: userId,
      p_now: new Date().toISOString(),
    });
    expect(clash.error).not.toBeNull();
    const afterClash = await admin
      .from("account_invitations")
      .select("status")
      .eq("id", oldId)
      .single<{ status: string }>();
    expect(afterClash.data?.status).toBe("pending"); // rollback preserved it

    // Happy path: replacing to a FREE address commits both changes together —
    // old revoked, new pending with the SAME role and no expiry.
    const ok = await admin.rpc("replace_account_invitation", {
      p_invitation_id: oldId,
      p_account_id: teamId,
      p_new_email: `fresh-${stamp}@example.com`,
      p_new_token_hash: `h-fresh-${stamp}`,
      p_invited_by_user_id: userId,
      p_now: new Date().toISOString(),
    });
    expect(ok.error).toBeNull();
    const oldRow = await admin
      .from("account_invitations").select("status").eq("id", oldId).single<{ status: string }>();
    expect(oldRow.data?.status).toBe("revoked");
    const newRow = await admin
      .from("account_invitations")
      .select("status, role, expires_at")
      .eq("account_id", teamId)
      .eq("email", `fresh-${stamp}@example.com`)
      .single<{ status: string; role: string; expires_at: string | null }>();
    expect(newRow.data?.status).toBe("pending");
    expect(newRow.data?.role).toBe("member"); // preserved from the replaced row
    expect(newRow.data?.expires_at).toBeNull(); // non-expiring

    // A settled row refuses cleanly (typed error, nothing changed).
    const again = await admin.rpc("replace_account_invitation", {
      p_invitation_id: oldId,
      p_account_id: teamId,
      p_new_email: `another-${stamp}@example.com`,
      p_new_token_hash: `h-again-${stamp}`,
      p_invited_by_user_id: userId,
      p_now: new Date().toISOString(),
    });
    expect(again.error?.message ?? "").toContain("INVITATION_NOT_PENDING");
  });

  it("replace_account_invitation is service-role only — an authenticated session cannot execute it", async () => {
    const caller = await createUser();
    const session = await sessionClientFor(caller.email);
    const denied = await session.rpc("replace_account_invitation", {
      p_invitation_id: "00000000-0000-0000-0000-000000000000",
      p_account_id: "00000000-0000-0000-0000-000000000000",
      p_new_email: "x@example.com",
      p_new_token_hash: "h-denied",
      p_invited_by_user_id: caller.userId,
      p_now: new Date().toISOString(),
    });
    expect(denied.error).not.toBeNull(); // EXECUTE not granted to authenticated
  });

  it("find_user_id_by_email resolves a known email and returns null for unknown", async () => {
    const { userId, email } = await createUser();
    const known = await admin.rpc("find_user_id_by_email", { p_email: email.toUpperCase() });
    expect(known.error).toBeNull();
    expect(known.data).toBe(userId);

    const unknown = await admin.rpc("find_user_id_by_email", { p_email: "nobody-here@example.test" });
    expect(unknown.error).toBeNull();
    expect(unknown.data).toBeNull();
  });
});
