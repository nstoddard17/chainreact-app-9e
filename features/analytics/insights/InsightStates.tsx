"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ConnectedAnalyticsResult } from "@/contracts/connectedAnalytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { formatAgeSeconds } from "./formatInsightValue";
import type { InsightFailure } from "./useInsightQuery";
import { insightErrorDisplay } from "./insightErrorCopy";

/**
 * Shared non-chart states for Custom Insights (CD-3A): guidance, typed
 * errors with connect/reconnect/retry/edit actions, the freshness line, and
 * the structured completeness badge. Copy is fixed customer-safe mapping —
 * see insightErrorCopy.ts.
 */

export function InsightMessage({
  icon = "Sparkle",
  tone = "muted",
  title,
  body,
  children,
}: {
  icon?: string;
  tone?: "muted" | "warning" | "error";
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const iconColor =
    tone === "error" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-1.5 p-2 text-center">
      <span className={iconColor}>
        <AnalyticsIcon name={icon} size={18} />
      </span>
      <div className="text-xs font-medium text-foreground">{title}</div>
      {body && <p className="max-w-[260px] text-[11px] text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}

/** A typed failure, rendered with its mapped copy + action. */
export function InsightFailureView({
  failure,
  sourceLabel,
  context,
  onRetry,
}: {
  failure: InsightFailure;
  sourceLabel: string;
  context: "builder" | "widget";
  onRetry?: () => void;
}) {
  const display = insightErrorDisplay(failure.code, {
    sourceLabel,
    message: failure.message,
    context,
    ...(failure.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: failure.retryAfterSeconds }
      : {}),
  });
  const tone =
    display.action === "connect" || display.action === "reconnect" ? "muted" : "warning";
  return (
    <InsightMessage
      icon={display.action === "connect" || display.action === "reconnect" ? "Webhook" : "AlertTriangle"}
      tone={tone}
      title={display.title}
      body={display.body}
    >
      {(display.action === "connect" || display.action === "reconnect") && (
        <Link
          href="/apps"
          className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:brightness-105"
        >
          {display.action === "connect" ? `Connect ${sourceLabel}` : `Reconnect ${sourceLabel}`}
        </Link>
      )}
      {display.action === "retry" && onRetry && (
        <button
          type="button"
          className="mt-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground/80 hover:border-foreground/25 hover:text-foreground"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </InsightMessage>
  );
}

/**
 * The freshness line every result carries — driven by the STRUCTURED
 * freshness fields (mode/ageSeconds/stale), never by parsing warnings.
 */
export function InsightFreshness({
  result,
  sourceLabel,
  refreshError,
  onRefresh,
  refreshing,
}: {
  result: ConnectedAnalyticsResult;
  sourceLabel: string;
  /** Client-side retained-prior failure (from useInsightQuery). */
  refreshError: InsightFailure | null;
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean;
}) {
  const f = result.freshness;
  let text: string;
  if (refreshError) {
    text = "Couldn't refresh — showing previously saved data.";
  } else if (f.mode === "live") {
    text = `Live ${sourceLabel} data`;
  } else if (f.stale === true) {
    text =
      f.ageSeconds != null
        ? `${sourceLabel} couldn't refresh. Showing data from ${formatAgeSeconds(f.ageSeconds)}.`
        : `${sourceLabel} couldn't refresh. Showing previously saved data.`;
    // (structured `stale` drives this; warnings only add detail elsewhere)
  } else {
    text = f.ageSeconds != null ? `Updated ${formatAgeSeconds(f.ageSeconds)}` : "Updated just now";
  }
  const warnTone = refreshError || f.stale === true;
  return (
    <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
      <span
        className={"inline-flex min-w-0 items-center gap-1 " + (warnTone ? "text-warning" : "")}
        role="status"
      >
        {warnTone && (
          <span className="flex-shrink-0">
            <AnalyticsIcon name="AlertTriangle" size={10} />
          </span>
        )}
        <span className="truncate">{text}</span>
      </span>
      {f.mode === "cached" && onRefresh && (
        <button
          type="button"
          className="flex-shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-foreground/70 hover:border-foreground/25 hover:text-foreground disabled:opacity-50"
          onClick={onRefresh}
          disabled={refreshing === true}
          title="Fetch the latest data"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      )}
    </div>
  );
}

const COMPLETENESS_COPY: Record<
  Exclude<ConnectedAnalyticsResult["completeness"]["state"], "complete">,
  { badge: string; fallback: string }
> = {
  scan_capped: {
    badge: "May be incomplete",
    fallback: "This chart may be incomplete — the data scan limit was reached.",
  },
  row_capped: {
    badge: "Top groups only",
    fallback: "Only the largest groups are shown.",
  },
  provider_sampled: {
    badge: "Sampled",
    fallback: "The provider returned sampled data, not exact totals.",
  },
  partially_synced: {
    badge: "Still syncing",
    fallback: "Some of this data hasn't finished syncing yet.",
  },
};

/**
 * Structured completeness badge (never a parsed warning string). Data stays
 * visible; the badge + title disclose exactly why it may be partial —
 * including the server's detail (e.g. the newest-first scan bias).
 */
export function InsightCompletenessBadge({
  result,
}: {
  result: ConnectedAnalyticsResult;
}) {
  const { completeness, warnings } = result;
  if (completeness.state === "complete") return null;
  const copy = COMPLETENESS_COPY[completeness.state];
  const explanation = [completeness.detail ?? copy.fallback, ...warnings].join(" ");
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 self-start rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
      title={explanation}
    >
      <AnalyticsIcon name="AlertTriangle" size={9} />
      <span className="truncate">{copy.badge}</span>
      <span className="sr-only">{explanation}</span>
    </span>
  );
}
