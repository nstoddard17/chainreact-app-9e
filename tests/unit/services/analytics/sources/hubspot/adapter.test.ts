/**
 * @jest-environment node
 *
 * HubSpot analytics adapter (Slice ANALYTICS-SOURCES-HUBSPOT-1): account-shared
 * credential resolution (refreshable → refreshAndRetry, no per-user pin), strictly
 * count-only CRM metrics (open/closed-won deal scalars + created-over-time series via
 * Search `total` — never a CRM record's properties), and typed, leak-free error
 * normalization. No network/DB — the credential repo, refreshAndRetry, and the
 * count-only reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockSearchTotal = jest.fn();
const mockFetchStages = jest.fn();
jest.mock("@/services/analytics/sources/hubspot/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/hubspot/api");
  return {
    ...actual,
    searchTotal: (...args: unknown[]) => mockSearchTotal(...args),
    fetchDealStages: (...args: unknown[]) => mockFetchStages(...args),
  };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { hubspotAnalyticsSource } from "@/services/analytics/sources/hubspot";
import { HubSpotRateLimitError } from "@/services/analytics/sources/hubspot/api";
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
  mockGetIntegration.mockResolvedValue({ providerAccountId: null, accessTokenEncrypted: "enc" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockSearchTotal.mockResolvedValue(0);
  mockFetchStages.mockResolvedValue([
    { id: "appointmentscheduled", label: "Appointment scheduled" },
    { id: "closedwon", label: "Closed won" },
  ]);
});

describe("metric registration", () => {
  it("exposes the approved metric set; only deals_by_stage takes a pipeline filter", () => {
    expect(hubspotAnalyticsSource.providerKey).toBe("hubspot");
    expect(hubspotAnalyticsSource.connectedApp).toBe(true);
    expect(hubspotAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "closed_won_deals_count",
      "companies_created_over_time",
      "contacts_created_over_time",
      "deals_by_stage",
      "deals_created_over_time",
      "open_deals_count",
      "tickets_created_over_time",
    ]);
    const byKey = Object.fromEntries(hubspotAnalyticsSource.metrics.map((m) => [m.key, m.supportedFilters]));
    expect(byKey.deals_by_stage).toEqual(["hubspot_pipeline"]);
    for (const m of hubspotAnalyticsSource.metrics) {
      if (m.key !== "deals_by_stage") expect(m.supportedFilters).toEqual([]);
    }
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric before any credential lookup", async () => {
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "read_contact_emails", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
    expect(mockSearchTotal).not.toHaveBeenCalled();
  });
});

describe("credential resolution (account-shared — no per-user pin)", () => {
  it("resolves the account's HubSpot connection and runs reads through refreshAndRetry", async () => {
    await hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX);
    // Account-shared: getActiveForExecution called WITHOUT a connectedByUserId pin.
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "hubspot", null);
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "hubspot",
      providerAccountId: null,
    });
  });

  it("returns MISSING_CREDENTIAL when the account has no HubSpot connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockSearchTotal).not.toHaveBeenCalled();
  });
});

describe("scalar metrics (Search total, no record data)", () => {
  it("open_deals_count counts deals with hs_is_closed = false", async () => {
    mockSearchTotal.mockResolvedValue(12);
    const r = await hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("scalar");
    expect(r.totals).toEqual({ open_deals_count: 12 });
    expect(mockSearchTotal).toHaveBeenCalledTimes(1);
    expect(mockSearchTotal.mock.calls[0]![0]).toMatchObject({
      objectType: "deals",
      filters: [{ propertyName: "hs_is_closed", operator: "EQ", value: "false" }],
    });
  });

  it("closed_won_deals_count counts deals with hs_is_closed_won = true", async () => {
    mockSearchTotal.mockResolvedValue(5);
    const r = await hubspotAnalyticsSource.query({ metricKey: "closed_won_deals_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ closed_won_deals_count: 5 });
    expect(mockSearchTotal.mock.calls[0]![0]).toMatchObject({
      objectType: "deals",
      filters: [{ propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }],
    });
  });
});

describe("series metrics (per-bucket created-date counts)", () => {
  it("contacts_created_over_time issues one createdate-window count per bucket", async () => {
    mockSearchTotal
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    const r = await hubspotAnalyticsSource.query(
      { metricKey: "contacts_created_over_time", range: RANGE },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4); // 4 day-buckets
    expect(r.rows.map((row) => row.count)).toEqual([2, 0, 1, 3]);
    expect(r.totals?.count).toBe(6);
    expect(mockSearchTotal).toHaveBeenCalledTimes(4);
    // Every call targets `contacts` and carries a bounded createdate window.
    for (const call of mockSearchTotal.mock.calls) {
      expect(call[0].objectType).toBe("contacts");
      const props = (call[0].filters as Array<{ propertyName: string }>).map((f) => f.propertyName);
      expect(props).toEqual(["createdate", "createdate"]);
    }
  });

  it("maps each series metric to its CRM object type", async () => {
    const cases: Array<[string, string]> = [
      ["deals_created_over_time", "deals"],
      ["companies_created_over_time", "companies"],
      ["tickets_created_over_time", "tickets"],
    ];
    for (const [metricKey, objectType] of cases) {
      mockSearchTotal.mockClear();
      mockSearchTotal.mockResolvedValue(1);
      await hubspotAnalyticsSource.query({ metricKey, range: RANGE }, CTX);
      for (const call of mockSearchTotal.mock.calls) expect(call[0].objectType).toBe(objectType);
    }
  });

  it("returns an empty series with a warning for an empty/invalid range (no I/O)", async () => {
    const r = await hubspotAnalyticsSource.query(
      { metricKey: "deals_created_over_time", range: { since: "2026-06-04T00:00:00Z", until: "2026-06-01T00:00:00Z" } },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(mockSearchTotal).not.toHaveBeenCalled();
  });

  it("never surfaces CRM record content — only date buckets + counts", async () => {
    mockSearchTotal.mockResolvedValue(4);
    const r = await hubspotAnalyticsSource.query({ metricKey: "deals_created_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/email|phone|dealname|amount|company|owner|associat|\bname\b/i);
  });
});

describe("deals_by_stage (pipeline-health bar)", () => {
  const withPipeline = (extra: Record<string, string> = {}) => ({ hubspot_pipeline: "default", ...extra });

  it("rejects a missing / malformed pipeline id before any I/O", async () => {
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "deals_by_stage", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "deals_by_stage", range: RANGE, filters: { hubspot_pipeline: "bad id!" } }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
    expect(mockFetchStages).not.toHaveBeenCalled();
  });

  it("counts deals per stage and labels rows with the stage label only", async () => {
    mockSearchTotal.mockResolvedValueOnce(9).mockResolvedValueOnce(4);
    const r = await hubspotAnalyticsSource.query(
      { metricKey: "deals_by_stage", range: RANGE, filters: withPipeline() },
      CTX,
    );
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.shape).toBe("series");
    expect(r.rows).toEqual([
      { date: "Appointment scheduled", count: 9 },
      { date: "Closed won", count: 4 },
    ]);
    expect(r.totals?.count).toBe(13);
    expect(mockFetchStages.mock.calls[0]![1]).toBe("default");
    // One Search per stage, each scoped to (pipeline, dealstage) — no record fields.
    expect(mockSearchTotal).toHaveBeenCalledTimes(2);
    for (const call of mockSearchTotal.mock.calls) {
      expect(call[0].objectType).toBe("deals");
      const props = (call[0].filters as Array<{ propertyName: string }>).map((f) => f.propertyName).sort();
      expect(props).toEqual(["dealstage", "pipeline"]);
    }
  });

  it("an unknown / empty pipeline → safe INVALID_QUERY config error (no blank widget)", async () => {
    mockFetchStages.mockResolvedValue([]);
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "deals_by_stage", range: RANGE, filters: withPipeline() }, CTX),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockSearchTotal).not.toHaveBeenCalled();
  });

  it("never surfaces CRM record content — only stage labels + counts", async () => {
    mockSearchTotal.mockResolvedValue(3);
    const r = await hubspotAnalyticsSource.query(
      { metricKey: "deals_by_stage", range: RANGE, filters: withPipeline() },
      CTX,
    );
    expect(JSON.stringify(r)).not.toMatch(/email|phone|dealname|amount|owner|associat|contact|\bname\b/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "hubspot",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockSearchTotal.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockSearchTotal.mockRejectedValueOnce(new HubSpotRateLimitError("rate-limited"));
    await expect(
      hubspotAnalyticsSource.query({ metricKey: "open_deals_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockSearchTotal.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await hubspotAnalyticsSource
      .query({ metricKey: "open_deals_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
