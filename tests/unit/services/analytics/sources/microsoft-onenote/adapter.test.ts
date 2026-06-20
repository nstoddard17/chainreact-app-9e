/**
 * @jest-environment node
 *
 * Microsoft OneNote analytics adapter (Slice ANALYTICS-SOURCES-ONENOTE-1): per-viewer
 * personal credential resolution (refreshable → refreshAndRetry), count-only +
 * metadata-only metrics (notebook/section/page counts + pages created/modified over
 * time — only createdMs/modifiedMs read; never page title/content/preview/author),
 * and typed, leak-free error normalization. No network/DB — the credential repo,
 * refreshAndRetry, and the bounded readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockCountNotebooks = jest.fn();
const mockCountSections = jest.fn();
const mockScanPages = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-onenote/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/microsoft-onenote/api");
  return {
    ...actual,
    countNotebooks: (...a: unknown[]) => mockCountNotebooks(...a),
    countSections: (...a: unknown[]) => mockCountSections(...a),
    scanPageTimestamps: (...a: unknown[]) => mockScanPages(...a),
  };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { microsoftOneNoteAnalyticsSource } from "@/services/analytics/sources/microsoft-onenote";
import { OneNoteRateLimitError } from "@/services/analytics/sources/microsoft-onenote/api";
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
const ms = (iso: string) => Date.parse(iso);

const PAGE_FACTS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), modifiedMs: ms("2026-06-02T09:00:00Z") },
  { createdMs: ms("2026-06-01T11:00:00Z"), modifiedMs: ms("2026-06-02T10:00:00Z") },
  { createdMs: ms("2026-06-03T09:00:00Z"), modifiedMs: ms("2026-06-03T09:00:00Z") },
  { createdMs: ms("2026-05-15T09:00:00Z"), modifiedMs: ms("2026-05-16T09:00:00Z") }, // out of range
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "on-user-1" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockCountNotebooks.mockResolvedValue({ count: 3, truncated: false });
  mockCountSections.mockResolvedValue({ count: 11, truncated: false });
  mockScanPages.mockResolvedValue({ facts: PAGE_FACTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes the approved metadata-only metric set with no filters", () => {
    expect(microsoftOneNoteAnalyticsSource.providerKey).toBe("microsoft-onenote");
    expect(microsoftOneNoteAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftOneNoteAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "notebooks_count",
      "pages_count",
      "pages_created_over_time",
      "pages_modified_over_time",
      "sections_count",
    ]);
    for (const m of microsoftOneNoteAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });
});

describe("validation + credential resolution", () => {
  it("rejects an unknown metric (no I/O)", async () => {
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "read_page", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-onenote", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-onenote",
      providerAccountId: "on-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no OneNote connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockCountNotebooks).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("notebooks_count returns the notebook count", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ notebooks_count: 3 });
    expect(mockScanPages).not.toHaveBeenCalled();
  });

  it("sections_count returns the section count", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "sections_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ sections_count: 11 });
  });

  it("pages_count counts all scanned pages (account-wide, not range-filtered)", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ pages_count: 4 });
  });

  it("pages_created_over_time buckets by createdMs (out-of-range excluded)", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_created_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 0, 1, 0]); // 06-01 x2, 06-03 x1 (05-15 out)
    expect(r.totals?.count).toBe(3);
  });

  it("pages_modified_over_time buckets by modifiedMs (out-of-range excluded)", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_modified_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([0, 2, 1, 0]); // 06-02 x2, 06-03 x1 (05-16 out)
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the page scan hit its budget", async () => {
    mockScanPages.mockResolvedValue({ facts: PAGE_FACTS, truncated: true });
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces a page title / content / preview / author / webUrl", async () => {
    const r = await microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_modified_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/title|content|preview|author|weburl|contenturl|createdby|@odata/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-onenote",
        providerAccountId: "on-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScanPages.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockCountNotebooks.mockRejectedValueOnce(new OneNoteRateLimitError("rate-limited"));
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("a NotFoundError (no OneNote provisioned) → PROVIDER_ERROR (no user filter to fix)", async () => {
    mockCountNotebooks.mockRejectedValueOnce(new NotFoundError("onenote notebooks", "not found"));
    await expect(
      microsoftOneNoteAnalyticsSource.query({ metricKey: "notebooks_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScanPages.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await microsoftOneNoteAnalyticsSource
      .query({ metricKey: "pages_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
