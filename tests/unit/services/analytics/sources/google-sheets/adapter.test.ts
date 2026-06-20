/**
 * @jest-environment node
 *
 * Google Sheets analytics adapter (Slice ANALYTICS-SOURCES-GWORKSPACE-1) — shares the
 * Google Workspace adapter factory with Google Docs. Confirms the distinct provider key,
 * spreadsheet MIME wiring, spreadsheet_* metric names, per-viewer credential resolution,
 * count + bucketing, and leak-free errors. No network/DB — repo, refreshAndRetry, and
 * the bounded reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/_shared/googleWorkspaceFiles", () => {
  const actual = jest.requireActual("@/services/analytics/sources/_shared/googleWorkspaceFiles");
  return { ...actual, scanWorkspaceFiles: (...args: unknown[]) => mockScan(...args) };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { googleSheetsAnalyticsSource } from "@/services/analytics/sources/google-sheets";
import { NormalizedAnalyticsResultSchema } from "@/services/analytics/sources/types";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" };
const ms = (iso: string) => Date.parse(iso);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "gs-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({
    facts: [
      { createdMs: ms("2026-06-01T09:00:00Z"), modifiedMs: ms("2026-06-02T09:00:00Z") },
      { createdMs: ms("2026-06-02T09:00:00Z"), modifiedMs: ms("2026-06-03T09:00:00Z") },
    ],
    truncated: false,
  });
});

describe("metric registration + wiring", () => {
  it("registers google-sheets with spreadsheet metric keys and no filters", () => {
    expect(googleSheetsAnalyticsSource.providerKey).toBe("google-sheets");
    expect(googleSheetsAnalyticsSource.displayName).toBe("Google Sheets");
    expect(googleSheetsAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "spreadsheets_count",
      "spreadsheets_created_over_time",
      "spreadsheets_modified_over_time",
    ]);
    for (const m of googleSheetsAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });

  it("scans the spreadsheet MIME type against the viewer's own google-sheets connection", async () => {
    await googleSheetsAnalyticsSource.query({ metricKey: "spreadsheets_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "google-sheets", null, { connectedByUserId: "user-1" });
    expect(mockScan.mock.calls[0]![1]).toBe("application/vnd.google-apps.spreadsheet");
  });
});

describe("metrics + credential", () => {
  it("spreadsheets_count counts files", async () => {
    const r = await googleSheetsAnalyticsSource.query({ metricKey: "spreadsheets_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ spreadsheets_count: 2 });
  });

  it("spreadsheets_modified_over_time returns a bucketed series", async () => {
    const r = await googleSheetsAnalyticsSource.query({ metricKey: "spreadsheets_modified_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.totals?.count).toBe(2);
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Google Sheets connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      googleSheetsAnalyticsSource.query({ metricKey: "spreadsheets_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("never surfaces a file name / cell value / owner", async () => {
    const r = await googleSheetsAnalyticsSource.query({ metricKey: "spreadsheets_modified_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/\bname\b|owner|permission|content|cell|sheet|tab/i);
  });
});
