/**
 * @jest-environment node
 *
 * Airtable analytics adapter (Slice ANALYTICS-SOURCES-AIRTABLE-1): per-viewer
 * personal credential resolution (refreshable → refreshAndRetry), privacy-safe
 * record-count/created + table-count metrics (only createdTime / table-count read —
 * never cell values/fields/attachments), required base (+table) validation, and
 * typed, leak-free error normalization. No network/DB — the credential repo,
 * refreshAndRetry, and the bounded reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
const mockTableCount = jest.fn();
jest.mock("@/services/analytics/sources/airtable/api", () => ({
  __esModule: true,
  scanRecords: (...args: unknown[]) => mockScan(...args),
  fetchTableCount: (...args: unknown[]) => mockTableCount(...args),
  PAGE_SIZE: 100,
  MAX_PAGES: 10,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { airtableAnalyticsSource } from "@/services/analytics/sources/airtable";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const BASE = "app0123456789abcd";
const TABLE = "tbl0123456789abcd";
const ms = (iso: string) => Date.parse(iso);

const RECORDS = [
  { createdMs: ms("2026-06-01T09:00:00Z") },
  { createdMs: ms("2026-06-02T09:00:00Z") },
  { createdMs: ms("2026-05-15T09:00:00Z") }, // before range
];

function baseTable(extra: Record<string, string> = {}) {
  return { airtable_base: BASE, airtable_table: TABLE, ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "airtable-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: RECORDS, truncated: false });
  mockTableCount.mockResolvedValue(5);
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set with the right filter scoping", () => {
    expect(airtableAnalyticsSource.providerKey).toBe("airtable");
    expect(airtableAnalyticsSource.connectedApp).toBe(true);
    expect(airtableAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "record_count",
      "records_created_over_time",
      "tables_count",
    ]);
    const byKey = Object.fromEntries(airtableAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.record_count).toEqual(["airtable_base", "airtable_table"]);
    expect(byKey.records_created_over_time).toEqual(["airtable_base", "airtable_table"]);
    expect(byKey.tables_count).toEqual(["airtable_base"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      airtableAnalyticsSource.query({ metricKey: "read_cells", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing / malformed base or table before any I/O", async () => {
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      airtableAnalyticsSource.query(
        { metricKey: "record_count", range: RANGE, filters: { airtable_base: BASE, airtable_table: "nope" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      airtableAnalyticsSource.query({ metricKey: "tables_count", range: RANGE, filters: { airtable_base: "bad" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("tables_count needs only a base (no table required)", async () => {
    const r = await airtableAnalyticsSource.query(
      { metricKey: "tables_count", range: RANGE, filters: { airtable_base: BASE } },
      CTX,
    );
    expect(r.totals).toEqual({ tables_count: 5 });
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "airtable", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "airtable",
      providerAccountId: "airtable-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Airtable connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("record_count counts records in the table", async () => {
    const r = await airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ record_count: 3 });
    expect(mockScan.mock.calls[0]!.slice(1)).toEqual([BASE, TABLE]);
  });

  it("records_created_over_time buckets by created time (out-of-range excluded)", async () => {
    const r = await airtableAnalyticsSource.query(
      { metricKey: "records_created_over_time", range: RANGE, filters: baseTable() },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 0, 0]); // 06-01, 06-02 (05-15 excluded)
    expect(r.totals?.count).toBe(2);
  });

  it("tables_count returns the base's table count", async () => {
    const r = await airtableAnalyticsSource.query(
      { metricKey: "tables_count", range: RANGE, filters: { airtable_base: BASE } },
      CTX,
    );
    expect(r.totals).toEqual({ tables_count: 5 });
    expect(mockTableCount.mock.calls[0]![1]).toBe(BASE);
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("surfaces a truncation warning when the record scan hit the cap", async () => {
    mockScan.mockResolvedValue({ facts: RECORDS, truncated: true });
    const r = await airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces record field / cell / attachment detail — only counts + dates", async () => {
    const r = await airtableAnalyticsSource.query(
      { metricKey: "records_created_over_time", range: RANGE, filters: baseTable() },
      CTX,
    );
    expect(JSON.stringify(r)).not.toMatch(/fields|cell|attachment|comment|collaborator|"id"/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "airtable",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a base/table NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockScan.mockRejectedValueOnce(new NotFoundError("table x", "not found"));
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new Error("Airtable GET failed: 429 too many requests"));
    await expect(
      airtableAnalyticsSource.query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await airtableAnalyticsSource
      .query({ metricKey: "record_count", range: RANGE, filters: baseTable() }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
