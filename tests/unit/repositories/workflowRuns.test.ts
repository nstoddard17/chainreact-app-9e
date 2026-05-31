/**
 * @jest-environment node
 *
 * Tests for repositories/workflowRuns.ts.
 *
 * Mocks both the SSR-cookie + service-role clients to exercise the two
 * code paths (recordRun via service role, listByWorkflow via SSR).
 */

interface ChainState {
  insertPayload?: unknown;
  updatePayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string; code?: string } | null;
  /** Single-row result for `.maybeSingle()`. Set per-test. */
  maybeSingleResult?: { data: unknown; error: { message: string } | null };
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    insert: jest.fn((payload: unknown) => {
      state.insertPayload = payload;
      return builder;
    }),
    update: jest.fn((payload: unknown) => {
      state.updatePayload = payload;
      return builder;
    }),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    neq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "neq", args: [col, val] });
      return builder;
    }),
    is: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "is", args: [col, val] });
      return builder;
    }),
    lt: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "lt", args: [col, val] });
      return builder;
    }),
    in: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "in", args: [col, val] });
      return builder;
    }),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () =>
      state.maybeSingleResult ?? { data: null, error: null },
    ),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};
const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  getById,
  listByWorkflow,
  recordRun,
  createWorkflowRunStart,
  finalizeWorkflowRun,
  markWorkflowRunFailedBeforeExecution,
  getWorkflowRunForBilling,
  sweepStaleRunningWorkflowRuns,
} from "@/repositories/workflowRuns";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi" },
};

describe("workflowRuns.recordRun", () => {
  it("INSERTs all fields and uses the runId as the row id", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await recordRun({
      runId: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-1",
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps: [{ nodeId: "t1", status: "succeeded", output: {} }],
      startedAt: "2026-05-07T00:00:00Z",
      finishedAt: "2026-05-07T00:00:01Z",
      isTest: false,
      triggeredBy: "unknown",
    });
    expect(state.insertPayload).toMatchObject({
      id: "run-1",
      workflow_id: "wf-1",
      account_id: "acct-1",
      triggered_by_user_id: "user-1",
      status: "succeeded",
      trigger_node_id: "t1",
      trigger_event: triggerEvent,
      fatal_error: null,
      error_classification: null,
      // Slice 3.SEC-2 — provenance columns always written by the engine.
      is_test: false,
      triggered_by: "unknown",
    });
  });

  it("persists is_test=true and triggered_by='test' when supplied (Slice 3.SEC-2)", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await recordRun({
      runId: "run-test",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-1",
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps: [{ nodeId: "t1", status: "succeeded", output: {} }],
      startedAt: "2026-05-07T00:00:00Z",
      finishedAt: "2026-05-07T00:00:01Z",
      isTest: true,
      triggeredBy: "test",
    });
    const payload = state.insertPayload as Record<string, unknown>;
    expect(payload.is_test).toBe(true);
    expect(payload.triggered_by).toBe("test");
  });

  it("persists is_test=false and triggered_by='webhook' for webhook-dispatched runs", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await recordRun({
      runId: "run-wh",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-1",
      status: "succeeded",
      triggerNodeId: "t1",
      triggerEvent,
      steps: [],
      startedAt: "2026-05-07T00:00:00Z",
      finishedAt: "2026-05-07T00:00:01Z",
      isTest: false,
      triggeredBy: "webhook",
    });
    const payload = state.insertPayload as Record<string, unknown>;
    expect(payload.is_test).toBe(false);
    expect(payload.triggered_by).toBe("webhook");
  });

  it("persists fatal_error + error_classification when supplied", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await recordRun({
      runId: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-1",
      status: "failed",
      triggerNodeId: "t1",
      triggerEvent,
      steps: [],
      fatalError: { code: "TRIGGER_NODE_NOT_FOUND", message: "missing" },
      errorClassification: {
        title: "Trigger node missing",
        description: "...",
        severity: "warning",
      },
      startedAt: "2026-05-07T00:00:00Z",
      finishedAt: "2026-05-07T00:00:01Z",
      isTest: false,
      triggeredBy: "unknown",
    });
    const payload = state.insertPayload as Record<string, unknown>;
    expect(payload.fatal_error).toMatchObject({ code: "TRIGGER_NODE_NOT_FOUND" });
    expect(payload.error_classification).toMatchObject({ severity: "warning" });
  });

  it("propagates Supabase insert errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "duplicate key" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      recordRun({
        runId: "run-1",
        workflowId: "wf-1",
        accountId: "acct-1",
        triggeredByUserId: "user-1",
        status: "succeeded",
        triggerNodeId: "t1",
        triggerEvent,
        steps: [],
        startedAt: "x",
        finishedAt: "y",
        isTest: false,
        triggeredBy: "unknown",
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("workflowRuns.listByWorkflow", () => {
  it("filters by workflow_id and respects the default limit (25)", async () => {
    const row = {
      id: "run-1",
      workflow_id: "wf-1",
      account_id: "acct-1",
      triggered_by_user_id: "user-1",
      status: "succeeded",
      trigger_node_id: "t1",
      trigger_event: triggerEvent,
      steps: [],
      fatal_error: null,
      error_classification: null,
      started_at: "2026-05-07T00:00:00Z",
      finished_at: "2026-05-07T00:00:01Z",
      created_at: "2026-05-07T00:00:00Z",
    };
    const state: ChainState = { filters: [], resultData: [row], resultError: null };
    mockSSR.current = makeMockClient(state);
    const result = await listByWorkflow("wf-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("run-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["workflow_id", "wf-1"],
    });
    // COST-15C — in-progress (running) rows are excluded from the UI list.
    expect(state.filters).toContainEqual({ op: "neq", args: ["status", "running"] });
  });

  it("caps the limit at 100 even when the caller asks for more", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockSSR.current = makeMockClient(state);
    const limitSpy = mockSSR.current.from().limit as unknown as jest.Mock;
    await listByWorkflow("wf-1", { limit: 999 });
    // limitSpy is the .limit() mock from the chain; assert the cap applied.
    expect(limitSpy).toHaveBeenLastCalledWith(100);
  });

  it("returns an empty array when no runs exist", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockSSR.current = makeMockClient(state);
    const result = await listByWorkflow("wf-1");
    expect(result).toEqual([]);
  });
});

describe("workflowRuns.getById", () => {
  const row = {
    id: "run-1",
    workflow_id: "wf-1",
    account_id: "acct-1",
    triggered_by_user_id: "user-1",
    status: "succeeded" as const,
    trigger_node_id: "t1",
    trigger_event: triggerEvent,
    steps: [{ nodeId: "t1", status: "succeeded" as const, output: { ok: true } }],
    fatal_error: null,
    error_classification: null,
    started_at: "2026-05-07T00:00:00Z",
    finished_at: "2026-05-07T00:00:01Z",
    created_at: "2026-05-07T00:00:00Z",
  };

  it("returns the record when the row exists", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: row, error: null },
    };
    mockSSR.current = makeMockClient(state);
    const result = await getById("run-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("run-1");
    expect(result!.workflowId).toBe("wf-1");
    expect(result!.steps).toHaveLength(1);
    expect(result!.steps[0]?.output).toEqual({ ok: true });
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "run-1"] });
    // COST-15C — a 'running' row is excluded so the detail surface stays
    // terminal-only (an in-progress run reads as not-yet-available / null).
    expect(state.filters).toContainEqual({ op: "neq", args: ["status", "running"] });
  });

  it("returns null when the row does not exist (RLS or missing)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: null, error: null },
    };
    mockSSR.current = makeMockClient(state);
    const result = await getById("run-missing");
    expect(result).toBeNull();
  });

  it("propagates Supabase errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: null, error: { message: "boom" } },
    };
    mockSSR.current = makeMockClient(state);
    await expect(getById("run-1")).rejects.toThrow(/boom/);
  });
});

// ── Pre-run lifecycle (Slice 4.COST-15B) ─────────────────────────────────────

describe("workflowRuns.createWorkflowRunStart", () => {
  const baseInput = {
    runId: "run-1",
    workflowId: "wf-1",
    accountId: "acct-1",
    triggeredByUserId: "user-1",
    triggerNodeId: "t1",
    triggerEvent,
    startedAt: "2026-05-25T00:00:00Z",
    isTest: false,
    triggeredBy: "manual" as const,
  };

  it("INSERTs a 'running' row with finished_at NULL and billing_status unset", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await createWorkflowRunStart({
      ...baseInput,
      estimatedTaskCost: 3,
      taskCostPolicyVersion: "v1",
    });
    expect(result).toEqual({ created: true });
    const payload = state.insertPayload as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: "run-1",
      workflow_id: "wf-1",
      account_id: "acct-1",
      triggered_by_user_id: "user-1",
      status: "running",
      trigger_node_id: "t1",
      finished_at: null,
      is_test: false,
      triggered_by: "manual",
      estimated_task_cost: 3,
      actual_task_cost: null,
      task_cost_policy_version: "v1",
    });
    // No reservation is taken at create time.
    expect("billing_status" in payload).toBe(false);
  });

  it("is duplicate-safe: PK conflict (23505) returns created:false and does not throw", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "duplicate key value", code: "23505" },
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await createWorkflowRunStart(baseInput);
    expect(result).toEqual({ created: false });
  });

  it("propagates non-conflict Supabase errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "connection reset" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(createWorkflowRunStart(baseInput)).rejects.toThrow(/connection reset/);
  });
});

describe("workflowRuns.finalizeWorkflowRun", () => {
  it("UPDATEs the existing row to succeeded and sets finished_at", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await finalizeWorkflowRun({
      runId: "run-1",
      status: "succeeded",
      steps: [{ nodeId: "t1", status: "succeeded", output: {} }],
      finishedAt: "2026-05-25T00:00:05Z",
      actualTaskCost: 2,
    });
    expect(result).toEqual({ finalized: true });
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: "succeeded",
      finished_at: "2026-05-25T00:00:05Z",
      actual_task_cost: 2,
    });
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "run-1"] });
  });

  it("UPDATEs the existing row to failed", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await finalizeWorkflowRun({
      runId: "run-1",
      status: "failed",
      steps: [],
      fatalError: { code: "HANDLER_FAILED", message: "boom" },
      finishedAt: "2026-05-25T00:00:05Z",
    });
    expect(result).toEqual({ finalized: true });
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.fatal_error).toMatchObject({ code: "HANDLER_FAILED" });
  });

  it("preserves billing/reservation fields (never writes them)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    await finalizeWorkflowRun({
      runId: "run-1",
      status: "succeeded",
      steps: [],
      finishedAt: "2026-05-25T00:00:05Z",
    });
    const payload = state.updatePayload as Record<string, unknown>;
    for (const k of [
      "billing_status",
      "reserved_task_cost",
      "reconciled_task_cost",
      "reservation_id",
      "reservation_expires_at",
      "billing_reconciled_at",
    ]) {
      expect(k in payload).toBe(false);
    }
  });

  it("does not write cost columns that were not supplied (undefined ⇒ untouched)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    await finalizeWorkflowRun({
      runId: "run-1",
      status: "succeeded",
      steps: [],
      finishedAt: "2026-05-25T00:00:05Z",
    });
    const payload = state.updatePayload as Record<string, unknown>;
    expect("actual_task_cost" in payload).toBe(false);
    expect("estimated_task_cost" in payload).toBe(false);
    expect("task_cost_policy_version" in payload).toBe(false);
  });

  it("returns finalized:false when no row matched (no insert fallback)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await finalizeWorkflowRun({
      runId: "missing",
      status: "succeeded",
      steps: [],
      finishedAt: "2026-05-25T00:00:05Z",
    });
    expect(result).toEqual({ finalized: false });
    // It is an UPDATE, never an INSERT.
    expect(state.insertPayload).toBeUndefined();
  });

  it("propagates Supabase errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "update failed" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      finalizeWorkflowRun({
        runId: "run-1",
        status: "succeeded",
        steps: [],
        finishedAt: "x",
      }),
    ).rejects.toThrow(/update failed/);
  });
});

describe("workflowRuns.markWorkflowRunFailedBeforeExecution", () => {
  it("UPDATEs a running row to failed without touching billing fields", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "run-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await markWorkflowRunFailedBeforeExecution({
      runId: "run-1",
      fatalError: { code: "BILLING_EXHAUSTED", message: "quota" },
      finishedAt: "2026-05-25T00:00:02Z",
    });
    expect(result).toEqual({ updated: true });
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: "failed",
      fatal_error: { code: "BILLING_EXHAUSTED" },
      finished_at: "2026-05-25T00:00:02Z",
    });
    expect("billing_status" in payload).toBe(false);
  });

  it("returns updated:false when no row matched", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await markWorkflowRunFailedBeforeExecution({
      runId: "missing",
      fatalError: { code: "BILLING_EXHAUSTED", message: "quota" },
      finishedAt: "x",
    });
    expect(result).toEqual({ updated: false });
  });
});

describe("workflowRuns.getWorkflowRunForBilling", () => {
  it("maps reserve/reconcile + cost fields to camelCase and exposes no payloads", async () => {
    const row = {
      id: "run-1",
      account_id: "acct-1",
      workflow_id: "wf-1",
      status: "running" as const,
      is_test: false,
      billing_status: "reserved" as const,
      reserved_task_cost: 3,
      reconciled_task_cost: null,
      estimated_task_cost: 3,
      actual_task_cost: null,
      reservation_id: "run-1",
      reservation_expires_at: "2026-05-25T01:00:00Z",
      billing_reconciled_at: null,
      finished_at: null,
    };
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: row, error: null },
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await getWorkflowRunForBilling("run-1");
    expect(result).toEqual({
      id: "run-1",
      accountId: "acct-1",
      workflowId: "wf-1",
      status: "running",
      isTest: false,
      billingStatus: "reserved",
      reservedTaskCost: 3,
      reconciledTaskCost: null,
      estimatedTaskCost: 3,
      actualTaskCost: null,
      reservationId: "run-1",
      reservationExpiresAt: "2026-05-25T01:00:00Z",
      billingReconciledAt: null,
      finishedAt: null,
    });
    // No raw payloads / secrets leak into the billing projection.
    expect("triggerEvent" in (result as object)).toBe(false);
    expect("steps" in (result as object)).toBe(false);
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "run-1"] });
  });

  it("returns null when the row does not exist", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: null, error: null },
    };
    mockServiceRole.current = makeMockClient(state);
    expect(await getWorkflowRunForBilling("missing")).toBeNull();
  });

  it("propagates Supabase errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      maybeSingleResult: { data: null, error: { message: "kaboom" } },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(getWorkflowRunForBilling("run-1")).rejects.toThrow(/kaboom/);
  });
});

// ── Stale 'running' run sweep (Slice 4.COST-15F) ─────────────────────────────

describe("workflowRuns.sweepStaleRunningWorkflowRuns", () => {
  const cutoff = "2026-05-25T00:00:00Z";
  const finishedAt = "2026-05-25T01:00:00Z";
  const fatalError = { code: "EXECUTION_INTERRUPTED", message: "interrupted" };
  const errorClassification = {
    title: "Run interrupted",
    description: "interrupted",
    severity: "error" as const,
  };

  it("marks matching rows failed, sets finish/classification, preserves billing fields", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "r1" }, { id: "r2" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);

    const result = await sweepStaleRunningWorkflowRuns({
      cutoff,
      fatalError,
      errorClassification,
      finishedAt,
    });

    expect(result).toEqual({ sweptCount: 2, runIds: ["r1", "r2"], cutoff });
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: "failed",
      finished_at: finishedAt,
      fatal_error: fatalError,
      error_classification: errorClassification,
    });
    // Predicate: status=running, finished_at IS NULL, started_at < cutoff.
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "running"] });
    expect(state.filters).toContainEqual({ op: "is", args: ["finished_at", null] });
    expect(state.filters).toContainEqual({ op: "lt", args: ["started_at", cutoff] });
    // Billing/reservation fields are NEVER written by the sweep.
    for (const k of [
      "billing_status",
      "reserved_task_cost",
      "reconciled_task_cost",
      "reservation_id",
      "reservation_expires_at",
      "billing_reconciled_at",
    ]) {
      expect(k in payload).toBe(false);
    }
  });

  it("is idempotent: a re-run that matches no rows returns sweptCount 0", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await sweepStaleRunningWorkflowRuns({
      cutoff,
      fatalError,
      errorClassification,
      finishedAt,
    });
    expect(result).toEqual({ sweptCount: 0, runIds: [], cutoff });
  });

  it("honors a batch limit: pre-selects ids then UPDATEs scoped to them", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "r1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await sweepStaleRunningWorkflowRuns({
      cutoff,
      fatalError,
      errorClassification,
      finishedAt,
      limit: 1,
    });
    expect(result.sweptCount).toBe(1);
    // The UPDATE is scoped to the pre-selected ids.
    expect(state.filters).toContainEqual({ op: "in", args: ["id", ["r1"]] });
  });

  it("limit path short-circuits when the pre-select finds nothing (no UPDATE)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await sweepStaleRunningWorkflowRuns({
      cutoff,
      fatalError,
      errorClassification,
      finishedAt,
      limit: 5,
    });
    expect(result).toEqual({ sweptCount: 0, runIds: [], cutoff });
    expect(state.updatePayload).toBeUndefined();
  });

  it("propagates Supabase errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "sweep boom" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      sweepStaleRunningWorkflowRuns({ cutoff, fatalError, errorClassification, finishedAt }),
    ).rejects.toThrow(/sweep boom/);
  });
});
