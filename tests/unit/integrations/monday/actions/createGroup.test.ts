/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGroupsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/groupsCreate", () => ({
  groupsCreate: (...args: unknown[]) => mockGroupsCreate(...args),
}));

import { createGroup } from "@/integrations/monday/actions/boards/createGroup";
import { CreateGroupConfigSchema } from "@/integrations/monday/actions/boards/createGroup.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupsCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "monday",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-24T00:00:00Z",
    accountId: "alice@example.com",
    payload: {},
  };
}

describe("create_group schema", () => {
  it("requires boardId + groupTitle; color optional", () => {
    expect(() =>
      CreateGroupConfigSchema.parse({ boardId: "b", groupTitle: "G" }),
    ).not.toThrow();
    expect(() => CreateGroupConfigSchema.parse({ boardId: "b" })).toThrow();
  });
});

describe("create_group handler", () => {
  it("threads groupTitle + color to the wrapper", async () => {
    mockGroupsCreate.mockResolvedValueOnce({
      id: "g-1",
      title: "G",
      color: "#ff0000",
    });
    await createGroup({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupTitle: "G", color: "#ff0000" },
      triggerEvent: trigger(),
    });
    expect(mockGroupsCreate.mock.calls[0]![0]).toMatchObject({
      boardId: "b",
      groupTitle: "G",
      color: "#ff0000",
    });
  });

  it("output: groupId / groupTitle / groupColor / boardId / createdAt", async () => {
    mockGroupsCreate.mockResolvedValueOnce({
      id: "g-1",
      title: "Returned",
      color: "#00ff00",
    });
    const result = await createGroup({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupTitle: "G" },
      triggerEvent: trigger(),
    });
    expect(result.output.groupId).toBe("g-1");
    expect(result.output.groupTitle).toBe("Returned");
    expect(result.output.groupColor).toBe("#00ff00");
    expect(result.output.boardId).toBe("b");
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockGroupsCreate.mockResolvedValueOnce({ id: "g", title: "G", color: null });
    await createGroup({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b", groupTitle: "G" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
