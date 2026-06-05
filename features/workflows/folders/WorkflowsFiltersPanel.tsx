"use client";

import { Button } from "@/components/ui/button";
import type { WorkflowFolder } from "@/contracts/folders";
import { flattenForDisplay } from "./folderTree";

/**
 * Right slide-in filters panel (Slice 4.WF-5), adapted from the design's
 * FiltersPanel to the facets V2 can actually serve from the list payload:
 * Folder (incl. Uncategorized), Apps (providers), Last changed, and a Sort
 * control. The design's Owner / Starred / "needs attention" facets are omitted
 * — no safe data for them in the list item. Status stays on the toolbar's
 * inline pills. `Clear all` resets every panel facet.
 */
export const UNCATEGORIZED = "__uncategorized__";

export type WorkflowDateFilter = "any" | "today" | "week" | "month";
export type WorkflowSort = "recent" | "name";

export interface DashboardFilters {
  folderIds: string[];
  apps: string[];
  date: WorkflowDateFilter;
  sort: WorkflowSort;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  folderIds: [],
  apps: [],
  date: "any",
  sort: "recent",
};

export function countActiveFilters(f: DashboardFilters): number {
  return f.folderIds.length + f.apps.length + (f.date !== "any" ? 1 : 0);
}

function toggle(arr: string[], x: string): string[] {
  return arr.includes(x) ? arr.filter((v) => v !== x) : [...arr, x];
}

interface Props {
  open: boolean;
  onClose: () => void;
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onReset: () => void;
  folders: readonly WorkflowFolder[];
  appOptions: ReadonlyArray<{ id: string; label: string }>;
}

const DATE_SEGS: ReadonlyArray<{ id: WorkflowDateFilter; label: string }> = [
  { id: "any", label: "Anytime" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

export function WorkflowsFiltersPanel({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  folders,
  appOptions,
}: Props) {
  if (!open) return null;
  const active = countActiveFilters(filters);
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        data-testid="workflows-filters-overlay"
      />
      <aside
        role="dialog"
        aria-label="Filters"
        data-testid="workflows-filters-panel"
        className="fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-full flex-col border-l border-border bg-card shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Filters
            {active > 0 && (
              <span
                data-testid="workflows-filters-count"
                className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[11px] text-primary"
              >
                {active}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="workflows-filters-clear"
              onClick={onReset}
              className="text-xs font-medium text-primary hover:underline"
            >
              Clear all
            </button>
            <button
              type="button"
              aria-label="Close filters"
              data-testid="workflows-filters-close"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          {/* Sort */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Sort by</h3>
            <Segmented
              value={filters.sort}
              options={[
                { id: "recent", label: "Recently changed" },
                { id: "name", label: "Name A–Z" },
              ]}
              onSelect={(v) => onChange({ ...filters, sort: v as WorkflowSort })}
              testId="workflows-filters-sort"
            />
          </section>

          {/* Folder */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Folder</h3>
            <div className="flex flex-col gap-1">
              <FolderCheck
                id={UNCATEGORIZED}
                label="Uncategorized"
                checked={filters.folderIds.includes(UNCATEGORIZED)}
                onToggle={() =>
                  onChange({ ...filters, folderIds: toggle(filters.folderIds, UNCATEGORIZED) })
                }
              />
              {flattenForDisplay(folders).map(({ folder: f, depth }) => (
                <FolderCheck
                  key={f.id}
                  id={f.id}
                  label={f.name}
                  indent={depth - 1}
                  checked={filters.folderIds.includes(f.id)}
                  onToggle={() =>
                    onChange({ ...filters, folderIds: toggle(filters.folderIds, f.id) })
                  }
                />
              ))}
              {folders.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No folders yet.</p>
              )}
            </div>
          </section>

          {/* Apps */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Uses these apps</h3>
            {appOptions.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                No connected apps in your automations yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {appOptions.map((app) => {
                  const on = filters.apps.includes(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      data-testid={`workflows-filters-app-${app.id}`}
                      aria-pressed={on}
                      onClick={() => onChange({ ...filters, apps: toggle(filters.apps, app.id) })}
                      className={
                        "rounded-full border px-3 py-1 text-xs transition " +
                        (on
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground")
                      }
                    >
                      {app.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Last changed */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-foreground">Last changed</h3>
            <Segmented
              value={filters.date}
              options={DATE_SEGS}
              onSelect={(v) => onChange({ ...filters, date: v as WorkflowDateFilter })}
              testId="workflows-filters-date"
            />
          </section>
        </div>

        <div className="border-t border-border p-4">
          <Button
            type="button"
            className="w-full"
            onClick={onClose}
            data-testid="workflows-filters-apply"
          >
            Done
          </Button>
        </div>
      </aside>
    </>
  );
}

function FolderCheck({
  id,
  label,
  checked,
  onToggle,
  indent = 0,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  indent?: number;
}) {
  return (
    <label
      data-testid={`workflows-filters-folder-${id}`}
      style={indent > 0 ? { paddingLeft: `${0.25 + indent * 0.9}rem` } : undefined}
      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm text-foreground hover:bg-muted/40"
    >
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function Segmented({
  value,
  options,
  onSelect,
  testId,
}: {
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onSelect: (id: string) => void;
  testId: string;
}) {
  return (
    <div
      role="group"
      data-testid={testId}
      className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1"
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            data-testid={`${testId}-${o.id}`}
            aria-pressed={on}
            onClick={() => onSelect(o.id)}
            className={
              "rounded px-2.5 py-1 text-xs transition " +
              (on
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
