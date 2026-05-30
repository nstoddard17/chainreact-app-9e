/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — google-analytics:run_report handler.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockRunReport = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));
jest.mock("@/integrations/_shared/google/api/analytics/runReport", () => ({
  runReport: (...args: unknown[]) => mockRunReport(...args),
}));

import { runReport } from "@/integrations/google-analytics/actions/runReport";

function gaTrigger(): TriggerEvent {
  return {
    provider: "google-analytics",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-25T00:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

function call(config: Record<string, unknown>) {
  return runReport({
    workflowId: "w",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: gaTrigger(),
  });
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRunReport.mockReset();
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("ya29.tok"));
});

describe("run_report — schema + plumbing", () => {
  it("preserves V1 field names and is strict (rejects unknown keys)", async () => {
    mockRunReport.mockResolvedValueOnce({ rows: [] });
    await expect(
      call({ propertyId: "1", dateRange: "last_7_days", metrics: ["sessions"], bogus: 1 }),
    ).rejects.toThrow();
  });

  it("requires propertyId + at least one metric", async () => {
    await expect(call({ dateRange: "today", metrics: ["sessions"] })).rejects.toThrow(/propertyId/);
    await expect(call({ propertyId: "1", dateRange: "today", metrics: [] })).rejects.toThrow(/metric/);
  });

  it("allows the UI-scope accountId field without sending it to the API", async () => {
    mockRunReport.mockResolvedValueOnce({ rows: [] });
    await call({ accountId: "acc-1", propertyId: "123", dateRange: "today", metrics: ["sessions"] });
    expect(mockRunReport.mock.calls[0]![0]).not.toHaveProperty("accountId");
    expect(mockRunReport.mock.calls[0]![0]).toMatchObject({ propertyId: "123" });
  });

  it("threads accountId from the trigger event into refreshAndRetry(provider=google-analytics)", async () => {
    mockRunReport.mockResolvedValueOnce({ rows: [] });
    await call({ propertyId: "123", dateRange: "today", metrics: ["sessions"] });
    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google-analytics", accountId: "alice@example.com" }),
    );
  });

  it("custom date range requires startDate + endDate", async () => {
    await expect(call({ propertyId: "1", dateRange: "custom", metrics: ["sessions"] })).rejects.toThrow(
      /startDate and endDate/,
    );
  });
});

describe("run_report — date range + normalization", () => {
  it("resolves a custom range and passes it to the wrapper", async () => {
    mockRunReport.mockResolvedValueOnce({ rows: [] });
    await call({
      propertyId: "123",
      dateRange: "custom",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      metrics: ["sessions"],
      dimensions: ["date"],
      limit: 10,
    });
    expect(mockRunReport.mock.calls[0]![0]).toMatchObject({
      propertyId: "123",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      metrics: ["sessions"],
      dimensions: ["date"],
      limit: 10,
    });
  });

  it("normalizes GA4 headers+rows into records and surfaces headers + rowCount", async () => {
    mockRunReport.mockResolvedValueOnce({
      dimensionHeaders: [{ name: "date" }],
      metricHeaders: [{ name: "sessions" }, { name: "totalUsers" }],
      rows: [
        { dimensionValues: [{ value: "20260501" }], metricValues: [{ value: "12" }, { value: "8" }] },
      ],
      rowCount: 1,
    });
    const result = await call({ propertyId: "123", dateRange: "today", metrics: ["sessions", "totalUsers"], dimensions: ["date"] });
    expect(result.output.rows).toEqual([{ date: "20260501", sessions: 12, totalUsers: 8 }]);
    expect(result.output.rowCount).toBe(1);
    expect(result.output.dimensionHeaders).toEqual(["date"]);
    expect(result.output.metricHeaders).toEqual(["sessions", "totalUsers"]);
  });
});
