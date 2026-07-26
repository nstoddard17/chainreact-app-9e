/**
 * ANALYTICS-CONNECTED-DATA-CD-4B — QuickBooks Invoices dataset: catalog,
 * decimal/currency correctness, aggregation semantics, historical vs
 * current-state enforcement, and adapter behaviour.
 *
 * Mocks sit at the TRUE external boundary only — `quickbooksRequest` (the one
 * function that performs HTTP to Intuit) plus the oauth/repo seams. Everything
 * between is real: the shipped `invoiceList` wrapper builds the actual query
 * statement, the shipped `projectInvoice` projects the real wire shape, and
 * the real scanner/aggregator run. Fixtures mirror shapes observed during the
 * CD-4B Phase A live certification.
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockQuickbooksRequest = jest.fn();
jest.mock("@/integrations/_shared/quickbooks/api/_request", () => {
  const actual = jest.requireActual("@/integrations/_shared/quickbooks/api/_request");
  return {
    ...actual,
    quickbooksRequest: (...args: unknown[]) => mockQuickbooksRequest(...args),
  };
});
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
  MISSING_CURRENCY_WARNING,
  aggregateQuickbooksInvoices,
  paidStatusOf,
} from "@/services/analytics/insights/quickbooks/aggregate";
import {
  QUICKBOOKS_SCAN_CAP,
  quickbooksInvoicesAdapter,
} from "@/services/analytics/insights/quickbooks";
import { getInsightDataset } from "@/services/analytics/insights/registry";
import { buildClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";
import { validateConnectedQuery } from "@/services/analytics/insights/validateQuery";
import { PAGE_SIZE, type InvoiceFact } from "@/services/analytics/sources/quickbooks/api";
import {
  Unauthorized401Error,
  IntegrationActionRequiredError,
} from "@/services/oauth/refreshAndRetry";
import { RateLimitedError } from "@/integrations/_shared/quickbooks/errors";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const FROM = "2026-07-01T00:00:00.000Z";
const TO = "2026-07-05T00:00:00.000Z";

const q = (body: Record<string, unknown>) =>
  ConnectedAnalyticsQuerySchema.parse({
    source: "quickbooks",
    dataset: "invoices",
    range: { from: FROM, to: TO },
    ...body,
  });

/** A transient invoice fact (minor units, as the scanner produces them). */
const fact = (
  txnDate: string | null,
  totalMinor: number | null,
  balanceMinor: number | null,
  extra: Partial<InvoiceFact> = {},
): InvoiceFact => ({
  txnDate,
  totalMinor,
  balanceMinor,
  currency: "usd",
  customerKey: "cust-a",
  customerLabel: "Acme Ltd",
  ...extra,
});

const agg = (
  body: Record<string, unknown>,
  facts: InvoiceFact[],
  extra: Partial<Parameters<typeof aggregateQuickbooksInvoices>[0]> = {},
) =>
  aggregateQuickbooksInvoices({
    query: q(body),
    facts,
    truncated: false,
    now: NOW,
    scanCap: QUICKBOOKS_SCAN_CAP,
    ...extra,
  });

/** Raw QuickBooks wire invoice — the shape `projectInvoice` consumes. */
function wire(
  id: string,
  txnDate: string,
  totalAmt: number,
  balance: number,
  opts: {
    customerId?: string;
    customerName?: string;
    currency?: string | null;
    createTime?: string;
  } = {},
): Record<string, unknown> {
  return {
    Id: id,
    DocNumber: `INV-${id}`,
    CustomerRef: { value: opts.customerId ?? "77", name: opts.customerName ?? "Acme Ltd" },
    TxnDate: txnDate,
    DueDate: "2026-08-01",
    TotalAmt: totalAmt,
    Balance: balance,
    ...(opts.currency === null ? {} : { CurrencyRef: { value: opts.currency ?? "USD" } }),
    EmailStatus: "NotSet",
    BillEmail: { Address: "ap@acme.example" },
    CustomerMemo: { value: "thanks for your business" },
    PrivateNote: "internal note",
    Line: [
      {
        Id: "1",
        DetailType: "SalesItemLineDetail",
        Description: "Consulting hours",
        Amount: totalAmt,
        SalesItemLineDetail: { ItemRef: { value: "5", name: "Consulting" } },
      },
    ],
    MetaData: {
      CreateTime: opts.createTime ?? `${txnDate}T09:00:00-07:00`,
      LastUpdatedTime: `${txnDate}T09:00:00-07:00`,
    },
  };
}

/** Serve `rows` through the real wrapper, honouring STARTPOSITION/MAXRESULTS. */
function armProvider(rows: Record<string, unknown>[]): void {
  mockQuickbooksRequest.mockImplementation(
    async (input: { query?: URLSearchParams }) => {
      const statement = input.query?.get("query") ?? "";
      const start = Number(/STARTPOSITION (\d+)/.exec(statement)?.[1] ?? "1");
      const max = Number(/MAXRESULTS (\d+)/.exec(statement)?.[1] ?? "100");
      return { QueryResponse: { Invoice: rows.slice(start - 1, start - 1 + max) } };
    },
  );
}

function lastStatements(): string[] {
  return mockQuickbooksRequest.mock.calls.map(
    (c) => (c[0] as { query?: URLSearchParams }).query?.get("query") ?? "",
  );
}

beforeEach(() => {
  mockQuickbooksRequest.mockReset();
  mockGetActiveForExecution.mockReset();
  mockGetActiveForExecution.mockResolvedValue({
    accountId: "acct-1",
    providerAccountId: "realm-123",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("catalog registration", () => {
  const reg = getInsightDataset("quickbooks", "invoices")!;

  it("registers quickbooks.invoices as an account-class provider snapshot", () => {
    expect(reg).toBeTruthy();
    expect(reg.catalog.source.credentialMode).toBe("account");
    expect(reg.catalog.source.connectionRequired).toBe(true);
    expect(reg.catalog.source.exposure).toBe("public");
    expect(reg.dataset.executionMode).toBe("provider_snapshot");
    expect(reg.dataset.freshness).toEqual({ mode: "cached", ttlSeconds: 600 });
    expect(reg.dataset.queryLimits.maxRangeDays).toBe(366);
    expect(reg.dataset.queryLimits.maxRecordsScanned).toBe(2000);
  });

  it("exposes exactly the five approved measures", () => {
    expect(reg.capabilities.measures.map((m) => m.id).sort()).toEqual([
      "avg_invoice_amount",
      "invoice_count",
      "outstanding_balance",
      "outstanding_invoice_count",
      "total_invoiced_amount",
    ]);
  });

  it("declares no revenue / cash-collected / profit / AR-aging measure", () => {
    const ids = reg.capabilities.measures.map((m) => m.id).join(" ");
    for (const banned of ["revenue", "cash", "collected", "profit", "aging", "overdue", "tax", "fee", "payment"]) {
      expect(ids).not.toContain(banned);
    }
  });

  it("labels the money measures as billed, never as revenue", () => {
    const total = reg.capabilities.measures.find((m) => m.id === "total_invoiced_amount")!;
    expect(total.label).toBe("Total invoiced amount");
    expect(reg.dataset.namedMeasures.find((m) => m.id === "total_invoiced_amount")!.description)
      .toMatch(/billed, not collected/i);
  });

  it("treats the invoice identifier as identifier-only", () => {
    const field = reg.dataset.fields.find((f) => f.id === "invoice_id")!;
    expect(field.kind).toBe("text");
    expect(field.measurable).toBe(false);
    expect(field.dimensionable).toBe(false);
    expect(field.filterable).toBe(false);
    expect(reg.capabilities.measures.some((m) => m.id.includes("invoice_id"))).toBe(false);
    expect(reg.capabilities.dimensions.some((d) => d.id === "invoice_id")).toBe(false);
    expect(reg.capabilities.filters.some((f) => f.id === "invoice_id")).toBe(false);
  });

  it("wires the customer picker to the existing QuickBooks resolver", () => {
    expect(reg.capabilities.filters.find((f) => f.id === "customer")).toMatchObject({
      valueType: "entity_ids",
      optionsSource: "quickbooks:customers",
      maxSelections: 1,
    });
    expect(reg.capabilities.dimensions.find((d) => d.id === "customer")).toMatchObject({
      kind: "entity",
      optionsSource: "quickbooks:customers",
    });
  });

  it("offers the certified dimensions and filters", () => {
    expect(reg.capabilities.dimensions.map((d) => d.id).sort()).toEqual([
      "currency", "customer", "paid_status", "time",
    ]);
    expect(reg.capabilities.filters.map((f) => f.id).sort()).toEqual([
      "currency", "customer", "paid_status",
    ]);
  });

  it("makes due date a context field that cannot drive the time axis", () => {
    const due = reg.dataset.dateFields.find((d) => d.id === "due_date")!;
    expect(due.historical).toBe(false);
    expect(reg.dataset.dateFields.find((d) => d.id === "txn_date")!.historical).toBe(true);
  });

  it("declares part-to-whole for paid status only", () => {
    expect(reg.dataset.partToWholeDimensions).toEqual(["paid_status"]);
  });

  it("caps customer series at 8 with explicit selection only", () => {
    const cap = reg.dataset.series.find((s) => s.by === "customer")!;
    expect(cap.max).toBe(8);
    expect(cap.modes).toEqual(["explicit"]);
  });

  it("exposes no line items, memo, email or doc-number field", () => {
    const ids = reg.dataset.fields.map((f) => f.id);
    for (const banned of ["line", "lines", "item", "memo", "email", "doc_number", "private_note"]) {
      expect(ids.some((i) => i.includes(banned))).toBe(false);
    }
  });

  it("client projection lists QuickBooks and leaks no scopes or server internals", () => {
    const catalog = buildClientAnalyticsCatalog({ environment: "production" });
    const qb = catalog.sources.find((s) => s.id === "quickbooks")!;
    expect(qb).toBeTruthy();
    expect(qb.datasets.find((d) => d.id === "invoices")).toBeTruthy();
    const json = JSON.stringify(catalog);
    expect(json).not.toContain("com.intuit");
    expect(json).not.toContain("provider_snapshot");
    expect(json).not.toContain("realm");
    // due_date is non-historical → filtered out of the client date fields.
    expect(
      qb.datasets.find((d) => d.id === "invoices")!.dateFields.map((d) => d.id),
    ).toEqual(["txn_date"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("historical versus current-state enforcement", () => {
  const reg = getInsightDataset("quickbooks", "invoices")!;

  it.each(["invoice_count", "total_invoiced_amount", "avg_invoice_amount"])(
    "%s may be grouped over time",
    (measure) => {
      expect(() =>
        validateConnectedQuery(reg, q({ measure, dimension: "time" })),
      ).not.toThrow();
    },
  );

  it.each(["outstanding_balance", "outstanding_invoice_count"])(
    "%s is rejected server-side when a time grouping is crafted",
    (measure) => {
      expect(() =>
        validateConnectedQuery(reg, q({ measure, dimension: "time" })),
      ).toThrow(/can't be grouped that way/i);
    },
  );

  it("rejects a crafted line chart of outstanding balance", () => {
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "outstanding_balance", dimension: "time", chart: "line" }),
      ),
    ).toThrow();
  });

  it("rejects period comparison on a current-state measure", () => {
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "outstanding_balance", dimension: null, compare: "previous_period" }),
      ),
    ).toThrow(/doesn't support period comparison/i);
  });

  it("the aggregator refuses a time dimension for a current-state measure even if validation is bypassed", () => {
    expect(() =>
      agg({ measure: "outstanding_balance", dimension: "time" }, [
        fact("2026-07-02", 10000, 10000),
      ]),
    ).toThrow(/can't be charted over time/i);
  });

  it("allows a donut of invoice count by paid status but not of outstanding balance", () => {
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "invoice_count", dimension: "paid_status", chart: "donut" }),
      ),
    ).not.toThrow();
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "outstanding_balance", dimension: "paid_status", chart: "donut" }),
      ),
    ).toThrow(/can't be grouped that way/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("paid / open derivation", () => {
  it("partitions every invoice into exactly one of paid | outstanding", () => {
    const facts = [
      fact("2026-07-02", 10000, 10000), // fully unpaid
      fact("2026-07-02", 10000, 2500), // partially paid
      fact("2026-07-02", 10000, 0), // settled
      fact("2026-07-02", 0, 0), // zero-total invoice — owes nothing
      fact("2026-07-02", 10000, -500), // credited
      fact("2026-07-02", 10000, null), // balance unreadable
    ];
    const statuses = facts.map(paidStatusOf);
    expect(statuses).toEqual([
      "outstanding", "outstanding", "paid", "paid", "paid", "paid",
    ]);
    // Exhaustive + mutually exclusive ⇒ a donut denominator is complete.
    expect(statuses.filter((s) => s === "outstanding" || s === "paid")).toHaveLength(
      facts.length,
    );
  });

  it("counts by paid status sum back to the total invoice count", () => {
    const facts = [
      fact("2026-07-02", 10000, 10000),
      fact("2026-07-02", 5000, 0),
      fact("2026-07-03", 2500, 100),
    ];
    const rows = agg({ measure: "invoice_count", dimension: "paid_status" }, facts).rows!;
    expect(rows.reduce((s, r) => s + (r.value ?? 0), 0)).toBe(
      agg({ measure: "invoice_count", dimension: null }, facts).value,
    );
    expect(rows.map((r) => r.label).sort()).toEqual(["Outstanding", "Paid"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("decimal money and currency", () => {
  it("sums fractional cents without float drift", () => {
    // 0.1 + 0.2 in binary floating point is 0.30000000000000004.
    const facts = [
      fact("2026-07-02", 10, 0),
      fact("2026-07-02", 20, 0),
    ];
    const r = agg({ measure: "total_invoiced_amount", dimension: null }, facts);
    expect(r.value).toBe(0.3);
    expect(r.valueMeta).toEqual({ unit: "currency", currency: "USD" });
  });

  it("keeps a large multi-thousand-invoice total exact", () => {
    const facts = Array.from({ length: 2000 }, () => fact("2026-07-02", 36207, 0));
    expect(agg({ measure: "total_invoiced_amount", dimension: null }, facts).value).toBe(
      724140,
    );
  });

  it("averages over invoices with a usable total only, and rounds to the currency", () => {
    const facts = [
      fact("2026-07-02", 10000, 0), // 100.00
      fact("2026-07-02", 5001, 0), // 50.01
      fact("2026-07-02", null, 1000), // no readable total — not a denominator
    ];
    // (100.00 + 50.01) / 2 = 75.005 → 75.01 at USD precision
    expect(agg({ measure: "avg_invoice_amount", dimension: null }, facts).value).toBe(75.01);
  });

  it("returns null (not zero) for an average with no eligible invoice", () => {
    const r = agg({ measure: "avg_invoice_amount", dimension: null }, []);
    expect(r.value).toBeNull();
  });

  it("returns zero (not null) for a sum with no eligible invoice", () => {
    expect(agg({ measure: "total_invoiced_amount", dimension: null }, []).value).toBe(0);
    expect(agg({ measure: "invoice_count", dimension: null }, []).value).toBe(0);
  });

  it("honours a zero-decimal currency", () => {
    const facts = [
      fact("2026-07-02", 1500, 0, { currency: "jpy" }),
      fact("2026-07-02", 2500, 0, { currency: "jpy" }),
    ];
    const r = agg({ measure: "total_invoiced_amount", dimension: null }, facts);
    expect(r.value).toBe(4000);
    expect(r.valueMeta.currency).toBe("JPY");
  });

  it("rejects a monetary measure spanning more than one currency", () => {
    const facts = [
      fact("2026-07-02", 10000, 0),
      fact("2026-07-02", 10000, 0, { currency: "eur" }),
    ];
    expect(() => agg({ measure: "total_invoiced_amount", dimension: null }, facts)).toThrow(
      MIXED_CURRENCY_MESSAGE,
    );
  });

  it("resolves a mixed-currency company through an explicit currency filter", () => {
    const facts = [
      fact("2026-07-02", 10000, 0),
      fact("2026-07-02", 9900, 0, { currency: "eur" }),
    ];
    const r = agg(
      { measure: "total_invoiced_amount", dimension: null, filters: { currency: ["usd"] } },
      facts,
    );
    expect(r.value).toBe(100);
    expect(r.valueMeta.currency).toBe("USD");
  });

  it("leaves counts currency-independent", () => {
    const facts = [
      fact("2026-07-02", 10000, 0),
      fact("2026-07-02", 9900, 0, { currency: "eur" }),
    ];
    const r = agg({ measure: "invoice_count", dimension: null }, facts);
    expect(r.value).toBe(2);
    expect(r.valueMeta).toEqual({ unit: "count" });
  });

  it("never assumes USD when QuickBooks reports no currency", () => {
    const facts = [fact("2026-07-02", 10000, 0, { currency: null })];
    const r = agg({ measure: "total_invoiced_amount", dimension: null }, facts);
    expect(r.value).toBe(100);
    expect(r.valueMeta.currency).toBeUndefined();
    expect(r.warnings).toContain(MISSING_CURRENCY_WARNING);
  });

  it("requires a compatible currency across a comparison window", () => {
    expect(() =>
      agg(
        { measure: "total_invoiced_amount", dimension: null, compare: "previous_period" },
        [fact("2026-07-02", 10000, 0)],
        { prevFacts: [fact("2026-06-29", 10000, 0, { currency: "eur" })] },
      ),
    ).toThrow(MIXED_CURRENCY_MESSAGE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("measure semantics", () => {
  const facts = [
    fact("2026-07-01", 10000, 10000, { customerKey: "a", customerLabel: "Acme" }),
    fact("2026-07-02", 25000, 5000, { customerKey: "b", customerLabel: "Beta" }),
    fact("2026-07-03", 5000, 0, { customerKey: "a", customerLabel: "Acme" }),
  ];

  it("invoice count counts every invoice in the window", () => {
    expect(agg({ measure: "invoice_count", dimension: null }, facts).value).toBe(3);
  });

  it("total invoiced amount sums the ORIGINAL totals, including unpaid ones", () => {
    expect(agg({ measure: "total_invoiced_amount", dimension: null }, facts).value).toBe(400);
  });

  it("outstanding balance sums what is still owed, not what was billed", () => {
    expect(agg({ measure: "outstanding_balance", dimension: null }, facts).value).toBe(150);
  });

  it("outstanding invoice count counts only invoices that still owe", () => {
    expect(agg({ measure: "outstanding_invoice_count", dimension: null }, facts).value).toBe(2);
  });

  it("breaks outstanding balance down by customer", () => {
    const rows = agg({ measure: "outstanding_balance", dimension: "customer" }, facts).rows!;
    expect(rows).toEqual([
      { id: "a", label: "Acme", value: 100, records: 1 },
      { id: "b", label: "Beta", value: 50, records: 1 },
    ]);
  });

  it("excludes fully paid invoices from the by-customer outstanding breakdown", () => {
    const rows = agg({ measure: "outstanding_balance", dimension: "customer" }, [
      fact("2026-07-01", 10000, 0, { customerKey: "paid-only", customerLabel: "Settled Co" }),
    ]).rows!;
    expect(rows).toEqual([]);
  });

  it("applies the [from, to) window bound", () => {
    const boundary = [
      fact("2026-06-30", 10000, 0), // before from
      fact("2026-07-01", 10000, 0), // from — included
      fact("2026-07-05", 10000, 0), // to — excluded
    ];
    expect(agg({ measure: "invoice_count", dimension: null }, boundary).value).toBe(1);
  });

  it("ignores invoices with an unparseable transaction date", () => {
    expect(
      agg({ measure: "invoice_count", dimension: null }, [
        fact(null, 10000, 0),
        fact("not-a-date", 10000, 0),
      ]).value,
    ).toBe(0);
  });

  it("reports invoices the scan could not read", () => {
    const r = agg({ measure: "invoice_count", dimension: null }, facts, { malformed: 2 });
    expect(r.warnings.some((w) => /2 invoices couldn't be read/.test(w))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("time grouping and series", () => {
  const spread = [
    fact("2026-07-01", 10000, 10000),
    fact("2026-07-01", 5000, 0),
    fact("2026-07-03", 20000, 20000),
  ];

  it("zero-fills empty day buckets for a count", () => {
    const r = agg({ measure: "invoice_count", dimension: "time", timeGrain: "day" }, spread);
    expect(r.grain).toBe("day");
    expect(r.buckets!.map((b) => b.label)).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04",
    ]);
    expect(r.series![0]!.values).toEqual([2, 0, 1, 0]);
  });

  it("leaves empty buckets null for an average", () => {
    const r = agg(
      { measure: "avg_invoice_amount", dimension: "time", timeGrain: "day" },
      spread,
    );
    expect(r.series![0]!.values).toEqual([75, null, 200, null]);
  });

  it.each([
    ["week", "2026-06-29"],
    ["month", "2026-07-01"],
  ])("supports the %s grain", (grain, firstBucket) => {
    const r = agg(
      { measure: "invoice_count", dimension: "time", timeGrain: grain },
      spread,
    );
    expect(r.grain).toBe(grain);
    expect(r.buckets![0]!.label).toBe(firstBucket);
  });

  it("auto-selects a day grain for a short window", () => {
    const r = agg({ measure: "invoice_count", dimension: "time", timeGrain: "auto" }, spread);
    expect(r.grain).toBe("day");
  });

  it("splits a time chart into explicit customer series, keeping empty ones visible", () => {
    const facts = [
      fact("2026-07-01", 10000, 0, { customerKey: "a", customerLabel: "Acme" }),
      fact("2026-07-02", 20000, 0, { customerKey: "b", customerLabel: "Beta" }),
    ];
    const r = agg(
      {
        measure: "invoice_count",
        dimension: "time",
        timeGrain: "day",
        series: { by: "customer", mode: "explicit", ids: ["a", "b", "c"] },
      },
      facts,
    );
    expect(r.series!.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(r.series!.map((s) => s.label)).toEqual(["Acme", "Beta", "Unknown customer"]);
    expect(r.series![0]!.values).toEqual([1, 0, 0, 0]);
    expect(r.series![2]!.values).toEqual([0, 0, 0, 0]);
  });

  it("splits a time chart by paid status", () => {
    const r = agg(
      {
        measure: "invoice_count",
        dimension: "time",
        timeGrain: "day",
        series: { by: "paid_status" },
      },
      spread,
    );
    expect(r.series!.map((s) => s.label)).toEqual(["Outstanding", "Paid"]);
    expect(r.series![0]!.values).toEqual([1, 0, 1, 0]);
    expect(r.series![1]!.values).toEqual([1, 0, 0, 0]);
  });

  it("compares against the previous equal window", () => {
    const r = agg(
      { measure: "invoice_count", dimension: null, compare: "previous_period" },
      spread,
      { prevFacts: [fact("2026-06-28", 10000, 0)] },
    );
    expect(r.value).toBe(3);
    expect(r.compare).toMatchObject({
      previousValue: 1,
      previousRange: { from: "2026-06-27T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("categorical shaping", () => {
  const facts = [
    fact("2026-07-01", 10000, 0, { customerKey: "a", customerLabel: "Acme" }),
    fact("2026-07-01", 30000, 0, { customerKey: "b", customerLabel: "Beta" }),
    fact("2026-07-02", 20000, 0, { customerKey: "c", customerLabel: "Ceta" }),
  ];

  it("sorts by value descending by default", () => {
    const rows = agg({ measure: "total_invoiced_amount", dimension: "customer" }, facts).rows!;
    expect(rows.map((r) => r.label)).toEqual(["Beta", "Ceta", "Acme"]);
  });

  it("honours an explicit label sort", () => {
    const rows = agg(
      {
        measure: "total_invoiced_amount",
        dimension: "customer",
        sort: { by: "label", dir: "asc" },
      },
      facts,
    ).rows!;
    expect(rows.map((r) => r.label)).toEqual(["Acme", "Beta", "Ceta"]);
  });

  it("marks a row-capped breakdown", () => {
    const r = agg(
      { measure: "total_invoiced_amount", dimension: "customer", limit: 2 },
      facts,
    );
    expect(r.rows).toHaveLength(2);
    expect(r.completeness.state).toBe("row_capped");
  });

  it("groups a count by currency", () => {
    const rows = agg({ measure: "invoice_count", dimension: "currency" }, [
      fact("2026-07-01", 10000, 0),
      fact("2026-07-01", 10000, 0, { currency: "eur" }),
      fact("2026-07-01", 10000, 0, { currency: null }),
    ]).rows!;
    expect(rows.map((r) => r.label).sort()).toEqual(["EUR", "USD", "Unknown"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("adapter against the mocked Intuit boundary", () => {
  it("resolves the account's realm and pushes the date predicate server-side", async () => {
    armProvider([wire("1", "2026-07-02", 100, 0)]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null }),
    );
    expect(r.value).toBe(1);
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-1", "quickbooks", null);
    const stmt = lastStatements()[0]!;
    expect(stmt).toContain("TxnDate >= '2026-07-01'");
    // [from, to) → the inclusive QuickBooks upper bound is the previous day.
    expect(stmt).toContain("TxnDate <= '2026-07-04'");
    expect(stmt).toContain("ORDERBY MetaData.CreateTime DESC");
    expect((mockQuickbooksRequest.mock.calls[0]![0] as { realmId: string }).realmId).toBe(
      "realm-123",
    );
  });

  it("pushes a single-customer filter into the query", async () => {
    armProvider([wire("1", "2026-07-02", 100, 0)]);
    await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null, filters: { customer: ["77"] } }),
    );
    expect(lastStatements()[0]).toContain("CustomerRef = '77'");
  });

  it("pages with STARTPOSITION until a short page ends the scan", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 20 }, (_, i) =>
      wire(String(i + 1), "2026-07-02", 10, 0),
    );
    armProvider(rows);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null }),
    );
    expect(r.value).toBe(PAGE_SIZE + 20);
    expect(r.completeness.state).toBe("complete");
    const stmts = lastStatements();
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("STARTPOSITION 1");
    expect(stmts[1]).toContain(`STARTPOSITION ${PAGE_SIZE + 1}`);
  });

  it("counts each invoice exactly once across a page boundary", async () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
      wire(String(i + 1), "2026-07-02", 100, 0),
    );
    armProvider(rows);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "total_invoiced_amount", dimension: null }),
    );
    expect(r.value).toBe((PAGE_SIZE + 1) * 100);
  });

  it("stops at the declared cap and reports scan_capped instead of truncating silently", async () => {
    // Every page comes back full → the wrapper always says "there may be more".
    mockQuickbooksRequest.mockImplementation(async () => ({
      QueryResponse: {
        Invoice: Array.from({ length: PAGE_SIZE }, (_, i) =>
          wire(`x${i}`, "2026-07-02", 10, 0),
        ),
      },
    }));
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null }),
    );
    expect(r.value).toBe(QUICKBOOKS_SCAN_CAP);
    expect(r.completeness).toEqual({
      state: "scan_capped",
      detail: expect.stringContaining("2000"),
    });
    expect(r.warnings.join(" ")).toMatch(/may be incomplete/i);
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(QUICKBOOKS_SCAN_CAP / PAGE_SIZE);
  });

  it("reads QuickBooks major-unit decimals into exact totals", async () => {
    armProvider([
      wire("1", "2026-07-02", 362.07, 362.07),
      wire("2", "2026-07-02", 0.1, 0),
      wire("3", "2026-07-02", 0.2, 0),
    ]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "total_invoiced_amount", dimension: null }),
    );
    expect(r.value).toBe(362.37);
  });

  it("groups by customer without emitting the QuickBooks customer id", async () => {
    armProvider([
      wire("1", "2026-07-02", 100, 100, { customerId: "77", customerName: "Acme Ltd" }),
      wire("2", "2026-07-03", 50, 50, { customerId: "88", customerName: "Beta LLC" }),
    ]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "outstanding_balance", dimension: "customer" }),
    );
    expect(r.rows!.map((row) => row.label)).toEqual(["Acme Ltd", "Beta LLC"]);
    expect(r.rows!.map((row) => row.id)).not.toContain("77");
    expect(r.rows!.map((row) => row.id)).not.toContain("88");
    expect(r.rows!.every((row) => /^[0-9a-f]{16}$/.test(row.id))).toBe(true);
  });

  it("keys customers differently per account so a key cannot be correlated across accounts", async () => {
    armProvider([wire("1", "2026-07-02", 100, 100, { customerId: "77" })]);
    const a = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "outstanding_balance", dimension: "customer" }),
    );
    const b = await quickbooksInvoicesAdapter.query(
      { ...CTX, accountId: "acct-2" },
      q({ measure: "outstanding_balance", dimension: "customer" }),
    );
    expect(a.rows![0]!.id).not.toBe(b.rows![0]!.id);
  });

  it("translates an explicit customer series from picker ids into opaque keys", async () => {
    armProvider([
      wire("1", "2026-07-02", 100, 0, { customerId: "77", customerName: "Acme Ltd" }),
      wire("2", "2026-07-03", 50, 0, { customerId: "88", customerName: "Beta LLC" }),
    ]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({
        measure: "invoice_count",
        dimension: "time",
        timeGrain: "day",
        series: { by: "customer", mode: "explicit", ids: ["77", "88"] },
      }),
    );
    expect(r.series!.map((s) => s.label)).toEqual(["Acme Ltd", "Beta LLC"]);
    expect(r.series!.map((s) => s.id)).not.toContain("77");
    expect(r.series![0]!.values).toEqual([0, 1, 0, 0]);
  });

  it("scans a second window for a period comparison", async () => {
    armProvider([wire("1", "2026-07-02", 100, 0)]);
    await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null, compare: "previous_period" }),
    );
    const stmts = lastStatements();
    expect(stmts).toHaveLength(2);
    expect(stmts[1]).toContain("TxnDate >= '2026-06-27'");
    expect(stmts[1]).toContain("TxnDate <= '2026-06-30'");
  });

  it("handles an empty company without error", async () => {
    armProvider([]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "invoice_count", dimension: null }),
    );
    expect(r.value).toBe(0);
    expect(r.completeness.state).toBe("complete");
    expect(r.warnings).toEqual([]);
  });

  it("never emits invoice ids, doc numbers, emails, memos or line items", async () => {
    armProvider([wire("1", "2026-07-02", 100, 100)]);
    const r = await quickbooksInvoicesAdapter.query(
      CTX,
      q({ measure: "outstanding_balance", dimension: "customer" }),
    );
    const json = JSON.stringify(r);
    for (const leak of [
      "INV-1", "ap@acme.example", "thanks for your business", "internal note",
      "Consulting", "realm-123", "tok_test", "NotSet",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("asks the caller to connect QuickBooks when no integration exists", async () => {
    mockGetActiveForExecution.mockResolvedValue(null);
    await expect(
      quickbooksInvoicesAdapter.query(CTX, q({ measure: "invoice_count", dimension: null })),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it.each([
    ["401 after refresh", new Unauthorized401Error("quickbooks")],
    [
      "reconnect required",
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "quickbooks",
        providerAccountId: "realm-123",
        reason: "refresh_failed",
      }),
    ],
  ])("maps %s to RECONNECT_REQUIRED", async (_label, err) => {
    mockQuickbooksRequest.mockRejectedValue(err);
    await expect(
      quickbooksInvoicesAdapter.query(CTX, q({ measure: "invoice_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RECONNECT_REQUIRED" });
  });

  it("maps a QuickBooks 429 to RATE_LIMITED", async () => {
    mockQuickbooksRequest.mockRejectedValue(new RateLimitedError(30, "tid-1"));
    await expect(
      quickbooksInvoicesAdapter.query(CTX, q({ measure: "invoice_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps an unexpected provider failure to a safe PROVIDER_ERROR", async () => {
    mockQuickbooksRequest.mockRejectedValue(
      new Error("QuickBooks Fault: ValidationFault realm 123456789 token abc"),
    );
    await expect(
      quickbooksInvoicesAdapter.query(CTX, q({ measure: "invoice_count", dimension: null })),
    ).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Couldn't load QuickBooks data.",
    });
  });
});
