/**
 * @jest-environment node
 *
 * Microsoft Outlook mail analytics adapter (Slice ANALYTICS-SOURCES-OUTLOOK-1):
 * per-viewer personal credential resolution (refreshable → refreshAndRetry),
 * privacy-safe count-only metrics (no body/preview/subject/sender ever read),
 * server-owned Graph $filters, and typed, leak-free error normalization. No
 * network/DB — the credential repo, refreshAndRetry, and the bounded counter are
 * mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockCount = jest.fn();
jest.mock("@/services/analytics/sources/microsoft-outlook/api", () => ({
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

import { microsoftOutlookAnalyticsSource } from "@/services/analytics/sources/microsoft-outlook";
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
  mockGetIntegration.mockResolvedValue({ providerAccountId: "user-1@outlook.com" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockCount.mockResolvedValue({ count: 0, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(microsoftOutlookAnalyticsSource.providerKey).toBe("microsoft-outlook");
    expect(microsoftOutlookAnalyticsSource.connectedApp).toBe(true);
    expect(microsoftOutlookAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "emails_received_over_time",
      "emails_sent_over_time",
      "folder_message_count",
      "unread_count",
    ]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "read_bodies", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects folder_message_count without a folder before any I/O", async () => {
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "folder_message_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (personal — viewer's own)", () => {
  it("pins to ctx.userId and refreshAndRetry uses that row's providerAccountId", async () => {
    await microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "microsoft-outlook", null, {
      connectedByUserId: "user-1",
    });
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "microsoft-outlook",
      providerAccountId: "user-1@outlook.com",
    });
  });

  it("returns MISSING_CREDENTIAL when the viewer has no Outlook connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("metrics (count-only, server-owned Graph queries)", () => {
  it("unread_count counts unread in the inbox folder, current state", async () => {
    mockCount.mockResolvedValue({ count: 9, truncated: false });
    const r = await microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ unread_count: 9 });
    const arg = mockCount.mock.calls[0]![1];
    expect(arg.folder).toBe("inbox");
    expect(arg.filter).toBe("isRead eq false");
  });

  it("folder_message_count counts the selected folder over the window", async () => {
    mockCount.mockResolvedValue({ count: 4, truncated: false });
    const r = await microsoftOutlookAnalyticsSource.query(
      { metricKey: "folder_message_count", range: RANGE, filters: { folder: "AQMkAD123" } },
      CTX,
    );
    expect(r.totals).toEqual({ folder_message_count: 4 });
    const arg = mockCount.mock.calls[0]![1];
    expect(arg.folder).toBe("AQMkAD123");
    expect(arg.filter).toContain("receivedDateTime ge 2026-06-01");
  });

  it("rejects an obviously malformed folder id (defense-in-depth)", async () => {
    await expect(
      microsoftOutlookAnalyticsSource.query(
        { metricKey: "folder_message_count", range: RANGE, filters: { folder: "bad id; drop" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("emails_received_over_time runs one inbox received-count per bucket", async () => {
    mockCount
      .mockResolvedValueOnce({ count: 3, truncated: false })
      .mockResolvedValueOnce({ count: 5, truncated: false })
      .mockResolvedValueOnce({ count: 1, truncated: false })
      .mockResolvedValueOnce({ count: 0, truncated: false });
    const r = await microsoftOutlookAnalyticsSource.query(
      { metricKey: "emails_received_over_time", range: RANGE },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.totals?.count).toBe(9);
    expect(mockCount).toHaveBeenCalledTimes(4);
    expect(mockCount.mock.calls[0]![1].folder).toBe("inbox");
    expect(mockCount.mock.calls[0]![1].filter).toContain("receivedDateTime ge");
  });

  it("emails_sent_over_time counts the sentitems folder by sentDateTime", async () => {
    mockCount.mockResolvedValue({ count: 2, truncated: false });
    await microsoftOutlookAnalyticsSource.query({ metricKey: "emails_sent_over_time", range: RANGE }, CTX);
    expect(mockCount.mock.calls[0]![1].folder).toBe("sentitems");
    expect(mockCount.mock.calls[0]![1].filter).toContain("sentDateTime ge");
  });

  it("surfaces a truncation warning when a count was capped", async () => {
    mockCount.mockResolvedValue({ count: 1000, truncated: true });
    const r = await microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces sensitive email detail — only counts + date labels", async () => {
    mockCount.mockResolvedValue({ count: 7, truncated: false });
    const r = await microsoftOutlookAnalyticsSource.query(
      { metricKey: "emails_received_over_time", range: RANGE },
      CTX,
    );
    expect(JSON.stringify(r)).not.toMatch(/subject|preview|body|from|toRecipients|@|webLink|bodyPreview/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "microsoft-outlook",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockCount.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a throttling error → RATE_LIMITED", async () => {
    mockCount.mockRejectedValueOnce(new Error("Microsoft Graph GET messages failed: 429 Too Many Requests"));
    await expect(
      microsoftOutlookAnalyticsSource.query({ metricKey: "unread_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockCount.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await microsoftOutlookAnalyticsSource
      .query({ metricKey: "unread_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
