"use client";

import type {
  AnalyticsRange,
  AnalyticsWidget,
  AnalyticsWidgetSize,
  AnalyticsWidgetType,
} from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";
import { WIDGET_LIBRARY } from "./WidgetLibrary";

/** Shared constants + small presentational helpers for AnalyticsDashboard. */

export const RANGE_OPTIONS: { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "ytd", label: "Year" },
];

const DEFAULT_METRIC_BY_TYPE: Record<AnalyticsWidgetType, AnalyticsWidget["config"]["metric"]> = {
  stat: "runs",
  line: "runs_over_time",
  bar: "top_workflows",
  donut: "outcomes",
  heatmap: "by_time",
  table: "top_workflows",
  activity: "events",
  note: undefined,
};

const DEFAULT_SIZE_BY_TYPE: Record<AnalyticsWidgetType, AnalyticsWidgetSize> = {
  stat: "s",
  line: "xl",
  bar: "m",
  donut: "s",
  heatmap: "l",
  table: "m",
  activity: "m",
  note: "m",
};

/** Build a fresh widget for a newly-added type with sensible defaults. */
export function makeWidget(type: AnalyticsWidgetType): AnalyticsWidget {
  const meta = WIDGET_LIBRARY.find((w) => w.type === type);
  const metric = DEFAULT_METRIC_BY_TYPE[type];
  return {
    id: `w-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    type,
    size: DEFAULT_SIZE_BY_TYPE[type],
    title: meta?.name ?? "New widget",
    icon: meta?.icon ?? "Bolt",
    config: {
      source: "any",
      ...(metric ? { metric } : {}),
      ...(type === "note" ? { note: "Type a note for you or your team." } : {}),
    },
  };
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive/15"
          onClick={onRetry}
        >
          {retryLabel ?? "Retry"}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium hover:bg-destructive/15"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyDashboard({
  editing,
  canManage,
  onAdd,
  onEdit,
}: {
  editing: boolean;
  canManage: boolean;
  onAdd: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 py-20 text-center">
      <span className="text-muted-foreground">
        <AnalyticsIcon name="Layers" size={28} />
      </span>
      <div className="text-sm font-medium text-foreground">This dashboard is empty</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        {canManage
          ? "Add widgets to track runs, success rates, top automations, and more — all from your real account activity."
          : "There's nothing here yet. An account owner or admin can add widgets to this dashboard."}
      </p>
      {canManage && (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-105"
          onClick={editing ? onAdd : onEdit}
        >
          <AnalyticsIcon name="Plus" size={12} /> {editing ? "Add a widget" : "Edit dashboard"}
        </button>
      )}
    </div>
  );
}
