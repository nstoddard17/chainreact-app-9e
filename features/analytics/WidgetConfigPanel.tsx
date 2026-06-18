"use client";

import { useState } from "react";
import type {
  AnalyticsMetric,
  AnalyticsWidget,
  AnalyticsWidgetConfig,
  AnalyticsWidgetType,
  AnalyticsWorkflowStat,
} from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Per-widget configuration drawer (Slice ANALYTICS-1).
 *
 * Exposes ONLY what the backend honors today (no-fake-UI): the data SOURCE (any
 * automation, or one specific workflow) and the METRIC (constrained to those the
 * widget type can render + the aggregation backs). Note widgets get a text field
 * instead.
 *
 * Deferred design controls (documented follow-ups, intentionally absent): the
 * refresh-schedule cadence (needs the scheduler cron) and per-widget run filters
 * (needs per-widget recompute).
 */

const METRICS_BY_TYPE: Record<AnalyticsWidgetType, { id: AnalyticsMetric; label: string }[]> = {
  stat: [
    { id: "runs", label: "Number of runs" },
    { id: "success_rate", label: "Success rate" },
    { id: "active_workflows", label: "Active automations" },
    { id: "avg_duration", label: "Average run time" },
  ],
  line: [{ id: "runs_over_time", label: "Runs over time" }],
  donut: [{ id: "outcomes", label: "Outcome breakdown (success / fail)" }],
  bar: [
    { id: "top_workflows", label: "Top automations by runs" },
    { id: "by_app", label: "Connected apps" },
  ],
  table: [{ id: "top_workflows", label: "Automations table" }],
  heatmap: [{ id: "by_time", label: "When things ran (day & week)" }],
  activity: [{ id: "events", label: "Recent runs feed" }],
  note: [],
};

/** Metrics whose value can be scoped to one workflow (the source selector). */
const SOURCE_SCOPED: ReadonlySet<AnalyticsMetric> = new Set<AnalyticsMetric>([
  "runs",
  "success_rate",
  "avg_duration",
]);

export function WidgetConfigPanel({
  widget,
  workflows,
  onClose,
  onSave,
}: {
  widget: AnalyticsWidget;
  workflows: readonly AnalyticsWorkflowStat[];
  onClose: () => void;
  onSave: (config: AnalyticsWidgetConfig) => void;
}) {
  const metricOptions = METRICS_BY_TYPE[widget.type];
  const [source, setSource] = useState<string>(widget.config.source ?? "any");
  const [metric, setMetric] = useState<AnalyticsMetric | undefined>(
    widget.config.metric ?? metricOptions[0]?.id,
  );
  const [note, setNote] = useState<string>(widget.config.note ?? "");

  const isNote = widget.type === "note";
  const sourceScoped = metric != null && SOURCE_SCOPED.has(metric);

  const save = () => {
    const config: AnalyticsWidgetConfig = {
      source: sourceScoped ? source : "any",
      ...(isNote ? {} : metric ? { metric } : {}),
      ...(isNote ? { note } : {}),
    };
    onSave(config);
  };

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed inset-y-0 right-0 z-[71] flex w-[420px] max-w-[calc(100%-24px)] flex-col border-l border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal
        aria-label="Configure widget"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <AnalyticsIcon name={widget.icon ?? "Bolt"} size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-primary">Configure widget</div>
              <div className="truncate text-[15px] font-semibold text-foreground">{widget.title}</div>
            </div>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <AnalyticsIcon name="X" size={13} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          {isNote ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <span className="text-primary">
                  <AnalyticsIcon name="Comment" size={11} />
                </span>
                <span>Note text</span>
              </div>
              <textarea
                className="min-h-[140px] rounded-lg border border-border bg-muted p-3 text-[13px] text-foreground outline-none focus:border-primary"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Type a note for you or your team…"
              />
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <span className="text-primary">
                    <AnalyticsIcon name="Eye" size={11} />
                  </span>
                  <span>What do you want to see?</span>
                </div>
                <p className="text-xs text-muted-foreground">Pick the metric for this widget.</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {metricOptions.map((m) => {
                    const on = metric === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] " +
                          (on
                            ? "border-primary bg-primary/10 font-medium text-primary"
                            : "border-border bg-muted text-foreground hover:border-foreground/25")
                        }
                        onClick={() => setMetric(m.id)}
                      >
                        {on && (
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <AnalyticsIcon name="Check" size={10} />
                          </span>
                        )}
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  <span className="text-primary">
                    <AnalyticsIcon name="Bolt" size={11} />
                  </span>
                  <span>Which automation?</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sourceScoped
                    ? "Focus on one automation, or roll up everything."
                    : "This metric always rolls up every automation."}
                </p>
                <select
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-[13px] text-foreground outline-none focus:border-primary disabled:opacity-50"
                  value={source}
                  disabled={!sourceScoped}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="any">Any automation</option>
                  {workflows.map((w) => (
                    <option key={w.workflowId} value={w.workflowId}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </section>

              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="mt-0.5 flex-shrink-0 text-primary">
                  <AnalyticsIcon name="AlertTriangle" size={11} />
                </span>
                <span>
                  Widgets show live data for the dashboard's selected date range. Use Refresh to
                  pull the latest.
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-muted px-4 py-3.5">
          <button
            type="button"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="flex flex-[1.6] items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground hover:brightness-105"
            onClick={save}
          >
            <AnalyticsIcon name="Check" size={11} /> Save widget
          </button>
        </div>
      </aside>
    </>
  );
}
