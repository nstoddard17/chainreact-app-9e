/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUpdate", () => ({
  groupUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

import { updateWorkspace } from "@/integrations/microsoft-powerbi/actions/workspaces/updateWorkspace";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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

describe("update_workspace action", () => {
  it("sends only the provided fields and echoes the workspace id", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await updateWorkspace(
      baseInput({ workspaceId: "ws-1", name: "Renamed" }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.name).toBe("Renamed");
    expect(call.description).toBeUndefined();
    expect(result.output).toEqual({ updated: true, workspaceId: "ws-1" });
  });

  it("sends description alone when only description is provided", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateWorkspace(
      baseInput({ workspaceId: "ws-1", description: "New purpose" }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.name).toBeUndefined();
    expect(call.description).toBe("New purpose");
  });

  it("rejects when neither name nor description is provided (refinement)", async () => {
    await expect(
      updateWorkspace(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateWorkspace(
        baseInput({
          workspaceId: "ws-1",
          name: "Renamed",
          defaultDatasetStorageFormat: "Large",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateWorkspace({
      ...baseInput({ workspaceId: "ws-1", name: "Renamed" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI group update PATCH failed: Unauthorized workspace edit"),
    );
    await expect(
      updateWorkspace(baseInput({ workspaceId: "ws-1", name: "X" })),
    ).rejects.toThrow(/Unauthorized workspace edit/);
  });

  it("never leaks the access token into the output", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const result = await updateWorkspace(
      baseInput({ workspaceId: "ws-1", name: "Renamed" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
