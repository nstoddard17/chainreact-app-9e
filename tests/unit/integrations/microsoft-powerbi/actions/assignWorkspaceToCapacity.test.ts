/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAssign = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/groups/groupAssignToCapacity",
  () => ({
    groupAssignToCapacity: (...args: unknown[]) => mockAssign(...args),
  }),
);

import { assignWorkspaceToCapacity } from "@/integrations/microsoft-powerbi/actions/capacities/assignWorkspaceToCapacity";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAssign.mockReset();
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

describe("assign_workspace_to_capacity action", () => {
  it("assigns the workspace and echoes both ids", async () => {
    mockAssign.mockResolvedValueOnce(undefined);

    const result = await assignWorkspaceToCapacity(
      baseInput({ workspaceId: "ws-1", capacityId: "cap-1" }),
    );

    const call = mockAssign.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.capacityId).toBe("cap-1");
    expect(result.output).toEqual({
      assigned: true,
      workspaceId: "ws-1",
      capacityId: "cap-1",
    });
  });

  it("rejects the empty-GUID unassign path (deliberately not exposed)", async () => {
    await expect(
      assignWorkspaceToCapacity(
        baseInput({
          workspaceId: "ws-1",
          capacityId: "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).rejects.toThrow(/not supported/);
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects a missing capacityId (required, no default)", async () => {
    await expect(
      assignWorkspaceToCapacity(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      assignWorkspaceToCapacity(
        baseInput({ workspaceId: "ws-1", capacityId: "cap-1", groupId: "raw" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockAssign.mockResolvedValueOnce(undefined);

    await assignWorkspaceToCapacity({
      ...baseInput({ workspaceId: "ws-1", capacityId: "cap-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockAssign.mockRejectedValueOnce(
      new Error(
        "Power BI group AssignToCapacity POST failed: PowerBINotAuthorizedException",
      ),
    );
    await expect(
      assignWorkspaceToCapacity(
        baseInput({ workspaceId: "ws-1", capacityId: "cap-1" }),
      ),
    ).rejects.toThrow(/PowerBINotAuthorizedException/);
  });

  it("never leaks the access token into the output", async () => {
    mockAssign.mockResolvedValueOnce(undefined);
    const result = await assignWorkspaceToCapacity(
      baseInput({ workspaceId: "ws-1", capacityId: "cap-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
