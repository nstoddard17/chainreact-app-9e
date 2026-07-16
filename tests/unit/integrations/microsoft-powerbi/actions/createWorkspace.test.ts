/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/groups/groupCreate", () => ({
  groupCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createWorkspace } from "@/integrations/microsoft-powerbi/actions/workspaces/createWorkspace";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
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

describe("create_workspace action", () => {
  it("creates a workspace and returns id + name", async () => {
    mockCreate.mockResolvedValueOnce({ id: "ws-new", name: "Marketing" });

    const result = await createWorkspace(baseInput({ name: "Marketing" }));

    const call = mockCreate.mock.calls[0]![0];
    expect(call.name).toBe("Marketing");
    expect(result.output).toEqual({ workspaceId: "ws-new", name: "Marketing" });
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockCreate.mockResolvedValueOnce({ id: "ws-new", name: "M" });

    await createWorkspace({
      ...baseInput({ name: "M" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing name (required, no default)", async () => {
    await expect(createWorkspace(baseInput({}))).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      createWorkspace(baseInput({ name: "M", workspaceV2: true })),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Power BI group create POST failed: PowerBIEntityAlreadyExists"),
    );
    await expect(createWorkspace(baseInput({ name: "M" }))).rejects.toThrow(
      /PowerBIEntityAlreadyExists/,
    );
  });

  it("never leaks the access token into the output", async () => {
    mockCreate.mockResolvedValueOnce({ id: "ws-new", name: "M" });
    const result = await createWorkspace(baseInput({ name: "M" }));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
