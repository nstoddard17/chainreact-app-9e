"use client";

import { Input } from "@/components/ui/input";
import { CreateWorkflowButton } from "./CreateWorkflowButton";

/**
 * Search + tabs + status-filter + view-toggle + Filters + Create toolbar for the
 * workflows dashboard (Slice 4.WORKFLOWS-PAGE-1; tabs/filters added in WF-5).
 *
 * Tabs (Automations / Folders / Trash) switch the dashboard view. The inline
 * status pills + list/grid toggle apply to the Automations tab only; the
 * Filters button opens the slide-in panel for the folder/app/date facets. Status
 * stays on the pills (real lifecycle states); owner/starred facets are omitted
 * (no safe list-payload data).
 */
export type WorkflowStatusFilter =
  | "all"
  | "running"
  | "draft"
  | "paused"
  | "attention";

export type WorkflowsView = "list" | "grid";
export type WorkflowsTab = "automations" | "folders" | "trash";

interface Props {
  tab: WorkflowsTab;
  onTab: (next: WorkflowsTab) => void;
  query: string;
  onQuery: (next: string) => void;
  statusFilter: WorkflowStatusFilter;
  onStatusFilter: (next: WorkflowStatusFilter) => void;
  view: WorkflowsView;
  onView: (next: WorkflowsView) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
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

const TABS: ReadonlyArray<{ id: WorkflowsTab; label: string }> = [
  { id: "automations", label: "Automations" },
  { id: "folders", label: "Folders" },
  { id: "trash", label: "Trash" },
];

export function WorkflowsToolbar({
  tab,
  onTab,
  query,
  onQuery,
  statusFilter,
  onStatusFilter,
  view,
  onView,
  onOpenFilters,
  activeFilterCount,
}: Props) {
  const onAutomations = tab === "automations";
  const placeholder =
    tab === "folders"
      ? "Search folders…"
      : tab === "trash"
        ? "Search trash…"
        : "Search by name or connected app…";
  return (
    <div data-testid="workflows-toolbar" className="flex flex-col gap-3">
      <div
        data-testid="workflows-tabs"
        role="tablist"
        aria-label="Workflows view"
        className="flex w-fit gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
      >
        {TABS.map((tt) => {
          const active = tab === tt.id;
          return (
            <button
              key={tt.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`workflows-tab-${tt.id}`}
              onClick={() => onTab(tt.id)}
              className={
                "rounded px-3 py-1.5 text-sm font-medium transition " +
                (active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {tt.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            type="search"
            aria-label="Search workflows"
            data-testid="workflows-search-input"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            className="max-w-sm"
          />
          {onAutomations && (
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
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAutomations && (
            <>
              <button
                type="button"
                data-testid="workflows-filters-open"
                onClick={onOpenFilters}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-foreground/30"
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>
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
            </>
          )}
          <CreateWorkflowButton />
        </div>
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
