/**
 * @jest-environment node
 *
 * Refund — billing-impacting; idempotency-keyed AND XOR-validated.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreateRefund = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/refunds", () => ({
  refundsCreate: (...args: unknown[]) => mockCreateRefund(...args),
}));

import { createRefund } from "@/integrations/stripe/actions/createRefund";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateRefund.mockReset();
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
    accountId: "acct_TEST",
    payload: {},
  };
}

function refundResponse() {
  return {
    id: "re_test_1",
    amount: 2099,
    currency: "usd",
    status: "succeeded",
    charge: null,
    payment_intent: "pi_1",
    reason: "requested_by_customer",
    receipt_number: "1234-5678",
    created: 1234567890,
    metadata: {},
  };
}

describe("create_refund action", () => {
  it("refunds by paymentIntentId (preferred path)", async () => {
    mockCreateRefund.mockResolvedValueOnce(refundResponse());
    await createRefund({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        paymentIntentId: "pi_1",
        amount: 20.99,
        reason: "requested_by_customer",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreateRefund.mock.calls[0]![0]!;
    expect(callArg.payment_intent).toBe("pi_1");
    expect(callArg.charge).toBeUndefined();
    expect(callArg.amount).toBe(2099);
    expect(callArg.reason).toBe("requested_by_customer");
  });

  it("refunds by chargeId (legacy path)", async () => {
    mockCreateRefund.mockResolvedValueOnce(refundResponse());
    await createRefund({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        chargeId: "ch_1",
        amount: 5,
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreateRefund.mock.calls[0]![0]!;
    expect(callArg.charge).toBe("ch_1");
    expect(callArg.payment_intent).toBeUndefined();
    expect(callArg.amount).toBe(500);
  });

  it("supports full-refund (omitting amount) — Stripe defaults to full charge amount", async () => {
    mockCreateRefund.mockResolvedValueOnce(refundResponse());
    await createRefund({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    expect(mockCreateRefund.mock.calls[0]![0]!.amount).toBeUndefined();
  });

  it("threads Idempotency-Key (Q4 — double-refund guard)", async () => {
    mockCreateRefund.mockResolvedValueOnce(refundResponse());
    await createRefund({
      workflowId: "wf",
      userId: "u",
      runId: "session-12",
      nodeId: "node-RF",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    expect(mockCreateRefund.mock.calls[0]![0]!.idempotencyKey).toBe(
      "session-12:node-RF:stripe_action_create_refund",
    );
  });

  it("rejects when both chargeId and paymentIntentId supplied (XOR)", async () => {
    await expect(
      createRefund({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { chargeId: "ch_1", paymentIntentId: "pi_1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it("rejects when neither chargeId nor paymentIntentId supplied", async () => {
    await expect(
      createRefund({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects free-text reason (must be Stripe enum)", async () => {
    await expect(
      createRefund({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          paymentIntentId: "pi_1",
          reason: "customer_changed_mind" as unknown as "duplicate",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
