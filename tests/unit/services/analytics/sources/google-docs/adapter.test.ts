/**
 * @jest-environment node
 *
 * Google Docs analytics adapter (Slice ANALYTICS-SOURCES-GWORKSPACE-1), which exercises
 * the shared Google Workspace adapter factory: per-viewer personal credential
 * resolution (refreshable → refreshAndRetry), count-only + metadata-only metrics
 * (document count + created/modified over time — only createdMs/modifiedMs read; never
 * file name/content/owner/permission), and typed, leak-free error normalization. No
 * network/DB — the credential repo, refreshAndRetry, and the bounded reader are mocked.
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

import { googleDocsAnalyticsSource } from "@/services/analytics/sources/google-docs";
import { GoogleWorkspaceRateLimitError } from "@/services/analytics/sources/_shared/googleWorkspaceFiles";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const ms = (iso: string) => Date.parse(iso);

const FACTS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), modifiedMs: ms("2026-06-02T09:00:00Z") },
  { createdMs: ms("2026-06-01T11:00:00Z"), modifiedMs: ms("2026-06-02T10:00:00Z") },
  { createdMs: ms("2026-06-03T09:00:00Z"), modifiedMs: ms("2026-06-03T09:00:00Z") },
  { createdMs: ms("2026-05-15T09:00:00Z"), modifiedMs: ms("2026-05-16T09:00:00Z") }, // out of range
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({
    providerAccountId: "gd-user-1",
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: FACTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes the approved doc metrics with no filters", () => {
    expect(googleDocsAnalyticsSource.providerKey).toBe("google-docs");
    expect(googleDocsAnalyticsSource.connectedApp).toBe(true);
    expect(googleDocsAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "documents_count",
      "documents_created_over_time",
      "documents_modified_over_time",
    ]);
    for (const m of googleDocsAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });
});

describe("validation + credential resolution", () => {
  it("rejects an unknown metric (no I/O)", async () => {
    await expect(
      googleDocsAnalyticsSource.query({ metricKey: "read_document", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("pins to ctx.userId, scans the Docs MIME type, and uses that row's providerAccountId", async () => {
    await googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "google-docs", null, { connectedByUserId: "user-1" });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "google-docs",
      providerAccountId: "gd-user-1",
    });
    expect(mockScan.mock.calls[0]![1]).toBe("application/vnd.google-apps.document");
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Google Docs connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("metrics", () => {
  it("documents_count counts all files", async () => {
    const r = await googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ documents_count: 4 });
  });

  it("documents_modified_over_time buckets by modifiedMs (out-of-range excluded)", async () => {
    const r = await googleDocsAnalyticsSource.query({ metricKey: "documents_modified_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([0, 2, 1, 0]); // 06-02 x2, 06-03 x1 (05-16 out)
    expect(r.totals?.count).toBe(3);
  });

  it("documents_created_over_time buckets by createdMs (out-of-range excluded)", async () => {
    const r = await googleDocsAnalyticsSource.query({ metricKey: "documents_created_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([2, 0, 1, 0]); // 06-01 x2, 06-03 x1 (05-15 out)
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the scan hit its budget", async () => {
    mockScan.mockResolvedValue({ facts: FACTS, truncated: true });
    const r = await googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces a file name / owner / permission / content", async () => {
    const r = await googleDocsAnalyticsSource.query({ metricKey: "documents_modified_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/\bname\b|owner|permission|content|webviewlink|email/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "google-docs",
        providerAccountId: "gd-user-1",
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new GoogleWorkspaceRateLimitError("rate-limited"));
    await expect(
      googleDocsAnalyticsSource.query({ metricKey: "documents_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await googleDocsAnalyticsSource
      .query({ metricKey: "documents_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
