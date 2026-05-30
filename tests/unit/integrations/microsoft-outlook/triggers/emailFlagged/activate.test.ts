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

import { activate } from "@/integrations/microsoft-outlook/triggers/emailFlagged/activate";

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
});

const baseNode = {
  id: "node-flagged-1",
  kind: "trigger" as const,
  provider: "microsoft-outlook",
  type: "email_flagged",
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

describe("Outlook email_flagged activate", () => {
  it("creates subscription on /me/messages with changeType=updated (no folder)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-flagged-1",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "2026-05-11T00:00:00Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/messages");
    expect(call.changeType).toBe("updated");
    expect(result.changeType).toBe("updated");
  });

  it("routes subscription to /me/mailFolders/{folder}/messages when folder is set", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-flagged-folder",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "inbox" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/inbox/messages",
    );
  });

  it("trims whitespace around folder before composing the resource", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/mailFolders/inbox/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "  inbox  " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/mailFolders/inbox/messages",
    );
  });

  it("falls back to /me/messages for empty / whitespace-only folder", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({
      node: { ...baseNode, config: { folder: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].resource).toBe(
      "/me/messages",
    );
  });

  it("uses 70.5h expiration (4230 minutes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
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

  it("generates a 64-char hex clientState", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
  });

  it("threads userId + accountId through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/messages",
      changeType: "updated",
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
});
