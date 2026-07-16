/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGatewayGet = jest.fn();
const mockCreate = jest.fn();
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
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceCreate",
  () => ({
    gatewayDatasourceCreate: (...args: unknown[]) => mockCreate(...args),
  }),
);

jest.mock("@/integrations/microsoft-powerbi/api/gatewayCredentials", () => ({
  encryptGatewayCredentials: (...args: unknown[]) => mockEncrypt(...args),
}));

import { createGatewayDatasource } from "@/integrations/microsoft-powerbi/actions/gateways/createGatewayDatasource";

const PASSWORD = "hunter2-secret!";
const ENCRYPTED_BLOB = "ENCRYPTED_BLOB_b64==";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGatewayGet.mockReset();
  mockCreate.mockReset();
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
  mockCreate.mockResolvedValue({ datasourceId: "ds-9", gatewayId: "gw-1" });
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

const basicConfig = {
  gatewayId: "gw-1",
  datasourceName: "Sales SQL",
  datasourceType: "SQL",
  server: "MyServer",
  database: "MyDatabase",
  credentialType: "Basic",
  username: "john",
  password: PASSWORD,
  privacyLevel: "Organizational",
};

describe("create_gateway_datasource action", () => {
  it("fetches the gateway key, encrypts in-app, and POSTs the documented wire shape", async () => {
    const result = await createGatewayDatasource(baseInput(basicConfig));

    // Key fetched for THIS gateway.
    expect(mockGatewayGet.mock.calls[0]![0].gatewayId).toBe("gw-1");

    // Encryption ran BEFORE the create call, against the fetched key.
    expect(mockEncrypt).toHaveBeenCalledWith({
      publicKeyExponent: "AQAB",
      publicKeyModulus: "mod-b64",
      credentialData: [
        { name: "username", value: "john" },
        { name: "password", value: PASSWORD },
      ],
    });
    expect(mockEncrypt.mock.invocationCallOrder[0]!).toBeLessThan(
      mockCreate.mock.invocationCallOrder[0]!,
    );

    const call = mockCreate.mock.calls[0]![0];
    expect(call.gatewayId).toBe("gw-1");
    expect(call.dataSourceType).toBe("SQL");
    expect(call.datasourceName).toBe("Sales SQL");
    // connectionDetails is the synthesized JSON-in-string wire format.
    expect(call.connectionDetails).toBe(
      '{"server":"MyServer","database":"MyDatabase"}',
    );
    expect(call.credentialDetails).toEqual({
      credentialType: "Basic",
      credentials: ENCRYPTED_BLOB,
      encryptedConnection: "Encrypted",
      encryptionAlgorithm: "RSA-OAEP",
      privacyLevel: "Organizational",
    });

    expect(result.output).toEqual({
      datasourceId: "ds-9",
      gatewayId: "gw-1",
      datasourceName: "Sales SQL",
    });
  });

  it("never lets the plaintext password leave the app or reach the output", async () => {
    const result = await createGatewayDatasource(baseInput(basicConfig));

    // The wrapper call (what leaves the app) carries ONLY the encrypted blob.
    expect(JSON.stringify(mockCreate.mock.calls)).not.toContain(PASSWORD);
    // The action output never echoes credentials or the token.
    const outputJson = JSON.stringify(result.output);
    expect(outputJson).not.toContain(PASSWORD);
    expect(outputJson).not.toContain("tok");
  });

  it("builds Key credentialData for credentialType Key", async () => {
    await createGatewayDatasource(
      baseInput({
        gatewayId: "gw-1",
        datasourceName: "OData feed",
        datasourceType: "OData",
        url: "https://services.example.com/feed",
        credentialType: "Key",
        key: "api-key-secret",
        privacyLevel: "Private",
      }),
    );

    expect(mockEncrypt.mock.calls[0]![0].credentialData).toEqual([
      { name: "key", value: "api-key-secret" },
    ]);
    expect(mockCreate.mock.calls[0]![0].connectionDetails).toBe(
      '{"url":"https://services.example.com/feed"}',
    );
  });

  it("rejects Basic credentials without username/password (refinement)", async () => {
    await expect(
      createGatewayDatasource(
        baseInput({ ...basicConfig, username: undefined, password: undefined }),
      ),
    ).rejects.toThrow(/username|password/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("rejects Key credentials without a key (refinement)", async () => {
    await expect(
      createGatewayDatasource(
        baseInput({
          gatewayId: "gw-1",
          datasourceName: "n",
          datasourceType: "OData",
          url: "https://x",
          credentialType: "Key",
          privacyLevel: "None",
        }),
      ),
    ).rejects.toThrow(/key/);
  });

  it("rejects a config with no connection details at all (refinement)", async () => {
    await expect(
      createGatewayDatasource(
        baseInput({
          gatewayId: "gw-1",
          datasourceName: "n",
          datasourceType: "SQL",
          credentialType: "Basic",
          username: "john",
          password: PASSWORD,
          privacyLevel: "None",
        }),
      ),
    ).rejects.toThrow(/connection detail/);
  });

  it("rejects a missing privacyLevel (Q11 — no hidden default)", async () => {
    await expect(
      createGatewayDatasource(
        baseInput({ ...basicConfig, privacyLevel: undefined }),
      ),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      createGatewayDatasource(
        baseInput({ ...basicConfig, connectionDetails: "{\"raw\":\"wire\"}" }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await createGatewayDatasource({
      ...baseInput(basicConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0].providerAccountId).toBe("alice@contoso.com");
    }
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Power BI gateway datasource create POST failed: DM_GWPipeline_UnknownError"),
    );
    await expect(
      createGatewayDatasource(baseInput(basicConfig)),
    ).rejects.toThrow(/DM_GWPipeline_UnknownError/);
  });
});
