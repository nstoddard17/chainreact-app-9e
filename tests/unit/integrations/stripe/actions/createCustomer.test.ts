/**
 * @jest-environment node
 *
 * Tests for `create_customer` — load-bearing for the Q4
 * `Idempotency-Key` header pattern (V2's first live consumer).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/customers", () => ({
  customersCreate: (...args: unknown[]) => mockCreate(...args),
  customersUpdate: jest.fn(),
  customersGet: jest.fn(),
  customersList: jest.fn(),
}));

import { createCustomer } from "@/integrations/stripe/actions/createCustomer";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "stripe", accountId = "acct_TEST"): TriggerEvent {
  return {
    provider,
    eventType: provider === "stripe" ? "manual" : "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId,
    payload: {},
  };
}

function customerResponse() {
  return {
    id: "cus_TEST_1",
    object: "customer",
    email: "alice@example.com",
    name: "Alice",
    description: null,
    phone: null,
    created: 1234567890,
    currency: "usd",
    balance: 0,
    delinquent: false,
    address: null,
    shipping: null,
    tax_exempt: "none",
    metadata: { source: "chainreact" },
    livemode: false,
  };
}

describe("create_customer action", () => {
  it("posts customersCreate, returns canonical output", async () => {
    mockCreate.mockResolvedValueOnce(customerResponse());

    const result = await createCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "session-1",
      nodeId: "node-A",
      config: {
        email: "alice@example.com",
        name: "Alice",
        metadata: { source: "chainreact" },
      },
      triggerEvent: trigger(),
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.email).toBe("alice@example.com");
    expect(callArg.name).toBe("Alice");
    expect(callArg.metadata).toEqual({ source: "chainreact" });
    expect(result.output).toEqual({
      customerId: "cus_TEST_1",
      email: "alice@example.com",
      name: "Alice",
      description: null,
      created: 1234567890,
      livemode: false,
      metadata: { source: "chainreact" },
    });
  });

  it("threads Idempotency-Key from runId:nodeId:actionType (Q4 contract)", async () => {
    mockCreate.mockResolvedValueOnce(customerResponse());
    await createCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "session-42",
      nodeId: "node-X",
      config: { email: "alice@example.com" },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.idempotencyKey).toBe(
      "session-42:node-X:stripe_action_create_customer",
    );
  });

  it("threads accountId from a Stripe trigger event", async () => {
    mockCreate.mockResolvedValueOnce(customerResponse());
    await createCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { email: "x@y.com" },
      triggerEvent: trigger("stripe", "acct_FROM_TRIGGER"),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.userId).toBe("u");
    expect(refreshArg.provider).toBe("stripe");
    expect(refreshArg.accountId).toBe("acct_FROM_TRIGGER");
  });

  it("passes accountId=null when triggered by a non-stripe provider", async () => {
    mockCreate.mockResolvedValueOnce(customerResponse());
    await createCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { email: "x@y.com" },
      triggerEvent: trigger("airtable", "usrXXX"),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBeNull();
  });

  it("rejects non-email values in email field (Q11)", async () => {
    await expect(
      createCustomer({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { email: "not-an-email" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown keys (strict schema)", async () => {
    await expect(
      createCustomer({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          email: "alice@example.com",
          unknown_field: "value",
        } as unknown as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
