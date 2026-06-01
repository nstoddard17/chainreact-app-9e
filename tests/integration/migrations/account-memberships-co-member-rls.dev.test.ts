/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-16 — co-member membership RLS, live DB.
 * DESTRUCTIVE: creates + tears down throwaway auth users + their accounts.
 * OPT-IN, triple-guarded.
 *
 * Proves:
 *   - a member (owner OR member role) sees EVERY membership row of accounts they
 *     belong to (co-member visibility); a non-member sees none.
 *   - is_account_member() returns true for a member's session, false otherwise,
 *     without infinite-recursion errors.
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/account-memberships-co-member-rls.dev.test.ts
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
    "SKIP 4.ACCOUNT-MODEL-16 co-member RLS — set ALLOW_DB_INTEGRATION_TESTS=true with URL + SERVICE_ROLE + ANON keys (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-16 — co-member RLS (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const password = `Pw-${Math.random().toString(36).slice(2)}!`;

  async function createUser(): Promise<{ userId: string; email: string }> {
    const email = `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chainreact.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return { userId: data.user.id, email };
  }

  async function createTeam(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Co-member test", owner_user_id: ownerId })
      .select("id").single<{ id: string }>();
    if (error || !data) throw new Error(`createTeam: ${error?.message ?? "no row"}`);
    await admin.from("account_memberships").insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    return data.id;
  }

  async function sessionFor(email: string): Promise<SupabaseClient> {
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
        await admin.from("account_billing").delete().in("account_id", ids);
        await admin.from("accounts").delete().in("id", ids); // cascades memberships
      }
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("a member (owner or member) sees all co-members; a non-member sees none", async () => {
    const owner = await createUser();
    const member = await createUser();
    const stranger = await createUser();
    const teamId = await createTeam(owner.userId);
    await admin.from("account_memberships").insert({ account_id: teamId, user_id: member.userId, role: "member" });

    const ownerSession = await sessionFor(owner.email);
    const ownerRows = await ownerSession.from("account_memberships").select("user_id, role").eq("account_id", teamId);
    expect(ownerRows.error).toBeNull();
    expect((ownerRows.data ?? []).length).toBe(2); // owner + member

    const memberSession = await sessionFor(member.email);
    const memberRows = await memberSession.from("account_memberships").select("user_id, role").eq("account_id", teamId);
    expect(memberRows.error).toBeNull();
    expect((memberRows.data ?? []).length).toBe(2); // co-member sees both

    const strangerSession = await sessionFor(stranger.email);
    const strangerRows = await strangerSession.from("account_memberships").select("user_id").eq("account_id", teamId);
    expect(strangerRows.error).toBeNull();
    expect((strangerRows.data ?? []).length).toBe(0);
  });

  it("is_account_member() returns true for a member, false for a non-member (no recursion)", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const teamId = await createTeam(owner.userId);

    const ownerSession = await sessionFor(owner.email);
    const isMember = await ownerSession.rpc("is_account_member", { p_account_id: teamId });
    expect(isMember.error).toBeNull();
    expect(isMember.data).toBe(true);

    const strangerSession = await sessionFor(stranger.email);
    const notMember = await strangerSession.rpc("is_account_member", { p_account_id: teamId });
    expect(notMember.error).toBeNull();
    expect(notMember.data).toBe(false);
  });
});
