"use client";

import { Input } from "@/components/ui/input";
import type { WorkflowRunTriggeredBy } from "@/contracts/workflow";
import { SOURCE_LABELS } from "./RunSourceBadge";

/**
 * Search + status-filter + source-filter + test-mode toggle for the
 * Runs dashboard (Slice 4.RUNS-PAGE-1).
 *
 * Every facet maps to a field already on the DTO — no derived /
 * faked filter axes. Date-range / workflow-picker filters are
 * deferred (date-range needs a date-input primitive we haven't
 * shipped; workflow-picker is redundant with the search-by-name
 * field that already covers the common case).
 */
export type RunStatusFilter = "all" | "succeeded" | "failed";

export type RunSourceFilter = "all" | WorkflowRunTriggeredBy;

const STATUS_FILTERS: ReadonlyArray<{ id: RunStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "succeeded", label: "Succeeded" },
  { id: "failed", label: "Failed" },
];

const SOURCE_FILTERS: ReadonlyArray<{ id: RunSourceFilter; label: string }> = [
  { id: "all", label: "Any source" },
  { id: "manual", label: SOURCE_LABELS.manual },
  { id: "webhook", label: SOURCE_LABELS.webhook },
  { id: "scheduled", label: SOURCE_LABELS.scheduled },
  { id: "retry", label: SOURCE_LABELS.retry },
];

interface Props {
  query: string;
  onQuery: (next: string) => void;
  statusFilter: RunStatusFilter;
  onStatusFilter: (next: RunStatusFilter) => void;
  sourceFilter: RunSourceFilter;
  onSourceFilter: (next: RunSourceFilter) => void;
  includeTest: boolean;
  onIncludeTest: (next: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function RunsToolbar({
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  sourceFilter,
  onSourceFilter,
  includeTest,
  onIncludeTest,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div
      data-testid="runs-toolbar"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          type="search"
          aria-label="Search runs by workflow name"
          data-testid="runs-search-input"
          placeholder="Search by workflow name…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="max-w-sm"
        />
        <div
          data-testid="runs-status-filter"
          role="tablist"
          aria-label="Filter by status"
          className="hidden gap-1 rounded-md border border-border bg-muted/40 p-0.5 md:flex"
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`runs-status-filter-${f.id}`}
                onClick={() => onStatusFilter(f.id)}
                className={
                  "rounded px-2.5 py-1 text-xs font-medium transition " +
                  (active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          data-testid="runs-source-filter"
          aria-label="Filter by source"
          value={sourceFilter}
          onChange={(e) => onSourceFilter(e.target.value as RunSourceFilter)}
          className="h-8 rounded-md border border-border bg-muted/40 px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {SOURCE_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <label
          data-testid="runs-include-test-toggle"
          className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) => onIncludeTest(e.target.checked)}
            aria-label="Include test runs"
            className="h-3 w-3 rounded border-border accent-primary"
          />
          Include test runs
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          data-testid="runs-refresh-button"
          aria-label="Refresh runs"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
