/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:create_conversion_event handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/conversionEventsCreate", () => ({
  conversionEventsCreate: (...args: unknown[]) => mockCreate(...args),
}));

import { createConversionEvent } from "@/integrations/google-analytics/actions/createConversionEvent";

function gaTrigger(): TriggerEvent {
  return { provider: "google-analytics", eventType: "manual", eventId: "e", occurredAt: "2026-05-25T00:00:00Z", accountId: "alice@example.com", payload: {} };
}
function call(config: Record<string, unknown>) {
  return createConversionEvent({ workflowId: "w", userId: "u", runId: "r", nodeId: "n", config, triggerEvent: gaTrigger() });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("ya29.tok"));
});

describe("create_conversion_event", () => {
  it("is strict + requires propertyId + eventName", async () => {
    await expect(call({ propertyId: "1", eventName: "purchase", bogus: 1 })).rejects.toThrow();
    await expect(call({ propertyId: "1" })).rejects.toThrow(/eventName/);
  });

  it("rejects an invalid countingMethod enum", async () => {
    await expect(call({ propertyId: "1", eventName: "purchase", countingMethod: "WRONG" })).rejects.toThrow();
  });

  it("passes V1 field names (eventName/countingMethod/customEvent) to the wrapper", async () => {
    mockCreate.mockResolvedValueOnce({ name: "properties/123/conversionEvents/55", eventName: "purchase" });
    await call({ propertyId: "123", eventName: "purchase", countingMethod: "ONCE_PER_SESSION", customEvent: true });
    expect(mockCreate.mock.calls[0]![0]).toMatchObject({
      propertyId: "123",
      eventName: "purchase",
      countingMethod: "ONCE_PER_SESSION",
      custom: true,
    });
  });

  it("returns structural output (id parsed from resource name), no secrets", async () => {
    mockCreate.mockResolvedValueOnce({
      name: "properties/123/conversionEvents/55",
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
      createTime: "2026-05-25T10:00:00Z",
    });
    const result = await call({ propertyId: "123", eventName: "purchase" });
    expect(result.output).toEqual({
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
      conversionEventId: "55",
      resourceName: "properties/123/conversionEvents/55",
      propertyId: "123",
      createdAt: "2026-05-25T10:00:00Z",
    });
  });
});
