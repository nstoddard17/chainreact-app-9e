/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockAdd = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUserAdd", () => ({
  groupUserAdd: (...args: unknown[]) => mockAdd(...args),
}));

import { addWorkspaceUser } from "@/integrations/microsoft-powerbi/actions/workspaces/addWorkspaceUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockAdd.mockReset();
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

describe("add_workspace_user action", () => {
  it("addresses User principals by email (never identifier)", async () => {
    mockAdd.mockResolvedValueOnce(undefined);

    const result = await addWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Viewer",
      }),
    );

    const call = mockAdd.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.principalType).toBe("User");
    expect(call.emailAddress).toBe("bob@contoso.com");
    expect(call.identifier).toBeUndefined();
    expect(call.accessRight).toBe("Viewer");
    expect(result.output).toEqual({ granted: true, accessRight: "Viewer" });
  });

  it("addresses Group/App principals by identifier (never email)", async () => {
    mockAdd.mockResolvedValueOnce(undefined);

    await addWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "App",
        principalIdentifier: "obj-guid-1",
        // A stale principalEmail must never reach the wire for App/Group.
        principalEmail: "ignored@contoso.com",
        accessRight: "Contributor",
      }),
    );

    const call = mockAdd.mock.calls[0]![0];
    expect(call.identifier).toBe("obj-guid-1");
    expect(call.emailAddress).toBeUndefined();
  });

  it("rejects a User principal without principalEmail (refinement)", async () => {
    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          accessRight: "Viewer",
        }),
      ),
    ).rejects.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects a Group principal without principalIdentifier (refinement)", async () => {
    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "Group",
          accessRight: "Member",
        }),
      ),
    ).rejects.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects a missing accessRight (Q11 — no hidden default)", async () => {
    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
        }),
      ),
    ).rejects.toThrow();
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("rejects the provider's 'None' values and unknown keys (.strict())", async () => {
    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
          accessRight: "None",
        }),
      ),
    ).rejects.toThrow();

    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
          accessRight: "Viewer",
          groupUserAccessRight: "Admin",
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockAdd.mockResolvedValueOnce(undefined);

    await addWorkspaceUser({
      ...baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Viewer",
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockAdd.mockRejectedValueOnce(
      new Error("Power BI group user add POST failed: TooManyGroupUsers"),
    );
    await expect(
      addWorkspaceUser(
        baseInput({
          workspaceId: "ws-1",
          principalType: "User",
          principalEmail: "bob@contoso.com",
          accessRight: "Viewer",
        }),
      ),
    ).rejects.toThrow(/TooManyGroupUsers/);
  });

  it("never leaks the access token into the output", async () => {
    mockAdd.mockResolvedValueOnce(undefined);
    const result = await addWorkspaceUser(
      baseInput({
        workspaceId: "ws-1",
        principalType: "User",
        principalEmail: "bob@contoso.com",
        accessRight: "Viewer",
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
