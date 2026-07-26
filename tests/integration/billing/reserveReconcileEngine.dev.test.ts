/**
 * @jest-environment node
 */
/**
 * Live reserve/reconcile ENGINE verification harness (Slice 4.COST-15I).
 *
 * Drives the REAL execution engine (`WorkflowEngine.runWorkflow`) end-to-end
 * against the confirmed disposable dev/test Supabase with the LIVE
 * reserve/reconcile flag ON (`ENABLE_RESERVE_RECONCILE_BILLING=true`). COST-15H
 * wired the engine to reserve/reconcile but its unit tests MOCK the service
 * layer; this harness proves the real engine path mutates the real DB:
 * pre-run row → reserve RPC → mocked handlers → actual usage → reconcile RPC →
 * user_billing + workflow_runs + task_usage_events, with NO flat deduction in
 * reserve mode.
 *
 * ── WHAT IS REAL (the path under test) ──────────────────────────────────────
 *   - WorkflowEngine.runWorkflow + its billing-path selection.
 *   - estimateWorkflowTaskCost (real taskCostPolicy; meta is mocked so
 *     billability is deterministic, the COST-2 classification stays real).
 *   - createBillingReservation / reconcileBillingReservation services → the
 *     real userBilling repo wrappers → the real COST-12 RPCs (real balance
 *     mutation on user_billing).
 *   - The pre-run workflow_runs row lifecycle (create-at-start + finalize).
 *   - computeRunTaskUsage + recordRunActuals (real task_usage_events writes).
 *
 * ── WHAT IS STUBBED (the outside world — NO external side effects) ───────────
 *   - handlers/_registry → controllable mock handler (no provider API; billable
 *     / branch / failure behavior driven from node config).
 *   - discovery/_registry → deterministic action/trigger meta.
 *   - notifyWorkflowFailure → no-op (failed runs send no email/Slack/etc.).
 *   - utils/supabase/server → throws if used; harness only touches service-role.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 *   - LIVE flag ON only inside this process (beforeAll), restored in afterAll.
 *   - DESTRUCTIVE: creates + deletes throwaway auth users (cascade cleanup) and
 *     throwaway workflows/runs/events. OPT-IN + guarded so it never runs in CI
 *     or against an unintended DB.
 *   - NEVER point this at production.
 *
 * Requirements (else the suite SKIPs):
 *   ALLOW_DB_INTEGRATION_TESTS=true
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-loaded from
 *   .env.local if present). COST-3/12/14C/15B migrations must be applied first.
 *
 * Run (bash):
 *   ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/billing/reserveReconcileEngine.dev.test.ts
 * Run (PowerShell):
 *   $env:ALLOW_DB_INTEGRATION_TESTS="true"; npx jest tests/integration/billing/reserveReconcileEngine.dev.test.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupFixtures, createFixtureTracker, createTrackedUser } from "@/tests/helpers/dbFixtureCleanup";

import type {
  ActionHandlerInput,
  ActionHandlerResult,
} from "@/services/execution/handlers/types";
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowDefinition,
} from "@/contracts/workflowDefinition";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { RunResult } from "@/services/execution/engine";

// ── Mocks: the outside world only. The billing pipeline stays real. ─────────
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
  // TEST-SUITE-GREEN-1 — the engine gained a pre-dispatch readiness gate
  // (engine.ts -> checkWorkflowReadiness), which reads the FULL registry. This
  // partial mock predates it, so every run died with
  // "listAllActionMetas is not a function" before any billing code ran.
  // Empty lists keep the gate at GRAPH-INTEGRITY only: with no required-field
  // metadata for these synthetic node types there are no field gaps, so the
  // harness still proves the reserve/reconcile pipeline rather than readiness
  // (which has its own suites). The graphs built here are valid, so the gate
  // passes for the right reason.
  listAllActionMetas: () => [],
  listAllTriggerMetas: () => [],
}));
jest.mock("@/services/notifications/notifyWorkflowFailure", () => ({
  notifyWorkflowFailure: (...a: unknown[]) => mockNotifyWorkflowFailure(...a),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => {
    throw new Error("COST-15I harness: cookie-based client must not be used.");
  },
}));

// Imports of the REAL pipeline come AFTER jest.mock (hoisted).
import { WorkflowEngine } from "@/services/execution/engine";
import { resolveStrict } from "@/workflow-engine/variables/resolveValue";

// ── Env: load .env.local (no override). Flags set in beforeAll. ─────────────
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
    "SKIP COST-15I reserve/reconcile engine harness — set ALLOW_DB_INTEGRATION_TESTS=true with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DESTRUCTIVE: creates/deletes auth users).",
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
    eventId: `cost15i-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    providerAccountId: "cost15i-harness",
    payload: { harness: true },
  };
}

describeDb("COST-15I — live reserve/reconcile engine verification (dev DB)", () => {
  jest.setTimeout(180_000);

  let admin: SupabaseClient;
  const fixtures = createFixtureTracker();

  // Remember the live flag's pre-suite value so afterAll restores it.
  const PRIOR_LIVE = process.env.ENABLE_RESERVE_RECONCILE_BILLING;
  const PRIOR_SHADOW = process.env.ENABLE_RESERVE_RECONCILE_SHADOW;

  async function createUser(): Promise<string> {
    const { userId } = await createTrackedUser(admin, fixtures, "rr-engine");
    return userId;
  }

  /**
   * Set the account's quota counters. 4.ACCOUNT-MODEL-9c: live billing is
   * account-scoped, so the engine charges account_billing (keyed on the
   * workflow's account). handle_new_user dual-seeds the account_billing row;
   * this upserts the test values onto the user's personal account.
   */
  async function setBilling(
    userId: string,
    opts: { limit: number; used: number; reserved?: number },
  ): Promise<void> {
    const accountId = await personalAccountId(userId);
    const { error } = await admin
      .from("account_billing")
      .upsert(
        {
          account_id: accountId,
          tasks_limit: opts.limit,
          tasks_used: opts.used,
          tasks_reserved: opts.reserved ?? 0,
          // TEST-SUITE-GREEN-1 — case 3 exercises a `router` node, and the
          // engine now gates advanced (If/Else) branching on Pro+ BEFORE
          // readiness and billing, so a default `free` fixture aborted the run
          // with PLAN_FEATURE_REQUIRED and zero task deduction — nothing for
          // this suite to measure. These cases verify reserve/reconcile MATH,
          // not entitlement (which has its own coverage), so the fixture
          // account is seeded entitled. No assertion here reads plan/plan_status;
          // the BILLING_EXHAUSTED case still turns purely on tasks_limit.
          plan: "pro",
          plan_status: "active",
        },
        { onConflict: "account_id" },
      );
    if (error) throw new Error(`setBilling(${userId}): ${error.message}`);
  }

  interface Billing {
    tasks_used: number;
    tasks_reserved: number;
    tasks_limit: number;
  }
  async function getBilling(userId: string): Promise<Billing> {
    const accountId = await personalAccountId(userId);
    const { data, error } = await admin
      .from("account_billing")
      .select("tasks_used, tasks_reserved, tasks_limit")
      .eq("account_id", accountId)
      .single<Billing>();
    if (error) throw new Error(`getBilling(${userId}): ${error.message}`);
    return data;
  }

  interface RunRow {
    status: string;
    billing_status: string | null;
    reserved_task_cost: number | null;
    reconciled_task_cost: number | null;
    estimated_task_cost: number | null;
    actual_task_cost: number | null;
    billing_reconciled_at: string | null;
    finished_at: string | null;
    is_test: boolean;
  }
  async function getRun(runId: string): Promise<RunRow> {
    const { data, error } = await admin
      .from("workflow_runs")
      .select(
        "status, billing_status, reserved_task_cost, reconciled_task_cost, estimated_task_cost, actual_task_cost, billing_reconciled_at, finished_at, is_test",
      )
      .eq("id", runId)
      .single<RunRow>();
    if (error) throw new Error(`getRun(${runId}): ${error.message}`);
    return data;
  }

  interface UsageRow {
    event_type: string;
    billable: boolean;
    tasks_charged: number;
    node_id: string | null;
  }
  async function getUsageEvents(runId: string): Promise<UsageRow[]> {
    const { data, error } = await admin
      .from("task_usage_events")
      .select("event_type, billable, tasks_charged, node_id")
      .eq("workflow_run_id", runId);
    if (error) throw new Error(`getUsageEvents(${runId}): ${error.message}`);
    return (data ?? []) as UsageRow[];
  }
  function nodeCharges(events: UsageRow[]): UsageRow[] {
    return events.filter((e) => e.event_type === "node_task_charged");
  }

  /**
   * The user's personal account (seeded by handle_new_user at createUser time).
   * Phase B (4.ACCOUNT-MODEL-6/7/8) made workflows + workflow_runs account-owned;
   * billing stays user-scoped, and the reserve/reconcile RPCs resolve the billed
   * user through accounts.owner_user_id (4.ACCOUNT-MODEL-9a).
   */
  async function personalAccountId(userId: string): Promise<string> {
    const { data, error } = await admin
      .from("accounts")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("type", "personal")
      .single<{ id: string }>();
    if (error || !data) {
      throw new Error(`personalAccountId(${userId}): ${error?.message ?? "no row"}`);
    }
    return data.id;
  }

  async function seedWorkflow(
    userId: string,
    name: string,
    def: WorkflowDefinition,
  ): Promise<string> {
    const accountId = await personalAccountId(userId);
    const { data, error } = await admin
      .from("workflows")
      .insert({ account_id: accountId, created_by_user_id: userId, name, draft_definition: def })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) throw new Error(`seedWorkflow(${name}): ${error?.message ?? "no row"}`);
    return data.id;
  }

  async function runReal(
    workflowId: string,
    triggerNodeId: string,
    opts: { runId?: string; testMode?: boolean } = {},
  ): Promise<RunResult> {
    const engine = new WorkflowEngine({ resolveStrict });
    return engine.runWorkflow({
      workflowId,
      triggerNodeId,
      triggerEvent: triggerEvent(),
      ...(opts.runId ? { runId: opts.runId } : {}),
      testMode: opts.testMode ?? false,
      triggeredBy: "manual",
    });
  }

  /** Create a fresh user with the given quota and return its id. */
  async function freshUser(limit: number, used: number): Promise<string> {
    const userId = await createUser();
    await setBilling(userId, { limit, used, reserved: 0 });
    return userId;
  }

  beforeAll(async () => {
    if (!RUN) return;
    // LIVE reserve/reconcile ON for the engine path under test; shadow OFF
    // (case 9 toggles it locally). Flags are read at call time.
    process.env.ENABLE_RESERVE_RECONCILE_BILLING = "true";
    delete process.env.ENABLE_RESERVE_RECONCILE_SHADOW;

    admin = createClient(URL as string, SERVICE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Controllable mock handler: succeeds by default; `__mockFail` throws;
    // `__mockBranch` drives label-aware traversal. NEVER calls a provider.
    mockGetActionHandler.mockReturnValue(
      async (input: ActionHandlerInput): Promise<ActionHandlerResult> => {
        const cfg = (input.config ?? {}) as Record<string, unknown>;
        if (cfg.__mockFail === true) {
          throw new Error("COST-15I harness: simulated handler failure");
        }
        const result: ActionHandlerResult = {
          output: { ok: true, nodeId: input.nodeId, mocked: true },
        };
        if (typeof cfg.__mockBranch === "string") result.branchTaken = cfg.__mockBranch;
        return result;
      },
    );

    // Deterministic meta: non-native provider actions are billable (truthy
    // meta); native nodes return undefined so the real taskCostPolicy
    // classifies them by type (control-flow free, http_request override).
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
    mockNotifyWorkflowFailure.mockResolvedValue({ claimed: false, reason: "cost15i_harness" });
  });

  afterAll(async () => {
    // Restore the flags to their pre-suite state.
    if (PRIOR_LIVE === undefined) delete process.env.ENABLE_RESERVE_RECONCILE_BILLING;
    else process.env.ENABLE_RESERVE_RECONCILE_BILLING = PRIOR_LIVE;
    if (PRIOR_SHADOW === undefined) delete process.env.ENABLE_RESERVE_RECONCILE_SHADOW;
    else process.env.ENABLE_RESERVE_RECONCILE_SHADOW = PRIOR_SHADOW;

    if (!admin) return;
    // The ledger tables are the one thing the shared teardown cannot cover:
    // 20260531000008_ledger_anonymization repointed
    // billing_shadow_comparisons.account_id / task_usage_events.account_id at
    // accounts with ON DELETE SET NULL (so ledger history survives an account
    // delete). They are therefore NOT cascaded away and must be cleared here,
    // BEFORE cleanupFixtures removes the accounts they are keyed on.
    const userIds = [...fixtures.userIds];
    if (userIds.length > 0) {
      const { data: accts } = await admin.from("accounts").select("id").in("owner_user_id", userIds);
      const accountIds = ((accts ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (accountIds.length > 0) {
        await admin.from("billing_shadow_comparisons").delete().in("account_id", accountIds);
        await admin.from("task_usage_events").delete().in("account_id", accountIds);
      }
    }
    await cleanupFixtures(admin, fixtures);
  });

  it("sanity: LIVE flag on, shadow off", () => {
    expect(process.env.ENABLE_RESERVE_RECONCILE_BILLING).toBe("true");
    expect(process.env.ENABLE_RESERVE_RECONCILE_SHADOW).not.toBe("true");
  });

  // ── 4.ACCOUNT-MODEL-9c cutover — billing charges the ACCOUNT, not the actor ─
  it("cutover: charge lands on the workflow's account_billing while the run has NO actor (triggered_by_user_id null)", async () => {
    const userId = await freshUser(1000, 0);
    const accountId = await personalAccountId(userId);
    const wf = await seedWorkflow(userId, "9c cutover account-charge", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    // runReal passes no triggeredByUserId → triggered_by_user_id is NULL (a
    // non-human/unknown-actor run); billing must still charge the account.
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("succeeded");

    // The charge landed on account_billing (the workflow's account).
    expect((await getBilling(userId)).tasks_used).toBe(1);

    // The run carries the workflow's account and NO actor — proving the billing
    // key is account_id, never triggered_by_user_id.
    const { data: row, error } = await admin
      .from("workflow_runs")
      .select("account_id, triggered_by_user_id")
      .eq("id", res.runId)
      .single<{ account_id: string; triggered_by_user_id: string | null }>();
    expect(error).toBeNull();
    expect(row!.account_id).toBe(accountId);
    expect(row!.triggered_by_user_id).toBeNull();
  });

  // ── Case 1 — successful one-action workflow ────────────────────────────────
  it("case 1: one-action run reserves 1, reconciles 1, no flat deduction", async () => {
    const userId = await freshUser(1000, 10);
    const wf = await seedWorkflow(userId, "cost15i c1 one-action", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("succeeded");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(11); // 10 + reconcile charge 1 (NOT +1 flat too)
    expect(b.tasks_reserved).toBe(0); // hold released back to 0

    const r = await getRun(res.runId);
    expect(r.status).toBe("succeeded");
    expect(r.billing_status).toBe("reconciled");
    expect(r.reserved_task_cost).toBe(1); // estimate
    expect(r.reconciled_task_cost).toBe(1); // actual
    expect(r.estimated_task_cost).toBe(1);
    expect(r.actual_task_cost).toBe(1);
    expect(r.billing_reconciled_at).not.toBeNull();

    const events = await getUsageEvents(res.runId);
    expect(nodeCharges(events).length).toBe(1);
    expect(events.some((e) => e.event_type === "run_estimate_recorded")).toBe(true);
  });

  // ── Case 2 — multi-action workflow ─────────────────────────────────────────
  it("case 2: three-action run reserves 3, reconciles 3", async () => {
    const userId = await freshUser(1000, 0);
    const wf = await seedWorkflow(userId, "cost15i c2 three-action", {
      nodes: [
        trig("t1"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message"),
        act("a3", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
    });
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("succeeded");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(3);
    expect(b.tasks_reserved).toBe(0);

    const r = await getRun(res.runId);
    expect(r.billing_status).toBe("reconciled");
    expect(r.reserved_task_cost).toBe(3);
    expect(r.reconciled_task_cost).toBe(3);
    expect(r.actual_task_cost).toBe(3);
    expect(nodeCharges(await getUsageEvents(res.runId)).length).toBe(3);
  });

  // ── Case 3 — branching: estimate > actual, refund the difference ───────────
  it("case 3: branching reserves estimate(2), reconciles actual(1), refunds 1", async () => {
    const userId = await freshUser(1000, 0);
    const wf = await seedWorkflow(userId, "cost15i c3 branching", {
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
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("succeeded");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(1); // only branch "a" ran → charged 1
    expect(b.tasks_reserved).toBe(0); // unused reserve (1) released

    const r = await getRun(res.runId);
    expect(r.billing_status).toBe("reconciled");
    expect(r.reserved_task_cost).toBe(2); // upper-bound estimate (both branches)
    expect(r.reconciled_task_cost).toBe(1); // actual
    expect(r.actual_task_cost).toBe(1);
    expect(nodeCharges(await getUsageEvents(res.runId)).length).toBe(1);
  });

  // ── Case 4 — trigger-only / zero-billable ──────────────────────────────────
  it("case 4: trigger-only run reserves 0, reconciles 0, balance untouched", async () => {
    const userId = await freshUser(1000, 7);
    const wf = await seedWorkflow(userId, "cost15i c4 trigger-only", {
      nodes: [trig("t1")],
      edges: [],
    });
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("succeeded");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(7); // unchanged
    expect(b.tasks_reserved).toBe(0);

    const r = await getRun(res.runId);
    expect(r.billing_status).toBe("reconciled");
    expect(r.reserved_task_cost).toBe(0);
    expect(r.reconciled_task_cost).toBe(0);
    expect(r.estimated_task_cost).toBe(0);
    expect(r.actual_task_cost).toBe(0);

    const events = await getUsageEvents(res.runId);
    expect(nodeCharges(events).length).toBe(0); // no billable node charged
  });

  // ── Case 5 — partial failure: reconcile only the successful billable node ───
  it("case 5: partial failure reserves 3, reconciles 1 (a1 only), run failed", async () => {
    const userId = await freshUser(1000, 0);
    const wf = await seedWorkflow(userId, "cost15i c5 partial-failure", {
      nodes: [
        trig("t1"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message", "slack", { __mockFail: true }),
        act("a3", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
    });
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("failed");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(1); // only a1 charged
    expect(b.tasks_reserved).toBe(0); // remainder (2) released

    const r = await getRun(res.runId);
    expect(r.status).toBe("failed");
    expect(r.billing_status).toBe("reconciled");
    expect(r.reserved_task_cost).toBe(3);
    expect(r.reconciled_task_cost).toBe(1);
    expect(r.actual_task_cost).toBe(1);
    expect(nodeCharges(await getUsageEvents(res.runId)).length).toBe(1);
  });

  // ── Case 6 — insufficient tasks: reserve fails before any handler ──────────
  it("case 6: insufficient reserve aborts before handlers, BILLING_EXHAUSTED", async () => {
    // limit 5, used 4 → available 1; 2-action workflow estimate 2 > 1.
    const userId = await freshUser(5, 4);
    const wf = await seedWorkflow(userId, "cost15i c6 insufficient", {
      nodes: [
        trig("t1"),
        act("a1", "send_channel_message"),
        act("a2", "send_channel_message"),
      ],
      edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
    });
    const res = await runReal(wf, "t1");
    expect(res.status).toBe("failed");
    expect(res.fatalError?.code).toBe("BILLING_EXHAUSTED");

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(4); // unchanged — no flat deduction, no reconcile
    expect(b.tasks_reserved).toBe(0); // never held

    const r = await getRun(res.runId);
    expect(r.status).toBe("failed");
    expect(r.billing_status).toBe("failed"); // reserve RPC stamped failed
    expect(r.reconciled_task_cost).toBeNull(); // never reconciled

    expect((await getUsageEvents(res.runId)).length).toBe(0); // no ledger rows
  });

  // ── Case 7 — test mode: no reserve, no reconcile, no flat, no ledger ───────
  it("case 7: test-mode run skips all billing + ledger", async () => {
    const userId = await freshUser(1000, 20);
    const wf = await seedWorkflow(userId, "cost15i c7 test-mode", {
      nodes: [trig("t1"), act("a1", "send_channel_message")],
      edges: [edge("e1", "t1", "a1")],
    });
    const res = await runReal(wf, "t1", { testMode: true });
    expect(res.status).toBe("succeeded");
    expect(res.isTest).toBe(true);

    const b = await getBilling(userId);
    expect(b.tasks_used).toBe(20); // unchanged
    expect(b.tasks_reserved).toBe(0);

    const r = await getRun(res.runId);
    expect(r.is_test).toBe(true);
    expect(r.billing_status).toBeNull(); // no reservation lifecycle
    expect(r.reserved_task_cost).toBeNull();
    expect(r.reconciled_task_cost).toBeNull();

    expect((await getUsageEvents(res.runId)).length).toBe(0); // no ledger rows
    const { data: shadow } = await admin
      .from("billing_shadow_comparisons")
      .select("id")
      .eq("workflow_run_id", res.runId);
    expect(shadow?.length ?? 0).toBe(0); // no shadow row
  });

  // ── Case 8 — rollback: flag OFF → flat path deducts 1, no reserve/reconcile ─
  it("case 8: flag OFF rolls back to flat 1/run, no reserve/reconcile state", async () => {
    process.env.ENABLE_RESERVE_RECONCILE_BILLING = "false";
    try {
      const userId = await freshUser(1000, 0);
      const wf = await seedWorkflow(userId, "cost15i c8 flat-rollback", {
        nodes: [
          trig("t1"),
          act("a1", "send_channel_message"),
          act("a2", "send_channel_message"),
          act("a3", "send_channel_message"),
        ],
        edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2"), edge("e3", "a2", "a3")],
      });
      const res = await runReal(wf, "t1");
      expect(res.status).toBe("succeeded");

      const b = await getBilling(userId);
      expect(b.tasks_used).toBe(1); // flat 1/run regardless of 3 actions
      expect(b.tasks_reserved).toBe(0); // never reserved

      const r = await getRun(res.runId);
      expect(r.status).toBe("succeeded");
      expect(r.billing_status).toBeNull(); // no reserve/reconcile lifecycle
      expect(r.reserved_task_cost).toBeNull();
      expect(r.reconciled_task_cost).toBeNull();
      // COST-3 ledger still records actuals in flat mode (3 billable nodes).
      expect(nodeCharges(await getUsageEvents(res.runId)).length).toBe(3);
    } finally {
      process.env.ENABLE_RESERVE_RECONCILE_BILLING = "true";
    }
  });

  // ── Case 9 (optional) — shadow ON with reserve mode: read-only, no double ──
  it("case 9: shadow ON + reserve mode → shadow row persists, no extra mutation", async () => {
    process.env.ENABLE_RESERVE_RECONCILE_SHADOW = "true";
    try {
      const userId = await freshUser(1000, 0);
      const wf = await seedWorkflow(userId, "cost15i c9 shadow-plus-reserve", {
        nodes: [
          trig("t1"),
          act("a1", "send_channel_message"),
          act("a2", "send_channel_message"),
        ],
        edges: [edge("e1", "t1", "a1"), edge("e2", "a1", "a2")],
      });
      const res = await runReal(wf, "t1");
      expect(res.status).toBe("succeeded");

      // Reserve/reconcile still the ONLY balance mutation (shadow never bills).
      const b = await getBilling(userId);
      expect(b.tasks_used).toBe(2); // reconcile charge 2 (NOT +1 flat / +shadow)
      expect(b.tasks_reserved).toBe(0);

      const r = await getRun(res.runId);
      expect(r.billing_status).toBe("reconciled");
      expect(r.reconciled_task_cost).toBe(2);

      // Shadow comparison persisted (read-only side-channel).
      const { data: shadow } = await admin
        .from("billing_shadow_comparisons")
        .select("id, workflow_run_id")
        .eq("workflow_run_id", res.runId);
      expect(shadow?.length ?? 0).toBe(1);
    } finally {
      delete process.env.ENABLE_RESERVE_RECONCILE_SHADOW;
    }
  });
});
