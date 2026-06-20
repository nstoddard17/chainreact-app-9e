/**
 * @jest-environment node
 *
 * Microsoft Excel analytics adapter (Slice ANALYTICS-SOURCES-EXCEL-1): per-viewer
 * personal credential resolution (refreshable → refreshAndRetry), count-only +
 * metadata-only metrics (workbook count + created/modified over time + per-workbook
 * worksheet/table counts — only timestamps + list lengths read; never cell
 * values/formulas/file names), required workbook validation, and typed, leak-free error
 * normalization. No network/DB — the credential repo, refreshAndRetry, the workbook
 * scanner, and the worksheet/table list wrappers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-excel/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/microsoft-excel/api");
  return { ...actual, scanWorkbooks: (...a: unknown[]) => mockScan(...a) };
});

const mockWorksheets = jest.fn();
jest.mock("@/integrations/microsoft-excel/api/worksheetsList", () => ({
  __esModule: true,
  worksheetsList: (...a: unknown[]) => mockWorksheets(...a),
}));

const mockTables = jest.fn();
jest.mock("@/integrations/microsoft-excel/api/tablesList", () => ({
  __esModule: true,
  tablesList: (...a: unknown[]) => mockTables(...a),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: { apiCall: (t: string) => unknown }) => mockRefresh(input) };
});

import { microsoftExcelAnalyticsSource } from "@/services/analytics/sources/microsoft-excel";
import { ExcelRateLimitError } from "@/services/analytics/sources/microsoft-excel/api";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const WORKBOOK = "01ABCWORKBOOK!123";
const WB_F = { excel_workbook: WORKBOOK };
const ms = (iso: string) => Date.parse(iso);

const FACTS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), modifiedMs: ms("2026-06-02T09:00:00Z") },
  { createdMs: ms("2026-06-01T11:00:00Z"), modifiedMs: ms("2026-06-02T10:00:00Z") },
  { createdMs: ms("2026-06-03T09:00:00Z"), modifiedMs: ms("2026-06-03T09:00:00Z") },
  { createdMs: ms("2026-05-15T09:00:00Z"), modifiedMs: ms("2026-05-16T09:00:00Z") }, // out of range
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "ex-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: FACTS, truncated: false });
  mockWorksheets.mockResolvedValue([{ id: "s1" }, { id: "s2" }, { id: "s3" }]);
  mockTables.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
});

describe("metric registration", () => {
  it("exposes the approved metadata-only metric set with correct filter shapes", () => {
    expect(microsoftExcelAnalyticsSource.providerKey).toBe("microsoft-excel");
    expect(microsoftExcelAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftExcelAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "tables_count",
      "workbooks_count",
      "workbooks_created_over_time",
      "workbooks_modified_over_time",
      "worksheets_count",
    ]);
    const byKey = Object.fromEntries(microsoftExcelAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.workbooks_count).toEqual([]);
    expect(byKey.workbooks_modified_over_time).toEqual([]);
    expect(byKey.worksheets_count).toEqual(["excel_workbook"]);
    expect(byKey.tables_count).toEqual(["excel_workbook"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "read_range", range: RANGE, filters: WB_F }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing workbook id for workbook-scoped metrics before any I/O", async () => {
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "worksheets_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed workbook id before any I/O", async () => {
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "tables_count", range: RANGE, filters: { excel_workbook: "bad id with spaces" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-excel", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-excel",
      providerAccountId: "ex-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Excel connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("workbooks_count counts all scanned workbooks", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ workbooks_count: 4 });
    expect(mockWorksheets).not.toHaveBeenCalled();
  });

  it("workbooks_modified_over_time buckets by modifiedMs (out-of-range excluded)", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_modified_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([0, 2, 1, 0]); // 06-02 x2, 06-03 x1 (05-16 out)
    expect(r.totals?.count).toBe(3);
  });

  it("workbooks_created_over_time buckets by createdMs (out-of-range excluded)", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_created_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([2, 0, 1, 0]); // 06-01 x2, 06-03 x1 (05-15 out)
    expect(r.totals?.count).toBe(3);
  });

  it("worksheets_count returns the worksheet list length for the selected workbook", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "worksheets_count", range: RANGE, filters: WB_F }, CTX);
    expect(r.totals).toEqual({ worksheets_count: 3 });
    expect(mockWorksheets.mock.calls[0]![0]).toMatchObject({ workbookId: WORKBOOK });
  });

  it("tables_count returns the table list length for the selected workbook", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "tables_count", range: RANGE, filters: WB_F }, CTX);
    expect(r.totals).toEqual({ tables_count: 2 });
    expect(mockTables.mock.calls[0]![0]).toMatchObject({ workbookId: WORKBOOK });
  });

  it("surfaces a truncation warning when the workbook scan hit its budget", async () => {
    mockScan.mockResolvedValue({ facts: FACTS, truncated: true });
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces a workbook/sheet name, cell value, or file path", async () => {
    const r = await microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_modified_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/\bname\b|cell|formula|range|webUrl|owner|\.xlsx|worksheet|content/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-excel",
        providerAccountId: "ex-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a workbook NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockWorksheets.mockRejectedValueOnce(new NotFoundError("workbook x", "not found"));
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "worksheets_count", range: RANGE, filters: WB_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new ExcelRateLimitError("rate-limited"));
    await expect(
      microsoftExcelAnalyticsSource.query({ metricKey: "workbooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await microsoftExcelAnalyticsSource
      .query({ metricKey: "workbooks_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
