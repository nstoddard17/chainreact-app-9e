/**
 * @jest-environment node
 *
 * Two-stage flow tests — pre-fetch GET + update POST.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsCreate: jest.fn(),
  subscriptionsGet: (...args: unknown[]) => mockGet(...args),
  subscriptionsUpdate: (...args: unknown[]) => mockUpdate(...args),
  subscriptionsCancel: jest.fn(),
}));

import { updateSubscription } from "@/integrations/stripe/actions/updateSubscription";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
  mockUpdate.mockReset();
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

function subscriptionResponse(items = [{ id: "si_existing", price: { id: "price_old", product: "p" }, quantity: 1 }]) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    items: { object: "list", data: items.map((i) => ({ object: "subscription_item", ...i })) },
    metadata: {},
    created: 1700000000,
  };
}

describe("update_subscription action", () => {
  it("pre-fetches subscription to extract subscription_item id when priceId or quantity is supplied", async () => {
    mockGet.mockResolvedValueOnce(subscriptionResponse());
    mockUpdate.mockResolvedValueOnce(subscriptionResponse([
      { id: "si_existing", price: { id: "price_new", product: "p" }, quantity: 5 },
    ]));

    await updateSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        subscriptionId: "sub_1",
        priceId: "price_new",
        quantity: 5,
      },
      triggerEvent: trigger(),
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]![0]!.subscriptionId).toBe("sub_1");

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mockUpdate.mock.calls[0]![0]!;
    expect(updateArg.items).toEqual([
      { id: "si_existing", price: "price_new", quantity: 5 },
    ]);
  });

  it("skips pre-fetch when neither priceId nor quantity is supplied (metadata-only update)", async () => {
    mockUpdate.mockResolvedValueOnce(subscriptionResponse());
    await updateSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        subscriptionId: "sub_1",
        metadata: { tier: "gold" },
      },
      triggerEvent: trigger(),
    });
    expect(mockGet).not.toHaveBeenCalled();
    const updateArg = mockUpdate.mock.calls[0]![0]!;
    expect(updateArg.items).toBeUndefined();
    expect(updateArg.metadata).toEqual({ tier: "gold" });
  });

  it("threads optional fields (trial_end, cancel_at_period_end, proration_behavior, etc.)", async () => {
    mockUpdate.mockResolvedValueOnce(subscriptionResponse());
    await updateSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        subscriptionId: "sub_1",
        trial_end: "now",
        cancel_at_period_end: true,
        proration_behavior: "create_prorations",
        days_until_due: 30,
        collection_method: "send_invoice",
      },
      triggerEvent: trigger(),
    });
    const updateArg = mockUpdate.mock.calls[0]![0]!;
    expect(updateArg.trial_end).toBe("now");
    expect(updateArg.cancel_at_period_end).toBe(true);
    expect(updateArg.proration_behavior).toBe("create_prorations");
    expect(updateArg.days_until_due).toBe(30);
    expect(updateArg.collection_method).toBe("send_invoice");
  });

  it("does NOT send Idempotency-Key (update is server-side idempotent)", async () => {
    mockUpdate.mockResolvedValueOnce(subscriptionResponse());
    await updateSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "session-1",
      nodeId: "n",
      config: { subscriptionId: "sub_1", metadata: {} },
      triggerEvent: trigger(),
    });
    const updateArg = mockUpdate.mock.calls[0]![0]!;
    expect(updateArg.idempotencyKey).toBeUndefined();
  });

  it("returns Unix timestamps verbatim (V1 update-vs-create asymmetry preserved)", async () => {
    mockUpdate.mockResolvedValueOnce(subscriptionResponse());
    const result = await updateSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1", metadata: {} },
      triggerEvent: trigger(),
    });
    expect(result.output.currentPeriodStart).toBe(1700000000);
    expect(result.output.currentPeriodEnd).toBe(1702592000);
  });

  it("rejects trial_end values that aren't a number or 'now'", async () => {
    await expect(
      updateSubscription({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          subscriptionId: "sub_1",
          trial_end: "tomorrow" as unknown as "now",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
