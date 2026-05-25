/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:send_event handler.
 * Security focus: the output NEVER echoes apiSecret / clientId / userId /
 * eventParams.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCollect = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/measurementProtocolCollect", () => ({
  measurementProtocolCollect: (...args: unknown[]) => mockCollect(...args),
}));

import { sendEvent } from "@/integrations/google-analytics/actions/sendEvent";

function gaTrigger(): TriggerEvent {
  return { provider: "google-analytics", eventType: "manual", eventId: "e", occurredAt: "2026-05-25T00:00:00Z", accountId: "alice@example.com", payload: {} };
}
function call(config: Record<string, unknown>) {
  return sendEvent({ workflowId: "w", userId: "u", runId: "r", nodeId: "n", config, triggerEvent: gaTrigger() });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCollect.mockReset();
  mockCollect.mockResolvedValue({ status: 204 });
});

describe("send_event — schema + plumbing", () => {
  it("is strict + requires measurementId/apiSecret/clientId/eventName", async () => {
    await expect(call({ measurementId: "G-X", apiSecret: "s", clientId: "c", eventName: "purchase", bogus: 1 })).rejects.toThrow();
    await expect(call({ apiSecret: "s", clientId: "c", eventName: "purchase" })).rejects.toThrow(/measurementId/);
    await expect(call({ measurementId: "G-X", clientId: "c", eventName: "purchase" })).rejects.toThrow(/apiSecret/);
  });

  it("allows optional UI-scope accountId/propertyId", async () => {
    await expect(
      call({ accountId: "a", propertyId: "p", measurementId: "G-X", apiSecret: "s", clientId: "c", eventName: "purchase" }),
    ).resolves.toBeDefined();
  });

  it("does NOT use refreshAndRetry (MP authenticates with apiSecret, not OAuth)", async () => {
    await call({ measurementId: "G-X", apiSecret: "s", clientId: "c", eventName: "purchase" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockCollect).toHaveBeenCalledTimes(1);
  });
});

describe("send_event — params + output", () => {
  it("passes a JSON-string eventParams through as a parsed object", async () => {
    await call({
      measurementId: "G-X",
      apiSecret: "s",
      clientId: "c",
      eventName: "purchase",
      eventParams: JSON.stringify({ value: 9.99, currency: "USD" }),
      userId: "user-7",
    });
    expect(mockCollect.mock.calls[0]![0]).toMatchObject({
      measurementId: "G-X",
      apiSecret: "s",
      clientId: "c",
      eventName: "purchase",
      eventParams: { value: 9.99, currency: "USD" },
      userId: "user-7",
    });
  });

  it("treats a non-JSON eventParams string as no params (does not throw)", async () => {
    await call({ measurementId: "G-X", apiSecret: "s", clientId: "c", eventName: "purchase", eventParams: "not json" });
    expect(mockCollect.mock.calls[0]![0]).toMatchObject({ eventParams: {} });
  });

  it("output is structural ONLY — never echoes apiSecret/clientId/userId/eventParams", async () => {
    const result = await call({
      measurementId: "G-X",
      apiSecret: "SECRET123",
      clientId: "111.222",
      eventName: "purchase",
      eventParams: { value: 1 },
      userId: "user-7",
    });
    expect(result.output).toEqual({
      success: true,
      eventName: "purchase",
      sentAt: expect.any(String),
    });
    const serialized = JSON.stringify(result.output);
    expect(serialized).not.toContain("SECRET123");
    expect(serialized).not.toContain("111.222");
    expect(serialized).not.toContain("user-7");
    expect(result.output).not.toHaveProperty("apiSecret");
    expect(result.output).not.toHaveProperty("clientId");
    expect(result.output).not.toHaveProperty("userId");
    expect(result.output).not.toHaveProperty("eventParams");
  });
});
