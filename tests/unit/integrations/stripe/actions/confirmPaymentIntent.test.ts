/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockConfirm = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/paymentIntents", () => ({
  paymentIntentsCreate: jest.fn(),
  paymentIntentsConfirm: (...args: unknown[]) => mockConfirm(...args),
  paymentIntentsCapture: jest.fn(),
}));

import { confirmPaymentIntent } from "@/integrations/stripe/actions/confirmPaymentIntent";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockConfirm.mockReset();
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

describe("confirm_payment_intent action", () => {
  it("posts paymentIntentsConfirm with paymentIntentId + optional fields", async () => {
    mockConfirm.mockResolvedValueOnce({
      id: "pi_1",
      status: "succeeded",
      amount: 2099,
      currency: "usd",
      client_secret: "secret",
      next_action: null,
    });
    const result = await confirmPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        paymentIntentId: "pi_1",
        receipt_email: "alice@example.com",
        return_url: "https://app.example.test/return",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockConfirm.mock.calls[0]![0]!;
    expect(callArg.paymentIntentId).toBe("pi_1");
    expect(callArg.receipt_email).toBe("alice@example.com");
    expect(callArg.return_url).toBe("https://app.example.test/return");
    expect(result.output.paymentIntentId).toBe("pi_1");
    expect(result.output.status).toBe("succeeded");
  });

  it("requires paymentIntentId (Q11)", async () => {
    await expect(
      confirmPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid email in receipt_email", async () => {
    await expect(
      confirmPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          paymentIntentId: "pi_1",
          receipt_email: "not-an-email",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid return_url (must be absolute URL)", async () => {
    await expect(
      confirmPaymentIntent({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          paymentIntentId: "pi_1",
          return_url: "not-a-url",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  // Slice 3.SEC-8 — regression guard. Stripe's confirm response always
  // contains `client_secret`; the handler MUST drop it before returning.
  it("OMITS clientSecret from the workflow output (Slice 3.SEC-8)", async () => {
    mockConfirm.mockResolvedValueOnce({
      id: "pi_1",
      status: "succeeded",
      amount: 2099,
      currency: "usd",
      client_secret: "pi_1_secret_xxx",
      next_action: null,
    });
    const result = await confirmPaymentIntent({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { paymentIntentId: "pi_1" },
      triggerEvent: trigger(),
    });
    expect(result.output).not.toHaveProperty("clientSecret");
    expect(result.output).not.toHaveProperty("client_secret");
    // Bounded projection: only the 5 canonical fields remain.
    expect(Object.keys(result.output).sort()).toEqual([
      "amount",
      "currency",
      "nextAction",
      "paymentIntentId",
      "status",
    ]);
  });
});
