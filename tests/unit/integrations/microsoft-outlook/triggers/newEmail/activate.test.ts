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

import { activate } from "@/integrations/microsoft-outlook/triggers/newEmail/activate";

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
  type: "new_email",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
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

describe("Outlook new_email activate", () => {
  it("creates subscription on /me/messages with changeType=created and 70.5h expiration", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-outlook",
      expirationDateTime: "2026-05-11T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(call.changeType).toBe("created");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook/lifecycle",
    );
    // Expiration must be ~4230 minutes (70.5h) from now.
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    // Allow 60s skew for test timing.
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/messages",
      changeType: "created",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-11T00:00:00.000Z",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
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
    // Sent in the request, not just stored locally.
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.clientState).toBe(result.clientState);
  });

  it("uses Graph's authoritative expirationDateTime in the persisted config (Graph may round)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      // Graph returned a slightly DIFFERENT timestamp than we requested
      // (truncated/rounded). The persisted value reflects what Graph
      // accepted, not what we asked for.
      expirationDateTime: "2026-05-10T23:59:59.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.expiresAt).toBe("2026-05-10T23:59:59.000Z");
  });

  it("each activation generates a fresh clientState (no reuse)", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const r1 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const r2 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(r1.clientState).not.toBe(r2.clientState);
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "microsoft-outlook",
        accountId: "alice@contoso.com",
      }),
    );
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-outlook", async () => {
    // Mirrors V1's stripping logic — the env var may be a "full webhook URL"
    // OR a base; we always append the canonical path.
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook/lifecycle",
    );
  });

  it("propagates createSubscription failures verbatim (lifecycle wraps with TRIGGER_REGISTRATION_FAILED)", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/validation request failed/);
  });

  // Outlook Mail 2.3 D-OM3 — folder-scoped subscription routing.

  it("routes subscription to /me/mailFolders/{folder}/messages when node.config.folder is set", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-folder",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: { ...baseNode, config: { folder: "inbox" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/inbox/messages");
    expect(result.resource).toBe("/me/mailFolders/inbox/messages");
  });

  it("accepts a custom Graph folder id verbatim in the subscription resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/AAMkAGI2-custom-folder/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: {
        ...baseNode,
        config: { folder: "AAMkAGI2-custom-folder" },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe(
      "/me/mailFolders/AAMkAGI2-custom-folder/messages",
    );
  });

  it("trims whitespace around the folder before composing the resource path", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "  inbox  " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/mailFolders/inbox/messages");
  });

  it("falls back to /me/messages when folder is an empty / whitespace-only string", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
  });

  it("falls back to /me/messages when folder is not a string", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: {
        ...baseNode,
        config: { folder: { id: "x" } as unknown as string },
      },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
  });

  it("preserves Slice 6 behavior when no folder field is set (backward compat)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode, // config: {}
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(result.resource).toBe("/me/messages");
  });
});
