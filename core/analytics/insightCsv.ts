import type {
  ConnectedAnalyticsResult,
  ConnectedValueMeta,
} from "@/contracts/connectedAnalytics";

/**
 * Custom Insight → CSV (Slice ANALYTICS-CONNECTED-DATA-CD-5A).
 *
 * PURE — no DOM, no I/O, no clock beyond what the caller passes. The browser
 * download wrapper lives in `features/analytics/insights/exportInsightCsv.ts`.
 *
 * ── What this can and cannot contain ────────────────────────────────────────
 * The ONLY input is a `ConnectedAnalyticsResult` — the bounded aggregate the
 * server already returned to an authorized browser. There is no provider call,
 * no record fetch and no widened scan, so the CSV cannot leak anything the
 * chart was not already showing: no account/user/integration ids, no provider
 * record ids, no customer names, no tokens, no cursors, no raw payloads. The
 * one identifier-shaped field a result carries is a category `id` for chart
 * keying; it is deliberately NOT exported — only the display `label` is.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * One LONG-FORM table covers every result kind, so a spreadsheet built against
 * a KPI still opens correctly when the same question is re-charted as a line.
 * Every row repeats the query-level metadata, which keeps each row independently
 * interpretable — including whether the data was complete and how fresh it was.
 *
 * Values are MACHINE-USABLE: a count is a number, currency is a numeric
 * major-unit amount beside its ISO code, a percent is the decimal fraction
 * (0.42) it is stored as. Null is an empty cell; zero is `0`. The formatted
 * display string is offered alongside in `value_label`, never instead.
 */

export const INSIGHT_CSV_COLUMNS = [
  "source",
  "dataset",
  "measure",
  "range_start",
  "range_end",
  "resolved_grain",
  "dimension",
  "category",
  "series",
  "period",
  "bucket_start",
  "bucket_end",
  "value",
  "value_label",
  "unit",
  "currency",
  "freshness",
  "updated_at",
  "completeness",
  "warning",
] as const;

export type InsightCsvColumn = (typeof INSIGHT_CSV_COLUMNS)[number];

/** A cell is a number, a string, or absent. Nulls become empty cells. */
type Cell = string | number | null;
type CsvRow = Record<InsightCsvColumn, Cell>;

/** Columns whose values are numeric and must never be formula-escaped. */
const NUMERIC_COLUMNS: ReadonlySet<InsightCsvColumn> = new Set(["value"]);

export interface InsightCsvOptions {
  /** ISO instant the export was produced; supplied by the caller (purity). */
  exportedAt: string;
  /** Formats a value for the human-readable `value_label` column. */
  formatValue: (value: number | null, meta: ConnectedValueMeta) => string;
}

// ── Escaping ─────────────────────────────────────────────────────────────────

/**
 * Characters that make a spreadsheet treat a TEXT cell as a formula. A leading
 * one is neutralized with a zero-width-safe apostrophe prefix, the convention
 * Excel/Sheets both honour, so `=SUM(A1)` in a provider-supplied label opens as
 * literal text instead of executing.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Neutralize a TEXT cell that would otherwise be read as a formula.
 *
 * Numeric columns bypass this entirely — a legitimate negative number like
 * `-12.5` must stay a number, so blanket-prefixing every value would corrupt
 * real data. That is why the serializer routes cells by declared column type
 * rather than by inspecting the string.
 */
export function neutralizeFormula(text: string): string {
  if (text.length === 0) return text;
  return FORMULA_PREFIXES.some((p) => text.startsWith(p)) ? `'${text}` : text;
}

/** RFC-4180 field: quote when it contains a comma, quote, CR or LF; "" escapes ". */
export function escapeCsvField(text: string): string {
  const needsQuotes = /[",\r\n]/.test(text);
  const body = text.replace(/"/g, '""');
  return needsQuotes ? `"${body}"` : body;
}

function renderCell(column: InsightCsvColumn, value: Cell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    // Non-finite never reaches a spreadsheet as "NaN"/"Infinity".
    return Number.isFinite(value) ? String(value) : "";
  }
  const text = NUMERIC_COLUMNS.has(column) ? value : neutralizeFormula(value);
  return escapeCsvField(text);
}

// ── Row building ─────────────────────────────────────────────────────────────

function baseRow(
  result: ConnectedAnalyticsResult,
  opts: InsightCsvOptions,
): CsvRow {
  const warnings = result.warnings.length > 0 ? result.warnings.join(" | ") : null;
  const completeness =
    result.completeness.detail && result.completeness.detail.length > 0
      ? `${result.completeness.state}: ${result.completeness.detail}`
      : result.completeness.state;
  return {
    source: result.source.sourceLabel,
    dataset: result.source.datasetLabel,
    measure: result.measure.label,
    range_start: result.range.from,
    range_end: result.range.to,
    resolved_grain: result.grain,
    dimension: result.dimension,
    category: null,
    series: null,
    period: null,
    bucket_start: null,
    bucket_end: null,
    value: null,
    value_label: null,
    unit: result.valueMeta.unit,
    currency: result.valueMeta.currency ?? null,
    freshness: freshnessLabel(result),
    updated_at: opts.exportedAt,
    completeness,
    warning: warnings,
  };
}

/** `live` · `cached` · `stale` — stable machine-readable values. */
function freshnessLabel(result: ConnectedAnalyticsResult): string {
  if (result.freshness.stale === true) return "stale";
  return result.freshness.mode;
}

function withValue(
  row: CsvRow,
  value: number | null,
  result: ConnectedAnalyticsResult,
  opts: InsightCsvOptions,
): CsvRow {
  return {
    ...row,
    value,
    value_label: opts.formatValue(value, result.valueMeta),
  };
}

/**
 * Long-form rows for any result kind.
 *
 * A comparison never collapses into the current row: previous values get their
 * own rows tagged `period = previous`, carrying the previous window in
 * `range_start`/`range_end`, so no cell is ambiguous about which period it
 * describes. Consumers compute their own deltas.
 */
export function insightResultToCsvRows(
  result: ConnectedAnalyticsResult,
  opts: InsightCsvOptions,
): CsvRow[] {
  const base = baseRow(result, opts);
  const rows: CsvRow[] = [];
  const hasCompare =
    result.compare != null || result.compareSeries != null;
  const currentPeriod = hasCompare ? "current" : null;

  if (result.kind === "time_series") {
    const buckets = result.buckets ?? [];
    const series = result.series ?? [];
    for (const s of series) {
      buckets.forEach((b, i) => {
        rows.push(
          withValue(
            {
              ...base,
              series: s.label,
              period: currentPeriod,
              bucket_start: b.start,
              bucket_end: b.end,
              category: b.label,
            },
            s.values[i] ?? null,
            result,
            opts,
          ),
        );
      });
    }
    const compare = result.compareSeries;
    if (compare) {
      buckets.forEach((b, i) => {
        rows.push(
          withValue(
            {
              ...base,
              range_start: compare.previousRange.from,
              range_end: compare.previousRange.to,
              series: series[0]?.label ?? result.measure.label,
              period: "previous",
              // The previous window is aligned by relative POSITION, so the
              // bucket named here is the current one it lines up against.
              bucket_start: b.start,
              bucket_end: b.end,
              category: b.label,
            },
            compare.values[i] ?? null,
            result,
            opts,
          ),
        );
      });
    }
    return rows;
  }

  if (result.kind === "categorical" || result.kind === "table") {
    for (const r of result.rows ?? []) {
      rows.push(
        withValue(
          { ...base, category: r.label, period: currentPeriod },
          r.value,
          result,
          opts,
        ),
      );
    }
    return rows;
  }

  // KPI.
  rows.push(withValue({ ...base, period: currentPeriod }, result.value ?? null, result, opts));
  if (result.compare) {
    rows.push(
      withValue(
        {
          ...base,
          range_start: result.compare.previousRange.from,
          range_end: result.compare.previousRange.to,
          period: "previous",
        },
        result.compare.previousValue,
        result,
        opts,
      ),
    );
  }
  return rows;
}

/** Serialize a result to a complete CSV document (header + rows, CRLF). */
export function insightResultToCsv(
  result: ConnectedAnalyticsResult,
  opts: InsightCsvOptions,
): string {
  const rows = insightResultToCsvRows(result, opts);
  const lines = [INSIGHT_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(INSIGHT_CSV_COLUMNS.map((c) => renderCell(c, row[c])).join(","));
  }
  return lines.join("\r\n");
}

// ── Filename ─────────────────────────────────────────────────────────────────

const MAX_FILENAME_STEM = 80;

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Filesystem-safe download name, e.g.
 * `shopify-orders-order-count-2026-07-25.csv`.
 *
 * Built only from the widget title, the source/dataset LABELS and the export
 * date — never an account, provider or record identifier. A customer name can
 * only appear if the user already put it in their own widget title.
 */
export function insightCsvFilename(
  result: ConnectedAnalyticsResult,
  opts: { widgetTitle?: string; exportedAt: string },
): string {
  const day = opts.exportedAt.slice(0, 10);
  const parts = [
    result.source.sourceLabel,
    result.source.datasetLabel,
    opts.widgetTitle && opts.widgetTitle.trim().length > 0
      ? opts.widgetTitle
      : result.measure.label,
  ];
  const stem = slugify(parts.join("-")).slice(0, MAX_FILENAME_STEM).replace(/-+$/, "");
  return `${stem.length > 0 ? stem : "insight"}-${day}.csv`;
}

/** True when the export carries data the user should know is partial. */
export function isIncompleteResult(result: ConnectedAnalyticsResult): boolean {
  return result.completeness.state !== "complete" || result.freshness.stale === true;
}
