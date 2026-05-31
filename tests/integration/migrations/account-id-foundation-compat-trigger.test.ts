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
 * SCOPE NOTE — only the workflow_runs compat trigger is still exercised
 * here. The workflows compat trigger was dropped in Slice
 * 4.ACCOUNT-MODEL-7 (workflows.create now supplies account_id +
 * created_by_user_id directly; workflows.user_id is gone) and the
 * integrations compat trigger was dropped in Slice 4.ACCOUNT-MODEL-6.
 * The workflow_runs trigger remains until the slice -8 cutover.
 *
 *   - workflowRuns.createWorkflowRunStart({ runId, workflowId, userId, ... })
 *     → row lands; account_id derived from the owning workflow;
 *     triggered_by_user_id stays NULL (engine populates it per source
 *     after slice -8).
 *   - When the caller DOES supply triggered_by_user_id, the trigger
 *     no-ops (supplied value wins).
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
import { createWorkflowRunStart } from "@/repositories/workflowRunsLifecycle";

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

  afterAll(async () => {
    if (!adminClient) return;
    for (const id of createdUserIds) {
      // workflow_runs.user_id still exists (slice -8). workflows.user_id and
      // workflow_revisions.user_id were dropped in -7, so delete workflows by
      // created_by_user_id and let workflow_revisions cascade. integrations.
      // user_id was dropped in -6 → delete by connected_by_user_id. Order
      // matters: runs + workflows (both account_id ON DELETE RESTRICT) must go
      // before their accounts.
      await adminClient.from("workflow_runs").delete().eq("user_id", id);
      await adminClient.from("workflows").delete().eq("created_by_user_id", id);
      await adminClient.from("integrations").delete().eq("connected_by_user_id", id);
      await adminClient.from("user_billing").delete().eq("user_id", id);
      await adminClient.from("account_memberships").delete().eq("user_id", id);
      await adminClient.from("accounts").delete().eq("owner_user_id", id);
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) console.warn(`cleanup: failed to delete user ${id}: ${error.message}`);
    }
  });

  // The compat-trigger sub-tests for workflows + integrations were removed in
  // Slices 4.ACCOUNT-MODEL-7 + -6 respectively — those columns (`workflows.
  // user_id`, `integrations.user_id`) are gone, their compat triggers were
  // dropped, and the repositories now supply account_id + provenance directly.
  // See `tests/integration/security/workflows-account-rls.test.ts`,
  // `integrations-account-rls.test.ts`, and the cross-account isolation tests
  // for the post-cutover surface. Only the workflow_runs trigger (dropped in
  // slice -8) is still exercised below.

  it("workflowRunsLifecycle.createWorkflowRunStart({ userId, workflowId, ... }) — existing signature inserts successfully + trigger derives account_id from owning workflow + triggered_by_user_id stays NULL", async () => {
    const userId = await createTestUser("run-start");
    const personalAccountId = await getPersonalAccountId(userId);

    // Need a workflow to point the run at — created with the post-cutover
    // account-keyed signature.
    const wf = await createWorkflow({
      accountId: personalAccountId,
      createdByUserId: userId,
      name: "Compat trigger run-host",
    });

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
        providerAccountId: "harness",
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

  // The workflows + integrations "trigger no-ops when an explicit value is
  // supplied" sub-tests were removed alongside their dropped compat triggers
  // (slices -7 / -6). The workflow_runs equivalent below stays valid until -8.

  it("trigger no-ops when triggered_by_user_id is explicitly supplied (workflow_runs)", async () => {
    const userId = await createTestUser("run-explicit");
    const personalAccountId = await getPersonalAccountId(userId);
    const wf = await createWorkflow({
      accountId: personalAccountId,
      createdByUserId: userId,
      name: "Explicit triggered_by run-host",
    });

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
          providerAccountId: "harness",
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
