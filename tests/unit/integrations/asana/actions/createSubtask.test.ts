/**
 * @jest-environment node
 *
 * ASANA-2 — `asana:create_subtask` handler + schema.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTasksCreateSubtask = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksCreateSubtask: (...args: unknown[]) => mockTasksCreateSubtask(...args),
}));

import { createSubtask } from "@/integrations/asana/actions/tasks/createSubtask";
import { CreateSubtaskConfigSchema } from "@/integrations/asana/actions/tasks/createSubtask.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTasksCreateSubtask.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    provider: "asana",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-06T00:00:00Z",
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

const fullSubtask = {
  gid: "st-1",
  name: "Returned Subtask",
  notes: null,
  completed: false,
  completed_at: null,
  due_on: "2026-08-01",
  due_at: null,
  assignee: { gid: "u-9" },
  projects: [],
  permalink_url: "https://app.asana.com/0/p-1/st-1",
  created_at: "2026-07-06T00:00:00Z",
  modified_at: null,
};

describe("create_subtask schema", () => {
  it("requires parentTaskGid and name", () => {
    expect(() => CreateSubtaskConfigSchema.parse({ name: "x" })).toThrow();
    expect(() =>
      CreateSubtaskConfigSchema.parse({ parentTaskGid: "t-1" }),
    ).toThrow();
    expect(() =>
      CreateSubtaskConfigSchema.parse({ parentTaskGid: "t-1", name: "x" }),
    ).not.toThrow();
  });

  it("validates dueOn as YYYY-MM-DD but tolerates a cleared empty string", () => {
    expect(() =>
      CreateSubtaskConfigSchema.parse({
        parentTaskGid: "t-1",
        name: "x",
        dueOn: "08/01/2026",
      }),
    ).toThrow();
    expect(() =>
      CreateSubtaskConfigSchema.parse({ parentTaskGid: "t-1", name: "x", dueOn: "" }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      CreateSubtaskConfigSchema.parse({ parentTaskGid: "t-1", name: "x", bogus: 1 }),
    ).toThrow();
  });
});

describe("create_subtask handler", () => {
  it("sends only present fields to the wrapper (empty optionals omitted; UI-scope fields never sent)", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce(fullSubtask);
    await createSubtask(
      baseInput({
        workspaceId: "w-1",
        projectId: "p-1",
        parentTaskGid: "t-1",
        name: "New subtask",
        notes: "",
        assigneeId: "",
        dueOn: "",
      }),
    );
    const call = mockTasksCreateSubtask.mock.calls[0]![0];
    expect(call.parentTaskGid).toBe("t-1");
    expect(call.name).toBe("New subtask");
    expect(call.notes).toBeUndefined();
    expect(call.assigneeGid).toBeUndefined();
    expect(call.dueOn).toBeUndefined();
    expect(call.workspaceId).toBeUndefined();
    expect(call.projectId).toBeUndefined();
  });

  it("uses refreshAndRetry with provider='asana' and trigger providerAccountId", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce(fullSubtask);
    await createSubtask(baseInput({ parentTaskGid: "t-1", name: "n" }));
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("asana");
    expect(call.accountId).toBe("acct-u");
    expect(call.providerAccountId).toBe("marcus@example.test");
  });

  it("passes null providerAccountId when the trigger isn't asana", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce(fullSubtask);
    await createSubtask({
      ...baseInput({ parentTaskGid: "t-1", name: "n" }),
      triggerEvent: trigger({ provider: "native" }),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBeNull();
  });

  it("returns the bounded output shape including parentTaskGid (no raw record spread)", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce(fullSubtask);
    const result = await createSubtask(
      baseInput({ parentTaskGid: "t-1", name: "n" }),
    );
    expect(result.output).toEqual({
      taskGid: "st-1",
      taskName: "Returned Subtask",
      parentTaskGid: "t-1",
      permalinkUrl: "https://app.asana.com/0/p-1/st-1",
      assigneeGid: "u-9",
      dueOn: "2026-08-01",
      completed: false,
      createdAt: "2026-07-06T00:00:00Z",
    });
    expect(result.output).not.toHaveProperty("projects");
    expect(result.output).not.toHaveProperty("notes");
  });

  it("falls back to the configured name when the provider omits it", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce({
      ...fullSubtask,
      name: null,
      assignee: null,
    });
    const result = await createSubtask(
      baseInput({ parentTaskGid: "t-1", name: "fallback" }),
    );
    expect(result.output.taskName).toBe("fallback");
    expect(result.output.assigneeGid).toBeNull();
  });

  it("propagates provider failures verbatim (engine owns classification)", async () => {
    mockTasksCreateSubtask.mockRejectedValueOnce(
      new Error("Asana POST /tasks/t-1/subtasks failed: boom"),
    );
    await expect(
      createSubtask(baseInput({ parentTaskGid: "t-1", name: "n" })),
    ).rejects.toThrow(/boom/);
  });

  it("never leaks the access token into the output", async () => {
    mockTasksCreateSubtask.mockResolvedValueOnce(fullSubtask);
    const result = await createSubtask(
      baseInput({ parentTaskGid: "t-1", name: "n" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
