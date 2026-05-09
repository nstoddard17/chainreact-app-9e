/**
 * @jest-environment node
 */
const mockCreate = jest.fn();

jest.mock("@/integrations/_shared/stripe/api/webhookEndpoints", () => ({
  webhookEndpointsCreate: (...args: unknown[]) => mockCreate(...args),
  webhookEndpointsDelete: jest.fn(),
}));

import { activate } from "@/integrations/stripe/triggers/eventReceived/activate";

beforeEach(() => {
  mockCreate.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.STRIPE_CLIENT_SECRET = "sk_test_platform_secret";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.STRIPE_CLIENT_SECRET;
  delete process.env.STRIPE_WEBHOOK_URL;
});

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "stripe",
  providerAccountId: "acct_test_1",
  displayName: "acct_test_1",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: ["read_write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "stripe",
  type: "event_received",
  config: {
    enabledEvents: ["payment_intent.succeeded", "charge.refunded"],
  },
  position: { x: 0, y: 0 },
};

function createResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "we_test_1",
    object: "webhook_endpoint",
    url: "https://app.example.test/api/webhooks/stripe?workflowId=unknown&nodeId=node-trigger-1",
    secret: "whsec_signing_xxx",
    enabled_events: ["payment_intent.succeeded", "charge.refunded"],
    status: "enabled",
    livemode: false,
    created: 1700000000,
    api_version: "2025-05-28.basil",
    description: "ChainReact workflow unknown node node-trigger-1",
    ...overrides,
  };
}

describe("Stripe event_received activate", () => {
  it("creates the webhook endpoint and returns the canonical config patch", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      webhookEnabled: true,
      endpointId: "we_test_1",
      endpointSecret: "whsec_signing_xxx",
      enabledEvents: ["payment_intent.succeeded", "charge.refunded"],
      notificationUrl: expect.stringContaining(
        "/api/webhooks/stripe?",
      ),
    });
    // Activation MUST NOT set type: "subscription-watch" — Stripe
    // endpoints don't expire and the runRenewals cron filters on
    // that marker. Setting it would queue Stripe rows for renewal
    // every 10 minutes for nothing.
    expect(result).not.toHaveProperty("type");
  });

  it("sends connect=true and the description threaded with workflow + node ids", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());

    await activate({
      node: { ...baseNode, ...({ workflowId: "wf-XYZ" } as object) },
      integration: baseIntegration,
    });

    const callArg = mockCreate.mock.calls[0]![0];
    expect(callArg.connect).toBe(true);
    expect(callArg.description).toContain("wf-XYZ");
    expect(callArg.description).toContain("node-trigger-1");
    expect(callArg.url).toContain("workflowId=wf-XYZ");
    expect(callArg.url).toContain("nodeId=node-trigger-1");
  });

  it("uses STRIPE_WEBHOOK_URL override (e2e mock surface)", async () => {
    process.env.STRIPE_WEBHOOK_URL = "http://localhost:9881";
    mockCreate.mockResolvedValueOnce(createResponse());
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
    });
    expect(result.notificationUrl).toMatch(
      /^http:\/\/localhost:9881\/api\/webhooks\/stripe\?/,
    );
  });

  it("threads the platform secret (NOT the merchant access token)", async () => {
    mockCreate.mockResolvedValueOnce(createResponse());
    await activate({ node: baseNode, integration: baseIntegration });
    const callArg = mockCreate.mock.calls[0]![0];
    // STRIPE_CLIENT_SECRET, not the merchant access token from
    // baseIntegration.accessTokenEncrypted.
    expect(callArg.platformSecret).toBe("sk_test_platform_secret");
  });

  it("rejects when enabledEvents is missing", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/enabledEvents is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when enabledEvents is empty array", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { enabledEvents: [] } },
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/enabledEvents is required/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when an event type is outside the allowlist (Q11 fail-loud)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: {
            enabledEvents: [
              "payment_intent.succeeded",
              "payment_intent.canceled", // not in Slice 11 allowlist
            ],
          },
        },
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/payment_intent.canceled.*allowlist/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_CLIENT_SECRET env is not set", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(
      activate({ node: baseNode, integration: baseIntegration }),
    ).rejects.toThrow(/STRIPE_CLIENT_SECRET/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("throws when Stripe response omits the signing secret (load-bearing for receive verify)", async () => {
    mockCreate.mockResolvedValueOnce(
      createResponse({ secret: undefined }),
    );
    await expect(
      activate({ node: baseNode, integration: baseIntegration }),
    ).rejects.toThrow(/missing 'secret'/);
  });
});
