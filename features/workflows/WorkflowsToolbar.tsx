"use client";

import { Input } from "@/components/ui/input";
import { CreateWorkflowButton } from "./CreateWorkflowButton";

/**
 * Search + status-filter + view-toggle + Create toolbar for the workflows
 * dashboard (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Status filter facets map to the real workflow lifecycle states the page
 * actually surfaces (`active` / `draft` / `paused` / "needs attention" =
 * `disabled` | `eligible_to_resume`). The design's Folder/Apps/Owner/Date
 * filters are deferred (no schema for folders/owners; apps facet would re-
 * derive from per-row provider data we already show as chips).
 */
export type WorkflowStatusFilter =
  | "all"
  | "running"
  | "draft"
  | "paused"
  | "attention";

export type WorkflowsView = "list" | "grid";

interface Props {
  query: string;
  onQuery: (next: string) => void;
  statusFilter: WorkflowStatusFilter;
  onStatusFilter: (next: WorkflowStatusFilter) => void;
  view: WorkflowsView;
  onView: (next: WorkflowsView) => void;
}

const STATUS_FILTERS: ReadonlyArray<{
  id: WorkflowStatusFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "draft", label: "Draft" },
  { id: "paused", label: "Paused" },
  { id: "attention", label: "Needs attention" },
];

export function WorkflowsToolbar({
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  view,
  onView,
}: Props) {
  return (
    <div
      data-testid="workflows-toolbar"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          type="search"
          aria-label="Search workflows"
          data-testid="workflows-search-input"
          placeholder="Search by name or connected app…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="max-w-sm"
        />
        <div
          data-testid="workflows-status-filter"
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
                data-testid={`workflows-status-filter-${f.id}`}
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
        <div
          data-testid="workflows-view-toggle"
          role="group"
          aria-label="View"
          className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
        >
          <button
            type="button"
            data-testid="workflows-view-toggle-list"
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => onView("list")}
            className={
              "flex h-7 w-8 items-center justify-center rounded " +
              (view === "list"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <ListIcon />
          </button>
          <button
            type="button"
            data-testid="workflows-view-toggle-grid"
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => onView("grid")}
            className={
              "flex h-7 w-8 items-center justify-center rounded " +
              (view === "grid"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <GridIcon />
          </button>
        </div>
        <CreateWorkflowButton />
      </div>
    </div>
  );
}

function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="5" y1="4" x2="14" y2="4" />
      <line x1="5" y1="8" x2="14" y2="8" />
      <line x1="5" y1="12" x2="14" y2="12" />
      <circle cx="2.5" cy="4" r="0.8" fill="currentColor" />
      <circle cx="2.5" cy="8" r="0.8" fill="currentColor" />
      <circle cx="2.5" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
