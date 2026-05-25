/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGroupsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/monday/api/groupsList", () => ({
  groupsList: (...args: unknown[]) => mockGroupsList(...args),
}));

import { listGroups } from "@/integrations/monday/actions/boards/listGroups";
import { ListGroupsConfigSchema } from "@/integrations/monday/actions/boards/listGroups.schema";
import { NotFoundError } from "@/integrations/_shared/monday/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupsList.mockReset();
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

describe("list_groups schema", () => {
  it("requires boardId", () => {
    expect(() => ListGroupsConfigSchema.parse({ boardId: "b" })).not.toThrow();
    expect(() => ListGroupsConfigSchema.parse({})).toThrow();
  });
});

describe("list_groups handler — pure read (full group detail)", () => {
  it("maps groups with color/position/archived", async () => {
    mockGroupsList.mockResolvedValueOnce({
      boardFound: true,
      groups: [
        {
          id: "g-1",
          title: "Backlog",
          color: "#ff0000",
          position: "1",
          archived: false,
        },
      ],
    });
    const result = await listGroups({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b" },
      triggerEvent: trigger(),
    });
    expect(result.output.count).toBe(1);
    expect(
      (result.output.groups as Array<Record<string, unknown>>)[0]!,
    ).toEqual({
      groupId: "g-1",
      title: "Backlog",
      color: "#ff0000",
      position: "1",
      archived: false,
    });
  });

  it("throws NotFoundError when board not found (boardFound=false)", async () => {
    mockGroupsList.mockResolvedValueOnce({ boardFound: false, groups: [] });
    await expect(
      listGroups({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { boardId: "gone" },
        triggerEvent: trigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses refreshAndRetry provider='monday'", async () => {
    mockGroupsList.mockResolvedValueOnce({ boardFound: true, groups: [] });
    await listGroups({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { boardId: "b" },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
  });
});
