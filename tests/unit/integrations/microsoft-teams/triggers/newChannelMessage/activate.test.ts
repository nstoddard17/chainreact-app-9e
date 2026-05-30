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

import { activate } from "@/integrations/microsoft-teams/triggers/newChannelMessage/activate";

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
  provider: "microsoft-teams",
  type: "new_channel_message",
  config: { teamId: "team-1", channelId: "ch-1" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-teams",
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

describe("Teams new_channel_message activate", () => {
  it("creates subscription on /teams/{teamId}/channels/{channelId}/messages with changeType=created", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-teams",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/teams/team-1/channels/ch-1/messages");
    expect(call.changeType).toBe("created");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-teams",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-teams/lifecycle",
    );
  });

  it("expirationDateTime is ~4230 minutes (~70.5h) in the future", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const before = Date.now();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    const after = Date.now();

    const callExp = new Date(
      mockCreateSubscription.mock.calls[0]![0].expirationDateTime,
    ).getTime();
    const expectedMinMs = before + 4230 * 60 * 1000 - 1000; // -1s tolerance
    const expectedMaxMs = after + 4230 * 60 * 1000 + 1000; // +1s tolerance
    expect(callExp).toBeGreaterThanOrEqual(expectedMinMs);
    expect(callExp).toBeLessThanOrEqual(expectedMaxMs);
  });

  it("does NOT set includeResourceData (Graph defaults to false — Batch 1 avoids encryption certs)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    // The shared wrapper's CreateSubscriptionInput doesn't accept
    // includeResourceData; this assertion enforces that the activate
    // hook does NOT smuggle the field in via the input object.
    expect("includeResourceData" in call).toBe(false);
  });

  it("generates a 32-byte hex clientState (64 hex chars)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
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

  it("clientState does NOT leak workflow id (V1 rot fix)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    // V1 set clientState: `workflow_${workflowId}` — leaky. V2 uses
    // random bytes.
    expect(result.clientState).not.toContain("workflow_");
    expect(result.clientState).not.toContain("wf-test");
  });

  it("stores subscription metadata for later renewal + receive lookup", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-id",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result).toEqual({
      teamId: "team-1",
      channelId: "ch-1",
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      subscriptionId: "sub-graph-id",
      clientState: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      expiresAt: "2026-05-12T00:00:00.000Z",
    });
  });

  it("honors MICROSOFT_GRAPH_WEBHOOK_URL env override", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL = "https://override.example.test";
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].notificationUrl).toBe(
      "https://override.example.test/api/webhooks/microsoft-teams",
    );
  });

  it("rejects activation when teamId is missing (Zod fails closed)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { teamId: "", channelId: "ch-1" },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });

  it("rejects activation when channelId is missing", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { teamId: "team-1", channelId: "" },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
  });

  it("propagates subscription-create errors so orchestrator records TRIGGER_REGISTRATION_FAILED", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Graph validation failed"),
    );

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/Graph validation failed/);
  });
});
