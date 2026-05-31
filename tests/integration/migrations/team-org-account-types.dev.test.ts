/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-13 — type/role CHECK relaxations, live DB.
 * DESTRUCTIVE: creates + tears down throwaway auth users + their accounts.
 * OPT-IN, triple-guarded.
 *
 * Proves:
 *   - accounts.type accepts 'team' and 'organization' (and still rejects garbage).
 *   - account_memberships.role accepts 'admin'/'member' ON A NON-PERSONAL account
 *     (and still rejects garbage).
 *   - the personal-account invariants trigger STILL rejects a wrong-user / non-
 *     owner membership on a personal account (stable error prefix).
 *
 * Run: ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/migrations/team-org-account-types.dev.test.ts
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
const RUN = ALLOW && !!URL && !!SERVICE_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP 4.ACCOUNT-MODEL-13 type/role CHECKs — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE).",
  );
}

describeDb("4.ACCOUNT-MODEL-13 — type/role CHECK relaxations (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  async function createUser(): Promise<string> {
    const slug = `tor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function personalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function insertAccount(type: string, ownerUserId: string) {
    return admin
      .from("accounts")
      .insert({ type, name: `${type} acct`, owner_user_id: ownerUserId })
      .select("id")
      .single<{ id: string }>();
  }

  beforeAll(() => {
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdUserIds) {
      const { data: accts } = await admin
        .from("accounts")
        .select("id")
        .eq("owner_user_id", id);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (accountIds.length > 0) {
        await admin.from("account_billing").delete().in("account_id", accountIds);
        await admin.from("accounts").delete().in("id", accountIds); // cascades memberships
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("accounts.type accepts 'team' and 'organization', rejects garbage", async () => {
    const userId = await createUser();
    const team = await insertAccount("team", userId);
    expect(team.error).toBeNull();
    const org = await insertAccount("organization", userId);
    expect(org.error).toBeNull();
    const bogus = await insertAccount("workspace", userId);
    expect(bogus.error).not.toBeNull(); // CHECK violation
  });

  it("account_memberships.role accepts 'admin'/'member' on a team, rejects garbage", async () => {
    const owner = await createUser();
    const member = await createUser();
    const team = await insertAccount("team", owner);
    expect(team.error).toBeNull();
    const teamId = team.data!.id;

    const adminRow = await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: owner, role: "admin" });
    expect(adminRow.error).toBeNull();

    const memberRow = await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: member, role: "member" });
    expect(memberRow.error).toBeNull();

    const bogus = await admin
      .from("account_memberships")
      .insert({ account_id: teamId, user_id: member, role: "superuser" });
    expect(bogus.error).not.toBeNull(); // CHECK violation
  });

  it("personal-account invariants STILL reject a wrong-user / non-owner membership", async () => {
    const ownerA = await createUser();
    const otherB = await createUser();
    const personalA = await personalAccountId(ownerA);

    // Wrong user on a personal account → trigger violation.
    const wrongUser = await admin
      .from("account_memberships")
      .insert({ account_id: personalA, user_id: otherB, role: "owner" });
    expect(wrongUser.error?.message ?? "").toMatch(
      /account_memberships_personal_invariant_violation/,
    );

    // Non-owner role on a personal account → trigger violation.
    const nonOwner = await admin
      .from("account_memberships")
      .insert({ account_id: personalA, user_id: ownerA, role: "admin" });
    expect(nonOwner.error?.message ?? "").toMatch(
      /account_memberships_personal_invariant_violation/,
    );
  });
});
