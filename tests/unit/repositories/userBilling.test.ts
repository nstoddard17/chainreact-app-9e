/**
 * @jest-environment node
 *
 * Tests for repositories/userBilling.ts.
 *
 * Mocks both the SSR-cookie + service-role clients to exercise the two
 * code paths (deductTasks via service role + RPC, getUsage via SSR
 * cookie + RLS).
 */

interface ChainState {
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockSelectClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    maybeSingle: jest.fn(async () => ({
      data: state.resultData,
      error: state.resultError,
    })),
  });
  return { from: jest.fn(() => builder), state };
}

interface RpcState {
  calledWith?: { fn: string; params: unknown };
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockRpcClient(state: RpcState) {
  return {
    rpc: jest.fn(async (fn: string, params: unknown) => {
      state.calledWith = { fn, params };
      return { data: state.resultData, error: state.resultError };
    }),
  };
}

const mockSSR: { current: ReturnType<typeof makeMockSelectClient> | null } = {
  current: null,
};
const mockServiceRole: { current: ReturnType<typeof makeMockRpcClient> | null } = {
  current: null,
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  deductTasks,
  getUsage,
  reserveTasks,
  reconcileReservation,
  releaseReservation,
  releaseExpiredReservations,
} from "@/repositories/userBilling";

describe("userBilling.deductTasks", () => {
  it("calls deduct_tasks_if_available with the user id + amount and unwraps ok=true", async () => {
    const state: RpcState = {
      resultData: { ok: true, used: 5, limit: 100 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await deductTasks("user-1", 1);
    expect(state.calledWith).toEqual({
      fn: "deduct_tasks_if_available",
      params: { p_user_id: "user-1", p_amount: 1 },
    });
    expect(result).toEqual({ ok: true, used: 5, limit: 100 });
  });

  it("unwraps ok=false (limit reached) preserving used + limit", async () => {
    const state: RpcState = {
      resultData: { ok: false, used: 100, limit: 100 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await deductTasks("user-1", 1);
    expect(result).toEqual({ ok: false, used: 100, limit: 100 });
  });

  it("propagates RPC errors with a clear message", async () => {
    const state: RpcState = {
      resultData: null,
      resultError: { message: "permission denied for function deduct_tasks_if_available" },
    };
    mockServiceRole.current = makeMockRpcClient(state);
    await expect(deductTasks("user-1", 1)).rejects.toThrow(
      /deduct_tasks_if_available RPC failed: permission denied/,
    );
  });
});

describe("userBilling.getUsage", () => {
  it("returns the usage shape when a row exists", async () => {
    const state: ChainState = {
      filters: [],
      resultData: {
        tasks_used: 7,
        tasks_limit: 100,
        period_started_at: "2026-05-07T00:00:00Z",
      },
      resultError: null,
    };
    mockSSR.current = makeMockSelectClient(state);
    const result = await getUsage("user-1");
    expect(result).toEqual({
      tasksUsed: 7,
      tasksLimit: 100,
      periodStartedAt: "2026-05-07T00:00:00Z",
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["user_id", "user-1"],
    });
  });

  it("returns null when no row exists (RLS-blocked or fresh user)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
    };
    mockSSR.current = makeMockSelectClient(state);
    const result = await getUsage("user-1");
    expect(result).toBeNull();
  });

  it("propagates Supabase select errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "syntax error" },
    };
    mockSSR.current = makeMockSelectClient(state);
    await expect(getUsage("user-1")).rejects.toThrow(/syntax error/);
  });
});

// ─── Reserve / reconcile wrappers (COST-12) ──────────────────────────────────
//
// These exercise only the repo wrapper mapping (RPC name, params, return
// pass-through, error propagation) against a mocked RPC. The RPC *behavior*
// (atomic capacity predicate, idempotency, clamping, counters-never-negative)
// is PL/pgSQL in 20260525000002_reserve_reconcile_billing.sql and requires a
// live-DB harness to test — the project has no pgTAP/DB-integration harness
// yet, so RPC-logic verification is deferred to that harness (see the design
// doc §17 test matrix).

describe("userBilling.reserveTasks", () => {
  it("calls reserve_tasks_if_available with user/amount/run/expiry and returns the result", async () => {
    const state: RpcState = {
      resultData: { ok: true, reason: "reserved", used: 5, reserved: 3, limit: 100, amount: 3 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await reserveTasks("user-1", 3, "run-1", "2026-05-25T01:00:00Z");
    expect(state.calledWith).toEqual({
      fn: "reserve_tasks_if_available",
      params: { p_user_id: "user-1", p_amount: 3, p_run_id: "run-1", p_expires_at: "2026-05-25T01:00:00Z" },
    });
    expect(result).toEqual({ ok: true, reason: "reserved", used: 5, reserved: 3, limit: 100, amount: 3 });
  });

  it("defaults expiry to null when omitted and passes ok:false through", async () => {
    const state: RpcState = {
      resultData: { ok: false, reason: "insufficient_tasks", used: 100, reserved: 0, limit: 100, amount: 3 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await reserveTasks("user-1", 3, "run-1");
    expect((state.calledWith!.params as { p_expires_at: unknown }).p_expires_at).toBeNull();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("insufficient_tasks");
  });

  it("propagates RPC errors", async () => {
    mockServiceRole.current = makeMockRpcClient({ resultData: null, resultError: { message: "boom" } });
    await expect(reserveTasks("user-1", 1, "run-1")).rejects.toThrow(
      /reserve_tasks_if_available RPC failed: boom/,
    );
  });
});

describe("userBilling.reconcileReservation", () => {
  it("calls reconcile_task_reservation and returns charged/refunded", async () => {
    const state: RpcState = {
      resultData: { ok: true, reason: "reconciled", used: 7, reserved: 0, limit: 100, charged: 2, refunded: 1 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await reconcileReservation("user-1", "run-1", 2);
    expect(state.calledWith).toEqual({
      fn: "reconcile_task_reservation",
      params: { p_user_id: "user-1", p_run_id: "run-1", p_actual: 2 },
    });
    expect(result).toMatchObject({ ok: true, charged: 2, refunded: 1 });
  });

  it("propagates RPC errors", async () => {
    mockServiceRole.current = makeMockRpcClient({ resultData: null, resultError: { message: "nope" } });
    await expect(reconcileReservation("user-1", "run-1", 1)).rejects.toThrow(
      /reconcile_task_reservation RPC failed: nope/,
    );
  });
});

describe("userBilling.releaseReservation", () => {
  it("calls release_task_reservation and returns released amount", async () => {
    const state: RpcState = {
      resultData: { ok: true, reason: "released", reserved: 0, limit: 100, released: 3 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await releaseReservation("user-1", "run-1");
    expect(state.calledWith).toEqual({
      fn: "release_task_reservation",
      params: { p_user_id: "user-1", p_run_id: "run-1" },
    });
    expect(result).toMatchObject({ ok: true, released: 3 });
  });

  it("propagates RPC errors", async () => {
    mockServiceRole.current = makeMockRpcClient({ resultData: null, resultError: { message: "down" } });
    await expect(releaseReservation("user-1", "run-1")).rejects.toThrow(
      /release_task_reservation RPC failed: down/,
    );
  });
});

describe("userBilling.releaseExpiredReservations", () => {
  it("calls release_expired_reservations and maps snake_case → camelCase", async () => {
    const state: RpcState = {
      resultData: { ok: true, released_count: 2, released_tasks: 5 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    const result = await releaseExpiredReservations("2026-05-25T02:00:00Z");
    expect(state.calledWith).toEqual({
      fn: "release_expired_reservations",
      params: { p_now: "2026-05-25T02:00:00Z" },
    });
    expect(result).toEqual({ ok: true, releasedCount: 2, releasedTasks: 5 });
  });

  it("defaults p_now to an ISO timestamp when omitted", async () => {
    const state: RpcState = {
      resultData: { ok: true, released_count: 0, released_tasks: 0 },
      resultError: null,
    };
    mockServiceRole.current = makeMockRpcClient(state);
    await releaseExpiredReservations();
    const params = state.calledWith!.params as { p_now: string };
    expect(typeof params.p_now).toBe("string");
    expect(() => new Date(params.p_now).toISOString()).not.toThrow();
  });

  it("propagates RPC errors", async () => {
    mockServiceRole.current = makeMockRpcClient({ resultData: null, resultError: { message: "sweep-fail" } });
    await expect(releaseExpiredReservations()).rejects.toThrow(
      /release_expired_reservations RPC failed: sweep-fail/,
    );
  });
});
