/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTasksCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksCreate: (...args: unknown[]) => mockTasksCreate(...args),
}));

import { createTask } from "@/integrations/asana/actions/tasks/createTask";
import { CreateTaskConfigSchema } from "@/integrations/asana/actions/tasks/createTask.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTasksCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "asana",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-04T00:00:00Z",
    providerAccountId: "marcus@example.test",
    payload: {},
    ...overrides,
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
  name: "Returned Name",
  notes: null,
  completed: false,
  completed_at: null,
  due_on: "2026-08-01",
  due_at: null,
  assignee: { gid: "u-9" },
  projects: [{ gid: "p-1" }],
  permalink_url: "https://app.asana.com/0/p-1/t-1",
  created_at: "2026-07-04T00:00:00Z",
  modified_at: null,
};

describe("create_task schema", () => {
  it("requires projectId and name", () => {
    expect(() =>
      CreateTaskConfigSchema.parse({ name: "x" }),
    ).toThrow();
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p" }),
    ).toThrow();
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p", name: "x" }),
    ).not.toThrow();
  });

  it("validates dueOn as YYYY-MM-DD but tolerates a cleared empty string", () => {
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p", name: "x", dueOn: "08/01/2026" }),
    ).toThrow();
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p", name: "x", dueOn: "" }),
    ).not.toThrow();
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p", name: "x", dueOn: "2026-08-01" }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      CreateTaskConfigSchema.parse({ projectId: "p", name: "x", bogus: 1 }),
    ).toThrow();
  });
});

describe("create_task handler", () => {
  it("sends only present fields to the wrapper (empty optionals omitted)", async () => {
    mockTasksCreate.mockResolvedValueOnce(fullTask);
    await createTask(
      baseInput({
        workspaceId: "w-1",
        projectId: "p-1",
        name: "New task",
        notes: "",
        assigneeId: "",
        dueOn: "",
      }),
    );
    const call = mockTasksCreate.mock.calls[0]![0];
    expect(call.projectId).toBe("p-1");
    expect(call.name).toBe("New task");
    expect(call.notes).toBeUndefined();
    expect(call.assigneeGid).toBeUndefined();
    expect(call.dueOn).toBeUndefined();
    // workspaceId is UI-scope only — never sent to the API.
    expect(call.workspaceId).toBeUndefined();
  });

  it("uses refreshAndRetry with provider='asana' and trigger providerAccountId", async () => {
    mockTasksCreate.mockResolvedValueOnce(fullTask);
    await createTask(baseInput({ projectId: "p-1", name: "n" }));
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("asana");
    expect(call.accountId).toBe("acct-u");
    expect(call.providerAccountId).toBe("marcus@example.test");
  });

  it("passes null providerAccountId when the trigger isn't asana", async () => {
    mockTasksCreate.mockResolvedValueOnce(fullTask);
    await createTask({
      ...baseInput({ projectId: "p-1", name: "n" }),
      triggerEvent: trigger({ provider: "native" }),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
  });

  it("returns the bounded output shape (no raw record spread)", async () => {
    mockTasksCreate.mockResolvedValueOnce(fullTask);
    const result = await createTask(baseInput({ projectId: "p-1", name: "n" }));
    expect(result.output).toEqual({
      taskGid: "t-1",
      taskName: "Returned Name",
      permalinkUrl: "https://app.asana.com/0/p-1/t-1",
      assigneeGid: "u-9",
      dueOn: "2026-08-01",
      completed: false,
      createdAt: "2026-07-04T00:00:00Z",
    });
    // Bounded: raw-record fields never leak into the output.
    expect(result.output).not.toHaveProperty("projects");
    expect(result.output).not.toHaveProperty("notes");
  });

  it("falls back to the configured name when the provider omits it", async () => {
    mockTasksCreate.mockResolvedValueOnce({ ...fullTask, name: null, assignee: null });
    const result = await createTask(
      baseInput({ projectId: "p-1", name: "fallback" }),
    );
    expect(result.output.taskName).toBe("fallback");
    expect(result.output.assigneeGid).toBeNull();
  });

  it("propagates provider failures verbatim (engine owns classification)", async () => {
    mockTasksCreate.mockRejectedValueOnce(new Error("Asana POST /tasks failed: boom"));
    await expect(
      createTask(baseInput({ projectId: "p-1", name: "n" })),
    ).rejects.toThrow(/boom/);
  });

  it("never leaks the access token into the output", async () => {
    mockTasksCreate.mockResolvedValueOnce(fullTask);
    const result = await createTask(baseInput({ projectId: "p-1", name: "n" }));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
