"use client";

import type { AppsCategory } from "@/contracts/apps";

/**
 * Sidebar category nav for the Apps dashboard (Slice 4.APPS-PAGE-1).
 *
 * Categories are derived server-side via the local route-layer
 * `categoryFor()` map (`lib/apps/providerCategories.ts`) — only categories
 * with at least one provider are emitted. "All apps" is always present.
 *
 * The design includes a "Request an app" CTA at the bottom of the rail; we
 * omit it because there is no real /request endpoint behind it (would be a
 * fake action). When a request flow ships we can drop the link back in.
 */
interface Props {
  categories: readonly AppsCategory[];
  selected: string;
  onSelect: (next: string) => void;
}

export function AppsCategoryNav({ categories, selected, onSelect }: Props) {
  return (
    <aside
      data-testid="apps-category-nav"
      aria-label="Browse apps by category"
      className="w-full shrink-0 md:w-56"
    >
      <h2 className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Browse by category
      </h2>
      <ul className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible">
        {categories.map((c) => {
          const active = selected === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                aria-current={active ? "page" : undefined}
                data-testid={`apps-category-${c.id}`}
                className={
                  "flex w-full shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs " +
                  (active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground")
                }
              >
                <span className="font-medium">{c.label}</span>
                <span
                  className={
                    "rounded-full px-1.5 font-mono text-[10px] " +
                    (active ? "text-primary" : "text-muted-foreground")
                  }
                >
                  {c.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
