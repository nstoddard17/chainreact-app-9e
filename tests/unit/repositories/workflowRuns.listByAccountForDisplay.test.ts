/**
 * @jest-environment node
 *
 * Tests for repositories/workflowRuns.ts:listByAccountForDisplay
 * (Slice 4.RUNS-PAGE-1; account-scoped in 4.ACCOUNT-MODEL-8).
 *
 * Pins the column-by-column safety contract that backs the `/runs`
 * route's DTO. Bypassing this projection (or selecting the wrong
 * column set) would let raw `trigger_event` / `steps` / `fatal_error`
 * blobs reach the client.
 */

interface ChainState {
  selectColumns?: string;
  filters: Array<{ op: string; args: unknown[] }>;
  orderArgs?: { column: string; opts?: unknown };
  limitArg?: number;
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn((columns?: string) => {
      state.selectColumns = columns;
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
    order: jest.fn((column: string, opts?: unknown) => {
      state.orderArgs = { column, opts };
      return builder;
    }),
    limit: jest.fn((n: number) => {
      state.limitArg = n;
      return builder;
    }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockSSR.current),
}));

import { listByAccountForDisplay } from "@/repositories/workflowRuns";

beforeEach(() => {
  mockSSR.current = null;
});

describe("workflowRuns.listByAccountForDisplay", () => {
  it("selects ONLY the safe display columns (no trigger_event / steps / fatal_error / billing)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockSSR.current = makeMockClient(state);
    await listByAccountForDisplay("user-1");

    const selected = (state.selectColumns ?? "").split(",").map((c) => c.trim());
    expect(selected.sort()).toEqual(
      [
        "id",
        "workflow_id",
        "status",
        "is_test",
        "triggered_by",
        // RH-3 — non-secret API-key prefix snapshot (display attribution).
        "triggered_by_api_key_prefix",
        "started_at",
        "finished_at",
        "error_classification",
      ].sort(),
    );
    for (const banned of [
      "trigger_event",
      "steps",
      "fatal_error",
      "user_id",
      // Sensitive API-key material must NEVER be in the display projection.
      "triggered_by_api_key_id",
      "key_hash",
      "reserved_task_cost",
      "actual_task_cost",
      "estimated_task_cost",
      "reservation_id",
      "billing_status",
      "billing_reconciled_at",
    ]) {
      expect(selected).not.toContain(banned);
    }
  });

  it("filters by account_id, does NOT filter on status (RUN-VISIBILITY-1), orders by started_at DESC, applies default limit 50", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockSSR.current = makeMockClient(state);
    await listByAccountForDisplay("user-42");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["account_id", "user-42"],
    });
    // TEST-SUITE-GREEN-1 — this assertion was INVERTED, not dropped. It used to
    // require `.neq("status","running")`, but RUN-VISIBILITY-1 (b2826b355,
    // 2026-06-29, "surface queued/running/stale runs on the /runs page")
    // deliberately removed that filter so a just-started run appears immediately
    // instead of only once it finalizes — a whole slice that also reshaped the
    // status contract, the badge, and the row copy. Pinning the exclusion again
    // would re-break that feature, so the guard now pins the REAL contract: the
    // account scope is the ONLY predicate, and no status filter may creep back.
    // The no-leak half of this file (the column projection) is untouched.
    expect(state.filters).toEqual([{ op: "eq", args: ["account_id", "user-42"] }]);
    expect(state.orderArgs).toEqual({
      column: "started_at",
      opts: { ascending: false },
    });
    expect(state.limitArg).toBe(50);
  });

  it("caps an explicit limit at 200 (defensive ceiling against unbounded UI lists)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockSSR.current = makeMockClient(state);
    await listByAccountForDisplay("u", { limit: 999 });
    expect(state.limitArg).toBe(200);
  });

  it("maps snake_case row → camelCase record without leaking unknown columns", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [
        {
          id: "r1",
          workflow_id: "wf-1",
          status: "failed",
          is_test: true,
          triggered_by: "webhook",
          started_at: "2026-05-30T12:00:00Z",
          finished_at: "2026-05-30T12:00:01Z",
          error_classification: {
            title: "T",
            description: "D",
            severity: "error",
          },
          // Belt-and-suspenders: even if the DB driver hands back extra
          // columns by mistake, the mapper should ignore them.
          trigger_event: { payload: { secret: "should not appear" } },
          steps: [{ output: { token: "should not appear" } }],
          fatal_error: { code: "internal", message: "noisy" },
        },
      ],
      resultError: null,
    };
    mockSSR.current = makeMockClient(state);
    const rows = await listByAccountForDisplay("u");
    expect(rows).toEqual([
      {
        id: "r1",
        workflowId: "wf-1",
        status: "failed",
        isTest: true,
        triggeredBy: "webhook",
        startedAt: "2026-05-30T12:00:00Z",
        finishedAt: "2026-05-30T12:00:01Z",
        errorClassification: {
          title: "T",
          description: "D",
          severity: "error",
        },
      },
    ]);
    for (const row of rows) {
      expect("triggerEvent" in row).toBe(false);
      expect("trigger_event" in row).toBe(false);
      expect("steps" in row).toBe(false);
      expect("fatalError" in row).toBe(false);
      expect("fatal_error" in row).toBe(false);
      expect("userId" in row).toBe(false);
      expect("user_id" in row).toBe(false);
    }
  });

  it("throws when the underlying query errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "rls denied" },
    };
    mockSSR.current = makeMockClient(state);
    await expect(listByAccountForDisplay("u")).rejects.toThrow(/rls denied/);
  });
});
