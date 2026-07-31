"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { providerLabel } from "@/core/workflows/templateCardMeta";
import { TEMPLATE_SORTS, type TemplateSortMode } from "@/core/workflows/templateBrowse";

/**
 * Templates search + filter/sort bar (extracted from `TemplatesDashboard` in
 * RESPONSIVE-FOUNDATION-1 so the dashboard stays inside the project's max-lines
 * budget — the same seam the builder header used).
 *
 * §2 + §3 — this is the cluster the batch exists to fix. It was
 * `flex items-center gap-2` wrapping two `w-44` (176px) selects plus Clear
 * filters: roughly 400px that could neither wrap nor shrink, so below about
 * 400px it ran straight off the page.
 *
 * The behaviour now, stated explicitly rather than left to chance:
 *
 *   search        SHRINK, then take the whole row. `flex-1 basis-64 min-w-0`
 *                 grows into whatever the controls leave and shrinks below its
 *                 basis when squeezed; because the control block is `w-full`
 *                 until `lg`, the search simply owns the row once both no longer
 *                 fit. No one-off breakpoint decides that.
 *   controls      WRAP, by reshaping: one column < 480px, two columns >= 480px,
 *                 inline row >= lg (the original desktop appearance).
 *
 * Widths come from the container, never from the control. The only fixed width
 * left is `lg:w-44`, which applies solely where there is provably room for it.
 */
export function TemplatesFilterBar({
  query,
  onQueryChange,
  showingMine,
  providerFacets,
  provider,
  onProviderChange,
  sort,
  onSortChange,
  filterActive,
  onClearFilters,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  /** "Your templates" carries no card metadata, so only search applies there. */
  showingMine: boolean;
  providerFacets: readonly string[];
  provider: string;
  onProviderChange: (next: string) => void;
  sort: TemplateSortMode;
  onSortChange: (next: TemplateSortMode) => void;
  filterActive: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div
      data-testid="templates-controls-row"
      className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3"
    >
      <Input
        data-testid="templates-search"
        aria-label="Search templates"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by name, app, category, or step…"
        className="min-w-0 flex-1 basis-64 sm:max-w-md"
      />
      <div
        data-testid="templates-controls"
        className="grid w-full min-w-0 grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:flex lg:w-auto lg:items-center"
      >
        {!showingMine && providerFacets.length > 0 && (
          <Select value={provider} onValueChange={onProviderChange}>
            <SelectTrigger
              className="w-full min-w-0 lg:w-44"
              data-testid="templates-provider-filter"
              aria-label="Filter by app"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All apps</SelectItem>
              {providerFacets.map((p) => (
                <SelectItem key={p} value={p} data-testid={`templates-provider-option-${p}`}>
                  {providerLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!showingMine && (
          <Select value={sort} onValueChange={(v) => onSortChange(v as TemplateSortMode)}>
            <SelectTrigger
              className="w-full min-w-0 lg:w-44"
              data-testid="templates-sort"
              aria-label="Sort templates"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key} data-testid={`templates-sort-${s.key}`}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filterActive && (
          <button
            type="button"
            data-testid="templates-clear-filters"
            onClick={onClearFilters}
            /* Stays visible at every width — §3 forbids hiding it to dodge
               layout work. Full-width while stacked, intrinsic once inline. */
            className="h-9 w-full min-w-0 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground lg:h-auto lg:w-auto lg:py-1.5"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
