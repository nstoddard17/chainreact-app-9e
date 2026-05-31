/**
 * @jest-environment node
 *
 * Tests for `create_checkout_session` handler. Mocks the
 * `checkoutSessionsCreate` wrapper boundary — the wrapper itself
 * is tested at `api/checkoutSessions.test.ts`. Asserts:
 *   - clean mapped payload (V2 typed config → wrapper input)
 *   - Idempotency-Key threading (Q4 — billing-impacting action)
 *   - accountId resolution from Stripe-trigger vs non-Stripe trigger
 *   - output shape locked to a stable key set
 *   - error propagation from the wrapper
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/checkoutSessions", () => ({
  checkoutSessionsCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createCheckoutSession } from "@/integrations/stripe/actions/createCheckoutSession";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "stripe", providerAccountId = "acct_TEST"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    providerAccountId,
    payload: {},
  };
}

function sessionResponse(overrides?: Record<string, unknown>) {
  return {
    id: "cs_test_42",
    object: "checkout.session",
    mode: "payment",
    url: "https://checkout.stripe.com/c/pay/cs_test_42",
    status: "open",
    payment_status: "unpaid",
    customer: null,
    customer_email: null,
    client_reference_id: null,
    payment_intent: null,
    subscription: null,
    amount_total: null,
    currency: null,
    expires_at: 1234567890,
    success_url: "https://example.com/ok",
    cancel_url: "https://example.com/cancel",
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

describe("create_checkout_session action", () => {
  it("calls the wrapper with the clean mapped payment-mode payload", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r1",
      nodeId: "node-a",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [
          { priceId: "price_aaa", quantity: 2 },
          { priceId: "price_bbb", quantity: 1 },
        ],
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.mode).toBe("payment");
    expect(arg.successUrl).toBe("https://example.com/ok");
    expect(arg.cancelUrl).toBe("https://example.com/cancel");
    // Note: handler renames `priceId` → `price` for wire-format parity.
    expect(arg.lineItems).toEqual([
      { price: "price_aaa", quantity: 2 },
      { price: "price_bbb", quantity: 1 },
    ]);
  });

  it("threads Idempotency-Key (Q4 — billing-impacting duplicate-session guard)", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "run-42",
      nodeId: "node-a",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.idempotencyKey).toBe(
      "run-42:node-a:stripe_action_create_checkout_session",
    );
  });

  it("resolves accountId from a Stripe trigger event", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger("stripe", "acct_MERCHANT"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBe("acct_MERCHANT");
  });

  it("resolves accountId as null when triggered by a non-Stripe provider", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger("gmail", "alice@example.com"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBeNull();
  });

  it("forwards optional safe fields when supplied", async () => {
    mockCreate.mockResolvedValueOnce(
      sessionResponse({
        customer: "cus_existing",
        client_reference_id: "ref_abc",
        metadata: { orderId: "order_42" },
      }),
    );
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        customer: "cus_existing",
        clientReferenceId: "ref_abc",
        metadata: { orderId: "order_42" },
        allowPromotionCodes: true,
        automaticTax: { enabled: true },
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.customer).toBe("cus_existing");
    expect(arg.clientReferenceId).toBe("ref_abc");
    expect(arg.metadata).toEqual({ orderId: "order_42" });
    expect(arg.allowPromotionCodes).toBe(true);
    expect(arg.automaticTaxEnabled).toBe(true);
  });

  it("forwards customerEmail when customer is absent", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        customerEmail: "alice@example.com",
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.customerEmail).toBe("alice@example.com");
    expect(arg.customer).toBeUndefined();
  });

  it("supports setup mode (no lineItems forwarded)", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse({ mode: "setup" }));
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "setup",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.mode).toBe("setup");
    expect(arg.lineItems).toBeUndefined();
  });

  it("does NOT forward automaticTaxEnabled when omitted from config", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger(),
    });
    const arg = mockCreate.mock.calls[0]![0];
    expect(arg.automaticTaxEnabled).toBeUndefined();
  });

  it("maps the Stripe response onto the locked output key set", async () => {
    mockCreate.mockResolvedValueOnce(
      sessionResponse({
        customer: "cus_999",
        payment_intent: "pi_abc",
        amount_total: 4999,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        metadata: { source: "workflow" },
      }),
    );
    const result = await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output ?? {}).sort()).toEqual(
      [
        "amountTotal",
        "cancelUrl",
        "clientReferenceId",
        "currency",
        "customerEmail",
        "customerId",
        "expiresAt",
        "livemode",
        "metadata",
        "mode",
        "paymentIntentId",
        "paymentStatus",
        "sessionId",
        "status",
        "subscriptionId",
        "successUrl",
        "url",
      ].sort(),
    );
    expect(result.output).toMatchObject({
      sessionId: "cs_test_42",
      url: "https://checkout.stripe.com/c/pay/cs_test_42",
      mode: "payment",
      status: "complete",
      paymentStatus: "paid",
      customerId: "cus_999",
      paymentIntentId: "pi_abc",
      amountTotal: 4999,
      currency: "usd",
      metadata: { source: "workflow" },
      livemode: false,
    });
  });

  it("does NOT spread input into output (V2 convention)", async () => {
    mockCreate.mockResolvedValueOnce(sessionResponse());
    const result = await createCheckoutSession({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { secret_input: "do-not-echo" },
      },
      triggerEvent: trigger(),
    });
    // Input metadata isn't echoed back — the output reflects Stripe's
    // response metadata (empty in the mock) instead.
    expect(result.output?.metadata).toEqual({});
    expect(Object.keys(result.output ?? {})).not.toContain("lineItems");
    expect(Object.keys(result.output ?? {})).not.toContain("priceId");
  });

  it("propagates wrapper errors to the caller", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("Stripe POST /v1/checkout/sessions failed: card_declined"),
    );
    await expect(
      createCheckoutSession({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          mode: "payment",
          successUrl: "https://example.com/ok",
          cancelUrl: "https://example.com/cancel",
          lineItems: [{ priceId: "price_123", quantity: 1 }],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/card_declined/);
  });

  it("Zod parse rejects invalid config before any wrapper call", async () => {
    await expect(
      createCheckoutSession({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        // mode missing — strict parse rejects.
        config: {
          successUrl: "https://example.com/ok",
          cancelUrl: "https://example.com/cancel",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
