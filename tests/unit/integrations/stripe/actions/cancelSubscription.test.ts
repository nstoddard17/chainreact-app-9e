/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCancel = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsCreate: jest.fn(),
  subscriptionsGet: jest.fn(),
  subscriptionsUpdate: jest.fn(),
  subscriptionsCancel: (...args: unknown[]) => mockCancel(...args),
}));

import { cancelSubscription } from "@/integrations/stripe/actions/cancelSubscription";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCancel.mockReset();
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

function canceledResponse() {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "canceled",
    current_period_start: 1700000000,
    current_period_end: 1702592000,
    cancel_at_period_end: false,
    canceled_at: 1700100000,
    ended_at: 1700100000,
    trial_start: null,
    trial_end: null,
    items: { object: "list", data: [] },
    metadata: {},
    created: 1700000000,
  };
}

describe("cancel_subscription action", () => {
  it("cancels with no flags (immediate cancellation)", async () => {
    mockCancel.mockResolvedValueOnce(canceledResponse());
    const result = await cancelSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    const callArg = mockCancel.mock.calls[0]![0]!;
    expect(callArg.subscriptionId).toBe("sub_1");
    expect(callArg.cancel_at_period_end).toBeUndefined();
    expect(result.output.status).toBe("canceled");
    expect(result.output.canceledAt).toBe(1700100000);
    expect(result.output.endedAt).toBe(1700100000);
  });

  it("threads at_period_end → cancel_at_period_end (V1 field-name mapping)", async () => {
    mockCancel.mockResolvedValueOnce(canceledResponse());
    await cancelSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1", at_period_end: true },
      triggerEvent: trigger(),
    });
    const callArg = mockCancel.mock.calls[0]![0]!;
    expect(callArg.cancel_at_period_end).toBe(true);
  });

  it("threads invoice_now and prorate flags", async () => {
    mockCancel.mockResolvedValueOnce(canceledResponse());
    await cancelSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        subscriptionId: "sub_1",
        invoice_now: true,
        prorate: true,
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCancel.mock.calls[0]![0]!;
    expect(callArg.invoice_now).toBe(true);
    expect(callArg.prorate).toBe(true);
  });

  it("requires subscriptionId (Q11)", async () => {
    await expect(
      cancelSubscription({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {},
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("does NOT send Idempotency-Key (DELETE on resource id is server-side idempotent)", async () => {
    mockCancel.mockResolvedValueOnce(canceledResponse());
    await cancelSubscription({
      workflowId: "wf",
      userId: "u",
      runId: "session-1",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    const callArg = mockCancel.mock.calls[0]![0]!;
    expect(callArg.idempotencyKey).toBeUndefined();
  });
});
