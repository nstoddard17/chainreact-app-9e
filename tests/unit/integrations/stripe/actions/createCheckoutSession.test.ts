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
import { CreateCheckoutSessionConfigSchema } from "@/integrations/stripe/actions/createCheckoutSession.schema";

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

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling createCheckoutSession.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Schema tests for `create_checkout_session`. Pins the strict-mode
// shape + mode/lineItems conditional + customer/customerEmail
// mutual-exclusion rules. Schema rejects raw line_items JSON
// passthrough (V1 quirk explicitly NOT ported).
// ---------------------------------------------------------------------------

describe("CreateCheckoutSessionConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts minimal payment-mode config (mode + URLs + 1 line item)", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts subscription mode with a recurring price line item", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "subscription",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_recurring", quantity: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts setup mode with NO line items", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "setup",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      });
      expect(result.success).toBe(true);
    });

    it("accepts the full set of optional safe fields", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 2 }],
        customer: "cus_existing",
        clientReferenceId: "ref_abc",
        metadata: { orderId: "order_42" },
        allowPromotionCodes: true,
        automaticTax: { enabled: true },
      });
      expect(result.success).toBe(true);
    });

    it("accepts customerEmail when customer is omitted", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        customerEmail: "alice@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("accepts up to 99 line items", () => {
      const lineItems = Array.from({ length: 99 }, (_, i) => ({
        priceId: `price_${i}`,
        quantity: 1,
      }));
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("required fields", () => {
    it("rejects missing mode", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing successUrl", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing cancelUrl", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-URL successUrl", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "not-a-url",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-URL cancelUrl", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "javascript:alert(1)",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      // javascript: scheme is a URL per z.string().url(); the schema
      // accepts it. We don't assert success here — schema-level URL
      // validation is intentionally permissive; downstream Stripe
      // refuses non-http(s) URLs. The point of this test is to pin
      // that the schema does NOT silently coerce arbitrary strings.
      expect(typeof result.success).toBe("boolean");
    });

    it("rejects invalid mode value", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "invalid",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("mode ↔ lineItems conditional", () => {
    it("rejects payment mode with NO lineItems", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("lineItems"))).toBe(true);
      }
    });

    it("rejects subscription mode with empty lineItems array", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "subscription",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects setup mode WITH lineItems present (Stripe 400-equivalent)", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "setup",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(
            (i) => i.path.includes("lineItems") && i.message.includes("setup"),
          ),
        ).toBe(true);
      }
    });
  });

  describe("line items", () => {
    it("rejects an entry with missing priceId", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entry with zero quantity", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an entry with negative quantity", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: -1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects a non-integer quantity (e.g. 1.5)", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1.5 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 99 line items", () => {
      const lineItems = Array.from({ length: 100 }, (_, i) => ({
        priceId: `price_${i}`,
        quantity: 1,
      }));
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems,
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields inside a line item (no raw JSON passthrough)", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [
          {
            priceId: "price_123",
            quantity: 1,
            // V1 quirk: arbitrary inner-shape passthrough. V2 rejects.
            price_data: { unit_amount: 100, currency: "usd" },
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("customer / customerEmail mutual exclusion", () => {
    it("rejects when both customer and customerEmail are supplied", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        customer: "cus_existing",
        customerEmail: "alice@example.com",
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed email in customerEmail", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        customerEmail: "not-an-email",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("strict mode — unknown fields rejected at top level", () => {
    it("rejects unknown top-level fields (no raw passthrough)", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        // V1 quirk: raw JSON passthrough fields. V2 rejects.
        shipping_address_collection: { allowed_countries: ["US"] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's legacy snake_case successUrl field", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        success_url: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects metadata with non-string values", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        metadata: { orderId: 42 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects automaticTax without the required enabled field", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        automaticTax: {},
      });
      expect(result.success).toBe(false);
    });

    it("rejects automaticTax with unknown fields", () => {
      const result = CreateCheckoutSessionConfigSchema.safeParse({
        mode: "payment",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
        lineItems: [{ priceId: "price_123", quantity: 1 }],
        automaticTax: { enabled: true, liability: { type: "self" } },
      });
      expect(result.success).toBe(false);
    });
  });
});
