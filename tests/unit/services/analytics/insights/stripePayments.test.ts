/** @jest-environment node */
/**
 * ANALYTICS-CONNECTED-DATA-CD-2 — Stripe Payments dataset: catalog, money/
 * currency correctness, aggregation semantics, and adapter behavior. Mocks sit
 * at the true external boundaries only (charges HTTP wrapper + oauth seam).
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockChargesList = jest.fn();
jest.mock("@/integrations/stripe/api/charges", () => ({
  chargesList: (...args: unknown[]) => mockChargesList(...args),
}));
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("tok_test"),
  };
});

import {
  MIXED_CURRENCY_MESSAGE,
  aggregateStripePayments,
} from "@/services/analytics/insights/stripe/aggregate";
import {
  STRIPE_SCAN_CAP,
  stripePaymentsAdapter,
} from "@/services/analytics/insights/stripe";
import { getInsightDataset } from "@/services/analytics/insights/registry";
import { buildClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";
import type { ChargeFact } from "@/services/analytics/sources/stripe/api";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const FROM = "2026-07-01T00:00:00.000Z";
const TO = "2026-07-04T00:00:00.000Z";

const q = (body: Record<string, unknown>) =>
  ConnectedAnalyticsQuerySchema.parse({
    source: "stripe",
    dataset: "payments",
    range: { from: FROM, to: TO },
    ...body,
  });

const fact = (
  iso: string,
  status: string,
  amount: number,
  currency = "usd",
): ChargeFact => ({ created: Math.floor(Date.parse(iso) / 1000), status, amount, currency });

const agg = (
  body: Record<string, unknown>,
  facts: ChargeFact[],
  extra: Partial<Parameters<typeof aggregateStripePayments>[0]> = {},
) =>
  aggregateStripePayments({
    query: q(body),
    facts,
    truncated: false,
    now: NOW,
    scanCap: STRIPE_SCAN_CAP,
    ...extra,
  });

beforeEach(() => {
  mockChargesList.mockReset();
  mockGetActiveForExecution.mockReset();
  mockGetActiveForExecution.mockResolvedValue({ providerAccountId: "acct_stripe" });
});

describe("catalog registration + client projection", () => {
  const reg = getInsightDataset("stripe", "payments")!;
  it("registers stripe.payments with the declared capabilities", () => {
    expect(reg.catalog.source.credentialMode).toBe("account");
    expect(reg.capabilities.measures.map((m) => m.id).sort()).toEqual(
      ["avg_payment_amount", "failed_payment_count", "gross_payment_amount", "payment_count", "successful_payment_count"].sort(),
    );
    expect(reg.capabilities.filters.find((f) => f.id === "customer")).toMatchObject({
      valueType: "entity_ids", optionsSource: "stripe:customers", maxSelections: 1,
    });
    expect(reg.dataset.queryLimits.maxRecordsScanned).toBe(2000);
  });
  it("client projection includes stripe but no raw scopes/server details", () => {
    const json = JSON.stringify(buildClientAnalyticsCatalog());
    expect(json).toContain('"stripe"');
    expect(json).not.toContain("read_write");
    expect(json).not.toContain("requiredScopes");
  });
});

describe("money + currency correctness", () => {
  it("two-decimal currency: minor units convert once, no float drift", () => {
    const r = agg({ measure: "gross_payment_amount", dimension: null }, [
      fact("2026-07-01T10:00:00Z", "succeeded", 1999),
      fact("2026-07-02T10:00:00Z", "succeeded", 1),
      fact("2026-07-02T11:00:00Z", "failed", 99_999),
    ]);
    expect(r.value).toBe(20); // (1999+1)/100 — failed excluded
    expect(r.valueMeta).toEqual({ unit: "currency", currency: "USD" });
  });
  it("zero-decimal currency (JPY) never divides by 100", () => {
    const r = agg({ measure: "gross_payment_amount", dimension: null }, [
      fact("2026-07-01T10:00:00Z", "succeeded", 5000, "jpy"),
    ]);
    expect(r.value).toBe(5000);
    expect(r.valueMeta.currency).toBe("JPY");
  });
  it("large totals stay precise (integer accumulation)", () => {
    const facts = Array.from({ length: 1000 }, (_, i) =>
      fact("2026-07-01T10:00:00Z", "succeeded", 333 + (i % 7)),
    );
    const minorSum = facts.reduce((s, f) => s + f.amount, 0);
    const r = agg({ measure: "gross_payment_amount", dimension: null }, facts);
    expect(r.value).toBe(Math.round((minorSum / 100) * 100) / 100);
  });
  it("mixed currencies on a monetary measure → typed MIXED_CURRENCY", () => {
    expect(() =>
      agg({ measure: "gross_payment_amount", dimension: null }, [
        fact("2026-07-01T10:00:00Z", "succeeded", 100, "usd"),
        fact("2026-07-01T11:00:00Z", "succeeded", 100, "eur"),
      ]),
    ).toThrow(MIXED_CURRENCY_MESSAGE);
  });
  it("an explicit single-currency filter resolves the mix", () => {
    const r = agg(
      { measure: "gross_payment_amount", dimension: null, filters: { currency: ["eur"] } },
      [
        fact("2026-07-01T10:00:00Z", "succeeded", 100, "usd"),
        fact("2026-07-01T11:00:00Z", "succeeded", 250, "eur"),
      ],
    );
    expect(r.value).toBe(2.5);
    expect(r.valueMeta.currency).toBe("EUR");
  });
  it("counts may group by currency (unit-compatible)", () => {
    const r = agg({ measure: "payment_count", dimension: "currency" }, [
      fact("2026-07-01T10:00:00Z", "succeeded", 100, "usd"),
      fact("2026-07-01T11:00:00Z", "succeeded", 100, "eur"),
      fact("2026-07-01T12:00:00Z", "failed", 100, "eur"),
    ]);
    expect(r.rows).toEqual([
      { id: "eur", label: "EUR", value: 2, records: 2 },
      { id: "usd", label: "USD", value: 1, records: 1 },
    ]);
  });
  it("average uses the succeeded domain only; empty domain → null", () => {
    const r = agg({ measure: "avg_payment_amount", dimension: null }, [
      fact("2026-07-01T10:00:00Z", "succeeded", 1000),
      fact("2026-07-01T11:00:00Z", "succeeded", 2000),
      fact("2026-07-01T12:00:00Z", "failed", 90_000),
    ]);
    expect(r.value).toBe(15);
    const empty = agg({ measure: "avg_payment_amount", dimension: null }, [
      fact("2026-07-01T12:00:00Z", "failed", 90_000),
    ]);
    expect(empty.value).toBeNull();
    const gross = agg({ measure: "gross_payment_amount", dimension: null }, []);
    expect(gross.value).toBe(0); // sum-of-facts zero rule
  });
});

describe("aggregation semantics", () => {
  const facts = [
    fact("2026-07-01T10:00:00Z", "succeeded", 1000),
    fact("2026-07-02T10:00:00Z", "succeeded", 3000),
    fact("2026-07-02T11:00:00Z", "failed", 500),
    fact("2026-07-02T12:00:00Z", "pending", 700),
    fact("2026-07-03T23:59:59Z", "succeeded", 2000),
  ];
  it("counts by status dimension + status filter honored", () => {
    const r = agg({ measure: "payment_count", dimension: "status" }, facts);
    expect(r.rows!.map((x) => [x.id, x.value])).toEqual([
      ["succeeded", 3], ["failed", 1], ["pending", 1],
    ]);
    const filtered = agg(
      { measure: "payment_count", dimension: null, filters: { status: ["failed", "pending"] } },
      facts,
    );
    expect(filtered.value).toBe(2);
  });
  it("[from, to) boundaries: at-from included, at-to excluded", () => {
    const r = agg({ measure: "payment_count", dimension: null }, [
      fact(FROM, "succeeded", 100),
      fact(TO, "succeeded", 100),
    ]);
    expect(r.value).toBe(1);
  });
  it("day series zero-fill counts; monetary series carry currency; status series split", () => {
    const r = agg(
      { measure: "successful_payment_count", dimension: "time", timeGrain: "day" },
      facts,
    );
    expect(r.buckets!.map((b) => b.label)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(r.series![0]!.values).toEqual([1, 1, 1]);
    const money = agg(
      { measure: "gross_payment_amount", dimension: "time", timeGrain: "day" },
      facts,
    );
    expect(money.series![0]!.values).toEqual([10, 30, 20]);
    expect(money.valueMeta.currency).toBe("USD");
    const byStatus = agg(
      { measure: "payment_count", dimension: "time", timeGrain: "day", series: { by: "status" } },
      facts,
    );
    expect(byStatus.series!.map((s) => s.label)).toEqual(["Succeeded", "Pending", "Failed"]);
    expect(byStatus.series![0]!.values).toEqual([1, 1, 1]);
    expect(byStatus.series![2]!.values).toEqual([0, 1, 0]);
  });
  it("previous-period compare aggregates the prev window facts", () => {
    const r = agg(
      { measure: "payment_count", dimension: null, compare: "previous_period" },
      facts,
      { prevFacts: [fact("2026-06-29T10:00:00Z", "succeeded", 100)] },
    );
    expect(r.compare).toEqual({
      previousValue: 1,
      previousRange: { from: "2026-06-28T00:00:00.000Z", to: FROM },
    });
  });
  it("scan cap → structured scan_capped completeness + newest-first warning", () => {
    const r = agg({ measure: "payment_count", dimension: null }, facts, { truncated: true });
    expect(r.completeness).toEqual({
      state: "scan_capped",
      detail: expect.stringContaining("2000"),
    });
    expect(r.warnings[0]).toContain("most recent");
  });
});

describe("adapter (mocked provider boundary)", () => {
  const page = (data: unknown[], hasMore = false) => ({ data, has_more: hasMore });
  const charge = (iso: string, status: string, amount: number, id: string) => ({
    id, created: Math.floor(Date.parse(iso) / 1000), status, amount, currency: "usd",
  });

  it("scans the [from,to) window, passes the single-customer filter server-side", async () => {
    mockChargesList.mockResolvedValue(page([charge("2026-07-02T10:00:00Z", "succeeded", 1500, "ch_1")]));
    const r = await stripePaymentsAdapter.query(CTX, q({
      measure: "gross_payment_amount", dimension: null,
      filters: { customer: ["cus_123"] },
    }));
    expect(r.value).toBe(15);
    const call = mockChargesList.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.customer).toBe("cus_123");
    expect(call.createdGte).toBe(Math.floor(Date.parse(FROM) / 1000));
    expect(call.createdLte).toBe(Math.floor((Date.parse(TO) - 1) / 1000));
  });
  it("missing connection → MISSING_CREDENTIAL; 401 → RECONNECT_REQUIRED; 429 → RATE_LIMITED", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      stripePaymentsAdapter.query(CTX, q({ measure: "payment_count", dimension: null })),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });

    const { Unauthorized401Error } = jest.requireActual("@/services/oauth/refreshAndRetry");
    mockChargesList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      stripePaymentsAdapter.query(CTX, q({ measure: "payment_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RECONNECT_REQUIRED" });

    mockChargesList.mockRejectedValueOnce(new Error("HTTP 429 too many requests"));
    await expect(
      stripePaymentsAdapter.query(CTX, q({ measure: "payment_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it("compare runs a second bounded scan for the previous window", async () => {
    mockChargesList
      .mockResolvedValueOnce(page([charge("2026-07-02T10:00:00Z", "succeeded", 1000, "ch_1")]))
      .mockResolvedValueOnce(page([charge("2026-06-29T10:00:00Z", "succeeded", 3000, "ch_2")]));
    const r = await stripePaymentsAdapter.query(CTX, q({
      measure: "gross_payment_amount", dimension: null, compare: "previous_period",
    }));
    expect(r.value).toBe(10);
    expect(r.compare?.previousValue).toBe(30);
    expect(mockChargesList).toHaveBeenCalledTimes(2);
  });
  it("no raw payload fields in the result; pagination follows cursors up to the cap", async () => {
    mockChargesList
      .mockResolvedValueOnce(page([charge("2026-07-01T10:00:00Z", "succeeded", 100, "ch_a")], true))
      .mockResolvedValueOnce(page([charge("2026-07-01T11:00:00Z", "succeeded", 100, "ch_b")]));
    const r = await stripePaymentsAdapter.query(CTX, q({ measure: "payment_count", dimension: null }));
    expect(r.value).toBe(2);
    expect(mockChargesList.mock.calls[1]![0]).toMatchObject({ startingAfter: "ch_a" });
    const json = JSON.stringify(r);
    for (const banned of ["ch_a", "ch_b", "cus_", "receipt", "tok_test", "description"]) {
      expect(json).not.toContain(banned);
    }
  });
});
