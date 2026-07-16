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

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUserUpdate", () => ({
  groupUserUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

import { updateWorkspaceUser } from "@/integrations/microsoft-powerbi/actions/workspaces/updateWorkspaceUser";

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

describe("update_workspace_user action", () => {
  it("updates a User principal's role by email", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await updateWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Member",
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.emailAddress).toBe("bob@contoso.com");
    expect(call.identifier).toBeUndefined();
    expect(call.accessRight).toBe("Member");
    expect(result.output).toEqual({ updated: true, accessRight: "Member" });
  });

  it("updates a Group principal's role by identifier (never email)", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "Group",
        principalIdentifier: "grp-guid-1",
        accessRight: "Viewer",
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.identifier).toBe("grp-guid-1");
    expect(call.emailAddress).toBeUndefined();
  });

  it("rejects a User principal without principalEmail (refinement)", async () => {
    await expect(
      updateWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          accessRight: "Member",
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing accessRight (Q11 — no hidden default)", async () => {
    await expect(
      updateWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
          accessRight: "Member",
          userType: "Member",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateWorkspaceUser({
      ...baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Member",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI group user update PUT failed: UserNotFoundInGroup"),
    );
    await expect(
      updateWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
          accessRight: "Member",
        }),
      ),
    ).rejects.toThrow(/UserNotFoundInGroup/);
  });

  it("never leaks the access token into the output", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const result = await updateWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Member",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
