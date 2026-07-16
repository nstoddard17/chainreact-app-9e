/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUserDelete", () => ({
  groupUserDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { removeWorkspaceUser } from "@/integrations/microsoft-powerbi/actions/workspaces/removeWorkspaceUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
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

describe("remove_workspace_user action", () => {
  it("removes the principal and echoes its identifier", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    const result = await removeWorkspaceUser(
      baseInput({ workspaceId: "ws-1", principalIdentifier: "bob@contoso.com" }),
    );

    const call = mockDelete.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.userIdentifier).toBe("bob@contoso.com");
    expect(result.output).toEqual({
      removed: true,
      principalIdentifier: "bob@contoso.com",
    });
  });

  it("passes an object-id principal through verbatim", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    await removeWorkspaceUser(
      baseInput({ workspaceId: "ws-1", principalIdentifier: "obj-guid-1" }),
    );

    expect(mockDelete.mock.calls[0]![0].userIdentifier).toBe("obj-guid-1");
  });

  it("rejects a missing principalIdentifier (required)", async () => {
    await expect(
      removeWorkspaceUser(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      removeWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalIdentifier: "bob@contoso.com",
          principalType: "User",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockDelete.mockResolvedValueOnce(undefined);

    await removeWorkspaceUser({
      ...baseInput({
        workspaceId: "ws-1",
        principalIdentifier: "bob@contoso.com",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Power BI resource 'workspace user' not found."),
    );
    await expect(
      removeWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalIdentifier: "ghost@contoso.com",
        }),
      ),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const result = await removeWorkspaceUser(
      baseInput({ workspaceId: "ws-1", principalIdentifier: "obj-guid-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
