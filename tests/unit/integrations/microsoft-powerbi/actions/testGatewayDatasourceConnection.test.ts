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
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceStatusGet",
  () => ({
    gatewayDatasourceStatusGet: (...args: unknown[]) =>
      mockStatusGet(...args),
  }),
);

import { testGatewayDatasourceConnection } from "@/integrations/microsoft-powerbi/actions/gateways/testGatewayDatasourceConnection";

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

const config = { gatewayId: "gw-1", datasourceId: "ds-1" };

describe("test_gateway_datasource_connection action", () => {
  it("returns online:true with null errorCode when reachable", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });

    const result = await testGatewayDatasourceConnection(baseInput(config));

    const call = mockStatusGet.mock.calls[0]![0];
    expect(call.gatewayId).toBe("gw-1");
    expect(call.datasourceId).toBe("ds-1");
    expect(result.output).toEqual({ online: true, errorCode: null });
  });

  it("returns online:false + short code as a RESULT (run continues, no throw)", async () => {
    mockStatusGet.mockResolvedValueOnce({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });

    const result = await testGatewayDatasourceConnection(baseInput(config));
    expect(result.output).toEqual({
      online: false,
      errorCode: "DM_GWPipeline_Client_GatewayUnreachable",
    });
  });

  it("rejects a missing datasourceId", async () => {
    await expect(
      testGatewayDatasourceConnection(baseInput({ gatewayId: "gw-1" })),
    ).rejects.toThrow();
    expect(mockStatusGet).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      testGatewayDatasourceConnection(
        baseInput({ ...config, retries: 3 }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });
    await testGatewayDatasourceConnection({
      ...baseInput(config),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates wrapper errors (missing datasource) to the engine", async () => {
    mockStatusGet.mockRejectedValueOnce(
      new Error("Power BI resource 'gateway datasource ds-1' not found."),
    );
    await expect(
      testGatewayDatasourceConnection(baseInput(config)),
    ).rejects.toThrow(/not found/);
  });

  it("never leaks the access token into the output", async () => {
    mockStatusGet.mockResolvedValueOnce({ online: true, errorCode: null });
    const result = await testGatewayDatasourceConnection(baseInput(config));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
