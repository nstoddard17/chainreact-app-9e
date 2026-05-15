/**
 * @jest-environment node
 *
 * Tests for `create_payment_link` handler. Mocks the
 * `paymentLinksCreate` wrapper boundary — wrapper itself is tested
 * at `api/paymentLinks.test.ts`. Asserts:
 *   - clean mapped payload (V2 typed config → wrapper input)
 *   - priceId → wire-format `price` rename
 *   - Idempotency-Key threading (Q4 — exact shape)
 *   - accountId resolution from Stripe-trigger vs non-Stripe trigger
 *   - locked output key set + no input spreading
 *   - error propagation
 *   - Zod parse rejects before wrapper call
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/paymentLinks", () => ({
  paymentLinksCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createPaymentLink } from "@/integrations/stripe/actions/createPaymentLink";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "stripe", accountId = "acct_TEST"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    accountId,
    payload: {},
  };
}

function paymentLinkResponse(overrides?: Record<string, unknown>) {
  return {
    id: "plink_test_42",
    object: "payment_link",
    active: true,
    url: "https://buy.stripe.com/test_42",
    currency: "usd",
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("create_payment_link action", () => {
  it("calls the wrapper with the clean mapped payload (priceId → wire price)", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r1",
      nodeId: "node-a",
      config: {
        lineItems: [
          { priceId: "price_aaa", quantity: 2 },
          { priceId: "price_bbb", quantity: 1 },
        ],
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.lineItems).toEqual([
      { price: "price_aaa", quantity: 2 },
      { price: "price_bbb", quantity: 1 },
    ]);
  });

  it("threads Idempotency-Key with the exact shape ${runId}:${nodeId}:stripe_action_create_payment_link", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "run-42",
      nodeId: "node-a",
      config: {
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.idempotencyKey).toBe(
      "run-42:node-a:stripe_action_create_payment_link",
    );
  });

  it("resolves accountId from a Stripe trigger event", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { lineItems: [{ priceId: "price_123", quantity: 1 }] },
      triggerEvent: trigger("stripe", "acct_MERCHANT"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.accountId).toBe("acct_MERCHANT");
  });

  it("resolves accountId as null when triggered by a non-Stripe provider", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { lineItems: [{ priceId: "price_123", quantity: 1 }] },
      triggerEvent: trigger("gmail", "alice@example.com"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.accountId).toBeNull();
  });

  it("forwards optional safe fields when supplied", async () => {
    mockCreate.mockResolvedValueOnce(
      paymentLinkResponse({ metadata: { orderId: "order_42" } }),
    );
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { orderId: "order_42" },
        allowPromotionCodes: true,
        afterCompletion: {
          type: "redirect",
          redirectUrl: "https://example.com/thanks",
        },
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.metadata).toEqual({ orderId: "order_42" });
    expect(arg.allowPromotionCodes).toBe(true);
    expect(arg.afterCompletion).toEqual({
      type: "redirect",
      redirectUrl: "https://example.com/thanks",
    });
  });

  it("forwards hosted_confirmation afterCompletion variant verbatim", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        afterCompletion: { type: "hosted_confirmation" },
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.afterCompletion).toEqual({ type: "hosted_confirmation" });
  });

  it("does NOT forward optional fields when omitted from config", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { lineItems: [{ priceId: "price_123", quantity: 1 }] },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.metadata).toBeUndefined();
    expect(arg.allowPromotionCodes).toBeUndefined();
    expect(arg.afterCompletion).toBeUndefined();
  });

  it("maps the Stripe response onto the locked output key set", async () => {
    mockCreate.mockResolvedValueOnce(
      paymentLinkResponse({
        id: "plink_99",
        url: "https://buy.stripe.com/test_99",
        active: true,
        currency: "eur",
        metadata: { source: "workflow" },
        livemode: false,
      }),
    );
    const result = await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { lineItems: [{ priceId: "price_123", quantity: 1 }] },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output ?? {}).sort()).toEqual(
      [
        "active",
        "currency",
        "livemode",
        "metadata",
        "paymentLinkId",
        "url",
      ].sort(),
    );
    expect(result.output).toEqual({
      paymentLinkId: "plink_99",
      url: "https://buy.stripe.com/test_99",
      active: true,
      currency: "eur",
      metadata: { source: "workflow" },
      livemode: false,
    });
  });

  it("does NOT spread input into output (V2 convention)", async () => {
    mockCreate.mockResolvedValueOnce(paymentLinkResponse());
    const result = await createPaymentLink({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { secret_input: "do-not-echo" },
      },
      triggerEvent: trigger(),
    });
    expect(result.output?.metadata).toEqual({});
    expect(Object.keys(result.output ?? {})).not.toContain("lineItems");
    expect(Object.keys(result.output ?? {})).not.toContain("priceId");
    expect(Object.keys(result.output ?? {})).not.toContain("afterCompletion");
    expect(Object.keys(result.output ?? {})).not.toContain("allowPromotionCodes");
  });

  it("propagates wrapper errors to the caller", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Stripe POST /v1/payment_links failed: invalid_request"),
    );
    await expect(
      createPaymentLink({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { lineItems: [{ priceId: "price_123", quantity: 1 }] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/invalid_request/);
  });

  it("Zod parse rejects invalid config before any wrapper call", async () => {
    await expect(
      createPaymentLink({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        // missing lineItems — strict parse rejects.
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
