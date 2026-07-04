/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTasksUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksUpdate: (...args: unknown[]) => mockTasksUpdate(...args),
}));

import { updateTask } from "@/integrations/asana/actions/tasks/updateTask";
import { UpdateTaskConfigSchema } from "@/integrations/asana/actions/tasks/updateTask.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTasksUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "asana",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-04T00:00:00Z",
    providerAccountId: "marcus@example.test",
    payload: {},
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

const updatedTask = {
  gid: "t-1",
  name: "After",
  notes: null,
  completed: false,
  completed_at: null,
  due_on: null,
  due_at: null,
  assignee: null,
  projects: [],
  permalink_url: null,
  created_at: null,
  modified_at: "2026-07-04T01:00:00Z",
};

describe("update_task schema", () => {
  it("requires taskGid", () => {
    expect(() => UpdateTaskConfigSchema.parse({ name: "x" })).toThrow();
  });

  it("requires at least one effective update field (empty strings don't count)", () => {
    expect(() => UpdateTaskConfigSchema.parse({ taskGid: "t" })).toThrow();
    expect(() =>
      UpdateTaskConfigSchema.parse({ taskGid: "t", name: "", notes: "" }),
    ).toThrow();
    expect(() =>
      UpdateTaskConfigSchema.parse({ taskGid: "t", name: "New" }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      UpdateTaskConfigSchema.parse({ taskGid: "t", name: "n", bogus: 1 }),
    ).toThrow();
  });
});

describe("update_task handler", () => {
  it("sends only the present fields (partial update, empties omitted)", async () => {
    mockTasksUpdate.mockResolvedValueOnce(updatedTask);
    await updateTask(
      baseInput({ taskGid: "t-1", name: "After", notes: "", dueOn: "" }),
    );
    const call = mockTasksUpdate.mock.calls[0]![0];
    expect(call.taskGid).toBe("t-1");
    expect(call.name).toBe("After");
    expect(call.notes).toBeUndefined();
    expect(call.dueOn).toBeUndefined();
    expect(call.completed).toBeUndefined();
  });

  it("returns the bounded output shape", async () => {
    mockTasksUpdate.mockResolvedValueOnce(updatedTask);
    const result = await updateTask(baseInput({ taskGid: "t-1", name: "After" }));
    expect(result.output).toEqual({
      taskGid: "t-1",
      taskName: "After",
      permalinkUrl: null,
      assigneeGid: null,
      dueOn: null,
      completed: false,
      modifiedAt: "2026-07-04T01:00:00Z",
    });
  });

  it("uses refreshAndRetry with provider='asana'", async () => {
    mockTasksUpdate.mockResolvedValueOnce(updatedTask);
    await updateTask(baseInput({ taskGid: "t-1", name: "After" }));
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("asana");
  });

  it("propagates provider failures verbatim", async () => {
    mockTasksUpdate.mockRejectedValueOnce(new Error("Asana resource not found: task t-1"));
    await expect(
      updateTask(baseInput({ taskGid: "t-1", name: "After" })),
    ).rejects.toThrow(/not found/);
  });
});
