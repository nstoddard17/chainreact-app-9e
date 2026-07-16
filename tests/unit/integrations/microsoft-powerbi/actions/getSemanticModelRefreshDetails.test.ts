/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDetails = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/refreshDetailsGet",
  () => ({
    refreshDetailsGet: (...args: unknown[]) => mockDetails(...args),
  }),
);

import { getSemanticModelRefreshDetails } from "@/integrations/microsoft-powerbi/actions/semantic_models/getSemanticModelRefreshDetails";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDetails.mockReset();
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

const validConfig = {
  workspaceId: "ws-1",
  semanticModelId: "ds-1",
  refreshRequestId: "req-123",
};

describe("get_semantic_model_refresh_details action", () => {
  it("returns the bounded detail fields", async () => {
    mockDetails.mockResolvedValueOnce({
      status: "Completed",
      extendedStatus: "Completed",
      currentRefreshType: "Full",
      startTime: "2026-07-15T10:00:00Z",
      endTime: "2026-07-15T10:05:00Z",
      commitMode: "transactional",
      numberOfAttempts: 1,
    });

    const result = await getSemanticModelRefreshDetails(
      baseInput(validConfig),
    );

    const call = mockDetails.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.refreshId).toBe("req-123");
    expect(result.output).toEqual({
      status: "Completed",
      extendedStatus: "Completed",
      currentRefreshType: "Full",
      startTime: "2026-07-15T10:00:00Z",
      endTime: "2026-07-15T10:05:00Z",
      commitMode: "transactional",
      numberOfAttempts: 1,
    });
  });

  it("passes null detail fields through (in-progress refresh)", async () => {
    mockDetails.mockResolvedValueOnce({
      status: "Unknown",
      extendedStatus: "InProgress",
      currentRefreshType: null,
      startTime: "2026-07-15T10:00:00Z",
      endTime: null,
      commitMode: null,
      numberOfAttempts: null,
    });

    const result = await getSemanticModelRefreshDetails(
      baseInput(validConfig),
    );
    expect(result.output.status).toBe("Unknown");
    expect(result.output.endTime).toBeNull();
    expect(result.output.numberOfAttempts).toBeNull();
  });

  it("rejects a missing refreshRequestId", async () => {
    await expect(
      getSemanticModelRefreshDetails(
        baseInput({ workspaceId: "ws-1", semanticModelId: "ds-1" }),
      ),
    ).rejects.toThrow();
    expect(mockDetails).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      getSemanticModelRefreshDetails(
        baseInput({ ...validConfig, refreshId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockDetails.mockResolvedValueOnce({
      status: "Completed",
      extendedStatus: null,
      currentRefreshType: null,
      startTime: null,
      endTime: null,
      commitMode: null,
      numberOfAttempts: null,
    });

    await getSemanticModelRefreshDetails({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockDetails.mockRejectedValueOnce(
      new Error("Power BI resource 'refresh request req-123' not found."),
    );
    await expect(
      getSemanticModelRefreshDetails(baseInput(validConfig)),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockDetails.mockResolvedValueOnce({
      status: "Completed",
      extendedStatus: null,
      currentRefreshType: null,
      startTime: null,
      endTime: null,
      commitMode: null,
      numberOfAttempts: null,
    });
    const result = await getSemanticModelRefreshDetails(
      baseInput(validConfig),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
