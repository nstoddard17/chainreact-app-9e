/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockStatusGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/groups/groupCapacityAssignmentStatusGet",
  () => ({
    groupCapacityAssignmentStatusGet: (...args: unknown[]) =>
      mockStatusGet(...args),
  }),
);

import { getCapacityAssignmentStatus } from "@/integrations/microsoft-powerbi/actions/capacities/getCapacityAssignmentStatus";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStatusGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId: provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
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

describe("get_capacity_assignment_status action", () => {
  it("returns the documented status fields (fixed key set)", async () => {
    mockStatusGet.mockResolvedValueOnce({
      status: "CompletedSuccessfully",
      capacityId: "cap-1",
      activityId: null,
      startTime: "2026-07-15T10:00:00Z",
      endTime: "2026-07-15T10:00:05Z",
    });

    const result = await getCapacityAssignmentStatus(
      baseInput({ workspaceId: "ws-1" }),
    );

    expect(mockStatusGet.mock.calls[0]![0].groupId).toBe("ws-1");
    expect(result.output).toEqual({
      status: "CompletedSuccessfully",
      capacityId: "cap-1",
      activityId: null,
      startTime: "2026-07-15T10:00:00Z",
      endTime: "2026-07-15T10:00:05Z",
    });
  });

  it("surfaces nulls for absent optional fields", async () => {
    mockStatusGet.mockResolvedValueOnce({
      status: "Pending",
      capacityId: null,
      activityId: null,
      startTime: null,
      endTime: null,
    });

    const result = await getCapacityAssignmentStatus(
      baseInput({ workspaceId: "ws-1" }),
    );

    expect(result.output).toEqual({
      status: "Pending",
      capacityId: null,
      activityId: null,
      startTime: null,
      endTime: null,
    });
  });

  it("rejects a missing workspaceId (required)", async () => {
    await expect(getCapacityAssignmentStatus(baseInput({}))).rejects.toThrow();
    expect(mockStatusGet).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getCapacityAssignmentStatus(
        baseInput({ workspaceId: "ws-1", groupId: "raw" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockStatusGet.mockResolvedValueOnce({
      status: "InProgress",
      capacityId: null,
      activityId: null,
      startTime: null,
      endTime: null,
    });

    await getCapacityAssignmentStatus({
      ...baseInput({ workspaceId: "ws-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockStatusGet.mockRejectedValueOnce(
      new Error("Power BI resource 'workspace ws-ghost' not found."),
    );
    await expect(
      getCapacityAssignmentStatus(baseInput({ workspaceId: "ws-ghost" })),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockStatusGet.mockResolvedValueOnce({
      status: "Pending",
      capacityId: null,
      activityId: null,
      startTime: null,
      endTime: null,
    });
    const result = await getCapacityAssignmentStatus(
      baseInput({ workspaceId: "ws-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
