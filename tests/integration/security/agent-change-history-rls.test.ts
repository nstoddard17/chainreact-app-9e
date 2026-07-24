/**
 * @jest-environment node
 *
 * AGENT-CHANGE-HISTORY-1 — gated DB proof of the agent_change_history table's
 * security surface. The table is the user-visible React Agent activity timeline;
 * its access model mirrors workflow_checkpoints: account-membership RLS through
 * the workflow's account (NOT creator-scoped), with members allowed to
 * create / transition / delete their own account's rows (the repository writes
 * via the authenticated SSR client, RLS is the backstop) — distinct from the
 * service-role-only governance ledger.
 *
 * Proves:
 *   - SELECT membership scoping: the workflow's account OWNER and a non-creator
 *     co-member both read its history; a different-account stranger and anon see
 *     no rows (no existence leak).
 *   - INSERT scoping: an account member can insert via the authenticated client
 *     (the real repository path); a stranger forging the workflow_id is rejected
 *     by the WITH CHECK policy (42501); anon cannot write. Service-role (the
 *     system path) inserts unconditionally.
 *   - UPDATE / DELETE scoping: a member transitions / deletes their account's
 *     rows; a stranger's UPDATE/DELETE matches zero rows and the row is untouched.
 *   - Integrity: UNIQUE(workflow_id, agent_change_id) is enforced (23505) but is
 *     per-workflow; invalid status is rejected by the CHECK (23514); a bogus
 *     workflow_id / account_id violates the FK (23503); diff + metadata must be
 *     JSON OBJECTS (a raw scalar/array is rejected, 23514) so no value blob can be
 *     smuggled through them; counts cannot be negative (23514).
 *   - ON DELETE CASCADE: deleting the workflow removes its history rows.
 *
 * The value-LEVEL secret scrubbing of `diff` (secret-flagged fields forced to
 * { kind: "redacted" }) is a service-layer guarantee (sanitizeStoredDiff) covered
 * by the service unit test; the DB enforces only the OBJECT shape, asserted here.
 *
 * DESTRUCTIVE: creates throwaway auth users + accounts + workflows + history
 * rows. OPT-IN — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL
 * + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY (migration applied).
 */

import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";
import { signedInClient } from "@/tests/helpers/dbSessionClient";
import { requireTables } from "@/tests/helpers/dbPreflight";

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
    "SKIP agent_change_history RLS — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("agent_change_history RLS + constraints — AGENT-CHANGE-HISTORY-1", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  // Shared teardown (tests/helpers/dbFixtureCleanup.ts) tracks every synthetic
  // user + account so afterAll tears them down in RESTRICT-safe order.
  const fixtures = createFixtureTracker();
  // createTrackedUser mints a unique password per user; sessionClient(email)
  // looks it up here so the helper's single-argument shape is preserved.
  const passwordByEmail = new Map<string, string>();

  // Account OWNER (creator), a non-creator co-MEMBER of the same team account, and
  // a different-account STRANGER. The team account proves membership scoping is not
  // creator-scoped (the co-member never created the workflow yet must read it).
  const ctx = {
    ownerUserId: "",
    ownerEmail: "",
    memberUserId: "",
    memberEmail: "",
    strangerUserId: "",
    strangerEmail: "",
    teamAccountId: "",
    workflowId: "",
    seededRowId: "",
    seededChangeId: "",
    strangerAccountId: "",
    strangerWorkflowId: "",
  };

  async function createTestUser(label: string): Promise<{ userId: string; email: string }> {
    const { userId, email, password } = await createTrackedUser(admin, fixtures, `ach-rls-${label}`);
    passwordByEmail.set(email, password);
    return { userId, email };
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

  async function createTeamAccount(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .insert({ type: "team", name: "ACH RLS team", owner_user_id: ownerId })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`createTeamAccount: ${error?.message ?? "no row"}`);
    fixtures.trackAccount(data.id);
    const { error: mErr } = await admin
      .from("account_memberships")
      .insert({ account_id: data.id, user_id: ownerId, role: "owner" });
    if (mErr) throw new Error(`createTeamAccount owner membership: ${mErr.message}`);
    return data.id;
  }

  async function addMember(accountId: string, userId: string): Promise<void> {
    const { error } = await admin
      .from("account_memberships")
      .insert({ account_id: accountId, user_id: userId, role: "member" });
    if (error) throw new Error(`addMember: ${error.message}`);
  }

  async function seedWorkflow(accountId: string, userId: string, name: string): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow: ${error?.message ?? "no row"}`);
    return data.id;
  }

  /** Service-role insert of one history row (the "system path" — bypasses RLS). */
  async function seedHistory(
    workflowId: string,
    accountId: string,
    userId: string,
    agentChangeId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from("agent_change_history")
      .insert({
        agent_change_id: agentChangeId,
        workflow_id: workflowId,
        account_id: accountId,
        created_by_user_id: userId,
        source: "react_agent",
        status,
        ...extra,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedHistory: ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function sessionClient(email: string): Promise<SupabaseClient> {
    return signedInClient({ url: URL!, anonKey: ANON_KEY!, admin, email });
  }

  function anonClient(): SupabaseClient {
    return createClient(URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Fail fast if a migration is missing — never create fixtures for a suite
    // that cannot prove anything (a vacuous green is worse than a red).
    await requireTables(admin, ["agent_change_history", "workflows"]);

    const owner = await createTestUser("owner");
    const member = await createTestUser("member");
    const stranger = await createTestUser("stranger");
    ctx.ownerUserId = owner.userId;
    ctx.ownerEmail = owner.email;
    ctx.memberUserId = member.userId;
    ctx.memberEmail = member.email;
    ctx.strangerUserId = stranger.userId;
    ctx.strangerEmail = stranger.email;

    ctx.teamAccountId = await createTeamAccount(owner.userId);
    await addMember(ctx.teamAccountId, member.userId);
    ctx.workflowId = await seedWorkflow(ctx.teamAccountId, owner.userId, "Team WF");

    ctx.seededChangeId = randomUUID();
    ctx.seededRowId = await seedHistory(
      ctx.workflowId,
      ctx.teamAccountId,
      owner.userId,
      ctx.seededChangeId,
      "preview_created",
      { prompt: "owner's own request text", title: "1 node added", summary: "Added a node" },
    );

    // Cross-account fixture: the stranger's OWN account + workflow.
    ctx.strangerAccountId = await personalAccountId(stranger.userId);
    ctx.strangerWorkflowId = await seedWorkflow(
      ctx.strangerAccountId,
      stranger.userId,
      "Stranger WF",
    );
  });

  afterAll(async () => {
    await cleanupFixtures(admin, fixtures);
  });

  // ── SELECT membership scoping ───────────────────────────────────────────────

  it("SELECT: account owner AND non-creator co-member read the row; stranger + anon see nothing", async () => {
    const ownerSession = await sessionClient(ctx.ownerEmail);
    const ownerRead = await ownerSession
      .from("agent_change_history")
      .select("id, prompt, status")
      .eq("id", ctx.seededRowId);
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toHaveLength(1);

    // The co-member did NOT create the workflow but is a member of its account —
    // membership-gated RLS (not creator-gated) must let them read.
    const memberSession = await sessionClient(ctx.memberEmail);
    const memberRead = await memberSession
      .from("agent_change_history")
      .select("id")
      .eq("id", ctx.seededRowId);
    expect(memberRead.error).toBeNull();
    expect(memberRead.data).toHaveLength(1);

    // Different-account stranger: no rows (empty, not a 403 that reveals existence).
    const strangerSession = await sessionClient(ctx.strangerEmail);
    const strangerRead = await strangerSession
      .from("agent_change_history")
      .select("id")
      .eq("id", ctx.seededRowId);
    expect(strangerRead.error).toBeNull();
    expect(strangerRead.data).toHaveLength(0);

    // anon has no Data API grant on this table → no rows reach it.
    const anonRead = await anonClient()
      .from("agent_change_history")
      .select("id")
      .eq("id", ctx.seededRowId);
    expect((anonRead.data ?? []).length).toBe(0);
  });

  it("SELECT by workflow: stranger listing the owner's workflow history gets zero rows", async () => {
    const strangerSession = await sessionClient(ctx.strangerEmail);
    const { data, error } = await strangerSession
      .from("agent_change_history")
      .select("id")
      .eq("workflow_id", ctx.workflowId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // ── INSERT scoping ──────────────────────────────────────────────────────────

  it("INSERT: a member writes via the authenticated client; a stranger forging the workflow_id is denied (42501); anon is denied", async () => {
    // Co-member inserts a fresh change for the team workflow — the real repository
    // path is the authenticated SSR client gated by the WITH CHECK policy.
    const memberSession = await sessionClient(ctx.memberEmail);
    const ins = await memberSession
      .from("agent_change_history")
      .insert({
        agent_change_id: randomUUID(),
        workflow_id: ctx.workflowId,
        account_id: ctx.teamAccountId,
        created_by_user_id: ctx.memberUserId,
        source: "react_agent",
        status: "preview_created",
      })
      .select("id");
    expect(ins.error).toBeNull();
    expect(ins.data).toHaveLength(1);

    // Stranger forges the owner's workflow_id — membership WITH CHECK rejects it.
    const strangerSession = await sessionClient(ctx.strangerEmail);
    const forged = await strangerSession.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.strangerUserId,
      source: "react_agent",
      status: "preview_created",
    });
    expect(forged.error).not.toBeNull();
    expect(forged.error!.code).toBe("42501");

    // anon cannot write.
    const anonIns = await anonClient().from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
    });
    expect(anonIns.error).not.toBeNull();
  });

  it("INSERT: the service-role (system) path inserts unconditionally and the row is readable by service-role", async () => {
    const sysChangeId = randomUUID();
    const rowId = await seedHistory(
      ctx.workflowId,
      ctx.teamAccountId,
      ctx.ownerUserId,
      sysChangeId,
      "restored_checkpoint",
    );
    const { data, error } = await admin
      .from("agent_change_history")
      .select("id, status")
      .eq("id", rowId)
      .single<{ id: string; status: string }>();
    expect(error).toBeNull();
    expect(data!.status).toBe("restored_checkpoint");
  });

  // ── UPDATE / DELETE scoping ─────────────────────────────────────────────────

  it("UPDATE: a member transitions the row in place; a stranger's update matches zero rows and leaves it untouched", async () => {
    const rowId = await seedHistory(
      ctx.workflowId,
      ctx.teamAccountId,
      ctx.ownerUserId,
      randomUUID(),
      "preview_created",
    );

    // Stranger's UPDATE is filtered out by the USING clause → zero rows changed.
    const strangerSession = await sessionClient(ctx.strangerEmail);
    const sUpd = await strangerSession
      .from("agent_change_history")
      .update({ status: "preview_applied" })
      .eq("id", rowId)
      .select("id");
    expect(sUpd.error).toBeNull();
    expect(sUpd.data ?? []).toHaveLength(0);

    const stillPreview = await admin
      .from("agent_change_history")
      .select("status")
      .eq("id", rowId)
      .single<{ status: string }>();
    expect(stillPreview.data!.status).toBe("preview_created");

    // Member transitions it (preview_created → preview_applied).
    const memberSession = await sessionClient(ctx.memberEmail);
    const mUpd = await memberSession
      .from("agent_change_history")
      .update({ status: "preview_applied" })
      .eq("id", rowId)
      .select("id, status");
    expect(mUpd.error).toBeNull();
    expect(mUpd.data).toHaveLength(1);
    expect((mUpd.data![0] as { status: string }).status).toBe("preview_applied");
  });

  it("DELETE: a stranger cannot delete the row (survives); a member can", async () => {
    const rowId = await seedHistory(
      ctx.workflowId,
      ctx.teamAccountId,
      ctx.ownerUserId,
      randomUUID(),
      "preview_created",
    );

    const strangerSession = await sessionClient(ctx.strangerEmail);
    const sDel = await strangerSession
      .from("agent_change_history")
      .delete()
      .eq("id", rowId)
      .select("id");
    expect(sDel.data ?? []).toHaveLength(0);

    const survived = await admin.from("agent_change_history").select("id").eq("id", rowId);
    expect(survived.data).toHaveLength(1);

    const memberSession = await sessionClient(ctx.memberEmail);
    const mDel = await memberSession
      .from("agent_change_history")
      .delete()
      .eq("id", rowId)
      .select("id");
    expect(mDel.error).toBeNull();
    expect(mDel.data).toHaveLength(1);

    const gone = await admin.from("agent_change_history").select("id").eq("id", rowId);
    expect(gone.data).toHaveLength(0);
  });

  // ── Integrity / write constraints ───────────────────────────────────────────

  it("UNIQUE(workflow_id, agent_change_id): a duplicate per workflow is rejected (23505) but the same change id on another workflow is allowed", async () => {
    const dupChange = randomUUID();
    await seedHistory(ctx.workflowId, ctx.teamAccountId, ctx.ownerUserId, dupChange, "preview_created");

    const dup = await admin.from("agent_change_history").insert({
      agent_change_id: dupChange,
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_applied",
    });
    expect(dup.error).not.toBeNull();
    expect(dup.error!.code).toBe("23505");

    // Uniqueness is scoped per workflow — the SAME change id on a different
    // workflow (a fresh restore is its own change) is allowed.
    const otherWf = await admin.from("agent_change_history").insert({
      agent_change_id: dupChange,
      workflow_id: ctx.strangerWorkflowId,
      account_id: ctx.strangerAccountId,
      created_by_user_id: ctx.strangerUserId,
      source: "react_agent",
      status: "preview_created",
    });
    expect(otherWf.error).toBeNull();
  });

  it("CHECK: an unknown status is rejected (23514)", async () => {
    const bad = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "totally_not_a_status",
    });
    expect(bad.error).not.toBeNull();
    expect(bad.error!.code).toBe("23514");
  });

  it("FK: a bogus workflow_id and a bogus account_id are both rejected (23503)", async () => {
    const badWf = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: randomUUID(),
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
    });
    expect(badWf.error).not.toBeNull();
    expect(badWf.error!.code).toBe("23503");

    const badAcct = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: randomUUID(),
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
    });
    expect(badAcct.error).not.toBeNull();
    expect(badAcct.error!.code).toBe("23503");
  });

  it("CHECK: diff + metadata must be JSON OBJECTS — a raw scalar/array is rejected (23514); an object diff is accepted", async () => {
    // A raw array could smuggle a value blob — the diff_object_chk rejects it.
    const arrDiff = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
      diff: ["raw", "value", "blob"],
    });
    expect(arrDiff.error).not.toBeNull();
    expect(arrDiff.error!.code).toBe("23514");

    // A raw scalar string (a smuggled value) is likewise rejected.
    const scalarDiff = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
      diff: "secret-token-value",
    });
    expect(scalarDiff.error).not.toBeNull();
    expect(scalarDiff.error!.code).toBe("23514");

    // metadata must also be an object (never a scalar that hides a blob).
    const scalarMeta = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
      metadata: "not-an-object",
    });
    expect(scalarMeta.error).not.toBeNull();
    expect(scalarMeta.error!.code).toBe("23514");

    // The allowed shape — a ConfigDiff-style object — is accepted.
    const okDiff = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
      diff: { nodes: [] },
      metadata: { applyMode: "preview_only" },
    });
    expect(okDiff.error).toBeNull();
  });

  it("CHECK: a negative count is rejected (23514)", async () => {
    const badCount = await admin.from("agent_change_history").insert({
      agent_change_id: randomUUID(),
      workflow_id: ctx.workflowId,
      account_id: ctx.teamAccountId,
      created_by_user_id: ctx.ownerUserId,
      source: "react_agent",
      status: "preview_created",
      changed_node_count: -1,
    });
    expect(badCount.error).not.toBeNull();
    expect(badCount.error!.code).toBe("23514");
  });

  // ── Cascade ─────────────────────────────────────────────────────────────────

  it("ON DELETE CASCADE: deleting the workflow removes its history rows", async () => {
    const wfId = await seedWorkflow(ctx.teamAccountId, ctx.ownerUserId, "Cascade WF");
    await seedHistory(wfId, ctx.teamAccountId, ctx.ownerUserId, randomUUID(), "preview_created");

    await admin.from("workflows").delete().eq("id", wfId);

    const { data } = await admin
      .from("agent_change_history")
      .select("id")
      .eq("workflow_id", wfId);
    expect(data).toHaveLength(0);
  });
});
