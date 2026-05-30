/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockWebhooksCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/airtable/api/webhooks", () => ({
  webhooksCreate: (...args: unknown[]) => mockWebhooksCreate(...args),
  webhooksDelete: jest.fn(),
  webhooksRefresh: jest.fn(),
  webhooksListPayloads: jest.fn(),
}));

import { activate } from "@/integrations/airtable/triggers/recordChanged/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockWebhooksCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.AIRTABLE_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "airtable",
  providerAccountId: "usrXXX",
  displayName: "alice",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "airtable",
  type: "record_changed",
  config: { baseId: "appBASE" },
  position: { x: 0, y: 0 },
};

describe("Airtable record_changed activate", () => {
  it("creates the webhook and returns the canonical config patch shape", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "secret-mac-key",
      expirationTime: "2026-05-16T00:00:00.000Z",
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockWebhooksCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      type: "subscription-watch",
      webhookEnabled: true,
      baseId: "appBASE",
      webhookId: "achNEW",
      macSecretBase64: "secret-mac-key",
      notificationUrl: expect.stringContaining(
        "/api/webhooks/airtable?",
      ),
      expiresAt: "2026-05-16T00:00:00.000Z",
      lastCursor: null,
    });
    // Notification URL should carry workflow + node ids for diagnostics.
    const url = result.notificationUrl as string;
    expect(url).toContain("nodeId=node-trigger-1");
  });

  it("threads tableIdOrName as recordChangeScope when provided", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({
      node: { ...baseNode, config: { baseId: "appBASE", tableIdOrName: "tblTASKS" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    const callArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(callArg.specification).toEqual({
      dataTypes: ["tableData"],
      recordChangeScope: "tblTASKS",
    });
  });

  it("watches all tables when tableIdOrName is omitted (specification = dataTypes only)", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const callArg = mockWebhooksCreate.mock.calls[0]![0];
    expect(callArg.specification).toEqual({ dataTypes: ["tableData"] });
  });

  it("throws when baseId is missing (required config field)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/baseId is required/);
    expect(mockWebhooksCreate).not.toHaveBeenCalled();
  });

  it("uses AIRTABLE_WEBHOOK_URL override when set (e2e mock surface)", async () => {
    process.env.AIRTABLE_WEBHOOK_URL = "http://localhost:9880";
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9880\/api\/webhooks\/airtable\?/,
    );
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockWebhooksCreate.mockResolvedValueOnce({
      id: "achNEW",
      macSecretBase64: "s",
      expirationTime: "x",
    });
    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    expect(mockRefreshAndRetry.mock.calls[0]![0].userId).toBe("user-1");
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("airtable");
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe("usrXXX");
  });
});
