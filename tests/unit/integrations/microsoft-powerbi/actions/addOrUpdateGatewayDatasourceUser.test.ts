/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUserAdd = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUserAdd",
  () => ({
    gatewayDatasourceUserAdd: (...args: unknown[]) => mockUserAdd(...args),
  }),
);

import { addOrUpdateGatewayDatasourceUser } from "@/integrations/microsoft-powerbi/actions/gateways/addOrUpdateGatewayDatasourceUser";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUserAdd.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUserAdd.mockResolvedValue(undefined);
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
  accessRight: "Read",
};

describe("add_or_update_gateway_datasource_user action", () => {
  it("grants access with the documented wire field names", async () => {
    const result = await addOrUpdateGatewayDatasourceUser(baseInput(config));

    const call = mockUserAdd.mock.calls[0]![0];
    expect(call.gatewayId).toBe("gw-1");
    expect(call.datasourceId).toBe("ds-1");
    // Wire names: emailAddress + datasourceAccessRight (docs-correct spelling).
    expect(call.emailAddress).toBe("bob@contoso.com");
    expect(call.datasourceAccessRight).toBe("Read");

    expect(result.output).toEqual({
      granted: true,
      principalEmail: "bob@contoso.com",
      accessRight: "Read",
    });
  });

  it("supports the embed override right", async () => {
    await addOrUpdateGatewayDatasourceUser(
      baseInput({ ...config, accessRight: "ReadOverrideEffectiveIdentity" }),
    );
    expect(mockUserAdd.mock.calls[0]![0].datasourceAccessRight).toBe(
      "ReadOverrideEffectiveIdentity",
    );
  });

  it("rejects an access right outside the grant enum (None is removal-only)", async () => {
    await expect(
      addOrUpdateGatewayDatasourceUser(
        baseInput({ ...config, accessRight: "None" }),
      ),
    ).rejects.toThrow();
    expect(mockUserAdd).not.toHaveBeenCalled();
  });

  it("rejects a missing accessRight (Q11 — no hidden default)", async () => {
    await expect(
      addOrUpdateGatewayDatasourceUser(
        baseInput({ ...config, accessRight: undefined }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      addOrUpdateGatewayDatasourceUser(
        baseInput({ ...config, emailAddress: "raw-wire-field" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await addOrUpdateGatewayDatasourceUser({
      ...baseInput(config),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUserAdd.mockRejectedValueOnce(
      new Error("Power BI gateway datasource user add POST failed: HTTP 400"),
    );
    await expect(
      addOrUpdateGatewayDatasourceUser(baseInput(config)),
    ).rejects.toThrow(/user add POST failed/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await addOrUpdateGatewayDatasourceUser(baseInput(config));
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
