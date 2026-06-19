/**
 * @jest-environment node
 *
 * Stripe analytics adapter (Slice ANALYTICS-SOURCES-STRIPE-1): account-shared
 * credential resolution (NO per-user pin), refreshable → refreshAndRetry,
 * privacy-safe count/volume-only metrics (no customer/description/charge id ever
 * read or returned), single-dominant-currency volume, and typed, leak-free error
 * normalization. No network/DB — the credential repo, refreshAndRetry, and the
 * bounded scanner are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/stripe/api", () => ({
  __esModule: true,
  scanChargesWindow: (...args: unknown[]) => mockScan(...args),
  PAGE_SIZE: 100,
  MAX_PAGES: 20,
}));

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { stripeAnalyticsSource } from "@/services/analytics/sources/stripe";
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

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const FACTS = [
  { created: sec("2026-06-01T12:00:00Z"), status: "succeeded", amount: 1000, currency: "usd" },
  { created: sec("2026-06-02T12:00:00Z"), status: "succeeded", amount: 2000, currency: "usd" },
  { created: sec("2026-06-01T15:00:00Z"), status: "succeeded", amount: 500, currency: "eur" },
  { created: sec("2026-06-01T16:00:00Z"), status: "failed", amount: 999, currency: "usd" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "acct_stripe_123" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: FACTS, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved read-only payment metric set", () => {
    expect(stripeAnalyticsSource.providerKey).toBe("stripe");
    expect(stripeAnalyticsSource.connectedApp).toBe(true);
    expect(stripeAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "failed_payment_count",
      "gross_payment_volume",
      "gross_volume_over_time",
      "successful_payment_count",
      "successful_payments_over_time",
    ]);
    for (const m of stripeAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });
});

describe("validation (no I/O before it passes)", () => {
  it("rejects an unknown metric before resolving any credential", async () => {
    await expect(
      stripeAnalyticsSource.query({ metricKey: "list_customers", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range", async () => {
    await expect(
      stripeAnalyticsSource.query(
        { metricKey: "successful_payment_count", range: { since: RANGE.until, until: RANGE.since } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });
});

describe("credential resolution (account-shared — no per-user pin)", () => {
  it("resolves the account's Stripe row with NO connectedByUserId and pins refresh to it", async () => {
    await stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX);
    // Exactly three args — no { connectedByUserId } 4th arg (account-shared).
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "stripe", null);
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "stripe",
      providerAccountId: "acct_stripe_123",
    });
  });

  it("returns MISSING_CREDENTIAL when the account has no Stripe connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("metrics (count + volume math)", () => {
  it("successful_payment_count counts succeeded charges only", async () => {
    const r = await stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ successful_payment_count: 3 });
  });

  it("failed_payment_count counts failed charges only", async () => {
    const r = await stripeAnalyticsSource.query({ metricKey: "failed_payment_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ failed_payment_count: 1 });
  });

  it("gross_payment_volume sums the dominant currency in MAJOR units + warns on multi-currency", async () => {
    const r = await stripeAnalyticsSource.query({ metricKey: "gross_payment_volume", range: RANGE }, CTX);
    // usd dominates (2 vs eur 1): 1000 + 2000 minor = $30.00; eur excluded.
    expect(r.totals).toEqual({ gross_payment_volume: 30 });
    expect(r.warnings.some((w) => /USD/.test(w) && /other currencies/i.test(w))).toBe(true);
  });

  it("successful_payments_over_time buckets succeeded charges by day", async () => {
    const r = await stripeAnalyticsSource.query(
      { metricKey: "successful_payments_over_time", range: RANGE },
      CTX,
    );
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    // 06-01 has usd+eur succeeded (2), 06-02 has 1, rest 0.
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]);
    expect(r.totals?.count).toBe(3);
  });

  it("gross_volume_over_time buckets the dominant currency only", async () => {
    const r = await stripeAnalyticsSource.query({ metricKey: "gross_volume_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([10, 20, 0, 0]); // eur 500 excluded from 06-01
    expect(r.totals?.count).toBe(30);
  });

  it("surfaces a truncation warning when the scan hit the page cap", async () => {
    mockScan.mockResolvedValue({ facts: FACTS, truncated: true });
    const r = await stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces a customer/charge/description detail — only counts + dates + currency", async () => {
    const r = await stripeAnalyticsSource.query({ metricKey: "gross_volume_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/cus_|ch_|pi_|receipt|description|customer|payment_intent|metadata/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "stripe",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a rate-limit error → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new Error("Stripe GET /v1/charges failed: Too Many Requests"));
    await expect(
      stripeAnalyticsSource.query({ metricKey: "successful_payment_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("Stripe GET /v1/charges failed: sk_live_secret boom"));
    const err = await stripeAnalyticsSource
      .query({ metricKey: "successful_payment_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/sk_live_secret|v1\/charges/);
  });
});
