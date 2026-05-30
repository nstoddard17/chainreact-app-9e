/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsCreate: (...args: unknown[]) => mockCreate(...args),
  subscriptionsGet: jest.fn(),
  subscriptionsUpdate: jest.fn(),
  subscriptionsCancel: jest.fn(),
}));

import { createSubscription } from "@/integrations/stripe/actions/createSubscription";

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

function subscriptionResponse() {
  return {
    id: "sub_test_1",
    customer: "cus_1",
    status: "active",
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          price: { id: "price_pro", product: "prod_1" },
          quantity: 1,
        },
      ],
    },
    metadata: {},
    created: 1700000000,
  };
}

describe("create_subscription action", () => {
  it("posts subscriptionsCreate with customer + priceId in items[0]", async () => {
    mockCreate.mockResolvedValueOnce(subscriptionResponse());
    await createSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_1", priceId: "price_pro" },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.customer).toBe("cus_1");
    expect(callArg.priceId).toBe("price_pro");
  });

  it("threads Idempotency-Key (Q4)", async () => {
    mockCreate.mockResolvedValueOnce(subscriptionResponse());
    await createSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-3",
      nodeId: "node-S",
      config: { customerId: "cus_1", priceId: "price_pro" },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.idempotencyKey).toBe(
      "session-3:node-S:stripe_action_create_subscription",
    );
  });

  it("threads optional default_payment_method / payment_behavior / trialPeriodDays / metadata", async () => {
    mockCreate.mockResolvedValueOnce(subscriptionResponse());
    await createSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        customerId: "cus_1",
        priceId: "price_pro",
        default_payment_method: "pm_1",
        payment_behavior: "default_incomplete",
        trialPeriodDays: 14,
        metadata: { plan: "pro" },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.default_payment_method).toBe("pm_1");
    expect(callArg.payment_behavior).toBe("default_incomplete");
    expect(callArg.trial_period_days).toBe(14);
    expect(callArg.metadata).toEqual({ plan: "pro" });
  });

  it("converts current_period_start / current_period_end to ISO-8601 strings", async () => {
    mockCreate.mockResolvedValueOnce(subscriptionResponse());
    const result = await createSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_1", priceId: "price_pro" },
      triggerEvent: trigger(),
    });
    expect(result.output.currentPeriodStart).toBe(
      new Date(1700000000 * 1000).toISOString(),
    );
    expect(result.output.currentPeriodEnd).toBe(
      new Date(1702592000 * 1000).toISOString(),
    );
    expect(result.output.trialStart).toBeNull();
    expect(result.output.trialEnd).toBeNull();
  });

  it("extracts priceId + quantity from items[0] in output", async () => {
    mockCreate.mockResolvedValueOnce(subscriptionResponse());
    const result = await createSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_1", priceId: "price_pro" },
      triggerEvent: trigger(),
    });
    expect(result.output.priceId).toBe("price_pro");
    expect(result.output.quantity).toBe(1);
  });

  it("rejects invalid payment_behavior (must be enum)", async () => {
    await expect(
      createSubscription({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          customerId: "cus_1",
          priceId: "price_pro",
          payment_behavior: "not_a_real_value" as unknown as "allow_incomplete",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("requires customerId AND priceId (Q11)", async () => {
    await expect(
      createSubscription({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { customerId: "cus_1" } as unknown as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
