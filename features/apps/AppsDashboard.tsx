"use client";

import { useMemo, useState } from "react";
import type { AppCatalogItem, AppsCategory } from "@/contracts/apps";
import { AppCard } from "./AppCard";
import { AppsBridge, type AppsBridgeView } from "./AppsBridge";
import { isBridgeProvider } from "./bridgeProviders";
import { useProviderHighlight } from "./useProviderHighlight";
import { AppsCategoryNav } from "./AppsCategoryNav";
import { AppsEmptyState } from "./AppsEmptyState";
import { AppsStatCards } from "./AppsStatCards";
import {
  AppsToolbar,
  type AppsSort,
  type AppsStatusFilter,
} from "./AppsToolbar";

/**
 * Apps dashboard — top-level client orchestrator (Slice 4.APPS-PAGE-1).
 *
 * Receives the route-safe `AppCatalogItem[]` + category list from the
 * server page. Owns the local UI state (search, status tab, category,
 * sort). There is no client refresh today — every state-changing action
 * (Connect) triggers a full-page OAuth redirect, so the page re-fetches
 * naturally on return.
 *
 * Status / no-matches / data states render per the page-implementation-
 * guide. No "refreshing" state is wired because there is no client
 * mutation that mutates the list in place yet.
 */
interface Props {
  items: readonly AppCatalogItem[];
  categories: readonly AppsCategory[];
  /** Active account that owns these connections — threaded to AppCard for disconnect. */
  accountId: string;
  /**
   * 5.ONBOARD-1 Batch 3 — validated `?highlight=<provider>` deep-link target
   * (server-checked against the catalog). Scroll + transient ring only; never
   * auto-starts a connect/reconnect.
   */
  highlightProvider?: string | null;
  /**
   * APPS-VL-DESIGN-1 — the Motive⇄Fleetio bridge summary, server-derived. Null
   * (the default) when the Vehicle-Links flag is off or neither fleet app is
   * connected ⇒ no bridge renders.
   */
  bridge?: AppsBridgeView | null;
  /**
   * APPS-VL-DESIGN-1 — `/apps/vehicle-links` when the surface flag is on, else
   * null. Threaded to the Motive/Fleetio cards for the inline "Vehicle links"
   * chip.
   */
  vehicleLinksHref?: string | null;
}

export function AppsDashboard({
  items,
  categories,
  accountId,
  highlightProvider = null,
  bridge = null,
  vehicleLinksHref = null,
}: Props) {
  const activeHighlight = useProviderHighlight(highlightProvider);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppsStatusFilter>("all");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<AppsSort>("name");

  const counts = useMemo(() => {
    const connected = items.filter((i) => i.isConnected).length;
    return {
      all: items.length,
      connected,
      available: items.length - connected,
    };
  }, [items]);

  const filtered = useMemo(
    () => applyFilters(items, { query, statusFilter, category, sort }),
    [items, query, statusFilter, category, sort],
  );

  const hasAny = items.length > 0;
  const hasFiltered = filtered.length > 0;

  return (
    <section
      data-testid="apps-dashboard"
      aria-label="Apps"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Apps
        </h1>
        <p
          data-testid="apps-dashboard-subtitle"
          className="text-sm text-muted-foreground"
        >
          {hasAny ? (
            <>
              Showing <code className="font-mono">{filtered.length}</code> of{" "}
              <code className="font-mono">{items.length}</code> apps. Connect
              once, then reuse across as many workflows as you like.
            </>
          ) : (
            <>The app catalog is empty in this build.</>
          )}
        </p>
      </header>

      <div className="flex flex-col gap-6 md:flex-row">
        <AppsCategoryNav
          categories={categories}
          selected={category}
          onSelect={setCategory}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <AppsStatCards items={items} />

          {bridge && <AppsBridge view={bridge} />}

          <AppsToolbar
            query={query}
            onQuery={setQuery}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            sort={sort}
            onSort={setSort}
            counts={counts}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {!hasAny && <AppsEmptyState kind="no-apps" />}
            {hasAny && !hasFiltered && <AppsEmptyState kind="no-matches" />}
            {hasAny && hasFiltered && (
              <ul
                data-testid="apps-list"
                aria-label="Apps list"
                className="flex flex-col gap-2"
              >
                {filtered.map((app) => (
                  <AppCard
                    key={app.providerId}
                    app={app}
                    accountId={accountId}
                    highlighted={activeHighlight === app.providerId}
                    vehicleLinksHref={
                      vehicleLinksHref && isBridgeProvider(app.providerId)
                        ? vehicleLinksHref
                        : null
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface FilterState {
  query: string;
  statusFilter: AppsStatusFilter;
  category: string;
  sort: AppsSort;
}

function applyFilters(
  items: readonly AppCatalogItem[],
  state: FilterState,
): readonly AppCatalogItem[] {
  const trimmed = state.query.trim().toLowerCase();
  const list = items.filter((item) => {
    if (state.statusFilter === "connected" && !item.isConnected) return false;
    if (state.statusFilter === "available" && item.isConnected) return false;
    if (state.category !== "All" && item.category !== state.category) {
      return false;
    }
    if (trimmed.length === 0) return true;
    if (item.name.toLowerCase().includes(trimmed)) return true;
    if (item.description.toLowerCase().includes(trimmed)) return true;
    if (item.providerId.toLowerCase().includes(trimmed)) return true;
    return false;
  });
  return sortItems(list, state.sort);
}

function sortItems(
  list: readonly AppCatalogItem[],
  sort: AppsSort,
): readonly AppCatalogItem[] {
  const next = [...list];
  if (sort === "name") {
    next.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    next.sort((a, b) => {
      const av = a.firstConnectedAt ?? "";
      const bv = b.firstConnectedAt ?? "";
      // Most-recent first; unconnected (empty string) sinks to the bottom.
      if (av === bv) return a.name.localeCompare(b.name);
      if (av === "") return 1;
      if (bv === "") return -1;
      return bv.localeCompare(av);
    });
  }
  return next;
}
