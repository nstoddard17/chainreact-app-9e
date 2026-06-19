/**
 * @jest-environment node
 *
 * Gmail analytics adapter (Slice ANALYTICS-SOURCES-GMAIL-1): per-viewer personal
 * credential resolution (refreshable → refreshAndRetry), privacy-safe count-only
 * metrics (no body/subject/sender ever read), server-owned queries, and typed,
 * leak-free error normalization. No network/DB — the credential repo,
 * refreshAndRetry, and the bounded counter are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockCount = jest.fn();
jest.mock("@/services/analytics/sources/gmail/api", () => ({
  __esModule: true,
  countMessages: (...args: unknown[]) => mockCount(...args),
  PAGE_SIZE: 100,
  SCALAR_MAX_PAGES: 10,
  SERIES_BUCKET_MAX_PAGES: 3,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { gmailAnalyticsSource } from "@/services/analytics/sources/gmail";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "user-1@example.com" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockCount.mockResolvedValue({ count: 0, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(gmailAnalyticsSource.providerKey).toBe("gmail");
    expect(gmailAnalyticsSource.connectedApp).toBe(true);
    expect(gmailAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
      "label_message_count",
      "unread_count",
    ]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      gmailAnalyticsSource.query({ metricKey: "read_bodies", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects label_message_count without a label before any I/O", async () => {
    await expect(
      gmailAnalyticsSource.query({ metricKey: "label_message_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "gmail", null, {
      connectedByUserId: "user-1",
    });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "gmail",
      providerAccountId: "user-1@example.com",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Gmail connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("metrics (count-only, server-owned queries)", () => {
  it("unread_count uses the current-state unread query", async () => {
    mockCount.mockResolvedValue({ count: 12, truncated: false });
    const r = await gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ unread_count: 12 });
    expect(mockCount).toHaveBeenCalledWith("tok", expect.objectContaining({ q: "is:unread in:inbox" }));
  });

  it("label_message_count counts by labelIds + the date window", async () => {
    mockCount.mockResolvedValue({ count: 4, truncated: false });
    const r = await gmailAnalyticsSource.query(
      { metricKey: "label_message_count", range: RANGE, filters: { label: "Label_7" } },
      CTX,
    );
    expect(r.totals).toEqual({ label_message_count: 4 });
    const arg = mockCount.mock.calls[0]![1];
    expect(arg.labelIds).toEqual(["Label_7"]);
    expect(arg.q).toContain("after:2026/06/01");
  });

  it("emails_received_over_time runs one received-base count per bucket", async () => {
    mockCount
      .mockResolvedValueOnce({ count: 3, truncated: false })
      .mockResolvedValueOnce({ count: 5, truncated: false })
      .mockResolvedValueOnce({ count: 1, truncated: false })
      .mockResolvedValueOnce({ count: 0, truncated: false });
    const r = await gmailAnalyticsSource.query(
      { metricKey: "emails_received_over_time", range: RANGE },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.totals?.count).toBe(9);
    expect(mockCount).toHaveBeenCalledTimes(4);
    expect(mockCount.mock.calls[0]![1].q).toContain("-in:sent");
  });

  it("emails_sent_over_time uses the in:sent base", async () => {
    mockCount.mockResolvedValue({ count: 2, truncated: false });
    await gmailAnalyticsSource.query({ metricKey: "emails_sent_over_time", range: RANGE }, CTX);
    expect(mockCount.mock.calls[0]![1].q).toContain("in:sent");
  });

  it("surfaces a truncation warning when a count was capped", async () => {
    mockCount.mockResolvedValue({ count: 1000, truncated: true });
    const r = await gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces sensitive email detail — only counts + date labels", async () => {
    mockCount.mockResolvedValue({ count: 7, truncated: false });
    const r = await gmailAnalyticsSource.query(
      { metricKey: "emails_received_over_time", range: RANGE },
      CTX,
    );
    expect(JSON.stringify(r)).not.toMatch(/subject|snippet|body|from:|to:|@|threadId/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "gmail",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockCount.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockCount.mockRejectedValueOnce(new Error("messages.list failed: User Rate Limit Exceeded"));
    await expect(
      gmailAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockCount.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await gmailAnalyticsSource
      .query({ metricKey: "unread_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
