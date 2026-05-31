/**
 * @jest-environment node
 *
 * Tests for repositories/aiCostEvents.ts (Slice 4.COST-6).
 * Mocks the service-role client (insert) + SSR-cookie client (list).
 */

interface InsertState {
  inserted: unknown;
  error: { message: string } | null;
}
function makeInsertClient(state: InsertState) {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(async (row: unknown) => {
        state.inserted = row;
        return { error: state.error };
      }),
    })),
  };
}

interface ListState {
  data: unknown;
  error: { message: string } | null;
}
function makeListClient(state: ListState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(async () => ({ data: state.data, error: state.error })),
  });
  return { from: jest.fn(() => builder) };
}

/**
 * Thenable range-query mock: the supabase builder is awaited directly, so all
 * chain methods return the builder and `then` resolves the result. `calls`
 * records the chain methods invoked for filter-wiring assertions.
 */
function makeRangeClient(state: ListState) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return builder;
    });
  Object.assign(builder, {
    select: chain("select"),
    gte: chain("gte"),
    lte: chain("lte"),
    eq: chain("eq"),
    order: chain("order"),
    limit: chain("limit"),
    then: (resolve: (v: ListState) => unknown) =>
      resolve({ data: state.data, error: state.error }),
  });
  return { client: { from: jest.fn(() => builder) }, calls };
}

const mockServiceRole: { current: ReturnType<typeof makeInsertClient> | null } = { current: null };
const mockSSR: { current: ReturnType<typeof makeListClient> | null } = { current: null };

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  insertEvent,
  listByWorkflow,
  listEventsForAnalytics,
  type AiCostEventInsert,
} from "@/repositories/aiCostEvents";

const sample: AiCostEventInsert = {
  accountId: "acct-1",
  userId: "user-1",
  workflowId: "wf-1",
  feature: "workflow_creation",
  eventType: "ai_model_call_completed",
  modelName: "claude-opus-4-7",
  modelProvider: "anthropic",
  inputTokens: 1000,
  outputTokens: 200,
  totalTokens: 1200,
  estimatedCostMicros: 4200,
  aiCreditsCharged: 2,
  latencyMs: 850,
  success: true,
  metadata: { intent: "create" },
};

describe("aiCostEvents.insertEvent", () => {
  it("maps camelCase → snake_case and inserts", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);
    await insertEvent(sample);
    const row = state.inserted as Record<string, unknown>;
    expect(row).toMatchObject({
      account_id: "acct-1",
      user_id: "user-1",
      workflow_id: "wf-1",
      feature: "workflow_creation",
      event_type: "ai_model_call_completed",
      model_name: "claude-opus-4-7",
      model_provider: "anthropic",
      input_tokens: 1000,
      output_tokens: 200,
      total_tokens: 1200,
      estimated_cost_micros: 4200,
      ai_credits_charged: 2,
      latency_ms: 850,
      success: true,
      metadata: { intent: "create" },
    });
    // Unset optional fields default to null, not undefined.
    expect(row.patch_id).toBeNull();
    expect(row.tool_name).toBeNull();
    expect(row.validation_error_code).toBeNull();
  });

  it("throws on insert error", async () => {
    mockServiceRole.current = makeInsertClient({ inserted: null, error: { message: "boom" } });
    await expect(insertEvent(sample)).rejects.toThrow(/ai_cost_events.insertEvent failed: boom/);
  });
});

describe("aiCostEvents.listByWorkflow", () => {
  it("maps rows back to records", async () => {
    mockSSR.current = makeListClient({
      data: [
        {
          id: "evt-1",
          user_id: "user-1",
          workflow_id: "wf-1",
          workflow_run_id: null,
          patch_id: null,
          conversation_id: null,
          feature: "workflow_repair",
          event_type: "ai_tool_failed",
          model_name: null,
          model_provider: null,
          prompt_version: null,
          input_tokens: null,
          output_tokens: null,
          total_tokens: null,
          estimated_cost_micros: null,
          ai_credits_charged: null,
          latency_ms: 12,
          tool_name: "getWorkflowGraph",
          tool_status: "failed",
          validation_error_code: null,
          safety_block_reason: null,
          accepted: null,
          success: false,
          metadata: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      error: null,
    });
    const records = await listByWorkflow("wf-1");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "evt-1",
      feature: "workflow_repair",
      eventType: "ai_tool_failed",
      toolName: "getWorkflowGraph",
      toolStatus: "failed",
      success: false,
    });
  });

  it("throws on list error", async () => {
    mockSSR.current = makeListClient({ data: null, error: { message: "nope" } });
    await expect(listByWorkflow("wf-1")).rejects.toThrow(/ai_cost_events.listByWorkflow failed: nope/);
  });
});

describe("aiCostEvents.listEventsForAnalytics (owner/admin, service-role)", () => {
  it("wires from/to/userId/feature/limit filters and maps rows", async () => {
    const { client, calls } = makeRangeClient({
      data: [
        {
          id: "evt-1",
          account_id: "acct-9",
          user_id: "u9",
          workflow_id: "wf-1",
          workflow_run_id: null,
          patch_id: null,
          conversation_id: null,
          feature: "workflow_creation",
          event_type: "ai_model_call_completed",
          model_name: "claude-opus-4-7",
          model_provider: "anthropic",
          prompt_version: null,
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          estimated_cost_micros: 500,
          ai_credits_charged: 1,
          latency_ms: 10,
          tool_name: null,
          tool_status: null,
          validation_error_code: null,
          safety_block_reason: null,
          accepted: null,
          success: true,
          metadata: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      error: null,
    });
    mockServiceRole.current = client as unknown as ReturnType<typeof makeInsertClient>;
    const records = await listEventsForAnalytics({
      from: "2026-05-01",
      to: "2026-05-31",
      accountId: "acct-9",
      feature: "workflow_creation",
      limit: 50,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "evt-1", accountId: "acct-9", userId: "u9", modelName: "claude-opus-4-7", totalTokens: 150 });
    expect(calls.gte).toEqual(["created_at", "2026-05-01"]);
    expect(calls.lte).toEqual(["created_at", "2026-05-31"]);
    expect(calls.limit).toEqual([50]);
  });

  it("works with no filters (returns []) and throws on error", async () => {
    const empty = makeRangeClient({ data: [], error: null });
    mockServiceRole.current = empty.client as unknown as ReturnType<typeof makeInsertClient>;
    expect(await listEventsForAnalytics()).toEqual([]);
    expect(empty.calls.gte).toBeUndefined();
    expect(empty.calls.limit).toBeUndefined();

    const failing = makeRangeClient({ data: null, error: { message: "down" } });
    mockServiceRole.current = failing.client as unknown as ReturnType<typeof makeInsertClient>;
    await expect(listEventsForAnalytics({ feature: "other" })).rejects.toThrow(
      /ai_cost_events.listEventsForAnalytics failed: down/,
    );
  });
});
