"use client";

import { useState } from "react";
import type { AnalyticsWidgetType } from "@/contracts/analytics";
import { AnalyticsIcon } from "@/components/analytics/icons";

/**
 * Add-a-widget overlay (Slice ANALYTICS-1). Lists the supported widget types;
 * picking one adds it to the dashboard and opens its config panel. Only types
 * the page can actually render + back with real data are offered.
 */

export interface WidgetLibraryEntry {
  type: AnalyticsWidgetType;
  name: string;
  desc: string;
  icon: string;
}

export const WIDGET_LIBRARY: readonly WidgetLibraryEntry[] = [
  { type: "insight", name: "Custom insight", desc: "Build a chart from ChainReact or one of your connected apps.", icon: "Sparkle" },
  { type: "stat", name: "Number with trend", desc: "Big number + sparkline + change vs last period.", icon: "Bolt" },
  { type: "line", name: "Line chart", desc: "Runs over time, successful vs failed.", icon: "History" },
  { type: "bar", name: "Top list", desc: "Top automations by runs, or connected apps.", icon: "Layers" },
  { type: "donut", name: "Breakdown", desc: "Success vs. failure split.", icon: "Filter" },
  { type: "heatmap", name: "Activity heatmap", desc: "See when your automations run most.", icon: "Clock" },
  { type: "table", name: "Table", desc: "Automations with runs and success rate.", icon: "Database" },
  { type: "activity", name: "Recent runs feed", desc: "The last things that ran.", icon: "History" },
  { type: "note", name: "Text note", desc: "Add context, a heading, or a reminder.", icon: "Comment" },
];

export function WidgetLibrary({
  onAdd,
  onClose,
}: {
  onAdd: (type: AnalyticsWidgetType) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const entries = q
    ? WIDGET_LIBRARY.filter((w) => w.name.toLowerCase().includes(q) || w.desc.toLowerCase().includes(q))
    : WIDGET_LIBRARY;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[90px] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Add a widget"
    >
      <div
        className="w-[min(620px,calc(100%-32px))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <span className="text-primary">
              <AnalyticsIcon name="Sparkle" size={14} />
            </span>
            <span>Add a widget</span>
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
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
          <span className="text-muted-foreground">
            <AnalyticsIcon name="Search" size={13} />
          </span>
          <input
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search widget types…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {entries.map((w) => (
            <button
              key={w.type}
              type="button"
              className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3 text-left hover:border-primary"
              onClick={() => onAdd(w.type)}
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <AnalyticsIcon name={w.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground">{w.name}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{w.desc}</span>
              </span>
              <span className="text-muted-foreground">
                <AnalyticsIcon name="Plus" size={12} />
              </span>
            </button>
          ))}
          {entries.length === 0 && (
            <div className="col-span-full py-6 text-center text-sm text-muted-foreground">No matching widgets.</div>
          )}
        </div>
      </div>
    </div>
  );
}
