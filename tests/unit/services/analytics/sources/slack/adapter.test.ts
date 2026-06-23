/**
 * @jest-environment node
 *
 * Slack analytics adapter (Slice ANALYTICS-SOURCES-SLACK-1): account-shared
 * credential resolution (NO per-user pin), bounded-history aggregation, and typed,
 * leak-free error normalization. No network or DB — the credential repo, token
 * decrypt, and the bounded history reader are mocked.
 */

jest.mock("@/repositories/integrations", () => ({ getActiveForExecution: jest.fn() }));
jest.mock("@/core/encryption/tokens", () => ({ decryptToken: jest.fn(() => ["xoxb", "token"].join("-")) }));
jest.mock("@/services/analytics/sources/slack/api", () => ({
  fetchChannelHistory: jest.fn(),
  MAX_MESSAGES: 2000,
}));

import { slackAnalyticsSource } from "@/services/analytics/sources/slack";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import { SlackApiError } from "@/integrations/slack/api/errors";
import { getActiveForExecution } from "@/repositories/integrations";
import { fetchChannelHistory } from "@/services/analytics/sources/slack/api";

const mockGetIntegration = getActiveForExecution as jest.MockedFunction<typeof getActiveForExecution>;
const mockFetch = fetchChannelHistory as jest.MockedFunction<typeof fetchChannelHistory>;

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-03T00:00:00Z" };
const CHANNEL = { channel: "C012AB3CD" };

function ts(iso: string): string {
  return `${Math.floor(Date.parse(iso) / 1000)}.000100`;
}

function connected() {
  mockGetIntegration.mockResolvedValue({ accessTokenEncrypted: "enc" } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ messages: [], truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only metric set", () => {
    expect(slackAnalyticsSource.providerKey).toBe("slack");
    expect(slackAnalyticsSource.connectedApp).toBe(true);
    expect(slackAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual(
      ["active_users_count", "channel_activity_count", "keyword_mentions", "messages_over_time"],
    );
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      slackAnalyticsSource.query({ metricKey: "delete_channel", range: RANGE, filters: CHANNEL }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing/invalid channel before resolving credentials", async () => {
    await expect(
      slackAnalyticsSource.query({ metricKey: "channel_activity_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects keyword_mentions without a keyword before any I/O", async () => {
    await expect(
      slackAnalyticsSource.query({ metricKey: "keyword_mentions", range: RANGE, filters: CHANNEL }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (account-shared — NO per-user pin)", () => {
  it("resolves the account's Slack token without a connectedByUserId pin", async () => {
    connected();
    await slackAnalyticsSource.query(
      { metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL },
      CTX,
    );
    const call = mockGetIntegration.mock.calls[0]!;
    expect(call[0]).toBe("acct-1");
    expect(call[1]).toBe("slack");
    expect(call[2]).toBeNull();
    // No 4th-arg user pin — Slack is account-shared (cross-member visible).
    expect(call[3]).toBeUndefined();
  });

  it("returns MISSING_CREDENTIAL when the account has no Slack connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      slackAnalyticsSource.query({ metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("scalar metrics", () => {
  it("channel_activity_count counts content messages (excludes system subtypes)", async () => {
    connected();
    mockFetch.mockResolvedValue({
      messages: [
        { ts: ts("2026-06-01T10:00:00Z"), user: "U1", text: "hi" },
        { ts: ts("2026-06-02T10:00:00Z"), user: "U2", text: "yo" },
        { ts: ts("2026-06-02T11:00:00Z"), user: "U1", subtype: "channel_join" }, // excluded
      ],
      truncated: false,
    });
    const r = await slackAnalyticsSource.query(
      { metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ channel_activity_count: 2 });
  });

  it("active_users_count counts distinct posters", async () => {
    connected();
    mockFetch.mockResolvedValue({
      messages: [
        { ts: ts("2026-06-01T10:00:00Z"), user: "U1", text: "a" },
        { ts: ts("2026-06-01T11:00:00Z"), user: "U1", text: "b" },
        { ts: ts("2026-06-02T10:00:00Z"), user: "U2", text: "c" },
        { ts: ts("2026-06-02T12:00:00Z"), text: "no-user-system" },
      ],
      truncated: false,
    });
    const r = await slackAnalyticsSource.query(
      { metricKey: "active_users_count", range: RANGE, filters: CHANNEL },
      CTX,
    );
    expect(r.totals).toEqual({ active_users_count: 2 });
  });
});

describe("series metrics", () => {
  it("messages_over_time buckets messages by day and sums totals", async () => {
    connected();
    mockFetch.mockResolvedValue({
      messages: [
        { ts: ts("2026-06-01T10:00:00Z"), user: "U1", text: "a" },
        { ts: ts("2026-06-02T10:00:00Z"), user: "U2", text: "b" },
        { ts: ts("2026-06-02T14:00:00Z"), user: "U1", text: "c" },
      ],
      truncated: false,
    });
    const r = await slackAnalyticsSource.query(
      { metricKey: "messages_over_time", range: RANGE, filters: CHANNEL },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.rows.length).toBe(3); // 06-01, 06-02, 06-03
    expect(r.totals?.count).toBe(3);
    expect(r.rows.find((row) => row.date === "2026-06-02")?.count).toBe(2);
  });

  it("keyword_mentions counts ONLY messages containing the keyword (case-insensitive)", async () => {
    connected();
    mockFetch.mockResolvedValue({
      messages: [
        { ts: ts("2026-06-01T10:00:00Z"), user: "U1", text: "Big LAUNCH today" },
        { ts: ts("2026-06-01T11:00:00Z"), user: "U2", text: "unrelated" },
        { ts: ts("2026-06-02T10:00:00Z"), user: "U2", text: "launch again" },
      ],
      truncated: false,
    });
    const r = await slackAnalyticsSource.query(
      { metricKey: "keyword_mentions", range: RANGE, filters: { ...CHANNEL, keyword: "launch" } },
      CTX,
    );
    expect(r.totals?.count).toBe(2);
  });

  it("surfaces a truncation warning when the channel had more than the cap", async () => {
    connected();
    mockFetch.mockResolvedValue({
      messages: [{ ts: ts("2026-06-01T10:00:00Z"), user: "U1", text: "a" }],
      truncated: true,
    });
    const r = await slackAnalyticsSource.query(
      { metricKey: "messages_over_time", range: RANGE, filters: CHANNEL },
      CTX,
    );
    expect(r.truncated).toBe(true);
    expect(r.warnings.some((w) => /most recent/i.test(w))).toBe(true);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("maps a Slack auth error to MISSING_CREDENTIAL (non-refreshable bot token)", async () => {
    connected();
    mockFetch.mockRejectedValue(new SlackApiError("invalid_auth"));
    await expect(
      slackAnalyticsSource.query({ metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("maps ratelimited to RATE_LIMITED", async () => {
    connected();
    mockFetch.mockRejectedValue(new SlackApiError("ratelimited"));
    await expect(
      slackAnalyticsSource.query({ metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps not_in_channel to a clear PROVIDER_ERROR without echoing the raw code", async () => {
    connected();
    mockFetch.mockRejectedValue(new SlackApiError("not_in_channel"));
    const err = await slackAnalyticsSource
      .query({ metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/not_in_channel/);
  });

  it("maps an unexpected error to PROVIDER_ERROR with no raw leak", async () => {
    connected();
    mockFetch.mockRejectedValue(new Error("secret-internal token=abc123"));
    const err = await slackAnalyticsSource
      .query({ metricKey: "channel_activity_count", range: RANGE, filters: CHANNEL }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
