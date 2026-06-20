/**
 * @jest-environment node
 *
 * Facebook analytics adapter (Slice ANALYTICS-SOURCES-FACEBOOK-1): per-viewer personal
 * credential resolution (non-refreshable → refreshAndRetry surfaces reconnect),
 * aggregate/count-only metrics (managed-page count + page fan/followers counts + page
 * post count / posts-over-time — only aggregate numbers + post created_time read; never
 * post content/user/page-token), required page validation, and typed, leak-free error
 * normalization. No network/DB — the credential repo, refreshAndRetry, page-token
 * derivation, and the bounded readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockPagesList = jest.fn();
jest.mock("@/integrations/_shared/facebook/api/pagesList", () => ({
  __esModule: true,
  pagesList: (...a: unknown[]) => mockPagesList(...a),
}));

const mockGetPageToken = jest.fn();
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  __esModule: true,
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));

const mockAudience = jest.fn();
const mockScanPosts = jest.fn();
jest.mock("@/services/analytics/sources/facebook/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/facebook/api");
  return {
    ...actual,
    getPageAudienceCounts: (...a: unknown[]) => mockAudience(...a),
    scanPagePosts: (...a: unknown[]) => mockScanPosts(...a),
  };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: { apiCall: (t: string) => unknown }) => mockRefresh(input) };
});

import { facebookAnalyticsSource } from "@/services/analytics/sources/facebook";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  FacebookPermissionError,
  NotFoundError,
  RateLimitError,
} from "@/integrations/_shared/facebook/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const PAGE = "1234567890";
const PAGE_F = { facebook_page: PAGE };
const ms = (iso: string) => Date.parse(iso);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "fb-user-1" });
  // refreshAndRetry passes the user token to apiCall.
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("user-tok"));
  mockGetPageToken.mockResolvedValue("page-tok");
  mockPagesList.mockResolvedValue({ data: [{ id: "1" }, { id: "2" }, { id: "3" }] });
  mockAudience.mockResolvedValue({ fanCount: 1500, followersCount: 1620 });
  mockScanPosts.mockResolvedValue({
    timestamps: [ms("2026-06-01T09:00:00Z"), ms("2026-06-01T11:00:00Z"), ms("2026-06-02T09:00:00Z"), ms("2026-05-15T00:00:00Z")],
    truncated: false,
  });
});

describe("metric registration", () => {
  it("exposes the approved aggregate/count metric set with correct filter shapes", () => {
    expect(facebookAnalyticsSource.providerKey).toBe("facebook");
    expect(facebookAnalyticsSource.connectedApp).toBe(true);
    expect(facebookAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "page_fan_count",
      "page_followers_count",
      "page_posts_count",
      "page_posts_over_time",
      "pages_count",
    ]);
    const byKey = Object.fromEntries(facebookAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.pages_count).toEqual([]);
    expect(byKey.page_fan_count).toEqual(["facebook_page"]);
    expect(byKey.page_posts_over_time).toEqual(["facebook_page"]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      facebookAnalyticsSource.query({ metricKey: "create_post", range: RANGE, filters: PAGE_F }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing page id for page-scoped metrics before any I/O", async () => {
    await expect(
      facebookAnalyticsSource.query({ metricKey: "page_fan_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a malformed page id (non-numeric) before any I/O", async () => {
    await expect(
      facebookAnalyticsSource.query({ metricKey: "page_posts_count", range: RANGE, filters: { facebook_page: "not-a-page" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "facebook", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "facebook",
      providerAccountId: "fb-user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Facebook connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockPagesList).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("pages_count counts managed pages (user token, no page picker)", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ pages_count: 3 });
    expect(mockGetPageToken).not.toHaveBeenCalled();
  });

  it("page_fan_count returns the aggregate fan count (derives a page token first)", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "page_fan_count", range: RANGE, filters: PAGE_F }, CTX);
    expect(r.totals).toEqual({ page_fan_count: 1500 });
    expect(mockGetPageToken.mock.calls[0]![0]).toMatchObject({ pageId: PAGE });
    expect(mockAudience.mock.calls[0]![0]).toMatchObject({ pageAccessToken: "page-tok", pageId: PAGE });
  });

  it("page_followers_count returns the aggregate followers count", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "page_followers_count", range: RANGE, filters: PAGE_F }, CTX);
    expect(r.totals).toEqual({ page_followers_count: 1620 });
  });

  it("page_posts_count counts scanned posts", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "page_posts_count", range: RANGE, filters: PAGE_F }, CTX);
    expect(r.totals).toEqual({ page_posts_count: 4 });
  });

  it("page_posts_over_time buckets by created_time (out-of-range excluded)", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "page_posts_over_time", range: RANGE, filters: PAGE_F }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]); // 06-01 x2, 06-02 x1 (05-15 out)
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the post scan hit its budget", async () => {
    mockScanPosts.mockResolvedValue({ timestamps: [ms("2026-06-01T09:00:00Z")], truncated: true });
    const r = await facebookAnalyticsSource.query({ metricKey: "page_posts_count", range: RANGE, filters: PAGE_F }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces post content / user / page token", async () => {
    const r = await facebookAnalyticsSource.query({ metricKey: "page_posts_over_time", range: RANGE, filters: PAGE_F }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/message|story|comment|reaction|access_token|page-tok|user-tok|attachment/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL (reconnect; FB non-refreshable)", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "facebook",
        providerAccountId: "fb-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockPagesList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a permission error → MISSING_CREDENTIAL (reconnect with permissions)", async () => {
    mockScanPosts.mockRejectedValueOnce(new FacebookPermissionError("OAuthException/code=200"));
    await expect(
      facebookAnalyticsSource.query({ metricKey: "page_posts_count", range: RANGE, filters: PAGE_F }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a NotFoundError (page not found / no token) → INVALID_QUERY", async () => {
    mockGetPageToken.mockRejectedValueOnce(new NotFoundError("page/x/no_access_token"));
    await expect(
      facebookAnalyticsSource.query({ metricKey: "page_fan_count", range: RANGE, filters: PAGE_F }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockPagesList.mockRejectedValueOnce(new RateLimitError("code=4"));
    await expect(
      facebookAnalyticsSource.query({ metricKey: "pages_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScanPosts.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await facebookAnalyticsSource
      .query({ metricKey: "page_posts_count", range: RANGE, filters: PAGE_F }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
