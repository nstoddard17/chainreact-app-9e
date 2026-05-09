/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockDriveRootDelta = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
}));

jest.mock("@/integrations/microsoft-onedrive/api/driveRootDelta", () => ({
  driveRootDelta: (...args: unknown[]) => mockDriveRootDelta(...args),
}));

import { activate } from "@/integrations/microsoft-onedrive/triggers/fileChanged/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateSubscription.mockReset();
  mockDriveRootDelta.mockReset();
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
  provider: "microsoft-onedrive",
  type: "file_changed",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "microsoft-onedrive",
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

describe("OneDrive file_changed activate", () => {
  it("captures baseline delta cursor BEFORE creating the subscription", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=baseline",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-onedrive",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
    });

    // Delta call ordering: must come BEFORE subscription create.
    expect(mockDriveRootDelta).toHaveBeenCalled();
    expect(mockCreateSubscription).toHaveBeenCalled();
    const deltaInvocationOrder =
      mockDriveRootDelta.mock.invocationCallOrder[0]!;
    const subscribeInvocationOrder =
      mockCreateSubscription.mock.invocationCallOrder[0]!;
    expect(deltaInvocationOrder).toBeLessThan(subscribeInvocationOrder);
    expect(result.deltaToken).toBe("https://graph/x?token=baseline");
  });

  it("creates subscription on /me/drive/root with changeType=updated and 70.5h expiration", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/drive/root");
    expect(call.changeType).toBe("updated");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-onedrive",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-onedrive/lifecycle",
    );
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/drive/root",
      changeType: "updated",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-12T00:00:00.000Z",
      deltaToken: "https://graph/x?token=t",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreateSubscription.mock.calls[0]![0].clientState).toBe(
      result.clientState,
    );
  });

  it("threads microsoft-onedrive provider through refreshAndRetry on both Graph calls", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration });

    // Both refreshAndRetry calls must use the OneDrive provider id.
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          userId: "user-1",
          provider: "microsoft-onedrive",
          accountId: "alice@contoso.com",
        }),
      );
    }
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-onedrive", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive";

    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/drive/root",
      changeType: "updated",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-onedrive/lifecycle",
    );
  });

  it("MICROSOFT_GRAPH_WEBHOOK_URL set to mail or calendar paths still resolves to OneDrive route", async () => {
    // The same env var is shared across Microsoft providers. Setting it
    // to any of the known siblings must not double-suffix the path.
    for (const sibling of [
      "https://tunnel.example.test/api/webhooks/microsoft-outlook",
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
    ]) {
      process.env.MICROSOFT_GRAPH_WEBHOOK_URL = sibling;
      mockDriveRootDelta.mockResolvedValueOnce({
        items: [],
        deltaLink: "https://graph/x?token=t",
      });
      mockCreateSubscription.mockResolvedValueOnce({
        id: "s",
        resource: "/me/drive/root",
        changeType: "updated",
        notificationUrl: "x",
        expirationDateTime: "x",
      });
      await activate({ node: baseNode, integration: baseIntegration });
      const call = mockCreateSubscription.mock.calls.at(-1)![0];
      expect(call.notificationUrl).toBe(
        "https://tunnel.example.test/api/webhooks/microsoft-onedrive",
      );
    }
  });

  it("propagates createSubscription failures verbatim (lifecycle wraps with TRIGGER_REGISTRATION_FAILED)", async () => {
    mockDriveRootDelta.mockResolvedValueOnce({
      items: [],
      deltaLink: "https://graph/x?token=t",
    });
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration }),
    ).rejects.toThrow(/validation request failed/);
  });

  it("propagates baseline-delta failures (cannot proceed without a baseline cursor)", async () => {
    mockDriveRootDelta.mockRejectedValueOnce(
      new Error("Microsoft Graph me/drive/root/delta failed: HTTP 503"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
    // Subscription must NOT have been attempted.
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });
});
