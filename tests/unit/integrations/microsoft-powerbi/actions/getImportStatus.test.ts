/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockImportGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/imports/importGet", () => ({
  importGet: (...args: unknown[]) => mockImportGet(...args),
}));

import { getImportStatus } from "@/integrations/microsoft-powerbi/actions/imports/getImportStatus";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockImportGet.mockReset();
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
    providerAccountId:
      provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
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

describe("get_import_status action", () => {
  it("reads the import and returns the bounded fixed-key shape", async () => {
    mockImportGet.mockResolvedValueOnce({
      importState: "Succeeded",
      name: "Report.pbix",
      createdDateTime: "2026-07-15T10:00:00Z",
      updatedDateTime: "2026-07-15T10:01:00Z",
      reports: [{ id: "rep-1", name: "Report" }],
      datasets: [{ id: "ds-1", name: null }],
    });

    const result = await getImportStatus(
      baseInput({ workspaceId: "ws-1", importId: "imp-1" }),
    );

    const call = mockImportGet.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.importId).toBe("imp-1");
    expect(result.output).toEqual({
      importState: "Succeeded",
      name: "Report.pbix",
      createdDateTime: "2026-07-15T10:00:00Z",
      updatedDateTime: "2026-07-15T10:01:00Z",
      reports: [{ id: "rep-1", name: "Report" }],
      datasets: [{ id: "ds-1", name: null }],
    });
  });

  it("surfaces nullable fields as null when the provider omits them", async () => {
    mockImportGet.mockResolvedValueOnce({
      importState: null,
      name: null,
      createdDateTime: null,
      updatedDateTime: null,
      reports: [],
      datasets: [],
    });

    const result = await getImportStatus(
      baseInput({ workspaceId: "ws-1", importId: "imp-1" }),
    );
    expect(result.output).toEqual({
      importState: null,
      name: null,
      createdDateTime: null,
      updatedDateTime: null,
      reports: [],
      datasets: [],
    });
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockImportGet.mockResolvedValueOnce({
      importState: "Publishing",
      name: null,
      createdDateTime: null,
      updatedDateTime: null,
      reports: [],
      datasets: [],
    });

    await getImportStatus({
      ...baseInput({ workspaceId: "ws-1", importId: "imp-1" }),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects a missing importId", async () => {
    await expect(
      getImportStatus(baseInput({ workspaceId: "ws-1" })),
    ).rejects.toThrow();
    expect(mockImportGet).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getImportStatus(
        baseInput({ workspaceId: "ws-1", importId: "imp-1", expand: "all" }),
      ),
    ).rejects.toThrow();
  });

  it("propagates provider failures to the engine", async () => {
    mockImportGet.mockRejectedValueOnce(
      new Error("Power BI resource 'import imp-1' not found."),
    );
    await expect(
      getImportStatus(baseInput({ workspaceId: "ws-1", importId: "imp-1" })),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockImportGet.mockResolvedValueOnce({
      importState: "Succeeded",
      name: null,
      createdDateTime: null,
      updatedDateTime: null,
      reports: [],
      datasets: [],
    });
    const result = await getImportStatus(
      baseInput({ workspaceId: "ws-1", importId: "imp-1" }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
