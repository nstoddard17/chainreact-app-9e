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

jest.mock("@/integrations/stripe/api/subscriptions", () => ({
  subscriptionsCreate: jest.fn(),
  subscriptionsUpdate: jest.fn(),
  subscriptionsCancel: jest.fn(),
  subscriptionsGet: (...args: unknown[]) => mockGet(...args),
}));

import { findSubscription } from "@/integrations/stripe/actions/findSubscription";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import { FindSubscriptionConfigSchema } from "@/integrations/stripe/actions/findSubscription.schema";

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

function subscriptionResponse(overrides?: Record<string, unknown>) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    current_period_start: 1234567000,
    current_period_end: 1237159000,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    collection_method: "charge_automatically",
    currency: "usd",
    latest_invoice: "in_test_1",
    livemode: false,
    items: { object: "list", data: [] },
    metadata: { tier: "pro" },
    created: 1234567000,
    ...overrides,
  };
}

describe("find_subscription action", () => {
  it("returns found:true with bounded subscription projection on hit", async () => {
    mockGet.mockResolvedValueOnce(subscriptionResponse());
    const result = await findSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]![0]!.subscriptionId).toBe("sub_1");
    expect(result.output.found).toBe(true);
    const subscription = result.output.subscription as Record<string, unknown>;
    expect(subscription).toEqual({
      subscriptionId: "sub_1",
      customerId: "cus_1",
      status: "active",
      currentPeriodStart: 1234567000,
      currentPeriodEnd: 1237159000,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStart: null,
      trialEnd: null,
      collectionMethod: "charge_automatically",
      currency: "usd",
      latestInvoiceId: "in_test_1",
      metadata: { tier: "pro" },
      livemode: false,
    });
  });

  it("returns found:false on NotFoundError (no throw)", async () => {
    mockGet.mockRejectedValueOnce(
      new NotFoundError("subscription sub_missing"),
    );
    const result = await findSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_missing" },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(false);
    expect(result.output.subscription).toBeNull();
  });

  it("preserves null values from Stripe nullable fields", async () => {
    mockGet.mockResolvedValueOnce(
      subscriptionResponse({
        canceled_at: null,
        trial_start: null,
        trial_end: null,
        latest_invoice: null,
      }),
    );
    const result = await findSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    const subscription = result.output.subscription as Record<string, unknown>;
    expect(subscription.canceledAt).toBeNull();
    expect(subscription.trialStart).toBeNull();
    expect(subscription.trialEnd).toBeNull();
    expect(subscription.latestInvoiceId).toBeNull();
  });

  it("does NOT leak raw Stripe response keys (no items / no created / no ended_at)", async () => {
    mockGet.mockResolvedValueOnce(subscriptionResponse());
    const result = await findSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    const subscription = result.output.subscription as Record<string, unknown>;
    expect(subscription).not.toHaveProperty("items");
    expect(subscription).not.toHaveProperty("data");
    expect(subscription).not.toHaveProperty("created");
    expect(subscription).not.toHaveProperty("ended_at");
    expect(subscription).not.toHaveProperty("object");
    // V2 keys are camelCase; Stripe wire keys (snake_case) should not leak.
    expect(subscription).not.toHaveProperty("current_period_start");
    expect(subscription).not.toHaveProperty("cancel_at_period_end");
  });

  it("routes accountId from triggerEvent to refreshAndRetry", async () => {
    mockGet.mockResolvedValueOnce(subscriptionResponse());
    await findSubscription({
      workflowId: "wf",
      userId: "u-123",
      accountId: "acct-u-123",
      runId: "r",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBe("acct-u-123");
    expect(refreshArg.provider).toBe("stripe");
    expect(refreshArg.providerAccountId).toBe("acct_TEST");
  });

  it("does NOT send Idempotency-Key (read-only GET)", async () => {
    mockGet.mockResolvedValueOnce(subscriptionResponse());
    await findSubscription({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-1",
      nodeId: "n",
      config: { subscriptionId: "sub_1" },
      triggerEvent: trigger(),
    });
    // subscriptionsGet's typed input has no idempotencyKey field — the
    // typed boundary is the contract. Confirm we didn't pass one through.
    const callArg = mockGet.mock.calls[0]![0]!;
    expect(callArg).not.toHaveProperty("idempotencyKey");
  });

  it("re-throws non-NotFoundError errors from subscriptionsGet", async () => {
    mockGet.mockRejectedValueOnce(
      new Error("Stripe GET /v1/subscriptions/sub_1 failed: rate_limited"),
    );
    await expect(
      findSubscription({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { subscriptionId: "sub_1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/rate_limited/);
  });

  it("rejects via Zod before calling the wrapper when subscriptionId is missing", async () => {
    await expect(
      findSubscription({
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
      findSubscription({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { subscriptionId: "sub_1", expand: ["items"] },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling findSubscription.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

describe("FindSubscriptionConfigSchema", () => {
  it("accepts a valid subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "sub_test_1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when subscriptionId is missing", () => {
    const result = FindSubscriptionConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string subscriptionId", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: 123,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (.strict() — no raw expand passthrough)", () => {
    const result = FindSubscriptionConfigSchema.safeParse({
      subscriptionId: "sub_1",
      expand: ["items"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects V1 search/list-style fields (customer / status / limit)", () => {
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        customer: "cus_1",
      }).success,
    ).toBe(false);
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        status: "active",
      }).success,
    ).toBe(false);
    expect(
      FindSubscriptionConfigSchema.safeParse({
        subscriptionId: "sub_1",
        limit: 10,
      }).success,
    ).toBe(false);
  });
});
