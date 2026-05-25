/**
 * @jest-environment node
 *
 * Tests for repositories/hubspotSubscriptionRefs.ts.
 *
 * The repo is service-role-only — every operation runs from the
 * webhook lifecycle path with no user session. Tests mock the
 * service-role client so no network is touched.
 */

interface ChainState {
  insertPayload?: unknown;
  upsertOptions?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string } | null;
  resultCount: number | null;
  // Track .select(...) options to verify count: 'exact', head: true.
  selectOptions: unknown;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn((cols?: unknown, opts?: unknown) => {
      if (opts !== undefined) state.selectOptions = opts;
      return builder;
    }),
    upsert: jest.fn((payload: unknown, options: unknown) => {
      state.insertPayload = payload;
      state.upsertOptions = options;
      return builder;
    }),
    delete: jest.fn(() => builder),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    single: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    maybeSingle: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    then: (resolve: (v: unknown) => void) =>
      resolve({
        data: state.resultData,
        error: state.resultError,
        count: state.resultCount,
      }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  countRefs,
  deleteOne,
  listByWorkflow,
  listForDispatch,
  upsert,
} from "@/repositories/hubspotSubscriptionRefs";

const baseRow = {
  id: "ref-1",
  app_subscription_id: "sub-1",
  workflow_id: "wf-1",
  user_id: "user-1",
  node_id: "trigger-node",
  hub_id: "9876543",
  config: {},
  status: "active",
  created_at: "2026-05-10T00:00:00Z",
  updated_at: "2026-05-10T00:00:00Z",
};

function freshState(resultData: unknown = baseRow): ChainState {
  return {
    filters: [],
    resultData,
    resultError: null,
    resultCount: null,
    selectOptions: undefined,
  };
}

describe("hubspot_subscription_refs.upsert", () => {
  it("upserts on the (app_subscription_id, workflow_id, node_id) conflict target", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await upsert({
      appSubscriptionId: "sub-1",
      workflowId: "wf-1",
      userId: "user-1",
      nodeId: "trigger-node",
      hubId: "9876543",
      config: { foo: "bar" },
    });
    expect(result.id).toBe("ref-1");
    expect(state.insertPayload).toEqual({
      app_subscription_id: "sub-1",
      workflow_id: "wf-1",
      user_id: "user-1",
      node_id: "trigger-node",
      hub_id: "9876543",
      config: { foo: "bar" },
      status: "active",
    });
    expect(state.upsertOptions).toMatchObject({
      onConflict: "app_subscription_id,workflow_id,node_id",
    });
  });

  it("defaults config to empty object when omitted", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    await upsert({
      appSubscriptionId: "sub-1",
      workflowId: "wf-1",
      userId: "user-1",
      nodeId: "trigger-node",
      hubId: "9876543",
    });
    expect(state.insertPayload).toMatchObject({ config: {} });
  });

  it("throws when the upsert fails", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
      resultCount: null,
      selectOptions: undefined,
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      upsert({
        appSubscriptionId: "sub-1",
        workflowId: "wf-1",
        userId: "user-1",
        nodeId: "n",
        hubId: "1",
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("hubspot_subscription_refs.deleteOne", () => {
  it("deletes by (app_subscription_id, workflow_id, node_id) and returns the deleted row", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await deleteOne({
      appSubscriptionId: "sub-1",
      workflowId: "wf-1",
      nodeId: "trigger-node",
    });
    expect(result?.id).toBe("ref-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["app_subscription_id", "sub-1"],
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["workflow_id", "wf-1"],
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["node_id", "trigger-node"],
    });
  });

  it("returns null when no row matched (idempotent deactivation)", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const result = await deleteOne({
      appSubscriptionId: "sub-1",
      workflowId: "wf-1",
      nodeId: "trigger-node",
    });
    expect(result).toBeNull();
  });
});

describe("hubspot_subscription_refs.countRefs", () => {
  it("counts rows by app_subscription_id using count: 'exact', head: true", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      resultCount: 3,
      selectOptions: undefined,
    };
    mockServiceRole.current = makeMockClient(state);
    const count = await countRefs("sub-1");
    expect(count).toBe(3);
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["app_subscription_id", "sub-1"],
    });
    // The head:true + count:'exact' combination is the standard way to
    // get a fast count without fetching rows.
    expect(state.selectOptions).toMatchObject({
      count: "exact",
      head: true,
    });
  });

  it("returns 0 when count is null (Supabase returns null on empty result)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: null,
      resultCount: null,
      selectOptions: undefined,
    };
    mockServiceRole.current = makeMockClient(state);
    const count = await countRefs("nonexistent-sub");
    expect(count).toBe(0);
  });

  it("throws on count error", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
      resultCount: null,
      selectOptions: undefined,
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(countRefs("sub-1")).rejects.toThrow(/boom/);
  });
});

describe("hubspot_subscription_refs.listByWorkflow", () => {
  it("returns the rows for the workflow id", async () => {
    const state = freshState([baseRow, { ...baseRow, id: "ref-2" }]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listByWorkflow("wf-1");
    expect(result.map((r) => r.id)).toEqual(["ref-1", "ref-2"]);
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["workflow_id", "wf-1"],
    });
  });

  it("returns empty array when no rows exist", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listByWorkflow("wf-1");
    expect(result).toEqual([]);
  });
});

describe("hubspot_subscription_refs.listForDispatch", () => {
  it("filters by (app_subscription_id, hub_id, status='active') for receive-route routing", async () => {
    const state = freshState([baseRow]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listForDispatch({
      appSubscriptionId: "sub-1",
      hubId: "9876543",
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.workflowId).toBe("wf-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["app_subscription_id", "sub-1"],
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["hub_id", "9876543"],
    });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["status", "active"],
    });
  });

  it("returns multiple rows when multiple workflows under the same portal subscribe to the same event type", async () => {
    const state = freshState([
      baseRow,
      { ...baseRow, id: "ref-2", workflow_id: "wf-2", node_id: "n2" },
    ]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listForDispatch({
      appSubscriptionId: "sub-1",
      hubId: "9876543",
    });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.workflowId).sort()).toEqual(["wf-1", "wf-2"]);
  });
});
