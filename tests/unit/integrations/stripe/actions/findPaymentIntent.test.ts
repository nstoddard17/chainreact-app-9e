/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    IntegrationActionRequiredError: class extends Error {},
  };
});

jest.mock("@/integrations/stripe/api/paymentIntents", () => ({
  paymentIntentsCreate: jest.fn(),
  paymentIntentsConfirm: jest.fn(),
  paymentIntentsCapture: jest.fn(),
  paymentIntentsGet: (...args: unknown[]) => mockGet(...args),
}));

import { findPaymentIntent } from "@/integrations/stripe/actions/findPaymentIntent";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "stripe",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    providerAccountId: "acct_TEST",
    payload: {},
  };
}

function paymentIntentResponse(overrides?: Record<string, unknown>) {
  return {
    id: "pi_1",
    object: "payment_intent",
    amount: 2099,
    amount_received: 0,
    currency: "usd",
    status: "requires_payment_method",
    customer: "cus_1",
    description: "test charge",
    client_secret: "pi_1_secret_xxx",
    created: 1234567000,
    metadata: { order: "ord_1" },
    next_action: null,
    latest_charge: null,
    payment_method: null,
    payment_method_types: ["card"],
    receipt_email: "alice@example.com",
    livemode: false,
    ...overrides,
  };
}

describe("find_payment_intent action", () => {
  it("returns found:true with bounded paymentIntent projection on hit", async () => {
    mockGet.mockResolvedValueOnce(
      paymentIntentResponse({
        status: "succeeded",
        amount_received: 2099,
        latest_charge: "ch_1",
        payment_method: "pm_1",
      }),
    );
    const result = await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]![0]!.paymentIntentId).toBe("pi_1");
    expect(result.output.found).toBe(true);
    const paymentIntent = result.output.paymentIntent as Record<string, unknown>;
    expect(paymentIntent).toEqual({
      paymentIntentId: "pi_1",
      amount: 2099,
      amountReceived: 2099,
      currency: "usd",
      status: "succeeded",
      customerId: "cus_1",
      latestChargeId: "ch_1",
      paymentMethodId: "pm_1",
      description: "test charge",
      receiptEmail: "alice@example.com",
      metadata: { order: "ord_1" },
      livemode: false,
    });
  });

  it("returns found:false on NotFoundError (no throw)", async () => {
    mockGet.mockRejectedValueOnce(
      new NotFoundError("payment_intent pi_missing"),
    );
    const result = await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_missing" },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(false);
    expect(result.output.paymentIntent).toBeNull();
  });

  it("preserves null values from Stripe nullable fields", async () => {
    mockGet.mockResolvedValueOnce(
      paymentIntentResponse({
        customer: null,
        latest_charge: null,
        payment_method: null,
        description: null,
        receipt_email: null,
      }),
    );
    const result = await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const paymentIntent = result.output.paymentIntent as Record<string, unknown>;
    expect(paymentIntent.customerId).toBeNull();
    expect(paymentIntent.latestChargeId).toBeNull();
    expect(paymentIntent.paymentMethodId).toBeNull();
    expect(paymentIntent.description).toBeNull();
    expect(paymentIntent.receiptEmail).toBeNull();
  });

  it("falls back amountReceived to null when Stripe omits the field", async () => {
    const wireShape = paymentIntentResponse();
    delete (wireShape as Record<string, unknown>).amount_received;
    mockGet.mockResolvedValueOnce(wireShape);
    const result = await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const paymentIntent = result.output.paymentIntent as Record<string, unknown>;
    expect(paymentIntent.amountReceived).toBeNull();
  });

  it("does NOT leak raw Stripe response keys (no client_secret / next_action / created / object)", async () => {
    mockGet.mockResolvedValueOnce(paymentIntentResponse());
    const result = await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const paymentIntent = result.output.paymentIntent as Record<string, unknown>;
    expect(paymentIntent).not.toHaveProperty("client_secret");
    expect(paymentIntent).not.toHaveProperty("clientSecret");
    expect(paymentIntent).not.toHaveProperty("next_action");
    expect(paymentIntent).not.toHaveProperty("nextAction");
    expect(paymentIntent).not.toHaveProperty("created");
    expect(paymentIntent).not.toHaveProperty("object");
    expect(paymentIntent).not.toHaveProperty("payment_method_types");
    // Snake-case wire keys should not leak.
    expect(paymentIntent).not.toHaveProperty("amount_received");
    expect(paymentIntent).not.toHaveProperty("payment_method");
    expect(paymentIntent).not.toHaveProperty("receipt_email");
  });

  it("routes accountId from triggerEvent to refreshAndRetry", async () => {
    mockGet.mockResolvedValueOnce(paymentIntentResponse());
    await findPaymentIntent({
      workflowId: "wf",
      userId: "u-123",
      accountId: "acct-u-123",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBe("acct-u-123");
    expect(refreshArg.provider).toBe("stripe");
    expect(refreshArg.providerAccountId).toBe("acct_TEST");
  });

  it("does NOT send Idempotency-Key (read-only GET)", async () => {
    mockGet.mockResolvedValueOnce(paymentIntentResponse());
    await findPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-1",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const callArg = mockGet.mock.calls[0]![0]!;
    expect(callArg).not.toHaveProperty("idempotencyKey");
  });

  it("re-throws non-NotFoundError errors from paymentIntentsGet", async () => {
    mockGet.mockRejectedValueOnce(
      new Error("Stripe GET /v1/payment_intents/pi_1 failed: rate_limited"),
    );
    await expect(
      findPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { paymentIntentId: "pi_1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/rate_limited/);
  });

  it("rejects via Zod before calling the wrapper when paymentIntentId is missing", async () => {
    await expect(
      findPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("rejects via Zod before calling the wrapper when unknown fields are present", async () => {
    await expect(
      findPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { paymentIntentId: "pi_1", expand: ["charges"] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
