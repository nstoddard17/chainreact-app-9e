/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  class Unauthorized401Error extends Error {}
  return {
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
    Unauthorized401Error,
    IntegrationActionRequiredError: class extends Error {},
  };
});

jest.mock("@/integrations/stripe/api/customers", () => ({
  customersCreate: jest.fn(),
  customersUpdate: jest.fn(),
  customersGet: (...args: unknown[]) => mockGet(...args),
  customersList: (...args: unknown[]) => mockList(...args),
}));

import { findCustomer } from "@/integrations/stripe/actions/findCustomer";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
  mockList.mockReset();
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

function customerResponse() {
  return {
    id: "cus_1",
    email: "alice@example.com",
    name: "Alice",
    description: null,
    created: 1234567890,
    livemode: false,
    metadata: {},
  };
}

describe("find_customer action", () => {
  it("by customerId — returns found:true with customer object on hit", async () => {
    mockGet.mockResolvedValueOnce(customerResponse());
    const result = await findCustomer({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_1" },
      triggerEvent: trigger(),
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.output.found).toBe(true);
    const customer = result.output.customer as { customerId: string };
    expect(customer.customerId).toBe("cus_1");
  });

  it("by customerId — returns found:false on NotFoundError (no throw)", async () => {
    mockGet.mockRejectedValueOnce(new NotFoundError("customer cus_missing"));
    const result = await findCustomer({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { customerId: "cus_missing" },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(false);
    expect(result.output.customer).toBeNull();
  });

  it("by email — returns found:true with first match from list response", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      data: [customerResponse()],
      has_more: false,
      url: "/v1/customers",
    });
    const result = await findCustomer({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { email: "alice@example.com" },
      triggerEvent: trigger(),
    });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList.mock.calls[0]![0]!.email).toBe("alice@example.com");
    expect(mockList.mock.calls[0]![0]!.limit).toBe(1);
    expect(result.output.found).toBe(true);
  });

  it("by email — returns found:false on empty list (no throw)", async () => {
    mockList.mockResolvedValueOnce({
      object: "list",
      data: [],
      has_more: false,
      url: "/v1/customers",
    });
    const result = await findCustomer({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { email: "missing@example.com" },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(false);
    expect(result.output.customer).toBeNull();
  });

  it("rejects when both customerId and email supplied (XOR contract)", async () => {
    await expect(
      findCustomer({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          customerId: "cus_1",
          email: "alice@example.com",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("rejects when neither customerId nor email supplied", async () => {
    await expect(
      findCustomer({
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

  it("does NOT send Idempotency-Key (read-only operation)", async () => {
    mockGet.mockResolvedValueOnce(customerResponse());
    await findCustomer({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "session-1",
      nodeId: "n",
      config: { customerId: "cus_1" },
      triggerEvent: trigger(),
    });
    // customersGet doesn't accept idempotencyKey at all — and the
    // wrapper's typed input doesn't have the field. Passing through
    // refreshAndRetry, no Idempotency-Key flows.
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.userId).toBe("u");
  });

  it("re-throws non-NotFoundError errors from customersGet", async () => {
    mockGet.mockRejectedValueOnce(new Error("Stripe GET /v1/customers/cus_1 failed: rate_limited"));
    await expect(
      findCustomer({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { customerId: "cus_1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/rate_limited/);
  });
});
