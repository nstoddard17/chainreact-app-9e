/**
 * @jest-environment node
 *
 * Tests for repositories/workflowRunsDiagnostics.ts (Slice 4.MCP-STAGE-2B-3, CS-1).
 *
 * Proves the sessionless service-role readers (a) use ONLY the service-role
 * client, (b) CAN include `running` rows when requested (and exclude them by
 * default), and (c) perform NO mutation (insert/update/delete never called).
 */

interface ChainState {
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string } | null;
  maybeSingleResult?: { data: unknown; error: { message: string } | null };
  inserts: number;
  updates: number;
  deletes: number;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    insert: jest.fn(() => {
      state.inserts += 1;
      return builder;
    }),
    update: jest.fn(() => {
      state.updates += 1;
      return builder;
    }),
    delete: jest.fn(() => {
      state.deletes += 1;
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
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => state.maybeSingleResult ?? { data: null, error: null }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = { current: null };
const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = { current: null };

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
} from "@/repositories/workflowRunsDiagnostics";
import { createClient } from "@/utils/supabase/server";

function freshState(): ChainState {
  return {
    filters: [],
    resultData: [],
    resultError: null,
    inserts: 0,
    updates: 0,
    deletes: 0,
  };
}

const runningRow = {
  id: "run-1",
  workflow_id: "wf-1",
  account_id: "acct-1",
  triggered_by_user_id: null,
  status: "running",
  trigger_node_id: "trigger-1",
  trigger_event: { type: "manual" },
  steps: [],
  fatal_error: null,
  error_classification: null,
  started_at: "2026-06-01T00:00:00Z",
  finished_at: "2026-06-01T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  is_test: false,
  triggered_by: "manual",
  triggered_by_api_key_id: null,
  triggered_by_api_key_prefix: null,
};

beforeEach(() => {
  mockSSR.current = makeMockClient(freshState());
  mockServiceRole.current = makeMockClient(freshState());
  (createClient as jest.Mock).mockClear();
});

describe("getByIdServiceRole", () => {
  it("returns a RUNNING row (widened status) via the service-role client", async () => {
    mockServiceRole.current!.state.maybeSingleResult = { data: runningRow, error: null };
    const rec = await getByIdServiceRole("run-1");
    expect(rec?.status).toBe("running");
    expect(rec?.accountId).toBe("acct-1");
    // service-role only; the SSR/cookie client is never constructed.
    expect(createClient).not.toHaveBeenCalled();
    // filtered by id, NOT by status — no terminal-only exclusion.
    const filters = mockServiceRole.current!.state.filters;
    expect(filters).toContainEqual({ op: "eq", args: ["id", "run-1"] });
    expect(filters.some((f) => f.op === "neq")).toBe(false);
  });

  it("returns null when nothing matches", async () => {
    mockServiceRole.current!.state.maybeSingleResult = { data: null, error: null };
    expect(await getByIdServiceRole("missing")).toBeNull();
  });

  it("performs NO mutation", async () => {
    mockServiceRole.current!.state.maybeSingleResult = { data: runningRow, error: null };
    await getByIdServiceRole("run-1");
    const s = mockServiceRole.current!.state;
    expect(s.inserts).toBe(0);
    expect(s.updates).toBe(0);
    expect(s.deletes).toBe(0);
  });
});

describe("listByWorkflowServiceRole", () => {
  it("EXCLUDES running by default (neq status running)", async () => {
    mockServiceRole.current!.state.resultData = [];
    await listByWorkflowServiceRole("wf-1");
    expect(mockServiceRole.current!.state.filters).toContainEqual({
      op: "neq",
      args: ["status", "running"],
    });
  });

  it("INCLUDES running when includeRunning is true (no neq filter)", async () => {
    mockServiceRole.current!.state.resultData = [runningRow];
    const rows = await listByWorkflowServiceRole("wf-1", { includeRunning: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("running");
    expect(mockServiceRole.current!.state.filters.some((f) => f.op === "neq")).toBe(false);
  });

  it("uses the service-role client and performs NO mutation", async () => {
    mockServiceRole.current!.state.resultData = [runningRow];
    await listByWorkflowServiceRole("wf-1", { includeRunning: true });
    expect(createClient).not.toHaveBeenCalled();
    const s = mockServiceRole.current!.state;
    expect(s.inserts + s.updates + s.deletes).toBe(0);
  });
});
