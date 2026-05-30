/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:run_pivot_report handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRunPivotReport = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/runPivotReport", () => ({
  runPivotReport: (...args: unknown[]) => mockRunPivotReport(...args),
}));

import { runPivotReport } from "@/integrations/google-analytics/actions/runPivotReport";

function gaTrigger(): TriggerEvent {
  return { provider: "google-analytics", eventType: "manual", eventId: "e", occurredAt: "2026-05-25T00:00:00Z", providerAccountId: "alice@example.com", payload: {} };
}
function call(config: Record<string, unknown>) {
  return runPivotReport({ workflowId: "w", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: gaTrigger() });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRunPivotReport.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("ya29.tok"));
});

describe("run_pivot_report", () => {
  it("is strict + requires propertyId/metrics", async () => {
    await expect(call({ propertyId: "1", dateRange: "today", metrics: ["sessions"], bogus: 1 })).rejects.toThrow();
    await expect(call({ dateRange: "today", metrics: ["sessions"] })).rejects.toThrow(/propertyId/);
  });

  it("passes row + pivot dimensions through to the wrapper", async () => {
    mockRunPivotReport.mockResolvedValueOnce({ rows: [] });
    await call({
      propertyId: "123",
      dateRange: "last_30_days",
      metrics: ["sessions"],
      dimensions: ["country"],
      pivotDimensions: ["deviceCategory"],
    });
    expect(mockRunPivotReport.mock.calls[0]![0]).toMatchObject({
      propertyId: "123",
      metrics: ["sessions"],
      dimensions: ["country"],
      pivotDimensions: ["deviceCategory"],
    });
  });

  it("normalizes rows + surfaces pivot columnHeaders", async () => {
    mockRunPivotReport.mockResolvedValueOnce({
      dimensionHeaders: [{ name: "country" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [{ dimensionValues: [{ value: "US" }], metricValues: [{ value: "5" }] }],
      pivotHeaders: [
        { pivotDimensionHeaders: [{ dimensionValues: [{ value: "desktop" }] }, { dimensionValues: [{ value: "mobile" }] }] },
      ],
    });
    const result = await call({ propertyId: "123", dateRange: "today", metrics: ["sessions"], dimensions: ["country"], pivotDimensions: ["deviceCategory"] });
    expect(result.output.rows).toEqual([{ country: "US", sessions: 5 }]);
    expect(result.output.columnHeaders).toEqual(["desktop", "mobile"]);
  });
});
