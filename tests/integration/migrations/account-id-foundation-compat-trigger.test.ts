/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-5 — load-bearing assertion: existing repository
 * INSERT signatures continue to succeed against the new NOT NULL
 * account_id columns. The compat triggers populate the columns.
 *
 * Per docs/slices/phase-4/account-id-cutover-plan.md §"Test plan →
 * Foundation": this is the proof that the foundation slice ships safely
 * with no application code changes.
 *
 *   - workflows.create({ userId, name }) → row lands; account_id =
 *     user's personal account; created_by_user_id = user; user_id
 *     unchanged.
 *   - integrations.upsertActive({ userId, provider, ... }) → same shape;
 *     connected_by_user_id = user.
 *   - workflowRuns.createWorkflowRunStart({ runId, workflowId, userId, ... })
 *     → row lands; account_id derived from the workflow.
 *   - When the caller DOES supply account_id, the trigger no-ops
 *     (supplied value wins).
 *
 * DESTRUCTIVE: creates throwaway auth users. OPT-IN.
 *
 * The test mocks @/utils/supabase/server to return the service-role
 * client so repository functions that read `await createClient()` succeed
 * outside a Next.js request context. RLS does not gate INSERTs here, but
 * the compat trigger fires regardless of which client triggers the
 * INSERT — that's the contract being verified.
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

let adminClient: SupabaseClient | null = null;
if (RUN) {
  adminClient = createClient(URL!, SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Mock the SSR cookie client to return the same service-role admin
// instance — the repository functions don't care which client they get,
// they just need one. RLS isn't the contract under test; the BEFORE
// INSERT compat trigger is, and triggers fire regardless of client.
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => adminClient,
}));

// Mock getServiceRoleClient too so any repository function that goes
// through it gets the same client — this avoids the reason-string +
// env-check path during tests.
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => adminClient,
}));

// Imports of the REAL repositories must come AFTER jest.mock (hoisted).
import { create as createWorkflow } from "@/repositories/workflows";
import { upsertActive as upsertIntegration } from "@/repositories/integrations";
import { createWorkflowRunStart } from "@/repositories/workflowRunsLifecycle";
import type { EncryptedTokens } from "@/contracts/integration";

const describeDb = RUN ? describe : describe.skip;

if (!RUN) {
  console.log(
    "SKIP account_id foundation compat-trigger — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}

describeDb("account_id foundation compat trigger — Slice 4.ACCOUNT-MODEL-5", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(label: string): Promise<string> {
    const slug = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await adminClient!.auth.admin.createUser({
      email: `acc-compat-${slug}@chainreact.test`,
      password: `Pw-${slug}!`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createTestUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function getPersonalAccountId(userId: string): Promise<string> {
    const { data, error } = await adminClient!
      .from("accounts")
      .select("id")
      .eq("type", "personal")
      .eq("owner_user_id", userId)
      .single<{ id: string }>();
    if (error || !data) throw new Error(`getPersonalAccountId: ${error?.message ?? "no row"}`);
    return data.id;
  }

  function buildTokens(): EncryptedTokens {
    return {
      accessTokenEncrypted: "encrypted-access-token",
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
      scopes: ["chat:write"],
    };
  }

  afterAll(async () => {
    if (!adminClient) return;
    for (const id of createdUserIds) {
      await adminClient.from("workflow_runs").delete().eq("user_id", id);
      await adminClient.from("workflow_revisions").delete().eq("user_id", id);
      await adminClient.from("workflows").delete().eq("user_id", id);
      await adminClient.from("integrations").delete().eq("user_id", id);
      await adminClient.from("user_billing").delete().eq("user_id", id);
      await adminClient.from("account_memberships").delete().eq("user_id", id);
      await adminClient.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  it("workflows.create({ userId, name }) — existing signature inserts successfully + trigger populates account_id + created_by_user_id", async () => {
    const userId = await createTestUser("wf-create");
    const personalAccountId = await getPersonalAccountId(userId);

    const wf = await createWorkflow({ userId, name: "Compat trigger workflow" });
    expect(wf.userId).toBe(userId);
    expect(wf.name).toBe("Compat trigger workflow");

    // Re-read with the underlying row shape to assert the trigger-set columns.
    const { data: row, error } = await adminClient!
      .from("workflows")
      .select("user_id, account_id, created_by_user_id")
      .eq("id", wf.id)
      .single<{ user_id: string; account_id: string; created_by_user_id: string }>();
    expect(error).toBeNull();
    expect(row!.user_id).toBe(userId);
    expect(row!.account_id).toBe(personalAccountId);
    expect(row!.created_by_user_id).toBe(userId);
  });

  it("integrations.upsertActive({ userId, provider, ... }) — existing signature inserts successfully + trigger populates account_id + connected_by_user_id", async () => {
    const userId = await createTestUser("int-upsert");
    const personalAccountId = await getPersonalAccountId(userId);

    const provider = "slack";
    const providerAccountId = `T-compat-${Math.random().toString(36).slice(2, 10)}`;

    const result = await upsertIntegration({
      userId,
      provider,
      providerAccountId,
      displayName: "Compat trigger workspace",
      tokens: buildTokens(),
      accountMetadata: { harness: true },
    });
    expect(result.userId).toBe(userId);
    expect(result.provider).toBe(provider);
    expect(result.providerAccountId).toBe(providerAccountId);

    const { data: row, error } = await adminClient!
      .from("integrations")
      .select("user_id, account_id, connected_by_user_id")
      .eq("id", result.id)
      .single<{ user_id: string; account_id: string; connected_by_user_id: string }>();
    expect(error).toBeNull();
    expect(row!.user_id).toBe(userId);
    expect(row!.account_id).toBe(personalAccountId);
    expect(row!.connected_by_user_id).toBe(userId);
  });

  it("workflowRunsLifecycle.createWorkflowRunStart({ userId, workflowId, ... }) — existing signature inserts successfully + trigger derives account_id from owning workflow + triggered_by_user_id stays NULL", async () => {
    const userId = await createTestUser("run-start");
    const personalAccountId = await getPersonalAccountId(userId);

    // Need a workflow to point the run at.
    const wf = await createWorkflow({ userId, name: "Compat trigger run-host" });

    const runId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const result = await createWorkflowRunStart({
      runId,
      workflowId: wf.id,
      userId,
      triggerNodeId: "trigger-1",
      triggerEvent: {
        provider: "manual",
        eventType: "manual_trigger",
        eventId: `evt-${Date.now()}`,
        occurredAt: nowIso,
        accountId: "harness",
        payload: {},
      },
      startedAt: nowIso,
      isTest: false,
      triggeredBy: "manual",
    });
    expect(result.created).toBe(true);

    const { data: row, error } = await adminClient!
      .from("workflow_runs")
      .select("user_id, workflow_id, account_id, triggered_by_user_id")
      .eq("id", runId)
      .single<{
        user_id: string;
        workflow_id: string;
        account_id: string;
        triggered_by_user_id: string | null;
      }>();
    expect(error).toBeNull();
    expect(row!.user_id).toBe(userId);
    expect(row!.workflow_id).toBe(wf.id);
    expect(row!.account_id).toBe(personalAccountId);
    // Existing engine path doesn't supply triggered_by_user_id; trigger
    // intentionally does NOT auto-populate it. NULL is the honest value.
    expect(row!.triggered_by_user_id).toBeNull();
  });

  it("trigger no-ops when account_id is explicitly supplied (workflows)", async () => {
    const userA = await createTestUser("wf-explicit-a");
    const userB = await createTestUser("wf-explicit-b");
    const accountA = await getPersonalAccountId(userA);
    const accountB = await getPersonalAccountId(userB);

    // Insert a workflow rooted at userA but explicitly assign it to userB's
    // account. (This is an intentionally weird state — the per-table
    // cutover slice rejects it, but here we just want to prove that the
    // foundation slice's trigger does not OVERWRITE a supplied account_id.)
    const { data, error } = await adminClient!
      .from("workflows")
      .insert({
        user_id: userA,
        name: "Explicit account_id",
        account_id: accountB,
        created_by_user_id: userA,
      })
      .select("id, user_id, account_id, created_by_user_id")
      .single<{ id: string; user_id: string; account_id: string; created_by_user_id: string }>();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userA);
    // Supplied account_id wins — trigger no-ops because NEW.account_id is NOT NULL on entry.
    expect(data!.account_id).toBe(accountB);
    expect(data!.account_id).not.toBe(accountA);
    expect(data!.created_by_user_id).toBe(userA);
  });

  it("trigger no-ops when connected_by_user_id is explicitly supplied (integrations)", async () => {
    const userA = await createTestUser("int-explicit-a");
    const userB = await createTestUser("int-explicit-b");
    const accountA = await getPersonalAccountId(userA);

    const { data, error } = await adminClient!
      .from("integrations")
      .insert({
        user_id: userA,
        provider: "slack",
        provider_account_id: `T-explicit-${Math.random().toString(36).slice(2, 10)}`,
        display_name: "Explicit connected_by_user_id",
        access_token_encrypted: "encrypted-bytes",
        account_id: accountA,
        connected_by_user_id: userB,
      })
      .select("user_id, account_id, connected_by_user_id")
      .single<{ user_id: string; account_id: string; connected_by_user_id: string }>();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(userA);
    expect(data!.account_id).toBe(accountA);
    // Supplied connected_by_user_id wins — trigger no-ops because NEW.connected_by_user_id is NOT NULL on entry.
    expect(data!.connected_by_user_id).toBe(userB);
  });

  it("trigger no-ops when triggered_by_user_id is explicitly supplied (workflow_runs)", async () => {
    const userId = await createTestUser("run-explicit");
    const personalAccountId = await getPersonalAccountId(userId);
    const wf = await createWorkflow({ userId, name: "Explicit triggered_by run-host" });

    const nowIso = new Date().toISOString();
    const { data, error } = await adminClient!
      .from("workflow_runs")
      .insert({
        workflow_id: wf.id,
        user_id: userId,
        status: "succeeded",
        trigger_node_id: "trigger-1",
        trigger_event: {
          provider: "manual",
          eventType: "manual_trigger",
          eventId: `evt-${Date.now()}`,
          occurredAt: nowIso,
          accountId: "harness",
          payload: {},
        },
        started_at: nowIso,
        finished_at: nowIso,
        triggered_by_user_id: userId,
      })
      .select("account_id, triggered_by_user_id")
      .single<{ account_id: string; triggered_by_user_id: string | null }>();
    expect(error).toBeNull();
    expect(data!.account_id).toBe(personalAccountId);
    expect(data!.triggered_by_user_id).toBe(userId);
  });
});
