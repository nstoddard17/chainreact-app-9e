/**
 * @jest-environment node
 *
 * Slice 4.PUBLIC-MCP — gated DB proof of the public MCP token + server security
 * posture: account isolation and token revocation against a LIVE database.
 *
 * `account_mcp_tokens` is SERVICE-ROLE-ONLY at the Data API (no `authenticated`
 * GRANT — `token_hash` must never be client-readable). The public MCP server
 * resolves a token to an account-scoped context and every tool reads ONLY within
 * that account. This test proves, end to end:
 *   - a member's DIRECT authenticated SELECT on account_mcp_tokens is denied (42501),
 *   - anon sees nothing,
 *   - a valid token verifies to its account,
 *   - get_workflow for a workflow in ANOTHER account → not_found (isolation),
 *   - a REVOKED token no longer verifies (token revocation),
 *   - a token whose minter was REMOVED from the account no longer verifies
 *     (offboarding revocation).
 *
 * NO real tokens are printed — tokens are generated at runtime; only their hash +
 * prefix are stored, and only behavior (not secrets) is asserted.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + workflows + MCP tokens.
 * OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migrations applied).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateMcpToken } from "@/core/mcp/token";
import { verifyMcpToken } from "@/services/mcp/verify";
import { handleMcpRpc } from "@/services/mcp/server";
import { canActorUseIntegrationForMcp } from "@/services/mcp/integrationUsage";

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
    "SKIP mcp-tokens RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("public MCP — account isolation + token revocation (live DB)", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const createdAccountIds: string[] = [];

  type Session = { userId: string; email: string; password: string; personalAccountId: string };
  const sessions: Session[] = [];
  let teamAccountId = "";
  let wfAId = "";
  let wfBId = "";
  // A live personal-account token for A (raw kept in-memory for verify calls).
  let aTokenRaw = "";
  let aTokenId = "";
  // Integration ids for the usage-authz cases.
  let teamGmailId = ""; // gmail (personal identity) connected by A on the team
  let teamSlackId = ""; // slack (account/service) connected by A on the team
  let personalGmailAId = ""; // gmail on A's personal account (cross-account probe)

  async function createTestUser(label: string): Promise<Session> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `mcp-rls-${slug}@chainreact.test`;
    const password = `Pw-${slug}!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
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

  async function seedWorkflow(accountId: string, createdBy: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({
        account_id: accountId,
        created_by_user_id: createdBy,
        name,
        state: "active",
        draft_definition: { nodes: [], edges: [] },
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function seedToken(
    accountId: string,
    createdBy: string,
    name: string,
  ): Promise<{ raw: string; id: string }> {
    const t = generateMcpToken();
    const { data, error } = await admin
      .from("account_mcp_tokens")
      .insert({
        account_id: accountId,
        created_by_user_id: createdBy,
        name,
        prefix: t.prefix,
        token_hash: t.tokenHash,
        scopes: ["accounts:read", "workflows:read", "runs:read", "integrations:read"],
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedToken: ${error?.message ?? "no row"}`);
    return { raw: t.raw, id: data.id };
  }

  async function seedIntegration(
    accountId: string,
    connectedBy: string,
    provider: string,
    providerAccountId: string,
    displayName: string,
  ): Promise<string> {
    // Placeholder ciphertext — never decrypted here; only authz behavior is tested.
    const { data, error } = await admin
      .from("integrations")
      .insert({
        account_id: accountId,
        connected_by_user_id: connectedBy,
        provider,
        provider_account_id: providerAccountId,
        display_name: displayName,
        access_token_encrypted: "enc-placeholder-not-a-real-token",
        scopes: ["read"],
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

    wfAId = await seedWorkflow(a.personalAccountId, a.userId, "A flow");
    wfBId = await seedWorkflow(b.personalAccountId, b.userId, "B flow");

    const aTok = await seedToken(a.personalAccountId, a.userId, "A personal token");
    aTokenRaw = aTok.raw;
    aTokenId = aTok.id;

    // Team owned by A, with B as a member, for the offboarding-revocation case.
    const { data: team, error: teamErr } = await admin
      .from("accounts")
      .insert({ type: "team", name: "MCP RLS team", owner_user_id: a.userId })
      .select("id")
      .single<{ id: string }>();
    if (teamErr || !team) throw new Error(`seed team: ${teamErr?.message ?? "no row"}`);
    teamAccountId = team.id;
    createdAccountIds.push(team.id);
    await admin.from("account_memberships").insert([
      { account_id: team.id, user_id: a.userId, role: "owner" },
      { account_id: team.id, user_id: b.userId, role: "member" },
    ]);

    // Integrations for the usage-authz cases: a personal-identity (gmail) connected
    // by A, and a shared-service (slack) connected by A, both on the team; plus a
    // gmail on A's personal account for the cross-account probe.
    teamGmailId = await seedIntegration(team.id, a.userId, "gmail", "a@team.test", "a@team.test");
    teamSlackId = await seedIntegration(team.id, a.userId, "slack", "team.slack", "acme.slack.com");
    personalGmailAId = await seedIntegration(
      a.personalAccountId,
      a.userId,
      "gmail",
      "a@personal.test",
      "a@personal.test",
    );
  });

  afterAll(async () => {
    if (!admin) return;
    const allAccountIds = [...createdAccountIds];
    for (const s of sessions) allAccountIds.push(s.personalAccountId);
    for (const id of allAccountIds) {
      await admin.from("account_mcp_tokens").delete().eq("account_id", id);
      await admin.from("mcp_request_audit").delete().eq("account_id", id);
      await admin.from("workflows").delete().eq("account_id", id);
      await admin.from("integrations").delete().eq("account_id", id);
    }
    for (const id of createdAccountIds) {
      await admin.from("account_memberships").delete().eq("account_id", id);
      await admin.from("accounts").delete().eq("id", id);
    }
    for (const uid of createdUserIds) {
      await admin.from("account_memberships").delete().eq("user_id", uid);
      await admin.from("accounts").delete().eq("owner_user_id", uid);
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) console.warn(`cleanup: failed to delete user ${uid}: ${error.message}`);
    }
  });

  async function sessionClient(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`signInWithPassword: ${error.message}`);
    return c;
  }

  it("member A's DIRECT authenticated SELECT on account_mcp_tokens is denied (42501)", async () => {
    const a = sessions[0]!;
    const supaA = await sessionClient(a.email, a.password);
    const { error } = await supaA.from("account_mcp_tokens").select("id, token_hash").eq("id", aTokenId);
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("anon cannot read account_mcp_tokens", async () => {
    const anon = createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.from("account_mcp_tokens").select("id");
    // Either a permission error or simply zero rows — never a token row.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("a valid token verifies to its account", async () => {
    const a = sessions[0]!;
    const result = await verifyMcpToken(`Bearer ${aTokenRaw}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accountId).toBe(a.personalAccountId);
      expect(result.userId).toBe(a.userId);
    }
  });

  it("get_workflow can read A's own workflow but NOT B's (account isolation)", async () => {
    const a = sessions[0]!;
    const ctx = { accountId: a.personalAccountId, userId: a.userId, scopes: ["workflows:read"] };

    const own = await handleMcpRpc(
      { id: 1, method: "tools/call", params: { name: "get_workflow", arguments: { workflow_id: wfAId } } },
      ctx,
    );
    expect((own.response?.result as { isError: boolean }).isError).toBe(false);

    const foreign = await handleMcpRpc(
      { id: 2, method: "tools/call", params: { name: "get_workflow", arguments: { workflow_id: wfBId } } },
      ctx,
    );
    expect((foreign.response?.result as { isError: boolean }).isError).toBe(true);
    expect(foreign.audit).toMatchObject({ outcome: "not_found" });
  });

  it("a REVOKED token no longer verifies (token revocation)", async () => {
    const revokable = await seedToken(
      sessions[0]!.personalAccountId,
      sessions[0]!.userId,
      "to-revoke",
    );
    expect((await verifyMcpToken(`Bearer ${revokable.raw}`)).ok).toBe(true);

    await admin
      .from("account_mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", revokable.id);

    const after = await verifyMcpToken(`Bearer ${revokable.raw}`);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe("invalid");
  });

  it("a member CANNOT use a co-member's member-connected Gmail identity, but the connector CAN", async () => {
    const a = sessions[0]!;
    const b = sessions[1]!;

    // B (member, not the connector) is denied A's gmail with a typed reason.
    const bUsesAGmail = await canActorUseIntegrationForMcp({
      actorUserId: b.userId,
      accountId: teamAccountId,
      integrationId: teamGmailId,
      purpose: "run_workflow",
    });
    expect(bUsesAGmail).toMatchObject({ ok: false, reason: "integration_not_allowed_for_actor" });

    // A (the connector) may use their own gmail identity.
    const aUsesAGmail = await canActorUseIntegrationForMcp({
      actorUserId: a.userId,
      accountId: teamAccountId,
      integrationId: teamGmailId,
      purpose: "run_workflow",
    });
    expect(aUsesAGmail.ok).toBe(true);
  });

  it("a member CAN use a shared service (slack) integration on the account", async () => {
    const b = sessions[1]!;
    const r = await canActorUseIntegrationForMcp({
      actorUserId: b.userId,
      accountId: teamAccountId,
      integrationId: teamSlackId,
      purpose: "configure_workflow",
    });
    expect(r.ok).toBe(true);
  });

  it("an integration from ANOTHER account is opaque not_found (no oracle)", async () => {
    // A's personal-account gmail queried under the team account → not in scope → not_found.
    const r = await canActorUseIntegrationForMcp({
      actorUserId: sessions[0]!.userId,
      accountId: teamAccountId,
      integrationId: personalGmailAId,
      purpose: "read",
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("list_integrations does NOT mark a co-member's private Gmail usable", async () => {
    const b = sessions[1]!;
    const { response } = await handleMcpRpc(
      { id: 1, method: "tools/call", params: { name: "list_integrations", arguments: {} } },
      { accountId: teamAccountId, userId: b.userId, scopes: ["integrations:read"] },
    );
    const data = (response?.result as {
      structuredContent: { integrations: Array<{ id: string; provider: string; usage: string }> };
    }).structuredContent;
    const gmail = data.integrations.find((i) => i.id === teamGmailId);
    const slack = data.integrations.find((i) => i.id === teamSlackId);
    expect(gmail?.usage).toBe("not_available");
    expect(slack?.usage).toBe("available");
    // No provenance / secret leaks in the listing.
    expect(JSON.stringify(data)).not.toContain(sessions[0]!.userId);
  });

  it("a token stops verifying once its minter is removed from the account (offboarding)", async () => {
    const b = sessions[1]!;
    const teamTok = await seedToken(teamAccountId, b.userId, "B team token");
    expect((await verifyMcpToken(`Bearer ${teamTok.raw}`)).ok).toBe(true);

    // Remove B from the team — the token's minter is no longer a member.
    await admin
      .from("account_memberships")
      .delete()
      .eq("account_id", teamAccountId)
      .eq("user_id", b.userId);

    const after = await verifyMcpToken(`Bearer ${teamTok.raw}`);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.reason).toBe("membership_revoked");
  });
});
