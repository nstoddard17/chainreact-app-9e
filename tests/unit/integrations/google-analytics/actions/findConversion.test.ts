/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:find_conversion handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/conversionEventsList", () => ({
  conversionEventsList: (...args: unknown[]) => mockList(...args),
}));

import { findConversion } from "@/integrations/google-analytics/actions/findConversion";

function gaTrigger(): TriggerEvent {
  return { provider: "google-analytics", eventType: "manual", eventId: "e", occurredAt: "2026-05-25T00:00:00Z", providerAccountId: "alice@example.com", payload: {} };
}
function call(config: Record<string, unknown>) {
  return findConversion({ workflowId: "w", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: gaTrigger() });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("ya29.tok"));
});

describe("find_conversion", () => {
  it("is strict + requires propertyId + conversionEventName", async () => {
    await expect(call({ propertyId: "1", conversionEventName: "purchase", bogus: 1 })).rejects.toThrow();
    await expect(call({ propertyId: "1" })).rejects.toThrow(/conversionEventName/);
  });

  it("returns the matched conversion (id parsed from resource name)", async () => {
    mockList.mockResolvedValueOnce({
      conversionEvents: [
        { name: "properties/123/conversionEvents/99", eventName: "purchase", countingMethod: "ONCE_PER_EVENT" },
      ],
    });
    const result = await call({ propertyId: "123", conversionEventName: "purchase" });
    expect(result.output).toEqual({
      found: true,
      eventName: "purchase",
      countingMethod: "ONCE_PER_EVENT",
      conversionEventId: "99",
      resourceName: "properties/123/conversionEvents/99",
    });
  });

  it("returns found:false + nulls when no match", async () => {
    mockList.mockResolvedValueOnce({ conversionEvents: [{ eventName: "sign_up" }] });
    const result = await call({ propertyId: "123", conversionEventName: "purchase" });
    expect(result.output).toMatchObject({ found: false, eventName: "purchase", conversionEventId: null });
  });
});
