/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUserDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUserDelete",
  () => ({
    gatewayDatasourceUserDelete: (...args: unknown[]) =>
      mockUserDelete(...args),
  }),
);

import { removeGatewayDatasourceUser } from "@/integrations/microsoft-powerbi/actions/gateways/removeGatewayDatasourceUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUserDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUserDelete.mockResolvedValue(undefined);
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

const config = {
  gatewayId: "gw-1",
  datasourceId: "ds-1",
  principalEmail: "bob@contoso.com",
};

describe("remove_gateway_datasource_user action", () => {
  it("revokes the principal and returns the fixed output", async () => {
    const result = await removeGatewayDatasourceUser(baseInput(config));

    const call = mockUserDelete.mock.calls[0]![0];
    expect(call.gatewayId).toBe("gw-1");
    expect(call.datasourceId).toBe("ds-1");
    expect(call.emailAddress).toBe("bob@contoso.com");

    expect(result.output).toEqual({ removed: true });
  });

  it("rejects a missing principalEmail", async () => {
    await expect(
      removeGatewayDatasourceUser(
        baseInput({ gatewayId: "gw-1", datasourceId: "ds-1" }),
      ),
    ).rejects.toThrow();
    expect(mockUserDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      removeGatewayDatasourceUser(
        baseInput({ ...config, emailAdress: "docs-typo-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await removeGatewayDatasourceUser({
      ...baseInput(config),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUserDelete.mockRejectedValueOnce(
      new Error("Power BI gateway datasource user DELETE failed: HTTP 400"),
    );
    await expect(
      removeGatewayDatasourceUser(baseInput(config)),
    ).rejects.toThrow(/user DELETE failed/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await removeGatewayDatasourceUser(baseInput(config));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
