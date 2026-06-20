/**
 * @jest-environment node
 *
 * Mailchimp analytics adapter (Slice ANALYTICS-SOURCES-MAILCHIMP-1): account-shared
 * credential + datacenter resolution (non-refreshable → refreshAndRetry, no per-user
 * pin), count-only marketing metrics (audience member count + sent-campaign count /
 * over time — never subscriber/campaign content), audience validation before I/O, and
 * typed, leak-free error normalization. No network/DB — the credential repo,
 * refreshAndRetry, and the aggregate readers are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockMemberCount = jest.fn();
const mockScanCampaigns = jest.fn();
jest.mock("@/services/analytics/sources/mailchimp/api", () => ({
  __esModule: true,
  fetchAudienceMemberCount: (...args: unknown[]) => mockMemberCount(...args),
  scanSentCampaigns: (...args: unknown[]) => mockScanCampaigns(...args),
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { mailchimpAnalyticsSource } from "@/services/analytics/sources/mailchimp";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const AUDIENCE = "a1b2c3d4e5";
const ms = (iso: string) => Date.parse(iso);
const aud = (extra: Record<string, string> = {}) => ({ mailchimp_audience: AUDIENCE, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "mc-acc", accountMetadata: { dc: "us21" } });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockMemberCount.mockResolvedValue(42);
  mockScanCampaigns.mockResolvedValue({ sendMs: [ms("2026-06-01T09:00:00Z"), ms("2026-06-02T09:00:00Z"), ms("2026-06-02T12:00:00Z")], total: 3, truncated: false });
});

describe("metric registration", () => {
  it("exposes the approved metric set; only audience_member_count takes an audience filter", () => {
    expect(mailchimpAnalyticsSource.providerKey).toBe("mailchimp");
    expect(mailchimpAnalyticsSource.connectedApp).toBe(true);
    expect(mailchimpAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "audience_member_count",
      "campaign_count",
      "campaigns_sent_over_time",
    ]);
    const byKey = Object.fromEntries(mailchimpAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.audience_member_count).toEqual(["mailchimp_audience"]);
    expect(byKey.campaign_count).toEqual([]);
    expect(byKey.campaigns_sent_over_time).toEqual([]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "list_subscriber_emails", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects a missing / malformed audience id before any I/O", async () => {
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "audience_member_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "audience_member_count", range: RANGE, filters: { mailchimp_audience: "bad id!" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential + datacenter resolution (account-shared)", () => {
  it("resolves the account's Mailchimp connection + dc and runs reads through refreshAndRetry", async () => {
    await mailchimpAnalyticsSource.query({ metricKey: "audience_member_count", range: RANGE, filters: aud() }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "mailchimp", null);
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "mailchimp",
      providerAccountId: "mc-acc",
    });
    expect(mockMemberCount.mock.calls[0]).toEqual(["tok", "us21", AUDIENCE]);
  });

  it("returns MISSING_CREDENTIAL when there is no Mailchimp connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScanCampaigns).not.toHaveBeenCalled();
  });

  it("returns MISSING_CREDENTIAL when the datacenter is missing", async () => {
    mockGetIntegration.mockResolvedValue({ providerAccountId: "mc-acc", accountMetadata: {} });
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });
});

describe("metrics", () => {
  it("audience_member_count returns the audience's current member count", async () => {
    const r = await mailchimpAnalyticsSource.query({ metricKey: "audience_member_count", range: RANGE, filters: aud() }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ audience_member_count: 42 });
    expect(mockScanCampaigns).not.toHaveBeenCalled();
  });

  it("campaign_count returns the exact sent-campaign total (from total_items)", async () => {
    mockScanCampaigns.mockResolvedValue({ sendMs: [ms("2026-06-01T09:00:00Z")], total: 7, truncated: true });
    const r = await mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ campaign_count: 7 }); // exact total, not the scanned length
  });

  it("campaigns_sent_over_time buckets sent campaigns by send_time", async () => {
    const r = await mailchimpAnalyticsSource.query({ metricKey: "campaigns_sent_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([1, 2, 0, 0]); // 06-01 ×1, 06-02 ×2
    expect(r.totals?.count).toBe(3);
  });

  it("surfaces a truncation warning when the campaign scan hit the cap", async () => {
    mockScanCampaigns.mockResolvedValue({ sendMs: [ms("2026-06-01T09:00:00Z")], total: 999, truncated: true });
    const r = await mailchimpAnalyticsSource.query({ metricKey: "campaigns_sent_over_time", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces subscriber / campaign content — only counts + dates", async () => {
    const r = await mailchimpAnalyticsSource.query({ metricKey: "campaigns_sent_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/email|subject|merge|segment|subscriber|recipient|@|"id"/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "mailchimp",
        providerAccountId: "mc-acc",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScanCampaigns.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a missing audience NotFoundError → INVALID_QUERY (user-fixable)", async () => {
    mockMemberCount.mockRejectedValueOnce(new NotFoundError("audience", "not found"));
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "audience_member_count", range: RANGE, filters: aud() }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockScanCampaigns.mockRejectedValueOnce(new Error("Mailchimp GET /campaigns failed: Too Many Requests"));
    await expect(
      mailchimpAnalyticsSource.query({ metricKey: "campaign_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScanCampaigns.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await mailchimpAnalyticsSource
      .query({ metricKey: "campaign_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
