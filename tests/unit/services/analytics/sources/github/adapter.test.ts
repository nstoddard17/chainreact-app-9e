/**
 * @jest-environment node
 *
 * GitHub analytics adapter (Slice ANALYTICS-SOURCES-GITHUB-1): account/user-pinned
 * credential resolution, normalized output, and typed error normalization. No
 * network or DB — the credential repo, token decrypt, and Search API are mocked.
 */

jest.mock("@/repositories/integrations", () => ({ getActiveForExecution: jest.fn() }));
jest.mock("@/core/encryption/tokens", () => ({ decryptToken: jest.fn(() => "plaintext-token") }));
jest.mock("@/services/analytics/sources/github/api", () => ({ searchIssueCount: jest.fn() }));

import { githubAnalyticsSource } from "@/services/analytics/sources/github";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { getActiveForExecution } from "@/repositories/integrations";
import { searchIssueCount } from "@/services/analytics/sources/github/api";

const mockGetIntegration = getActiveForExecution as jest.MockedFunction<typeof getActiveForExecution>;
const mockSearch = searchIssueCount as jest.MockedFunction<typeof searchIssueCount>;

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-03T00:00:00Z" };
const REPO_FILTER = { repo: "octocat/hello" };

function connected() {
  mockGetIntegration.mockResolvedValue({ accessTokenEncrypted: "enc" } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue({ total: 0, incomplete: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(githubAnalyticsSource.providerKey).toBe("github");
    expect(githubAnalyticsSource.connectedApp).toBe(true);
    expect(githubAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual(
      ["issues_opened", "open_issues", "open_prs", "prs_merged", "prs_opened"],
    );
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      githubAnalyticsSource.query({ metricKey: "rm -rf", range: RANGE, filters: REPO_FILTER }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid repo filter before resolving credentials", async () => {
    await expect(
      githubAnalyticsSource.query({ metricKey: "open_issues", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — requesting user's OWN connection)", () => {
  it("resolves pinned to ctx.userId within the account", async () => {
    connected();
    mockSearch.mockResolvedValue({ total: 3, incomplete: false });
    await githubAnalyticsSource.query(
      { metricKey: "open_issues", range: RANGE, filters: REPO_FILTER },
      CTX,
    );
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "github", null, {
      connectedByUserId: "user-1",
    });
  });

  it("returns MISSING_CREDENTIAL when the user has no GitHub connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      githubAnalyticsSource.query({ metricKey: "open_issues", range: RANGE, filters: REPO_FILTER }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe("scalar metric", () => {
  it("returns a schema-valid scalar from the search total_count", async () => {
    connected();
    mockSearch.mockResolvedValue({ total: 12, incomplete: false });
    const r = await githubAnalyticsSource.query(
      { metricKey: "open_prs", range: RANGE, filters: REPO_FILTER },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ open_prs: 12 });
    expect(r.freshness.cached).toBe(false);
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith("plaintext-token", "repo:octocat/hello is:pr is:open");
  });
});

describe("series metric", () => {
  it("runs one bounded search per bucket and sums totals", async () => {
    connected();
    mockSearch
      .mockResolvedValueOnce({ total: 2, incomplete: false })
      .mockResolvedValueOnce({ total: 5, incomplete: false })
      .mockResolvedValue({ total: 1, incomplete: false });
    const r = await githubAnalyticsSource.query(
      { metricKey: "issues_opened", range: RANGE, filters: REPO_FILTER },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.dimensions).toEqual(["date"]);
    expect(r.rows.length).toBe(mockSearch.mock.calls.length);
    expect(r.rows.length).toBeLessThanOrEqual(12);
    const total = r.rows.reduce((n, row) => n + Number(row.count), 0);
    expect(r.totals?.count).toBe(total);
  });

  it("adds a warning when GitHub reports incomplete results", async () => {
    connected();
    mockSearch.mockResolvedValue({ total: 4, incomplete: true });
    const r = await githubAnalyticsSource.query(
      { metricKey: "prs_opened", range: RANGE, filters: REPO_FILTER },
      CTX,
    );
    expect(r.warnings.some((w) => /incomplete/i.test(w))).toBe(true);
  });
});

describe("error normalization (typed, no page crash)", () => {
  it("maps a 401 to MISSING_CREDENTIAL (GitHub is non-refreshable)", async () => {
    connected();
    mockSearch.mockRejectedValue(new Unauthorized401Error("401"));
    await expect(
      githubAnalyticsSource.query({ metricKey: "open_issues", range: RANGE, filters: REPO_FILTER }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("maps a rate-limit error to RATE_LIMITED", async () => {
    connected();
    mockSearch.mockRejectedValue(new Error("GitHub GET /search/issues failed: API rate limit exceeded"));
    await expect(
      githubAnalyticsSource.query({ metricKey: "open_issues", range: RANGE, filters: REPO_FILTER }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps an unexpected provider error to PROVIDER_ERROR with no raw leak", async () => {
    connected();
    mockSearch.mockRejectedValue(new Error("secret-internal-detail token=abc"));
    const err = await githubAnalyticsSource
      .query({ metricKey: "open_issues", range: RANGE, filters: REPO_FILTER }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal-detail|token=abc/);
  });
});
