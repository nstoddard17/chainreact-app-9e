/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:get_realtime_data handler
 * (promoted V1 orphan).
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRunRealtimeReport = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/runRealtimeReport", () => ({
  runRealtimeReport: (...args: unknown[]) => mockRunRealtimeReport(...args),
}));

import { getRealtimeData } from "@/integrations/google-analytics/actions/getRealtimeData";

function gaTrigger(): TriggerEvent {
  return { provider: "google-analytics", eventType: "manual", eventId: "e", occurredAt: "2026-05-25T00:00:00Z", accountId: "alice@example.com", payload: {} };
}
function call(config: Record<string, unknown>) {
  return getRealtimeData({ workflowId: "w", userId: "u", runId: "r", nodeId: "n", config, triggerEvent: gaTrigger() });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRunRealtimeReport.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("ya29.tok"));
});

describe("get_realtime_data", () => {
  it("is strict + requires propertyId + at least one metric", async () => {
    await expect(call({ propertyId: "1", metrics: ["activeUsers"], bogus: 1 })).rejects.toThrow();
    await expect(call({ propertyId: "1", metrics: [] })).rejects.toThrow(/metric/);
  });

  it("calls the realtime wrapper + surfaces aggregates keyed by metric name", async () => {
    mockRunRealtimeReport.mockResolvedValueOnce({
      metricHeaders: [{ name: "activeUsers" }, { name: "screenPageViews" }, { name: "eventCount" }],
      rows: [{ metricValues: [{ value: "42" }, { value: "156" }, { value: "89" }] }],
    });
    const result = await call({ propertyId: "123", metrics: ["activeUsers", "screenPageViews", "eventCount"] });
    expect(result.output.activeUsers).toBe(42);
    expect(result.output.pageViews).toBe(156);
    expect(result.output.eventCount).toBe(89);
    expect(result.output.rowCount).toBe(1);
  });

  it("returns null aggregates for metrics that weren't requested", async () => {
    mockRunRealtimeReport.mockResolvedValueOnce({
      metricHeaders: [{ name: "activeUsers" }],
      rows: [{ metricValues: [{ value: "7" }] }],
    });
    const result = await call({ propertyId: "123", metrics: ["activeUsers"] });
    expect(result.output.activeUsers).toBe(7);
    expect(result.output.pageViews).toBeNull();
    expect(result.output.eventCount).toBeNull();
  });
});
