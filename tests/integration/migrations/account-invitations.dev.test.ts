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
  const createdUserIds: string[] = [];
  const password = `Pw-${Math.random().toString(36).slice(2)}!`;

  async function createUser(): Promise<{ userId: string; email: string }> {
    const email = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chainreact.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Invite test team", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  async function insertInvite(accountId: string, email: string, tokenHash: string) {
    return admin.from("account_invitations").insert({
      account_id: accountId, email, role: "member", token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
  }

  async function sessionClientFor(email: string): Promise<SupabaseClient> {
    const client = createClient(URL as string, ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signIn: ${error.message}`);
    return client;
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", id);
      const ids = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (ids.length) {
        await admin.from("account_invitations").delete().in("account_id", ids);
        await admin.from("account_billing").delete().in("account_id", ids);
        await admin.from("accounts").delete().in("id", ids); // cascades memberships
      }
      await admin.auth.admin.deleteUser(id);
    }
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
