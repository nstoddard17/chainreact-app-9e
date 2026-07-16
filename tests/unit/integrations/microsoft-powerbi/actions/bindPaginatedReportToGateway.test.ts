/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBind = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/reportBindToGateway",
  () => ({
    reportBindToGateway: (...args: unknown[]) => mockBind(...args),
  }),
);

import { bindPaginatedReportToGateway } from "@/integrations/microsoft-powerbi/actions/reports/bindPaginatedReportToGateway";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBind.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockBind.mockResolvedValue(undefined);
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

const VALID_CONFIG = {
  workspaceId: "ws-1",
  paginatedReportId: "prep-1",
  gatewayId: "gw-1",
  bindDetails: [
    { datasourceName: "DataSource1", datasourceObjectId: "dsid-1" },
  ],
};

describe("bind_paginated_report_to_gateway action", () => {
  it("binds and returns {bound, gatewayId}", async () => {
    const result = await bindPaginatedReportToGateway(baseInput(VALID_CONFIG));

    const call = mockBind.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.reportId).toBe("prep-1");
    expect(call.gatewayObjectId).toBe("gw-1");
    expect(call.bindDetails).toEqual([
      { datasourceName: "DataSource1", datasourceObjectId: "dsid-1" },
    ]);

    expect(result.output).toEqual({ bound: true, gatewayId: "gw-1" });
  });

  it("rejects a missing gatewayId", async () => {
    const { gatewayId: _gatewayId, ...rest } = VALID_CONFIG;
    await expect(
      bindPaginatedReportToGateway(baseInput(rest)),
    ).rejects.toThrow();
    expect(mockBind).not.toHaveBeenCalled();
  });

  it("rejects missing/empty bindDetails (required by the report wire contract)", async () => {
    const { bindDetails: _bindDetails, ...rest } = VALID_CONFIG;
    await expect(
      bindPaginatedReportToGateway(baseInput(rest)),
    ).rejects.toThrow();
    await expect(
      bindPaginatedReportToGateway(baseInput({ ...rest, bindDetails: [] })),
    ).rejects.toThrow();
    expect(mockBind).not.toHaveBeenCalled();
  });

  it("rejects raw wire-format keys (.strict()) at both levels", async () => {
    await expect(
      bindPaginatedReportToGateway(
        baseInput({ ...VALID_CONFIG, gatewayObjectId: "raw-wire-field" }),
      ),
    ).rejects.toThrow();

    await expect(
      bindPaginatedReportToGateway(
        baseInput({
          ...VALID_CONFIG,
          bindDetails: [
            { dataSourceName: "raw", dataSourceObjectId: "raw" },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await bindPaginatedReportToGateway({
      ...baseInput(VALID_CONFIG),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures (e.g. VNet gateway unsupported) to the engine", async () => {
    mockBind.mockRejectedValueOnce(
      new Error("Power BI report BindToGateway POST failed: DMTS_MonikerHasNoDatasourcesToBindError"),
    );
    await expect(
      bindPaginatedReportToGateway(baseInput(VALID_CONFIG)),
    ).rejects.toThrow(/DMTS_MonikerHasNoDatasourcesToBindError/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await bindPaginatedReportToGateway(baseInput(VALID_CONFIG));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
