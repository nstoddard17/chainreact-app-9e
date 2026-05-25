/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/stripe/api/customers", () => ({
  customersCreate: jest.fn(),
  customersUpdate: (...args: unknown[]) => mockUpdate(...args),
  customersGet: jest.fn(),
  customersList: jest.fn(),
}));

import { updateCustomer } from "@/integrations/stripe/actions/updateCustomer";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
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

describe("update_customer action", () => {
  it("posts customersUpdate with partial fields", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "cus_1",
      email: "alice@example.com",
      name: "Alice Updated",
      description: "VIP",
      created: 1,
      livemode: false,
      metadata: {},
    });
    const result = await updateCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        customerId: "cus_1",
        name: "Alice Updated",
        description: "VIP",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.customerId).toBe("cus_1");
    expect(callArg.name).toBe("Alice Updated");
    expect(callArg.description).toBe("VIP");
    expect(callArg.email).toBeUndefined();
    expect(result.output.customerId).toBe("cus_1");
    expect(result.output.name).toBe("Alice Updated");
  });

  it("does NOT send Idempotency-Key (update is server-side idempotent on resource id)", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "cus_1",
      email: null,
      name: null,
      description: null,
      created: 1,
      livemode: false,
      metadata: {},
    });
    await updateCustomer({
      workflowId: "wf",
      userId: "u",
      runId: "session-1",
      nodeId: "n",
      config: { customerId: "cus_1", name: "x" },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.idempotencyKey).toBeUndefined();
  });

  it("requires customerId (Q11)", async () => {
    await expect(
      updateCustomer({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { name: "Alice" } as unknown as Record<string, unknown>,
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
