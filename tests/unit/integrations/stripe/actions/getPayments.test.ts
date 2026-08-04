/**
 * @jest-environment node
 *
 * Tests for `get_payments` handler. Mocks the `chargesList` wrapper
 * boundary. Asserts:
 *   - clean query forwarding (customer / limit / cursor mapping)
 *   - accountId routing from Stripe-trigger vs non-Stripe trigger
 *   - bounded 13-key projection per payment (no raw Stripe response
 *     keys leaked)
 *   - locked top-level output keys (payments, count, hasMore,
 *     nextCursor)
 *   - nextCursor derivation: last id when hasMore=true, null otherwise
 *   - empty / single-page / partial-result paths
 *   - error propagation
 *   - Zod parse rejects before wrapper call
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/charges", () => ({
  chargesList: (...args: unknown[]) => mockList(...args),
}));

import { getPayments } from "@/integrations/stripe/actions/getPayments";
import { GetPaymentsConfigSchema } from "@/integrations/stripe/actions/getPayments.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
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

function chargeResponse(overrides?: Record<string, unknown>) {
  return {
    id: "ch_test_1",
    object: "charge",
    amount: 1000,
    currency: "usd",
    status: "succeeded",
    paid: true,
    refunded: false,
    customer: "cus_1",
    payment_intent: "pi_1",
    created: 1234567890,
    description: null,
    receipt_url: null,
    metadata: {},
    livemode: false,
    ...overrides,
  };
}

function listResponse(
  charges: Array<Record<string, unknown>>,
  hasMore = false,
) {
  return {
    object: "list",
    data: charges,
    has_more: hasMore,
    url: "/v1/charges",
  };
}

describe("get_payments action", () => {
  it("calls the wrapper with empty query when no filters supplied", async () => {
    mockList.mockResolvedValueOnce(listResponse([]));
    await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    const arg = mockList.mock.calls[0]![0];
    expect(arg.customer).toBeUndefined();
    expect(arg.limit).toBeUndefined();
    expect(arg.startingAfter).toBeUndefined();
    expect(arg.endingBefore).toBeUndefined();
  });

  it("forwards customer + limit + startingAfter", async () => {
    mockList.mockResolvedValueOnce(listResponse([]));
    await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        customer: "cus_42",
        limit: 25,
        startingAfter: "ch_prev",
      },
      triggerEvent: trigger(),
    });
    const arg = mockList.mock.calls[0]![0];
    expect(arg.customer).toBe("cus_42");
    expect(arg.limit).toBe(25);
    expect(arg.startingAfter).toBe("ch_prev");
  });

  it("resolves accountId from a Stripe trigger event", async () => {
    mockList.mockResolvedValueOnce(listResponse([]));
    await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger("stripe", "acct_MERCHANT"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBe("acct_MERCHANT");
  });

  it("resolves accountId as null when triggered by a non-Stripe provider", async () => {
    mockList.mockResolvedValueOnce(listResponse([]));
    await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger("gmail", "alice@example.com"),
    });
    const arg = mockRefreshAndRetry.mock.calls[0]![0];
    expect(arg.providerAccountId).toBeNull();
  });

  it("maps each charge to the bounded 13-key projection", async () => {
    mockList.mockResolvedValueOnce(
      listResponse([
        chargeResponse({
          id: "ch_99",
          amount: 4999,
          currency: "usd",
          status: "succeeded",
          paid: true,
          refunded: false,
          customer: "cus_99",
          payment_intent: "pi_99",
          created: 1700000000,
          description: "Sale of widget",
          receipt_url: "https://pay.stripe.com/receipts/ch_99",
          metadata: { orderId: "order_99" },
          livemode: false,
        }),
      ]),
    );
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    const payment = (result.output!.payments as unknown[])[0]!;
    expect(Object.keys(payment as object).sort()).toEqual(
      [
        "amount",
        "chargeId",
        "created",
        "currency",
        "customerId",
        "description",
        "livemode",
        "metadata",
        "paid",
        "paymentIntentId",
        "receiptUrl",
        "refunded",
        "status",
      ].sort(),
    );
    expect(payment).toEqual({
      chargeId: "ch_99",
      amount: 4999,
      currency: "usd",
      status: "succeeded",
      paid: true,
      refunded: false,
      customerId: "cus_99",
      paymentIntentId: "pi_99",
      created: 1700000000,
      description: "Sale of widget",
      receiptUrl: "https://pay.stripe.com/receipts/ch_99",
      metadata: { orderId: "order_99" },
      livemode: false,
    });
  });

  it("emits the locked top-level output key set (payments, count, hasMore, nextCursor)", async () => {
    mockList.mockResolvedValueOnce(listResponse([chargeResponse()]));
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output ?? {}).sort()).toEqual(
      ["count", "hasMore", "nextCursor", "payments"].sort(),
    );
  });

  it("sets count = payments.length", async () => {
    mockList.mockResolvedValueOnce(
      listResponse([
        chargeResponse({ id: "ch_1" }),
        chargeResponse({ id: "ch_2" }),
        chargeResponse({ id: "ch_3" }),
      ]),
    );
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(result.output!.count).toBe(3);
    expect((result.output!.payments as unknown[]).length).toBe(3);
  });

  it("derives nextCursor = last charge id when hasMore is true", async () => {
    mockList.mockResolvedValueOnce(
      listResponse(
        [
          chargeResponse({ id: "ch_a" }),
          chargeResponse({ id: "ch_b" }),
          chargeResponse({ id: "ch_c" }),
        ],
        true,
      ),
    );
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(result.output!.hasMore).toBe(true);
    expect(result.output!.nextCursor).toBe("ch_c");
  });

  it("sets nextCursor = null when hasMore is false", async () => {
    mockList.mockResolvedValueOnce(
      listResponse([chargeResponse({ id: "ch_x" })], false),
    );
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(result.output!.hasMore).toBe(false);
    expect(result.output!.nextCursor).toBeNull();
  });

  it("sets nextCursor = null when result set is empty even if hasMore is true (defensive)", async () => {
    mockList.mockResolvedValueOnce(listResponse([], true));
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(result.output!.payments).toEqual([]);
    expect(result.output!.count).toBe(0);
    expect(result.output!.nextCursor).toBeNull();
  });

  it("does NOT auto-paginate (single wrapper call when hasMore=true)", async () => {
    mockList.mockResolvedValueOnce(
      listResponse([chargeResponse({ id: "ch_1" })], true),
    );
    await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("does NOT spread raw Stripe charge fields into the bounded projection", async () => {
    mockList.mockResolvedValueOnce(
      listResponse([
        {
          ...chargeResponse(),
          // Stripe-side fields the V2 projection deliberately omits:
          balance_transaction: "txn_xxx",
          billing_details: { name: "Alice" },
          payment_method: "pm_xxx",
          fraud_details: {},
        },
      ]),
    );
    const result = await getPayments({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {},
      triggerEvent: trigger(),
    });
    const payment = (result.output!.payments as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(payment.balance_transaction).toBeUndefined();
    expect(payment.billing_details).toBeUndefined();
    expect(payment.payment_method).toBeUndefined();
    expect(payment.fraud_details).toBeUndefined();
  });

  it("propagates wrapper errors to the caller", async () => {
    mockList.mockRejectedValueOnce(
      new Error("Stripe GET /v1/charges failed: rate_limit"),
    );
    await expect(
      getPayments({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/rate_limit/);
  });

  it("Zod parse rejects invalid config before any wrapper call", async () => {
    await expect(
      getPayments({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        // limit=200 — over Stripe's max; strict parse rejects.
        config: { limit: 200 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("Zod parse rejects startingAfter + endingBefore combo before any wrapper call", async () => {
    await expect(
      getPayments({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { startingAfter: "ch_a", endingBefore: "ch_z" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling getPayments.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// Schema tests for `get_payments`. Pins the strict shape + pagination
// cursor mutex + limit-range + unknown-field rejection. V1's
// client-side status filter + raw query passthrough + auto-pagination
// are all rejected at the schema layer (parity-stripe §8 — no V1
// status-filter or fetchAll port).
// ---------------------------------------------------------------------------

describe("GetPaymentsConfigSchema", () => {
  describe("happy paths", () => {
    it("accepts empty config (no filters; Stripe defaults to limit=10)", () => {
      const result = GetPaymentsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts customer filter", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        customer: "cus_test_1",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid limit (1..100)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 1 }).success,
      ).toBe(true);
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 50 }).success,
      ).toBe(true);
      expect(
        GetPaymentsConfigSchema.safeParse({ limit: 100 }).success,
      ).toBe(true);
    });

    it("accepts startingAfter cursor", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        startingAfter: "ch_test_xxx",
      });
      expect(result.success).toBe(true);
    });

    it("accepts endingBefore cursor", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        endingBefore: "ch_test_yyy",
      });
      expect(result.success).toBe(true);
    });

    it("accepts customer + limit + startingAfter combo", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        customer: "cus_test_1",
        limit: 25,
        startingAfter: "ch_last",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("limit validation", () => {
    it("rejects limit = 0", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects negative limit", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: -5 });
      expect(result.success).toBe(false);
    });

    it("rejects limit > 100 (Stripe maximum)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer limit (e.g. 10.5)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(false);
    });

    it("rejects string-form limit (no silent coercion — V1 quirk NOT ported)", () => {
      const result = GetPaymentsConfigSchema.safeParse({ limit: "10" });
      expect(result.success).toBe(false);
    });
  });

  describe("optional field validation", () => {
    it("rejects empty-string customer", () => {
      const result = GetPaymentsConfigSchema.safeParse({ customer: "" });
      expect(result.success).toBe(false);
    });

    it("rejects empty-string startingAfter", () => {
      const result = GetPaymentsConfigSchema.safeParse({ startingAfter: "" });
      expect(result.success).toBe(false);
    });

    it("rejects empty-string endingBefore", () => {
      const result = GetPaymentsConfigSchema.safeParse({ endingBefore: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("pagination cursor mutex", () => {
    it("rejects startingAfter + endingBefore together (ambiguous cursor direction)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        startingAfter: "ch_a",
        endingBefore: "ch_z",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.path.includes("endingBefore")),
        ).toBe(true);
      }
    });
  });

  describe("strict mode — unknown fields rejected", () => {
    it("rejects V1's client-side status filter (V2 doesn't port it)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        status: "succeeded",
      });
      expect(result.success).toBe(false);
    });

    it("rejects V1's snake_case starting_after (wire field disguised as schema field)", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        starting_after: "ch_xxx",
      });
      expect(result.success).toBe(false);
    });

    it("rejects fetchAll / autoPaginate fields (no auto-pagination in V2)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ fetchAll: true }).success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ autoPaginate: true }).success,
      ).toBe(false);
    });

    it("rejects raw expand passthrough", () => {
      const result = GetPaymentsConfigSchema.safeParse({
        expand: ["customer", "payment_intent"],
      });
      expect(result.success).toBe(false);
    });

    it("rejects deferred createdGte / createdLte (V1 doesn't have them)", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ createdGte: 1234567890 })
          .success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ createdLte: 1234567890 })
          .success,
      ).toBe(false);
    });

    it("rejects deferred paymentIntent / transferGroup filters", () => {
      expect(
        GetPaymentsConfigSchema.safeParse({ paymentIntent: "pi_xxx" })
          .success,
      ).toBe(false);
      expect(
        GetPaymentsConfigSchema.safeParse({ transferGroup: "tg_xxx" })
          .success,
      ).toBe(false);
    });
  });
});
