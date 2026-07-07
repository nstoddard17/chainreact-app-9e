/**
 * @jest-environment node
 *
 * ASANA-2 — `asana:list_tasks_in_project` handler + schema.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTasksListPageForProject = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
  InsufficientScopeError: class extends Error {},
}));

jest.mock("@/integrations/_shared/asana/api/tasks", () => ({
  tasksListPageForProject: (...args: unknown[]) =>
    mockTasksListPageForProject(...args),
}));

import { listTasksInProject } from "@/integrations/asana/actions/tasks/listTasksInProject";
import { ListTasksInProjectConfigSchema } from "@/integrations/asana/actions/tasks/listTasksInProject.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTasksListPageForProject.mockReset();
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

const page = {
  items: [
    {
      gid: "t-1",
      name: "Task one",
      completed: false,
      due_on: "2026-08-01",
      assignee: { gid: "u-9", name: "Dana" },
      permalink_url: "https://app.asana.com/0/p-1/t-1",
    },
    {
      gid: "t-2",
      name: null,
      completed: true,
      due_on: null,
      assignee: null,
      permalink_url: null,
    },
  ],
  hasMore: true,
  nextOffset: "cursor-abc",
};

describe("list_tasks_in_project schema", () => {
  it("requires projectId", () => {
    expect(() => ListTasksInProjectConfigSchema.parse({})).toThrow();
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p-1" }),
    ).not.toThrow();
  });

  it("bounds pageSize to 1..100 integers", () => {
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p", pageSize: 0 }),
    ).toThrow();
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p", pageSize: 101 }),
    ).toThrow();
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p", pageSize: 2.5 }),
    ).toThrow();
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p", pageSize: 100 }),
    ).not.toThrow();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      ListTasksInProjectConfigSchema.parse({ projectId: "p", bogus: 1 }),
    ).toThrow();
  });
});

describe("list_tasks_in_project handler", () => {
  it("defaults to pageSize 50 and the first page (no offset)", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce(page);
    await listTasksInProject(baseInput({ projectId: "p-1" }));
    const call = mockTasksListPageForProject.mock.calls[0]![0];
    expect(call.projectId).toBe("p-1");
    expect(call.limit).toBe(50);
    expect(call.offset).toBeUndefined();
  });

  it("threads pageSize and a non-empty offset cursor through; '' offset means first page", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce(page);
    await listTasksInProject(
      baseInput({ projectId: "p-1", pageSize: 5, offset: "cursor-abc" }),
    );
    expect(mockTasksListPageForProject.mock.calls[0]![0]).toMatchObject({
      limit: 5,
      offset: "cursor-abc",
    });

    mockTasksListPageForProject.mockResolvedValueOnce(page);
    await listTasksInProject(baseInput({ projectId: "p-1", offset: "" }));
    expect(mockTasksListPageForProject.mock.calls[1]![0].offset).toBeUndefined();
  });

  it("returns the bounded per-task shape + pagination outputs", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce(page);
    const result = await listTasksInProject(baseInput({ projectId: "p-1" }));
    expect(result.output).toEqual({
      tasks: [
        {
          taskGid: "t-1",
          taskName: "Task one",
          completed: false,
          dueOn: "2026-08-01",
          assigneeGid: "u-9",
          permalinkUrl: "https://app.asana.com/0/p-1/t-1",
        },
        {
          taskGid: "t-2",
          taskName: null,
          completed: true,
          dueOn: null,
          assigneeGid: null,
          permalinkUrl: null,
        },
      ],
      count: 2,
      hasMore: true,
      nextOffset: "cursor-abc",
    });
    // Bounded: raw-record fields never leak into task entries.
    const tasks = result.output.tasks as Array<Record<string, unknown>>;
    expect(tasks[0]).not.toHaveProperty("assignee");
    expect(tasks[0]).not.toHaveProperty("notes");
  });

  it("returns null nextOffset on the last page", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce({
      items: [],
      hasMore: false,
      nextOffset: null,
    });
    const result = await listTasksInProject(baseInput({ projectId: "p-1" }));
    expect(result.output).toEqual({
      tasks: [],
      count: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it("uses refreshAndRetry with provider='asana'", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce(page);
    await listTasksInProject(baseInput({ projectId: "p-1" }));
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call.provider).toBe("asana");
    expect(call.accountId).toBe("acct-u");
  });

  it("propagates provider failures verbatim (engine owns classification)", async () => {
    mockTasksListPageForProject.mockRejectedValueOnce(
      new Error("Asana GET /tasks failed: boom"),
    );
    await expect(
      listTasksInProject(baseInput({ projectId: "p-1" })),
    ).rejects.toThrow(/boom/);
  });

  it("never leaks the access token into the output", async () => {
    mockTasksListPageForProject.mockResolvedValueOnce(page);
    const result = await listTasksInProject(baseInput({ projectId: "p-1" }));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
