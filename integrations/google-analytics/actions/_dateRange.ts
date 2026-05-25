import { z } from "zod";

/**
 * GA4 date-range preset resolution — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * Shared by `run_report` + `run_pivot_report`. Ports V1's preset set
 * (today / yesterday / last_7/30/90_days / this_month / last_month /
 * custom) into pure, testable date math. `custom` requires explicit
 * `startDate` / `endDate` (enforced by the schemas' superRefine).
 *
 * Returns ISO `YYYY-MM-DD` strings (GA4 Data API `dateRanges` shape).
 */
export const DateRangePresetSchema = z.enum([
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "custom",
]);
export type DateRangePreset = z.infer<typeof DateRangePresetSchema>;

function fmt(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function resolveDateRange(
  preset: DateRangePreset,
  startDate?: string,
  endDate?: string,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysAgo = (n: number): Date => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  };

  switch (preset) {
    case "today":
      return { startDate: fmt(today), endDate: fmt(today) };
    case "yesterday":
      return { startDate: fmt(daysAgo(1)), endDate: fmt(daysAgo(1)) };
    case "last_7_days":
      return { startDate: fmt(daysAgo(7)), endDate: fmt(today) };
    case "last_30_days":
      return { startDate: fmt(daysAgo(30)), endDate: fmt(today) };
    case "last_90_days":
      return { startDate: fmt(daysAgo(90)), endDate: fmt(today) };
    case "this_month":
      return {
        startDate: fmt(
          new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
        ),
        endDate: fmt(today),
      };
    case "last_month": {
      const firstOfLast = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
      );
      const lastOfLast = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0),
      );
      return { startDate: fmt(firstOfLast), endDate: fmt(lastOfLast) };
    }
    case "custom":
      if (!startDate || !endDate) {
        throw new Error(
          "custom date range requires both startDate and endDate.",
        );
      }
      return { startDate, endDate };
  }
}

/**
 * Normalize GA4 report headers + rows into plain records:
 * `[{ <dimensionName>: value, <metricName>: number }]`. Shared by the
 * report handlers. Pure.
 */
export function normalizeReportRows(input: {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}): Array<Record<string, string | number>> {
  const dimNames = (input.dimensionHeaders ?? []).map((h) => h.name ?? "");
  const metNames = (input.metricHeaders ?? []).map((h) => h.name ?? "");
  return (input.rows ?? []).map((row) => {
    const record: Record<string, string | number> = {};
    (row.dimensionValues ?? []).forEach((dv, i) => {
      const key = dimNames[i] ?? `dimension_${i}`;
      record[key] = dv.value ?? "";
    });
    (row.metricValues ?? []).forEach((mv, i) => {
      const key = metNames[i] ?? `metric_${i}`;
      record[key] = Number.parseFloat(mv.value ?? "0");
    });
    return record;
  });
}
