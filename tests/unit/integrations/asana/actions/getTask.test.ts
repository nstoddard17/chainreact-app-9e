/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTasksGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksGet: (...args: unknown[]) => mockTasksGet(...args),
}));

import { getTask } from "@/integrations/asana/actions/tasks/getTask";
import { GetTaskConfigSchema } from "@/integrations/asana/actions/tasks/getTask.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTasksGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "asana",
    eventType: "new_task_in_project",
    eventId: "evt-1",
    occurredAt: "2026-07-04T00:00:00Z",
    providerAccountId: "p-1",
    payload: { taskGid: "t-1" },
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

const fullTask = {
  gid: "t-1",
  name: "The Task",
  notes: "Some notes",
  completed: false,
  completed_at: null,
  due_on: "2026-08-01",
  due_at: null,
  assignee: { gid: "u-9", name: "Alice" },
  projects: [{ gid: "p-1" }, { gid: "p-2" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-01T00:00:00Z",
  modified_at: "2026-07-03T00:00:00Z",
};

describe("get_task schema", () => {
  it("requires taskGid; strict", () => {
    expect(() => GetTaskConfigSchema.parse({})).toThrow();
    expect(() => GetTaskConfigSchema.parse({ taskGid: "t-1" })).not.toThrow();
    expect(() =>
      GetTaskConfigSchema.parse({ taskGid: "t-1", bogus: 1 }),
    ).toThrow();
  });
});

describe("get_task handler", () => {
  it("returns the full bounded output shape", async () => {
    mockTasksGet.mockResolvedValueOnce(fullTask);
    const result = await getTask(baseInput({ taskGid: "t-1" }));
    expect(result.output).toEqual({
      taskGid: "t-1",
      taskName: "The Task",
      notes: "Some notes",
      completed: false,
      completedAt: null,
      dueOn: "2026-08-01",
      dueAt: null,
      assigneeGid: "u-9",
      assigneeName: "Alice",
      projectGids: ["p-1", "p-2"],
      permalinkUrl: "https://app.asana.com/0/p-1/t-1",
      createdAt: "2026-07-01T00:00:00Z",
      modifiedAt: "2026-07-03T00:00:00Z",
    });
  });

  it("nulls absent optional fields (honest nullable contract)", async () => {
    mockTasksGet.mockResolvedValueOnce({
      gid: "t-2",
      name: null,
      notes: null,
      completed: null,
      completed_at: null,
      due_on: null,
      due_at: null,
      assignee: null,
      projects: null,
      permalink_url: null,
      created_at: null,
      modified_at: null,
    });
    const result = await getTask(baseInput({ taskGid: "t-2" }));
    expect(result.output).toEqual({
      taskGid: "t-2",
      taskName: null,
      notes: null,
      completed: false,
      completedAt: null,
      dueOn: null,
      dueAt: null,
      assigneeGid: null,
      assigneeName: null,
      projectGids: [],
      permalinkUrl: null,
      createdAt: null,
      modifiedAt: null,
    });
  });

  it("reads the taskGid the trigger supplied (chaining path)", async () => {
    mockTasksGet.mockResolvedValueOnce(fullTask);
    await getTask(baseInput({ taskGid: "t-1" }));
    expect(mockTasksGet.mock.calls[0]![0].taskGid).toBe("t-1");
    // Trigger provider IS asana → providerAccountId threads through.
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe("p-1");
  });
});
