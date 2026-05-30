/**
 * @jest-environment node
 */
/**
 * Reserve/Reconcile SHADOW data collection + review harness (Slice 4.COST-14E).
 *
 * Drives the REAL execution engine end-to-end against the confirmed disposable
 * dev/test Supabase so that representative workflow runs produce REAL
 * `billing_shadow_comparisons` rows, then folds them through the REAL COST-14B
 * aggregator (`getReserveReconcileShadowStats`). This is the data-collection
 * step COST-15 (internal-user live reserve/reconcile) is gated on.
 *
 * ── WHAT IS REAL (the shadow pipeline under test) ──────────────────────────
 *   - The engine (`WorkflowEngine.runWorkflow`) and its shadow integration.
 *   - The flat billing gate + `deduct_tasks_if_available` RPC (the ONLY real
 *     balance mutation — unchanged live behavior).
 *   - The COST-3 usage recorder, the run-row writer, and the COST-14C shadow
 *     recorder/repository (real upserts to the dev DB).
 *   - The COST-14B aggregator via `getReserveReconcileShadowStats`.
 *
 * ── WHAT IS STUBBED (the outside world, so NO external side effects) ────────
 *   - `handlers/_registry` → a controllable mock handler. No provider API is
 *     ever called; billable/branch/failure behavior is driven from node config.
 *   - `discovery/_registry` → deterministic action/trigger meta so billable
 *     classification is reproducible (the taskCostPolicy logic stays real).
 *   - `notifyWorkflowFailure` → no-op (failed runs send no email/Slack/etc.).
 *   - `utils/supabase/server` → throws if used; the harness only ever touches
 *     the service-role path, and this keeps `next/headers` out of jest.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 *   - Shadow flag ON (ENABLE_RESERVE_RECONCILE_SHADOW=true); LIVE reserve/
 *     reconcile flag asserted OFF (never sets ENABLE_RESERVE_RECONCILE_BILLING).
 *   - DESTRUCTIVE: creates + deletes throwaway auth users (cascade cleanup) and
 *     a handful of throwaway workflows. OPT-IN + guarded so it never runs in CI
 *     or against an unintended DB.
 *   - NEVER point this at production.
 *
 * Requirements (else the suite SKIPs):
 *   ALLOW_DB_INTEGRATION_TESTS=true
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-loaded from
 *   .env.local if present). The COST-14C migration must be applied first.
 *
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/billing/reserveReconcileShadowCollection.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ActionHandlerInput, ActionHandlerResult } from "@/services/execution/handlers/types";
import type { WorkflowNode, WorkflowEdge, WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { TriggerEvent } from "@/contracts/triggerEvent";

// ── Mocks: the outside world only. The shadow pipeline stays real. ──────────
const mockGetActionHandler = jest.fn();
const mockGetActionMeta = jest.fn();
const mockGetTriggerMeta = jest.fn();
const mockNotifyWorkflowFailure = jest.fn();

jest.mock("@/services/execution/handlers/_registry", () => ({
  getActionHandler: (...a: unknown[]) => mockGetActionHandler(...a),
}));
jest.mock("@/services/discovery/_registry", () => ({
  getActionMeta: (...a: unknown[]) => mockGetActionMeta(...a),
  getTriggerMeta: (...a: unknown[]) => mockGetTriggerMeta(...a),
}));
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: (...a: unknown[]) => mockNotifyWorkflowFailure(...a),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => {
    throw new Error("COST-14E harness: cookie-based client must not be used.");
  },
}));

// Imports of the REAL pipeline come AFTER jest.mock (hoisted) so they bind to
// the mocked dependencies.
import { WorkflowEngine } from "@/services/execution/engine";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";
import { getReserveReconcileShadowStats } from "@/services/billing/billingShadowComparisons";
import { getReserveReconcileShadowStatsByWorkflow } from "@/services/billing/billingShadowComparisons";

// ── Env: load .env.local (no override), enable shadow, keep live OFF. ────────
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
  // Make the skip reason visible without failing.
  console.log(
    "SKIP COST-14E shadow collection harness — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE: creates/deletes auth users).",
  );
}

// ── Definition builders ─────────────────────────────────────────────────────
function trig(id: string, provider = "manual", type = "manual_trigger"): WorkflowNode {
  return { id, kind: "trigger", provider, type, config: {}, position: { x: 0, y: 0 } };
}
function act(
  id: string,
  type: string,
  provider = "slack",
  config: Record<string, unknown> = {},
): WorkflowNode {
  return { id, kind: "action", provider, type, config, position: { x: 0, y: 0 } };
}
function edge(id: string, from: string, to: string, label?: string): WorkflowEdge {
  return label ? { id, from, to, label } : { id, from, to };
}

function triggerEvent(): TriggerEvent {
  return {
    provider: "manual",
    eventType: "manual_trigger",
    eventId: `cost14e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    accountId: "cost14e-harness",
    payload: { harness: true },
  };
}

describeDb("COST-14E — reserve/reconcile shadow data collection + review (dev DB)", () => {
  jest.setTimeout(120_000);

  let admin: SupabaseClient;
  const createdUserIds: string[] = [];
  const createdWorkflowIds: string[] = [];
  let user1 = "";
  let user2 = "";
  let startIso = "";

  // Captured run ids for targeted assertions.
  let wf2RunId = "";
  let testModeRunId = "";

  // Aggregate result captured for the design-doc / report write-up.
  let capturedSummary: Awaited<ReturnType<typeof getReserveReconcileShadowStats>> | null = null;

  async function createUser(): Promise<string> {
    const email = `cost14e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@chainreact-shadow-harness.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function setBilling(userId: string, limit: number, used: number): Promise<void> {
    const { error } = await admin
      .from("user_billing")
      .update({ tasks_limit: limit, tasks_used: used })
      .eq("user_id", userId);
    if (error) throw new Error(`setBilling(${userId}): ${error.message}`);
  }

  async function seedWorkflow(userId: string, name: string, def: WorkflowDefinition): Promise<string> {
    const { data, error } = await admin
      .from("workflows")
      .insert({ user_id: userId, name, draft_definition: def })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow(${name}): ${error?.message ?? "no row"}`);
    createdWorkflowIds.push(data.id);
    return data.id;
  }

  async function runReal(
    workflowId: string,
    triggerNodeId: string,
    opts: { runId?: string; testMode?: boolean } = {},
  ): Promise<string> {
    const engine = new WorkflowEngine({ resolveStrict });
    const res = await engine.runWorkflow({
      workflowId,
      triggerNodeId,
      triggerEvent: triggerEvent(),
      ...(opts.runId ? { runId: opts.runId } : {}),
      testMode: opts.testMode ?? false,
      triggeredBy: "manual",
    });
    return res.runId;
  }

  beforeAll(async () => {
    // The shadow path is read at call time — enable here, keep live OFF.
    process.env.ENABLE_RESERVE_RECONCILE_SHADOW = "true";
    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Controllable mock handler: succeeds by default; `__mockFail` throws;
    // `__mockBranch` drives label-aware traversal. NEVER calls a provider.
    mockGetActionHandler.mockReturnValue(async (input: ActionHandlerInput): Promise<ActionHandlerResult> => {
      const cfg = (input.config ?? {}) as Record<string, unknown>;
      if (cfg.__mockFail === true) {
        throw new Error("COST-14E harness: simulated handler failure");
      }
      const result: ActionHandlerResult = {
        output: { ok: true, nodeId: input.nodeId, mocked: true },
      };
      if (typeof cfg.__mockBranch === "string") result.branchTaken = cfg.__mockBranch;
      return result;
    });

    // Deterministic meta: non-native provider actions are billable (truthy
    // meta); native nodes return undefined so the real taskCostPolicy classifies
    // them by type. Trigger activation drives the cadence warning.
    mockGetActionMeta.mockImplementation((key: string) =>
      key.startsWith("native:")
        ? undefined
        : { displayName: key, category: "communication", riskLevel: "low" },
    );
    mockGetTriggerMeta.mockImplementation((key: string) => ({
      displayName: key,
      category: "communication",
      activation: key.endsWith(":message_received") ? "webhook" : "manual",
    }));
    mockNotifyWorkflowFailure.mockResolvedValue({ claimed: false, reason: "cost14e_harness" });

    user1 = await createUser();
    user2 = await createUser();
    await setBilling(user1, 1000, 0); // generous: all real runs pass the flat gate
    await setBilling(user2, 5, 4); // tight: gate passes (needs 1) but estimate(3) > remaining

    startIso = new Date(Date.now() - 5_000).toISOString();
  });

  afterAll(async () => {
    if (!admin) return;
    // Explicit FK-safe deletes by seeded ids, then drop the users (cascade).
    // Slice 4.ACCOUNT-MODEL-3: accounts.owner_user_id is ON DELETE RESTRICT,
    // so explicitly clear account_memberships + accounts before auth.admin.deleteUser.
    await admin.from("billing_shadow_comparisons").delete().in("user_id", createdUserIds);
    await admin.from("task_usage_events").delete().in("user_id", createdUserIds);
    await admin.from("workflow_runs").delete().in("user_id", createdUserIds);
    await admin.from("workflows").delete().in("user_id", createdUserIds);
    await admin.from("user_billing").delete().in("user_id", createdUserIds);
    await admin.from("account_memberships").delete().in("user_id", createdUserIds);
    await admin.from("accounts").delete().in("owner_user_id", createdUserIds);
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) {
        console.error(`cleanup: failed to delete user ${id}: ${error.message}`);
      }
    }
  });

  it("never enables the LIVE reserve/reconcile billing flag", () => {
    expect(process.env.ENABLE_RESERVE_RECONCILE_BILLING).not.toBe("true");
    expect(process.env.ENABLE_RESERVE_RECONCILE_SHADOW).toBe("true");
  });

  it("executes the representative workflow set; each real run writes one shadow row", async () => {
    // WF1 — trigger-only (no billable action): estimate 0, actual 0, delta -1.
    const wf1 = await seedWorkflow(user1, "cost14e wf1 trigger-only", {
      nodes: [trig("t1")],
      edges: [],
    });
    await runReal(wf1, "t1");

    // WF2 — 1 provider action: estimate 1, actual 1, delta 0. (idempotency anchor)
    const wf2 = await seedWorkflow(user1, "cost14e wf2 one-action", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    wf2RunId = await runReal(wf2, "t1");

    // WF3 — 3 provider actions under a WEBHOOK trigger: estimate 3, actual 3,
    // delta +2, EVENT_VOLUME_UNKNOWN warning.
    const wf3 = await seedWorkflow(user1, "cost14e wf3 three-actions", {
      nodes: [
        trig("t1", "slack", "message_received"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message"),
        act("a3", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
    });
    await runReal(wf3, "t1");

    // WF4 — native control-flow (free) + provider action: estimate 1, actual 1.
    const wf4 = await seedWorkflow(user1, "cost14e wf4 native-plus-action", {
      nodes: [
        trig("t1"),
        act("d1", "delay", "native"),
        act("f1", "format_transformer", "native"),
        act("a1", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "d1"), edge("e2", "d1", "f1"), edge("e3", "f1", "a1")],
    });
    await runReal(wf4, "t1");

    // WF5 — native:http_request (billable via override; mocked → no egress).
    const wf5 = await seedWorkflow(user1, "cost14e wf5 http-request", {
      nodes: [trig("t1"), act("h1", "http_request", "native")],
      edges: [edge("e1", "t1", "h1")],
    });
    await runReal(wf5, "t1");

    // WF6 — branching where actual < estimated: router picks branch "a"; both
    // branch actions count toward the estimate (2) but only one runs (actual 1).
    const wf6 = await seedWorkflow(user1, "cost14e wf6 branching", {
      nodes: [
        trig("t1"),
        act("r1", "router", "native", { __mockBranch: "a" }),
        act("a1", "send_channel_message"),
        act("b1", "send_channel_message"),
      ],
      edges: [
        edge("e1", "t1", "r1"),
        edge("e2", "r1", "a1", "a"),
        edge("e3", "r1", "b1", "b"),
      ],
    });
    await runReal(wf6, "t1");

    // WF7 — fails after a successful billable action: a1 succeeds, a2 throws,
    // a3 never runs. estimate 3, actual 1, run failed (no notification).
    const wf7 = await seedWorkflow(user1, "cost14e wf7 partial-failure", {
      nodes: [
        trig("t1"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message", "slack", { __mockFail: true }),
        act("a3", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
    });
    await runReal(wf7, "t1");

    // WF8 — insufficient-balance scenario on the tight-balance user: gate
    // passes (needs 1) but estimate 3 > remaining 1 → wouldHaveHadEnoughBalance
    // false. actual 3, delta +2.
    const wf8 = await seedWorkflow(user2, "cost14e wf8 insufficient-balance", {
      nodes: [
        trig("t1"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message"),
        act("a3", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
    });
    await runReal(wf8, "t1");

    // 8 distinct real runs → 8 shadow rows for the seeded users.
    const { data, error } = await admin
      .from("billing_shadow_comparisons")
      .select("workflow_run_id")
      .in("user_id", createdUserIds);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(8);
  });

  it("is idempotent on workflow_run_id (engine retry → first comparison wins, one row)", async () => {
    // Re-run WF2 with the SAME run id. The shadow upsert is ignored; the run row
    // PK-conflicts (fail-open). Exactly one shadow row remains for the run id.
    const wf2b = await seedWorkflow(user1, "cost14e wf2 idempotency", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    await runReal(wf2b, "t1", { runId: wf2RunId });

    const { data, error } = await admin
      .from("billing_shadow_comparisons")
      .select("workflow_run_id, delta_vs_flat")
      .eq("workflow_run_id", wf2RunId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(1);
    expect(data?.[0]?.delta_vs_flat).toBe(0); // WF2 first comparison (1 actual − 1 flat)
  });

  it("writes NO shadow row for a test/dry-run execution", async () => {
    const wfT = await seedWorkflow(user1, "cost14e test-mode", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    testModeRunId = await runReal(wfT, "t1", { testMode: true });

    const { data, error } = await admin
      .from("billing_shadow_comparisons")
      .select("workflow_run_id")
      .eq("workflow_run_id", testModeRunId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("LIVE flat billing is the only real balance mutation; shadow never reserves", async () => {
    const { data, error } = await admin
      .from("user_billing")
      .select("user_id, tasks_used, tasks_reserved, tasks_limit")
      .in("user_id", createdUserIds);
    expect(error).toBeNull();
    const byUser = new Map((data ?? []).map((r) => [r.user_id, r]));

    // user1: 7 real runs (WF1–7) + 1 idempotency re-run = 8 flat deductions.
    expect(byUser.get(user1)?.tasks_used).toBe(8);
    // user2: started at 4, +1 for WF8 = 5.
    expect(byUser.get(user2)?.tasks_used).toBe(5);
    // The shadow path NEVER reserves — tasks_reserved must remain 0.
    expect(byUser.get(user1)?.tasks_reserved).toBe(0);
    expect(byUser.get(user2)?.tasks_reserved).toBe(0);
  });

  it("aggregates persisted rows through the REAL COST-14B aggregator", async () => {
    const stats = await getReserveReconcileShadowStats({ from: startIso });
    capturedSummary = stats;
    const byWorkflow = await getReserveReconcileShadowStatsByWorkflow({ from: startIso });

    const s = stats.summary;
    // Surface the full review (Part D) in the test output.
    console.log("\n===== COST-14E SHADOW AGGREGATE REVIEW =====");
    console.log(JSON.stringify({ summary: s, delta: stats.delta, insufficientBalance: stats.insufficientBalance }, null, 2));
    console.log("byWorkflow:", JSON.stringify(byWorkflow, null, 2));
    console.log("===== END COST-14E REVIEW =====\n");

    // Internal consistency of the aggregate.
    expect(s.total).toBe(8);
    expect(s.flatTotalCharged).toBe(8); // 1 flat task per real run
    expect(s.totalDelta).toBe(s.proposedTotalCharged - s.flatTotalCharged);
    expect(s.averageDelta).toBeCloseTo(s.totalDelta / s.total, 6);
    expect(s.higherThanFlatCount + s.lowerThanFlatCount + s.sameAsFlatCount).toBe(8);
    expect(s.estimateVsActualVariance).toBe(s.totalEstimatedTasks - s.totalActualBillableTasks);
    // At least one insufficient-balance row (WF8) and one branching warning (WF6).
    expect(s.insufficientBalanceCount).toBeGreaterThanOrEqual(1);
    expect(s.byWarningCode["BRANCHING_UPPER_BOUND"]).toBeGreaterThanOrEqual(1);
    expect(s.byPolicyVersion["v1"]).toBe(8);
  });

  it("leaves no harness residue after cleanup", async () => {
    // Run the cleanup the afterAll will also do, then assert zero rows — proves
    // the harness is self-cleaning (afterAll re-running delete is a no-op).
    await admin.from("billing_shadow_comparisons").delete().in("user_id", createdUserIds);
    await admin.from("task_usage_events").delete().in("user_id", createdUserIds);
    await admin.from("workflow_runs").delete().in("user_id", createdUserIds);
    await admin.from("workflows").delete().in("user_id", createdUserIds);

    const shadow = await admin
      .from("billing_shadow_comparisons")
      .select("id")
      .in("user_id", createdUserIds);
    expect(shadow.data?.length ?? 0).toBe(0);

    expect(capturedSummary).not.toBeNull();
  });
});
