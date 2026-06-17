/**
 * @jest-environment node
 *
 * Slice 4.SECURITY-INTEGRATIONS-RLS — gated DB proof of the `integrations`
 * table's account-membership RLS + no-cleartext-at-rest posture, ahead of
 * live OAuth testing.
 *
 * Post 4.ACCOUNT-MODEL-6 cutover, `integrations` is account-owned: RLS gates
 * read/write by membership in the owning account (policies
 * integrations_{select,insert,update,delete}_account_member in
 * 20260530000001_account_id_foundation.sql; the legacy user_id policies were
 * dropped in 20260530000002). This test proves, against a live DB, that:
 *   - a member reads their own account's integrations (personal + team),
 *   - a NON-member cannot read another account's integrations,
 *   - personal/team separation: joining a team account grants read; a
 *     stranger still sees nothing,
 *   - cross-account UPDATE / DELETE by a non-member are no-ops (RLS-filtered),
 *   - anon sees nothing,
 *   - service-role still reads every row (engine path), and
 *   - the stored *_encrypted columns are opaque — they contain NONE of the
 *     fixture plaintext token patterns, yet decrypt back to the fixtures.
 *
 * NO real tokens are used or printed — fixtures are obvious fakes assembled at
 * runtime (never a literal token-shaped string in source), and only their
 * ABSENCE from the stored ciphertext is asserted.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + integrations.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + a
 * TOKEN_ENCRYPTION_KEY (migrations applied). Mirrors the gating used by the
 * other tests/integration/security/*.test.ts files.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/core/encryption/tokens";

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
const HAS_ENC_KEY = !!process.env.TOKEN_ENCRYPTION_KEY;
const RUN = ALLOW && !!URL && !!ANON_KEY && !!SERVICE_KEY && HAS_ENC_KEY;
const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP integrations RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + TOKEN_ENCRYPTION_KEY.",
  );
}

// Obvious-fake token plaintext (never real). The at-rest assertion proves the
// stored ciphertext contains NONE of these literals nor their prefixes.
const FAKE_ACCESS_PLAINTEXT = (["xoxb", "FAKE", "1111", "2222", "DoNotStorePlaintext"].join("-"));
const FAKE_REFRESH_PLAINTEXT = "ya29.FAKE-refresh-DoNotStorePlaintext";
const CLEARTEXT_PATTERNS = [
  "xoxb-",
  "xoxp-",
  "gho_",
  "ghp_",
  "sk_live_",
  "sk_test_",
  "whsec_",
  "ya29.",
  FAKE_ACCESS_PLAINTEXT,
  FAKE_REFRESH_PLAINTEXT,
] as const;

describeDb("integrations table — account-membership RLS + no-cleartext-at-rest", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const createdAccountIds: string[] = [];

  type Session = {
    userId: string;
    email: string;
    password: string;
    personalAccountId: string;
  };
  const sessions: Session[] = [];
  let teamAccountId = "";
  // ids of seeded integration rows, for assertions.
  let personalAIntegrationId = "";
  let teamIntegrationId = "";

  async function createTestUser(label: string): Promise<Session> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `integrations-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    const personalAccountId = await personalAccountIdFor(data.user.id);
    return { userId: data.user.id, email, password, personalAccountId };
  }

  async function personalAccountIdFor(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`personalAccountIdFor: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  /** Service-role insert of an active integration with ENCRYPTED token columns. */
  async function seedIntegration(
    accountId: string,
    connectedByUserId: string,
    provider: string,
    providerAccountId: string,
  ): Promise<string> {
    const { data, error } = await admin
      .from("integrations")
      .insert({
        account_id: accountId,
        connected_by_user_id: connectedByUserId,
        provider,
        provider_account_id: providerAccountId,
        display_name: `${provider} test`,
        access_token_encrypted: encryptToken(FAKE_ACCESS_PLAINTEXT),
        refresh_token_encrypted: encryptToken(FAKE_REFRESH_PLAINTEXT),
        scopes: ["read", "write"],
        account_metadata: {},
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedIntegration: ${error?.message ?? "no row"}`);
    return data.id;
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const a = await createTestUser("a");
    const b = await createTestUser("b");
    sessions.push(a, b);

    // Team account owned by A; A is its only member at seed time.
    const { data: team, error: teamErr } = await admin
      .from("accounts")
      .insert({ type: "team", name: "Integrations RLS team", owner_user_id: a.userId })
      .select("id")
      .single<{ id: string }>();
    if (teamErr || !team) throw new Error(`seed team account: ${teamErr?.message ?? "no row"}`);
    teamAccountId = team.id;
    createdAccountIds.push(team.id);
    await admin
      .from("account_memberships")
      .insert({ account_id: team.id, user_id: a.userId, role: "owner" });

    personalAIntegrationId = await seedIntegration(
      a.personalAccountId,
      a.userId,
      "slack",
      "T-PERSONAL-A",
    );
    teamIntegrationId = await seedIntegration(teamAccountId, a.userId, "gmail", "team@a.test");
  });

  afterAll(async () => {
    if (!admin) return;
    // integrations.account_id FK is ON DELETE RESTRICT — delete the rows first.
    for (const id of createdAccountIds) {
      await admin.from("integrations").delete().eq("account_id", id);
    }
    for (const uid of createdUserIds) {
      const { data: accts } = await admin.from("accounts").select("id").eq("owner_user_id", uid);
      for (const acct of (accts ?? []) as Array<{ id: string }>) {
        await admin.from("integrations").delete().eq("account_id", acct.id);
        await admin.from("account_billing").delete().eq("account_id", acct.id);
      }
      await admin.from("account_memberships").delete().eq("user_id", uid);
    }
    for (const id of createdAccountIds) {
      await admin.from("accounts").delete().eq("id", id); // cascades memberships
    }
    for (const uid of createdUserIds) {
      await admin.from("accounts").delete().eq("owner_user_id", uid);
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) console.warn(`cleanup: failed to delete user ${uid}: ${error.message}`);
    }
  });

  it("member A reads their personal account's integration", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { data, error } = await supaA
      .from("integrations")
      .select("id, account_id, provider")
      .eq("id", personalAIntegrationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]!.account_id).toBe(a.personalAccountId);
  });

  it("non-member B cannot read account A's personal integration", async () => {
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);
    const { data, error } = await supaB
      .from("integrations")
      .select("id")
      .eq("id", personalAIntegrationId);
    expect(error).toBeNull(); // RLS filters silently, not an error
    expect(data).toHaveLength(0);
  });

  it("anon client sees no integrations", async () => {
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon
      .from("integrations")
      .select("id")
      .eq("id", personalAIntegrationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("team separation: member A reads the team integration; non-member B does NOT", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;
    const supaA = await sessionClient(a.email, a.password);
    const supaB = await sessionClient(b.email, b.password);

    const aRead = await supaA.from("integrations").select("id").eq("id", teamIntegrationId);
    expect(aRead.error).toBeNull();
    expect(aRead.data).toHaveLength(1);

    const bRead = await supaB.from("integrations").select("id").eq("id", teamIntegrationId);
    expect(bRead.error).toBeNull();
    expect(bRead.data).toHaveLength(0);
  });

  it("membership grants read: after B joins the team account, B can read the team integration", async () => {
    const b = sessions[1]!;
    await admin
      .from("account_memberships")
      .insert({ account_id: teamAccountId, user_id: b.userId, role: "member" });

    const supaB = await sessionClient(b.email, b.password);
    const { data, error } = await supaB
      .from("integrations")
      .select("id")
      .eq("id", teamIntegrationId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // …but B STILL cannot read account A's PERSONAL integration (separate account).
    const personal = await supaB
      .from("integrations")
      .select("id")
      .eq("id", personalAIntegrationId);
    expect(personal.error).toBeNull();
    expect(personal.data).toHaveLength(0);

    // restore seed state so later assertions about "non-member B" hold if reordered.
    await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", teamAccountId)
      .eq("user_id", b.userId);
  });

  it("cross-account UPDATE by a non-member is denied (42501; row unchanged)", async () => {
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);
    const { error } = await supaB
      .from("integrations")
      .update({ display_name: "HIJACKED" })
      .eq("id", personalAIntegrationId);
    // Post V2-READY-47B: `authenticated` has NO update privilege, so this is a
    // HARD permission denial (privilege is checked before RLS) — strictly
    // stronger than the prior RLS-filtered silent no-op. Row integrity unchanged.
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");

    const { data } = await admin
      .from("integrations")
      .select("display_name")
      .eq("id", personalAIntegrationId)
      .single<{ display_name: string }>();
    expect(data!.display_name).not.toBe("HIJACKED");
    expect(data!.display_name).toBe("slack test");
  });

  it("cross-account DELETE by a non-member is denied (42501; row survives)", async () => {
    const b = sessions[1]!;
    const supaB = await sessionClient(b.email, b.password);
    const { error } = await supaB
      .from("integrations")
      .delete()
      .eq("id", personalAIntegrationId);
    // Post V2-READY-47B: hard permission denial (no delete privilege), not a no-op.
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");

    const { data } = await admin
      .from("integrations")
      .select("id")
      .eq("id", personalAIntegrationId);
    expect(data).toHaveLength(1); // still there
  });

  it("service-role reads every row regardless of membership (engine path)", async () => {
    const both = await admin
      .from("integrations")
      .select("id")
      .in("id", [personalAIntegrationId, teamIntegrationId]);
    expect(both.error).toBeNull();
    expect(both.data).toHaveLength(2);
  });

  it("NO CLEARTEXT AT REST: stored *_encrypted columns contain no plaintext token pattern, yet decrypt to the fixtures", async () => {
    const { data, error } = await admin
      .from("integrations")
      .select("access_token_encrypted, refresh_token_encrypted")
      .eq("id", personalAIntegrationId)
      .single<{ access_token_encrypted: string; refresh_token_encrypted: string }>();
    expect(error).toBeNull();

    const storedAccess = data!.access_token_encrypted;
    const storedRefresh = data!.refresh_token_encrypted;

    for (const pattern of CLEARTEXT_PATTERNS) {
      expect(storedAccess).not.toContain(pattern);
      expect(storedRefresh).not.toContain(pattern);
    }
    // Opaque at rest, but recoverable with the key — proves it's encryption,
    // not truncation/hashing.
    expect(decryptToken(storedAccess)).toBe(FAKE_ACCESS_PLAINTEXT);
    expect(decryptToken(storedRefresh)).toBe(FAKE_REFRESH_PLAINTEXT);
  });

  /**
   * V2-READY-47B — direct authenticated WRITES are revoked.
   *
   * The cross-account no-op tests above prove RLS blocks NON-members. This block
   * proves the harder case: even a legitimate account MEMBER (who passes the
   * account-membership write RLS) cannot mutate integrations DIRECTLY via the
   * authenticated client, because the INSERT/UPDATE/DELETE table GRANT was revoked
   * (migration 20260627000000). Privilege is checked before RLS, so each write is
   * denied with SQLSTATE 42501 — forcing all mutations through the service-role
   * chokepoints (connect APPS-PERM-1 / disconnect / reconnect), where the
   * owner/admin/connector authorization actually lives.
   *
   * REQUIRES the migration applied to the target DB (this file's standing
   * precondition). SELECT for members stays intact.
   */
  describe("direct authenticated writes are revoked (V2-READY-47B)", () => {
    beforeAll(async () => {
      // B joins the team account as a regular MEMBER — passes write RLS, so the
      // ONLY thing denying a direct write is the revoked table privilege.
      await admin
        .from("account_memberships")
        .insert({ account_id: teamAccountId, user_id: sessions[1]!.userId, role: "member" });
    });

    afterAll(async () => {
      await admin
        .from("account_memberships")
        .delete()
        .eq("account_id", teamAccountId)
        .eq("user_id", sessions[1]!.userId);
    });

    it("member B can still SELECT the team integration (read path preserved)", async () => {
      const b = sessions[1]!;
      const supaB = await sessionClient(b.email, b.password);
      const { data, error } = await supaB
        .from("integrations")
        .select("id")
        .eq("id", teamIntegrationId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("member B CANNOT INSERT an integration row directly (42501; nothing written)", async () => {
      const b = sessions[1]!;
      const supaB = await sessionClient(b.email, b.password);
      const { error } = await supaB
        .from("integrations")
        .insert({
          account_id: teamAccountId,
          connected_by_user_id: b.userId,
          provider: "discord",
          provider_account_id: "B-INJECT",
          display_name: "injected",
          access_token_encrypted: encryptToken(FAKE_ACCESS_PLAINTEXT),
          scopes: [],
          account_metadata: {},
        })
        .select("id");
      // Hard permission denial, not a silent RLS no-op.
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");
      // …and the row truly was not created.
      const check = await admin
        .from("integrations")
        .select("id")
        .eq("account_id", teamAccountId)
        .eq("provider", "discord");
      expect(check.data).toHaveLength(0);
    });

    it("member B CANNOT UPDATE the team integration directly (42501; row unchanged)", async () => {
      const b = sessions[1]!;
      const supaB = await sessionClient(b.email, b.password);
      const { error } = await supaB
        .from("integrations")
        .update({ display_name: "HIJACKED-BY-MEMBER" })
        .eq("id", teamIntegrationId);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");

      const { data } = await admin
        .from("integrations")
        .select("display_name")
        .eq("id", teamIntegrationId)
        .single<{ display_name: string }>();
      expect(data!.display_name).toBe("gmail test"); // seeded value, unchanged
    });

    it("member B CANNOT DELETE the team integration directly (42501; row survives)", async () => {
      const b = sessions[1]!;
      const supaB = await sessionClient(b.email, b.password);
      const { error } = await supaB
        .from("integrations")
        .delete()
        .eq("id", teamIntegrationId);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("42501");

      const { data } = await admin
        .from("integrations")
        .select("id")
        .eq("id", teamIntegrationId);
      expect(data).toHaveLength(1); // still there
    });

    it("service-role STILL performs the full write cycle (chokepoint path unaffected)", async () => {
      // Proves the revoke only closed the authenticated bypass — the authorized
      // service-role path (what the OAuth dispatcher / disconnect service use)
      // keeps full INSERT/UPDATE/DELETE.
      const ins = await admin
        .from("integrations")
        .insert({
          account_id: teamAccountId,
          connected_by_user_id: sessions[0]!.userId,
          provider: "trello",
          provider_account_id: "svc-role-cycle",
          display_name: "svc-role test",
          access_token_encrypted: encryptToken(FAKE_ACCESS_PLAINTEXT),
          scopes: [],
          account_metadata: {},
        })
        .select("id")
        .single<{ id: string }>();
      expect(ins.error).toBeNull();
      const newId = ins.data!.id;

      const upd = await admin
        .from("integrations")
        .update({ display_name: "svc-role updated" })
        .eq("id", newId);
      expect(upd.error).toBeNull();

      const del = await admin.from("integrations").delete().eq("id", newId);
      expect(del.error).toBeNull();

      const gone = await admin.from("integrations").select("id").eq("id", newId);
      expect(gone.data).toHaveLength(0);
    });
  });
});
