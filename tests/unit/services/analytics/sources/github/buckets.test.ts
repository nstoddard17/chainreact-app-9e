import {
  MAX_BUCKETS,
  planBuckets,
  parseRepoRef,
  seriesSearchQuery,
  openCountSearchQuery,
} from "@/services/analytics/sources/github/buckets";

/**
 * Pure GitHub bucketing + query construction (Slice ANALYTICS-SOURCES-GITHUB-1).
 */

const day = 86_400_000;
const base = Date.parse("2026-06-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("planBuckets", () => {
  it("uses daily granularity for short windows", () => {
    const b = planBuckets(iso(base), iso(base + 6 * day));
    expect(b.length).toBe(7);
    expect(b[0]?.sinceDate).toBe("2026-06-01");
    expect(b[0]?.untilDate).toBe("2026-06-01");
    expect(b[6]?.sinceDate).toBe("2026-06-07");
  });

  it("never exceeds the bucket cap, even for a year", () => {
    const b = planBuckets(iso(base), iso(base + 365 * day));
    expect(b.length).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(b.length).toBeGreaterThan(0);
    // Contiguous + covers the whole span.
    expect(b[0]?.sinceDate).toBe("2026-06-01");
  });

  it("returns [] for an invalid/empty window", () => {
    expect(planBuckets("nope", "worse")).toEqual([]);
    expect(planBuckets(iso(base), iso(base))).toEqual([]);
    expect(planBuckets(iso(base + day), iso(base))).toEqual([]);
  });
});

describe("parseRepoRef", () => {
  it("accepts a valid owner/name", () => {
    expect(parseRepoRef("octocat/hello-world").full).toBe("octocat/hello-world");
  });

  it("rejects injection / malformed values", () => {
    for (const bad of [
      undefined,
      "",
      "no-slash",
      "a/b/c",
      "owner/name with space",
      "owner/name created:2020", // search-qualifier injection
      "../../etc",
      123 as unknown,
    ]) {
      expect(() => parseRepoRef(bad)).toThrow();
    }
  });
});

describe("search query construction", () => {
  const repo = parseRepoRef("octocat/hello");
  const bucket = { key: "2026-06-01", sinceDate: "2026-06-01", untilDate: "2026-06-07" };

  it("builds series queries scoped to the repo + date range", () => {
    expect(seriesSearchQuery("issues_opened", repo, bucket)).toBe(
      "repo:octocat/hello is:issue created:2026-06-01..2026-06-07",
    );
    expect(seriesSearchQuery("prs_opened", repo, bucket)).toBe(
      "repo:octocat/hello is:pr created:2026-06-01..2026-06-07",
    );
    expect(seriesSearchQuery("prs_merged", repo, bucket)).toBe(
      "repo:octocat/hello is:pr is:merged merged:2026-06-01..2026-06-07",
    );
  });

  it("builds open-count queries", () => {
    expect(openCountSearchQuery("open_issues", repo)).toBe("repo:octocat/hello is:issue is:open");
    expect(openCountSearchQuery("open_prs", repo)).toBe("repo:octocat/hello is:pr is:open");
  });
});
