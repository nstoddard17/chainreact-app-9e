import type { InsightWidgetConfig } from "@/contracts/analytics";
import type { ConnectedRefine } from "@/contracts/connectedAnalytics";
import { describeWindow } from "@/core/analytics/insightRange";
import {
  findDataset,
  findSource,
  type InsightCatalog,
  type InsightDataset,
} from "./insightCatalog";
import {
  insightDraftFromConfig,
  reconcileInsightDraft,
  type InsightDraft,
} from "./reconcileInsightConfig";
import { insightConfigFromDraft, insightDraftIssues } from "./insightQueryFromConfig";

/**
 * PURE query refinement for drill-down exploration
 * (Slice ANALYTICS-CONNECTED-DATA-CD-5B).
 *
 * Turns (current saved/explored config + one server-issued refinement) into
 * the next explored config. Everything narrows through ordinary validated
 * query fields — a bucket's exact `[start, end)` boundaries become the range,
 * a category's canonical value becomes a declared filter — so the server's
 * validator re-checks every explored query exactly like a hand-built one.
 *
 * All reconciliation (grain fallback, compare clearing, chart validity) is
 * DELEGATED to `reconcileInsightDraft` — one rulebook for the builder and the
 * exploration path, so drilling can never produce a query the builder itself
 * would refuse.
 */

/** How deep an exploration can go before further drills are disabled. */
export const MAX_EXPLORATION_DEPTH = 5;

export type InsightDrill =
  /**
   * A time bucket, using the server-supplied exact boundaries verbatim.
   * `end` is the exclusive instant the engine returned; the UI renders it
   * back through the CD-5A inclusive-end convention.
   */
  | { kind: "bucket"; start: string; end: string; label: string; period: "current" | "previous" }
  /** The whole previous window of a compared KPI (server-supplied range). */
  | { kind: "previous_window"; from: string; to: string }
  /** A category / series value carrying a server-issued refinement. */
  | { kind: "filter"; refine: ConnectedRefine; fromSeries: boolean };

export interface InsightDrillOutcome {
  config: InsightWidgetConfig;
  /** Short breadcrumb label ("Paid", "Jul 1 – Jul 31, 2026", "Previous period"). */
  crumb: string;
  /** Sentence describing the applied refinement, shown near the chart. */
  description: string;
  /** Reconciliation notes ("using automatic grouping instead", …). */
  notes: string[];
}

function filterFieldLabel(dataset: InsightDataset, key: string): string {
  return dataset.filters.find((f) => f.id === key)?.label ?? key;
}

/**
 * Apply one drill to the current config. Returns the refined config or a
 * customer-safe error string when the candidate would not be a valid query
 * (in which case nothing is submitted — the server never sees it).
 */
export function refineInsightConfig(
  catalog: InsightCatalog,
  config: InsightWidgetConfig,
  drill: InsightDrill,
  nowMs: number,
): InsightDrillOutcome | { error: string } {
  const source = findSource(catalog, config.source);
  const dataset = source ? findDataset(source, config.dataset) : null;
  if (!source || !dataset) return { error: "This data isn't available anymore." };

  const draft: InsightDraft = insightDraftFromConfig(config);
  let crumb: string;
  let description: string;

  if (drill.kind === "bucket") {
    // The engine's exact boundaries pass through verbatim — `end` is already
    // the exclusive instant, so no calendar math happens in the browser, and
    // `insightQueryFromConfig` forwards full instants unchanged.
    draft.range = { from: drill.start, to: drill.end };
    // Comparison defaults OFF in the child: comparing a drilled bucket again
    // is a new question the user can opt back into.
    draft.compare = false;
    const windowLabel = describeWindow(Date.parse(drill.start), Date.parse(drill.end));
    crumb = drill.period === "previous" ? `Previous period · ${windowLabel}` : windowLabel;
    description =
      drill.period === "previous"
        ? `Exploring the previous period: ${windowLabel} (UTC)`
        : `Exploring ${windowLabel} (UTC)`;
  } else if (drill.kind === "previous_window") {
    draft.range = { from: drill.from, to: drill.to };
    draft.compare = false;
    const windowLabel = describeWindow(Date.parse(drill.from), Date.parse(drill.to));
    crumb = `Previous period · ${windowLabel}`;
    description = `Exploring the previous period: ${windowLabel} (UTC)`;
  } else {
    // Same-field filters are REPLACED by the selected value; every filter on
    // another field is preserved untouched. The canonical value comes from the
    // server refinement — never from a display label.
    draft.filters = { ...draft.filters, [drill.refine.filterKey]: [drill.refine.filterValue] };
    if (drill.fromSeries) {
      // A series narrowed to one value stops being a multi-line question.
      draft.series = null;
    }
    crumb = drill.refine.label;
    description = `Exploring: ${filterFieldLabel(dataset, drill.refine.filterKey)} is ${drill.refine.label}`;
  }

  const { draft: reconciled, resets } = reconcileInsightDraft(catalog, draft, nowMs);

  // A drill must never silently change the business question's home.
  if (reconciled.source !== config.source || reconciled.dataset !== config.dataset) {
    return { error: "This value can't be explored." };
  }
  // …and must never silently SUBSTITUTE the refinement: if reconciliation had
  // to throw away the drilled range or filter (unparseable bucket, a window
  // the dataset can't accept, an undeclared filter key), the honest outcome is
  // a refusal — not a query that quietly answers a different question.
  if (drill.kind === "bucket" || drill.kind === "previous_window") {
    const wanted =
      drill.kind === "bucket"
        ? { from: drill.start, to: drill.end }
        : { from: drill.from, to: drill.to };
    if (!("from" in reconciled.range) || reconciled.range.from !== wanted.from || reconciled.range.to !== wanted.to) {
      return { error: "This value can't be explored." };
    }
  } else {
    const kept = reconciled.filters[drill.refine.filterKey];
    if (!Array.isArray(kept) || kept[0] !== drill.refine.filterValue) {
      return { error: "This value can't be explored." };
    }
  }

  const issues = insightDraftIssues(catalog, reconciled);
  if (issues.length > 0) return { error: issues[0]! };
  const refined = insightConfigFromDraft(reconciled, dataset.limits.maxRangeDays);
  if (!refined) return { error: "This value can't be explored." };

  return {
    config: refined,
    crumb,
    description,
    notes: resets.map((r) => r.message),
  };
}

/**
 * Suggested title for "Save as new insight" — safe display labels only, never
 * ids, bounded to the widget-title cap.
 */
export function suggestedExplorationTitle(
  datasetLabel: string,
  measureLabel: string,
  crumbs: readonly string[],
  maxLength = 120,
): string {
  const parts = [`${datasetLabel} — ${measureLabel}`, ...crumbs];
  return parts.join(" — ").slice(0, maxLength);
}
