"use client";

import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import {
  insightCsvFilename,
  insightResultToCsv,
} from "@/core/analytics/insightCsv";
import { formatInsightValue } from "./formatInsightValue";

/**
 * Browser download of one Custom Insight's returned data (CD-5A).
 *
 * A purely CLIENT-SIDE export of the bounded aggregate the widget already
 * fetched and rendered: no request is made, so exporting cannot re-query a
 * provider, consume the rate limiter, mutate the snapshot cache, widen a scan,
 * or reveal a field the chart was not already showing.
 *
 * Distinct from the dashboard's "Export dashboard (JSON)", which saves the
 * dashboard's CONFIGURATION. This saves one widget's DATA.
 */
export function exportInsightCsv(
  result: ConnectedAnalyticsResult,
  opts: { widgetTitle?: string; now?: Date } = {},
): void {
  const exportedAt = (opts.now ?? new Date()).toISOString();
  const csv = insightResultToCsv(result, { exportedAt, formatValue: formatInsightValue });
  const filename = insightCsvFilename(result, {
    ...(opts.widgetTitle !== undefined ? { widgetTitle: opts.widgetTitle } : {}),
    exportedAt,
  });

  // A BOM keeps Excel from mangling non-ASCII labels on open. Written as an
  // escape so the source file contains no invisible character.
  const BOM = "﻿";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
