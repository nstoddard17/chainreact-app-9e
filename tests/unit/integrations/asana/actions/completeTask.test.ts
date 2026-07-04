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

import { completeTask } from "@/integrations/asana/actions/tasks/completeTask";
import { CompleteTaskConfigSchema } from "@/integrations/asana/actions/tasks/completeTask.schema";

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

describe("complete_task schema", () => {
  it("requires taskGid; UI-scope fields optional; strict", () => {
    expect(() => CompleteTaskConfigSchema.parse({})).toThrow();
    expect(() =>
      CompleteTaskConfigSchema.parse({ taskGid: "t-1" }),
    ).not.toThrow();
    expect(() =>
      CompleteTaskConfigSchema.parse({
        taskGid: "t-1",
        workspaceId: "w",
        projectId: "p",
      }),
    ).not.toThrow();
    expect(() =>
      CompleteTaskConfigSchema.parse({ taskGid: "t-1", bogus: 1 }),
    ).toThrow();
  });
});

describe("complete_task handler", () => {
  it("sends completed:true and nothing else to the wrapper", async () => {
    mockTasksUpdate.mockResolvedValueOnce({
      gid: "t-1",
      completed: true,
      completed_at: "2026-07-04T02:00:00Z",
    });
    await completeTask(baseInput({ taskGid: "t-1" }));
    const call = mockTasksUpdate.mock.calls[0]![0];
    expect(call).toEqual({
      accessToken: "tok",
      taskGid: "t-1",
      completed: true,
    });
  });

  it("returns the bounded output shape", async () => {
    mockTasksUpdate.mockResolvedValueOnce({
      gid: "t-1",
      completed: true,
      completed_at: "2026-07-04T02:00:00Z",
    });
    const result = await completeTask(baseInput({ taskGid: "t-1" }));
    expect(result.output).toEqual({
      taskGid: "t-1",
      completed: true,
      completedAt: "2026-07-04T02:00:00Z",
    });
  });

  it("propagates a 404 from the wrapper", async () => {
    mockTasksUpdate.mockRejectedValueOnce(
      new Error("Asana resource not found: task t-x"),
    );
    await expect(completeTask(baseInput({ taskGid: "t-x" }))).rejects.toThrow(
      /not found/,
    );
  });
});
