/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCapture = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/paymentIntents", () => ({
  paymentIntentsCreate: jest.fn(),
  paymentIntentsConfirm: jest.fn(),
  paymentIntentsCapture: (...args: unknown[]) => mockCapture(...args),
}));

import { capturePaymentIntent } from "@/integrations/stripe/actions/capturePaymentIntent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCapture.mockReset();
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

describe("capture_payment_intent action", () => {
  it("posts paymentIntentsCapture with paymentIntentId only (full capture)", async () => {
    mockCapture.mockResolvedValueOnce({
      id: "pi_1",
      status: "succeeded",
      amount: 2099,
      amount_received: 2099,
      currency: "usd",
    });
    const result = await capturePaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const callArg = mockCapture.mock.calls[0]![0]!;
    expect(callArg.paymentIntentId).toBe("pi_1");
    expect(callArg.amount_to_capture).toBeUndefined();
    expect(result.output).toEqual({
      paymentIntentId: "pi_1",
      status: "succeeded",
      amount: 2099,
      amountCaptured: 2099,
      currency: "usd",
    });
  });

  it("forwards amount_to_capture in CENTS verbatim (V1 quirk preserved)", async () => {
    mockCapture.mockResolvedValueOnce({
      id: "pi_1",
      status: "succeeded",
      amount: 2099,
      amount_received: 1000,
      currency: "usd",
    });
    await capturePaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1", amount_to_capture: 1000 },
      triggerEvent: trigger(),
    });
    expect(mockCapture.mock.calls[0]![0]!.amount_to_capture).toBe(1000);
  });

  it("rejects non-integer amount_to_capture (Stripe rejects fractional cents)", async () => {
    await expect(
      capturePaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { paymentIntentId: "pi_1", amount_to_capture: 9.99 },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("does NOT send Idempotency-Key (capture is server-side idempotent)", async () => {
    mockCapture.mockResolvedValueOnce({
      id: "pi_1",
      status: "succeeded",
      amount: 100,
      amount_received: 100,
      currency: "usd",
    });
    await capturePaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-9",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    const callArg = mockCapture.mock.calls[0]![0]!;
    expect(callArg.idempotencyKey).toBeUndefined();
  });
});
