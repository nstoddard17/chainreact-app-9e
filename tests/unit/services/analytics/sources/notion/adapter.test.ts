/**
 * @jest-environment node
 *
 * Notion analytics adapter (Slice ANALYTICS-SOURCES-NOTION-1): account-shared
 * credential resolution (NO per-user pin, decrypt token, non-refreshable),
 * privacy-safe page-activity metrics (only created/edited timing + archived flag
 * read — never title/properties/content), and typed, leak-free error
 * normalization. No network/DB — the credential repo, token decryption, and the
 * bounded scanner are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockDecrypt = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  __esModule: true,
  decryptToken: (...args: unknown[]) => mockDecrypt(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/notion/api", () => ({
  __esModule: true,
  scanPages: (...args: unknown[]) => mockScan(...args),
  PAGE_SIZE: 100,
  MAX_PAGES: 10,
}));

import { notionAnalyticsSource } from "@/services/analytics/sources/notion";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/notion/api/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets

const ms = (iso: string) => Date.parse(iso);

const FACTS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), lastEditedMs: ms("2026-06-02T09:00:00Z"), archived: false },
  { createdMs: ms("2026-06-02T09:00:00Z"), lastEditedMs: ms("2026-06-03T09:00:00Z"), archived: false },
  { createdMs: ms("2026-05-15T09:00:00Z"), lastEditedMs: ms("2026-06-01T09:00:00Z"), archived: false }, // created before range
  { createdMs: ms("2026-06-01T09:00:00Z"), lastEditedMs: ms("2026-06-02T09:00:00Z"), archived: true }, // archived → excluded
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ accessTokenEncrypted: "enc" });
  mockDecrypt.mockReturnValue("tok");
  mockScan.mockResolvedValue({ facts: FACTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(notionAnalyticsSource.providerKey).toBe("notion");
    expect(notionAnalyticsSource.connectedApp).toBe(true);
    expect(notionAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "pages_created_over_time",
      "pages_edited_over_time",
      "recently_updated_count",
      "total_pages_count",
    ]);
    for (const m of notionAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects an unknown metric before resolving any credential", async () => {
    await expect(
      notionAnalyticsSource.query({ metricKey: "read_page_content", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (account-shared — no per-user pin)", () => {
  it("resolves the account's Notion row with NO connectedByUserId and decrypts it", async () => {
    await notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "notion", null);
    expect(mockDecrypt).toHaveBeenCalledWith("enc");
    expect(mockScan.mock.calls[0]![0]).toBe("tok");
  });

  it("returns MISSING_CREDENTIAL when the account has no Notion connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("metrics (page-activity counts; archived excluded)", () => {
  it("total_pages_count counts active (non-archived) pages", async () => {
    const r = await notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ total_pages_count: 3 });
  });

  it("recently_updated_count counts active pages edited within the range", async () => {
    const r = await notionAnalyticsSource.query({ metricKey: "recently_updated_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ recently_updated_count: 3 });
  });

  it("pages_created_over_time buckets by created time (out-of-range created excluded)", async () => {
    const r = await notionAnalyticsSource.query({ metricKey: "pages_created_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 0, 0]); // 06-01, 06-02 (05-15 excluded)
    expect(r.totals?.count).toBe(2);
  });

  it("pages_edited_over_time buckets by last-edited time", async () => {
    const r = await notionAnalyticsSource.query({ metricKey: "pages_edited_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([1, 1, 1, 0]); // edited 06-01, 06-02, 06-03
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the scan hit the cap", async () => {
    mockScan.mockResolvedValue({ facts: FACTS, truncated: true });
    const r = await notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces page content / title / property detail — only counts + dates", async () => {
    const r = await notionAnalyticsSource.query({ metricKey: "pages_created_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/title|properties|rich_text|plain_text|content|parent|url|block/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("a 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a NotFoundError (integration revoked) → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new NotFoundError("search endpoint", "not found"));
    await expect(
      notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new Error("Notion POST /v1/search failed: rate_limited (429)"));
    await expect(
      notionAnalyticsSource.query({ metricKey: "total_pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await notionAnalyticsSource
      .query({ metricKey: "total_pages_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
