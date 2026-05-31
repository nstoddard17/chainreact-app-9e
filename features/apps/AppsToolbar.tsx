"use client";

import { Input } from "@/components/ui/input";

/**
 * Search + status-tab + sort toolbar for the Apps dashboard
 * (Slice 4.APPS-PAGE-1).
 *
 * Status tabs map to states the DTO can truthfully back today: All /
 * Connected / Not connected. The design's "Need attention" tab depends on a
 * health field we don't surface yet — deferred (see slice plan). Sort is
 * limited to A–Z and Recently connected for the same reason: "Most used" +
 * "Issues first" depend on workflow-link / health data we don't have.
 */
export type AppsStatusFilter = "all" | "connected" | "available";
export type AppsSort = "name" | "recent";

interface Props {
  query: string;
  onQuery: (next: string) => void;
  statusFilter: AppsStatusFilter;
  onStatusFilter: (next: AppsStatusFilter) => void;
  sort: AppsSort;
  onSort: (next: AppsSort) => void;
  counts: { all: number; connected: number; available: number };
}

const STATUS_TABS: ReadonlyArray<{ id: AppsStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "available", label: "Not connected" },
];

export function AppsToolbar({
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  sort,
  onSort,
  counts,
}: Props) {
  return (
    <div
      data-testid="apps-toolbar"
      className="flex flex-wrap items-center gap-2"
    >
      <div
        data-testid="apps-status-tabs"
        role="tablist"
        aria-label="Filter by connection status"
        className="hidden gap-1 rounded-md border border-border bg-muted/40 p-0.5 md:flex"
      >
        {STATUS_TABS.map((t) => {
          const active = statusFilter === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`apps-status-tab-${t.id}`}
              onClick={() => onStatusFilter(t.id)}
              className={
                "inline-flex items-center gap-2 rounded px-2.5 py-1 text-xs font-medium transition " +
                (active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <span>{t.label}</span>
              <span
                className={
                  "rounded-full px-1.5 py-0 font-mono text-[10px] " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
                }
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none">
        <Input
          type="search"
          aria-label="Search apps"
          data-testid="apps-search-input"
          placeholder="Search apps by name or description…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="w-full md:w-72"
        />
        <label
          data-testid="apps-sort"
          className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground"
        >
          <span>Sort:</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as AppsSort)}
            aria-label="Sort apps"
            className="bg-transparent text-foreground outline-none"
          >
            <option value="name">A–Z</option>
            <option value="recent">Recently connected</option>
          </select>
        </label>
      </div>
    </div>
  );
}
