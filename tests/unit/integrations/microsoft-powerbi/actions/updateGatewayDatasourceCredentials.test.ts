/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGatewayGet = jest.fn();
const mockUpdate = jest.fn();
const mockEncrypt = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/gateways/gatewayGet", () => ({
  gatewayGet: (...args: unknown[]) => mockGatewayGet(...args),
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUpdateCredentials",
  () => ({
    gatewayDatasourceUpdateCredentials: (...args: unknown[]) =>
      mockUpdate(...args),
  }),
);

jest.mock("@/integrations/microsoft-powerbi/api/gatewayCredentials", () => ({
  encryptGatewayCredentials: (...args: unknown[]) => mockEncrypt(...args),
}));

import { updateGatewayDatasourceCredentials } from "@/integrations/microsoft-powerbi/actions/gateways/updateGatewayDatasourceCredentials";

const PASSWORD = "rotated-secret-99!";
const ENCRYPTED_BLOB = "ENCRYPTED_BLOB_b64==";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGatewayGet.mockReset();
  mockUpdate.mockReset();
  mockEncrypt.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGatewayGet.mockResolvedValue({
    id: "gw-1",
    name: "Gateway",
    type: "Resource",
    publicKeyExponent: "AQAB",
    publicKeyModulus: "mod-b64",
  });
  mockEncrypt.mockReturnValue(ENCRYPTED_BLOB);
  mockUpdate.mockResolvedValue(undefined);
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

const windowsConfig = {
  gatewayId: "gw-1",
  datasourceId: "ds-1",
  credentialType: "Windows",
  username: "CONTOSO\\svc",
  password: PASSWORD,
  privacyLevel: "Organizational",
};

describe("update_gateway_datasource_credentials action", () => {
  it("encrypts against the current gateway key and PATCHes the credentialDetails", async () => {
    const result = await updateGatewayDatasourceCredentials(
      baseInput(windowsConfig),
    );

    expect(mockGatewayGet.mock.calls[0]![0].gatewayId).toBe("gw-1");
    expect(mockEncrypt).toHaveBeenCalledWith({
      publicKeyExponent: "AQAB",
      publicKeyModulus: "mod-b64",
      credentialData: [
        { name: "username", value: "CONTOSO\\svc" },
        { name: "password", value: PASSWORD },
      ],
    });

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.gatewayId).toBe("gw-1");
    expect(call.datasourceId).toBe("ds-1");
    expect(call.credentialDetails).toEqual({
      credentialType: "Windows",
      credentials: ENCRYPTED_BLOB,
      encryptedConnection: "Encrypted",
      encryptionAlgorithm: "RSA-OAEP",
      privacyLevel: "Organizational",
    });

    expect(result.output).toEqual({ updated: true, datasourceId: "ds-1" });
  });

  it("never lets the plaintext password leave the app or reach the output", async () => {
    const result = await updateGatewayDatasourceCredentials(
      baseInput(windowsConfig),
    );
    expect(JSON.stringify(mockUpdate.mock.calls)).not.toContain(PASSWORD);
    const outputJson = JSON.stringify(result.output);
    expect(outputJson).not.toContain(PASSWORD);
    expect(outputJson).not.toContain("tok");
  });

  it("supports Key credentials", async () => {
    await updateGatewayDatasourceCredentials(
      baseInput({
        gatewayId: "gw-1",
        datasourceId: "ds-1",
        credentialType: "Key",
        key: "new-api-key",
        privacyLevel: "Private",
      }),
    );
    expect(mockEncrypt.mock.calls[0]![0].credentialData).toEqual([
      { name: "key", value: "new-api-key" },
    ]);
  });

  it("rejects Windows credentials without a password (refinement)", async () => {
    await expect(
      updateGatewayDatasourceCredentials(
        baseInput({ ...windowsConfig, password: undefined }),
      ),
    ).rejects.toThrow(/password/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      updateGatewayDatasourceCredentials(
        baseInput({ ...windowsConfig, credentials: "raw-wire-blob" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await updateGatewayDatasourceCredentials({
      ...baseInput(windowsConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0].providerAccountId).toBe("alice@contoso.com");
    }
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI gateway datasource credentials PATCH failed: HTTP 400"),
    );
    await expect(
      updateGatewayDatasourceCredentials(baseInput(windowsConfig)),
    ).rejects.toThrow(/PATCH failed/);
  });
});
