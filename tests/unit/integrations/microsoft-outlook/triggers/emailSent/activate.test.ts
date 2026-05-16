/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
}));

import { activate } from "@/integrations/microsoft-outlook/triggers/emailSent/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MICROSOFT_GRAPH_WEBHOOK_URL;
});

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-outlook",
  type: "email_sent",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "microsoft-outlook",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Outlook email_sent activate", () => {
  it("creates subscription on /me/mailFolders/SentItems/messages with changeType=created", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-sent",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/SentItems/messages");
    expect(call.changeType).toBe("created");
    expect(result.resource).toBe("/me/mailFolders/SentItems/messages");
    expect(result.changeType).toBe("created");
  });

  it("uses 70.5h expiration (4230 minutes — Outlook /me/messages max)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreateSubscription.mock.calls[0]![0].clientState).toBe(
      result.clientState,
    );
  });

  it("uses Graph's authoritative expirationDateTime in the persisted config", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-10T23:59:59.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.expiresAt).toBe("2026-05-10T23:59:59.000Z");
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("propagates createSubscription failures verbatim", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/validation request failed/);
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL override when set", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
    );
  });

  it("does NOT route subscription via /me/mailFolders/{folder} — SentItems is the only resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    // Even when the workflow has a `folder` field in its config (which
    // is not a recognized email_sent filter), the activate ignores it.
    await activate({
      node: {
        ...baseNode,
        config: { folder: "should-be-ignored" },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/SentItems/messages",
    );
  });

  it("returns the SUBSCRIPTION_TYPE and webhookEnabled in the config patch", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/SentItems/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.type).toBe("subscription-watch");
    expect(result.webhookEnabled).toBe(true);
  });
});
