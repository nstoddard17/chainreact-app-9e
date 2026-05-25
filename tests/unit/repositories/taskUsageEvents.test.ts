/**
 * @jest-environment node
 *
 * Tests for repositories/taskUsageEvents.ts (Slice 4.COST-3).
 * Mocks the service-role client (insert) + SSR-cookie client (list).
 */

interface InsertState {
  inserted: unknown;
  error: { message: string } | null;
}
function makeInsertClient(state: InsertState) {
  return {
    from: jest.fn(() => ({
      insert: jest.fn(async (rows: unknown) => {
        state.inserted = rows;
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

const mockServiceRole: { current: ReturnType<typeof makeInsertClient> | null } = { current: null };
const mockSSR: { current: ReturnType<typeof makeListClient> | null } = { current: null };

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  insertEvents,
  listByRun,
  type TaskUsageEventInsert,
} from "@/repositories/taskUsageEvents";

const sampleEvent: TaskUsageEventInsert = {
  userId: "user-1",
  workflowId: "wf-1",
  workflowRunId: "run-1",
  nodeId: "a1",
  provider: "gmail",
  nodeType: "send_email",
  nodeKind: "action",
  eventType: "node_task_charged",
  billable: true,
  tasksCharged: 1,
  actualTasks: 1,
  chargeOn: "success",
  costReason: "provider_action",
  costPolicyVersion: "v1",
  testMode: false,
};

describe("taskUsageEvents.insertEvents", () => {
  it("maps camelCase → snake_case and inserts", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);
    await insertEvents([sampleEvent]);
    const rows = state.inserted as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      workflow_run_id: "run-1",
      node_id: "a1",
      node_type: "send_email",
      event_type: "node_task_charged",
      tasks_charged: 1,
      cost_policy_version: "v1",
      test_mode: false,
    });
  });

  it("is a no-op for an empty array (no client call)", async () => {
    const state: InsertState = { inserted: null, error: null };
    mockServiceRole.current = makeInsertClient(state);
    await insertEvents([]);
    expect(state.inserted).toBeNull();
  });

  it("throws on insert error", async () => {
    mockServiceRole.current = makeInsertClient({ inserted: null, error: { message: "boom" } });
    await expect(insertEvents([sampleEvent])).rejects.toThrow(/task_usage_events.insertEvents failed: boom/);
  });
});

describe("taskUsageEvents.listByRun", () => {
  it("maps rows back to records", async () => {
    mockSSR.current = makeListClient({
      data: [
        {
          id: "evt-1",
          user_id: "user-1",
          workflow_id: "wf-1",
          workflow_run_id: "run-1",
          node_id: "a1",
          provider: "gmail",
          node_type: "send_email",
          node_kind: "action",
          event_type: "node_task_charged",
          billable: true,
          tasks_charged: 1,
          estimated_tasks: null,
          actual_tasks: 1,
          charge_on: "success",
          cost_reason: "provider_action",
          cost_policy_version: "v1",
          test_mode: false,
          metadata: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      error: null,
    });
    const records = await listByRun("run-1");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "evt-1", workflowRunId: "run-1", nodeType: "send_email", tasksCharged: 1, costPolicyVersion: "v1" });
  });

  it("throws on list error", async () => {
    mockSSR.current = makeListClient({ data: null, error: { message: "nope" } });
    await expect(listByRun("run-1")).rejects.toThrow(/task_usage_events.listByRun failed: nope/);
  });
});
