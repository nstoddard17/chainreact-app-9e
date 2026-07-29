"use client";

import type { BuilderTab } from "../canvas/BuilderTabPlaceholder";

/**
 * Header-level builder tab strip (BUILDER-TABS-HEADER-1, re-homed by
 * BUILDER-HEADER-TABS-CENTER-1).
 *
 * The "Builder | Runs | Data Map | History | Settings" tablist, moved OUT of
 * the Visual-only `CanvasActionBar` so BOTH builder styles (Visual canvas and
 * Document view) can reach Runs / Data Map / History / Settings. It now
 * renders INSIDE `BuilderHeader`'s center region (the slot the deferred
 * ID / runs-per-24h / success / tasks-per-run meta strip used to occupy) —
 * the component is just the compact tab pill, no full-width bar of its own.
 * Tab state lives in `WorkflowBuilder` (it outlives view-mode switches).
 * Pure presentational — same roles/labels the canvas strip had, so existing
 * role-based queries keep working.
 */

const BUILDER_TABS: readonly { readonly id: BuilderTab; readonly label: string }[] = [
  { id: "builder", label: "Builder" },
  { id: "runs", label: "Runs" },
  { id: "data-map", label: "Data Map" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export function BuilderTabStrip({
  activeTab,
  onSelectTab,
}: {
  activeTab: BuilderTab;
  onSelectTab: (tab: BuilderTab) => void;
}) {
  return (
    <div
      data-testid="builder-tab-strip"
      className="flex shrink-0 items-center gap-0.5 rounded-md p-0.5"
      role="tablist"
      aria-label="Builder sections"
      style={{
        background: "var(--builder-panel-2)",
        border: "1px solid var(--builder-border)",
      }}
    >
      {BUILDER_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-testid={`builder-tab-${t.id}`}
          aria-selected={activeTab === t.id ? "true" : "false"}
          onClick={() => onSelectTab(t.id)}
          className="builder-mono inline-flex h-[22px] items-center whitespace-nowrap rounded-[3px] px-2 text-[11.5px] transition-colors"
          style={{
            background: activeTab === t.id ? "var(--builder-panel)" : "transparent",
            boxShadow: activeTab === t.id ? "var(--builder-shadow-sm)" : undefined,
            color: activeTab === t.id ? "var(--builder-text)" : "var(--builder-muted)",
            border: "0",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
