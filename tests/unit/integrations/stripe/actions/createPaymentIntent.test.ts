/**
 * @jest-environment node
 *
 * Load-bearing for cents conversion + Idempotency-Key.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/paymentIntents", () => ({
  paymentIntentsCreate: (...args: unknown[]) => mockCreate(...args),
  paymentIntentsConfirm: jest.fn(),
  paymentIntentsCapture: jest.fn(),
}));

import { createPaymentIntent } from "@/integrations/stripe/actions/createPaymentIntent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "stripe",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "acct_TEST",
    payload: {},
  };
}

function piResponse() {
  return {
    id: "pi_test_1",
    amount: 2099,
    currency: "usd",
    status: "requires_payment_method",
    customer: "cus_1",
    description: null,
    client_secret: "pi_test_1_secret_xxx",
    created: 1234567890,
    metadata: {},
    next_action: null,
    payment_method: null,
    payment_method_types: ["card"],
    receipt_email: null,
    livemode: false,
  };
}

describe("create_payment_intent action", () => {
  it("converts dollars to cents via dollarsToCents", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { amount: 20.99, currency: "usd" },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.amount).toBe(2099);
  });

  it("accepts string-form amount (workflow variable resolution)", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { amount: "100.00", currency: "usd" },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.amount).toBe(10000);
  });

  it("threads Idempotency-Key (Q4 — billing-impacting double-charge guard)", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-7",
      nodeId: "node-PI",
      config: { amount: 100, currency: "usd" },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.idempotencyKey).toBe(
      "session-7:node-PI:stripe_action_create_payment_intent",
    );
  });

  it("rejects negative amount at handler boundary (dollarsToCents throws)", async () => {
    await expect(
      createPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { amount: -1, currency: "usd" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects uppercase currency (Stripe wire-format requires lowercase)", async () => {
    await expect(
      createPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { amount: 100, currency: "USD" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("threads optional customerId / description / metadata", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        amount: 10,
        currency: "usd",
        customerId: "cus_1",
        description: "Order #123",
        metadata: { orderId: "123" },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.customer).toBe("cus_1");
    expect(callArg.description).toBe("Order #123");
    expect(callArg.metadata).toEqual({ orderId: "123" });
  });

  it("returns canonical output mapping (snake_case → camelCase)", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    const result = await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { amount: 20.99, currency: "usd" },
      triggerEvent: trigger(),
    });
    expect(result.output).toEqual({
      paymentIntentId: "pi_test_1",
      amount: 2099,
      currency: "usd",
      status: "requires_payment_method",
      customerId: "cus_1",
      description: null,
      created: 1234567890,
      metadata: {},
      nextAction: null,
    });
  });

  // Slice 3.SEC-8 — regression guard. Even when the Stripe response
  // includes `client_secret` (which it always does), the handler MUST
  // NOT surface it on either snake_case or camelCase key. See the
  // matching JSDoc on `createPaymentIntent.ts` for the rationale.
  it("OMITS clientSecret from the workflow output (Slice 3.SEC-8)", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    const result = await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { amount: 20.99, currency: "usd" },
      triggerEvent: trigger(),
    });
    expect(result.output).not.toHaveProperty("clientSecret");
    expect(result.output).not.toHaveProperty("client_secret");
  });

  // Slice 3.SEC-14 — Stripe livemode policy wiring regression.
  // Asserts the handler threads a preflight callback into
  // refreshAndRetry. The pure-policy decision matrix is covered in
  // tests/unit/integrations/stripe/security/livemodePolicy.test.ts;
  // this test catches the regression where a future refactor drops
  // the preflight wiring at the handler boundary.
  it("threads a stripeLivemodePreflight into refreshAndRetry (Slice 3.SEC-14)", async () => {
    mockCreate.mockResolvedValueOnce(piResponse());
    await createPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { amount: 20.99, currency: "usd" },
      triggerEvent: trigger(),
    });
    const callArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(typeof callArg.preflight).toBe("function");
  });
});
