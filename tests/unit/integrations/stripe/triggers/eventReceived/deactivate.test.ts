/**
 * @jest-environment node
 */
const mockDelete = jest.fn();

jest.mock("@/integrations/_shared/stripe/api/webhookEndpoints", () => ({
  webhookEndpointsCreate: jest.fn(),
  webhookEndpointsDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { deactivate } from "@/integrations/stripe/triggers/eventReceived/deactivate";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";

beforeEach(() => {
  mockDelete.mockReset();
  process.env.STRIPE_CLIENT_SECRET = "sk_test_platform";
});

afterEach(() => {
  delete process.env.STRIPE_CLIENT_SECRET;
});

const integration = {
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

function trigger(config: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "stripe",
    eventType: "event_received",
    nodeId: "node-1",
    config: {
      webhookEnabled: true,
      endpointId: "we_test_1",
      endpointSecret: "whsec_xxx",
      enabledEvents: ["payment_intent.succeeded"],
      ...config,
    },
    accountId: "acct_test_1",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Stripe event_received deactivate", () => {
  it("calls webhookEndpointsDelete with the platform secret + endpoint id", async () => {
    mockDelete.mockResolvedValueOnce({
      id: "we_test_1",
      object: "webhook_endpoint",
      deleted: true,
    });
    await deactivate({ trigger: trigger(), integration });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]).toEqual({
      platformSecret: "sk_test_platform",
      id: "we_test_1",
    });
  });

  it("swallows NotFoundError (endpoint already gone server-side)", async () => {
    mockDelete.mockRejectedValueOnce(
      new NotFoundError("webhook_endpoint we_test_1"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (so lifecycle orchestrator can log)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Stripe DELETE /v1/webhook_endpoints/we_test_1 failed: rate_limited"),
    );
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).rejects.toThrow(/rate_limited/);
  });

  it("skips silently when trigger config has no endpointId (corrupt / partial-activation row)", async () => {
    await deactivate({
      trigger: trigger({ endpointId: undefined }),
      integration,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects when STRIPE_CLIENT_SECRET env is not set", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(
      deactivate({ trigger: trigger(), integration }),
    ).rejects.toThrow(/STRIPE_CLIENT_SECRET/);
  });
});
