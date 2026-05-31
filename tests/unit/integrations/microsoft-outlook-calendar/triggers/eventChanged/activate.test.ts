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

import { activate } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/activate";

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
  provider: "microsoft-outlook-calendar",
  type: "event_changed",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-outlook-calendar",
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

describe("Outlook Calendar event_changed activate", () => {
  it("creates subscription on /me/events with changeType=created,updated,deleted and 70.5h expiration", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
      expirationDateTime: "2026-05-11T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/events");
    expect(call.changeType).toBe("created,updated,deleted");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar/lifecycle",
    );
    // Expiration must be ~4230 minutes (70.5h) from now.
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    // Allow 60s skew for test timing.
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/events",
      changeType: "created,updated,deleted",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-11T00:00:00.000Z",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
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
      resource: "/me/events",
      changeType: "created,updated,deleted",
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
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const r1 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const r2 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(r1.clientState).not.toBe(r2.clientState);
  });

  it("threads userId + accountId + microsoft-outlook-calendar provider through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-outlook-calendar", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar/lifecycle",
    );
  });

  it("MICROSOFT_GRAPH_WEBHOOK_URL pointing at the mail path is stripped to root before appending /microsoft-outlook-calendar", async () => {
    // The same env var is shared with Slice 6 mail; setting it to the
    // mail webhook path must NOT generate
    // /api/webhooks/microsoft-outlook/api/webhooks/microsoft-outlook-calendar.
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
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
});
