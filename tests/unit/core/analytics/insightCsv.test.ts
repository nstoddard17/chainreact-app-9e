import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import {
  INSIGHT_CSV_COLUMNS,
  escapeCsvField,
  insightCsvFilename,
  insightResultToCsv,
  insightResultToCsvRows,
  isIncompleteResult,
  neutralizeFormula,
} from "@/core/analytics/insightCsv";
import { formatInsightValue } from "@/features/analytics/insights/formatInsightValue";

/**
 * CD-5A — Custom Insight CSV export.
 *
 * Two things are load-bearing here. First, HONESTY: values are machine-usable,
 * null is not zero, and the completeness/freshness of the data travels inside
 * the file so a partial export cannot be mistaken for a full one. Second,
 * SAFETY: a provider-supplied label can never execute as a spreadsheet formula,
 * and no identifier the chart wasn't already showing can reach the file.
 */

const EXPORTED_AT = "2026-07-25T09:30:00.000Z";
const OPTS = { exportedAt: EXPORTED_AT, formatValue: formatInsightValue };

function baseResult(overrides: Partial<ConnectedAnalyticsResult> = {}): ConnectedAnalyticsResult {
  return {
    kind: "kpi",
    source: {
      sourceId: "shopify",
      sourceLabel: "Shopify",
      datasetId: "orders",
      datasetLabel: "Orders",
    },
    measure: { id: "order_count", label: "Orders" },
    dimension: null,
    grain: null,
    range: { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "cached", ageSeconds: 120, ttlSeconds: 600 },
    completeness: { state: "complete" },
    value: 1234,
    warnings: [],
    ...overrides,
  };
}

function parse(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.split("\r\n");
  return {
    header: lines[0]!.split(","),
    rows: lines.slice(1).map((l) => splitCsvLine(l)),
  };
}

/** Minimal RFC-4180 reader, so the tests verify real parseability. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const col = (header: string[], row: string[], name: string): string =>
  row[header.indexOf(name)] ?? "";

describe("column layout", () => {
  it("emits a stable, documented header", () => {
    const { header } = parse(insightResultToCsv(baseResult(), OPTS));
    expect(header).toEqual([...INSIGHT_CSV_COLUMNS]);
  });

  it("is deterministic — the same result serializes identically twice", () => {
    const result = baseResult();
    expect(insightResultToCsv(result, OPTS)).toBe(insightResultToCsv(result, OPTS));
  });

  it("repeats query metadata on every row so each row stands alone", () => {
    const csv = insightResultToCsv(
      baseResult({
        kind: "time_series",
        grain: "day",
        dimension: "time",
        buckets: [
          { start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z", label: "Jul 1" },
          { start: "2026-07-02T00:00:00.000Z", end: "2026-07-03T00:00:00.000Z", label: "Jul 2" },
        ],
        series: [{ id: "all", label: "Orders", values: [3, 5] }],
        value: undefined,
      }),
      OPTS,
    );
    const { header, rows } = parse(csv);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(col(header, row, "source")).toBe("Shopify");
      expect(col(header, row, "dataset")).toBe("Orders");
      expect(col(header, row, "measure")).toBe("Orders");
      expect(col(header, row, "resolved_grain")).toBe("day");
      expect(col(header, row, "completeness")).toBe("complete");
    }
  });
});

describe("result kinds", () => {
  it("exports a KPI as a single row", () => {
    const { header, rows } = parse(insightResultToCsv(baseResult(), OPTS));
    expect(rows).toHaveLength(1);
    expect(col(header, rows[0]!, "value")).toBe("1234");
    expect(col(header, rows[0]!, "value_label")).toBe("1,234");
    expect(col(header, rows[0]!, "period")).toBe(""); // no comparison → no period tag
  });

  it("exports one row per bucket per series", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "time_series",
          grain: "day",
          buckets: [
            { start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z", label: "Jul 1" },
            { start: "2026-07-02T00:00:00.000Z", end: "2026-07-03T00:00:00.000Z", label: "Jul 2" },
          ],
          series: [
            { id: "a", label: "Digest", values: [3, 5] },
            { id: "b", label: "Sync", values: [1, 2] },
          ],
          value: undefined,
        }),
        OPTS,
      ),
    );
    expect(rows).toHaveLength(4); // 2 buckets × 2 series
    expect(col(header, rows[0]!, "series")).toBe("Digest");
    expect(col(header, rows[0]!, "bucket_start")).toBe("2026-07-01T00:00:00.000Z");
    expect(col(header, rows[2]!, "series")).toBe("Sync");
  });

  it("exports one row per category", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "categorical",
          dimension: "status",
          rows: [
            { id: "paid", label: "Paid", value: 60 },
            { id: "refunded", label: "Refunded", value: 30 },
          ],
          value: undefined,
        }),
        OPTS,
      ),
    );
    expect(rows).toHaveLength(2);
    expect(col(header, rows[0]!, "category")).toBe("Paid");
    expect(col(header, rows[0]!, "value")).toBe("60");
  });

  it("exports an empty result as a header with no data rows", () => {
    const csv = insightResultToCsv(
      baseResult({ kind: "categorical", rows: [], value: undefined }),
      OPTS,
    );
    expect(csv.split("\r\n")).toHaveLength(1);
    expect(csv).toBe(INSIGHT_CSV_COLUMNS.join(","));
  });
});

describe("comparison rows", () => {
  it("gives previous values their own rows, never a duplicated ambiguous row", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          compare: {
            previousValue: 1000,
            previousRange: { from: "2026-05-31T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
          },
        }),
        OPTS,
      ),
    );
    expect(rows).toHaveLength(2);
    expect(col(header, rows[0]!, "period")).toBe("current");
    expect(col(header, rows[0]!, "value")).toBe("1234");
    expect(col(header, rows[1]!, "period")).toBe("previous");
    expect(col(header, rows[1]!, "value")).toBe("1000");
    // The previous row carries the previous window, so no cell is ambiguous.
    expect(col(header, rows[1]!, "range_start")).toBe("2026-05-31T00:00:00.000Z");
    expect(col(header, rows[1]!, "range_end")).toBe("2026-07-01T00:00:00.000Z");
  });

  it("tags every time-series comparison row and keeps bucket alignment", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "time_series",
          grain: "day",
          buckets: [
            { start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z", label: "Jul 1" },
            { start: "2026-07-02T00:00:00.000Z", end: "2026-07-03T00:00:00.000Z", label: "Jul 2" },
          ],
          series: [{ id: "all", label: "Orders", values: [3, 5] }],
          compareSeries: {
            previousRange: { from: "2026-06-29T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
            values: [2, null],
          },
          value: undefined,
        }),
        OPTS,
      ),
    );
    expect(rows).toHaveLength(4); // 2 current + 2 previous
    expect(rows.filter((r) => col(header, r, "period") === "current")).toHaveLength(2);
    const previous = rows.filter((r) => col(header, r, "period") === "previous");
    expect(previous).toHaveLength(2);
    expect(col(header, previous[0]!, "value")).toBe("2");
    expect(col(header, previous[1]!, "value")).toBe(""); // null stays empty
  });
});

describe("value representation", () => {
  it("exports counts as plain numbers, not formatted strings", () => {
    const { header, rows } = parse(insightResultToCsv(baseResult({ value: 1234567 }), OPTS));
    expect(col(header, rows[0]!, "value")).toBe("1234567");
    expect(col(header, rows[0]!, "value_label")).toBe("1,234,567");
  });

  it("exports currency as a numeric major-unit amount beside its ISO code", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({ valueMeta: { unit: "currency", currency: "EUR" }, value: 1234.56 }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "value")).toBe("1234.56");
    expect(col(header, rows[0]!, "currency")).toBe("EUR");
    expect(col(header, rows[0]!, "unit")).toBe("currency");
  });

  it("handles a zero-decimal currency without inventing decimals", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({ valueMeta: { unit: "currency", currency: "JPY" }, value: 5000 }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "value")).toBe("5000");
    expect(col(header, rows[0]!, "currency")).toBe("JPY");
  });

  it("exports a percent as the decimal fraction it is stored as", () => {
    const { header, rows } = parse(
      insightResultToCsv(baseResult({ valueMeta: { unit: "percent" }, value: 0.42 }), OPTS),
    );
    expect(col(header, rows[0]!, "value")).toBe("0.42");
    expect(col(header, rows[0]!, "unit")).toBe("percent");
    expect(col(header, rows[0]!, "value_label")).toBe("42%");
  });

  it("exports a duration as its canonical numeric value plus the unit", () => {
    const { header, rows } = parse(
      insightResultToCsv(baseResult({ valueMeta: { unit: "milliseconds" }, value: 90000 }), OPTS),
    );
    expect(col(header, rows[0]!, "value")).toBe("90000");
    expect(col(header, rows[0]!, "unit")).toBe("milliseconds");
  });

  it("keeps null and zero distinct", () => {
    const nullRow = parse(insightResultToCsv(baseResult({ value: null }), OPTS));
    expect(col(nullRow.header, nullRow.rows[0]!, "value")).toBe("");
    const zeroRow = parse(insightResultToCsv(baseResult({ value: 0 }), OPTS));
    expect(col(zeroRow.header, zeroRow.rows[0]!, "value")).toBe("0");
  });

  it("preserves a legitimate negative number as a number", () => {
    // The formula guard must never corrupt real numeric data.
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({ valueMeta: { unit: "currency", currency: "USD" }, value: -12.5 }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "value")).toBe("-12.5");
  });

  it("exports a very large number without exponent notation surprises", () => {
    const { header, rows } = parse(insightResultToCsv(baseResult({ value: 9007199254740991 }), OPTS));
    expect(col(header, rows[0]!, "value")).toBe("9007199254740991");
  });

  it("writes dates and the export timestamp in ISO form", () => {
    const { header, rows } = parse(insightResultToCsv(baseResult(), OPTS));
    expect(col(header, rows[0]!, "range_start")).toBe("2026-07-01T00:00:00.000Z");
    expect(col(header, rows[0]!, "updated_at")).toBe(EXPORTED_AT);
  });
});

describe("escaping", () => {
  it("quotes commas, quotes and newlines, and doubles inner quotes", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("round-trips a label containing every awkward character", () => {
    const nasty = 'Paid, "urgent"\nrush';
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "categorical",
          rows: [{ id: "x", label: nasty, value: 1 }],
          value: undefined,
        }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "category")).toBe(nasty);
  });

  it("preserves unicode", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "categorical",
          rows: [{ id: "x", label: "Café — 日本語 🎉", value: 1 }],
          value: undefined,
        }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "category")).toBe("Café — 日本語 🎉");
  });
});

describe("spreadsheet formula injection", () => {
  it("neutralizes every dangerous leading character in TEXT cells", () => {
    for (const payload of ["=SUM(A1)", "+1+1", "-1+1", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(neutralizeFormula(payload).startsWith("'")).toBe(true);
    }
    expect(neutralizeFormula("safe")).toBe("safe");
    expect(neutralizeFormula("")).toBe("");
  });

  it("neutralizes a hostile category label coming from a provider", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          kind: "categorical",
          rows: [{ id: "x", label: '=HYPERLINK("http://evil","click")', value: 1 }],
          value: undefined,
        }),
        OPTS,
      ),
    );
    const cell = col(header, rows[0]!, "category");
    expect(cell.startsWith("'=")).toBe(true);
  });

  it("neutralizes hostile warning text too", () => {
    const { header, rows } = parse(
      insightResultToCsv(baseResult({ warnings: ["=cmd|'/c calc'!A1"] }), OPTS),
    );
    expect(col(header, rows[0]!, "warning").startsWith("'=")).toBe(true);
  });

  it("does NOT prefix numeric columns, so negatives survive", () => {
    const { header, rows } = parse(insightResultToCsv(baseResult({ value: -500 }), OPTS));
    expect(col(header, rows[0]!, "value")).toBe("-500");
    expect(col(header, rows[0]!, "value").startsWith("'")).toBe(false);
  });
});

describe("partial, cached and stale exports", () => {
  it("carries scan-capped completeness with its detail", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({
          completeness: { state: "scan_capped", detail: "Based on the first 2000 orders." },
        }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "completeness")).toBe(
      "scan_capped: Based on the first 2000 orders.",
    );
  });

  it("uses stable machine-readable completeness values", () => {
    for (const state of ["complete", "scan_capped", "row_capped", "provider_sampled", "partially_synced"] as const) {
      const { header, rows } = parse(
        insightResultToCsv(baseResult({ completeness: { state } }), OPTS),
      );
      expect(col(header, rows[0]!, "completeness")).toBe(state);
    }
  });

  it("marks a stale result as stale rather than merely cached", () => {
    const { header, rows } = parse(
      insightResultToCsv(
        baseResult({ freshness: { mode: "cached", ageSeconds: 4000, stale: true } }),
        OPTS,
      ),
    );
    expect(col(header, rows[0]!, "freshness")).toBe("stale");
  });

  it("carries the scan-bias warning the result supplied", () => {
    const { header, rows } = parse(
      insightResultToCsv(baseResult({ warnings: ["Newest orders first."] }), OPTS),
    );
    expect(col(header, rows[0]!, "warning")).toBe("Newest orders first.");
  });

  it("flags exactly the results a user should be told about", () => {
    expect(isIncompleteResult(baseResult())).toBe(false);
    expect(isIncompleteResult(baseResult({ completeness: { state: "scan_capped" } }))).toBe(true);
    expect(
      isIncompleteResult(baseResult({ freshness: { mode: "cached", stale: true } })),
    ).toBe(true);
  });
});

describe("no forbidden fields reach the file", () => {
  it("exports category LABELS but never their internal ids", () => {
    const csv = insightResultToCsv(
      baseResult({
        kind: "categorical",
        rows: [{ id: "cus_SECRET123", label: "Acme Corp", value: 5 }],
        value: undefined,
      }),
      OPTS,
    );
    expect(csv).toContain("Acme Corp");
    expect(csv).not.toContain("cus_SECRET123");
  });

  it("never carries a drill-down token, source id or dataset id", () => {
    const csv = insightResultToCsv(
      baseResult({ drilldown: "tok_drill_abc123", value: 7 }),
      OPTS,
    );
    expect(csv).not.toContain("tok_drill_abc123");
    // Only the human labels appear, not the machine ids.
    expect(csv).not.toContain("order_count");
    expect(csv).toContain("Orders");
  });

  it("has no column that could hold an account, user or credential id", () => {
    const forbidden = ["account", "user", "integration", "token", "cursor", "scope", "cache"];
    for (const column of INSIGHT_CSV_COLUMNS) {
      for (const word of forbidden) {
        expect(column).not.toContain(word);
      }
    }
  });
});

describe("filename", () => {
  it("builds a safe, dated, lowercase name from labels and the widget title", () => {
    expect(
      insightCsvFilename(baseResult(), { widgetTitle: "Order count", exportedAt: EXPORTED_AT }),
    ).toBe("shopify-orders-order-count-2026-07-25.csv");
  });

  it("falls back to the measure label when the widget has no title", () => {
    expect(insightCsvFilename(baseResult(), { exportedAt: EXPORTED_AT })).toBe(
      "shopify-orders-orders-2026-07-25.csv",
    );
  });

  it("strips characters that are unsafe in a filename", () => {
    const name = insightCsvFilename(baseResult(), {
      widgetTitle: 'Q3/Q4 "revenue" \\ <report>: *?|',
      exportedAt: EXPORTED_AT,
    });
    expect(name).toMatch(/^[a-z0-9-]+\.csv$/);
    expect(name.endsWith("-2026-07-25.csv")).toBe(true);
  });

  it("bounds the length of a very long title", () => {
    const name = insightCsvFilename(baseResult(), {
      widgetTitle: "x".repeat(400),
      exportedAt: EXPORTED_AT,
    });
    expect(name.length).toBeLessThanOrEqual(80 + "-2026-07-25.csv".length);
  });

  it("keeps unicode titles usable rather than producing an empty name", () => {
    const name = insightCsvFilename(baseResult(), {
      widgetTitle: "日本語レポート",
      exportedAt: EXPORTED_AT,
    });
    expect(name.endsWith(".csv")).toBe(true);
    expect(name.length).toBeGreaterThan(".csv".length);
  });
});

describe("row builder", () => {
  it("returns structured rows for callers that want the data, not a string", () => {
    const rows = insightResultToCsvRows(baseResult(), OPTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe(1234);
    expect(rows[0]!.source).toBe("Shopify");
  });
});
